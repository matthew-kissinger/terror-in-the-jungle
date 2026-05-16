import * as THREE from 'three';
import { Logger } from '../utils/Logger';
import { SettingsManager } from '../config/SettingsManager';
import { isMobileGPU, shouldUseTouchControls } from '../utils/DeviceDetector';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { isPerfDiagnosticsEnabled } from './PerfDiagnostics';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';
import { resolveNearbySafeSpawnPosition, resolveOpenSpawnFacingYaw } from './SpawnFacing';
import { PIXEL_FORGE_STARTUP_TEXTURE_UPLOAD_WARMUP_NAMES } from '../config/pixelForgeAssets';
import {
  PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP,
  PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
} from '../systems/combat/PixelForgeNpcRuntime';

const LIVE_ENTRY_FRAME_YIELD_TIMEOUT_MS = 100;
const NPC_CLOSE_MODEL_PREWARM_TIMEOUT_MS = 1800;
const NPC_CLOSE_MODEL_PREWARM_MAX_ACTIVE =
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;

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
    engine.debugHud.togglePanel('performance');
  }
  performanceTelemetry.setEnabled(
    engine.performanceOverlay.isVisible()
    || engine.sandboxEnabled
    || ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfDiagnosticsEnabled())
  );
}

async function runLiveEntryStartup(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): Promise<void> {
  setNpcCloseModelLazyLoadAllowed(false);
  markStartup('engine-init.startup-flow.begin');
  const startTime = performance.now();
  const markStepBegin = (step: string): void => {
    markStartup(`engine-init.startup-flow.${step}.begin`);
  };
  const markStepEnd = (step: string): void => {
    markStartup(`engine-init.startup-flow.${step}.end`);
  };
  const markPhase = (phase: string, status?: string, detail?: string) => {
    Logger.info('engine-init', `[startup] ${phase}`);
    if (status) {
      engine.renderer.setSpawnLoadingStatus(status, detail);
    }
  };
  const schedulePostRevealBackgroundTasks = (): void => {
    markStepBegin('background-tasks-schedule');
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
    window.setTimeout(() => {
      if (engine.isDisposed) return;
      setNpcCloseModelLazyLoadAllowed(true);
      markStartup('engine-init.startup-flow.npc-close-model-lazy-load.allowed');
    }, 5000);
    markStepEnd('background-tasks-schedule');
  };

  markStepBegin('hide-loading');
  markPhase('hide-loading');
  engine.loadingScreen.hide();
  engine.renderer.showSpawnLoadingIndicator();
  engine.renderer.setSpawnLoadingStatus('DEPLOYING TO BATTLEFIELD', 'Preparing insertion route and combat zone...');
  markStepEnd('hide-loading');

  markStepBegin('position-player');
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
  markStepEnd('position-player');

  markStepBegin('flush-chunk-update');
  markPhase('flush-chunk-update', 'BUILDING LOCAL TERRAIN', 'Finalizing chunk data around insertion zone...');
  engine.systemManager.terrainSystem.update(0.016);
  markStartup('engine-init.startup-flow.flush-chunk-update.terrain-update-end');

  if (PIXEL_FORGE_STARTUP_TEXTURE_UPLOAD_WARMUP_NAMES.length > 0) {
    markStepBegin('texture-upload-warmup');
    markPhase('texture-upload-warmup', 'PRIMING JUNGLE TEXTURES', 'Uploading critical vegetation atlases before renderer reveal...');
    const summary = engine.systemManager.assetLoader.warmGpuTextures(
      engine.renderer.renderer,
      PIXEL_FORGE_STARTUP_TEXTURE_UPLOAD_WARMUP_NAMES
    );
    markStartup(`engine-init.startup-flow.texture-upload-warmup.uploaded-${summary.uploaded}`);
    markStartup(`engine-init.startup-flow.texture-upload-warmup.failed-${summary.failed}`);
    markStepEnd('texture-upload-warmup');
  }

  // Mobile GPUs cannot complete the close-model prewarm within the 1.8 s window
  // (emulation captures always hit the timeout — see
  // docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md
  // §"NPC close-model prewarm timeout"). Skip the prewarm dispatch on mobile and
  // rely on the lazy-load path that the post-reveal scheduler opens after 5 s.
  if (!isMobileGPU()) {
    markStepBegin('npc-close-model-prewarm');
    markPhase('npc-close-model-prewarm', 'PRIMING NEARBY COMBATANTS', 'Preparing close-range NPC models around insertion...');
    await prewarmNearbyNpcCloseModels(engine);
    markStepEnd('npc-close-model-prewarm');
  } else {
    markStartup('engine-init.startup-flow.npc-close-model-prewarm.skipped-mobile');
  }

  void nextFrame().then((frameYield) => {
    markStartup(`engine-init.startup-flow.flush-chunk-update.post-reveal-yield-${frameYield}`);
    schedulePostRevealBackgroundTasks();
  });
  markStartup('engine-init.startup-flow.flush-chunk-update.yield-not-gated');
  markStepEnd('flush-chunk-update');

  markStepBegin('renderer-visible');
  markPhase('renderer-visible', 'RENDERER ONLINE', 'Bringing visual systems to ready state...');
  engine.renderer.showRenderer();
  engine.renderer.hideSpawnLoadingIndicator();
  markStepEnd('renderer-visible');

  markStepBegin('enable-player-systems');
  markPhase('enable-player-systems', 'LIVE', 'Combat systems active. Good hunting.');
  engine.systemManager.firstPersonWeapon.setGameStarted(true);
  engine.systemManager.playerController.setGameStarted(true);
  engine.systemManager.hudSystem.startMatch();
  markStepEnd('enable-player-systems');

  if (!engine.sandboxEnabled && !shouldUseTouchControls()) {
    Logger.info('engine-init', 'Click anywhere to enable mouse look!');
  }

  markStepBegin('audio-start');
  if (engine.systemManager.audioManager) {
    engine.systemManager.audioManager.startAmbient();
    const settings = SettingsManager.getInstance();
    engine.systemManager.audioManager.setMasterVolume(settings.getMasterVolumeNormalized());
  }
  markStepEnd('audio-start');

  markStepBegin('combat-enable');
  const allowCombat = engine.sandboxConfig?.enableCombat ?? true;
  if (allowCombat && engine.systemManager.combatantSystem && typeof engine.systemManager.combatantSystem.enableCombat === 'function') {
    engine.systemManager.combatantSystem.enableCombat();
    Logger.info('engine-init', 'Combat AI activated!');
  } else if (!allowCombat) {
    Logger.info('engine-init', 'Combat AI disabled by sandbox config (combat=0)');
  }
  markStepEnd('combat-enable');

  markStepBegin('enter-live');
  engine.startupFlow.enterLive();
  markStepEnd('enter-live');
  markPhase(`interactive-ready (${(performance.now() - startTime).toFixed(1)}ms)`);
  markStartup('engine-init.startup-flow.interactive-ready');
}

function setNpcCloseModelLazyLoadAllowed(allowed: boolean): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, boolean>)[PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG] = allowed;
}

async function prewarmNearbyNpcCloseModels(engine: GameEngine): Promise<void> {
  const prewarmPromise = engine.systemManager.combatantSystem
    .prewarmCloseModelsNearPlayer({ maxActive: NPC_CLOSE_MODEL_PREWARM_MAX_ACTIVE })
    .catch((error) => {
      Logger.warn('engine-init', 'NPC close-model prewarm failed:', error);
      return null;
    });
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    window.setTimeout(() => resolve('timeout'), NPC_CLOSE_MODEL_PREWARM_TIMEOUT_MS);
  });
  const result = await Promise.race([prewarmPromise, timeoutPromise]);
  if (result === 'timeout') {
    Logger.warn(
      'engine-init',
      `NPC close-model prewarm exceeded ${NPC_CLOSE_MODEL_PREWARM_TIMEOUT_MS}ms; continuing startup with lazy close-model completion`,
    );
    markStartup('engine-init.startup-flow.npc-close-model-prewarm.timeout');
    return;
  }
  if (!result) {
    markStartup('engine-init.startup-flow.npc-close-model-prewarm.failed');
    return;
  }
  markStartup(`engine-init.startup-flow.npc-close-model-prewarm.candidates-${result.candidatesWithinCloseRadius}`);
  markStartup(`engine-init.startup-flow.npc-close-model-prewarm.rendered-${result.renderedCloseModels}`);
  markStartup(`engine-init.startup-flow.npc-close-model-prewarm.fallbacks-${result.fallbackCount}`);
  Logger.info(
    'engine-init',
    `NPC close-model prewarm ${result.skippedReason}: candidates=${result.candidatesWithinCloseRadius}, `
      + `rendered=${result.renderedCloseModels}, fallbacks=${result.fallbackCount}, `
      + `duration=${result.durationMs.toFixed(1)}ms`,
  );
}

function nextFrame(): Promise<'raf' | 'timeout'> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: 'raf' | 'timeout') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    // This yield exists to let terrain work breathe before renderer reveal. It
    // must not become the startup gate: Chromium can delay rAF callbacks while
    // the renderer canvas is hidden behind deploy/loading UI.
    const timeoutId = window.setTimeout(() => settle('timeout'), LIVE_ENTRY_FRAME_YIELD_TIMEOUT_MS);
    requestAnimationFrame(() => settle('raf'));
  });
}

function requestBackgroundTask(engine: GameEngine, task: () => void, delayMs: number): void {
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
  window.setTimeout(() => {
    if (engine.isDisposed) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => runSafely(), { timeout: 1000 });
    } else {
      runSafely();
    }
  }, delayMs);
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
