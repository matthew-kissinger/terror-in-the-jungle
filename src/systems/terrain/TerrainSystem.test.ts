import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock subsystem modules
const {
  mockProviderGetHeightAt,
  mockCacheGetHeightAt,
  mockSampleHeight,
  mockBakeFromProvider,
  mockVegetationConfigure,
  mockVegetationSetWorldBounds,
  mockVegetationRegenerateAll,
} = vi.hoisted(() => ({
  mockProviderGetHeightAt: vi.fn().mockReturnValue(10),
  mockCacheGetHeightAt: vi.fn().mockReturnValue(10),
  mockSampleHeight: vi.fn().mockReturnValue(999),
  mockBakeFromProvider: vi.fn(),
  mockVegetationConfigure: vi.fn(),
  mockVegetationSetWorldBounds: vi.fn(),
  mockVegetationRegenerateAll: vi.fn(),
}));

vi.mock('./HeightQueryCache', () => {
  const provider = {
    getHeightAt: mockProviderGetHeightAt,
    getWorkerConfig: () => ({ type: 'noise', seed: 12345 }),
  };
  const cache = {
    getHeightAt: mockCacheGetHeightAt,
    getProvider: vi.fn().mockReturnValue(provider),
    setProvider: vi.fn(),
    clearCache: vi.fn(),
  };
  return {
    getHeightQueryCache: () => cache,
    resetHeightQueryCache: () => cache,
    HeightQueryCache: class {},
  };
});

vi.mock('./HeightmapGPU', () => ({
  HeightmapGPU: class {
    bakeFromProvider = mockBakeFromProvider;
    uploadDEM = vi.fn();
    sampleHeight = mockSampleHeight;
    getHeightTexture = vi.fn().mockReturnValue({ needsUpdate: false });
    getNormalTexture = vi.fn().mockReturnValue({ needsUpdate: false });
    getHeightData = vi.fn().mockReturnValue(new Float32Array(16));
    getGridSize = vi.fn().mockReturnValue(4);
    getWorldSize = vi.fn().mockReturnValue(256);
    dispose = vi.fn();
  },
}));

vi.mock('./CDLODQuadtree', () => ({
  CDLODQuadtree: class {
    selectTiles = vi.fn().mockReturnValue([]);
    getSelectedTileCount = vi.fn().mockReturnValue(0);
  },
}));

vi.mock('./CDLODRenderer', () => ({
  CDLODRenderer: class {
    getMesh = vi.fn().mockReturnValue({ visible: true });
    updateInstances = vi.fn();
    setMaterial = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('./TerrainMaterial', () => ({
  createTerrainMaterial: vi.fn().mockReturnValue({
    onBeforeCompile: null,
    needsUpdate: false,
    dispose: vi.fn(),
  }),
  updateTerrainMaterialTextures: vi.fn(),
  updateTerrainMaterialWetness: vi.fn(),
}));

vi.mock('./TerrainWorkerPool', () => ({
  TerrainWorkerPool: class {
    sendHeightProvider = vi.fn();
    getStats = vi.fn().mockReturnValue({ enabled: true, queueLength: 0, busyWorkers: 0, totalWorkers: 2 });
    getTelemetry = vi.fn().mockReturnValue({ enabled: true, chunksGenerated: 0, avgGenerationTimeMs: 0, workersReady: 2, duplicatesAvoided: 0, queueLength: 0, busyWorkers: 0, inFlightChunks: 0 });
    dispose = vi.fn();
  },
}));

vi.mock('./VegetationScatterer', () => ({
  VegetationScatterer: class {
    configure = mockVegetationConfigure;
    setWorldSize = vi.fn();
    setWorldBounds = mockVegetationSetWorldBounds;
    update = vi.fn();
    clear = vi.fn();
    regenerateAll = mockVegetationRegenerateAll;
    getActiveCellCount = vi.fn().mockReturnValue(0);
    dispose = vi.fn();
  },
}));

vi.mock('../combat/LOSAccelerator', () => ({
  LOSAccelerator: class {
    registerChunk = vi.fn();
    unregisterChunk = vi.fn();
    checkLineOfSight = vi.fn().mockReturnValue({ clear: true });
    clear = vi.fn();
    getStats = vi.fn().mockReturnValue({ queryCount: 0, avgQueryTime: 0, cachedChunks: 0 });
  },
}));

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { TerrainSystem } from './TerrainSystem';

function makeMockScene(): THREE.Scene {
  return { add: vi.fn(), remove: vi.fn() } as any;
}

function makeMockCamera(): THREE.PerspectiveCamera {
  return {
    position: new THREE.Vector3(0, 50, 0),
    projectionMatrix: new THREE.Matrix4(),
    matrixWorldInverse: new THREE.Matrix4(),
  } as any;
}

function makeMockAssetLoader(): any {
  return {
    getTexture: vi.fn().mockReturnValue({ needsUpdate: false }),
  };
}

function makeMockBillboard(): any {
  return {
    addChunkInstances: vi.fn(),
    removeChunkInstances: vi.fn(),
    configure: vi.fn(),
    getActiveVegetationTypes: vi.fn().mockReturnValue([
      { id: 'fern' },
    ]),
    getActiveBiomes: vi.fn().mockReturnValue([
      {
        id: 'denseJungle',
        vegetationPalette: [{ typeId: 'fern', densityMultiplier: 1 }],
      },
      {
        id: 'highland',
        vegetationPalette: [{ typeId: 'fern', densityMultiplier: 0.25 }],
      },
    ]),
    getActiveBiome: vi.fn().mockReturnValue({
      id: 'denseJungle',
      vegetationPalette: [{ typeId: 'fern', densityMultiplier: 1 }],
    }),
  };
}

describe('TerrainSystem', () => {
  let terrain: TerrainSystem;
  let scene: THREE.Scene;

  beforeEach(() => {
    mockProviderGetHeightAt.mockClear();
    mockCacheGetHeightAt.mockClear();
    mockSampleHeight.mockClear();
    mockBakeFromProvider.mockClear();
    mockVegetationConfigure.mockClear();
    mockVegetationSetWorldBounds.mockClear();
    mockVegetationRegenerateAll.mockClear();
    scene = makeMockScene();
    terrain = new TerrainSystem(
      scene,
      makeMockCamera(),
      makeMockAssetLoader(),
      makeMockBillboard(),
      { size: 64, renderDistance: 6, loadDistance: 7, lodLevels: 4 },
    );
  });

  describe('GameSystem lifecycle', () => {
    it('initializes without error', async () => {
      await terrain.init();
      // Should add mesh to scene
      expect(scene.add).toHaveBeenCalled();
      expect(mockVegetationConfigure).toHaveBeenCalled();
    });

    it('update runs without error after init', async () => {
      await terrain.init();
      terrain.update(0.016);
    });

    it('dispose cleans up', async () => {
      await terrain.init();
      terrain.dispose();
      expect(scene.remove).toHaveBeenCalled();
    });
  });

  describe('runtime API', () => {
    it('getHeightAt returns a number', async () => {
      await terrain.init();
      expect(typeof terrain.getHeightAt(0, 0)).toBe('number');
    });

    it('getHeightAt uses gameplay query path instead of GPU-baked sampling', async () => {
      await terrain.init();
      expect(terrain.getHeightAt(5, 6)).toBe(10);
      expect(mockCacheGetHeightAt).toHaveBeenCalledWith(5, 6);
      expect(mockSampleHeight).not.toHaveBeenCalled();
    });

    it('isTerrainReady returns true after init', async () => {
      await terrain.init();
      expect(terrain.isTerrainReady()).toBe(true);
    });

    it('hasTerrainAt reports in-bounds coverage after init', async () => {
      await terrain.init();
      expect(terrain.hasTerrainAt(0, 0)).toBe(true);
    });

    it('getChunkSize returns configured size', () => {
      expect(terrain.getChunkSize()).toBe(64);
    });

    it('getWorkerPool returns pool', () => {
      expect(terrain.getWorkerPool()).not.toBeNull();
    });

    it('getWorkerStats returns stats', () => {
      const stats = terrain.getWorkerStats();
      expect(stats).not.toBeNull();
      expect(stats!.enabled).toBe(true);
    });

    it('getWorkerTelemetry returns telemetry', () => {
      const telemetry = terrain.getWorkerTelemetry();
      expect(telemetry).not.toBeNull();
      expect(telemetry!.enabled).toBe(true);
    });

    it('setChunkSize reconfigures world', async () => {
      await terrain.init();
      terrain.setChunkSize(128);
      expect(terrain.getChunkSize()).toBe(128);
    });

    it('setRenderDistance reconfigures world', async () => {
      await terrain.init();
      terrain.setRenderDistance(4);
      // Should not throw
    });

    it('defaults world size from startup terrain config until explicitly overridden', () => {
      expect(terrain.getWorldSize()).toBe(64 * 6 * 2);
    });

    it('setWorldSize makes map extent explicit and stable across chunk config changes', async () => {
      await terrain.init();
      terrain.setWorldSize(21136);
      expect(terrain.getWorldSize()).toBe(21136);

      terrain.setChunkSize(256);
      terrain.setRenderDistance(3);

      expect(terrain.getWorldSize()).toBe(21136);
    });

    it('setVisualMargin updates shared visual overflow bounds without changing playable size', async () => {
      await terrain.init();

      terrain.setWorldSize(500);
      terrain.setVisualMargin(320);

      expect(terrain.getWorldSize()).toBe(500);
      expect(terrain.getPlayableWorldSize()).toBe(500);
      expect(terrain.getVisualMargin()).toBe(320);
      expect(terrain.getVisualWorldSize()).toBe(1140);
      expect(mockVegetationSetWorldBounds).toHaveBeenLastCalledWith(500, 320);
    });

    it('uses a reduced render-surface bake grid for very large worlds', async () => {
      await terrain.init();
      terrain.setWorldSize(21136);

      expect(mockBakeFromProvider).toHaveBeenLastCalledWith(
        expect.anything(),
        512,
        21136,
      );
    });

    it('hasTerrainAt returns false outside explicit world bounds', async () => {
      await terrain.init();
      terrain.setWorldSize(100);
      expect(terrain.hasTerrainAt(60, 0)).toBe(false);
    });

    it('setBiomeConfig updates config', () => {
      terrain.setBiomeConfig('highland', []);
      expect(mockVegetationConfigure).toHaveBeenCalled();
    });

    it('setBiomeConfig configures billboard system with all participating biomes', () => {
      const billboard = makeMockBillboard();
      terrain = new TerrainSystem(
        scene,
        makeMockCamera(),
        makeMockAssetLoader(),
        billboard,
        { size: 64, renderDistance: 6, loadDistance: 7, lodLevels: 4 },
      );

      terrain.setBiomeConfig('denseJungle', [
        { biomeId: 'highland', elevationMin: 100, priority: 5 },
      ]);

      expect(billboard.configure).toHaveBeenCalledWith(['denseJungle', 'highland']);
    });

    it('setBiomeConfig regenerates vegetation after init', async () => {
      await terrain.init();
      terrain.setBiomeConfig('highland', []);
      expect(mockVegetationRegenerateAll).toHaveBeenCalled();
    });

    it('registerCollisionObject and unregisterCollisionObject work', () => {
      const obj = new THREE.Object3D();
      terrain.registerCollisionObject('test', obj);
      terrain.unregisterCollisionObject('test');
    });

    it('raycastTerrain delegates correctly', async () => {
      await terrain.init();
      const result = terrain.raycastTerrain(
        new THREE.Vector3(0, 50, 0),
        new THREE.Vector3(0, -1, 0),
        100,
      );
      expect(result).toBeDefined();
      expect(typeof result.hit).toBe('boolean');
    });

    it('getLOSAccelerator returns accelerator', () => {
      expect(terrain.getLOSAccelerator()).toBeDefined();
    });

    it('updatePlayerPosition tracks position', () => {
      terrain.updatePlayerPosition(new THREE.Vector3(100, 0, 200));
      // Should not throw
    });
  });
});
