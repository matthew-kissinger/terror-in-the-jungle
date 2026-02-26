import { Logger } from '../utils/Logger';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { GameEngine } from './GameEngine';

// Crash tracking for frame loop resilience
let crashCount = 0;
let lastCrashTime = 0;
const CRASH_WINDOW_MS = 5000; // 5 seconds
const MAX_CRASHES = 3;
let errorOverlayShown = false;

/**
 * Main game loop animation frame
 */
export function animate(engine: GameEngine): void {
  requestAnimationFrame(() => animate(engine));

  if (!engine.isInitialized || !engine.gameStarted) return;

  // Skip rendering while WebGL context is lost
  if (engine.contextLost) return;

  const deltaTime = Math.min(engine.clock.getDelta(), 0.1);
  engine.lastFrameDelta = deltaTime;

  try {
    // Update all systems
    engine.systemManager.updateSystems(deltaTime, engine.gameStarted);

    // Update skybox position
    engine.systemManager.skybox.updatePosition(engine.renderer.camera.position);

    // Check if mortar is deployed and using mortar camera view
    const mortarSystem = engine.systemManager.mortarSystem;
    const usingMortarCamera = mortarSystem?.isUsingMortarCamera() ?? false;
    const mortarCamera = mortarSystem?.getMortarCamera();

    // Collect GPU timing from previous frame
    performanceTelemetry.collectGPUTime();

    performanceTelemetry.beginSystem('RenderMain');
    performanceTelemetry.beginGPUTimer();

    const pp = engine.renderer.postProcessing;
    const renderer = engine.renderer.renderer;

    // Begin post-processing frame (redirects all rendering to low-res target)
    if (pp && !usingMortarCamera) pp.beginFrame();

    // Render the main scene
    if (usingMortarCamera && mortarCamera) {
      renderer.render(engine.renderer.scene, mortarCamera);
    } else {
      renderer.render(engine.renderer.scene, engine.renderer.camera);
    }

    performanceTelemetry.endGPUTimer();
    performanceTelemetry.endSystem('RenderMain');

    // Render weapon + grenade overlays (into the same post-processing target)
    performanceTelemetry.beginSystem('RenderOverlay');
    if (!usingMortarCamera) {
      if (engine.systemManager.firstPersonWeapon) {
        engine.systemManager.firstPersonWeapon.renderWeapon(renderer);
      }

      const currentAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      if (engine.systemManager.grenadeSystem && engine.systemManager.inventoryManager) {
        const grenadeScene = engine.systemManager.grenadeSystem.getGrenadeOverlayScene();
        const grenadeCamera = engine.systemManager.grenadeSystem.getGrenadeOverlayCamera();
        if (grenadeScene && grenadeCamera) {
          renderer.clearDepth();
          renderer.render(grenadeScene, grenadeCamera);
        }
      }

      renderer.autoClear = currentAutoClear;
    }

    // End post-processing frame (blits low-res target to screen with retro effect)
    if (pp && !usingMortarCamera) pp.endFrame();

    performanceTelemetry.endSystem('RenderOverlay');

    updateRuntimeMetrics(engine, deltaTime);
    updatePerformanceOverlay(engine, deltaTime);
    updateLogOverlay(engine);
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
      showFrameLoopError(engine, error);
    }

    // Continue the loop - don't let a single crash stop the game
  }
}

/**
 * Show an error overlay for repeated frame loop crashes
 */
function showFrameLoopError(engine: GameEngine, error: unknown): void {
  // In harness/sandbox mode keep running and log, do not block testing with fatal overlay.
  if (engine.sandboxEnabled) {
    Logger.error('frame-loop', 'Suppressed fatal frame-loop overlay in sandbox mode:', error);
    return;
  }

  const errorMessage = error instanceof Error
    ? `${error.message}\n\nThe game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`
    : `The game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`;

  engine.loadingScreen.showError(
    'Game Error - Multiple Crashes',
    errorMessage
  );
}

/**
 * Updates runtime metrics
 */
export function updateRuntimeMetrics(engine: GameEngine, deltaTime: number): void {
  engine.runtimeMetrics.updateFrame(deltaTime);

  const combatSystem = engine.systemManager.combatantSystem;
  if (!combatSystem) return;

  const combatStats = combatSystem.getCombatStats();
  const combatProfile = combatSystem.getCombatProfile();
  engine.runtimeMetrics.updateCombatStats({
    combatantCount: combatStats.total,
    firingCount: combatProfile.timing.firingCount,
    engagingCount: combatProfile.timing.engagingCount
  });
}

/**
 * Updates the real-time performance overlay data
 */
export function updatePerformanceOverlay(engine: GameEngine, deltaTime: number): void {
  if (!engine.performanceOverlay.isVisible()) return;

  const perfStats = engine.renderer.getPerformanceStats();
  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
  const chunkQueue = engine.systemManager.chunkManager.getQueueSize();
  const loadedChunks = engine.systemManager.chunkManager.getLoadedChunkCount();
  const fps = 1 / Math.max(0.0001, deltaTime);
  const logStats = Logger.getStats();
  const combatTelemetry = engine.systemManager.combatantSystem
    ? engine.systemManager.combatantSystem.getTelemetry()
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
  const mergerStats = engine.systemManager.chunkManager.getMergerStats();

  // Get system timings from system manager
  const systemTimings = engine.systemManager.getSystemTimings();

  // Get GPU telemetry
  const gpuTelemetry = performanceTelemetry.getGPUTelemetry();

  engine.performanceOverlay.update({
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
export function updateLogOverlay(engine: GameEngine): void {
  if (!engine.logOverlay.isVisible()) return;

  const recent = Logger.getRecent(12);
  engine.logOverlay.update(recent);
}

