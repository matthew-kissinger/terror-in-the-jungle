import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { SpatialGrid } from './SpatialGrid';

export class CombatantAI {
  private readonly FRIENDLY_FIRE_ENABLED = false;
  private readonly MAX_ENGAGEMENT_RANGE = 150;
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private squads: Map<string, Squad> = new Map();
  private squadSuppressionCooldown: Map<string, number> = new Map();

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads;
  }

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialGrid
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
    spatialGrid?: SpatialGrid
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
        combatant.state = CombatantState.PATROLLING;
        combatant.target = null;
      }
    }
  }

  private handleEngaging(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialGrid
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
    spatialGrid?: SpatialGrid
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
    spatialGrid?: SpatialGrid
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
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialGrid
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
      return;
    }

    // Check if reached cover position
    const distanceToCover = combatant.position.distanceTo(combatant.coverPosition);
    if (distanceToCover < 2) {
      combatant.inCover = true;
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
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

    return recentlyHit || lowHealth;
  }

  private findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    if (!this.chunkManager) {
      return null;
    }

    const MAX_SEARCH_RADIUS = 30;
    const SEARCH_SAMPLES = 16;
    let bestCoverPos: THREE.Vector3 | null = null;
    let bestCoverScore = -Infinity;

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

    return bestCoverPos;
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

  /**
   * Set the chunk manager for terrain obstruction checks
   */
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
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
        // Become flanker - set advancing state with destination
        member.state = CombatantState.ADVANCING
        const angle = (index % 2 === 0 ? 45 : -45) * (Math.PI / 180)
        const distance = 20 + Math.random() * 10

        const offset = new THREE.Vector3(
          Math.cos(angle) * distance,
          0,
          Math.sin(angle) * distance
        )

        member.destinationPoint = targetPos.clone().add(offset)
        if (this.chunkManager) {
          member.destinationPoint.y = this.chunkManager.getHeightAt(
            member.destinationPoint.x,
            member.destinationPoint.z
          )
        }
      }
    })

    console.log(`🎯 Squad ${combatant.squadId} initiating suppression on target at (${Math.floor(targetPos.x)}, ${Math.floor(targetPos.z)})`)
  }
}
