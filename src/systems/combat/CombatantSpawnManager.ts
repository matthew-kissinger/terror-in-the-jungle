import * as THREE from 'three';
import { Combatant, CombatantState, Faction, SquadCommand } from './types';
import { CombatantFactory } from './CombatantFactory';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { RallyPointSystem } from './RallyPointSystem';
import { TicketSystem } from '../world/TicketSystem';
import { Logger } from '../../utils/Logger';
import { SpawnPositionCalculator } from './SpawnPositionCalculator';
import { RespawnManager } from './RespawnManager';

// Module-level scratch vectors to avoid per-call allocations
const _spawnPos = new THREE.Vector3();
const _offsetVec = new THREE.Vector3();
const _scratchVec = new THREE.Vector3();

/**
 * Manages spawning, respawning, and reinforcement waves for combatants
 * Orchestrates delegation to SpawnPositionCalculator and RespawnManager
 */
export class CombatantSpawnManager {
  private combatants: Map<string, Combatant>;
  private spatialGrid: SpatialOctree;
  private combatantFactory: CombatantFactory;
  private squadManager: SquadManager;
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;
  private rallyPointSystem?: RallyPointSystem;
  private respawnManager: RespawnManager;

  // Spawn configuration
  private MAX_COMBATANTS = 30;
  private SPAWN_CHECK_INTERVAL = 3000;
  private readonly PROGRESSIVE_SPAWN_DELAY = 1000;
  private progressiveSpawnTimer = 0;
  private progressiveSpawnQueue: Array<{faction: Faction, position: THREE.Vector3, size: number}> = [];
  private reinforcementWaveTimer = 0;
  private reinforcementWaveIntervalSeconds = 15;
  private lastSpawnCheck = 0;

  // Squad size configuration
  private squadSizeMin = 3;
  private squadSizeMax = 6;

  constructor(
    combatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree,
    combatantFactory: CombatantFactory,
    squadManager: SquadManager
  ) {
    this.combatants = combatants;
    this.spatialGrid = spatialGrid;
    this.combatantFactory = combatantFactory;
    this.squadManager = squadManager;
    this.respawnManager = new RespawnManager(
      combatants,
      spatialGrid,
      squadManager,
      combatantFactory
    );
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setRallyPointSystem(rallyPointSystem: RallyPointSystem): void {
    this.rallyPointSystem = rallyPointSystem;
  }

  setMaxCombatants(max: number): void {
    this.MAX_COMBATANTS = max;
  }

  setSquadSizes(min: number, max: number): void {
    this.squadSizeMin = min;
    this.squadSizeMax = max;
  }

  setReinforcementInterval(interval: number): void {
    this.SPAWN_CHECK_INTERVAL = Math.max(5, interval) * 1000;
    this.reinforcementWaveIntervalSeconds = Math.max(5, interval);
  }

  /**
   * Spawn initial forces for both factions
   */
  spawnInitialForces(shouldCreatePlayerSquad: boolean, _playerSquadId?: string): string | undefined {
    Logger.info('Combat', 'Deploying initial forces across HQs...');

    const config = this.gameModeManager?.getCurrentConfig();
    const avgSquadSize = SpawnPositionCalculator.getAverageSquadSize(this.squadSizeMin, this.squadSizeMax);
    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const initialPerFaction = Math.max(avgSquadSize, Math.floor(targetPerFaction * 0.3));
    let initialSquadsPerFaction = Math.max(1, Math.round(initialPerFaction / avgSquadSize));

    const usHQs = SpawnPositionCalculator.getHQZonesForFaction(Faction.US, config);
    const opforHQs = SpawnPositionCalculator.getHQZonesForFaction(Faction.OPFOR, config);
    const { usBasePos, opforBasePos } = SpawnPositionCalculator.getBasePositions(config);

    let createdPlayerSquadId: string | undefined;

    // Create player squad first if requested
    if (shouldCreatePlayerSquad) {
      Logger.info('Combat', 'Creating player squad...');
      const playerSpawnPos = _scratchVec.copy(usBasePos).add(_offsetVec.set(0, 0, -15));
      const { squad: playerSquad, members } = this.squadManager.createSquad(Faction.US, playerSpawnPos, 6);
      createdPlayerSquadId = playerSquad.id;
      playerSquad.isPlayerControlled = true;
      playerSquad.currentCommand = SquadCommand.NONE;
      playerSquad.commandPosition = playerSpawnPos.clone();

      // Add all squad members to combatants map
      members.forEach(combatant => {
        this.combatants.set(combatant.id, combatant);
      });

      Logger.info('Combat', `Player squad created: ${createdPlayerSquadId} with ${playerSquad.members.length} members at player spawn`);

      // Reduce US squads by 1 since we already spawned the player squad
      initialSquadsPerFaction = Math.max(0, initialSquadsPerFaction - 1);
    }

    // Fallback to legacy base positions if no HQs configured
    if (usHQs.length === 0 || opforHQs.length === 0) {
      if (initialSquadsPerFaction > 0) {
        this.spawnSquad(Faction.US, usBasePos, avgSquadSize);
      }
      this.spawnSquad(Faction.OPFOR, opforBasePos, avgSquadSize);
    } else {
      // Distribute squads evenly across HQs
      for (let i = 0; i < initialSquadsPerFaction; i++) {
        const posUS = _spawnPos.copy(usHQs[i % usHQs.length].position).add(SpawnPositionCalculator.randomSpawnOffset(20, 40));
        const posOP = _scratchVec.copy(opforHQs[i % opforHQs.length].position).add(SpawnPositionCalculator.randomSpawnOffset(20, 40));
        this.spawnSquad(Faction.US, posUS, SpawnPositionCalculator.randomSquadSize(this.squadSizeMin, this.squadSizeMax));
        this.spawnSquad(Faction.OPFOR, posOP, SpawnPositionCalculator.randomSquadSize(this.squadSizeMin, this.squadSizeMax));
      }
    }

    // Seed a small progressive queue to get early contact
    this.progressiveSpawnQueue = [
      { faction: Faction.US, position: new THREE.Vector3(usBasePos.x + 10, usBasePos.y, usBasePos.z + 5), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) },
      { faction: Faction.OPFOR, position: new THREE.Vector3(opforBasePos.x - 10, opforBasePos.y, opforBasePos.z - 5), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) }
    ];

    Logger.info('Combat', `Initial forces deployed: ${this.combatants.size} combatants`);

    // Log initial octree stats
    const octreeStats = this.spatialGrid.getStats();
    Logger.info('Combat', `Octree initialized: ${octreeStats.totalNodes} nodes, ${octreeStats.totalEntities} entities, max depth ${octreeStats.maxDepth}`);

    return createdPlayerSquadId;
  }

  /**
   * Reseed forces when switching game modes
   */
  reseedForcesForMode(): void {
    Logger.info('Combat', 'Reseed forces for new game mode configuration...');
    this.combatants.clear();
    this.spatialGrid.clear();
    this.progressiveSpawnQueue = [];
    this.progressiveSpawnTimer = 0;
    this.reinforcementWaveTimer = 0;
    this.spawnInitialForces(false);
  }

  /**
   * Update spawning logic - progressive spawns, reinforcement waves, respawns
   */
  update(deltaTime: number, combatEnabled: boolean, ticketSystem?: TicketSystem): void {
    // Stop all spawning logic if game is not active
    if (ticketSystem && !ticketSystem.isGameActive()) {
      return;
    }

    // Progressive spawning (short early trickle)
    if (this.progressiveSpawnQueue.length > 0) {
      this.progressiveSpawnTimer += deltaTime * 1000;
      if (this.progressiveSpawnTimer >= this.PROGRESSIVE_SPAWN_DELAY) {
        this.progressiveSpawnTimer = 0;
        const spawn = this.progressiveSpawnQueue.shift()!;
        this.spawnSquad(spawn.faction, spawn.position, spawn.size);
        Logger.debug('combat', `Reinforcements deployed: ${spawn.faction} squad size ${spawn.size}`);
      }
    }

    // Wave-based reinforcements at owned zones
    this.reinforcementWaveTimer += deltaTime;
    if (this.reinforcementWaveTimer >= this.reinforcementWaveIntervalSeconds) {
      this.reinforcementWaveTimer = 0;
      this.spawnReinforcementWave(Faction.US);
      this.spawnReinforcementWave(Faction.OPFOR);
    }

    // Periodic cleanup and refill
    const now = Date.now();
    if (now - this.lastSpawnCheck > this.SPAWN_CHECK_INTERVAL) {
      this.manageSpawning(combatEnabled, ticketSystem);
      this.lastSpawnCheck = now;
    }
  }

  /**
   * Handle pending respawns and maintain force strength
   */
  private manageSpawning(combatEnabled: boolean, ticketSystem?: TicketSystem): void {
    // Stop all spawning logic if game is not active
    if (ticketSystem && !ticketSystem.isGameActive()) {
      return;
    }

    // Handle pending respawns for player squad members
    this.respawnManager.handlePendingRespawns(this.rallyPointSystem, this.zoneManager, this.gameModeManager);

    // Remove all dead combatants immediately - no body persistence
    const toRemove: string[] = [];

    this.combatants.forEach((combatant, id) => {
      if (combatant.state === CombatantState.DEAD) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.removeCombatant(id));

    // Maintain minimum force strength during COMBAT phase OR when combat is enabled
    const phase = ticketSystem?.getGameState().phase;
    if (phase !== 'COMBAT' && !combatEnabled) return;

    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const avgSquadSize = SpawnPositionCalculator.getAverageSquadSize(this.squadSizeMin, this.squadSizeMax);
    const counts = this.countLivingByFaction();

    const ensureFactionStrength = (faction: Faction, living: number) => {
      const missing = Math.max(0, targetPerFaction - living);

      // More aggressive refill when strength is very low
      const criticalThreshold = Math.floor(targetPerFaction * 0.3);
      const isEmergencyRefill = living < criticalThreshold;

      if (missing <= 0) return;

      // Spawn up to two squads immediately to refill strength, respecting global cap
      const anchors = SpawnPositionCalculator.getFactionAnchors(faction, this.zoneManager);
      let squadsToSpawn = Math.min(2, Math.ceil(missing / Math.max(1, avgSquadSize)));

      // Emergency refill: spawn more aggressively
      if (isEmergencyRefill) {
        squadsToSpawn = Math.min(3, Math.ceil(missing / Math.max(1, avgSquadSize)));
        Logger.info('Combat', `Emergency refill for ${faction}: ${living}/${targetPerFaction} remaining`);
      }

      for (let i = 0; i < squadsToSpawn; i++) {
        if (this.combatants.size >= this.MAX_COMBATANTS) break;
        let pos: THREE.Vector3;
        if (anchors.length > 0) {
          const anchor = anchors[(i + Math.floor(Math.random() * anchors.length)) % anchors.length];
          pos = _spawnPos.copy(anchor).add(SpawnPositionCalculator.randomSpawnOffset(20, 50));
        } else {
          pos = SpawnPositionCalculator.getSpawnPosition(faction, this.zoneManager, this.gameModeManager?.getCurrentConfig());
        }
        this.spawnSquad(faction, pos, SpawnPositionCalculator.randomSquadSize(this.squadSizeMin, this.squadSizeMax));
        Logger.debug('Combat', `Refill spawn: ${faction} squad of ${this.randomSquadSize()} deployed (${living + (i+1)*avgSquadSize}/${targetPerFaction})`);
      }
    };

    ensureFactionStrength(Faction.US, counts.us);
    ensureFactionStrength(Faction.OPFOR, counts.opfor);
  }

  /**
   * Spawn a squad at the given position
   */
  spawnSquad(faction: Faction, centerPos: THREE.Vector3, size: number): void {
    const { members } = this.squadManager.createSquad(faction, centerPos, size);

    // Add all squad members to our combatants map and spatial grid
    members.forEach(combatant => {
      this.combatants.set(combatant.id, combatant);
      this.spatialGrid.updatePosition(combatant.id, combatant.position);
    });
  }

  /**
   * Spawn reinforcement wave for a faction
   */
  private spawnReinforcementWave(faction: Faction): void {
    this.respawnManager.spawnReinforcementWave(
      faction,
      this.MAX_COMBATANTS,
      this.squadSizeMin,
      this.squadSizeMax,
      (f, p, s) => this.spawnSquad(f, p, s),
      this.zoneManager,
      this.gameModeManager
    );
  }

  /**
   * Remove a combatant and queue respawn if needed
   */
  removeCombatant(id: string): void {
    this.respawnManager.removeCombatant(id);
  }

  /**
   * Respawn a squad member
   */
  respawnSquadMember(squadId: string): void {
    this.respawnManager.respawnSquadMember(
      squadId, 
      this.rallyPointSystem, 
      this.zoneManager, 
      this.gameModeManager
    );
  }

  /**
   * Queue respawn for a combatant (called from explosion damage)
   */
  queueRespawn(squadId: string, originalId: string): void {
    this.respawnManager.queueRespawn(squadId, originalId);
  }

  // Helper methods

  private randomSquadSize(): number {
    return SpawnPositionCalculator.randomSquadSize(this.squadSizeMin, this.squadSizeMax);
  }

  private countLivingByFaction(): { us: number; opfor: number } {
    let us = 0, opfor = 0;
    for (const c of this.combatants.values()) {
      if (c.state === CombatantState.DEAD) continue;
      if (c.faction === Faction.US) us++;
      else if (c.faction === Faction.OPFOR) opfor++;
    }
    return { us, opfor };
  }
}
