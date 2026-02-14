import * as THREE from 'three';
import { Combatant, Faction, Squad, SquadCommand } from './types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { handlePlayerCommand, handleRejoiningMovement } from './CombatantMovementCommands';

const _moveVec = new THREE.Vector3();
const _moveVec2 = new THREE.Vector3();
export interface PatrolMovementDependencies {
  zoneManager?: ZoneManager;
  getEnemyBasePosition: (faction: Faction) => THREE.Vector3;
}
export function updatePatrolMovement(
  combatant: Combatant,
  deltaTime: number,
  squads: Map<string, Squad>,
  combatants: Map<string, Combatant>,
  deps: PatrolMovementDependencies
): void {
  // Check if this is a rejoining squad member
  const squad = combatant.squadId ? squads.get(combatant.squadId) : undefined;
  if (combatant.isRejoiningSquad && squad) {
    handleRejoiningMovement(combatant, squad, combatants);
    return;
  }
  // Check if this is a player-controlled squad first
  if (squad && squad.isPlayerControlled && squad.currentCommand &&
      squad.currentCommand !== SquadCommand.NONE &&
      squad.currentCommand !== SquadCommand.FREE_ROAM) {
    handlePlayerCommand(combatant, squad);
    return;
  }
  // Squad movement for followers
  if (combatant.squadId && combatant.squadRole === 'follower') {
    if (squad && squad.leaderId) {
        const leader = combatants.get(squad.leaderId);
        if (leader && leader.id !== combatant.id) {
          _moveVec.subVectors(leader.position, combatant.position);
          if (_moveVec.length() > 6) {
            _moveVec.normalize();
            combatant.velocity.set(
            _moveVec.x * 3, // Normal squad following speed
            0,
            _moveVec.z * 3
          );
          combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
          return;
        }
      }
    }
  }
  // Leaders: head toward strategic capturable zones
  if (combatant.squadRole === 'leader' && deps.zoneManager) {
    const now = performance.now();
    // Throttle re-evaluation: only if we reached destination or enough time passed
    const reachedDestination = !combatant.destinationPoint ||
      combatant.position.distanceTo(combatant.destinationPoint) < 15;
    const shouldReevaluate = reachedDestination ||
      !combatant.lastZoneEvalTime ||
      (now - combatant.lastZoneEvalTime > 3000 + Math.random() * 2000);
    if (shouldReevaluate) {
      combatant.lastZoneEvalTime = now;
      const allZones = deps.zoneManager.getAllZones();
      let top1Zone = null, top1Score = -1;
      let top2Zone = null, top2Score = -1;
      let top3Zone = null, top3Score = -1;
      // Optimized evaluation in a single loop to avoid multiple array allocations
      for (let i = 0; i < allZones.length; i++) {
        const zone = allZones[i];
        const isCapturable = !zone.isHomeBase && zone.owner !== combatant.faction;
        const isContestedOwned = !zone.isHomeBase && zone.owner === combatant.faction && zone.state === ZoneState.CONTESTED;
        if (isCapturable || isContestedOwned) {
          const distance = combatant.position.distanceTo(zone.position);
          const distanceScore = Math.max(0, 300 - distance) / 300; // Closer is better
          const bleedScore = (zone.ticketBleedRate || 1) / 3; // Higher bleed is better
          const contestedScore = zone.state === ZoneState.CONTESTED ? 0.5 : 0; // Contested zones need help
          const score = distanceScore * 0.5 + bleedScore * 0.3 + contestedScore * 0.2;
          if (score > top1Score) {
            top3Score = top2Score; top3Zone = top2Zone;
            top2Score = top1Score; top2Zone = top1Zone;
            top1Score = score; top1Zone = zone;
          } else if (score > top2Score) {
            top3Score = top2Score; top3Zone = top2Zone;
            top2Score = score; top2Zone = zone;
          } else if (score > top3Score) {
            top3Score = score; top3Zone = zone;
          }
        }
      }
      // Pick from top 3 with some randomness
      let selectedZone = null;
      const count = (top1Zone ? 1 : 0) + (top2Zone ? 1 : 0) + (top3Zone ? 1 : 0);
      if (count > 0) {
        const rand = Math.floor(Math.random() * count);
        if (rand === 0) selectedZone = top1Zone;
        else if (rand === 1) selectedZone = top2Zone;
        else selectedZone = top3Zone;
      }
      if (selectedZone) {
        if (!combatant.destinationPoint) {
          combatant.destinationPoint = selectedZone.position.clone();
        } else {
          combatant.destinationPoint.copy(selectedZone.position);
        }
      } else if (reachedDestination) {
        // If we reached our destination and there are no new strategic zones, clear it
        combatant.destinationPoint = undefined;
      }
    }
    if (combatant.destinationPoint) {
      // Move toward the selected zone
      _moveVec.subVectors(combatant.destinationPoint, combatant.position);
      const distance = _moveVec.length();
      _moveVec.normalize();
      // Variable speed based on distance
      let speed = 4; // Normal speed
      if (distance < 20) speed = 2; // Slow down when near zone
      if (distance > 100) speed = 6; // Speed up for long distances
      combatant.velocity.set(_moveVec.x * speed, 0, _moveVec.z * speed);
      if (speed > 0.1) combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
      return;
    }
  }
  // Fallback: advance toward enemy territory
  if (combatant.squadRole === 'leader') {
    const enemyBasePos = deps.getEnemyBasePosition(combatant.faction);
    _moveVec.subVectors(enemyBasePos, combatant.position).normalize();
    combatant.velocity.set(
      _moveVec.x * 3,
      0,
      _moveVec.z * 3
    );
    combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
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
export function updateCombatMovement(combatant: Combatant): void {
  if (!combatant.target) return;
  _moveVec.subVectors(combatant.target.position, combatant.position);
  const distance = _moveVec.length();
  _moveVec.normalize();
  const idealEngagementDistance = 30;
  if (distance > idealEngagementDistance + 10) {
    // Move closer
    combatant.velocity.copy(_moveVec).multiplyScalar(3);
  } else if (distance < idealEngagementDistance - 10) {
    // Back up
    combatant.velocity.copy(_moveVec).multiplyScalar(-2);
  } else {
    // Strafe
    const strafeAngle = Math.sin(Date.now() * 0.001) * 0.5;
    _moveVec2.set(-_moveVec.z, 0, _moveVec.x);
    combatant.velocity.copy(_moveVec2).multiplyScalar(strafeAngle * 2);
  }
}
export function updateCoverSeekingMovement(combatant: Combatant): void {
  if (!combatant.destinationPoint) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  if (distance < 2) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.normalize();
  // Move quickly to cover with urgency
  const speed = 6;
  combatant.velocity.set(
    _moveVec.x * speed,
    0,
    _moveVec.z * speed
  );
}
export function updateDefendingMovement(combatant: Combatant): void {
  if (!combatant.destinationPoint) {
    // At defensive position, hold still
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  if (distance < 2) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.normalize();
  // Move to defensive position at normal speed
  const speed = 3;
  combatant.velocity.set(
    _moveVec.x * speed,
    0,
    _moveVec.z * speed
  );
}
