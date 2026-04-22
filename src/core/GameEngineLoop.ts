import { Logger } from '../utils/Logger';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { GameEngine } from './GameEngine';

// Crash tracking for frame loop resilience
let crashCount = 0;
let lastCrashTime = 0;
const CRASH_WINDOW_MS = 5000; // 5 seconds
const MAX_CRASHES = 3;
let errorOverlayShown = false;

export function start(engine: GameEngine): void {
  if (engine.isLoopRunning || engine.isDisposed) {
    return;
  }

  engine.isLoopRunning = true;
  scheduleNextFrame(engine);
}

export function stop(engine: GameEngine): void {
  engine.isLoopRunning = false;
  if (engine.animationFrameId !== null) {
    cancelAnimationFrame(engine.animationFrameId);
    engine.animationFrameId = null;
  }
}

export function resetState(): void {
  crashCount = 0;
  lastCrashTime = 0;
  errorOverlayShown = false;
}

function scheduleNextFrame(engine: GameEngine): void {
  if (!engine.isLoopRunning || engine.isDisposed) {
    engine.animationFrameId = null;
    return;
  }

  engine.animationFrameId = requestAnimationFrame((timestamp) => animate(engine, timestamp));
}

/**
 * Main game loop animation frame
 */
export function animate(engine: GameEngine, timestamp?: number): void {
  if (!engine.isLoopRunning || engine.isDisposed) {
    engine.animationFrameId = null;
    return;
  }

  engine.animationFrameId = null;

  try {
    if (!engine.isInitialized || !engine.gameStarted) {
      return;
    }

    // Skip rendering while WebGL context is lost
    if (engine.contextLost) {
      return;
    }

    engine.clock.update(timestamp);
    const rawDelta = Math.min(engine.clock.getDelta(), 0.1);
    // Single hook point for pause / slow-mo / fast-forward. Systems that read
    // performance.now() directly will bypass this multiplier — see PR notes
    // for the current bypass list.
    const scale = engine.timeScale.get();
    const deltaTime = rawDelta * scale;
    engine.lastFrameDelta = deltaTime;

    // Update all systems
    engine.systemManager.updateSystems(deltaTime, engine.gameStarted);
    engine.timeScale.postDispatch();

    // Keep the analytic `AtmosphereSystem` dome glued to the camera so it
    // never z-fights terrain or clips when pilots climb past the dome
    // radius. Also tell the atmosphere the local ground height so the
    // cloud layer sits at (terrainY + baseAltitude) rather than world Y=0.
    const cameraPos = engine.renderer.camera.position;
    engine.systemManager.atmosphereSystem.syncDomePosition(cameraPos);
    const terrainSystem = engine.systemManager.terrainSystem;
    if (terrainSystem && typeof terrainSystem.getHeightAt === 'function') {
      engine.systemManager.atmosphereSystem.setTerrainYAtCamera(
        terrainSystem.getHeightAt(cameraPos.x, cameraPos.z)
      );
    }

    // Check if mortar is deployed and using mortar camera view
    const mortarSystem = engine.systemManager.mortarSystem;
    const usingMortarCamera = mortarSystem?.isUsingMortarCamera() ?? false;
    const mortarCamera = mortarSystem?.getMortarCamera();

    // Collect GPU timing from previous frame
    performanceTelemetry.collectGPUTime();

    engine.renderer.beginFrameStats();
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
    engine.debugHud.update(deltaTime);
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
  } finally {
    scheduleNextFrame(engine);
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
function updateRuntimeMetrics(engine: GameEngine, deltaTime: number): void {
  if (!engine.runtimeMetrics) return;

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
function updatePerformanceOverlay(engine: GameEngine, deltaTime: number): void {
  if (!engine.performanceOverlay.isVisible()) return;

  const perfStats = engine.renderer.getPerformanceStats();
  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
  const terrainManager = engine.systemManager.terrainSystem;
  const workerStats = terrainManager.getWorkerStats?.();
  const activeTerrainTiles = terrainManager.getActiveTerrainTileCount();
  const terrainStreams = terrainManager.getStreamingMetrics?.() ?? [];
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

  // Get system timings from system manager
  const systemTimings = engine.systemManager.getSystemTimings();

  // Get GPU telemetry
  const gpuTelemetry = performanceTelemetry.getGPUTelemetry();

  engine.performanceOverlay.updateStats({
    fps,
    frameTimeMs: deltaTime * 1000,
    drawCalls: perfStats.drawCalls,
    triangles: perfStats.triangles,
    terrainReady: terrainManager.isTerrainReady(),
    activeTerrainTiles,
    terrainWorkerQueue: workerStats?.queueLength ?? 0,
    terrainBusyWorkers: workerStats?.busyWorkers ?? 0,
    terrainTotalWorkers: workerStats?.totalWorkers ?? 0,
    terrainStreams,
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
    gpuTimingAvailable: gpuTelemetry.available
  });
}

/**
 * Updates the log overlay with recent log entries
 */
function updateLogOverlay(engine: GameEngine): void {
  if (!engine.logOverlay.isVisible()) return;

  const recent = Logger.getRecent(12);
  engine.logOverlay.updateEntries(recent);
}
