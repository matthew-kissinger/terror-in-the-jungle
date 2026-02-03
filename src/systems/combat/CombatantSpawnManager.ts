import * as THREE from 'three';
import { Combatant, CombatantState, Faction, SquadCommand } from './types';
import { CombatantFactory } from './CombatantFactory';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { RallyPointSystem } from './RallyPointSystem';
import { Logger } from '../../utils/Logger';

// Module-level scratch vectors to avoid per-call allocations
const _spawnPos = new THREE.Vector3();
const _anchorPos = new THREE.Vector3();
const _offsetVec = new THREE.Vector3();

/**
 * Manages spawning, respawning, and reinforcement waves for combatants
 */
export class CombatantSpawnManager {
  private combatants: Map<string, Combatant>;
  private spatialGrid: SpatialOctree;
  private combatantFactory: CombatantFactory;
  private squadManager: SquadManager;
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;
  private rallyPointSystem?: RallyPointSystem;

  // Spawn configuration
  private MAX_COMBATANTS = 30;
  private SPAWN_CHECK_INTERVAL = 3000;
  private readonly PROGRESSIVE_SPAWN_DELAY = 1000;
  private progressiveSpawnTimer = 0;
  private progressiveSpawnQueue: Array<{faction: Faction, position: THREE.Vector3, size: number}> = [];
  private reinforcementWaveTimer = 0;
  private reinforcementWaveIntervalSeconds = 15;
  private lastSpawnCheck = 0;

  // Respawn tracking
  private pendingRespawns: Array<{squadId: string, respawnTime: number, originalId: string}> = [];

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
   * Returns the player squad ID if created
   */
  spawnInitialForces(shouldCreatePlayerSquad: boolean, playerSquadId?: string): string | undefined {
    console.log('🎖️ Deploying initial forces across HQs...');

    const config = this.gameModeManager?.getCurrentConfig();
    const avgSquadSize = this.getAverageSquadSize();
    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const initialPerFaction = Math.max(avgSquadSize, Math.floor(targetPerFaction * 0.3));
    let initialSquadsPerFaction = Math.max(1, Math.round(initialPerFaction / avgSquadSize));

    const usHQs = this.getHQZonesForFaction(Faction.US, config);
    const opforHQs = this.getHQZonesForFaction(Faction.OPFOR, config);
    const { usBasePos, opforBasePos } = this.getBasePositions();

    let createdPlayerSquadId: string | undefined;

    // Create player squad first if requested
    if (shouldCreatePlayerSquad) {
      console.log('🎖️ Creating player squad...');
      const playerSpawnPos = usBasePos.clone().add(new THREE.Vector3(0, 0, -15));
      const { squad, members } = this.squadManager.createSquad(Faction.US, playerSpawnPos, 6);
      createdPlayerSquadId = squad.id;
      squad.isPlayerControlled = true;
      squad.currentCommand = SquadCommand.NONE;
      squad.commandPosition = playerSpawnPos.clone();

      // Add all squad members to combatants map
      members.forEach(combatant => {
        this.combatants.set(combatant.id, combatant);
      });

      console.log(`✅ Player squad created: ${squad.id} with ${squad.members.length} members at player spawn`);

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
        const posUS = _spawnPos.copy(usHQs[i % usHQs.length].position).add(this.randomSpawnOffset(20, 40));
        const posOP = _anchorPos.copy(opforHQs[i % opforHQs.length].position).add(this.randomSpawnOffset(20, 40));
        this.spawnSquad(Faction.US, posUS, this.randomSquadSize());
        this.spawnSquad(Faction.OPFOR, posOP, this.randomSquadSize());
      }
    }

    // Seed a small progressive queue to get early contact
    this.progressiveSpawnQueue = [
      { faction: Faction.US, position: new THREE.Vector3(usBasePos.x + 10, usBasePos.y, usBasePos.z + 5), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) },
      { faction: Faction.OPFOR, position: new THREE.Vector3(opforBasePos.x - 10, opforBasePos.y, opforBasePos.z - 5), size: Math.max(2, Math.floor(avgSquadSize * 0.6)) }
    ];

    console.log(`🎖️ Initial forces deployed: ${this.combatants.size} combatants`);

    // Log initial octree stats
    const octreeStats = this.spatialGrid.getStats();
    Logger.info('combat', `Octree initialized: ${octreeStats.totalNodes} nodes, ${octreeStats.totalEntities} entities, max depth ${octreeStats.maxDepth}`);

    return createdPlayerSquadId;
  }

  /**
   * Reseed forces when switching game modes
   */
  reseedForcesForMode(): void {
    console.log('🔁 Reseeding forces for new game mode configuration...');
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
  update(deltaTime: number, combatEnabled: boolean, ticketSystem?: any): void {
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
  private manageSpawning(combatEnabled: boolean, ticketSystem?: any): void {
    // Handle pending respawns for player squad members
    const now = Date.now();
    const readyToRespawn = this.pendingRespawns.filter(r => r.respawnTime <= now);

    readyToRespawn.forEach(respawn => {
      console.log(`⏰ RESPAWN TRIGGERED at ${now} (was scheduled for ${respawn.respawnTime})`);
      this.respawnSquadMember(respawn.squadId);
    });

    this.pendingRespawns = this.pendingRespawns.filter(r => r.respawnTime > now);

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
    const avgSquadSize = this.getAverageSquadSize();

    const ensureFactionStrength = (faction: Faction) => {
      const living = Array.from(this.combatants.values())
        .filter(c => c.faction === faction && c.state !== CombatantState.DEAD).length;
      const missing = Math.max(0, targetPerFaction - living);

      // More aggressive refill when strength is very low
      const criticalThreshold = Math.floor(targetPerFaction * 0.3);
      const isEmergencyRefill = living < criticalThreshold;

      if (missing <= 0) return;

      // Spawn up to two squads immediately to refill strength, respecting global cap
      const anchors = this.getFactionAnchors(faction);
      let squadsToSpawn = Math.min(2, Math.ceil(missing / Math.max(1, avgSquadSize)));

      // Emergency refill: spawn more aggressively
      if (isEmergencyRefill) {
        squadsToSpawn = Math.min(3, Math.ceil(missing / Math.max(1, avgSquadSize)));
        console.log(`🚨 Emergency refill for ${faction}: ${living}/${targetPerFaction} remaining`);
      }

      for (let i = 0; i < squadsToSpawn; i++) {
        if (this.combatants.size >= this.MAX_COMBATANTS) break;
        let pos: THREE.Vector3;
        if (anchors.length > 0) {
          const anchor = anchors[(i + Math.floor(Math.random() * anchors.length)) % anchors.length];
          pos = _spawnPos.copy(anchor).add(this.randomSpawnOffset(20, 50));
        } else {
          pos = this.getSpawnPosition(faction);
        }
        this.spawnSquad(faction, pos, this.randomSquadSize());
        console.log(`🎖️ Refill spawn: ${faction} squad of ${this.randomSquadSize()} deployed (${living + (i+1)*avgSquadSize}/${targetPerFaction})`);
      }
    };

    ensureFactionStrength(Faction.US);
    ensureFactionStrength(Faction.OPFOR);
  }

  /**
   * Spawn a squad at the given position
   */
  spawnSquad(faction: Faction, centerPos: THREE.Vector3, size: number): void {
    const { squad, members } = this.squadManager.createSquad(faction, centerPos, size);

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
    const targetPerFaction = Math.floor(this.MAX_COMBATANTS / 2);
    const currentFactionCount = Array.from(this.combatants.values())
      .filter(c => c.faction === faction && c.state !== CombatantState.DEAD).length;
    const missing = Math.max(0, targetPerFaction - currentFactionCount);
    if (missing === 0) return;

    const avgSquadSize = this.getAverageSquadSize();
    const maxSquadsThisWave = Math.max(1, Math.min(3, Math.ceil(missing / avgSquadSize / 2)));

    // Choose anchors across owned zones (contested first)
    const anchors = this.getFactionAnchors(faction);
    if (anchors.length === 0) {
      // Fallback: spawn near default base pos
      const pos = this.getSpawnPosition(faction);
      if (this.combatants.size < this.MAX_COMBATANTS) {
        this.spawnSquad(faction, pos, this.randomSquadSize());
      }
      return;
    }

    for (let i = 0; i < maxSquadsThisWave; i++) {
      if (this.combatants.size >= this.MAX_COMBATANTS) break;
      const anchor = anchors[i % anchors.length];
      const pos = _spawnPos.copy(anchor).add(this.randomSpawnOffset(20, 50));
      this.spawnSquad(faction, pos, this.randomSquadSize());
    }
  }

  /**
   * Remove a combatant and queue respawn if needed
   */
  removeCombatant(id: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && combatant.squadId) {
      const squad = this.squadManager.getSquad(combatant.squadId);

      if (squad?.isPlayerControlled) {
        // Check if THIS specific combatant already queued
        const alreadyQueued = this.pendingRespawns.some(r => r.originalId === id);

        if (!alreadyQueued) {
          const now = Date.now();
          const respawnTime = now + 5000;
          console.log(`☠️ DEATH: Squad member ${id} died at ${now}`);
          console.log(`⏳ Queued respawn for ${respawnTime} (in 5 seconds)`);
          this.pendingRespawns.push({
            squadId: combatant.squadId,
            respawnTime: respawnTime,
            originalId: id
          });
        } else {
          console.log(`✓ Respawn already queued for ${id}`);
        }
      }

      this.squadManager.removeSquadMember(combatant.squadId, id);
    }
    this.spatialGrid.remove(id);
    this.combatants.delete(id);
  }

  /**
   * Respawn a squad member
   */
  respawnSquadMember(squadId: string): void {
    const squad = this.squadManager.getSquad(squadId);
    if (!squad) {
      console.log(`⚠️ Cannot respawn - squad ${squadId} no longer exists`);
      return;
    }

    // Calculate squad centroid for reference
    const squadMembers = squad.members.map(id => this.combatants.get(id)).filter(c => c);
    const squadCentroid = new THREE.Vector3();
    if (squadMembers.length > 0) {
      squadMembers.forEach(m => {
        if (m) squadCentroid.add(m.position);
      });
      squadCentroid.divideScalar(squadMembers.length);
    }

    // Check for rally point first
    let spawnPos: THREE.Vector3;
    let spawnedAtRallyPoint = false;

    if (this.rallyPointSystem) {
      const rallyPos = this.rallyPointSystem.getRallyPointPosition(squadId);
      if (rallyPos && this.rallyPointSystem.consumeRallyPointUse(squadId)) {
        spawnPos = rallyPos;
        spawnedAtRallyPoint = true;
        console.log(`🚩 Respawning at rally point`);
      } else {
        spawnPos = this.getBaseSpawnPosition(squad.faction);
      }
    } else {
      spawnPos = this.getBaseSpawnPosition(squad.faction);
    }

    const distanceFromSquad = spawnPos.distanceTo(squadCentroid);

    console.log(`🔄 Respawning squad member:`);
    console.log(`   Squad location: (${squadCentroid.x.toFixed(1)}, ${squadCentroid.z.toFixed(1)})`);
    console.log(`   Spawn location: (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)}) ${spawnedAtRallyPoint ? '[RALLY POINT]' : '[BASE]'}`);
    console.log(`   Distance: ${distanceFromSquad.toFixed(1)}m`);

    const newMember = this.combatantFactory.createCombatant(
      squad.faction,
      spawnPos,
      { squadId, squadRole: 'follower' }
    );

    newMember.isRejoiningSquad = true;

    squad.members.push(newMember.id);
    this.combatants.set(newMember.id, newMember);
    this.spatialGrid.updatePosition(newMember.id, newMember.position);

    console.log(`✅ Squad member ${newMember.id} spawned and moving to rejoin squad`);
  }

  /**
   * Queue respawn for a combatant (called from explosion damage)
   */
  queueRespawn(squadId: string, originalId: string): void {
    this.pendingRespawns.push({
      squadId,
      respawnTime: Date.now() + 5000,
      originalId
    });
  }

  // Helper methods

  private getBasePositions(): { usBasePos: THREE.Vector3; opforBasePos: THREE.Vector3 } {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();

      // Find main bases for each faction
      const usBase = config.zones.find(z =>
        z.isHomeBase && z.owner === Faction.US &&
        (z.id.includes('main') || z.id === 'us_base')
      );
      const opforBase = config.zones.find(z =>
        z.isHomeBase && z.owner === Faction.OPFOR &&
        (z.id.includes('main') || z.id === 'opfor_base')
      );

      if (usBase && opforBase) {
        return {
          usBasePos: new THREE.Vector3(usBase.position.x, usBase.position.y, usBase.position.z),
          opforBasePos: new THREE.Vector3(opforBase.position.x, opforBase.position.y, opforBase.position.z)
        };
      }
    }

    // Fallback to default positions
    return {
      usBasePos: new THREE.Vector3(0, 0, -50),
      opforBasePos: new THREE.Vector3(0, 0, 145)
    };
  }

  private getBaseSpawnPosition(faction: Faction): THREE.Vector3 {
    if (this.zoneManager) {
      const allZones = this.zoneManager.getAllZones();
      const ownedBases = allZones.filter(z => z.owner === faction && z.isHomeBase);

      if (ownedBases.length > 0) {
        const baseZone = ownedBases[Math.floor(Math.random() * ownedBases.length)];
        const anchor = baseZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 30;
        _spawnPos.set(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        console.log(`📍 Using base ${baseZone.id} for squad respawn at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
        return new THREE.Vector3(_spawnPos.x, _spawnPos.y, _spawnPos.z);
      } else {
        console.log(`⚠️ No owned bases found for ${faction}, using fallback spawn`);
      }
    } else {
      console.log(`⚠️ No ZoneManager available, using fallback spawn`);
    }

    const { usBasePos, opforBasePos } = this.getBasePositions();
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    _spawnPos.set(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    console.log(`📍 Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return new THREE.Vector3(_spawnPos.x, _spawnPos.y, _spawnPos.z);
  }

  private getSpawnPosition(faction: Faction): THREE.Vector3 {
    if (this.zoneManager) {
      const allZones = this.zoneManager.getAllZones();
      const owned = allZones.filter(z => z.owner === faction);

      // Prioritize contested friendly zones
      const contested = owned.filter(z => !z.isHomeBase && z.state === ZoneState.CONTESTED);
      const captured = owned.filter(z => !z.isHomeBase && z.state !== ZoneState.CONTESTED);
      const hqs = owned.filter(z => z.isHomeBase);

      const anchorZone = (contested[0] || captured[0] || hqs[0]);
      if (anchorZone) {
        const anchor = anchorZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 40;
        _spawnPos.set(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        console.log(`📍 Using zone ${anchorZone.id} as spawn anchor`);
        return new THREE.Vector3(_spawnPos.x, _spawnPos.y, _spawnPos.z);
      } else {
        console.log(`⚠️ No owned zones found for ${faction}, using fallback spawn`);
      }
    } else {
      console.log(`⚠️ No ZoneManager available, using fallback spawn`);
    }

    // Fallback: spawn at fixed base positions (not near player!)
    const { usBasePos, opforBasePos } = this.getBasePositions();
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    // Add random offset around the base
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    _spawnPos.set(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    console.log(`📍 Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return new THREE.Vector3(_spawnPos.x, _spawnPos.y, _spawnPos.z);
  }

  private getFactionAnchors(faction: Faction): THREE.Vector3[] {
    if (!this.zoneManager) return [];
    const zones = this.zoneManager.getAllZones().filter(z => z.owner === faction);
    const contested = zones.filter(z => !z.isHomeBase && z.state === ZoneState.CONTESTED).map(z => z.position);
    const captured = zones.filter(z => !z.isHomeBase && z.state !== ZoneState.CONTESTED).map(z => z.position);
    const hqs = zones.filter(z => z.isHomeBase).map(z => z.position);
    return [...contested, ...captured, ...hqs];
  }

  private getHQZonesForFaction(faction: Faction, config?: any): Array<{ position: THREE.Vector3 }> {
    const zones = config?.zones as Array<{ isHomeBase: boolean; owner: Faction; position: THREE.Vector3 }> | undefined;
    if (!zones) return [];
    return zones.filter(z => z.isHomeBase && z.owner === faction).map(z => ({ position: z.position }));
  }

  private randomSquadSize(): number {
    return Math.floor(this.squadSizeMin + Math.random() * (this.squadSizeMax - this.squadSizeMin + 1));
  }

  private getAverageSquadSize(): number {
    return Math.round((this.squadSizeMin + this.squadSizeMax) / 2);
  }

  private randomSpawnOffset(minRadius: number, maxRadius: number): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
}
