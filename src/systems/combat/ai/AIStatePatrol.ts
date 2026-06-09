// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { Combatant, CombatantState, ITargetable, Squad, SquadCommand, isPlayerTarget } from '../types'
import type { IZoneQuery } from '../../../types/SystemInterfaces'
import { Logger } from '../../../utils/Logger'
import { ISpatialQuery } from '../SpatialOctree'
import { clusterManager } from '../ClusterManager'
import { NpcLodConfig } from '../../../config/CombatantConfig'
import { resolveOrderIntent, isWithinLeash, isFallbackAcquisitionSuppressed, resolveFallbackRally } from '../SquadOrderPosture'
import { SquadCommandConfig } from '../../../config/SquadCommandConfig'

const _toTarget = new THREE.Vector3()
const _offset = new THREE.Vector3()
const PATROL_VISIBILITY_RECHECK_MS = 250

interface PatrolVisibilitySample {
  targetId: string
  checkedAtMs: number
  visible: boolean
}

/**
 * Handles patrolling and defending AI states
 */
export class AIStatePatrol {
  private zoneQuery?: IZoneQuery;
  private squads: Map<string, Squad> = new Map();
  private zoneDefenders: Map<string, Set<string>> = new Map();
  private patrolVisibilityByCombatant = new WeakMap<Combatant, PatrolVisibilitySample>();

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  setZoneManager(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
  }

  getZoneDefenders(): Map<string, Set<string>> {
    return this.zoneDefenders;
  }

  handlePatrolling(
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
    shouldEngage: (combatant: Combatant, distance: number) => boolean,
    getClusterDensity?: (
      combatant: Combatant,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => number
  ): void {
    const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined;

    if (combatant.isRejoiningSquad) {
      // Rejoin watchdog: if rejoin has dragged on, drop the gate so engagement
      // detection resumes. Movement-side handler also clears the flag, but
      // doing it here too prevents skipping a tick of perception.
      if (combatant.rejoinStartedAtMs !== undefined &&
          performance.now() - combatant.rejoinStartedAtMs > NpcLodConfig.rejoinTimeoutMs) {
        combatant.isRejoiningSquad = false;
        combatant.rejoinStartedAtMs = undefined;
      } else {
        return;
      }
    }

    if (squad?.isPlayerControlled && squad.currentCommand &&
        squad.currentCommand !== SquadCommand.NONE &&
        squad.currentCommand !== SquadCommand.FREE_ROAM) {
      this.handleSquadCommand(combatant, squad, playerPosition, deltaTime);
    }

    // Check if should transition to zone defense
    if (this.shouldAssignZoneDefense(combatant)) {
      this.assignZoneDefense(combatant, allCombatants);
      if (combatant.state === CombatantState.DEFENDING) {
        return;
      }
    }

    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy) {
      const targetPos = isPlayerTarget(enemy) ? playerPosition : enemy.position;

      // Persistence leash (SVYAZ-4 Stage 2): a player-commanded squad on a
      // standing HOLD/ATTACK/PATROL order engages threats near its anchor but
      // does not get baited into chasing one past the leash. Off the commanded
      // path (non-player squad / no active order) this is a no-op and the scan
      // proceeds byte-identically.
      if (!this.isEnemyWithinCommandLeash(combatant, squad, targetPos)) {
        return;
      }

      const distance = combatant.position.distanceTo(targetPos);
      const toTarget = _toTarget.subVectors(targetPos, combatant.position).normalize();
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

      // At very close range (<15m), NPCs should ALWAYS detect and engage
      // regardless of LOS checks - they would hear footsteps, see peripheral movement, etc.
      const veryCloseRange = distance < 15;

      if (veryCloseRange || this.hasPatrolLineOfSight(combatant, enemy, playerPosition, canSeeTarget)) {
        // At close range, always engage. At longer range, use probability
        if (veryCloseRange || shouldEngage(combatant, distance)) {
          combatant.state = CombatantState.ALERT;
          combatant.target = enemy;

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
        }
      }
    }
  }

  /**
   * Acquisition gate for player-commanded squads (SVYAZ-4 Stage 2 leash + Stage 3
   * FALL BACK). Returns true (acquire) unless:
   * - a leashed order (HOLD/ATTACK/PATROL) is active AND the enemy sits beyond
   *   (leashRadius + engageBandPastLeash) of the anchor, or
   * - a FALL BACK posture is active AND the unit is not pinned (not hit within the
   *   panic window) — it runs to rally rather than turning to fight.
   * Guarded so non-player / no-order combatants are byte-identical.
   */
  private isEnemyWithinCommandLeash(
    combatant: Combatant,
    squad: Squad | undefined,
    enemyPosition: THREE.Vector3
  ): boolean {
    const intent = resolveOrderIntent(combatant, squad);
    if (isFallbackAcquisitionSuppressed(intent, combatant.lastHitTime, Date.now())) {
      return false;
    }
    if (!intent.hasActiveOrder) return true;
    return isWithinLeash(intent, enemyPosition);
  }

  private handleSquadCommand(
    combatant: Combatant,
    squad: Squad,
    playerPosition: THREE.Vector3,
    _deltaTime: number
  ): void {
    switch (squad.currentCommand) {
      case SquadCommand.FOLLOW_ME:
        const memberIndex = squad.members.indexOf(combatant.id);
        const spacing = 4;
        const angle = (memberIndex / squad.members.length) * Math.PI * 2;
        
        _offset.set(
          playerPosition.x + Math.cos(angle) * spacing,
          playerPosition.y,
          playerPosition.z + Math.sin(angle) * spacing
        );
        
        const targetPos = _offset;
        const distanceToTarget = combatant.position.distanceTo(targetPos);

        if (distanceToTarget > 2) {
          combatant.destinationPoint = targetPos.clone();
        } else {
          combatant.destinationPoint = undefined;
        }
        break;

      case SquadCommand.HOLD_POSITION:
        if (squad.commandPosition && combatant.position.distanceTo(squad.commandPosition) > 3) {
          combatant.destinationPoint = squad.commandPosition.clone();
        } else {
          combatant.destinationPoint = undefined;
        }
        break;

      case SquadCommand.PATROL_HERE:
        if (squad.commandPosition) {
          // Roam radius from config so the wander destination and the Stage 2
          // acquisition leash agree on the area the squad is responsible for. The
          // RNG wander lives here (the non-pure AI side), not in SquadOrderPosture.
          const patrolRadius = SquadCommandConfig.patrolRoamRadius;
          const basePos = squad.commandPosition;

          if (!combatant.destinationPoint ||
              combatant.position.distanceTo(combatant.destinationPoint) < 5) {
            const angle = Math.random() * Math.PI * 2;
            // Math.sqrt keeps the wander point inside the radius with uniform area
            // coverage; either way |offset| <= patrolRadius so roam stays leashed.
            const distance = Math.sqrt(Math.random()) * patrolRadius;

            _offset.set(
              basePos.x + Math.cos(angle) * distance,
              basePos.y,
              basePos.z + Math.sin(angle) * distance
            );
            combatant.destinationPoint = _offset.clone();
          }
        }
        break;

      case SquadCommand.ATTACK_HERE:
        // ATTACK pushes onto the anchor through the ADVANCING state (set by
        // applySquadCommandOverride). If the unit is still PATROLLING here (e.g.
        // it just arrived and ADVANCING self-terminated), keep it heading to the
        // anchor until it is on the objective footprint.
        if (squad.commandPosition &&
            combatant.position.distanceTo(squad.commandPosition) > SquadCommandConfig.attackArriveRadius) {
          combatant.destinationPoint = squad.commandPosition.clone();
        } else {
          combatant.destinationPoint = undefined;
        }
        break;

      case SquadCommand.RETREAT:
        // FALL BACK rally: head to the marked point if set, else the live player
        // (when fallBackRallyToPlayer). Shared with applySquadCommandOverride so
        // both agree — no more retreat-away-from-player vector that fought the
        // marked rally point.
        {
          const rally = resolveFallbackRally(squad, playerPosition);
          if (rally) {
            combatant.destinationPoint = rally;
          }
        }
        break;

      case SquadCommand.FREE_ROAM:
        combatant.destinationPoint = undefined;
        break;

      case SquadCommand.NONE:
        combatant.destinationPoint = undefined;
        break;

      default:
        break;
    }
  }

  private hasPatrolLineOfSight(
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): boolean {
    const now = Date.now();
    const sample = this.patrolVisibilityByCombatant.get(combatant);
    if (
      sample &&
      sample.targetId === target.id &&
      now - sample.checkedAtMs < PATROL_VISIBILITY_RECHECK_MS
    ) {
      return sample.visible;
    }

    const visible = canSeeTarget(combatant, target, playerPosition);
    this.patrolVisibilityByCombatant.set(combatant, {
      targetId: target.id,
      checkedAtMs: now,
      visible,
    });
    return visible;
  }

  private shouldAssignZoneDefense(combatant: Combatant): boolean {
    if (!this.zoneQuery) return false;
    if (combatant.squadRole === 'leader') return false;
    if (combatant.isObjectiveFocused) return false;
    if (!combatant.squadId) return false;

    const squad = this.squads.get(combatant.squadId);
    if (!squad || squad.isPlayerControlled) return false;

    // Only reassign every 5 seconds
    const now = Date.now();
    if (combatant.lastDefenseReassignTime &&
        (now - combatant.lastDefenseReassignTime) < 5000) {
      return false;
    }

    return true;
  }

  private assignZoneDefense(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>
  ): void {
    if (!this.zoneQuery) return;

    combatant.lastDefenseReassignTime = Date.now();

    // Find nearby zones owned by this faction
    const nearbyOwnedZones = this.zoneQuery.getAllZones()
      .filter(zone => {
        if (zone.owner !== combatant.faction) return false;
        if (zone.isHomeBase) return false;

        const distance = combatant.position.distanceTo(zone.position);
        return distance < 60;
      })
      .sort((a, b) => {
        const distA = combatant.position.distanceTo(a.position);
        const distB = combatant.position.distanceTo(b.position);
        return distA - distB;
      });

    if (nearbyOwnedZones.length === 0) return;

    // Pick a zone that needs defenders
    for (const zone of nearbyOwnedZones) {
      const defenders = this.zoneDefenders.get(zone.id) || new Set();
      // Shed stale ids before counting slots. zoneDefenders Sets only ever grow
      // otherwise, so dead/despawned combatants permanently occupy slots and the
      // zone "looks defended" while starving of fresh defenders late in a match.
      // allCombatants is the per-tick liveness surface already threaded through
      // handlePatrolling, so pruning here is the cheapest reliable signal — no
      // new death-event pipeline needed (the unified death handler is a sibling
      // task's domain). An id is stale if it's gone from the map (despawned) or
      // present but DEAD.
      this.pruneStaleDefenders(defenders, allCombatants);
      const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined;
      const squadSize = squad ? squad.members.length : 1;

      // Assign 1-2 defenders per zone based on squad size
      const maxDefenders = Math.min(2, Math.floor(squadSize / 2));

      if (defenders.size < maxDefenders) {
        // Assign this combatant to defend this zone
        defenders.add(combatant.id);
        this.zoneDefenders.set(zone.id, defenders);

        combatant.state = CombatantState.DEFENDING;
        combatant.defendingZoneId = zone.id;
        combatant.defensePosition = this.calculateDefensePosition(zone, combatant, defenders.size - 1);
        combatant.destinationPoint = combatant.defensePosition.clone();

        Logger.info('combat-ai', ` ${combatant.faction} defender assigned to zone ${zone.id} (${defenders.size}/${maxDefenders} defenders)`);
        return;
      }
    }
  }

  /**
   * Remove ids from a zone's defender Set whose combatant is no longer a live
   * defender — either despawned (absent from allCombatants) or DEAD. Keeps the
   * slot accounting honest so freed slots can be reclaimed.
   */
  private pruneStaleDefenders(
    defenders: Set<string>,
    allCombatants: Map<string, Combatant>
  ): void {
    for (const id of defenders) {
      const c = allCombatants.get(id);
      if (!c || c.state === CombatantState.DEAD) {
        defenders.delete(id);
      }
    }
  }

  private calculateDefensePosition(
    zone: { position: THREE.Vector3; radius: number },
    combatant: Combatant,
    defenderIndex: number
  ): THREE.Vector3 {
    // Position defenders around zone perimeter facing outward
    const radius = zone.radius + 8;
    const numPositions = 4;

    const angle = (defenderIndex / numPositions) * Math.PI * 2;
    const position = new THREE.Vector3(
      zone.position.x + Math.cos(angle) * radius,
      0,
      zone.position.z + Math.sin(angle) * radius
    );

    position.y = zone.position.y;

    return position;
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
