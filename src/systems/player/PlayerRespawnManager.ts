import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Faction, Alliance, getAlliance, isBlufor, isOpfor } from '../combat/types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { GameMode } from '../../config/gameModeTypes';
import { RespawnUI } from './RespawnUI';
import { RespawnMapController } from './RespawnMapController';
import type { IFirstPersonWeapon, IPlayerController } from '../../types/SystemInterfaces';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';

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
  private chunkManager?: ImprovedChunkManager;

  // Respawn state
  private isRespawnUIVisible = false;
  private respawnTimer = 0;
  private selectedSpawnPoint?: string;
  private availableSpawnPoints: Array<{ id: string; name: string; position: THREE.Vector3; safe: boolean }> = [];
  private lastTimerDisplaySecond: number = -1;
  private lastTimerDisplayHasSelection = false;
  private deathCount = 0;
  private respawnCount = 0;

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

  setWarSimulator(warSimulator: WarSimulator): void {
    this.warSimulator = warSimulator;
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
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

    // Filter zones - only BLUFOR controlled zones (not OPFOR or contested)
    const zones = this.zoneManager.getAllZones().filter(z => {
      // Only allow BLUFOR bases (not OPFOR bases)
      if (z.isHomeBase && z.owner !== null && isBlufor(z.owner)) return true;
      // Only allow fully BLUFOR-captured zones (not contested or OPFOR controlled)
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

    const currentMode = this.getCurrentGameMode();
    if (currentMode === GameMode.A_SHAU_VALLEY) {
      const pressureSpawn = this.getAShauPressureSpawnPosition();
      if (pressureSpawn) {
        pressureSpawn.y = 5;
        this.respawn(pressureSpawn);
        return;
      }
    }

    const usBase = this.zoneManager.getAllZones().find(
      z => z.id === 'us_base' || (z.isHomeBase && z.owner !== null && isBlufor(z.owner))
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
        this.playerController.setPosition(position, 'respawn.manager');
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

    this.availableSpawnPoints = zones
      .filter(z => {
        // Can only spawn at BLUFOR-owned bases (not OPFOR bases)
        if (z.isHomeBase && z.owner !== null && isBlufor(z.owner)) return true;
        // Can spawn at fully captured zones if game mode allows (must be BLUFOR controlled, not contested or OPFOR)
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
    const currentSecond = Math.max(0, Math.ceil(this.respawnTimer));
    const hasSelection = !!this.selectedSpawnPoint;
    this.lastTimerDisplaySecond = currentSecond;
    this.lastTimerDisplayHasSelection = hasSelection;
    this.respawnUI.updateTimerDisplay(this.respawnTimer, hasSelection);
  }

  getAShauPressureInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    if (this.getCurrentGameMode() !== GameMode.A_SHAU_VALLEY) return null;
    const pressureSpawn = this.getAShauPressureSpawnPosition();
    if (!pressureSpawn) return null;
    const minOpfor250 = Math.max(0, Number(options?.minOpfor250 ?? 0));
    if (minOpfor250 > 0) {
      const opfor250 = this.countNearbyAgents(pressureSpawn, 250, Alliance.OPFOR);
      if (opfor250 < minOpfor250) {
        return null;
      }
    }
    return pressureSpawn ? pressureSpawn.clone() : null;
  }

  private getAShauPressureSpawnPosition(): THREE.Vector3 | null {
    if (!this.zoneManager) return null;
    const zones = this.zoneManager.getAllZones();
    const usForward = zones.filter(z => !z.isHomeBase && z.state === ZoneState.US_CONTROLLED);
    if (usForward.length === 0) return null;

    const enemyLike = zones.filter(z => (z.owner !== null && isOpfor(z.owner)) || z.state === ZoneState.CONTESTED || z.owner === null);
    if (enemyLike.length === 0) {
      return usForward[0].position.clone();
    }

    const contestedOrNeutral = enemyLike.filter(z => z.state === ZoneState.CONTESTED || z.owner === null);
    const objectiveCandidates = contestedOrNeutral.length > 0 ? contestedOrNeutral : enemyLike;

    let bestObjective = objectiveCandidates[0];
    let bestObjectiveScore = -Infinity;
    for (const zone of objectiveCandidates) {
      const objectiveScore = zone.ticketBleedRate ?? 0;
      if (objectiveScore > bestObjectiveScore) {
        bestObjectiveScore = objectiveScore;
        bestObjective = zone;
      }
    }

    let nearestUS = usForward[0];
    let nearestUSDist = Infinity;
    for (const usZone of usForward) {
      const d = usZone.position.distanceTo(bestObjective.position);
      if (d < nearestUSDist) {
        nearestUSDist = d;
        nearestUS = usZone;
      }
    }

    const enemyHotspot = this.getEnemyHotspotNear(bestObjective.position, 900);
    const anchor = enemyHotspot ?? bestObjective.position;
    const dir = new THREE.Vector3().subVectors(nearestUS.position, anchor);
    dir.y = 0;
    const len = dir.length();
    if (len < 1) {
      return nearestUS.position.clone();
    }
    dir.divideScalar(len);

    // Insert on the US-facing side of the objective to cut dead travel while
    // avoiding direct center-of-objective spawn.
    const insertionOffsetMeters = enemyHotspot
      ? Math.min(110, Math.max(55, nearestUSDist * 0.2))
      : Math.min(160, Math.max(80, nearestUSDist * 0.3));
    const anchorSpawn = anchor.clone().addScaledVector(dir, insertionOffsetMeters);
    const sampled = this.selectBestRespawnCandidate(anchorSpawn, dir, nearestUS.position, bestObjective.position);
    return sampled ?? anchorSpawn;
  }

  private getEnemyHotspotNear(objective: THREE.Vector3, maxRadius: number): THREE.Vector3 | null {
    if (!this.warSimulator || !this.warSimulator.isEnabled()) return null;

    const agents = this.warSimulator.getAllAgents();
    const maxRadiusSq = maxRadius * maxRadius;
    type Candidate = { x: number; z: number; d2: number };
    const candidates: Candidate[] = [];

    for (const agent of agents.values()) {
      if (!agent.alive || !isOpfor(agent.faction)) continue;
      const dx = agent.x - objective.x;
      const dz = agent.z - objective.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxRadiusSq) continue;

      candidates.push({ x: agent.x, z: agent.z, d2 });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.d2 - b.d2);
    const take = Math.min(10, candidates.length);
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < take; i++) {
      sumX += candidates[i].x;
      sumZ += candidates[i].z;
    }
    return new THREE.Vector3(sumX / take, 0, sumZ / take);
  }

  private selectBestRespawnCandidate(
    anchorSpawn: THREE.Vector3,
    usFacingDir: THREE.Vector3,
    nearestUSPos: THREE.Vector3,
    objectivePos: THREE.Vector3
  ): THREE.Vector3 | null {
    const candidates = this.buildRespawnCandidates(anchorSpawn, usFacingDir);
    if (candidates.length === 0) return null;

    let best: { pos: THREE.Vector3; score: number } | null = null;
    for (const candidate of candidates) {
      if (!this.isTerrainReadyAt(candidate.x, candidate.z)) continue;
      const score = this.scoreRespawnCandidate(candidate, nearestUSPos, objectivePos);
      if (!best || score > best.score) {
        best = { pos: candidate, score };
      }
    }

    return best?.pos ?? null;
  }

  private buildRespawnCandidates(anchorSpawn: THREE.Vector3, usFacingDir: THREE.Vector3): THREE.Vector3[] {
    const dir = usFacingDir.clone().normalize();
    if (!Number.isFinite(dir.x) || !Number.isFinite(dir.z) || dir.lengthSq() < 0.0001) {
      dir.set(0, 0, 1);
    }
    const lateral = new THREE.Vector3(-dir.z, 0, dir.x);
    const offsets = [
      { forward: 0, side: 0 },
      { forward: -18, side: 0 },
      { forward: 18, side: 0 },
      { forward: -12, side: -14 },
      { forward: -12, side: 14 },
      { forward: 12, side: -14 },
      { forward: 12, side: 14 },
      { forward: -26, side: -10 },
      { forward: -26, side: 10 },
      { forward: -8, side: -22 },
      { forward: -8, side: 22 }
    ];

    return offsets.map(o =>
      anchorSpawn.clone()
        .addScaledVector(dir, o.forward)
        .addScaledVector(lateral, o.side)
    );
  }

  private scoreRespawnCandidate(candidate: THREE.Vector3, nearestUSPos: THREE.Vector3, objectivePos: THREE.Vector3): number {
    const opfor250 = this.countNearbyAgents(candidate, 250, Alliance.OPFOR);
    const opfor400 = this.countNearbyAgents(candidate, 400, Alliance.OPFOR);
    const us220 = this.countNearbyAgents(candidate, 220, Alliance.BLUFOR);
    const dToObjective = candidate.distanceTo(objectivePos);
    const dToUS = candidate.distanceTo(nearestUSPos);

    // Heavily reward immediate/near tactical pressure, lightly penalize
    // excessive objective stand-off and deep friendline bias.
    return opfor250 * 8
      + opfor400 * 2.5
      - us220 * 1.25
      - dToObjective * 0.01
      - dToUS * 0.002;
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
    const cm = this.chunkManager as any;
    if (!cm || typeof cm.isChunkLoaded !== 'function' || typeof cm.getChunkSize !== 'function') {
      return true;
    }
    const chunkSize = Number(cm.getChunkSize());
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) return true;

    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!cm.isChunkLoaded(cx + dx, cz + dz)) {
          return false;
        }
      }
    }
    return true;
  }

  private getCurrentGameMode(): GameMode | undefined {
    if (!this.gameModeManager) return undefined;

    // Preserve compatibility with older test doubles and runtime call-sites
    // that expose `currentMode` as a property instead of a getter.
    const modeFromGetter = typeof this.gameModeManager.getCurrentMode === 'function'
      ? this.gameModeManager.getCurrentMode()
      : undefined;

    if (modeFromGetter !== undefined) return modeFromGetter;

    return (this.gameModeManager as unknown as { currentMode?: GameMode }).currentMode;
  }

  getSessionRespawnStats(): { deaths: number; respawns: number } {
    return {
      deaths: this.deathCount,
      respawns: this.respawnCount
    };
  }
}
