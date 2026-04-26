import { Logger } from '../utils/Logger';
import type { GameEngine } from './GameEngine';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { InputContextManager } from '../systems/input/InputContextManager';
import type { InspectorEntityKind } from '../ui/debug/EntityInspectorPanel';
import { pickEntityFromClick } from '../ui/debug/FreeFlyPick';

let engineRef: GameEngine | null = null;
let listenersAttached = false;

function handleResize(): void {
  if (!engineRef) return;
  engineRef.renderer.onWindowResize();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!engineRef) return;
  const context = InputContextManager.getInstance().getContext();
  const isFreeFlyKey =
    event.key === 'v' || event.key === 'V' ||
    event.key === 'b' || event.key === 'B';
  const isWorldOverlayKey =
    (event.shiftKey && (event.key === '|' || event.key === '\\')) ||
    event.key === 'n' || event.key === 'N' ||
    event.key === 'l' || event.key === 'L' ||
    event.key === 'i' || event.key === 'I' ||
    event.key === 't' || event.key === 'T' ||
    event.key === 'c' || event.key === 'C' ||
    event.key === 'x' || event.key === 'X';
  const isDebugKey =
    event.key === 'F1' ||
    event.key === 'F2' ||
    event.key === 'F3' ||
    event.key === 'F4' ||
    event.key === 'F9' ||
    event.key === '`' ||
    event.key === '~' ||
    event.key === 'Backspace' ||
    event.key === '.' ||
    event.key === ',' ||
    event.key === ';' ||
    isFreeFlyKey ||
    isWorldOverlayKey;
  if (context !== 'gameplay' && !isDebugKey) return;

  // Free-fly WASD/QE/Shift/Ctrl only while free-fly is active.
  if (engineRef.freeFlyCamera.isActive() && applyFreeFlyKeyState(engineRef, event, true)) {
    return;
  }

  if (event.key === 'F1') {
    togglePerformanceStats(engineRef);
  } else if (event.key === 'F2') {
    toggleRealtimeStatsOverlay(engineRef);
  } else if (event.key === 'F3') {
    toggleLogOverlay(engineRef);
  } else if (event.key === 'F4') {
    toggleTimeIndicator(engineRef);
  } else if (event.key === 'F9') {
    triggerPlaytestCapture(engineRef);
  } else if (event.key === '`' || event.key === '~') {
    toggleDebugHud(engineRef);
  } else if (event.key === 'Backspace') {
    toggleTimePause(engineRef);
  } else if (event.key === '.') {
    stepOneSimulationFrame(engineRef);
  } else if (event.key === ',') {
    slowerSimulation(engineRef);
  } else if (event.key === ';') {
    fasterSimulation(engineRef);
  } else if (event.key === 'v' || event.key === 'V') {
    toggleFreeFly(engineRef);
  } else if (event.key === 'b' || event.key === 'B') {
    if (engineRef.freeFlyCamera.isActive()) toggleFreeFly(engineRef);
  } else if (event.shiftKey && (event.key === '|' || event.key === '\\')) {
    engineRef.renderer.worldOverlays?.toggleAll();
  } else if (handleWorldOverlayHotkey(engineRef, event)) {
    // consumed
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

function handleKeyUp(event: KeyboardEvent): void {
  if (!engineRef) return;
  if (engineRef.freeFlyCamera.isActive()) {
    applyFreeFlyKeyState(engineRef, event, false);
  }
}

function handleMouseMove(event: MouseEvent): void {
  if (!engineRef || !engineRef.freeFlyCamera.isActive()) return;
  // Use movementX/Y when pointer is locked; otherwise fall back to drag-based.
  const locked = document.pointerLockElement === getPointerLockTarget();
  if (locked) {
    engineRef.freeFlyCamera.applyMouseDelta(event.movementX, event.movementY);
  }
}

function handleMouseDown(event: MouseEvent): void {
  if (!engineRef || !engineRef.freeFlyCamera.isActive()) return;
  if (event.button !== 0) return;
  const pick = pickEntityFromClick(engineRef, event);
  if (pick) {
    // Master hud must be on for the panel to actually render.
    if (!engineRef.debugHud.isMasterVisible()) engineRef.debugHud.setMasterVisible(true);
    engineRef.entityInspectorPanel.show({ kind: pick.kind as InspectorEntityKind, id: pick.id });
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
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mousedown', handleMouseDown);
  listenersAttached = true;
}

export function disposeEventListeners(): void {
  if (!listenersAttached) return;

  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mousedown', handleMouseDown);
  listenersAttached = false;
  engineRef = null;
}

/**
 * Dispatch an N/L/I/T/C/X keypress to the matching world overlay. Only fires
 * when the overlay master is already visible (opted-in via Shift+\) so the
 * keys do not shadow gameplay bindings during normal play.
 */
function handleWorldOverlayHotkey(engine: GameEngine, event: KeyboardEvent): boolean {
  const overlays = engine.renderer.worldOverlays;
  if (!overlays || !overlays.isMasterVisible()) return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  const k = event.key.toLowerCase();
  const map: Record<string, string> = {
    n: 'navmesh-wireframe',
    l: 'los-rays',
    i: 'squad-influence',
    t: 'lod-tier',
    c: 'aircraft-contact',
    x: 'terrain-chunks',
  };
  const id = map[k];
  if (!id) return false;
  overlays.toggleOverlay(id);
  // Prevent the key from reaching other listeners (e.g. PlayerInput "T" opens
  // the air support menu) while overlays are active — the overlay hotkey wins.
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/**
 * Apply a keydown/keyup to the shared free-fly input state. Returns true if
 * the key was consumed so the caller skips other handlers.
 */
function applyFreeFlyKeyState(engine: GameEngine, event: KeyboardEvent, isDown: boolean): boolean {
  const key = event.key.toLowerCase();
  const state = engine.freeFlyInput;
  switch (key) {
    case 'w': state.forward = isDown; return true;
    case 's': state.back = isDown; return true;
    case 'a': state.left = isDown; return true;
    case 'd': state.right = isDown; return true;
    case 'e': state.up = isDown; return true;
    case 'q': state.down = isDown; return true;
    case 'shift': state.fast = isDown; return true;
    case 'control': state.slow = isDown; return true;
    default: return false;
  }
}

/** Toggle free-fly mode on/off. Swaps the renderer's active camera. */
function toggleFreeFly(engine: GameEngine): void {
  const cam = engine.freeFlyCamera;
  if (cam.isActive()) {
    cam.deactivate();
    engine.renderer.setOverrideCamera(null);
    // Clear WASD state so holds don't stick when we come back.
    const st = engine.freeFlyInput;
    st.forward = st.back = st.left = st.right = st.up = st.down = st.fast = st.slow = false;
    Logger.info('engine-input', 'Free-fly camera OFF');
  } else {
    cam.activate(engine.renderer.camera);
    engine.renderer.setOverrideCamera(cam.getCamera());
    // Request pointer lock so mouse-look works. Benign if the user declines.
    try {
      getPointerLockTarget().requestPointerLock?.();
    } catch {
      // Best-effort — ignore security errors in headless test envs.
    }
    Logger.info('engine-input', 'Free-fly camera ON (V toggle, B to exit)');
  }
}

function getPointerLockTarget(): HTMLElement {
  return document.body;
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
  const terrainReady = engine.systemManager.terrainSystem.isTerrainReady();
  const terrainTiles = engine.systemManager.terrainSystem.getActiveTerrainTileCount();
  const workerStats = engine.systemManager.terrainSystem.getWorkerStats?.();
  const terrainStreams = engine.systemManager.terrainSystem.getStreamingMetrics?.() ?? [];
  Logger.info('engine-input', `Vegetation: ${vegetationActive} active / ${vegetationReserved} reserved`);
  Logger.info('engine-input', `Combatants - US: ${combatStats.us}, OPFOR: ${combatStats.opfor}`);
  Logger.info(
    'engine-input',
    `Terrain: ${terrainReady ? 'ready' : 'not-ready'}, ` +
      `${terrainTiles} active tiles, ` +
      `worker queue ${workerStats?.queueLength ?? 0}, ` +
      `${workerStats?.busyWorkers ?? 0}/${workerStats?.totalWorkers ?? 0} workers busy`,
  );
  if (terrainStreams.length > 0) {
    for (const stream of terrainStreams) {
      Logger.info(
        'engine-input',
        `Terrain stream ${stream.name}: ${stream.timeMs.toFixed(2)}ms / ${stream.budgetMs.toFixed(2)}ms, pending=${stream.pendingUnits}`,
      );
    }
  }
  Logger.info('engine-input', `Chunks tracked: ${debugInfo.chunksTracked}`);
  Logger.info('engine-input', `Logs suppressed (total): ${logStats.suppressedTotal}`);
}

/**
 * Toggles the real-time performance overlay (F2)
 */
export function toggleRealtimeStatsOverlay(engine: GameEngine): void {
  if (!engine.gameStarted) return;
  engine.debugHud.togglePanel('performance');
  const overlayVisible = engine.performanceOverlay.isVisible();
  performanceTelemetry.setEnabled(overlayVisible || engine.sandboxEnabled);
}

/** Legacy debug API retained for callers; runtime post-processing is disabled. */
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
  engine.debugHud.togglePanel('log');
}

/**
 * Toggles the time indicator overlay (F4)
 */
export function toggleTimeIndicator(engine: GameEngine): void {
  engine.debugHud.togglePanel('time');
}

/**
 * Toggles the master debug HUD container (backtick).
 */
function toggleDebugHud(engine: GameEngine): void {
  engine.debugHud.toggleAll();
}

/**
 * Toggles the simulation pause state (Backspace).
 *
 * Space is taken by the player jump, so this handler uses Backspace. Also
 * opens the TimeControlPanel on first use so the visual indicator is visible.
 */
function toggleTimePause(engine: GameEngine): void {
  const paused = engine.timeScale.togglePause();
  if (paused && !engine.timeControlPanel.isVisible()) {
    engine.debugHud.togglePanel('time-control');
  }
  Logger.info('engine-input', `[time] ${paused ? 'paused' : 'resumed'}`);
}

/**
 * Advances one simulation frame while paused (period key).
 */
function stepOneSimulationFrame(engine: GameEngine): void {
  if (!engine.timeScale.isPaused()) return;
  engine.timeScale.stepOneFrame();
  Logger.info('engine-input', '[time] step one frame');
}

/**
 * Decreases the simulation scale by one tier (comma).
 */
function slowerSimulation(engine: GameEngine): void {
  const next = engine.timeScale.slower();
  if (!engine.timeControlPanel.isVisible()) {
    engine.debugHud.togglePanel('time-control');
  }
  Logger.info('engine-input', `[time] scale ${next.toFixed(2)}x`);
}

/**
 * Increases the simulation scale by one tier (semicolon).
 */
function fasterSimulation(engine: GameEngine): void {
  const next = engine.timeScale.faster();
  if (!engine.timeControlPanel.isVisible()) {
    engine.debugHud.togglePanel('time-control');
  }
  Logger.info('engine-input', `[time] scale ${next.toFixed(2)}x`);
}

/**
 * Triggers the F9 playtest capture flow. Delegates everything to the
 * PlaytestCaptureManager so this handler stays thin.
 */
function triggerPlaytestCapture(engine: GameEngine): void {
  if (!engine.playtestCaptureManager) return;
  void engine.playtestCaptureManager.trigger();
}

/** Legacy debug API retained for callers; runtime pixelation is disabled. */
export function adjustPixelSize(engine: GameEngine, delta: number): void {
  if (!engine.gameStarted || !engine.renderer.postProcessing) return;

  engine.currentPixelSize = Math.max(1, Math.min(8, engine.currentPixelSize + delta));
  engine.renderer.postProcessing.setPixelSize(engine.currentPixelSize);
  Logger.info('engine-input', `Pixel size: ${engine.currentPixelSize}`);
}
