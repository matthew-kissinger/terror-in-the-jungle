import * as THREE from 'three'
import { Combatant, CombatantState, Faction, Squad } from '../types'
import { SpatialOctree } from '../SpatialOctree'
import { AICoverSystem } from './AICoverSystem'
import { AIFlankingSystem } from './AIFlankingSystem'

/**
 * Handles engaging and suppressing combat states
 */
export class AIStateEngage {
  private squads: Map<string, Squad> = new Map()
  private squadSuppressionCooldown: Map<string, number> = new Map()
  private coverSystem?: AICoverSystem
  private flankingSystem?: AIFlankingSystem

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads
  }

  setCoverSystem(coverSystem: AICoverSystem): void {
    this.coverSystem = coverSystem
  }

  setFlankingSystem(flankingSystem: AIFlankingSystem): void {
    this.flankingSystem = flankingSystem
  }

  handleEngaging(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree | undefined,
    canSeeTarget: (
      combatant: Combatant,
      target: Combatant,
      playerPosition: THREE.Vector3
    ) => boolean,
    shouldSeekCover: (combatant: Combatant) => boolean,
    findNearestCover: (combatant: Combatant, threatPosition: THREE.Vector3) => THREE.Vector3 | null,
    countNearbyEnemies: (
      combatant: Combatant,
      radius: number,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: SpatialOctree
    ) => number,
    isCoverFlanked: (combatant: Combatant, threatPos: THREE.Vector3) => boolean
  ): void {
    if (!combatant.target || combatant.target.state === CombatantState.DEAD) {
      combatant.state = combatant.previousState === CombatantState.DEFENDING ?
        CombatantState.DEFENDING : CombatantState.PATROLLING
      combatant.target = null
      combatant.isFullAuto = false
      combatant.previousState = undefined
      combatant.inCover = false
      // Release cover when disengaging
      if (this.coverSystem) {
        this.coverSystem.releaseCover(combatant.id)
      }
      return
    }

    const targetPos = combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position
    const toTargetDir = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize()
    combatant.rotation = Math.atan2(toTargetDir.z, toTargetDir.x)

    const targetDistance = combatant.position.distanceTo(targetPos)
    combatant.isFullAuto = false

    // Peek-and-fire behavior when in cover
    if (combatant.inCover) {
      combatant.skillProfile.burstLength = 2
      combatant.skillProfile.burstPauseMs = 1500

      // Use improved cover evaluation
      if (this.coverSystem && combatant.coverPosition) {
        const coverEval = this.coverSystem.evaluateCurrentCover(combatant, targetPos)
        if (!coverEval.effective) {
          console.log(`⚠️ ${combatant.faction} unit's cover is compromised, repositioning`)
          this.coverSystem.releaseCover(combatant.id)
          combatant.inCover = false
          combatant.coverPosition = undefined

          // Immediately seek new cover if should reposition
          if (coverEval.shouldReposition) {
            const newCover = this.coverSystem.findBestCover(combatant, targetPos, allCombatants)
            if (newCover) {
              combatant.state = CombatantState.SEEKING_COVER
              combatant.coverPosition = newCover.position.clone()
              combatant.destinationPoint = newCover.position.clone()
              combatant.lastCoverSeekTime = Date.now()
              this.coverSystem.claimCover(combatant, newCover.position)
              return
            }
          }
        }
      } else if (isCoverFlanked(combatant, targetPos)) {
        // Fallback to old method if no cover system
        console.log(`⚠️ ${combatant.faction} unit's cover is flanked, repositioning`)
        combatant.inCover = false
        combatant.coverPosition = undefined
      }
    } else {
      // Normal engagement behavior when not in cover
      if (targetDistance < 15) {
        combatant.isFullAuto = true
        combatant.skillProfile.burstLength = 8
        combatant.skillProfile.burstPauseMs = 200
      }

      const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000
      if (timeSinceHit < 2.0) {
        combatant.panicLevel = Math.min(1.0, combatant.panicLevel + 0.3)
        if (combatant.panicLevel > 0.5) {
          combatant.isFullAuto = true
          combatant.skillProfile.burstLength = 10
          combatant.skillProfile.burstPauseMs = 150
        }
      } else {
        combatant.panicLevel = Math.max(0, combatant.panicLevel - deltaTime * 0.2)
      }

      // Check if should seek cover - use improved cover system if available
      if (shouldSeekCover(combatant)) {
        let coverPosition: THREE.Vector3 | null = null

        if (this.coverSystem) {
          // Use advanced cover system with occupation tracking
          const coverSpot = this.coverSystem.findBestCover(combatant, targetPos, allCombatants)
          if (coverSpot) {
            coverPosition = coverSpot.position.clone()
            this.coverSystem.claimCover(combatant, coverPosition)
          }
        } else {
          // Fallback to basic cover finding
          coverPosition = findNearestCover(combatant, targetPos)
        }

        if (coverPosition) {
          combatant.state = CombatantState.SEEKING_COVER
          combatant.coverPosition = coverPosition
          combatant.destinationPoint = coverPosition
          combatant.lastCoverSeekTime = Date.now()
          combatant.inCover = false
          return
        }
      }

      const nearbyEnemyCount = countNearbyEnemies(combatant, 20, playerPosition, allCombatants, spatialGrid)
      if (nearbyEnemyCount > 2) {
        combatant.isFullAuto = true
        combatant.skillProfile.burstLength = 6
      }

      // Check if squad should initiate flanking maneuver (uses new flanking system)
      if (combatant.squadId && this.flankingSystem) {
        const squad = this.squads.get(combatant.squadId)
        if (squad && !this.flankingSystem.hasActiveFlank(squad.id)) {
          if (this.flankingSystem.shouldInitiateFlank(squad, allCombatants, targetPos)) {
            const operation = this.flankingSystem.initiateFlank(squad, allCombatants, targetPos)
            if (operation) {
              // Operation started - combatant behavior will be controlled by flanking system
              return
            }
          }
        }
      }

      // Fallback: Check if squad should initiate basic suppression
      if (this.shouldInitiateSquadSuppression(combatant, targetPos, allCombatants, countNearbyEnemies, playerPosition, spatialGrid)) {
        this.initiateSquadSuppression(combatant, targetPos, allCombatants, findNearestCover)
        return
      }

      // Reset burst params if not full auto
      if (!combatant.isFullAuto) {
        const isLeader = combatant.squadRole === 'leader'
        if (combatant.faction === Faction.OPFOR) {
          combatant.skillProfile.burstLength = isLeader ? 4 : 3
          combatant.skillProfile.burstPauseMs = isLeader ? 800 : 1000
        } else {
          combatant.skillProfile.burstLength = 3
          combatant.skillProfile.burstPauseMs = isLeader ? 900 : 1100
        }
      }
    }

    if (!canSeeTarget(combatant, combatant.target, playerPosition)) {
      combatant.lastKnownTargetPos = combatant.target.position.clone()
      combatant.state = CombatantState.SUPPRESSING
      combatant.isFullAuto = true
      combatant.skillProfile.burstLength = 12
      combatant.skillProfile.burstPauseMs = 100
      combatant.inCover = false
      return
    }

    combatant.lastKnownTargetPos = combatant.target.position.clone()
  }

  handleSuppressing(combatant: Combatant, deltaTime: number): void {
    // Check if suppression time expired
    if (combatant.suppressionEndTime && Date.now() > combatant.suppressionEndTime) {
      combatant.state = CombatantState.ENGAGING
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
      return
    }

    combatant.alertTimer -= deltaTime

    if (combatant.alertTimer <= 0) {
      combatant.state = CombatantState.PATROLLING
      combatant.target = null
      combatant.lastKnownTargetPos = undefined
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
    }
  }

  handleAlert(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    canSeeTarget: (
      combatant: Combatant,
      target: Combatant,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    combatant.alertTimer -= deltaTime
    combatant.reactionTimer -= deltaTime

    if (combatant.reactionTimer <= 0 && combatant.target) {
      const targetPos = combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position
      const toTarget = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize()
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x)

      if (canSeeTarget(combatant, combatant.target, playerPosition)) {
        combatant.state = CombatantState.ENGAGING
        combatant.currentBurst = 0
      } else {
        combatant.state = combatant.previousState === CombatantState.DEFENDING ?
          CombatantState.DEFENDING : CombatantState.PATROLLING
        combatant.target = null
        combatant.previousState = undefined
      }
    }
  }

  private shouldInitiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    countNearbyEnemies: (
      combatant: Combatant,
      radius: number,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: SpatialOctree
    ) => number,
    playerPosition: THREE.Vector3,
    spatialGrid?: SpatialOctree
  ): boolean {
    if (!combatant.squadId) return false

    const squad = this.squads.get(combatant.squadId)
    if (!squad || squad.members.length < 3) return false

    const lastSuppression = this.squadSuppressionCooldown.get(combatant.squadId) || 0
    if (Date.now() - lastSuppression < 10000) return false

    const distance = combatant.position.distanceTo(targetPos)

    if (distance < 30 || distance > 80) return false

    const nearbyEnemies = countNearbyEnemies(combatant, 40, targetPos, allCombatants, spatialGrid)

    let lowHealthSquadmate = false
    squad.members.forEach(memberId => {
      const member = allCombatants.get(memberId)
      if (member && member.health < member.maxHealth * 0.4) {
        lowHealthSquadmate = true
      }
    })

    return nearbyEnemies >= 2 || lowHealthSquadmate
  }

  initiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    findNearestCover: (combatant: Combatant, threatPosition: THREE.Vector3) => THREE.Vector3 | null
  ): void {
    if (!combatant.squadId) return

    const squad = this.squads.get(combatant.squadId)
    if (!squad) return

    this.squadSuppressionCooldown.set(combatant.squadId, Date.now())

    squad.members.forEach((memberId, index) => {
      const member = allCombatants.get(memberId)
      if (!member || member.state === CombatantState.DEAD) return

      if (member.squadRole === 'leader' || index === 1) {
        member.state = CombatantState.SUPPRESSING
        member.suppressionTarget = targetPos.clone()
        member.suppressionEndTime = Date.now() + 3000 + Math.random() * 2000
        member.lastKnownTargetPos = targetPos.clone()
        member.alertTimer = 5.0
        member.isFullAuto = true
        member.skillProfile.burstLength = 8
        member.skillProfile.burstPauseMs = 150
      } else {
        member.state = CombatantState.ADVANCING

        const flankLeft = index % 2 === 0
        const flankingAngle = this.calculateFlankingAngle(member.position, targetPos, flankLeft)
        const flankingDistance = 25 + Math.random() * 15

        const flankingPos = new THREE.Vector3(
          targetPos.x + Math.cos(flankingAngle) * flankingDistance,
          0,
          targetPos.z + Math.sin(flankingAngle) * flankingDistance
        )

        const coverNearFlank = findNearestCover(
          { ...member, position: flankingPos } as Combatant,
          targetPos
        )

        member.destinationPoint = coverNearFlank || flankingPos
        member.isFlankingMove = true
      }
    })

    console.log(`🎯 Squad ${combatant.squadId} initiating coordinated suppression & flank on target at (${Math.floor(targetPos.x)}, ${Math.floor(targetPos.z)})`)
  }

  private calculateFlankingAngle(
    attackerPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    flankLeft: boolean
  ): number {
    const toAttacker = new THREE.Vector3().subVectors(attackerPos, targetPos)
    const currentAngle = Math.atan2(toAttacker.z, toAttacker.x)
    const flankingOffset = flankLeft ? Math.PI / 2 : -Math.PI / 2
    return currentAngle + flankingOffset
  }
}
