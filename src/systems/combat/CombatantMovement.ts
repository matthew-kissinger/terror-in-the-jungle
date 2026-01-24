import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';

export class CombatantMovement {
  private chunkManager?: ImprovedChunkManager;
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;

  constructor(chunkManager?: ImprovedChunkManager, zoneManager?: ZoneManager) {
    this.chunkManager = chunkManager;
    this.zoneManager = zoneManager;
  }

  updateMovement(
    combatant: Combatant,
    deltaTime: number,
    squads: Map<string, Squad>,
    combatants: Map<string, Combatant>
  ): void {
    // Movement based on state
    if (combatant.state === CombatantState.PATROLLING) {
      this.updatePatrolMovement(combatant, deltaTime, squads, combatants);
    } else if (combatant.state === CombatantState.ENGAGING) {
      this.updateCombatMovement(combatant, deltaTime);
    } else if (combatant.state === CombatantState.SEEKING_COVER) {
      this.updateCoverSeekingMovement(combatant, deltaTime);
    }

    // Apply velocity normally - LOD scaling handled in CombatantSystem
    combatant.position.add(combatant.velocity.clone().multiplyScalar(deltaTime));

    // Keep on terrain
    const terrainHeight = this.getTerrainHeight(combatant.position.x, combatant.position.z);
    combatant.position.y = terrainHeight + 3;
  }

  private updatePatrolMovement(
    combatant: Combatant,
    deltaTime: number,
    squads: Map<string, Squad>,
    combatants: Map<string, Combatant>
  ): void {
    // Check if this is a rejoining squad member
    const squad = combatant.squadId ? squads.get(combatant.squadId) : undefined;

    if (combatant.isRejoiningSquad && squad) {
      this.handleRejoiningMovement(combatant, squad, combatants);
      return;
    }

    // Check if this is a player-controlled squad first
    if (squad && squad.isPlayerControlled && squad.currentCommand &&
        squad.currentCommand !== SquadCommand.NONE &&
        squad.currentCommand !== SquadCommand.FREE_ROAM) {
      this.handlePlayerCommand(combatant, squad, combatants, deltaTime);
      return;
    }

    // Squad movement for followers
    if (combatant.squadId && combatant.squadRole === 'follower') {
      if (squad && squad.leaderId) {
        const leader = combatants.get(squad.leaderId);
        if (leader && leader.id !== combatant.id) {
          const toLeader = new THREE.Vector3()
            .subVectors(leader.position, combatant.position);

          if (toLeader.length() > 6) {
            toLeader.normalize();
            combatant.velocity.set(
              toLeader.x * 3, // Normal squad following speed
              0,
              toLeader.z * 3
            );
            combatant.rotation = Math.atan2(toLeader.z, toLeader.x);
            return;
          }
        }
      }
    }

    // Leaders: head toward strategic capturable zones
    if (combatant.squadRole === 'leader' && this.zoneManager) {
      // Get all zones and evaluate strategic value
      const allZones = this.zoneManager.getAllZones();
      const capturableZones = allZones.filter(zone => {
        // Can capture if neutral or enemy-owned (not home bases)
        return !zone.isHomeBase && zone.owner !== combatant.faction;
      });

      // Also consider defending contested zones
      const contestedOwnedZones = allZones.filter(zone => {
        return !zone.isHomeBase && zone.owner === combatant.faction && zone.state === ZoneState.CONTESTED;
      });

      const targetZones = [...capturableZones, ...contestedOwnedZones];

      if (targetZones.length > 0) {
        // Select a strategic zone if we don't have a destination or reached it
        if (!combatant.destinationPoint ||
            combatant.position.distanceTo(combatant.destinationPoint) < 15) {

          // Evaluate zones by strategic value
          const evaluatedZones = targetZones.map(zone => {
            const distance = combatant.position.distanceTo(zone.position);
            const distanceScore = Math.max(0, 300 - distance) / 300; // Closer is better
            const bleedScore = (zone.ticketBleedRate || 1) / 3; // Higher bleed is better
            const contestedScore = zone.state === 'contested' ? 0.5 : 0; // Contested zones need help

            return {
              zone,
              score: distanceScore * 0.5 + bleedScore * 0.3 + contestedScore * 0.2
            };
          });

          // Sort by score and pick from top 3 with some randomness
          evaluatedZones.sort((a, b) => b.score - a.score);
          const topChoices = evaluatedZones.slice(0, Math.min(3, evaluatedZones.length));
          const selectedZone = topChoices[Math.floor(Math.random() * topChoices.length)];

          combatant.destinationPoint = selectedZone.zone.position.clone();
          console.log(`🎯 ${combatant.faction} squad targeting ${selectedZone.zone.state === 'contested' ? 'defend' : 'capture'} zone: ${selectedZone.zone.id} (score: ${selectedZone.score.toFixed(2)})`);
        }

        // Move toward the selected zone
        const toZone = new THREE.Vector3().subVectors(combatant.destinationPoint, combatant.position);
        const distance = toZone.length();
        toZone.normalize();

        // Variable speed based on distance
        let speed = 4; // Normal speed
        if (distance < 20) speed = 2; // Slow down when near zone
        if (distance > 100) speed = 6; // Speed up for long distances

        combatant.velocity.set(toZone.x * speed, 0, toZone.z * speed);
        if (speed > 0.1) combatant.rotation = Math.atan2(toZone.z, toZone.x);
        return;
      }
    }

    // Fallback: advance toward enemy territory
    if (combatant.squadRole === 'leader') {
      const enemyBasePos = this.getEnemyBasePosition(combatant.faction);

      const toEnemyBase = new THREE.Vector3()
        .subVectors(enemyBasePos, combatant.position)
        .normalize();

      combatant.velocity.set(
        toEnemyBase.x * 3,
        0,
        toEnemyBase.z * 3
      );
      combatant.rotation = Math.atan2(toEnemyBase.z, toEnemyBase.x);
    } else {
      // Followers: limited wander near leader
      combatant.timeToDirectionChange -= deltaTime;
      if (combatant.timeToDirectionChange <= 0) {
        combatant.wanderAngle = Math.random() * Math.PI * 2;
        combatant.timeToDirectionChange = 2 + Math.random() * 2;
      }

      combatant.velocity.set(
        Math.cos(combatant.wanderAngle) * 2,
        0,
        Math.sin(combatant.wanderAngle) * 2
      );
    }

    // Update rotation to match movement direction
    if (combatant.velocity.length() > 0.1) {
      combatant.rotation = Math.atan2(combatant.velocity.z, combatant.velocity.x);
    }
  }

  private updateCombatMovement(combatant: Combatant, deltaTime: number): void {
    if (!combatant.target) return;

    const toTarget = new THREE.Vector3()
      .subVectors(combatant.target.position, combatant.position);
    const distance = toTarget.length();
    toTarget.normalize();

    const idealEngagementDistance = 30;

    if (distance > idealEngagementDistance + 10) {
      // Move closer
      combatant.velocity.copy(toTarget).multiplyScalar(3);
    } else if (distance < idealEngagementDistance - 10) {
      // Back up
      combatant.velocity.copy(toTarget).multiplyScalar(-2);
    } else {
      // Strafe
      const strafeAngle = Math.sin(Date.now() * 0.001) * 0.5;
      const strafeDirection = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
      combatant.velocity.copy(strafeDirection).multiplyScalar(strafeAngle * 2);
    }
  }

  private updateCoverSeekingMovement(combatant: Combatant, deltaTime: number): void {
    if (!combatant.destinationPoint) {
      combatant.velocity.set(0, 0, 0);
      return;
    }

    const toDestination = new THREE.Vector3()
      .subVectors(combatant.destinationPoint, combatant.position);
    const distance = toDestination.length();

    if (distance < 2) {
      combatant.velocity.set(0, 0, 0);
      return;
    }

    toDestination.normalize();

    // Move quickly to cover with urgency
    const speed = 6;
    combatant.velocity.set(
      toDestination.x * speed,
      0,
      toDestination.z * speed
    );
  }

  updateRotation(combatant: Combatant, deltaTime: number): void {
    // Smooth rotation interpolation
    let rotationDifference = combatant.rotation - combatant.visualRotation;

    // Normalize to -PI to PI range
    while (rotationDifference > Math.PI) rotationDifference -= Math.PI * 2;
    while (rotationDifference < -Math.PI) rotationDifference += Math.PI * 2;

    // Apply smooth interpolation with velocity for natural movement
    const rotationAcceleration = rotationDifference * 15; // Spring constant
    const rotationDamping = combatant.rotationVelocity * 10; // Damping

    combatant.rotationVelocity += (rotationAcceleration - rotationDamping) * deltaTime;
    combatant.visualRotation += combatant.rotationVelocity * deltaTime;

    // Normalize visual rotation
    while (combatant.visualRotation > Math.PI * 2) combatant.visualRotation -= Math.PI * 2;
    while (combatant.visualRotation < 0) combatant.visualRotation += Math.PI * 2;
  }

  private handleRejoiningMovement(
    combatant: Combatant,
    squad: Squad,
    combatants: Map<string, Combatant>
  ): void {
    const squadCentroid = this.getSquadCentroid(squad, combatants);
    if (!squadCentroid) {
      combatant.isRejoiningSquad = false;
      return;
    }

    const distanceToSquad = combatant.position.distanceTo(squadCentroid);

    if (distanceToSquad < 15) {
      combatant.isRejoiningSquad = false;
      combatant.velocity.set(0, 0, 0);
      console.log(`✅ Squad member successfully rejoined the squad`);
    } else {
      const toSquad = new THREE.Vector3().subVectors(squadCentroid, combatant.position);
      toSquad.normalize();
      const speed = Math.min(7, distanceToSquad / 3);
      combatant.velocity.set(toSquad.x * speed, 0, toSquad.z * speed);
      combatant.rotation = Math.atan2(toSquad.z, toSquad.x);
    }
  }

  private getSquadCentroid(squad: Squad, combatants: Map<string, Combatant>): THREE.Vector3 | undefined {
    const squadMembers = squad.members
      .map(id => combatants.get(id))
      .filter(c => c && !c.isRejoiningSquad);

    if (squadMembers.length === 0) return undefined;

    const centroid = new THREE.Vector3();
    squadMembers.forEach(member => {
      if (member) centroid.add(member.position);
    });
    centroid.divideScalar(squadMembers.length);

    return centroid;
  }

  private handlePlayerCommand(
    combatant: Combatant,
    squad: Squad,
    combatants: Map<string, Combatant>,
    deltaTime: number
  ): void {
    const command = squad.currentCommand;
    const commandPos = squad.commandPosition;

    switch (command) {
      case SquadCommand.FOLLOW_ME:
        if (combatant.destinationPoint) {
          const toDestination = new THREE.Vector3().subVectors(combatant.destinationPoint, combatant.position);
          const distance = toDestination.length();
          if (distance > 2) {
            toDestination.normalize();
            const speed = Math.min(6, distance / 2);
            combatant.velocity.set(toDestination.x * speed, 0, toDestination.z * speed);
            combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
          } else {
            combatant.velocity.set(0, 0, 0);
          }
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        break;

      case SquadCommand.HOLD_POSITION:
        if (combatant.destinationPoint) {
          const toDestination = new THREE.Vector3().subVectors(combatant.destinationPoint, combatant.position);
          const distance = toDestination.length();
          if (distance > 2) {
            toDestination.normalize();
            combatant.velocity.set(toDestination.x * 4, 0, toDestination.z * 4);
            combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
          } else {
            combatant.velocity.set(0, 0, 0);
          }
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        break;

      case SquadCommand.PATROL_HERE:
        if (combatant.destinationPoint) {
          const toDestination = new THREE.Vector3().subVectors(combatant.destinationPoint, combatant.position);
          const distance = toDestination.length();
          if (distance > 3) {
            toDestination.normalize();
            combatant.velocity.set(toDestination.x * 3, 0, toDestination.z * 3);
            combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
          } else {
            combatant.velocity.set(0, 0, 0);
          }
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        break;

      case SquadCommand.RETREAT:
        if (combatant.destinationPoint) {
          const toDestination = new THREE.Vector3().subVectors(combatant.destinationPoint, combatant.position);
          const distance = toDestination.length();
          if (distance > 5) {
            toDestination.normalize();
            combatant.velocity.set(toDestination.x * 8, 0, toDestination.z * 8);
            combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
          } else {
            combatant.velocity.set(0, 0, 0);
          }
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        break;

      default:
        break;
    }
  }

  private getTerrainHeight(x: number, z: number): number {
    if (this.chunkManager) {
      const height = this.chunkManager.getHeightAt(x, z);
      // If chunk isn't loaded, use a reasonable default height
      if (height === 0 && (Math.abs(x) > 50 || Math.abs(z) > 50)) {
        return 5; // Assume flat terrain at y=5 for unloaded chunks
      }
      return height;
    }
    return 5; // Default terrain height
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  private getEnemyBasePosition(faction: Faction): THREE.Vector3 {
    if (this.gameModeManager) {
      const config = this.gameModeManager.getCurrentConfig();
      const enemyFaction = faction === Faction.US ? Faction.OPFOR : Faction.US;

      // Find enemy main base
      const enemyBase = config.zones.find(z =>
        z.isHomeBase && z.owner === enemyFaction &&
        (z.id.includes('main') || z.id === `${enemyFaction.toLowerCase()}_base`)
      );

      if (enemyBase) {
        return enemyBase.position.clone();
      }
    }

    // Fallback to default positions
    return faction === Faction.US ?
      new THREE.Vector3(0, 0, 145) : // OPFOR base
      new THREE.Vector3(0, 0, -50); // US base
  }
}