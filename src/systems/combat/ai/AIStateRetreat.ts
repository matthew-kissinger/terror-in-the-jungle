import * as THREE from 'three'
import { Combatant, CombatantState } from '../types'
import { Logger } from '../../../utils/Logger'
import { getFactionCombatTuning } from '../../../config/FactionCombatTuning'
import { bearingAwayFromThreat } from './utility'

const _toDest = new THREE.Vector3()

// ── Retreat transition guards ─────────────────────────────────────────────
//
// REACHED_COVER_DIST_SQ — unit is at (or very close to) its fallback point,
//   transition back to ENGAGING so it can re-engage from the new position.
// BEARING_FLIP_THRESHOLD_RAD — if the threat bearing has drifted >90° from
//   the bearing we committed to when retreat started, the fallback direction
//   is stale; bail and let ENGAGING re-evaluate.
// PANIC_RECOVERY_CLEAR — if morale has recovered below this, the reason for
//   retreating is gone; transition back to ENGAGING.

const REACHED_COVER_DIST_SQ = 2.0 * 2.0
const BEARING_FLIP_THRESHOLD_RAD = Math.PI / 2
const PANIC_RECOVERY_CLEAR = 0.15

/**
 * Handles the RETREATING state. Closes the orphan state gap noted in
 * docs/COMBAT.md. Unit moves toward `destinationPoint` (set by the
 * utility-AI reposition intent); transitions out when it reaches the
 * fallback point, when the threat bearing drifts, or when squad morale
 * recovers.
 *
 * Kept intentionally thin — the AI system reads the resulting destination
 * via existing movement code (AIStateMovement.handleAdvancing-style
 * consumers already handle `destinationPoint` routing on the movement
 * side). This handler only governs state transitions.
 */
export class AIStateRetreat {
  /**
   * Called per-tick while combatant.state === RETREATING.
   * @param combatant the retreating unit
   * @param deltaTime seconds since last tick (for morale recovery)
   * @param threatPosition where the threat currently is (may differ from
   *   where it was when retreat started — bearing-flip guard uses this).
   */
  handleRetreating(
    combatant: Combatant,
    deltaTime: number,
    threatPosition: THREE.Vector3
  ): void {
    // Missing destination = nothing to retreat toward. Fall back to ENGAGING
    // (same graceful-degrade pattern AIStateMovement.handleSeekingCover uses).
    if (!combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING
      return
    }

    // Orient toward destination so movement code pushes the unit there.
    const toDest = _toDest.subVectors(combatant.destinationPoint, combatant.position)
    const distSq = toDest.lengthSq()
    if (distSq > 0) {
      combatant.rotation = Math.atan2(toDest.z, toDest.x)
    }

    // Guard 1: reached fallback — transition out, clear destination, keep
    // target so re-engagement is immediate from the new position.
    if (distSq < REACHED_COVER_DIST_SQ) {
      combatant.state = CombatantState.ENGAGING
      combatant.destinationPoint = undefined
      combatant.isFlankingMove = false
      Logger.info('combat-ai', ` ${combatant.faction} unit reached retreat anchor, re-engaging`)
      return
    }

    // Guard 2: recovered morale — retreating no longer warranted. Faction
    // morale recovery is applied here so ambient decay actually shows up.
    const tuning = getFactionCombatTuning(combatant.faction)
    if (tuning.moraleRecoveryPerSec > 0) {
      combatant.panicLevel = Math.max(
        0,
        combatant.panicLevel - deltaTime * tuning.moraleRecoveryPerSec
      )
    }
    if (combatant.panicLevel <= PANIC_RECOVERY_CLEAR) {
      combatant.state = CombatantState.ENGAGING
      combatant.destinationPoint = undefined
      return
    }

    // Guard 3: bearing flip — if the threat has moved sharply (e.g. a flank
    // came around) the fallback direction is stale. Bail to ENGAGING and let
    // the scorer re-decide next tick.
    const retreatBearing = Math.atan2(
      combatant.destinationPoint.z - combatant.position.z,
      combatant.destinationPoint.x - combatant.position.x
    )
    const awayBearing = bearingAwayFromThreat(combatant.position, threatPosition)
    const dTheta = Math.abs(wrapAngle(retreatBearing - awayBearing))
    if (dTheta > BEARING_FLIP_THRESHOLD_RAD) {
      combatant.state = CombatantState.ENGAGING
      combatant.destinationPoint = undefined
      return
    }
  }
}

/** Wrap an angle to [-π, π]. */
function wrapAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}
