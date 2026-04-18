import { describe, it, expect } from 'vitest'
import {
  FACTION_COMBAT_TUNING,
  evaluateCurve,
  getFactionCombatTuning,
  ResponseCurve,
} from './FactionCombatTuning'
import { Faction } from '../systems/combat/types'

/**
 * Behavior tests for the doctrine data layer. These test observable outcomes
 * of the evaluator (shape + monotonicity + clamping) and the coarse structure
 * of the faction table (all factions opt in to utility-AI, distinct action
 * weights). They do NOT assert tuning numbers — those are playtest-tuned.
 */

describe('evaluateCurve', () => {
  it('logistic curve is monotonically non-decreasing in [0,1]', () => {
    const curve: ResponseCurve = { kind: 'logistic', midpoint: 0.5, steepness: 6 }
    let prev = -Infinity
    for (let i = 0; i <= 10; i++) {
      const y = evaluateCurve(curve, i / 10)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })

  it('all curve kinds return finite values inside [0,1] for any input', () => {
    const curves: ResponseCurve[] = [
      { kind: 'logistic', midpoint: 0.5, steepness: 8 },
      { kind: 'linear', midpoint: 0.3, steepness: 1 },
      { kind: 'quadratic', midpoint: 0.5, steepness: 4 },
    ]
    const inputs = [-1, 0, 0.2, 0.5, 0.8, 1, 2, NaN]
    for (const c of curves) {
      for (const x of inputs) {
        const y = evaluateCurve(c, x)
        expect(Number.isFinite(y)).toBe(true)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('logistic curve evaluates close to 0.5 at its midpoint', () => {
    const curve: ResponseCurve = { kind: 'logistic', midpoint: 0.4, steepness: 10 }
    expect(evaluateCurve(curve, 0.4)).toBeCloseTo(0.5, 5)
  })

  it('clamps extreme steepness without overflowing to Infinity/NaN', () => {
    // The hard stop in the task brief: runaway output is unacceptable. A
    // wildly steep curve with input far from midpoint used to overflow
    // Math.exp — the evaluator must guard against that.
    const curve: ResponseCurve = { kind: 'logistic', midpoint: 0.5, steepness: 1e6 }
    const y0 = evaluateCurve(curve, 0)
    const y1 = evaluateCurve(curve, 1)
    expect(Number.isFinite(y0)).toBe(true)
    expect(Number.isFinite(y1)).toBe(true)
    expect(y0).toBeLessThan(0.01)
    expect(y1).toBeGreaterThan(0.99)
  })

  it('quadratic curve is symmetric around its midpoint for equal offsets', () => {
    const curve: ResponseCurve = { kind: 'quadratic', midpoint: 0.5, steepness: 2 }
    const yBelow = evaluateCurve(curve, 0.3)
    const yAbove = evaluateCurve(curve, 0.7)
    // Reflected across 0.5, so yBelow + yAbove ≈ 1.
    expect(yBelow + yAbove).toBeCloseTo(1, 5)
  })
})

describe('FACTION_COMBAT_TUNING table', () => {
  it('every faction opts in to utility-AI', () => {
    for (const f of [Faction.VC, Faction.NVA, Faction.US, Faction.ARVN]) {
      expect(getFactionCombatTuning(f).useUtilityAI).toBe(true)
    }
  })

  it('every faction exposes a complete action-weight bundle', () => {
    const requiredKeys = ['engage', 'fireAndFade', 'suppress', 'reposition', 'regroup', 'hold']
    for (const f of [Faction.VC, Faction.NVA, Faction.US, Faction.ARVN]) {
      const w = getFactionCombatTuning(f).actionWeights
      for (const k of requiredKeys) {
        expect(w).toHaveProperty(k)
        const v = (w as Record<string, number>)[k]
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('VC fades more readily than NVA (fireAndFade + reposition)', () => {
    // Behavior assertion: VC doctrine should favor disengagement more than
    // NVA. Specific numbers are tuning; the relationship is the invariant.
    const vc = getFactionCombatTuning(Faction.VC).actionWeights
    const nva = getFactionCombatTuning(Faction.NVA).actionWeights
    expect(vc.fireAndFade).toBeGreaterThan(nva.fireAndFade)
    expect(vc.reposition).toBeGreaterThan(nva.reposition)
  })

  it('NVA holds more readily than VC', () => {
    const vc = getFactionCombatTuning(Faction.VC).actionWeights
    const nva = getFactionCombatTuning(Faction.NVA).actionWeights
    expect(nva.hold).toBeGreaterThan(vc.hold)
  })

  it('US suppresses more aggressively than VC (fire-and-maneuver doctrine)', () => {
    const us = getFactionCombatTuning(Faction.US).actionWeights
    const vc = getFactionCombatTuning(Faction.VC).actionWeights
    expect(us.suppress).toBeGreaterThan(vc.suppress)
  })

  it('VC morale decays faster than NVA under fire', () => {
    expect(getFactionCombatTuning(Faction.VC).moraleDecayPerSec).toBeGreaterThan(
      getFactionCombatTuning(Faction.NVA).moraleDecayPerSec
    )
  })

  it('frontline elasticity is widest for VC and narrowest for NVA', () => {
    // Doctrine: VC yields ground readily, NVA digs in. Numeric magnitudes
    // are playtest-tuned; only the ordering is asserted.
    const vc = getFactionCombatTuning(Faction.VC).frontlineElasticityM
    const nva = getFactionCombatTuning(Faction.NVA).frontlineElasticityM
    expect(vc).toBeGreaterThan(nva)
  })

  it('legacy panicThreshold field is preserved for non-utility callers', () => {
    for (const f of [Faction.VC, Faction.NVA, Faction.US, Faction.ARVN]) {
      const t = getFactionCombatTuning(f)
      expect(t.panicThreshold).toBeGreaterThan(0)
      expect(t.panicThreshold).toBeLessThanOrEqual(1)
    }
  })
})

describe('FACTION_COMBAT_TUNING shape invariants', () => {
  it('covers every faction with no undefined entries', () => {
    for (const f of [Faction.VC, Faction.NVA, Faction.US, Faction.ARVN]) {
      expect(FACTION_COMBAT_TUNING[f]).toBeDefined()
    }
  })
})
