/**
 * Terrain probe adapters. Tests and call sites construct the probe the
 * Airframe queries. Production: binds to ITerrainRuntime. Tests: typically
 * supply a flat / height-function probe.
 */

import * as THREE from 'three';
import type { AirframeTerrainProbe, AirframeTerrainSample } from './types';

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
