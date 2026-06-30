// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it } from 'vitest';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';
import {
  MAP_SIZE,
  clampPanToBounds,
  computeHitRadiusMapUnits,
  maxPanOffset,
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
    it('is an on-screen finger target at native width and zoom 1', () => {
      // 28px CSS tap target -> at native width/zoom that is 28 map-units.
      expect(computeHitRadiusMapUnits(1, MAP_SIZE)).toBeCloseTo(28, 5);
    });

    it('grows the map-unit radius on a shrunk mobile canvas so the finger target holds', () => {
      // 400px canvas at zoom 1 -> 28 * (800 / 400) = 56 map-units (still under the cap).
      expect(computeHitRadiusMapUnits(1, 400)).toBeCloseTo(56, 5);
      // Bigger than the desktop-native target — that is the whole point.
      expect(computeHitRadiusMapUnits(1, 400)).toBeGreaterThan(computeHitRadiusMapUnits(1, MAP_SIZE));
    });

    it('clamps to a minimum so very zoomed-in pins stay pickable', () => {
      // zoom 4 -> 28 * (800 / (800*4)) = 7 -> clamped up to the minimum.
      const minHit = computeHitRadiusMapUnits(4, MAP_SIZE);
      expect(minHit).toBeGreaterThanOrEqual(14);
      // The clamp floor is constant regardless of how far we zoom in.
      expect(computeHitRadiusMapUnits(8, MAP_SIZE)).toBe(minHit);
    });

    it('clamps to a maximum so very zoomed-out taps never merge adjacent spawns', () => {
      const maxHit = computeHitRadiusMapUnits(0.05, 200);
      // An unbounded radius here would be thousands of map-units; the cap holds.
      expect(maxHit).toBeLessThanOrEqual(110);
      expect(computeHitRadiusMapUnits(0.01, 100)).toBe(maxHit);
    });

    it('falls back to the canvas-native width when the live rect is unavailable', () => {
      expect(computeHitRadiusMapUnits(1, 0)).toBeCloseTo(28, 5);
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

  describe('pan bounds (deploy-map-navigation)', () => {
    it('locks the map to centre when zoomed out — no pan into empty space', () => {
      // At zoom <= 1 the content does not overhang the view, so there is
      // nothing to pan to; the bound is zero.
      expect(maxPanOffset(1)).toBe(0);
      expect(maxPanOffset(0.5)).toBe(0);
      const clamped = clampPanToBounds({ x: 5000, y: -5000 }, 1);
      expect(clamped).toEqual({ x: 0, y: 0 });
    });

    it('allows more pan the further you zoom in', () => {
      // Zooming in grows the overhang, so the further in, the more you can pan.
      expect(maxPanOffset(3)).toBeGreaterThan(maxPanOffset(2));
      expect(maxPanOffset(2)).toBeGreaterThan(0);
    });

    it('clamps a fling to the map edge rather than off into empty manila', () => {
      const bound = maxPanOffset(4);
      // A huge drag is pulled back to exactly the edge bound, both directions.
      expect(clampPanToBounds({ x: 99999, y: 99999 }, 4)).toEqual({ x: bound, y: bound });
      expect(clampPanToBounds({ x: -99999, y: -99999 }, 4)).toEqual({ x: -bound, y: -bound });
    });

    it('leaves an in-bounds pan untouched', () => {
      const bound = maxPanOffset(4);
      const inside = { x: bound / 2, y: -bound / 3 };
      expect(clampPanToBounds(inside, 4)).toEqual(inside);
    });
  });
});
