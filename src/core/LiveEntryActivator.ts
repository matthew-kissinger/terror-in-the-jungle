import * as THREE from 'three';
import { Logger } from '../utils/Logger';
import { SettingsManager } from '../config/SettingsManager';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { isPerfDiagnosticsEnabled } from './PerfDiagnostics';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';
import { resolveNearbySafeSpawnPosition, resolveOpenSpawnFacingYaw } from './SpawnFacing';

export function startLiveGame(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): void {
  if (engine.gameStarted) {
    return;
  }

  engine.gameStarted = true;
  engine.gameStartPending = false;
  if (engine.sandboxEnabled) {
    engine.systemManager.playerController.setPointerLockEnabled(false);
  }

  void runLiveEntryStartup(engine, initialSpawnPosition);

  engine.renderer.showCrosshair();
  if (!engine.sandboxEnabled) {
    logWelcomeMessage(engine);
  }

  const showFPS = SettingsManager.getInstance().get('showFPS');
  if (showFPS && !engine.performanceOverlay.isVisible()) {
    engine.performanceOverlay.toggle();
  }
  performanceTelemetry.setEnabled(
    engine.performanceOverlay.isVisible()
    || engine.sandboxEnabled
    || (import.meta.env.DEV && isPerfDiagnosticsEnabled())
  );
}

async function runLiveEntryStartup(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): Promise<void> {
  markStartup('engine-init.startup-flow.begin');
  const startTime = performance.now();
  const markPhase = (phase: string, status?: string, detail?: string) => {
    Logger.info('engine-init', `[startup] ${phase}`);
    if (status) {
      engine.renderer.setSpawnLoadingStatus(status, detail);
    }
  };

  markPhase('hide-loading');
  engine.loadingScreen.hide();
  engine.renderer.showSpawnLoadingIndicator();
  engine.renderer.setSpawnLoadingStatus('DEPLOYING TO BATTLEFIELD', 'Preparing insertion route and combat zone...');

  markPhase('position-player', 'SYNCING INSERTION POINT', 'Validating terrain height and spawn safety...');
  try {
    const definition = engine.systemManager.gameModeManager.getCurrentDefinition();
    const loadoutContext = engine.systemManager.loadoutService.getContext();
    const terrainSystem = engine.systemManager.terrainSystem;
    const requestedPos = initialSpawnPosition?.clone() ?? resolveModeSpawnPosition(definition, loadoutContext.alliance);
    const safeOriginPos = definition.policies.respawn.initialSpawnRule === 'origin'
      ? resolveNearbySafeSpawnPosition(requestedPos, terrainSystem)
      : requestedPos;
    const pos = requestedPos.set(safeOriginPos.x, requestedPos.y, safeOriginPos.z);
    pos.y = terrainSystem.getEffectiveHeightAt(pos.x, pos.z) + 2;
    const reason = definition.policies.respawn.initialSpawnRule === 'origin'
      ? 'startup.spawn.sandbox'
      : 'startup.spawn.mode-hq';
    engine.systemManager.playerController.setPosition(pos, reason);
    if (definition.policies.respawn.initialSpawnRule === 'origin') {
      const yaw = resolveOpenSpawnFacingYaw(pos, terrainSystem, Math.PI);
      engine.systemManager.playerController.setViewAngles(yaw, 0);
    }
  } catch {
    // Keep startup resilient; spawn fallback already exists elsewhere.
  }

  markPhase('flush-chunk-update', 'BUILDING LOCAL TERRAIN', 'Finalizing chunk data around insertion zone...');
  engine.systemManager.terrainSystem.update(0.016);
  await nextFrame();

  markPhase('renderer-visible', 'RENDERER ONLINE', 'Bringing visual systems to ready state...');
  engine.renderer.showRenderer();
  engine.renderer.hideSpawnLoadingIndicator();

  markPhase('enable-player-systems', 'LIVE', 'Combat systems active. Good hunting.');
  engine.systemManager.firstPersonWeapon.setGameStarted(true);
  engine.systemManager.playerController.setGameStarted(true);
  engine.systemManager.hudSystem.startMatch();

  if (!engine.sandboxEnabled && !shouldUseTouchControls()) {
    Logger.info('engine-init', 'Click anywhere to enable mouse look!');
  }

  if (engine.systemManager.audioManager) {
    engine.systemManager.audioManager.startAmbient();
    const settings = SettingsManager.getInstance();
    engine.systemManager.audioManager.setMasterVolume(settings.getMasterVolumeNormalized());
  }

  const allowCombat = engine.sandboxConfig?.enableCombat ?? true;
  if (allowCombat && engine.systemManager.combatantSystem && typeof engine.systemManager.combatantSystem.enableCombat === 'function') {
    engine.systemManager.combatantSystem.enableCombat();
    Logger.info('engine-init', 'Combat AI activated!');
  } else if (!allowCombat) {
    Logger.info('engine-init', 'Combat AI disabled by sandbox config (combat=0)');
  }

  // Warm GPU pipeline by spawning one explosion below ground.
  // This forces shader compilation + texture/buffer uploads through the
  // actual render pipeline, eliminating first-grenade stalls.
  requestBackgroundTask(engine, () => {
    try {
      const cs = engine.systemManager.combatantSystem;
      const warmupPos = new THREE.Vector3(0, -500, 0);
      cs.explosionEffectsPool.spawn(warmupPos);
      cs.impactEffectsPool.spawn(warmupPos, warmupPos);
    } catch {
      // Engine may already be disposing after a short-lived warmup run.
    }
  }, 1000);
  requestBackgroundTask(engine, () => engine.renderer.precompileShaders(), 2000);
  requestBackgroundTask(engine, () => engine.systemManager.startDeferredInitialization(), 500);
  engine.startupFlow.enterLive();
  markPhase(`interactive-ready (${(performance.now() - startTime).toFixed(1)}ms)`);
  markStartup('engine-init.startup-flow.interactive-ready');
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function requestBackgroundTask(engine: GameEngine, task: () => void, timeoutMs: number): void {
  const runSafely = () => {
    if (engine.isDisposed) {
      return;
    }
    try {
      task();
    } catch {
      // Background warmups are best-effort only and should never crash the page.
    }
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(() => runSafely(), { timeout: timeoutMs });
  } else {
    setTimeout(runSafely, timeoutMs);
  }
}

export function logWelcomeMessage(engine: GameEngine): void {
  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
  Logger.info('engine-init', `
 TERROR IN THE JUNGLE - GAME STARTED!

 World Features:
- ${debugInfo.grassUsed} grass instances allocated
- ${debugInfo.treeUsed} tree instances allocated
- ${engine.systemManager.terrainSystem.getActiveTerrainTileCount()} terrain tiles active
- ${combatStats.us} US, ${combatStats.opfor} OPFOR combatants in battle

 Controls:
- WASD: Move around
- Shift: Run
- Mouse: Look around (click to enable)
- Left Click: Fire
- Right Click: Aim Down Sights
- F1: Performance stats
- F2: Toggle performance overlay
- F3: Toggle log overlay
- Escape: Release mouse lock

Have fun!
    `);
}
