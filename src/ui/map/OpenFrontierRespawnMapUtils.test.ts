// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it } from 'vitest';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';
import {
  MAP_SIZE,
  computeHitRadiusMapUnits,
  pickNearestSpawnWithinRadius,
  setMapWorldSize,
  worldToMap,
} from './OpenFrontierRespawnMapUtils';

/** Minimal spawn point — only `position.x/z` is read by worldToMap. */
function makeSpawn(id: string, worldX: number, worldZ: number): RespawnSpawnPoint {
  return { id, name: id, position: { x: worldX, z: worldZ } } as unknown as RespawnSpawnPoint;
}

describe('OpenFrontierRespawnMapUtils — spawn tap targeting (UX-2)', () => {
  beforeEach(() => {
    setMapWorldSize(3200); // scale = MAP_SIZE / WORLD_SIZE = 0.25
  });

  describe('computeHitRadiusMapUnits', () => {
    it('is a ~22 map-unit target at native width and zoom 1', () => {
      expect(computeHitRadiusMapUnits(1, MAP_SIZE)).toBeCloseTo(22, 5);
    });

    it('grows the map-unit radius on a shrunk mobile canvas so the finger target holds', () => {
      // 200px canvas at zoom 1 -> 22 * (800 / 200) = 88 map-units (still under the cap).
      expect(computeHitRadiusMapUnits(1, 200)).toBeCloseTo(88, 5);
      // Bigger than the desktop-native target — that is the whole point.
      expect(computeHitRadiusMapUnits(1, 200)).toBeGreaterThan(computeHitRadiusMapUnits(1, MAP_SIZE));
    });

    it('clamps to a minimum so very zoomed-in pins stay pickable', () => {
      // zoom 4 -> 22 * (800 / (800*4)) = 5.5 -> clamped up to 14.
      expect(computeHitRadiusMapUnits(4, MAP_SIZE)).toBe(14);
    });

    it('clamps to a maximum so very zoomed-out taps never merge adjacent spawns', () => {
      expect(computeHitRadiusMapUnits(0.05, 200)).toBe(90);
    });

    it('falls back to the canvas-native width when the live rect is unavailable', () => {
      expect(computeHitRadiusMapUnits(1, 0)).toBeCloseTo(22, 5);
    });
  });

  describe('pickNearestSpawnWithinRadius', () => {
    // A at world (0,0) -> map (400,400); B at world (400,0) -> map (300,400).
    const a = makeSpawn('a', 0, 0);
    const b = makeSpawn('b', 400, 0);
    const spawns = [a, b];

    it('selects a spawn under a direct hit', () => {
      const mapA = worldToMap(0, 0);
      expect(pickNearestSpawnWithinRadius(mapA.x, mapA.y, spawns, 22)?.id).toBe('a');
    });

    it('selects on a near-miss within the radius (coarse tap)', () => {
      // 10 map-units off A, radius 30.
      expect(pickNearestSpawnWithinRadius(390, 400, spawns, 30)?.id).toBe('a');
    });

    it('returns the NEAREST when several spawns are in range (not first-found)', () => {
      // map(360,400): 40 from A, 60 from B; radius 70 -> both in range -> nearest A.
      expect(pickNearestSpawnWithinRadius(360, 400, spawns, 70)?.id).toBe('a');
      // map(330,400): 70 from A, 30 from B; radius 80 -> nearest B.
      expect(pickNearestSpawnWithinRadius(330, 400, spawns, 80)?.id).toBe('b');
    });

    it('returns undefined when no spawn is within the radius', () => {
      expect(pickNearestSpawnWithinRadius(100, 400, spawns, 30)).toBeUndefined();
    });

    it('returns undefined for an empty spawn list', () => {
      expect(pickNearestSpawnWithinRadius(400, 400, [], 90)).toBeUndefined();
    });
  });
});
