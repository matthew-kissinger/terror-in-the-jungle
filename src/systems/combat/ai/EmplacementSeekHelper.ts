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
 * Sibling-PR coordination — STUB-THEN-SWAP:
 * The real M2HB weapon (`src/systems/combat/weapons/M2HBEmplacement.ts`) is
 * being built in PARALLEL by the `m2hb-weapon-integration` task. To unblock
 * THIS task without depending on that file landing first we define local
 * structural duck-types (`INpcEmplacementWeapon`, `INpcEmplacementVehicle`,
 * `INpcEmplacementQuery`) and consume the live weapon through an injected
 * resolver. After the sibling task merges the orchestrator will dispatch a
 * swap step to replace the stub imports with the real `M2HBEmplacement`.
 * Search this file for `// STUB: will swap` to find the swap points.
 */

// ── Sibling-PR stub contracts ──────────────────────────────────────────────

/**
 * STUB: will swap for real `M2HBEmplacement` import after
 * `m2hb-weapon-integration` merges.
 *
 * Minimal structural surface the NPC gunner needs from a crew-served weapon.
 * The real M2HB will expose at least these three.
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

// ── Tuning constants ──────────────────────────────────────────────────────

/** Max range an NPC will divert to mount an emplacement (cycle brief). */
export const MOUNT_SEEK_RADIUS_M = 8

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

// Scratch direction reused inside the synthetic-cone fallback so the
// builder stays allocation-free per tick when no live weapon is wired.
const _coneDirScratch = new THREE.Vector3()

/**
 * Convenience builder used by AIStateEngage (and tests) to populate
 * `UtilityContext.nearbyEmplacement`. Returns the scorer fields or null
 * when no in-range candidate exists.
 *
 * `weaponResolver` is optional — when absent (or returning undefined for
 * the chosen candidate) the cone is synthesized aiming from the emplacement
 * at the threat. STUB: this fallback exists only while the M2HB weapon is
 * authored in parallel; the swap will plug the live resolver in and the
 * cone will reflect actual barrel pose.
 */
export function buildEmplacementContext(
  combatant: Combatant,
  threatPosition: THREE.Vector3,
  query: INpcEmplacementQuery,
  weaponResolver?: (vehicleId: string) => INpcEmplacementWeapon | undefined,
  radius: number = MOUNT_SEEK_RADIUS_M
): { vehicleId: string; distance: number; threatInCone: boolean } | null {
  const candidate = findMountableEmplacement(combatant, combatant.position, query, radius)
  if (!candidate) return null
  const weapon = weaponResolver ? weaponResolver(candidate.vehicleId) : undefined
  let cone: { origin: THREE.Vector3; direction: THREE.Vector3; halfAngleRad: number }
  if (weapon) {
    cone = weapon.getFieldOfFireCone()
  } else {
    // STUB: will swap once the real M2HB exposes getFieldOfFireCone()
    // through the live weapon resolver. Direction is normalized from
    // emplacement to target (assumes the gunner can swing onto the threat).
    const origin = candidate.getPosition()
    _coneDirScratch.subVectors(threatPosition, origin)
    if (_coneDirScratch.lengthSq() > 1e-6) _coneDirScratch.normalize()
    else _coneDirScratch.set(0, 0, 1)
    cone = { origin, direction: _coneDirScratch, halfAngleRad: DEFAULT_FOV_HALF_ANGLE_RAD }
  }
  return {
    vehicleId: candidate.vehicleId,
    distance: Math.sqrt(candidate.getPosition().distanceToSquared(combatant.position)),
    threatInCone: enemyInFieldOfFire(cone, threatPosition),
  }
}
