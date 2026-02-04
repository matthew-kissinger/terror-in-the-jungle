import { Logger } from '../utils/Logger';

let sandboxRef: any | null = null;
let listenersAttached = false;

function handleResize(): void {
  if (!sandboxRef) return;
  sandboxRef.sandboxRenderer.onWindowResize();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!sandboxRef) return;

  if (event.key === 'F1') {
    togglePerformanceStats(sandboxRef);
  } else if (event.key === 'p' || event.key === 'P') {
    togglePostProcessing(sandboxRef);
  } else if (event.key === 'F2') {
    toggleRealtimeStatsOverlay(sandboxRef);
  } else if (event.key === '[') {
    adjustPixelSize(sandboxRef, -1);
  } else if (event.key === ']') {
    adjustPixelSize(sandboxRef, 1);
  } else if (event.key === 'F3') {
    toggleLogOverlay(sandboxRef);
  } else if (event.key === 'F4') {
    toggleTimeIndicator(sandboxRef);
  } else if (event.key === 'k' || event.key === 'K') {
    // Voluntary respawn with K key
    if (sandboxRef.gameStarted) {
      const healthSystem = (sandboxRef.systemManager as any).playerHealthSystem;
      if (healthSystem && healthSystem.isAlive()) {
        Logger.info('sandbox-input', 'Initiating voluntary respawn (K pressed)');
        healthSystem.voluntaryRespawn();
      }
    }
  }
}

/**
 * Sets up key event listeners for the sandbox
 */
export function setupEventListeners(sandbox: any): void {
  sandboxRef = sandbox;
  if (listenersAttached) return;

  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
  listenersAttached = true;
}

export function disposeEventListeners(): void {
  if (!listenersAttached) return;

  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
  listenersAttached = false;
  sandboxRef = null;
}

/**
 * Toggles console performance statistics (F1)
 */
export function togglePerformanceStats(sandbox: any): void {
  if (!sandbox.gameStarted) return;

  const debugInfo = sandbox.systemManager.globalBillboardSystem.getDebugInfo();
  const perfStats = sandbox.sandboxRenderer.getPerformanceStats();
  const combatStats = sandbox.systemManager.combatantSystem.getCombatStats();
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

  Logger.info('sandbox-input', '📊 Performance Stats:');
  const fps = 1 / Math.max(0.0001, sandbox.lastFrameDelta);
  Logger.info('sandbox-input', `FPS: ${Math.round(fps)}`);
  Logger.info('sandbox-input', `Draw calls: ${perfStats.drawCalls}`);
  Logger.info('sandbox-input', `Triangles: ${perfStats.triangles}`);
  Logger.info('sandbox-input', `Memory: geometries=${perfStats.geometries}, textures=${perfStats.textures}, programs=${perfStats.programs}`);
  Logger.info('sandbox-input', `Combat update: last=${combatTelemetry.lastMs.toFixed(2)}ms avg=${combatTelemetry.emaMs.toFixed(2)}ms`);
  Logger.info('sandbox-input', `LOD counts: high=${combatTelemetry.lodHigh}, medium=${combatTelemetry.lodMedium}, low=${combatTelemetry.lodLow}, culled=${combatTelemetry.lodCulled}`);
  const vegetationActive = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('Active'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  const vegetationReserved = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('HighWater'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  Logger.info('sandbox-input', `Vegetation: ${vegetationActive} active / ${vegetationReserved} reserved`);
  Logger.info('sandbox-input', `Combatants - US: ${combatStats.us}, OPFOR: ${combatStats.opfor}`);
  Logger.info('sandbox-input', `Chunks loaded: ${sandbox.systemManager.chunkManager.getLoadedChunkCount()}, ` +
              `Queue: ${sandbox.systemManager.chunkManager.getQueueSize()}, ` +
              `Loading: ${sandbox.systemManager.chunkManager.getLoadingCount()}`);
  Logger.info('sandbox-input', `Chunks tracked: ${debugInfo.chunksTracked}`);
  Logger.info('sandbox-input', `Logs suppressed (total): ${logStats.suppressedTotal}`);
}

/**
 * Toggles the real-time performance overlay (F2)
 */
export function toggleRealtimeStatsOverlay(sandbox: any): void {
  if (!sandbox.gameStarted) return;
  sandbox.performanceOverlay.toggle();
}

/**
 * Toggles post-processing effects (P)
 */
export function togglePostProcessing(sandbox: any): void {
  if (!sandbox.gameStarted || !sandbox.sandboxRenderer.postProcessing) return;

  const enabled = !sandbox.sandboxRenderer.postProcessing.isEnabled();
  sandbox.sandboxRenderer.postProcessing.setEnabled(enabled);
  Logger.info('sandbox-input', `Post-processing ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Toggles the log overlay (F3)
 */
export function toggleLogOverlay(sandbox: any): void {
  sandbox.logOverlay.toggle();
}

/**
 * Toggles the time indicator overlay (F4)
 */
export function toggleTimeIndicator(sandbox: any): void {
  sandbox.timeIndicator.toggle();
}

/**
 * Adjusts the pixel size for the pixelation effect ([ and ])
 */
export function adjustPixelSize(sandbox: any, delta: number): void {
  if (!sandbox.gameStarted || !sandbox.sandboxRenderer.postProcessing) return;

  sandbox.currentPixelSize = Math.max(1, Math.min(8, sandbox.currentPixelSize + delta));
  sandbox.sandboxRenderer.postProcessing.setPixelSize(sandbox.currentPixelSize);
  Logger.info('sandbox-input', `Pixel size: ${sandbox.currentPixelSize}`);
}
