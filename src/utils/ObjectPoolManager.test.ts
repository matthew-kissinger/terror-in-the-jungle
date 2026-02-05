import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Logger } from './Logger';

describe('ObjectPoolManager', () => {
  let manager: any;
  let ObjectPoolManager: any;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Logger.clearBuffer();

    // Clear module cache to reset singleton
    vi.resetModules();
    const module = await import('./ObjectPoolManager');
    ObjectPoolManager = module.ObjectPoolManager;
    manager = ObjectPoolManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton behavior', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = ObjectPoolManager.getInstance();
      const instance2 = ObjectPoolManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('warmup()', () => {
    it('should create Vector3 objects in the pool', () => {
      manager.warmup(5, 0, 0, 0);
      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(5);
      expect(stats.vector3InUse).toBe(0);
    });

    it('should create Quaternion objects in the pool', () => {
      manager.warmup(0, 3, 0, 0);
      const stats = manager.getStats();
      expect(stats.quaternionAvailable).toBe(3);
      expect(stats.quaternionInUse).toBe(0);
    });

    it('should create Raycaster objects in the pool', () => {
      manager.warmup(0, 0, 2, 0);
      const stats = manager.getStats();
      expect(stats.raycasterAvailable).toBe(2);
      expect(stats.raycasterInUse).toBe(0);
    });

    it('should create Matrix4 objects in the pool', () => {
      manager.warmup(0, 0, 0, 4);
      const stats = manager.getStats();
      expect(stats.matrix4Available).toBe(4);
      expect(stats.matrix4InUse).toBe(0);
    });

    it('should create all object types in one call', () => {
      manager.warmup(10, 5, 3, 8);
      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(10);
      expect(stats.quaternionAvailable).toBe(5);
      expect(stats.raycasterAvailable).toBe(3);
      expect(stats.matrix4Available).toBe(8);
    });

    it('should log warmup message', () => {
      manager.warmup(5, 5, 5, 5);
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Vector3 pool', () => {
    beforeEach(() => {
      manager.warmup(10, 0, 0, 0);
    });

    it('getVector3() should return a Vector3 from the pool', () => {
      const v = manager.getVector3();
      expect(v).toBeInstanceOf(THREE.Vector3);
    });

    it('getVector3() should mark object as in-use', () => {
      manager.getVector3();
      const stats = manager.getStats();
      expect(stats.vector3InUse).toBe(1);
      expect(stats.vector3Available).toBe(9);
    });

    it('releaseVector3() should return object to pool', () => {
      const v = manager.getVector3();
      manager.releaseVector3(v);
      const stats = manager.getStats();
      expect(stats.vector3InUse).toBe(0);
      expect(stats.vector3Available).toBe(10);
    });

    it('should reset Vector3 to (0, 0, 0) when borrowed', () => {
      const v = manager.getVector3();
      v.set(5, 10, 15);
      manager.releaseVector3(v);

      const v2 = manager.getVector3();
      expect(v2.x).toBe(0);
      expect(v2.y).toBe(0);
      expect(v2.z).toBe(0);
    });

    it('should create new Vector3 when pool exhausted', () => {
      // Borrow all 10
      const vectors = [];
      for (let i = 0; i < 10; i++) {
        vectors.push(manager.getVector3());
      }

      // Pool should be empty
      let stats = manager.getStats();
      expect(stats.vector3Available).toBe(0);

      // Borrow another - should create new
      const v = manager.getVector3();
      expect(v).toBeInstanceOf(THREE.Vector3);

      stats = manager.getStats();
      expect(stats.vector3Created).toBe(1);
    });

    it('should reuse same object instance on borrow-release-borrow cycle', () => {
      const v1 = manager.getVector3();
      manager.releaseVector3(v1);
      const v2 = manager.getVector3();
      expect(v1).toBe(v2);
    });

    it('should increment borrow counter', () => {
      manager.resetStats();
      manager.getVector3();
      const stats = manager.getStats();
      expect(stats.vector3Borrowed).toBe(1);
    });

    it('should track peak usage', () => {
      const vectors = [];
      for (let i = 0; i < 5; i++) {
        vectors.push(manager.getVector3());
      }
      const stats = manager.getStats();
      expect(stats.peakVector3).toBe(5);
    });
  });

  describe('Quaternion pool', () => {
    beforeEach(() => {
      manager.warmup(0, 8, 0, 0);
    });

    it('getQuaternion() should return a Quaternion from the pool', () => {
      const q = manager.getQuaternion();
      expect(q).toBeInstanceOf(THREE.Quaternion);
    });

    it('getQuaternion() should mark object as in-use', () => {
      manager.getQuaternion();
      const stats = manager.getStats();
      expect(stats.quaternionInUse).toBe(1);
      expect(stats.quaternionAvailable).toBe(7);
    });

    it('releaseQuaternion() should return object to pool', () => {
      const q = manager.getQuaternion();
      manager.releaseQuaternion(q);
      const stats = manager.getStats();
      expect(stats.quaternionInUse).toBe(0);
      expect(stats.quaternionAvailable).toBe(8);
    });

    it('should reset Quaternion to identity (0, 0, 0, 1) when borrowed', () => {
      const q = manager.getQuaternion();
      q.set(1, 2, 3, 4);
      manager.releaseQuaternion(q);

      const q2 = manager.getQuaternion();
      expect(q2.x).toBe(0);
      expect(q2.y).toBe(0);
      expect(q2.z).toBe(0);
      expect(q2.w).toBe(1);
    });

    it('should reuse same object instance on borrow-release-borrow cycle', () => {
      const q1 = manager.getQuaternion();
      manager.releaseQuaternion(q1);
      const q2 = manager.getQuaternion();
      expect(q1).toBe(q2);
    });

    it('should increment borrow counter', () => {
      manager.resetStats();
      manager.getQuaternion();
      const stats = manager.getStats();
      expect(stats.quaternionBorrowed).toBe(1);
    });

    it('should track peak usage', () => {
      const quaternions = [];
      for (let i = 0; i < 4; i++) {
        quaternions.push(manager.getQuaternion());
      }
      const stats = manager.getStats();
      expect(stats.peakQuaternion).toBe(4);
    });

    it('should create new Quaternion when pool exhausted', () => {
      const quaternions = [];
      for (let i = 0; i < 8; i++) {
        quaternions.push(manager.getQuaternion());
      }

      let stats = manager.getStats();
      expect(stats.quaternionAvailable).toBe(0);

      const q = manager.getQuaternion();
      expect(q).toBeInstanceOf(THREE.Quaternion);

      stats = manager.getStats();
      expect(stats.quaternionCreated).toBe(1);
    });
  });

  describe('Raycaster pool', () => {
    beforeEach(() => {
      manager.warmup(0, 0, 6, 0);
    });

    it('getRaycaster() should return a Raycaster from the pool', () => {
      const r = manager.getRaycaster();
      expect(r).toBeInstanceOf(THREE.Raycaster);
    });

    it('getRaycaster() should mark object as in-use', () => {
      manager.getRaycaster();
      const stats = manager.getStats();
      expect(stats.raycasterInUse).toBe(1);
      expect(stats.raycasterAvailable).toBe(5);
    });

    it('releaseRaycaster() should return object to pool', () => {
      const r = manager.getRaycaster();
      manager.releaseRaycaster(r);
      const stats = manager.getStats();
      expect(stats.raycasterInUse).toBe(0);
      expect(stats.raycasterAvailable).toBe(6);
    });

    it('should reuse same object instance on borrow-release-borrow cycle', () => {
      const r1 = manager.getRaycaster();
      manager.releaseRaycaster(r1);
      const r2 = manager.getRaycaster();
      expect(r1).toBe(r2);
    });

    it('should increment borrow counter', () => {
      manager.resetStats();
      manager.getRaycaster();
      const stats = manager.getStats();
      expect(stats.raycasterBorrowed).toBe(1);
    });

    it('should track peak usage', () => {
      const raycasters = [];
      for (let i = 0; i < 3; i++) {
        raycasters.push(manager.getRaycaster());
      }
      const stats = manager.getStats();
      expect(stats.peakRaycaster).toBe(3);
    });

    it('should create new Raycaster when pool exhausted', () => {
      const raycasters = [];
      for (let i = 0; i < 6; i++) {
        raycasters.push(manager.getRaycaster());
      }

      let stats = manager.getStats();
      expect(stats.raycasterAvailable).toBe(0);

      const r = manager.getRaycaster();
      expect(r).toBeInstanceOf(THREE.Raycaster);

      stats = manager.getStats();
      expect(stats.raycasterCreated).toBe(1);
    });
  });

  describe('Matrix4 pool', () => {
    beforeEach(() => {
      manager.warmup(0, 0, 0, 7);
    });

    it('getMatrix4() should return a Matrix4 from the pool', () => {
      const m = manager.getMatrix4();
      expect(m).toBeInstanceOf(THREE.Matrix4);
    });

    it('getMatrix4() should mark object as in-use', () => {
      manager.getMatrix4();
      const stats = manager.getStats();
      expect(stats.matrix4InUse).toBe(1);
      expect(stats.matrix4Available).toBe(6);
    });

    it('releaseMatrix4() should return object to pool', () => {
      const m = manager.getMatrix4();
      manager.releaseMatrix4(m);
      const stats = manager.getStats();
      expect(stats.matrix4InUse).toBe(0);
      expect(stats.matrix4Available).toBe(7);
    });

    it('should reset Matrix4 to identity when borrowed', () => {
      const m = manager.getMatrix4();
      m.set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      manager.releaseMatrix4(m);

      const m2 = manager.getMatrix4();
      expect(m2).toEqual(new THREE.Matrix4().identity());
    });

    it('should reuse same object instance on borrow-release-borrow cycle', () => {
      const m1 = manager.getMatrix4();
      manager.releaseMatrix4(m1);
      const m2 = manager.getMatrix4();
      expect(m1).toBe(m2);
    });

    it('should increment borrow counter', () => {
      manager.resetStats();
      manager.getMatrix4();
      const stats = manager.getStats();
      expect(stats.matrix4Borrowed).toBe(1);
    });

    it('should track peak usage', () => {
      const matrices = [];
      for (let i = 0; i < 5; i++) {
        matrices.push(manager.getMatrix4());
      }
      const stats = manager.getStats();
      expect(stats.peakMatrix4).toBe(5);
    });

    it('should create new Matrix4 when pool exhausted', () => {
      const matrices = [];
      for (let i = 0; i < 7; i++) {
        matrices.push(manager.getMatrix4());
      }

      let stats = manager.getStats();
      expect(stats.matrix4Available).toBe(0);

      const m = manager.getMatrix4();
      expect(m).toBeInstanceOf(THREE.Matrix4);

      stats = manager.getStats();
      expect(stats.matrix4Created).toBe(1);
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      manager.warmup(5, 3, 2, 4);
    });

    it('should return stats object with all properties', () => {
      const stats = manager.getStats();
      expect(stats).toHaveProperty('vector3Available');
      expect(stats).toHaveProperty('vector3InUse');
      expect(stats).toHaveProperty('vector3Borrowed');
      expect(stats).toHaveProperty('vector3Created');
      expect(stats).toHaveProperty('quaternionAvailable');
      expect(stats).toHaveProperty('quaternionInUse');
      expect(stats).toHaveProperty('quaternionBorrowed');
      expect(stats).toHaveProperty('quaternionCreated');
      expect(stats).toHaveProperty('raycasterAvailable');
      expect(stats).toHaveProperty('raycasterInUse');
      expect(stats).toHaveProperty('raycasterBorrowed');
      expect(stats).toHaveProperty('raycasterCreated');
      expect(stats).toHaveProperty('matrix4Available');
      expect(stats).toHaveProperty('matrix4InUse');
      expect(stats).toHaveProperty('matrix4Borrowed');
      expect(stats).toHaveProperty('matrix4Created');
      expect(stats).toHaveProperty('peakVector3');
      expect(stats).toHaveProperty('peakQuaternion');
      expect(stats).toHaveProperty('peakRaycaster');
      expect(stats).toHaveProperty('peakMatrix4');
    });

    it('should report correct available and in-use counts', () => {
      manager.getVector3();
      manager.getVector3();
      manager.getQuaternion();

      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(3);
      expect(stats.vector3InUse).toBe(2);
      expect(stats.quaternionAvailable).toBe(2);
      expect(stats.quaternionInUse).toBe(1);
    });
  });

  describe('resetStats()', () => {
    beforeEach(() => {
      manager.warmup(5, 3, 2, 4);
    });

    it('should reset borrow counters', () => {
      manager.getVector3();
      manager.getVector3();
      manager.getQuaternion();

      let stats = manager.getStats();
      expect(stats.vector3Borrowed).toBe(2);
      expect(stats.quaternionBorrowed).toBe(1);

      manager.resetStats();

      stats = manager.getStats();
      expect(stats.vector3Borrowed).toBe(0);
      expect(stats.quaternionBorrowed).toBe(0);
      expect(stats.raycasterBorrowed).toBe(0);
      expect(stats.matrix4Borrowed).toBe(0);
    });

    it('should not reset available/in-use counts', () => {
      const v = manager.getVector3();
      const q = manager.getQuaternion();

      manager.resetStats();

      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(4);
      expect(stats.vector3InUse).toBe(1);
      expect(stats.quaternionAvailable).toBe(2);
      expect(stats.quaternionInUse).toBe(1);
    });

    it('should not reset peak counts', () => {
      manager.getVector3();
      manager.getVector3();

      let stats = manager.getStats();
      expect(stats.peakVector3).toBe(2);

      manager.resetStats();

      stats = manager.getStats();
      expect(stats.peakVector3).toBe(2);
    });

    it('should not reset created counts', () => {
      // Exhaust Vector3 pool
      for (let i = 0; i < 5; i++) {
        manager.getVector3();
      }
      manager.getVector3(); // Creates new

      let stats = manager.getStats();
      expect(stats.vector3Created).toBe(1);

      manager.resetStats();

      stats = manager.getStats();
      expect(stats.vector3Created).toBe(1);
    });
  });

  describe('Mixed operations', () => {
    beforeEach(() => {
      manager.warmup(10, 8, 6, 5);
    });

    it('should handle multiple borrow-release cycles', () => {
      const vectors = [];
      for (let i = 0; i < 5; i++) {
        vectors.push(manager.getVector3());
      }

      for (const v of vectors) {
        manager.releaseVector3(v);
      }

      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(10);
      expect(stats.vector3InUse).toBe(0);
    });

    it('should handle all object types simultaneously', () => {
      const v = manager.getVector3();
      const q = manager.getQuaternion();
      const r = manager.getRaycaster();
      const m = manager.getMatrix4();

      let stats = manager.getStats();
      expect(stats.vector3InUse).toBe(1);
      expect(stats.quaternionInUse).toBe(1);
      expect(stats.raycasterInUse).toBe(1);
      expect(stats.matrix4InUse).toBe(1);

      manager.releaseVector3(v);
      manager.releaseQuaternion(q);
      manager.releaseRaycaster(r);
      manager.releaseMatrix4(m);

      stats = manager.getStats();
      expect(stats.vector3InUse).toBe(0);
      expect(stats.quaternionInUse).toBe(0);
      expect(stats.raycasterInUse).toBe(0);
      expect(stats.matrix4InUse).toBe(0);
    });

    it('should not release objects not from pool', () => {
      const externalVector = new THREE.Vector3(5, 10, 15);
      manager.releaseVector3(externalVector);

      // Should not affect pool state
      const stats = manager.getStats();
      expect(stats.vector3Available).toBe(10);
    });

    it('should handle stress test with many borrows', () => {
      manager.warmup(50, 30, 20, 25);

      const objects: any[] = [];
      for (let i = 0; i < 100; i++) {
        objects.push({
          v: manager.getVector3(),
          q: manager.getQuaternion(),
          r: manager.getRaycaster(),
          m: manager.getMatrix4()
        });
      }

      const stats = manager.getStats();
      expect(stats.vector3Borrowed).toBe(100);
      expect(stats.quaternionBorrowed).toBe(100);
      expect(stats.raycasterBorrowed).toBe(100);
      expect(stats.matrix4Borrowed).toBe(100);

      for (const obj of objects) {
        manager.releaseVector3(obj.v);
        manager.releaseQuaternion(obj.q);
        manager.releaseRaycaster(obj.r);
        manager.releaseMatrix4(obj.m);
      }

      const finalStats = manager.getStats();
      expect(finalStats.vector3InUse).toBe(0);
      expect(finalStats.quaternionInUse).toBe(0);
      expect(finalStats.raycasterInUse).toBe(0);
      expect(finalStats.matrix4InUse).toBe(0);
    });
  });
});
