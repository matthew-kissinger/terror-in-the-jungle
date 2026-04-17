import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SquadManager } from './SquadManager'
import { Combatant, CombatantState, Faction } from './types'
import { CombatantFactory } from './CombatantFactory'
import { InfluenceMapSystem } from './InfluenceMapSystem'
import type { ITerrainRuntime } from '../../types/SystemInterfaces'

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

vi.mock('../world/HeightQueryCache', () => ({
  getHeightQueryCache: vi.fn(() => ({
    getHeightAt: vi.fn((_x: number, _z: number) => 0),
  })),
}))

vi.mock('../../utils/Logger', () => ({
  Logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

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
  let mockTerrainSystem: ITerrainRuntime
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

    mockTerrainSystem = {
      getHeightAt: vi.fn(() => 0),
      getEffectiveHeightAt: vi.fn(() => 0),
      getPlayableWorldSize: vi.fn(() => 2000),
      getWorldSize: vi.fn(() => 2000),
      isTerrainReady: vi.fn(() => true),
      hasTerrainAt: vi.fn(() => true),
      getActiveTerrainTileCount: vi.fn(() => 0),
      setSurfaceWetness: vi.fn(() => {}),
      updatePlayerPosition: vi.fn(),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
      raycastTerrain: vi.fn(() => ({ hit: false })),
    }
    mockInfluenceMap = {
      findBestZoneTarget: vi.fn(() => null),
      findBestPositionNear: vi.fn(() => null),
    } as unknown as InfluenceMapSystem

    squadManager = new SquadManager(mockFactory, mockTerrainSystem)
  })

  describe('createSquad', () => {
    it('creates a squad with the requested faction, size, and unique id per call', () => {
      const position = new THREE.Vector3(10, 0, 10)
      const { squad: squad1, members } = squadManager.createSquad(Faction.US, position, 4)
      const { squad: squad2 } = squadManager.createSquad(Faction.US, position, 2)

      expect(squad1.faction).toBe(Faction.US)
      expect(squad1.members.length).toBe(4)
      expect(members.length).toBe(4)
      expect(squad1.id).not.toBe(squad2.id)
    })

    it('promotes the first member to leader and marks the rest as followers, all tagged with the squad id', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(10, 0, 10), 4)

      expect(squad.leaderId).toBe(members[0].id)
      expect(members[0].squadRole).toBe('leader')
      for (let i = 1; i < members.length; i++) {
        expect(members[i].squadRole).toBe('follower')
      }
      members.forEach(m => expect(m.squadId).toBe(squad.id))
    })

    it('stores the squad in the lookup and returns it via getSquad', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      expect(squadManager.getSquad(squad.id)).toBe(squad)
    })

    it('positions followers away from the leader anchor', () => {
      const { members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)

      // Leader at ~origin; every follower offset from it.
      expect(members[1].position.x !== 0 || members[1].position.z !== 0).toBe(true)
      expect(members[2].position.x !== 0 || members[2].position.z !== 0).toBe(true)
      expect(members[3].position.x !== 0 || members[3].position.z !== 0).toBe(true)
    })

    it('calls the combatant factory once per member', () => {
      squadManager.createSquad(Faction.US, new THREE.Vector3(10, 0, 10), 4)
      expect(mockFactory.createCombatant).toHaveBeenCalledTimes(4)
    })

    it('moves the squad anchor out of a narrow cliff band when a safer nearby point exists', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockImplementation(
        (x: number) => (x >= 8 && x <= 12 ? 12 : 0),
      )

      const { members } = squadManager.createSquad(Faction.US, new THREE.Vector3(10, 0, 0), 4)
      expect(Math.abs(members[0].position.x - 10)).toBeGreaterThanOrEqual(4)
      vi.restoreAllMocks()
    })

    it('pulls followers inward when the formation edge drops away sharply', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockImplementation((x: number) => (x >= 3.5 ? 10 : 0))

      const { members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      expect(members[3].position.x).toBeLessThan(3.5)
      vi.restoreAllMocks()
    })
  })

  describe('removeSquadMember', () => {
    it('removes a follower without promoting a new leader', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const originalLeader = squad.leaderId

      squadManager.removeSquadMember(squad.id, members[2].id)

      expect(squad.members.length).toBe(3)
      expect(squad.members).not.toContain(members[2].id)
      expect(squad.leaderId).toBe(originalLeader)
    })

    it('promotes a new leader when the current leader is removed', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const originalLeader = members[0].id

      squadManager.removeSquadMember(squad.id, originalLeader)

      expect(squad.leaderId).toBe(members[1].id)
      expect(squad.leaderId).not.toBe(originalLeader)
    })

    it('deletes the squad entirely when the last member is removed', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 1)
      squadManager.removeSquadMember(squad.id, members[0].id)
      expect(squadManager.getSquad(squad.id)).toBeUndefined()
    })

    it('is a no-op for unknown squad / member ids', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      expect(() => {
        squadManager.removeSquadMember(squad.id, 'non-existent-id')
        squadManager.removeSquadMember('non-existent-squad', 'member-id')
      }).not.toThrow()
    })
  })

  describe('getAllSquads', () => {
    it('returns every created squad until it is removed', () => {
      const position = new THREE.Vector3(0, 0, 0)
      squadManager.createSquad(Faction.US, position, 4)
      squadManager.createSquad(Faction.NVA, position, 3)
      expect(squadManager.getAllSquads().size).toBe(2)

      const { squad, members } = squadManager.createSquad(Faction.US, position, 1)
      squadManager.removeSquadMember(squad.id, members[0].id)
      expect(squadManager.getAllSquads().size).toBe(2)
    })
  })

  describe('assignSquadObjective', () => {
    it('returns the influence-map pick when one is available', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const zone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.NVA,
        isHomeBase: false,
      }
      vi.mocked(mockInfluenceMap.findBestZoneTarget).mockReturnValue(zone)
      squadManager.setInfluenceMap(mockInfluenceMap)

      const result = squadManager.assignSquadObjective(squad, new THREE.Vector3(0, 0, 0), [zone])
      expect(result).toBe(zone)
      expect(squad.objective).toBeDefined()
    })

    it('returns null when no enemy/neutral zones are viable', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)

      // Only home base: must be skipped
      const homeBase = {
        id: 'hq',
        name: 'HQ',
        position: new THREE.Vector3(0, 0, 0),
        radius: 50,
        owner: Faction.US,
        isHomeBase: true,
      }
      // Owned by same faction: must be skipped
      const ownedZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.US,
        isHomeBase: false,
      }

      expect(squadManager.assignSquadObjective(squad, new THREE.Vector3(0, 0, 0), [])).toBeNull()
      expect(squadManager.assignSquadObjective(squad, new THREE.Vector3(0, 0, 0), [homeBase])).toBeNull()
      expect(squadManager.assignSquadObjective(squad, new THREE.Vector3(0, 0, 0), [ownedZone])).toBeNull()
    })

    it('falls back to a valid zone even without an influence map', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const zone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(50, 0, 50),
        radius: 30,
        owner: Faction.NVA,
        isHomeBase: false,
      }
      expect(squadManager.assignSquadObjective(squad, new THREE.Vector3(0, 0, 0), [zone])).toBe(zone)
    })
  })

  describe('findBestApproachPosition', () => {
    it('delegates to the influence map when one is set', () => {
      const currentPos = new THREE.Vector3(0, 0, 0)
      const targetPos = new THREE.Vector3(50, 0, 50)
      const bestPos = new THREE.Vector3(40, 0, 45)

      vi.mocked(mockInfluenceMap.findBestPositionNear).mockReturnValue(bestPos)
      squadManager.setInfluenceMap(mockInfluenceMap)

      const result = squadManager.findBestApproachPosition(currentPos, targetPos, Faction.US, 50)
      expect(result).toBe(bestPos)
      expect(mockInfluenceMap.findBestPositionNear).toHaveBeenCalledWith(targetPos, 50, Faction.US)
    })

    it('returns null without an influence map', () => {
      const result = squadManager.findBestApproachPosition(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(50, 0, 50),
        Faction.US,
        50
      )
      expect(result).toBeNull()
    })
  })

  describe('assignSuppressionRoles', () => {
    it('splits a larger squad into suppressors (leader + first) and flankers with destinations', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const combatants = new Map(members.map(m => [m.id, m]))
      const result = squadManager.assignSuppressionRoles(squad, new THREE.Vector3(50, 0, 50), combatants)

      expect(result.suppressors).toContain(members[0])
      expect(result.suppressors).toContain(members[1])
      expect(result.flankers).toContain(members[2])
      expect(result.flankers).toContain(members[3])
      expect(members[2].destinationPoint).toBeDefined()
      expect(members[3].destinationPoint).toBeDefined()
    })

    it('returns empty roles when the squad is too small', () => {
      const { squad, members } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 2)
      const combatants = new Map(members.map(m => [m.id, m]))
      const result = squadManager.assignSuppressionRoles(squad, new THREE.Vector3(50, 0, 50), combatants)

      expect(result.suppressors.length).toBe(0)
      expect(result.flankers.length).toBe(0)
    })

    it('returns empty roles when members are missing from the combatants map', () => {
      const { squad } = squadManager.createSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4)
      const result = squadManager.assignSuppressionRoles(squad, new THREE.Vector3(50, 0, 50), new Map())
      expect(result.suppressors.length).toBe(0)
      expect(result.flankers.length).toBe(0)
    })
  })

  describe('dispose', () => {
    it('clears every squad and tolerates being called with none', () => {
      const position = new THREE.Vector3(0, 0, 0)
      squadManager.createSquad(Faction.US, position, 4)
      squadManager.createSquad(Faction.NVA, position, 3)
      squadManager.dispose()
      expect(squadManager.getAllSquads().size).toBe(0)
      expect(() => squadManager.dispose()).not.toThrow()
    })
  })
})
