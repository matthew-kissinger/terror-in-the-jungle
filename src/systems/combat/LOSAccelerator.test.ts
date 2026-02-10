import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { LOSAccelerator } from './LOSAccelerator';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

/**
 * Helper: Create a mesh with a predictable bounding box
 */
function createMockMesh(position: THREE.Vector3, size: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);

  // Compute bounding box so Box3.setFromObject works
  geometry.computeBoundingBox();

  return mesh;
}

/**
 * Helper: Create a mesh that will return controlled raycast results
 */
function createMockMeshWithRaycastControl(
  position: THREE.Vector3,
  size: number,
  raycastResult: { distance: number; point: THREE.Vector3 } | null
): THREE.Mesh {
  const mesh = createMockMesh(position, size);

  // Override raycast to return controlled results
  mesh.raycast = (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void => {
    if (raycastResult) {
      intersects.push({
        distance: raycastResult.distance,
        point: raycastResult.point.clone(),
        object: mesh,
        face: null,
        faceIndex: 0,
        uv: undefined,
        uv1: undefined,
        normal: new THREE.Vector3(0, 1, 0),
        instanceId: undefined
      });
    }
  };

  return mesh;
}

describe('LOSAccelerator', () => {
  let accelerator: LOSAccelerator;

  beforeEach(() => {
    accelerator = new LOSAccelerator();
    vi.clearAllMocks();
  });

  describe('registerChunk', () => {
    it('should register a mesh with a chunk key', () => {
      const mesh = createMockMesh(new THREE.Vector3(0, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh);

      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(1);
    });

    it('should register multiple chunks', () => {
      const mesh1 = createMockMesh(new THREE.Vector3(0, 0, 0), 10);
      const mesh2 = createMockMesh(new THREE.Vector3(10, 0, 0), 10);
      const mesh3 = createMockMesh(new THREE.Vector3(20, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh1);
      accelerator.registerChunk('chunk-1-0', mesh2);
      accelerator.registerChunk('chunk-2-0', mesh3);

      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(3);
    });

    it('should overwrite existing chunk with same key', () => {
      const mesh1 = createMockMesh(new THREE.Vector3(0, 0, 0), 10);
      const mesh2 = createMockMesh(new THREE.Vector3(5, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh1);
      accelerator.registerChunk('chunk-0-0', mesh2);

      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(1);
    });
  });

  describe('unregisterChunk', () => {
    it('should unregister a chunk', () => {
      const mesh = createMockMesh(new THREE.Vector3(0, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh);
      expect(accelerator.getStats().cachedChunks).toBe(1);

      accelerator.unregisterChunk('chunk-0-0');
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should not throw when unregistering non-existent chunk', () => {
      expect(() => {
        accelerator.unregisterChunk('non-existent');
      }).not.toThrow();
    });

    it('should only unregister specified chunk', () => {
      const mesh1 = createMockMesh(new THREE.Vector3(0, 0, 0), 10);
      const mesh2 = createMockMesh(new THREE.Vector3(10, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh1);
      accelerator.registerChunk('chunk-1-0', mesh2);

      accelerator.unregisterChunk('chunk-0-0');

      expect(accelerator.getStats().cachedChunks).toBe(1);
    });
  });

  describe('checkLineOfSight - basic behavior', () => {
    it('should return clear:true when no chunks are registered', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(true);
    });

    it('should return clear:false when target is beyond maxDistance', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(100, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 50);

      expect(result.clear).toBe(false);
      expect(result.hitPoint).toBeUndefined();
      expect(result.distance).toBeUndefined();
    });

    it('should return clear:true when ray does not intersect any chunk', () => {
      // Register chunk far from ray path
      const mesh = createMockMesh(new THREE.Vector3(0, 100, 0), 10);
      accelerator.registerChunk('chunk-0-10', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(true);
    });
  });

  describe('checkLineOfSight - hit detection', () => {
    it('should return clear:false when terrain blocks LOS', () => {
      // Create mesh that will return a hit at distance 5
      const hitPoint = new THREE.Vector3(5, 0, 0);
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 0, 0),
        10,
        { distance: 5, point: hitPoint }
      );

      accelerator.registerChunk('chunk-0-0', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(false);
      expect(result.hitPoint).toBeDefined();
      expect(result.distance).toBe(5);
    });

    it('should only consider hits closer than target', () => {
      // Create mesh that will return a hit at distance 15 (beyond target at distance 10)
      const hitPoint = new THREE.Vector3(15, 0, 0);
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(15, 0, 0),
        10,
        { distance: 15, point: hitPoint }
      );

      accelerator.registerChunk('chunk-1-0', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      // Hit is beyond target, so LOS is clear
      expect(result.clear).toBe(true);
    });

    it('should include tolerance when checking hit distance (distance - 0.5)', () => {
      // Hit at distance 9.8, target at distance 10, should block (9.8 < 10 - 0.5 = 9.5 is false)
      const hitPoint = new THREE.Vector3(9.8, 0, 0);
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(9.8, 0, 0),
        10,
        { distance: 9.8, point: hitPoint }
      );

      accelerator.registerChunk('chunk-0-0', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      // 9.8 is not less than 9.5 (10 - 0.5), so it's on the edge - should NOT block
      expect(result.clear).toBe(true);
    });

    it('should block when hit is well before target', () => {
      // Hit at distance 4, target at distance 10
      const hitPoint = new THREE.Vector3(4, 0, 0);
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(4, 0, 0),
        10,
        { distance: 4, point: hitPoint }
      );

      accelerator.registerChunk('chunk-0-0', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(false);
      expect(result.distance).toBe(4);
    });

    it('should return hitPoint when LOS is blocked', () => {
      const expectedHitPoint = new THREE.Vector3(5, 2, 3);
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 2, 3),
        10,
        { distance: 5, point: expectedHitPoint }
      );

      accelerator.registerChunk('chunk-0-0', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(false);
      expect(result.hitPoint).toBeDefined();
      expect(result.hitPoint!.x).toBe(5);
      expect(result.hitPoint!.y).toBe(2);
      expect(result.hitPoint!.z).toBe(3);
    });
  });

  describe('checkLineOfSight - spatial culling', () => {
    it('should only raycast against chunks near the ray path', () => {
      // Chunk on the ray path
      const nearMesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 0, 0),
        2,
        null // No hit
      );

      // Chunk far from the ray path
      const farMesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 100, 0),
        2,
        null
      );

      const nearRaycastSpy = vi.spyOn(nearMesh, 'raycast');
      const farRaycastSpy = vi.spyOn(farMesh, 'raycast');

      accelerator.registerChunk('chunk-near', nearMesh);
      accelerator.registerChunk('chunk-far', farMesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);

      // Near mesh should be raycasted, far mesh should be culled
      expect(nearRaycastSpy).toHaveBeenCalled();
      expect(farRaycastSpy).not.toHaveBeenCalled();
    });

    it('should include chunks whose bounding box intersects the ray box', () => {
      // Create multiple meshes at different positions
      const mesh1 = createMockMesh(new THREE.Vector3(5, 0, 0), 2);
      const mesh2 = createMockMesh(new THREE.Vector3(5, 0, 2), 2); // Closer to ray path
      const mesh3 = createMockMesh(new THREE.Vector3(5, 50, 0), 2);

      const spy1 = vi.spyOn(mesh1, 'raycast');
      const spy2 = vi.spyOn(mesh2, 'raycast');
      const spy3 = vi.spyOn(mesh3, 'raycast');

      accelerator.registerChunk('chunk-1', mesh1);
      accelerator.registerChunk('chunk-2', mesh2);
      accelerator.registerChunk('chunk-3', mesh3);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);

      // Mesh1 on path, mesh2 near path (within 2 unit buffer + mesh size), mesh3 far away
      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
      expect(spy3).not.toHaveBeenCalled();
    });

    it('should expand ray bounding box by 2 units for buffer', () => {
      // Mesh exactly 2.5 units away from ray path (should be included with 2-unit buffer)
      const mesh = createMockMesh(new THREE.Vector3(5, 2.5, 0), 1);
      const spy = vi.spyOn(mesh, 'raycast');

      accelerator.registerChunk('chunk-edge', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);

      // With 2-unit buffer, mesh at 2.5 units should be included
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('batchCheckLineOfSight', () => {
    it('should process multiple queries', () => {
      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 10), maxDistance: 100 }
      ];

      const results = accelerator.batchCheckLineOfSight(queries);

      expect(results).toHaveLength(3);
      expect(results[0].clear).toBe(true);
      expect(results[1].clear).toBe(true);
      expect(results[2].clear).toBe(true);
    });

    it('should return independent results for each query', () => {
      // Register mesh that blocks one ray but not others
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 0, 0),
        2,
        { distance: 5, point: new THREE.Vector3(5, 0, 0) }
      );

      accelerator.registerChunk('chunk-0-0', mesh);

      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 }, // Blocked
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 }, // Clear
      ];

      const results = accelerator.batchCheckLineOfSight(queries);

      expect(results[0].clear).toBe(false);
      expect(results[1].clear).toBe(true);
    });

    it('should handle empty query array', () => {
      const results = accelerator.batchCheckLineOfSight([]);

      expect(results).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return queryCount', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);
      accelerator.checkLineOfSight(origin, target, 100);

      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(2);
    });

    it('should return avgQueryTime', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);

      const stats = accelerator.getStats();
      expect(stats.avgQueryTime).toBeGreaterThan(0);
    });

    it('should return avgQueryTime as 0 when no queries', () => {
      const stats = accelerator.getStats();
      expect(stats.avgQueryTime).toBe(0);
    });

    it('should return cachedChunks count', () => {
      const mesh1 = createMockMesh(new THREE.Vector3(0, 0, 0), 10);
      const mesh2 = createMockMesh(new THREE.Vector3(10, 0, 0), 10);

      accelerator.registerChunk('chunk-0-0', mesh1);
      accelerator.registerChunk('chunk-1-0', mesh2);

      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(2);
    });
  });

  describe('performance tracking', () => {
    it('should increment queryCount on each checkLineOfSight call', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      expect(accelerator.getStats().queryCount).toBe(0);

      accelerator.checkLineOfSight(origin, target, 100);
      expect(accelerator.getStats().queryCount).toBe(1);

      accelerator.checkLineOfSight(origin, target, 100);
      expect(accelerator.getStats().queryCount).toBe(2);
    });

    it('should track total query time', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      accelerator.checkLineOfSight(origin, target, 100);
      accelerator.checkLineOfSight(origin, target, 100);

      const stats = accelerator.getStats();
      expect(stats.avgQueryTime).toBeGreaterThan(0);
      expect(stats.avgQueryTime).toBeLessThan(10); // Sanity check: should be < 10ms
    });

    it('should reset stats after REPORT_INTERVAL_MS', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      // Create a new accelerator and perform queries
      const testAccelerator = new LOSAccelerator();

      // First query
      testAccelerator.checkLineOfSight(origin, target, 100);
      expect(testAccelerator.getStats().queryCount).toBe(1);

      // Second query (still within 5000ms window)
      testAccelerator.checkLineOfSight(origin, target, 100);
      expect(testAccelerator.getStats().queryCount).toBe(2);

      // Mock performance.now to simulate time passage
      const originalNow = performance.now;
      const baseTime = performance.now();
      vi.spyOn(performance, 'now').mockReturnValue(baseTime + 6000);

      // Next query should trigger reset
      testAccelerator.checkLineOfSight(origin, target, 100);

      // Query count should be 0 (reset after report and increment happens in recordQuery)
      expect(testAccelerator.getStats().queryCount).toBe(0);

      // Restore
      performance.now = originalNow;
    });
  });

  describe('clear', () => {
    it('should empty the chunk cache', () => {
      const mesh = createMockMesh(new THREE.Vector3(0, 0, 0), 10);
      accelerator.registerChunk('chunk-0-0', mesh);

      expect(accelerator.getStats().cachedChunks).toBe(1);

      accelerator.clear();

      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should reset performance counters', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      // Perform two queries
      accelerator.checkLineOfSight(origin, target, 100);
      accelerator.checkLineOfSight(origin, target, 100);

      expect(accelerator.getStats().queryCount).toBe(2);

      accelerator.clear();

      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(0);
      expect(stats.avgQueryTime).toBe(0);
    });

    it('should handle clear when already empty', () => {
      expect(() => {
        accelerator.clear();
      }).not.toThrow();

      expect(accelerator.getStats().cachedChunks).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle origin and target at same position', () => {
      const position = new THREE.Vector3(5, 5, 5);

      const result = accelerator.checkLineOfSight(position, position, 100);

      // Distance is 0, which is less than maxDistance
      expect(result.clear).toBe(true);
    });

    it('should handle very short distance checks', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(0.1, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(true);
    });

    it('should handle diagonal rays correctly', () => {
      const mesh = createMockMeshWithRaycastControl(
        new THREE.Vector3(5, 5, 5),
        2,
        { distance: 8.66, point: new THREE.Vector3(5, 5, 5) }
      );

      accelerator.registerChunk('chunk-diagonal', mesh);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 10, 10);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      expect(result.clear).toBe(false);
    });

    it('should handle multiple hits and return closest', () => {
      // Create two meshes, both return hits
      const mesh1 = createMockMeshWithRaycastControl(
        new THREE.Vector3(3, 0, 0),
        2,
        { distance: 3, point: new THREE.Vector3(3, 0, 0) }
      );

      const mesh2 = createMockMeshWithRaycastControl(
        new THREE.Vector3(7, 0, 0),
        2,
        { distance: 7, point: new THREE.Vector3(7, 0, 0) }
      );

      accelerator.registerChunk('chunk-near', mesh1);
      accelerator.registerChunk('chunk-far', mesh2);

      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 100);

      // Should return closest hit
      expect(result.clear).toBe(false);
      expect(result.distance).toBe(3);
    });

    it('should handle maxDistance of 0', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, 0);

      expect(result.clear).toBe(false);
    });

    it('should handle negative maxDistance', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);

      const result = accelerator.checkLineOfSight(origin, target, -100);

      expect(result.clear).toBe(false);
    });
  });
});
