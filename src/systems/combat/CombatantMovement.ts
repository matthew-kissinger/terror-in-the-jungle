import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ZoneManager } from '../world/ZoneManager';
import { TicketSystem } from '../world/TicketSystem';
import { GameModeManager } from '../world/GameModeManager';
import { objectPool } from '../../utils/ObjectPoolManager';
import { clusterManager } from './ClusterManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { SpatialGridManager } from './SpatialGridManager';
import {
  updateCombatMovement,
  updateCoverSeekingMovement,
  updateDefendingMovement,
  updatePatrolMovement
} from './CombatantMovementStates';

export class CombatantMovement {
  private chunkManager?: ImprovedChunkManager;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private gameModeManager?: GameModeManager;
  private spatialGridManager?: SpatialGridManager;

  constructor(chunkManager?: ImprovedChunkManager, zoneManager?: ZoneManager) {
    this.chunkManager = chunkManager;
    this.zoneManager = zoneManager;
  }

  setSpatialGridManager(spatialGridManager: SpatialGridManager): void {
    this.spatialGridManager = spatialGridManager;
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  updateMovement(
    combatant: Combatant,
    deltaTime: number,
    squads: Map<string, Squad>,
    combatants: Map<string, Combatant>
  ): void {
    // Stop movement if game is not active
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      combatant.velocity.set(0, 0, 0);
      return;
    }

    // Movement based on state
    if (combatant.state === CombatantState.PATROLLING) {
      updatePatrolMovement(combatant, deltaTime, squads, combatants, {
        zoneManager: this.zoneManager,
        getEnemyBasePosition: (faction: Faction) => this.getEnemyBasePosition(faction)
      });
    } else if (combatant.state === CombatantState.ENGAGING) {
      updateCombatMovement(combatant);
    } else if (combatant.state === CombatantState.SEEKING_COVER) {
      updateCoverSeekingMovement(combatant);
    } else if (combatant.state === CombatantState.DEFENDING) {
      updateDefendingMovement(combatant);
    }

    // Apply friendly spacing force to prevent bunching
    // This gently pushes NPCs apart when they get too close to friendlies
    if (this.spatialGridManager) {
      const spacingForce = clusterManager.calculateSpacingForce(combatant, combatants, this.spatialGridManager);
      combatant.velocity.add(spacingForce);
    }

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    const velocityDelta = objectPool.getVector3();
    velocityDelta.copy(combatant.velocity).multiplyScalar(deltaTime);
    combatant.position.add(velocityDelta);
    objectPool.releaseVector3(velocityDelta);

    // Keep on terrain
    const terrainHeight = this.getTerrainHeight(combatant.position.x, combatant.position.z);
    combatant.position.y = terrainHeight + 3;
  }

  updateRotation(combatant: Combatant, deltaTime: number): void {
    // Smooth rotation interpolation
    let rotationDifference = combatant.rotation - combatant.visualRotation;

    // Normalize to -PI to PI range
    while (rotationDifference > Math.PI) rotationDifference -= Math.PI * 2;
    while (rotationDifference < -Math.PI) rotationDifference += Math.PI * 2;

    // Apply smooth interpolation with velocity for natural movement
    const rotationAcceleration = rotationDifference * 15; // Spring constant
    const rotationDamping = combatant.rotationVelocity * 10; // Damping

    combatant.rotationVelocity += (rotationAcceleration - rotationDamping) * deltaTime;
    combatant.visualRotation += combatant.rotationVelocity * deltaTime;

    // Normalize visual rotation
    while (combatant.visualRotation > Math.PI * 2) combatant.visualRotation -= Math.PI * 2;
    while (combatant.visualRotation < 0) combatant.visualRotation += Math.PI * 2;
  }


  private getTerrainHeight(x: number, z: number): number {
    // Use HeightQueryCache - always returns valid height from noise
    return getHeightQueryCache().getHeightAt(x, z);
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  private getEnemyBasePosition(faction: Faction): THREE.Vector3 {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();
      const enemyFaction = faction === Faction.US ? Faction.OPFOR : Faction.US;

      // Find enemy main base
      const enemyBase = config.zones.find(z =>
        z.isHomeBase && z.owner === enemyFaction &&
        (z.id.includes('main') || z.id === `${enemyFaction.toLowerCase()}_base`)
      );

      if (enemyBase) {
        return enemyBase.position.clone();
      }
    }

    // Fallback to default positions
    return faction === Faction.US ?
      new THREE.Vector3(0, 0, 145) : // OPFOR base
      new THREE.Vector3(0, 0, -50); // US base
  }
}
