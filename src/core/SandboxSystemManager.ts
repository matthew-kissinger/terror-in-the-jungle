import { Logger } from '../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../types';
import { AssetLoader } from '../systems/assets/AssetLoader';
import { PlayerController } from '../systems/player/PlayerController';
import { CombatantSystem } from '../systems/combat/CombatantSystem';
import { Skybox } from '../systems/environment/Skybox';
import { ImprovedChunkManager } from '../systems/terrain/ImprovedChunkManager';
import { GPUTerrain } from '../systems/terrain/GPUTerrain';
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
import { GameMode, getGameModeConfig } from '../config/gameModes';
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
import { InfluenceMapSystem } from '../systems/combat/InfluenceMapSystem';
import { AmmoSupplySystem } from '../systems/weapons/AmmoSupplySystem';
import { WeatherSystem } from '../systems/environment/WeatherSystem';
import { DayNightCycle } from '../systems/environment/DayNightCycle';
import { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';
import { SystemInitializer, SystemReferences } from './SystemInitializer';
import { SystemConnector } from './SystemConnector';
import { SystemUpdater } from './SystemUpdater';
import { SystemDisposer } from './SystemDisposer';

export class SandboxSystemManager {
  private systems: GameSystem[] = [];
  private scene?: THREE.Scene;
  
  private initializer = new SystemInitializer();
  private connector = new SystemConnector();
  private updater = new SystemUpdater();
  private disposer = new SystemDisposer();
  
  // System references object for passing to modules
  private refs: SystemReferences = {} as SystemReferences;

  // Game systems
  public assetLoader!: AssetLoader;
  public chunkManager!: ImprovedChunkManager;
  public gpuTerrain!: GPUTerrain;
  public globalBillboardSystem!: GlobalBillboardSystem;
  public playerController!: PlayerController;
  public combatantSystem!: CombatantSystem;
  public skybox!: Skybox;
  public waterSystem!: WaterSystem;
  public weatherSystem!: WeatherSystem;
  public dayNightCycle!: DayNightCycle;
  public firstPersonWeapon!: FirstPersonWeapon;
  public zoneManager!: ZoneManager;
  public hudSystem!: HUDSystem;
  public ticketSystem!: TicketSystem;
  public playerHealthSystem!: PlayerHealthSystem;
  public minimapSystem!: MinimapSystem;
  public audioManager!: AudioManager;
  public gameModeManager!: GameModeManager;
  public playerRespawnManager!: PlayerRespawnManager;
  public fullMapSystem!: FullMapSystem;
  public compassSystem!: CompassSystem;
  public helipadSystem!: HelipadSystem;
  public helicopterModel!: HelicopterModel;
  public playerSquadController!: PlayerSquadController;
  public inventoryManager!: InventoryManager;
  public grenadeSystem!: GrenadeSystem;
  public mortarSystem!: MortarSystem;
  public sandbagSystem!: SandbagSystem;
  public cameraShakeSystem!: CameraShakeSystem;
  public playerSuppressionSystem!: PlayerSuppressionSystem;
  public influenceMapSystem!: InfluenceMapSystem;
  public ammoSupplySystem!: AmmoSupplySystem;
  public footstepAudioSystem!: FootstepAudioSystem;
  // public voiceCalloutSystem!: VoiceCalloutSystem; // Disabled for performance

  async initializeSystems(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onProgress: (phase: string, progress: number) => void,
    sandboxRenderer?: any
  ): Promise<void> {
    // Initialize all systems
    const result = await this.initializer.initializeSystems(
      this.refs,
      scene,
      camera,
      onProgress,
      sandboxRenderer
    );

    // Store systems and scene
    this.systems = result.systems;
    this.scene = result.scene;

    // Copy initialized references to public properties
    this.assetLoader = this.refs.assetLoader;
    this.chunkManager = this.refs.chunkManager;
    this.globalBillboardSystem = this.refs.globalBillboardSystem;
    this.playerController = this.refs.playerController;
    this.combatantSystem = this.refs.combatantSystem;
    this.skybox = this.refs.skybox;
    this.waterSystem = this.refs.waterSystem;
    this.weatherSystem = this.refs.weatherSystem;
    this.dayNightCycle = this.refs.dayNightCycle;
    this.firstPersonWeapon = this.refs.firstPersonWeapon;
    this.zoneManager = this.refs.zoneManager;
    this.hudSystem = this.refs.hudSystem;
    this.ticketSystem = this.refs.ticketSystem;
    this.playerHealthSystem = this.refs.playerHealthSystem;
    this.minimapSystem = this.refs.minimapSystem;
    this.audioManager = this.refs.audioManager;
    this.gameModeManager = this.refs.gameModeManager;
    this.playerRespawnManager = this.refs.playerRespawnManager;
    this.fullMapSystem = this.refs.fullMapSystem;
    this.compassSystem = this.refs.compassSystem;
    this.helipadSystem = this.refs.helipadSystem;
    this.helicopterModel = this.refs.helicopterModel;
    this.playerSquadController = this.refs.playerSquadController;
    this.inventoryManager = this.refs.inventoryManager;
    this.grenadeSystem = this.refs.grenadeSystem;
    this.mortarSystem = this.refs.mortarSystem;
    this.sandbagSystem = this.refs.sandbagSystem;
    this.cameraShakeSystem = this.refs.cameraShakeSystem;
    this.playerSuppressionSystem = this.refs.playerSuppressionSystem;
    this.influenceMapSystem = this.refs.influenceMapSystem;
    this.ammoSupplySystem = this.refs.ammoSupplySystem;
    this.footstepAudioSystem = this.refs.footstepAudioSystem;

    // Connect systems together
    this.connector.connectSystems(this.refs, scene, camera, sandboxRenderer);
  }

  async preGenerateSpawnArea(spawnPos: THREE.Vector3): Promise<void> {
    Logger.info('core', `Pre-generating spawn areas for both factions...`);

    if (this.chunkManager) {
      // Generate US base chunks
      const usBasePos = new THREE.Vector3(0, 0, -50);
      Logger.info('core', '🇺🇸 Generating US base chunks...');
      this.chunkManager.updatePlayerPosition(usBasePos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate OPFOR base chunks
      const opforBasePos = new THREE.Vector3(0, 0, 145);
      Logger.info('core', '🚩 Generating OPFOR base chunks...');
      this.chunkManager.updatePlayerPosition(opforBasePos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate middle battlefield chunks
      const centerPos = new THREE.Vector3(0, 0, 50);
      Logger.info('core', '⚔️ Generating battlefield chunks...');
      this.chunkManager.updatePlayerPosition(centerPos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Return to player spawn position
      this.chunkManager.updatePlayerPosition(spawnPos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initialize zones after chunk generation
      Logger.info('core', '🚩 Initializing zones after chunk generation...');
      this.zoneManager.initializeZones();
    }
  }

  updateSystems(deltaTime: number, gameStarted: boolean = true): void {
    this.updater.updateSystems(this.refs, this.systems, this.scene, deltaTime, gameStarted);
  }

  getSystemTimings(): Array<{ name: string; timeMs: number; budgetMs: number }> {
    return this.updater.getSystemTimings();
  }

  getSystems(): GameSystem[] {
    return this.systems;
  }

  dispose(): void {
    this.disposer.dispose(this.systems);
  }

  setGameMode(mode: GameMode, options?: { createPlayerSquad?: boolean }): void {
    const createPlayerSquad = options?.createPlayerSquad ?? true;
    // Set flag for player squad creation BEFORE mode change
    (this.combatantSystem as any).shouldCreatePlayerSquad = createPlayerSquad;
    if (!createPlayerSquad) {
      (this.combatantSystem as any).playerSquadId = undefined;
    }

    // Set weather config for mode
    const config = getGameModeConfig(mode);
    if (this.weatherSystem) {
      this.weatherSystem.setWeatherConfig(config.weather);
    }

    // This will trigger reseedForcesForMode() which respawns forces
    this.gameModeManager.setGameMode(mode);

    // After forces are spawned, setup the player squad controller
    if (createPlayerSquad) {
      setTimeout(() => this.setupPlayerSquad(), 500);
    }
  }

  private setupPlayerSquad(): void {
    const squadManager = (this.combatantSystem as any).squadManager;
    const playerSquadId = (this.combatantSystem as any).playerSquadId;

    if (!squadManager || !playerSquadId) {
      Logger.warn('core', '⚠️ Squad manager or player squad not found');
      return;
    }

    const squad = squadManager.getSquad(playerSquadId);
    if (!squad) {
      Logger.warn('core', '⚠️ Player squad not found in squad manager');
      return;
    }

    // Assign to player controller
    this.playerSquadController.assignPlayerSquad(playerSquadId);

    // Pass to renderer and minimap
    const renderer = (this.combatantSystem as any).combatantRenderer;
    if (renderer) {
      renderer.setPlayerSquadId(playerSquadId);
    }

    this.minimapSystem.setPlayerSquadId(playerSquadId);

    Logger.info('core', `✅ Player squad setup complete: ${squad.id} with ${squad.members.length} members`);
  }

  getPlayerSquadController(): PlayerSquadController {
    return this.playerSquadController;
  }

  getInventoryManager(): InventoryManager {
    return this.inventoryManager;
  }

  getGrenadeSystem(): GrenadeSystem {
    return this.grenadeSystem;
  }

  getMortarSystem(): MortarSystem {
    return this.mortarSystem;
  }

  getSandbagSystem(): SandbagSystem {
    return this.sandbagSystem;
  }
}
