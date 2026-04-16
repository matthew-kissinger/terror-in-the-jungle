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
  importNavMesh: vi.fn(),
  exportNavMesh: vi.fn(),
}));
vi.mock('@recast-navigation/three', () => ({
  threeToSoloNavMesh: vi.fn(),
  threeToTileCache: vi.fn(),
  getPositionsAndIndices: vi.fn(),
}));
vi.mock('./NavmeshCache');
vi.mock('../../utils/Logger');

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a NavmeshSystem with a fake navMesh + navMeshQuery injected,
 * bypassing WASM init and navmesh generation. The private-field injection
 * here is a test-only shortcut to avoid driving real Recast init; it lets
 * us drive the public query methods against mocked NavMeshQuery results.
 */
function createReadySystem(): NavmeshSystem {
  const system = new NavmeshSystem();
  const s = system as Record<string, unknown>;
  s.wasmReady = true;
  s.navMesh = { destroy: vi.fn() };
  s.NavMeshQueryClass = MockNavMeshQuery;
  s.navMeshQuery = new MockNavMeshQuery(s.navMesh, { maxNodes: 2048 });
  return system;
}

// ── Graceful degradation (no WASM / no navmesh) ─────────────────────

describe('NavmeshSystem graceful degradation', () => {
  let system: NavmeshSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = new NavmeshSystem();
  });

  it('reports not-ready before WASM loads', async () => {
    await system.init();
    expect(system.isWasmReady()).toBe(false);
    expect(system.isReady()).toBe(false);
  });

  it('skips navmesh generation when WASM is not ready', async () => {
    await system.generateNavmesh(400);
    expect(system.isReady()).toBe(false);
  });

  it('returns a null adapter when no navmesh has been generated', () => {
    expect(system.getAdapter()).toBeNull();
  });

  it('update and dispose are safe before the system is initialized', () => {
    expect(() => system.update(0.016)).not.toThrow();
    expect(() => system.dispose()).not.toThrow();
  });
});

// ── Path queries against a ready navmesh ────────────────────────────

describe('NavmeshSystem path queries', () => {
  let system: NavmeshSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = createReadySystem();
  });

  describe('queryPath', () => {
    it('returns a waypoint list for a successful path from A to B', () => {
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
      // Path begins at start and ends at end (within test-mock fidelity).
      expect(result![0].x).toBe(0);
      expect(result![result!.length - 1].x).toBe(10);
    });

    it('returns null when no path can be found', () => {
      mockComputePath.mockReturnValue({ success: false, path: [] });
      const result = system.queryPath(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(100, 0, 100),
      );
      expect(result).toBeNull();
    });

    it('returns null when the navmesh is not ready', () => {
      const unready = new NavmeshSystem();
      expect(unready.queryPath(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 10))).toBeNull();
    });
  });

  describe('findNearestPoint', () => {
    it('returns the nearest walkable point for an off-mesh query', () => {
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

    it('returns null when no walkable polygon is reachable', () => {
      mockFindClosestPoint.mockReturnValue({
        success: false,
        polyRef: 0,
        point: { x: 0, y: 0, z: 0 },
        isPointOverPoly: false,
      });
      expect(system.findNearestPoint(new THREE.Vector3(999, 0, 999))).toBeNull();
    });

    it('returns null when the navmesh is not ready', () => {
      const unready = new NavmeshSystem();
      expect(unready.findNearestPoint(new THREE.Vector3(0, 0, 0))).toBeNull();
    });
  });

  describe('isPointOnNavmesh', () => {
    it('reports true for a point that sits on a walkable polygon', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 5, y: 0, z: 5 },
        isOverPoly: true,
      });
      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(true);
    });

    it('reports true when the nearest walkable point is essentially under the query', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 5.1, y: 0, z: 5.1 },
        isOverPoly: false,
      });
      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(true);
    });

    it('reports false when there is no walkable polygon near the query', () => {
      mockFindNearestPoly.mockReturnValue({
        success: true,
        nearestRef: 1,
        nearestPoint: { x: 50, y: 0, z: 50 },
        isOverPoly: false,
      });
      expect(system.isPointOnNavmesh(new THREE.Vector3(5, 0, 5))).toBe(false);
    });

    it('reports false when the navmesh is not ready', () => {
      const unready = new NavmeshSystem();
      expect(unready.isPointOnNavmesh(new THREE.Vector3(0, 0, 0))).toBe(false);
    });
  });

  describe('validateConnectivity', () => {
    it('reports fully connected when every pair has a path', () => {
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

    it('groups points into islands when some pairs cannot path', () => {
      mockComputePath.mockImplementation((start: { x: number }, end: { x: number }) => {
        const sx = start.x;
        const ex = end.x;
        // 0↔1 connected, 2 isolated
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
      const sizes = result.islands.map(i => i.length).sort();
      expect(sizes).toEqual([1, 2]);
    });

    it('treats a single point as trivially connected', () => {
      const result = system.validateConnectivity([new THREE.Vector3(0, 0, 0)]);
      expect(result.connected).toBe(true);
      expect(result.islands).toEqual([[0]]);
    });

    it('reports connected (no-op) when the navmesh is not ready', () => {
      const unready = new NavmeshSystem();
      const result = unready.validateConnectivity([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10),
      ]);
      expect(result.connected).toBe(true);
    });
  });
});
