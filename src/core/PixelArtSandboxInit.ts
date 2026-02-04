import * as THREE from 'three';
import { GameMode } from '../config/gameModes';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { Logger } from '../utils/Logger';

/**
 * Handles initialization of game systems and assets
 */
export async function initializeSystems(sandbox: any): Promise<void> {
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

    Logger.info('sandbox-init', 'Pre-generating spawn area...');
    const spawnPosition = sandbox.sandboxEnabled ? new THREE.Vector3(0, 5, 0) : new THREE.Vector3(0, 5, -50);
    await sandbox.systemManager.preGenerateSpawnArea(spawnPosition);

    Logger.info('sandbox-init', 'World system ready!');
    sandbox.loadingScreen.updateProgress('entities', 1);
    sandbox.isInitialized = true;
    Logger.info('sandbox-init', 'Pixel Art Sandbox ready!');

    if (sandbox.sandboxEnabled && sandbox.sandboxConfig?.autoStart) {
      startGameWithMode(sandbox, GameMode.AI_SANDBOX);
    } else {
      sandbox.loadingScreen.showMainMenu();
    }
  } catch (error) {
    Logger.error('sandbox-init', 'Failed to initialize sandbox:', error);
  }
}

/**
 * Minimal asset check before starting
 */
export async function loadGameAssets(sandbox: any): Promise<void> {
  if (!sandbox.systemManager.assetLoader.getTexture('skybox')) {
    Logger.warn('sandbox-init', 'Skybox texture missing; proceeding without skybox.');
  }
  Logger.info('sandbox-init', 'Asset check complete');
}

/**
 * Sets game mode and prepares for game start
 */
export function startGameWithMode(sandbox: any, mode: GameMode): void {
  if (!sandbox.isInitialized || sandbox.gameStarted) return;
  Logger.info('sandbox-init', `PixelArtSandbox: Starting game with mode: ${mode}`);
  sandbox.gameStarted = true;
  sandbox.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
  startGame(sandbox);
}

/**
 * Main game start logic, pointer lock, shader compilation, and spawn positioning
 */
export function startGame(sandbox: any): void {
  if (!sandbox.gameStarted) return;
  if (sandbox.sandboxEnabled) {
    const controller = sandbox.systemManager.playerController as any;
    if (controller && typeof controller.setPointerLockEnabled === 'function') {
      controller.setPointerLockEnabled(false);
    }
  }

  sandbox.loadingScreen.hide();
  sandbox.sandboxRenderer.showSpawnLoadingIndicator();
  sandbox.sandboxRenderer.showRenderer();
  sandbox.sandboxRenderer.precompileShaders();

  const startTime = performance.now();
  setTimeout(() => {
    Logger.info('sandbox-init', `Game ready in ${performance.now() - startTime}ms`);
    sandbox.sandboxRenderer.hideSpawnLoadingIndicator();

    try {
      const gm = (sandbox.systemManager as any).gameModeManager;
      const cfg = gm.getCurrentConfig();
      if (cfg.id === GameMode.AI_SANDBOX) {
        const pos = new THREE.Vector3(0, 0, 0);
        pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
        sandbox.systemManager.playerController.setPosition(pos);
      } else {
        const Faction = { US: 'US', OPFOR: 'OPFOR' } as any;
        const spawn = cfg.zones.find((z: any) => z.isHomeBase && z.owner === Faction.US && (z.id.includes('main') || z.id === 'us_base'));
        if (spawn) {
          const pos = spawn.position.clone();
          pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
          sandbox.systemManager.playerController.setPosition(pos);
        }
      }
    } catch { /* ignore */ }

    setTimeout(() => {
      const weapon = sandbox.systemManager.firstPersonWeapon as any;
      if (weapon && typeof weapon.setGameStarted === 'function') weapon.setGameStarted(true);
      const controller = sandbox.systemManager.playerController as any;
      if (controller && typeof controller.setGameStarted === 'function') controller.setGameStarted(true);

      if (!sandbox.sandboxEnabled) Logger.info('sandbox-init', 'Click anywhere to enable mouse look!');
      if (sandbox.systemManager.audioManager) sandbox.systemManager.audioManager.startAmbient();
      if (sandbox.systemManager.combatantSystem && typeof sandbox.systemManager.combatantSystem.enableCombat === 'function') {
        sandbox.systemManager.combatantSystem.enableCombat();
        Logger.info('sandbox-init', 'Combat AI activated!');
      }
      if (sandbox.systemManager.hudSystem && typeof (sandbox.systemManager.hudSystem as any).startMatch === 'function') {
        (sandbox.systemManager.hudSystem as any).startMatch();
      }
    }, 200);
  }, 300);

  sandbox.sandboxRenderer.showCrosshair();
  if (!sandbox.sandboxEnabled) showWelcomeMessage(sandbox);
}

/**
 * Displays welcome message with controls in console
 */
export function showWelcomeMessage(sandbox: any): void {
  const debugInfo = sandbox.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = sandbox.systemManager.combatantSystem.getCombatStats();
  Logger.info('sandbox-init', `
🎮 TERROR IN THE JUNGLE - GAME STARTED!

🌍 World Features:
- ${debugInfo.grassUsed} grass instances allocated
- ${debugInfo.treeUsed} tree instances allocated
- ${sandbox.systemManager.chunkManager.getLoadedChunkCount()} chunks loaded
- ${combatStats.us} US, ${combatStats.opfor} OPFOR combatants in battle

🎯 Controls:
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
