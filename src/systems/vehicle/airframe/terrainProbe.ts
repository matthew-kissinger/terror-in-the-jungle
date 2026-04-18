/**
 * Terrain probe adapters. Tests and call sites construct the probe the
 * Airframe queries. Production: binds to ITerrainRuntime. Tests: typically
 * supply a flat / height-function probe.
 */

import * as THREE from 'three';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';
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

/**
 * Probe backed by an `(x, z) => height` function. Useful for scripted test
 * scenarios like the "cliff" case where terrain jumps at a threshold.
 */
export function createHeightFunctionProbe(
  heightAt: (x: number, z: number) => number,
): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample(x: number, z: number): AirframeTerrainSample {
      return { height: heightAt(x, z), normal };
    },
    sweep(
      from: THREE.Vector3,
      to: THREE.Vector3,
    ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null {
      // Sample a handful of points along the segment. For production we'd
      // use ITerrainRuntime.raycastTerrain; for headless scenarios a stepped
      // sampler catches the common "ridge rising into the flight path" case.
      const steps = 8;
      const prev = from.clone();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const cur = new THREE.Vector3().lerpVectors(from, to, t);
        const h = heightAt(cur.x, cur.z);
        if (cur.y < h) {
          // Back off to the previous sample (which was above ground) and
          // clamp to the ridge height.
          const point = prev.clone();
          point.y = Math.max(point.y, h);
          return { hit: true, point, normal };
        }
        prev.copy(cur);
      }
      return null;
    },
  };
}

/**
 * Production probe that delegates to ITerrainRuntime. Uses raycastTerrain
 * for the swept query — no fence changes required.
 */
export function createTerrainRuntimeProbe(terrain: ITerrainRuntime): AirframeTerrainProbe {
  const sampleNormal = new THREE.Vector3(0, 1, 0);
  const _rayDir = new THREE.Vector3();
  return {
    sample(x: number, z: number): AirframeTerrainSample {
      terrain.getNormalAt(x, z, sampleNormal);
      return { height: terrain.getHeightAt(x, z), normal: sampleNormal.clone() };
    },
    sweep(
      from: THREE.Vector3,
      to: THREE.Vector3,
    ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null {
      _rayDir.subVectors(to, from);
      const distance = _rayDir.length();
      if (distance < 0.0001) return null;
      _rayDir.multiplyScalar(1 / distance);
      const hit = terrain.raycastTerrain(from, _rayDir, distance);
      if (!hit.hit || !hit.point) return null;
      const normalOut = new THREE.Vector3();
      terrain.getNormalAt(hit.point.x, hit.point.z, normalOut);
      return {
        hit: true,
        point: hit.point.clone(),
        normal: normalOut,
      };
    },
  };
}
