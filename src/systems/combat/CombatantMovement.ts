import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ZoneManager } from '../world/ZoneManager';
import { TicketSystem } from '../world/TicketSystem';
import { GameModeManager } from '../world/GameModeManager';
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
  private static readonly TAU = Math.PI * 2;
  private chunkManager?: ImprovedChunkManager;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private gameModeManager?: GameModeManager;
  private spatialGridManager?: SpatialGridManager;
  private readonly _spacingForce = new THREE.Vector3();

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
    combatants: Map<string, Combatant>,
    options?: { disableSpacing?: boolean; disableTerrainSample?: boolean }
  ): void {
    // Stop movement if game is not active
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      combatant.velocity.set(0, 0, 0);
      return;
    }

    // Dead/dying NPCs: freeze in place, no movement or spacing forces
    if (combatant.isDying || combatant.state === CombatantState.DEAD) {
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
    if (!options?.disableSpacing && this.spatialGridManager) {
      clusterManager.calculateSpacingForce(combatant, combatants, this.spatialGridManager, this._spacingForce);
      combatant.velocity.add(this._spacingForce);
    }

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    combatant.position.addScaledVector(combatant.velocity, deltaTime);

    // Keep on terrain with sampled/cached updates to avoid per-frame height churn at scale.
    if (!options?.disableTerrainSample) {
      const terrainHeight = this.getTerrainHeightForCombatant(combatant);
      combatant.position.y = terrainHeight + 3;
    }
  }

  updateRotation(combatant: Combatant, deltaTime: number): void {
    // Guard against NaN/Infinity to avoid unbounded normalization loops on bad state.
    if (!Number.isFinite(combatant.rotation)) {
      combatant.rotation = 0;
    }
    if (!Number.isFinite(combatant.visualRotation)) {
      combatant.visualRotation = combatant.rotation;
    }
    if (!Number.isFinite(combatant.rotationVelocity)) {
      combatant.rotationVelocity = 0;
    }
    const safeDeltaTime = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, 0.1)) : 0.016;

    // Normalize to -PI..PI range using modulo math (bounded cost).
    let rotationDifference = combatant.rotation - combatant.visualRotation;
    rotationDifference = ((rotationDifference + Math.PI) % CombatantMovement.TAU + CombatantMovement.TAU) % CombatantMovement.TAU - Math.PI;

    // Apply smooth interpolation with velocity for natural movement
    const rotationAcceleration = rotationDifference * 15; // Spring constant
    const rotationDamping = combatant.rotationVelocity * 10; // Damping

    combatant.rotationVelocity += (rotationAcceleration - rotationDamping) * safeDeltaTime;
    combatant.visualRotation += combatant.rotationVelocity * safeDeltaTime;

    // Normalize to 0..2PI range.
    combatant.visualRotation = ((combatant.visualRotation % CombatantMovement.TAU) + CombatantMovement.TAU) % CombatantMovement.TAU;
  }


  private getTerrainHeight(x: number, z: number): number {
    // Use HeightQueryCache - always returns valid height from noise
    return getHeightQueryCache().getHeightAt(x, z);
  }

  private getTerrainHeightForCombatant(combatant: Combatant): number {
    const now = performance.now();
    const intervalMs =
      combatant.lodLevel === 'high' ? 80 :
      combatant.lodLevel === 'medium' ? 140 :
      combatant.lodLevel === 'low' ? 220 : 320;

    const lastX = combatant.terrainSampleX;
    const lastZ = combatant.terrainSampleZ;
    const lastH = combatant.terrainSampleHeight;
    const lastT = combatant.terrainSampleTimeMs;

    if (
      Number.isFinite(lastX) &&
      Number.isFinite(lastZ) &&
      Number.isFinite(lastH) &&
      Number.isFinite(lastT)
    ) {
      const dx = combatant.position.x - Number(lastX);
      const dz = combatant.position.z - Number(lastZ);
      const movedSq = dx * dx + dz * dz;
      if (movedSq < 1.0 && (now - Number(lastT)) < intervalMs) {
        return Number(lastH);
      }
    }

    const nextHeight = this.getTerrainHeight(combatant.position.x, combatant.position.z);
    combatant.terrainSampleX = combatant.position.x;
    combatant.terrainSampleZ = combatant.position.z;
    combatant.terrainSampleHeight = nextHeight;
    combatant.terrainSampleTimeMs = now;
    return nextHeight;
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
