import * as THREE from 'three';
import type { SystemKeyToType } from './SystemRegistry';
import { GameMode } from '../config/gameModeTypes';
import { Logger } from '../utils/Logger';
import type { M2HBScenarioMode } from '../systems/combat/weapons/M2HBEmplacementSpawn';
import type { M48ScenarioMode } from '../systems/vehicle/M48TankSpawn';

type OperationalRuntimeRefs = Pick<
  SystemKeyToType,
  | 'aaEmplacementSystem'
  | 'airSupportManager'
  | 'audioManager'
  | 'combatantSystem'
  | 'fullMapSystem'
  | 'gameModeManager'
  | 'globalBillboardSystem'
  | 'grenadeSystem'
  | 'fixedWingModel'
  | 'helicopterModel'
  | 'helipadSystem'
  | 'hudSystem'
  | 'influenceMapSystem'
  | 'm2hbEmplacementSystem'
  | 'minimapSystem'
  | 'npcVehicleController'
  | 'playerController'
  | 'strategicFeedback'
  | 'terrainSystem'
  | 'ticketSystem'
  | 'vehicleManager'
  | 'warSimulator'
  | 'worldFeatureSystem'
  | 'zoneManager'
>;

interface OperationalRuntimeGroups {
  strategyRuntime: Pick<
    OperationalRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'hudSystem'
    | 'influenceMapSystem'
    | 'minimapSystem'
    | 'strategicFeedback'
    | 'ticketSystem'
    | 'warSimulator'
    | 'zoneManager'
  >;
  vehicleRuntime: Pick<
    OperationalRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'fixedWingModel'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'globalBillboardSystem'
    | 'grenadeSystem'
    | 'helicopterModel'
    | 'helipadSystem'
    | 'hudSystem'
    | 'm2hbEmplacementSystem'
    | 'minimapSystem'
    | 'npcVehicleController'
    | 'playerController'
    | 'terrainSystem'
    | 'vehicleManager'
    | 'worldFeatureSystem'
  >;
  airSupportRuntime: Pick<
    OperationalRuntimeRefs,
    | 'aaEmplacementSystem'
    | 'airSupportManager'
    | 'audioManager'
    | 'combatantSystem'
    | 'grenadeSystem'
    | 'helicopterModel'
    | 'hudSystem'
    | 'playerController'
    | 'terrainSystem'
  >;
}

export function createOperationalRuntimeGroups(
  refs: OperationalRuntimeRefs
): OperationalRuntimeGroups {
  return {
    strategyRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      hudSystem: refs.hudSystem,
      influenceMapSystem: refs.influenceMapSystem,
      minimapSystem: refs.minimapSystem,
      strategicFeedback: refs.strategicFeedback,
      ticketSystem: refs.ticketSystem,
      warSimulator: refs.warSimulator,
      zoneManager: refs.zoneManager,
    },
    vehicleRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      fixedWingModel: refs.fixedWingModel,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      globalBillboardSystem: refs.globalBillboardSystem,
      grenadeSystem: refs.grenadeSystem,
      helicopterModel: refs.helicopterModel,
      helipadSystem: refs.helipadSystem,
      hudSystem: refs.hudSystem,
      m2hbEmplacementSystem: refs.m2hbEmplacementSystem,
      minimapSystem: refs.minimapSystem,
      npcVehicleController: refs.npcVehicleController,
      playerController: refs.playerController,
      terrainSystem: refs.terrainSystem,
      vehicleManager: refs.vehicleManager,
      worldFeatureSystem: refs.worldFeatureSystem,
    },
    airSupportRuntime: {
      aaEmplacementSystem: refs.aaEmplacementSystem,
      airSupportManager: refs.airSupportManager,
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      grenadeSystem: refs.grenadeSystem,
      helicopterModel: refs.helicopterModel,
      hudSystem: refs.hudSystem,
      playerController: refs.playerController,
      terrainSystem: refs.terrainSystem,
    },
  };
}

export interface OperationalRuntimeOptions {
  scene: THREE.Scene;
}

export function wireOperationalRuntime(
  groups: OperationalRuntimeGroups,
  options: OperationalRuntimeOptions = { scene: undefined as unknown as THREE.Scene }
): void {
  wireStrategyRuntime(groups.strategyRuntime);
  wireVehicleRuntime(groups.vehicleRuntime, options);
  wireAirSupportRuntime(groups.airSupportRuntime);
}

function wireStrategyRuntime(runtime: OperationalRuntimeGroups['strategyRuntime']): void {
  runtime.warSimulator.setCombatantSystem(runtime.combatantSystem);
  runtime.warSimulator.setZoneManager(runtime.zoneManager);
  runtime.warSimulator.setTicketSystem(runtime.ticketSystem);
  runtime.warSimulator.setInfluenceMap(runtime.influenceMapSystem);

  runtime.strategicFeedback.setWarSimulator(runtime.warSimulator);
  runtime.strategicFeedback.setHUDSystem(runtime.hudSystem);
  runtime.strategicFeedback.setAudioManager(runtime.audioManager);

  runtime.gameModeManager.setWarSimulator(runtime.warSimulator);
  runtime.minimapSystem.setWarSimulator(runtime.warSimulator);
  runtime.fullMapSystem.setWarSimulator(runtime.warSimulator);
}

function wireVehicleRuntime(
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
  options: OperationalRuntimeOptions
): void {
  if (typeof runtime.helipadSystem.configureDependencies === 'function') {
    runtime.helipadSystem.configureDependencies({
      terrainManager: runtime.terrainSystem,
      vegetationSystem: runtime.globalBillboardSystem,
      gameModeManager: runtime.gameModeManager,
    });
  } else {
    runtime.helipadSystem.setTerrainManager(runtime.terrainSystem);
    runtime.helipadSystem.setVegetationSystem(runtime.globalBillboardSystem);
    runtime.helipadSystem.setGameModeManager(runtime.gameModeManager);
  }
  runtime.helipadSystem.onHelipadsCreated((helipads) => {
    const markers = helipads.map(hp => ({ id: hp.id, position: hp.position }));
    runtime.minimapSystem.setHelipadMarkers(markers);
    runtime.fullMapSystem.setHelipadMarkers(markers);
  });

  if (typeof runtime.helicopterModel.configureDependencies === 'function') {
    runtime.helicopterModel.configureDependencies({
      terrainManager: runtime.terrainSystem,
      helipadSystem: runtime.helipadSystem,
      playerController: runtime.playerController,
      hudSystem: runtime.hudSystem,
      audioListener: runtime.audioManager.getListener(),
      audioManager: runtime.audioManager,
      combatantSystem: runtime.combatantSystem,
      grenadeSystem: runtime.grenadeSystem,
      squadDeployTerrain: runtime.terrainSystem,
      vehicleManager: runtime.vehicleManager,
    });
  } else {
    runtime.helicopterModel.setTerrainManager(runtime.terrainSystem);
    runtime.helicopterModel.setHelipadSystem(runtime.helipadSystem);
    runtime.helicopterModel.setPlayerController(runtime.playerController);
    runtime.helicopterModel.setHUDSystem(runtime.hudSystem);
    runtime.helicopterModel.setAudioListener(runtime.audioManager.getListener());
    runtime.helicopterModel.setAudioManager(runtime.audioManager);
    runtime.helicopterModel.setCombatantSystem(runtime.combatantSystem);
    runtime.helicopterModel.setGrenadeSystem(runtime.grenadeSystem);
    runtime.helicopterModel.setSquadDeployTerrain(runtime.terrainSystem);
    runtime.helicopterModel.setVehicleManager(runtime.vehicleManager);
  }

  if (typeof runtime.worldFeatureSystem.configureDependencies === 'function') {
    runtime.worldFeatureSystem.configureDependencies({
      terrainManager: runtime.terrainSystem,
      gameModeManager: runtime.gameModeManager,
      vehicleManager: runtime.vehicleManager,
    });
  } else {
    runtime.worldFeatureSystem.setTerrainManager(runtime.terrainSystem);
    runtime.worldFeatureSystem.setGameModeManager(runtime.gameModeManager);
    if (typeof runtime.worldFeatureSystem.setVehicleManager === 'function') {
      runtime.worldFeatureSystem.setVehicleManager(runtime.vehicleManager);
    }
  }
  // Give WorldFeatureSystem direct access to the LOS accelerator so spawned
  // buildings participate in aircraft terrain sweeps; ITerrainRuntime does
  // not expose the accelerator surface.
  if (typeof runtime.worldFeatureSystem.setLOSAccelerator === 'function'
    && typeof runtime.terrainSystem.getLOSAccelerator === 'function') {
    runtime.worldFeatureSystem.setLOSAccelerator(runtime.terrainSystem.getLOSAccelerator());
  }

  // Wire FixedWingModel
  runtime.fixedWingModel.setTerrainManager(runtime.terrainSystem);
  runtime.fixedWingModel.setPlayerController(runtime.playerController);
  runtime.fixedWingModel.setHUDSystem(runtime.hudSystem);
  runtime.fixedWingModel.setVehicleManager(runtime.vehicleManager);
  runtime.playerController.setFixedWingModel(runtime.fixedWingModel);
  runtime.worldFeatureSystem.setFixedWingModel(runtime.fixedWingModel);

  runtime.npcVehicleController.setVehicleManager(runtime.vehicleManager);
  runtime.npcVehicleController.setCombatantProvider(() => runtime.combatantSystem.combatants);

  wireM2HBEmplacementRuntime(runtime, options);
  wireM48TankRuntime(runtime, options);
}

// Maps GameMode -> the scenario-spawn key understood by
// `spawnScenarioM2HBEmplacements`. Modes absent from this table get no
// M2HB spawn (TDM, Zone Control, AI sandbox).
const M2HB_MODES_BY_GAMEMODE: Partial<Record<GameMode, M2HBScenarioMode>> = {
  [GameMode.OPEN_FRONTIER]: 'open_frontier',
  [GameMode.A_SHAU_VALLEY]: 'a_shau_valley',
};

function wireM2HBEmplacementRuntime(
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
  options: OperationalRuntimeOptions
): void {
  const m2hb = runtime.m2hbEmplacementSystem;
  if (!m2hb) return;
  const scene = options.scene;

  // Inject runtime dependencies for fire-path execution (raycast + audio).
  m2hb.setCombatantSystem(runtime.combatantSystem);
  m2hb.setAudioManager(runtime.audioManager);

  if (!scene) return;

  const spawnedModes = new Set<M2HBScenarioMode>();
  runtime.gameModeManager.onModeChanged((mode) => {
    const scenarioKey = M2HB_MODES_BY_GAMEMODE[mode];
    if (!scenarioKey) return;
    if (spawnedModes.has(scenarioKey)) return;
    // Reserve synchronously so a re-entrant mode-change in the same tick
    // (test harness scenario) does not queue a second deferred spawn.
    spawnedModes.add(scenarioKey);
    // Defer one frame so the per-mode terrain provider is hot before
    // resolvePosition runs `getHeightAt`. `prepareModeStartup` sets the
    // height provider before `setGameMode`, but tile-bound queries can
    // still be racing; the setTimeout(0) gives the chunk loader a tick.
    setTimeout(() => {
      try {
        const ids = runtime.vehicleManager.spawnScenarioM2HBEmplacements({
          scene,
          m2hbSystem: m2hb,
          modes: [scenarioKey],
          resolvePosition: (_m, base) => snapM2HBToTerrain(base, runtime.terrainSystem),
        });
        Logger.info('combat', `M2HB scenario spawn (${scenarioKey}): ${ids.join(', ')}`);
      } catch (error) {
        // Roll back the reservation so a manual re-trigger can retry.
        spawnedModes.delete(scenarioKey);
        Logger.warn('combat', `M2HB scenario spawn failed for ${scenarioKey}`, error);
      }
    }, 0);
  });
}

const _m2hbScratch = new THREE.Vector3();

function snapM2HBToTerrain(
  base: THREE.Vector3,
  terrainSystem: OperationalRuntimeGroups['vehicleRuntime']['terrainSystem'],
): THREE.Vector3 {
  _m2hbScratch.copy(base);
  if (typeof terrainSystem.getHeightAt === 'function') {
    const y = terrainSystem.getHeightAt(base.x, base.z);
    if (Number.isFinite(y)) _m2hbScratch.y = y;
  }
  return _m2hbScratch.clone();
}

// Maps GameMode -> the M48 scenario-spawn key. Same shape + same
// scenarios as the M2HB wiring above (the tank spawns ride alongside
// the emplacements, on Open Frontier US base + A Shau valley road).
const M48_MODES_BY_GAMEMODE: Partial<Record<GameMode, M48ScenarioMode>> = {
  [GameMode.OPEN_FRONTIER]: 'open_frontier',
  [GameMode.A_SHAU_VALLEY]: 'a_shau_valley',
};

function wireM48TankRuntime(
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
  options: OperationalRuntimeOptions
): void {
  const scene = options.scene;
  if (!scene) return;

  const spawnedModes = new Set<M48ScenarioMode>();
  runtime.gameModeManager.onModeChanged((mode) => {
    const scenarioKey = M48_MODES_BY_GAMEMODE[mode];
    if (!scenarioKey) return;
    if (spawnedModes.has(scenarioKey)) return;
    spawnedModes.add(scenarioKey);
    // Defer one frame so the per-mode terrain provider is hot before
    // resolvePosition runs `getHeightAt` — mirrors the M2HB wiring's
    // setTimeout(0) deferral above.
    setTimeout(() => {
      try {
        const ids = runtime.vehicleManager.spawnScenarioM48Tanks({
          scene,
          modes: [scenarioKey],
          resolvePosition: (_m, base) => snapM48ToTerrain(base, runtime.terrainSystem),
        });
        Logger.info('vehicle', `M48 tank scenario spawn (${scenarioKey}): ${ids.join(', ')}`);
      } catch (error) {
        // Roll back the reservation so a manual re-trigger can retry.
        spawnedModes.delete(scenarioKey);
        Logger.warn('vehicle', `M48 tank scenario spawn failed for ${scenarioKey}`, error);
      }
    }, 0);
  });
}

const _m48Scratch = new THREE.Vector3();

function snapM48ToTerrain(
  base: THREE.Vector3,
  terrainSystem: OperationalRuntimeGroups['vehicleRuntime']['terrainSystem'],
): THREE.Vector3 {
  _m48Scratch.copy(base);
  if (typeof terrainSystem.getHeightAt === 'function') {
    const y = terrainSystem.getHeightAt(base.x, base.z);
    if (Number.isFinite(y)) _m48Scratch.y = y;
  }
  return _m48Scratch.clone();
}

function wireAirSupportRuntime(runtime: OperationalRuntimeGroups['airSupportRuntime']): void {
  const explosionEffectsPool = runtime.combatantSystem.explosionEffectsPool;
  if (typeof runtime.airSupportManager.configureDependencies === 'function') {
    runtime.airSupportManager.configureDependencies({
      combatantSystem: runtime.combatantSystem,
      grenadeSystem: runtime.grenadeSystem,
      audioManager: runtime.audioManager,
      hudSystem: runtime.hudSystem,
      terrainSystem: runtime.terrainSystem,
      explosionEffectsPool,
    });
  } else {
    runtime.airSupportManager.setCombatantSystem(runtime.combatantSystem);
    runtime.airSupportManager.setGrenadeSystem(runtime.grenadeSystem);
    runtime.airSupportManager.setAudioManager(runtime.audioManager);
    runtime.airSupportManager.setHUDSystem(runtime.hudSystem);
    runtime.airSupportManager.setTerrainSystem(runtime.terrainSystem);

    if (explosionEffectsPool) {
      runtime.airSupportManager.setExplosionEffectsPool(explosionEffectsPool);
    }
  }

  runtime.playerController.configureVehicleController({ airSupportManager: runtime.airSupportManager });

  runtime.aaEmplacementSystem.setHelicopterModel(runtime.helicopterModel);
  runtime.aaEmplacementSystem.setAudioManager(runtime.audioManager);
  runtime.aaEmplacementSystem.setTerrainSystem(runtime.terrainSystem);
  if (explosionEffectsPool) {
    runtime.aaEmplacementSystem.setExplosionEffectsPool(explosionEffectsPool);
  }
}
