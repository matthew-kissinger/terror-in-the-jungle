import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIFlankingSystem, FlankingStatus, FlankingRole, FlankingOperation } from './AIFlankingSystem'
import { Combatant, CombatantState, Faction, Squad } from '../types'
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

// Mock dependencies
const mockChunkManager: ImprovedChunkManager = {
  getTerrainHeightAt: vi.fn(() => 0),
} as any

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  state: CombatantState = CombatantState.ENGAGING,
  squadId?: string,
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
    } as any,
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
    squadId,
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

describe('AIFlankingSystem', () => {
  let flankingSystem: AIFlankingSystem
  let allCombatants: Map<string, Combatant>

  beforeEach(() => {
    flankingSystem = new AIFlankingSystem()
    flankingSystem.setChunkManager(mockChunkManager)
    allCombatants = new Map()
    vi.clearAllMocks()
  })

  describe('Constructor and Initialization', () => {
    it('should initialize without errors', () => {
      const system = new AIFlankingSystem()
      expect(system).toBeDefined()
    })

    it('should accept chunk manager', () => {
      const system = new AIFlankingSystem()
      system.setChunkManager(mockChunkManager)
      expect(system).toBeDefined()
    })
  })

  describe('shouldInitiateFlank', () => {
    it('should return false when squad already has active operation', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      // Create an active operation
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return false when on cooldown', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      // Manually set cooldown
      flankingSystem['flankingCooldowns'].set('squad-1', Date.now())

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return false when squad too small', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return false when leader is dead', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return false when target too close', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(10, 0, 0) // Too close (<20m)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return false when target too far', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(100, 0, 0) // Too far (>80m)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(false)
    })

    it('should return true when squad has recent damage', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      // Recent hit
      member1.lastHitTime = Date.now() - 2000

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(true)
    })

    it('should return true when engagement is stalled', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      // Setup stalled engagement
      const now = Date.now()
      leader.lastShotTime = now - 1000
      leader.lastHitTime = now - 9000
      leader.target = {} as Combatant
      member1.lastShotTime = now - 1000
      member1.lastHitTime = now - 9000
      member1.target = {} as Combatant

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const result = flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      expect(result).toBe(true)
    })
  })

  describe('initiateFlank', () => {
    it('should return null when squad too small', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)
      expect(operation).toBeNull()
    })

    it('should create flanking operation with correct initial state', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        expect(operation.squadId).toBe('squad-1')
        expect(operation.status).toBe(FlankingStatus.PLANNING)
        expect(operation.suppressors.length).toBeGreaterThan(0)
        expect(operation.flankers.length).toBeGreaterThan(0)
        expect(operation.flankDirection).toMatch(/left|right/)
        expect(operation.casualtiesBeforeFlank).toBe(0)
        expect(operation.casualtiesDuringFlank).toBe(0)
      }
    })

    it('should assign leader to suppressors', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        expect(operation.suppressors).toContain('c1')
      }
    })

    it('should track casualties before flank', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3', 'c4'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const deadMember = createMockCombatant('c4', Faction.US, new THREE.Vector3(-4, 0, 0), CombatantState.DEAD, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)
      allCombatants.set('c4', deadMember)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        expect(operation.casualtiesBeforeFlank).toBe(1)
      }
    })

    it('should set cooldown when initiating flank', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const beforeTime = Date.now()
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)
      const afterTime = Date.now()

      const cooldown = flankingSystem['flankingCooldowns'].get('squad-1')
      expect(cooldown).toBeDefined()
      expect(cooldown).toBeGreaterThanOrEqual(beforeTime)
      expect(cooldown).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('updateFlankingOperation', () => {
    it('should abort operation on timeout', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        // Manually set start time to past timeout
        operation.startTime = Date.now() - 25000 // Past 20s timeout

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.ABORTED)
        expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
      }
    })

    it('should abort operation on excessive casualties', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3', 'c4', 'c5'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-4, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member4 = createMockCombatant('c5', Faction.US, new THREE.Vector3(-6, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)
      allCombatants.set('c4', member3)
      allCombatants.set('c5', member4)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        // Now kill members after initiation to simulate casualties during flank
        member3.state = CombatantState.DEAD
        member4.state = CombatantState.DEAD

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.ABORTED)
      }
    })

    it('should transition from PLANNING to SUPPRESSING', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        expect(operation.status).toBe(FlankingStatus.PLANNING)

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.SUPPRESSING)
      }
    })

    it('should transition from SUPPRESSING to FLANKING after duration', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.SUPPRESSING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        // Transition to SUPPRESSING
        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)
        expect(operation.status).toBe(FlankingStatus.SUPPRESSING)

        // Wait past suppression duration
        operation.lastStatusUpdate = Date.now() - 5000

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.FLANKING)
      }
    })

    it('should transition from FLANKING to ENGAGING when flankers in position', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.SUPPRESSING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.SUPPRESSING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(25, 0, 25), CombatantState.ADVANCING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        // Move to FLANKING state
        operation.status = FlankingStatus.FLANKING

        // Set flanker destination to current position (already at destination)
        member2.destinationPoint = member2.position.clone()

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.ENGAGING)
      }
    })

    it('should transition from ENGAGING to COMPLETE after duration', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        // Move to ENGAGING state
        operation.status = FlankingStatus.ENGAGING
        operation.lastStatusUpdate = Date.now() - 6000

        flankingSystem.updateFlankingOperation(operation, squad, allCombatants)

        expect(operation.status).toBe(FlankingStatus.COMPLETE)
        expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
      }
    })
  })

  describe('getCombatantFlankRole', () => {
    it('should return NONE when combatant has no role', () => {
      const result = flankingSystem.getCombatantFlankRole('c1')
      expect(result.role).toBe(FlankingRole.NONE)
      expect(result.operation).toBeUndefined()
    })

    it('should return SUPPRESSOR when combatant is suppressor', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        const result = flankingSystem.getCombatantFlankRole('c1')
        expect(result.role).toBe(FlankingRole.SUPPRESSOR)
        expect(result.operation).toBe(operation)
      }
    })

    it('should return FLANKER when combatant is flanker', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation && operation.flankers.length > 0) {
        const flankerId = operation.flankers[0]
        const result = flankingSystem.getCombatantFlankRole(flankerId)
        expect(result.role).toBe(FlankingRole.FLANKER)
        expect(result.operation).toBe(operation)
      }
    })
  })

  describe('hasActiveFlank', () => {
    it('should return false when no operation', () => {
      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
    })

    it('should return true when operation is active', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(true)
    })

    it('should return false when operation is complete', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        operation.status = FlankingStatus.COMPLETE
        expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
      }
    })

    it('should return false when operation is aborted', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(operation).toBeDefined()
      if (operation) {
        operation.status = FlankingStatus.ABORTED
        expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
      }
    })
  })

  describe('getActiveOperation', () => {
    it('should return undefined when no operation', () => {
      expect(flankingSystem.getActiveOperation('squad-1')).toBeUndefined()
    })

    it('should return operation when active', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      const retrieved = flankingSystem.getActiveOperation('squad-1')
      expect(retrieved).toBe(operation)
    })
  })

  describe('cleanupOperations', () => {
    it('should remove operation for missing squad', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      const squads = new Map<string, Squad>()
      // Don't add squad to map

      flankingSystem.cleanupOperations(squads, allCombatants)

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
    })

    it('should abort operation when too few members alive', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.DEAD, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.DEAD, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      // Kill members after initiation
      member1.state = CombatantState.DEAD
      member2.state = CombatantState.DEAD

      const squads = new Map<string, Squad>()
      squads.set('squad-1', squad)

      flankingSystem.cleanupOperations(squads, allCombatants)

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
    })

    it('should keep operation when enough members alive', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      const squads = new Map<string, Squad>()
      squads.set('squad-1', squad)

      flankingSystem.cleanupOperations(squads, allCombatants)

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(true)
    })
  })

  describe('dispose', () => {
    it('should clear all operations and cooldowns', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)
      flankingSystem.initiateFlank(squad, allCombatants, targetPos)

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(true)
      expect(flankingSystem['flankingCooldowns'].size).toBeGreaterThan(0)

      flankingSystem.dispose()

      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(false)
      expect(flankingSystem['flankingCooldowns'].size).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle squad with all members dead', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.DEAD, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.DEAD, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)
      expect(operation).toBeNull()
    })

    it('should handle squad with missing combatants', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')

      allCombatants.set('c1', leader)
      // c2 and c3 are missing

      const targetPos = new THREE.Vector3(50, 0, 0)

      const operation = flankingSystem.initiateFlank(squad, allCombatants, targetPos)
      expect(operation).toBeNull()
    })

    it('should handle target at same position as squad', () => {
      const squad = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      allCombatants.set('c1', leader)
      allCombatants.set('c2', member1)
      allCombatants.set('c3', member2)

      const targetPos = new THREE.Vector3(0, 0, 0) // Same as leader

      expect(() => {
        flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)
      }).not.toThrow()
    })

    it('should handle multiple concurrent operations', () => {
      const squad1 = createMockSquad('squad-1', Faction.US, ['c1', 'c2', 'c3'], 'c1')
      const squad2 = createMockSquad('squad-2', Faction.US, ['c4', 'c5', 'c6'], 'c4')

      const leader1 = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.ENGAGING, 'squad-1', 'leader')
      const member1a = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')
      const member1b = createMockCombatant('c3', Faction.US, new THREE.Vector3(-2, 0, 0), CombatantState.ENGAGING, 'squad-1', 'follower')

      const leader2 = createMockCombatant('c4', Faction.US, new THREE.Vector3(100, 0, 0), CombatantState.ENGAGING, 'squad-2', 'leader')
      const member2a = createMockCombatant('c5', Faction.US, new THREE.Vector3(102, 0, 0), CombatantState.ENGAGING, 'squad-2', 'follower')
      const member2b = createMockCombatant('c6', Faction.US, new THREE.Vector3(98, 0, 0), CombatantState.ENGAGING, 'squad-2', 'follower')

      allCombatants.set('c1', leader1)
      allCombatants.set('c2', member1a)
      allCombatants.set('c3', member1b)
      allCombatants.set('c4', leader2)
      allCombatants.set('c5', member2a)
      allCombatants.set('c6', member2b)

      const targetPos1 = new THREE.Vector3(50, 0, 0)
      const targetPos2 = new THREE.Vector3(150, 0, 0)

      const op1 = flankingSystem.initiateFlank(squad1, allCombatants, targetPos1)
      const op2 = flankingSystem.initiateFlank(squad2, allCombatants, targetPos2)

      expect(op1).toBeDefined()
      expect(op2).toBeDefined()
      expect(flankingSystem.hasActiveFlank('squad-1')).toBe(true)
      expect(flankingSystem.hasActiveFlank('squad-2')).toBe(true)
    })
  })
})
