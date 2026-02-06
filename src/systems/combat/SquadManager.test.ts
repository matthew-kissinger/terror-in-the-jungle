import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SquadManager } from './SquadManager'
import { Combatant, CombatantState, Faction, Squad } from './types'
import { CombatantFactory } from './CombatantFactory'
import { ImprovedChunkManager } from '../world/ImprovedChunkManager'
import { InfluenceMapSystem } from './ai/InfluenceMapSystem'

// Mock Three.js Vector3
vi.mock('three', () => ({
  Vector3: vi.fn().mockImplementation(function (this: any, x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
    this.set = vi.fn(function (this: any, x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
      return this
    })
    this.copy = vi.fn(function (this: any, v: any) {
      this.x = v.x
      this.y = v.y
      this.z = v.z
      return this
    })
    this.clone = vi.fn(function (this: any) {
      const THREE = require('three')
      return new THREE.Vector3(this.x, this.y, this.z)
    })
    this.add = vi.fn(function (this: any, v: any) {
      this.x += v.x
      this.y += v.y
      this.z += v.z
      return this
    })
    this.distanceTo = vi.fn(function (this: any, v: any) {
      const dx = this.x - v.x
      const dy = this.y - v.y
      const dz = this.z - v.z
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    })
    return this
  }),
  MathUtils: {
    smoothstep: vi.fn((x: number, min: number, max: number) => {
      if (x <= min) return 0
      if (x >= max) return 1
      x = (x - min) / (max - min)
      return x * x * (3 - 2 * x)
    }),
  },
}))

// Mock HeightQueryCache
vi.mock('../world/HeightQueryCache', () => ({
  getHeightQueryCache: vi.fn(() => ({
    getHeightAt: vi.fn((x: number, z: number) => 0),
  })),
}))

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Helper to create mock combatant
function createMockCombatant(overrides: Partial<Combatant> = {}): Combatant {
  const THREE = require('three')
  return {
    id: 'c1',
    faction: Faction.US,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.PATROLLING,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
    ...overrides,
  } as Combatant
}

describe('SquadManager', () => {
  let squadManager: SquadManager
  let mockFactory: CombatantFactory
  let mockChunkManager: ImprovedChunkManager
  let mockInfluenceMap: InfluenceMapSystem
  const THREE = require('three')

  beforeEach(() => {
    vi.clearAllMocks()

    mockFactory = {
      createCombatant: vi.fn((faction, position, options) =>
        createMockCombatant({
          id: `combatant-${Math.random()}`,
          faction,
          position: position.clone(),
          squadId: options?.squadId,
          squadRole: options?.squadRole,
        })
      ),
    } as unknown as CombatantFactory

    mockChunkManager = {} as ImprovedChunkManager
    mockInfluenceMap = {
      findBestZoneTarget: vi.fn(() => null),
      findBestPositionNear: vi.fn(() => null),
    } as unknown as InfluenceMapSystem

    squadManager = new SquadManager(mockFactory, mockChunkManager)
  })

  describe('constructor', () => {
    it('should create instance with factory', () => {
      expect(squadManager).toBeDefined()
    })

    it('should create instance with factory and chunk manager', () => {
      const manager = new SquadManager(mockFactory, mockChunkManager)
      expect(manager).toBeDefined()
    })

    it('should initialize empty squads map', () => {
      expect(squadManager.getAllSquads().size).toBe(0)
    })
  })

  describe('createSquad', () => {
    it('should create squad with correct faction', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      expect(squad.faction).toBe(Faction.US)
    })

    it('should create squad with correct number of members', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)

      expect(squad.members.length).toBe(4)
      expect(members.length).toBe(4)
    })

    it('should assign unique squad ID', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad: squad1 } = squadManager.createSquad(Faction.US, position, 2)
      const { squad: squad2 } = squadManager.createSquad(Faction.US, position, 2)

      expect(squad1.id).not.toBe(squad2.id)
    })

    it('should set first member as leader', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)

      expect(squad.leaderId).toBe(members[0].id)
      expect(members[0].squadRole).toBe('leader')
    })

    it('should set remaining members as followers', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { members } = squadManager.createSquad(Faction.US, position, 4)

      expect(members[1].squadRole).toBe('follower')
      expect(members[2].squadRole).toBe('follower')
      expect(members[3].squadRole).toBe('follower')
    })

    it('should set default formation to wedge', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      expect(squad.formation).toBe('wedge')
    })

    it('should assign squadId to all members', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)

      members.forEach(member => {
        expect(member.squadId).toBe(squad.id)
      })
    })

    it('should store squad in squads map', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      expect(squadManager.getSquad(squad.id)).toBe(squad)
    })

    it('should create OPFOR squads', () => {
      const position = new THREE.Vector3(-10, 0, -10)
      const { squad } = squadManager.createSquad(Faction.OPFOR, position, 3)

      expect(squad.faction).toBe(Faction.OPFOR)
      expect(squad.members.length).toBe(3)
    })

    it('should create single-member squad', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 1)

      expect(squad.members.length).toBe(1)
      expect(members.length).toBe(1)
      expect(members[0].squadRole).toBe('leader')
    })

    it('should create large squad', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 12)

      expect(squad.members.length).toBe(12)
      expect(members.length).toBe(12)
    })

    it('should position leader at center', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { members } = squadManager.createSquad(Faction.US, position, 4)

      // Leader should be at or near center (with terrain height adjustment)
      expect(members[0].position.x).toBeCloseTo(10, 0)
      expect(members[0].position.z).toBeCloseTo(10, 0)
    })

    it('should position followers in formation', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { members } = squadManager.createSquad(Faction.US, position, 4)

      // Followers should be offset from center
      expect(members[1].position.x).not.toBe(0)
      expect(members[2].position.x).not.toBe(0)
      expect(members[3].position.x).not.toBe(0)
    })

    it('should call factory for each member', () => {
      const position = new THREE.Vector3(10, 0, 10)
      squadManager.createSquad(Faction.US, position, 4)

      expect(mockFactory.createCombatant).toHaveBeenCalledTimes(4)
    })

    it('should increment squad ID counter', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad: squad1 } = squadManager.createSquad(Faction.US, position, 2)
      const { squad: squad2 } = squadManager.createSquad(Faction.US, position, 2)

      expect(squad1.id).toContain('squad_US_0')
      expect(squad2.id).toContain('squad_US_1')
    })
  })

  describe('removeSquadMember', () => {
    it('should remove member from squad', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)

      squadManager.removeSquadMember(squad.id, members[1].id)

      expect(squad.members.length).toBe(3)
      expect(squad.members).not.toContain(members[1].id)
    })

    it('should delete squad when last member removed', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 1)

      squadManager.removeSquadMember(squad.id, members[0].id)

      expect(squadManager.getSquad(squad.id)).toBeUndefined()
    })

    it('should promote new leader when leader removed', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const originalLeader = members[0].id

      squadManager.removeSquadMember(squad.id, originalLeader)

      expect(squad.leaderId).toBe(members[1].id)
      expect(squad.leaderId).not.toBe(originalLeader)
    })

    it('should handle removing non-existent member', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      expect(() => {
        squadManager.removeSquadMember(squad.id, 'non-existent-id')
      }).not.toThrow()
    })

    it('should handle removing from non-existent squad', () => {
      expect(() => {
        squadManager.removeSquadMember('non-existent-squad', 'member-id')
      }).not.toThrow()
    })

    it('should not promote leader if non-leader removed', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const originalLeader = squad.leaderId

      squadManager.removeSquadMember(squad.id, members[2].id)

      expect(squad.leaderId).toBe(originalLeader)
    })

    it('should handle removing multiple members sequentially', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)

      squadManager.removeSquadMember(squad.id, members[1].id)
      squadManager.removeSquadMember(squad.id, members[2].id)

      expect(squad.members.length).toBe(2)
    })

    it('should delete squad after removing all members one by one', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 3)

      squadManager.removeSquadMember(squad.id, members[0].id)
      squadManager.removeSquadMember(squad.id, members[1].id)
      squadManager.removeSquadMember(squad.id, members[2].id)

      expect(squadManager.getSquad(squad.id)).toBeUndefined()
    })
  })

  describe('getSquad', () => {
    it('should return squad by ID', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const retrieved = squadManager.getSquad(squad.id)

      expect(retrieved).toBe(squad)
    })

    it('should return undefined for non-existent squad', () => {
      const retrieved = squadManager.getSquad('non-existent-id')

      expect(retrieved).toBeUndefined()
    })
  })

  describe('getAllSquads', () => {
    it('should return empty map initially', () => {
      const squads = squadManager.getAllSquads()

      expect(squads.size).toBe(0)
    })

    it('should return all created squads', () => {
      const position = new THREE.Vector3(0, 0, 0)
      squadManager.createSquad(Faction.US, position, 4)
      squadManager.createSquad(Faction.OPFOR, position, 3)

      const squads = squadManager.getAllSquads()

      expect(squads.size).toBe(2)
    })

    it('should reflect squad removals', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 1)

      squadManager.removeSquadMember(squad.id, members[0].id)

      const squads = squadManager.getAllSquads()
      expect(squads.size).toBe(0)
    })
  })

  describe('setChunkManager', () => {
    it('should store chunk manager reference', () => {
      const manager = new SquadManager(mockFactory)
      manager.setChunkManager(mockChunkManager)

      expect(manager).toBeDefined()
    })
  })

  describe('setInfluenceMap', () => {
    it('should store influence map reference', () => {
      squadManager.setInfluenceMap(mockInfluenceMap)

      expect(squadManager).toBeDefined()
    })
  })

  describe('assignSquadObjective', () => {
    it('should assign objective from influence map', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const mockZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.OPFOR,
        isHomeBase: false,
      }

      vi.mocked(mockInfluenceMap.findBestZoneTarget).mockReturnValue(mockZone)
      squadManager.setInfluenceMap(mockInfluenceMap)

      const result = squadManager.assignSquadObjective(squad, position, [mockZone])

      expect(result).toBe(mockZone)
      expect(squad.objective).toBeDefined()
    })

    it('should fallback to random zone without influence map', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const mockZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.OPFOR,
        isHomeBase: false,
      }

      const result = squadManager.assignSquadObjective(squad, position, [mockZone])

      expect(result).toBe(mockZone)
    })

    it('should return null if no valid zones', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const result = squadManager.assignSquadObjective(squad, position, [])

      expect(result).toBeNull()
    })

    it('should skip home base zones in fallback', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const homeBase = {
        id: 'hq',
        name: 'HQ',
        position: new THREE.Vector3(0, 0, 0),
        radius: 50,
        owner: Faction.US,
        isHomeBase: true,
      }

      const result = squadManager.assignSquadObjective(squad, position, [homeBase])

      expect(result).toBeNull()
    })

    it('should skip zones owned by same faction in fallback', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)

      const ownedZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.US,
        isHomeBase: false,
      }

      const result = squadManager.assignSquadObjective(squad, position, [ownedZone])

      expect(result).toBeNull()
    })
  })

  describe('findBestApproachPosition', () => {
    it('should return position from influence map', () => {
      const currentPos = new THREE.Vector3(0, 0, 0)
      const targetPos = new THREE.Vector3(50, 0, 50)
      const bestPos = new THREE.Vector3(40, 0, 45)

      vi.mocked(mockInfluenceMap.findBestPositionNear).mockReturnValue(bestPos)
      squadManager.setInfluenceMap(mockInfluenceMap)

      const result = squadManager.findBestApproachPosition(
        currentPos,
        targetPos,
        Faction.US,
        50
      )

      expect(result).toBe(bestPos)
      expect(mockInfluenceMap.findBestPositionNear).toHaveBeenCalledWith(targetPos, 50, Faction.US)
    })

    it('should return null without influence map', () => {
      const currentPos = new THREE.Vector3(0, 0, 0)
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.findBestApproachPosition(
        currentPos,
        targetPos,
        Faction.US,
        50
      )

      expect(result).toBeNull()
    })

    it('should use default search radius', () => {
      const currentPos = new THREE.Vector3(0, 0, 0)
      const targetPos = new THREE.Vector3(50, 0, 50)

      vi.mocked(mockInfluenceMap.findBestPositionNear).mockReturnValue(null)
      squadManager.setInfluenceMap(mockInfluenceMap)

      squadManager.findBestApproachPosition(currentPos, targetPos, Faction.US)

      expect(mockInfluenceMap.findBestPositionNear).toHaveBeenCalledWith(targetPos, 50, Faction.US)
    })
  })

  describe('assignSuppressionRoles', () => {
    it('should return empty arrays for small squads', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 2)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.suppressors.length).toBe(0)
      expect(result.flankers.length).toBe(0)
    })

    it('should assign leader as suppressor', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.suppressors).toContain(members[0])
    })

    it('should assign first follower as suppressor', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.suppressors).toContain(members[1])
    })

    it('should assign remaining members as flankers', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.flankers).toContain(members[2])
      expect(result.flankers).toContain(members[3])
    })

    it('should set destination points for flankers', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 4)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(members[2].destinationPoint).toBeDefined()
      expect(members[3].destinationPoint).toBeDefined()
    })

    it('should handle missing combatants gracefully', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad } = squadManager.createSquad(Faction.US, position, 4)
      const combatants = new Map()
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.suppressors.length).toBe(0)
      expect(result.flankers.length).toBe(0)
    })

    it('should work with exactly 3 members', () => {
      const position = new THREE.Vector3(0, 0, 0)
      const { squad, members } = squadManager.createSquad(Faction.US, position, 3)
      const combatants = new Map(members.map(m => [m.id, m]))
      const targetPos = new THREE.Vector3(50, 0, 50)

      const result = squadManager.assignSuppressionRoles(squad, targetPos, combatants)

      expect(result.suppressors.length).toBe(2)
      expect(result.flankers.length).toBe(1)
    })
  })

  describe('dispose', () => {
    it('should clear all squads', () => {
      const position = new THREE.Vector3(0, 0, 0)
      squadManager.createSquad(Faction.US, position, 4)
      squadManager.createSquad(Faction.OPFOR, position, 3)

      squadManager.dispose()

      expect(squadManager.getAllSquads().size).toBe(0)
    })

    it('should handle dispose on empty manager', () => {
      expect(() => {
        squadManager.dispose()
      }).not.toThrow()
    })
  })
})
