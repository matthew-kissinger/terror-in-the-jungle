import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { FlankingRoleManager } from './FlankingRoleManager'
import { Combatant, CombatantState, Faction, Squad } from '../types'
import { FlankingOperation, FlankingStatus } from './AIFlankingSystem'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'

// Mock HeightQueryCache
vi.mock('../../terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: vi.fn((x: number, z: number) => 0),
  }),
}))

// Mock ObjectPoolManager
vi.mock('../../../utils/ObjectPoolManager', () => ({
  objectPool: {
    getVector3: vi.fn(() => new THREE.Vector3()),
    releaseVector3: vi.fn(),
  },
}))

// Mock Logger
vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Helper to create a mock combatant
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
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant
}

// Helper to create a mock squad
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

// Helper to create a mock flanking operation
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
  let mockChunkManager: ImprovedChunkManager

  beforeEach(() => {
    roleManager = new FlankingRoleManager()
    allCombatants = new Map()
    mockChunkManager = {
      getTerrainHeightAt: vi.fn(() => 0),
    } as any
    vi.clearAllMocks()
  })

  describe('Constructor and Initialization', () => {
    it('should initialize without errors', () => {
      const manager = new FlankingRoleManager()
      expect(manager).toBeDefined()
    })

    it('should accept chunk manager', () => {
      const manager = new FlankingRoleManager()
      manager.setChunkManager(mockChunkManager)
      expect(manager).toBeDefined()
    })
  })

  describe('assignFlankingRoles', () => {
    it('should assign leader to suppressors', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2])

      expect(result).toBeDefined()
      expect(result?.suppressors).toContain('c1')
    })

    it('should assign first member (index 1) to suppressors', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2])

      expect(result).toBeDefined()
      expect(result?.suppressors).toContain('c2')
    })

    it('should assign remaining members to flankers', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2])

      expect(result).toBeDefined()
      expect(result?.flankers).toContain('c3')
    })

    it('should return null when no flankers can be assigned', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')

      const result = roleManager.assignFlankingRoles([leader])

      expect(result).toBeNull()
    })

    it('should rebalance when only flankers exist', () => {
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([member1, member2])

      expect(result).toBeDefined()
      if (result) {
        expect(result.suppressors.length).toBe(1)
        expect(result.flankers.length).toBe(1)
      }
    })

    it('should rebalance when only suppressors exist', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1])

      expect(result).toBeDefined()
      if (result) {
        expect(result.suppressors.length).toBe(1)
        expect(result.flankers.length).toBe(1)
      }
    })

    it('should return null when single combatant cannot be split', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')

      const result = roleManager.assignFlankingRoles([leader])

      expect(result).toBeNull()
    })

    it('should handle empty array', () => {
      const result = roleManager.assignFlankingRoles([])

      expect(result).toBeNull()
    })

    it('should assign roles with 4 combatants', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'follower')
      const member3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-4, 0, 0), CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2, member3])

      expect(result).toBeDefined()
      if (result) {
        expect(result.suppressors.length).toBe(2) // Leader + index 1
        expect(result.flankers.length).toBe(2)
      }
    })
  })

  describe('assignSuppressionBehavior', () => {
    it('should set combatant state to SUPPRESSING', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.state).toBe(CombatantState.SUPPRESSING)
    })

    it('should set suppression target', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], targetPos)

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.suppressionTarget).toBeDefined()
      expect(leader.suppressionTarget?.distanceTo(targetPos)).toBeLessThan(0.1)
    })

    it('should reuse existing suppressionTarget vector', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const existingTarget = new THREE.Vector3(10, 0, 10)
      leader.suppressionTarget = existingTarget
      allCombatants.set('c1', leader)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], targetPos)

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.suppressionTarget).toBe(existingTarget) // Same object reference
      expect(leader.suppressionTarget?.distanceTo(targetPos)).toBeLessThan(0.1)
    })

    it('should set suppressionEndTime', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const beforeTime = Date.now()
      roleManager.assignSuppressionBehavior(operation, allCombatants)
      const afterTime = Date.now()

      expect(leader.suppressionEndTime).toBeDefined()
      expect(leader.suppressionEndTime).toBeGreaterThan(beforeTime + 4000) // SUPPRESSION_DURATION_MS + 2000
      expect(leader.suppressionEndTime).toBeLessThan(afterTime + 7000)
    })

    it('should enable full auto', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.isFullAuto).toBe(true)
    })

    it('should set burst parameters', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.skillProfile.burstLength).toBe(8)
      expect(leader.skillProfile.burstPauseMs).toBe(150)
    })

    it('should set alert timer to 10', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.alertTimer).toBe(10)
    })

    it('should face target', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', leader)

      const targetPos = new THREE.Vector3(10, 0, 10)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], targetPos)

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      const expectedRotation = Math.atan2(10, 10)
      expect(leader.rotation).toBeCloseTo(expectedRotation, 5)
    })

    it('should skip missing combatants', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1', 'c2'], ['c3'])

      // Don't add any combatants to map
      expect(() => {
        roleManager.assignSuppressionBehavior(operation, allCombatants)
      }).not.toThrow()
    })

    it('should skip dead combatants', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', leader)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      // Should not change state of dead combatant
      expect(leader.state).toBe(CombatantState.DEAD)
    })

    it('should handle multiple suppressors', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const member = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c1', leader)
      allCombatants.set('c2', member)

      const operation = createMockFlankingOperation('squad-1', ['c1', 'c2'], ['c3'])

      roleManager.assignSuppressionBehavior(operation, allCombatants)

      expect(leader.state).toBe(CombatantState.SUPPRESSING)
      expect(member.state).toBe(CombatantState.SUPPRESSING)
    })
  })

  describe('assignFlankingBehavior', () => {
    it('should set combatant state to ADVANCING', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.state).toBe(CombatantState.ADVANCING)
    })

    it('should set destinationPoint', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.destinationPoint).toBeDefined()
    })

    it('should set isFlankingMove flag', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.isFlankingMove).toBe(true)
    })

    it('should spread flankers with offset angles', () => {
      const flanker1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      const flanker2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker1)
      allCombatants.set('c3', flanker2)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2', 'c3'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      // Destinations should be different due to spread
      expect(flanker1.destinationPoint?.distanceTo(flanker2.destinationPoint!)).toBeGreaterThan(0.1)
    })

    it('should skip missing combatants', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2', 'c3'])

      // Don't add any combatants
      expect(() => {
        roleManager.assignFlankingBehavior(operation, allCombatants)
      }).not.toThrow()
    })

    it('should skip dead combatants', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'follower')
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.state).toBe(CombatantState.DEAD)
    })

    it('should reuse existing destinationPoint vector', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      const existingDest = new THREE.Vector3(10, 0, 10)
      flanker.destinationPoint = existingDest
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.destinationPoint).toBe(existingDest) // Same object reference
    })

    it('should set height from chunk manager when available', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      roleManager.setChunkManager(mockChunkManager)
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignFlankingBehavior(operation, allCombatants)

      expect(flanker.destinationPoint?.y).toBe(0)
    })
  })

  describe('areFlankersInPosition', () => {
    it('should return true when all flankers are in position', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(25, 0, 25), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(25, 0, 25) // Same position
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(true)
    })

    it('should return false when flankers are far from destination', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(50, 0, 50) // 70+ units away
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(false)
    })

    it('should return true when 60% of flankers are in position', () => {
      const flanker1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(25, 0, 25), CombatantState.ADVANCING, 'follower')
      const flanker2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(26, 0, 26), CombatantState.ADVANCING, 'follower')
      const flanker3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker1.destinationPoint = new THREE.Vector3(25, 0, 25) // Close
      flanker2.destinationPoint = new THREE.Vector3(26, 0, 26) // Close
      flanker3.destinationPoint = new THREE.Vector3(50, 0, 50) // Far
      allCombatants.set('c2', flanker1)
      allCombatants.set('c3', flanker2)
      allCombatants.set('c4', flanker3)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2', 'c3', 'c4'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(true) // 2/3 = 66.7% >= 60%
    })

    it('should skip missing combatants', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(false) // No flankers found
    })

    it('should skip dead combatants', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'follower')
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(false)
    })

    it('should count flanker as in position when no destinationPoint', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = undefined
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(true)
    })

    it('should return false when no flankers are alive', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(false)
    })

    it('should use 5 unit distance threshold', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(4.9, 0, 0) // Just under 5 units
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      const result = roleManager.areFlankersInPosition(operation, allCombatants)

      expect(result).toBe(true)
    })
  })

  describe('abortFlank', () => {
    it('should set operation status to ABORTED', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(operation.status).toBe(FlankingStatus.ABORTED)
    })

    it('should reset all participants to ENGAGING', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(suppressor.state).toBe(CombatantState.ENGAGING)
      expect(flanker.state).toBe(CombatantState.ENGAGING)
    })

    it('should clear isFullAuto flag', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.isFullAuto = true
      allCombatants.set('c1', suppressor)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(suppressor.isFullAuto).toBe(false)
    })

    it('should clear isFlankingMove flag', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.isFlankingMove = true
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(flanker.isFlankingMove).toBe(false)
    })

    it('should clear suppressionTarget', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.suppressionTarget = new THREE.Vector3(50, 0, 0)
      allCombatants.set('c1', suppressor)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(suppressor.suppressionTarget).toBeUndefined()
    })

    it('should clear suppressionEndTime', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.suppressionEndTime = Date.now() + 5000
      allCombatants.set('c1', suppressor)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(suppressor.suppressionEndTime).toBeUndefined()
    })

    it('should clear destinationPoint', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.destinationPoint = new THREE.Vector3(25, 0, 25)
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(flanker.destinationPoint).toBeUndefined()
    })

    it('should skip missing combatants', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      expect(() => {
        roleManager.abortFlank(operation, squad, allCombatants)
      }).not.toThrow()
    })

    it('should skip dead combatants', () => {
      const dead = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', dead)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.abortFlank(operation, squad, allCombatants)

      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('completeFlank', () => {
    it('should clear isFlankingMove flag', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      flanker.isFlankingMove = true
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], new THREE.Vector3(50, 0, 0), FlankingStatus.COMPLETE)

      roleManager.completeFlank(operation, squad, allCombatants)

      expect(flanker.isFlankingMove).toBe(false)
    })

    it('should process all participants', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      suppressor.isFlankingMove = true
      flanker.isFlankingMove = true
      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], new THREE.Vector3(50, 0, 0), FlankingStatus.COMPLETE)

      roleManager.completeFlank(operation, squad, allCombatants)

      expect(suppressor.isFlankingMove).toBe(false)
      expect(flanker.isFlankingMove).toBe(false)
    })

    it('should skip missing combatants', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], new THREE.Vector3(50, 0, 0), FlankingStatus.COMPLETE)

      expect(() => {
        roleManager.completeFlank(operation, squad, allCombatants)
      }).not.toThrow()
    })

    it('should not modify combatant state', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'follower')
      allCombatants.set('c2', flanker)

      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'], new THREE.Vector3(50, 0, 0), FlankingStatus.COMPLETE)

      roleManager.completeFlank(operation, squad, allCombatants)

      expect(flanker.state).toBe(CombatantState.ENGAGING)
    })
  })

  describe('assignEngageBehavior', () => {
    it('should set all participants to ENGAGING state', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      allCombatants.set('c1', suppressor)
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(suppressor.state).toBe(CombatantState.ENGAGING)
      expect(flanker.state).toBe(CombatantState.ENGAGING)
    })

    it('should enable full auto', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      allCombatants.set('c1', combatant)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(combatant.isFullAuto).toBe(true)
    })

    it('should set burst parameters', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      allCombatants.set('c1', combatant)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(combatant.skillProfile.burstLength).toBe(6)
      expect(combatant.skillProfile.burstPauseMs).toBe(200)
    })

    it('should clear isFlankingMove flag', () => {
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      flanker.isFlankingMove = true
      allCombatants.set('c2', flanker)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(flanker.isFlankingMove).toBe(false)
    })

    it('should clear suppressionTarget', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.suppressionTarget = new THREE.Vector3(50, 0, 0)
      allCombatants.set('c1', suppressor)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(suppressor.suppressionTarget).toBeUndefined()
    })

    it('should clear suppressionEndTime', () => {
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'leader')
      suppressor.suppressionEndTime = Date.now() + 5000
      allCombatants.set('c1', suppressor)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(suppressor.suppressionEndTime).toBeUndefined()
    })

    it('should skip missing combatants', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      expect(() => {
        roleManager.assignEngageBehavior(operation, allCombatants)
      }).not.toThrow()
    })

    it('should skip dead combatants', () => {
      const dead = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'leader')
      allCombatants.set('c1', dead)

      const operation = createMockFlankingOperation('squad-1', ['c1'], ['c2'])

      roleManager.assignEngageBehavior(operation, allCombatants)

      expect(dead.state).toBe(CombatantState.DEAD)
    })
  })

  describe('Edge Cases', () => {
    it('should handle all combatants at same position', () => {
      const pos = new THREE.Vector3(10, 0, 10)
      const leader = createMockCombatant('c1', Faction.US, pos, CombatantState.ENGAGING, 'leader')
      const member1 = createMockCombatant('c2', Faction.US, pos, CombatantState.ENGAGING, 'follower')
      const member2 = createMockCombatant('c3', Faction.US, pos, CombatantState.ENGAGING, 'follower')

      const result = roleManager.assignFlankingRoles([leader, member1, member2])

      expect(result).toBeDefined()
    })

    it('should handle large squad', () => {
      const members: Combatant[] = []
      for (let i = 0; i < 10; i++) {
        members.push(createMockCombatant(`c${i}`, Faction.US, new THREE.Vector3(i, 0, 0), CombatantState.ENGAGING, i === 0 ? 'leader' : 'follower'))
      }

      const result = roleManager.assignFlankingRoles(members)

      expect(result).toBeDefined()
      if (result) {
        expect(result.suppressors.length).toBe(2) // Leader + index 1
        expect(result.flankers.length).toBe(8)
      }
    })

    it('should handle operation with empty suppressor list', () => {
      const operation = createMockFlankingOperation('squad-1', [], ['c2'])
      const flanker = createMockCombatant('c2', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ADVANCING, 'follower')
      allCombatants.set('c2', flanker)

      expect(() => {
        roleManager.assignSuppressionBehavior(operation, allCombatants)
        roleManager.assignFlankingBehavior(operation, allCombatants)
        roleManager.assignEngageBehavior(operation, allCombatants)
      }).not.toThrow()
    })

    it('should handle operation with empty flanker list', () => {
      const operation = createMockFlankingOperation('squad-1', ['c1'], [])
      const suppressor = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'leader')
      allCombatants.set('c1', suppressor)

      expect(() => {
        roleManager.assignSuppressionBehavior(operation, allCombatants)
        roleManager.assignFlankingBehavior(operation, allCombatants)
      }).not.toThrow()

      const result = roleManager.areFlankersInPosition(operation, allCombatants)
      expect(result).toBe(false)
    })
  })
})
