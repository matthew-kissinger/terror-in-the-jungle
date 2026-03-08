import * as THREE from 'three';
import { Combatant, Faction, Squad, SquadCommand } from './types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { handlePlayerCommand, handleRejoiningMovement } from './CombatantMovementCommands';
import { NPC_MAX_SPEED } from '../../config/CombatantConfig';

// ── Movement speeds (m/s) ──
const SQUAD_FOLLOW_SPEED = 3;
const PATROL_SPEED = 4;
const PATROL_CLOSE_SPEED = 2;
const PATROL_LONG_DISTANCE_SPEED = NPC_MAX_SPEED;
const FALLBACK_ADVANCE_SPEED = 3;
const WANDER_SPEED = 2;
const COMBAT_APPROACH_SPEED = 3;
const COMBAT_RETREAT_SPEED = 2;
const COMBAT_STRAFE_SPEED = 2;
const COVER_SEEKING_SPEED = NPC_MAX_SPEED;
const DEFEND_SPEED = 3;

// ── Distances (meters) ──
const SQUAD_FOLLOW_DISTANCE = 6;
const DESTINATION_ARRIVAL_RADIUS = 15;
const PATROL_CLOSE_DISTANCE = 20;
const PATROL_LONG_DISTANCE = 100;
const ENGAGEMENT_DISTANCE = 30;
const ENGAGEMENT_TOLERANCE = 10;
const COVER_ARRIVAL_RADIUS = 2;
const DEFEND_ARRIVAL_RADIUS = 2;

// ── Zone scoring ──
const ZONE_EVAL_INTERVAL_MS = 3000;
const ZONE_EVAL_JITTER_MS = 2000;
const ZONE_SCORE_MAX_DISTANCE = 300;
const ZONE_SCORE_MAX_BLEED_RATE = 3;
const ZONE_SCORE_CONTESTED_BONUS = 0.5;
const ZONE_WEIGHT_DISTANCE = 0.5;
const ZONE_WEIGHT_BLEED = 0.3;
const ZONE_WEIGHT_CONTESTED = 0.2;

// ── Wander timing ──
const WANDER_MIN_INTERVAL = 2;
const WANDER_JITTER = 2;

// ── Strafe ──
const STRAFE_FREQUENCY = 0.001;
const STRAFE_AMPLITUDE = 0.5;

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
          if (_moveVec.length() > SQUAD_FOLLOW_DISTANCE) {
            _moveVec.normalize();
            combatant.velocity.set(
            _moveVec.x * SQUAD_FOLLOW_SPEED,
            0,
            _moveVec.z * SQUAD_FOLLOW_SPEED
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
      combatant.position.distanceTo(combatant.destinationPoint) < DESTINATION_ARRIVAL_RADIUS;
    const shouldReevaluate = reachedDestination ||
      !combatant.lastZoneEvalTime ||
      (now - combatant.lastZoneEvalTime > ZONE_EVAL_INTERVAL_MS + Math.random() * ZONE_EVAL_JITTER_MS);
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
          const distanceScore = Math.max(0, ZONE_SCORE_MAX_DISTANCE - distance) / ZONE_SCORE_MAX_DISTANCE;
          const bleedScore = (zone.ticketBleedRate || 1) / ZONE_SCORE_MAX_BLEED_RATE;
          const contestedScore = zone.state === ZoneState.CONTESTED ? ZONE_SCORE_CONTESTED_BONUS : 0;
          const score = distanceScore * ZONE_WEIGHT_DISTANCE + bleedScore * ZONE_WEIGHT_BLEED + contestedScore * ZONE_WEIGHT_CONTESTED;
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
      let speed = PATROL_SPEED;
      if (distance < PATROL_CLOSE_DISTANCE) speed = PATROL_CLOSE_SPEED;
      if (distance > PATROL_LONG_DISTANCE) speed = PATROL_LONG_DISTANCE_SPEED;
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
      _moveVec.x * FALLBACK_ADVANCE_SPEED,
      0,
      _moveVec.z * FALLBACK_ADVANCE_SPEED
    );
    combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
  } else {
    // Followers: limited wander near leader
    combatant.timeToDirectionChange -= deltaTime;
    if (combatant.timeToDirectionChange <= 0) {
      combatant.wanderAngle = Math.random() * Math.PI * 2;
      combatant.timeToDirectionChange = WANDER_MIN_INTERVAL + Math.random() * WANDER_JITTER;
    }
    combatant.velocity.set(
      Math.cos(combatant.wanderAngle) * WANDER_SPEED,
      0,
      Math.sin(combatant.wanderAngle) * WANDER_SPEED
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
  if (distance > ENGAGEMENT_DISTANCE + ENGAGEMENT_TOLERANCE) {
    // Move closer
    combatant.velocity.copy(_moveVec).multiplyScalar(COMBAT_APPROACH_SPEED);
  } else if (distance < ENGAGEMENT_DISTANCE - ENGAGEMENT_TOLERANCE) {
    // Back up
    combatant.velocity.copy(_moveVec).multiplyScalar(-COMBAT_RETREAT_SPEED);
  } else {
    // Strafe
    const strafeAngle = Math.sin(Date.now() * STRAFE_FREQUENCY) * STRAFE_AMPLITUDE;
    _moveVec2.set(-_moveVec.z, 0, _moveVec.x);
    combatant.velocity.copy(_moveVec2).multiplyScalar(strafeAngle * COMBAT_STRAFE_SPEED);
  }
}
export function updateCoverSeekingMovement(combatant: Combatant): void {
  if (!combatant.destinationPoint) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  if (distance < COVER_ARRIVAL_RADIUS) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.normalize();
  combatant.velocity.set(
    _moveVec.x * COVER_SEEKING_SPEED,
    0,
    _moveVec.z * COVER_SEEKING_SPEED
  );
}
export function updateDefendingMovement(combatant: Combatant): void {
  if (!combatant.destinationPoint) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  if (distance < DEFEND_ARRIVAL_RADIUS) {
    combatant.velocity.set(0, 0, 0);
    return;
  }
  _moveVec.normalize();
  combatant.velocity.set(
    _moveVec.x * DEFEND_SPEED,
    0,
    _moveVec.z * DEFEND_SPEED
  );
}
