import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { CombatantFactory } from './CombatantFactory';
import { RallyPointSystem } from './RallyPointSystem';
import { SpawnPositionCalculator } from './SpawnPositionCalculator';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';

// Module-level scratch vectors
const _squadCentroid = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();

export interface PendingRespawn {
  squadId: string;
  respawnTime: number;
  originalId: string;
}

/**
 * Manages respawn lifecycle and reinforcement waves
 */
export class RespawnManager {
  private combatants: Map<string, Combatant>;
  private spatialGrid: SpatialOctree;
  private squadManager: SquadManager;
  private combatantFactory: CombatantFactory;
  private pendingRespawns: PendingRespawn[] = [];

  constructor(
    combatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree,
    squadManager: SquadManager,
    combatantFactory: CombatantFactory
  ) {
    this.combatants = combatants;
    this.spatialGrid = spatialGrid;
    this.squadManager = squadManager;
    this.combatantFactory = combatantFactory;
  }

  getPendingRespawns(): PendingRespawn[] {
    return this.pendingRespawns;
  }

  setPendingRespawns(resppawns: PendingRespawn[]): void {
    this.pendingRespawns = resppawns;
  }

  /**
   * Remove a combatant and queue respawn if they are in the player squad
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
          Logger.info('combat', ` DEATH: Squad member ${id} died at ${now}`);
          Logger.info('combat', ` Queued respawn for ${respawnTime} (in 5 seconds)`);
          this.pendingRespawns.push({
            squadId: combatant.squadId,
            respawnTime: respawnTime,
            originalId: id
          });
        } else {
          Logger.info('combat', `Respawn already queued for ${id}`);
        }
      }

      this.squadManager.removeSquadMember(combatant.squadId, id);
    }
    this.spatialGrid.remove(id);
    this.combatants.delete(id);
  }

  /**
   * Queue respawn for a combatant
   */
  queueRespawn(squadId: string, originalId: string): void {
    this.pendingRespawns.push({
      squadId,
      respawnTime: Date.now() + 5000,
      originalId
    });
  }

  /**
   * Handle pending respawns
   */
  handlePendingRespawns(rallyPointSystem?: RallyPointSystem, zoneManager?: ZoneManager, gameModeManager?: GameModeManager): void {
    const now = Date.now();
    const readyToRespawn = this.pendingRespawns.filter(r => r.respawnTime <= now);

    readyToRespawn.forEach(respawn => {
      Logger.info('combat', `RESPAWN TRIGGERED at ${now} (was scheduled for ${respawn.respawnTime})`);
      this.respawnSquadMember(respawn.squadId, rallyPointSystem, zoneManager, gameModeManager);
    });

    this.pendingRespawns = this.pendingRespawns.filter(r => r.respawnTime > now);
  }

  /**
   * Respawn a specific squad member
   */
  respawnSquadMember(
    squadId: string, 
    rallyPointSystem?: RallyPointSystem, 
    zoneManager?: ZoneManager, 
    gameModeManager?: GameModeManager
  ): void {
    const squad = this.squadManager.getSquad(squadId);
    if (!squad) {
      Logger.warn('combat', ` Cannot respawn - squad ${squadId} no longer exists`);
      return;
    }

    // Calculate squad centroid for reference
    _squadCentroid.set(0, 0, 0);
    let validMemberCount = 0;
    
    for (const id of squad.members) {
      const m = this.combatants.get(id);
      if (m) {
        _squadCentroid.add(m.position);
        validMemberCount++;
      }
    }
    
    if (validMemberCount > 0) {
      _squadCentroid.divideScalar(validMemberCount);
    }

    // Check for rally point first
    let spawnPos: THREE.Vector3;
    let spawnedAtRallyPoint = false;

    if (rallyPointSystem) {
      const rallyPos = rallyPointSystem.getRallyPointPosition(squadId);
      if (rallyPos && rallyPointSystem.consumeRallyPointUse(squadId)) {
        spawnPos = rallyPos;
        spawnedAtRallyPoint = true;
        Logger.info('combat', ` Respawning at rally point`);
      } else {
        spawnPos = SpawnPositionCalculator.getBaseSpawnPosition(squad.faction, zoneManager, gameModeManager?.getCurrentConfig());
      }
    } else {
      spawnPos = SpawnPositionCalculator.getBaseSpawnPosition(squad.faction, zoneManager, gameModeManager?.getCurrentConfig());
    }

    const distanceFromSquad = spawnPos.distanceTo(_squadCentroid);

    Logger.info('combat', ` Respawning squad member:`);
    Logger.info('combat', `   Squad location: (${_squadCentroid.x.toFixed(1)}, ${_squadCentroid.z.toFixed(1)})`);
    Logger.info('combat', `   Spawn location: (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)}) ${spawnedAtRallyPoint ? '[RALLY POINT]' : '[BASE]'}`);
    Logger.info('combat', `   Distance: ${distanceFromSquad.toFixed(1)}m`);

    const newMember = this.combatantFactory.createCombatant(
      squad.faction,
      spawnPos,
      { squadId, squadRole: 'follower' }
    );

    newMember.isRejoiningSquad = true;

    squad.members.push(newMember.id);
    this.combatants.set(newMember.id, newMember);
    this.spatialGrid.updatePosition(newMember.id, newMember.position);

    Logger.info('combat', ` Squad member ${newMember.id} spawned and moving to rejoin squad`);
  }

  /**
   * Spawn a reinforcement wave for a faction
   */
  spawnReinforcementWave(
    faction: Faction, 
    maxCombatants: number,
    squadSizeMin: number,
    squadSizeMax: number,
    spawnSquadFn: (faction: Faction, pos: THREE.Vector3, size: number) => void,
    zoneManager?: ZoneManager,
    gameModeManager?: GameModeManager
  ): void {
    const targetPerFaction = Math.floor(maxCombatants / 2);
    const counts = this.countLivingByFaction();
    const currentFactionCount = faction === Faction.US ? counts.us : counts.opfor;
    const missing = Math.max(0, targetPerFaction - currentFactionCount);
    if (missing === 0) return;

    const avgSquadSize = SpawnPositionCalculator.getAverageSquadSize(squadSizeMin, squadSizeMax);
    const maxSquadsThisWave = Math.max(1, Math.min(3, Math.ceil(missing / avgSquadSize / 2)));

    // Choose anchors across owned zones (contested first)
    const anchors = SpawnPositionCalculator.getFactionAnchors(faction, zoneManager);
    if (anchors.length === 0) {
      // Fallback: spawn near default base pos
      const pos = SpawnPositionCalculator.getSpawnPosition(faction, zoneManager, gameModeManager?.getCurrentConfig());
      if (this.combatants.size < maxCombatants) {
        spawnSquadFn(faction, pos, SpawnPositionCalculator.randomSquadSize(squadSizeMin, squadSizeMax));
      }
      return;
    }

    for (let i = 0; i < maxSquadsThisWave; i++) {
      if (this.combatants.size >= maxCombatants) break;
      const anchor = anchors[i % anchors.length];
      const pos = _spawnPos.copy(anchor).add(SpawnPositionCalculator.randomSpawnOffset(20, 50));
      spawnSquadFn(faction, pos, SpawnPositionCalculator.randomSquadSize(squadSizeMin, squadSizeMax));
    }
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
