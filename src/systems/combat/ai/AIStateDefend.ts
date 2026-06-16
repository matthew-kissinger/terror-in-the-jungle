// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Combatant, CombatantState, ITargetable, Squad, isPlayerTarget } from '../types';
import { ISpatialQuery } from '../SpatialOctree';
import type { IZoneQuery } from '../../../types/SystemInterfaces';
import { clusterManager } from '../ClusterManager';
import { resolveOrderIntent, isWithinLeash, isFallbackAcquisitionSuppressed } from '../SquadOrderPosture';

const _toTarget = new THREE.Vector3();
const _toDefensePos = new THREE.Vector3();
const _toZone = new THREE.Vector3();

/**
 * Handles defensive zone holding behavior
 */
export class AIStateDefend {
  private zoneQuery?: IZoneQuery;
  private squads: Map<string, Squad> = new Map();

  setZoneManager(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
  }

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  handleDefending(
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
    ) => boolean,
    getClusterDensity?: (
      combatant: Combatant,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => number
  ): void {
    // Check for nearby enemies - defenders engage if threatened
    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy && this.isEnemyWithinCommandLeash(combatant, isPlayerTarget(enemy) ? playerPosition : enemy.position)) {
      const targetPos = isPlayerTarget(enemy) ? playerPosition : enemy.position;
      const distanceSq = combatant.position.distanceToSquared(targetPos);

      // At very close range (<15m), defenders should ALWAYS react regardless of facing
      // This prevents the "standing right next to them" issue
      const veryCloseRange = distanceSq < 225;

      if (distanceSq < 2500) {
        const distance = veryCloseRange ? 0 : Math.sqrt(distanceSq);

        // Turn to face the enemy BEFORE checking LOS
        // This fixes the bug where defenders facing outward wouldn't see approaching enemies
        _toTarget.subVectors(targetPos, combatant.position);
        if (!veryCloseRange && distance > 0) {
          _toTarget.multiplyScalar(1 / distance);
        } else {
          _toTarget.normalize();
        }
        combatant.rotation = Math.atan2(_toTarget.z, _toTarget.x);

        // At very close range, skip LOS check entirely - they would hear/sense you
        if (veryCloseRange || canSeeTarget(combatant, enemy, playerPosition)) {
          combatant.state = CombatantState.ALERT;
          combatant.target = enemy;
          combatant.previousState = CombatantState.DEFENDING;

          // Calculate base reaction delay
          const rangeDelay = veryCloseRange ? 0 : Math.floor(distance / 30) * 250;
          let baseDelay = (combatant.skillProfile.reactionDelayMs * (veryCloseRange ? 0.3 : 1) + rangeDelay);

          // In clusters, stagger reactions to prevent synchronized behavior
          if (spatialGrid) {
            const clusterDensity = getClusterDensity
              ? getClusterDensity(combatant, allCombatants, spatialGrid)
              : this.getClusterDensity(combatant, allCombatants, spatialGrid);
            if (clusterDensity > 0.3) {
              baseDelay = clusterManager.getStaggeredReactionDelay(baseDelay, clusterDensity);
            }
          }

          combatant.reactionTimer = baseDelay / 1000;
          combatant.alertTimer = 1.5;
          return;
        }
      }
    }

    if (!combatant.defensePosition) {
      combatant.state = CombatantState.PATROLLING;
      combatant.defendingZoneId = undefined;
      return;
    }

    const distanceToDefensePosSq = combatant.position.distanceToSquared(combatant.defensePosition);
    if (distanceToDefensePosSq > 9) {
      const distanceToDefensePos = Math.sqrt(distanceToDefensePosSq);

      combatant.destinationPoint = combatant.defensePosition.clone();
      _toDefensePos
        .subVectors(combatant.defensePosition, combatant.position)
        .multiplyScalar(1 / distanceToDefensePos);
      combatant.rotation = Math.atan2(_toDefensePos.z, _toDefensePos.x);
    } else {
      combatant.destinationPoint = undefined;
      if (combatant.defendingZoneId && this.zoneQuery) {
        const zone = this.zoneQuery.getZoneById(combatant.defendingZoneId);
        if (zone) {
          _toZone
            .subVectors(zone.position, combatant.position);
          const outwardAngle = Math.atan2(_toZone.z, _toZone.x) + Math.PI;
          combatant.rotation = outwardAngle;
        }
      }
    }
  }

  /**
   * Acquisition gate for player-commanded squads (SVYAZ-4 Stage 2 leash + Stage 3
   * FALL BACK). Returns true (acquire) unless a leashed order is active and the
   * enemy is past (leashRadius + engageBandPastLeash) of the anchor, or a FALL
   * BACK posture is active and the unit is not pinned (not hit within the panic
   * window). Guarded so non-player / no-order combatants are byte-identical.
   */
  private isEnemyWithinCommandLeash(combatant: Combatant, enemyPosition: THREE.Vector3): boolean {
    const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined;
    const intent = resolveOrderIntent(combatant, squad);
    if (isFallbackAcquisitionSuppressed(intent, combatant.lastHitTime, Date.now())) {
      return false;
    }
    if (!intent.hasActiveOrder) return true;
    return isWithinLeash(intent, enemyPosition);
  }

  private getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid: ISpatialQuery
  ): number {
    const CLUSTER_RADIUS = 15;
    const CLUSTER_RADIUS_SQ = CLUSTER_RADIUS * CLUSTER_RADIUS;
    const nearbyIds = spatialGrid.queryRadius(combatant.position, CLUSTER_RADIUS);
    let nearbyCount = 0;
    const maxExpected = 10;

    for (const id of nearbyIds) {
      if (id === combatant.id) continue;
      const other = allCombatants.get(id);
      if (!other) continue;
      if (other.state === CombatantState.DEAD) continue;
      if (combatant.position.distanceToSquared(other.position) < CLUSTER_RADIUS_SQ) {
        nearbyCount++;
      }
    }

    return Math.min(1, nearbyCount / maxExpected);
  }
}
