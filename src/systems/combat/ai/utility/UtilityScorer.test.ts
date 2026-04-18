import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIStateEngage } from '../AIStateEngage'
import { Combatant, CombatantState, Faction } from '../../types'
import {
  UtilityScorer,
  DEFAULT_UTILITY_ACTIONS,
  fireAndFadeAction,
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

    // Behavior assertion: utility-on VC has left ENGAGING for cover.
    // Utility-off VC still in ENGAGING (panic drives full-auto, nothing more).
    expect(vcOn.state).toBe(CombatantState.SEEKING_COVER)
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

  it('NVA is unaffected by the utility layer even when it is registered (useUtilityAI=false)', () => {
    // NVA opts out of the utility layer in FactionCombatTuning. Registering
    // the scorer must not change NVA behavior — the flag is the gate.

    engage.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engage.setCoverBearingProbe(() => true)

    const nva = createCombatant('nva', Faction.NVA, new THREE.Vector3(10, 0, 0))
    const target = createCombatant('target', Faction.US, new THREE.Vector3(-10, 0, 0))
    nva.target = target
    nva.lastHitTime = Date.now() - 500
    nva.panicLevel = 0.5 // above VC threshold, below NVA threshold (0.7)

    tick(nva)

    // NVA does not break contact; its doctrine commits at this pressure level.
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
