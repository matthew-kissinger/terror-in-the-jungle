import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, isBlufor } from './types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { ZoneManager } from '../world/ZoneManager';
import { TicketSystem } from '../world/TicketSystem';
import { GameModeManager } from '../world/GameModeManager';
import { clusterManager } from './ClusterManager';
import { SpatialGridManager } from './SpatialGridManager';
import {
  updateCombatMovement,
  updateCoverSeekingMovement,
  updateDefendingMovement,
  updatePatrolMovement
} from './CombatantMovementStates';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { computeSlopeSpeedMultiplier } from '../terrain/SlopePhysics';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import type { NavmeshMovementAdapter } from '../navigation/NavmeshMovementAdapter';

// ── Rotation spring-damper ──
const ROTATION_SPRING = 15;
const ROTATION_DAMPING = 10;
const MAX_DELTA_TIME = 0.1;
const DEFAULT_DELTA_TIME = 0.016;

// ── Terrain sample intervals by LOD (ms) ──
const TERRAIN_SAMPLE_INTERVAL_HIGH = 80;
const TERRAIN_SAMPLE_INTERVAL_MEDIUM = 140;
const TERRAIN_SAMPLE_INTERVAL_LOW = 220;
const TERRAIN_SAMPLE_INTERVAL_CULLED = 320;
const TERRAIN_SAMPLE_MOVE_THRESHOLD_SQ = 1.0;

export class CombatantMovement {
  private static readonly TAU = Math.PI * 2;
  private terrainSystem?: ITerrainRuntime;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private gameModeManager?: GameModeManager;
  private spatialGridManager?: SpatialGridManager;
  private navmeshSystem?: NavmeshSystem;
  private navmeshAdapter?: NavmeshMovementAdapter | null;
  private readonly _spacingForce = new THREE.Vector3();

  constructor(terrainSystem?: ITerrainRuntime, zoneManager?: ZoneManager) {
    this.terrainSystem = terrainSystem;
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
      // Unregister from navmesh crowd to free the agent slot
      if (this.navmeshAdapter?.hasAgent(combatant.id)) {
        this.navmeshAdapter.unregisterAgent(combatant.id);
      }
      return;
    }

    // Vehicle-bound NPCs: position controlled by NPCVehicleController, skip all movement
    if (combatant.state === CombatantState.IN_VEHICLE || combatant.state === CombatantState.DISMOUNTING) {
      combatant.velocity.set(0, 0, 0);
      if (this.navmeshAdapter?.hasAgent(combatant.id)) {
        this.navmeshAdapter.unregisterAgent(combatant.id);
      }
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

    // Navmesh intercept: override beeline velocity with crowd-steered velocity
    // for high/medium LOD NPCs that have a registered crowd agent.
    if (this.navmeshAdapter) {
      const useNavmesh = combatant.lodLevel === 'high' || combatant.lodLevel === 'medium';
      if (useNavmesh) {
        if (!this.navmeshAdapter.hasAgent(combatant.id)) {
          this.navmeshAdapter.registerAgent(combatant);
        }
        this.navmeshAdapter.updateAgentTarget(combatant);
        this.navmeshAdapter.applyAgentVelocity(combatant);
      } else if (this.navmeshAdapter.hasAgent(combatant.id)) {
        // Low/culled LOD: unregister from crowd, fall back to beeline
        this.navmeshAdapter.unregisterAgent(combatant.id);
      }
    }

    // Apply slope speed penalty for NPCs on walkable slopes
    if (combatant.velocity.lengthSq() > 0.01) {
      const slope = getHeightQueryCache().getSlopeAt(combatant.position.x, combatant.position.z);
      const slopeMultiplier = computeSlopeSpeedMultiplier(slope);
      combatant.velocity.x *= slopeMultiplier;
      combatant.velocity.z *= slopeMultiplier;
    }

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    combatant.position.addScaledVector(combatant.velocity, deltaTime);

    // Keep on terrain with sampled/cached updates to avoid per-frame height churn at scale.
    if (!options?.disableTerrainSample) {
      const terrainHeight = this.getTerrainHeightForCombatant(combatant);
      combatant.position.y = terrainHeight + NPC_Y_OFFSET;
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
    const safeDeltaTime = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, MAX_DELTA_TIME)) : DEFAULT_DELTA_TIME;

    // Normalize to -PI..PI range using modulo math (bounded cost).
    let rotationDifference = combatant.rotation - combatant.visualRotation;
    rotationDifference = ((rotationDifference + Math.PI) % CombatantMovement.TAU + CombatantMovement.TAU) % CombatantMovement.TAU - Math.PI;

    // Apply smooth interpolation with velocity for natural movement
    const rotationAcceleration = rotationDifference * ROTATION_SPRING;
    const rotationDamping = combatant.rotationVelocity * ROTATION_DAMPING;

    combatant.rotationVelocity += (rotationAcceleration - rotationDamping) * safeDeltaTime;
    combatant.visualRotation += combatant.rotationVelocity * safeDeltaTime;

    // Normalize to 0..2PI range.
    combatant.visualRotation = ((combatant.visualRotation % CombatantMovement.TAU) + CombatantMovement.TAU) % CombatantMovement.TAU;
  }


  private getTerrainHeight(x: number, z: number): number {
    if (!this.terrainSystem) {
      throw new Error('CombatantMovement requires terrainSystem before terrain height queries');
    }
    return this.terrainSystem.getHeightAt(x, z);
  }

  private getTerrainHeightForCombatant(combatant: Combatant): number {
    const now = performance.now();
    const intervalMs =
      combatant.lodLevel === 'high' ? TERRAIN_SAMPLE_INTERVAL_HIGH :
      combatant.lodLevel === 'medium' ? TERRAIN_SAMPLE_INTERVAL_MEDIUM :
      combatant.lodLevel === 'low' ? TERRAIN_SAMPLE_INTERVAL_LOW : TERRAIN_SAMPLE_INTERVAL_CULLED;

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
      if (movedSq < TERRAIN_SAMPLE_MOVE_THRESHOLD_SQ && (now - Number(lastT)) < intervalMs) {
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

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setNavmeshSystem(navmeshSystem: NavmeshSystem): void {
    this.navmeshSystem = navmeshSystem;
    // Adapter is retrieved lazily when navmesh becomes ready
    this.navmeshAdapter = navmeshSystem.getAdapter();
  }

  /** Refresh the adapter reference (call after navmesh generation). */
  refreshNavmeshAdapter(): void {
    if (this.navmeshSystem) {
      this.navmeshAdapter = this.navmeshSystem.getAdapter();
    }
  }

  /** Unregister a combatant from the navmesh crowd (used on death/dematerialization). */
  unregisterNavmeshAgent(id: string): void {
    if (this.navmeshAdapter?.hasAgent(id)) {
      this.navmeshAdapter.unregisterAgent(id);
    }
  }

  private getEnemyBasePosition(faction: Faction): THREE.Vector3 {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();
      const lookForBlufor = !isBlufor(faction);

      const enemyBase = config.zones.find(z =>
        z.isHomeBase && z.owner !== null &&
        isBlufor(z.owner as Faction) === lookForBlufor &&
        (z.id.includes('main') || z.id.includes('_base'))
      );

      if (enemyBase) {
        return enemyBase.position.clone();
      }
    }

    // Fallback to default positions
    return isBlufor(faction) ?
      new THREE.Vector3(0, 0, 145) : // OPFOR base
      new THREE.Vector3(0, 0, -50); // US base
  }
}
