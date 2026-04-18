import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIStateRetreat } from './AIStateRetreat'
import { Combatant, CombatantState, Faction } from '../types'

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

function createCombatant(
  id: string,
  faction: Faction,
  position = new THREE.Vector3()
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    state: CombatantState.RETREATING,
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
    panicLevel: 0.8,
    lastHitTime: Date.now() - 500,
    alertTimer: 5.0,
    currentBurst: 0,
    suppressionEndTime: undefined,
    suppressionTarget: undefined,
    lastKnownTargetPos: undefined,
    reactionTimer: 0,
  } as Combatant
}

describe('AIStateRetreat', () => {
  // The retreat handler governs only state transitions — it does not move
  // the unit itself (the movement system consumes destinationPoint). Tests
  // assert transition behavior: reach fallback, lose bearing, recover morale.

  let retreat: AIStateRetreat

  beforeEach(() => {
    retreat = new AIStateRetreat()
  })

  it('transitions back to ENGAGING and clears destination when the unit reaches the fallback point', () => {
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(20, 0, 0))
    // Fallback point right at the unit's current position — within the
    // reached-cover threshold.
    unit.destinationPoint = new THREE.Vector3(20, 0, 0)
    retreat.handleRetreating(unit, 0.016, new THREE.Vector3(0, 0, 0))

    expect(unit.state).toBe(CombatantState.ENGAGING)
    expect(unit.destinationPoint).toBeUndefined()
  })

  it('stays in RETREATING while the unit is still moving toward the fallback', () => {
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(20, 0, 0))
    unit.destinationPoint = new THREE.Vector3(40, 0, 0) // 20 units away
    retreat.handleRetreating(unit, 0.016, new THREE.Vector3(0, 0, 0))

    expect(unit.state).toBe(CombatantState.RETREATING)
    expect(unit.destinationPoint).toBeDefined()
  })

  it('falls back to ENGAGING immediately when destinationPoint is missing', () => {
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(20, 0, 0))
    unit.destinationPoint = undefined
    retreat.handleRetreating(unit, 0.016, new THREE.Vector3(0, 0, 0))

    expect(unit.state).toBe(CombatantState.ENGAGING)
  })

  it('transitions to ENGAGING when the threat bearing flips more than 90° from the fallback bearing', () => {
    // Unit at origin, retreating east (fallback at +x). If the threat moves
    // so that "away from threat" now points south (threat is to the north),
    // the stale fallback no longer protects us and we should re-evaluate.
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(0, 0, 0))
    unit.destinationPoint = new THREE.Vector3(20, 0, 0) // bearing 0 rad
    // Threat to the east means the correct "away from threat" bearing is π
    // (west) — a 180° flip from the committed retreat bearing.
    const threatPos = new THREE.Vector3(40, 0, 0)
    retreat.handleRetreating(unit, 0.016, threatPos)

    expect(unit.state).toBe(CombatantState.ENGAGING)
  })

  it('transitions to ENGAGING when morale recovers below the clearance threshold', () => {
    const unit = createCombatant('nva', Faction.NVA, new THREE.Vector3(0, 0, 0))
    unit.destinationPoint = new THREE.Vector3(50, 0, 0) // far — not reached
    unit.panicLevel = 0.02 // below the clearance threshold

    retreat.handleRetreating(unit, 0.016, new THREE.Vector3(-50, 0, 0))

    expect(unit.state).toBe(CombatantState.ENGAGING)
  })

  it('decays panic over time while retreating (morale recovery curve)', () => {
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(0, 0, 0))
    unit.destinationPoint = new THREE.Vector3(50, 0, 0)
    unit.panicLevel = 0.6
    const before = unit.panicLevel

    retreat.handleRetreating(unit, 0.5, new THREE.Vector3(-50, 0, 0))

    expect(unit.panicLevel).toBeLessThan(before)
  })

  it('orients the unit toward the fallback point while moving', () => {
    const unit = createCombatant('vc', Faction.VC, new THREE.Vector3(0, 0, 0))
    unit.destinationPoint = new THREE.Vector3(30, 0, 0)
    unit.rotation = 999 // garbage

    retreat.handleRetreating(unit, 0.016, new THREE.Vector3(-30, 0, 0))

    // Facing +x means rotation ≈ atan2(0, 30) = 0.
    expect(unit.rotation).toBeCloseTo(0, 3)
  })
})
