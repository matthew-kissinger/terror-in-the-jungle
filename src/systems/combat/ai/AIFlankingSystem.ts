import * as THREE from 'three'
import { Combatant, CombatantState, Faction, Squad } from '../types'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'
import { objectPool } from '../../../utils/ObjectPoolManager'
import { getHeightQueryCache } from '../../terrain/HeightQueryCache'

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

  // Cooldown tracking
  private flankingCooldowns: Map<string, number> = new Map()  // squadId -> lastFlankTime

  // Configuration
  private readonly MIN_SQUAD_SIZE = 3  // Minimum squad size for flanking
  private readonly FLANK_COOLDOWN_MS = 15000  // 15 seconds between flank attempts
  private readonly FLANK_ANGLE_DEG = 60  // Angle offset for flanking position
  private readonly FLANK_DISTANCE = 25  // Distance from target for flanking position
  private readonly SUPPRESSION_DURATION_MS = 4000  // How long suppressors fire before flankers move
  private readonly MAX_FLANK_CASUALTIES = 2  // Abort if too many casualties during flank
  private readonly FLANK_TIMEOUT_MS = 20000  // Max time for flanking operation

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager
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
    const flankDirection = this.chooseBestFlankDirection(
      aliveMembers,
      targetPosition
    )

    // Assign roles: leader + first member suppress, rest flank
    const suppressors: string[] = []
    const flankers: string[] = []

    aliveMembers.forEach((member, index) => {
      if (member.squadRole === 'leader' || index === 1) {
        suppressors.push(member.id)
      } else {
        flankers.push(member.id)
      }
    })

    // Need at least 1 suppressor and 1 flanker
    if (suppressors.length === 0 || flankers.length === 0) {
      // Rebalance if needed
      if (flankers.length >= 2 && suppressors.length === 0) {
        suppressors.push(flankers.pop()!)
      } else if (suppressors.length >= 2 && flankers.length === 0) {
        flankers.push(suppressors.pop()!)
      }
    }

    if (suppressors.length === 0 || flankers.length === 0) {
      return null
    }

    // Calculate flanking waypoint
    const flankWaypoint = this.calculateFlankWaypoint(
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

    console.log(`🎯 Squad ${squad.id} initiating ${flankDirection} flank on target at (${Math.floor(targetPosition.x)}, ${Math.floor(targetPosition.z)})`)
    console.log(`  Suppressors: ${suppressors.length}, Flankers: ${flankers.length}`)

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
      this.abortFlank(operation, squad, allCombatants, 'timeout')
      return
    }

    // Update casualty count
    const aliveMembers = this.getAliveSquadMembers(squad, allCombatants)
    const currentCasualties = squad.members.length - aliveMembers.length
    operation.casualtiesDuringFlank = currentCasualties - operation.casualtiesBeforeFlank

    // Check for excessive casualties
    if (operation.casualtiesDuringFlank >= this.MAX_FLANK_CASUALTIES) {
      this.abortFlank(operation, squad, allCombatants, 'casualties')
      return
    }

    // State machine
    switch (operation.status) {
      case FlankingStatus.PLANNING:
        operation.status = FlankingStatus.SUPPRESSING
        this.assignSuppressionBehavior(operation, allCombatants)
        break

      case FlankingStatus.SUPPRESSING:
        // After suppression duration, start flankers moving
        if (now - operation.lastStatusUpdate > this.SUPPRESSION_DURATION_MS) {
          operation.status = FlankingStatus.FLANKING
          operation.lastStatusUpdate = now
          this.assignFlankingBehavior(operation, allCombatants)
          console.log(`⚔️ Squad ${squad.id} flankers moving to position`)
        }
        break

      case FlankingStatus.FLANKING:
        // Check if flankers reached position
        const flankersInPosition = this.areFlankersInPosition(operation, allCombatants)
        if (flankersInPosition) {
          operation.status = FlankingStatus.ENGAGING
          operation.lastStatusUpdate = now
          this.assignEngageBehavior(operation, allCombatants)
          console.log(`✅ Squad ${squad.id} flank complete, engaging from ${operation.flankDirection}`)
        }
        break

      case FlankingStatus.ENGAGING:
        // Flanking operation complete after 5 seconds of engagement
        if (now - operation.lastStatusUpdate > 5000) {
          operation.status = FlankingStatus.COMPLETE
          this.completeFlank(operation, squad, allCombatants)
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

  private chooseBestFlankDirection(
    squadMembers: Combatant[],
    targetPosition: THREE.Vector3
  ): 'left' | 'right' {
    if (squadMembers.length === 0) return 'left'

    // Calculate squad centroid
    const centroid = objectPool.getVector3()
    for (const member of squadMembers) {
      centroid.add(member.position)
    }
    centroid.divideScalar(squadMembers.length)

    // Get direction to target
    const toTarget = objectPool.getVector3()
    toTarget.subVectors(targetPosition, centroid).normalize()

    // Check terrain heights on both sides
    const leftDir = new THREE.Vector3(-toTarget.z, 0, toTarget.x)
    const rightDir = new THREE.Vector3(toTarget.z, 0, -toTarget.x)

    let leftScore = 0
    let rightScore = 0

    if (this.chunkManager) {
      // Sample terrain along flank routes
      for (let dist = 10; dist <= this.FLANK_DISTANCE; dist += 10) {
        const leftPos = centroid.clone().add(leftDir.clone().multiplyScalar(dist))
        const rightPos = centroid.clone().add(rightDir.clone().multiplyScalar(dist))

        const leftHeight = getHeightQueryCache().getHeightAt(leftPos.x, leftPos.z)
        const rightHeight = getHeightQueryCache().getHeightAt(rightPos.x, rightPos.z)

        // Prefer elevated positions
        leftScore += leftHeight
        rightScore += rightHeight
      }
    }

    objectPool.releaseVector3(centroid)
    objectPool.releaseVector3(toTarget)

    // Add some randomness to prevent predictable behavior
    leftScore += Math.random() * 5
    rightScore += Math.random() * 5

    return leftScore >= rightScore ? 'left' : 'right'
  }

  private calculateFlankWaypoint(
    squadPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    flankDirection: 'left' | 'right'
  ): THREE.Vector3 {
    // Calculate flanking angle (perpendicular + offset toward target)
    const toTarget = objectPool.getVector3()
    toTarget.subVectors(targetPosition, squadPosition)
    const currentAngle = Math.atan2(toTarget.z, toTarget.x)
    objectPool.releaseVector3(toTarget)

    // Flank angle offset
    const flankAngleRad = THREE.MathUtils.degToRad(this.FLANK_ANGLE_DEG)
    const offsetAngle = flankDirection === 'left' ? flankAngleRad : -flankAngleRad
    const flankAngle = currentAngle + Math.PI + offsetAngle  // Go around to side

    // Calculate waypoint
    const waypoint = new THREE.Vector3(
      targetPosition.x + Math.cos(flankAngle) * this.FLANK_DISTANCE,
      0,
      targetPosition.z + Math.sin(flankAngle) * this.FLANK_DISTANCE
    )

    // Set terrain height
    if (this.chunkManager) {
      waypoint.y = getHeightQueryCache().getHeightAt(waypoint.x, waypoint.z)
    }

    return waypoint
  }

  private assignSuppressionBehavior(
    operation: FlankingOperation,
    allCombatants: Map<string, Combatant>
  ): void {
    for (const suppressorId of operation.suppressors) {
      const combatant = allCombatants.get(suppressorId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      combatant.state = CombatantState.SUPPRESSING
      combatant.suppressionTarget = operation.targetPosition.clone()
      combatant.suppressionEndTime = Date.now() + this.SUPPRESSION_DURATION_MS + 2000
      combatant.isFullAuto = true
      combatant.skillProfile.burstLength = 8
      combatant.skillProfile.burstPauseMs = 150
      combatant.alertTimer = 10

      // Face target
      const toTarget = new THREE.Vector3()
        .subVectors(operation.targetPosition, combatant.position)
        .normalize()
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x)
    }
  }

  private assignFlankingBehavior(
    operation: FlankingOperation,
    allCombatants: Map<string, Combatant>
  ): void {
    const flankerCount = operation.flankers.length

    for (let i = 0; i < operation.flankers.length; i++) {
      const flankerId = operation.flankers[i]
      const combatant = allCombatants.get(flankerId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      // Spread flankers along the flank waypoint
      const offsetAngle = ((i / flankerCount) - 0.5) * (Math.PI / 6)  // +/- 15 degrees spread
      const spreadDistance = 5

      const spreadOffset = new THREE.Vector3(
        Math.cos(offsetAngle) * spreadDistance,
        0,
        Math.sin(offsetAngle) * spreadDistance
      )

      const flankerDestination = operation.flankWaypoint.clone().add(spreadOffset)
      if (this.chunkManager) {
        flankerDestination.y = getHeightQueryCache().getHeightAt(flankerDestination.x, flankerDestination.z)
      }

      combatant.state = CombatantState.ADVANCING
      combatant.destinationPoint = flankerDestination
      combatant.isFlankingMove = true
    }
  }

  private assignEngageBehavior(
    operation: FlankingOperation,
    allCombatants: Map<string, Combatant>
  ): void {
    // All members switch to aggressive engagement
    const allParticipants = [...operation.suppressors, ...operation.flankers]

    for (const participantId of allParticipants) {
      const combatant = allCombatants.get(participantId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      combatant.state = CombatantState.ENGAGING
      combatant.isFullAuto = true
      combatant.skillProfile.burstLength = 6
      combatant.skillProfile.burstPauseMs = 200
      combatant.isFlankingMove = false
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
    }
  }

  private areFlankersInPosition(
    operation: FlankingOperation,
    allCombatants: Map<string, Combatant>
  ): boolean {
    let inPositionCount = 0
    let totalFlankers = 0

    for (const flankerId of operation.flankers) {
      const combatant = allCombatants.get(flankerId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      totalFlankers++

      if (!combatant.destinationPoint) {
        inPositionCount++
        continue
      }

      const distance = combatant.position.distanceTo(combatant.destinationPoint)
      if (distance < 5) {
        inPositionCount++
      }
    }

    return totalFlankers > 0 && inPositionCount >= totalFlankers * 0.6
  }

  private abortFlank(
    operation: FlankingOperation,
    squad: Squad,
    allCombatants: Map<string, Combatant>,
    reason: string
  ): void {
    console.log(`❌ Squad ${squad.id} flanking aborted: ${reason}`)

    operation.status = FlankingStatus.ABORTED

    // Reset all participants to normal engagement
    const allParticipants = [...operation.suppressors, ...operation.flankers]

    for (const participantId of allParticipants) {
      const combatant = allCombatants.get(participantId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      combatant.state = CombatantState.ENGAGING
      combatant.isFullAuto = false
      combatant.isFlankingMove = false
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
      combatant.destinationPoint = undefined
    }

    this.activeOperations.delete(squad.id)
  }

  private completeFlank(
    operation: FlankingOperation,
    squad: Squad,
    allCombatants: Map<string, Combatant>
  ): void {
    console.log(`✅ Squad ${squad.id} flanking operation complete`)

    // Clean up combatant state
    const allParticipants = [...operation.suppressors, ...operation.flankers]

    for (const participantId of allParticipants) {
      const combatant = allCombatants.get(participantId)
      if (!combatant) continue

      combatant.isFlankingMove = false
    }

    this.activeOperations.delete(squad.id)
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
        this.abortFlank(operation, squad, allCombatants, 'squad_depleted')
      }
    }
  }

  dispose(): void {
    this.activeOperations.clear()
    this.flankingCooldowns.clear()
  }
}
