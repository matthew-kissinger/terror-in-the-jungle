/**
 * Terrain probe adapters. Tests and call sites construct the probe the
 * Airframe queries. Production: binds to ITerrainRuntime. Tests: typically
 * supply a flat / height-function probe.
 */

import * as THREE from 'three';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';
import type { AirframeTerrainProbe, AirframeTerrainSample } from './types';

const RUNTIME_SWEEP_SAMPLE_SPACING_M = 4;
const RUNTIME_SWEEP_MAX_STEPS = 24;
const RUNTIME_SWEEP_BISECTION_STEPS = 6;
const TERRAIN_CONTACT_EPSILON_M = 0.02;

/**
 * Probe that returns a fixed height everywhere and reports a terrain hit
 * whenever the segment endpoint dips below that height. Useful for headless
 * tests and the flight-test scene.
 */
export function createFlatTerrainProbe(height: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample(_x: number, _z: number): AirframeTerrainSample {
      return { height, normal };
    },
    sweep(
      from: THREE.Vector3,
      to: THREE.Vector3,
    ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null {
      if (from.y >= height && to.y < height) {
        // Linear interpolate to the crossing point.
        const t = (from.y - height) / Math.max(from.y - to.y, 0.0001);
        const point = new THREE.Vector3().lerpVectors(from, to, t);
        point.y = height;
        return { hit: true, point, normal };
      }
      return null;
    },
  };
}

/**
 * Production probe backed by the terrain runtime. It samples height/normal at
 * the queried XZ and sweeps against the full movement segment so fast aircraft
 * cannot miss rising terrain between the old and new positions.
 */
export function createRuntimeTerrainProbe(terrain: ITerrainRuntime): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  const rayDirection = new THREE.Vector3();
  const sweepPoint = new THREE.Vector3();
  const testPoint = new THREE.Vector3();

  const updateNormal = (x: number, z: number): THREE.Vector3 => {
    terrain.getNormalAt(x, z, normal);
    if (normal.lengthSq() <= 0.0001) {
      normal.set(0, 1, 0);
    } else {
      normal.normalize();
    }
    return normal;
  };

  const makeHit = (x: number, z: number) => {
    const height = terrain.getHeightAt(x, z);
    sweepPoint.set(x, height, z);
    return { hit: true, point: sweepPoint, normal: updateNormal(x, z) };
  };

  const clearanceAt = (from: THREE.Vector3, to: THREE.Vector3, t: number): number => {
    testPoint.lerpVectors(from, to, t);
    return testPoint.y - terrain.getHeightAt(testPoint.x, testPoint.z);
  };

  const sweepHeightfield = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    segmentLength: number,
  ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null => {
    let previousT = 0;
    if (clearanceAt(from, to, previousT) <= TERRAIN_CONTACT_EPSILON_M) {
      return makeHit(from.x, from.z);
    }

    const steps = Math.max(
      1,
      Math.min(RUNTIME_SWEEP_MAX_STEPS, Math.ceil(segmentLength / RUNTIME_SWEEP_SAMPLE_SPACING_M)),
    );

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const clearance = clearanceAt(from, to, t);
      if (clearance <= TERRAIN_CONTACT_EPSILON_M) {
        let lo = previousT;
        let hi = t;
        for (let j = 0; j < RUNTIME_SWEEP_BISECTION_STEPS; j++) {
          const mid = (lo + hi) * 0.5;
          if (clearanceAt(from, to, mid) > TERRAIN_CONTACT_EPSILON_M) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        testPoint.lerpVectors(from, to, hi);
        return makeHit(testPoint.x, testPoint.z);
      }
      previousT = t;
    }

    return null;
  };

  return {
    sample(x: number, z: number): AirframeTerrainSample {
      return { height: terrain.getHeightAt(x, z), normal: updateNormal(x, z) };
    },
    sweep(
      from: THREE.Vector3,
      to: THREE.Vector3,
    ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null {
      const segmentLength = rayDirection.subVectors(to, from).length();
      if (segmentLength <= 0.0001) {
        return sweepHeightfield(from, to, 0);
      }

      rayDirection.divideScalar(segmentLength);
      const terrainHit = terrain.raycastTerrain(from, rayDirection, segmentLength);
      if (terrainHit.hit) {
        if (terrainHit.point) {
          return makeHit(terrainHit.point.x, terrainHit.point.z);
        }
        if (terrainHit.distance !== undefined) {
          sweepPoint.copy(from).addScaledVector(rayDirection, terrainHit.distance);
          return makeHit(sweepPoint.x, sweepPoint.z);
        }
      }

      return sweepHeightfield(from, to, segmentLength);
    },
  };
}
