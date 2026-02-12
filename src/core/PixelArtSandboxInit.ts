import * as THREE from 'three';
import { GameMode, ZoneConfig } from '../config/gameModes';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { Logger } from '../utils/Logger';
import { LoadoutWeapon } from '../ui/loadout/LoadoutSelector';
import { GrenadeType, Faction } from '../systems/combat/types';
import { isSandboxMode } from './SandboxModeDetector';
import { SettingsManager } from '../config/SettingsManager';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
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

    Logger.info('sandbox-init', 'Pre-generating spawn area...');
    const spawnPosition = sandbox.sandboxEnabled ? new THREE.Vector3(0, 5, 0) : new THREE.Vector3(0, 5, -50);
    await sandbox.systemManager.preGenerateSpawnArea(spawnPosition);

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
export function startGameWithMode(sandbox: PixelArtSandbox, mode: GameMode): void {
  if (!sandbox.isInitialized || sandbox.gameStarted) return;
  Logger.info('sandbox-init', `PixelArtSandbox: Starting game with mode: ${mode}`);
  sandbox.gameStarted = true;
  sandbox.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
  
  // Show loadout selector before starting game (skip in sandbox mode)
  if (!isSandboxMode() && mode !== GameMode.AI_SANDBOX) {
    showLoadoutSelector(sandbox, mode);
  } else {
    // Sandbox mode or AI sandbox - use defaults and start immediately
    applyDefaultLoadout(sandbox);
    startGame(sandbox);
  }
}

/**
 * Shows loadout selector and waits for player confirmation
 */
function showLoadoutSelector(sandbox: PixelArtSandbox, _mode: GameMode): void {
  const loadoutSelector = sandbox.systemManager.loadoutSelector;
  
  // Hide loading screen
  sandbox.loadingScreen.hide();
  
  // Set up callback to apply selections and start game
  loadoutSelector.onConfirm((weapon: LoadoutWeapon, grenadeType: GrenadeType) => {
    applyLoadout(sandbox, weapon, grenadeType);
    startGame(sandbox);
  });
  
  // Show loadout selector
  loadoutSelector.show();
  Logger.info('sandbox-init', 'Loadout selector shown');
}

/**
 * Apply selected loadout to game systems
 */
function applyLoadout(sandbox: PixelArtSandbox, weapon: LoadoutWeapon, grenadeType: GrenadeType): void {
  // Map LoadoutWeapon enum to weapon type string
  const weaponTypeMap: Record<LoadoutWeapon, 'rifle' | 'shotgun' | 'smg' | 'pistol'> = {
    [LoadoutWeapon.RIFLE]: 'rifle',
    [LoadoutWeapon.SHOTGUN]: 'shotgun',
    [LoadoutWeapon.SMG]: 'smg',
    [LoadoutWeapon.PISTOL]: 'pistol'
  };
  
  const weaponType = weaponTypeMap[weapon];
  
  // Set primary weapon
  sandbox.systemManager.firstPersonWeapon.setPrimaryWeapon(weaponType);
  Logger.info('sandbox-init', `Primary weapon set to: ${weaponType}`);
  
  // Set grenade type
  sandbox.systemManager.grenadeSystem.setGrenadeType(grenadeType);
  Logger.info('sandbox-init', `Grenade type set to: ${grenadeType}`);
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

  sandbox.loadingScreen.hide();
  sandbox.sandboxRenderer.showSpawnLoadingIndicator();
  sandbox.sandboxRenderer.showRenderer();
  sandbox.sandboxRenderer.precompileShaders();

  const startTime = performance.now();
  setTimeout(() => {
    Logger.info('sandbox-init', `Game ready in ${performance.now() - startTime}ms`);
    sandbox.sandboxRenderer.hideSpawnLoadingIndicator();

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
    } catch { /* ignore */ }

    setTimeout(() => {
      sandbox.systemManager.firstPersonWeapon.setGameStarted(true);
      sandbox.systemManager.playerController.setGameStarted(true);

      if (!sandbox.sandboxEnabled && !shouldUseTouchControls()) {
        Logger.info('sandbox-init', 'Click anywhere to enable mouse look!');
      }
      if (sandbox.systemManager.audioManager) sandbox.systemManager.audioManager.startAmbient();
      // Apply saved volume setting
      if (sandbox.systemManager.audioManager) {
        const settings = SettingsManager.getInstance();
        sandbox.systemManager.audioManager.setMasterVolume(settings.getMasterVolumeNormalized());
      }
      if (sandbox.systemManager.combatantSystem && typeof sandbox.systemManager.combatantSystem.enableCombat === 'function') {
        sandbox.systemManager.combatantSystem.enableCombat();
        Logger.info('sandbox-init', 'Combat AI activated!');
      }
      sandbox.systemManager.hudSystem.startMatch();
    }, 200);
  }, 300);

  sandbox.sandboxRenderer.showCrosshair();
  if (!sandbox.sandboxEnabled) showWelcomeMessage(sandbox);

  // Apply FPS overlay visibility from settings
  const showFPS = SettingsManager.getInstance().get('showFPS');
  if (showFPS && !sandbox.performanceOverlay.isVisible()) {
    sandbox.performanceOverlay.toggle();
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
