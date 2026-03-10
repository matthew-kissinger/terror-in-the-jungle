import { Logger } from '../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../types';
import { AssetLoader } from '../systems/assets/AssetLoader';
import { PlayerController } from '../systems/player/PlayerController';
import { CombatantSystem } from '../systems/combat/CombatantSystem';
import { Skybox } from '../systems/environment/Skybox';
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
import { GameMode } from '../config/gameModeTypes';
import { getGameModeConfig } from '../config/gameModes';
import { PlayerRespawnManager } from '../systems/player/PlayerRespawnManager';
import { FullMapSystem } from '../ui/map/FullMapSystem';
import { CompassSystem } from '../ui/compass/CompassSystem';
import { HelipadSystem } from '../systems/helicopter/HelipadSystem';
import { HelicopterModel } from '../systems/helicopter/HelicopterModel';
import { PlayerSquadController } from '../systems/combat/PlayerSquadController';
import { CommandInputManager } from '../systems/combat/CommandInputManager';
import { InventoryManager } from '../systems/player/InventoryManager';
import { GrenadeSystem } from '../systems/weapons/GrenadeSystem';
import { MortarSystem } from '../systems/weapons/MortarSystem';
import { SandbagSystem } from '../systems/weapons/SandbagSystem';
import { CameraShakeSystem } from '../systems/effects/CameraShakeSystem';
import { PlayerSuppressionSystem } from '../systems/player/PlayerSuppressionSystem';
import { SmokeCloudSystem } from '../systems/effects/SmokeCloudSystem';
import { InfluenceMapSystem } from '../systems/combat/InfluenceMapSystem';
import { AmmoSupplySystem } from '../systems/weapons/AmmoSupplySystem';
import { WeatherSystem } from '../systems/environment/WeatherSystem';
import { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';
import { RadioTransmissionSystem } from '../systems/audio/RadioTransmissionSystem';
import { LoadoutService } from '../systems/player/LoadoutService';
import { WarSimulator } from '../systems/strategy/WarSimulator';
import { StrategicFeedback } from '../systems/strategy/StrategicFeedback';
import { WorldFeatureSystem } from '../systems/world/WorldFeatureSystem';
import { AnimalSystem } from '../systems/world/AnimalSystem';
import { NavmeshSystem } from '../systems/navigation/NavmeshSystem';
import { SystemInitializer, type MutableSystemReferences } from './SystemInitializer';
import { SystemConnector } from './SystemConnector';
import { SystemUpdater } from './SystemUpdater';
import { SystemDisposer } from './SystemDisposer';
import { SystemRegistry, type SystemKeyToType } from './SystemRegistry';
import { markStartup } from './StartupTelemetry';

export class SystemManager {
  private systems: GameSystem[] = [];
  private deferredSystems: GameSystem[] = [];
  private deferredInitStarted = false;
  private scene?: THREE.Scene;
  
  private initializer = new SystemInitializer();
  private connector = new SystemConnector();
  private updater = new SystemUpdater();
  private disposer = new SystemDisposer();
  private registry = new SystemRegistry();
  
  // System references object for passing to modules
  private refs: MutableSystemReferences = {};

  async initializeSystems(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onProgress: (phase: string, progress: number) => void,
    renderer?: any
  ): Promise<void> {
    // Initialize all systems
    const result = await this.initializer.initializeSystems(
      this.refs,
      scene,
      camera,
      onProgress,
      renderer
    );

    // Store systems and scene
    this.systems = result.systems;
    this.deferredSystems = result.deferredSystems;
    this.scene = result.scene;

    this.registry.clear();
    this.registry.registerFrom(this.refs);

    // Connect systems together
    this.connector.connectSystems(this.refs as SystemKeyToType, scene, camera, renderer);
  }

  startDeferredInitialization(): void {
    if (this.deferredInitStarted || this.deferredSystems.length === 0) {
      return;
    }

    this.deferredInitStarted = true;
    void this.initializeDeferredSystems();
  }

  private async initializeDeferredSystems(): Promise<void> {
    Logger.info('core', `Starting deferred initialization for ${this.deferredSystems.length} systems...`);
    for (const system of this.deferredSystems) {
      try {
        await withTimeout(system.init(), 15_000, system.constructor.name);
        this.systems.push(system);
      } catch (error) {
        Logger.warn('core', `Deferred system init failed (${system.constructor.name}):`, error);
      }
    }
    this.deferredSystems = [];
    Logger.info('core', 'Deferred initialization complete');
  }

  async preGenerateSpawnArea(spawnPos: THREE.Vector3): Promise<void> {
    Logger.info('core', `Pre-generating spawn area around (${spawnPos.x.toFixed(0)}, ${spawnPos.z.toFixed(0)})...`);
    markStartup('systems.pre-generate.begin');

    if (this.terrainSystem) {
      // Generate chunks around the spawn position and wait for minimum playable ring.
      this.terrainSystem.updatePlayerPosition(spawnPos);
      const chunkSize = this.terrainSystem.getChunkSize();
      const _centerX = Math.floor(spawnPos.x / chunkSize);
      const _centerZ = Math.floor(spawnPos.z / chunkSize);
      const _minPlayableRadius = 1;
      const timeoutMs = 5000;
      const start = performance.now();

      while (performance.now() - start < timeoutMs) {
        this.terrainSystem.update(0.016);
        const ready = this.terrainSystem.isAreaReadyAt?.(spawnPos.x, spawnPos.z) ?? this.terrainSystem.isTerrainReady();

        if (ready) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 16));
      }

      // Initialize zones after chunk generation
      Logger.info('core', 'Initializing zones after chunk generation...');
      this.zoneManager.initializeZones();
    }
    markStartup('systems.pre-generate.end');
  }

  updateSystems(deltaTime: number, gameStarted: boolean = true): void {
    this.updater.updateSystems(this.refs as SystemKeyToType, this.systems, this.scene, deltaTime, gameStarted);
  }

  getSystemTimings(): Array<{ name: string; timeMs: number; budgetMs: number }> {
    return this.updater.getSystemTimings();
  }

  getSystems(): GameSystem[] {
    return this.systems;
  }

  dispose(): void {
    this.disposer.dispose(this.systems);
    this.disposer.dispose(this.deferredSystems);
    this.systems = [];
    this.deferredSystems = [];
    this.registry.clear();
  }

  setGameMode(mode: GameMode, options?: { createPlayerSquad?: boolean }): void {
    const createPlayerSquad = options?.createPlayerSquad ?? true;
    // Set flag for player squad creation BEFORE mode change
    this.combatantSystem.shouldCreatePlayerSquad = createPlayerSquad;
    if (!createPlayerSquad) {
      this.combatantSystem.playerSquadId = undefined;
    }

    // Reset environment systems for new match
    if (this.weatherSystem) {
      this.weatherSystem.resetState();
    }

    // Set weather config for mode
    const config = getGameModeConfig(mode);
    if (this.waterSystem) {
      const waterEnabled = config.waterEnabled !== false;
      this.waterSystem.setEnabled(waterEnabled);
      if (waterEnabled && typeof this.waterSystem.setWorldSize === 'function') {
        this.waterSystem.setWorldSize(config.worldSize);
      }
    }
    if (this.weatherSystem) {
      this.weatherSystem.setWeatherConfig(config.weather);
    }

    // This will trigger reseedForcesForMode() which respawns forces
    this.gameModeManager.setGameMode(mode);

    // After forces are spawned, setup the player squad controller
    if (createPlayerSquad) {
      this.waitForPlayerSquad();
    }
  }

  private waitForPlayerSquad(maxRetries = 20, interval = 100): void {
    let attempts = 0;

    const check = () => {
      attempts++;
      const squadManager = this.combatantSystem.squadManager;
      const playerSquadId = this.combatantSystem.playerSquadId;
      const squad = playerSquadId ? squadManager?.getSquad(playerSquadId) : undefined;

      if (playerSquadId && squad) {
        this.setupPlayerSquad();
        return;
      }

      if (attempts < maxRetries) {
        setTimeout(check, interval);
        return;
      }

      Logger.warn('core', `Player squad not ready after ${maxRetries} retries`);
    };

    check();
  }

  private setupPlayerSquad(): void {
    const squadManager = this.combatantSystem.squadManager;
    const playerSquadId = this.combatantSystem.playerSquadId;

    if (!squadManager || !playerSquadId) {
      Logger.warn('core', ' Squad manager or player squad not found');
      return;
    }

    const squad = squadManager.getSquad(playerSquadId);
    if (!squad) {
      Logger.warn('core', ' Player squad not found in squad manager');
      return;
    }

    // Assign to player controller
    this.playerSquadController.assignPlayerSquad(playerSquadId);

    // Pass to renderer and minimap
    const renderer = this.combatantSystem.combatantRenderer;
    if (renderer) {
      renderer.setPlayerSquadId(playerSquadId);
    }

    this.minimapSystem.setPlayerSquadId(playerSquadId);
    this.fullMapSystem.setPlayerSquadId(playerSquadId);

    Logger.info('core', ` Player squad setup complete: ${squad.id} with ${squad.members.length} members`);
  }

  getPlayerSquadController(): PlayerSquadController {
    return this.registry.require('playerSquadController');
  }

  getInventoryManager(): InventoryManager {
    return this.registry.require('inventoryManager');
  }

  getGrenadeSystem(): GrenadeSystem {
    return this.registry.require('grenadeSystem');
  }

  getMortarSystem(): MortarSystem {
    return this.registry.require('mortarSystem');
  }

  getSandbagSystem(): SandbagSystem {
    return this.registry.require('sandbagSystem');
  }

  get assetLoader(): AssetLoader { return this.registry.require('assetLoader'); }
  get terrainSystem(): TerrainSystem { return this.registry.require('terrainSystem'); }
  get globalBillboardSystem(): GlobalBillboardSystem { return this.registry.require('globalBillboardSystem'); }
  get playerController(): PlayerController { return this.registry.require('playerController'); }
  get combatantSystem(): CombatantSystem { return this.registry.require('combatantSystem'); }
  get skybox(): Skybox { return this.registry.require('skybox'); }
  get waterSystem(): WaterSystem { return this.registry.require('waterSystem'); }
  get weatherSystem(): WeatherSystem { return this.registry.require('weatherSystem'); }
  get firstPersonWeapon(): FirstPersonWeapon { return this.registry.require('firstPersonWeapon'); }
  get zoneManager(): ZoneManager { return this.registry.require('zoneManager'); }
  get hudSystem(): HUDSystem { return this.registry.require('hudSystem'); }
  get ticketSystem(): TicketSystem { return this.registry.require('ticketSystem'); }
  get playerHealthSystem(): PlayerHealthSystem { return this.registry.require('playerHealthSystem'); }
  get minimapSystem(): MinimapSystem { return this.registry.require('minimapSystem'); }
  get audioManager(): AudioManager { return this.registry.require('audioManager'); }
  get gameModeManager(): GameModeManager { return this.registry.require('gameModeManager'); }
  get playerRespawnManager(): PlayerRespawnManager { return this.registry.require('playerRespawnManager'); }
  get fullMapSystem(): FullMapSystem { return this.registry.require('fullMapSystem'); }
  get compassSystem(): CompassSystem { return this.registry.require('compassSystem'); }
  get helipadSystem(): HelipadSystem { return this.registry.require('helipadSystem'); }
  get helicopterModel(): HelicopterModel { return this.registry.require('helicopterModel'); }
  get playerSquadController(): PlayerSquadController { return this.registry.require('playerSquadController'); }
  get commandInputManager(): CommandInputManager { return this.registry.require('commandInputManager'); }
  get inventoryManager(): InventoryManager { return this.registry.require('inventoryManager'); }
  get grenadeSystem(): GrenadeSystem { return this.registry.require('grenadeSystem'); }
  get mortarSystem(): MortarSystem { return this.registry.require('mortarSystem'); }
  get sandbagSystem(): SandbagSystem { return this.registry.require('sandbagSystem'); }
  get cameraShakeSystem(): CameraShakeSystem { return this.registry.require('cameraShakeSystem'); }
  get playerSuppressionSystem(): PlayerSuppressionSystem { return this.registry.require('playerSuppressionSystem'); }
  get smokeCloudSystem(): SmokeCloudSystem { return this.registry.require('smokeCloudSystem'); }
  get influenceMapSystem(): InfluenceMapSystem { return this.registry.require('influenceMapSystem'); }
  get ammoSupplySystem(): AmmoSupplySystem { return this.registry.require('ammoSupplySystem'); }
  get footstepAudioSystem(): FootstepAudioSystem { return this.registry.require('footstepAudioSystem'); }
  get radioTransmissionSystem(): RadioTransmissionSystem { return this.registry.require('radioTransmissionSystem'); }
  get loadoutService(): LoadoutService { return this.registry.require('loadoutService'); }
  get warSimulator(): WarSimulator { return this.registry.require('warSimulator'); }
  get strategicFeedback(): StrategicFeedback { return this.registry.require('strategicFeedback'); }
  get worldFeatureSystem(): WorldFeatureSystem { return this.registry.require('worldFeatureSystem'); }
  get animalSystem(): AnimalSystem { return this.registry.require('animalSystem'); }
  get navmeshSystem(): NavmeshSystem { return this.registry.require('navmeshSystem'); }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} init timed out after ${ms}ms`)), ms)
    ),
  ]);
}
