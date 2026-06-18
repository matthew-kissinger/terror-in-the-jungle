// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

const TERRAIN_SAMPLE_STEP = 2.0;
const TERRAIN_OCCLUSION_EPSILON = 0.15;
const CLOSE_RANGE_HEIGHT_PROFILE_DISTANCE = 200;
const CLOSE_RANGE_HEIGHT_PROFILE_MARGIN = 1.0;
const CLOSE_RANGE_HEIGHT_PROFILE_REQUIRED_SAMPLES = 2;
const TERRAIN_PROFILE_ENDPOINT_PADDING = 4.0;
const DEFAULT_PROFILE_MAX_DISTANCE = 280;

export function findTerrainFireProfileBlockDistance(
  terrainSystem: ITerrainRuntime | undefined,
  ray: THREE.Ray,
  maxDistance: number,
  scratchSamplePoint: THREE.Vector3,
  maxProfileDistance = DEFAULT_PROFILE_MAX_DISTANCE,
): number | null {
  if (!terrainSystem) {
    return null;
  }

  const end = Math.min(maxDistance, maxProfileDistance);
  if (!Number.isFinite(end) || end <= TERRAIN_SAMPLE_STEP) return null;

  const endpointPadding = Math.min(
    TERRAIN_PROFILE_ENDPOINT_PADDING,
    Math.max(0, end * 0.15),
  );
  const startDistance = Math.max(TERRAIN_SAMPLE_STEP, endpointPadding);
  const stopDistance = end - endpointPadding;
  if (stopDistance <= startDistance) return null;

  const isCloseRange = end <= CLOSE_RANGE_HEIGHT_PROFILE_DISTANCE;
  const requiredBlockingSamples = isCloseRange
    ? CLOSE_RANGE_HEIGHT_PROFILE_REQUIRED_SAMPLES
    : 1;
  const occlusionMargin = isCloseRange
    ? CLOSE_RANGE_HEIGHT_PROFILE_MARGIN
    : -TERRAIN_OCCLUSION_EPSILON;
  let firstBlockingDistance = 0;
  let consecutiveBlockingSamples = 0;

  for (let d = startDistance; d < stopDistance; d += TERRAIN_SAMPLE_STEP) {
    scratchSamplePoint.copy(ray.origin).addScaledVector(ray.direction, d);
    const terrainY = terrainSystem.getEffectiveHeightAt(scratchSamplePoint.x, scratchSamplePoint.z);
    if (!Number.isFinite(terrainY)) {
      consecutiveBlockingSamples = 0;
      continue;
    }

    if (terrainY - scratchSamplePoint.y >= occlusionMargin) {
      if (consecutiveBlockingSamples === 0) {
        firstBlockingDistance = d;
      }
      consecutiveBlockingSamples++;
      if (consecutiveBlockingSamples >= requiredBlockingSamples) {
        return firstBlockingDistance;
      }
    } else {
      consecutiveBlockingSamples = 0;
    }
  }

  return null;
}
