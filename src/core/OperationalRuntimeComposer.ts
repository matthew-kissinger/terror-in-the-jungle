import { getHeightQueryCache, type HeightQueryCache } from '../systems/terrain/HeightQueryCache';
import type { SystemKeyToType } from './SystemRegistry';

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
  | 'helicopterModel'
  | 'helipadSystem'
  | 'hudSystem'
  | 'influenceMapSystem'
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
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'globalBillboardSystem'
    | 'grenadeSystem'
    | 'helicopterModel'
    | 'helipadSystem'
    | 'hudSystem'
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

interface OperationalRuntimeOptions {
  heightQueryCache?: HeightQueryCache;
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
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      globalBillboardSystem: refs.globalBillboardSystem,
      grenadeSystem: refs.grenadeSystem,
      helicopterModel: refs.helicopterModel,
      helipadSystem: refs.helipadSystem,
      hudSystem: refs.hudSystem,
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

export function wireOperationalRuntime(
  groups: OperationalRuntimeGroups,
  options: OperationalRuntimeOptions = {}
): void {
  wireStrategyRuntime(groups.strategyRuntime);
  wireVehicleRuntime(groups.vehicleRuntime, options.heightQueryCache ?? getHeightQueryCache());
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
  heightQueryCache: HeightQueryCache
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
      heightQueryCache,
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
    runtime.helicopterModel.setHeightQueryCache(heightQueryCache);
    runtime.helicopterModel.setVehicleManager(runtime.vehicleManager);
  }

  if (typeof runtime.worldFeatureSystem.configureDependencies === 'function') {
    runtime.worldFeatureSystem.configureDependencies({
      terrainManager: runtime.terrainSystem,
      gameModeManager: runtime.gameModeManager,
    });
  } else {
    runtime.worldFeatureSystem.setTerrainManager(runtime.terrainSystem);
    runtime.worldFeatureSystem.setGameModeManager(runtime.gameModeManager);
  }

  runtime.npcVehicleController.setVehicleManager(runtime.vehicleManager);
  runtime.npcVehicleController.setCombatantProvider(() => runtime.combatantSystem.combatants);
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
