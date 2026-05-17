import * as THREE from 'three';
import { setSmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import { createNpcWaterSamplerAdapter } from '../systems/combat/npcWaterSamplerAdapter';
import { IGameRenderer } from '../types/SystemInterfaces';
import type { SystemKeyToType } from './SystemRegistry';

type GameplayRuntimeRefs = Pick<
  SystemKeyToType,
  | 'ammoSupplySystem'
  | 'atmosphereSystem'
  | 'audioManager'
  | 'combatantSystem'
  | 'firstPersonWeapon'
  | 'flashbangScreenEffect'
  | 'fullMapSystem'
  | 'gameModeManager'
  | 'grenadeSystem'
  | 'hudSystem'
  | 'influenceMapSystem'
  | 'inventoryManager'
  | 'minimapSystem'
  | 'mortarSystem'
  | 'playerController'
  | 'playerHealthSystem'
  | 'playerRespawnManager'
  | 'playerSuppressionSystem'
  | 'sandbagSystem'
  | 'smokeCloudSystem'
  | 'spatialGridManager'
  | 'terrainSystem'
  | 'ticketSystem'
  | 'weatherSystem'
  | 'waterSystem'
  | 'zoneManager'
>;

interface GameplayRuntimeGroups {
  combatRuntime: Pick<
    GameplayRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'flashbangScreenEffect'
    | 'gameModeManager'
    | 'hudSystem'
    | 'influenceMapSystem'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerSuppressionSystem'
    | 'sandbagSystem'
    | 'smokeCloudSystem'
    | 'terrainSystem'
    | 'ticketSystem'
    | 'zoneManager'
  >;
  worldRuntime: Pick<
    GameplayRuntimeRefs,
    | 'combatantSystem'
    | 'firstPersonWeapon'
    | 'hudSystem'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'spatialGridManager'
    | 'terrainSystem'
    | 'ticketSystem'
    | 'zoneManager'
  >;
  weaponRuntime: Pick<
    GameplayRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'flashbangScreenEffect'
    | 'grenadeSystem'
    | 'inventoryManager'
    | 'mortarSystem'
    | 'playerController'
    | 'sandbagSystem'
    | 'ticketSystem'
  >;
  gameModeRuntime: Pick<
    GameplayRuntimeRefs,
    | 'ammoSupplySystem'
    | 'combatantSystem'
    | 'firstPersonWeapon'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'hudSystem'
    | 'influenceMapSystem'
    | 'inventoryManager'
    | 'minimapSystem'
    | 'playerController'
    | 'playerRespawnManager'
    | 'terrainSystem'
    | 'ticketSystem'
    | 'zoneManager'
  >;
  environmentRuntime: Pick<
    GameplayRuntimeRefs,
    | 'atmosphereSystem'
    | 'audioManager'
    | 'combatantSystem'
    | 'weatherSystem'
    | 'waterSystem'
  >;
}

interface GameplayRuntimeOptions {
  camera: THREE.PerspectiveCamera;
  renderer?: IGameRenderer;
}

export function createGameplayRuntimeGroups(
  refs: GameplayRuntimeRefs
): GameplayRuntimeGroups {
  return {
    combatRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      flashbangScreenEffect: refs.flashbangScreenEffect,
      gameModeManager: refs.gameModeManager,
      hudSystem: refs.hudSystem,
      influenceMapSystem: refs.influenceMapSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerSuppressionSystem: refs.playerSuppressionSystem,
      sandbagSystem: refs.sandbagSystem,
      smokeCloudSystem: refs.smokeCloudSystem,
      terrainSystem: refs.terrainSystem,
      ticketSystem: refs.ticketSystem,
      zoneManager: refs.zoneManager,
    },
    worldRuntime: {
      combatantSystem: refs.combatantSystem,
      firstPersonWeapon: refs.firstPersonWeapon,
      hudSystem: refs.hudSystem,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      spatialGridManager: refs.spatialGridManager,
      terrainSystem: refs.terrainSystem,
      ticketSystem: refs.ticketSystem,
      zoneManager: refs.zoneManager,
    },
    weaponRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      flashbangScreenEffect: refs.flashbangScreenEffect,
      grenadeSystem: refs.grenadeSystem,
      inventoryManager: refs.inventoryManager,
      mortarSystem: refs.mortarSystem,
      playerController: refs.playerController,
      sandbagSystem: refs.sandbagSystem,
      ticketSystem: refs.ticketSystem,
    },
    gameModeRuntime: {
      ammoSupplySystem: refs.ammoSupplySystem,
      combatantSystem: refs.combatantSystem,
      firstPersonWeapon: refs.firstPersonWeapon,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      hudSystem: refs.hudSystem,
      influenceMapSystem: refs.influenceMapSystem,
      inventoryManager: refs.inventoryManager,
      minimapSystem: refs.minimapSystem,
      playerController: refs.playerController,
      playerRespawnManager: refs.playerRespawnManager,
      terrainSystem: refs.terrainSystem,
      ticketSystem: refs.ticketSystem,
      zoneManager: refs.zoneManager,
    },
    environmentRuntime: {
      atmosphereSystem: refs.atmosphereSystem,
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      weatherSystem: refs.weatherSystem,
      waterSystem: refs.waterSystem,
    },
  };
}

export function wireGameplayRuntime(
  groups: GameplayRuntimeGroups,
  options: GameplayRuntimeOptions
): void {
  wireCombatRuntime(groups.combatRuntime, options.camera);
  wireWorldRuntime(groups.worldRuntime, options.camera);
  wireWeaponRuntime(groups.weaponRuntime);
  wireGameModeRuntime(groups.gameModeRuntime);
  wireEnvironmentRuntime(groups.environmentRuntime, options.renderer, options.camera);
}

function wireCombatRuntime(
  runtime: GameplayRuntimeGroups['combatRuntime'],
  camera: THREE.PerspectiveCamera
): void {
  if (typeof runtime.combatantSystem.configureDependencies === 'function') {
    runtime.combatantSystem.configureDependencies({
      terrainSystem: runtime.terrainSystem,
      camera,
      ticketSystem: runtime.ticketSystem,
      playerHealthSystem: runtime.playerHealthSystem,
      zoneManager: runtime.zoneManager,
      gameModeManager: runtime.gameModeManager,
      hudSystem: runtime.hudSystem,
      audioManager: runtime.audioManager,
      playerSuppressionSystem: runtime.playerSuppressionSystem,
    });
  } else {
    runtime.combatantSystem.setTerrainSystem(runtime.terrainSystem);
    runtime.combatantSystem.setCamera(camera);
    runtime.combatantSystem.setTicketSystem(runtime.ticketSystem);
    runtime.combatantSystem.setPlayerHealthSystem(runtime.playerHealthSystem);
    runtime.combatantSystem.setZoneManager(runtime.zoneManager);
    runtime.combatantSystem.setGameModeManager(runtime.gameModeManager);
    runtime.combatantSystem.setHUDSystem(runtime.hudSystem);
    runtime.combatantSystem.setAudioManager(runtime.audioManager);
    runtime.combatantSystem.setPlayerSuppressionSystem(runtime.playerSuppressionSystem);
  }

  const combatantCombat = runtime.combatantSystem.combatantCombat;
  if (combatantCombat) {
    combatantCombat.setSandbagSystem(runtime.sandbagSystem);
  }
  const combatantAI = runtime.combatantSystem.combatantAI;
  if (combatantAI) {
    combatantAI.setSandbagSystem(runtime.sandbagSystem);
    combatantAI.setZoneManager(runtime.zoneManager);
    combatantAI.setSmokeCloudSystem(runtime.smokeCloudSystem);
  }
  const squadManager = runtime.combatantSystem.squadManager;
  if (squadManager) {
    squadManager.setInfluenceMap(runtime.influenceMapSystem);
  }

  runtime.combatantSystem.influenceMap = runtime.influenceMapSystem;
  runtime.combatantSystem.sandbagSystem = runtime.sandbagSystem;
  runtime.flashbangScreenEffect.setPlayerController(runtime.playerController);
  setSmokeCloudSystem(runtime.smokeCloudSystem);
}

function wireWorldRuntime(
  runtime: GameplayRuntimeGroups['worldRuntime'],
  camera: THREE.PerspectiveCamera
): void {
  runtime.ticketSystem.setZoneManager(runtime.zoneManager);
  runtime.ticketSystem.setMatchRestartCallback(() => {
    runtime.playerRespawnManager.cancelPendingRespawn();
    runtime.playerHealthSystem.resetForNewMatch();
    runtime.firstPersonWeapon.enable();
    runtime.playerRespawnManager.respawnAtBase();
  });

  runtime.zoneManager.setCombatantSystem(runtime.combatantSystem);
  runtime.zoneManager.setCamera(camera);
  runtime.zoneManager.setTerrainSystem(runtime.terrainSystem);
  runtime.zoneManager.setSpatialGridManager(runtime.spatialGridManager);
  runtime.zoneManager.setSpatialQueryProvider((center, radius) =>
    runtime.combatantSystem.querySpatialRadius(center, radius)
  );
  runtime.zoneManager.setHUDSystem(runtime.hudSystem);
}

function wireWeaponRuntime(runtime: GameplayRuntimeGroups['weaponRuntime']): void {
  runtime.grenadeSystem.setCombatantSystem(runtime.combatantSystem);
  runtime.grenadeSystem.setInventoryManager(runtime.inventoryManager);
  runtime.grenadeSystem.setTicketSystem(runtime.ticketSystem);
  runtime.grenadeSystem.setAudioManager(runtime.audioManager);
  runtime.grenadeSystem.setPlayerController(runtime.playerController);
  runtime.grenadeSystem.setFlashbangEffect(runtime.flashbangScreenEffect);

  runtime.mortarSystem.setCombatantSystem(runtime.combatantSystem);
  runtime.mortarSystem.setInventoryManager(runtime.inventoryManager);
  runtime.mortarSystem.setAudioManager(runtime.audioManager);
  runtime.mortarSystem.setTicketSystem(runtime.ticketSystem);

  runtime.sandbagSystem.setInventoryManager(runtime.inventoryManager);
  runtime.sandbagSystem.setTicketSystem(runtime.ticketSystem);

  const impactEffectsPool = runtime.combatantSystem.impactEffectsPool;
  if (impactEffectsPool) {
    runtime.grenadeSystem.setImpactEffectsPool(impactEffectsPool);
    runtime.mortarSystem.setImpactEffectsPool(impactEffectsPool);
  }
  const explosionEffectsPool = runtime.combatantSystem.explosionEffectsPool;
  if (explosionEffectsPool) {
    runtime.grenadeSystem.setExplosionEffectsPool(explosionEffectsPool);
    runtime.mortarSystem.setExplosionEffectsPool(explosionEffectsPool);
  }
}

function wireGameModeRuntime(runtime: GameplayRuntimeGroups['gameModeRuntime']): void {
  if (typeof runtime.gameModeManager.configureDependencies === 'function') {
    runtime.gameModeManager.configureDependencies({
      zoneManager: runtime.zoneManager,
      combatantSystem: runtime.combatantSystem,
      ticketSystem: runtime.ticketSystem,
      terrainSystem: runtime.terrainSystem,
      minimapSystem: runtime.minimapSystem,
      fullMapSystem: runtime.fullMapSystem,
      influenceMapSystem: runtime.influenceMapSystem,
      hudSystem: runtime.hudSystem,
      playerController: runtime.playerController,
      playerRespawnManager: runtime.playerRespawnManager,
    });
  } else {
    runtime.gameModeManager.connectSystems(
      runtime.zoneManager,
      runtime.combatantSystem,
      runtime.ticketSystem,
      runtime.terrainSystem,
      runtime.minimapSystem,
      runtime.fullMapSystem
    );
    runtime.gameModeManager.setInfluenceMapSystem(runtime.influenceMapSystem);
    runtime.gameModeManager.setHUDSystem(runtime.hudSystem);
    runtime.gameModeManager.setPlayerController(runtime.playerController);
    runtime.gameModeManager.setPlayerRespawnManager(runtime.playerRespawnManager);
  }

  runtime.ammoSupplySystem.setZoneManager(runtime.zoneManager);
  runtime.ammoSupplySystem.setInventoryManager(runtime.inventoryManager);
  runtime.ammoSupplySystem.setFirstPersonWeapon(runtime.firstPersonWeapon);
}

function wireEnvironmentRuntime(
  runtime: GameplayRuntimeGroups['environmentRuntime'],
  renderer?: IGameRenderer,
  camera?: THREE.PerspectiveCamera
): void {
  if (runtime.weatherSystem) {
    runtime.weatherSystem.setAudioManager(runtime.audioManager);
    if (renderer) {
      runtime.weatherSystem.setRenderer(renderer);
    }
    // Forward fog-tint intent (storm darken / underwater override) to
    // the atmosphere system so `scene.fog.color` stays sky-driven even
    // while weather is modulating density. See
    // `atmosphere-fog-tinted-by-sky`.
    if (runtime.atmosphereSystem) {
      runtime.weatherSystem.setFogTintIntentReceiver(runtime.atmosphereSystem);
    }
  }

  if (runtime.atmosphereSystem) {
    if (renderer) {
      // AtmosphereSystem now owns the directional sun light + hemisphere
      // palette. Bind AFTER setupLighting() has run so the initial apply
      // pushes atmosphere-driven values onto the lights immediately.
      runtime.atmosphereSystem.setRenderer(renderer);
    }
    if (camera) {
      runtime.atmosphereSystem.setShadowFollowTarget(camera);
    }
  }

  if (runtime.waterSystem) {
    runtime.waterSystem.setWeatherSystem(runtime.weatherSystem);
    if (runtime.atmosphereSystem) {
      runtime.waterSystem.setAtmosphereSystem(runtime.atmosphereSystem);
    }

    // VODA-2 wade behavior: bridge `WaterSystem.sampleWaterInteraction` into
    // the `NpcWaterSampler` shape `CombatantMovement` consumes. The adapter
    // owns a single shared Vector3 so per-tick NPC sampling does not
    // allocate. Player swim is wired separately via
    // `playerController.setWaterSystem` in `ModeStartupPreparer` because
    // drowning damage needs the per-mode `PlayerHealthSystem` handle.
    if (runtime.combatantSystem?.setWaterSampler) {
      runtime.combatantSystem.setWaterSampler(
        createNpcWaterSamplerAdapter(runtime.waterSystem),
      );
    }
  }
}
