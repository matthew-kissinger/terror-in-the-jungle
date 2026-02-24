import * as THREE from 'three';
import { GameMode, ZoneConfig, getGameModeConfig } from '../config/gameModes';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { DEMHeightProvider } from '../systems/terrain/DEMHeightProvider';
import { Logger } from '../utils/Logger';
import { GrenadeType, Faction } from '../systems/combat/types';
import { SettingsManager } from '../config/SettingsManager';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { tryLockLandscapeOrientation } from '../utils/Orientation';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { PersistenceSystem } from '../systems/strategy/PersistenceSystem';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { toWorkerVegetationConfigs } from '../config/vegetationTypes';
import { toWorkerBiomeConfig, BIOMES } from '../config/biomes';

function getPrimaryUSBase(config: ReturnType<typeof getGameModeConfig>): ZoneConfig | undefined {
  return config.zones.find(z => z.isHomeBase && z.owner === Faction.US && (z.id.includes('main') || z.id === 'us_base'));
}

function resolveAShauInsertion(config: ReturnType<typeof getGameModeConfig>): THREE.Vector3 | null {
  const hill937 = config.zones.find(z => z.id === 'zone_hill937');
  const usForwardBase = config.zones.find(z => z.id === 'us_hq_east') ?? getPrimaryUSBase(config);
  if (!hill937 || !usForwardBase) {
    return null;
  }

  const dir = new THREE.Vector3().subVectors(usForwardBase.position, hill937.position);
  dir.y = 0;
  const len = dir.length();
  if (len < 1) {
    return null;
  }
  dir.divideScalar(len);

  // Spawn on the US-approach side of Hill 937 to shorten time-to-contact.
  return hill937.position.clone().addScaledVector(dir, 240);
}

function resolveModeSpawnPosition(config: ReturnType<typeof getGameModeConfig>): THREE.Vector3 {
  if (config.id === GameMode.A_SHAU_VALLEY) {
    const insertion = resolveAShauInsertion(config);
    if (insertion) {
      return insertion;
    }
  }
  return getPrimaryUSBase(config)?.position.clone() ?? new THREE.Vector3(0, 0, -50);
}

/**
 * Handles initialization of game systems and assets
 */
export async function initializeSystems(engine: GameEngine): Promise<void> {
  try {
    markStartup('engine-init.initialize-systems.begin');
    await engine.systemManager.initializeSystems(
      engine.renderer.scene, engine.renderer.camera,
      (phase: string, progress: number) => engine.loadingScreen.updateProgress(phase, progress),
      engine.renderer
    );

    engine.loadingScreen.updateProgress('entities', 0);
    Logger.info('engine-init', 'Systems initialized, loading assets...');
    await loadGameAssets(engine);

    const skyboxTexture = engine.systemManager.assetLoader.getTexture('skybox');
    if (skyboxTexture) {
      engine.systemManager.skybox.createSkybox(skyboxTexture);
      Logger.info('engine-init', 'Skybox created');
    }

    // Send default vegetation config to workers as a safety net. This is just
    // a postMessage (microseconds). Chunk generation is deferred to
    // startGameWithMode() where it runs at the actual mode spawn position.
    engine.systemManager.globalBillboardSystem.configure('denseJungle');
    {
      const activeTypes = engine.systemManager.globalBillboardSystem.getActiveVegetationTypes();
      const activeBiome = engine.systemManager.globalBillboardSystem.getActiveBiome();
      const workerPool = engine.systemManager.chunkManager.getWorkerPool?.();
      if (workerPool) {
        workerPool.sendVegetationConfig({
          types: toWorkerVegetationConfigs(activeTypes),
          biomePalette: toWorkerBiomeConfig(activeBiome).vegetationPalette,
        });
      }
    }

    Logger.info('engine-init', 'World system ready!');
    engine.loadingScreen.updateProgress('entities', 1);
    engine.isInitialized = true;
    Logger.info('engine-init', 'Engine ready!');

    // Wire Play Again to programmatic restart so it does not reload the page
    engine.systemManager.hudSystem.setPlayAgainCallback(() => restartMatch(engine));

    if (engine.sandboxEnabled && engine.sandboxConfig?.autoStart) {
      markStartup('engine-init.autostart.begin');
      startGameWithMode(engine, GameMode.AI_SANDBOX);
    } else {
      engine.loadingScreen.showMainMenu();
    }
  } catch (error) {
    Logger.error('engine-init', 'Failed to initialize engine:', error);

    // Show error to user
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred during initialization';

    engine.loadingScreen.showError('Initialization Failed', errorMessage);
  }
}

/**
 * Minimal asset check before starting
 */
export async function loadGameAssets(engine: GameEngine): Promise<void> {
  if (!engine.systemManager.assetLoader.getTexture('skybox')) {
    Logger.warn('engine-init', 'Skybox texture missing; proceeding without skybox.');
  }
  Logger.info('engine-init', 'Asset check complete');
}

/**
 * Restarts the current match in-place (same mode). Resets tickets, combatants, player, day/night, weather.
 * Used by the Match End "Play Again" button.
 */
export function restartMatch(engine: GameEngine): void {
  const mode = engine.systemManager.gameModeManager.getCurrentMode();
  Logger.info('engine-init', `Restarting match with mode: ${mode}`);
  engine.systemManager.setGameMode(mode, { createPlayerSquad: true });
  engine.systemManager.ticketSystem.restartMatch();
  engine.systemManager.hudSystem.startMatch();
}

/**
 * Sets game mode and prepares for game start
 */
export async function startGameWithMode(engine: GameEngine, mode: GameMode): Promise<void> {
  if (!engine.isInitialized || engine.gameStarted) return;
  markStartup(`engine-init.start-game.${mode}.begin`);
  Logger.info('engine-init', `Starting game with mode: ${mode}`);

  if (shouldUseTouchControls()) {
    tryLockLandscapeOrientation();
  }

  engine.gameStarted = true;

  // Load DEM data if this mode uses real terrain
  const config = getGameModeConfig(mode);
  if (config.heightSource?.type === 'dem') {
    markStartup(`engine-init.start-game.${mode}.dem-load.begin`);
    Logger.info('engine-init', `Loading DEM terrain from ${config.heightSource.path}...`);
    try {
      const response = await fetch(config.heightSource.path);
      if (!response.ok) throw new Error(`DEM fetch failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const demProvider = new DEMHeightProvider(
        new Float32Array(buffer),
        config.heightSource.width,
        config.heightSource.height,
        config.heightSource.metersPerPixel
      );

      // Update global height query cache to use DEM
      const heightCache = getHeightQueryCache();
      heightCache.setProvider(demProvider);

      // Send DEM data to chunk worker pool
      const workerPool = engine.systemManager.chunkManager.getWorkerPool?.();
      if (workerPool) {
        workerPool.sendHeightProvider(demProvider.getWorkerConfig());
      }

      Logger.info('engine-init', `DEM loaded: ${config.heightSource.width}x${config.heightSource.height}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
    } catch (error) {
      Logger.error('engine-init', 'Failed to load DEM terrain:', error);
      // Fall back to procedural noise - don't block the game
    }
    markStartup(`engine-init.start-game.${mode}.dem-load.end`);

  }

  // Configure renderer for mode-specific settings
  if (config.cameraFar || config.fogDensity || config.shadowFar) {
    engine.renderer.configureForWorldSize({
      cameraFar: config.cameraFar,
      fogDensity: config.fogDensity,
      shadowFar: config.shadowFar
    });
  }

  // Reconfigure chunk size if mode specifies a different value
  if (config.chunkSize && config.chunkSize !== engine.systemManager.chunkManager.getChunkSize()) {
    engine.systemManager.chunkManager.setChunkSize(config.chunkSize);
  }

  // Update render distance if mode specifies it
  if (config.chunkRenderDistance) {
    engine.systemManager.chunkManager.setRenderDistance(config.chunkRenderDistance);
  }

  // Push biome rules to chunk manager so per-chunk classification works
  const defaultBiome = config.terrain?.defaultBiome ?? 'denseJungle';
  engine.systemManager.chunkManager.setBiomeConfig(defaultBiome, config.terrain?.biomeRules);

  // Configure biome / vegetation for this mode
  engine.systemManager.globalBillboardSystem.configure(defaultBiome);

  // Send vegetation + biome config to chunk workers
  {
    const activeTypes = engine.systemManager.globalBillboardSystem.getActiveVegetationTypes();
    const activeBiome = engine.systemManager.globalBillboardSystem.getActiveBiome();
    const workerPool = engine.systemManager.chunkManager.getWorkerPool?.();
    if (workerPool) {
      workerPool.sendVegetationConfig({
        types: toWorkerVegetationConfigs(activeTypes),
        biomePalette: toWorkerBiomeConfig(activeBiome).vegetationPalette,
      });

      const allPalettes: Record<string, any[]> = {};
      for (const [id, biome] of Object.entries(BIOMES)) {
        allPalettes[id] = biome.vegetationPalette;
      }
      workerPool.sendBiomeConfig({
        biomeRules: config.terrain?.biomeRules ?? [],
        defaultBiomeId: defaultBiome,
        allBiomePalettes: allPalettes,
      });
    }
  }

  engine.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });

  // Load persisted war state if available (A Shau Valley mode)
  if (config.warSimulator?.enabled && engine.systemManager.warSimulator.isEnabled()) {
    const persistence = new PersistenceSystem();
    const existingSave = persistence.getAutoSave(mode);
    if (existingSave) {
      Logger.info('engine-init', `Restoring war state: ${existingSave.agents.length} agents, ${existingSave.elapsedTime.toFixed(0)}s elapsed`);
      engine.systemManager.warSimulator.loadWarState(existingSave);
    }
  }

  // Pre-generate chunks at actual spawn position for this mode
  const spawnPos = resolveModeSpawnPosition(config);
  spawnPos.y = 5;
  await engine.systemManager.preGenerateSpawnArea(spawnPos);
  markStartup(`engine-init.start-game.${mode}.post-pre-generate`);

  // Skip loadout selector - all weapons available via hotbar, default frag grenades
  applyDefaultLoadout(engine);
  startGame(engine);
  markStartup(`engine-init.start-game.${mode}.end`);
}

/**
 * Apply default loadout (rifle + frag) for sandbox mode
 */
function applyDefaultLoadout(engine: GameEngine): void {
  engine.systemManager.firstPersonWeapon.setPrimaryWeapon('rifle');
  engine.systemManager.grenadeSystem.setGrenadeType(GrenadeType.FRAG);
  Logger.info('engine-init', 'Default loadout applied (rifle + frag)');
}

/**
 * Main game start logic, pointer lock, shader compilation, and spawn positioning
 */
export function startGame(engine: GameEngine): void {
  if (!engine.gameStarted) return;
  if (engine.sandboxEnabled) {
    engine.systemManager.playerController.setPointerLockEnabled(false);
  }

  void runStartupFlow(engine);

  engine.renderer.showCrosshair();
  if (!engine.sandboxEnabled) showWelcomeMessage(engine);

  // Apply FPS overlay visibility from settings
  const showFPS = SettingsManager.getInstance().get('showFPS');
  if (showFPS && !engine.performanceOverlay.isVisible()) {
    engine.performanceOverlay.toggle();
  }
  performanceTelemetry.setEnabled(engine.performanceOverlay.isVisible() || engine.sandboxEnabled);
}

async function runStartupFlow(engine: GameEngine): Promise<void> {
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
    const cfg = engine.systemManager.gameModeManager.getCurrentConfig();
    if (cfg.id === GameMode.AI_SANDBOX) {
      const pos = new THREE.Vector3(0, 0, 0);
      pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
      engine.systemManager.playerController.setPosition(pos, 'startup.spawn.sandbox');
    } else {
      const pos = resolveModeSpawnPosition(cfg);
      pos.y = getHeightQueryCache().getHeightAt(pos.x, pos.z) + 2;
      engine.systemManager.playerController.setPosition(pos, 'startup.spawn.mode-hq');
    }
  } catch {
    // Keep startup resilient; spawn fallback already exists elsewhere.
  }

  markPhase('flush-chunk-update', 'BUILDING LOCAL TERRAIN', 'Finalizing chunk data around insertion zone...');
  engine.systemManager.chunkManager.update(0.016);
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

  // Delay shader warmup until after first interactive frame.
  requestBackgroundTask(() => engine.renderer.precompileShaders(), 1000);
  requestBackgroundTask(() => engine.systemManager.startDeferredInitialization(), 500);
  markPhase(`interactive-ready (${(performance.now() - startTime).toFixed(1)}ms)`);
  markStartup('engine-init.startup-flow.interactive-ready');
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
export function showWelcomeMessage(engine: GameEngine): void {
  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
  Logger.info('engine-init', `
 TERROR IN THE JUNGLE - GAME STARTED!

 World Features:
- ${debugInfo.grassUsed} grass instances allocated
- ${debugInfo.treeUsed} tree instances allocated
- ${engine.systemManager.chunkManager.getLoadedChunkCount()} chunks loaded
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
    markStartup('engine-init.initialize-systems.end');
