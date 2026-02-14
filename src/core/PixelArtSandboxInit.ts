import * as THREE from 'three';
import { GameMode, ZoneConfig, getGameModeConfig } from '../config/gameModes';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { Logger } from '../utils/Logger';
import { GrenadeType, Faction } from '../systems/combat/types';
import { isSandboxMode } from './SandboxModeDetector';
import { SettingsManager } from '../config/SettingsManager';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { tryLockLandscapeOrientation } from '../utils/Orientation';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { PixelArtSandbox } from './PixelArtSandbox';

/**
 * Handles initialization of game systems and assets
 */
export async function initializeSystems(sandbox: PixelArtSandbox): Promise<void> {
  try {
    await sandbox.systemManager.initializeSystems(
      sandbox.sandboxRenderer.scene, sandbox.sandboxRenderer.camera,
      (phase: string, progress: number) => sandbox.loadingScreen.updateProgress(phase, progress),
      sandbox.sandboxRenderer
    );

    sandbox.loadingScreen.updateProgress('entities', 0);
    Logger.info('sandbox-init', 'Systems initialized, loading assets...');
    await loadGameAssets(sandbox);

    const skyboxTexture = sandbox.systemManager.assetLoader.getTexture('skybox');
    if (skyboxTexture) {
      sandbox.systemManager.skybox.createSkybox(skyboxTexture);
      Logger.info('sandbox-init', 'Skybox created');
    }

    const shouldPreGenerateNow = !(sandbox.sandboxEnabled && sandbox.sandboxConfig?.autoStart);
    if (shouldPreGenerateNow) {
      Logger.info('sandbox-init', 'Pre-generating spawn area...');
      const spawnPosition = sandbox.sandboxEnabled ? new THREE.Vector3(0, 5, 0) : new THREE.Vector3(0, 5, -50);
      await sandbox.systemManager.preGenerateSpawnArea(spawnPosition);
    } else {
      Logger.info('sandbox-init', 'Skipping initial spawn pre-generation (autostart will pre-generate mode-specific spawn).');
    }

    Logger.info('sandbox-init', 'World system ready!');
    sandbox.loadingScreen.updateProgress('entities', 1);
    sandbox.isInitialized = true;
    Logger.info('sandbox-init', 'Pixel Art Sandbox ready!');

    // Wire Play Again to programmatic restart so it does not reload the page
    sandbox.systemManager.hudSystem.setPlayAgainCallback(() => restartMatch(sandbox));

    if (sandbox.sandboxEnabled && sandbox.sandboxConfig?.autoStart) {
      startGameWithMode(sandbox, GameMode.AI_SANDBOX);
    } else {
      sandbox.loadingScreen.showMainMenu();
    }
  } catch (error) {
    Logger.error('sandbox-init', 'Failed to initialize sandbox:', error);

    // Show error to user
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred during initialization';

    sandbox.loadingScreen.showError('Initialization Failed', errorMessage);
  }
}

/**
 * Minimal asset check before starting
 */
export async function loadGameAssets(sandbox: PixelArtSandbox): Promise<void> {
  if (!sandbox.systemManager.assetLoader.getTexture('skybox')) {
    Logger.warn('sandbox-init', 'Skybox texture missing; proceeding without skybox.');
  }
  Logger.info('sandbox-init', 'Asset check complete');
}

/**
 * Restarts the current match in-place (same mode). Resets tickets, combatants, player, day/night, weather.
 * Used by the Match End "Play Again" button.
 */
export function restartMatch(sandbox: PixelArtSandbox): void {
  const mode = sandbox.systemManager.gameModeManager.getCurrentMode();
  Logger.info('sandbox-init', `Restarting match with mode: ${mode}`);
  sandbox.systemManager.setGameMode(mode, { createPlayerSquad: true });
  sandbox.systemManager.ticketSystem.restartMatch();
  sandbox.systemManager.hudSystem.startMatch();
}

/**
 * Sets game mode and prepares for game start
 */
export async function startGameWithMode(sandbox: PixelArtSandbox, mode: GameMode): Promise<void> {
  if (!sandbox.isInitialized || sandbox.gameStarted) return;
  Logger.info('sandbox-init', `PixelArtSandbox: Starting game with mode: ${mode}`);

  if (shouldUseTouchControls()) {
    tryLockLandscapeOrientation();
  }

  sandbox.gameStarted = true;
  sandbox.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });

  // Pre-generate chunks at actual spawn position for this mode
  const config = getGameModeConfig(mode);
  const usHQ = config.zones.find(z => z.isHomeBase && z.owner === Faction.US && (z.id.includes('main') || z.id === 'us_base'));
  const spawnPos = usHQ ? usHQ.position.clone() : new THREE.Vector3(0, 0, -50);
  spawnPos.y = 5;
  await sandbox.systemManager.preGenerateSpawnArea(spawnPos);

  // Skip loadout selector - all weapons available via hotbar, default frag grenades
  applyDefaultLoadout(sandbox);
  startGame(sandbox);
}

/**
 * Apply default loadout (rifle + frag) for sandbox mode
 */
function applyDefaultLoadout(sandbox: PixelArtSandbox): void {
  sandbox.systemManager.firstPersonWeapon.setPrimaryWeapon('rifle');
  sandbox.systemManager.grenadeSystem.setGrenadeType(GrenadeType.FRAG);
  Logger.info('sandbox-init', 'Default loadout applied (rifle + frag)');
}

/**
 * Main game start logic, pointer lock, shader compilation, and spawn positioning
 */
export function startGame(sandbox: PixelArtSandbox): void {
  if (!sandbox.gameStarted) return;
  if (sandbox.sandboxEnabled) {
    sandbox.systemManager.playerController.setPointerLockEnabled(false);
  }

  void runStartupFlow(sandbox);

  sandbox.sandboxRenderer.showCrosshair();
  if (!sandbox.sandboxEnabled) showWelcomeMessage(sandbox);

  // Apply FPS overlay visibility from settings
  const showFPS = SettingsManager.getInstance().get('showFPS');
  if (showFPS && !sandbox.performanceOverlay.isVisible()) {
    sandbox.performanceOverlay.toggle();
  }
  performanceTelemetry.setEnabled(sandbox.performanceOverlay.isVisible() || sandbox.sandboxEnabled);
}

async function runStartupFlow(sandbox: PixelArtSandbox): Promise<void> {
  const startTime = performance.now();
  const markPhase = (phase: string) => Logger.info('sandbox-init', `[startup] ${phase}`);

  markPhase('hide-loading');
  sandbox.loadingScreen.hide();
  sandbox.sandboxRenderer.showSpawnLoadingIndicator();

  markPhase('position-player');
  try {
    const cfg = sandbox.systemManager.gameModeManager.getCurrentConfig();
    if (cfg.id === GameMode.AI_SANDBOX) {
      const pos = new THREE.Vector3(0, 0, 0);
      pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
      sandbox.systemManager.playerController.setPosition(pos);
    } else {
      const spawn = cfg.zones.find((z: ZoneConfig) => z.isHomeBase && z.owner === Faction.US && (z.id.includes('main') || z.id === 'us_base'));
      if (spawn) {
        const pos = spawn.position.clone();
        pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
        sandbox.systemManager.playerController.setPosition(pos);
      }
    }
  } catch {
    // Keep startup resilient; spawn fallback already exists elsewhere.
  }

  markPhase('flush-chunk-update');
  sandbox.systemManager.chunkManager.update(0.016);
  await nextFrame();

  markPhase('renderer-visible');
  sandbox.sandboxRenderer.showRenderer();
  sandbox.sandboxRenderer.hideSpawnLoadingIndicator();

  markPhase('enable-player-systems');
  sandbox.systemManager.firstPersonWeapon.setGameStarted(true);
  sandbox.systemManager.playerController.setGameStarted(true);
  sandbox.systemManager.hudSystem.startMatch();

  if (!sandbox.sandboxEnabled && !shouldUseTouchControls()) {
    Logger.info('sandbox-init', 'Click anywhere to enable mouse look!');
  }

  if (sandbox.systemManager.audioManager) {
    sandbox.systemManager.audioManager.startAmbient();
    const settings = SettingsManager.getInstance();
    sandbox.systemManager.audioManager.setMasterVolume(settings.getMasterVolumeNormalized());
  }

  const allowCombat = sandbox.sandboxConfig?.enableCombat ?? true;
  if (allowCombat && sandbox.systemManager.combatantSystem && typeof sandbox.systemManager.combatantSystem.enableCombat === 'function') {
    sandbox.systemManager.combatantSystem.enableCombat();
    Logger.info('sandbox-init', 'Combat AI activated!');
  } else if (!allowCombat) {
    Logger.info('sandbox-init', 'Combat AI disabled by sandbox config (combat=0)');
  }

  // Delay shader warmup until after first interactive frame.
  requestBackgroundTask(() => sandbox.sandboxRenderer.precompileShaders(), 1000);
  requestBackgroundTask(() => sandbox.systemManager.startDeferredInitialization(), 500);
  markPhase(`interactive-ready (${(performance.now() - startTime).toFixed(1)}ms)`);
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function requestBackgroundTask(task: () => void, timeoutMs: number): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(() => task(), { timeout: timeoutMs });
  } else {
    setTimeout(task, timeoutMs);
  }
}

/**
 * Displays welcome message with controls in console
 */
export function showWelcomeMessage(sandbox: PixelArtSandbox): void {
  const debugInfo = sandbox.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = sandbox.systemManager.combatantSystem.getCombatStats();
  Logger.info('sandbox-init', `
 TERROR IN THE JUNGLE - GAME STARTED!

 World Features:
- ${debugInfo.grassUsed} grass instances allocated
- ${debugInfo.treeUsed} tree instances allocated
- ${sandbox.systemManager.chunkManager.getLoadedChunkCount()} chunks loaded
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
