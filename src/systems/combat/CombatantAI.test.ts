import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CombatantAI } from './CombatantAI'
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types'
import { CalloutType } from '../audio/VoiceCalloutSystem'

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
      return new (this.constructor as any)(this.x, this.y, this.z)
    })
    this.subVectors = vi.fn(function (this: any, a: any, b: any) {
      this.x = a.x - b.x
      this.y = a.y - b.y
      this.z = a.z - b.z
      return this
    })
    this.length = vi.fn(function (this: any) {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    })
    this.normalize = vi.fn(function (this: any) {
      const len = this.length()
      if (len > 0) {
        this.x /= len
        this.y /= len
        this.z /= len
      }
      return this
    })
    return this
  }),
}))

// Mock AI state handlers
vi.mock('./ai/AIStatePatrol', () => ({
  AIStatePatrol: class {
    handlePatrolling = vi.fn()
    setSquads = vi.fn()
    setZoneManager = vi.fn()
  },
}))

vi.mock('./ai/AIStateEngage', () => ({
  AIStateEngage: class {
    handleAlert = vi.fn()
    handleEngaging = vi.fn()
    handleSuppressing = vi.fn()
    initiateSquadSuppression = vi.fn()
    setCoverSystem = vi.fn()
    setFlankingSystem = vi.fn()
    setSquads = vi.fn()
  },
}))

vi.mock('./ai/AIStateMovement', () => ({
  AIStateMovement: class {
    handleAdvancing = vi.fn()
    handleSeekingCover = vi.fn()
    setVoiceCalloutSystem = vi.fn()
  },
}))

vi.mock('./ai/AIStateDefend', () => ({
  AIStateDefend: class {
    handleDefending = vi.fn()
    setZoneManager = vi.fn()
  },
}))

// Mock tactical systems
vi.mock('./ai/AITargeting', () => ({
  AITargeting: class {
    findNearestEnemy = vi.fn(() => null)
    canSeeTarget = vi.fn(() => false)
    shouldEngage = vi.fn(() => false)
    countNearbyEnemies = vi.fn(() => 0)
    shouldSeekCover = vi.fn(() => false)
    findNearestCover = vi.fn(() => null)
    isCoverFlanked = vi.fn(() => false)
    setChunkManager = vi.fn()
    setSandbagSystem = vi.fn()
    setSmokeCloudSystem = vi.fn()
  },
}))

vi.mock('./ai/AICoverSystem', () => ({
  AICoverSystem: class {
    cleanupOccupation = vi.fn()
    setChunkManager = vi.fn()
    setSandbagSystem = vi.fn()
  },
}))

vi.mock('./ai/AIFlankingSystem', () => ({
  AIFlankingSystem: class {
    getActiveOperation = vi.fn(() => null)
    updateFlankingOperation = vi.fn()
    cleanupOperations = vi.fn()
    setChunkManager = vi.fn()
  },
}))

// Mock VoiceCalloutSystem
const mockTriggerCallout = vi.fn()
vi.mock('../audio/VoiceCalloutSystem', () => ({
  VoiceCalloutSystem: vi.fn(),
  CalloutType: {
    MOVING: 'moving',
    CONTACT: 'contact',
    TAKING_FIRE: 'taking_fire',
  },
}))

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

describe('CombatantAI', () => {
  let ai: CombatantAI
  let mockCombatant: Combatant
  let mockPlayerPosition: any
  let mockAllCombatants: Map<string, Combatant>
  let mockSpatialGrid: any

  beforeEach(() => {
    vi.clearAllMocks()
    ai = new CombatantAI()
    const THREE = require('three')
    mockCombatant = createMockCombatant()
    mockPlayerPosition = new THREE.Vector3(10, 0, 10)
    mockAllCombatants = new Map([['c1', mockCombatant]])
    mockSpatialGrid = {}
  })

  describe('updateAI - suppression decay', () => {
    it('should call decaySuppressionEffects before state handling', () => {
      const decaySpy = vi.spyOn(ai as any, 'decaySuppressionEffects')
      mockCombatant.state = CombatantState.PATROLLING

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants, mockSpatialGrid)

      expect(decaySpy).toHaveBeenCalledWith(mockCombatant, 0.016)
    })
  })

  describe('updateAI - flanking operations', () => {
    it('should update flanking operations for squad members', () => {
      mockCombatant.squadId = 'squad1'
      const mockOperation = { id: 'op1' }
      const mockSquad = { id: 'squad1', members: ['c1'] } as Squad
      const squads = new Map([['squad1', mockSquad]])
      ai.setSquads(squads)

      const flankingSystem = (ai as any).flankingSystem
      flankingSystem.getActiveOperation.mockReturnValue(mockOperation)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants, mockSpatialGrid)

      expect(flankingSystem.getActiveOperation).toHaveBeenCalledWith('squad1')
      expect(flankingSystem.updateFlankingOperation).toHaveBeenCalledWith(
        mockOperation,
        mockSquad,
        mockAllCombatants
      )
    })

    it('should skip flanking update if no active operation', () => {
      mockCombatant.squadId = 'squad1'
      const flankingSystem = (ai as any).flankingSystem
      flankingSystem.getActiveOperation.mockReturnValue(null)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants, mockSpatialGrid)

      expect(flankingSystem.updateFlankingOperation).not.toHaveBeenCalled()
    })

    it('should skip flanking update if no squad found', () => {
      mockCombatant.squadId = 'squad1'
      const mockOperation = { id: 'op1' }
      const flankingSystem = (ai as any).flankingSystem
      flankingSystem.getActiveOperation.mockReturnValue(mockOperation)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants, mockSpatialGrid)

      expect(flankingSystem.updateFlankingOperation).not.toHaveBeenCalled()
    })
  })

  describe('decaySuppressionEffects', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should reduce suppressionLevel over time', () => {
      mockCombatant.suppressionLevel = 1.0
      ai.updateAI(mockCombatant, 0.5, mockPlayerPosition, mockAllCombatants)

      expect(mockCombatant.suppressionLevel).toBeLessThan(1.0)
      expect(mockCombatant.suppressionLevel).toBeGreaterThanOrEqual(0)
    })

    it('should not reduce suppressionLevel below zero', () => {
      mockCombatant.suppressionLevel = 0.1
      ai.updateAI(mockCombatant, 1.0, mockPlayerPosition, mockAllCombatants)

      expect(mockCombatant.suppressionLevel).toBe(0)
    })

    it('should decay nearMissCount after 3 seconds since suppression', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      mockCombatant.lastSuppressedTime = now - 4000 // 4 seconds ago
      mockCombatant.nearMissCount = 5

      ai.updateAI(mockCombatant, 0.5, mockPlayerPosition, mockAllCombatants)

      expect(mockCombatant.nearMissCount).toBeLessThan(5)
    })

    it('should not decay nearMissCount within 3 seconds of suppression', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      mockCombatant.lastSuppressedTime = now - 2000 // 2 seconds ago
      mockCombatant.nearMissCount = 5

      ai.updateAI(mockCombatant, 0.5, mockPlayerPosition, mockAllCombatants)

      expect(mockCombatant.nearMissCount).toBe(5)
    })

    it('should clear lastSuppressedTime when nearMissCount reaches zero', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      mockCombatant.lastSuppressedTime = now - 4000
      mockCombatant.nearMissCount = 0.1

      ai.updateAI(mockCombatant, 1.0, mockPlayerPosition, mockAllCombatants)

      expect(mockCombatant.nearMissCount).toBe(0)
      expect(mockCombatant.lastSuppressedTime).toBeUndefined()
    })
  })

  describe('maybeTriggerMovementCallout', () => {
    let mockVoiceSystem: any

    beforeEach(() => {
      mockTriggerCallout.mockClear()
      mockVoiceSystem = { triggerCallout: mockTriggerCallout }
      ai.setVoiceCalloutSystem(mockVoiceSystem)
    })

    it('should trigger callout on state change to ADVANCING', () => {
      mockCombatant.state = CombatantState.PATROLLING
      vi.spyOn(Math, 'random').mockReturnValue(0.1) // Below 0.2 threshold

      // First update to establish previous state
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)
      mockTriggerCallout.mockClear()

      // Change to ADVANCING
      mockCombatant.state = CombatantState.ADVANCING
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).toHaveBeenCalledWith(
        mockCombatant,
        CalloutType.MOVING,
        mockCombatant.position
      )
    })

    it('should trigger callout on state change to RETREATING', () => {
      mockCombatant.state = CombatantState.PATROLLING
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      // First update to establish previous state
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)
      mockTriggerCallout.mockClear()

      // Change to RETREATING
      mockCombatant.state = CombatantState.RETREATING
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).toHaveBeenCalledWith(
        mockCombatant,
        CalloutType.MOVING,
        mockCombatant.position
      )
    })

    it('should not trigger if state did not change', () => {
      mockCombatant.state = CombatantState.ADVANCING
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      // First update
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)
      mockTriggerCallout.mockClear()

      // Second update with same state
      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).not.toHaveBeenCalled()
    })

    it('should not trigger if random check fails', () => {
      mockCombatant.state = CombatantState.ADVANCING
      vi.spyOn(Math, 'random').mockReturnValue(0.9) // Above 0.2 threshold

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).not.toHaveBeenCalled()
    })

    it('should not trigger if combatant is dead', () => {
      mockCombatant.state = CombatantState.DEAD
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).not.toHaveBeenCalled()
    })

    it('should not trigger if no voice callout system', () => {
      ai.setVoiceCalloutSystem(undefined as any)
      mockCombatant.state = CombatantState.ADVANCING
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).not.toHaveBeenCalled()
    })

    it('should not trigger for non-movement states', () => {
      mockCombatant.state = CombatantState.ENGAGING
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

      expect(mockTriggerCallout).not.toHaveBeenCalled()
    })
  })

  describe('applySquadCommandOverride', () => {
    let squad: Squad

    beforeEach(() => {
      squad = {
        id: 'squad1',
        faction: Faction.US,
        members: ['c1'],
        formation: 'wedge',
        isPlayerControlled: true,
        currentCommand: SquadCommand.NONE,
      } as Squad
      const squads = new Map([['squad1', squad]])
      ai.setSquads(squads)
      mockCombatant.faction = Faction.US
      mockCombatant.squadId = 'squad1'
    })

    describe('FOLLOW_ME command', () => {
      beforeEach(() => {
        squad.currentCommand = SquadCommand.FOLLOW_ME
      })

      it('should interrupt ENGAGING state and transition to PATROLLING', () => {
        mockCombatant.state = CombatantState.ENGAGING
        mockCombatant.target = createMockCombatant({ id: 'enemy1', faction: Faction.NVA })
        mockCombatant.inCover = true
        mockCombatant.isFullAuto = true

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.target).toBeNull()
        expect(mockCombatant.inCover).toBe(false)
        expect(mockCombatant.isFullAuto).toBe(false)
      })

      it('should interrupt SUPPRESSING state and transition to PATROLLING', () => {
        mockCombatant.state = CombatantState.SUPPRESSING
        mockCombatant.target = createMockCombatant({ id: 'enemy1', faction: Faction.NVA })

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.target).toBeNull()
      })

      it('should interrupt ALERT state and transition to PATROLLING', () => {
        mockCombatant.state = CombatantState.ALERT
        mockCombatant.target = createMockCombatant({ id: 'enemy1', faction: Faction.NVA })

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.target).toBeNull()
      })

      it('should interrupt SEEKING_COVER state and transition to PATROLLING', () => {
        mockCombatant.state = CombatantState.SEEKING_COVER
        mockCombatant.target = createMockCombatant({ id: 'enemy1', faction: Faction.NVA })

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.target).toBeNull()
      })

      it('should pull combatant out of DEFENDING state', () => {
        mockCombatant.state = CombatantState.DEFENDING
        const THREE = require('three')
        mockCombatant.defensePosition = new THREE.Vector3(50, 0, 50)
        mockCombatant.defendingZoneId = 'zone-1'

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.defensePosition).toBeUndefined()
        expect(mockCombatant.defendingZoneId).toBeUndefined()
      })
    })

    describe('RETREAT command', () => {
      beforeEach(() => {
        squad.currentCommand = SquadCommand.RETREAT
        const THREE = require('three')
        squad.commandPosition = new THREE.Vector3(-100, 0, -100)
      })

      it('should interrupt ENGAGING state and transition to PATROLLING', () => {
        mockCombatant.state = CombatantState.ENGAGING
        mockCombatant.target = createMockCombatant({ id: 'enemy1', faction: Faction.NVA })

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.target).toBeNull()
      })

      it('should interrupt SUPPRESSING state and clear suppression data', () => {
        const THREE = require('three')
        mockCombatant.state = CombatantState.SUPPRESSING
        mockCombatant.suppressionTarget = new THREE.Vector3(10, 0, 10)
        mockCombatant.suppressionEndTime = Date.now() + 5000

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.suppressionTarget).toBeUndefined()
        expect(mockCombatant.suppressionEndTime).toBeUndefined()
      })

      it('should pull combatant out of DEFENDING state', () => {
        mockCombatant.state = CombatantState.DEFENDING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
      })
    })

    describe('HOLD_POSITION command', () => {
      beforeEach(() => {
        squad.currentCommand = SquadCommand.HOLD_POSITION
        const THREE = require('three')
        squad.commandPosition = new THREE.Vector3(50, 0, 50)
      })

      it('should transition PATROLLING combatant to DEFENDING', () => {
        mockCombatant.state = CombatantState.PATROLLING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.DEFENDING)
        expect(mockCombatant.defensePosition).toBeDefined()
        expect(mockCombatant.destinationPoint).toBeDefined()
      })

      it('should NOT interrupt ENGAGING state', () => {
        mockCombatant.state = CombatantState.ENGAGING
        const engageHandler = (ai as any).engageHandler

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        // State should remain ENGAGING, and engageHandler should have been called
        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })

      it('should NOT interrupt ALERT state', () => {
        mockCombatant.state = CombatantState.ALERT
        const engageHandler = (ai as any).engageHandler

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(engageHandler.handleAlert).toHaveBeenCalled()
      })

      it('should NOT interrupt SUPPRESSING state', () => {
        mockCombatant.state = CombatantState.SUPPRESSING
        const engageHandler = (ai as any).engageHandler

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(engageHandler.handleSuppressing).toHaveBeenCalled()
      })

      it('should not re-assign if already DEFENDING', () => {
        const THREE = require('three')
        const originalDefPos = new THREE.Vector3(99, 0, 99)
        mockCombatant.state = CombatantState.DEFENDING
        mockCombatant.defensePosition = originalDefPos

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        // Should still be defending, defense position should not be overwritten
        expect(mockCombatant.state).toBe(CombatantState.DEFENDING)
        expect(mockCombatant.defensePosition).toBe(originalDefPos)
      })

      it('should transition ADVANCING combatant to DEFENDING', () => {
        mockCombatant.state = CombatantState.ADVANCING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.DEFENDING)
      })
    })

    describe('PATROL_HERE command', () => {
      beforeEach(() => {
        squad.currentCommand = SquadCommand.PATROL_HERE
        const THREE = require('three')
        squad.commandPosition = new THREE.Vector3(50, 0, 50)
      })

      it('should transition DEFENDING combatant to PATROLLING', () => {
        const THREE = require('three')
        mockCombatant.state = CombatantState.DEFENDING
        mockCombatant.defensePosition = new THREE.Vector3(50, 0, 50)

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.defensePosition).toBeUndefined()
      })

      it('should NOT interrupt ENGAGING state', () => {
        mockCombatant.state = CombatantState.ENGAGING
        const engageHandler = (ai as any).engageHandler

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })

      it('should keep PATROLLING combatant in PATROLLING state', () => {
        mockCombatant.state = CombatantState.PATROLLING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
      })
    })

    describe('FREE_ROAM command', () => {
      beforeEach(() => {
        squad.currentCommand = SquadCommand.FREE_ROAM
      })

      it('should clear command-driven DEFENDING and transition to PATROLLING', () => {
        const THREE = require('three')
        mockCombatant.state = CombatantState.DEFENDING
        mockCombatant.defensePosition = new THREE.Vector3(50, 0, 50)
        // No defendingZoneId means this was set by HOLD_POSITION, not zone defense
        mockCombatant.defendingZoneId = undefined

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
        expect(mockCombatant.defensePosition).toBeUndefined()
        expect(mockCombatant.destinationPoint).toBeUndefined()
      })

      it('should NOT clear zone-based DEFENDING', () => {
        const THREE = require('three')
        mockCombatant.state = CombatantState.DEFENDING
        mockCombatant.defensePosition = new THREE.Vector3(50, 0, 50)
        mockCombatant.defendingZoneId = 'zone-1' // Zone-based, not command-based

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        // Should remain DEFENDING because it was zone-assigned, not command-assigned
        expect(mockCombatant.state).toBe(CombatantState.DEFENDING)
      })

      it('should not affect PATROLLING combatants', () => {
        mockCombatant.state = CombatantState.PATROLLING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        expect(mockCombatant.state).toBe(CombatantState.PATROLLING)
      })
    })

    describe('faction and squad filtering', () => {
      it('should NOT affect OPFOR faction combatants', () => {
        mockCombatant.faction = Faction.NVA
        mockCombatant.state = CombatantState.ENGAGING
        squad.currentCommand = SquadCommand.FOLLOW_ME

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        // OPFOR should be unaffected - engageHandler should be called normally
        const engageHandler = (ai as any).engageHandler
        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })

      it('should NOT affect combatants not in a squad', () => {
        mockCombatant.squadId = undefined
        mockCombatant.state = CombatantState.ENGAGING
        squad.currentCommand = SquadCommand.FOLLOW_ME

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        const engageHandler = (ai as any).engageHandler
        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })

      it('should NOT affect combatants in non-player-controlled squads', () => {
        squad.isPlayerControlled = false
        mockCombatant.state = CombatantState.ENGAGING
        squad.currentCommand = SquadCommand.FOLLOW_ME

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        const engageHandler = (ai as any).engageHandler
        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })

      it('should NOT affect combatants when command is NONE', () => {
        squad.currentCommand = SquadCommand.NONE
        mockCombatant.state = CombatantState.ENGAGING

        ai.updateAI(mockCombatant, 0.016, mockPlayerPosition, mockAllCombatants)

        const engageHandler = (ai as any).engageHandler
        expect(engageHandler.handleEngaging).toHaveBeenCalled()
      })
    })
  })
})
