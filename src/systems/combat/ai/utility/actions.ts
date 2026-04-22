import * as THREE from 'three'
import { evaluateCurve, getFactionCombatTuning } from '../../../../config/FactionCombatTuning'
import {
  UtilityAction,
  UtilityContext,
  UtilityIntent,
  bearingAwayFromThreat,
} from './UtilityScorer'

/**
 * Three doctrine actions from docs/rearch/E3-combat-ai-evaluation.md. All
 * three express scenarios the state machines cannot cleanly cover (compound
 * triggers, cross-squad coordination, external-event wait). The actions
 * here prove the paradigm shape; callers currently only act on the
 * fire-and-fade outcome (VC canary). The other two land as scaffolding so
 * adding a consumer later is a wiring change, not a new-file change.
 */

// ── Fire and fade (VC canary) ─────────────────────────────────────────────
//
// Doctrine: VC squad member withdraws when squad-wide suppression crosses a
// low threshold AND concealment is available in the bearing away from the
// threat. This is the exact compound trigger the state machine can't express
// without surgical additions (cross-NPC read + directional cover query).

const FIRE_AND_FADE_COVER_PROBE_RADIUS = 12
const FIRE_AND_FADE_HEALTH_PIVOT = 0.55
const FIRE_AND_FADE_WEIGHT_SUPPRESSION = 0.8
const FIRE_AND_FADE_WEIGHT_HEALTH = 0.35
// Reused per-action scratch so apply() does not allocate per tick. The scorer
// invokes this action as a singleton; callers that need to persist the cover
// point past a tick must clone (AIStateEngage.handleEngaging does).
const _fireAndFadeScratch = new THREE.Vector3()

function suppressionDrive(ctx: UtilityContext): number {
  const threshold = getFactionCombatTuning(ctx.self.faction).panicThreshold
  // Squad aggregate when available; fall back to own panic as a rough proxy
  // so the action is still useful for solo units while squad-suppression
  // aggregation is not yet plumbed into the combat tick.
  const squadSuppr = ctx.squadSuppression ?? ctx.self.panicLevel ?? 0
  if (squadSuppr <= threshold) return 0
  return (squadSuppr - threshold) / (1 - threshold)
}

function healthDrive(ctx: UtilityContext): number {
  const hpRatio = ctx.self.health / Math.max(1, ctx.self.maxHealth)
  if (hpRatio >= FIRE_AND_FADE_HEALTH_PIVOT) return 0
  return (FIRE_AND_FADE_HEALTH_PIVOT - hpRatio) / FIRE_AND_FADE_HEALTH_PIVOT
}

function coverGate(ctx: UtilityContext): { gate: number; bearing: number } {
  if (!ctx.hasCoverInBearing) return { gate: 0, bearing: 0 }
  const bearing = bearingAwayFromThreat(ctx.self.position, ctx.threatPosition)
  const ok = ctx.hasCoverInBearing(bearing, FIRE_AND_FADE_COVER_PROBE_RADIUS)
  return { gate: ok ? 1 : 0, bearing }
}

export const fireAndFadeAction: UtilityAction = {
  id: 'fire_and_fade',
  weightKey: 'fireAndFade',
  score(ctx: UtilityContext): number {
    const { gate } = coverGate(ctx)
    if (gate === 0) return 0
    const base =
      FIRE_AND_FADE_WEIGHT_SUPPRESSION * suppressionDrive(ctx) +
      FIRE_AND_FADE_WEIGHT_HEALTH * healthDrive(ctx)
    return gate * base
  },
  apply(ctx: UtilityContext): UtilityIntent | null {
    const { bearing } = coverGate(ctx)
    // Cover position = probe tip in the away-from-threat bearing. Caller
    // treats this as a SEEKING_COVER destination; the more precise spot
    // selection stays with AICoverSystem when available. Written into a
    // module-level scratch so this apply() does not allocate per tick —
    // callers that need to persist the cover point must clone (matches the
    // established pattern in repositionAction). AIStateEngage.handleEngaging
    // already clones before storing on the combatant.
    _fireAndFadeScratch.set(
      ctx.self.position.x + Math.cos(bearing) * FIRE_AND_FADE_COVER_PROBE_RADIUS,
      ctx.self.position.y,
      ctx.self.position.z + Math.sin(bearing) * FIRE_AND_FADE_COVER_PROBE_RADIUS
    )
    return {
      kind: 'seekCoverInBearing',
      coverPosition: _fireAndFadeScratch,
      bearingRad: bearing,
    }
  },
}

// ── Coordinate suppression (NVA doctrine, scaffold) ──────────────────────
//
// Doctrine: NVA leader triggers squad base-of-fire + flank when the squad is
// large enough and under committed engagement. Scored here so the scorer
// has a real alternative to weigh fire-and-fade against. Apply returns the
// coordinateSuppression intent; callers may route this to the existing
// AIStateEngage.initiateSquadSuppression or AIFlankingSystem. Not wired to
// NVA behavior yet (NVA has useUtilityAI=false in FactionCombatTuning).

const COORD_SUPPRESSION_MIN_SQUAD = 3
const COORD_SUPPRESSION_WEIGHT = 0.5

const coordinateSuppressionAction: UtilityAction = {
  id: 'coordinate_suppression',
  weightKey: 'suppress',
  score(ctx: UtilityContext): number {
    const squad = ctx.squad
    if (!squad || squad.members.length < COORD_SUPPRESSION_MIN_SQUAD) return 0
    // Only leaders drive this; followers defer to the plan their leader
    // issued. Keeps the "decision is data" property — leadership is a
    // consideration, not a special code path.
    if (ctx.self.squadRole !== 'leader') return 0
    const threshold = getFactionCombatTuning(ctx.self.faction).panicThreshold
    const squadSuppr = ctx.squadSuppression ?? 0
    // Committed factions (high panicThreshold) score this higher for the
    // same squad suppression — they absorb pressure instead of withdrawing.
    const headroom = Math.max(0, threshold - squadSuppr)
    return COORD_SUPPRESSION_WEIGHT * headroom
  },
  apply(_ctx: UtilityContext): UtilityIntent | null {
    return { kind: 'coordinateSuppression' }
  },
}

// ── Request support (US doctrine, scaffold) ──────────────────────────────
//
// Doctrine: engaged US squad calls gunship when outnumbered and support is
// available. The "wait for external event" shape is the one state machines
// struggle with — utility AI handles it by gating on supportAvailable and
// letting a different action win on subsequent ticks if support was denied.

const REQUEST_SUPPORT_OUTNUMBER_RATIO = 1.5
const REQUEST_SUPPORT_WEIGHT = 0.6

const requestSupportAction: UtilityAction = {
  id: 'request_support',
  score(ctx: UtilityContext): number {
    if (!ctx.supportAvailable) return 0
    const squad = ctx.squad
    if (!squad) return 0
    // Without an observed-enemy-strength channel we can't compute the true
    // ratio here — the scaffold uses squadSuppression as the "we are in
    // trouble" proxy. Real wiring lands when the strategic-layer event
    // channel exists (E3 memo §3C).
    const distress = ctx.squadSuppression ?? 0
    if (distress < REQUEST_SUPPORT_OUTNUMBER_RATIO / (REQUEST_SUPPORT_OUTNUMBER_RATIO + 1)) {
      return 0
    }
    return REQUEST_SUPPORT_WEIGHT * distress
  },
  apply(_ctx: UtilityContext): UtilityIntent | null {
    return { kind: 'requestSupport' }
  },
}

// ── Reposition (closes the RETREATING orphan state) ─────────────────────
//
// Doctrine: when squad confidence is low, threat pressure is high, and cover
// is available in the away-from-threat bearing, fall back rather than pop
// into cover in-place. Distinct from fire-and-fade: this transitions the
// unit into RETREATING (movement + AIStateRetreat), not SEEKING_COVER —
// the unit disengages toward the fallback point rather than camping nearby
// cover. Elasticity in `frontlineElasticityM` sets the fallback distance.
//
// Per-faction weights lean VC/ARVN high (guerrilla / variable-cohesion) and
// NVA low (rigid hold doctrine).

const REPOSITION_HEALTH_PIVOT = 0.45
// Steepness of the per-faction suppression curve used inside repositionAction.
// Midpoint is the faction panicThreshold — committed factions (NVA 0.7) tolerate
// more pressure before the curve fires than guerrilla factions (VC 0.35).
const REPOSITION_CURVE_STEEPNESS = 10
// Reused per-action scratch so apply() does not allocate per tick.
const _repositionScratch = new THREE.Vector3()

export const repositionAction: UtilityAction = {
  id: 'reposition',
  weightKey: 'reposition',
  score(ctx: UtilityContext): number {
    // Require the terrain probe so we never route into open ground.
    if (!ctx.hasCoverInBearing) return 0
    const tuning = getFactionCombatTuning(ctx.self.faction)
    // Drive 1: squad suppression pressure mapped through a per-faction
    // logistic curve centered on the faction's panic threshold. Hard gate
    // at panic level — no reposition below the doctrine's commit line.
    const squadSuppr = ctx.squadSuppression ?? ctx.self.panicLevel ?? 0
    if (squadSuppr < tuning.panicThreshold) return 0
    const pressure = evaluateCurve(
      { kind: 'logistic', midpoint: tuning.panicThreshold, steepness: REPOSITION_CURVE_STEEPNESS },
      squadSuppr
    )
    if (pressure <= 0) return 0
    // Drive 2: health-pressure. Low health units score higher than fresh
    // units at the same squad-pressure — damaged factions yield ground.
    const hpRatio = ctx.self.health / Math.max(1, ctx.self.maxHealth)
    const healthPressure =
      hpRatio >= REPOSITION_HEALTH_PIVOT
        ? 0
        : (REPOSITION_HEALTH_PIVOT - hpRatio) / REPOSITION_HEALTH_PIVOT
    // Drive 3: ammo anxiety via faction curve when supplied.
    const ammoPressure =
      ctx.ammoReserve !== undefined
        ? evaluateCurve(tuning.ammoAnxietyCurve, 1 - ctx.ammoReserve)
        : 0
    // Hard gate: cover must exist in the withdraw bearing at the
    // faction-elasticity radius. Without that, fall through.
    const bearing = bearingAwayFromThreat(ctx.self.position, ctx.threatPosition)
    const probeR = Math.max(4, tuning.frontlineElasticityM)
    if (!ctx.hasCoverInBearing(bearing, probeR)) return 0
    // Weighted combination. Weights sum to roughly 1 so the raw score stays
    // in [0, ~1] before the faction multiplier.
    return 0.6 * pressure + 0.25 * healthPressure + 0.15 * ammoPressure
  },
  apply(ctx: UtilityContext): UtilityIntent | null {
    const tuning = getFactionCombatTuning(ctx.self.faction)
    const bearing = bearingAwayFromThreat(ctx.self.position, ctx.threatPosition)
    const dist = Math.max(4, tuning.frontlineElasticityM)
    _repositionScratch.set(
      ctx.self.position.x + Math.cos(bearing) * dist,
      ctx.self.position.y,
      ctx.self.position.z + Math.sin(bearing) * dist
    )
    return {
      kind: 'reposition',
      fallbackPosition: _repositionScratch,
      bearingRad: bearing,
    }
  },
}

// ── Hold (NVA / dug-in doctrine) ─────────────────────────────────────────
//
// Doctrine: stay put, suppress if LOS. Scored on cover-quality-at-pos +
// objective-proximity + squad cohesion — the dug-in NVA ideal. VC weighs
// this low (ambush-fade doctrine), NVA weighs it high (rigid hold).

const HOLD_COVER_WEIGHT = 0.45
const HOLD_OBJECTIVE_WEIGHT = 0.30
const HOLD_COHESION_WEIGHT = 0.25
// Above this squad-suppression level, holding is untenable — gate the
// score to 0 so the unit isn't stuck dug-in while its morale collapses.
const HOLD_SUPPRESSION_CEILING = 0.85

export const holdAction: UtilityAction = {
  id: 'hold',
  weightKey: 'hold',
  score(ctx: UtilityContext): number {
    const cover = ctx.coverQualityHere ?? 0
    const objective = ctx.objectiveProximity ?? 0
    const cohesion = ctx.squadCohesion ?? 0
    // No meaningful holding data at all → score 0 (do not compete with
    // fire-and-fade / reposition on zero-information ties).
    if (cover <= 0 && objective <= 0 && cohesion <= 0) return 0
    const suppr = ctx.squadSuppression ?? ctx.self.panicLevel ?? 0
    if (suppr >= HOLD_SUPPRESSION_CEILING) return 0
    const base =
      HOLD_COVER_WEIGHT * cover +
      HOLD_OBJECTIVE_WEIGHT * objective +
      HOLD_COHESION_WEIGHT * cohesion
    // Soft damp as squad morale erodes — dug-in is worth less under fire,
    // but not so much that committed factions fold at moderate pressure.
    // The per-faction hold multiplier does the heavy differentiation.
    const damp = 1 - 0.5 * Math.max(0, Math.min(1, suppr))
    return base * damp
  },
  apply(_ctx: UtilityContext): UtilityIntent | null {
    return { kind: 'holdPosition' }
  },
}

/** Default action set used by AIStateEngage. Order is not load-bearing. */
export const DEFAULT_UTILITY_ACTIONS: readonly UtilityAction[] = [
  fireAndFadeAction,
  coordinateSuppressionAction,
  requestSupportAction,
  repositionAction,
  holdAction,
]
