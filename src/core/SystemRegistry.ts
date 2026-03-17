import type { AssetLoader } from '../systems/assets/AssetLoader';
import type { PlayerController } from '../systems/player/PlayerController';
import type { CombatantSystem } from '../systems/combat/CombatantSystem';
import type { Skybox } from '../systems/environment/Skybox';
import type { TerrainSystem } from '../systems/terrain/TerrainSystem';
import type { GlobalBillboardSystem } from '../systems/world/billboard/GlobalBillboardSystem';
import type { WaterSystem } from '../systems/environment/WaterSystem';
import type { WeatherSystem } from '../systems/environment/WeatherSystem';
import type { FirstPersonWeapon } from '../systems/player/FirstPersonWeapon';
import type { ZoneManager } from '../systems/world/ZoneManager';
import type { HUDSystem } from '../ui/hud/HUDSystem';
import type { TicketSystem } from '../systems/world/TicketSystem';
import type { PlayerHealthSystem } from '../systems/player/PlayerHealthSystem';
import type { MinimapSystem } from '../ui/minimap/MinimapSystem';
import type { AudioManager } from '../systems/audio/AudioManager';
import type { GameModeManager } from '../systems/world/GameModeManager';
import type { PlayerRespawnManager } from '../systems/player/PlayerRespawnManager';
import type { FullMapSystem } from '../ui/map/FullMapSystem';
import type { CompassSystem } from '../ui/compass/CompassSystem';
import type { HelipadSystem } from '../systems/helicopter/HelipadSystem';
import type { HelicopterModel } from '../systems/helicopter/HelicopterModel';
import type { PlayerSquadController } from '../systems/combat/PlayerSquadController';
import type { CommandInputManager } from '../systems/combat/CommandInputManager';
import type { InventoryManager } from '../systems/player/InventoryManager';
import type { GrenadeSystem } from '../systems/weapons/GrenadeSystem';
import type { MortarSystem } from '../systems/weapons/MortarSystem';
import type { SandbagSystem } from '../systems/weapons/SandbagSystem';
import type { CameraShakeSystem } from '../systems/effects/CameraShakeSystem';
import type { PlayerSuppressionSystem } from '../systems/player/PlayerSuppressionSystem';
import type { FlashbangScreenEffect } from '../systems/player/FlashbangScreenEffect';
import type { SmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import type { InfluenceMapSystem } from '../systems/combat/InfluenceMapSystem';
import type { AmmoSupplySystem } from '../systems/weapons/AmmoSupplySystem';
import type { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';

import type { LoadoutService } from '../systems/player/LoadoutService';
import type { WarSimulator } from '../systems/strategy/WarSimulator';
import type { StrategicFeedback } from '../systems/strategy/StrategicFeedback';
import type { SpatialGridManager } from '../systems/combat/SpatialGridManager';
import type { WorldFeatureSystem } from '../systems/world/WorldFeatureSystem';

import type { NavmeshSystem } from '../systems/navigation/NavmeshSystem';
import type { AirSupportManager } from '../systems/airsupport/AirSupportManager';
import type { AAEmplacementSystem } from '../systems/airsupport/AAEmplacement';
import type { VehicleManager } from '../systems/vehicle/VehicleManager';
import type { NPCVehicleController } from '../systems/vehicle/NPCVehicleController';

export interface SystemKeyToType {
  assetLoader: AssetLoader;
  terrainSystem: TerrainSystem;
  globalBillboardSystem: GlobalBillboardSystem;
  playerController: PlayerController;
  combatantSystem: CombatantSystem;
  skybox: Skybox;
  waterSystem: WaterSystem;
  weatherSystem: WeatherSystem;
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
  commandInputManager: CommandInputManager;
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
  loadoutService: LoadoutService;
  warSimulator: WarSimulator;
  strategicFeedback: StrategicFeedback;
  spatialGridManager: SpatialGridManager;
  worldFeatureSystem: WorldFeatureSystem;
  navmeshSystem: NavmeshSystem;
  airSupportManager: AirSupportManager;
  aaEmplacementSystem: AAEmplacementSystem;
  vehicleManager: VehicleManager;
  npcVehicleController: NPCVehicleController;
}

type SystemKey = keyof SystemKeyToType;

export class SystemRegistry {
  private readonly systems = new Map<SystemKey, SystemKeyToType[SystemKey]>();

  register<K extends SystemKey>(key: K, system: SystemKeyToType[K]): void {
    this.systems.set(key, system);
  }

  has<K extends SystemKey>(key: K): boolean {
    return this.systems.has(key);
  }

  get<K extends SystemKey>(key: K): SystemKeyToType[K] | undefined {
    return this.systems.get(key) as SystemKeyToType[K] | undefined;
  }

  require<K extends SystemKey>(key: K): SystemKeyToType[K] {
    const system = this.get(key);
    if (!system) {
      throw new Error(`SystemRegistry is missing required system "${key}"`);
    }
    return system;
  }

  registerFrom(refs: Partial<SystemKeyToType>): void {
    for (const key of SYSTEM_KEYS) {
      const system = refs[key];
      if (system) {
        this.register(key, system);
      }
    }
  }

  clear(): void {
    this.systems.clear();
  }
}

const SYSTEM_KEYS: readonly SystemKey[] = [
  'assetLoader',
  'terrainSystem',
  'globalBillboardSystem',
  'playerController',
  'combatantSystem',
  'skybox',
  'waterSystem',
  'weatherSystem',
  'firstPersonWeapon',
  'zoneManager',
  'hudSystem',
  'ticketSystem',
  'playerHealthSystem',
  'minimapSystem',
  'audioManager',
  'gameModeManager',
  'playerRespawnManager',
  'fullMapSystem',
  'compassSystem',
  'helipadSystem',
  'helicopterModel',
  'playerSquadController',
  'commandInputManager',
  'inventoryManager',
  'grenadeSystem',
  'mortarSystem',
  'sandbagSystem',
  'cameraShakeSystem',
  'playerSuppressionSystem',
  'flashbangScreenEffect',
  'smokeCloudSystem',
  'influenceMapSystem',
  'ammoSupplySystem',
  'footstepAudioSystem',
  'loadoutService',
  'warSimulator',
  'strategicFeedback',
  'spatialGridManager',
  'worldFeatureSystem',
  'navmeshSystem',
  'airSupportManager',
  'aaEmplacementSystem',
  'vehicleManager',
  'npcVehicleController',
] as const;
