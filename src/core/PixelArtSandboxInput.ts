import { Logger } from '../utils/Logger';

/**
 * Sets up key event listeners for the sandbox
 */
export function setupEventListeners(sandbox: any): void {
  window.addEventListener('resize', () => sandbox.sandboxRenderer.onWindowResize());

  // Performance monitoring and post-processing controls
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F1') {
      togglePerformanceStats(sandbox);
    } else if (event.key === 'p' || event.key === 'P') {
      togglePostProcessing(sandbox);
    } else if (event.key === 'F2') {
      toggleRealtimeStatsOverlay(sandbox);
    } else if (event.key === '[') {
      adjustPixelSize(sandbox, -1);
    } else if (event.key === ']') {
      adjustPixelSize(sandbox, 1);
    } else if (event.key === 'F3') {
      toggleLogOverlay(sandbox);
    } else if (event.key === 'F4') {
      toggleTimeIndicator(sandbox);
    } else if (event.key === 'k' || event.key === 'K') {
      // Voluntary respawn with K key
      if (sandbox.gameStarted) {
        const healthSystem = (sandbox.systemManager as any).playerHealthSystem;
        if (healthSystem && healthSystem.isAlive()) {
          console.log('🔄 Initiating voluntary respawn (K pressed)');
          healthSystem.voluntaryRespawn();
        }
      }
    }
  });
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

  console.log('📊 Performance Stats:');
  const fps = 1 / Math.max(0.0001, sandbox.lastFrameDelta);
  console.log(`FPS: ${Math.round(fps)}`);
  console.log(`Draw calls: ${perfStats.drawCalls}`);
  console.log(`Triangles: ${perfStats.triangles}`);
  console.log(`Memory: geometries=${perfStats.geometries}, textures=${perfStats.textures}, programs=${perfStats.programs}`);
  console.log(`Combat update: last=${combatTelemetry.lastMs.toFixed(2)}ms avg=${combatTelemetry.emaMs.toFixed(2)}ms`);
  console.log(`LOD counts: high=${combatTelemetry.lodHigh}, medium=${combatTelemetry.lodMedium}, low=${combatTelemetry.lodLow}, culled=${combatTelemetry.lodCulled}`);
  const vegetationActive = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('Active'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  const vegetationReserved = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('HighWater'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  console.log(`Vegetation: ${vegetationActive} active / ${vegetationReserved} reserved`);
  console.log(`Combatants - US: ${combatStats.us}, OPFOR: ${combatStats.opfor}`);
  console.log(`Chunks loaded: ${sandbox.systemManager.chunkManager.getLoadedChunkCount()}, ` +
              `Queue: ${sandbox.systemManager.chunkManager.getQueueSize()}, ` +
              `Loading: ${sandbox.systemManager.chunkManager.getLoadingCount()}`);
  console.log(`Chunks tracked: ${debugInfo.chunksTracked}`);
  console.log(`Logs suppressed (total): ${logStats.suppressedTotal}`);
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
  console.log(`🎨 Post-processing ${enabled ? 'enabled' : 'disabled'}`);
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
  console.log(`🎮 Pixel size: ${sandbox.currentPixelSize}`);
}
