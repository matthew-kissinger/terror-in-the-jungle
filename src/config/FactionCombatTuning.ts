import { Faction } from '../systems/combat/types';

/**
 * Per-faction AI doctrine parameters.
 *
 * This is the data table the utility-AI scorer consumes. Every unit runs the
 * same decision graph; the table differs. Doctrine differentiation = data,
 * not new classes per faction.
 *
 * Shape:
 *   - Legacy scalar (`panicThreshold`) preserved for non-utility callers.
 *   - `useUtilityAI` gates the pre-pass in AIStateEngage.
 *   - `moraleDecayPerSec` / `moraleRecoveryPerSec` model continuous confidence
 *     shift instead of a hard flip at `panicThreshold`. Legacy call sites may
 *     still read `panicThreshold`; utility-AI paths should prefer the curves.
 *   - `ammoAnxietyCurve` maps ammo reserve ratio → retreat-score input.
 *   - `actionWeights` are multipliers applied over raw action scores in the
 *     scorer. All default to 1.0 — a weight of 0 disables the action for the
 *     faction; >1 amplifies, <1 dampens.
 *   - `frontlineElasticityM` (meters) — how much ground the squad yields
 *     under pressure (consumed by repositioning actions).
 */
export interface ResponseCurve {
  readonly kind: 'logistic' | 'linear' | 'quadratic';
  /** Inflection input in [0,1] where the curve crosses ~0.5. */
  readonly midpoint: number;
  /** Rate of change at midpoint. Higher = sharper transition. */
  readonly steepness: number;
}

export interface FactionActionWeights {
  readonly engage: number;
  readonly fireAndFade: number;
  readonly suppress: number;
  readonly reposition: number;
  readonly regroup: number;
  readonly hold: number;
}

interface FactionCombatTuning {
  /**
   * Legacy cumulative panic level at which AIStateEngage triggers full-auto +
   * shorter burst pause. Lower = panics sooner (guerrilla). Higher =
   * committed (conventional). Still consulted by the legacy full-auto path.
   */
  panicThreshold: number;
  /**
   * Opt-in to the utility-AI scoring layer. When true, AIStateEngage consults
   * UtilityScorer before its default engage/seek-cover ladder and may route
   * high-level intents (fire-and-fade, reposition, suppress, hold) back into
   * the state machine.
   */
  useUtilityAI: boolean;
  /** Morale decay rate per second while under sustained fire (>0). */
  moraleDecayPerSec: number;
  /** Morale recovery rate per second when not under fire (>0). */
  moraleRecoveryPerSec: number;
  /** Ammo reserve ratio → retreat-score curve input. */
  ammoAnxietyCurve: ResponseCurve;
  /** Per-action score multipliers applied in the scorer. */
  actionWeights: FactionActionWeights;
  /** Meters of ground the squad yields under pressure. */
  frontlineElasticityM: number;
}

/**
 * Evaluate a response curve. Input is clamped to [0,1] before evaluation and
 * output is clamped to [0,1] after — never returns NaN or ±Infinity even if
 * the curve parameters produce a wild intermediate (guard against the hard
 * stop in the task brief).
 */
export function evaluateCurve(curve: ResponseCurve, input: number): number {
  const x = Math.max(0, Math.min(1, input));
  let y: number;
  switch (curve.kind) {
    case 'linear': {
      // Piecewise-linear through (0, 0), (midpoint, 0.5), (1, 1). Steepness
      // tilts the slope near the midpoint: steepness=1 is the identity line.
      const slope = Math.max(0.01, curve.steepness);
      y = 0.5 + slope * (x - curve.midpoint);
      break;
    }
    case 'quadratic': {
      // (x-midpoint) squared, signed around midpoint, scaled by steepness.
      // Produces a sharper rise near the midpoint than linear.
      const d = x - curve.midpoint;
      const sign = d >= 0 ? 1 : -1;
      y = 0.5 + sign * curve.steepness * d * d;
      break;
    }
    case 'logistic':
    default: {
      // Standard logistic. `steepness` controls the slope at the midpoint.
      // Clamp the exponent magnitude so extreme steepness * large offsets
      // cannot overflow to Infinity/NaN.
      const raw = -curve.steepness * (x - curve.midpoint);
      const expArg = Math.max(-50, Math.min(50, raw));
      y = 1 / (1 + Math.exp(expArg));
      break;
    }
  }
  if (!Number.isFinite(y)) return 0;
  return Math.max(0, Math.min(1, y));
}

const DEFAULT_WEIGHTS: FactionActionWeights = {
  engage: 1.0,
  fireAndFade: 1.0,
  suppress: 1.0,
  reposition: 1.0,
  regroup: 1.0,
  hold: 1.0,
};

/**
 * Starter tunings. Values derived from the legacy `panicThreshold` table —
 * VC (0.35) → fast decay, high fade/reposition weight. NVA (0.70) → slow
 * decay, high hold/suppress weight. US (0.55) → medium decay, high suppress
 * (fire-and-maneuver). ARVN (0.45) → hybrid, higher regroup weight (variable
 * cohesion). These are first-pass playtest-tuneable numbers, not empirically
 * calibrated; they exist to make the factions behave observably differently.
 */
export const FACTION_COMBAT_TUNING: Record<Faction, FactionCombatTuning> = {
  [Faction.VC]: {
    panicThreshold: 0.35,
    useUtilityAI: true,
    moraleDecayPerSec: 0.35,
    moraleRecoveryPerSec: 0.18,
    ammoAnxietyCurve: { kind: 'logistic', midpoint: 0.45, steepness: 9 },
    actionWeights: {
      ...DEFAULT_WEIGHTS,
      fireAndFade: 1.6,
      reposition: 1.4,
      suppress: 0.5,
      hold: 0.3,
      regroup: 0.9,
    },
    frontlineElasticityM: 22,
  },
  [Faction.NVA]: {
    panicThreshold: 0.70,
    useUtilityAI: true,
    moraleDecayPerSec: 0.12,
    moraleRecoveryPerSec: 0.25,
    ammoAnxietyCurve: { kind: 'logistic', midpoint: 0.25, steepness: 7 },
    actionWeights: {
      ...DEFAULT_WEIGHTS,
      fireAndFade: 0.4,
      reposition: 0.6,
      suppress: 1.3,
      hold: 1.7,
      regroup: 0.7,
    },
    frontlineElasticityM: 6,
  },
  [Faction.US]: {
    panicThreshold: 0.55,
    useUtilityAI: true,
    moraleDecayPerSec: 0.20,
    moraleRecoveryPerSec: 0.22,
    ammoAnxietyCurve: { kind: 'logistic', midpoint: 0.35, steepness: 8 },
    actionWeights: {
      ...DEFAULT_WEIGHTS,
      fireAndFade: 0.7,
      reposition: 1.1,
      suppress: 1.6,
      hold: 1.0,
      regroup: 1.0,
    },
    frontlineElasticityM: 12,
  },
  [Faction.ARVN]: {
    panicThreshold: 0.45,
    useUtilityAI: true,
    moraleDecayPerSec: 0.28,
    moraleRecoveryPerSec: 0.16,
    ammoAnxietyCurve: { kind: 'logistic', midpoint: 0.40, steepness: 8 },
    actionWeights: {
      ...DEFAULT_WEIGHTS,
      fireAndFade: 1.1,
      reposition: 1.2,
      suppress: 0.9,
      hold: 0.8,
      regroup: 1.5,
    },
    frontlineElasticityM: 16,
  },
};

export function getFactionCombatTuning(faction: Faction): FactionCombatTuning {
  return FACTION_COMBAT_TUNING[faction];
}
