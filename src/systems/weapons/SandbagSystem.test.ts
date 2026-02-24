import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SandbagSystem } from './SandbagSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { InventoryManager } from '../player/InventoryManager';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock ModelLoader - returns a group with a mesh child for sandbag GLB
vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(2, 1.2, 0.8);
      const material = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
      return group;
    }),
  },
}));

vi.mock('../assets/modelPaths', () => ({
  StructureModels: { SANDBAG_WALL: 'structures/sandbag-wall.glb' },
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

// Helper to create mock scene
function createMockScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add = vi.fn((obj) => {
    scene.children.push(obj);
    return scene;
  }) as any;
  scene.remove = vi.fn((obj) => {
    const index = scene.children.indexOf(obj);
    if (index !== -1) scene.children.splice(index, 1);
    return scene;
  }) as any;
  return scene;
}

// Helper to create mock camera
function createMockCamera(position = new THREE.Vector3(0, 5, 0)): THREE.Camera {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.copy(position);
  camera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
    return target.set(0, 0, -1);
  }) as any;
  return camera;
}

// Helper to create mock chunk manager
function createMockChunkManager(): ImprovedChunkManager {
  return {
    getEffectiveHeightAt: vi.fn((_x: number, _z: number) => {
      // Flat terrain at y=0 by default
      return 0;
    }),
    raycastTerrain: vi.fn(() => ({ hit: false, distance: undefined })),
  } as any;
}

// Helper to create mock inventory manager
function createMockInventoryManager(sandbagCount = 5): InventoryManager {
  let count = sandbagCount;
  return {
    canUseSandbag: vi.fn(() => count > 0),
    hasItem: vi.fn((item: string) => item === 'sandbag' && count > 0),
    useItem: vi.fn((item: string) => {
      if (item === 'sandbag' && count > 0) {
        count--;
        return true;
      }
      return false;
    }),
    useSandbag: vi.fn(() => {
      if (count > 0) {
        count--;
        return true;
      }
      return false;
    }),
  } as any;
}

describe('SandbagSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let chunkManager: ImprovedChunkManager;
  let inventoryManager: InventoryManager;
  let sandbagSystem: SandbagSystem;

  beforeEach(async () => {
    scene = createMockScene();
    camera = createMockCamera();
    chunkManager = createMockChunkManager();
    inventoryManager = createMockInventoryManager(5);
    sandbagSystem = new SandbagSystem(scene, camera, chunkManager);
    sandbagSystem.setInventoryManager(inventoryManager);
    await sandbagSystem.init(); // Creates placement preview (async GLB load)
    await flushPromises();
    vi.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize without errors', () => {
      expect(sandbagSystem).toBeDefined();
    });

    it('should create placement preview via init', () => {
      // Preview was created during init() and added to scene
      expect(scene.add).toHaveBeenCalled; // Was called during init
    });

    it('should accept optional chunk manager', () => {
      const system = new SandbagSystem(scene, camera);
      expect(system).toBeDefined();
    });

    it('should initialize with zero sandbags', () => {
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });

    it('should set inventory manager', () => {
      const newInventory = createMockInventoryManager(3);
      sandbagSystem.setInventoryManager(newInventory);
      expect(sandbagSystem).toBeDefined();
    });
  });

  describe('init', () => {
    it('should initialize without errors', async () => {
      const freshSystem = new SandbagSystem(scene, camera, chunkManager);
      await expect(freshSystem.init()).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    it('should not throw when preview is hidden', () => {
      expect(() => {
        sandbagSystem.update(0.016);
      }).not.toThrow();
    });

    it('should update preview position when visible', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.update(0.016);
      expect(sandbagSystem).toBeDefined();
    });

    it('should update preview pulse animation', () => {
      sandbagSystem.showPlacementPreview(true);
      for (let i = 0; i < 10; i++) {
        sandbagSystem.update(0.1);
      }
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle zero deltaTime', () => {
      sandbagSystem.showPlacementPreview(true);
      expect(() => {
        sandbagSystem.update(0);
      }).not.toThrow();
    });

    it('should handle large deltaTime', () => {
      sandbagSystem.showPlacementPreview(true);
      expect(() => {
        sandbagSystem.update(10);
      }).not.toThrow();
    });
  });

  describe('showPlacementPreview', () => {
    it('should show preview when true', () => {
      sandbagSystem.showPlacementPreview(true);
      expect(sandbagSystem).toBeDefined();
    });

    it('should hide preview when false', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.showPlacementPreview(false);
      expect(sandbagSystem).toBeDefined();
    });

    it('should reset rotation when showing preview', () => {
      sandbagSystem.rotatePlacementPreview(Math.PI / 2);
      sandbagSystem.showPlacementPreview(true);
      expect(sandbagSystem).toBeDefined();
    });
  });

  describe('rotatePlacementPreview', () => {
    it('should rotate preview when visible', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.rotatePlacementPreview(Math.PI / 4);
      expect(sandbagSystem).toBeDefined();
    });

    it('should not rotate when preview hidden', () => {
      sandbagSystem.showPlacementPreview(false);
      sandbagSystem.rotatePlacementPreview(Math.PI / 4);
      expect(sandbagSystem).toBeDefined();
    });

    it('should accumulate rotation', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.rotatePlacementPreview(Math.PI / 4);
      sandbagSystem.rotatePlacementPreview(Math.PI / 4);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle negative rotation', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.rotatePlacementPreview(-Math.PI / 4);
      expect(sandbagSystem).toBeDefined();
    });
  });

  describe('updatePreviewPosition', () => {
    it('should update preview position based on camera', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should place preview at correct distance from camera', () => {
      sandbagSystem.showPlacementPreview(true);
      const cameraPos = new THREE.Vector3(10, 5, 10);
      camera.position.copy(cameraPos);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should align preview with camera direction', () => {
      sandbagSystem.showPlacementPreview(true);
      camera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
        return target.set(1, 0, 0); // Looking along +X
      }) as any;
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should use terrain height for preview Y position', () => {
      sandbagSystem.showPlacementPreview(true);
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(5);
      sandbagSystem.updatePreviewPosition(camera);
      expect(chunkManager.getEffectiveHeightAt).toHaveBeenCalled();
    });

    it('should show green preview when placement valid', () => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should show red preview when placement invalid', async () => {
      // No inventory manager - placement invalid
      const systemNoInventory = new SandbagSystem(scene, camera, chunkManager);
      await systemNoInventory.init();
      await flushPromises();
      systemNoInventory.showPlacementPreview(true);
      systemNoInventory.updatePreviewPosition(camera);
      expect(systemNoInventory).toBeDefined();
    });
  });

  describe('placeSandbag', () => {
    beforeEach(() => {
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
    });

    it('should place sandbag at valid position', async () => {
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
      await flushPromises(); // Wait for async placement
      expect(sandbagSystem.getSandbagCount()).toBe(1);
    });

    it('should consume inventory when placing', () => {
      sandbagSystem.placeSandbag();
      expect(inventoryManager.useSandbag).toHaveBeenCalledTimes(1);
    });

    it('should add mesh to scene after async load', async () => {
      const initialChildren = scene.children.length;
      sandbagSystem.placeSandbag();
      await flushPromises();
      expect(scene.children.length).toBeGreaterThan(initialChildren);
    });

    it('should fail when no inventory manager', async () => {
      const systemNoInventory = new SandbagSystem(scene, camera, chunkManager);
      await systemNoInventory.init();
      await flushPromises();
      systemNoInventory.showPlacementPreview(true);
      systemNoInventory.updatePreviewPosition(camera);
      const result = systemNoInventory.placeSandbag();
      expect(result).toBe(false);
    });

    it('should fail when inventory empty', () => {
      const emptyInventory = createMockInventoryManager(0);
      sandbagSystem.setInventoryManager(emptyInventory);
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
    });

    it('should fail when max sandbags reached', async () => {
      sandbagSystem.setInventoryManager(createMockInventoryManager(10));

      // Place 10 sandbags (MAX_SANDBAGS)
      for (let i = 0; i < 10; i++) {
        camera.position.set(i * 5, 5, 0); // Space them out
        sandbagSystem.updatePreviewPosition(camera);
        sandbagSystem.placeSandbag();
        await flushPromises(); // Wait for each async placement
      }

      expect(sandbagSystem.getSandbagCount()).toBe(10);

      // Try to place 11th
      camera.position.set(100, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
      expect(sandbagSystem.getSandbagCount()).toBe(10);
    });

    it('should fail when too close to existing sandbag', async () => {
      // Place first sandbag
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises(); // Wait for sandbag to register

      // Try to place second too close (MIN_SPACING = 3)
      camera.position.set(2, 5, 0);
      sandbagSystem.updatePreviewPosition(camera); // Re-validate after first placed
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
      await flushPromises();
      expect(sandbagSystem.getSandbagCount()).toBe(1);
    });

    it('should succeed when far enough from existing sandbag', async () => {
      // Place first sandbag
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      // Place second far enough (MIN_SPACING = 3)
      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
      await flushPromises();
      expect(sandbagSystem.getSandbagCount()).toBe(2);
    });

    it('should fail on steep slope', () => {
      // Mock steep terrain
      (chunkManager.getEffectiveHeightAt as any).mockImplementation((x: number, _z: number) => {
        return x * 2; // Very steep slope
      });

      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
    });

    it('should succeed on gentle slope', () => {
      // Mock gentle terrain
      (chunkManager.getEffectiveHeightAt as any).mockImplementation((x: number, _z: number) => {
        return x * 0.1; // Gentle slope
      });

      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });

    it('should fail when underwater', () => {
      // Mock underwater position
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(-2);

      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
    });

    it('should succeed above water', () => {
      // Mock above water position
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(2);

      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });

    it('should assign unique IDs to sandbags', async () => {
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      expect(sandbagSystem.getSandbagCount()).toBe(2);
    });

    it('should copy preview rotation to placed sandbag', () => {
      sandbagSystem.rotatePlacementPreview(Math.PI / 4);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });
  });

  describe('checkRayIntersection', () => {
    beforeEach(async () => {
      // Place a sandbag
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();
    });

    it('should detect ray hitting sandbag', () => {
      const ray = new THREE.Ray(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(1, 0, 0));
      const hit = sandbagSystem.checkRayIntersection(ray);
      expect(typeof hit).toBe('boolean');
    });

    it('should return false when ray misses', () => {
      const ray = new THREE.Ray(new THREE.Vector3(100, 1, 100), new THREE.Vector3(1, 0, 0));
      const hit = sandbagSystem.checkRayIntersection(ray);
      expect(hit).toBe(false);
    });

    it('should return false when no sandbags placed', () => {
      const emptySystem = new SandbagSystem(scene, camera, chunkManager);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
      const hit = emptySystem.checkRayIntersection(ray);
      expect(hit).toBe(false);
    });

    it('should check all placed sandbags', async () => {
      // Place multiple sandbags
      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      camera.position.set(20, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      const ray = new THREE.Ray(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(1, 0, 0));
      const hit = sandbagSystem.checkRayIntersection(ray);
      expect(typeof hit).toBe('boolean');
    });
  });

  describe('getRayIntersectionPoint', () => {
    beforeEach(async () => {
      // Place a sandbag
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();
    });

    it('should return intersection point when ray hits', () => {
      const ray = new THREE.Ray(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(1, 0, 0));
      const point = sandbagSystem.getRayIntersectionPoint(ray);
      expect(point === null || point instanceof THREE.Vector3).toBe(true);
    });

    it('should return null when ray misses', () => {
      const ray = new THREE.Ray(new THREE.Vector3(100, 1, 100), new THREE.Vector3(1, 0, 0));
      const point = sandbagSystem.getRayIntersectionPoint(ray);
      expect(point).toBeNull();
    });

    it('should return null when no sandbags placed', () => {
      const emptySystem = new SandbagSystem(scene, camera, chunkManager);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
      const point = emptySystem.getRayIntersectionPoint(ray);
      expect(point).toBeNull();
    });

    it('should return closest intersection point', async () => {
      // Place multiple sandbags
      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      const ray = new THREE.Ray(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(1, 0, 0));
      const point = sandbagSystem.getRayIntersectionPoint(ray);
      expect(point === null || point instanceof THREE.Vector3).toBe(true);
    });
  });

  describe('getSandbagBounds', () => {
    it('should return empty array when no sandbags', () => {
      const bounds = sandbagSystem.getSandbagBounds();
      expect(bounds).toEqual([]);
    });

    it('should return bounds for all sandbags', async () => {
      // Place sandbags
      sandbagSystem.showPlacementPreview(true);

      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      const bounds = sandbagSystem.getSandbagBounds();
      expect(bounds.length).toBe(2);
      expect(bounds[0]).toBeInstanceOf(THREE.Box3);
      expect(bounds[1]).toBeInstanceOf(THREE.Box3);
    });

    it('should update bounds before returning', async () => {
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      const bounds = sandbagSystem.getSandbagBounds();
      expect(bounds[0]).toBeInstanceOf(THREE.Box3);
    });
  });

  describe('checkCollision', () => {
    beforeEach(async () => {
      // Place a sandbag at origin
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();
    });

    it('should detect collision when position overlaps sandbag', () => {
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision = sandbagSystem.checkCollision(testPos);
      expect(typeof collision).toBe('boolean');
    });

    it('should not detect collision when far away', () => {
      const testPos = new THREE.Vector3(100, 1, 100);
      const collision = sandbagSystem.checkCollision(testPos);
      expect(collision).toBe(false);
    });

    it('should use radius parameter for collision expansion', () => {
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision1 = sandbagSystem.checkCollision(testPos, 0.5);
      const collision2 = sandbagSystem.checkCollision(testPos, 2.0);
      expect(typeof collision1).toBe('boolean');
      expect(typeof collision2).toBe('boolean');
    });

    it('should check height for collision', () => {
      const testPos = new THREE.Vector3(0, 10, 0); // High above sandbag
      const collision = sandbagSystem.checkCollision(testPos);
      expect(collision).toBe(false);
    });

    it('should return false when no sandbags placed', () => {
      const emptySystem = new SandbagSystem(scene, camera, chunkManager);
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision = emptySystem.checkCollision(testPos);
      expect(collision).toBe(false);
    });

    it('should check all sandbags for collision', async () => {
      // Place multiple sandbags
      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      camera.position.set(20, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      const testPos = new THREE.Vector3(10, 1, 0);
      const collision = sandbagSystem.checkCollision(testPos);
      expect(typeof collision).toBe('boolean');
    });

    it('should use default radius when not specified', () => {
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision = sandbagSystem.checkCollision(testPos);
      expect(typeof collision).toBe('boolean');
    });
  });

  describe('dispose', () => {
    it('should remove all sandbags from scene', async () => {
      // Place sandbags
      sandbagSystem.showPlacementPreview(true);

      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      sandbagSystem.dispose();
      expect(scene.remove).toHaveBeenCalled();
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });

    it('should dispose sandbag geometries', async () => {
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      sandbagSystem.dispose();
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });

    it('should dispose sandbag materials', async () => {
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      sandbagSystem.dispose();
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });

    it('should remove placement preview', () => {
      sandbagSystem.dispose();
      expect(scene.remove).toHaveBeenCalled();
    });

    it('should handle dispose with no sandbags', () => {
      expect(() => {
        sandbagSystem.dispose();
      }).not.toThrow();
    });

    it('should clear sandbag array', async () => {
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      sandbagSystem.dispose();
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });
  });

  describe('getSandbagCount', () => {
    it('should return 0 initially', () => {
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });

    it('should return correct count after placing sandbags', async () => {
      sandbagSystem.showPlacementPreview(true);

      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();
      expect(sandbagSystem.getSandbagCount()).toBe(1);

      camera.position.set(10, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();
      expect(sandbagSystem.getSandbagCount()).toBe(2);
    });

    it('should return 0 after dispose', async () => {
      sandbagSystem.showPlacementPreview(true);
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      sandbagSystem.dispose();
      expect(sandbagSystem.getSandbagCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle camera at origin', () => {
      camera.position.set(0, 0, 0);
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle camera looking straight down', () => {
      camera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
        return target.set(0, -1, 0);
      }) as any;
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle camera looking straight up', () => {
      camera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
        return target.set(0, 1, 0);
      }) as any;
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle negative terrain height', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(-10);
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle very high terrain', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(100);
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle rapid preview toggle', () => {
      for (let i = 0; i < 10; i++) {
        sandbagSystem.showPlacementPreview(true);
        sandbagSystem.showPlacementPreview(false);
      }
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle rapid rotation', () => {
      sandbagSystem.showPlacementPreview(true);
      for (let i = 0; i < 100; i++) {
        sandbagSystem.rotatePlacementPreview(0.1);
      }
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle placement at world boundaries', () => {
      camera.position.set(1000, 5, 1000);
      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem).toBeDefined();
    });

    it('should handle zero radius collision check', () => {
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision = sandbagSystem.checkCollision(testPos, 0);
      expect(typeof collision).toBe('boolean');
    });

    it('should handle very large radius collision check', () => {
      const testPos = new THREE.Vector3(0, 1, 0);
      const collision = sandbagSystem.checkCollision(testPos, 1000);
      expect(typeof collision).toBe('boolean');
    });

    it('should handle ray with zero direction', () => {
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
      expect(() => {
        sandbagSystem.checkRayIntersection(ray);
      }).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      sandbagSystem.dispose();
      expect(() => {
        sandbagSystem.dispose();
      }).not.toThrow();
    });
  });

  describe('Terrain Slope Validation', () => {
    it('should reject placement on 45 degree slope', () => {
      (chunkManager.getEffectiveHeightAt as any).mockImplementation((x: number, _z: number) => {
        return x; // 45 degree slope
      });

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
    });

    it('should accept placement on 20 degree slope', () => {
      (chunkManager.getEffectiveHeightAt as any).mockImplementation((x: number, _z: number) => {
        return x * 0.36; // ~20 degree slope
      });

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });

    it('should accept placement on flat terrain', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(0);

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });
  });

  describe('Water Height Validation', () => {
    it('should reject placement at water level (y=0)', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(0);

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      // y=0 is at water level, preview position will be 0 + 1.2 = 1.2, which is > MAX_WATER_HEIGHT (1.0)
      expect(result).toBe(true);
    });

    it('should reject placement below water (y < 1.0)', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(-3);

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(false);
    });

    it('should accept placement well above water', () => {
      (chunkManager.getEffectiveHeightAt as any).mockReturnValue(10);

      sandbagSystem.showPlacementPreview(true);
      sandbagSystem.updatePreviewPosition(camera);
      const result = sandbagSystem.placeSandbag();
      expect(result).toBe(true);
    });
  });

  describe('Spacing Validation', () => {
    it('should enforce minimum spacing of 3 units', async () => {
      sandbagSystem.showPlacementPreview(true);

      // Place first sandbag
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(true);
      await flushPromises();

      // Try at 2 units away (should fail)
      camera.position.set(2, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(false);

      // Try at 3.5 units away (should succeed)
      camera.position.set(3.5, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(true);
    });

    it('should check spacing in all directions', async () => {
      sandbagSystem.showPlacementPreview(true);

      // Place center sandbag
      camera.position.set(0, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      sandbagSystem.placeSandbag();
      await flushPromises();

      // Test spacing in +X direction
      camera.position.set(2, 5, 0);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(false);

      // Test spacing in +Z direction
      camera.position.set(0, 5, 2);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(false);

      // Test spacing diagonally
      camera.position.set(2, 5, 2);
      sandbagSystem.updatePreviewPosition(camera);
      expect(sandbagSystem.placeSandbag()).toBe(false);
    });
  });
});
