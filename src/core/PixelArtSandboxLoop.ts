import { Logger } from '../utils/Logger';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { PixelArtSandbox } from './PixelArtSandbox';

// Crash tracking for frame loop resilience
let crashCount = 0;
let lastCrashTime = 0;
const CRASH_WINDOW_MS = 5000; // 5 seconds
const MAX_CRASHES = 3;
let errorOverlayShown = false;

/**
 * Main game loop animation frame
 */
export function animate(sandbox: PixelArtSandbox): void {
  requestAnimationFrame(() => animate(sandbox));

  if (!sandbox.isInitialized || !sandbox.gameStarted) return;

  // Skip rendering while WebGL context is lost
  if (sandbox.contextLost) return;

  const deltaTime = sandbox.clock.getDelta();
  sandbox.lastFrameDelta = deltaTime;

  try {
    // Update all systems
    sandbox.systemManager.updateSystems(deltaTime, sandbox.gameStarted);

    // Update skybox position
    sandbox.systemManager.skybox.updatePosition(sandbox.sandboxRenderer.camera.position);

    // Check if mortar is deployed and using mortar camera view
    const mortarSystem = sandbox.systemManager.mortarSystem;
    const usingMortarCamera = mortarSystem?.isUsingMortarCamera() ?? false;
    const mortarCamera = mortarSystem?.getMortarCamera();

    // Collect GPU timing from previous frame
    performanceTelemetry.collectGPUTime();

    performanceTelemetry.beginSystem('RenderMain');
    // Begin GPU timing for this frame
    performanceTelemetry.beginGPUTimer();

    // Render the main scene
    if (usingMortarCamera && mortarCamera) {
      // Render with mortar camera (top-down view)
      // Note: Mortar camera renders directly without post-processing for tactical view clarity
      sandbox.sandboxRenderer.renderer.render(
        sandbox.sandboxRenderer.scene,
        mortarCamera
      );
    } else {
      if (sandbox.sandboxRenderer.postProcessing) {
        sandbox.sandboxRenderer.postProcessing.render(deltaTime);
      } else {
        sandbox.sandboxRenderer.renderer.render(
          sandbox.sandboxRenderer.scene,
          sandbox.sandboxRenderer.camera
        );
      }
    }

    // End GPU timing measurement
    performanceTelemetry.endGPUTimer();
    performanceTelemetry.endSystem('RenderMain');

    // Render weapon overlay
    performanceTelemetry.beginSystem('RenderOverlay');
    if (sandbox.systemManager.firstPersonWeapon && !usingMortarCamera) {
      sandbox.systemManager.firstPersonWeapon.renderWeapon(sandbox.sandboxRenderer.renderer);
    }

    // Render grenade overlays
    const renderer = sandbox.sandboxRenderer.renderer;
    const currentAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    if (sandbox.systemManager.grenadeSystem && sandbox.systemManager.inventoryManager && !usingMortarCamera) {
      const grenadeScene = sandbox.systemManager.grenadeSystem.getGrenadeOverlayScene();
      const grenadeCamera = sandbox.systemManager.grenadeSystem.getGrenadeOverlayCamera();
      if (grenadeScene && grenadeCamera) {
        renderer.clearDepth();
        renderer.render(grenadeScene, grenadeCamera);
      }
    }

    renderer.autoClear = currentAutoClear;
    performanceTelemetry.endSystem('RenderOverlay');

    updateSandboxMetrics(sandbox, deltaTime);
    updatePerformanceOverlay(sandbox, deltaTime);
    updateLogOverlay(sandbox);
    updateTimeIndicator(sandbox);

    // Any successful frame clears crash streak so only consecutive failures escalate.
    if (crashCount > 0) {
      crashCount = 0;
      lastCrashTime = 0;
    }
  } catch (error) {
    // Handle frame loop crash
    Logger.error('frame-loop', 'Frame loop error:', error);

    const now = Date.now();

    // Reset crash count if outside crash window
    if (now - lastCrashTime > CRASH_WINDOW_MS) {
      crashCount = 0;
    }

    crashCount++;
    lastCrashTime = now;

    // If too many crashes in short time, show error overlay
    if (crashCount >= MAX_CRASHES && !errorOverlayShown) {
      errorOverlayShown = true;
      showFrameLoopError(sandbox, error);
    }

    // Continue the loop - don't let a single crash stop the game
  }
}

/**
 * Show an error overlay for repeated frame loop crashes
 */
function showFrameLoopError(sandbox: PixelArtSandbox, error: unknown): void {
  // In harness/sandbox mode keep running and log, do not block testing with fatal overlay.
  if (sandbox.sandboxEnabled) {
    Logger.error('frame-loop', 'Suppressed fatal frame-loop overlay in sandbox mode:', error);
    return;
  }

  const errorMessage = error instanceof Error
    ? `${error.message}\n\nThe game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`
    : `The game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`;

  sandbox.loadingScreen.showError(
    'Game Error - Multiple Crashes',
    errorMessage
  );
}

/**
 * Updates sandbox-level metrics
 */
export function updateSandboxMetrics(sandbox: PixelArtSandbox, deltaTime: number): void {
  sandbox.sandboxMetrics.updateFrame(deltaTime);

  const combatSystem = sandbox.systemManager.combatantSystem;
  if (!combatSystem) return;

  const combatStats = combatSystem.getCombatStats();
  const combatProfile = combatSystem.getCombatProfile();
  sandbox.sandboxMetrics.updateCombatStats({
    combatantCount: combatStats.total,
    firingCount: combatProfile.timing.firingCount,
    engagingCount: combatProfile.timing.engagingCount
  });
}

/**
 * Updates the real-time performance overlay data
 */
export function updatePerformanceOverlay(sandbox: PixelArtSandbox, deltaTime: number): void {
  if (!sandbox.performanceOverlay.isVisible()) return;

  const perfStats = sandbox.sandboxRenderer.getPerformanceStats();
  const debugInfo = sandbox.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = sandbox.systemManager.combatantSystem.getCombatStats();
  const chunkQueue = sandbox.systemManager.chunkManager.getQueueSize();
  const loadedChunks = sandbox.systemManager.chunkManager.getLoadedChunkCount();
  const fps = 1 / Math.max(0.0001, deltaTime);
  const logStats = Logger.getStats();
  const combatTelemetry = sandbox.systemManager.combatantSystem
    ? sandbox.systemManager.combatantSystem.getTelemetry()
    : {
        lastMs: 0,
        emaMs: 0,
        lodHigh: 0,
        lodMedium: 0,
        lodLow: 0,
        lodCulled: 0,
        combatantCount: 0,
        octree: { nodes: 0, maxDepth: 0, avgEntitiesPerLeaf: 0 }
      };
  const vegetationActive = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('Active'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  const vegetationReserved = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('HighWater'))
    .reduce((sum, [, value]) => sum + (value as number), 0);

  // Get terrain merger stats
  const mergerStats = sandbox.systemManager.chunkManager.getMergerStats();

  // Get system timings from system manager
  const systemTimings = sandbox.systemManager.getSystemTimings();

  // Get GPU telemetry
  const gpuTelemetry = performanceTelemetry.getGPUTelemetry();

  sandbox.performanceOverlay.update({
    fps,
    frameTimeMs: deltaTime * 1000,
    drawCalls: perfStats.drawCalls,
    triangles: perfStats.triangles,
    chunkQueueSize: chunkQueue,
    loadedChunks,
    usCombatants: combatStats.us,
    opforCombatants: combatStats.opfor,
    vegetationActive,
    vegetationReserved,
    suppressedLogs: logStats.suppressedTotal,
    geometries: perfStats.geometries,
    textures: perfStats.textures,
    programs: perfStats.programs,
    combatLastMs: combatTelemetry.lastMs,
    combatEmaMs: combatTelemetry.emaMs,
    combatLodHigh: combatTelemetry.lodHigh,
    combatLodMedium: combatTelemetry.lodMedium,
    combatLodLow: combatTelemetry.lodLow,
    combatLodCulled: combatTelemetry.lodCulled,
    combatantCount: combatTelemetry.combatantCount,
    systemTimings,
    gpuTimeMs: gpuTelemetry.gpuTimeMs,
    gpuTimingAvailable: gpuTelemetry.available,
    terrainMergerRings: mergerStats?.activeRings,
    terrainMergerChunks: mergerStats?.totalChunks,
    terrainMergerSavings: mergerStats?.estimatedDrawCallSavings,
    terrainMergerPending: mergerStats?.pendingMerge
  });
}

/**
 * Updates the log overlay with recent log entries
 */
export function updateLogOverlay(sandbox: PixelArtSandbox): void {
  if (!sandbox.logOverlay.isVisible()) return;

  const recent = Logger.getRecent(12);
  sandbox.logOverlay.update(recent);
}

/**
 * Updates the time indicator overlay
 */
export function updateTimeIndicator(sandbox: PixelArtSandbox): void {
  if (!sandbox.timeIndicator.isVisible()) return;

  const dayNightCycle = sandbox.systemManager.dayNightCycle;
  if (dayNightCycle) {
    const timeString = dayNightCycle.getFormattedTime();
    const nightFactor = dayNightCycle.getNightFactor();
    sandbox.timeIndicator.update(timeString, nightFactor);
  }
}
