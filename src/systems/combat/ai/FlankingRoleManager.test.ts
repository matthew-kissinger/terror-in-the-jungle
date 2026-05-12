import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { FlankingRoleManager } from './FlankingRoleManager'
import { Combatant, CombatantState, Faction, Squad } from '../types'
import { FlankingOperation, FlankingStatus } from './AIFlankingSystem'

vi.mock('../../terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: vi.fn((_x: number, _z: number) => 0),
  }),
}))

vi.mock('../../../utils/ObjectPoolManager', () => ({
  objectPool: {
    getVector3: vi.fn(() => new THREE.Vector3()),
    releaseVector3: vi.fn(),
  },
}))

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  state: CombatantState = CombatantState.ENGAGING,
  squadRole?: 'leader' | 'follower'
): Combatant {
  return {
    id,
    faction,
    health: 100,
    maxHealth: 100,
    state,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {
      burstLength: 3,
      burstPauseMs: 200,
      reactionDelayMs: 100,
      aimJitterAmplitude: 0.5,
      leadingErrorFactor: 1.0,
      suppressionResistance: 0.5,
      visualRange: 100,
      fieldOfView: 180,
      firstShotAccuracy: 0.8,
      burstDegradation: 0.1,
    },
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    target: undefined,
    lastKnownTargetPos: undefined,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    squadRole,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    simLane: 'high',
    renderLane: 'culled',
    kills: 0,
    deaths: 0,
  } as Combatant
}

function createMockSquad(
  id: string,
  faction: Faction,
  members: string[],
  leaderId?: string
): Squad {
  return {
    id,
    faction,
    members,
    leaderId,
    formation: 'wedge',
  }
}

function createMockFlankingOperation(
  squadId: string,
  suppressors: string[],
  flankers: string[],
  targetPosition: THREE.Vector3 = new THREE.Vector3(50, 0, 0),
  status: FlankingStatus = FlankingStatus.PLANNING
): FlankingOperation {
  return {
    squadId,
    suppressors,
    flankers,
    targetPosition: targetPosition.clone(),
    flankWaypoint: new THREE.Vector3(25, 0, 25),
    flankDirection: 'left',
    status,
    startTime: Date.now(),
    lastStatusUpdate: Date.now(),
    casualtiesBeforeFlank: 0,
    casualtiesDuringFlank: 0,
  }
}

describe('FlankingRoleManager', () => {
  let roleManager: FlankingRoleManager
  let allCombatants: Map<string, Combatant>

  beforeEach(() => {
    roleManager = new FlankingRoleManager()
    allCombatants = new Map()
    vi.clearAllMocks()
  })

  describe('assignFlankingRoles', () => {
    it('splits a 3-member squad into suppressors (leader + first) and flankers', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2])

      expect(result).toBeDefined()
      expect(result?.suppressors).toContain('c1')
      expect(result?.suppressors).toContain('c2')
      expect(result?.flankers).toContain('c3')
    })

    it('returns null when a single combatant cannot be split into both roles', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      expect(roleManager.assignFlankingRoles([leader])).toBeNull()
      expect(roleManager.assignFlankingRoles([])).toBeNull()
    })

    it('rebalances when one role is empty so both have at least one member', () => {
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([member1, member2])

      expect(result).toBeDefined()
      expect(result!.suppressors.length).toBeGreaterThan(0)
      expect(result!.flankers.length).toBeGreaterThan(0)
    })

    it('scales to larger squads, leaving a majority of members free to flank', () => {
      const members: Combatant[] = []
      for (let i = 0; i < 10; i++) {
        members.push(
          createMockCombatant(`c${i}`, Faction.US, new THREE.Vector3(i, 0, 0), CombatantState.ENGAGING, i === 0 ? 'leader' : 'follower')
        )
      }

      const result = roleManager.assignFlankingRoles(members)

      expect(result).toBeDefined()
      expect(result!.flankers.length).toBeGreaterThan(result!.suppressors.length)
    })
  })

  describe('assignSuppressionBehavior', () => {
    it('drives suppressors into SUPPRESSING state with a target bearing', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const targetPos = new THREE.Vector3(10, 0, 10)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], targetPos)

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.state).toBe(CombatantState.SUPPRESSING)
      expect(leader.suppressionTarget).toBeDefined()
      expect(leader.suppressionTarget!.distanceTo(targetPos)).toBeLessThan(0.1)
      expect(leader.rotation).toBeCloseTo(Math.atan2(10, 10), 5)
    })

    it('reuses the suppressionTarget vector when the combatant already has one', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const existingTarget = new THREE.Vector3(10, 0, 10)
      leader.suppressionTarget = existingTarget
      allCombatants.set('c1', leader)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], targetPos)

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.suppressionTarget).toBe(existingTarget)
      expect(leader.suppressionTarget!.distanceTo(targetPos)).toBeLessThan(0.1)
    })

    it('sets a finite suppression duration ending in the future', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const beforeTime = Date.now()
      roleManager.assignSuppressionBehavior(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)

      expect(leader.suppressionEndTime).toBeDefined()
      expect(leader.suppressionEndTime!).toBeGreaterThan(beforeTime)
    })

    it('skips missing or dead combatants', () => {
      const dead = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', dead)
      const op = createMockFlankingOperation('squad-1', ['c1', 'missing'], ['c2'])

      expect(() => roleManager.assignSuppressionBehavior(op, allCombatants)).not.toThrow()
      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('assignFlankingBehavior', () => {
    it('puts flankers into ADVANCING with a destination point and flanking flag', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      roleManager.assignFlankingBehavior(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)

      expect(flanker.state).toBe(CombatantState.ADVANCING)
      expect(flanker.destinationPoint).toBeDefined()
      expect(flanker.isFlankingMove).toBe(true)
    })

    it('spreads multiple flankers across different destination points', () => {
      const flanker1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      const flanker2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker1)
      allCombatants.set('c3', flanker2)

      roleManager.assignFlankingBehavior(createMockFlankingOperation('squad-1', ['c1'], ['c2', 'c3']), allCombatants)

      expect(flanker1.destinationPoint!.distanceTo(flanker2.destinationPoint!)).toBeGreaterThan(0.1)
    })

    it('skips missing or dead combatants', () => {
      const dead = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'follower')
      allCombatants.set('c2', dead)
      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2', 'missing'])

      expect(() => roleManager.assignFlankingBehavior(op, allCombatants)).not.toThrow()
      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('areFlankersInPosition', () => {
    it('returns true when flankers are close to their destinations', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(25, 0, 25), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(25, 0, 25)
      allCombatants.set('c2', flanker)

      expect(roleManager.areFlankersInPosition(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)).toBe(true)
    })

    it('returns false when flankers are far from their destinations', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(50, 0, 50)
      allCombatants.set('c2', flanker)

      expect(roleManager.areFlankersInPosition(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)).toBe(false)
    })

    it('counts the majority of flankers being in position as good enough', () => {
      const flanker1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(25, 0, 25), CombatantState.ADVANCING, 'follower')
      const flanker2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(26, 0, 26), CombatantState.ADVANCING, 'follower')
      const flanker3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker1.destinationPoint = new THREE.Vector3(25, 0, 25)
      flanker2.destinationPoint = new THREE.Vector3(26, 0, 26)
      flanker3.destinationPoint = new THREE.Vector3(50, 0, 50)
      allCombatants.set('c2', flanker1)
      allCombatants.set('c3', flanker2)
      allCombatants.set('c4', flanker3)

      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2', 'c3', 'c4'])
      expect(roleManager.areFlankersInPosition(op, allCombatants)).toBe(true)
    })

    it('returns false when no flankers are alive', () => {
      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2'])
      expect(roleManager.areFlankersInPosition(op, allCombatants)).toBe(false)
    })
  })

  describe('abortFlank', () => {
    it('marks the operation aborted and resets participants to engaging', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.isFullAuto = true
      suppressor.suppressionTarget = new THREE.Vector3(50, 0, 0)
      suppressor.suppressionEndTime = Date.now() + 5000

      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.isFlankingMove = true
      flanker.destinationPoint = new THREE.Vector3(25, 0, 25)

      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(op, squad, allCombatants)

      expect(op.status).toBe(FlankingStatus.ABORTED)
      expect(suppressor.state).toBe(CombatantState.ENGAGING)
      expect(flanker.state).toBe(CombatantState.ENGAGING)
      expect(suppressor.isFullAuto).toBe(false)
      expect(flanker.isFlankingMove).toBe(false)
      expect(suppressor.suppressionTarget).toBeUndefined()
      expect(suppressor.suppressionEndTime).toBeUndefined()
      expect(flanker.destinationPoint).toBeUndefined()
    })

    it('skips dead or missing combatants without throwing', () => {
      const dead = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', dead)
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      expect(() => roleManager.abortFlank(op, squad, allCombatants)).not.toThrow()
      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('completeFlank', () => {
    it('clears isFlankingMove on all participants but preserves state', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      suppressor.isFlankingMove = true
      flanker.isFlankingMove = true
      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const op = createMockFlankingOperation('squad-1', ['c1'], ['c2'], new THREE.Vector3(50, 0, 0), FlankingStatus.COMPLETE)

      roleManager.completeFlank(op, squad, allCombatants)

      expect(suppressor.isFlankingMove).toBe(false)
      expect(flanker.isFlankingMove).toBe(false)
      expect(flanker.state).toBe(CombatantState.ENGAGING)
    })
  })

  describe('assignEngageBehavior', () => {
    it('puts all participants back into ENGAGING and clears suppression state', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.suppressionTarget = new THREE.Vector3(50, 0, 0)
      suppressor.suppressionEndTime = Date.now() + 5000

      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.isFlankingMove = true

      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      roleManager.assignEngageBehavior(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)

      expect(suppressor.state).toBe(CombatantState.ENGAGING)
      expect(flanker.state).toBe(CombatantState.ENGAGING)
      expect(suppressor.suppressionTarget).toBeUndefined()
      expect(suppressor.suppressionEndTime).toBeUndefined()
      expect(flanker.isFlankingMove).toBe(false)
    })

    it('skips dead combatants', () => {
      const dead = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', dead)

      roleManager.assignEngageBehavior(createMockFlankingOperation('squad-1', ['c1'], ['c2']), allCombatants)

      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('edge cases', () => {
    it('tolerates operations with empty role lists', () => {
      const op = createMockFlankingOperation('squad-1', [], ['c2'])
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      allCombatants.set('c2', flanker)

      expect(() => {
        roleManager.assignSuppressionBehavior(op, allCombatants)
        roleManager.assignFlankingBehavior(op, allCombatants)
        roleManager.assignEngageBehavior(op, allCombatants)
      }).not.toThrow()
    })
  })
})
