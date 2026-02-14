import { Logger } from '../utils/Logger';
import type { GameEngine } from './GameEngine';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';

let engineRef: GameEngine | null = null;
let listenersAttached = false;

function handleResize(): void {
  if (!engineRef) return;
  engineRef.renderer.onWindowResize();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!engineRef) return;

  if (event.key === 'F1') {
    togglePerformanceStats(engineRef);
  } else if (event.key === 'p' || event.key === 'P') {
    togglePostProcessing(engineRef);
  } else if (event.key === 'F2') {
    toggleRealtimeStatsOverlay(engineRef);
  } else if (event.key === '[') {
    adjustPixelSize(engineRef, -1);
  } else if (event.key === ']') {
    adjustPixelSize(engineRef, 1);
  } else if (event.key === 'F3') {
    toggleLogOverlay(engineRef);
  } else if (event.key === 'F4') {
    toggleTimeIndicator(engineRef);
  } else if (event.key === 'k' || event.key === 'K') {
    // Voluntary respawn with K key
    if (engineRef.gameStarted) {
      const healthSystem = (engineRef.systemManager as any).playerHealthSystem;
      if (healthSystem && healthSystem.isAlive()) {
        Logger.info('engine-input', 'Initiating voluntary respawn (K pressed)');
        healthSystem.voluntaryRespawn();
      }
    }
  }
}

/**
 * Sets up key event listeners for the engine
 */
export function setupEventListeners(engine: GameEngine): void {
  engineRef = engine;
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
  engineRef = null;
}

/**
 * Toggles console performance statistics (F1)
 */
export function togglePerformanceStats(engine: GameEngine): void {
  if (!engine.gameStarted) return;

  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const perfStats = engine.renderer.getPerformanceStats();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
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

  Logger.info('engine-input', ' Performance Stats:');
  const fps = 1 / Math.max(0.0001, engine.lastFrameDelta);
  Logger.info('engine-input', `FPS: ${Math.round(fps)}`);
  Logger.info('engine-input', `Draw calls: ${perfStats.drawCalls}`);
  Logger.info('engine-input', `Triangles: ${perfStats.triangles}`);
  Logger.info('engine-input', `Memory: geometries=${perfStats.geometries}, textures=${perfStats.textures}, programs=${perfStats.programs}`);
  Logger.info('engine-input', `Combat update: last=${combatTelemetry.lastMs.toFixed(2)}ms avg=${combatTelemetry.emaMs.toFixed(2)}ms`);
  Logger.info('engine-input', `LOD counts: high=${combatTelemetry.lodHigh}, medium=${combatTelemetry.lodMedium}, low=${combatTelemetry.lodLow}, culled=${combatTelemetry.lodCulled}`);
  const vegetationActive = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('Active'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  const vegetationReserved = Object.entries(debugInfo)
    .filter(([key]) => key.endsWith('HighWater'))
    .reduce((sum, [, value]) => sum + (value as number), 0);
  Logger.info('engine-input', `Vegetation: ${vegetationActive} active / ${vegetationReserved} reserved`);
  Logger.info('engine-input', `Combatants - US: ${combatStats.us}, OPFOR: ${combatStats.opfor}`);
  Logger.info('engine-input', `Chunks loaded: ${engine.systemManager.chunkManager.getLoadedChunkCount()}, ` +
              `Queue: ${engine.systemManager.chunkManager.getQueueSize()}, ` +
              `Loading: ${engine.systemManager.chunkManager.getLoadingCount()}`);
  Logger.info('engine-input', `Chunks tracked: ${debugInfo.chunksTracked}`);
  Logger.info('engine-input', `Logs suppressed (total): ${logStats.suppressedTotal}`);
}

/**
 * Toggles the real-time performance overlay (F2)
 */
export function toggleRealtimeStatsOverlay(engine: GameEngine): void {
  if (!engine.gameStarted) return;
  engine.performanceOverlay.toggle();
  const overlayVisible = engine.performanceOverlay.isVisible();
  performanceTelemetry.setEnabled(overlayVisible || engine.sandboxEnabled);
}

/**
 * Toggles post-processing effects (P)
 */
export function togglePostProcessing(engine: GameEngine): void {
  if (!engine.gameStarted || !engine.renderer.postProcessing) return;

  const enabled = !engine.renderer.postProcessing.isEnabled();
  engine.renderer.postProcessing.setEnabled(enabled);
  Logger.info('engine-input', `Post-processing ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Toggles the log overlay (F3)
 */
export function toggleLogOverlay(engine: GameEngine): void {
  engine.logOverlay.toggle();
}

/**
 * Toggles the time indicator overlay (F4)
 */
export function toggleTimeIndicator(engine: GameEngine): void {
  engine.timeIndicator.toggle();
}

/**
 * Adjusts the pixel size for the pixelation effect ([ and ])
 */
export function adjustPixelSize(engine: GameEngine, delta: number): void {
  if (!engine.gameStarted || !engine.renderer.postProcessing) return;

  engine.currentPixelSize = Math.max(1, Math.min(8, engine.currentPixelSize + delta));
  engine.renderer.postProcessing.setPixelSize(engine.currentPixelSize);
  Logger.info('engine-input', `Pixel size: ${engine.currentPixelSize}`);
}
