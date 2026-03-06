import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Alliance, getAlliance, getEnemyAlliance } from '../combat/types';
import { ZoneManager, ZoneState, type CaptureZone } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { RespawnUI } from './RespawnUI';
import { RespawnMapController } from './RespawnMapController';
import type { IFirstPersonWeapon, IPlayerController, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import { LoadoutService } from './LoadoutService';
import {
  resolveInitialSpawnPosition,
  resolveRespawnFallbackPosition
} from '../world/runtime/ModeSpawnResolver';
import {
  createDeploySession,
  DeploySessionKind,
  DeploySessionModel
} from '../world/runtime/DeployFlowSession';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { GameMode } from '../../config/gameModeTypes';
import type { LoadoutFieldKey, PlayerLoadout } from '../../ui/loadout/LoadoutTypes';

export class InitialDeployCancelledError extends Error {
  constructor() {
    super('Initial deploy cancelled');
    this.name = 'InitialDeployCancelledError';
  }
}

export class PlayerRespawnManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private playerHealthSystem?: PlayerHealthSystem;
  private gameModeManager?: GameModeManager;
  private playerController?: IPlayerController;
  private firstPersonWeapon?: IFirstPersonWeapon;
  private inventoryManager?: InventoryManager;
  private warSimulator?: WarSimulator;
  private terrainSystem?: ITerrainRuntime;
  private loadoutService?: LoadoutService;
  private grenadeSystem?: GrenadeSystem;

  // Respawn state
  private isRespawnUIVisible = false;
  private respawnTimer = 0;
  private selectedSpawnPoint?: string;
  private availableSpawnPoints: Array<{ id: string; name: string; position: THREE.Vector3; safe: boolean }> = [];
  private lastTimerDisplaySecond: number = -1;
  private lastTimerDisplayHasSelection = false;
  private deathCount = 0;
  private respawnCount = 0;
  private deploySession?: DeploySessionModel;
  private activeDeployFlowKind: DeploySessionKind | null = null;
  private pendingInitialDeployResolve?: (position: THREE.Vector3) => void;
  private pendingInitialDeployReject?: (error: Error) => void;

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
    this.respawnUI.setCancelClickCallback(() => {
      this.cancelActiveDeployFlow();
    });
    this.respawnUI.setLoadoutChangeCallback((field, direction) => {
      this.handleLoadoutChange(field, direction);
    });
    this.respawnUI.setPresetCycleCallback((direction) => {
      this.handlePresetCycle(direction);
    });
    this.respawnUI.setPresetSaveCallback(() => {
      this.handlePresetSave();
    });

    this.mapController.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.selectSpawnPointOnMap(zoneId, zoneName);
    });
  }



  update(deltaTime: number): void {
    if (this.isRespawnUIVisible && this.respawnTimer > 0) {
      this.respawnTimer -= deltaTime;
      const currentSecond = Math.max(0, Math.ceil(this.respawnTimer));
      const hasSelection = !!this.selectedSpawnPoint;
      if (
        currentSecond !== this.lastTimerDisplaySecond
        || hasSelection !== this.lastTimerDisplayHasSelection
      ) {
        this.updateTimerDisplay();
      }
    }
  }

  /** Cancel any pending respawn and hide UI (for match restart) */
  cancelPendingRespawn(): void {
    this.respawnTimer = 0;
    if (this.activeDeployFlowKind === 'initial') {
      this.cancelInitialDeploy(new InitialDeployCancelledError());
      return;
    }
    if (this.isRespawnUIVisible) {
      this.hideRespawnUI();
    }
  }

  dispose(): void {
    if (this.activeDeployFlowKind === 'initial' && this.pendingInitialDeployReject) {
      this.cancelInitialDeploy(new InitialDeployCancelledError());
    } else {
      this.hideRespawnUI();
    }
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

  setLoadoutService(loadoutService: LoadoutService): void {
    this.loadoutService = loadoutService;
    if (this.isRespawnUIVisible) {
      this.syncLoadoutPreview();
    }
  }

  setGrenadeSystem(grenadeSystem: GrenadeSystem): void {
    this.grenadeSystem = grenadeSystem;
  }

  setWarSimulator(warSimulator: WarSimulator): void {
    this.warSimulator = warSimulator;
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
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
    const playerAlliance = this.getCurrentAlliance();

    const zones = this.zoneManager.getAllZones().filter(z => {
      return this.isZoneSpawnableForAlliance(z, playerAlliance, canSpawnAtZones);
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
    const playerAlliance = this.getCurrentAlliance();
    return zones.some(zone => this.isZoneSpawnableForAlliance(zone, playerAlliance, true) && !zone.isHomeBase);
  }

  respawnAtBase(): void {
    if (!this.zoneManager) {
      this.respawn(new THREE.Vector3(0, 5, -50));
      return;
    }

    const pressureSpawn = this.getPolicyDrivenInsertionSuggestion();
    if (pressureSpawn) {
      pressureSpawn.y = 5;
      this.respawn(pressureSpawn);
      return;
    }

    const playerAlliance = this.getCurrentAlliance();
    const homeBase = this.zoneManager.getAllZones().find(
      z => z.isHomeBase && z.owner !== null && getAlliance(z.owner) === playerAlliance
    );

    const basePos = homeBase ? homeBase.position.clone() : new THREE.Vector3(0, 5, -50);
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

  beginInitialDeploy(): Promise<THREE.Vector3> {
    if (this.isRespawnUIVisible) {
      return Promise.reject(new Error('Deploy UI is already active'));
    }

    this.respawnTimer = 0;
    return new Promise((resolve, reject) => {
      this.pendingInitialDeployResolve = resolve;
      this.pendingInitialDeployReject = reject;
      this.showDeployUI('initial');
    });
  }

  private respawn(position: THREE.Vector3): void {
    // Ensure spawn position is at correct terrain height
    if (!this.terrainSystem) {
      throw new Error('PlayerRespawnManager requires terrainSystem before terrain grounding');
    }
    const terrainHeight = this.terrainSystem.getHeightAt(position.x, position.z);
    position.y = terrainHeight + 2; // Add player height offset

    // Move player to spawn position
    if (this.playerController) {
      if (typeof this.playerController.setPosition === 'function') {
        this.playerController.setPosition(position, 'respawn.manager');
      }
      if (typeof this.playerController.enableControls === 'function') {
        this.playerController.enableControls();
      }
    }

    this.applyActiveLoadout();

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
    this.respawnCount++;

    // Trigger callback
    if (this.onRespawnCallback) {
      this.onRespawnCallback(position);
    }
  }

  onPlayerDeath(): void {
    Logger.info('player', ' Player eliminated!');
    this.deathCount++;

    // Re-check game mode when player dies in case it changed
    if (this.gameModeManager) {
      const currentGameMode = this.gameModeManager.getCurrentMode();
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
    this.showDeployUI('respawn');

    // Trigger callback
    if (this.onDeathCallback) {
      this.onDeathCallback();
    }
  }

  private showDeployUI(kind: DeploySessionKind): void {
    if (this.isRespawnUIVisible) return;

    this.isRespawnUIVisible = true;
    this.activeDeployFlowKind = kind;
    this.syncLoadoutContext();
    this.deploySession = this.gameModeManager?.getDeploySession?.(kind)
      ?? createDeploySession(getGameModeDefinition(GameMode.ZONE_CONTROL), kind);
    this.respawnUI.configureSession(this.deploySession);
    this.respawnUI.setMapInteractionEnabled(this.deploySession.allowSpawnSelection);
    this.syncLoadoutPreview();

    // Update available spawn points
    this.updateAvailableSpawnPoints();

    // Show the UI
    this.respawnUI.show();

    // Show appropriate map based on game mode
    const mapContainer = this.respawnUI.getMapContainer();
    this.mapController.showMap(mapContainer);

    this.selectedSpawnPoint = undefined;
    this.applyInitialSpawnSelection(kind === 'initial');
    this.lastTimerDisplaySecond = -1;
    this.lastTimerDisplayHasSelection = false;

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
    const playerAlliance = this.getCurrentAlliance();

    this.availableSpawnPoints = zones
      .filter(z => {
        return this.isZoneSpawnableForAlliance(z, playerAlliance, canSpawnAtZones);
      })
      .map(z => ({
        id: z.id,
        name: z.name,
        position: z.position.clone(),
        safe: true
      }));

    if (this.availableSpawnPoints.length === 0) {
      this.availableSpawnPoints = [{
        id: 'default',
        name: 'Base',
        position: new THREE.Vector3(0, 5, -50),
        safe: true
      }];
    }
  }

  private selectSpawnPointOnMap(zoneId: string, zoneName: string): void {
    if (this.deploySession && !this.deploySession.allowSpawnSelection) {
      return;
    }
    this.selectedSpawnPoint = zoneId;
    this.respawnUI.updateSelectedSpawn(zoneName);
    this.updateTimerDisplay();
  }

  private confirmRespawn(): void {
    if (!this.selectedSpawnPoint) return;

    const spawnPoint = this.availableSpawnPoints.find(p => p.id === this.selectedSpawnPoint);
    if (!spawnPoint) return;

    Logger.info('player', ` Deploying at ${spawnPoint.name}`);
    const flowKind = this.activeDeployFlowKind;
    this.hideRespawnUI();
    const finalPosition = this.createDeployPosition(spawnPoint.position);

    if (flowKind === 'initial') {
      const resolve = this.pendingInitialDeployResolve;
      this.pendingInitialDeployResolve = undefined;
      this.pendingInitialDeployReject = undefined;
      resolve?.(finalPosition);
      return;
    }

    this.respawn(finalPosition);
  }


  private hideRespawnUI(): void {
    this.isRespawnUIVisible = false;
    this.respawnUI.hide();
    this.selectedSpawnPoint = undefined;
    this.deploySession = undefined;
    this.activeDeployFlowKind = null;
    this.mapController.clearSelection();
    this.mapController.stopMapUpdateInterval();
  }

  private cancelActiveDeployFlow(): void {
    if (this.activeDeployFlowKind !== 'initial') {
      return;
    }

    this.cancelInitialDeploy(new InitialDeployCancelledError());
  }

  private cancelInitialDeploy(error: Error): void {
    const reject = this.pendingInitialDeployReject;
    this.pendingInitialDeployResolve = undefined;
    this.pendingInitialDeployReject = undefined;
    this.hideRespawnUI();
    reject?.(error);
  }

  private updateTimerDisplay(): void {
    const currentSecond = Math.max(0, Math.ceil(this.respawnTimer));
    const hasSelection = !!this.selectedSpawnPoint;
    this.lastTimerDisplaySecond = currentSecond;
    this.lastTimerDisplayHasSelection = hasSelection;
    this.respawnUI.updateTimerDisplay(this.respawnTimer, hasSelection);
  }

  private handleLoadoutChange(field: LoadoutFieldKey, direction: 1 | -1): void {
    if (!this.deploySession?.allowLoadoutEditing || !this.loadoutService) {
      return;
    }

    const updatedLoadout = this.updateLoadoutField(field, direction);
    this.inventoryManager?.setLoadout(updatedLoadout);
    this.respawnUI.updateLoadout(updatedLoadout);
    this.syncLoadoutPresentation();
  }

  private handlePresetCycle(direction: 1 | -1): void {
    if (!this.deploySession?.allowLoadoutEditing || !this.loadoutService) {
      return;
    }

    const updatedLoadout = this.loadoutService.cyclePreset(direction);
    this.inventoryManager?.setLoadout(updatedLoadout);
    this.respawnUI.updateLoadout(updatedLoadout);
    this.syncLoadoutPresentation();
  }

  private handlePresetSave(): void {
    if (!this.deploySession?.allowLoadoutEditing || !this.loadoutService) {
      return;
    }

    this.loadoutService.saveCurrentToActivePreset();
    this.syncLoadoutPresentation();
  }

  private applyInitialSpawnSelection(preselectDefaultSpawn: boolean): void {
    if (!preselectDefaultSpawn && this.deploySession?.allowSpawnSelection !== false) {
      this.respawnUI.resetSelectedSpawn();
      return;
    }

    const fallbackSpawn = this.getPreferredDeploySpawnPoint();
    if (!fallbackSpawn) {
      this.respawnUI.resetSelectedSpawn();
      return;
    }

    this.selectedSpawnPoint = fallbackSpawn.id;
    this.respawnUI.updateSelectedSpawn(fallbackSpawn.name);
  }

  private getPreferredDeploySpawnPoint(): { id: string; name: string; position: THREE.Vector3; safe: boolean } | undefined {
    if (this.availableSpawnPoints.length === 0) {
      return undefined;
    }

    const definition = this.gameModeManager?.getCurrentDefinition?.();
    if (!definition) {
      return this.availableSpawnPoints[0];
    }

    const target = resolveInitialSpawnPosition(definition, this.getCurrentAlliance());
    let preferred = this.availableSpawnPoints[0];
    let nearestDist = preferred.position.distanceToSquared(target);

    for (let i = 1; i < this.availableSpawnPoints.length; i++) {
      const candidate = this.availableSpawnPoints[i];
      const dist = candidate.position.distanceToSquared(target);
      if (dist < nearestDist) {
        preferred = candidate;
        nearestDist = dist;
      }
    }

    return preferred;
  }

  private createDeployPosition(basePosition: THREE.Vector3): THREE.Vector3 {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      2,
      (Math.random() - 0.5) * 10
    );
    return basePosition.clone().add(offset);
  }

  getPolicyDrivenInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    const respawnPolicy = this.gameModeManager?.getRespawnPolicy();
    if (respawnPolicy?.contactAssistStyle !== 'pressure_front' && respawnPolicy?.fallbackRule !== 'pressure_front') {
      return null;
    }

    const pressureSpawn = this.getPolicyDrivenPressureSpawnPosition();
    if (!pressureSpawn) return null;
    const minEnemy250 = Math.max(0, Number(options?.minOpfor250 ?? 0));
    if (minEnemy250 > 0) {
      const enemy250 = this.countNearbyAgents(pressureSpawn, 250, getEnemyAlliance(this.getCurrentAlliance()));
      if (enemy250 < minEnemy250) {
        return null;
      }
    }
    return pressureSpawn ? pressureSpawn.clone() : null;
  }

  getAShauPressureInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    return this.getPolicyDrivenInsertionSuggestion(options);
  }

  private getPolicyDrivenPressureSpawnPosition(): THREE.Vector3 | null {
    if (!this.zoneManager) return null;
    const respawnPolicy = this.gameModeManager?.getRespawnPolicy();
    if (!respawnPolicy) return null;
    return resolveRespawnFallbackPosition(respawnPolicy, {
      zones: this.zoneManager.getAllZones(),
      alliance: this.getCurrentAlliance(),
      warSimulator: this.warSimulator,
      terrainReadyAt: (x: number, z: number) => this.isTerrainReadyAt(x, z)
    });
  }

  private countNearbyAgents(center: THREE.Vector3, radius: number, alliance: Alliance): number {
    if (!this.warSimulator || !this.warSimulator.isEnabled()) return 0;
    const r2 = radius * radius;
    let count = 0;
    for (const agent of this.warSimulator.getAllAgents().values()) {
      if (!agent.alive || getAlliance(agent.faction) !== alliance) continue;
      const dx = agent.x - center.x;
      const dz = agent.z - center.z;
      if ((dx * dx + dz * dz) <= r2) count++;
    }
    return count;
  }

  private isTerrainReadyAt(x: number, z: number): boolean {
    if (!this.terrainSystem) {
      return true;
    }
    return this.terrainSystem.isTerrainReady() && this.terrainSystem.hasTerrainAt(x, z);
  }

  getSessionRespawnStats(): { deaths: number; respawns: number } {
    return {
      deaths: this.deathCount,
      respawns: this.respawnCount
    };
  }

  private syncLoadoutPreview(): void {
    const editingEnabled = !!this.loadoutService && !!this.deploySession?.allowLoadoutEditing;
    this.respawnUI.setLoadoutEditingEnabled(editingEnabled);

    const loadout = this.loadoutService?.getCurrentLoadout();
    if (loadout) {
      this.inventoryManager?.setLoadout(loadout);
      this.respawnUI.updateLoadout(loadout);
    }

    this.syncLoadoutPresentation();
  }

  private updateLoadoutField(field: LoadoutFieldKey, direction: 1 | -1): PlayerLoadout {
    if (!this.loadoutService) {
      throw new Error('Loadout service is required before editing deploy loadouts');
    }
    return this.loadoutService.cycleField(field, direction);
  }

  private applyActiveLoadout(): void {
    if (this.loadoutService) {
      this.loadoutService.applyToRuntime({
        inventoryManager: this.inventoryManager,
        firstPersonWeapon: this.firstPersonWeapon,
        grenadeSystem: this.grenadeSystem
      });
      return;
    }

    this.inventoryManager?.reset();
  }

  private syncLoadoutContext(): void {
    if (!this.loadoutService) {
      return;
    }

    const definition = this.gameModeManager?.getCurrentDefinition?.();
    if (!definition) {
      return;
    }

    const currentContext = this.loadoutService.getContext();
    if (currentContext.mode === definition.id) {
      this.loadoutService.setContextFromDefinition(definition, currentContext.alliance, currentContext.faction);
      return;
    }

    this.loadoutService.setContextFromDefinition(definition);
  }

  private syncLoadoutPresentation(): void {
    if (!this.loadoutService) {
      return;
    }

    this.respawnUI.updateLoadoutPresentation(this.loadoutService.getPresentationModel());
  }

  private getCurrentAlliance(): Alliance {
    return this.loadoutService?.getContext().alliance ?? Alliance.BLUFOR;
  }

  private isZoneSpawnableForAlliance(
    zone: Pick<CaptureZone, 'isHomeBase' | 'owner' | 'state'>,
    alliance: Alliance,
    allowControlledZoneSpawns: boolean
  ): boolean {
    if (zone.isHomeBase) {
      return zone.owner !== null && getAlliance(zone.owner) === alliance;
    }

    if (!allowControlledZoneSpawns) {
      return false;
    }

    return alliance === Alliance.BLUFOR
      ? zone.state === ZoneState.US_CONTROLLED
      : zone.state === ZoneState.OPFOR_CONTROLLED;
  }
}
