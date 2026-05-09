import * as THREE from 'three';
import { Combatant, CombatantMovementIntent, CombatantState, Faction, Squad, isBlufor } from './types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { TicketSystem } from '../world/TicketSystem';
import { GameModeManager } from '../world/GameModeManager';
import { clusterManager } from './ClusterManager';
import { SpatialGridManager } from './SpatialGridManager';
import {
  updateAdvancingMovement,
  updateCombatMovement,
  updateCoverSeekingMovement,
  updateDefendingMovement,
  updatePatrolMovement,
  updateRetreatingMovement,
  updateSuppressingMovement
} from './CombatantMovementStates';
import { NPC_MAX_SPEED, NPC_Y_OFFSET } from '../../config/CombatantConfig';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import type { NavmeshMovementAdapter } from '../navigation/NavmeshMovementAdapter';
import { StuckDetector, type StuckRecoveryAction } from './StuckDetector';
import { Logger } from '../../utils/Logger';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';
import {
  computeSlopeValueFromNormal,
  computeSmoothedSupportNormal,
} from '../terrain/GameplaySurfaceSampling';
import { isWalkableSlope } from '../terrain/SlopePhysics';

// ── Terrain sample intervals by LOD (ms) ──
const TERRAIN_SAMPLE_INTERVAL_HIGH = 80;
const TERRAIN_SAMPLE_INTERVAL_MEDIUM = 140;
const TERRAIN_SAMPLE_INTERVAL_LOW = 220;
const TERRAIN_SAMPLE_INTERVAL_CULLED = 320;
const TERRAIN_SAMPLE_MOVE_THRESHOLD_SQ = 1.0;
const NPC_SUPPORT_SAMPLE_DISTANCE = 1.2;
const NPC_SUPPORT_FOOTPRINT_RADIUS = 0.65;
const NPC_SUPPORT_LOOKAHEAD = 0.85;
const NPC_FORWARD_PROBE_DISTANCE = 1.8;
const NPC_TERRAIN_LIP_RISE = 1.0;
// Terrain solver is now close-range only (<15m). Navmesh paths avoid steep slopes.
// Uphill drag is a mild penalty for the last meters of approach, not a primary speed killer.
const NPC_TRAVERSAL_MIN_UPHILL_SPEED_FACTOR = 0.9;
const NPC_COMBAT_MIN_UPHILL_SPEED_FACTOR = 0.85;
const NPC_TRAVERSAL_UPHILL_DRAG = 0.08;
const NPC_COMBAT_UPHILL_DRAG = 0.14;
const NPC_CONTOUR_FORWARD_BLEND = 0.42;
const NPC_BACKTRACK_ARRIVAL_RADIUS_SQ = 2.25;
const NPC_PROGRESS_EPSILON_SQ = 0.5;
const NPC_LOW_PROGRESS_DELTA_SQ = 0.02;
const NPC_RECOVERY_BASE_RADIUS = 2.5;
const NPC_RECOVERY_RADIUS_STEP = 1.25;
const NPC_RECOVERY_MAX_RADIUS = 6.5;
const NPC_RECOVERY_HEADING_SAMPLES = 8;
const NPC_RECOVERY_LAST_GOOD_MAX_DISTANCE_SQ = 100;
const NPC_NAVMESH_RECOVERY_SEARCH_RADIUS = 10;
const NPC_STUCK_RECOVERY_WARN_INTERVAL_MS = 5000;

// ── Navmesh path-following ──
/** Distance threshold: use navmesh path above this, terrain solver below. */
const PATH_FOLLOW_THRESHOLD_SQ = 225; // 15m
/** Waypoint arrival radius. */
const WAYPOINT_ARRIVAL_RADIUS_SQ = 4; // 2m
/** Re-query path if destination moved more than this. */
const PATH_DESTINATION_CHANGE_SQ = 25; // 5m
/** Maximum path age before forced re-query (ms). */
const PATH_MAX_AGE_MS = 10_000;
/** Max path queries per updateMovement call (amortization). */
const PATH_QUERIES_PER_FRAME = 4;

/** Max time (ms) to reach a single waypoint before path is invalidated. */
const WAYPOINT_STALL_TIMEOUT_MS = 3000;

interface CachedNavPath {
  waypoints: THREE.Vector3[];
  currentIndex: number;
  destination: THREE.Vector3;
  queryTime: number;
  /** Time when current waypoint index was set (for stall detection). */
  waypointStartTime: number;
}

const _desiredDirection = new THREE.Vector3();
const _anchorDirection = new THREE.Vector3();
const _surfaceFlowDirection = new THREE.Vector3();
const _supportNormal = new THREE.Vector3(0, 1, 0);
const _aheadSupportNormal = new THREE.Vector3(0, 1, 0);
const _candidateSupportNormal = new THREE.Vector3(0, 1, 0);
const _contourLeft = new THREE.Vector3();
const _contourRight = new THREE.Vector3();
const _blendedDirection = new THREE.Vector3();
const _uphillDirection = new THREE.Vector3();
const _pseudoAnchor = new THREE.Vector3();
const _recoveryDirection = new THREE.Vector3();
const _recoveryCandidate = new THREE.Vector3();
const _recoveryForward = new THREE.Vector3();
const _navWaypointDirection = new THREE.Vector3();

function horizontalDistanceSq(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export class CombatantMovement {
  private static readonly TAU = Math.PI * 2;
  private terrainSystem?: ITerrainRuntime;
  private zoneQuery?: IZoneQuery;
  private ticketSystem?: TicketSystem;
  private gameModeManager?: GameModeManager;
  private spatialGridManager?: SpatialGridManager;
  private navmeshSystem?: NavmeshSystem;
  private navmeshAdapter?: NavmeshMovementAdapter | null;
  private readonly _spacingForce = new THREE.Vector3();
  private readonly stuckDetector = new StuckDetector();
  private readonly navPaths = new Map<string, CachedNavPath>();
  private pathQueriesThisFrame = 0;
  private nextStuckRecoveryWarnAtMs = 0;
  private suppressedStuckRecoveryWarns = 0;

  constructor(terrainSystem?: ITerrainRuntime, zoneQuery?: IZoneQuery) {
    this.terrainSystem = terrainSystem;
    this.zoneQuery = zoneQuery;
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
      this.stuckDetector.remove(combatant.id);
      this.navPaths.delete(combatant.id);
      performanceTelemetry.removeNPCMovementTracker(combatant.id);
      return;
    }

    // Vehicle-bound NPCs: position controlled by NPCVehicleController, skip all movement
    if (combatant.state === CombatantState.IN_VEHICLE || combatant.state === CombatantState.DISMOUNTING) {
      combatant.velocity.set(0, 0, 0);
      if (this.navmeshAdapter?.hasAgent(combatant.id)) {
        this.navmeshAdapter.unregisterAgent(combatant.id);
      }
      this.navPaths.delete(combatant.id);
      performanceTelemetry.removeNPCMovementTracker(combatant.id);
      return;
    }

    // Movement based on state
    if (combatant.state === CombatantState.PATROLLING) {
      updatePatrolMovement(combatant, deltaTime, squads, combatants, {
        zoneManager: this.zoneQuery,
        getEnemyBasePosition: (faction: Faction) => this.getEnemyBasePosition(faction)
      });
    } else if (combatant.state === CombatantState.ENGAGING) {
      updateCombatMovement(combatant);
    } else if (combatant.state === CombatantState.ADVANCING) {
      updateAdvancingMovement(combatant);
    } else if (combatant.state === CombatantState.SUPPRESSING) {
      updateSuppressingMovement(combatant);
    } else if (combatant.state === CombatantState.SEEKING_COVER) {
      updateCoverSeekingMovement(combatant);
    } else if (combatant.state === CombatantState.DEFENDING) {
      updateDefendingMovement(combatant);
    } else if (combatant.state === CombatantState.RETREATING) {
      updateRetreatingMovement(combatant);
    }

    // Apply friendly spacing force to prevent bunching
    // This gently pushes NPCs apart when they get too close to friendlies
    if (!options?.disableSpacing && this.spatialGridManager) {
      clusterManager.calculateSpacingForce(combatant, combatants, this.spatialGridManager, this._spacingForce);
      combatant.velocity.add(this._spacingForce);
      this.clampHorizontalVelocity(combatant, NPC_MAX_SPEED);
    }

    // Unregister from crowd (crowd steering disabled; path queries used instead).
    if (this.navmeshAdapter?.hasAgent(combatant.id)) {
      this.navmeshAdapter.unregisterAgent(combatant.id);
    }

    const now = performance.now();

    const goalAnchorForStuck = this.resolvePrimaryGoalAnchor(combatant);
    const speed = combatant.velocity.length();
    const navmeshWaypoint = !combatant.movementBacktrackPoint && goalAnchorForStuck && speed > 0.01
      ? this.resolveNavmeshWaypoint(combatant, goalAnchorForStuck, now)
      : null;
    if (navmeshWaypoint) {
      _navWaypointDirection.subVectors(navmeshWaypoint, combatant.position).setY(0);
      if (_navWaypointDirection.lengthSq() > 0.0001) {
        _navWaypointDirection.normalize();
        combatant.velocity.x = _navWaypointDirection.x * speed;
        combatant.velocity.z = _navWaypointDirection.z * speed;
      }
    } else if (combatant.movementBacktrackPoint && speed > 0.01) {
      _navWaypointDirection.subVectors(combatant.movementBacktrackPoint, combatant.position).setY(0);
      if (_navWaypointDirection.lengthSq() > 0.0001) {
        _navWaypointDirection.normalize();
        combatant.velocity.x = _navWaypointDirection.x * speed;
        combatant.velocity.z = _navWaypointDirection.z * speed;
      }
    }

    const steering = this.applyTerrainAwareVelocity(combatant, now, navmeshWaypoint);
    this.clampHorizontalVelocity(combatant, NPC_MAX_SPEED);

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    combatant.position.addScaledVector(combatant.velocity, deltaTime);

    // Keep on terrain with sampled/cached updates to avoid per-frame height churn at scale.
    if (!options?.disableTerrainSample) {
      if (!this.syncTerrainHeight(combatant)) {
        throw new Error('CombatantMovement requires terrainSystem before terrain height queries');
      }
    }

    const progress = this.updateProgressTracking(combatant, steering.anchorDistanceBeforeSq, now);

    // Pass the *goal* anchor (destination/cover/target) separately so the
    // stuck detector's escalation counter does not reset every time the
    // transient movement anchor flips between a backtrack point and the goal.
    // This is what allows repeated-stall escalation (-> 'hold') to actually
    // fire when an NPC is stuck against an unreachable objective.
    const stuckAction: StuckRecoveryAction = this.stuckDetector.checkAndRecover(
      combatant,
      now,
      goalAnchorForStuck,
    );
    let backtrackActivated = false;
    if (stuckAction === 'backtrack') {
      backtrackActivated = this.activateBacktrack(combatant);
      if (backtrackActivated) {
        this.warnStuckRecovery(combatant.id, 'backtrack', now);
      }
    } else if (stuckAction === 'hold') {
      // Force the combatant out of whatever state it was anchored on so it
      // re-targets next tick instead of holding indefinitely. Without this
      // sequence, NPCs with unreachable goals freeze visibly. See
      // docs/tasks/npc-unfreeze-and-stuck.md.
      combatant.movementBacktrackPoint = undefined;
      combatant.destinationPoint = undefined;
      combatant.target = null;
      combatant.state = CombatantState.PATROLLING;
      combatant.lastZoneEvalTime = 0;
      combatant.movementIntent = 'hold';
      combatant.velocity.set(0, 0, 0);
      this.warnStuckRecovery(combatant.id, 'hold', now);
    }

    const telemetryIntent: CombatantMovementIntent = backtrackActivated
      ? 'backtrack'
      : (combatant.movementIntent ?? 'hold');
    performanceTelemetry.recordNPCMovementSample(
      combatant.id,
      combatant.lodLevel,
      telemetryIntent,
      progress.progressDelta,
      progress.lowProgress,
      steering.contourActivated,
      backtrackActivated,
      progress.arrived,
      deltaTime,
      combatant.position.x,
      combatant.position.z,
      telemetryIntent !== 'hold' && combatant.velocity.lengthSq() > 0.01,
    );
  }

  private clampHorizontalVelocity(combatant: Combatant, maxSpeed: number): void {
    const max = Math.max(0, maxSpeed);
    const speedSq = combatant.velocity.x * combatant.velocity.x + combatant.velocity.z * combatant.velocity.z;
    const maxSq = max * max;
    if (!Number.isFinite(speedSq) || speedSq <= maxSq || maxSq <= 0) return;
    const scale = max / Math.sqrt(speedSq);
    combatant.velocity.x *= scale;
    combatant.velocity.z *= scale;
  }

  updateRotation(combatant: Combatant, _deltaTime: number): void {
    // Guard against NaN/Infinity to avoid unbounded normalization loops on bad state.
    if (!Number.isFinite(combatant.rotation)) {
      combatant.rotation = 0;
    }
    if (!Number.isFinite(combatant.rotationVelocity)) {
      combatant.rotationVelocity = 0;
    }

    // The Pixel Forge package has no reliable turn-in-place rig. Keep facing
    // authoritative and deterministic instead of running a spring turn blend.
    combatant.visualRotation = ((combatant.rotation % CombatantMovement.TAU) + CombatantMovement.TAU) % CombatantMovement.TAU;
    combatant.rotationVelocity = 0;
  }

  private applyTerrainAwareVelocity(
    combatant: Combatant,
    now: number,
    anchorOverride?: THREE.Vector3 | null,
  ): { anchorDistanceBeforeSq: number; contourActivated: boolean } {
    const anchor = anchorOverride ?? this.resolveMovementAnchor(combatant);
    if (anchor) {
      this.setMovementAnchor(combatant, anchor, now);
    } else {
      combatant.movementAnchor = undefined;
    }

    const baseSpeed = combatant.velocity.length();
    if (baseSpeed <= 0.01) {
      combatant.velocity.set(0, 0, 0);
      combatant.movementIntent = anchor ? this.resolveMovementIntent(combatant) : 'hold';
      return {
        anchorDistanceBeforeSq: anchor ? combatant.position.distanceToSquared(anchor) : Number.POSITIVE_INFINITY,
        contourActivated: false,
      };
    }

    const desiredDirection = _desiredDirection.copy(combatant.velocity).setY(0);
    if (desiredDirection.lengthSq() <= 0.0001) {
      combatant.velocity.set(0, 0, 0);
      combatant.movementIntent = 'hold';
      return {
        anchorDistanceBeforeSq: Number.POSITIVE_INFINITY,
        contourActivated: false,
      };
    }
    desiredDirection.normalize();

    const activeAnchor = anchor
      ?? _pseudoAnchor.copy(combatant.position).addScaledVector(desiredDirection, NPC_FORWARD_PROBE_DISTANCE * 4);
    const anchorDirection = _anchorDirection.subVectors(activeAnchor, combatant.position).setY(0);
    if (anchorDirection.lengthSq() > 0.0001) {
      anchorDirection.normalize();
    } else {
      anchorDirection.copy(desiredDirection);
    }

    const supportNormal = this.sampleSupportNormal(
      combatant.position.x,
      combatant.position.z,
      desiredDirection.x,
      desiredDirection.z,
      _supportNormal,
    );

    const baseIntent = this.resolveMovementIntent(combatant);
    let finalDirection = this.projectDirectionOnSurface(
      desiredDirection,
      supportNormal,
      anchorDirection,
      _surfaceFlowDirection,
    );
    if (finalDirection.lengthSq() <= 0.0001) {
      finalDirection = desiredDirection;
    }
    let contourActivated = false;
    let finalIntent = baseIntent;

    if (anchor && this.isForwardBlocked(combatant.position, finalDirection)) {
      const contourDirection = this.chooseContourDirection(
        combatant,
        finalDirection,
        anchorDirection,
        supportNormal,
      );
      if (contourDirection.lengthSq() > 0.0001) {
        finalDirection = contourDirection;
        contourActivated = true;
        finalIntent = combatant.movementBacktrackPoint
          ? 'backtrack'
          : combatant.isFlankingMove
            ? 'flank_arc'
            : 'contour';
      }
    }

    const speedFactor = this.computeDirectionalSpeedFactor(combatant, finalDirection, finalIntent);
    combatant.velocity.x = finalDirection.x * baseSpeed * speedFactor;
    combatant.velocity.z = finalDirection.z * baseSpeed * speedFactor;
    combatant.movementIntent = finalIntent;

    if (
      combatant.state !== CombatantState.ENGAGING &&
      combatant.state !== CombatantState.SUPPRESSING &&
      finalDirection.lengthSq() > 0.001
    ) {
      combatant.rotation = Math.atan2(finalDirection.z, finalDirection.x);
    }

    return {
      anchorDistanceBeforeSq: anchor ? combatant.position.distanceToSquared(anchor) : Number.POSITIVE_INFINITY,
      contourActivated,
    };
  }

  private resolveMovementAnchor(combatant: Combatant): THREE.Vector3 | undefined {
    if (combatant.movementBacktrackPoint) {
      const backtrackDistSq = combatant.position.distanceToSquared(combatant.movementBacktrackPoint);
      if (backtrackDistSq <= NPC_BACKTRACK_ARRIVAL_RADIUS_SQ) {
        combatant.movementBacktrackPoint = undefined;
      } else {
        return combatant.movementBacktrackPoint;
      }
    }

    return this.resolvePrimaryGoalAnchor(combatant);
  }

  private resolvePrimaryGoalAnchor(combatant: Combatant): THREE.Vector3 | undefined {
    if (combatant.state === CombatantState.SEEKING_COVER && combatant.coverPosition) {
      return combatant.coverPosition;
    }
    if (combatant.destinationPoint) {
      return combatant.destinationPoint;
    }
    if (combatant.state === CombatantState.ENGAGING && combatant.target) {
      return combatant.target.position;
    }
    return undefined;
  }

  private resolveMovementIntent(combatant: Combatant): CombatantMovementIntent {
    if (combatant.movementBacktrackPoint) return 'backtrack';
    if (combatant.state === CombatantState.SEEKING_COVER) return 'cover_hop';
    if (combatant.isFlankingMove) return 'flank_arc';
    if (combatant.state === CombatantState.PATROLLING || combatant.state === CombatantState.DEFENDING) {
      return 'route_follow';
    }
    if (
      combatant.state === CombatantState.ADVANCING ||
      combatant.state === CombatantState.ENGAGING ||
      combatant.state === CombatantState.RETREATING
    ) {
      return 'direct_push';
    }
    return 'hold';
  }

  // ── Navmesh path-following ────────────────────────────────────────

  /**
   * Resolve a navmesh waypoint for long-distance travel.
   * Returns the current waypoint to steer toward, or null if navmesh routing
   * is not applicable (close range, no path, navmesh unavailable).
   * Does NOT set velocity - the terrain-aware solver handles actual movement.
   */
  private resolveNavmeshWaypoint(
    combatant: Combatant,
    anchor: THREE.Vector3,
    now: number,
  ): THREE.Vector3 | null {
    if (!this.navmeshSystem?.isReady()) return null;

    const distToAnchorSq = horizontalDistanceSq(combatant.position, anchor);

    // Close enough: let terrain-aware solver handle directly
    if (distToAnchorSq <= PATH_FOLLOW_THRESHOLD_SQ) {
      this.navPaths.delete(combatant.id);
      return null;
    }

    // Get or query path
    const path = this.getOrQueryPath(combatant, anchor, now);
    if (!path || path.waypoints.length < 2) {
      this.navPaths.delete(combatant.id);
      return null;
    }

    // Advance waypoint index
    const prevIndex = path.currentIndex;
    while (
      path.currentIndex < path.waypoints.length - 1 &&
      horizontalDistanceSq(combatant.position, path.waypoints[path.currentIndex]) < WAYPOINT_ARRIVAL_RADIUS_SQ
    ) {
      path.currentIndex++;
    }
    if (path.currentIndex !== prevIndex) {
      path.waypointStartTime = now;
    }

    if (path.currentIndex < path.waypoints.length - 1) {
      const currentWaypoint = path.waypoints[path.currentIndex];
      if (this.isWaypointDirectionBlocked(combatant.position, currentWaypoint)) {
        for (let i = path.currentIndex + 1; i < path.waypoints.length; i++) {
          if (!this.isWaypointDirectionBlocked(combatant.position, path.waypoints[i])) {
            path.currentIndex = i;
            path.waypointStartTime = now;
            combatant.movementContourSign = undefined;
            break;
          }
        }
      }
    }

    // Stall detection: if stuck at same waypoint too long, invalidate path
    if (now - path.waypointStartTime > WAYPOINT_STALL_TIMEOUT_MS) {
      this.navPaths.delete(combatant.id);
      return null;
    }

    // If at the last waypoint and close: switch to direct terrain solver
    if (path.currentIndex >= path.waypoints.length - 1) {
      const lastWp = path.waypoints[path.waypoints.length - 1];
      if (horizontalDistanceSq(combatant.position, lastWp) < PATH_FOLLOW_THRESHOLD_SQ) {
        this.navPaths.delete(combatant.id);
        return null;
      }
    }

    return path.waypoints[path.currentIndex];
  }

  private isWaypointDirectionBlocked(position: THREE.Vector3, waypoint: THREE.Vector3): boolean {
    _navWaypointDirection.subVectors(waypoint, position).setY(0);
    if (_navWaypointDirection.lengthSq() <= WAYPOINT_ARRIVAL_RADIUS_SQ) {
      return false;
    }
    _navWaypointDirection.normalize();
    return this.isForwardBlocked(position, _navWaypointDirection);
  }

  private getOrQueryPath(
    combatant: Combatant,
    anchor: THREE.Vector3,
    now: number,
  ): CachedNavPath | null {
    const cached = this.navPaths.get(combatant.id);

    if (cached) {
      // Check if destination changed significantly or path is stale
      const destChangedSq = cached.destination.distanceToSquared(anchor);
      const age = now - cached.queryTime;
      if (destChangedSq < PATH_DESTINATION_CHANGE_SQ && age < PATH_MAX_AGE_MS) {
        return cached;
      }
      // Invalidate stale/mismatched path
      this.navPaths.delete(combatant.id);
    }

    // Amortize queries across frame
    if (this.pathQueriesThisFrame >= PATH_QUERIES_PER_FRAME) return null;
    this.pathQueriesThisFrame++;

    // Query navmesh for path at terrain level (subtract NPC_Y_OFFSET)
    const startPos = _pseudoAnchor.set(
      combatant.position.x,
      combatant.position.y - NPC_Y_OFFSET,
      combatant.position.z,
    );
    const endPos = new THREE.Vector3(anchor.x, anchor.y - NPC_Y_OFFSET, anchor.z);
    const waypoints = this.navmeshSystem!.queryPath(startPos, endPos);

    if (!waypoints || waypoints.length === 0) return null;

    const newPath: CachedNavPath = {
      waypoints,
      currentIndex: 0,
      destination: anchor.clone(),
      queryTime: now,
      waypointStartTime: now,
    };
    this.navPaths.set(combatant.id, newPath);
    return newPath;
  }

  /** Reset per-frame query counter. Call once per tick before processing combatants. */
  resetPathQueryBudget(): void {
    this.pathQueriesThisFrame = 0;
  }

  /** Clean up path cache for removed combatant. */
  removePathCache(id: string): void {
    this.navPaths.delete(id);
  }

  private setMovementAnchor(combatant: Combatant, anchor: THREE.Vector3, now: number): void {
    const anchorChanged = !combatant.movementAnchor
      || combatant.movementAnchor.distanceToSquared(anchor) > 4;

    if (combatant.movementAnchor) {
      combatant.movementAnchor.copy(anchor);
    } else {
      combatant.movementAnchor = anchor.clone();
    }

    if (!anchorChanged) {
      return;
    }

    combatant.movementLastProgressTimeMs = now;
    combatant.movementLastProgressDistanceSq = combatant.position.distanceToSquared(anchor);
    if (combatant.movementLastGoodPosition) {
      combatant.movementLastGoodPosition.copy(combatant.position);
    } else {
      combatant.movementLastGoodPosition = combatant.position.clone();
    }
    combatant.movementContourSign = undefined;
  }

  private sampleSupportNormal(
    x: number,
    z: number,
    moveX: number,
    moveZ: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    return computeSmoothedSupportNormal(
      (sampleX, sampleZ) => this.getTerrainHeight(sampleX, sampleZ),
      x,
      z,
      target,
      {
        sampleDistance: NPC_SUPPORT_SAMPLE_DISTANCE,
        footprintRadius: NPC_SUPPORT_FOOTPRINT_RADIUS,
        lookaheadDistance: NPC_SUPPORT_LOOKAHEAD,
        moveX,
        moveZ,
      },
    );
  }

  private isForwardBlocked(position: THREE.Vector3, direction: THREE.Vector3): boolean {
    const currentHeight = this.getTerrainHeight(position.x, position.z);
    const aheadX = position.x + direction.x * NPC_FORWARD_PROBE_DISTANCE;
    const aheadZ = position.z + direction.z * NPC_FORWARD_PROBE_DISTANCE;
    const aheadHeight = this.getTerrainHeight(aheadX, aheadZ);

    if (aheadHeight <= currentHeight + NPC_TERRAIN_LIP_RISE) {
      return false;
    }

    const aheadNormal = this.sampleSupportNormal(
      aheadX,
      aheadZ,
      direction.x,
      direction.z,
      _aheadSupportNormal,
    );
    return !isWalkableSlope(computeSlopeValueFromNormal(aheadNormal));
  }

  private projectDirectionOnSurface(
    direction: THREE.Vector3,
    supportNormal: THREE.Vector3,
    fallbackDirection: THREE.Vector3,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    target.copy(direction).projectOnPlane(supportNormal);
    target.y = 0;
    if (target.lengthSq() <= 0.0001) {
      target.copy(fallbackDirection).setY(0);
    }
    if (target.lengthSq() <= 0.0001) {
      target.copy(direction).setY(0);
    }
    if (target.lengthSq() <= 0.0001) {
      return target.set(0, 0, 0);
    }
    return target.normalize();
  }

  private chooseContourDirection(
    combatant: Combatant,
    desiredDirection: THREE.Vector3,
    anchorDirection: THREE.Vector3,
    supportNormal: THREE.Vector3,
  ): THREE.Vector3 {
    const downhillLength = Math.hypot(supportNormal.x, supportNormal.z);
    let uphillX = 0;
    let uphillZ = 0;

    if (downhillLength > 0.001) {
      uphillX = -supportNormal.x / downhillLength;
      uphillZ = -supportNormal.z / downhillLength;
    } else {
      uphillX = desiredDirection.x;
      uphillZ = desiredDirection.z;
    }

    _contourLeft.set(-uphillZ, 0, uphillX).normalize();
    _contourRight.set(uphillZ, 0, -uphillX).normalize();

    const leftScore = this.scoreContourDirection(combatant, _contourLeft, anchorDirection, -1);
    const rightScore = this.scoreContourDirection(combatant, _contourRight, anchorDirection, 1);
    const useLeft = leftScore >= rightScore;
    const chosenSign: -1 | 1 = useLeft ? -1 : 1;
    const chosenDirection = useLeft ? _contourLeft : _contourRight;

    combatant.movementContourSign = chosenSign;
    _blendedDirection.copy(chosenDirection)
      .multiplyScalar(1 - NPC_CONTOUR_FORWARD_BLEND)
      .addScaledVector(anchorDirection, NPC_CONTOUR_FORWARD_BLEND);
    if (_blendedDirection.lengthSq() > 0.0001) {
      _blendedDirection.normalize();
      if (!this.isForwardBlocked(combatant.position, _blendedDirection)) {
        chosenDirection.copy(_blendedDirection);
      }
    }

    return chosenDirection;
  }

  private scoreContourDirection(
    combatant: Combatant,
    direction: THREE.Vector3,
    anchorDirection: THREE.Vector3,
    sign: -1 | 1,
  ): number {
    const currentHeight = this.getTerrainHeight(combatant.position.x, combatant.position.z);
    const aheadX = combatant.position.x + direction.x * NPC_FORWARD_PROBE_DISTANCE;
    const aheadZ = combatant.position.z + direction.z * NPC_FORWARD_PROBE_DISTANCE;
    const aheadHeight = this.getTerrainHeight(aheadX, aheadZ);
    const aheadNormal = this.sampleSupportNormal(
      aheadX,
      aheadZ,
      direction.x,
      direction.z,
      _candidateSupportNormal,
    );
    const aheadSlopeValue = computeSlopeValueFromNormal(aheadNormal);
    const flowFactor = this.computeDirectionalSpeedFactor(combatant, direction, combatant.movementIntent);
    let score = direction.dot(anchorDirection) * 1.5 + aheadNormal.y * 1.5 + flowFactor * 2;
    if (!isWalkableSlope(aheadSlopeValue)) {
      score -= 0.75;
    }
    score -= Math.max(0, aheadHeight - currentHeight - NPC_TERRAIN_LIP_RISE) * 0.35;
    if (combatant.movementContourSign === sign) {
      score += 0.25;
    }
    return score;
  }

  private computeDirectionalSpeedFactor(
    combatant: Combatant,
    direction: THREE.Vector3,
    intent: CombatantMovementIntent = combatant.movementIntent ?? this.resolveMovementIntent(combatant),
  ): number {
    const currentHeight = this.getTerrainHeight(combatant.position.x, combatant.position.z);
    const aheadHeight = this.getTerrainHeight(
      combatant.position.x + direction.x * NPC_FORWARD_PROBE_DISTANCE,
      combatant.position.z + direction.z * NPC_FORWARD_PROBE_DISTANCE,
    );
    const uphillGrade = Math.max(0, (aheadHeight - currentHeight) / NPC_FORWARD_PROBE_DISTANCE);
    const traversalIntent =
      intent === 'route_follow' ||
      intent === 'backtrack' ||
      intent === 'flank_arc' ||
      intent === 'cover_hop' ||
      (intent === 'direct_push' && combatant.state === CombatantState.ADVANCING);
    const minSpeedFactor = traversalIntent
      ? NPC_TRAVERSAL_MIN_UPHILL_SPEED_FACTOR
      : NPC_COMBAT_MIN_UPHILL_SPEED_FACTOR;
    const uphillDrag = traversalIntent ? NPC_TRAVERSAL_UPHILL_DRAG : NPC_COMBAT_UPHILL_DRAG;
    return THREE.MathUtils.clamp(1 - uphillGrade * uphillDrag, minSpeedFactor, 1);
  }

  private updateProgressTracking(
    combatant: Combatant,
    anchorDistanceBeforeSq: number,
    now: number,
  ): { progressDelta: number; lowProgress: boolean; arrived: boolean } {
    if (!combatant.movementAnchor || !Number.isFinite(anchorDistanceBeforeSq)) {
      return { progressDelta: 0, lowProgress: false, arrived: false };
    }

    const anchorDistanceAfterSq = combatant.position.distanceToSquared(combatant.movementAnchor);
    const progressDelta = Math.max(0, Math.sqrt(anchorDistanceBeforeSq) - Math.sqrt(anchorDistanceAfterSq));
    const improved = anchorDistanceBeforeSq - anchorDistanceAfterSq > NPC_PROGRESS_EPSILON_SQ;
    const isBacktracking = Boolean(
      combatant.movementBacktrackPoint &&
      combatant.movementAnchor.distanceToSquared(combatant.movementBacktrackPoint) < 0.01,
    );
    const arrived = isBacktracking && anchorDistanceAfterSq <= NPC_BACKTRACK_ARRIVAL_RADIUS_SQ;

    if (improved) {
      combatant.movementLastProgressTimeMs = now;
      combatant.movementLastProgressDistanceSq = anchorDistanceAfterSq;
      if (combatant.movementLastGoodPosition) {
        combatant.movementLastGoodPosition.copy(combatant.position);
      } else {
        combatant.movementLastGoodPosition = combatant.position.clone();
      }
    }

    if (arrived) {
      combatant.movementBacktrackPoint = undefined;
    }

    const lowProgress = combatant.velocity.lengthSq() > 0.01 && progressDelta * progressDelta < NPC_LOW_PROGRESS_DELTA_SQ;
    return { progressDelta, lowProgress, arrived };
  }

  private activateBacktrack(combatant: Combatant): boolean {
    // Prefer navmesh-backed recovery at an actual progress point. Snapping the
    // current position can produce a zero-distance backtrack and immediate
    // retry loop on terrain lips.
    if (this.navmeshSystem?.isReady()) {
      const lastGoodPosition = combatant.movementLastGoodPosition;
      if (
        lastGoodPosition &&
        horizontalDistanceSq(combatant.position, lastGoodPosition) > NPC_BACKTRACK_ARRIVAL_RADIUS_SQ &&
        this.trySetNavmeshBacktrackPoint(combatant, lastGoodPosition)
      ) {
        return true;
      }

      const recoveryPoint = this.selectRecoveryPoint(combatant);
      if (recoveryPoint) {
        if (this.trySetNavmeshBacktrackPoint(combatant, recoveryPoint)) {
          return true;
        }

        this.setBacktrackPoint(combatant, recoveryPoint);
        return true;
      }

      return false;
    }

    // Fallback: existing terrain-based recovery scoring
    const recoveryPoint = this.selectRecoveryPoint(combatant);
    if (!recoveryPoint) {
      return false;
    }

    this.setBacktrackPoint(combatant, recoveryPoint);
    return true;
  }

  private trySetNavmeshBacktrackPoint(combatant: Combatant, candidate: THREE.Vector3): boolean {
    if (!this.navmeshSystem?.isReady()) {
      return false;
    }

    const queryPos = _pseudoAnchor.set(
      candidate.x,
      candidate.y - NPC_Y_OFFSET,
      candidate.z,
    );
    const nearest = this.navmeshSystem.findNearestPoint(queryPos, NPC_NAVMESH_RECOVERY_SEARCH_RADIUS);
    if (!nearest) {
      return false;
    }

    nearest.y += NPC_Y_OFFSET;
    if (horizontalDistanceSq(combatant.position, nearest) <= NPC_BACKTRACK_ARRIVAL_RADIUS_SQ) {
      return false;
    }

    this.setBacktrackPoint(combatant, nearest);
    return true;
  }

  private setBacktrackPoint(combatant: Combatant, point: THREE.Vector3): void {
    if (combatant.movementBacktrackPoint) {
      combatant.movementBacktrackPoint.copy(point);
    } else {
      combatant.movementBacktrackPoint = point.clone();
    }
    this.navPaths.delete(combatant.id);
    combatant.movementIntent = 'backtrack';
    combatant.movementContourSign = undefined;
  }

  private warnStuckRecovery(combatantId: string, action: 'backtrack' | 'hold', now: number): void {
    this.suppressedStuckRecoveryWarns++;
    if (now < this.nextStuckRecoveryWarnAtMs) {
      return;
    }

    const suppressed = Math.max(0, this.suppressedStuckRecoveryWarns - 1);
    this.suppressedStuckRecoveryWarns = 0;
    this.nextStuckRecoveryWarnAtMs = now + NPC_STUCK_RECOVERY_WARN_INTERVAL_MS;
    const actionText = action === 'backtrack'
      ? 'stalled on terrain, backtracking to last good progress point'
      : 'exceeded max recovery attempts, holding position';
    const suffix = suppressed > 0
      ? ` (${suppressed} additional terrain-stall recoveries suppressed)`
      : '';
    Logger.warn('combat', `NPC ${combatantId} ${actionText}${suffix}`);
  }

  private selectRecoveryPoint(combatant: Combatant): THREE.Vector3 | undefined {
    const currentPos = combatant.position;
    const goalAnchor = this.resolvePrimaryGoalAnchor(combatant);
    const currentGoalDistSq = goalAnchor
      ? currentPos.distanceToSquared(goalAnchor)
      : Number.POSITIVE_INFINITY;
    const lastGoodPosition = combatant.movementLastGoodPosition;
    const recoveryCount = this.stuckDetector.getRecord(combatant.id)?.recoveryCount ?? 1;
    const baseRadius = Math.min(
      NPC_RECOVERY_MAX_RADIUS,
      NPC_RECOVERY_BASE_RADIUS + Math.max(0, recoveryCount - 1) * NPC_RECOVERY_RADIUS_STEP,
    );
    const currentHeight = this.getTerrainHeight(currentPos.x, currentPos.z);

    if (goalAnchor) {
      _recoveryForward.subVectors(goalAnchor, currentPos).setY(0);
      if (_recoveryForward.lengthSq() > 0.0001) {
        _recoveryForward.normalize();
      }
    }
    if (_recoveryForward.lengthSq() <= 0.0001) {
      _recoveryForward.copy(combatant.velocity).setY(0);
      if (_recoveryForward.lengthSq() > 0.0001) {
        _recoveryForward.normalize();
      } else {
        _recoveryForward.set(1, 0, 0);
      }
    }

    let bestScore = Number.NEGATIVE_INFINITY;
    let bestPoint: THREE.Vector3 | undefined;

    const evaluateCandidate = (candidate: THREE.Vector3): void => {
      const candidateDir = _recoveryDirection.subVectors(candidate, currentPos).setY(0);
      const distanceSq = candidateDir.lengthSq();
      if (distanceSq < 1) {
        return;
      }
      candidateDir.normalize();

      const candidateHeight = this.getTerrainHeight(candidate.x, candidate.z);
      const candidateNormal = this.sampleSupportNormal(
        candidate.x,
        candidate.z,
        candidateDir.x,
        candidateDir.z,
        _candidateSupportNormal,
      );
      const flowFactor = this.computeDirectionalSpeedFactor(combatant, candidateDir);
      const goalImprovement = Number.isFinite(currentGoalDistSq) && goalAnchor
        ? Math.sqrt(currentGoalDistSq) - candidate.distanceTo(goalAnchor)
        : 0;
      const lastGoodBonus = lastGoodPosition
        ? Math.max(0, 6 - candidate.distanceTo(lastGoodPosition)) * 0.25
        : 0;

      const score =
        candidateDir.dot(_recoveryForward) * 1.25 +
        goalImprovement * 0.65 +
        flowFactor * 2 +
        candidateNormal.y * 1.5 +
        lastGoodBonus -
        Math.max(0, candidateHeight - currentHeight) * 0.3;

      if (score > bestScore) {
        bestScore = score;
        if (bestPoint) {
          bestPoint.copy(candidate);
        } else {
          bestPoint = candidate.clone();
        }
      }
    };

    if (
      lastGoodPosition &&
      currentPos.distanceToSquared(lastGoodPosition) > 1 &&
      currentPos.distanceToSquared(lastGoodPosition) <= NPC_RECOVERY_LAST_GOOD_MAX_DISTANCE_SQ
    ) {
      evaluateCandidate(lastGoodPosition);
    }

    const localSupportNormal = this.sampleSupportNormal(
      currentPos.x,
      currentPos.z,
      _recoveryForward.x,
      _recoveryForward.z,
      _supportNormal,
    );
    const downhillLength = Math.hypot(localSupportNormal.x, localSupportNormal.z);
    if (downhillLength > 0.001) {
      _uphillDirection.set(
        -localSupportNormal.x / downhillLength,
        0,
        -localSupportNormal.z / downhillLength,
      );
      _recoveryCandidate.set(
        currentPos.x + _uphillDirection.x * baseRadius,
        currentPos.y,
        currentPos.z + _uphillDirection.z * baseRadius,
      );
      evaluateCandidate(_recoveryCandidate);

      _contourLeft.set(-_uphillDirection.z, 0, _uphillDirection.x).normalize();
      _contourRight.set(_uphillDirection.z, 0, -_uphillDirection.x).normalize();

      _recoveryCandidate.set(
        currentPos.x + _contourLeft.x * baseRadius,
        currentPos.y,
        currentPos.z + _contourLeft.z * baseRadius,
      );
      evaluateCandidate(_recoveryCandidate);

      _recoveryCandidate.set(
        currentPos.x + _contourRight.x * baseRadius,
        currentPos.y,
        currentPos.z + _contourRight.z * baseRadius,
      );
      evaluateCandidate(_recoveryCandidate);
    }

    const forwardAngle = Math.atan2(_recoveryForward.z, _recoveryForward.x);
    const radii = [baseRadius, Math.min(NPC_RECOVERY_MAX_RADIUS, baseRadius * 1.5)];
    for (const radius of radii) {
      for (let i = 0; i < NPC_RECOVERY_HEADING_SAMPLES; i++) {
        const angle = forwardAngle + (i / NPC_RECOVERY_HEADING_SAMPLES) * Math.PI * 2;
        _recoveryCandidate.set(
          currentPos.x + Math.cos(angle) * radius,
          currentPos.y,
          currentPos.z + Math.sin(angle) * radius,
        );
        evaluateCandidate(_recoveryCandidate);
      }
    }

    return bestPoint;
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

  /**
   * Cheap terrain grounding hook for LOD paths that intentionally skip the
   * full movement solver. Uses the same per-LOD cache as normal movement so
   * distant crowds do not carry stale or synthetic altitude across slopes.
   */
  syncTerrainHeight(combatant: Combatant): boolean {
    if (!this.terrainSystem) {
      return false;
    }
    const terrainHeight = this.getTerrainHeightForCombatant(combatant);
    combatant.position.y = terrainHeight + NPC_Y_OFFSET;
    return true;
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  setZoneManager(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
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
    this.stuckDetector.remove(id);
    performanceTelemetry.removeNPCMovementTracker(id);
  }

  /** Reset stuck detection state (call on round/mode transitions). */
  resetStuckDetector(): void {
    this.stuckDetector.clear();
    this.nextStuckRecoveryWarnAtMs = 0;
    this.suppressedStuckRecoveryWarns = 0;
  }

  private getEnemyBasePosition(faction: Faction): THREE.Vector3 {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();
      const isFriendlyBlufor = isBlufor(faction);

      // Find enemy home base: any home base that belongs to the opposing alliance
      let enemyBase = config.zones.find(z =>
        z.isHomeBase && z.owner !== null &&
        isBlufor(z.owner as Faction) !== isFriendlyBlufor
      );

      // Fallback: find any home base whose ID suggests the enemy faction
      if (!enemyBase) {
        const enemyIdHint = isFriendlyBlufor ? 'opfor' : 'us';
        enemyBase = config.zones.find(z =>
          z.isHomeBase && z.id.toLowerCase().includes(enemyIdHint)
        );
      }

      // Last resort: find the farthest non-friendly zone (heuristic for "enemy territory")
      if (!enemyBase) {
        let farthest = null;
        let maxDist = 0;
        for (const z of config.zones) {
          if (z.owner === faction) continue;
          const d = z.position.length(); // distance from origin as proxy
          if (d > maxDist) { maxDist = d; farthest = z; }
        }
        if (farthest) return farthest.position.clone();
      }

      if (enemyBase) {
        return enemyBase.position.clone();
      }
    }

    // Absolute fallback - should rarely hit with the above heuristics
    return isBlufor(faction)
      ? new THREE.Vector3(0, 0, 200)
      : new THREE.Vector3(0, 0, -200);
  }
}
