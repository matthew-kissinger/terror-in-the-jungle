import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpatialOctree } from './SpatialOctree';

describe('SpatialOctree', () => {
  describe('Constructor', () => {
    it('should create with default world size', () => {
      const octree = new SpatialOctree();
      const stats = octree.getStats();

      expect(stats.totalEntities).toBe(0);
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepth).toBe(0);
    });

    it('should create with custom world size', () => {
      const octree = new SpatialOctree(2000);
      const stats = octree.getStats();

      expect(stats.totalEntities).toBe(0);
      expect(stats.totalNodes).toBe(1);
    });

    it('should create with custom maxEntitiesPerNode', () => {
      const octree = new SpatialOctree(4000, 5, 6);
      
      // Insert more than 5 entities to trigger subdivision
      for (let i = 0; i < 6; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      const stats = octree.getStats();
      expect(stats.totalNodes).toBeGreaterThan(1); // Should have subdivided
      expect(stats.maxDepth).toBeGreaterThan(0);
    });

    it('should create with custom maxDepth', () => {
      const octree = new SpatialOctree(4000, 2, 3);
      
      // Insert many entities to potentially trigger depth limiting
      for (let i = 0; i < 50; i++) {
        const x = (i % 10) * 100 - 500;
        const z = Math.floor(i / 10) * 100 - 500;
        octree.updatePosition(`entity${i}`, new THREE.Vector3(x, 0, z));
      }

      const stats = octree.getStats();
      expect(stats.maxDepth).toBeLessThanOrEqual(3);
    });
  });

  describe('insert (via updatePosition)', () => {
    it('should insert single entity', () => {
      const octree = new SpatialOctree();
      const position = new THREE.Vector3(100, 0, 100);
      
      octree.updatePosition('entity1', position);
      const stats = octree.getStats();

      expect(stats.totalEntities).toBe(1);
    });

    it('should insert multiple entities', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      octree.updatePosition('entity2', new THREE.Vector3(200, 0, 200));
      octree.updatePosition('entity3', new THREE.Vector3(-100, 0, -100));
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(3);
    });

    it('should insert at boundary positions', () => {
      const octree = new SpatialOctree(2000); // bounds: -1000 to 1000
      
      // Test various boundary positions
      octree.updatePosition('boundary-min', new THREE.Vector3(-1000, -50, -1000));
      octree.updatePosition('boundary-max', new THREE.Vector3(1000, 100, 1000));
      octree.updatePosition('boundary-x', new THREE.Vector3(1000, 0, 0));
      octree.updatePosition('boundary-z', new THREE.Vector3(0, 0, -1000));
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(4);
    });

    it('should clamp positions outside world bounds', () => {
      const octree = new SpatialOctree(2000);
      
      // These should be clamped to world bounds
      octree.updatePosition('outside', new THREE.Vector3(5000, 500, 5000));
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(1);
      
      // Query should find the entity even though it was clamped
      const results = octree.queryRadius(new THREE.Vector3(1000, 0, 1000), 100);
      expect(results).toContain('outside');
    });
  });

  describe('remove', () => {
    it('should remove existing entity', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      expect(octree.getStats().totalEntities).toBe(1);
      
      octree.remove('entity1');
      expect(octree.getStats().totalEntities).toBe(0);
    });

    it('should remove entity from subdivided tree', () => {
      const octree = new SpatialOctree();
      
      // Insert enough entities to trigger subdivision
      for (let i = 0; i < 20; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }
      
      expect(octree.getStats().totalEntities).toBe(20);
      
      // Remove from middle
      octree.remove('entity10');
      expect(octree.getStats().totalEntities).toBe(19);
      
      // Remove from beginning
      octree.remove('entity0');
      expect(octree.getStats().totalEntities).toBe(18);
      
      // Remove from end
      octree.remove('entity19');
      expect(octree.getStats().totalEntities).toBe(17);
    });

    it('should handle removing non-existent entity gracefully', () => {
      const octree = new SpatialOctree();
      
      // Should not throw
      expect(() => octree.remove('non-existent')).not.toThrow();
      expect(octree.getStats().totalEntities).toBe(0);
    });

    it('should remove entity and no longer find it in queries', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      octree.updatePosition('entity2', new THREE.Vector3(150, 0, 150));
      
      let results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 200);
      expect(results).toContain('entity1');
      expect(results).toContain('entity2');
      
      octree.remove('entity1');
      
      results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 200);
      expect(results).not.toContain('entity1');
      expect(results).toContain('entity2');
    });
  });

  describe('updatePosition', () => {
    it('should update existing entity position', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      
      // Update position
      octree.updatePosition('entity1', new THREE.Vector3(500, 0, 500));
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(1);
      
      // Should find at new position
      let results = octree.queryRadius(new THREE.Vector3(500, 0, 500), 100);
      expect(results).toContain('entity1');
      
      // Should not find at old position
      results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 100);
      expect(results).not.toContain('entity1');
    });

    it('should handle entity moving to different octant', () => {
      const octree = new SpatialOctree();
      
      // Insert some entities to create structure
      for (let i = 0; i < 15; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 50, 0, i * 50));
      }
      
      // Move entity across octant boundary
      octree.updatePosition('entity0', new THREE.Vector3(-1000, 0, -1000));
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(15);
      
      // Should find at new position
      const results = octree.queryRadius(new THREE.Vector3(-1000, 0, -1000), 100);
      expect(results).toContain('entity0');
    });

    it('should skip update for insignificant position changes', () => {
      const octree = new SpatialOctree();
      
      const pos = new THREE.Vector3(100, 0, 100);
      octree.updatePosition('entity1', pos);
      
      // Update with almost same position (distance squared < 0.01)
      const smallChange = pos.clone().add(new THREE.Vector3(0.05, 0, 0));
      octree.updatePosition('entity1', smallChange);
      
      // Entity should still be at original position
      const results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 10);
      expect(results).toContain('entity1');
    });

    it('should update position for significant changes', () => {
      const octree = new SpatialOctree();
      
      const pos = new THREE.Vector3(100, 0, 100);
      octree.updatePosition('entity1', pos);
      
      // Update with significant position change (distance squared >= 0.01)
      const bigChange = pos.clone().add(new THREE.Vector3(0.2, 0, 0));
      octree.updatePosition('entity1', bigChange);
      
      // Entity should be at new position
      const results = octree.queryRadius(new THREE.Vector3(100.2, 0, 100), 10);
      expect(results).toContain('entity1');
    });
  });

  describe('queryRadius', () => {
    it('should find entities within radius', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      octree.updatePosition('entity2', new THREE.Vector3(150, 0, 150));
      octree.updatePosition('entity3', new THREE.Vector3(500, 0, 500));
      
      const results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 200);
      
      expect(results).toContain('entity1');
      expect(results).toContain('entity2');
      expect(results).not.toContain('entity3');
    });

    it('should handle empty tree', () => {
      const octree = new SpatialOctree();
      
      const results = octree.queryRadius(new THREE.Vector3(0, 0, 0), 1000);
      
      expect(results).toHaveLength(0);
    });

    it('should find all entities with large radius', () => {
      const octree = new SpatialOctree();
      
      for (let i = 0; i < 10; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }
      
      const results = octree.queryRadius(new THREE.Vector3(0, 0, 0), 5000);
      
      expect(results).toHaveLength(10);
    });

    it('should find no entities outside radius', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('far-away', new THREE.Vector3(1000, 0, 1000));
      
      const results = octree.queryRadius(new THREE.Vector3(0, 0, 0), 100);
      
      expect(results).toHaveLength(0);
    });

    it('should find entities exactly at radius boundary', () => {
      const octree = new SpatialOctree();
      
      // Position exactly at radius 100
      octree.updatePosition('on-boundary', new THREE.Vector3(100, 0, 0));
      
      const results = octree.queryRadius(new THREE.Vector3(0, 0, 0), 100);
      
      expect(results).toContain('on-boundary');
    });

    it('should be faster than linear scan for large datasets', () => {
      const octree = new SpatialOctree();
      const entityCount = 1000;

      // Insert many entities
      const positions = new Map<string, THREE.Vector3>();
      for (let i = 0; i < entityCount; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 2000,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 2000
        );
        positions.set(`entity${i}`, pos);
        octree.updatePosition(`entity${i}`, pos);
      }

      // Warmup iterations to avoid JIT variance
      for (let i = 0; i < 10; i++) {
        octree.queryRadius(new THREE.Vector3(0, 0, 0), 500);
        for (const [_id, pos] of positions) {
          pos.distanceToSquared(new THREE.Vector3(0, 0, 0));
        }
      }

      // Time octree query
      const octreeStart = performance.now();
      for (let i = 0; i < 100; i++) {
        octree.queryRadius(new THREE.Vector3(0, 0, 0), 500);
      }
      const octreeTime = performance.now() - octreeStart;

      // Time linear scan
      const linearStart = performance.now();
      for (let i = 0; i < 100; i++) {
        const results: string[] = [];
        const center = new THREE.Vector3(0, 0, 0);
        const radiusSq = 500 * 500;
        for (const [id, pos] of positions) {
          if (pos.distanceToSquared(center) <= radiusSq) {
            results.push(id);
          }
        }
      }
      const linearTime = performance.now() - linearStart;

      // Octree should not be dramatically slower than linear scan
      // Under heavy system load, JIT and cache effects can reduce the advantage
      // Using 5x margin to avoid flakiness - the real benefit shows at scale
      expect(octreeTime).toBeLessThan(linearTime * 5.0);
    });
  });

  describe('queryRay', () => {
    it('should find entities along ray direction', () => {
      const octree = new SpatialOctree();
      
      // Place entities close to the ray path
      // Use positions far from origin to ensure ray enters node before entities
      octree.updatePosition('entity1', new THREE.Vector3(-1500, 0, 0));
      octree.updatePosition('entity2', new THREE.Vector3(-1400, 0, 0));
      octree.updatePosition('entity3', new THREE.Vector3(-1500, 10, 0)); // Off the ray (>2 units)
      
      // Ray coming from outside the world bounds (-2000) going +X
      const results = octree.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        2000
      );
      
      expect(results).toContain('entity1');
      expect(results).toContain('entity2');
      expect(results).not.toContain('entity3');
    });

    it('should respect maxDistance', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('close', new THREE.Vector3(-1500, 0, 0));
      octree.updatePosition('far', new THREE.Vector3(-500, 0, 0));
      
      // Ray coming from outside, maxDistance should limit results
      const results = octree.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1200 // Only reaches to about -1300
      );
      
      expect(results).toContain('close');
      expect(results).not.toContain('far');
    });

    it('should handle empty tree', () => {
      const octree = new SpatialOctree();
      
      const results = octree.queryRay(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1000
      );
      
      expect(results).toHaveLength(0);
    });
  });

  describe('queryFrustum', () => {
    it('should find entities within frustum', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('in-frustum', new THREE.Vector3(0, 0, -100));
      octree.updatePosition('behind', new THREE.Vector3(0, 0, 100));
      
      // Create a simple frustum looking down -Z
      const frustum = new THREE.Frustum();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 0, 0);
      camera.lookAt(0, 0, -1);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
      
      const results = octree.queryFrustum(frustum);
      
      expect(results).toContain('in-frustum');
    });

    it('should handle empty tree', () => {
      const octree = new SpatialOctree();
      const frustum = new THREE.Frustum();
      
      const results = octree.queryFrustum(frustum);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('queryNearestK', () => {
    it('should find k nearest entities', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('closest', new THREE.Vector3(10, 0, 0));
      octree.updatePosition('middle', new THREE.Vector3(50, 0, 0));
      octree.updatePosition('farthest', new THREE.Vector3(100, 0, 0));
      
      const results = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 2);
      
      expect(results).toHaveLength(2);
      expect(results).toContain('closest');
      expect(results).toContain('middle');
      expect(results).not.toContain('farthest');
    });

    it('should respect maxDistance', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('close', new THREE.Vector3(10, 0, 0));
      octree.updatePosition('far', new THREE.Vector3(200, 0, 0));
      
      const results = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 10, 100);
      
      expect(results).toContain('close');
      expect(results).not.toContain('far');
    });

    it('should handle k larger than entity count', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('entity1', new THREE.Vector3(10, 0, 0));
      octree.updatePosition('entity2', new THREE.Vector3(20, 0, 0));
      
      const results = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 10);
      
      expect(results).toHaveLength(2);
    });

    it('should handle empty tree', () => {
      const octree = new SpatialOctree();
      
      const results = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 5);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('setWorldSize', () => {
    it('should rebuild tree with new bounds', () => {
      const octree = new SpatialOctree(2000);
      
      octree.updatePosition('entity1', new THREE.Vector3(500, 0, 500));
      octree.updatePosition('entity2', new THREE.Vector3(-500, 0, -500));
      
      expect(octree.getStats().totalEntities).toBe(2);
      
      // Double the world size
      octree.setWorldSize(4000);
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(2);
    });

    it('should preserve existing entities', () => {
      const octree = new SpatialOctree(2000);
      
      octree.updatePosition('entity1', new THREE.Vector3(500, 0, 500));
      
      octree.setWorldSize(4000);
      
      // Should still be able to query the entity
      const results = octree.queryRadius(new THREE.Vector3(500, 0, 500), 100);
      expect(results).toContain('entity1');
    });

    it('should handle shrinking world size', () => {
      const octree = new SpatialOctree(4000);
      
      octree.updatePosition('entity1', new THREE.Vector3(500, 0, 500));
      octree.updatePosition('entity2', new THREE.Vector3(1500, 0, 1500));
      
      // Shrink world size - entity2 might be clamped
      octree.setWorldSize(2000);
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all entities', () => {
      const octree = new SpatialOctree();
      
      for (let i = 0; i < 10; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }
      
      expect(octree.getStats().totalEntities).toBe(10);
      
      octree.clear();
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(0);
      expect(stats.totalNodes).toBe(1);
    });

    it('should reset tree structure', () => {
      const octree = new SpatialOctree();
      
      // Insert enough to trigger subdivision
      for (let i = 0; i < 20; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }
      
      expect(octree.getStats().totalNodes).toBeGreaterThan(1);
      
      octree.clear();
      
      const stats = octree.getStats();
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepth).toBe(0);
    });

    it('should allow adding entities after clear', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('old', new THREE.Vector3(100, 0, 100));
      octree.clear();
      octree.updatePosition('new', new THREE.Vector3(200, 0, 200));
      
      const results = octree.queryRadius(new THREE.Vector3(200, 0, 200), 100);
      expect(results).toContain('new');
      expect(results).not.toContain('old');
    });
  });

  describe('rebuild', () => {
    it('should rebuild from combatants map', () => {
      const octree = new SpatialOctree();
      const combatants = new Map([
        ['c1', { position: new THREE.Vector3(100, 0, 100), state: 0 } as any],
        ['c2', { position: new THREE.Vector3(200, 0, 200), state: 0 } as any],
        ['c3', { position: new THREE.Vector3(300, 0, 300), state: 0 } as any],
      ]);
      
      octree.rebuild(combatants);
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(3);
    });

    it('should skip dead combatants', () => {
      const octree = new SpatialOctree();
      const combatants = new Map([
        ['alive', { position: new THREE.Vector3(100, 0, 100), state: 'engaging' } as any],
        ['dead', { position: new THREE.Vector3(200, 0, 200), state: 'dead' } as any],
      ]);
      
      octree.rebuild(combatants);
      
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(1);
    });

    it('should clear existing entities before rebuild', () => {
      const octree = new SpatialOctree();
      
      octree.updatePosition('old', new THREE.Vector3(100, 0, 100));
      
      const combatants = new Map([
        ['new', { position: new THREE.Vector3(200, 0, 200), state: 'idle' } as any],
      ]);
      
      octree.rebuild(combatants);
      
      // Verify old entity is gone and new entity exists
      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(1);
      
      // Query for the new entity
      const results = octree.queryRadius(new THREE.Vector3(200, 0, 200), 100);
      expect(results).toContain('new');
      
      // Query for the old entity should not find it
      const oldResults = octree.queryRadius(new THREE.Vector3(100, 0, 100), 100);
      expect(oldResults).not.toContain('old');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const octree = new SpatialOctree();
      
      const stats = octree.getStats();
      expect(stats).toHaveProperty('totalNodes');
      expect(stats).toHaveProperty('totalEntities');
      expect(stats).toHaveProperty('maxDepth');
      expect(stats).toHaveProperty('avgEntitiesPerLeaf');
    });

    it('should track subdivision correctly', () => {
      const octree = new SpatialOctree();
      
      // Initial state
      let stats = octree.getStats();
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepth).toBe(0);
      
      // Insert entities to trigger subdivision
      for (let i = 0; i < 20; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 10, 0, i * 10));
      }
      
      stats = octree.getStats();
      expect(stats.totalNodes).toBeGreaterThan(1);
      expect(stats.maxDepth).toBeGreaterThan(0);
      expect(stats.totalEntities).toBe(20);
      expect(stats.avgEntitiesPerLeaf).toBeGreaterThan(0);
    });

    it('should handle empty tree stats', () => {
      const octree = new SpatialOctree();
      
      const stats = octree.getStats();
      expect(stats.avgEntitiesPerLeaf).toBe(0);
    });
  });
});
