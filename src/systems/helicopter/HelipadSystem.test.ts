import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js
vi.mock('three', () => {
  class MockVector3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new MockVector3(this.x, this.y, this.z); }
  }

  class MockObject3D {
    position = new MockVector3();
    rotation = { x: 0, y: 0, z: 0 };
    scale = { set: vi.fn() };
    userData: Record<string, any> = {};
    children: any[] = [];
    parent: any = null;
    name = '';
    receiveShadow = false;
    castShadow = false;
    add(child: any) { this.children.push(child); child.parent = this; }
    remove(child: any) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); }
    traverse(fn: (obj: any) => void) {
      fn(this);
      this.children.forEach(c => { if (c.traverse) c.traverse(fn); else fn(c); });
    }
  }

  class MockMesh extends MockObject3D {
    geometry: any;
    material: any;
    isMesh = true;
    constructor(geo?: any, mat?: any) {
      super();
      this.geometry = geo ?? { dispose: vi.fn() };
      if (this.geometry && !this.geometry.dispose) this.geometry.dispose = vi.fn();
      this.material = mat ?? { dispose: vi.fn() };
      if (this.material && !this.material.dispose) this.material.dispose = vi.fn();
      if (this.material && !this.material.clone) this.material.clone = vi.fn(() => ({ dispose: vi.fn() }));
    }
  }

  class MockGroup extends MockObject3D {}
  class MockScene extends MockObject3D {}

  return {
    Vector3: MockVector3,
    Object3D: MockObject3D,
    Mesh: MockMesh,
    Group: MockGroup,
    Scene: MockScene,
    CylinderGeometry: class { dispose = vi.fn(); },
    RingGeometry: class { dispose = vi.fn(); },
    PlaneGeometry: class { dispose = vi.fn(); },
    BoxGeometry: class { dispose = vi.fn(); },
    SphereGeometry: class { dispose = vi.fn(); },
    MeshLambertMaterial: class {
      dispose = vi.fn();
      clone = vi.fn(() => new (class { dispose = vi.fn(); })());
      constructor(_opts?: any) {}
    },
    MeshBasicMaterial: class {
      dispose = vi.fn();
      clone = vi.fn(() => new (class { dispose = vi.fn(); })());
      constructor(_opts?: any) {}
    },
    DoubleSide: 2,
  };
});

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../terrain/ImprovedChunkManager', () => ({
  ImprovedChunkManager: vi.fn()
}));

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial()
      );
      mesh.receiveShadow = true;
      group.add(mesh);
      return group;
    }),
  }
}));

vi.mock('../assets/modelPaths', () => ({
  StructureModels: { HELIPAD: 'structures/helipad.glb' }
}));

vi.mock('../world/GameModeManager', () => ({
  GameModeManager: vi.fn()
}));

import * as THREE from 'three';
import { HelipadSystem } from './HelipadSystem';
import { Logger } from '../../utils/Logger';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

function createMockScene(): THREE.Scene {
  return new THREE.Scene();
}

function createMockTerrainManager(heightValue = 10) {
  return {
    getHeightAt: vi.fn().mockReturnValue(heightValue),
    getChunkAt: vi.fn().mockReturnValue({ id: 'chunk-1' }),
    registerCollisionObject: vi.fn(),
    unregisterCollisionObject: vi.fn(),
  };
}

function createMockGameModeManager(modeId = 'open_frontier', zones: any[] = []) {
  return {
    getCurrentConfig: vi.fn().mockReturnValue({ id: modeId, name: modeId, zones }),
  };
}

function createMockVegetationSystem(options: { clearArea?: boolean; addExclusionZone?: boolean } = {}) {
  const system: Record<string, any> = {};
  if (options.clearArea !== false) {
    system.clearArea = vi.fn();
  }
  if (options.addExclusionZone !== false) {
    system.addExclusionZone = vi.fn();
  }
  return system;
}

describe('HelipadSystem', () => {
  let scene: THREE.Scene;
  let system: HelipadSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = createMockScene();
    system = new HelipadSystem(scene);
  });

  // ─── Constructor & init ───────────────────────────────────────────

  describe('constructor', () => {
    it('creates system with scene reference', () => {
      expect(system).toBeDefined();
      expect(system).toHaveProperty('init');
      expect(system).toHaveProperty('update');
      expect(system).toHaveProperty('dispose');
    });
  });

  describe('init', () => {
    it('resolves without error', async () => {
      await expect(system.init()).resolves.toBeUndefined();
    });

    it('logs initialization message', async () => {
      await system.init();
      expect(Logger.info).toHaveBeenCalledWith('helicopter', expect.stringContaining('Initializing'));
    });
  });

  // ─── Setter Methods ───────────────────────────────────────────────

  describe('setTerrainManager', () => {
    it('stores terrain manager reference', async () => {
      const tm = createMockTerrainManager();
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(tm.getHeightAt).toHaveBeenCalled();
    });
  });

  describe('setVegetationSystem', () => {
    it('stores vegetation system reference', async () => {
      const vs = createMockVegetationSystem();
      system.setVegetationSystem(vs);
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(vs.clearArea).toHaveBeenCalled();
    });
  });

  describe('setGameModeManager', () => {
    it('stores game mode manager reference', async () => {
      const gmm = createMockGameModeManager();
      system.setGameModeManager(gmm as any);
      system.setTerrainManager(createMockTerrainManager() as any);
      system.update(0.016);
      await flushPromises();
      expect(gmm.getCurrentConfig).toHaveBeenCalled();
    });
  });

  // ─── createHelipadWhenReady ───────────────────────────────────────

  describe('createHelipadWhenReady', () => {
    it('creates helipad when terrain manager is set', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });

    it('does not create duplicate helipads', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      system.createHelipadWhenReady();
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });

    it('logs warning when terrain manager not set', () => {
      system.createHelipadWhenReady();
      expect(Logger.warn).toHaveBeenCalledWith('helicopter', expect.stringContaining('terrain manager not available'));
    });

    it('does not add to scene without terrain manager', () => {
      system.createHelipadWhenReady();
      expect(scene.children.length).toBe(0);
    });
  });

  // ─── Helipad Geometry ─────────────────────────────────────────────

  describe('helipad geometry', () => {
    beforeEach(async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
    });

    it('creates a Group added to scene', () => {
      const helipad = scene.children[0];
      expect(helipad).toBeDefined();
      expect(helipad).toBeInstanceOf(THREE.Group);
    });

    it('group has correct userData', () => {
      const helipad = scene.children[0];
      expect(helipad.userData).toEqual({
        type: 'helipad',
        faction: 'US',
      });
    });

    it('creates helipad with GLB model child', () => {
      const helipad = scene.children[0] as THREE.Group;
      // helipadGroup wraps the loaded GLB scene
      expect(helipad.children.length).toBeGreaterThanOrEqual(1);
    });

    it('loaded mesh receives shadow', () => {
      const helipad = scene.children[0] as THREE.Group;
      // Find the mesh inside the GLB model
      let meshFound = false;
      helipad.traverse((child: any) => {
        if (child.isMesh) {
          expect(child.receiveShadow).toBe(true);
          meshFound = true;
        }
      });
      expect(meshFound).toBe(true);
    });
  });

  // ─── Terrain Height Sampling ──────────────────────────────────────

  describe('terrain height sampling', () => {
    it('samples multiple terrain points to find max height', async () => {
      const tm = createMockTerrainManager(5);
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(tm.getHeightAt.mock.calls.length).toBeGreaterThan(10);
    });

    it('positions helipad at max terrain height + offset', async () => {
      const tm = createMockTerrainManager(20);
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      // maxHeight (20) + 0.1 offset (flush with terrain)
      expect(helipad.position.y).toBeCloseTo(20.1, 1);
    });

    it('handles zero terrain height', async () => {
      const tm = createMockTerrainManager(0);
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      expect(helipad.position.y).toBeCloseTo(0.1, 1);
    });

    it('uses correct helipad position (40, z, -1400)', async () => {
      const tm = createMockTerrainManager(10);
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      expect(helipad.position.x).toBe(40);
      expect(helipad.position.z).toBe(-1400);
    });
  });

  // ─── Collision Registration ───────────────────────────────────────

  describe('collision registration', () => {
    it('registers collision object with terrain manager', async () => {
      const tm = createMockTerrainManager();
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(tm.registerCollisionObject).toHaveBeenCalledWith('us_helipad', expect.any(Object));
    });
  });

  // ─── update ───────────────────────────────────────────────────────

  describe('update', () => {
    it('does nothing when terrainManager not set', () => {
      system.setGameModeManager(createMockGameModeManager() as any);
      system.update(0.016);
      expect(scene.children.length).toBe(0);
    });

    it('does nothing when gameModeManager not set', () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.update(0.016);
      expect(scene.children.length).toBe(0);
    });

    it('creates helipad in Open Frontier mode when terrain loaded', async () => {
      const tm = createMockTerrainManager(10);
      const gmm = createMockGameModeManager('open_frontier');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });

    it('does NOT create helipad in Zone Control mode', () => {
      const tm = createMockTerrainManager(10);
      const gmm = createMockGameModeManager('zone_control');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      expect(scene.children.length).toBe(0);
    });

    it('creates helipad in A Shau Valley near US base anchor', async () => {
      const tm = createMockTerrainManager(10);
      const gmm = createMockGameModeManager('a_shau_valley', [
        {
          id: 'us_base',
          isHomeBase: true,
          owner: 'US',
          position: new (THREE as any).Vector3(900, 0, -600)
        }
      ]);
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      await flushPromises();
      expect(scene.children.length).toBe(1);
      const helipad = scene.children[0];
      expect(helipad.position.x).toBe(940);
      expect(helipad.position.z).toBe(-600);
    });

    it('waits for valid terrain data before creating helipad', () => {
      const tm = createMockTerrainManager(-200);
      tm.getChunkAt.mockReturnValue(undefined);
      const gmm = createMockGameModeManager('open_frontier');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      // Height -200 < -100 and no chunk loaded -> should not create
      expect(scene.children.length).toBe(0);
    });

    it('creates helipad when terrain height > 0 even without chunk', async () => {
      const tm = createMockTerrainManager(5);
      tm.getChunkAt.mockReturnValue(undefined);
      const gmm = createMockGameModeManager('open_frontier');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      await flushPromises();
      // Height > 0 satisfies the fallback condition
      expect(scene.children.length).toBe(1);
    });

    it('creates helipad when height > -100 and chunk loaded', async () => {
      const tm = createMockTerrainManager(-50);
      tm.getChunkAt.mockReturnValue({ id: 'chunk-1' });
      const gmm = createMockGameModeManager('open_frontier');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });

    it('does not create helipad twice on subsequent updates', async () => {
      const tm = createMockTerrainManager(10);
      const gmm = createMockGameModeManager('open_frontier');
      system.setTerrainManager(tm as any);
      system.setGameModeManager(gmm as any);
      system.update(0.016);
      await flushPromises();
      system.update(0.016);
      await flushPromises();
      system.update(0.016);
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });
  });

  // ─── getHelipadPosition ───────────────────────────────────────────

  describe('getHelipadPosition', () => {
    it('returns position clone for existing helipad', async () => {
      system.setTerrainManager(createMockTerrainManager(10) as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const pos = system.getHelipadPosition('us_helipad');
      expect(pos).not.toBeNull();
      expect(pos!.x).toBe(40);
      expect(pos!.z).toBe(-1400);
    });

    it('returns a clone, not the original reference', async () => {
      system.setTerrainManager(createMockTerrainManager(10) as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const pos1 = system.getHelipadPosition('us_helipad');
      const pos2 = system.getHelipadPosition('us_helipad');
      expect(pos1).not.toBe(pos2);
      expect(pos1!.x).toBe(pos2!.x);
    });

    it('returns null for non-existent helipad', () => {
      expect(system.getHelipadPosition('nonexistent')).toBeNull();
    });

    it('returns null when no helipads exist', () => {
      expect(system.getHelipadPosition('us_helipad')).toBeNull();
    });
  });

  // ─── getAllHelipads ────────────────────────────────────────────────

  describe('getAllHelipads', () => {
    it('returns empty array when no helipads exist', () => {
      expect(system.getAllHelipads()).toEqual([]);
    });

    it('returns array of helipad info objects after creation', async () => {
      system.setTerrainManager(createMockTerrainManager(10) as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipads = system.getAllHelipads();
      expect(helipads).toHaveLength(1);
      expect(helipads[0].id).toBe('us_helipad');
      expect(helipads[0].faction).toBe('US');
      expect(helipads[0].position.x).toBe(40);
      expect(helipads[0].position.z).toBe(-1400);
    });

    it('returns helipad info with correct metadata', async () => {
      system.setTerrainManager(createMockTerrainManager(10) as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipads = system.getAllHelipads();
      expect(helipads[0].aircraft).toBe('UH1_HUEY');
    });
  });

  // ─── Vegetation Clearing ──────────────────────────────────────────

  describe('vegetation clearing', () => {
    it('calls clearArea when vegetation system supports it', async () => {
      const vs = createMockVegetationSystem({ clearArea: true, addExclusionZone: true });
      system.setTerrainManager(createMockTerrainManager() as any);
      system.setVegetationSystem(vs);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(vs.clearArea).toHaveBeenCalledWith(40, -1400, 13); // platformRadius(12) + 1
    });

    it('calls addExclusionZone as fallback when clearArea not available', async () => {
      const vs = createMockVegetationSystem({ clearArea: false, addExclusionZone: true });
      // Remove clearArea to test fallback
      delete (vs as any).clearArea;
      system.setTerrainManager(createMockTerrainManager() as any);
      system.setVegetationSystem(vs);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(vs.addExclusionZone).toHaveBeenCalledWith(40, -1400, 13);
    });

    it('handles vegetation system with neither method', async () => {
      const vs = {};
      system.setTerrainManager(createMockTerrainManager() as any);
      system.setVegetationSystem(vs);
      system.createHelipadWhenReady();
      await flushPromises();
      // Should not throw
      expect(scene.children.length).toBe(1);
    });

    it('handles missing vegetation system gracefully', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      // No vegetation system set - should not throw
      expect(scene.children.length).toBe(1);
    });
  });

  // ─── dispose ──────────────────────────────────────────────────────

  describe('dispose', () => {
    it('removes all helipads from scene', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      expect(scene.children.length).toBe(1);
      system.dispose();
      expect(scene.children.length).toBe(0);
    });

    it('traverses and disposes geometry/materials', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0] as THREE.Group;

      // Collect dispose mocks before dispose clears references
      const disposeFns: any[] = [];
      helipad.traverse((child: any) => {
        if (child.isMesh) {
          disposeFns.push(child.geometry.dispose);
          disposeFns.push(child.material.dispose);
        }
      });

      expect(disposeFns.length).toBeGreaterThan(0);
      system.dispose();

      disposeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('clears helipads map after dispose', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      system.dispose();
      expect(system.getAllHelipads()).toEqual([]);
      expect(system.getHelipadPosition('us_helipad')).toBeNull();
    });

    it('safe to call on empty system', () => {
      expect(() => system.dispose()).not.toThrow();
    });

    it('safe to call multiple times', async () => {
      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady();
      await flushPromises();
      system.dispose();
      expect(() => system.dispose()).not.toThrow();
    });

    it('logs disposal message', () => {
      system.dispose();
      expect(Logger.info).toHaveBeenCalledWith('helicopter', 'HelipadSystem disposed');
    });
  });

  // ─── GameSystem Interface ─────────────────────────────────────────

  describe('GameSystem interface compliance', () => {
    it('implements init() returning Promise<void>', async () => {
      const result = system.init();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('implements update(deltaTime)', () => {
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('implements dispose()', () => {
      expect(() => system.dispose()).not.toThrow();
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('can create helipad after failed attempt (terrain manager set later)', async () => {
      system.createHelipadWhenReady(); // Fails - no terrain manager
      expect(scene.children.length).toBe(0);

      system.setTerrainManager(createMockTerrainManager() as any);
      system.createHelipadWhenReady(); // Succeeds now
      await flushPromises();
      expect(scene.children.length).toBe(1);
    });

    it('handles varying terrain heights', async () => {
      const tm = createMockTerrainManager(0);
      let callCount = 0;
      tm.getHeightAt.mockImplementation(() => {
        callCount++;
        // Return a high value for one sample point
        return callCount === 5 ? 50 : 2;
      });
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      // Max height should be 50, position = 50 + 0.1
      expect(helipad.position.y).toBeCloseTo(50.1, 1);
    });

    it('helipad position x and z are fixed regardless of terrain', async () => {
      system.setTerrainManager(createMockTerrainManager(100) as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      expect(helipad.position.x).toBe(40);
      expect(helipad.position.z).toBe(-1400);
    });

    it('negative terrain height handled correctly', async () => {
      const tm = createMockTerrainManager(-5);
      system.setTerrainManager(tm as any);
      system.createHelipadWhenReady();
      await flushPromises();
      const helipad = scene.children[0];
      expect(helipad.position.y).toBeCloseTo(-4.9, 1); // -5 + 0.1
    });
  });
});
