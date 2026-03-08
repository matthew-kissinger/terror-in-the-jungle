import * as THREE from 'three';
import { GameLaunchSelection, GameMode, GameModeDefinition, ZoneConfig } from '../config/gameModeTypes';
import { getGameModeConfig } from '../config/gameModes';
import { getGameModeDefinition, resolveLaunchSelection } from '../config/gameModeDefinitions';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { DEMHeightProvider } from '../systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../systems/terrain/NoiseHeightProvider';
import { compileTerrainFeatures } from '../systems/terrain/TerrainFeatureCompiler';
import { StampedHeightProvider } from '../systems/terrain/StampedHeightProvider';
import { Logger } from '../utils/Logger';
import { Alliance, Faction } from '../systems/combat/types';
import { SettingsManager } from '../config/SettingsManager';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { tryLockLandscapeOrientation } from '../utils/Orientation';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { PersistenceSystem } from '../systems/strategy/PersistenceSystem';
import { resolveInitialSpawnPosition } from '../systems/world/runtime/ModeSpawnResolver';
import { InitialDeployCancelledError } from '../systems/player/PlayerRespawnManager';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { isPerfDiagnosticsEnabled } from './PerfDiagnostics';

function applyCompiledTerrainFeatures(engine: GameEngine, config: ReturnType<typeof getGameModeConfig>): void {
  const compiledFeatures = compileTerrainFeatures(config);
  engine.systemManager.terrainSystem.setTerrainFeatures(compiledFeatures);

  if (compiledFeatures.stamps.length === 0) {
    return;
  }

  const heightCache = getHeightQueryCache();
  heightCache.setProvider(new StampedHeightProvider(heightCache.getProvider(), compiledFeatures.stamps));
}

function getPrimaryAllianceBase(
  config: ReturnType<typeof getGameModeConfig>,
  alliance: Alliance
): ZoneConfig | undefined {
  const expectedOwner = alliance === Alliance.BLUFOR ? Faction.US : Faction.NVA;
  const canonicalBaseId = alliance === Alliance.BLUFOR ? 'us_base' : 'opfor_base';
  return config.zones.find(z => z.isHomeBase && z.owner === expectedOwner && (z.id.includes('main') || z.id === canonicalBaseId))
    ?? config.zones.find(z => z.isHomeBase && z.owner !== null && (alliance === Alliance.BLUFOR ? z.owner === Faction.US || z.owner === Faction.ARVN : z.owner === Faction.NVA || z.owner === Faction.VC));
}

function resolveModeSpawnPosition(
  definition: GameModeDefinition,
  alliance: Alliance = Alliance.BLUFOR
): THREE.Vector3 {
  const policySpawn = resolveInitialSpawnPosition(definition, alliance);
  if (policySpawn) {
    return policySpawn;
  }
  return getPrimaryAllianceBase(definition.config, alliance)?.position.clone() ?? new THREE.Vector3(0, 0, -50);
}

function normalizeLaunchSelection(
  modeOrSelection: GameMode | GameLaunchSelection
): GameLaunchSelection {
  if (typeof modeOrSelection === 'string') {
    const definition = getGameModeDefinition(modeOrSelection);
    const resolved = resolveLaunchSelection(definition);
    return {
      mode: modeOrSelection,
      alliance: resolved.alliance,
      faction: resolved.faction,
    };
  }

  const definition = getGameModeDefinition(modeOrSelection.mode);
  const resolved = resolveLaunchSelection(definition, modeOrSelection);
  return {
    mode: modeOrSelection.mode,
    alliance: resolved.alliance,
    faction: resolved.faction,
  };
}

const FACTION_DISPLAY_NAMES: Record<Faction, string> = {
  [Faction.US]: 'US Forces',
  [Faction.ARVN]: 'ARVN',
  [Faction.NVA]: 'NVA',
  [Faction.VC]: 'Viet Cong',
};

function resolveFactionLabels(definition: GameModeDefinition, _alliance: Alliance): { blufor: string; opfor: string } {
  const mix = definition.config.factionMix;
  if (mix) {
    const bluforFactions = mix[Alliance.BLUFOR];
    const opforFactions = mix[Alliance.OPFOR];
    const bluforLabel = bluforFactions?.length === 1
      ? FACTION_DISPLAY_NAMES[bluforFactions[0]]
      : 'BLUFOR';
    const opforLabel = opforFactions?.length === 1
      ? FACTION_DISPLAY_NAMES[opforFactions[0]]
      : 'OPFOR';
    return { blufor: bluforLabel, opfor: opforLabel };
  }
  return { blufor: 'US Forces', opfor: 'OPFOR' };
}

function applyLaunchSelection(engine: GameEngine, definition: GameModeDefinition, selection: GameLaunchSelection): void {
  engine.systemManager.loadoutService.setContextFromDefinition(
    definition,
    selection.alliance,
    selection.faction
  );
  engine.systemManager.playerController.setPlayerFaction(selection.faction);
  engine.systemManager.playerHealthSystem.setPlayerFaction(selection.faction);
  engine.systemManager.firstPersonWeapon.setPlayerFaction(selection.faction);
  engine.systemManager.combatantSystem.setPlayerFaction(selection.faction);
  engine.systemManager.zoneManager.setPlayerAlliance(selection.alliance);

  // Set HUD faction labels from mode definition
  const labels = resolveFactionLabels(definition, selection.alliance);
  engine.systemManager.hudSystem.setFactionLabels(labels.blufor, labels.opfor);
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

    engine.systemManager.globalBillboardSystem.configure('denseJungle');

    Logger.info('engine-init', 'World system ready!');
    engine.loadingScreen.updateProgress('entities', 1);
    engine.isInitialized = true;
    Logger.info('engine-init', 'Engine ready!');

    // Wire Play Again to programmatic restart so it does not reload the page
    engine.systemManager.hudSystem.setPlayAgainCallback(() => restartMatch(engine));

    markStartup('engine-init.initialize-systems.end');

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
export async function startGameWithMode(
  engine: GameEngine,
  modeOrSelection: GameMode | GameLaunchSelection
): Promise<void> {
  const launchSelection = normalizeLaunchSelection(modeOrSelection);
  const mode = launchSelection.mode;
  if (!engine.isInitialized || engine.gameStarted || engine.gameStartPending) return;
  engine.gameStartPending = true;

  try {
    markStartup(`engine-init.start-game.${mode}.begin`);
    Logger.info('engine-init', `Starting game with mode: ${mode}`);
    engine.loadingScreen.beginGameLaunch(launchSelection);

    if (shouldUseTouchControls()) {
      tryLockLandscapeOrientation();
    }

    // Configure terrain height source for this mode
    const definition = getGameModeDefinition(mode);
    const config = getGameModeConfig(mode);
    if (config.heightSource?.type === 'dem') {
      // DEM mode - load real terrain data (A Shau Valley, future Vietnam theaters)
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

        Logger.info('engine-init', `DEM loaded: ${config.heightSource.width}x${config.heightSource.height}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
      } catch (error) {
        Logger.error('engine-init', 'Failed to load DEM terrain:', error);
        // Fall back to procedural noise - don't block the game
      }
      markStartup(`engine-init.start-game.${mode}.dem-load.end`);

    } else {
      // Procedural noise mode - resolve seed for terrain variety
      const seedConfig = config.terrainSeed;
      const seed = seedConfig === 'random' || seedConfig === undefined
        ? Math.floor(Math.random() * 2147483647)
        : seedConfig;

      const noiseProvider = new NoiseHeightProvider(seed);
      const heightCache = getHeightQueryCache();
      heightCache.setProvider(noiseProvider);

      Logger.info('engine-init', `Procedural terrain seed: ${seed}`);
    }

    applyCompiledTerrainFeatures(engine, config);

    // Initialize navmesh WASM (non-blocking, degrades gracefully)
    if (!engine.systemManager.navmeshSystem.isReady()) {
      await engine.systemManager.navmeshSystem.init();
    }

    // Configure renderer for mode-specific settings
    if (config.cameraFar || config.fogDensity || config.shadowFar) {
      engine.renderer.configureForWorldSize({
        cameraFar: config.cameraFar,
        fogDensity: config.fogDensity,
        shadowFar: config.shadowFar
      });
    }

    const terrainSystem = engine.systemManager.terrainSystem;
    const previousWorldSize = terrainSystem.getPlayableWorldSize();
    const targetWorldSize = config.worldSize ?? previousWorldSize;
    const worldSizeChanged = targetWorldSize !== previousWorldSize;

    if (config.worldSize) {
      terrainSystem.setWorldSize(config.worldSize);
      engine.systemManager.playerController.setWorldSize(config.worldSize);
    }
    terrainSystem.setVisualMargin(config.visualMargin ?? 200);

    // Reconfigure chunk size if mode specifies a different value
    if (config.chunkSize && config.chunkSize !== terrainSystem.getChunkSize()) {
      terrainSystem.setChunkSize(config.chunkSize);
    }

    // Update render distance if mode specifies it
    if (config.chunkRenderDistance) {
      terrainSystem.setRenderDistance(config.chunkRenderDistance);
    }

    // Re-bake heightmap with the new provider (seed or DEM) if world size
    // didn't change (reconfigureWorld handles the case where it did).
    if (!worldSizeChanged) {
      terrainSystem.rebakeHeightmap();
    }

    const defaultBiome = config.terrain?.defaultBiome ?? 'denseJungle';
    terrainSystem.setBiomeConfig(defaultBiome, config.terrain?.biomeRules);

    // Generate navmesh after terrain height provider and stamps are finalized
    if (engine.systemManager.navmeshSystem.isWasmReady()) {
      const navWorldSize = config.worldSize ?? terrainSystem.getPlayableWorldSize();
      await engine.systemManager.navmeshSystem.generateNavmesh(navWorldSize, config.features);
    }

    engine.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
    applyLaunchSelection(engine, definition, launchSelection);

    // Load persisted war state if available (A Shau Valley mode)
    if (config.warSimulator?.enabled && engine.systemManager.warSimulator.isEnabled()) {
      const persistence = new PersistenceSystem();
      const existingSave = persistence.getAutoSave(mode);
      if (existingSave) {
        Logger.info('engine-init', `Restoring war state: ${existingSave.agents.length} agents, ${existingSave.elapsedTime.toFixed(0)}s elapsed`);
        engine.systemManager.warSimulator.loadWarState(existingSave);
      }
    }

    const initialDeployPosition = await resolveInitialDeployPosition(engine, definition, launchSelection);

    // Pre-generate around the player's actual chosen insertion point rather than
    // a guessed default so startup work matches the selected route.
    const spawnPos = initialDeployPosition.clone();
    spawnPos.y = 5;
    await engine.systemManager.preGenerateSpawnArea(spawnPos);
    markStartup(`engine-init.start-game.${mode}.post-pre-generate`);

    applyConfiguredLoadout(engine);
    startGame(engine, initialDeployPosition);
    markStartup(`engine-init.start-game.${mode}.end`);
  } catch (error) {
    if (error instanceof InitialDeployCancelledError) {
      engine.gameStartPending = false;
      engine.gameStarted = false;
      engine.loadingScreen.showMainMenu();
      Logger.info('engine-init', 'Initial deploy cancelled; returned to mode selection');
      return;
    }

    engine.gameStartPending = false;
    engine.gameStarted = false;
    engine.loadingScreen.cancelGameLaunch();
    Logger.error('engine-init', 'Failed to start game mode:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while preparing the selected mode.';
    engine.loadingScreen.showError('Mode Startup Failed', errorMessage);
  }
}

async function resolveInitialDeployPosition(
  engine: GameEngine,
  definition: GameModeDefinition,
  launchSelection: GameLaunchSelection
): Promise<THREE.Vector3> {
  if (engine.sandboxEnabled && engine.sandboxConfig?.autoStart) {
    return resolveModeSpawnPosition(definition, launchSelection.alliance);
  }

  try {
    return await engine.systemManager.playerRespawnManager.beginInitialDeploy();
  } catch (error) {
    if (error instanceof InitialDeployCancelledError) {
      throw error;
    }
    Logger.warn('engine-init', 'Initial deploy flow unavailable, using mode spawn fallback', error);
    return resolveModeSpawnPosition(definition, launchSelection.alliance);
  }
}

function applyConfiguredLoadout(engine: GameEngine): void {
  engine.systemManager.loadoutService.applyToRuntime({
    inventoryManager: engine.systemManager.inventoryManager,
    firstPersonWeapon: engine.systemManager.firstPersonWeapon,
    grenadeSystem: engine.systemManager.grenadeSystem
  });
  Logger.info('engine-init', 'Configured deploy loadout applied');
}

/**
 * Main game start logic, pointer lock, shader compilation, and spawn positioning
 */
export function startGame(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): void {
  if (engine.gameStarted) return;
  engine.gameStarted = true;
  engine.gameStartPending = false;
  if (engine.sandboxEnabled) {
    engine.systemManager.playerController.setPointerLockEnabled(false);
  }

  void runStartupFlow(engine, initialSpawnPosition);

  engine.renderer.showCrosshair();
  if (!engine.sandboxEnabled) showWelcomeMessage(engine);

  // Apply FPS overlay visibility from settings
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

async function runStartupFlow(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): Promise<void> {
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
    const pos = initialSpawnPosition?.clone() ?? resolveModeSpawnPosition(definition, loadoutContext.alliance);
    pos.y = terrainSystem.getEffectiveHeightAt(pos.x, pos.z) + 2;
    const reason = definition.policies.respawn.initialSpawnRule === 'origin'
      ? 'startup.spawn.sandbox'
      : 'startup.spawn.mode-hq';
    engine.systemManager.playerController.setPosition(pos, reason);
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
