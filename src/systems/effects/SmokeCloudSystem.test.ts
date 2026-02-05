import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SmokeCloudSystem, setSmokeCloudSystem, spawnSmokeCloud } from './SmokeCloudSystem';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock ExplosionTextures
vi.mock('./ExplosionTextures', () => ({
  createSmokeTexture: vi.fn().mockReturnValue({
    dispose: vi.fn(),
  }),
}));

// Mock DOM for overlay creation
if (typeof document === 'undefined') {
  const mockElement = {
    id: '',
    style: {} as any,
    appendChild: vi.fn(),
    remove: vi.fn(),
  };

  const mockBody = {
    appendChild: vi.fn(),
  };

  vi.stubGlobal('document', {
    createElement: vi.fn().mockReturnValue(mockElement),
    body: mockBody,
  });
}

describe('SmokeCloudSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let smokeCloudSystem: SmokeCloudSystem;

  beforeEach(async () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 5, 0);

    smokeCloudSystem = new SmokeCloudSystem(scene, camera);
    await smokeCloudSystem.init();
  });

  afterEach(() => {
    smokeCloudSystem.dispose();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty clouds array', () => {
      expect(smokeCloudSystem).toBeDefined();
      // Access private clouds via @ts-ignore for testing
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
    });

    it('should create a pool of clouds during init', async () => {
      const freshSystem = new SmokeCloudSystem(scene, camera);
      await freshSystem.init();

      // Pool should have MAX_CLOUDS
      const pool = (freshSystem as any).pool;
      expect(pool.length).toBe(10); // MAX_CLOUDS is 10

      freshSystem.dispose();
    });

    it('should create overlay element during init', () => {
      const overlay = (smokeCloudSystem as any).overlay;
      expect(overlay).toBeDefined();
      expect(document.createElement).toHaveBeenCalledWith('div');
    });

    it('should set up setSmokeCloudSystem module-level function', () => {
      setSmokeCloudSystem(smokeCloudSystem);
      // spawnSmokeCloud should now work
      const position = new THREE.Vector3(10, 2, 10);
      spawnSmokeCloud(position);

      const clouds = (smokeCloudSystem as any).clouds;
      expect(clouds.length).toBe(1);
    });
  });

  describe('Spawn', () => {
    it('should spawn a smoke cloud at the specified position', () => {
      const position = new THREE.Vector3(100, 0, 200);
      smokeCloudSystem.spawn(position);

      const clouds = (smokeCloudSystem as any).clouds;
      expect(clouds.length).toBe(1);

      const cloud = clouds[0];
      expect(cloud.group.position.x).toBeCloseTo(100);
      expect(cloud.group.position.y).toBeCloseTo(0.5); // Position.y + 0.5
      expect(cloud.group.position.z).toBeCloseTo(200);
      expect(cloud.group.visible).toBe(true);
    });

    it('should initialize cloud with randomized parameters', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      expect(cloud.age).toBe(0);
      expect(cloud.maxRadius).toBeGreaterThanOrEqual(8);
      expect(cloud.maxRadius).toBeLessThanOrEqual(10);
      expect(cloud.expandDuration).toBeGreaterThanOrEqual(1);
      expect(cloud.expandDuration).toBeLessThanOrEqual(2);
      expect(cloud.lingerDuration).toBeGreaterThanOrEqual(8);
      expect(cloud.lingerDuration).toBeLessThanOrEqual(10);
      expect(cloud.dissipateDuration).toBe(3);
    });

    it('should initialize sprites with zero opacity', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      for (const sprite of cloud.sprites) {
        expect((sprite.material as THREE.SpriteMaterial).opacity).toBe(0);
      }
    });

    it('should reuse clouds from pool when available', () => {
      const pool = (smokeCloudSystem as any).pool;
      const initialPoolSize = pool.length;

      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      expect(pool.length).toBe(initialPoolSize - 1);
      expect((smokeCloudSystem as any).clouds.length).toBe(1);
    });

    it('should handle spawning when pool is empty by taking from active clouds', () => {
      // Spawn all clouds from pool
      for (let i = 0; i < 10; i++) {
        smokeCloudSystem.spawn(new THREE.Vector3(i * 10, 0, 0));
      }

      const pool = (smokeCloudSystem as any).pool;
      expect(pool.length).toBe(0);

      // Spawn one more - should take from active clouds
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));
      expect((smokeCloudSystem as any).clouds.length).toBe(10);
    });
  });

  describe('Update - Cloud Lifecycle', () => {
    beforeEach(() => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));
    });

    it('should update cloud age with deltaTime', () => {
      const cloud = (smokeCloudSystem as any).clouds[0];
      expect(cloud.age).toBe(0);

      smokeCloudSystem.update(0.5);
      expect(cloud.age).toBeCloseTo(0.5);

      smokeCloudSystem.update(1.0);
      expect(cloud.age).toBeCloseTo(1.5);
    });

    it('should expand cloud during expansion phase', () => {
      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 2.0;
      cloud.maxRadius = 10;

      // At t=0, sprites should be at center with low opacity
      smokeCloudSystem.update(0.0);
      const sprite0 = cloud.sprites[0];
      const initialOpacity = (sprite0.material as THREE.SpriteMaterial).opacity;

      // At t=1 (halfway through expansion)
      smokeCloudSystem.update(1.0);
      const midOpacity = (sprite0.material as THREE.SpriteMaterial).opacity;
      expect(midOpacity).toBeGreaterThan(initialOpacity);

      // At t=2 (end of expansion)
      smokeCloudSystem.update(1.0);
      const finalOpacity = (sprite0.material as THREE.SpriteMaterial).opacity;
      expect(finalOpacity).toBeGreaterThan(midOpacity);
    });

    it('should maintain constant radius during linger phase', () => {
      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 1.0;
      cloud.lingerDuration = 5.0;
      cloud.maxRadius = 10;

      // Jump to linger phase
      smokeCloudSystem.update(2.0);
      const sprite = cloud.sprites[0];
      const positionDuringLinger = sprite.position.clone();

      // Continue updating during linger
      smokeCloudSystem.update(1.0);
      const positionLater = sprite.position.clone();

      // Positions should remain relatively stable (same offsets applied)
      expect(positionDuringLinger.distanceTo(positionLater)).toBeLessThan(1);
    });

    it('should dissipate cloud during dissipation phase', () => {
      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 1.0;
      cloud.lingerDuration = 1.0;
      cloud.dissipateDuration = 2.0;

      // Jump to start of dissipation (age = 2.0)
      smokeCloudSystem.update(2.0);
      const sprite = cloud.sprites[0];
      const opacityStart = (sprite.material as THREE.SpriteMaterial).opacity;

      // Continue dissipating
      smokeCloudSystem.update(1.0);
      const opacityMid = (sprite.material as THREE.SpriteMaterial).opacity;
      expect(opacityMid).toBeLessThan(opacityStart);

      // Near end of dissipation
      smokeCloudSystem.update(0.9);
      const opacityNearEnd = (sprite.material as THREE.SpriteMaterial).opacity;
      expect(opacityNearEnd).toBeLessThan(opacityMid);
    });

    it('should deactivate cloud after full lifecycle', () => {
      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 1.0;
      cloud.lingerDuration = 1.0;
      cloud.dissipateDuration = 1.0;

      // Total lifecycle: 3.0 seconds
      smokeCloudSystem.update(3.1);

      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBeGreaterThan(0);
      expect(cloud.group.visible).toBe(false);
    });

    it('should handle multiple clouds with different lifecycles', () => {
      // Spawn additional clouds
      smokeCloudSystem.spawn(new THREE.Vector3(10, 0, 0));
      smokeCloudSystem.spawn(new THREE.Vector3(20, 0, 0));

      const clouds = (smokeCloudSystem as any).clouds;
      clouds[0].dissipateDuration = 1.0;
      clouds[1].dissipateDuration = 2.0;
      clouds[2].dissipateDuration = 3.0;

      // Update past first cloud's lifecycle
      smokeCloudSystem.update(15.0);

      // All should be deactivated
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
    });
  });

  describe('Update - Screen Overlay', () => {
    it('should not show overlay when no clouds are active', () => {
      smokeCloudSystem.update(1.0);

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBe(0);
    });

    it('should show overlay when camera is inside a cloud', () => {
      // Spawn cloud at camera position
      camera.position.set(0, 0, 0);
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.lingerDuration = 5.0;

      // Let cloud expand
      smokeCloudSystem.update(0.2);

      // Overlay should have some opacity
      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBeGreaterThan(0);
    });

    it('should reduce overlay opacity when camera exits cloud', () => {
      // Spawn cloud at camera position
      camera.position.set(0, 0, 0);
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.lingerDuration = 5.0;

      // Let cloud expand and build overlay
      smokeCloudSystem.update(0.2);
      const overlayWithinCloud = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayWithinCloud).toBeGreaterThan(0);

      // Move camera far away
      camera.position.set(100, 100, 100);
      smokeCloudSystem.update(1.0);

      const overlayOutsideCloud = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOutsideCloud).toBeLessThan(overlayWithinCloud);
    });

    it('should calculate max influence from multiple clouds', () => {
      camera.position.set(0, 0, 0);

      // Spawn two clouds at camera position
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const clouds = (smokeCloudSystem as any).clouds;
      clouds.forEach((cloud: any) => {
        cloud.expandDuration = 0.1;
        cloud.lingerDuration = 5.0;
      });

      // Let clouds expand
      smokeCloudSystem.update(0.2);

      // Overlay should reflect maximum influence
      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBeGreaterThan(0);
    });

    it('should smoothly interpolate overlay opacity', () => {
      camera.position.set(0, 0, 0);
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;

      // First small update
      smokeCloudSystem.update(0.016);
      const opacity1 = (smokeCloudSystem as any).overlayOpacity;

      // Second small update
      smokeCloudSystem.update(0.016);
      const opacity2 = (smokeCloudSystem as any).overlayOpacity;

      // Opacity should increase over time
      expect(opacity2).toBeGreaterThanOrEqual(opacity1);
    });

    it('should clamp overlay opacity below threshold to zero', () => {
      camera.position.set(0, 0, 0);
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.lingerDuration = 1.0;

      smokeCloudSystem.update(0.2);

      // Move far away and update until opacity is very low
      camera.position.set(1000, 1000, 1000);
      for (let i = 0; i < 10; i++) {
        smokeCloudSystem.update(0.1);
      }

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBe(0);
    });
  });

  describe('isLineBlocked', () => {
    it('should return false when no clouds are active', () => {
      const from = new THREE.Vector3(0, 0, 0);
      const to = new THREE.Vector3(10, 0, 10);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return false when line does not intersect cloud', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.maxRadius = 5;

      smokeCloudSystem.update(0.2); // Let cloud expand

      // Line far from cloud
      const from = new THREE.Vector3(100, 0, 100);
      const to = new THREE.Vector3(200, 0, 200);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return true when line passes through cloud center', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(10, 5, 10));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.maxRadius = 8;

      smokeCloudSystem.update(0.2); // Let cloud expand

      // Line passing through cloud
      const from = new THREE.Vector3(0, 5, 10);
      const to = new THREE.Vector3(20, 5, 10);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should return true when line grazes edge of cloud', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(10, 0, 10));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.maxRadius = 5;

      smokeCloudSystem.update(0.2);

      // Line just touching cloud edge
      const from = new THREE.Vector3(10, 0, 4.9);
      const to = new THREE.Vector3(10, 0, 15);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should return false for zero-length line', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      smokeCloudSystem.update(0.2);

      const from = new THREE.Vector3(0, 0, 0);
      const to = new THREE.Vector3(0, 0, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should account for effective radius during expansion phase', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(10, 0, 10));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 2.0;
      cloud.maxRadius = 10;

      // Early in expansion - small effective radius
      smokeCloudSystem.update(0.1);

      const from = new THREE.Vector3(0, 0, 10);
      const to = new THREE.Vector3(20, 0, 10);

      // Might not block yet due to small radius
      const blockedEarly = smokeCloudSystem.isLineBlocked(from, to);

      // Later in expansion - larger effective radius
      smokeCloudSystem.update(1.9);
      const blockedLater = smokeCloudSystem.isLineBlocked(from, to);

      // More likely to block after expansion
      expect(blockedLater).toBe(true);
    });

    it('should account for effective radius during dissipation phase', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(10, 0, 10));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.lingerDuration = 0.1;
      cloud.dissipateDuration = 2.0;
      cloud.maxRadius = 8;

      // Jump to dissipation phase
      smokeCloudSystem.update(0.3);

      const from = new THREE.Vector3(0, 0, 10);
      const to = new THREE.Vector3(20, 0, 10);

      // During dissipation, radius increases slightly (1 + 0.2 * t)
      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should handle line segment endpoints inside cloud', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.maxRadius = 10;

      smokeCloudSystem.update(0.2);

      // Both endpoints inside cloud
      const from = new THREE.Vector3(1, 0, 1);
      const to = new THREE.Vector3(2, 0, 2);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should check against multiple clouds', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));
      smokeCloudSystem.spawn(new THREE.Vector3(50, 0, 50));

      const clouds = (smokeCloudSystem as any).clouds;
      clouds.forEach((cloud: any) => {
        cloud.expandDuration = 0.1;
        cloud.maxRadius = 8;
      });

      smokeCloudSystem.update(0.2);

      // Line passes through second cloud
      const from = new THREE.Vector3(40, 0, 50);
      const to = new THREE.Vector3(60, 0, 50);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should not block when line is parallel but outside cloud', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      cloud.maxRadius = 5;

      smokeCloudSystem.update(0.2);

      // Line parallel to cloud but outside radius
      const from = new THREE.Vector3(10, 0, 0);
      const to = new THREE.Vector3(10, 0, 10);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });
  });

  describe('Dispose', () => {
    it('should remove all clouds from scene', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));
      smokeCloudSystem.spawn(new THREE.Vector3(10, 0, 10));

      const clouds = (smokeCloudSystem as any).clouds;
      const cloudGroups = clouds.map((c: any) => c.group);

      smokeCloudSystem.dispose();

      // Groups should be removed from scene
      cloudGroups.forEach((group: THREE.Group) => {
        expect(scene.children).not.toContain(group);
      });
    });

    it('should dispose all sprite materials', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      const materials = cloud.sprites.map((s: THREE.Sprite) => s.material);
      const disposeSpy = vi.spyOn(materials[0], 'dispose');

      smokeCloudSystem.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should dispose texture', () => {
      const texture = (smokeCloudSystem as any).texture;
      const disposeSpy = vi.spyOn(texture, 'dispose');

      smokeCloudSystem.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should remove overlay element', () => {
      const overlay = (smokeCloudSystem as any).overlay;
      expect(overlay).toBeDefined();

      smokeCloudSystem.dispose();

      expect((smokeCloudSystem as any).overlay).toBeUndefined();
    });

    it('should clear clouds and pool arrays', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      smokeCloudSystem.dispose();

      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBe(0);
    });
  });

  describe('Module-level Functions', () => {
    it('should allow setting smoke cloud system globally', async () => {
      const newSystem = new SmokeCloudSystem(scene, camera);
      await newSystem.init();
      setSmokeCloudSystem(newSystem);

      const position = new THREE.Vector3(5, 5, 5);
      spawnSmokeCloud(position);

      expect((newSystem as any).clouds.length).toBe(1);

      newSystem.dispose();
    });

    it('should handle spawnSmokeCloud when system is not set', () => {
      setSmokeCloudSystem(undefined);

      // Should not crash
      expect(() => {
        spawnSmokeCloud(new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
    });

    it('should handle spawnSmokeCloud with null system', () => {
      setSmokeCloudSystem(undefined);

      spawnSmokeCloud(new THREE.Vector3(10, 10, 10));

      // Should not crash and no clouds spawned
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle update with zero deltaTime', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      expect(() => {
        smokeCloudSystem.update(0);
      }).not.toThrow();

      const cloud = (smokeCloudSystem as any).clouds[0];
      expect(cloud.age).toBe(0);
    });

    it('should handle update with very large deltaTime', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      // Update with huge deltaTime
      smokeCloudSystem.update(1000);

      // Cloud should be deactivated
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
    });

    it('should handle spawning at exact same position multiple times', () => {
      const position = new THREE.Vector3(5, 5, 5);

      smokeCloudSystem.spawn(position);
      smokeCloudSystem.spawn(position);
      smokeCloudSystem.spawn(position);

      expect((smokeCloudSystem as any).clouds.length).toBe(3);
    });

    it('should handle camera at cloud position exactly', () => {
      const position = new THREE.Vector3(10, 10, 10);
      camera.position.copy(position);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;

      smokeCloudSystem.update(0.2);

      // Should have high overlay influence
      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBeGreaterThan(0);
    });

    it('should handle isLineBlocked with identical from and to positions', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(0, 0, 0));

      const cloud = (smokeCloudSystem as any).clouds[0];
      cloud.expandDuration = 0.1;
      smokeCloudSystem.update(0.2);

      const point = new THREE.Vector3(5, 5, 5);
      expect(smokeCloudSystem.isLineBlocked(point, point)).toBe(false);
    });

    it('should handle negative positions', () => {
      smokeCloudSystem.spawn(new THREE.Vector3(-100, -50, -200));

      const cloud = (smokeCloudSystem as any).clouds[0];
      expect(cloud.group.position.x).toBeCloseTo(-100);
      expect(cloud.group.position.y).toBeCloseTo(-49.5); // -50 + 0.5
      expect(cloud.group.position.z).toBeCloseTo(-200);
    });
  });
});
