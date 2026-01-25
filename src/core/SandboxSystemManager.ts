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
import { GameMode } from '../config/gameModes';
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

export class SandboxSystemManager {
  private systems: GameSystem[] = [];

  // Game systems
  public assetLoader!: AssetLoader;
  public chunkManager!: ImprovedChunkManager;
  public globalBillboardSystem!: GlobalBillboardSystem;
  public playerController!: PlayerController;
  public combatantSystem!: CombatantSystem;
  public skybox!: Skybox;
  public waterSystem!: WaterSystem;
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

  async initializeSystems(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onProgress: (phase: string, progress: number) => void,
    sandboxRenderer?: any
  ): Promise<void> {
    console.log('🔧 Initializing game systems...');

    // Phase 1: Core systems
    onProgress('core', 0);

    this.assetLoader = new AssetLoader();
    onProgress('core', 0.5);

    this.globalBillboardSystem = new GlobalBillboardSystem(scene, camera, this.assetLoader);
    this.chunkManager = new ImprovedChunkManager(scene, camera, this.assetLoader, this.globalBillboardSystem);
    onProgress('core', 1);

    // Phase 2: Load textures
    onProgress('textures', 0);
    await this.assetLoader.init();
    onProgress('textures', 1);

    // Phase 3: Load audio
    onProgress('audio', 0);
    this.audioManager = new AudioManager(scene, camera);
    await this.audioManager.init();
    onProgress('audio', 1);

    // Phase 4: Initialize world systems
    onProgress('world', 0);

    this.playerController = new PlayerController(camera);
    this.combatantSystem = new CombatantSystem(scene, camera, this.globalBillboardSystem, this.assetLoader, this.chunkManager);
    this.skybox = new Skybox(scene);
    this.waterSystem = new WaterSystem(scene, this.assetLoader);
    this.firstPersonWeapon = new FirstPersonWeapon(scene, camera, this.assetLoader);
    this.zoneManager = new ZoneManager(scene);
    this.ticketSystem = new TicketSystem();
    this.playerHealthSystem = new PlayerHealthSystem();
    this.playerRespawnManager = new PlayerRespawnManager(scene, camera);
    this.hudSystem = new HUDSystem(camera, this.ticketSystem, this.playerHealthSystem, this.playerRespawnManager);
    this.minimapSystem = new MinimapSystem(camera);
    this.fullMapSystem = new FullMapSystem(camera);
    this.compassSystem = new CompassSystem(camera);
    this.gameModeManager = new GameModeManager();
    this.helipadSystem = new HelipadSystem(scene);
    this.helicopterModel = new HelicopterModel(scene);

    // Initialize new squad/inventory/grenade systems
    const squadManager = (this.combatantSystem as any).squadManager;
    this.playerSquadController = new PlayerSquadController(squadManager);
    this.inventoryManager = new InventoryManager();
    this.grenadeSystem = new GrenadeSystem(scene, camera, this.chunkManager);
    // Mortar system disabled - to be reimplemented
    this.mortarSystem = new MortarSystem(scene, camera, this.chunkManager); // Disabled but keeping instance
    this.sandbagSystem = new SandbagSystem(scene, camera, this.chunkManager);
    this.cameraShakeSystem = new CameraShakeSystem();

    this.connectSystems(scene, camera, sandboxRenderer);

    // Add systems to update list
    this.systems = [
      this.assetLoader,
      this.audioManager,
      this.globalBillboardSystem,
      this.chunkManager,
      this.waterSystem,
      this.playerController,
      this.firstPersonWeapon,
      this.combatantSystem,
      this.zoneManager,
      this.ticketSystem,
      this.playerHealthSystem,
      this.playerRespawnManager,
      this.minimapSystem,
      this.fullMapSystem,
      this.compassSystem,
      this.hudSystem,
      this.helipadSystem,
      this.helicopterModel,
      this.skybox,
      this.gameModeManager,
      this.playerSquadController,
      this.inventoryManager,
      this.grenadeSystem,
      this.mortarSystem,
      this.sandbagSystem,
      this.cameraShakeSystem
    ];

    onProgress('world', 0.5);

    // Initialize all systems
    for (const system of this.systems) {
      await system.init();
    }

    onProgress('world', 1);
  }

  private connectSystems(scene: THREE.Scene, camera: THREE.PerspectiveCamera, sandboxRenderer?: any): void {
    // Connect systems with chunk manager
    this.playerController.setChunkManager(this.chunkManager);
    this.playerController.setGameModeManager(this.gameModeManager);
    this.playerController.setHelicopterModel(this.helicopterModel);
    this.playerController.setFirstPersonWeapon(this.firstPersonWeapon);
    this.playerController.setHUDSystem(this.hudSystem);
    if (sandboxRenderer) {
      this.playerController.setSandboxRenderer(sandboxRenderer);
    }
    this.combatantSystem.setChunkManager(this.chunkManager);
    this.firstPersonWeapon.setPlayerController(this.playerController);
    this.firstPersonWeapon.setCombatantSystem(this.combatantSystem);
    this.firstPersonWeapon.setHUDSystem(this.hudSystem);
    this.firstPersonWeapon.setZoneManager(this.zoneManager);
    this.firstPersonWeapon.setInventoryManager(this.inventoryManager);
    this.hudSystem.setCombatantSystem(this.combatantSystem);
    this.hudSystem.setZoneManager(this.zoneManager);
    this.hudSystem.setTicketSystem(this.ticketSystem);
    this.ticketSystem.setZoneManager(this.zoneManager);
    this.combatantSystem.setTicketSystem(this.ticketSystem);
    this.combatantSystem.setPlayerHealthSystem(this.playerHealthSystem);
    this.combatantSystem.setZoneManager(this.zoneManager);
    this.combatantSystem.setGameModeManager(this.gameModeManager);
    this.combatantSystem.setHUDSystem(this.hudSystem);
    this.playerHealthSystem.setZoneManager(this.zoneManager);
    this.playerHealthSystem.setTicketSystem(this.ticketSystem);
    this.playerHealthSystem.setPlayerController(this.playerController);
    this.playerHealthSystem.setFirstPersonWeapon(this.firstPersonWeapon);
    this.playerHealthSystem.setCamera(camera);
    this.playerHealthSystem.setRespawnManager(this.playerRespawnManager);
    this.playerHealthSystem.setHUDSystem(this.hudSystem);
    this.minimapSystem.setZoneManager(this.zoneManager);
    this.minimapSystem.setCombatantSystem(this.combatantSystem);
    this.fullMapSystem.setZoneManager(this.zoneManager);
    this.fullMapSystem.setCombatantSystem(this.combatantSystem);
    this.fullMapSystem.setGameModeManager(this.gameModeManager);
    this.zoneManager.setCombatantSystem(this.combatantSystem);
    this.zoneManager.setCamera(camera);
    this.zoneManager.setChunkManager(this.chunkManager);
    this.zoneManager.setHUDSystem(this.hudSystem);

    // Connect audio manager
    this.firstPersonWeapon.setAudioManager(this.audioManager);
    this.combatantSystem.setAudioManager(this.audioManager);

    // Connect respawn manager
    this.playerRespawnManager.setPlayerHealthSystem(this.playerHealthSystem);
    this.playerRespawnManager.setZoneManager(this.zoneManager);
    this.playerRespawnManager.setGameModeManager(this.gameModeManager);
    this.playerRespawnManager.setPlayerController(this.playerController);
    this.playerRespawnManager.setFirstPersonWeapon(this.firstPersonWeapon);
    this.playerRespawnManager.setInventoryManager(this.inventoryManager);

    // Connect helipad system
    this.helipadSystem.setTerrainManager(this.chunkManager);
    this.helipadSystem.setVegetationSystem(this.globalBillboardSystem);
    this.helipadSystem.setGameModeManager(this.gameModeManager);

    // Connect helicopter model
    this.helicopterModel.setTerrainManager(this.chunkManager);
    this.helicopterModel.setHelipadSystem(this.helipadSystem);
    this.helicopterModel.setPlayerController(this.playerController);
    this.helicopterModel.setHUDSystem(this.hudSystem);
    this.helicopterModel.setAudioListener(this.audioManager.getListener());


    // Connect game mode manager to systems
    this.gameModeManager.connectSystems(
      this.zoneManager,
      this.combatantSystem,
      this.ticketSystem,
      this.chunkManager,
      this.minimapSystem
    );

    // Connect camera shake system
    this.playerController.setCameraShakeSystem(this.cameraShakeSystem);

    // Connect weapon systems
    this.grenadeSystem.setCombatantSystem(this.combatantSystem);
    this.grenadeSystem.setInventoryManager(this.inventoryManager);
    this.grenadeSystem.setAudioManager(this.audioManager);
    this.grenadeSystem.setPlayerController(this.playerController);
    this.hudSystem.setGrenadeSystem(this.grenadeSystem);
    // Mortar connections disabled - to be reimplemented
    // this.mortarSystem.setCombatantSystem(this.combatantSystem);
    // this.mortarSystem.setInventoryManager(this.inventoryManager);
    this.sandbagSystem.setInventoryManager(this.inventoryManager);

    const impactEffectsPool = (this.combatantSystem as any).impactEffectsPool;
    if (impactEffectsPool) {
      this.grenadeSystem.setImpactEffectsPool(impactEffectsPool);
      // this.mortarSystem.setImpactEffectsPool(impactEffectsPool); // Disabled
    }

    // Connect PlayerController with all weapon systems
    this.playerController.setInventoryManager(this.inventoryManager);
    this.playerController.setGrenadeSystem(this.grenadeSystem);
    // this.playerController.setMortarSystem(this.mortarSystem); // Disabled
    this.playerController.setSandbagSystem(this.sandbagSystem);

    // Connect combat systems with sandbag system
    const combatantCombat = (this.combatantSystem as any).combatantCombat;
    if (combatantCombat) {
      combatantCombat.setSandbagSystem(this.sandbagSystem);
    }
    const combatantAI = (this.combatantSystem as any).combatantAI;
    if (combatantAI) {
      combatantAI.setSandbagSystem(this.sandbagSystem);
    }
  }

  async preGenerateSpawnArea(spawnPos: THREE.Vector3): Promise<void> {
    console.log(`Pre-generating spawn areas for both factions...`);

    if (this.chunkManager) {
      // Generate US base chunks
      const usBasePos = new THREE.Vector3(0, 0, -50);
      console.log('🇺🇸 Generating US base chunks...');
      this.chunkManager.updatePlayerPosition(usBasePos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate OPFOR base chunks
      const opforBasePos = new THREE.Vector3(0, 0, 145);
      console.log('🚩 Generating OPFOR base chunks...');
      this.chunkManager.updatePlayerPosition(opforBasePos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate middle battlefield chunks
      const centerPos = new THREE.Vector3(0, 0, 50);
      console.log('⚔️ Generating battlefield chunks...');
      this.chunkManager.updatePlayerPosition(centerPos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Return to player spawn position
      this.chunkManager.updatePlayerPosition(spawnPos);
      this.chunkManager.update(0.01);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initialize zones after chunk generation
      console.log('🚩 Initializing zones after chunk generation...');
      this.zoneManager.initializeZones();
    }
  }

  updateSystems(deltaTime: number): void {
    // Update player position in squad controller
    if (this.playerSquadController && this.playerController) {
      this.playerSquadController.updatePlayerPosition(this.playerController.getPosition());

      // Update command position on minimap
      const commandPos = this.playerSquadController.getCommandPosition();
      this.minimapSystem.setCommandPosition(commandPos);
    }

    for (const system of this.systems) {
      system.update(deltaTime);
    }
  }

  getSystems(): GameSystem[] {
    return this.systems;
  }

  dispose(): void {
    for (const system of this.systems) {
      system.dispose();
    }
  }

  setGameMode(mode: GameMode): void {
    // Set flag for player squad creation BEFORE mode change
    (this.combatantSystem as any).shouldCreatePlayerSquad = true;

    // This will trigger reseedForcesForMode() which respawns forces
    this.gameModeManager.setGameMode(mode);

    // After forces are spawned, setup the player squad controller
    setTimeout(() => this.setupPlayerSquad(), 500);
  }

  private setupPlayerSquad(): void {
    const squadManager = (this.combatantSystem as any).squadManager;
    const playerSquadId = (this.combatantSystem as any).playerSquadId;

    if (!squadManager || !playerSquadId) {
      console.warn('⚠️ Squad manager or player squad not found');
      return;
    }

    const squad = squadManager.getSquad(playerSquadId);
    if (!squad) {
      console.warn('⚠️ Player squad not found in squad manager');
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

    console.log(`✅ Player squad setup complete: ${squad.id} with ${squad.members.length} members`);
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