import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { getAlliance } from '../combat/types';
import { ZoneManager } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { DeployScreen } from '../../ui/screens/DeployScreen';
import { RespawnMapController } from './RespawnMapController';
import type { IFirstPersonWeapon, IPlayerController, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { HelipadSystem } from '../helicopter/HelipadSystem';
import { LoadoutService } from './LoadoutService';
import {
  createDeploySession,
  DeploySessionKind,
  DeploySessionModel
} from '../world/runtime/DeployFlowSession';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { GameMode } from '../../config/gameModeTypes';
import type { LoadoutFieldKey, PlayerLoadout } from '../../ui/loadout/LoadoutTypes';
import { isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics';
import { InputContextManager } from '../input/InputContextManager';
import type { RespawnSpawnPoint } from './RespawnSpawnPoint';
import { SpawnPointSelector } from './SpawnPointSelector';
import { MissionBriefing } from '../../ui/loading/MissionBriefing';
import type { MissionBriefingInfo } from '../../ui/loading/MissionBriefing';
import { DeployFlowController } from './DeployFlowController';
import { InitialDeployCancelledError } from './InitialDeployCancelledError';

interface PlayerRespawnManagerDependencies {
  playerHealthSystem: PlayerHealthSystem;
  zoneManager: ZoneManager;
  gameModeManager: GameModeManager;
  playerController: IPlayerController;
  firstPersonWeapon: IFirstPersonWeapon;
  inventoryManager: InventoryManager;
  loadoutService: LoadoutService;
  grenadeSystem: GrenadeSystem;
  warSimulator: WarSimulator;
  terrainSystem: ITerrainRuntime;
  helipadSystem: HelipadSystem;
}

export class PlayerRespawnManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private playerHealthSystem?: PlayerHealthSystem;
  private playerController?: IPlayerController;
  private firstPersonWeapon?: IFirstPersonWeapon;
  private inventoryManager?: InventoryManager;
  private terrainSystem?: ITerrainRuntime;
  private loadoutService?: LoadoutService;
  private grenadeSystem?: GrenadeSystem;
  private gameModeManager?: GameModeManager;

  // Respawn state
  private isRespawnUIVisible = false;
  private respawnTimer = 0;
  private availableSpawnPoints: RespawnSpawnPoint[] = [];
  private lastTimerDisplaySecond: number = -1;
  private lastTimerDisplayHasSelection = false;
  private deathCount = 0;
  private respawnCount = 0;
  private readonly deployFlow = new DeployFlowController();

  // UI and map modules
  private respawnUI: DeployScreen;
  private mapController: RespawnMapController;

  // Spawn point selection delegate
  private spawnPointSelector: SpawnPointSelector;

  private onRespawnCallback?: (position: THREE.Vector3) => void;
  private onDeathCallback?: () => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.respawnUI = new DeployScreen();
    this.mapController = new RespawnMapController();
    this.spawnPointSelector = new SpawnPointSelector();
  }

  private get selectedSpawnPoint(): string | undefined {
    return this.deployFlow.getState().selectedSpawnPoint ?? undefined;
  }

  private set selectedSpawnPoint(value: string | undefined) {
    this.deployFlow.setSelectedSpawnPoint(value ?? null);
  }

  private get deploySession(): DeploySessionModel | undefined {
    return this.deployFlow.getState().session ?? undefined;
  }

  private get activeDeployFlowKind(): DeploySessionKind | null {
    return this.deployFlow.getState().kind;
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
    if (this.activeDeployFlowKind === 'initial' && this.deployFlow.getState().hasPendingInitialDeploy) {
      this.cancelInitialDeploy(new InitialDeployCancelledError());
    } else {
      this.hideRespawnUI();
    }
    this.respawnUI.dispose();
    this.mapController.dispose();
  }

  configureDependencies(dependencies: PlayerRespawnManagerDependencies): void {
    this.setPlayerHealthSystem(dependencies.playerHealthSystem);
    this.setZoneManager(dependencies.zoneManager);
    this.setGameModeManager(dependencies.gameModeManager);
    this.setPlayerController(dependencies.playerController);
    this.setFirstPersonWeapon(dependencies.firstPersonWeapon);
    this.setInventoryManager(dependencies.inventoryManager);
    this.setLoadoutService(dependencies.loadoutService);
    this.setGrenadeSystem(dependencies.grenadeSystem);
    this.setWarSimulator(dependencies.warSimulator);
    this.setTerrainSystem(dependencies.terrainSystem);
    this.setHelipadSystem(dependencies.helipadSystem);
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
    this.spawnPointSelector.setZoneManager(manager);
    this.mapController.setZoneManager(manager);
  }

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
    this.spawnPointSelector.setGameModeManager(manager);
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
    this.spawnPointSelector.setLoadoutService(loadoutService);
    if (this.isRespawnUIVisible) {
      this.syncLoadoutPreview();
    }
  }

  setGrenadeSystem(grenadeSystem: GrenadeSystem): void {
    this.grenadeSystem = grenadeSystem;
  }

  setWarSimulator(warSimulator: WarSimulator): void {
    this.spawnPointSelector.setWarSimulator(warSimulator);
  }

  setHelipadSystem(helipadSystem: HelipadSystem): void {
    this.spawnPointSelector.setHelipadSystem(helipadSystem);
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
    this.spawnPointSelector.setTerrainSystem(terrainSystem);
  }

  setRespawnCallback(callback: (position: THREE.Vector3) => void): void {
    this.onRespawnCallback = callback;
  }

  setDeathCallback(callback: () => void): void {
    this.onDeathCallback = callback;
  }

  getSpawnableZones(): Array<{ id: string; name: string; position: THREE.Vector3 }> {
    return this.spawnPointSelector.getSpawnableZones();
  }

  canSpawnAtZone(): boolean {
    return this.spawnPointSelector.canSpawnAtZone();
  }

  respawnAtBase(): void {
    if (!this.zoneManager) {
      this.respawn(new THREE.Vector3(0, 5, -50));
      return;
    }

    const pressureSpawn = this.spawnPointSelector.getPolicyDrivenInsertionSuggestion();
    if (pressureSpawn) {
      pressureSpawn.y = 5;
      this.respawn(pressureSpawn);
      return;
    }

    const playerAlliance = this.spawnPointSelector.getCurrentAlliance();
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

  async beginInitialDeploy(): Promise<THREE.Vector3> {
    if (this.isRespawnUIVisible) {
      return Promise.reject(new Error('Deploy UI is already active'));
    }

    // Show mission briefing for A Shau Valley before the deploy screen
    const currentMode = this.gameModeManager?.getCurrentMode();
    if (currentMode === GameMode.A_SHAU_VALLEY) {
      await this.showMissionBriefing();
    }

    this.respawnTimer = 0;
    return this.deployFlow.beginInitialDeploy(() => {
      this.showDeployUI('initial');
    });
  }

  getPolicyDrivenInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    return this.spawnPointSelector.getPolicyDrivenInsertionSuggestion(options);
  }

  getAShauPressureInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    return this.spawnPointSelector.getAShauPressureInsertionSuggestion(options);
  }

  getSessionRespawnStats(): { deaths: number; respawns: number } {
    return {
      deaths: this.deathCount,
      respawns: this.respawnCount
    };
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

  // --- Private methods ---------------------------------------------------

  /** Refresh available spawn points from the selector. */
  private updateAvailableSpawnPoints(): void {
    this.availableSpawnPoints = this.spawnPointSelector.buildAvailableSpawnPoints(
      this.deploySession, this.activeDeployFlowKind
    );
  }

  private respawn(position: THREE.Vector3): void {
    // Ensure spawn position is at correct terrain height
    if (!this.terrainSystem) {
      throw new Error('PlayerRespawnManager requires terrainSystem before terrain grounding');
    }
    const terrainHeight = this.terrainSystem.getEffectiveHeightAt(position.x, position.z);
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

  private showDeployUI(kind: DeploySessionKind): void {
    if (this.isRespawnUIVisible) return;

    this.isRespawnUIVisible = true;
    this.syncLoadoutContext();
    const deploySession = this.gameModeManager?.getDeploySession?.(kind)
      ?? createDeploySession(getGameModeDefinition(GameMode.ZONE_CONTROL), kind);
    this.deployFlow.open(kind, deploySession);
    this.respawnUI.configureSession(deploySession);
    this.respawnUI.setMapInteractionEnabled(deploySession.allowSpawnSelection);
    this.syncLoadoutPreview();

    // Update available spawn points
    this.updateAvailableSpawnPoints();
    this.mapController.setSpawnPoints(this.availableSpawnPoints);

    // Release pointer lock and set menu context so the cursor is free
    InputContextManager.getInstance().setContext('menu');
    this.playerController?.setPointerLockEnabled(false);

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

    if (kind === 'initial' && this.shouldAutoConfirmInitialDeploy()) {
      this.confirmRespawn();
    }
  }

  private selectSpawnPointOnMap(zoneId: string, zoneName: string): void {
    if (this.deploySession && !this.deploySession.allowSpawnSelection) {
      return;
    }
    this.selectedSpawnPoint = zoneId;
    this.mapController.setSelectedSpawnPoint?.(zoneId);
    this.respawnUI.updateSelectedSpawn(zoneName);
    this.updateTimerDisplay();
  }

  private confirmRespawn(): void {
    if (!this.selectedSpawnPoint) return;

    const spawnPoint = this.availableSpawnPoints.find(p => p.id === this.selectedSpawnPoint);
    if (!spawnPoint) return;

    Logger.info('player', ` Deploying at ${spawnPoint.name}`);
    const finalPosition = this.createDeployPosition(spawnPoint.position);
    const flowKind = this.deployFlow.confirm(finalPosition);
    this.hideRespawnUI();

    if (flowKind === 'initial') {
      return;
    }

    this.respawn(finalPosition);
  }


  private hideRespawnUI(): void {
    this.isRespawnUIVisible = false;
    this.respawnUI.hide();
    this.deployFlow.close();
    this.mapController.clearSelection();
    this.mapController.stopMapUpdateInterval();

    // Restore gameplay input context and pointer lock
    InputContextManager.getInstance().setContext('gameplay');
    this.playerController?.setPointerLockEnabled(true);
  }

  private cancelActiveDeployFlow(): void {
    if (this.activeDeployFlowKind !== 'initial') {
      return;
    }

    this.cancelInitialDeploy(new InitialDeployCancelledError());
  }

  private cancelInitialDeploy(error: Error): void {
    this.deployFlow.cancelInitialDeploy(error);
    this.hideRespawnUI();
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

    const fallbackSpawn = this.spawnPointSelector.getPreferredDeploySpawnPoint(
      this.availableSpawnPoints, this.activeDeployFlowKind
    );
    if (!fallbackSpawn) {
      this.respawnUI.resetSelectedSpawn();
      return;
    }

    this.selectedSpawnPoint = fallbackSpawn.id;
    this.mapController.setSelectedSpawnPoint?.(fallbackSpawn.id);
    this.respawnUI.updateSelectedSpawn(fallbackSpawn.name);
    this.mapController.focusSpawnPoints?.(fallbackSpawn.id);
  }

  private createDeployPosition(basePosition: THREE.Vector3): THREE.Vector3 {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      2,
      (Math.random() - 0.5) * 10
    );
    return basePosition.clone().add(offset);
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

  private async showMissionBriefing(): Promise<void> {
    const config = this.gameModeManager?.getCurrentConfig();
    if (!config) return;

    const zoneCount = config.zones.length;
    const worldSizeKm = (config.worldSize / 1000).toFixed(0);
    const totalAgents = config.warSimulator?.totalAgents ?? config.maxCombatants;
    const matchDurationMin = Math.round(config.matchDuration / 60);

    const info: MissionBriefingInfo = {
      zoneCount,
      worldSizeKm,
      totalAgents,
      matchDurationMin,
    };

    const briefing = new MissionBriefing(info);
    await briefing.show();
  }

  private shouldAutoConfirmInitialDeploy(): boolean {
    const deployState = this.deployFlow.getState();
    return import.meta.env.DEV
      && isPerfDiagnosticsEnabled()
      && deployState.hasPendingInitialDeploy
      && !!this.selectedSpawnPoint;
  }

}
