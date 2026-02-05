import * as THREE from 'three'
import { Combatant, CombatantState, Squad } from '../types'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'
import { FlankingTacticsResolver } from './FlankingTacticsResolver'
import { FlankingRoleManager } from './FlankingRoleManager'
import { Logger } from '../../../utils/Logger'

/**
 * Flanking operation status
 */
export enum FlankingStatus {
  NONE = 'none',
  PLANNING = 'planning',
  SUPPRESSING = 'suppressing',
  FLANKING = 'flanking',
  ENGAGING = 'engaging',
  ABORTED = 'aborted',
  COMPLETE = 'complete'
}

/**
 * Flanking role assignment
 */
export enum FlankingRole {
  SUPPRESSOR = 'suppressor',
  FLANKER = 'flanker',
  NONE = 'none'
}

/**
 * Active flanking operation for a squad
 */
export interface FlankingOperation {
  squadId: string
  targetPosition: THREE.Vector3
  status: FlankingStatus
  startTime: number
  suppressors: string[]  // combatant IDs
  flankers: string[]  // combatant IDs
  flankDirection: 'left' | 'right'
  flankWaypoint: THREE.Vector3
  casualtiesBeforeFlank: number
  casualtiesDuringFlank: number
  lastStatusUpdate: number
}

/**
 * Coordinated flanking system for squad-level tactics
 *
 * Manages:
 * - Detecting when flanking is appropriate
 * - Assigning suppressor and flanker roles
 * - Calculating flanking routes
 * - Coordinating movement timing
 * - Abort conditions
 */
export class AIFlankingSystem {
  private chunkManager?: ImprovedChunkManager
  private activeOperations: Map<string, FlankingOperation> = new Map()

  // Extracted modules
  private tacticsResolver: FlankingTacticsResolver
  private roleManager: FlankingRoleManager

  // Cooldown tracking
  private flankingCooldowns: Map<string, number> = new Map()  // squadId -> lastFlankTime

  // Configuration
  private readonly MIN_SQUAD_SIZE = 3  // Minimum squad size for flanking
  private readonly FLANK_COOLDOWN_MS = 15000  // 15 seconds between flank attempts
  private readonly SUPPRESSION_DURATION_MS = 4000  // How long suppressors fire before flankers move
  private readonly MAX_FLANK_CASUALTIES = 2  // Abort if too many casualties during flank
  private readonly FLANK_TIMEOUT_MS = 20000  // Max time for flanking operation

  constructor() {
    this.tacticsResolver = new FlankingTacticsResolver()
    this.roleManager = new FlankingRoleManager()
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager
    this.tacticsResolver.setChunkManager(chunkManager)
    this.roleManager.setChunkManager(chunkManager)
  }

  /**
   * Check if a squad should attempt a flanking maneuver
   */
  shouldInitiateFlank(
    squad: Squad,
    allCombatants: Map<string, Combatant>,
    targetPosition: THREE.Vector3
  ): boolean {
    // Check existing operation
    if (this.activeOperations.has(squad.id)) {
      return false
    }

    // Check cooldown
    const lastFlank = this.flankingCooldowns.get(squad.id) || 0
    if (Date.now() - lastFlank < this.FLANK_COOLDOWN_MS) {
      return false
    }

    // Check squad size
    const aliveMembers = this.getAliveSquadMembers(squad, allCombatants)
    if (aliveMembers.length < this.MIN_SQUAD_SIZE) {
      return false
    }

    // Check if leader is alive
    const leader = allCombatants.get(squad.leaderId || '')
    if (!leader || leader.state === CombatantState.DEAD) {
      return false
    }

    // Check distance to target (flanking is mid-range tactic)
    const leaderDistance = leader.position.distanceTo(targetPosition)
    if (leaderDistance < 20 || leaderDistance > 80) {
      return false
    }

    // Check if squad is taking casualties or stalled
    const recentDamage = this.hasRecentSquadDamage(squad, allCombatants)
    const stalledEngagement = this.isEngagementStalled(squad, allCombatants)

    return recentDamage || stalledEngagement
  }

  /**
   * Initiate a flanking operation for a squad
   */
  initiateFlank(
    squad: Squad,
    allCombatants: Map<string, Combatant>,
    targetPosition: THREE.Vector3
  ): FlankingOperation | null {
    const aliveMembers = this.getAliveSquadMembers(squad, allCombatants)
    if (aliveMembers.length < this.MIN_SQUAD_SIZE) {
      return null
    }

    // Choose flank direction based on terrain and squad position
    const flankDirection = this.tacticsResolver.chooseBestFlankDirection(
      aliveMembers,
      targetPosition
    )

    // Assign roles: leader + first member suppress, rest flank
    const roleAssignment = this.roleManager.assignFlankingRoles(aliveMembers)
    if (!roleAssignment) {
      return null
    }

    const { suppressors, flankers } = roleAssignment

    // Calculate flanking waypoint
    const flankWaypoint = this.tacticsResolver.calculateFlankWaypoint(
      aliveMembers[0].position,
      targetPosition,
      flankDirection
    )

    // Count current casualties
    const totalMembers = squad.members.length
    const aliveMembersCount = aliveMembers.length
    const casualtiesBeforeFlank = totalMembers - aliveMembersCount

    const operation: FlankingOperation = {
      squadId: squad.id,
      targetPosition: targetPosition.clone(),
      status: FlankingStatus.PLANNING,
      startTime: Date.now(),
      suppressors,
      flankers,
      flankDirection,
      flankWaypoint,
      casualtiesBeforeFlank,
      casualtiesDuringFlank: 0,
      lastStatusUpdate: Date.now()
    }

    this.activeOperations.set(squad.id, operation)
    this.flankingCooldowns.set(squad.id, Date.now())

    Logger.info('combat-ai', ` Squad ${squad.id} initiating ${flankDirection} flank on target at (${Math.floor(targetPosition.x)}, ${Math.floor(targetPosition.z)})`)
    Logger.info('combat-ai', `  Suppressors: ${suppressors.length}, Flankers: ${flankers.length}`)

    return operation
  }

  /**
   * Update a flanking operation and apply behaviors to combatants
   */
  updateFlankingOperation(
    operation: FlankingOperation,
    squad: Squad,
    allCombatants: Map<string, Combatant>
  ): void {
    const now = Date.now()
    const elapsed = now - operation.startTime

    // Check for timeout
    if (elapsed > this.FLANK_TIMEOUT_MS) {
      this.roleManager.abortFlank(operation, squad, allCombatants)
      this.activeOperations.delete(squad.id)
      return
    }

    // Update casualty count
    const aliveMembers = this.getAliveSquadMembers(squad, allCombatants)
    const currentCasualties = squad.members.length - aliveMembers.length
    operation.casualtiesDuringFlank = currentCasualties - operation.casualtiesBeforeFlank

    // Check for excessive casualties
    if (operation.casualtiesDuringFlank >= this.MAX_FLANK_CASUALTIES) {
      this.roleManager.abortFlank(operation, squad, allCombatants)
      this.activeOperations.delete(squad.id)
      return
    }

    // State machine
    switch (operation.status) {
      case FlankingStatus.PLANNING:
        operation.status = FlankingStatus.SUPPRESSING
        this.roleManager.assignSuppressionBehavior(operation, allCombatants)
        break

      case FlankingStatus.SUPPRESSING:
        // After suppression duration, start flankers moving
        if (now - operation.lastStatusUpdate > this.SUPPRESSION_DURATION_MS) {
          operation.status = FlankingStatus.FLANKING
          operation.lastStatusUpdate = now
          this.roleManager.assignFlankingBehavior(operation, allCombatants)
          Logger.info('combat-ai', ` Squad ${squad.id} flankers moving to position`)
        }
        break

      case FlankingStatus.FLANKING:
        // Check if flankers reached position
        const flankersInPosition = this.roleManager.areFlankersInPosition(operation, allCombatants)
        if (flankersInPosition) {
          operation.status = FlankingStatus.ENGAGING
          operation.lastStatusUpdate = now
          this.roleManager.assignEngageBehavior(operation, allCombatants)
          Logger.info('combat-ai', ` Squad ${squad.id} flank complete, engaging from ${operation.flankDirection}`)
        }
        break

      case FlankingStatus.ENGAGING:
        // Flanking operation complete after 5 seconds of engagement
        if (now - operation.lastStatusUpdate > 5000) {
          operation.status = FlankingStatus.COMPLETE
          this.roleManager.completeFlank(operation, squad, allCombatants)
          this.activeOperations.delete(squad.id)
        }
        break
    }
  }

  /**
   * Get the current flanking role for a combatant
   */
  getCombatantFlankRole(combatantId: string): { role: FlankingRole; operation?: FlankingOperation } {
    for (const operation of this.activeOperations.values()) {
      if (operation.suppressors.includes(combatantId)) {
        return { role: FlankingRole.SUPPRESSOR, operation }
      }
      if (operation.flankers.includes(combatantId)) {
        return { role: FlankingRole.FLANKER, operation }
      }
    }
    return { role: FlankingRole.NONE }
  }

  /**
   * Check if a squad has an active flanking operation
   */
  hasActiveFlank(squadId: string): boolean {
    const op = this.activeOperations.get(squadId)
    return op !== undefined && op.status !== FlankingStatus.COMPLETE && op.status !== FlankingStatus.ABORTED
  }

  /**
   * Get active operation for a squad
   */
  getActiveOperation(squadId: string): FlankingOperation | undefined {
    return this.activeOperations.get(squadId)
  }

  // Private methods

  private getAliveSquadMembers(squad: Squad, allCombatants: Map<string, Combatant>): Combatant[] {
    return squad.members
      .map(id => allCombatants.get(id))
      .filter((c): c is Combatant => c !== undefined && c.state !== CombatantState.DEAD)
  }

  private hasRecentSquadDamage(squad: Squad, allCombatants: Map<string, Combatant>): boolean {
    const now = Date.now()
    const recentThresholdMs = 5000  // Last 5 seconds

    for (const memberId of squad.members) {
      const member = allCombatants.get(memberId)
      if (member && (now - member.lastHitTime) < recentThresholdMs) {
        return true
      }
    }
    return false
  }

  private isEngagementStalled(squad: Squad, allCombatants: Map<string, Combatant>): boolean {
    // Engagement is stalled if most members are engaging same target for > 10 seconds
    const engagingMembers = squad.members
      .map(id => allCombatants.get(id))
      .filter(c => c && c.state === CombatantState.ENGAGING)

    if (engagingMembers.length < 2) return false

    // Check if they've been engaging for a while (via lastShotTime)
    const now = Date.now()
    let stalledCount = 0
    for (const member of engagingMembers) {
      if (member && (now - member.lastShotTime) < 2000) {
        // Recently shot, check how long in combat
        if (member.target && (now - member.lastHitTime) > 8000) {
          stalledCount++
        }
      }
    }

    return stalledCount >= 2
  }


  /**
   * Clean up all operations for dead squads
   */
  cleanupOperations(squads: Map<string, Squad>, allCombatants: Map<string, Combatant>): void {
    for (const [squadId, operation] of this.activeOperations.entries()) {
      const squad = squads.get(squadId)
      if (!squad) {
        this.activeOperations.delete(squadId)
        continue
      }

      // Check if enough members are alive
      const aliveCount = this.getAliveSquadMembers(squad, allCombatants).length
      if (aliveCount < 2) {
        this.roleManager.abortFlank(operation, squad, allCombatants)
        this.activeOperations.delete(squad.id)
      }
    }
  }

  dispose(): void {
    this.activeOperations.clear()
    this.flankingCooldowns.clear()
  }
}
