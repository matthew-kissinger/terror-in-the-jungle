import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CoverSpatialGrid, COVER_GRID_CELL_SIZE } from './CoverSpatialGrid';
import { mockTerrainRuntime } from '../../../test-utils';

/**
 * Behavior tests for `CoverSpatialGrid`. These cover what a caller sees
 * — insertion, removal, range queries, LOS-gated queries, edge cases
 * — without asserting internal cell shape or scan order. Determinism
 * is asserted explicitly: same inputs => same result order.
 */
describe('CoverSpatialGrid', () => {
  let grid: CoverSpatialGrid;

  beforeEach(() => {
    grid = new CoverSpatialGrid();
  });

  describe('construction', () => {
    it('defaults to the cycle-mandated 8 m cell size', () => {
      expect(grid.getCellSize()).toBe(COVER_GRID_CELL_SIZE);
      expect(COVER_GRID_CELL_SIZE).toBe(8);
    });

    it('rejects non-positive cell sizes', () => {
      expect(() => new CoverSpatialGrid(0)).toThrow();
      expect(() => new CoverSpatialGrid(-4)).toThrow();
      expect(() => new CoverSpatialGrid(Number.NaN)).toThrow();
    });

    it('starts empty', () => {
      expect(grid.size).toBe(0);
      expect(grid.has('anything')).toBe(false);
    });
  });

  describe('insert and remove', () => {
    it('indexes a cover entry so it becomes queryable', () => {
      grid.insert('cover-a', new THREE.Vector3(4, 0, 4));

      expect(grid.size).toBe(1);
      expect(grid.has('cover-a')).toBe(true);

      const hits = grid.queryNearest(new THREE.Vector3(0, 0, 0), 10);
      expect(hits).toHaveLength(1);
      expect(hits[0].coverId).toBe('cover-a');
    });

    it('moves an entry when re-inserted at a new position', () => {
      grid.insert('cover-a', new THREE.Vector3(4, 0, 4));
      grid.insert('cover-a', new THREE.Vector3(40, 0, 40));

      expect(grid.size).toBe(1);
      expect(grid.queryNearest(new THREE.Vector3(0, 0, 0), 10)).toHaveLength(0);

      const farHits = grid.queryNearest(new THREE.Vector3(40, 0, 40), 5);
      expect(farHits.map((h) => h.coverId)).toEqual(['cover-a']);
    });

    it('rejects insertions with non-finite coordinates', () => {
      expect(grid.insert('bad', new THREE.Vector3(Number.NaN, 0, 0))).toBe(false);
      expect(grid.insert('bad2', new THREE.Vector3(0, 0, Number.POSITIVE_INFINITY))).toBe(false);
      expect(grid.size).toBe(0);
    });

    it('remove() drops the entry and returns false on unknown ids', () => {
      grid.insert('cover-a', new THREE.Vector3(0, 0, 0));
      expect(grid.remove('cover-a')).toBe(true);
      expect(grid.size).toBe(0);
      expect(grid.has('cover-a')).toBe(false);
      expect(grid.remove('cover-a')).toBe(false);
      expect(grid.remove('never-existed')).toBe(false);
    });

    it('clear() empties the grid', () => {
      grid.insert('a', new THREE.Vector3(0, 0, 0));
      grid.insert('b', new THREE.Vector3(50, 0, 50));
      grid.clear();
      expect(grid.size).toBe(0);
      expect(grid.queryNearest(new THREE.Vector3(0, 0, 0), 1000)).toHaveLength(0);
    });
  });

  describe('queryNearest', () => {
    it('returns nothing when the grid is empty', () => {
      expect(grid.queryNearest(new THREE.Vector3(0, 0, 0), 100)).toEqual([]);
    });

    it('returns only candidates inside the radius', () => {
      grid.insert('near', new THREE.Vector3(3, 0, 0));
      grid.insert('far', new THREE.Vector3(50, 0, 0));

      const hits = grid.queryNearest(new THREE.Vector3(0, 0, 0), 10);
      expect(hits.map((h) => h.coverId)).toEqual(['near']);
    });

    it('sorts results by ascending distance', () => {
      grid.insert('mid', new THREE.Vector3(20, 0, 0));
      grid.insert('far', new THREE.Vector3(40, 0, 0));
      grid.insert('near', new THREE.Vector3(5, 0, 0));

      const hits = grid.queryNearest(new THREE.Vector3(0, 0, 0), 50);
      expect(hits.map((h) => h.coverId)).toEqual(['near', 'mid', 'far']);
      expect(hits[0].distance).toBeLessThan(hits[1].distance);
      expect(hits[1].distance).toBeLessThan(hits[2].distance);
    });

    it('includes cover entries that sit across cell boundaries', () => {
      // 8 m cell size: these positions land in three distinct cells.
      grid.insert('a', new THREE.Vector3(1, 0, 1));
      grid.insert('b', new THREE.Vector3(9, 0, 1));
      grid.insert('c', new THREE.Vector3(17, 0, 1));

      const hits = grid.queryNearest(new THREE.Vector3(9, 0, 1), 20);
      expect(hits.map((h) => h.coverId).sort()).toEqual(['a', 'b', 'c']);
    });

    it('produces the same ordering regardless of insertion order (determinism)', () => {
      const positions: Array<[string, THREE.Vector3]> = [
        ['alpha', new THREE.Vector3(10, 0, 0)],
        ['bravo', new THREE.Vector3(20, 0, 0)],
        ['charlie', new THREE.Vector3(30, 0, 0)],
        ['delta', new THREE.Vector3(5, 0, 0)],
      ];

      const gridA = new CoverSpatialGrid();
      positions.forEach(([id, p]) => gridA.insert(id, p));
      const gridB = new CoverSpatialGrid();
      [...positions].reverse().forEach(([id, p]) => gridB.insert(id, p));

      const origin = new THREE.Vector3(0, 0, 0);
      const a = gridA.queryNearest(origin, 100).map((h) => h.coverId);
      const b = gridB.queryNearest(origin, 100).map((h) => h.coverId);
      expect(a).toEqual(b);
      expect(a).toEqual(['delta', 'alpha', 'bravo', 'charlie']);
    });

    it('uses lexicographic coverId as the deterministic tiebreaker at equal distance', () => {
      // Three distinct ids at identical distance (5) from the origin.
      grid.insert('zeta', new THREE.Vector3(3, 0, 4));
      grid.insert('alpha', new THREE.Vector3(-3, 0, 4));
      grid.insert('mike', new THREE.Vector3(3, 0, -4));

      const hits = grid.queryNearest(new THREE.Vector3(0, 0, 0), 10);
      expect(hits.map((h) => h.coverId)).toEqual(['alpha', 'mike', 'zeta']);
    });

    it('returns nothing for non-positive radii or non-finite origins', () => {
      grid.insert('cover-a', new THREE.Vector3(0, 0, 0));
      expect(grid.queryNearest(new THREE.Vector3(0, 0, 0), 0)).toEqual([]);
      expect(grid.queryNearest(new THREE.Vector3(0, 0, 0), -5)).toEqual([]);
      expect(grid.queryNearest(new THREE.Vector3(Number.NaN, 0, 0), 100)).toEqual([]);
    });

    it('clones cover positions into results so callers cannot mutate the grid', () => {
      grid.insert('a', new THREE.Vector3(3, 0, 0));
      const hits = grid.queryNearest(new THREE.Vector3(0, 0, 0), 100);
      hits[0].position.set(999, 999, 999);

      const recheck = grid.queryNearest(new THREE.Vector3(0, 0, 0), 100);
      expect(recheck[0].position.x).toBeCloseTo(3, 5);
      expect(recheck[0].position.z).toBeCloseTo(0, 5);
    });
  });

  describe('queryWithLOS', () => {
    it('returns nothing when terrainRuntime, grid, or inputs are degenerate', () => {
      const terrain = mockTerrainRuntime();
      grid.insert('a', new THREE.Vector3(5, 0, 0));

      expect(grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), null)).toEqual([]);
      expect(grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), undefined)).toEqual([]);
      expect(grid.queryWithLOS(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(20, 0, 0), terrain)).toEqual([]);
      expect(grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0), terrain)).toEqual([]);

      const emptyGrid = new CoverSpatialGrid();
      expect(emptyGrid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), terrain)).toEqual([]);
    });

    it('includes a candidate when terrain ray does not hit anything', () => {
      grid.insert('clear', new THREE.Vector3(5, 0, 0));
      const terrain = mockTerrainRuntime(); // raycast returns { hit: false }

      const hits = grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), terrain);
      expect(hits.map((h) => h.coverId)).toEqual(['clear']);
    });

    it('includes a candidate when the terrain hit is beyond the target', () => {
      grid.insert('clear', new THREE.Vector3(5, 0, 0));
      const terrain = mockTerrainRuntime({
        raycastTerrain: () => ({ hit: true, distance: 1000 }),
      });

      const hits = grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), terrain);
      expect(hits.map((h) => h.coverId)).toEqual(['clear']);
    });

    it('excludes a candidate when terrain occludes the line to target', () => {
      grid.insert('blocked', new THREE.Vector3(5, 0, 0));
      const terrain = mockTerrainRuntime({
        raycastTerrain: () => ({ hit: true, distance: 1 }),
      });

      const hits = grid.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0), terrain);
      expect(hits).toHaveLength(0);
    });

    it('returns only the visible subset in nearest-first order', () => {
      grid.insert('near', new THREE.Vector3(3, 0, 0));
      grid.insert('mid', new THREE.Vector3(10, 0, 0));
      grid.insert('far', new THREE.Vector3(25, 0, 0));

      // Block only the mid candidate; the rest have clear LOS.
      const terrain = mockTerrainRuntime({
        raycastTerrain: (origin: THREE.Vector3) => {
          if (Math.abs(origin.x - 10) < 0.001) return { hit: true, distance: 1 };
          return { hit: false, distance: undefined };
        },
      });

      const hits = grid.queryWithLOS(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(100, 0, 0),
        terrain,
        50,
      );
      expect(hits.map((h) => h.coverId)).toEqual(['near', 'far']);
    });
  });

  describe('large-grid behavior', () => {
    it('keeps queries scoped to the cells overlapping the radius', () => {
      // 100 entries scattered across a 500x500 area. Verify the range
      // query only returns the ones that actually sit within the radius.
      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * 50;
        const z = Math.floor(i / 10) * 50;
        grid.insert(`c-${i.toString().padStart(3, '0')}`, new THREE.Vector3(x, 0, z));
      }

      const origin = new THREE.Vector3(100, 0, 100);
      const radius = 60;
      const hits = grid.queryNearest(origin, radius);

      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThan(100);
      for (const hit of hits) {
        const dx = hit.position.x - origin.x;
        const dz = hit.position.z - origin.z;
        expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(radius + 1e-6);
      }
    });

    it('reports the same result set after equivalent insert + remove churn', () => {
      const final: Array<[string, THREE.Vector3]> = [
        ['a', new THREE.Vector3(2, 0, 0)],
        ['b', new THREE.Vector3(15, 0, 0)],
        ['c', new THREE.Vector3(27, 0, 3)],
      ];

      const churn = new CoverSpatialGrid();
      churn.insert('tmp1', new THREE.Vector3(99, 0, 99));
      churn.insert('a', new THREE.Vector3(2, 0, 0));
      churn.insert('tmp2', new THREE.Vector3(-50, 0, -50));
      churn.insert('b', new THREE.Vector3(15, 0, 0));
      churn.insert('c', new THREE.Vector3(27, 0, 3));
      churn.remove('tmp1');
      churn.remove('tmp2');

      const fresh = new CoverSpatialGrid();
      final.forEach(([id, p]) => fresh.insert(id, p));

      const origin = new THREE.Vector3(0, 0, 0);
      expect(churn.queryNearest(origin, 100)).toEqual(fresh.queryNearest(origin, 100));
    });
  });
});
