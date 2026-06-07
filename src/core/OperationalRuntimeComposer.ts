// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { SystemKeyToType } from './SystemRegistry';
import { GameMode } from '../config/gameModeTypes';
import type { GameModeConfig } from '../config/gameModeTypes';
import { Logger } from '../utils/Logger';
import type { M2HBScenarioMode } from '../systems/combat/weapons/M2HBEmplacementSpawn';
import type { M48ScenarioMode } from '../systems/vehicle/M48TankSpawn';
import type { PBRScenarioMode } from '../systems/vehicle/PBRSpawn';
import type { SampanScenarioMode } from '../systems/vehicle/SampanSpawn';
import { resolveGroundPlacement, resolveWatercraftPlacement } from '../systems/terrain/TerrainPlacementAuthority';
import { PBR } from '../systems/vehicle/PBR';
import { Sampan } from '../systems/vehicle/Sampan';
import { Tank } from '../systems/vehicle/Tank';

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
  | 'waterSystem'
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
    | 'waterSystem'
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
      waterSystem: refs.waterSystem,
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

  // Inject the vehicle manager so map surfaces can pull drivable /
  // boardable vehicle positions per-frame. Guarded so older test
  // doubles without `setVehicleManager` keep working.
  if (typeof runtime.minimapSystem.setVehicleManager === 'function') {
    runtime.minimapSystem.setVehicleManager(runtime.vehicleManager);
  }
  if (typeof runtime.fullMapSystem.setVehicleManager === 'function') {
    runtime.fullMapSystem.setVehicleManager(runtime.vehicleManager);
  }
  if (typeof runtime.combatantSystem.setVehicleManager === 'function') {
    runtime.combatantSystem.setVehicleManager(runtime.vehicleManager);
  }

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
  wireSampanRuntime(runtime, options);
  wirePBRRuntime(runtime, options);
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
          resolvePosition: (_m, base) => resolveGroundPlacement(base, runtime.terrainSystem).position,
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
          resolvePosition: (_m, base) => resolveGroundPlacement(base, runtime.terrainSystem).position,
        });
        bindSpawnedM48TankRuntime(ids, runtime);
        Logger.info('vehicle', `M48 tank scenario spawn (${scenarioKey}): ${ids.join(', ')}`);
      } catch (error) {
        // Roll back the reservation so a manual re-trigger can retry.
        spawnedModes.delete(scenarioKey);
        Logger.warn('vehicle', `M48 tank scenario spawn failed for ${scenarioKey}`, error);
      }
    }, 0);
  });
}

function bindSpawnedM48TankRuntime(
  ids: readonly string[],
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
): void {
  for (const id of ids) {
    const vehicle = runtime.vehicleManager.getVehicle(id);
    if (!(vehicle instanceof Tank)) continue;
    vehicle.setTerrain(runtime.terrainSystem ?? null);
  }
}

// Maps GameMode -> the Sampan scenario-spawn key. Same shape + same
// scenarios as the M48 wiring above (the sampans ride alongside the
// land vehicles on Open Frontier river + A Shau valley river).
const SAMPAN_MODES_BY_GAMEMODE: Partial<Record<GameMode, SampanScenarioMode>> = {
  [GameMode.OPEN_FRONTIER]: 'open_frontier',
  [GameMode.A_SHAU_VALLEY]: 'a_shau_valley',
};

// Per-craft initial freeboard offsets applied above the water surface
// at spawn so the hull starts straddling the waterline rather than
// fully submerged. Buoyancy still equilibrates within the first second
// of physics; this is purely for visual continuity at spawn.
const SAMPAN_SPAWN_FREEBOARD_METERS = 0.35;
const PBR_SPAWN_FREEBOARD_METERS = 0.30;

function wireSampanRuntime(
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
  options: OperationalRuntimeOptions
): void {
  const scene = options.scene;
  if (!scene) return;

  const spawnedModes = new Set<SampanScenarioMode>();
  runtime.gameModeManager.onModeChanged((mode, config) => {
    const scenarioKey = SAMPAN_MODES_BY_GAMEMODE[mode];
    if (!scenarioKey) return;
    if (spawnedModes.has(scenarioKey)) return;
    spawnedModes.add(scenarioKey);
    // Defer one frame so the per-mode terrain provider is hot before
    // resolvePosition runs `getHeightAt` — mirrors the M48 + M2HB
    // wiring deferral above.
    setTimeout(() => {
      try {
        const ids = runtime.vehicleManager.spawnScenarioSampans({
          scene,
          modes: [scenarioKey],
          resolvePosition: (_m, base) => snapWatercraftToSurface(
            base,
            runtime.terrainSystem,
            runtime.waterSystem,
            config,
            SAMPAN_SPAWN_FREEBOARD_METERS,
          ),
        });
        bindSpawnedWatercraftRuntime(ids, runtime);
        Logger.info('vehicle', `Sampan scenario spawn (${scenarioKey}): ${ids.join(', ')}`);
      } catch (error) {
        // Roll back the reservation so a manual re-trigger can retry.
        spawnedModes.delete(scenarioKey);
        Logger.warn('vehicle', `Sampan scenario spawn failed for ${scenarioKey}`, error);
      }
    }, 0);
  });
}

// Maps GameMode -> the PBR scenario-spawn key. Same shape as the M2HB
// + M48 wiring (PBR spawns alongside on Open Frontier US riverbank +
// A Shau US river outpost). Cycle-voda-3-watercraft pbr-integration.
const PBR_MODES_BY_GAMEMODE: Partial<Record<GameMode, PBRScenarioMode>> = {
  [GameMode.OPEN_FRONTIER]: 'open_frontier',
  [GameMode.A_SHAU_VALLEY]: 'a_shau_valley',
};

function wirePBRRuntime(
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
  options: OperationalRuntimeOptions
): void {
  const m2hb = runtime.m2hbEmplacementSystem;
  // The PBR depends on the M2HB system to bind the mount weapons; if
  // the M2HB system is not available there is nothing useful to wire.
  if (!m2hb) return;
  const scene = options.scene;
  if (!scene) return;

  const spawnedModes = new Set<PBRScenarioMode>();
  runtime.gameModeManager.onModeChanged((mode, config) => {
    const scenarioKey = PBR_MODES_BY_GAMEMODE[mode];
    if (!scenarioKey) return;
    if (spawnedModes.has(scenarioKey)) return;
    spawnedModes.add(scenarioKey);
    // Defer one frame so the per-mode terrain provider is hot before
    // resolvePosition runs `getHeightAt` — mirrors the M2HB / M48
    // wiring's setTimeout(0) deferral above. When the scenario has
    // `waterEnabled` set, the snap consults WaterSurfaceSampler first
    // (authored water body, hydrology river surface, or global plane);
    // when no water covers
    // the spawn point, terrain height is the fallback.
    setTimeout(() => {
      try {
        const ids = runtime.vehicleManager.spawnScenarioPBRs({
          scene,
          m2hbSystem: m2hb,
          modes: [scenarioKey],
          resolvePosition: (_m, base) => snapWatercraftToSurface(
            base,
            runtime.terrainSystem,
            runtime.waterSystem,
            config,
            PBR_SPAWN_FREEBOARD_METERS,
          ),
        });
        bindSpawnedWatercraftRuntime(ids, runtime);
        Logger.info('vehicle', `PBR scenario spawn (${scenarioKey}): ${ids.join(', ')}`);
      } catch (error) {
        // Roll back the reservation so a manual re-trigger can retry.
        spawnedModes.delete(scenarioKey);
        Logger.warn('vehicle', `PBR scenario spawn failed for ${scenarioKey}`, error);
      }
    }, 0);
  });
}

function bindSpawnedWatercraftRuntime(
  ids: readonly string[],
  runtime: OperationalRuntimeGroups['vehicleRuntime'],
): void {
  for (const id of ids) {
    const vehicle = runtime.vehicleManager.getVehicle(id);
    if (!(vehicle instanceof Sampan) && !(vehicle instanceof PBR)) continue;
    vehicle.setWaterSampler(runtime.waterSystem ?? null);
    vehicle.setTerrain(runtime.terrainSystem ?? null);
  }
}

/**
 * Shared spawn snap for watercraft. When the active scenario has water
 * enabled (`waterEnabled === true`) and the WaterSystem reports a
 * water surface at the spawn XZ (authored water body, hydrology river, or
 * global plane), the
 * hull is snapped to `waterY + freeboard` so it starts straddling the
 * waterline. Otherwise the snap falls back to terrain height (mirrors
 * the prior land-snap behavior so the hull does not spawn above the
 * ridgeline or below the seabed). Returns a fresh Vector3 each call;
 * scratch is internal.
 */
function snapWatercraftToSurface(
  base: THREE.Vector3,
  terrainSystem: OperationalRuntimeGroups['vehicleRuntime']['terrainSystem'],
  waterSystem: OperationalRuntimeGroups['vehicleRuntime']['waterSystem'] | undefined,
  config: GameModeConfig | undefined,
  freeboard: number,
): THREE.Vector3 {
  return resolveWatercraftPlacement(base, {
    terrainSystem,
    waterSystem,
    waterEnabled: config?.waterEnabled === true,
    freeboardMeters: freeboard,
  }).position;
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
