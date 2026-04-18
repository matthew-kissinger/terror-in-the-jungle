import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIStateEngage } from '../AIStateEngage'
import { Combatant, CombatantState, Faction } from '../../types'
import {
  UtilityScorer,
  DEFAULT_UTILITY_ACTIONS,
  fireAndFadeAction,
  repositionAction,
  holdAction,
} from './index'

vi.mock('../../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Shared fixture builders. Keep close to the handler's createMockCombatant
// shape in AIStateEngage.test.ts so these behavior tests exercise the same
// state-machine surface real combat code uses.
function createCombatant(
  id: string,
  faction: Faction,
  position = new THREE.Vector3()
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    state: CombatantState.ENGAGING,
    skillProfile: {
      reactionDelayMs: 100,
      visualRange: 100,
      burstLength: 3,
      burstPauseMs: 1000,
    },
    squadId: 'squad-1',
    squadRole: 'follower',
    rotation: 0,
    kills: 0,
    deaths: 0,
    health: 100,
    maxHealth: 100,
    target: null,
    previousState: undefined,
    isFullAuto: false,
    inCover: false,
    coverPosition: undefined,
    panicLevel: 0,
    lastHitTime: Date.now() - 5000,
    alertTimer: 5.0,
    currentBurst: 0,
    suppressionEndTime: undefined,
    suppressionTarget: undefined,
    lastKnownTargetPos: undefined,
    reactionTimer: 0,
  } as Combatant
}

describe('UtilityScorer: integration with AIStateEngage', () => {
  // These tests treat the utility layer as a black box through the
  // AIStateEngage hook. They assert OUTCOMES (did the VC break contact
  // earlier?) not internal scores or action identities.

  let engage: AIStateEngage
  let canSeeTarget: ReturnType<typeof vi.fn>
  let shouldSeekCover: ReturnType<typeof vi.fn>
  let findNearestCover: ReturnType<typeof vi.fn>
  let countNearbyEnemies: ReturnType<typeof vi.fn>
  let isCoverFlanked: ReturnType<typeof vi.fn>
  const playerPosition = new THREE.Vector3(0, 0, 0)

  beforeEach(() => {
    engage = new AIStateEngage()
    canSeeTarget = vi.fn(() => true)
    shouldSeekCover = vi.fn(() => false)
    findNearestCover = vi.fn(() => null)
    countNearbyEnemies = vi.fn(() => 0)
    isCoverFlanked = vi.fn(() => false)
  })

  function tick(combatant: Combatant) {
    engage.handleEngaging(
      combatant,
      0.016,
      playerPosition,
      new Map(),
      undefined,
      canSeeTarget,
      shouldSeekCover,
      findNearestCover,
      countNearbyEnemies,
      isCoverFlanked
    )
  }

  it('VC with utility-AI on breaks contact to cover under fire when VC without utility-AI holds the line', () => {
    // Same stimulus, two VC units, same squad, same recent-hit state, same
    // terrain cover available behind. The only differentiator is the opt-in
    // flag (true on first, false on second). This is the canary check: the
    // utility layer demonstrates its value on the exact compound trigger the
    // state machine can't cleanly express — suppression pressure AND cover
    // in the away-from-threat bearing.

    // Utility ON: register the scorer + always-true cover probe.
    const engageOn = new AIStateEngage()
    engageOn.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engageOn.setCoverBearingProbe(() => true)

    // Utility OFF: no scorer registered — pure state-machine path.
    const engageOff = new AIStateEngage()

    // Force both units into the "recently-hit, panicking past threshold"
    // state that the fire-and-fade action reacts to.
    const vcOn = createCombatant('vc-on', Faction.VC, new THREE.Vector3(10, 0, 0))
    const vcOff = createCombatant('vc-off', Faction.VC, new THREE.Vector3(10, 0, 0))
    const target = createCombatant('target', Faction.US, new THREE.Vector3(-10, 0, 0))
    vcOn.target = target
    vcOff.target = target
    vcOn.lastHitTime = Date.now() - 500
    vcOff.lastHitTime = Date.now() - 500
    vcOn.panicLevel = 0.5 // starts above VC's 0.35 threshold
    vcOff.panicLevel = 0.5

    const runTick = (handler: AIStateEngage, c: Combatant) => {
      handler.handleEngaging(
        c, 0.016, playerPosition, new Map(), undefined,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      )
    }

    runTick(engageOn, vcOn)
    runTick(engageOff, vcOff)

    // Behavior assertion: utility-on VC has left ENGAGING (either to cover
    // or to a reposition / retreat state); utility-off VC is still in
    // ENGAGING (panic drives full-auto, nothing more). The specific
    // break-contact destination is tuning (fade to cover vs fall back) and
    // may flip with doctrine changes — only the state-transition invariant
    // is asserted.
    expect([
      CombatantState.SEEKING_COVER,
      CombatantState.RETREATING,
    ]).toContain(vcOn.state)
    expect(vcOff.state).toBe(CombatantState.ENGAGING)
  })

  it('VC with utility-AI holds position when no cover is available in the withdraw bearing', () => {
    // Same VC unit, same suppression pressure, but the cover probe reports
    // no concealment in the away-from-threat bearing. The hard gate inside
    // the fire-and-fade action should drive the score to 0 and the unit
    // should fall through to the default engage ladder — this is the
    // "don't flee into open ground" behavior the state machine can't
    // cleanly express without a directional-cover query.

    engage.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engage.setCoverBearingProbe(() => false) // no cover anywhere

    const vc = createCombatant('vc', Faction.VC, new THREE.Vector3(10, 0, 0))
    const target = createCombatant('target', Faction.US, new THREE.Vector3(-10, 0, 0))
    vc.target = target
    vc.lastHitTime = Date.now() - 500
    vc.panicLevel = 0.5

    tick(vc)

    expect(vc.state).toBe(CombatantState.ENGAGING)
  })

  it('NVA does not fade at moderate pressure even with utility-AI on — commits harder than VC', () => {
    // After the doctrine-expansion pass, NVA opts in to utility-AI like every
    // faction, but its action-weight table damps fade/reposition and
    // amplifies hold/suppress. At moderate squad-suppression with cover
    // available, NVA stays in ENGAGING where VC would fade.

    engage.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engage.setCoverBearingProbe(() => true)

    const nva = createCombatant('nva', Faction.NVA, new THREE.Vector3(10, 0, 0))
    const target = createCombatant('target', Faction.US, new THREE.Vector3(-10, 0, 0))
    nva.target = target
    nva.lastHitTime = Date.now() - 500
    // Start at 0.3 — the handler bumps by PANIC_INCREMENT (0.3) on this
    // tick, bringing NVA to ~0.6. That is above VC's 0.35 threshold but
    // still below NVA's 0.7 threshold. Reposition's hard gate (panic <
    // faction threshold) keeps NVA engaged.
    nva.panicLevel = 0.3

    tick(nva)

    // NVA does not break contact at this pressure — fire-and-fade's weight
    // is dampened below the threshold of winning.
    expect(nva.state).toBe(CombatantState.ENGAGING)
  })
})

describe('UtilityScorer: unit scoring', () => {
  // Small focused tests on the scorer itself. Assert behavior (which action
  // wins) not raw score numbers — those are tuning constants that will move.

  it('returns null when no action scores above zero', () => {
    const scorer = new UtilityScorer(DEFAULT_UTILITY_ACTIONS)
    const self = createCombatant('c', Faction.VC, new THREE.Vector3())
    // No suppression, no cover probe, no squad, no support. Nothing scores.
    const pick = scorer.pick({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
    })
    expect(pick.action).toBeNull()
    expect(pick.intent).toBeNull()
  })

  it('picks fire_and_fade when suppression pressure is high and cover is available', () => {
    const scorer = new UtilityScorer([fireAndFadeAction])
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    self.panicLevel = 0.9
    const pick = scorer.pick({
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 0.9,
      hasCoverInBearing: () => true,
    })
    expect(pick.action?.id).toBe('fire_and_fade')
    expect(pick.intent?.kind).toBe('seekCoverInBearing')
  })

  it('fire_and_fade scores zero when the cover gate fails, even at max pressure', () => {
    const scorer = new UtilityScorer([fireAndFadeAction])
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    self.panicLevel = 1.0
    const pick = scorer.pick({
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 1.0,
      hasCoverInBearing: () => false,
    })
    // The hard gate is the entire point of this action — without cover,
    // it must lose regardless of how much pressure is present.
    expect(pick.action).toBeNull()
  })
})

describe('repositionAction', () => {
  // Behavior: a reposition intent must transition the unit into RETREATING
  // with a fallback point behind the threat bearing. Closes the orphan
  // RETREATING state noted in docs/COMBAT.md.

  it('scores zero without a cover probe (no open-ground retreats)', () => {
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    self.panicLevel = 0.9
    const score = repositionAction.score({
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 0.9,
    })
    expect(score).toBe(0)
  })

  it('scores above zero when pressure is high and cover exists behind the threat bearing', () => {
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    self.panicLevel = 0.9
    const score = repositionAction.score({
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 0.9,
      hasCoverInBearing: () => true,
    })
    expect(score).toBeGreaterThan(0)
  })

  it('apply returns a fallback point on the away-from-threat side of the unit', () => {
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    self.panicLevel = 0.9
    const intent = repositionAction.apply({
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 0.9,
      hasCoverInBearing: () => true,
    })
    expect(intent?.kind).toBe('reposition')
    if (intent?.kind !== 'reposition') throw new Error('wrong intent kind')
    // Threat is at -10, self at +10: fallback x should be greater than self.x.
    expect(intent.fallbackPosition.x).toBeGreaterThan(self.position.x)
  })

  it('does not allocate a fresh Vector3 on each apply() call', () => {
    // Pooling invariant from the task brief: action apply() must not
    // allocate a new THREE.Vector3 per tick. Same action reused across
    // calls returns the same scratch (callers must clone to persist).
    const self = createCombatant('c', Faction.VC, new THREE.Vector3(10, 0, 0))
    const ctx = {
      self,
      threatPosition: new THREE.Vector3(-10, 0, 0),
      squadSuppression: 0.9,
      hasCoverInBearing: () => true,
    }
    const a = repositionAction.apply(ctx)
    const b = repositionAction.apply(ctx)
    if (a?.kind !== 'reposition' || b?.kind !== 'reposition') {
      throw new Error('expected reposition intents')
    }
    // Same pooled scratch object — reference equality.
    expect(a.fallbackPosition).toBe(b.fallbackPosition)
  })
})

describe('holdAction', () => {
  // Behavior: hold wins when the unit is in good cover near its objective
  // and squad cohesion is solid. Collapses to zero under heavy suppression.

  it('scores zero with no cover / cohesion / objective data', () => {
    const self = createCombatant('c', Faction.NVA, new THREE.Vector3())
    const score = holdAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
    })
    expect(score).toBe(0)
  })

  it('scores above zero when cover and cohesion are strong', () => {
    const self = createCombatant('c', Faction.NVA, new THREE.Vector3())
    const score = holdAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      coverQualityHere: 0.9,
      squadCohesion: 0.9,
      objectiveProximity: 0.8,
    })
    expect(score).toBeGreaterThan(0)
  })

  it('collapses to zero under near-max squad suppression (hold is untenable)', () => {
    const self = createCombatant('c', Faction.NVA, new THREE.Vector3())
    const score = holdAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      coverQualityHere: 1,
      squadCohesion: 1,
      objectiveProximity: 1,
      squadSuppression: 0.95,
    })
    expect(score).toBe(0)
  })
})

describe('faction action-weight differentiation', () => {
  // Two combatants, identical observation state, different factions. The
  // scorer's faction-weight multipliers must route them to different winning
  // actions. If all factions feel the same the whole task is pointless (hard
  // stop in the brief).

  const buildCtx = (combatant: Combatant) => ({
    self: combatant,
    threatPosition: new THREE.Vector3(-10, 0, 0),
    squadSuppression: 0.8,
    hasCoverInBearing: () => true,
    coverQualityHere: 0.8,
    squadCohesion: 0.9,
    objectiveProximity: 0.7,
  })

  it('VC picks fade/reposition over hold under pressure with cover behind', () => {
    const scorer = new UtilityScorer(DEFAULT_UTILITY_ACTIONS)
    const vc = createCombatant('vc', Faction.VC, new THREE.Vector3(10, 0, 0))
    vc.panicLevel = 0.8
    const pick = scorer.pick(buildCtx(vc))
    expect(pick.action).not.toBeNull()
    expect(['fire_and_fade', 'reposition']).toContain(pick.action?.id)
  })

  it('NVA picks hold over fade given the same observation state', () => {
    const scorer = new UtilityScorer(DEFAULT_UTILITY_ACTIONS)
    const nva = createCombatant('nva', Faction.NVA, new THREE.Vector3(10, 0, 0))
    nva.panicLevel = 0.8
    const pick = scorer.pick(buildCtx(nva))
    expect(pick.action).not.toBeNull()
    // NVA doctrine: dug in around objective, do not fade. hold weight is
    // high and fade weight is dampened.
    expect(pick.action?.id).toBe('hold')
  })

  it('VC and NVA diverge on identical observation state', () => {
    const scorer = new UtilityScorer(DEFAULT_UTILITY_ACTIONS)
    const vc = createCombatant('vc', Faction.VC, new THREE.Vector3(10, 0, 0))
    const nva = createCombatant('nva', Faction.NVA, new THREE.Vector3(10, 0, 0))
    vc.panicLevel = 0.8
    nva.panicLevel = 0.8
    const pickVC = scorer.pick(buildCtx(vc))
    const pickNVA = scorer.pick(buildCtx(nva))
    // Doctrine differentiation: the winners must not be the same action ID.
    // If this ever fires, the faction weights are too timid.
    expect(pickVC.action?.id).not.toBe(pickNVA.action?.id)
  })
})

describe('AIStateEngage routing new utility intents', () => {
  it('routes a winning reposition intent into RETREATING with a cloned destination', () => {
    // Behavior: when the scorer picks reposition, the engage handler must
    // set state=RETREATING, stash destinationPoint as a cloned Vector3
    // (not the pooled scratch), and exit the handler.
    const engage = new AIStateEngage()
    engage.setUtilityScorer(new UtilityScorer([repositionAction]))
    engage.setCoverBearingProbe(() => true)

    const vc = createCombatant('vc', Faction.VC, new THREE.Vector3(10, 0, 0))
    const target = createCombatant('target', Faction.US, new THREE.Vector3(-10, 0, 0))
    vc.target = target
    vc.panicLevel = 0.9
    vc.lastHitTime = Date.now() - 500

    engage.handleEngaging(
      vc, 0.016, new THREE.Vector3(), new Map(), undefined,
      () => true, () => false, () => null, () => 0, () => false
    )

    expect(vc.state).toBe(CombatantState.RETREATING)
    expect(vc.destinationPoint).toBeDefined()

    // Clone invariant: mutating the scratch on the next apply() must not
    // affect the stored destinationPoint.
    const saved = vc.destinationPoint!.clone()
    repositionAction.apply({
      self: vc,
      threatPosition: new THREE.Vector3(100, 0, 100),
      squadSuppression: 0.9,
      hasCoverInBearing: () => true,
    })
    expect(vc.destinationPoint!.distanceTo(saved)).toBe(0)
  })
})
