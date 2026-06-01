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
import { NPC_MAX_SPEED, NPC_Y_OFFSET, NpcLodConfig } from '../../config/CombatantConfig';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import type { NavmeshMovementAdapter } from '../navigation/NavmeshMovementAdapter';
import { StuckDetector, type StuckRecoveryAction } from './StuckDetector';
import { SlopeStuckDetector } from './SlopeStuckDetector';
import { Logger } from '../../utils/Logger';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';
import {
  computeSlopeValueFromNormal,
  computeSmoothedSupportNormal,
} from '../terrain/GameplaySurfaceSampling';
import {
  computeSlopeSlideVelocity,
  isWalkableSlope,
  SLOPE_SLIDE_STRENGTH,
} from '../terrain/SlopePhysics';

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
/**
 * Wall-clock ms of contour-activated + low-progress accumulation that
 * counts as a terrain-solver stall loop. When the navmesh-followed
 * waypoint points across un-traversable terrain (e.g. a steep ridge the
 * navmesh did not classify), contour deflects ~90° each tick and the NPC
 * oscillates around the waypoint with no net forward progress. After this
 * window, the cached navmesh path is invalidated so the next tick fetches
 * a fresh route that goes around the obstacle. Long enough that the local
 * contour blend gets a real chance to clear the lip before we re-query,
 * short enough that the stop-and-go is not perceptible on screen.
 */
const NPC_CONTOUR_STALL_REROUTE_MS = 1200;
/**
 * Window (ms) the chosen contour side ({@link Combatant.movementContourSign})
 * is reused before re-scoring the left/right candidates. Re-scoring samples the
 * support normal twice per tick — the dominant terrain-sampling cost for a
 * contour-stalled NPC at convergence. While the NPC stays blocked the chosen
 * side is stable (and committing to it longer also dampens the side-flip
 * oscillation the reroute guard was added to fight), so the score is cached for
 * this window and the contour vector is rebuilt from the freshly sampled normal.
 */
const NPC_CONTOUR_RESCORE_INTERVAL_MS = 200;
/**
 * Convergence dispersal (NpcLodConfig.stallDispersalEnabled): distance (m) a
 * held-and-crowded NPC is sent away from the local crowd centroid. Kept above
 * the patrol DESTINATION_ARRIVAL_RADIUS (15m) so a leader does not immediately
 * count the dispersal point as "reached" and re-pick the contested zone.
 */
const NPC_STALL_DISPERSAL_DISTANCE = 18;
/**
 * Minimum squared magnitude of the friendly spacing force for an NPC to count
 * as "in a crowd" worth dispersing from. The spacing force is non-zero only
 * when same-faction NPCs sit within the spacing radius, so any meaningful
 * magnitude means the NPC is packed; below this it is an isolated stall and the
 * default immediate-unfreeze applies instead.
 */
const NPC_STALL_DISPERSAL_MIN_FORCE_SQ = 1e-4;
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

// ── Water wade / route-around ──
/**
 * Wade-slowdown weight applied to `immersion01` ∈ [0, 1). NPC ground speed scales
 * with `1 - immersion01 * WADE_SPEED_IMMERSION_WEIGHT` while in shallow water.
 * Calibrated against the VODA-2 brief (R1, npc-wade-behavior).
 */
const WADE_SPEED_IMMERSION_WEIGHT = 0.6;
/**
 * Deep-water threshold. `immersion01 >= DEEP_WATER_IMMERSION_THRESHOLD` is treated
 * as swim-required terrain: NPCs in R1 cannot swim, so the navmesh path-follower
 * skips waypoints lying in deep water and invalidates the cached path to force a
 * re-route. Player-swim handling lives in `player-swim-and-breath`.
 */
const DEEP_WATER_IMMERSION_THRESHOLD = 1.0;

/** Max time (ms) to reach a single waypoint before path is invalidated. */
const WAYPOINT_STALL_TIMEOUT_MS = 3000;

interface CachedNavPath {
  waypoints: THREE.Vector3[];
  currentIndex: number;
  destination: THREE.Vector3;
  queryTime: number;
  /** Time when current waypoint index was set (for stall detection). */
  waypointStartTime: number;
  /**
   * Set by the terrain-solver stall guard to request a fresh route on the next
   * affordable query. The stale path keeps being served (the NPC follows its
   * last route) until the per-frame query budget allows a re-query, instead of
   * being hard-dropped — which would leave the NPC direct-pushing into the
   * obstacle during the throttle gap and re-feed the stall loop.
   */
  needsRequery?: boolean;
}

/**
 * Minimal water-sampler shape consumed by NPC wade behavior. Provided by
 * `WaterSystem.sampleWaterInteraction`; intentionally narrow so tests can
 * stub it without standing up the full water system.
 *
 * `immersion01` ∈ [0, 1] is the water depth normalized against
 * `DEFAULT_WATER_IMMERSION_DEPTH_METERS` (1.6m). 0 means dry, 1 means deep
 * enough to require swimming. NPCs (R1) cannot swim, so deep readings
 * trigger route-around at the navmesh layer.
 */
export interface NpcWaterSampler {
  sampleImmersion01(x: number, z: number, surfaceY: number): number;
}

/**
 * Splash-effect surface consumed for wade foot-puffs. Narrow shape so the
 * effect can be optional + stubbed in tests; production binding is the
 * `WadeSplashEffect` pool wired in `GameplayRuntimeComposer`.
 */
export interface NpcWadeSplashEmitter {
  tryEmitForCombatant(combatantId: string, footPosition: THREE.Vector3, isGroundedAndMoving: boolean): boolean;
  forgetEmitter(combatantId: string): void;
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
  private waterSampler?: NpcWaterSampler;
  private wadeSplashEmitter?: NpcWadeSplashEmitter;
  private readonly _spacingForce = new THREE.Vector3();
  private readonly stuckDetector = new StuckDetector();
  private readonly slopeStuckDetector = new SlopeStuckDetector();
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
      this.slopeStuckDetector.remove(combatant.id);
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
      this.slopeStuckDetector.remove(combatant.id);
      this.navPaths.delete(combatant.id);
      performanceTelemetry.removeNPCMovementTracker(combatant.id);
      return;
    }

    // Crowd-stall movement stagger (opt-in, NpcLodConfig.crowdStallStaggerEnabled,
    // default off). A high-LOD NPC that was contour-stalled inside a friendly
    // crowd last full tick coasts this tick: advance the existing velocity and
    // re-ground, skipping the spacing grid query and the terrain-aware contour
    // solve (the two dominant per-tick costs at point-blank convergence). The
    // next tick runs the full solve, giving a 50% cadence. Recovery detectors
    // work on >=600ms windows, so one coasted frame does not perturb their
    // escalation. The flag is only ever armed when the knob is on.
    if (combatant.movementStaggerSkipNext) {
      combatant.movementStaggerSkipNext = false;
      if (NpcLodConfig.crowdStallStaggerEnabled && combatant.simLane === 'high') {
        combatant.position.addScaledVector(combatant.velocity, deltaTime);
        if (this.wadeSplashEmitter) {
          const moving = combatant.velocity.lengthSq() > 0.01;
          this.wadeSplashEmitter.tryEmitForCombatant(combatant.id, combatant.position, moving);
        }
        if (!options?.disableTerrainSample) {
          this.syncTerrainHeight(combatant);
        }
        return;
      }
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
    const spatialGrid = options?.disableSpacing ? undefined : this.spatialGridManager;
    const spacingApplied = !!spatialGrid;
    if (spatialGrid) {
      clusterManager.calculateSpacingForce(combatant, combatants, spatialGrid, this._spacingForce);
      combatant.velocity.add(this._spacingForce);
      this.clampHorizontalVelocity(combatant, NPC_MAX_SPEED);
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

    // Recast crowd local-avoidance layer (re-enabled 2026-05-18 per
    // navmesh-crowd-reenable). The 2026-03-17 disable was driven by a regression
    // where crowd-as-primary-mover fought the terrain-aware solver's slope speeds.
    // Here we use the crowd only for steered DIRECTION (separation/avoidance) and
    // keep the caller's speed via `applyAgentSteeredDirection`; the terrain-aware
    // solver still runs after this block and remains the authority for surface
    // projection and slope-aware speed scaling. High-LOD only — low/culled stay
    // on terrain-solver-only path-follow to keep the crowd capacity headroom.
    if (this.navmeshAdapter && this.shouldUseCrowdSteering(combatant)) {
      let agentReady = this.navmeshAdapter.hasAgent(combatant.id);
      if (!agentReady) {
        agentReady = this.navmeshAdapter.registerAgent(combatant);
      }
      if (agentReady) {
        this.navmeshAdapter.updateAgentTarget(combatant);
        this.navmeshAdapter.applyAgentSteeredDirection(combatant);
      }
    } else if (this.navmeshAdapter?.hasAgent(combatant.id)) {
      // Ineligible this tick (e.g. dropped to lower LOD, backtrack engaged):
      // release the crowd slot so others can use it.
      this.navmeshAdapter.unregisterAgent(combatant.id);
    }

    const steering = this.applyTerrainAwareVelocity(combatant, now, navmeshWaypoint);
    this.clampHorizontalVelocity(combatant, NPC_MAX_SPEED);

    // Slope-stuck recovery: if the terrain-aware solver leaves the NPC pinned
    // on an unwalkable slope with intended-but-stalled movement for longer
    // than SLOPE_STALL_TIME_MS, override velocity with a downhill slide until
    // the NPC reaches a walkable slope. On recovery we drop the cached
    // navmesh path so the next tick re-acquires the goal anchor from scratch.
    // See `SlopeStuckDetector` for the threshold rationale.
    const slopeAction = this.evaluateSlopeStuckRecovery(combatant, now);
    if (slopeAction === 'recovered') {
      this.navPaths.delete(combatant.id);
      combatant.movementBacktrackPoint = undefined;
      combatant.movementContourSign = undefined;
    }

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    combatant.position.addScaledVector(combatant.velocity, deltaTime);

    // Wade splash hook. Foot is approximately the combatant position (NPC
    // origin sits near ground in this engine). Stride accumulation lives
    // inside the emitter so the per-NPC budget is one method call.
    if (this.wadeSplashEmitter) {
      const moving = combatant.velocity.lengthSq() > 0.01;
      this.wadeSplashEmitter.tryEmitForCombatant(combatant.id, combatant.position, moving);
    }

    // Keep on terrain with sampled/cached updates to avoid per-frame height churn at scale.
    if (!options?.disableTerrainSample) {
      if (!this.syncTerrainHeight(combatant)) {
        throw new Error('CombatantMovement requires terrainSystem before terrain height queries');
      }
    }

    const progress = this.updateProgressTracking(combatant, steering.anchorDistanceBeforeSq, now);

    // Terrain-solver stall-loop guard: if contour is active and the NPC isn't
    // making forward progress, the navmesh waypoint likely points across
    // terrain the solver can't traverse (slope past walkable cutoff that the
    // navmesh didn't classify). Drop the cached path so the next tick gets a
    // fresh route that accounts for the obstacle. High-LOD only — low/culled
    // run the terrain solver less aggressively and don't oscillate the same
    // way. See `NPC_CONTOUR_STALL_REROUTE_MS` for the timing rationale.
    this.evaluateTerrainStallReroute(
      combatant,
      steering.contourActivated,
      progress.lowProgress,
      deltaTime,
    );

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
      combatant.target = null;
      combatant.state = CombatantState.PATROLLING;
      combatant.movementIntent = 'hold';
      combatant.velocity.set(0, 0, 0);

      // Convergence dispersal: an NPC that escalated to 'hold' while packed in a
      // friendly crowd re-targets the same contested point and rejoins the
      // crush, sustaining the terrain-stall storm. Instead, send it away from
      // the crowd centroid and delay its objective re-evaluation so it walks
      // clear before re-engaging. Falls back to the immediate-unfreeze (clear
      // destination + force re-eval) when the NPC isn't actually crowded.
      const dispersed =
        NpcLodConfig.stallDispersalEnabled &&
        spacingApplied &&
        this.tryAssignCrowdDispersal(combatant, now);
      if (!dispersed) {
        combatant.destinationPoint = undefined;
        combatant.lastZoneEvalTime = 0;
      }
      this.warnStuckRecovery(combatant.id, 'hold', now);
    }

    const telemetryIntent: CombatantMovementIntent = backtrackActivated
      ? 'backtrack'
      : (combatant.movementIntent ?? 'hold');
    performanceTelemetry.recordNPCMovementSample(
      combatant.id,
      combatant.simLane,
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

    // Arm a coast tick next frame when this NPC is contour-stalled inside a
    // crowd (opt-in; the flag stays unset in the default config because the
    // knob is off, so production behavior is unchanged). Backtracking NPCs are
    // excluded — they are already on the StuckDetector recovery path.
    combatant.movementStaggerSkipNext =
      NpcLodConfig.crowdStallStaggerEnabled &&
      combatant.simLane === 'high' &&
      !backtrackActivated &&
      steering.contourActivated &&
      progress.lowProgress &&
      spacingApplied &&
      this._spacingForce.lengthSq() >= NPC_STALL_DISPERSAL_MIN_FORCE_SQ;
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

  /**
   * Drive the slope-stuck recovery state machine for one tick.
   *
   * Sampled against the support normal at the combatant's current position
   * (same primitive the terrain-aware solver uses, so the slope classifier
   * agrees with `isWalkableSlope` from SlopePhysics). When recovery is
   * active, the frame's velocity is overwritten with a downhill slide along
   * the negative XZ projection of the support normal at
   * {@link SLOPE_SLIDE_STRENGTH} m/s. Recovery exits the moment the
   * combatant's support normal classifies as walkable.
   *
   * The 'slide' action also sets `movementIntent = 'backtrack'` so the
   * recovery is observable through existing telemetry channels without
   * widening the intent enum.
   */
  private evaluateSlopeStuckRecovery(combatant: Combatant, now: number): 'none' | 'slide' | 'recovered' {
    const supportNormal = this.sampleSupportNormal(
      combatant.position.x,
      combatant.position.z,
      combatant.velocity.x,
      combatant.velocity.z,
      _supportNormal,
    );
    const slopeValue = computeSlopeValueFromNormal(supportNormal);
    const onUnwalkableSlope = !isWalkableSlope(slopeValue);

    // "Wants movement" mirrors the StuckDetector definition — the AI has
    // pushed a non-trivial velocity even if the solver has since clamped it.
    // We approximate via the resolved movement intent: a 'hold' NPC has no
    // forward intent at all, so its stall is not a slope-stuck failure.
    const wantsMovement = (combatant.movementIntent ?? 'hold') !== 'hold';
    const currentSpeed = Math.hypot(combatant.velocity.x, combatant.velocity.z);

    const action = this.slopeStuckDetector.checkAndUpdate(
      combatant,
      now,
      onUnwalkableSlope,
      wantsMovement,
      currentSpeed,
    );

    if (action === 'slide') {
      const slide = computeSlopeSlideVelocity(supportNormal.x, supportNormal.z, SLOPE_SLIDE_STRENGTH);
      combatant.velocity.x = slide.x;
      combatant.velocity.z = slide.z;
      combatant.movementIntent = 'backtrack';
    }
    return action;
  }

  /**
   * Detect terrain-solver stall loops (contour fires every tick but the NPC
   * makes no forward progress) and invalidate the cached navmesh path when
   * the stall has been sustained past {@link NPC_CONTOUR_STALL_REROUTE_MS}.
   *
   * The stall pattern: an NPC carrying a navmesh waypoint that points across
   * a slope the navmesh did not classify hits `isForwardBlocked` each tick;
   * `chooseContourDirection` deflects ~90° toward a contour-line and blends
   * partially back toward the anchor; the next tick the slope is still
   * ahead, so contour fires again. `movementContourSign` adds only a +0.25
   * hysteresis bonus, so the side can flip — net XZ progress oscillates
   * around the waypoint without crossing it.
   *
   * Dropping the cached path here lets the next tick re-query a route that
   * already accounts for the obstacle, breaking the loop. High-LOD only:
   * low/culled lanes don't oscillate the same way (fewer evaluations per
   * second, navmesh-amortized) and the cost of re-querying isn't worth it.
   *
   * Returns true when a re-route was triggered (for telemetry / tests).
   */
  private evaluateTerrainStallReroute(
    combatant: Combatant,
    contourActivated: boolean,
    lowProgress: boolean,
    deltaTime: number,
  ): boolean {
    // High-LOD only. Backtrack engaged means the StuckDetector has already
    // taken over recovery; don't fight it.
    if (combatant.simLane !== 'high' || combatant.movementBacktrackPoint) {
      combatant.movementContourStallMs = 0;
      return false;
    }

    if (!contourActivated || !lowProgress) {
      combatant.movementContourStallMs = 0;
      return false;
    }

    const deltaMs = Math.max(0, deltaTime * 1000);
    const accumulated = (combatant.movementContourStallMs ?? 0) + deltaMs;
    combatant.movementContourStallMs = accumulated;

    if (accumulated < NPC_CONTOUR_STALL_REROUTE_MS) {
      return false;
    }

    // Stall window crossed: flag the cached path for re-query and reset the
    // contour sign so the fresh route is not biased by the previous deflection
    // side. The path is flagged rather than deleted so the NPC keeps following
    // its current route until a fresh one is affordable (see getOrQueryPath),
    // instead of direct-pushing into the obstacle during the query-budget gap.
    // Reset the accumulator so we don't fire again on the very next tick if the
    // new path also crosses the obstacle; the StuckDetector remains the backstop
    // if re-routing repeatedly fails.
    const cached = this.navPaths.get(combatant.id);
    if (cached) {
      cached.needsRequery = true;
    }
    combatant.movementContourSign = undefined;
    combatant.movementContourStallMs = 0;
    return !!cached;
  }

  /**
   * Crowd-steering eligibility: high simLane, has a real destination, not on a
   * backtrack, has measurable speed, and not in a dead/in-vehicle terminal
   * state (those are already early-returned). Restricting to `high` keeps the
   * crowd inside its `MAX_CROWD_AGENTS=64` capacity for active close-combat.
   */
  private shouldUseCrowdSteering(combatant: Combatant): boolean {
    if (combatant.simLane !== 'high') return false;
    if (!combatant.destinationPoint) return false;
    if (combatant.movementBacktrackPoint) return false;
    const vx = combatant.velocity.x;
    const vz = combatant.velocity.z;
    if (vx * vx + vz * vz < 0.0001) return false;
    return true;
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
        now,
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
      const currentBlocked = this.isWaypointDirectionBlocked(combatant.position, currentWaypoint)
        || this.isDeepWaterAt(currentWaypoint.x, currentWaypoint.z);
      if (currentBlocked) {
        let advanced = false;
        for (let i = path.currentIndex + 1; i < path.waypoints.length; i++) {
          const wp = path.waypoints[i];
          if (this.isDeepWaterAt(wp.x, wp.z)) continue;
          if (this.isWaypointDirectionBlocked(combatant.position, wp)) continue;
          path.currentIndex = i;
          path.waypointStartTime = now;
          combatant.movementContourSign = undefined;
          advanced = true;
          break;
        }
        // No dry alternative in the cached path: invalidate so the next
        // `getOrQueryPath` call can produce a route around the river.
        if (!advanced && this.isDeepWaterAt(currentWaypoint.x, currentWaypoint.z)) {
          this.navPaths.delete(combatant.id);
          return null;
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
      const fresh = !cached.needsRequery
        && destChangedSq < PATH_DESTINATION_CHANGE_SQ
        && age < PATH_MAX_AGE_MS;
      if (fresh) {
        return cached;
      }
      // Stale, destination-changed, or flagged for re-route. Only drop the
      // cached path when we can afford a fresh query this frame; otherwise keep
      // serving the stale route so the NPC follows its last waypoints instead
      // of falling back to a blocked direct-push while the per-frame query
      // budget is exhausted. This removes the convergence-time
      // drop -> throttled-null -> ram-the-slope thrash.
      //
      // Note: PATH_MAX_AGE_MS is intentionally NOT re-checked on this branch —
      // a >10s-old route is still served when the budget is saturated. That is
      // safe: a non-advancing NPC hits the 3s WAYPOINT_STALL_TIMEOUT_MS hard
      // delete in resolveNavmeshWaypoint first, and an advancing one is reaching
      // its waypoints, so the age ceiling never bites in practice.
      if (this.pathQueriesThisFrame >= PATH_QUERIES_PER_FRAME) {
        return cached;
      }
      this.navPaths.delete(combatant.id);
    } else if (this.pathQueriesThisFrame >= PATH_QUERIES_PER_FRAME) {
      // No cached path and no query budget left this frame.
      return null;
    }

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
    now: number,
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

    // Contour candidates are rebuilt from the current (freshly sampled) support
    // normal every tick — that part is cheap. The expensive part is scoring
    // both sides, which samples the support normal twice more. While the NPC
    // stays contour-blocked the winning side is stable, so reuse the cached
    // sign for NPC_CONTOUR_RESCORE_INTERVAL_MS instead of re-scoring each tick.
    _contourLeft.set(-uphillZ, 0, uphillX).normalize();
    _contourRight.set(uphillZ, 0, -uphillX).normalize();

    const cachedSign = combatant.movementContourSign;
    const cacheValid = (cachedSign === -1 || cachedSign === 1)
      && now < (combatant.movementContourRescoreAtMs ?? 0);

    let chosenSign: -1 | 1;
    let chosenDirection: THREE.Vector3;
    if (cacheValid) {
      chosenSign = cachedSign as -1 | 1;
      chosenDirection = chosenSign === -1 ? _contourLeft : _contourRight;
    } else {
      const leftScore = this.scoreContourDirection(combatant, _contourLeft, anchorDirection, -1);
      const rightScore = this.scoreContourDirection(combatant, _contourRight, anchorDirection, 1);
      const useLeft = leftScore >= rightScore;
      chosenSign = useLeft ? -1 : 1;
      chosenDirection = useLeft ? _contourLeft : _contourRight;
      combatant.movementContourRescoreAtMs = now + NPC_CONTOUR_RESCORE_INTERVAL_MS;
    }

    combatant.movementContourSign = chosenSign;
    _blendedDirection.copy(chosenDirection)
      .multiplyScalar(1 - NPC_CONTOUR_FORWARD_BLEND)
      .addScaledVector(anchorDirection, NPC_CONTOUR_FORWARD_BLEND);
    if (_blendedDirection.lengthSq() > 0.0001) {
      _blendedDirection.normalize();
      // Keep the blended forward-block decision identical whether or not the
      // score was cached, so the cache only removes the two left/right scoring
      // samples and never changes the chosen heading for a given side.
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
    const uphillFactor = THREE.MathUtils.clamp(1 - uphillGrade * uphillDrag, minSpeedFactor, 1);
    // Wade slowdown: linear with immersion in shallow water. Deep water is
    // route-around territory (no swim in R1) — clamp the wade factor at the
    // shallow boundary so a one-tick deep crossing does not stall NPCs to 0.
    const immersion = Math.min(this.getWaterImmersion(combatant.position.x, combatant.position.z), 1);
    const wadeFactor = 1 - immersion * WADE_SPEED_IMMERSION_WEIGHT;
    return uphillFactor * wadeFactor;
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

  /**
   * Send a held-and-crowded combatant to a dispersed point away from the local
   * crowd centroid and delay its objective re-evaluation. Reuses the friendly
   * spacing force computed earlier this tick as the away-from-crowd direction
   * (caller guarantees spacing ran). Returns false when the NPC is not actually
   * crowded (spacing force ~0), so the caller keeps the default immediate
   * unfreeze. See NpcLodConfig.stallDispersalEnabled.
   */
  private tryAssignCrowdDispersal(combatant: Combatant, now: number): boolean {
    const awayX = this._spacingForce.x;
    const awayZ = this._spacingForce.z;
    const awayLenSq = awayX * awayX + awayZ * awayZ;
    if (awayLenSq < NPC_STALL_DISPERSAL_MIN_FORCE_SQ) {
      return false;
    }
    const inv = NPC_STALL_DISPERSAL_DISTANCE / Math.sqrt(awayLenSq);
    const targetX = combatant.position.x + awayX * inv;
    const targetZ = combatant.position.z + awayZ * inv;
    if (combatant.destinationPoint) {
      combatant.destinationPoint.set(targetX, combatant.position.y, targetZ);
    } else {
      combatant.destinationPoint = new THREE.Vector3(targetX, combatant.position.y, targetZ);
    }
    // Delay objective re-evaluation (now, not 0) so patrol's driveTowardDestination
    // carries the NPC toward the dispersal point for a beat before zone targeting
    // can overwrite it with the contested objective again.
    combatant.lastZoneEvalTime = now;
    return true;
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

  /**
   * Sample `immersion01` ∈ [0, 1] at the given XZ. Returns 0 when no water
   * sampler is bound or the position is dry. Surface Y is taken from the
   * terrain height so the sampler can resolve depth against the ground.
   */
  private getWaterImmersion(x: number, z: number): number {
    if (!this.waterSampler) return 0;
    const surfaceY = this.getTerrainHeight(x, z);
    const immersion = this.waterSampler.sampleImmersion01(x, z, surfaceY);
    return Number.isFinite(immersion) ? Math.max(0, immersion) : 0;
  }

  /**
   * True when the given XZ lies in water deep enough to require swimming.
   * R1 NPCs cannot swim, so this guard is used by the navmesh waypoint
   * follower to skip deep-water waypoints and re-route.
   */
  private isDeepWaterAt(x: number, z: number): boolean {
    return this.getWaterImmersion(x, z) >= DEEP_WATER_IMMERSION_THRESHOLD;
  }

  private getTerrainHeightForCombatant(combatant: Combatant): number {
    const now = performance.now();
    const intervalMs =
      combatant.simLane === 'high' ? TERRAIN_SAMPLE_INTERVAL_HIGH :
      combatant.simLane === 'medium' ? TERRAIN_SAMPLE_INTERVAL_MEDIUM :
      combatant.simLane === 'low' ? TERRAIN_SAMPLE_INTERVAL_LOW : TERRAIN_SAMPLE_INTERVAL_CULLED;

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

  /**
   * Bind the wade water sampler. Optional: when unset, NPC movement is
   * unaffected by water (legacy behavior). When set, ground speed scales
   * down in shallow water and the navmesh path-follower routes around
   * deep water (NPCs do not swim in R1).
   */
  setWaterSampler(sampler: NpcWaterSampler | undefined): void {
    this.waterSampler = sampler;
  }

  /** Bind the wade-splash particle emitter. Unset = no splashes (legacy). */
  setWadeSplashEmitter(emitter: NpcWadeSplashEmitter | undefined): void {
    this.wadeSplashEmitter = emitter;
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
    this.slopeStuckDetector.remove(id);
    this.wadeSplashEmitter?.forgetEmitter(id);
    performanceTelemetry.removeNPCMovementTracker(id);
  }

  /** Reset stuck detection state (call on round/mode transitions). */
  resetStuckDetector(): void {
    this.stuckDetector.clear();
    this.slopeStuckDetector.clear();
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
