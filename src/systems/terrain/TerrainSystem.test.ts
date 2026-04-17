import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock subsystem modules
const {
  mockProviderGetHeightAt,
  mockCacheGetHeightAt,
  mockSampleHeight,
  mockBakeFromProvider,
  mockUploadPrebakedGrid,
  mockVegetationConfigure,
  mockVegetationSetWorldBounds,
  mockVegetationRegenerateAll,
  mockVegetationSetExclusionZones,
  mockVegetationUpdateBudgeted,
  mockVegetationPendingCounts,
  mockVegetationReadyAround,
} = vi.hoisted(() => ({
  mockProviderGetHeightAt: vi.fn().mockReturnValue(10),
  mockCacheGetHeightAt: vi.fn().mockReturnValue(10),
  mockSampleHeight: vi.fn().mockReturnValue(999),
  mockBakeFromProvider: vi.fn(),
  mockUploadPrebakedGrid: vi.fn(),
  mockVegetationConfigure: vi.fn(),
  mockVegetationSetWorldBounds: vi.fn(),
  mockVegetationRegenerateAll: vi.fn(),
  mockVegetationSetExclusionZones: vi.fn(),
  mockVegetationUpdateBudgeted: vi.fn().mockReturnValue(false),
  mockVegetationPendingCounts: vi.fn().mockReturnValue({ adds: 0, removals: 0 }),
  mockVegetationReadyAround: vi.fn().mockReturnValue(true),
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
    uploadPrebakedGrid = mockUploadPrebakedGrid;
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
    setExclusionZones = mockVegetationSetExclusionZones;
    update = vi.fn();
    updateBudgeted = mockVegetationUpdateBudgeted;
    getPendingCounts = mockVegetationPendingCounts;
    isReadyAround = mockVegetationReadyAround;
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
    getStats = vi.fn().mockReturnValue({ queryCount: 0, cachedChunks: 0 });
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
    setExclusionZones: vi.fn(),
    setTerrainHeightmap: vi.fn(),
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
    mockUploadPrebakedGrid.mockClear();
    mockVegetationConfigure.mockClear();
    mockVegetationSetWorldBounds.mockClear();
    mockVegetationRegenerateAll.mockClear();
    mockVegetationSetExclusionZones.mockClear();
    mockVegetationUpdateBudgeted.mockClear();
    mockVegetationPendingCounts.mockClear();
    mockVegetationReadyAround.mockClear();
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
    it('initializes terrain mesh into the scene', async () => {
      await terrain.init();
      expect(scene.add).toHaveBeenCalled();
      expect(mockVegetationConfigure).toHaveBeenCalled();
    });

    it('dispose removes terrain from scene', async () => {
      await terrain.init();
      terrain.dispose();
      expect(scene.remove).toHaveBeenCalled();
    });
  });

  describe('runtime API', () => {
    it('getHeightAt returns the cache-backed gameplay height, not the baked GPU sample', async () => {
      await terrain.init();
      expect(terrain.getHeightAt(5, 6)).toBe(10);
      expect(mockCacheGetHeightAt).toHaveBeenCalledWith(5, 6);
      expect(mockSampleHeight).not.toHaveBeenCalled();
    });

    it('isTerrainReady returns true after init', async () => {
      await terrain.init();
      expect(terrain.isTerrainReady()).toBe(true);
    });

    it('hasTerrainAt reports coverage inside configured world bounds and rejects outside', async () => {
      await terrain.init();
      expect(terrain.hasTerrainAt(0, 0)).toBe(true);

      terrain.setWorldSize(100);
      expect(terrain.hasTerrainAt(60, 0)).toBe(false);
    });

    it('exposes configured chunk size and allows reconfiguration', async () => {
      await terrain.init();
      expect(terrain.getChunkSize()).toBe(64);
      terrain.setChunkSize(128);
      expect(terrain.getChunkSize()).toBe(128);
    });

    it('explicit setWorldSize is stable across chunk config changes', async () => {
      await terrain.init();
      terrain.setWorldSize(21136);
      expect(terrain.getWorldSize()).toBe(21136);

      terrain.setChunkSize(256);
      terrain.setRenderDistance(3);

      expect(terrain.getWorldSize()).toBe(21136);
    });

    it('visual margin expands the rendered extent without changing playable bounds', async () => {
      await terrain.init();
      terrain.setWorldSize(500);
      terrain.setVisualMargin(320);

      expect(terrain.getPlayableWorldSize()).toBe(500);
      expect(terrain.getVisualWorldSize()).toBeGreaterThan(terrain.getPlayableWorldSize());
      expect(mockVegetationSetWorldBounds).toHaveBeenLastCalledWith(500, 320);
    });

    it('prepared heightmap uploads replace the need to rebake from the provider', async () => {
      await terrain.init();

      terrain.setPreparedHeightmap({
        data: new Float32Array(16),
        gridSize: 4,
        workerConfig: { type: 'noise', seed: 12345 },
      });
      terrain.setWorldSize(3200);

      expect(mockUploadPrebakedGrid).toHaveBeenCalled();
    });

    it('setBiomeConfig regenerates vegetation after init', async () => {
      await terrain.init();
      terrain.setBiomeConfig('highland', []);
      expect(mockVegetationRegenerateAll).toHaveBeenCalled();
    });

    it('setBiomeConfig configures billboard system with every participating biome', () => {
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

    it('collision object register/unregister round-trips without error', () => {
      const obj = new THREE.Object3D();
      terrain.registerCollisionObject('test', obj);
      terrain.unregisterCollisionObject('test');
    });

    it('raycastTerrain produces a hit-shaped result', async () => {
      await terrain.init();
      const result = terrain.raycastTerrain(
        new THREE.Vector3(0, 50, 0),
        new THREE.Vector3(0, -1, 0),
        100,
      );
      expect(result).toBeDefined();
      expect(typeof result.hit).toBe('boolean');
    });

  });
});
