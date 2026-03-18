import * as THREE from 'three';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavmeshSystem } from './NavmeshSystem';

// ── Mock setup ──────────────────────────────────────────────────────

const mockComputePath = vi.fn();
const mockFindClosestPoint = vi.fn();
const mockFindNearestPoly = vi.fn();
const mockQueryDestroy = vi.fn();

// Must use function keyword so vitest treats it as a valid constructor
const MockNavMeshQuery = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
  this.computePath = mockComputePath;
  this.findClosestPoint = mockFindClosestPoint;
  this.findNearestPoly = mockFindNearestPoly;
  this.defaultQueryHalfExtents = { x: 1, y: 1, z: 1 };
  this.destroy = mockQueryDestroy;
});

vi.mock('@recast-navigation/core', () => ({
  init: vi.fn().mockRejectedValue(new Error('WASM not available in tests')),
  Crowd: vi.fn(),
  NavMeshQuery: MockNavMeshQuery,
}));
vi.mock('@recast-navigation/three', () => ({
  threeToSoloNavMesh: vi.fn(),
  threeToTileCache: vi.fn(),
}));
vi.mock('../../utils/Logger');

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a NavmeshSystem with a fake navMesh + navMeshQuery injected,
 * bypassing WASM init and navmesh generation.
 */
function createReadySystem(): NavmeshSystem {
  const system = new NavmeshSystem();
  // Inject internal state to simulate successful init + generation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = system as any;
  s.wasmReady = true;
  s.navMesh = { destroy: vi.fn() }; // fake NavMesh
  s.NavMeshQueryClass = MockNavMeshQuery;
  // Simulate what createCrowd does for the query
  s.navMeshQuery = new MockNavMeshQuery(s.navMesh, { maxNodes: 2048 });
  return system;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('NavmeshSystem', () => {
  let system: NavmeshSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = new NavmeshSystem();
  });

  it('starts with wasmReady = false', () => {
    expect(system.isWasmReady()).toBe(false);
    expect(system.isReady()).toBe(false);
  });

  it('gracefully degrades when WASM fails to init', async () => {
    await system.init();
    expect(system.isWasmReady()).toBe(false);
    expect(system.isReady()).toBe(false);
  });

  it('skips navmesh generation when WASM not ready', async () => {
    await system.generateNavmesh(400);
    expect(system.isReady()).toBe(false);
  });

  it('returns null adapter when navmesh not generated', () => {
    expect(system.getAdapter()).toBeNull();
  });

  it('update is safe when not ready', () => {
    system.update(0.016);
  });

  it('dispose is safe when not initialized', () => {
    system.dispose();
  });
});

describe('NavmeshSystem path queries', () => {
  let system: NavmeshSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = createReadySystem();
  });

  // ── queryPath ───────────────────────────────────────────────────

  describe('queryPath', () => {
    it('returns waypoints for a successful path', () => {
      mockComputePath.mockReturnValue({
        success: true,
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 5, y: 1, z: 5 },
          { x: 10, y: 2, z: 10 },
        ],
      });

      const start = new THREE.Vector3(0, 0, 0);
      const end = new THREE.Vector3(10, 2, 10);
      const result = system.queryPath(start, end);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(3);
      expect(result![0]).toBeInstanceOf(THREE.Vector3);
      expect(result![1].x).toBe(5);
      expect(result![1].y).toBe(1);
      expect(result![2].z).toBe(10);
    });

    it('returns null when path computation fails', () => {
      mockComputePath.mockReturnValue({ success: false, path: [] });

      const result = system.queryPath(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(100, 0, 100),
      );

      expect(result).toBeNull();
    });

    it('returns null when path is empty', () => {
      mockComputePath.mockReturnValue({ success: true, path: [] });

      const result = system.queryPath(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10),
      );

      expect(result).toBeNull();
    });

    it('returns null when navmesh not ready', () => {
      const unready = new NavmeshSystem();
      const result = unready.queryPath(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10),
      );
      expect(result).toBeNull();
    });

    it('passes correct positions to computePath', () => {
      mockComputePath.mockReturnValue({ success: true, path: [{ x: 0, y: 0, z: 0 }] });

      system.queryPath(new THREE.Vector3(3, 7, 11), new THREE.Vector3(20, 5, 30));

      expect(mockComputePath).toHaveBeenCalledWith(
        { x: 3, y: 7, z: 11 },
        { x: 20, y: 5, z: 30 },
      );
    });
  });

  // ── findNearestPoint ────────────────────────────────────────────

  describe('findNearestPoint', () => {
    it('returns the closest navmesh point', () => {
      mockFindClosestPoint.mockReturnValue({
        success: true,
        polyRef: 42,
        point: { x: 5.1, y: 2.3, z: 8.7 },
        isPointOverPoly: true,
      });

      const result = system.findNearestPoint(new THREE.Vector3(5, 2, 9));

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(THREE.Vector3);
      expect(result!.x).toBeCloseTo(5.1);
      expect(result!.z).toBeCloseTo(8.7);
    });

    it('returns null when no poly found', () => {
      mockFindClosestPoint.mockReturnValue({
        success: true,
        polyRef: 0,
        point: { x: 0, y: 0, z: 0 },
        isPointOverPoly: false,
      });

      expect(system.findNearestPoint(new THREE.Vector3(999, 0, 999))).toBeNull();
    });

    it('returns null on query failure', () => {
      mockFindClosestPoint.mockReturnValue({ success: false, polyRef: 0, point: { x: 0, y: 0, z: 0 } });
      expect(system.findNearestPoint(new THREE.Vector3(0, 0, 0))).toBeNull();
    });

    it('uses custom search radius', () => {
      mockFindClosestPoint.mockReturnValue({ success: true, polyRef: 1, point: { x: 0, y: 0, z: 0 }, isPointOverPoly: true });
      system.findNearestPoint(new THREE.Vector3(0, 0, 0), 20);
      expect(mockFindClosestPoint).toHaveBeenCalledWith(
        { x: 0, y: 0, z: 0 },
        { halfExtents: { x: 20, y: 50, z: 20 } },
      );
    });

    it('returns null when navmesh not ready', () => {
      const unready = new NavmeshSystem();
      expect(unready.findNearestPoint(new THREE.Vector3(0, 0, 0))).toBeNull();
    });
  });

  // ── isPointOnNavmesh ────────────────────────────────────────────

  describe('isPointOnNavmesh', () => {
    it('returns true when point is on navmesh', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 5, y: 0, z: 5 },
        isOverPoly: true,
      });

      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(true);
    });

    it('returns true when nearest point is within tolerance', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 5.5, y: 0, z: 5.5 },
        isOverPoly: false,
      });

      // Distance: sqrt(0.5^2 + 0.5^2) = 0.707, within 2m tolerance
      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(true);
    });

    it('returns false when nearest point is beyond tolerance', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 8, y: 0, z: 5 },
        isOverPoly: false,
      });

      // XZ distance = 3m, exceeds default ON_NAVMESH_DISTANCE_SQ (4.0 = 2m^2)
      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(false);
    });

    it('returns false when no poly found', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 0,
        nearestPoint: { x: 0, y: 0, z: 0 },
        isOverPoly: false,
      });

      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(false);
    });

    it('returns false when query fails', () => {
      mockFindNearestPoly.mockReturnValue({ success: false, nearestRef: 0, nearestPoint: { x: 0, y: 0, z: 0 } });
      expect(system.isPointOnNavmesh(new THREE.Vector3(0, 0, 0))).toBe(false);
    });

    it('returns false when navmesh not ready', () => {
      const unready = new NavmeshSystem();
      expect(unready.isPointOnNavmesh(new THREE.Vector3(0, 0, 0))).toBe(false);
    });
  });

  // ── validateConnectivity ────────────────────────────────────────

  describe('validateConnectivity', () => {
    it('reports fully connected when all pairs have paths', () => {
      mockComputePath.mockReturnValue({
        success: true,
        path: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }],
      });

      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10),
        new THREE.Vector3(20, 0, 20),
      ];

      const result = system.validateConnectivity(points);
      expect(result.connected).toBe(true);
      expect(result.islands).toHaveLength(1);
      expect(result.islands[0]).toEqual([0, 1, 2]);
    });

    it('detects disconnected islands', () => {
      // Points 0 and 1 connect to each other, point 2 is isolated
      mockComputePath.mockImplementation((start: { x: number }, end: { x: number }) => {
        const sx = start.x;
        const ex = end.x;
        // 0↔1 connected, 2 disconnected from both
        if ((sx === 0 && ex === 10) || (sx === 10 && ex === 0)) {
          return { success: true, path: [{ x: sx, y: 0, z: 0 }, { x: ex, y: 0, z: 0 }] };
        }
        return { success: false, path: [] };
      });

      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(100, 0, 0),
      ];

      const result = system.validateConnectivity(points);
      expect(result.connected).toBe(false);
      expect(result.islands).toHaveLength(2);
      // One island has [0,1], the other has [2]
      const sizes = result.islands.map(i => i.length).sort();
      expect(sizes).toEqual([1, 2]);
    });

    it('handles single point (trivially connected)', () => {
      const result = system.validateConnectivity([new THREE.Vector3(0, 0, 0)]);
      expect(result.connected).toBe(true);
      expect(result.islands).toEqual([[0]]);
    });

    it('handles empty array', () => {
      const result = system.validateConnectivity([]);
      expect(result.connected).toBe(true);
    });

    it('returns connected when navmesh not ready', () => {
      const unready = new NavmeshSystem();
      const result = unready.validateConnectivity([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10),
      ]);
      expect(result.connected).toBe(true);
    });

    it('skips redundant checks via union-find', () => {
      // All connected: 3 points need at most 2 path queries (not 3)
      mockComputePath.mockReturnValue({
        success: true,
        path: [{ x: 0, y: 0, z: 0 }],
      });

      system.validateConnectivity([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(20, 0, 0),
      ]);

      // 0-1 succeeds, union(0,1). 0-2 succeeds, union(0,2). 1-2 skipped (same group).
      expect(mockComputePath).toHaveBeenCalledTimes(2);
    });
  });

  // ── Dispose ─────────────────────────────────────────────────────

  describe('dispose', () => {
    it('destroys NavMeshQuery on dispose', () => {
      system = createReadySystem();
      system.dispose();
      expect(mockQueryDestroy).toHaveBeenCalledTimes(1);
    });
  });
});
