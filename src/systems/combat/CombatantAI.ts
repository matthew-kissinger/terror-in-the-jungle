import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../weapons/SandbagSystem';

export class CombatantAI {
  private readonly FRIENDLY_FIRE_ENABLED = false;
  private readonly MAX_ENGAGEMENT_RANGE = 150;
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private squads: Map<string, Squad> = new Map();

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): void {
    switch (combatant.state) {
      case CombatantState.PATROLLING:
        this.handlePatrolling(combatant, deltaTime, playerPosition, allCombatants);
        break;
      case CombatantState.ALERT:
        this.handleAlert(combatant, deltaTime, playerPosition);
        break;
      case CombatantState.ENGAGING:
        this.handleEngaging(combatant, deltaTime, playerPosition, allCombatants);
        break;
      case CombatantState.SUPPRESSING:
        this.handleSuppressing(combatant, deltaTime);
        break;
    }
  }

  private handlePatrolling(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
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

    const enemy = this.findNearestEnemy(combatant, playerPosition, allCombatants);
    if (enemy) {
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position;
      const distance = combatant.position.distanceTo(targetPos);
      const toTarget = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize();
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

      if (this.canSeeTarget(combatant, enemy, playerPosition)) {
        if (this.shouldEngage(combatant, distance)) {
          combatant.state = CombatantState.ALERT;
          combatant.target = enemy;

          const rangeDelay = Math.floor(distance / 30) * 250;
          combatant.reactionTimer = (combatant.skillProfile.reactionDelayMs + rangeDelay) / 1000;
          combatant.alertTimer = 1.5;
          console.log(`🎯 ${combatant.faction} soldier spotted enemy at ${Math.round(distance)}m!`);
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

  private handleAlert(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3
  ): void {
    combatant.alertTimer -= deltaTime;
    combatant.reactionTimer -= deltaTime;

    if (combatant.reactionTimer <= 0 && combatant.target) {
      const targetPos = combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position;
      const toTarget = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize();
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

      if (this.canSeeTarget(combatant, combatant.target, playerPosition)) {
        combatant.state = CombatantState.ENGAGING;
        combatant.currentBurst = 0;
        console.log(`🔫 ${combatant.faction} soldier engaging!`);
      } else {
        combatant.state = CombatantState.PATROLLING;
        combatant.target = null;
      }
    }
  }

  private handleEngaging(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): void {
    if (!combatant.target || combatant.target.state === CombatantState.DEAD) {
      combatant.state = CombatantState.PATROLLING;
      combatant.target = null;
      combatant.isFullAuto = false;
      return;
    }

    const targetPos = combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position;
    const toTargetDir = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize();
    combatant.rotation = Math.atan2(toTargetDir.z, toTargetDir.x);

    const targetDistance = combatant.position.distanceTo(targetPos);
    combatant.isFullAuto = false;

    // Determine full auto conditions
    if (targetDistance < 15) {
      combatant.isFullAuto = true;
      combatant.skillProfile.burstLength = 8;
      combatant.skillProfile.burstPauseMs = 200;
    }

    const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000;
    if (timeSinceHit < 2.0) {
      combatant.panicLevel = Math.min(1.0, combatant.panicLevel + 0.3);
      if (combatant.panicLevel > 0.5) {
        combatant.isFullAuto = true;
        combatant.skillProfile.burstLength = 10;
        combatant.skillProfile.burstPauseMs = 150;
      }
    } else {
      combatant.panicLevel = Math.max(0, combatant.panicLevel - deltaTime * 0.2);
    }

    const nearbyEnemyCount = this.countNearbyEnemies(combatant, 20, playerPosition, allCombatants);
    if (nearbyEnemyCount > 2) {
      combatant.isFullAuto = true;
      combatant.skillProfile.burstLength = 6;
    }

    // Reset burst params if not full auto
    if (!combatant.isFullAuto) {
      const isLeader = combatant.squadRole === 'leader';
      if (combatant.faction === Faction.OPFOR) {
        combatant.skillProfile.burstLength = isLeader ? 4 : 3;
        combatant.skillProfile.burstPauseMs = isLeader ? 800 : 1000;
      } else {
        combatant.skillProfile.burstLength = 3;
        combatant.skillProfile.burstPauseMs = isLeader ? 900 : 1100;
      }
    }

    if (!this.canSeeTarget(combatant, combatant.target, playerPosition)) {
      combatant.lastKnownTargetPos = combatant.target.position.clone();
      combatant.state = CombatantState.SUPPRESSING;
      combatant.isFullAuto = true;
      combatant.skillProfile.burstLength = 12;
      combatant.skillProfile.burstPauseMs = 100;
      return;
    }

    combatant.lastKnownTargetPos = combatant.target.position.clone();
  }

  private handleSuppressing(combatant: Combatant, deltaTime: number): void {
    combatant.alertTimer -= deltaTime;

    if (combatant.alertTimer <= 0) {
      combatant.state = CombatantState.PATROLLING;
      combatant.target = null;
      combatant.lastKnownTargetPos = undefined;
    }
  }

  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): Combatant | null {
    let nearestEnemy: Combatant | null = null;
    let minDistance = combatant.skillProfile.visualRange;

    // Check player first if OPFOR
    if (combatant.faction === Faction.OPFOR) {
      const playerDistance = combatant.position.distanceTo(playerPosition);
      if (playerDistance < combatant.skillProfile.visualRange) {
        return {
          id: 'PLAYER',
          faction: Faction.US,
          position: playerPosition.clone(),
          velocity: new THREE.Vector3(),
          state: CombatantState.ENGAGING,
          health: 100,
          maxHealth: 100
        } as Combatant;
      }
    }

    // Check other combatants
    allCombatants.forEach(other => {
      if (other.faction === combatant.faction) return;
      if (other.state === CombatantState.DEAD) return;

      const distance = combatant.position.distanceTo(other.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearestEnemy = other;
      }
    });

    return nearestEnemy;
  }

  canSeeTarget(
    combatant: Combatant,
    target: Combatant,
    playerPosition: THREE.Vector3
  ): boolean {
    const targetPos = target.id === 'PLAYER' ? playerPosition : target.position;
    const distance = combatant.position.distanceTo(targetPos);

    if (distance > combatant.skillProfile.visualRange) return false;

    // Check FOV
    const toTarget = new THREE.Vector3()
      .subVectors(targetPos, combatant.position)
      .normalize();

    const forward = new THREE.Vector3(
      Math.cos(combatant.rotation),
      0,
      Math.sin(combatant.rotation)
    );

    const angle = Math.acos(forward.dot(toTarget));
    const halfFov = THREE.MathUtils.degToRad(combatant.skillProfile.fieldOfView / 2);

    if (angle > halfFov) return false;

    // Check terrain obstruction - only for high/medium LOD combatants for performance
    if (this.chunkManager && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

      // Create ray from combatant eye position to target
      const eyePos = combatant.position.clone();
      eyePos.y += 1.7; // Eye height

      const targetEyePos = targetPos.clone();
      targetEyePos.y += 1.7; // Target eye height

      const direction = new THREE.Vector3()
        .subVectors(targetEyePos, eyePos)
        .normalize();

      const terrainHit = this.chunkManager.raycastTerrain(eyePos, direction, distance);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        // Terrain blocks line of sight (with small buffer to avoid edge cases)
        return false;
      }
    }

    // Check sandbag obstruction
    if (this.sandbagSystem) {
      const eyePos = combatant.position.clone();
      eyePos.y += 1.7;

      const targetEyePos = targetPos.clone();
      targetEyePos.y += 1.7;

      const direction = new THREE.Vector3()
        .subVectors(targetEyePos, eyePos)
        .normalize();

      const ray = new THREE.Ray(eyePos, direction);
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const intersection = ray.intersectBox(bounds, new THREE.Vector3());
        if (intersection && eyePos.distanceTo(intersection) < distance) {
          return false;
        }
      }
    }

    return true;
  }

  private shouldEngage(combatant: Combatant, distance: number): boolean {
    // Objective-focused combatants only engage at close range or when shot
    if (combatant.isObjectiveFocused) {
      const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000;
      const recentlyShot = timeSinceHit < 3.0;

      // Only engage if close or recently shot
      if (distance > 30 && !recentlyShot) {
        return false;
      }
    }

    // Distance-based engagement probability
    let engageProbability = 1.0;
    if (distance < 30) {
      engageProbability = 1.0; // Always engage at close range
    } else if (distance < 60) {
      engageProbability = 0.8; // 80% chance at mid range
    } else if (distance < 90) {
      engageProbability = 0.5; // 50% chance at long range
    } else {
      engageProbability = 0.2; // 20% chance at extreme range
    }

    return Math.random() < engageProbability;
  }

  private countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): number {
    let count = 0;

    if (combatant.faction === Faction.OPFOR) {
      if (combatant.position.distanceTo(playerPosition) < radius) {
        count++;
      }
    }

    allCombatants.forEach(other => {
      if (other.faction !== combatant.faction &&
          other.state !== CombatantState.DEAD &&
          other.position.distanceTo(combatant.position) < radius) {
        count++;
      }
    });

    return count;
  }

  /**
   * Set the chunk manager for terrain obstruction checks
   */
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }
}