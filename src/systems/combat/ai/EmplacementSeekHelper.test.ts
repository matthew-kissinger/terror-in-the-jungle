import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIStateEngage } from './AIStateEngage'
import { Combatant, CombatantState, Faction } from '../types'
import {
  UtilityScorer,
  DEFAULT_UTILITY_ACTIONS,
  mountEmplacementAction,
  EmplacementMountTracker,
  buildEmplacementContext,
  enemyInFieldOfFire,
  STALE_TARGET_DISMOUNT_MS,
  INpcEmplacementQuery,
  INpcEmplacementVehicle,
  INpcEmplacementWeapon,
} from './utility'

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

/**
 * Behavior tests for the NPC-gunner emplacement-seek path
 * (cycle-vekhikl-2-stationary-weapons R2 / emplacement-npc-gunner).
 *
 * Per docs/TESTING.md these tests assert observable outcomes — does a unit
 * with a friendly emplacement in range and an enemy in cone actually
 * transition to BOARDING? Does an out-of-cone enemy keep the unit in
 * ENGAGING? — rather than internal score values. The tracker tests assert
 * the dismount predicate's behavior, not its implementation.
 */

function makeCombatant(
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

function makeFakeEmplacement(
  vehicleId: string,
  position: THREE.Vector3,
  faction: Faction = Faction.US,
  options: { gunnerOccupied?: boolean } = {}
): INpcEmplacementVehicle {
  return {
    vehicleId,
    category: 'emplacement',
    faction,
    getPosition: () => position.clone(),
    hasFreeSeats: (_role) => !options.gunnerOccupied,
  }
}

function makeFakeQuery(vehicles: INpcEmplacementVehicle[]): INpcEmplacementQuery {
  return {
    getVehiclesInRadius: (center, radius) => {
      const r2 = radius * radius
      return vehicles.filter(v => v.getPosition().distanceToSquared(center) <= r2)
    },
  }
}

function makeFakeWeapon(
  cone: { origin: THREE.Vector3; direction: THREE.Vector3; halfAngleRad: number },
  options: { empty?: boolean } = {}
): INpcEmplacementWeapon {
  let empty = options.empty ?? false
  return {
    tryFire: () => !empty,
    isEmpty: () => empty,
    getFieldOfFireCone: () => cone,
  }
}

describe('mountEmplacementAction: scoring gates', () => {
  it('scores zero when no nearbyEmplacement context is present', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const score = mountEmplacementAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
    })
    expect(score).toBe(0)
  })

  it('scores zero when the threat is NOT in the emplacement field of fire', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const score = mountEmplacementAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      nearbyEmplacement: { vehicleId: 'm2hb_1', distance: 4, threatInCone: false },
    })
    expect(score).toBe(0)
  })

  it('scores above zero when an in-cone friendly emplacement is in range', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const score = mountEmplacementAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      nearbyEmplacement: { vehicleId: 'm2hb_1', distance: 4, threatInCone: true },
    })
    expect(score).toBeGreaterThan(0)
  })

  it('prefers nearer in-range emplacements (distance taper)', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const near = mountEmplacementAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      nearbyEmplacement: { vehicleId: 'm2hb_close', distance: 2, threatInCone: true },
    })
    const far = mountEmplacementAction.score({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      nearbyEmplacement: { vehicleId: 'm2hb_far', distance: 7, threatInCone: true },
    })
    expect(near).toBeGreaterThan(far)
  })

  it('apply() returns a mountEmplacement intent carrying the vehicleId', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const intent = mountEmplacementAction.apply({
      self,
      threatPosition: new THREE.Vector3(10, 0, 0),
      nearbyEmplacement: { vehicleId: 'm2hb_xyz', distance: 3, threatInCone: true },
    })
    expect(intent?.kind).toBe('mountEmplacement')
    if (intent?.kind !== 'mountEmplacement') throw new Error('wrong intent kind')
    expect(intent.vehicleId).toBe('m2hb_xyz')
  })
})

describe('enemyInFieldOfFire (cone test)', () => {
  it('returns true for a target directly down the barrel', () => {
    const cone = {
      origin: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      halfAngleRad: Math.PI / 6,
    }
    expect(enemyInFieldOfFire(cone, new THREE.Vector3(10, 0, 0))).toBe(true)
  })

  it('returns false for a target behind the muzzle plane', () => {
    const cone = {
      origin: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      halfAngleRad: Math.PI / 6,
    }
    expect(enemyInFieldOfFire(cone, new THREE.Vector3(-10, 0, 0))).toBe(false)
  })

  it('returns false for a target outside the cone half-angle', () => {
    const cone = {
      origin: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      halfAngleRad: Math.PI / 6, // 30°
    }
    // 60° off-axis — outside the 30° half-angle cone
    expect(enemyInFieldOfFire(cone, new THREE.Vector3(5, 0, 8.66))).toBe(false)
  })

  it('returns true for a target inside the cone half-angle', () => {
    const cone = {
      origin: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      halfAngleRad: Math.PI / 4, // 45°
    }
    // 30° off-axis — inside the 45° half-angle
    expect(enemyInFieldOfFire(cone, new THREE.Vector3(8.66, 0, 5))).toBe(true)
  })
})

describe('buildEmplacementContext: candidate selection', () => {
  it('returns null when no friendly-faction emplacement is in range', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const enemyEmp = makeFakeEmplacement('nva_1', new THREE.Vector3(2, 0, 0), Faction.NVA)
    const query = makeFakeQuery([enemyEmp])
    const ctx = buildEmplacementContext(self, new THREE.Vector3(20, 0, 0), query)
    expect(ctx).toBeNull()
  })

  it('returns null when the only candidate is occupied', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const occupied = makeFakeEmplacement('us_1', new THREE.Vector3(2, 0, 0), Faction.US, { gunnerOccupied: true })
    const query = makeFakeQuery([occupied])
    const ctx = buildEmplacementContext(self, new THREE.Vector3(20, 0, 0), query)
    expect(ctx).toBeNull()
  })

  it('returns the nearest unoccupied friendly emplacement when several are in range', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const closer = makeFakeEmplacement('us_close', new THREE.Vector3(2, 0, 0), Faction.US)
    const farther = makeFakeEmplacement('us_far', new THREE.Vector3(6, 0, 0), Faction.US)
    const query = makeFakeQuery([farther, closer])
    const ctx = buildEmplacementContext(self, new THREE.Vector3(20, 0, 0), query)
    expect(ctx?.vehicleId).toBe('us_close')
  })

  it('marks threatInCone=true when the synthetic cone (no live weapon) aims at the threat', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const emp = makeFakeEmplacement('us_1', new THREE.Vector3(2, 0, 0), Faction.US)
    const query = makeFakeQuery([emp])
    // No weaponResolver supplied -> synthetic cone is aimed at the threat,
    // which trivially contains the threat (this is the documented fallback).
    const ctx = buildEmplacementContext(self, new THREE.Vector3(20, 0, 0), query)
    expect(ctx?.threatInCone).toBe(true)
  })

  it('uses a live weapon cone when the resolver returns one (threat outside cone -> false)', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const emp = makeFakeEmplacement('us_1', new THREE.Vector3(2, 0, 0), Faction.US)
    const query = makeFakeQuery([emp])
    // Cone aimed +X from the emplacement; threat is at -X (behind muzzle).
    const weapon = makeFakeWeapon({
      origin: new THREE.Vector3(2, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),
      halfAngleRad: Math.PI / 6,
    })
    const ctx = buildEmplacementContext(
      self,
      new THREE.Vector3(-20, 0, 0),
      query,
      () => weapon
    )
    expect(ctx?.threatInCone).toBe(false)
  })

  it('accepts an ARVN candidate for a US combatant (alliance, not faction)', () => {
    const self = makeCombatant('c', Faction.US, new THREE.Vector3())
    const arvn = makeFakeEmplacement('arvn_1', new THREE.Vector3(2, 0, 0), Faction.ARVN)
    const query = makeFakeQuery([arvn])
    const ctx = buildEmplacementContext(self, new THREE.Vector3(20, 0, 0), query)
    expect(ctx?.vehicleId).toBe('arvn_1')
  })
})

describe('AIStateEngage: routing the mountEmplacement intent', () => {
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

  it('transitions the unit to BOARDING and assigns vehicleId when an emplacement is in range with enemy in cone', () => {
    // US combatant at origin; friendly M2HB 3 m away; enemy 20 m down-X.
    // The synthetic cone (no live weapon) is aimed at the threat from the
    // emplacement, so the in-cone gate trivially passes.
    const us = makeCombatant('us', Faction.US, new THREE.Vector3())
    const target = makeCombatant('target', Faction.NVA, new THREE.Vector3(20, 0, 0))
    us.target = target

    const emp = makeFakeEmplacement('m2hb_close', new THREE.Vector3(3, 0, 0), Faction.US)
    engage.setUtilityScorer(new UtilityScorer([mountEmplacementAction]))
    engage.setEmplacementQuery(makeFakeQuery([emp]))

    tick(us)

    expect(us.state).toBe(CombatantState.BOARDING)
    expect(us.vehicleId).toBe('m2hb_close')
    expect(us.inCover).toBe(false)
  })

  it('does NOT mount when the enemy is outside the emplacement cone', () => {
    // Live weapon cone aimed +Z; threat at +X (90° off axis). Score should
    // gate to 0 and the unit stays in ENGAGING.
    const us = makeCombatant('us', Faction.US, new THREE.Vector3())
    const target = makeCombatant('target', Faction.NVA, new THREE.Vector3(20, 0, 0))
    us.target = target

    const emp = makeFakeEmplacement('m2hb_close', new THREE.Vector3(3, 0, 0), Faction.US)
    const cone = {
      origin: new THREE.Vector3(3, 0, 0),
      direction: new THREE.Vector3(0, 0, 1), // +Z
      halfAngleRad: Math.PI / 6,
    }
    engage.setUtilityScorer(new UtilityScorer([mountEmplacementAction]))
    engage.setEmplacementQuery(makeFakeQuery([emp]))
    engage.setEmplacementWeaponResolver(() => makeFakeWeapon(cone))

    tick(us)

    expect(us.state).toBe(CombatantState.ENGAGING)
    expect(us.vehicleId).toBeUndefined()
  })

  it('does NOT mount when no friendly emplacement is in range', () => {
    // No emplacement query wired at all -> nearbyEmplacement stays undefined
    // and the action scores 0.
    const us = makeCombatant('us', Faction.US, new THREE.Vector3())
    const target = makeCombatant('target', Faction.NVA, new THREE.Vector3(20, 0, 0))
    us.target = target

    engage.setUtilityScorer(new UtilityScorer([mountEmplacementAction]))

    tick(us)

    expect(us.state).toBe(CombatantState.ENGAGING)
    expect(us.vehicleId).toBeUndefined()
  })

  it('falls through when the candidate is enemy-faction', () => {
    const us = makeCombatant('us', Faction.US, new THREE.Vector3())
    const target = makeCombatant('target', Faction.NVA, new THREE.Vector3(20, 0, 0))
    us.target = target

    const enemyEmp = makeFakeEmplacement('nva_emp', new THREE.Vector3(3, 0, 0), Faction.NVA)
    engage.setUtilityScorer(new UtilityScorer([mountEmplacementAction]))
    engage.setEmplacementQuery(makeFakeQuery([enemyEmp]))

    tick(us)

    expect(us.state).toBe(CombatantState.ENGAGING)
    expect(us.vehicleId).toBeUndefined()
  })

  it('integration: mountEmplacement wins over fireAndFade when both gates pass', () => {
    // Both actions are eligible (cover available behind, emplacement in range
    // with threat in cone). The faction weights amplify US mountEmplacement;
    // we assert the OUTCOME (state == BOARDING), not the score.
    const us = makeCombatant('us', Faction.US, new THREE.Vector3())
    const target = makeCombatant('target', Faction.NVA, new THREE.Vector3(20, 0, 0))
    us.target = target
    us.panicLevel = 0.9
    us.lastHitTime = Date.now() - 500

    const emp = makeFakeEmplacement('m2hb_x', new THREE.Vector3(3, 0, 0), Faction.US)
    engage.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engage.setCoverBearingProbe(() => true)
    engage.setEmplacementQuery(makeFakeQuery([emp]))

    tick(us)

    expect(us.state).toBe(CombatantState.BOARDING)
  })
})

describe('EmplacementMountTracker: dismount predicates', () => {
  it('signals dismount when the weapon is empty', () => {
    const tracker = new EmplacementMountTracker()
    const combatant = makeCombatant('c', Faction.US)
    const cone = { origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), halfAngleRad: 1 }
    const weapon = makeFakeWeapon(cone, { empty: true })
    expect(tracker.shouldDismount(combatant, weapon, Date.now())).toBe(true)
  })

  it('does NOT signal dismount when the weapon has ammo and cone history is empty', () => {
    // Fresh mount: no cone-sample yet -> stale window can't have elapsed.
    const tracker = new EmplacementMountTracker()
    const combatant = makeCombatant('c', Faction.US)
    const cone = { origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), halfAngleRad: 1 }
    const weapon = makeFakeWeapon(cone)
    expect(tracker.shouldDismount(combatant, weapon, Date.now())).toBe(false)
  })

  it('does NOT signal dismount when the threat was recently in cone', () => {
    const tracker = new EmplacementMountTracker()
    const combatant = makeCombatant('c', Faction.US)
    const cone = { origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), halfAngleRad: 1 }
    const weapon = makeFakeWeapon(cone)
    const now = Date.now()
    tracker.markThreatInCone(combatant, now - 1000) // 1 s ago, well under 5 s
    expect(tracker.shouldDismount(combatant, weapon, now)).toBe(false)
  })

  it('signals dismount when the threat has been out of cone for >5 s', () => {
    const tracker = new EmplacementMountTracker()
    const combatant = makeCombatant('c', Faction.US)
    const cone = { origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), halfAngleRad: 1 }
    const weapon = makeFakeWeapon(cone)
    const now = Date.now()
    tracker.markThreatInCone(combatant, now - (STALE_TARGET_DISMOUNT_MS + 100))
    expect(tracker.shouldDismount(combatant, weapon, now)).toBe(true)
  })

  it('reset() clears cone history (re-mount starts a fresh stale window)', () => {
    const tracker = new EmplacementMountTracker()
    const combatant = makeCombatant('c', Faction.US)
    const cone = { origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), halfAngleRad: 1 }
    const weapon = makeFakeWeapon(cone)
    const now = Date.now()
    tracker.markThreatInCone(combatant, now - (STALE_TARGET_DISMOUNT_MS + 100))
    tracker.reset(combatant)
    expect(tracker.shouldDismount(combatant, weapon, now)).toBe(false)
  })
})
