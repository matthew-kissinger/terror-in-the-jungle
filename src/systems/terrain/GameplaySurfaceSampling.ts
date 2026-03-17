import * as THREE from 'three';

export interface SupportNormalSampleOptions {
  sampleDistance?: number;
  footprintRadius?: number;
  lookaheadDistance?: number;
  moveX?: number;
  moveZ?: number;
  centerWeight?: number;
}

const DEFAULT_SAMPLE_DISTANCE = 1.35;
const DEFAULT_FOOTPRINT_RADIUS = 0.7;
const DEFAULT_LOOKAHEAD_DISTANCE = 0.9;
const DEFAULT_CENTER_WEIGHT = 2.0;
const MIN_DIRECTION_LENGTH = 0.001;
const LOOKAHEAD_WEIGHT = 1.5;

const _sampleNormal = new THREE.Vector3();

export function computeSlopeValueFromNormal(normal: THREE.Vector3): number {
  return 1 - normal.y;
}

export function computeForwardGrade(
  sampleHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  moveX: number,
  moveZ: number,
  probeDistance = 1.25,
): number {
  const length = Math.hypot(moveX, moveZ);
  if (length < MIN_DIRECTION_LENGTH || probeDistance <= 0) {
    return 0;
  }

  const dirX = moveX / length;
  const dirZ = moveZ / length;
  const currentHeight = sampleHeight(x, z);
  const aheadHeight = sampleHeight(
    x + dirX * probeDistance,
    z + dirZ * probeDistance,
  );
  return (aheadHeight - currentHeight) / probeDistance;
}

export function computeSmoothedSupportNormal(
  sampleHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  target: THREE.Vector3,
  options: SupportNormalSampleOptions = {},
): THREE.Vector3 {
  const sampleDistance = options.sampleDistance ?? DEFAULT_SAMPLE_DISTANCE;
  const footprintRadius = options.footprintRadius ?? DEFAULT_FOOTPRINT_RADIUS;
  const lookaheadDistance = options.lookaheadDistance ?? DEFAULT_LOOKAHEAD_DISTANCE;
  const centerWeight = options.centerWeight ?? DEFAULT_CENTER_WEIGHT;
  const moveX = options.moveX ?? 0;
  const moveZ = options.moveZ ?? 0;
  const directionLength = Math.hypot(moveX, moveZ);

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let totalWeight = 0;

  const accumulateNormal = (sampleX: number, sampleZ: number, weight: number): void => {
    sampleSurfaceNormal(sampleHeight, sampleX, sampleZ, sampleDistance, _sampleNormal);
    sumX += _sampleNormal.x * weight;
    sumY += _sampleNormal.y * weight;
    sumZ += _sampleNormal.z * weight;
    totalWeight += weight;
  };

  accumulateNormal(x, z, centerWeight);
  accumulateNormal(x + footprintRadius, z, 1);
  accumulateNormal(x - footprintRadius, z, 1);
  accumulateNormal(x, z + footprintRadius, 1);
  accumulateNormal(x, z - footprintRadius, 1);

  if (directionLength >= MIN_DIRECTION_LENGTH && lookaheadDistance > 0) {
    const dirX = moveX / directionLength;
    const dirZ = moveZ / directionLength;
    accumulateNormal(
      x + dirX * lookaheadDistance,
      z + dirZ * lookaheadDistance,
      LOOKAHEAD_WEIGHT,
    );
  }

  if (totalWeight <= 0) {
    return target.set(0, 1, 0);
  }

  return target.set(sumX, sumY, sumZ).normalize();
}

function sampleSurfaceNormal(
  sampleHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  sampleDistance: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const northHeight = sampleHeight(x, z + sampleDistance);
  const southHeight = sampleHeight(x, z - sampleDistance);
  const eastHeight = sampleHeight(x + sampleDistance, z);
  const westHeight = sampleHeight(x - sampleDistance, z);

  return target.set(
    (westHeight - eastHeight) / (2 * sampleDistance),
    1,
    (southHeight - northHeight) / (2 * sampleDistance),
  ).normalize();
}
