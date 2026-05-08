import * as THREE from 'three';
import { Combatant, Faction, Squad, SquadCommand } from './types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { handlePlayerCommand, handleRejoiningMovement } from './CombatantMovementCommands';
import { NPC_MAX_SPEED, NpcLodConfig } from '../../config/CombatantConfig';

// ── Movement speeds (m/s) ──
// With navmesh path-following, NPCs no longer waste time stuck on terrain.
// Speeds reflect intended tactical pace, not compensation for stuck time.
//
// INVARIANT: tactical movement speeds (the ones the player typically encounters
// in engagement range — advancing, patrol-close, defend) MUST stay comfortably
// below PLAYER_WALK_SPEED = 10 m/s (see src/systems/player/PlayerController.ts:50).
// Rationale: the player has no separate sprint; PLAYER_WALK_SPEED = 10 m/s is
// the whole budget. If NPCs repositon at ≥ player speed, the player can never
// close an engagement and the whole combat loop stalls. See the playtest
// observation in docs/tasks/perf-harness-verticality-and-sizing.md.
const TRAVERSAL_RUN_SPEED = NPC_MAX_SPEED;
const SQUAD_FOLLOW_SPEED = 4.5;
const PATROL_SPEED = 4.2;
export const PATROL_CLOSE_SPEED = 2.8;
const PATROL_LONG_DISTANCE_SPEED = TRAVERSAL_RUN_SPEED;
const FALLBACK_ADVANCE_SPEED = 4.5;
const COMBAT_APPROACH_SPEED = 3.2;
export const ADVANCING_TRAVERSE_SPEED = 4.8;
const ADVANCING_CLOSE_SPEED = 3.4;
const COMBAT_RETREAT_SPEED = 2.4;
const COMBAT_STRAFE_SPEED = 1.8;
const COVER_SEEKING_SPEED = 5.2;
const RETREATING_FALLBACK_SPEED = 4.8;
export const DEFEND_SPEED = 3.2;
const SUPPRESS_HOLD_SPEED = 0;

// ── Distances (meters) ──
const SQUAD_FOLLOW_DISTANCE = 6;
export const DESTINATION_ARRIVAL_RADIUS = 15;
const PATROL_CLOSE_DISTANCE = 20;
const PATROL_LONG_DISTANCE = 100;
const ENGAGEMENT_DISTANCE = 30;
const ENGAGEMENT_TOLERANCE = 10;
const CLOSE_QUARTERS_RETREAT_DISTANCE = 6;
const COVER_ARRIVAL_RADIUS = 2;
const RETREAT_ARRIVAL_RADIUS = 2;
const DEFEND_ARRIVAL_RADIUS = 2;
const ADVANCE_ARRIVAL_RADIUS = 3;
const ADVANCE_CLOSE_DISTANCE = 16;
const ADVANCE_LONG_DISTANCE = 55;

// ── Zone scoring ──
const ZONE_EVAL_INTERVAL_MS = 3000;
const ZONE_EVAL_JITTER_MS = 2000;
const ZONE_SCORE_MAX_DISTANCE = 300;
const ZONE_SCORE_MAX_BLEED_RATE = 3;
const ZONE_SCORE_CONTESTED_BONUS = 0.5;
const ZONE_WEIGHT_DISTANCE = 0.5;
const ZONE_WEIGHT_BLEED = 0.3;
const ZONE_WEIGHT_CONTESTED = 0.2;


// ── Strafe ──
const STRAFE_FREQUENCY = 0.001;
const STRAFE_AMPLITUDE = 0.5;

const _moveVec = new THREE.Vector3();
const _moveVec2 = new THREE.Vector3();
interface PatrolMovementDependencies {
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
  // Squad movement for followers: share leader's destination, or follow leader position
  if (combatant.squadId && combatant.squadRole === 'follower') {
    if (squad && squad.leaderId) {
      const leader = combatants.get(squad.leaderId);
      if (leader && leader.id !== combatant.id) {
        // Track leader idle window on the squad. Followers escape leader-idle
        // deadlock once it exceeds NpcLodConfig.squadFollowStaleMs and run their
        // own zone-targeting tick. See docs/tasks/npc-unfreeze-and-stuck.md.
        const now = performance.now();
        const leaderSpeedSq =
          leader.velocity.x * leader.velocity.x + leader.velocity.z * leader.velocity.z;
        if (leaderSpeedSq <= NpcLodConfig.idleEpsilonSq) {
          if (squad.leaderIdleSinceMs === undefined) {
            squad.leaderIdleSinceMs = now;
          }
        } else {
          squad.leaderIdleSinceMs = undefined;
        }
        const leaderStale =
          squad.leaderIdleSinceMs !== undefined &&
          now - squad.leaderIdleSinceMs > NpcLodConfig.squadFollowStaleMs;

        // Use leader's destination if available (move toward same objective)
        const target = leader.destinationPoint ?? leader.position;
        if (combatant.destinationPoint) {
          combatant.destinationPoint.copy(target);
        } else {
          combatant.destinationPoint = target.clone();
        }
        _moveVec.subVectors(target, combatant.position);
        const dist = _moveVec.length();
        if (dist > SQUAD_FOLLOW_DISTANCE) {
          _moveVec.normalize();
          // Match leader's pace: run fast when far, slow when close
          const speed = dist > PATROL_LONG_DISTANCE ? PATROL_LONG_DISTANCE_SPEED
            : dist > PATROL_CLOSE_DISTANCE ? SQUAD_FOLLOW_SPEED
            : PATROL_CLOSE_SPEED;
          combatant.velocity.set(_moveVec.x * speed, 0, _moveVec.z * speed);
          combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
          return;
        }
        if (leaderStale) {
          // Watchdog: break the follow-clamp and re-evaluate the follower's
          // own goal on the leader-style block below.
          combatant.destinationPoint = undefined;
          combatant.lastZoneEvalTime = 0;
        } else {
          combatant.velocity.set(0, 0, 0);
          return;
        }
      }
    }
  }
  // Followers whose leader has stalled past the watchdog threshold fall through
  // to the zone-targeting path. Re-use the leader logic with the follower's
  // own position so they pick a fresh objective without needing a new
  // SquadManager hook.
  if (combatant.squadRole === 'follower' && deps.zoneManager &&
      combatant.destinationPoint === undefined &&
      combatant.lastZoneEvalTime === 0) {
    runZoneTargetingTick(combatant, deps.zoneManager);
    if (combatant.destinationPoint) {
      driveTowardDestination(combatant);
      return;
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
      const prev = combatant.destinationPoint;
      runZoneTargetingTick(combatant, deps.zoneManager);
      if (!combatant.destinationPoint && reachedDestination) {
        // No strategic zones available and we reached our last one — clear.
        combatant.destinationPoint = undefined;
      } else if (!combatant.destinationPoint && prev) {
        // Preserve prior destination if no new pick (mirrors prior behavior).
        combatant.destinationPoint = prev;
      }
    }
    if (combatant.destinationPoint) {
      driveTowardDestination(combatant);
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
    // Leaderless followers: advance toward enemy territory instead of random wander
    const enemyBasePos = deps.getEnemyBasePosition(combatant.faction);
    _moveVec.subVectors(enemyBasePos, combatant.position).normalize();
    combatant.velocity.set(
      _moveVec.x * FALLBACK_ADVANCE_SPEED,
      0,
      _moveVec.z * FALLBACK_ADVANCE_SPEED
    );
    combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
  }
  // Update rotation to match movement direction
  if (combatant.velocity.length() > 0.1) {
    combatant.rotation = Math.atan2(combatant.velocity.z, combatant.velocity.x);
  }
}

/**
 * Pick a strategic capturable / contested-owned zone for the combatant and
 * write it to `destinationPoint`. Mirrors the leader-only zone-targeting
 * block above; used by the follower watchdog when a stale leader forces the
 * follower to pick its own goal.
 */
function runZoneTargetingTick(combatant: Combatant, zoneManager: ZoneManager): void {
  combatant.lastZoneEvalTime = performance.now();
  const allZones = zoneManager.getAllZones();
  let top1Zone = null, top1Score = -1;
  let top2Zone = null, top2Score = -1;
  let top3Zone = null, top3Score = -1;
  for (let i = 0; i < allZones.length; i++) {
    const zone = allZones[i];
    const isCapturable = !zone.isHomeBase && zone.owner !== combatant.faction;
    const isContestedOwned = !zone.isHomeBase && zone.owner === combatant.faction && zone.state === ZoneState.CONTESTED;
    if (!isCapturable && !isContestedOwned) continue;
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
  let selectedZone = null;
  if (top1Zone) {
    const roll = Math.random();
    if (roll < 0.7 || !top2Zone) selectedZone = top1Zone;
    else if (roll < 0.9 || !top3Zone) selectedZone = top2Zone;
    else selectedZone = top3Zone;
  }
  if (selectedZone) {
    combatant.destinationPoint = selectedZone.position.clone();
  }
}

/**
 * Drive `velocity` toward `destinationPoint` using the same patrol speed
 * profile leaders use when heading to a strategic zone.
 */
function driveTowardDestination(combatant: Combatant): void {
  if (!combatant.destinationPoint) return;
  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  _moveVec.normalize();
  let speed = PATROL_SPEED;
  if (distance < PATROL_CLOSE_DISTANCE) speed = PATROL_CLOSE_SPEED;
  if (distance > PATROL_LONG_DISTANCE) speed = PATROL_LONG_DISTANCE_SPEED;
  combatant.velocity.set(_moveVec.x * speed, 0, _moveVec.z * speed);
  if (speed > 0.1) combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
}

export function updateCombatMovement(combatant: Combatant): void {
  if (!combatant.target) return;
  _moveVec.subVectors(combatant.target.position, combatant.position);
  const distance = _moveVec.length();
  _moveVec.normalize();
  if (distance > ENGAGEMENT_DISTANCE + ENGAGEMENT_TOLERANCE) {
    // Move closer
    combatant.velocity.copy(_moveVec).multiplyScalar(COMBAT_APPROACH_SPEED);
  } else if (distance < CLOSE_QUARTERS_RETREAT_DISTANCE) {
    // Only backpedal when nearly colliding. Broader close-range backing made
    // clustered starts pace instead of resolving the fight.
    combatant.velocity.copy(_moveVec).multiplyScalar(-COMBAT_RETREAT_SPEED);
  } else {
    // Strafe
    const strafeAngle = Math.sin(Date.now() * STRAFE_FREQUENCY) * STRAFE_AMPLITUDE;
    _moveVec2.set(-_moveVec.z, 0, _moveVec.x);
    combatant.velocity.copy(_moveVec2).multiplyScalar(strafeAngle * COMBAT_STRAFE_SPEED);
  }
}

export function updateAdvancingMovement(combatant: Combatant): void {
  const anchor = combatant.destinationPoint ?? combatant.target?.position;
  if (!anchor) {
    combatant.velocity.set(0, 0, 0);
    return;
  }

  _moveVec.subVectors(anchor, combatant.position);
  const distance = _moveVec.length();
  if (combatant.destinationPoint && distance < ADVANCE_ARRIVAL_RADIUS) {
    combatant.velocity.set(0, 0, 0);
    return;
  }

  _moveVec.normalize();
  let speed = ADVANCING_TRAVERSE_SPEED;
  if (distance < ADVANCE_CLOSE_DISTANCE) {
    speed = ADVANCING_CLOSE_SPEED;
  } else if (distance > ADVANCE_LONG_DISTANCE) {
    speed = TRAVERSAL_RUN_SPEED;
  }

  combatant.velocity.set(_moveVec.x * speed, 0, _moveVec.z * speed);
  combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
}

export function updateRetreatingMovement(combatant: Combatant): void {
  if (!combatant.destinationPoint) {
    combatant.velocity.set(0, 0, 0);
    return;
  }

  _moveVec.subVectors(combatant.destinationPoint, combatant.position);
  const distance = _moveVec.length();
  if (distance < RETREAT_ARRIVAL_RADIUS) {
    combatant.velocity.set(0, 0, 0);
    return;
  }

  _moveVec.normalize();
  combatant.velocity.set(
    _moveVec.x * RETREATING_FALLBACK_SPEED,
    0,
    _moveVec.z * RETREATING_FALLBACK_SPEED
  );
  combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
}

export function updateSuppressingMovement(combatant: Combatant): void {
  combatant.velocity.set(0, 0, 0);
  if (combatant.suppressionTarget) {
    _moveVec.subVectors(combatant.suppressionTarget, combatant.position);
    if (_moveVec.lengthSq() > 0.0001) {
      combatant.rotation = Math.atan2(_moveVec.z, _moveVec.x);
    }
  }
  if (SUPPRESS_HOLD_SPEED > 0) {
    combatant.velocity.multiplyScalar(SUPPRESS_HOLD_SPEED);
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
