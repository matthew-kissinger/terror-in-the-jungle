import * as THREE from 'three'
import { Combatant, Squad } from '../../types'
import { FactionActionWeights, getFactionCombatTuning } from '../../../../config/FactionCombatTuning'

/**
 * Minimal utility-AI scoring layer (C1 prototype).
 *
 * Sits ABOVE the existing per-NPC state machines. Each tick, for a combatant
 * whose faction opts in (FACTION_COMBAT_TUNING[faction].useUtilityAI), the
 * caller builds a UtilityContext, hands it to a UtilityScorer, and the
 * winning action's apply() returns a high-level intent. The caller maps that
 * intent onto existing state transitions (SEEKING_COVER, ENGAGING, …) —
 * utility AI does not replace the state machine, it feeds it.
 *
 * Design notes:
 * - Actions are data (id + score + apply). Adding a new doctrine is a row,
 *   not a code branch. This is the property state-machine retrofits can't
 *   cleanly give us (see docs/rearch/E3-combat-ai-evaluation.md).
 * - Hard gates live inside score(). An action scoring 0 simply loses;
 *   apply() is only called on the winning action.
 * - Context predicates (e.g. hasCoverInBearing) are injected by the caller
 *   so this module has no direct dependency on AICoverSystem / faction
 *   squad aggregates / strategic layer. Keeps the prototype testable.
 */

/**
 * Read-only facts the scorer and actions consult. Callers populate the
 * fields they can supply; actions treat undefined fields as "no data" and
 * score accordingly (usually to 0 via their hard gate).
 */
export interface UtilityContext {
  /** The unit making the decision. */
  readonly self: Combatant
  /** Last-seen threat position (typically the current target's position). */
  readonly threatPosition: THREE.Vector3
  /** Squad the unit belongs to, if any. */
  readonly squad?: Squad
  /**
   * Squad-wide suppression proxy in [0,1]. 0 = squad is fine, 1 = squad
   * cooked. Callers can start with a cheap approximation (average panic,
   * or low-health-member count). The exact formula is not load-bearing.
   */
  readonly squadSuppression?: number
  /**
   * Predicate: does terrain afford concealment in the bearing `bearingRad`
   * (radians, standard atan2 convention) within `radius`? The caller owns
   * the terrain query; this module stays stateless.
   */
  readonly hasCoverInBearing?: (bearingRad: number, radius: number) => boolean
  /** True if a callable support asset (gunship, etc.) is available now. */
  readonly supportAvailable?: boolean
  /**
   * Ammo reserve ratio in [0,1] (rounds remaining / max). Feeds the
   * faction-specific ammoAnxietyCurve in retreat-style scoring. When
   * undefined the curve is not consulted (actions should treat it as
   * "no data" and fall back to other considerations).
   */
  readonly ammoReserve?: number
  /**
   * Squad cohesion proxy in [0,1]. 1 = squad is intact around this unit,
   * 0 = unit is isolated. Used by regroup/hold-style actions.
   */
  readonly squadCohesion?: number
  /**
   * Cover-quality proxy in [0,1] for the unit's current position. Used by
   * hold-style actions. 0 = open ground, 1 = hardened.
   */
  readonly coverQualityHere?: number
  /** Proximity proxy in [0,1] to the squad's objective. 1 = on it. */
  readonly objectiveProximity?: number
}

/**
 * Intent returned by a winning action's apply(). Consumers map intents onto
 * existing state transitions. Intents are deliberately narrow — new intent
 * kinds require a caller update, which is what we want (no silent drift).
 */
export type UtilityIntent =
  | {
      /**
       * Break contact toward a concealment-bearing cover point. Caller
       * transitions to SEEKING_COVER and uses coverPosition as the target.
       */
      readonly kind: 'seekCoverInBearing'
      readonly coverPosition: THREE.Vector3
      readonly bearingRad: number
    }
  | {
      /** Coordinate squad base-of-fire. Caller may delegate to squad suppression. */
      readonly kind: 'coordinateSuppression'
    }
  | {
      /** Emit a support request. Caller owns the outbound channel. */
      readonly kind: 'requestSupport'
    }
  | {
      /**
       * Fall back to the supplied position (behind threat bearing). Caller
       * transitions the unit to RETREATING and uses fallbackPosition as the
       * destination. Closes the previously-orphan RETREATING state.
       */
      readonly kind: 'reposition'
      readonly fallbackPosition: THREE.Vector3
      readonly bearingRad: number
    }
  | {
      /**
       * Stay put at current cover, suppress if LOS. Caller enters/stays in
       * the ENGAGING state with inCover=true semantics; no movement target.
       */
      readonly kind: 'holdPosition'
    }

/**
 * A doctrine action the scorer can pick. score() returns a non-negative
 * utility value (0 = this action is unavailable or dominated this tick).
 * apply() is only called on the winner and returns the high-level intent,
 * or null if the action is a no-op (e.g. "stay in ENGAGING, nothing to do").
 */
export interface UtilityAction {
  readonly id: string
  /**
   * Optional faction-action-weight key. When set, the scorer multiplies the
   * action's raw score by `factionTuning.actionWeights[weightKey]` before
   * ranking. Legacy actions without a weightKey run at weight 1.0 for all
   * factions — keeps the scaffolded scoreboard (fire_and_fade canary etc.)
   * behaving the same across the upgrade.
   */
  readonly weightKey?: keyof FactionActionWeights
  score(ctx: UtilityContext): number
  apply(ctx: UtilityContext): UtilityIntent | null
}

/**
 * Result of a pick(). Surfaces both the winner and its score for debug
 * overlays / tests. Returns null action only when no action scores > 0.
 */
interface UtilityPick {
  readonly action: UtilityAction | null
  readonly intent: UtilityIntent | null
  readonly score: number
}

/**
 * Stateless scorer. Hold a single instance per AI system; pass a fresh
 * context each tick. No allocations per tick beyond the ranking array.
 */
export class UtilityScorer {
  private readonly actions: readonly UtilityAction[]

  constructor(actions: readonly UtilityAction[]) {
    this.actions = actions
  }

  /**
   * Pick the highest-scoring action. Returns { action: null, intent: null,
   * score: 0 } when every action scores 0, which the caller should treat
   * as "utility AI has no opinion this tick — fall through to the state
   * machine's default behavior."
   */
  pick(ctx: UtilityContext): UtilityPick {
    const weights = getFactionCombatTuning(ctx.self.faction).actionWeights
    let bestAction: UtilityAction | null = null
    let bestScore = 0
    for (const action of this.actions) {
      const raw = action.score(ctx)
      if (raw <= 0) continue
      const mult = action.weightKey ? weights[action.weightKey] : 1
      // Zero/negative weight fully disables the action for this faction —
      // the doctrine table can "turn off" an action without a code branch.
      if (mult <= 0) continue
      const s = raw * mult
      if (!Number.isFinite(s)) continue
      if (s > bestScore) {
        bestScore = s
        bestAction = action
      }
    }
    if (!bestAction) {
      return { action: null, intent: null, score: 0 }
    }
    return { action: bestAction, intent: bestAction.apply(ctx), score: bestScore }
  }
}

/**
 * Helper: bearing (radians) pointing from self away from threat. Exposed
 * for actions and tests; avoids re-deriving the same math in two places.
 */
export function bearingAwayFromThreat(
  selfPos: THREE.Vector3,
  threatPos: THREE.Vector3
): number {
  const dx = selfPos.x - threatPos.x
  const dz = selfPos.z - threatPos.z
  return Math.atan2(dz, dx)
}
