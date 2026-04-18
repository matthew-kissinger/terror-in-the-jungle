import * as THREE from 'three'
import { getFactionCombatTuning } from '../../../../config/FactionCombatTuning'
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
    // selection stays with AICoverSystem when available.
    const coverPosition = new THREE.Vector3(
      ctx.self.position.x + Math.cos(bearing) * FIRE_AND_FADE_COVER_PROBE_RADIUS,
      ctx.self.position.y,
      ctx.self.position.z + Math.sin(bearing) * FIRE_AND_FADE_COVER_PROBE_RADIUS
    )
    return {
      kind: 'seekCoverInBearing',
      coverPosition,
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

export const coordinateSuppressionAction: UtilityAction = {
  id: 'coordinate_suppression',
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

export const requestSupportAction: UtilityAction = {
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

/** Default action set used by AIStateEngage. Order is not load-bearing. */
export const DEFAULT_UTILITY_ACTIONS: readonly UtilityAction[] = [
  fireAndFadeAction,
  coordinateSuppressionAction,
  requestSupportAction,
]
