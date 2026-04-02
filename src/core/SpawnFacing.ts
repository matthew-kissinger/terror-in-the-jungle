import type { ITerrainRuntime } from '../types/SystemInterfaces';

type PositionLike = {
  x: number;
  z: number;
};

const SAMPLE_DISTANCES = [10, 20, 30, 40];
const SAMPLE_YAWS = [
  Math.PI,
  0,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI / 4,
  -Math.PI / 4,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4
];
const SPAWN_SEARCH_RADII = [0, 12, 24, 36, 48];
const SPAWN_SEARCH_ANGLES = [
  0,
  Math.PI / 4,
  Math.PI / 2,
  (3 * Math.PI) / 4,
  Math.PI,
  (-3 * Math.PI) / 4,
  -Math.PI / 2,
  -Math.PI / 4
];
const LOCAL_CLEARANCE_DISTANCES = [6, 12];
const EYE_CLEARANCE_METERS = 2;

function yawToForward(yaw: number): { x: number; z: number } {
  return {
    x: -Math.sin(yaw),
    z: -Math.cos(yaw)
  };
}

function scoreFacingDirection(
  position: PositionLike,
  terrainSystem: Pick<ITerrainRuntime, 'getEffectiveHeightAt'>,
  yaw: number
): number {
  const baseHeight = terrainSystem.getEffectiveHeightAt(position.x, position.z);
  if (!Number.isFinite(baseHeight)) {
    return Number.POSITIVE_INFINITY;
  }

  const forward = yawToForward(yaw);
  let score = 0;

  for (const distance of SAMPLE_DISTANCES) {
    const sampleHeight = terrainSystem.getEffectiveHeightAt(
      position.x + forward.x * distance,
      position.z + forward.z * distance
    );
    if (!Number.isFinite(sampleHeight)) {
      return Number.POSITIVE_INFINITY;
    }

    const rise = sampleHeight - baseHeight;
    const weight = 1 + distance * 0.05;
    if (rise > EYE_CLEARANCE_METERS) {
      score += (rise - EYE_CLEARANCE_METERS) * weight * 6;
    } else if (rise > 0) {
      score += rise * weight * 2;
    } else {
      score += Math.abs(rise) * weight * 0.2;
    }
  }

  return score;
}

function scoreSpawnPosition(
  anchor: PositionLike,
  candidate: PositionLike,
  terrainSystem: Pick<ITerrainRuntime, 'getEffectiveHeightAt' | 'getSlopeAt'>
): number {
  const anchorHeight = terrainSystem.getEffectiveHeightAt(anchor.x, anchor.z);
  const baseHeight = terrainSystem.getEffectiveHeightAt(candidate.x, candidate.z);
  if (!Number.isFinite(baseHeight) || !Number.isFinite(anchorHeight)) {
    return Number.POSITIVE_INFINITY;
  }

  const slope = terrainSystem.getSlopeAt(candidate.x, candidate.z);
  let localRisePenalty = 0;

  for (const yaw of SAMPLE_YAWS) {
    const forward = yawToForward(yaw);
    for (const distance of LOCAL_CLEARANCE_DISTANCES) {
      const sampleHeight = terrainSystem.getEffectiveHeightAt(
        candidate.x + forward.x * distance,
        candidate.z + forward.z * distance
      );
      if (!Number.isFinite(sampleHeight)) {
        return Number.POSITIVE_INFINITY;
      }

      const rise = sampleHeight - baseHeight;
      if (rise > 1) {
        localRisePenalty += rise * (1 + distance * 0.05);
      }
    }
  }

  const dx = candidate.x - anchor.x;
  const dz = candidate.z - anchor.z;
  const distanceFromAnchor = Math.hypot(dx, dz);
  const uphillPenalty = Math.max(0, baseHeight - anchorHeight);

  return Math.max(0, slope) * 3 + localRisePenalty * 5 + uphillPenalty * 4 + distanceFromAnchor * 0.08;
}

export function resolveNearbySafeSpawnPosition(
  anchor: PositionLike,
  terrainSystem: Pick<ITerrainRuntime, 'getEffectiveHeightAt' | 'getSlopeAt'>
): PositionLike {
  let best = { x: anchor.x, z: anchor.z };
  let bestScore = scoreSpawnPosition(anchor, best, terrainSystem);

  for (const radius of SPAWN_SEARCH_RADII) {
    for (const angle of SPAWN_SEARCH_ANGLES) {
      const candidate = {
        x: anchor.x + Math.cos(angle) * radius,
        z: anchor.z + Math.sin(angle) * radius
      };
      const score = scoreSpawnPosition(anchor, candidate, terrainSystem);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return best;
}

export function resolveOpenSpawnFacingYaw(
  position: PositionLike,
  terrainSystem: Pick<ITerrainRuntime, 'getEffectiveHeightAt'>,
  fallbackYaw = Math.PI
): number {
  let bestYaw = fallbackYaw;
  let bestScore = scoreFacingDirection(position, terrainSystem, fallbackYaw);

  for (const yaw of SAMPLE_YAWS) {
    const score = scoreFacingDirection(position, terrainSystem, yaw);
    if (score < bestScore) {
      bestScore = score;
      bestYaw = yaw;
    }
  }

  return Number.isFinite(bestScore) ? bestYaw : fallbackYaw;
}
