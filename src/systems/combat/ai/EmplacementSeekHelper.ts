import * as THREE from 'three'
import { Combatant, Faction, isAlly } from '../types'
import {
  UtilityAction,
  UtilityContext,
  UtilityIntent,
} from './utility/UtilityScorer'

/**
 * NPC squad-AI emplacement support (R2 of cycle-vekhikl-2-stationary-weapons,
 * `emplacement-npc-gunner` task).
 *
 * The only place in `src/systems/combat/ai/` that knows about stationary
 * heavy-weapon emplacements. AIStateEngage consumes `mountEmplacementAction`;
 * routing of the resulting `mountEmplacement` intent (transition into
 * BOARDING, dismount predicates) lives in AIStateEngage so the rest of the
 * engage ladder stays untouched.
 *
 * Live M2HB integration (post-master-0732beaa):
 * The real M2HB weapon (`src/systems/combat/weapons/M2HBEmplacement.ts`)
 * landed on master alongside this helper. We keep the structural
 * duck-types (`INpcEmplacementWeapon`, `INpcEmplacementVehicle`,
 * `INpcEmplacementQuery`) here so the combat-AI tree stays decoupled
 * from the vehicle/weapon trees — production wires the live system via
 * `NpcM2HBAdapter` (in `src/systems/combat/weapons/NpcM2HBAdapter.ts`),
 * which yields the resolver this helper consumes. Tests pass one-line
 * fakes (see `EmplacementSeekHelper.test.ts`).
 */

// ── Duck-typed contracts ──────────────────────────────────────────────────

/**
 * Minimal structural surface the NPC gunner needs from a crew-served
 * weapon. Satisfied by the live M2HB adapter (`NpcM2HBAdapter`) and by
 * test fakes; both expose `tryFire`, `isEmpty`, and `getFieldOfFireCone`.
 */
export interface INpcEmplacementWeapon {
  /**
   * Fire one round (or tick the burst pipeline). Returns true when a round
   * left the barrel, false otherwise. NPC AI doesn't differentiate cooldown
   * vs empty — `isEmpty()` drives dismount separately.
   */
  tryFire(): boolean
  /** True when the belt / box is exhausted and the gunner should dismount. */
  isEmpty(): boolean
  /**
   * Barrel's current field of fire in world space. `origin` is the muzzle,
   * `direction` is a unit vector down the barrel, `halfAngleRad` is the
   * cone half-angle (e.g. 30° -> ~0.523). Pre-computed: the real M2HB ties
   * this to the rotating barrel rig.
   */
  getFieldOfFireCone(): {
    origin: THREE.Vector3
    direction: THREE.Vector3
    halfAngleRad: number
  }
}

/**
 * Duck-type subset of `IVehicle` the NPC seek/mount path consumes. Avoids a
 * hard import on `src/systems/vehicle/IVehicle.ts` from the combat tree.
 */
export interface INpcEmplacementVehicle {
  readonly vehicleId: string
  readonly category: string
  readonly faction: Faction
  getPosition(): THREE.Vector3
  hasFreeSeats(role?: 'pilot' | 'gunner' | 'passenger'): boolean
}

/**
 * Query surface for scanning candidate emplacements. The real
 * `VehicleManager` exposes `getVehiclesInRadius(center, radius)`; tests can
 * pass a one-line fake.
 */
export interface INpcEmplacementQuery {
  getVehiclesInRadius(
    center: THREE.Vector3,
    radius: number
  ): readonly INpcEmplacementVehicle[]
}

/**
 * Minimal seat-occupant boarding surface AIStateEngage needs from
 * `NPCVehicleController`. Defined locally so the combat-AI tree avoids a
 * direct import of the vehicle controller (which would couple combat to
 * the vehicle subsystem in a way that the test harness has to mock).
 *
 * The real controller's `orderBoard()` returns true iff the order was
 * accepted (vehicle exists, requested seat free, combatant alive and not
 * already mounted) and from that point drives the BOARDING -> IN_VEHICLE
 * transition itself via its per-frame `updateBoarding()` loop.
 */
export interface INpcVehicleBoarding {
  orderBoard(combatantId: string, vehicleId: string, seatRole: 'gunner'): boolean
}

// ── Tuning constants ──────────────────────────────────────────────────────

/** Max range an NPC will divert to mount an emplacement (cycle brief). */
export const MOUNT_SEEK_RADIUS_M = 8

/**
 * Per-combatant `buildEmplacementContext()` cache lifetime.
 *
 * Rationale: emplacements are static (the IVehicle position never moves)
 * and the candidate set rarely changes between ticks. With 4 factions
 * opted into utility-AI (`FactionCombatTuning.ts`) and every engaging NPC
 * at distance >= 15 m running `buildUtilityContext()` per tick, the live
 * `VehicleManager.getVehiclesInRadius()` scan is O(N_vehicles) on the
 * combat hot path and competes with the same budget DEFEKT-3 was opened
 * to address. Caching at 500 ms is short enough that staleness during the
 * window is harmless — the apply() step revalidates via the in-cone gate,
 * and a freshly-spawned (or freshly-occupied) emplacement will be picked
 * up on the next refresh. Wall-clock (`performance.now()`) is used so the
 * cache is not affected by `TimeScale` pauses or scaled deltaTime.
 */
export const EMPLACEMENT_CANDIDATE_CACHE_TTL_MS = 500

/**
 * Default field-of-fire cone half-angle (radians) used by the synthetic-cone
 * fallback before the M2HB weapon is wired. 30° matches the natural traverse
 * a static gunner engages without ranging the spade grips.
 */
export const DEFAULT_FOV_HALF_ANGLE_RAD = Math.PI / 6 // 30°

/** Stale-target dismount window (ms). Cycle brief: ">5 s out of cone". */
export const STALE_TARGET_DISMOUNT_MS = 5000

/**
 * Base reward applied before the faction `actionWeights.mountEmplacement`
 * multiplier. Tuned higher than `fireAndFade`/`reposition` base rewards
 * (~0.6-0.9) so an in-range, in-cone friendly emplacement out-scores fading
 * for US/NVA/ARVN. Hard-gated to 0 when no candidate is supplied.
 */
export const MOUNT_EMPLACEMENT_BASE_REWARD = 1.2

// ── Public helpers ─────────────────────────────────────────────────────────

const _coneScratch = new THREE.Vector3()

/**
 * Cone test: is `targetPos` inside (origin, unit direction, halfAngle)?
 * Allocation-free; uses module scratch. Skips the offset normalize/sqrt
 * by comparing `dot / |offset|` against `cos(halfAngle)`.
 */
export function enemyInFieldOfFire(
  cone: { origin: THREE.Vector3; direction: THREE.Vector3; halfAngleRad: number },
  targetPos: THREE.Vector3
): boolean {
  _coneScratch.subVectors(targetPos, cone.origin)
  const distSq = _coneScratch.lengthSq()
  if (distSq <= 1e-6) return true
  const dot = _coneScratch.dot(cone.direction)
  if (dot <= 0) return false
  return dot / Math.sqrt(distSq) >= Math.cos(cone.halfAngleRad)
}

/**
 * Find the nearest unoccupied friendly-faction emplacement within `radius`
 * of `origin`. Alliance-based (`isAlly`) so US can mount ARVN tripods and
 * vice versa. Deterministic ordering (squared distance, no Math.random).
 */
export function findMountableEmplacement(
  combatant: Combatant,
  origin: THREE.Vector3,
  query: INpcEmplacementQuery,
  radius: number = MOUNT_SEEK_RADIUS_M
): INpcEmplacementVehicle | null {
  const candidates = query.getVehiclesInRadius(origin, radius)
  let best: INpcEmplacementVehicle | null = null
  let bestDistSq = Number.POSITIVE_INFINITY
  for (const v of candidates) {
    if (v.category !== 'emplacement') continue
    if (!isAlly(v.faction, combatant.faction)) continue
    if (!v.hasFreeSeats('gunner')) continue
    const distSq = v.getPosition().distanceToSquared(origin)
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = v
    }
  }
  return best
}

// ── Utility action ────────────────────────────────────────────────────────

// Pooled scratch intent so apply() doesn't allocate per tick. Mirrors the
// pattern in `fireAndFadeAction` / `repositionAction`. `vehicleId` is a
// string primitive so caller reads are aliasing-safe.
const _mountIntentScratch: { kind: 'mountEmplacement'; vehicleId: string } = {
  kind: 'mountEmplacement',
  vehicleId: '',
}

/**
 * Utility action: prefer mounting a nearby friendly emplacement when the
 * threat is inside its field of fire. Hard gates to 0 when:
 *  - no `nearbyEmplacement` context was supplied (no in-range candidate), or
 *  - the threat is not in the field-of-fire cone (a stationary gunner that
 *    can't see the enemy is worse than a moving infantryman).
 *
 * When both gates pass the score is `BASE_REWARD * linear-taper(distance)`
 * so closer emplacements outscore farther ones inside the radius. The
 * caller (AIStateEngage) clones the vehicleId out of the pooled intent and
 * routes the unit into BOARDING via the existing seat-occupant pipeline.
 */
export const mountEmplacementAction: UtilityAction = {
  id: 'mount_emplacement',
  weightKey: 'mountEmplacement',
  score(ctx: UtilityContext): number {
    const near = ctx.nearbyEmplacement
    if (!near) return 0
    if (!near.threatInCone) return 0
    const taper = Math.max(
      0,
      1 - near.distance / Math.max(1e-3, MOUNT_SEEK_RADIUS_M)
    )
    return MOUNT_EMPLACEMENT_BASE_REWARD * taper
  },
  apply(ctx: UtilityContext): UtilityIntent | null {
    const near = ctx.nearbyEmplacement
    if (!near) return null
    _mountIntentScratch.vehicleId = near.vehicleId
    return _mountIntentScratch
  },
}

// ── Dismount predicates ───────────────────────────────────────────────────

/**
 * Per-NPC tracker for emplacement-mount lifecycle. Owned by AIStateEngage
 * (one instance per AIStateEngage). Keys on the Combatant reference so
 * dead/disposed combatants are GC'd cleanly.
 *
 * The tracker only needs to remember when the threat was last in the cone;
 * mount state itself lives on the IVehicle (occupantId) and the combatant
 * (vehicleId), both of which already exist in the engine.
 */
export class EmplacementMountTracker {
  private lastInConeMsByCombatant = new WeakMap<Combatant, number>()

  /** Note the threat sits inside the emplacement cone this tick. */
  markThreatInCone(combatant: Combatant, nowMs: number): void {
    this.lastInConeMsByCombatant.set(combatant, nowMs)
  }

  /** Clear cone history on mount (fresh window) or dismount (no stale leak). */
  reset(combatant: Combatant): void {
    this.lastInConeMsByCombatant.delete(combatant)
  }

  /**
   * True when the gunner should dismount (cycle brief):
   *   1. Weapon is empty (belt depleted), OR
   *   2. Target has been out of the field of fire for > 5 seconds.
   *
   * Condition (2) only fires after `markThreatInCone` has been called at
   * least once during the current mount session — a freshly-mounted gunner
   * isn't dismounted just because no cone sample has been recorded yet.
   *
   * `nowMs` MUST be `performance.now()` (wall clock), NOT a scaled
   * `deltaTime` accumulator. The 5 s stale-target window is doctrine-tied
   * and should not stretch when the player engages bullet-time / pause.
   */
  shouldDismount(
    combatant: Combatant,
    weapon: INpcEmplacementWeapon,
    nowMs: number,
    staleWindowMs: number = STALE_TARGET_DISMOUNT_MS
  ): boolean {
    if (weapon.isEmpty()) return true
    const lastInCone = this.lastInConeMsByCombatant.get(combatant)
    if (lastInCone === undefined) return false
    return nowMs - lastInCone > staleWindowMs
  }
}

// ── Context-builder ───────────────────────────────────────────────────────

/**
 * Convenience builder used by AIStateEngage (and tests) to populate
 * `UtilityContext.nearbyEmplacement`. Returns the scorer fields or null
 * when no in-range candidate exists.
 *
 * `weaponResolver` is now REQUIRED: the synthetic-cone fallback that
 * shipped while the real M2HB weapon was authored in parallel has been
 * removed. The live `M2HBEmplacementSystem` (master 0732beaa) exposes the
 * barrel-pose cone via the per-vehicle weapon binding, and an emplacement
 * the resolver doesn't recognise is a wiring bug, not silently-OK input —
 * the builder throws so the misconfiguration surfaces in dev/test rather
 * than the unit silently failing to score above zero.
 *
 * Production callers obtain the resolver from the M2HB adapter
 * (`NpcM2HBAdapter` in `src/systems/combat/weapons/`); tests pass a
 * one-line fake (see `EmplacementSeekHelper.test.ts`).
 */
export function buildEmplacementContext(
  combatant: Combatant,
  threatPosition: THREE.Vector3,
  query: INpcEmplacementQuery,
  weaponResolver: (vehicleId: string) => INpcEmplacementWeapon | undefined,
  radius: number = MOUNT_SEEK_RADIUS_M
): { vehicleId: string; distance: number; threatInCone: boolean } | null {
  const candidate = findMountableEmplacement(combatant, combatant.position, query, radius)
  if (!candidate) return null
  const weapon = weaponResolver(candidate.vehicleId)
  if (!weapon) {
    // Hard fail: a candidate the query returned but the resolver doesn't
    // know about is a wiring contract violation (vehicle registered in
    // VehicleManager without a corresponding M2HB binding). Throwing here
    // forces the misconfiguration to surface immediately instead of
    // silently degrading to "never mounts".
    throw new Error(
      `EmplacementSeekHelper: no weapon binding for emplacement '${candidate.vehicleId}' (resolver returned undefined). ` +
      `Check that NpcM2HBAdapter / M2HBEmplacementSystem registered the binding when the vehicle was spawned.`
    )
  }
  const cone = weapon.getFieldOfFireCone()
  return {
    vehicleId: candidate.vehicleId,
    distance: Math.sqrt(candidate.getPosition().distanceToSquared(combatant.position)),
    threatInCone: enemyInFieldOfFire(cone, threatPosition),
  }
}

// ── Per-combatant candidate cache ─────────────────────────────────────────

interface CachedEmplacementCandidate {
  result: { vehicleId: string; distance: number; threatInCone: boolean } | null
  expiresAtMs: number
}

/**
 * Per-combatant TTL cache for `buildEmplacementContext()` results. Owned
 * by `AIStateEngage` (one instance per AIStateEngage). Combatants are
 * looked up by id (string) so re-entry on the same tick (different
 * AIStateEngage call sites) reuses the prior result.
 *
 * Cache invalidates after `EMPLACEMENT_CANDIDATE_CACHE_TTL_MS` of wall
 * clock time — see the TTL constant for the rationale (emplacements are
 * static; the apply() step revalidates the in-cone gate; staleness inside
 * the window does not affect correctness, only the latency of "this new
 * emplacement just spawned" recognition).
 *
 * Tests can call `clear()` between scenarios to defeat the cache for
 * deterministic assertions about call counts.
 */
export class EmplacementCandidateCache {
  private readonly byCombatantId = new Map<string, CachedEmplacementCandidate>()

  /**
   * Return the cached result if non-expired, otherwise call `compute()`
   * (the live scan) and memoize. `nowMs` should be `performance.now()` —
   * the cache uses wall clock so `TimeScale` pauses do not artificially
   * extend the cache lifetime.
   */
  getOrCompute(
    combatantId: string,
    nowMs: number,
    compute: () => { vehicleId: string; distance: number; threatInCone: boolean } | null
  ): { vehicleId: string; distance: number; threatInCone: boolean } | null {
    const cached = this.byCombatantId.get(combatantId)
    if (cached && cached.expiresAtMs > nowMs) return cached.result
    const result = compute()
    this.byCombatantId.set(combatantId, {
      result,
      expiresAtMs: nowMs + EMPLACEMENT_CANDIDATE_CACHE_TTL_MS,
    })
    return result
  }

  /** Drop the entry for a combatant — e.g. on death or on mount. */
  invalidate(combatantId: string): void {
    this.byCombatantId.delete(combatantId)
  }

  /** Drop every cached entry. Used by tests for deterministic call counts. */
  clear(): void {
    this.byCombatantId.clear()
  }

  /** Cache occupancy — exposed for the per-tick scan-budget tests. */
  size(): number {
    return this.byCombatantId.size
  }
}
