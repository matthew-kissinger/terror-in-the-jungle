import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { RespawnUI } from './RespawnUI';
import { RespawnMapController } from './RespawnMapController';
import type { IFirstPersonWeapon, IPlayerController } from '../../types/SystemInterfaces';

export class PlayerRespawnManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private playerHealthSystem?: PlayerHealthSystem;
  private gameModeManager?: GameModeManager;
  private playerController?: IPlayerController;
  private firstPersonWeapon?: IFirstPersonWeapon;
  private inventoryManager?: InventoryManager;

  // Respawn state
  private isRespawnUIVisible = false;
  private respawnTimer = 0;
  private selectedSpawnPoint?: string;
  private availableSpawnPoints: Array<{ id: string; name: string; position: THREE.Vector3; safe: boolean }> = [];

  // UI and map modules
  private respawnUI: RespawnUI;
  private mapController: RespawnMapController;

  private onRespawnCallback?: (position: THREE.Vector3) => void;
  private onDeathCallback?: () => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.respawnUI = new RespawnUI();
    this.mapController = new RespawnMapController();
  }

  async init(): Promise<void> {
    Logger.info('player', ' Initializing Player Respawn Manager...');
    this.setupUICallbacks();
  }

  private setupUICallbacks(): void {
    this.respawnUI.setRespawnClickCallback(() => {
      this.confirmRespawn();
    });

    this.mapController.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.selectSpawnPointOnMap(zoneId, zoneName);
    });
  }



  update(deltaTime: number): void {
    if (this.isRespawnUIVisible && this.respawnTimer > 0) {
      this.respawnTimer -= deltaTime;
      this.updateTimerDisplay();
    }
  }

  /** Cancel any pending respawn and hide UI (for match restart) */
  cancelPendingRespawn(): void {
    this.respawnTimer = 0;
    if (this.isRespawnUIVisible) {
      this.hideRespawnUI();
    }
  }

  dispose(): void {
    this.hideRespawnUI();
    this.respawnUI.dispose();
    this.mapController.dispose();
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
    this.mapController.setZoneManager(manager);
  }

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
    this.mapController.setGameModeManager(manager);
  }

  setPlayerController(controller: IPlayerController): void {
    this.playerController = controller;
  }

  setFirstPersonWeapon(weapon: IFirstPersonWeapon): void {
    this.firstPersonWeapon = weapon;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setRespawnCallback(callback: (position: THREE.Vector3) => void): void {
    this.onRespawnCallback = callback;
  }

  setDeathCallback(callback: () => void): void {
    this.onDeathCallback = callback;
  }

  getSpawnableZones(): Array<{ id: string; name: string; position: THREE.Vector3 }> {
    if (!this.zoneManager) {
      return [];
    }

    // Check if game mode allows spawning at zones
    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;

    // Filter zones - only US controlled zones (not OPFOR or contested)
    const zones = this.zoneManager.getAllZones().filter(z => {
      // Only allow US bases (not OPFOR bases)
      if (z.isHomeBase && z.owner === Faction.US) return true;
      // Only allow fully US-captured zones (not contested or OPFOR controlled)
      if (canSpawnAtZones && !z.isHomeBase && z.state === ZoneState.US_CONTROLLED) return true;
      return false;
    });

    Logger.info('player', ` Found ${zones.length} spawnable zones:`, zones.map(z => `${z.name} (${z.state})`));

    return zones.map(z => ({
      id: z.id,
      name: z.name,
      position: z.position.clone()
    }));
  }

  canSpawnAtZone(): boolean {
    if (!this.zoneManager || !this.gameModeManager) return false;

    // Check if game mode allows spawning at zones
    if (!this.gameModeManager.canPlayerSpawnAtZones()) {
      return false;
    }

    const zones = this.zoneManager.getAllZones();
    // Only non-base zones that are fully US controlled (not contested or OPFOR)
    return zones.some(zone => zone.state === ZoneState.US_CONTROLLED && !zone.isHomeBase);
  }

  respawnAtBase(): void {
    if (!this.zoneManager) {
      this.respawn(new THREE.Vector3(0, 5, -50));
      return;
    }

    const usBase = this.zoneManager.getAllZones().find(
      z => z.id === 'us_base' || (z.isHomeBase && z.owner === Faction.US)
    );

    const basePos = usBase ? usBase.position.clone() : new THREE.Vector3(0, 5, -50);
    basePos.y = 5;
    this.respawn(basePos);
  }

  respawnAtSpecificZone(zoneId: string): void {
    if (!this.zoneManager) return;

    const zone = this.zoneManager.getAllZones().find(z => z.id === zoneId);
    if (!zone) return;

    const target = zone.position.clone().add(new THREE.Vector3(5, 2, 5));
    this.respawn(target);
  }

  private respawn(position: THREE.Vector3): void {
    // Ensure spawn position is at correct terrain height
    const terrainHeight = getHeightQueryCache().getHeightAt(position.x, position.z);
    position.y = terrainHeight + 2; // Add player height offset

    // Move player to spawn position
    if (this.playerController) {
      if (typeof this.playerController.setPosition === 'function') {
        this.playerController.setPosition(position);
      }
      if (typeof this.playerController.enableControls === 'function') {
        this.playerController.enableControls();
      }
    }

    // Reset inventory (including grenades)
    if (this.inventoryManager) {
      this.inventoryManager.reset();
    }

    // Re-enable weapon
    if (this.firstPersonWeapon && typeof this.firstPersonWeapon.enable === 'function') {
      this.firstPersonWeapon.enable();
    }

    // Apply spawn protection per game mode
    const protection = this.gameModeManager?.getSpawnProtectionDuration() ?? 0;
    if (this.playerHealthSystem && protection > 0) {
      this.playerHealthSystem.applySpawnProtection(protection);
    }

    Logger.info('player', ` Player respawned at ${position.x}, ${position.y}, ${position.z}`);

    // Trigger callback
    if (this.onRespawnCallback) {
      this.onRespawnCallback(position);
    }
  }

  onPlayerDeath(): void {
    Logger.info('player', ' Player eliminated!');

    // Re-check game mode when player dies in case it changed
    if (this.gameModeManager) {
      const currentGameMode = this.gameModeManager.currentMode;
      const worldSize = this.gameModeManager.getWorldSize();
      Logger.info('player', ` Death screen: Current game mode is ${currentGameMode}, world size: ${worldSize}`);
    }

    // Disable player controls
    if (this.playerController && typeof this.playerController.disableControls === 'function') {
      this.playerController.disableControls();
    }

    // Hide weapon
    if (this.firstPersonWeapon && typeof this.firstPersonWeapon.disable === 'function') {
      this.firstPersonWeapon.disable();
    }

    // Start respawn timer
    const respawnTime = this.gameModeManager?.getRespawnTime() ?? 5;
    this.respawnTimer = respawnTime;

    // Show respawn UI immediately
    this.showRespawnUI();

    // Trigger callback
    if (this.onDeathCallback) {
      this.onDeathCallback();
    }
  }

  private showRespawnUI(): void {
    if (this.isRespawnUIVisible) return;

    this.isRespawnUIVisible = true;

    // Update available spawn points
    this.updateAvailableSpawnPoints();

    // Show the UI
    this.respawnUI.show();

    // Show appropriate map based on game mode
    const mapContainer = this.respawnUI.getMapContainer();
    this.mapController.showMap(mapContainer);

    this.selectedSpawnPoint = undefined;
    this.respawnUI.resetSelectedSpawn();

    // Update buttons and timer
    this.updateTimerDisplay();
  }

  private updateAvailableSpawnPoints(): void {
    if (!this.zoneManager) {
      this.availableSpawnPoints = [{
        id: 'default',
        name: 'Base',
        position: new THREE.Vector3(0, 5, -50),
        safe: true
      }];
      return;
    }

    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;
    const zones = this.zoneManager.getAllZones();

    this.availableSpawnPoints = zones
      .filter(z => {
        // Can only spawn at US-owned bases (not OPFOR bases)
        if (z.isHomeBase && z.owner === Faction.US) return true;
        // Can spawn at fully captured zones if game mode allows (must be US controlled, not contested or OPFOR)
        if (canSpawnAtZones && !z.isHomeBase && z.state === ZoneState.US_CONTROLLED) return true;
        return false;
      })
      .map(z => ({
        id: z.id,
        name: z.name,
        position: z.position.clone(),
        safe: true
      }));
  }

  private selectSpawnPointOnMap(zoneId: string, zoneName: string): void {
    this.selectedSpawnPoint = zoneId;
    this.respawnUI.updateSelectedSpawn(zoneName);
    this.updateTimerDisplay();
  }

  private confirmRespawn(): void {
    if (!this.selectedSpawnPoint) return;

    const spawnPoint = this.availableSpawnPoints.find(p => p.id === this.selectedSpawnPoint);
    if (!spawnPoint) return;

    Logger.info('player', ` Deploying at ${spawnPoint.name}`);
    this.hideRespawnUI();

    // Add slight randomization to avoid spawn camping
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      2,
      (Math.random() - 0.5) * 10
    );
    const finalPosition = spawnPoint.position.clone().add(offset);

    this.respawn(finalPosition);
  }


  private hideRespawnUI(): void {
    this.isRespawnUIVisible = false;
    this.respawnUI.hide();
    this.selectedSpawnPoint = undefined;
    this.mapController.clearSelection();
    this.mapController.stopMapUpdateInterval();
  }

  private updateTimerDisplay(): void {
    this.respawnUI.updateTimerDisplay(this.respawnTimer, !!this.selectedSpawnPoint);
  }
}
