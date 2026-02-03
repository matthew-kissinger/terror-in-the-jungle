import * as THREE from 'three';
import { Combatant, CombatantState, Squad, SquadCommand } from '../types';
import { SpatialOctree } from '../SpatialOctree';
import { ZoneManager } from '../../world/ZoneManager';
import { clusterManager } from '../ClusterManager';
import { spatialGridManager } from '../SpatialGridManager';

/**
 * Handles patrol state behavior including squad commands and zone defense assignment
 */
export class AIStatePatrol {
  private zoneManager?: ZoneManager;
  private squads: Map<string, Squad> = new Map();
  private zoneDefenders: Map<string, Set<string>> = new Map();

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  getZoneDefenders(): Map<string, Set<string>> {
    return this.zoneDefenders;
  }

  handlePatrolling(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree | undefined,
    findNearestEnemy: (
      combatant: Combatant,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: SpatialOctree
    ) => Combatant | null,
    canSeeTarget: (
      combatant: Combatant,
      target: Combatant,
      playerPosition: THREE.Vector3
    ) => boolean,
    shouldEngage: (combatant: Combatant, distance: number) => boolean
  ): void {
    const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined;

    if (combatant.isRejoiningSquad) {
      return;
    }

    if (squad?.isPlayerControlled && squad.currentCommand &&
        squad.currentCommand !== SquadCommand.NONE &&
        squad.currentCommand !== SquadCommand.FREE_ROAM) {
      this.handleSquadCommand(combatant, squad, playerPosition, deltaTime);
    }

    // Check if should transition to zone defense
    if (this.shouldAssignZoneDefense(combatant)) {
      this.assignZoneDefense(combatant);
      if (combatant.state === CombatantState.DEFENDING) {
        return;
      }
    }

    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy) {
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position;
      const distance = combatant.position.distanceTo(targetPos);
      const toTarget = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize();
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

      // At very close range (<15m), NPCs should ALWAYS detect and engage
      // regardless of LOS checks - they would hear footsteps, see peripheral movement, etc.
      const veryCloseRange = distance < 15;

      if (veryCloseRange || canSeeTarget(combatant, enemy, playerPosition)) {
        // At close range, always engage. At longer range, use probability
        if (veryCloseRange || shouldEngage(combatant, distance)) {
          combatant.state = CombatantState.ALERT;
          combatant.target = enemy;

          // Calculate base reaction delay
          const rangeDelay = veryCloseRange ? 0 : Math.floor(distance / 30) * 250;
          let baseDelay = (combatant.skillProfile.reactionDelayMs * (veryCloseRange ? 0.3 : 1) + rangeDelay);

          // In clusters, stagger reactions to prevent synchronized behavior
          if (spatialGridManager.getIsInitialized()) {
            const clusterDensity = clusterManager.getClusterDensity(combatant, allCombatants, spatialGridManager);
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

  private handleSquadCommand(
    combatant: Combatant,
    squad: Squad,
    playerPosition: THREE.Vector3,
    deltaTime: number
  ): void {
    switch (squad.currentCommand) {
      case SquadCommand.FOLLOW_ME:
        const memberIndex = squad.members.indexOf(combatant.id);
        const spacing = 4;
        const angle = (memberIndex / squad.members.length) * Math.PI * 2;
        const offset = new THREE.Vector3(
          Math.cos(angle) * spacing,
          0,
          Math.sin(angle) * spacing
        );
        const targetPos = playerPosition.clone().add(offset);
        const distanceToTarget = combatant.position.distanceTo(targetPos);

        if (distanceToTarget > 2) {
          combatant.destinationPoint = targetPos;
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
          const patrolRadius = 20;
          const basePos = squad.commandPosition;

          if (!combatant.destinationPoint ||
              combatant.position.distanceTo(combatant.destinationPoint) < 5) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * patrolRadius;
            combatant.destinationPoint = basePos.clone().add(new THREE.Vector3(
              Math.cos(angle) * distance,
              0,
              Math.sin(angle) * distance
            ));
          }
        }
        break;

      case SquadCommand.RETREAT:
        if (squad.commandPosition) {
          const retreatDistance = 50;
          const awayFromPlayer = new THREE.Vector3()
            .subVectors(combatant.position, playerPosition)
            .normalize()
            .multiplyScalar(retreatDistance);
          combatant.destinationPoint = squad.commandPosition.clone().add(awayFromPlayer);
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

  private shouldAssignZoneDefense(combatant: Combatant): boolean {
    if (!this.zoneManager) return false;
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

  private assignZoneDefense(combatant: Combatant): void {
    if (!this.zoneManager) return;

    combatant.lastDefenseReassignTime = Date.now();

    // Find nearby zones owned by this faction
    const nearbyOwnedZones = this.zoneManager.getAllZones()
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

        console.log(`🛡️ ${combatant.faction} defender assigned to zone ${zone.id} (${defenders.size}/${maxDefenders} defenders)`);
        return;
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
}
