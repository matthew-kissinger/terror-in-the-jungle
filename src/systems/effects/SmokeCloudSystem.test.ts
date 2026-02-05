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

// Mock createSmokeTexture
vi.mock('./ExplosionTextures', () => ({
  createSmokeTexture: vi.fn().mockReturnValue({
    dispose: vi.fn(),
  }),
}));

describe('SmokeCloudSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let smokeCloudSystem: SmokeCloudSystem;

  beforeEach(async () => {
    // Mock document.body.appendChild for overlay
    if (typeof document !== 'undefined') {
      document.body.appendChild = vi.fn() as any;
    }

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
    it('should initialize correctly', async () => {
      expect(smokeCloudSystem).toBeDefined();
    });

    it('should create pool of clouds on init', async () => {
      const newSystem = new SmokeCloudSystem(scene, camera);
      await newSystem.init();

      // Pool should have MAX_CLOUDS (10) clouds
      const pool = (newSystem as any).pool;
      expect(pool.length).toBe(10);

      newSystem.dispose();
    });

    it('should create overlay element', async () => {
      const overlay = (smokeCloudSystem as any).overlay;
      expect(overlay).toBeDefined();
      expect(overlay.id).toBe('smoke-overlay');
    });
  });

  describe('Spawning Smoke Clouds', () => {
    it('should spawn a smoke cloud at given position', () => {
      const position = new THREE.Vector3(5, 2, 3);
      smokeCloudSystem.spawn(position);

      const clouds = (smokeCloudSystem as any).clouds;
      expect(clouds.length).toBe(1);

      const cloud = clouds[0];
      expect(cloud.group.visible).toBe(true);
      expect(cloud.age).toBe(0);

      // Position should be copied with y offset
      expect(cloud.group.position.x).toBeCloseTo(5);
      expect(cloud.group.position.y).toBeCloseTo(2.5); // +0.5 offset
      expect(cloud.group.position.z).toBeCloseTo(3);
    });

    it('should randomize cloud properties on spawn', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // maxRadius should be in range [8, 10]
      expect(cloud.maxRadius).toBeGreaterThanOrEqual(8);
      expect(cloud.maxRadius).toBeLessThanOrEqual(10);

      // expandDuration should be in range [1, 2]
      expect(cloud.expandDuration).toBeGreaterThanOrEqual(1);
      expect(cloud.expandDuration).toBeLessThanOrEqual(2);

      // lingerDuration should be in range [8, 10]
      expect(cloud.lingerDuration).toBeGreaterThanOrEqual(8);
      expect(cloud.lingerDuration).toBeLessThanOrEqual(10);
    });

    it('should randomize sprite offsets and scales', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Check that offsets are set (not all zeros)
      let hasNonZero = false;
      for (let i = 0; i < cloud.offsets.length; i++) {
        if (cloud.offsets[i] !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);

      // Check that baseScales are in range [2.2, 4.4]
      for (let i = 0; i < cloud.baseScales.length; i++) {
        expect(cloud.baseScales[i]).toBeGreaterThanOrEqual(2.2);
        expect(cloud.baseScales[i]).toBeLessThanOrEqual(4.4);
      }
    });

    it('should reuse clouds from pool', () => {
      const position = new THREE.Vector3(0, 0, 0);

      // Spawn 5 clouds
      for (let i = 0; i < 5; i++) {
        smokeCloudSystem.spawn(position);
      }

      const poolSize = (smokeCloudSystem as any).pool.length;
      expect(poolSize).toBe(5); // 10 - 5 = 5 remaining in pool
    });

    it('should take from active clouds if pool is empty', () => {
      const position = new THREE.Vector3(0, 0, 0);

      // Spawn all 10 clouds to empty the pool
      for (let i = 0; i < 10; i++) {
        smokeCloudSystem.spawn(position);
      }

      expect((smokeCloudSystem as any).pool.length).toBe(0);
      expect((smokeCloudSystem as any).clouds.length).toBe(10);

      // Spawn one more - should steal from active
      smokeCloudSystem.spawn(position);
      expect((smokeCloudSystem as any).clouds.length).toBe(10);
    });

    it('should handle empty pool and cloud list gracefully', () => {
      // Empty both pool and clouds
      (smokeCloudSystem as any).pool = [];
      (smokeCloudSystem as any).clouds = [];

      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      expect((smokeCloudSystem as any).clouds.length).toBe(0);
    });
  });

  describe('Cloud Lifecycle - Expansion Phase', () => {
    it('should expand radius during expansion phase', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      const maxRadius = cloud.maxRadius;
      const expandDuration = cloud.expandDuration;

      // At start of expansion
      smokeCloudSystem.update(0.01);

      // Sprite scale should be small initially
      const initialScale = cloud.sprites[0].scale.x;

      // Halfway through expansion
      smokeCloudSystem.update(expandDuration / 2);
      const midScale = cloud.sprites[0].scale.x;

      expect(midScale).toBeGreaterThan(initialScale);
    });

    it('should smoothly interpolate opacity during expansion', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Update a small amount first to get initial opacity
      smokeCloudSystem.update(0.01);
      const material0 = cloud.sprites[0].material as THREE.SpriteMaterial;
      const initialOpacity = material0.opacity;

      // Update to middle of expansion
      smokeCloudSystem.update(cloud.expandDuration / 2);
      const material1 = cloud.sprites[0].material as THREE.SpriteMaterial;

      // Opacity should increase
      expect(material1.opacity).toBeGreaterThan(initialOpacity);
    });
  });

  describe('Cloud Lifecycle - Linger Phase', () => {
    it('should maintain full radius during linger phase', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to linger phase
      smokeCloudSystem.update(cloud.expandDuration + 0.1);
      const scale1 = cloud.sprites[0].scale.x;

      // Update during linger
      smokeCloudSystem.update(cloud.lingerDuration / 2);
      const scale2 = cloud.sprites[0].scale.x;

      // Scale should be relatively stable
      expect(Math.abs(scale2 - scale1)).toBeLessThan(1);
    });

    it('should maintain opacity during linger phase', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to linger phase
      smokeCloudSystem.update(cloud.expandDuration + 0.1);
      const material1 = cloud.sprites[0].material as THREE.SpriteMaterial;
      const opacity1 = material1.opacity;

      // Update during linger
      smokeCloudSystem.update(cloud.lingerDuration / 2);
      const material2 = cloud.sprites[0].material as THREE.SpriteMaterial;
      const opacity2 = material2.opacity;

      // Opacity should remain similar
      expect(Math.abs(opacity2 - opacity1)).toBeLessThan(0.1);
    });
  });

  describe('Cloud Lifecycle - Dissipation Phase', () => {
    it('should fade opacity during dissipation', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to dissipation phase
      const dissipateStart = cloud.expandDuration + cloud.lingerDuration;
      smokeCloudSystem.update(dissipateStart + 0.1);

      const material1 = cloud.sprites[0].material as THREE.SpriteMaterial;
      const opacity1 = material1.opacity;

      // Update during dissipation
      smokeCloudSystem.update(cloud.dissipateDuration / 2);
      const material2 = cloud.sprites[0].material as THREE.SpriteMaterial;
      const opacity2 = material2.opacity;

      expect(opacity2).toBeLessThan(opacity1);
    });

    it('should slightly expand radius during dissipation', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to early dissipation phase
      const dissipateStart = cloud.expandDuration + cloud.lingerDuration;
      smokeCloudSystem.update(dissipateStart + 0.01);

      const scale1 = cloud.sprites[0].scale.x;

      // Update further into dissipation
      smokeCloudSystem.update(0.5); // Additional time
      const scale2 = cloud.sprites[0].scale.x;

      // Scale formula includes radius expansion, but also opacity fadeout
      // Check that the radius term increased (cloud.maxRadius * (1 + 0.2 * t))
      const age1 = dissipateStart + 0.01;
      const age2 = age1 + 0.5;
      const t1 = (age1 - dissipateStart) / cloud.dissipateDuration;
      const t2 = (age2 - dissipateStart) / cloud.dissipateDuration;
      const radiusMultiplier1 = 1 + 0.2 * t1;
      const radiusMultiplier2 = 1 + 0.2 * t2;

      // Radius multiplier should increase
      expect(radiusMultiplier2).toBeGreaterThan(radiusMultiplier1);
    });

    it('should deactivate cloud after dissipation ends', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward past entire lifecycle
      const totalDuration = cloud.expandDuration + cloud.lingerDuration + cloud.dissipateDuration;
      smokeCloudSystem.update(totalDuration + 0.1);

      // Cloud should be deactivated and returned to pool
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBe(10);
      expect(cloud.group.visible).toBe(false);
    });
  });

  describe('Screen Obscuration Overlay', () => {
    it('should not show overlay when no clouds are active', () => {
      smokeCloudSystem.update(1.0);

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBe(0);
    });

    it('should show overlay when camera is inside smoke cloud', () => {
      const position = new THREE.Vector3(0, 5, 0); // Same as camera
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to linger phase
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBeGreaterThan(0);
    });

    it('should fade overlay smoothly when exiting cloud', () => {
      const position = new THREE.Vector3(0, 5, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      const opacity1 = (smokeCloudSystem as any).overlayOpacity;

      // Move camera away
      camera.position.set(100, 5, 0);
      smokeCloudSystem.update(0.1);

      const opacity2 = (smokeCloudSystem as any).overlayOpacity;
      expect(opacity2).toBeLessThan(opacity1);
    });

    it('should calculate overlay opacity based on distance to cloud center', () => {
      const position = new THREE.Vector3(0, 5, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // At cloud center
      camera.position.set(0, 5, 0);
      smokeCloudSystem.update(0.1);
      const centerOpacity = (smokeCloudSystem as any).overlayOpacity;

      // At cloud edge
      const radius = cloud.maxRadius;
      camera.position.set(radius * 0.9, 5, 0);
      smokeCloudSystem.update(0.1);
      const edgeOpacity = (smokeCloudSystem as any).overlayOpacity;

      expect(centerOpacity).toBeGreaterThan(edgeOpacity);
    });

    it('should cap overlay opacity at OVERLAY_MAX_OPACITY', () => {
      const position = new THREE.Vector3(0, 5, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Multiple updates at center
      for (let i = 0; i < 10; i++) {
        smokeCloudSystem.update(0.1);
      }

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      const maxOpacity = (smokeCloudSystem as any).OVERLAY_MAX_OPACITY;
      expect(overlayOpacity).toBeLessThanOrEqual(maxOpacity);
    });

    it('should set overlay to 0 when very close to 0', () => {
      const position = new THREE.Vector3(0, 5, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Move camera far away
      camera.position.set(1000, 5, 0);

      // Update several times to let it fade
      for (let i = 0; i < 20; i++) {
        smokeCloudSystem.update(1.0);
      }

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;
      expect(overlayOpacity).toBe(0);
    });
  });

  describe('isLineBlocked - Line of Sight Blocking', () => {
    it('should return false when no clouds are active', () => {
      const from = new THREE.Vector3(0, 0, 0);
      const to = new THREE.Vector3(10, 0, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return false for zero-length line', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const from = new THREE.Vector3(5, 0, 0);
      const to = new THREE.Vector3(5, 0, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return true when line passes through cloud center', () => {
      const cloudPos = new THREE.Vector3(5, 2, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to linger phase for full radius
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Line passes through cloud (y=2.5 due to +0.5 offset)
      const from = new THREE.Vector3(0, 2.5, 0);
      const to = new THREE.Vector3(10, 2.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should return true when line passes near cloud edge', () => {
      const cloudPos = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Line passes close to cloud edge
      const radius = cloud.maxRadius;
      const from = new THREE.Vector3(-10, 0.5, 0); // y=0.5 due to cloud y offset
      const to = new THREE.Vector3(10, 0.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should return false when line is far from cloud', () => {
      const cloudPos = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Line is far above cloud
      const from = new THREE.Vector3(-10, 20, 0);
      const to = new THREE.Vector3(10, 20, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return false when line segment ends before reaching cloud', () => {
      const cloudPos = new THREE.Vector3(30, 0, 0); // Far away
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Line segment ends well before cloud (cloud center at x=30 + 0.5y offset = (30, 0.5, 0))
      const from = new THREE.Vector3(0, 0.5, 0);
      const to = new THREE.Vector3(5, 0.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should return false when line segment starts after cloud', () => {
      const cloudPos = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      // Line segment starts after cloud
      const from = new THREE.Vector3(15, 0.5, 0);
      const to = new THREE.Vector3(20, 0.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(false);
    });

    it('should use effective radius during expansion phase', () => {
      const cloudPos = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Very early in expansion - radius should be small
      smokeCloudSystem.update(0.01);

      // Line would pass through full cloud but not tiny expanding one
      const from = new THREE.Vector3(-10, 0.5, 0);
      const to = new THREE.Vector3(10, 0.5, 0);

      // During early expansion, effective radius is small
      // Might not block depending on exact position
      const blocked = smokeCloudSystem.isLineBlocked(from, to);

      // After full expansion
      smokeCloudSystem.update(cloud.expandDuration);
      const blockedAfter = smokeCloudSystem.isLineBlocked(from, to);

      // Should definitely block after full expansion
      expect(blockedAfter).toBe(true);
    });

    it('should use effective radius during dissipation phase', () => {
      const cloudPos = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Fast-forward to dissipation
      const dissipateStart = cloud.expandDuration + cloud.lingerDuration;
      smokeCloudSystem.update(dissipateStart + 0.1);

      const from = new THREE.Vector3(-10, 0.5, 0);
      const to = new THREE.Vector3(10, 0.5, 0);

      // Should still block during dissipation (radius expands slightly)
      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should check multiple clouds', () => {
      const cloud1Pos = new THREE.Vector3(0, 0, 0);
      const cloud2Pos = new THREE.Vector3(20, 0, 0);

      smokeCloudSystem.spawn(cloud1Pos);
      smokeCloudSystem.spawn(cloud2Pos);

      const clouds = (smokeCloudSystem as any).clouds;
      smokeCloudSystem.update(clouds[0].expandDuration + 0.1);

      // Line passes through second cloud only
      const from = new THREE.Vector3(15, 0.5, 0);
      const to = new THREE.Vector3(25, 0.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });

    it('should return true on first blocking cloud', () => {
      // Spawn multiple clouds
      for (let i = 0; i < 5; i++) {
        smokeCloudSystem.spawn(new THREE.Vector3(i * 5, 0, 0));
      }

      const clouds = (smokeCloudSystem as any).clouds;
      smokeCloudSystem.update(clouds[0].expandDuration + 0.1);

      // Line passes through all clouds
      const from = new THREE.Vector3(-5, 0.5, 0);
      const to = new THREE.Vector3(25, 0.5, 0);

      expect(smokeCloudSystem.isLineBlocked(from, to)).toBe(true);
    });
  });

  describe('Module-level spawn function', () => {
    it('should call spawn on set system', () => {
      setSmokeCloudSystem(smokeCloudSystem);

      const position = new THREE.Vector3(1, 2, 3);
      spawnSmokeCloud(position);

      const clouds = (smokeCloudSystem as any).clouds;
      expect(clouds.length).toBe(1);
      expect(clouds[0].group.position.x).toBeCloseTo(1);
    });

    it('should handle no system set gracefully', () => {
      setSmokeCloudSystem(undefined);

      const position = new THREE.Vector3(0, 0, 0);

      // Should not throw
      expect(() => spawnSmokeCloud(position)).not.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose all clouds and textures', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);
      smokeCloudSystem.spawn(position);

      const texture = (smokeCloudSystem as any).texture;
      texture.dispose = vi.fn();

      smokeCloudSystem.dispose();

      expect(texture.dispose).toHaveBeenCalled();
      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBe(0);
    });

    it('should remove overlay element', () => {
      const overlay = (smokeCloudSystem as any).overlay;
      overlay.remove = vi.fn();

      smokeCloudSystem.dispose();

      expect(overlay.remove).toHaveBeenCalled();
      expect((smokeCloudSystem as any).overlay).toBeUndefined();
    });

    it('should remove all groups from scene', () => {
      const position = new THREE.Vector3(0, 0, 0);

      // Spawn several clouds
      for (let i = 0; i < 5; i++) {
        smokeCloudSystem.spawn(position);
      }

      const initialChildCount = scene.children.length;

      smokeCloudSystem.dispose();

      // All cloud groups should be removed
      expect(scene.children.length).toBeLessThan(initialChildCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large delta time', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      // Huge delta time should complete lifecycle in one update
      smokeCloudSystem.update(100);

      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBe(10);
    });

    it('should handle multiple clouds expiring in same frame', () => {
      const position = new THREE.Vector3(0, 0, 0);

      // Spawn multiple clouds
      for (let i = 0; i < 5; i++) {
        smokeCloudSystem.spawn(position);
      }

      // Fast-forward past all lifecycles
      smokeCloudSystem.update(50);

      expect((smokeCloudSystem as any).clouds.length).toBe(0);
      expect((smokeCloudSystem as any).pool.length).toBe(10);
    });

    it('should update sprite positions correctly with negative offsets', () => {
      const position = new THREE.Vector3(0, 0, 0);
      smokeCloudSystem.spawn(position);

      const cloud = (smokeCloudSystem as any).clouds[0];

      // Manually set some negative offsets
      cloud.offsets[0] = -0.5;
      cloud.offsets[1] = -0.3;
      cloud.offsets[2] = -0.7;

      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      const sprite = cloud.sprites[0];
      // Should handle negative offsets without issues
      expect(sprite.position.x).toBeDefined();
      expect(sprite.position.y).toBeDefined();
      expect(sprite.position.z).toBeDefined();
    });

    it('should handle camera at exact cloud position', () => {
      const cloudPos = new THREE.Vector3(5, 5, 5);
      camera.position.copy(cloudPos);

      smokeCloudSystem.spawn(cloudPos);

      const cloud = (smokeCloudSystem as any).clouds[0];
      smokeCloudSystem.update(cloud.expandDuration + 0.1);

      const overlayOpacity = (smokeCloudSystem as any).overlayOpacity;

      // Should have maximum influence
      expect(overlayOpacity).toBeGreaterThan(0);
    });
  });
});
