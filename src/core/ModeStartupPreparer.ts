import { GameLaunchSelection, GameMode, GameModeDefinition } from '../config/gameModeTypes';
import { getGameModeConfig } from '../config/gameModes';
import { getGameModeDefinition, resolveLaunchSelection } from '../config/gameModeDefinitions';
import { getHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { DEMHeightProvider } from '../systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../systems/terrain/NoiseHeightProvider';
import { compileTerrainFeatures } from '../systems/terrain/TerrainFeatureCompiler';
import { StampedHeightProvider } from '../systems/terrain/StampedHeightProvider';
import { Logger } from '../utils/Logger';
import { Alliance, Faction } from '../systems/combat/types';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { tryLockLandscapeOrientation } from '../utils/Orientation';
import { PersistenceSystem } from '../systems/strategy/PersistenceSystem';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';

export interface PreparedModeStartup {
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

function applyCompiledTerrainFeatures(engine: GameEngine, config: ReturnType<typeof getGameModeConfig>): void {
  const compiledFeatures = compileTerrainFeatures(config);
  engine.systemManager.terrainSystem.setTerrainFeatures(compiledFeatures);

  if (compiledFeatures.stamps.length === 0) {
    return;
  }

  const heightCache = getHeightQueryCache();
  heightCache.setProvider(new StampedHeightProvider(heightCache.getProvider(), compiledFeatures.stamps));
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

async function configureHeightSource(
  engine: GameEngine,
  mode: GameMode,
  config: ReturnType<typeof getGameModeConfig>
): Promise<void> {
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
    return;
  }

  const seedConfig = config.terrainSeed;
  const seed = seedConfig === 'random' || seedConfig === undefined
    ? Math.floor(Math.random() * 2147483647)
    : seedConfig;

  getHeightQueryCache().setProvider(new NoiseHeightProvider(seed));
  Logger.info('engine-init', `Procedural terrain seed: ${seed}`);
}

async function configureTerrainAndNavigation(
  engine: GameEngine,
  config: ReturnType<typeof getGameModeConfig>
): Promise<void> {
  if (!engine.systemManager.navmeshSystem.isReady()) {
    await engine.systemManager.navmeshSystem.init();
  }

  if (config.cameraFar || config.fogDensity || config.shadowFar) {
    engine.renderer.configureForWorldSize({
      cameraFar: config.cameraFar,
      fogDensity: config.fogDensity,
      shadowFar: config.shadowFar,
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

  if (engine.systemManager.navmeshSystem.isWasmReady()) {
    const navWorldSize = config.worldSize ?? terrainSystem.getPlayableWorldSize();
    await engine.systemManager.navmeshSystem.generateNavmesh(navWorldSize, config.features);
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

export async function prepareModeStartup(
  engine: GameEngine,
  launchSelection: GameLaunchSelection
): Promise<PreparedModeStartup> {
  const mode = launchSelection.mode;
  if (shouldUseTouchControls()) {
    tryLockLandscapeOrientation();
  }

  const definition = getGameModeDefinition(mode);
  const config = getGameModeConfig(mode);

  await configureHeightSource(engine, mode, config);
  applyCompiledTerrainFeatures(engine, config);
  await configureTerrainAndNavigation(engine, config);

  engine.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
  applyLaunchSelection(engine, definition, launchSelection);
  restorePersistentWarState(engine, mode, config);

  return {
    mode,
    launchSelection,
    definition,
    config,
  };
}
