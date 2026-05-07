import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpatialOctree } from './SpatialOctree';

describe('SpatialOctree', () => {
  describe('construction', () => {
    it('starts empty with a single root node', () => {
      const octree = new SpatialOctree();
      const stats = octree.getStats();

      expect(stats.totalEntities).toBe(0);
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepth).toBe(0);
    });

    it('subdivides once enough entities cross the per-node threshold', () => {
      const octree = new SpatialOctree(4000, 5, 6);
      for (let i = 0; i < 6; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      const stats = octree.getStats();
      expect(stats.totalNodes).toBeGreaterThan(1);
      expect(stats.maxDepth).toBeGreaterThan(0);
    });

    it('caps subdivision at maxDepth', () => {
      const octree = new SpatialOctree(4000, 2, 3);
      for (let i = 0; i < 50; i++) {
        const x = (i % 10) * 100 - 500;
        const z = Math.floor(i / 10) * 100 - 500;
        octree.updatePosition(`entity${i}`, new THREE.Vector3(x, 0, z));
      }

      expect(octree.getStats().maxDepth).toBeLessThanOrEqual(3);
    });
  });

  describe('insert / updatePosition', () => {
    it('clamps positions outside the world bounds and still finds them via query', () => {
      const octree = new SpatialOctree(2000);
      octree.updatePosition('outside', new THREE.Vector3(5000, 500, 5000));

      expect(octree.getStats().totalEntities).toBe(1);
      const results = octree.queryRadius(new THREE.Vector3(1000, 500, 1000), 100);
      expect(results).toContain('outside');
    });

    it('moves an entity between octants correctly', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      octree.updatePosition('entity1', new THREE.Vector3(-1000, 0, -1000));

      expect(octree.queryRadius(new THREE.Vector3(-1000, 0, -1000), 100)).toContain('entity1');
      expect(octree.queryRadius(new THREE.Vector3(100, 0, 100), 100)).not.toContain('entity1');
    });

    it('debounces insignificant position changes but applies significant ones', () => {
      const octree = new SpatialOctree();
      const pos = new THREE.Vector3(100, 0, 100);
      octree.updatePosition('entity1', pos);

      // tiny change - should be ignored
      octree.updatePosition('entity1', pos.clone().add(new THREE.Vector3(0.05, 0, 0)));
      expect(octree.queryRadius(new THREE.Vector3(100, 0, 100), 10)).toContain('entity1');

      // significant change - should be applied
      octree.updatePosition('entity1', pos.clone().add(new THREE.Vector3(0.2, 0, 0)));
      expect(octree.queryRadius(new THREE.Vector3(100.2, 0, 100), 10)).toContain('entity1');
    });
  });

  describe('remove', () => {
    it('removes an entity and no longer returns it in queries', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('entity1', new THREE.Vector3(100, 0, 100));
      octree.updatePosition('entity2', new THREE.Vector3(150, 0, 150));

      octree.remove('entity1');

      const results = octree.queryRadius(new THREE.Vector3(100, 0, 100), 200);
      expect(results).not.toContain('entity1');
      expect(results).toContain('entity2');
      expect(octree.getStats().totalEntities).toBe(1);
    });

    it('is a no-op for an unknown id', () => {
      const octree = new SpatialOctree();
      expect(() => octree.remove('non-existent')).not.toThrow();
    });
  });

  describe('queryRadius', () => {
    it('includes entities inside the radius (incl. boundary) and excludes those outside', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('inside', new THREE.Vector3(50, 0, 0));
      octree.updatePosition('on-boundary', new THREE.Vector3(100, 0, 0));
      octree.updatePosition('outside', new THREE.Vector3(1000, 0, 1000));

      const results = octree.queryRadius(new THREE.Vector3(0, 0, 0), 100);
      expect(results).toContain('inside');
      expect(results).toContain('on-boundary');
      expect(results).not.toContain('outside');
    });

    it('finds high-elevation entities on mountainous maps', () => {
      const octree = new SpatialOctree(21000);
      octree.updatePosition('ridge-target', new THREE.Vector3(620, 725, -884));

      expect(octree.queryRadius(new THREE.Vector3(621, 726, -871), 600)).toContain('ridge-target');
    });

    it('matches a linear scan across a large deterministic dataset', () => {
      const octree = new SpatialOctree();
      const entityCount = 1000;
      const positions = new Map<string, THREE.Vector3>();
      for (let i = 0; i < entityCount; i++) {
        const pos = new THREE.Vector3(
          (((i * 37) % 2000) - 1000),
          (((i * 17) % 100) - 50),
          (((i * 53) % 2000) - 1000)
        );
        positions.set(`entity${i}`, pos);
        octree.updatePosition(`entity${i}`, pos);
      }

      const queryCenters = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(350, 12, -420),
        new THREE.Vector3(-720, -20, 640),
      ];

      for (const center of queryCenters) {
        const radius = 500;
        const radiusSq = radius * radius;
        const octreeResults = octree.queryRadius(center, radius).sort();
        const linearResults: string[] = [];

        for (const [id, pos] of positions) {
          if (pos.distanceToSquared(center) <= radiusSq) {
            linearResults.push(id);
          }
        }

        expect(octreeResults).toEqual(linearResults.sort());
      }
    });
  });

  describe('queryRay', () => {
    it('finds entities along the ray and respects maxDistance', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('along', new THREE.Vector3(-1500, 0, 0));
      octree.updatePosition('off-ray', new THREE.Vector3(-1500, 10, 0));
      octree.updatePosition('past-max', new THREE.Vector3(-500, 0, 0));

      const results = octree.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1200
      );

      expect(results).toContain('along');
      expect(results).not.toContain('off-ray');
      expect(results).not.toContain('past-max');
    });
  });

  describe('queryFrustum', () => {
    it('finds entities inside the frustum and excludes those behind the camera', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('in-frustum', new THREE.Vector3(0, 0, -100));
      octree.updatePosition('behind', new THREE.Vector3(0, 0, 100));

      const frustum = new THREE.Frustum();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 0, 0);
      camera.lookAt(0, 0, -1);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );

      expect(octree.queryFrustum(frustum)).toContain('in-frustum');
    });
  });

  describe('queryNearestK', () => {
    it('returns the closest k entities and respects maxDistance', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('closest', new THREE.Vector3(10, 0, 0));
      octree.updatePosition('middle', new THREE.Vector3(50, 0, 0));
      octree.updatePosition('farthest', new THREE.Vector3(200, 0, 0));

      const twoClosest = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 2);
      expect(twoClosest).toContain('closest');
      expect(twoClosest).toContain('middle');
      expect(twoClosest).not.toContain('farthest');

      const withinMax = octree.queryNearestK(new THREE.Vector3(0, 0, 0), 10, 100);
      expect(withinMax).toContain('closest');
      expect(withinMax).not.toContain('farthest');
    });

    it('caps results at the actual entity count when k is too large', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('entity1', new THREE.Vector3(10, 0, 0));
      octree.updatePosition('entity2', new THREE.Vector3(20, 0, 0));

      expect(octree.queryNearestK(new THREE.Vector3(0, 0, 0), 10)).toHaveLength(2);
    });
  });

  describe('setWorldSize', () => {
    it('preserves entities across a size change', () => {
      const octree = new SpatialOctree(2000);
      octree.updatePosition('entity1', new THREE.Vector3(500, 0, 500));
      octree.updatePosition('entity2', new THREE.Vector3(-500, 0, -500));

      octree.setWorldSize(4000);

      expect(octree.getStats().totalEntities).toBe(2);
      expect(octree.queryRadius(new THREE.Vector3(500, 0, 500), 100)).toContain('entity1');
    });
  });

  describe('clear', () => {
    it('empties the tree and collapses it to the root node', () => {
      const octree = new SpatialOctree();
      for (let i = 0; i < 20; i++) {
        octree.updatePosition(`entity${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      octree.clear();

      const stats = octree.getStats();
      expect(stats.totalEntities).toBe(0);
      expect(stats.totalNodes).toBe(1);
      expect(stats.maxDepth).toBe(0);
    });
  });

  describe('rebuild', () => {
    it('replaces the tree contents with the provided combatants, skipping dead ones', () => {
      const octree = new SpatialOctree();
      octree.updatePosition('old', new THREE.Vector3(100, 0, 100));

      const combatants = new Map([
        ['alive', { position: new THREE.Vector3(200, 0, 200), state: 'engaging' } as any],
        ['dead', { position: new THREE.Vector3(300, 0, 300), state: 'dead' } as any],
      ]);

      octree.rebuild(combatants);

      expect(octree.getStats().totalEntities).toBe(1);
      expect(octree.queryRadius(new THREE.Vector3(200, 0, 200), 100)).toContain('alive');
      expect(octree.queryRadius(new THREE.Vector3(100, 0, 100), 100)).not.toContain('old');
      expect(octree.queryRadius(new THREE.Vector3(300, 0, 300), 100)).not.toContain('dead');
    });
  });
});
