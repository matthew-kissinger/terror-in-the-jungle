// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { Combatant, CombatantState, ITargetable, Squad, isPlayerTarget } from '../types'
import { ISpatialQuery } from '../SpatialOctree'
import { Logger } from '../../../utils/Logger'
import { resolveOrderIntent, isWithinLeash, isFallbackAcquisitionSuppressed } from '../SquadOrderPosture'
const _toDestination = new THREE.Vector3()
const _toTarget = new THREE.Vector3()
const _toCover = new THREE.Vector3()
const SEEKING_COVER_VISIBILITY_RECHECK_MS = 250
const ADVANCE_DESTINATION_RADIUS_SQ = 3.0 * 3.0
const ADVANCING_REACT_DISTANCE_SQ = 30 * 30
const ADVANCING_VERY_CLOSE_RANGE_SQ = 15 * 15
const SEEKING_COVER_ARRIVAL_RADIUS_SQ = 1.5 * 1.5

interface SeekingCoverVisibilitySample {
  targetId: string
  checkedAtMs: number
  visible: boolean
}

/**
 * Handles movement-related AI states (advancing, seeking cover)
 */
export class AIStateMovement {
  private seekingCoverVisibilityByCombatant = new WeakMap<Combatant, SeekingCoverVisibilitySample>()
  private squads: Map<string, Squad> = new Map()

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads
  }

  handleAdvancing(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: ISpatialQuery | undefined,
    findNearestEnemy: (
      combatant: Combatant,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => ITargetable | null,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    if (!combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING;
      return;
    }

    const distanceToDestinationSq = combatant.position.distanceToSquared(combatant.destinationPoint);
    if (distanceToDestinationSq < ADVANCE_DESTINATION_RADIUS_SQ) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      return;
    }

    const toDestination = _toDestination.subVectors(combatant.destinationPoint, combatant.position).normalize();
    combatant.rotation = Math.atan2(toDestination.z, toDestination.x);

    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy && this.isEnemyWithinCommandLeash(combatant, isPlayerTarget(enemy) ? playerPosition : enemy.position)) {
      const targetPos = isPlayerTarget(enemy) ? playerPosition : enemy.position;
      const distanceSq = combatant.position.distanceToSquared(targetPos);

      // At very close range, ALWAYS react - can't ignore enemy right next to you
      const veryCloseRange = distanceSq < ADVANCING_VERY_CLOSE_RANGE_SQ;

      if (distanceSq < ADVANCING_REACT_DISTANCE_SQ) {
        // Turn toward enemy before LOS check
        const toTarget = _toTarget.subVectors(targetPos, combatant.position).normalize();
        const savedRotation = combatant.rotation;
        combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

        if (veryCloseRange || canSeeTarget(combatant, enemy, playerPosition)) {
          combatant.state = CombatantState.ENGAGING;
          combatant.target = enemy;
          combatant.destinationPoint = undefined;
          combatant.isFlankingMove = false;
        } else {
          // Restore rotation if didn't engage
          combatant.rotation = savedRotation;
        }
      }
    }
  }

  handleSeekingCover(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    if (!combatant.coverPosition || !combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING;
      combatant.inCover = false;
      return;
    }

    const distanceToCoverSq = combatant.position.distanceToSquared(combatant.coverPosition);
    if (distanceToCoverSq < SEEKING_COVER_ARRIVAL_RADIUS_SQ) {
      combatant.inCover = true;
      combatant.state = CombatantState.ENGAGING;
      Logger.info('combat-ai', ` ${combatant.faction} unit reached cover, switching to peek-and-fire`);

    }

    const toCover = _toCover.subVectors(combatant.coverPosition, combatant.position).normalize();
    combatant.rotation = Math.atan2(toCover.z, toCover.x);

    if (
      combatant.target &&
      !this.hasSeekingCoverLineOfSight(combatant, combatant.target, playerPosition, canSeeTarget)
    ) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      combatant.inCover = false;
    }
  }

  /**
   * Acquisition gate for the ADVANCING (push) state (SVYAZ-4 Stage 2 leash +
   * Stage 3 ATTACK/FALL BACK). Returns true (acquire) unless a FALL BACK posture
   * is active and the unit is not pinned, or a non-ATTACK leashed order is active
   * and the enemy is past (leashRadius + engageBandPastLeash) of the anchor.
   *
   * ATTACK is the exception: a unit ADVANCING onto an attack objective ENGAGES EN
   * ROUTE (the spike's "engage en route" contract). The destination-anchored leash
   * would otherwise reject enemies near the advancing unit but far from the anchor,
   * so for an ATTACK posture this state does not gate by anchor distance — the
   * existing <30m close-range react logic in handleAdvancing bounds engagement.
   * Guarded so non-player / no-order combatants are byte-identical.
   */
  private isEnemyWithinCommandLeash(combatant: Combatant, enemyPosition: THREE.Vector3): boolean {
    const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined
    const intent = resolveOrderIntent(combatant, squad)
    if (isFallbackAcquisitionSuppressed(intent, combatant.lastHitTime, Date.now())) {
      return false
    }
    if (!intent.hasActiveOrder) return true
    if (intent.mode === 'attack') return true
    return isWithinLeash(intent, enemyPosition)
  }

  private hasSeekingCoverLineOfSight(
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): boolean {
    const now = Date.now()
    const sample = this.seekingCoverVisibilityByCombatant.get(combatant)
    if (
      sample &&
      sample.visible &&
      sample.targetId === target.id &&
      now - sample.checkedAtMs < SEEKING_COVER_VISIBILITY_RECHECK_MS
    ) {
      return true
    }

    const visible = canSeeTarget(combatant, target, playerPosition)
    this.seekingCoverVisibilityByCombatant.set(combatant, {
      targetId: target.id,
      checkedAtMs: now,
      visible,
    })
    return visible
  }

}
