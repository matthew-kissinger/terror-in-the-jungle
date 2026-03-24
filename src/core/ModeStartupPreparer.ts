import * as THREE from 'three';
import { GameLaunchSelection, GameMode, GameModeDefinition } from '../config/gameModeTypes';
import { getGameModeConfig } from '../config/gameModes';
import { getGameModeDefinition, resolveLaunchSelection } from '../config/gameModeDefinitions';
import { pickRandomVariant } from '../config/MapSeedRegistry';
import { BakedHeightProvider } from '../systems/terrain/BakedHeightProvider';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { DEMHeightProvider } from '../systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../systems/terrain/NoiseHeightProvider';
import { compileTerrainFeatures } from '../systems/terrain/TerrainFeatureCompiler';
import { StampedHeightProvider } from '../systems/terrain/StampedHeightProvider';
import { bakeStampedHeightmapGrid } from '../systems/terrain/TerrainStampGridBaker';
import type { CompiledTerrainFeatureSet } from '../systems/terrain/TerrainFeatureTypes';
import type { PreparedHeightmapGrid, PreparedTerrainSource } from '../systems/terrain/PreparedTerrainSource';
import { Logger } from '../utils/Logger';
import { Alliance, Faction } from '../systems/combat/types';
// shouldUseTouchControls + orientation lock removed - layout works in any orientation
import { PersistenceSystem } from '../systems/strategy/PersistenceSystem';
import type { GameEngine } from './GameEngine';
import { GameEventBus } from './GameEventBus';
import { markStartup } from './StartupTelemetry';

/** Yield to the browser so it can repaint (progress bar, etc.) between heavy sync phases. */
function yieldToRenderer(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

interface PreparedModeStartup {
  mode: GameMode;
  launchSelection: GameLaunchSelection;
  definition: GameModeDefinition;
  config: ReturnType<typeof getGameModeConfig>;
}

const FACTION_DISPLAY_NAMES: Record<Faction, string> = {
  [Faction.US]: 'US Forces',
  [Faction.ARVN]: 'ARVN',
  [Faction.NVA]: 'NVA',
  [Faction.VC]: 'Viet Cong',
};

interface CompiledStartupTerrainFeatures {
  compiledFeatures: CompiledTerrainFeatureSet;
  preparedTerrainSource: PreparedTerrainSource;
}

function compileStartupTerrainFeatures(
  config: ReturnType<typeof getGameModeConfig>,
  preparedTerrainSource: PreparedTerrainSource,
): CompiledStartupTerrainFeatures {
  const heightCache = getHeightQueryCache();
  const baseProvider = heightCache.getProvider();
  const compiledFeatures = compileTerrainFeatures(
    config,
    (x, z) => heightCache.getHeightAt(x, z),
  );

  if (compiledFeatures.stamps.length > 0) {
    heightCache.setProvider(new StampedHeightProvider(baseProvider, compiledFeatures.stamps));
    if (preparedTerrainSource.preparedHeightmap) {
      preparedTerrainSource = {
        ...preparedTerrainSource,
        preparedHeightmap: bakeStampedPreparedHeightmap(
          preparedTerrainSource.preparedHeightmap,
          config.worldSize,
          baseProvider,
          compiledFeatures.stamps,
        ),
      };
    }
  }

  return { compiledFeatures, preparedTerrainSource };
}

async function applyCompiledTerrainFeatures(
  engine: GameEngine,
  compiledFeatures: CompiledTerrainFeatureSet,
  emitProgress: (phase: string, progress: number, label: string) => void,
): Promise<void> {
  engine.systemManager.minimapSystem.setTerrainFlowPaths(compiledFeatures.flowPaths);
  engine.systemManager.fullMapSystem.setTerrainFlowPaths(compiledFeatures.flowPaths);
  engine.systemManager.fullMapSystem.setTerrainRuntime(engine.systemManager.terrainSystem);

  // Use async path - yields between vegetation cell batches to avoid blocking main thread
  await engine.systemManager.terrainSystem.setTerrainFeaturesAsync(
    compiledFeatures,
    (done, total) => {
      emitProgress('vegetation', done / total, `Placing vegetation (${done}/${total})...`);
    },
  );
}

function bakeStampedPreparedHeightmap(
  preparedHeightmap: PreparedHeightmapGrid,
  worldSize: number,
  baseProvider: Parameters<typeof bakeStampedHeightmapGrid>[3],
  stamps: CompiledTerrainFeatureSet['stamps'],
): PreparedHeightmapGrid {
  return {
    ...preparedHeightmap,
    data: bakeStampedHeightmapGrid(
      preparedHeightmap.data,
      preparedHeightmap.gridSize,
      worldSize,
      baseProvider,
      stamps,
    ),
  };
}

function resolveFactionLabels(definition: GameModeDefinition): { blufor: string; opfor: string } {
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

  const labels = resolveFactionLabels(definition);
  engine.systemManager.hudSystem.setFactionLabels(labels.blufor, labels.opfor);
}

export async function configureHeightSource(
  _engine: GameEngine,
  mode: GameMode,
  config: ReturnType<typeof getGameModeConfig>
): Promise<PreparedTerrainSource> {
  markStartup(`engine-init.start-game.${mode}.height-source.begin`);
  if (config.heightSource?.type === 'dem') {
    markStartup(`engine-init.start-game.${mode}.dem-load.begin`);
    Logger.info('engine-init', `Loading DEM terrain from ${config.heightSource.path}...`);
    try {
      const response = await fetch(config.heightSource.path);
      if (!response.ok) {
        throw new Error(`DEM fetch failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const demProvider = new DEMHeightProvider(
        new Float32Array(buffer),
        config.heightSource.width,
        config.heightSource.height,
        config.heightSource.metersPerPixel
      );
      getHeightQueryCache().setProvider(demProvider);
      Logger.info(
        'engine-init',
        `DEM loaded: ${config.heightSource.width}x${config.heightSource.height}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`
      );
    } catch (error) {
      Logger.error('engine-init', 'Failed to load DEM terrain:', error);
    }
    markStartup(`engine-init.start-game.${mode}.dem-load.end`);
    markStartup(`engine-init.start-game.${mode}.height-source.end`);
    return { kind: 'dem' };
  }

  // Try seed rotation: pick a random pre-baked variant if available
  const variant = pickRandomVariant(mode);
  if (variant) {
    // Override config's fixed seed/asset paths with the selected variant
    config.terrainSeed = variant.seed;
    config.navmeshAsset = variant.navmeshAsset;
    config.heightmapAsset = variant.heightmapAsset;
    Logger.info('engine-init', `Selected map variant: seed=${variant.seed}`);
  }

  // Try loading a pre-baked heightmap
  if (config.heightmapAsset) {
    try {
      const response = await fetch(config.heightmapAsset);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const gridData = new Float32Array(buffer);
        const gridSize = Math.round(Math.sqrt(gridData.length));
        if (gridSize * gridSize !== gridData.length) {
          throw new Error(`Heightmap asset is not a square grid: ${gridData.length} samples`);
        }
        const seed = typeof config.terrainSeed === 'number' ? config.terrainSeed : 42;
        const workerConfig = new NoiseHeightProvider(seed).getWorkerConfig();
        getHeightQueryCache().setProvider(
          new BakedHeightProvider(gridData, gridSize, config.worldSize, workerConfig),
        );
        Logger.info('engine-init', `Pre-baked heightmap loaded: ${gridSize}x${gridSize} (${(buffer.byteLength / 1024).toFixed(0)}KB), seed=${seed}`);
        markStartup(`engine-init.start-game.${mode}.height-source.end`);
        return {
          kind: 'prebaked',
          preparedHeightmap: {
            data: gridData,
            gridSize,
            workerConfig,
          },
        };
      }
      Logger.warn('engine-init', `Pre-baked heightmap not found (${response.status}), falling back to procedural`);
    } catch (error) {
      Logger.warn('engine-init', 'Failed to fetch pre-baked heightmap, falling back to procedural:', error);
    }
  }

  const seedConfig = config.terrainSeed;
  const seed = seedConfig === 'random' || seedConfig === undefined
    ? Math.floor(Math.random() * 2147483647)
    : seedConfig;

  getHeightQueryCache().setProvider(new NoiseHeightProvider(seed));
  Logger.info('engine-init', `Procedural terrain seed: ${seed}`);
  markStartup(`engine-init.start-game.${mode}.height-source.end`);
  return { kind: 'procedural' };
}

async function configureTerrainAndNavigation(
  engine: GameEngine,
  config: ReturnType<typeof getGameModeConfig>,
  preparedTerrainSource: PreparedTerrainSource,
): Promise<void> {
  markStartup(`engine-init.start-game.${config.id}.terrain-config.begin`);
  if (!engine.systemManager.navmeshSystem.isReady()) {
    const hasPrebakedAsset = !!config.navmeshAsset;
    await engine.systemManager.navmeshSystem.init(hasPrebakedAsset);
  }

  if (config.cameraFar || config.fogDensity || config.shadowFar) {
    engine.renderer.configureForWorldSize({
      cameraFar: config.cameraFar,
      fogDensity: config.fogDensity,
      shadowFar: config.shadowFar,
    });
  }

  const terrainSystem = engine.systemManager.terrainSystem;
  terrainSystem.setPreparedHeightmap(preparedTerrainSource.preparedHeightmap ?? null);
  const previousWorldSize = terrainSystem.getPlayableWorldSize();
  const targetWorldSize = config.worldSize ?? previousWorldSize;
  const worldSizeChanged = targetWorldSize !== previousWorldSize;

  if (config.worldSize) {
    terrainSystem.setWorldSize(config.worldSize);
    engine.systemManager.playerController.setWorldSize(config.worldSize);
  }
  terrainSystem.setVisualMargin(config.visualMargin ?? 200);

  if (config.chunkSize && config.chunkSize !== terrainSystem.getChunkSize()) {
    terrainSystem.setChunkSize(config.chunkSize);
  }
  if (config.chunkRenderDistance) {
    terrainSystem.setRenderDistance(config.chunkRenderDistance);
  }
  if (!worldSizeChanged) {
    terrainSystem.rebakeHeightmap();
  }

  const defaultBiome = config.terrain?.defaultBiome ?? 'denseJungle';
  terrainSystem.setBiomeConfig(defaultBiome, config.terrain?.biomeRules);
  markStartup(`engine-init.start-game.${config.id}.terrain-config.end`);

  if (engine.systemManager.navmeshSystem.isWasmReady()) {
    const navWorldSize = config.worldSize ?? terrainSystem.getPlayableWorldSize();
    // Yield before WASM navmesh generation so the progress bar renders "Generating navigation mesh..."
    await yieldToRenderer();
    markStartup(`engine-init.start-game.${config.id}.navmesh.begin`);
    await engine.systemManager.navmeshSystem.generateNavmesh(navWorldSize, config.features, config.navmeshAsset);
    markStartup(`engine-init.start-game.${config.id}.navmesh.end`);

    // Validate navmesh connectivity using representative home bases (not all-pairs).
    // For 16 zones, all-pairs requires up to 120 path queries. Home-base check needs 1-2.
    if (config.zones?.length && engine.systemManager.navmeshSystem.isReady()) {
      const heightCache = getHeightQueryCache();
      const homeBases = config.zones.filter(z => z.isHomeBase);

      // If no home bases defined, fall back to first and last zone as representatives
      const representatives = homeBases.length >= 2
        ? homeBases
        : [config.zones[0], config.zones[config.zones.length - 1]];

      const repPositions = representatives.map(z => {
        const y = heightCache.getHeightAt(z.position.x, z.position.z);
        return new THREE.Vector3(z.position.x, y, z.position.z);
      });

      const result = engine.systemManager.navmeshSystem.validateConnectivity(repPositions);
      if (!result.connected) {
        const repNames = representatives.map(z => z.name);
        for (const island of result.islands) {
          const names = island.map(i => repNames[i]).join(', ');
          Logger.warn('Navigation', `Disconnected home bases: [${names}]`);
        }
      }
    }
  }
}

function restorePersistentWarState(
  engine: GameEngine,
  mode: GameMode,
  config: ReturnType<typeof getGameModeConfig>
): void {
  if (!config.warSimulator?.enabled || !engine.systemManager.warSimulator.isEnabled()) {
    return;
  }

  const persistence = new PersistenceSystem();
  const existingSave = persistence.getAutoSave(mode);
  if (!existingSave) {
    return;
  }

  Logger.info(
    'engine-init',
    `Restoring war state: ${existingSave.agents.length} agents, ${existingSave.elapsedTime.toFixed(0)}s elapsed`
  );
  engine.systemManager.warSimulator.loadWarState(existingSave);
}

export function normalizeLaunchSelection(
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

/**
 * @lintignore Lazy-loaded by the startup pipeline; Knip does not resolve this dynamic import path.
 */
export async function prepareModeStartup(
  engine: GameEngine,
  launchSelection: GameLaunchSelection
): Promise<PreparedModeStartup> {
  const mode = launchSelection.mode;
  // Don't force landscape - let user choose orientation.
  // Fullscreen is requested on START tap; layout works in any orientation.

  const definition = getGameModeDefinition(mode);
  const config = { ...getGameModeConfig(mode) };

  const emitProgress = (phase: string, progress: number, label: string): void => {
    GameEventBus.emit('mode_load_progress', { phase, progress, label });
    GameEventBus.flush();
  };

  emitProgress('terrain', 0, 'Loading terrain...');
  const preparedTerrainSource = await configureHeightSource(engine, mode, config);
  emitProgress('terrain', 1, 'Terrain loaded');
  await yieldToRenderer();

  emitProgress('features', 0, 'Compiling features...');
  markStartup(`engine-init.start-game.${mode}.terrain-features.compile.begin`);
  const startupTerrain = compileStartupTerrainFeatures(config, preparedTerrainSource);
  markStartup(`engine-init.start-game.${mode}.terrain-features.compile.end`);
  emitProgress('features', 1, 'Features compiled');
  await yieldToRenderer();

  emitProgress('world', 0, 'Preparing world...');
  emitProgress('navmesh', 0, 'Loading navigation...');
  await configureTerrainAndNavigation(engine, config, startupTerrain.preparedTerrainSource);
  emitProgress('world', 1, 'World ready');
  emitProgress('navmesh', 1, 'Navigation ready');
  await yieldToRenderer();

  emitProgress('vegetation', 0, 'Applying terrain features...');
  markStartup(`engine-init.start-game.${mode}.terrain-features.apply.begin`);
  await applyCompiledTerrainFeatures(engine, startupTerrain.compiledFeatures, emitProgress);
  markStartup(`engine-init.start-game.${mode}.terrain-features.apply.end`);
  emitProgress('vegetation', 1, 'Terrain features ready');
  await yieldToRenderer();

  emitProgress('spawning', 0, 'Spawning combatants...');
  markStartup(`engine-init.start-game.${mode}.set-game-mode.begin`);
  engine.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
  markStartup(`engine-init.start-game.${mode}.set-game-mode.end`);
  applyLaunchSelection(engine, definition, launchSelection);
  emitProgress('spawning', 1, 'Combatants spawned');
  await yieldToRenderer();

  emitProgress('finalize', 0, 'Finalizing...');
  restorePersistentWarState(engine, mode, config);
  emitProgress('finalize', 1, 'Ready');

  return {
    mode,
    launchSelection,
    definition,
    config,
  };
}
