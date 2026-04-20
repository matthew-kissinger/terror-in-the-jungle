import { Logger } from '../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../types';
import { AssetLoader } from '../systems/assets/AssetLoader';
import { PlayerController } from '../systems/player/PlayerController';
import { CombatantSystem } from '../systems/combat/CombatantSystem';
import { Skybox } from '../systems/environment/Skybox';
import { AtmosphereSystem } from '../systems/environment/AtmosphereSystem';
import { TerrainSystem } from '../systems/terrain/TerrainSystem';
import { GlobalBillboardSystem } from '../systems/world/billboard/GlobalBillboardSystem';
import { WaterSystem } from '../systems/environment/WaterSystem';
import { FirstPersonWeapon } from '../systems/player/FirstPersonWeapon';
import { ZoneManager } from '../systems/world/ZoneManager';
import { HUDSystem } from '../ui/hud/HUDSystem';
import { TicketSystem } from '../systems/world/TicketSystem';
import { PlayerHealthSystem } from '../systems/player/PlayerHealthSystem';
import { MinimapSystem } from '../ui/minimap/MinimapSystem';
import { AudioManager } from '../systems/audio/AudioManager';
import { GameModeManager } from '../systems/world/GameModeManager';
import { PlayerRespawnManager } from '../systems/player/PlayerRespawnManager';
import { FullMapSystem } from '../ui/map/FullMapSystem';
import { CompassSystem } from '../ui/compass/CompassSystem';
import { HelipadSystem } from '../systems/helicopter/HelipadSystem';
import { HelicopterModel } from '../systems/helicopter/HelicopterModel';
import { FixedWingModel } from '../systems/vehicle/FixedWingModel';
import { PlayerSquadController } from '../systems/combat/PlayerSquadController';
import { CommandInputManager } from '../systems/combat/CommandInputManager';
import { InventoryManager } from '../systems/player/InventoryManager';
import { GrenadeSystem } from '../systems/weapons/GrenadeSystem';
import { MortarSystem } from '../systems/weapons/MortarSystem';
import { SandbagSystem } from '../systems/weapons/SandbagSystem';
import { CameraShakeSystem } from '../systems/effects/CameraShakeSystem';
import { PlayerSuppressionSystem } from '../systems/player/PlayerSuppressionSystem';
import { getRenderDistanceMultiplier } from '../utils/DeviceDetector';
import { FlashbangScreenEffect } from '../systems/player/FlashbangScreenEffect';
import { SmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import { InfluenceMapSystem } from '../systems/combat/InfluenceMapSystem';
import { AmmoSupplySystem } from '../systems/weapons/AmmoSupplySystem';
import { WeatherSystem } from '../systems/environment/WeatherSystem';
import { WorldFeatureSystem } from '../systems/world/WorldFeatureSystem';

import { NavmeshSystem } from '../systems/navigation/NavmeshSystem';
import { AirSupportManager } from '../systems/airsupport/AirSupportManager';
import { AAEmplacementSystem } from '../systems/airsupport/AAEmplacement';
import { VehicleManager } from '../systems/vehicle/VehicleManager';
import { NPCVehicleController } from '../systems/vehicle/NPCVehicleController';

import { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';

import { LoadoutService } from '../systems/player/LoadoutService';
import { WarSimulator } from '../systems/strategy/WarSimulator';
import { StrategicFeedback } from '../systems/strategy/StrategicFeedback';
import { spatialGridManager } from '../systems/combat/SpatialGridManager';
import { objectPool } from '../utils/ObjectPoolManager';
import { markStartup } from './StartupTelemetry';
import type { SystemKeyToType } from './SystemRegistry';

export type SystemReferences = SystemKeyToType;
export type MutableSystemReferences = Partial<SystemReferences>;

interface InitializationResult {
  systems: GameSystem[];
  deferredSystems: GameSystem[];
  scene: THREE.Scene;
}

/**
 * Handles initialization of all game systems
 */
export class SystemInitializer {
  async initializeSystems(
    refs: MutableSystemReferences,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onProgress: (phase: string, progress: number) => void,
    _renderer?: any
  ): Promise<InitializationResult> {
    Logger.info('core', ' Initializing game systems...');
    markStartup('systems.initialize.begin');

    // Warm pools to frontier-scale combat levels to avoid hot-path fallback allocations.
    objectPool.warmup(240, 80, 32, 96);

    // Phase 1: Core systems
    onProgress('core', 0);

    refs.assetLoader = new AssetLoader();
    onProgress('core', 0.5);

    refs.globalBillboardSystem = new GlobalBillboardSystem(scene, camera, refs.assetLoader);
    
    // Apply device-adaptive render distance
    const baseRenderDistance = 6;
    const renderDistanceMultiplier = getRenderDistanceMultiplier();
    const adaptiveRenderDistance = Math.max(3, Math.round(baseRenderDistance * renderDistanceMultiplier));
    
    refs.terrainSystem = new TerrainSystem(scene, camera, refs.assetLoader, refs.globalBillboardSystem, {
      size: 64,
      renderDistance: adaptiveRenderDistance,
      loadDistance: adaptiveRenderDistance + 1,
      lodLevels: 4
    });
    Logger.info('init', `Chunk render distance: ${adaptiveRenderDistance} (multiplier: ${renderDistanceMultiplier.toFixed(2)})`);
    // GPUTerrain disabled - going with web workers approach instead
    onProgress('core', 1);

    // Phase 2+3: Load textures and audio concurrently (they share no dependencies)
    onProgress('textures', 0);
    onProgress('audio', 0);
    refs.audioManager = new AudioManager(scene, camera);
    markStartup('systems.assets.begin');
    markStartup('systems.audio.begin');
    await Promise.all([
      refs.assetLoader.init((loaded, total) => {
        onProgress('textures', total > 0 ? loaded / total : 1);
      }).then(() => {
        markStartup('systems.assets.end');
        onProgress('textures', 1);
      }),
      refs.audioManager.init((loaded, total) => {
        onProgress('audio', total > 0 ? loaded / total : 1);
      }).then(() => {
        markStartup('systems.audio.end');
        onProgress('audio', 1);
      }),
    ]);

    // Phase 4: Initialize world systems
    onProgress('world', 0);

    refs.playerController = new PlayerController(camera);
    refs.combatantSystem = new CombatantSystem(scene, camera, refs.globalBillboardSystem, refs.assetLoader, refs.terrainSystem);
    refs.skybox = new Skybox(scene);
    refs.atmosphereSystem = new AtmosphereSystem();
    refs.atmosphereSystem.attachScene(scene);
    refs.waterSystem = new WaterSystem(scene, camera, refs.assetLoader);

    refs.weatherSystem = new WeatherSystem(scene, camera, refs.terrainSystem);
    refs.firstPersonWeapon = new FirstPersonWeapon(scene, camera, refs.assetLoader);
    refs.zoneManager = new ZoneManager(scene);
    refs.ticketSystem = new TicketSystem();
    refs.playerHealthSystem = new PlayerHealthSystem();
    refs.playerRespawnManager = new PlayerRespawnManager(scene, camera);
    refs.hudSystem = new HUDSystem(camera, refs.ticketSystem, refs.playerHealthSystem, refs.playerRespawnManager);
    refs.minimapSystem = new MinimapSystem(camera);
    refs.fullMapSystem = new FullMapSystem(camera);
    refs.compassSystem = new CompassSystem(camera);
    refs.gameModeManager = new GameModeManager();
    refs.helipadSystem = new HelipadSystem(scene);
    refs.helicopterModel = new HelicopterModel(scene);
    refs.fixedWingModel = new FixedWingModel(scene);
    refs.worldFeatureSystem = new WorldFeatureSystem(scene);

    refs.navmeshSystem = new NavmeshSystem();
    // Prewarm WASM download+compile now so it's ready when mode startup needs it.
    // Fire-and-forget: init() is idempotent and configureTerrainAndNavigation() will
    // await it again if not yet complete.
    refs.navmeshSystem.init().catch(() => {});
    refs.airSupportManager = new AirSupportManager(scene);
    refs.aaEmplacementSystem = new AAEmplacementSystem(scene);
    refs.vehicleManager = new VehicleManager();
    refs.npcVehicleController = new NPCVehicleController();

    // Initialize new squad/inventory/grenade systems
    const squadManager = (refs.combatantSystem as any).squadManager;
    refs.playerSquadController = new PlayerSquadController(squadManager);
    refs.commandInputManager = new CommandInputManager(refs.playerSquadController);
    refs.inventoryManager = new InventoryManager();
    refs.inventoryManager.setSuppressUI(true); // UnifiedWeaponBar replaces built-in hotbar
    refs.grenadeSystem = new GrenadeSystem(scene, camera, refs.terrainSystem);
    refs.mortarSystem = new MortarSystem(scene, camera, refs.terrainSystem);
    refs.sandbagSystem = new SandbagSystem(scene, camera, refs.terrainSystem);
    refs.cameraShakeSystem = new CameraShakeSystem();
    refs.playerSuppressionSystem = new PlayerSuppressionSystem();
    refs.flashbangScreenEffect = new FlashbangScreenEffect();
    refs.smokeCloudSystem = new SmokeCloudSystem(scene, camera);
    refs.ammoSupplySystem = new AmmoSupplySystem(scene, camera);
    refs.footstepAudioSystem = new FootstepAudioSystem(refs.audioManager.getListener());

    refs.loadoutService = new LoadoutService();
    refs.warSimulator = new WarSimulator();
    refs.strategicFeedback = new StrategicFeedback();
    refs.spatialGridManager = spatialGridManager;

    // Initialize influence map system based on game mode world size
    const worldSize = 4000; // Default, will be updated when game mode is set
    refs.influenceMapSystem = new InfluenceMapSystem(worldSize);

    // Add systems to update list
    const allSystems: GameSystem[] = [
      refs.assetLoader,
      refs.audioManager,
      refs.globalBillboardSystem,
      refs.terrainSystem,
      // gpuTerrain disabled
      refs.waterSystem,
      refs.weatherSystem,
      refs.atmosphereSystem,
      refs.playerController,
      refs.firstPersonWeapon,
      refs.combatantSystem,
      refs.zoneManager,
      refs.ticketSystem,
      refs.playerHealthSystem,
      refs.playerRespawnManager,
      refs.minimapSystem,
      refs.fullMapSystem,
      refs.compassSystem,
      refs.hudSystem,
      refs.helipadSystem,
      refs.helicopterModel,
      refs.fixedWingModel,
      refs.worldFeatureSystem,
      refs.skybox,
      refs.gameModeManager,
      refs.playerSquadController,
      refs.commandInputManager,
      refs.inventoryManager,
      refs.grenadeSystem,
      refs.mortarSystem,
      refs.sandbagSystem,
      refs.cameraShakeSystem,
      refs.playerSuppressionSystem,
      refs.flashbangScreenEffect,
      refs.smokeCloudSystem,
      refs.influenceMapSystem,
      refs.ammoSupplySystem,
      refs.warSimulator,
      refs.strategicFeedback,
      refs.airSupportManager,
      refs.aaEmplacementSystem,
      refs.vehicleManager
    ];

    onProgress('world', 0.5);

    // Defer non-critical systems so first interactive frame is not blocked.
    const deferredSystems = new Set<GameSystem>([
      refs.helipadSystem,
      refs.helicopterModel,
      refs.fixedWingModel,
    ]);

    const systems: GameSystem[] = allSystems.filter(system => !deferredSystems.has(system));
    const deferredSystemList: GameSystem[] = allSystems.filter(system => deferredSystems.has(system));
    const preInitializedSystems = new Set<GameSystem>([
      refs.assetLoader,
      refs.audioManager
    ]);

    // Initialize critical systems first
    for (const system of systems) {
      const name = (system as any)?.constructor?.name ?? 'UnknownSystem';
      if (preInitializedSystems.has(system)) {
        markStartup(`systems.init.${name}.skipped-preinitialized`);
        continue;
      }
      markStartup(`systems.init.${name}.begin`);
      await system.init();
      markStartup(`systems.init.${name}.end`);
    }

    onProgress('world', 1);

    return {
      systems,
      deferredSystems: deferredSystemList,
      scene
    };
  }
}
