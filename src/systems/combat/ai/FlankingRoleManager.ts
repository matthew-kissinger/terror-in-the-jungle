import * as THREE from 'three'
import { Combatant, CombatantState, Squad } from '../types'
import { FlankingOperation, FlankingStatus } from './AIFlankingSystem'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'
import { objectPool } from '../../../utils/ObjectPoolManager'
import { getHeightQueryCache } from '../../terrain/HeightQueryCache'

// Module-level scratch vectors for behavior assignment
const _toTarget = new THREE.Vector3()
const _spreadOffset = new THREE.Vector3()

/**
 * Manages role assignment and behavior application for flanking operations
 */
export class FlankingRoleManager {
  private chunkManager?: ImprovedChunkManager
  private readonly SUPPRESSION_DURATION_MS = 4000  // How long suppressors fire before flankers move

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager
  }

  /**
   * Assign suppressor and flanker roles to squad members
   * Returns { suppressors, flankers } arrays of combatant IDs
   */
  assignFlankingRoles(
    aliveMembers: Combatant[]
  ): { suppressors: string[]; flankers: string[] } | null {
    const suppressors: string[] = []
    const flankers: string[] = []

    // Assign roles: leader + first member suppress, rest flank
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

    return { suppressors, flankers }
  }

  /**
   * Assign suppression behavior to suppressor combatants
   */
  assignSuppressionBehavior(
    operation: FlankingOperation,
    allCombatants: Map<string, Combatant>
  ): void {
    for (const suppressorId of operation.suppressors) {
      const combatant = allCombatants.get(suppressorId)
      if (!combatant || combatant.state === CombatantState.DEAD) continue

      combatant.state = CombatantState.SUPPRESSING
      if (combatant.suppressionTarget) {
        combatant.suppressionTarget.copy(operation.targetPosition)
      } else {
        combatant.suppressionTarget = operation.targetPosition.clone()
      }
      combatant.suppressionEndTime = Date.now() + this.SUPPRESSION_DURATION_MS + 2000
      combatant.isFullAuto = true
      combatant.skillProfile.burstLength = 8
      combatant.skillProfile.burstPauseMs = 150
      combatant.alertTimer = 10

      // Face target
      _toTarget.subVectors(operation.targetPosition, combatant.position).normalize()
      combatant.rotation = Math.atan2(_toTarget.z, _toTarget.x)
    }
  }

  /**
   * Assign flanking movement behavior to flanker combatants
   */
  assignFlankingBehavior(
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

      _spreadOffset.set(
        Math.cos(offsetAngle) * spreadDistance,
        0,
        Math.sin(offsetAngle) * spreadDistance
      )

      const flankerDestination = combatant.destinationPoint || objectPool.getVector3()
      flankerDestination.copy(operation.flankWaypoint).add(_spreadOffset)
      if (this.chunkManager) {
        flankerDestination.y = getHeightQueryCache().getHeightAt(flankerDestination.x, flankerDestination.z)
      }

      combatant.state = CombatantState.ADVANCING
      combatant.destinationPoint = flankerDestination
      combatant.isFlankingMove = true
    }
  }

  /**
   * Assign aggressive engagement behavior to all participants
   */
  assignEngageBehavior(
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

  /**
   * Check if flankers have reached their positions
   */
  areFlankersInPosition(
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

  /**
   * Abort a flanking operation and reset all participants
   */
  abortFlank(
    operation: FlankingOperation,
    squad: Squad,
    allCombatants: Map<string, Combatant>
  ): void {
    console.log(`❌ Squad ${squad.id} flanking aborted`)

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
  }

  /**
   * Complete a flanking operation and clean up combatant state
   */
  completeFlank(
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
  }
}
