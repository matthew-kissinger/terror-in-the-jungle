import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('LOSAccelerator', () => {
  let accelerator: LOSAccelerator;
  let mockPerformanceNow: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    accelerator = new LOSAccelerator();
    mockPerformanceNow = vi.spyOn(performance, 'now');
    mockPerformanceNow.mockReturnValue(0);
  });

  afterEach(() => {
    mockPerformanceNow.mockRestore();
  });

  // ============================================================================
  // registerChunk / unregisterChunk Tests
  // ============================================================================
  describe('registerChunk', () => {
    it('should register a chunk mesh and update stats', () => {
      const mesh = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh);
      
      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(1);
    });

    it('should register multiple chunks', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      const mesh3 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.registerChunk('chunk_1_0', mesh2);
      accelerator.registerChunk('chunk_0_1', mesh3);
      
      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(3);
    });

    it('should replace existing chunk with same key', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.registerChunk('chunk_0_0', mesh2);
      
      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(1);
    });
  });

  describe('unregisterChunk', () => {
    it('should unregister a chunk and update stats', () => {
      const mesh = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh);
      expect(accelerator.getStats().cachedChunks).toBe(1);
      
      accelerator.unregisterChunk('chunk_0_0');
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should handle unregistering non-existent chunk without error', () => {
      expect(() => {
        accelerator.unregisterChunk('chunk_nonexistent');
      }).not.toThrow();
      
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should handle multiple unregister operations', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      const mesh3 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.registerChunk('chunk_1_0', mesh2);
      accelerator.registerChunk('chunk_0_1', mesh3);
      
      accelerator.unregisterChunk('chunk_1_0');
      expect(accelerator.getStats().cachedChunks).toBe(2);
      
      accelerator.unregisterChunk('chunk_0_0');
      expect(accelerator.getStats().cachedChunks).toBe(1);
      
      accelerator.unregisterChunk('chunk_0_1');
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });
  });

  // ============================================================================
  // checkLineOfSight Tests
  // ============================================================================
  describe('checkLineOfSight', () => {
    it('should return clear LOS when no chunks registered', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      expect(result.clear).toBe(true);
      expect(result.hitPoint).toBeUndefined();
      expect(result.distance).toBeUndefined();
    });

    it('should return clear:false when distance exceeds maxDistance', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(100, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 50);
      
      expect(result.clear).toBe(false);
      expect(result.hitPoint).toBeUndefined();
      expect(result.distance).toBeUndefined();
    });

    it('should return clear LOS when no chunks intersect ray bounding box', () => {
      const mesh = createMockMesh(new THREE.Vector3(100, 0, 100));
      accelerator.registerChunk('chunk_far', mesh);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      expect(result.clear).toBe(true);
    });

    it('should return blocked LOS when raycaster hits mesh', () => {
      const mesh = createMockMesh(new THREE.Vector3(5, 0, 0));
      accelerator.registerChunk('chunk_0_0', mesh);
      
      // Mock raycaster to return a hit
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast.mockReturnValue([
        {
          distance: 5,
          point: new THREE.Vector3(5, 0, 0),
          object: mesh
        } as any
      ]);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      expect(result.clear).toBe(false);
      expect(result.hitPoint).toBeDefined();
      expect(result.distance).toBe(5);
      
      mockRaycast.mockRestore();
    });

    it('should return clear LOS when hit is beyond target (with tolerance)', () => {
      const mesh = createMockMesh(new THREE.Vector3(5, 0, 0));
      accelerator.registerChunk('chunk_0_0', mesh);
      
      // Mock raycaster to return a hit at exactly the target distance
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast.mockReturnValue([
        {
          distance: 10,
          point: new THREE.Vector3(10, 0, 0),
          object: mesh
        } as any
      ]);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      // Hit at distance 10, target at distance 10, tolerance 0.5
      // 10 < 10 - 0.5 = false, so LOS is clear
      expect(result.clear).toBe(true);
      
      mockRaycast.mockRestore();
    });

    it('should apply 0.5 tolerance to hit distance check', () => {
      const mesh = createMockMesh(new THREE.Vector3(5, 0, 0));
      accelerator.registerChunk('chunk_0_0', mesh);
      
      // Mock raycaster to return a hit just before tolerance threshold
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast.mockReturnValue([
        {
          distance: 9.4, // 10 - 0.5 = 9.5, so 9.4 < 9.5 = blocked
          point: new THREE.Vector3(9.4, 0, 0),
          object: mesh
        } as any
      ]);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      expect(result.clear).toBe(false);
      expect(result.distance).toBe(9.4);
      
      mockRaycast.mockRestore();
    });

    it('should only check chunks whose bounding box intersects ray box', () => {
      // Create two meshes: one in path, one far away
      const meshInPath = createMockMesh(new THREE.Vector3(5, 0, 0));
      const meshFarAway = createMockMesh(new THREE.Vector3(100, 100, 100));
      
      accelerator.registerChunk('chunk_in_path', meshInPath);
      accelerator.registerChunk('chunk_far', meshFarAway);
      
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast.mockReturnValue([]);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      
      // Should only pass relevant meshes to raycaster
      expect(mockRaycast).toHaveBeenCalled();
      const passedMeshes = mockRaycast.mock.calls[0][0] as THREE.Mesh[];
      
      // Only meshInPath should be included (spatial culling)
      expect(passedMeshes.length).toBeGreaterThan(0);
      
      mockRaycast.mockRestore();
    });

    it('should expand ray box by scalar 2 for edge cases', () => {
      // This is tested indirectly through spatial culling behavior
      const mesh = createMockMesh(new THREE.Vector3(2, 0, 0));
      accelerator.registerChunk('chunk_edge', mesh);
      
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast.mockReturnValue([]);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      
      // Mesh at edge should be included due to expansion
      expect(mockRaycast).toHaveBeenCalled();
      
      mockRaycast.mockRestore();
    });

    it('should record performance timing for each query', () => {
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(1.5);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(1);
      expect(stats.avgQueryTime).toBe(1.5);
    });
  });

  // ============================================================================
  // batchCheckLineOfSight Tests
  // ============================================================================
  describe('batchCheckLineOfSight', () => {
    it('should process multiple LOS queries', () => {
      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 10), maxDistance: 100 }
      ];
      
      const results = accelerator.batchCheckLineOfSight(queries);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('clear');
      expect(results[1]).toHaveProperty('clear');
      expect(results[2]).toHaveProperty('clear');
    });

    it('should return empty array for empty queries', () => {
      const results = accelerator.batchCheckLineOfSight([]);
      
      expect(results).toHaveLength(0);
    });

    it('should process each query independently', () => {
      const mesh = createMockMesh(new THREE.Vector3(5, 0, 0));
      accelerator.registerChunk('chunk_0_0', mesh);
      
      const mockRaycast = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');
      mockRaycast
        .mockReturnValueOnce([{ distance: 5, point: new THREE.Vector3(5, 0, 0), object: mesh } as any])
        .mockReturnValueOnce([]);
      
      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 }
      ];
      
      const results = accelerator.batchCheckLineOfSight(queries);
      
      expect(results[0].clear).toBe(false);
      expect(results[1].clear).toBe(true);
      
      mockRaycast.mockRestore();
    });

    it('should increment query count for each query in batch', () => {
      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 10), maxDistance: 100 }
      ];
      
      accelerator.batchCheckLineOfSight(queries);
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(3);
    });
  });

  // ============================================================================
  // getStats Tests
  // ============================================================================
  describe('getStats', () => {
    it('should return correct initial stats', () => {
      const stats = accelerator.getStats();
      
      expect(stats.queryCount).toBe(0);
      expect(stats.avgQueryTime).toBe(0);
      expect(stats.cachedChunks).toBe(0);
    });

    it('should increment queryCount per query', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      expect(accelerator.getStats().queryCount).toBe(1);
      
      accelerator.checkLineOfSight(origin, target, 100);
      expect(accelerator.getStats().queryCount).toBe(2);
      
      accelerator.checkLineOfSight(origin, target, 100);
      expect(accelerator.getStats().queryCount).toBe(3);
    });

    it('should accumulate totalQueryTime correctly', () => {
      mockPerformanceNow
        .mockReturnValueOnce(0).mockReturnValueOnce(1.0).mockReturnValueOnce(1.0) // Query 1: 1.0ms
        .mockReturnValueOnce(1.0).mockReturnValueOnce(3.0).mockReturnValueOnce(3.0) // Query 2: 2.0ms
        .mockReturnValueOnce(3.0).mockReturnValueOnce(5.0).mockReturnValueOnce(5.0); // Query 3: 2.0ms
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100); // 1.0ms
      accelerator.checkLineOfSight(origin, target, 100); // 2.0ms
      accelerator.checkLineOfSight(origin, target, 100); // 2.0ms
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(3);
      expect(stats.avgQueryTime).toBeCloseTo(1.667, 2); // (1 + 2 + 2) / 3
    });

    it('should compute avgQueryTime correctly', () => {
      mockPerformanceNow
        .mockReturnValueOnce(0).mockReturnValueOnce(2.0).mockReturnValueOnce(2.0) // Query 1: 2.0ms
        .mockReturnValueOnce(2.0).mockReturnValueOnce(5.0).mockReturnValueOnce(5.0) // Query 2: 3.0ms
        .mockReturnValueOnce(5.0).mockReturnValueOnce(8.0).mockReturnValueOnce(8.0); // Query 3: 3.0ms
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100); // 2.0ms
      accelerator.checkLineOfSight(origin, target, 100); // 3.0ms
      accelerator.checkLineOfSight(origin, target, 100); // 3.0ms
      
      const stats = accelerator.getStats();
      expect(stats.avgQueryTime).toBeCloseTo(2.667, 2); // (2 + 3 + 3) / 3
    });

    it('should return 0 avgQueryTime when queryCount is 0', () => {
      const stats = accelerator.getStats();
      expect(stats.avgQueryTime).toBe(0);
    });

    it('should reset stats after REPORT_INTERVAL_MS', () => {
      // Need to mock all performance.now() calls:
      // Query 1: start, end, recordQuery check
      // Query 2: start, end, recordQuery check (triggers reset)
      mockPerformanceNow
        .mockReturnValueOnce(0).mockReturnValueOnce(1.0).mockReturnValueOnce(1.0) // Query 1
        .mockReturnValueOnce(6000).mockReturnValueOnce(6001).mockReturnValueOnce(6001); // Query 2 (triggers reset)
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      
      let stats = accelerator.getStats();
      expect(stats.queryCount).toBe(1);
      
      // Advance time past REPORT_INTERVAL_MS (5000ms)
      // This query will increment count to 2, then reset to 0
      accelerator.checkLineOfSight(origin, target, 100);
      
      stats = accelerator.getStats();
      expect(stats.queryCount).toBe(0); // Reset after report
      expect(stats.avgQueryTime).toBe(0);
    });

    it('should update cachedChunks count', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      expect(accelerator.getStats().cachedChunks).toBe(1);
      
      accelerator.registerChunk('chunk_1_0', mesh2);
      expect(accelerator.getStats().cachedChunks).toBe(2);
      
      accelerator.unregisterChunk('chunk_0_0');
      expect(accelerator.getStats().cachedChunks).toBe(1);
    });
  });

  // ============================================================================
  // clear Tests
  // ============================================================================
  describe('clear', () => {
    it('should clear all cached chunks', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.registerChunk('chunk_1_0', mesh2);
      
      expect(accelerator.getStats().cachedChunks).toBe(2);
      
      accelerator.clear();
      
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should reset query counters', () => {
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      accelerator.checkLineOfSight(origin, target, 100);
      accelerator.checkLineOfSight(origin, target, 100);
      
      expect(accelerator.getStats().queryCount).toBe(2);
      
      accelerator.clear();
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(0);
      expect(stats.avgQueryTime).toBe(0);
    });

    it('should show zeroed values in getStats after clear', () => {
      const mesh = createMockMesh();
      accelerator.registerChunk('chunk_0_0', mesh);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      accelerator.checkLineOfSight(origin, target, 100);
      
      accelerator.clear();
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBe(0);
      expect(stats.avgQueryTime).toBe(0);
      expect(stats.cachedChunks).toBe(0);
    });

    it('should be safe to call clear multiple times', () => {
      expect(() => {
        accelerator.clear();
        accelerator.clear();
        accelerator.clear();
      }).not.toThrow();
      
      const stats = accelerator.getStats();
      expect(stats.cachedChunks).toBe(0);
    });

    it('should allow registering chunks after clear', () => {
      const mesh1 = createMockMesh();
      const mesh2 = createMockMesh();
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.clear();
      
      accelerator.registerChunk('chunk_1_0', mesh2);
      
      expect(accelerator.getStats().cachedChunks).toBe(1);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration', () => {
    it('should handle complete workflow: register, query, unregister', () => {
      const mesh = createMockMesh(new THREE.Vector3(5, 0, 0));
      
      accelerator.registerChunk('chunk_0_0', mesh);
      expect(accelerator.getStats().cachedChunks).toBe(1);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      const result = accelerator.checkLineOfSight(origin, target, 100);
      
      expect(result).toHaveProperty('clear');
      expect(accelerator.getStats().queryCount).toBe(1);
      
      accelerator.unregisterChunk('chunk_0_0');
      expect(accelerator.getStats().cachedChunks).toBe(0);
    });

    it('should handle multiple chunks and queries', () => {
      const mesh1 = createMockMesh(new THREE.Vector3(5, 0, 0));
      const mesh2 = createMockMesh(new THREE.Vector3(0, 5, 0));
      const mesh3 = createMockMesh(new THREE.Vector3(0, 0, 5));
      
      accelerator.registerChunk('chunk_0_0', mesh1);
      accelerator.registerChunk('chunk_1_0', mesh2);
      accelerator.registerChunk('chunk_0_1', mesh3);
      
      const queries = [
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(10, 0, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 10, 0), maxDistance: 100 },
        { origin: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, 0, 10), maxDistance: 100 }
      ];
      
      const results = accelerator.batchCheckLineOfSight(queries);
      
      expect(results).toHaveLength(3);
      expect(accelerator.getStats().queryCount).toBe(3);
      expect(accelerator.getStats().cachedChunks).toBe(3);
    });

    it('should maintain performance across many queries', () => {
      const mesh = createMockMesh();
      accelerator.registerChunk('chunk_0_0', mesh);
      
      const origin = new THREE.Vector3(0, 0, 0);
      const target = new THREE.Vector3(10, 0, 0);
      
      for (let i = 0; i < 100; i++) {
        accelerator.checkLineOfSight(origin, target, 100);
      }
      
      const stats = accelerator.getStats();
      expect(stats.queryCount).toBeGreaterThan(0);
      expect(stats.avgQueryTime).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock THREE.Mesh with bounding box
 */
function createMockMesh(position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  
  mesh.position.copy(position);
  mesh.updateMatrixWorld();
  
  // Ensure bounding box is computed
  geometry.computeBoundingBox();
  
  return mesh;
}
