import { Logger } from '../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../types';
import { AssetLoader } from '../systems/assets/AssetLoader';
import { PlayerController } from '../systems/player/PlayerController';
import { CombatantSystem } from '../systems/combat/CombatantSystem';
import { Skybox } from '../systems/environment/Skybox';
import { ImprovedChunkManager } from '../systems/terrain/ImprovedChunkManager';
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
import { PlayerSquadController } from '../systems/combat/PlayerSquadController';
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
import { DayNightCycle } from '../systems/environment/DayNightCycle';
import { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';
import { VoiceCalloutSystem } from '../systems/audio/VoiceCalloutSystem';
import { LoadoutSelector } from '../ui/loadout/LoadoutSelector';
import { objectPool } from '../utils/ObjectPoolManager';

export interface SystemReferences {
  assetLoader: AssetLoader;
  chunkManager: ImprovedChunkManager;
  globalBillboardSystem: GlobalBillboardSystem;
  playerController: PlayerController;
  combatantSystem: CombatantSystem;
  skybox: Skybox;
  waterSystem: WaterSystem;
  weatherSystem: WeatherSystem;
  dayNightCycle: DayNightCycle;
  firstPersonWeapon: FirstPersonWeapon;
  zoneManager: ZoneManager;
  hudSystem: HUDSystem;
  ticketSystem: TicketSystem;
  playerHealthSystem: PlayerHealthSystem;
  minimapSystem: MinimapSystem;
  audioManager: AudioManager;
  gameModeManager: GameModeManager;
  playerRespawnManager: PlayerRespawnManager;
  fullMapSystem: FullMapSystem;
  compassSystem: CompassSystem;
  helipadSystem: HelipadSystem;
  helicopterModel: HelicopterModel;
  playerSquadController: PlayerSquadController;
  inventoryManager: InventoryManager;
  grenadeSystem: GrenadeSystem;
  mortarSystem: MortarSystem;
  sandbagSystem: SandbagSystem;
  cameraShakeSystem: CameraShakeSystem;
  playerSuppressionSystem: PlayerSuppressionSystem;
  flashbangScreenEffect: FlashbangScreenEffect;
  smokeCloudSystem: SmokeCloudSystem;
  influenceMapSystem: InfluenceMapSystem;
  ammoSupplySystem: AmmoSupplySystem;
  footstepAudioSystem: FootstepAudioSystem;
  voiceCalloutSystem: VoiceCalloutSystem;
  loadoutSelector: LoadoutSelector;
}

export interface InitializationResult {
  systems: GameSystem[];
  deferredSystems: GameSystem[];
  scene: THREE.Scene;
}

/**
 * Handles initialization of all game systems
 */
export class SystemInitializer {
  async initializeSystems(
    refs: SystemReferences,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onProgress: (phase: string, progress: number) => void,
    _renderer?: any
  ): Promise<InitializationResult> {
    Logger.info('core', ' Initializing game systems...');

    // Warmup object pools to prevent allocations during gameplay
    objectPool.warmup(50, 20, 10, 30);

    // Phase 1: Core systems
    onProgress('core', 0);

    refs.assetLoader = new AssetLoader();
    onProgress('core', 0.5);

    refs.globalBillboardSystem = new GlobalBillboardSystem(scene, camera, refs.assetLoader);
    
    // Apply device-adaptive render distance
    const baseRenderDistance = 6;
    const renderDistanceMultiplier = getRenderDistanceMultiplier();
    const adaptiveRenderDistance = Math.max(3, Math.round(baseRenderDistance * renderDistanceMultiplier));
    
    refs.chunkManager = new ImprovedChunkManager(scene, camera, refs.assetLoader, refs.globalBillboardSystem, {
      size: 64,
      renderDistance: adaptiveRenderDistance,
      loadDistance: adaptiveRenderDistance + 1,
      lodLevels: 4
    });
    Logger.info('init', `Chunk render distance: ${adaptiveRenderDistance} (multiplier: ${renderDistanceMultiplier.toFixed(2)})`);
    // GPUTerrain disabled - going with web workers approach instead
    onProgress('core', 1);

    // Phase 2: Load textures
    onProgress('textures', 0);
    await refs.assetLoader.init();
    onProgress('textures', 1);

    // Phase 3: Load audio
    onProgress('audio', 0);
    refs.audioManager = new AudioManager(scene, camera);
    await refs.audioManager.init();
    onProgress('audio', 1);

    // Phase 4: Initialize world systems
    onProgress('world', 0);

    refs.playerController = new PlayerController(camera);
    refs.combatantSystem = new CombatantSystem(scene, camera, refs.globalBillboardSystem, refs.assetLoader, refs.chunkManager);
    refs.skybox = new Skybox(scene);
    refs.waterSystem = new WaterSystem(scene, camera, refs.assetLoader);
    refs.weatherSystem = new WeatherSystem(scene, camera, refs.chunkManager);
    refs.dayNightCycle = new DayNightCycle(scene);
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

    // Initialize new squad/inventory/grenade systems
    const squadManager = (refs.combatantSystem as any).squadManager;
    refs.playerSquadController = new PlayerSquadController(squadManager);
    refs.inventoryManager = new InventoryManager();
    refs.grenadeSystem = new GrenadeSystem(scene, camera, refs.chunkManager);
    refs.mortarSystem = new MortarSystem(scene, camera, refs.chunkManager);
    refs.sandbagSystem = new SandbagSystem(scene, camera, refs.chunkManager);
    refs.cameraShakeSystem = new CameraShakeSystem();
    refs.playerSuppressionSystem = new PlayerSuppressionSystem();
    refs.flashbangScreenEffect = new FlashbangScreenEffect();
    refs.smokeCloudSystem = new SmokeCloudSystem(scene, camera);
    refs.ammoSupplySystem = new AmmoSupplySystem(scene, camera);
    refs.footstepAudioSystem = new FootstepAudioSystem(refs.audioManager.getListener());
    refs.voiceCalloutSystem = new VoiceCalloutSystem(scene, refs.audioManager.getListener());
    refs.loadoutSelector = new LoadoutSelector();

    // Initialize influence map system based on game mode world size
    const worldSize = 4000; // Default, will be updated when game mode is set
    refs.influenceMapSystem = new InfluenceMapSystem(worldSize);

    // Add systems to update list
    // NOTE: dayNightCycle removed - conflicts with weatherSystem for lighting control
    const allSystems: GameSystem[] = [
      refs.assetLoader,
      refs.audioManager,
      refs.globalBillboardSystem,
      refs.chunkManager,
      // gpuTerrain disabled
      refs.waterSystem,
      refs.weatherSystem,
      // dayNightCycle DISABLED: Conflicts with WeatherSystem lighting
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
      refs.skybox,
      refs.gameModeManager,
      refs.playerSquadController,
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
      refs.voiceCalloutSystem,
      refs.loadoutSelector
    ];

    onProgress('world', 0.5);

    // Defer non-critical systems so first interactive frame is not blocked.
    const deferredSystems = new Set<GameSystem>([
      refs.helipadSystem,
      refs.helicopterModel,
      refs.voiceCalloutSystem,
      refs.loadoutSelector
    ]);

    const systems: GameSystem[] = allSystems.filter(system => !deferredSystems.has(system));
    const deferredSystemList: GameSystem[] = allSystems.filter(system => deferredSystems.has(system));

    // Initialize critical systems first
    for (const system of systems) {
      await system.init();
    }

    onProgress('world', 1);

    return {
      systems,
      deferredSystems: deferredSystemList,
      scene
    };
  }
}
