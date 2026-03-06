import * as THREE from 'three';
import {
  GameModeConfig,
  GameModeDefinition,
  RespawnPolicyConfig,
  ZoneConfig
} from '../../../config/gameModeTypes';
import { Alliance, Faction, getAlliance, getEnemyAlliance } from '../../combat/types';
import { type StrategicAgent } from '../../strategy/types';
import type { WarSimulator } from '../../strategy/WarSimulator';
import { ZoneState, type CaptureZone } from '../ZoneManager';

type ZoneLike = Pick<ZoneConfig, 'id' | 'name' | 'position' | 'isHomeBase' | 'owner' | 'ticketBleedRate'> & {
  state?: ZoneState;
};

interface PressureFrontOptions {
  zones: CaptureZone[];
  alliance?: Alliance;
  warSimulator?: WarSimulator;
  terrainReadyAt?: (x: number, z: number) => boolean;
}

const DEFAULT_SPAWN = new THREE.Vector3(0, 0, -50);

function isOwnedByAlliance(zone: ZoneLike, alliance: Alliance): boolean {
  return zone.owner !== null && getAlliance(zone.owner as Faction) === alliance;
}

function isControlledByAlliance(zone: ZoneLike, alliance: Alliance): boolean {
  if (zone.isHomeBase) return isOwnedByAlliance(zone, alliance);

  switch (zone.state) {
    case ZoneState.US_CONTROLLED:
      return alliance === Alliance.BLUFOR;
    case ZoneState.OPFOR_CONTROLLED:
      return alliance === Alliance.OPFOR;
    case ZoneState.CONTESTED:
    case ZoneState.NEUTRAL:
      return false;
    default:
      return isOwnedByAlliance(zone, alliance);
  }
}

function selectNearestZone(target: THREE.Vector3, zones: ZoneLike[]): ZoneLike | undefined {
  let nearest: ZoneLike | undefined;
  let nearestDist = Infinity;

  for (const zone of zones) {
    const dist = zone.position.distanceToSquared(target);
    if (dist < nearestDist) {
      nearest = zone;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getPrimaryAllianceBase(config: GameModeConfig, alliance: Alliance): ZoneLike | undefined {
  const ownedBases = config.zones.filter(zone => zone.isHomeBase && isOwnedByAlliance(zone, alliance));
  if (ownedBases.length === 0) return undefined;

  const canonicalBaseId = alliance === Alliance.BLUFOR ? 'us_base' : 'opfor_base';
  return ownedBases.find(zone => zone.id.includes('main') || zone.id === canonicalBaseId) ?? ownedBases[0];
}

function scoreForwardObjective(zone: ZoneLike, alliance: Alliance): number {
  let score = zone.ticketBleedRate ?? 0;
  if (!zone.isHomeBase) score += 10;

  if (zone.state === ZoneState.CONTESTED) score += 50;
  else if (zone.state === ZoneState.NEUTRAL || zone.owner === null) score += 25;
  else if (!isControlledByAlliance(zone, alliance)) score += 15;

  return score;
}

function selectForwardObjective(zones: ZoneLike[], alliance: Alliance): ZoneLike | undefined {
  const candidates = zones.filter(zone => !zone.isHomeBase && !isControlledByAlliance(zone, alliance));
  if (candidates.length === 0) return undefined;

  let best = candidates[0];
  let bestScore = scoreForwardObjective(best, alliance);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreForwardObjective(candidates[i], alliance);
    if (score > bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }
  return best;
}

function resolveForwardInsertionFromZones(zones: ZoneLike[], alliance: Alliance): THREE.Vector3 | null {
  const objective = selectForwardObjective(zones, alliance);
  if (!objective) return null;

  const friendlyBases = zones.filter(zone => zone.isHomeBase && isOwnedByAlliance(zone, alliance));
  const friendlyBase = selectNearestZone(objective.position, friendlyBases);
  if (!friendlyBase) return null;

  const dir = new THREE.Vector3().subVectors(friendlyBase.position, objective.position);
  dir.y = 0;
  const distance = dir.length();
  if (distance < 1) return null;
  dir.divideScalar(distance);

  const offset = Math.min(240, Math.max(120, distance - 80));
  return objective.position.clone().addScaledVector(dir, offset);
}

function getEnemyHotspotNear(
  objective: THREE.Vector3,
  maxRadius: number,
  alliance: Alliance,
  warSimulator?: WarSimulator
): THREE.Vector3 | null {
  if (!warSimulator || !warSimulator.isEnabled()) return null;

  const candidates: Array<StrategicAgent & { d2: number }> = [];
  const maxRadiusSq = maxRadius * maxRadius;
  const enemyAlliance = getEnemyAlliance(alliance);

  for (const agent of warSimulator.getAllAgents().values()) {
    if (!agent.alive || getAlliance(agent.faction) !== enemyAlliance) continue;
    const dx = agent.x - objective.x;
    const dz = agent.z - objective.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxRadiusSq) continue;
    candidates.push({ ...agent, d2 });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.d2 - b.d2);

  const take = Math.min(10, candidates.length);
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < take; i++) {
    sumX += candidates[i].x;
    sumZ += candidates[i].z;
  }

  return new THREE.Vector3(sumX / take, 0, sumZ / take);
}

function buildRespawnCandidates(anchor: THREE.Vector3, friendlyDir: THREE.Vector3): THREE.Vector3[] {
  const dir = friendlyDir.clone().normalize();
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.z) || dir.lengthSq() < 0.0001) {
    dir.set(0, 0, 1);
  }

  const lateral = new THREE.Vector3(-dir.z, 0, dir.x);
  const offsets = [
    { forward: 0, side: 0 },
    { forward: -18, side: 0 },
    { forward: 18, side: 0 },
    { forward: -12, side: -14 },
    { forward: -12, side: 14 },
    { forward: 12, side: -14 },
    { forward: 12, side: 14 },
    { forward: -26, side: -10 },
    { forward: -26, side: 10 },
    { forward: -8, side: -22 },
    { forward: -8, side: 22 }
  ];

  return offsets.map(offset =>
    anchor.clone()
      .addScaledVector(dir, offset.forward)
      .addScaledVector(lateral, offset.side)
  );
}

function countNearbyAgents(
  center: THREE.Vector3,
  radius: number,
  alliance: Alliance,
  warSimulator?: WarSimulator
): number {
  if (!warSimulator || !warSimulator.isEnabled()) return 0;

  const radiusSq = radius * radius;
  let count = 0;
  for (const agent of warSimulator.getAllAgents().values()) {
    if (!agent.alive || getAlliance(agent.faction) !== alliance) continue;
    const dx = agent.x - center.x;
    const dz = agent.z - center.z;
    if ((dx * dx + dz * dz) <= radiusSq) count++;
  }
  return count;
}

function scoreRespawnCandidate(
  candidate: THREE.Vector3,
  friendlyAnchor: THREE.Vector3,
  objective: THREE.Vector3,
  alliance: Alliance,
  warSimulator?: WarSimulator
): number {
  const enemyAlliance = getEnemyAlliance(alliance);
  const enemy250 = countNearbyAgents(candidate, 250, enemyAlliance, warSimulator);
  const enemy400 = countNearbyAgents(candidate, 400, enemyAlliance, warSimulator);
  const friendly220 = countNearbyAgents(candidate, 220, alliance, warSimulator);
  const objectiveDistance = candidate.distanceTo(objective);
  const friendlyDistance = candidate.distanceTo(friendlyAnchor);

  return enemy250 * 8
    + enemy400 * 2.5
    - friendly220 * 1.25
    - objectiveDistance * 0.01
    - friendlyDistance * 0.002;
}

export function resolveInitialSpawnPosition(
  definition: GameModeDefinition,
  alliance: Alliance = Alliance.BLUFOR
): THREE.Vector3 {
  const { config, policies } = definition;

  if (policies.respawn.initialSpawnRule === 'origin') {
    return new THREE.Vector3(0, 0, 0);
  }

  if (policies.respawn.initialSpawnRule === 'forward_insertion') {
    const insertion = resolveForwardInsertionFromZones(config.zones, alliance);
    if (insertion) return insertion;
  }

  return getPrimaryAllianceBase(config, alliance)?.position.clone() ?? DEFAULT_SPAWN.clone();
}

export function resolveRespawnFallbackPosition(
  policy: RespawnPolicyConfig,
  options: PressureFrontOptions
): THREE.Vector3 | null {
  const alliance = options.alliance ?? Alliance.BLUFOR;
  if (policy.fallbackRule !== 'pressure_front') return null;

  const friendlyForward = options.zones.filter(zone => !zone.isHomeBase && isControlledByAlliance(zone, alliance));
  if (friendlyForward.length === 0) return null;

  const objectiveCandidates = options.zones.filter(zone => !zone.isHomeBase && !isControlledByAlliance(zone, alliance));
  if (objectiveCandidates.length === 0) return friendlyForward[0].position.clone();

  const objective = selectForwardObjective(objectiveCandidates, alliance) ?? objectiveCandidates[0];
  const nearestFriendly = selectNearestZone(objective.position, friendlyForward) ?? friendlyForward[0];
  const enemyHotspot = getEnemyHotspotNear(objective.position, 900, alliance, options.warSimulator);
  const anchor = enemyHotspot ?? objective.position;

  const dir = new THREE.Vector3().subVectors(nearestFriendly.position, anchor);
  dir.y = 0;
  const distance = dir.length();
  if (distance < 1) return nearestFriendly.position.clone();
  dir.divideScalar(distance);

  const offset = enemyHotspot
    ? Math.min(110, Math.max(55, distance * 0.2))
    : Math.min(160, Math.max(80, distance * 0.3));
  const anchorSpawn = anchor.clone().addScaledVector(dir, offset);
  const candidates = buildRespawnCandidates(anchorSpawn, dir);

  let best: { position: THREE.Vector3; score: number } | null = null;
  for (const candidate of candidates) {
    if (options.terrainReadyAt && !options.terrainReadyAt(candidate.x, candidate.z)) continue;
    const score = scoreRespawnCandidate(candidate, nearestFriendly.position, objective.position, alliance, options.warSimulator);
    if (!best || score > best.score) {
      best = { position: candidate, score };
    }
  }

  return best?.position ?? anchorSpawn;
}
