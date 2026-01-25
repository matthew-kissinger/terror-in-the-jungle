import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager, CaptureZone } from '../world/ZoneManager';
import { objectPool } from '../../utils/ObjectPoolManager';

export class CombatantAI {
  private readonly FRIENDLY_FIRE_ENABLED = false;
  private readonly MAX_ENGAGEMENT_RANGE = 150;
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private zoneManager?: ZoneManager;
  private squads: Map<string, Squad> = new Map();
  private squadSuppressionCooldown: Map<string, number> = new Map();
  private zoneDefenders: Map<string, Set<string>> = new Map(); // zoneId -> set of defender IDs

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    // Decay suppression effects over time
    this.decaySuppressionEffects(combatant, deltaTime)

    switch (combatant.state) {
      case CombatantState.PATROLLING:
        this.handlePatrolling(combatant, deltaTime, playerPosition, allCombatants, spatialGrid);
        break;
      case CombatantState.ALERT:
        this.handleAlert(combatant, deltaTime, playerPosition);
        break;
      case CombatantState.ENGAGING:
        this.handleEngaging(combatant, deltaTime, playerPosition, allCombatants, spatialGrid);
        break;
      case CombatantState.SUPPRESSING:
        this.handleSuppressing(combatant, deltaTime);
        break;
      case CombatantState.ADVANCING:
        this.handleAdvancing(combatant, deltaTime, playerPosition, allCombatants, spatialGrid);
        break;
      case CombatantState.SEEKING_COVER:
        this.handleSeekingCover(combatant, deltaTime, playerPosition, allCombatants);
        break;
      case CombatantState.DEFENDING:
        this.handleDefending(combatant, deltaTime, playerPosition, allCombatants, spatialGrid);
        break;
    }
  }

  private decaySuppressionEffects(combatant: Combatant, deltaTime: number): void {
    // Decay near miss count over time (3 seconds without hits)
    if (combatant.lastSuppressedTime) {
      const timeSinceSuppressed = (Date.now() - combatant.lastSuppressedTime) / 1000
      if (timeSinceSuppressed > 3.0) {
        combatant.nearMissCount = Math.max(0, (combatant.nearMissCount || 0) - deltaTime * 0.5)
        if (combatant.nearMissCount <= 0) {
          combatant.nearMissCount = 0
          combatant.lastSuppressedTime = undefined
        }
      }
    }

    // Panic naturally decays (handled in handleEngaging already)
    // Suppression level decays faster
    combatant.suppressionLevel = Math.max(0, combatant.suppressionLevel - deltaTime * 0.3)
  }

  private handlePatrolling(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
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

    const enemy = this.findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
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

      } else {
        // Return to previous state if was defending, else patrol
        combatant.state = combatant.previousState === CombatantState.DEFENDING ?
          CombatantState.DEFENDING : CombatantState.PATROLLING;
        combatant.target = null;
        combatant.previousState = undefined;
      }
    }
  }

  private handleEngaging(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    if (!combatant.target || combatant.target.state === CombatantState.DEAD) {
      // Return to previous state if was defending, else patrol
      combatant.state = combatant.previousState === CombatantState.DEFENDING ?
        CombatantState.DEFENDING : CombatantState.PATROLLING;
      combatant.target = null;
      combatant.isFullAuto = false;
      combatant.previousState = undefined;
      combatant.inCover = false;
      return;
    }

    const targetPos = combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position;
    const toTargetDir = new THREE.Vector3().subVectors(targetPos, combatant.position).normalize();
    combatant.rotation = Math.atan2(toTargetDir.z, toTargetDir.x);

    const targetDistance = combatant.position.distanceTo(targetPos);
    combatant.isFullAuto = false;

    // Peek-and-fire behavior when in cover
    if (combatant.inCover) {
      // While in cover, use controlled bursts with longer pauses
      combatant.skillProfile.burstLength = 2; // Short, controlled bursts
      combatant.skillProfile.burstPauseMs = 1500; // Longer pauses between bursts (ducking back)

      // If cover becomes flanked or invalid, leave cover
      if (this.isCoverFlanked(combatant, targetPos)) {
        console.log(`⚠️ ${combatant.faction} unit's cover is flanked, repositioning`);
        combatant.inCover = false;
        combatant.coverPosition = undefined;
      }
    } else {
      // Normal engagement behavior when not in cover

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

      // Check if should seek cover
      if (this.shouldSeekCover(combatant)) {
        const coverPosition = this.findNearestCover(combatant, targetPos);
        if (coverPosition) {
          combatant.state = CombatantState.SEEKING_COVER;
          combatant.coverPosition = coverPosition;
          combatant.destinationPoint = coverPosition;
          combatant.lastCoverSeekTime = Date.now();
          combatant.inCover = false;
          return;
        }
      }

      const nearbyEnemyCount = this.countNearbyEnemies(combatant, 20, playerPosition, allCombatants, spatialGrid);
      if (nearbyEnemyCount > 2) {
        combatant.isFullAuto = true;
        combatant.skillProfile.burstLength = 6;
      }

      // Check if squad should initiate suppression
      if (this.shouldInitiateSquadSuppression(combatant, targetPos, allCombatants)) {
        this.initiateSquadSuppression(combatant, targetPos, allCombatants)
        return
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
    }

    if (!this.canSeeTarget(combatant, combatant.target, playerPosition)) {
      combatant.lastKnownTargetPos = combatant.target.position.clone();
      combatant.state = CombatantState.SUPPRESSING;
      combatant.isFullAuto = true;
      combatant.skillProfile.burstLength = 12;
      combatant.skillProfile.burstPauseMs = 100;
      // Leave cover when suppressing
      combatant.inCover = false;
      return;
    }

    combatant.lastKnownTargetPos = combatant.target.position.clone();
  }

  private handleSuppressing(combatant: Combatant, deltaTime: number): void {
    // Check if suppression time expired
    if (combatant.suppressionEndTime && Date.now() > combatant.suppressionEndTime) {
      combatant.state = CombatantState.ENGAGING
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
      return
    }

    // Decay alert timer as backup
    combatant.alertTimer -= deltaTime

    if (combatant.alertTimer <= 0) {
      combatant.state = CombatantState.PATROLLING
      combatant.target = null
      combatant.lastKnownTargetPos = undefined
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
    }
  }

  private handleAdvancing(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    // If reached destination, switch to engaging
    if (!combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING
      return
    }

    const distanceToDestination = combatant.position.distanceTo(combatant.destinationPoint)
    if (distanceToDestination < 3.0) {
      combatant.state = CombatantState.ENGAGING
      combatant.destinationPoint = undefined
      return
    }

    // Continue moving toward destination
    const toDestination = new THREE.Vector3()
      .subVectors(combatant.destinationPoint, combatant.position)
      .normalize()
    combatant.rotation = Math.atan2(toDestination.z, toDestination.x)

    // Still check for enemies while advancing - can engage opportunistically
    const enemy = this.findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid)
    if (enemy) {
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position
      const distance = combatant.position.distanceTo(targetPos)

      // If enemy is very close (< 20m), engage immediately
      if (distance < 20 && this.canSeeTarget(combatant, enemy, playerPosition)) {
        combatant.state = CombatantState.ENGAGING
        combatant.target = enemy
        combatant.destinationPoint = undefined
      }
    }
  }

  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
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

    // Use spatial grid if available for optimized queries
    if (spatialGrid) {
      const nearbyIds = spatialGrid.queryRadius(combatant.position, combatant.skillProfile.visualRange);

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other) continue;
        if (other.faction === combatant.faction) continue;
        if (other.state === CombatantState.DEAD) continue;

        const distance = combatant.position.distanceTo(other.position);
        if (distance < minDistance) {
          minDistance = distance;
          nearestEnemy = other;
        }
      }
    } else {
      // Fallback to full iteration if spatial grid unavailable
      allCombatants.forEach(other => {
        if (other.faction === combatant.faction) return;
        if (other.state === CombatantState.DEAD) return;

        const distance = combatant.position.distanceTo(other.position);
        if (distance < minDistance) {
          minDistance = distance;
          nearestEnemy = other;
        }
      });
    }

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
    const toTarget = objectPool.getVector3();
    toTarget.subVectors(targetPos, combatant.position).normalize();

    const forward = objectPool.getVector3();
    forward.set(
      Math.cos(combatant.rotation),
      0,
      Math.sin(combatant.rotation)
    );

    const angle = Math.acos(forward.dot(toTarget));
    const halfFov = THREE.MathUtils.degToRad(combatant.skillProfile.fieldOfView / 2);

    if (angle > halfFov) {
      objectPool.releaseVector3(toTarget);
      objectPool.releaseVector3(forward);
      return false;
    }

    // Check terrain obstruction - only for high/medium LOD combatants for performance
    if (this.chunkManager && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

      // Create ray from combatant eye position to target
      const eyePos = objectPool.getVector3();
      eyePos.copy(combatant.position);
      eyePos.y += 1.7; // Eye height

      const targetEyePos = objectPool.getVector3();
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7; // Target eye height

      const direction = objectPool.getVector3();
      direction.subVectors(targetEyePos, eyePos).normalize();

      const terrainHit = this.chunkManager.raycastTerrain(eyePos, direction, distance);

      objectPool.releaseVector3(direction);
      objectPool.releaseVector3(targetEyePos);
      objectPool.releaseVector3(eyePos);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        // Terrain blocks line of sight (with small buffer to avoid edge cases)
        objectPool.releaseVector3(toTarget);
        objectPool.releaseVector3(forward);
        return false;
      }
    }

    // Check sandbag obstruction
    if (this.sandbagSystem) {
      const eyePos = objectPool.getVector3();
      eyePos.copy(combatant.position);
      eyePos.y += 1.7;

      const targetEyePos = objectPool.getVector3();
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7;

      const direction = objectPool.getVector3();
      direction.subVectors(targetEyePos, eyePos).normalize();

      const ray = new THREE.Ray(eyePos, direction);
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const intersectionPoint = objectPool.getVector3();
        const intersection = ray.intersectBox(bounds, intersectionPoint);
        if (intersection && eyePos.distanceTo(intersection) < distance) {
          objectPool.releaseVector3(intersectionPoint);
          objectPool.releaseVector3(direction);
          objectPool.releaseVector3(targetEyePos);
          objectPool.releaseVector3(eyePos);
          objectPool.releaseVector3(toTarget);
          objectPool.releaseVector3(forward);
          return false;
        }
        objectPool.releaseVector3(intersectionPoint);
      }

      objectPool.releaseVector3(direction);
      objectPool.releaseVector3(targetEyePos);
      objectPool.releaseVector3(eyePos);
    }

    objectPool.releaseVector3(toTarget);
    objectPool.releaseVector3(forward);
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
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): number {
    let count = 0;

    if (combatant.faction === Faction.OPFOR) {
      if (combatant.position.distanceTo(playerPosition) < radius) {
        count++;
      }
    }

    // Use spatial grid if available for optimized queries
    if (spatialGrid) {
      const nearbyIds = spatialGrid.queryRadius(combatant.position, radius);

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other) continue;
        if (other.faction !== combatant.faction &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceTo(combatant.position) < radius) {
          count++;
        }
      }
    } else {
      // Fallback to full iteration if spatial grid unavailable
      allCombatants.forEach(other => {
        if (other.faction !== combatant.faction &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceTo(combatant.position) < radius) {
          count++;
        }
      });
    }

    return count;
  }

  private handleSeekingCover(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): void {
    if (!combatant.coverPosition || !combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING;
      combatant.inCover = false;
      return;
    }

    // Check if reached cover position
    const distanceToCover = combatant.position.distanceTo(combatant.coverPosition);
    if (distanceToCover < 2) {
      combatant.inCover = true;
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      console.log(`🛡️ ${combatant.faction} unit reached cover, switching to peek-and-fire`);
      return;
    }

    // Continue moving toward cover
    const toCover = new THREE.Vector3()
      .subVectors(combatant.coverPosition, combatant.position)
      .normalize();
    combatant.rotation = Math.atan2(toCover.z, toCover.x);

    // Check if target is still visible - if lost sight, go back to engaging
    if (combatant.target && !this.canSeeTarget(combatant, combatant.target, playerPosition)) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      combatant.inCover = false;
    }
  }

  private shouldSeekCover(combatant: Combatant): boolean {
    // Only high/medium LOD combatants seek cover for performance
    if (combatant.lodLevel !== 'high' && combatant.lodLevel !== 'medium') {
      return false;
    }

    // Don't seek cover if already in cover
    if (combatant.inCover) {
      return false;
    }

    // Cooldown between cover seeks (3-5 seconds)
    const timeSinceLastCoverSeek = combatant.lastCoverSeekTime ?
      (Date.now() - combatant.lastCoverSeekTime) / 1000 : 999;
    if (timeSinceLastCoverSeek < 3) {
      return false;
    }

    // Trigger conditions
    const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000;
    const recentlyHit = timeSinceHit < 2.0;
    const lowHealth = combatant.health < combatant.maxHealth * 0.5;
    const highSuppression = combatant.suppressionLevel > 0.6;
    const inBurstCooldown = combatant.burstCooldown > 0.5; // Between bursts, good time for cover

    // Seek cover when:
    // 1. Recently hit or low health (existing)
    // 2. Under heavy suppression (new)
    // 3. In burst cooldown with enemies nearby (new - safe moment to reposition)
    return recentlyHit || lowHealth || highSuppression ||
           (inBurstCooldown && !!combatant.target && timeSinceHit < 5.0);
  }

  private findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    const MAX_SEARCH_RADIUS = 30;
    const SEARCH_SAMPLES = 16;
    const SANDBAG_PREFERRED_DISTANCE = 15; // Prefer sandbags within 15m
    const VEGETATION_COVER_DISTANCE = 3; // Distance to position behind vegetation
    let bestCoverPos: THREE.Vector3 | null = null;
    let bestCoverScore = -Infinity;

    // First, check sandbag cover positions if sandbag system available
    if (this.sandbagSystem) {
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        // Get center of sandbag
        const sandbagCenter = new THREE.Vector3();
        bounds.getCenter(sandbagCenter);

        const distanceToSandbag = combatant.position.distanceTo(sandbagCenter);

        // Only consider sandbags within search radius
        if (distanceToSandbag > MAX_SEARCH_RADIUS) continue;

        // Calculate cover position behind sandbag relative to threat
        const threatToSandbag = new THREE.Vector3()
          .subVectors(sandbagCenter, threatPosition)
          .normalize();

        // Position 2m behind sandbag center (away from threat)
        const coverPos = sandbagCenter.clone().add(threatToSandbag.multiplyScalar(2));

        // Verify this position provides cover from threat
        if (this.isSandbagCover(coverPos, sandbagCenter, bounds, threatPosition)) {
          // Score sandbag cover highly, especially if within preferred distance
          const distanceToCombatant = combatant.position.distanceTo(coverPos);

          // Base score inversely proportional to distance
          let score = 1 / (distanceToCombatant + 1);

          // Bonus for sandbags within preferred distance
          if (distanceToSandbag < SANDBAG_PREFERRED_DISTANCE) {
            score *= 2.0; // Double score for nearby sandbags
          }

          // Additional bonus for being closer to combatant than threat
          if (distanceToCombatant < distanceToSandbag) {
            score *= 1.5;
          }

          if (score > bestCoverScore) {
            bestCoverScore = score;
            bestCoverPos = coverPos.clone();
          }
        }
      }
    }

    // Check vegetation-based cover (trees, large ferns)
    if (this.chunkManager) {
      // Query nearby vegetation from global billboard system
      const vegetationCover = this.findVegetationCover(combatant.position, threatPosition, MAX_SEARCH_RADIUS);

      for (const vegPos of vegetationCover) {
        const distanceToCombatant = combatant.position.distanceTo(vegPos);
        const distanceToThreat = vegPos.distanceTo(threatPosition);

        // Calculate flanking angle score (perpendicular is better)
        const toThreat = new THREE.Vector3().subVectors(threatPosition, vegPos).normalize();
        const toCombatant = new THREE.Vector3().subVectors(combatant.position, vegPos).normalize();
        const flankingAngle = Math.abs(toThreat.dot(toCombatant));
        const flankingScore = 1 - flankingAngle; // Higher score for perpendicular positions

        // Score based on distance, LOS blocking, and flanking angle
        let score = (1 / (distanceToCombatant + 1)) * 1.5; // Base score, higher than terrain
        score *= (1 + flankingScore * 0.5); // Bonus for good flanking angle

        // Bonus if vegetation is between combatant and threat
        if (distanceToCombatant < distanceToThreat) {
          score *= 1.3;
        }

        if (score > bestCoverScore) {
          bestCoverScore = score;
          bestCoverPos = vegPos.clone();
        }
      }
    }

    // Then check terrain-based cover if chunk manager available
    if (this.chunkManager) {
      // Sample positions in a circle around the combatant
      for (let i = 0; i < SEARCH_SAMPLES; i++) {
        const angle = (i / SEARCH_SAMPLES) * Math.PI * 2;

        // Try multiple distances
        for (const radius of [10, 20, 30]) {
          const testPos = new THREE.Vector3(
            combatant.position.x + Math.cos(angle) * radius,
            0,
            combatant.position.z + Math.sin(angle) * radius
          );

          const terrainHeight = this.chunkManager.getHeightAt(testPos.x, testPos.z);
          testPos.y = terrainHeight;

          // Check if this position provides cover
          if (this.isPositionCover(testPos, combatant.position, threatPosition)) {
            // Score based on distance to combatant and cover quality
            const distanceToCombatant = combatant.position.distanceTo(testPos);
            const heightDifference = Math.abs(testPos.y - combatant.position.y);

            // Prefer closer positions with good height difference
            const score = (1 / (distanceToCombatant + 1)) * heightDifference;

            if (score > bestCoverScore) {
              bestCoverScore = score;
              bestCoverPos = testPos.clone();
            }
          }
        }
      }
    }

    return bestCoverPos;
  }

  /**
   * Find vegetation positions that can provide cover
   */
  private findVegetationCover(
    position: THREE.Vector3,
    threatPosition: THREE.Vector3,
    searchRadius: number
  ): THREE.Vector3[] {
    if (!this.chunkManager) return [];

    const coverPositions: THREE.Vector3[] = [];
    const VEGETATION_COVER_DISTANCE = 3;
    const MIN_COVER_HEIGHT = 1.5; // Minimum height difference to provide cover

    // Sample positions in a grid pattern around the combatant
    const gridSize = 12; // Increased density for better coverage
    const step = (searchRadius * 2) / gridSize;

    for (let x = -searchRadius; x <= searchRadius; x += step) {
      for (let z = -searchRadius; z <= searchRadius; z += step) {
        const samplePos = new THREE.Vector3(
          position.x + x,
          0,
          position.z + z
        );

        const distance = position.distanceTo(samplePos);
        if (distance > searchRadius || distance < 3) continue;

        // Check if there's significant vegetation density at this position
        // We use terrain height variation as a proxy for vegetation
        const localHeight = this.chunkManager.getHeightAt(samplePos.x, samplePos.z);
        const surroundingHeights = [
          this.chunkManager.getHeightAt(samplePos.x + 2, samplePos.z),
          this.chunkManager.getHeightAt(samplePos.x - 2, samplePos.z),
          this.chunkManager.getHeightAt(samplePos.x, samplePos.z + 2),
          this.chunkManager.getHeightAt(samplePos.x, samplePos.z - 2)
        ];

        const avgHeight = surroundingHeights.reduce((a, b) => a + b, 0) / surroundingHeights.length;
        const heightVariation = Math.abs(localHeight - avgHeight);

        // Improved vegetation detection:
        // 1. Height variation indicates terrain features or vegetation
        // 2. Elevated positions provide natural cover
        const hasHeightVariation = heightVariation > 0.8; // Increased threshold
        const isElevated = localHeight > position.y + MIN_COVER_HEIGHT;

        if (hasHeightVariation || isElevated) {
          // Calculate cover position behind this vegetation relative to threat
          const threatToVeg = new THREE.Vector3()
            .subVectors(samplePos, threatPosition)
            .normalize();

          const coverPos = samplePos.clone().add(
            threatToVeg.multiplyScalar(VEGETATION_COVER_DISTANCE)
          );
          coverPos.y = this.chunkManager.getHeightAt(coverPos.x, coverPos.z);

          // Verify cover position is actually behind the feature
          const coverToSample = new THREE.Vector3()
            .subVectors(samplePos, coverPos);
          const coverToThreat = new THREE.Vector3()
            .subVectors(threatPosition, coverPos);

          // Cover is valid if sample is between cover position and threat
          const dotProduct = coverToSample.normalize().dot(coverToThreat.normalize());
          if (dotProduct > 0.5) { // Feature blocks threat from this angle
            coverPositions.push(coverPos);
          }
        }
      }
    }

    return coverPositions;
  }

  private isPositionCover(
    coverPos: THREE.Vector3,
    combatantPos: THREE.Vector3,
    threatPos: THREE.Vector3
  ): boolean {
    if (!this.chunkManager) {
      return false;
    }

    // Height difference requirement - position must be higher than combatant's current position
    const heightDifference = coverPos.y - combatantPos.y;
    if (heightDifference < 1.0) {
      return false;
    }

    // Check if terrain blocks line of sight from threat to cover position
    const threatToCover = new THREE.Vector3()
      .subVectors(coverPos, threatPos)
      .normalize();

    const distance = coverPos.distanceTo(threatPos);

    // Ray from threat to cover position at eye height
    const threatEyePos = threatPos.clone();
    threatEyePos.y += 1.7;

    const coverEyePos = coverPos.clone();
    coverEyePos.y += 1.7;

    const direction = new THREE.Vector3()
      .subVectors(coverEyePos, threatEyePos)
      .normalize();

    const terrainHit = this.chunkManager.raycastTerrain(threatEyePos, direction, distance);

    // Cover is good if terrain blocks the shot
    return terrainHit.hit && terrainHit.distance! < distance - 1;
  }

  private isSandbagCover(
    coverPos: THREE.Vector3,
    sandbagCenter: THREE.Vector3,
    sandbagBounds: THREE.Box3,
    threatPos: THREE.Vector3
  ): boolean {
    // Verify cover position is behind sandbag relative to threat
    const threatToSandbag = new THREE.Vector3()
      .subVectors(sandbagCenter, threatPos);
    const threatToCover = new THREE.Vector3()
      .subVectors(coverPos, threatPos);

    // Cover position should be further from threat than sandbag center
    if (threatToCover.length() < threatToSandbag.length()) {
      return false;
    }

    // Check if sandbag blocks line of sight from threat to cover position
    const distance = coverPos.distanceTo(threatPos);

    // Ray from threat at eye height to cover position at eye height
    const threatEyePos = threatPos.clone();
    threatEyePos.y += 1.7;

    const coverEyePos = coverPos.clone();
    coverEyePos.y += 1.7;

    const direction = new THREE.Vector3()
      .subVectors(coverEyePos, threatEyePos)
      .normalize();

    const ray = new THREE.Ray(threatEyePos, direction);

    // Check intersection with sandbag bounds
    const intersection = ray.intersectBox(sandbagBounds, new THREE.Vector3());

    // Cover is good if sandbag blocks the shot
    if (intersection && threatEyePos.distanceTo(intersection) < distance - 0.5) {
      return true;
    }

    return false;
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

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  private handleDefending(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    // Check for nearby enemies - defenders engage if threatened
    const enemy = this.findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy) {
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position;
      const distance = combatant.position.distanceTo(targetPos);

      // If enemy is within 50m and visible, engage
      if (distance < 50 && this.canSeeTarget(combatant, enemy, playerPosition)) {
        combatant.state = CombatantState.ALERT;
        combatant.target = enemy;
        combatant.previousState = CombatantState.DEFENDING;

        const rangeDelay = Math.floor(distance / 30) * 250;
        combatant.reactionTimer = (combatant.skillProfile.reactionDelayMs + rangeDelay) / 1000;
        combatant.alertTimer = 1.5;
        return;
      }
    }

    // Hold defensive position
    if (!combatant.defensePosition) {
      // Lost defense position, return to patrolling
      combatant.state = CombatantState.PATROLLING;
      combatant.defendingZoneId = undefined;
      return;
    }

    // Check if still at defense position
    const distanceToDefensePos = combatant.position.distanceTo(combatant.defensePosition);
    if (distanceToDefensePos > 3) {
      // Move to defense position
      combatant.destinationPoint = combatant.defensePosition.clone();
      const toDefensePos = new THREE.Vector3()
        .subVectors(combatant.defensePosition, combatant.position)
        .normalize();
      combatant.rotation = Math.atan2(toDefensePos.z, toDefensePos.x);
    } else {
      // At position, face outward from zone
      combatant.destinationPoint = undefined;
      if (combatant.defendingZoneId && this.zoneManager) {
        const zone = this.zoneManager.getAllZones()
          .find(z => z.id === combatant.defendingZoneId);
        if (zone) {
          const toZone = new THREE.Vector3()
            .subVectors(zone.position, combatant.position);
          const outwardAngle = Math.atan2(toZone.z, toZone.x) + Math.PI;
          combatant.rotation = outwardAngle;
        }
      }
    }
  }

  private shouldAssignZoneDefense(combatant: Combatant): boolean {
    if (!this.zoneManager) return false;
    if (combatant.squadRole === 'leader') return false; // Leaders stay mobile
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
        if (zone.isHomeBase) return false; // Don't defend home bases

        const distance = combatant.position.distanceTo(zone.position);
        return distance < 60; // Within 60m
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
    zone: CaptureZone,
    combatant: Combatant,
    defenderIndex: number
  ): THREE.Vector3 {
    // Position defenders around zone perimeter facing outward
    const radius = zone.radius + 8; // 8m beyond zone edge
    const numPositions = 4; // 4 defensive positions per zone (N, S, E, W)

    const angle = (defenderIndex / numPositions) * Math.PI * 2;
    const position = new THREE.Vector3(
      zone.position.x + Math.cos(angle) * radius,
      0,
      zone.position.z + Math.sin(angle) * radius
    );

    // Get terrain height
    if (this.chunkManager) {
      position.y = this.chunkManager.getHeightAt(position.x, position.z);
    } else {
      position.y = zone.position.y;
    }

    return position;
  }

  private shouldInitiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): boolean {
    if (!combatant.squadId) return false

    const squad = this.squads.get(combatant.squadId)
    if (!squad || squad.members.length < 3) return false

    // Check squad suppression cooldown
    const lastSuppression = this.squadSuppressionCooldown.get(combatant.squadId) || 0
    if (Date.now() - lastSuppression < 10000) return false // 10s cooldown per squad

    const distance = combatant.position.distanceTo(targetPos)

    // Trigger conditions:
    // 1. Mid-range engagement (30-80m)
    if (distance < 30 || distance > 80) return false

    // 2. Multiple enemies nearby OR squadmate is low health
    const nearbyEnemies = this.countNearbyEnemies(combatant, 40, targetPos, allCombatants)

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
    allCombatants: Map<string, Combatant>
  ): void {
    if (!combatant.squadId) return

    const squad = this.squads.get(combatant.squadId)
    if (!squad) return

    // Mark squad cooldown
    this.squadSuppressionCooldown.set(combatant.squadId, Date.now())

    // Assign roles: leader + 1 suppressor, rest flankers
    squad.members.forEach((memberId, index) => {
      const member = allCombatants.get(memberId)
      if (!member || member.state === CombatantState.DEAD) return

      if (member.squadRole === 'leader' || index === 1) {
        // Become suppressor
        member.state = CombatantState.SUPPRESSING
        member.suppressionTarget = targetPos.clone()
        member.suppressionEndTime = Date.now() + 3000 + Math.random() * 2000 // 3-5s
        member.lastKnownTargetPos = targetPos.clone()
        member.alertTimer = 5.0
        member.isFullAuto = true
        member.skillProfile.burstLength = 8
        member.skillProfile.burstPauseMs = 150
      } else {
        // Become flanker - calculate smart flanking position using cover
        member.state = CombatantState.ADVANCING

        // Determine flanking direction based on index (alternate left/right)
        const flankLeft = index % 2 === 0
        const flankingAngle = this.calculateFlankingAngle(member.position, targetPos, flankLeft)
        const flankingDistance = 25 + Math.random() * 15 // 25-40m flanking arc

        // Calculate flanking position at perpendicular angle
        const flankingPos = new THREE.Vector3(
          targetPos.x + Math.cos(flankingAngle) * flankingDistance,
          0,
          targetPos.z + Math.sin(flankingAngle) * flankingDistance
        )

        // Try to find cover near the flanking position
        const coverNearFlank = this.findNearestCover(
          { ...member, position: flankingPos } as Combatant,
          targetPos
        )

        // Use cover position if found, otherwise use calculated flanking position
        member.destinationPoint = coverNearFlank || flankingPos

        if (this.chunkManager) {
          member.destinationPoint.y = this.chunkManager.getHeightAt(
            member.destinationPoint.x,
            member.destinationPoint.z
          )
        }
      }
    })

    console.log(`🎯 Squad ${combatant.squadId} initiating coordinated suppression & flank on target at (${Math.floor(targetPos.x)}, ${Math.floor(targetPos.z)})`)
  }

  /**
   * Calculate optimal flanking angle relative to target
   */
  private calculateFlankingAngle(
    attackerPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    flankLeft: boolean
  ): number {
    // Get vector from target to attacker
    const toAttacker = new THREE.Vector3().subVectors(attackerPos, targetPos)
    const currentAngle = Math.atan2(toAttacker.z, toAttacker.x)

    // Add 90 degrees (perpendicular) for flanking, either left or right
    const flankingOffset = flankLeft ? Math.PI / 2 : -Math.PI / 2
    const flankingAngle = currentAngle + flankingOffset

    return flankingAngle
  }

  /**
   * Check if cover position is flanked by threat
   */
  private isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    if (!combatant.coverPosition) return true;

    // Calculate vector from cover to threat
    const coverToThreat = new THREE.Vector3()
      .subVectors(threatPos, combatant.coverPosition);

    // Calculate vector from cover to combatant
    const coverToCombatant = new THREE.Vector3()
      .subVectors(combatant.position, combatant.coverPosition);

    // If threat is behind or perpendicular to cover, it's flanked
    const dotProduct = coverToThreat.normalize().dot(coverToCombatant.normalize());

    // If dot product > 0.5, threat is on the same side as combatant (flanked)
    // If dot product < -0.5, cover is between combatant and threat (good)
    return dotProduct > 0.3; // Allow some angle tolerance
  }
}
