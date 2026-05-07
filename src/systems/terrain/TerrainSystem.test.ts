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
  mockVegetationDebugInfo,
  mockVegetationReadyAround,
  mockUpdateFarCanopyTint,
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
  mockVegetationDebugInfo: vi.fn().mockReturnValue({
    cellSize: 128,
    maxCellDistance: 6,
    activeCells: 0,
    targetCells: 0,
    pendingAdditions: 0,
    pendingRemovals: 0,
    lastPlayerCell: null,
    lastUpdate: {
      requestedAddBudget: 0,
      resolvedAddBudget: 0,
      maxRemovalsPerFrame: 0,
      addedCells: 0,
      removedCells: 0,
      generatedInstances: 0,
      emptyCells: 0,
      lastGeneratedCell: null,
    },
  }),
  mockVegetationReadyAround: vi.fn().mockReturnValue(true),
  mockUpdateFarCanopyTint: vi.fn(),
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
  updateTerrainMaterialFarCanopyTint: mockUpdateFarCanopyTint,
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
    getDebugInfo = mockVegetationDebugInfo;
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
    mockUpdateFarCanopyTint.mockClear();
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

    it('stores a preloaded hydrology bake without changing terrain or vegetation state', () => {
      terrain.setHydrologyBake({
        manifest: {
          schemaVersion: 1,
          generator: 'test',
          entries: [],
        },
        entry: {
          modeId: 'open_frontier',
          source: 'procedural-noise',
          seed: 42,
          signature: 'hydrology-test-frontier-42',
          hydrologyAsset: '/data/hydrology/open_frontier-42-hydrology.json',
          worldSize: 3200,
          sampleGridSize: 2,
          sampleWorldInsetPercent: 4,
          sampleSpacingMeters: 12,
          depressionHandling: 'epsilon-fill',
          wetCandidateAccumulationQuantile: 0.92,
          channelCandidateAccumulationQuantile: 0.98,
          wetCandidateSlopeMaxDegrees: 16,
          wetCandidateElevationMaxMeters: 35,
          currentHydrologyBiomeIds: ['riverbank'],
        },
        artifact: {
          schemaVersion: 1,
          width: 2,
          height: 2,
          cellSizeMeters: 12,
          depressionHandling: 'epsilon-fill',
          transform: {
            originX: -12,
            originZ: -12,
            cellSizeMeters: 12,
          },
          thresholds: {
            accumulationP90Cells: 1,
            accumulationP95Cells: 2,
            accumulationP98Cells: 3,
            accumulationP99Cells: 4,
          },
          masks: {
            wetCandidateCells: [2, 3],
            channelCandidateCells: [3],
          },
          channelPolylines: [],
        },
      });

      expect(terrain.getHydrologyBakeDebugInfo()).toEqual({
        loaded: true,
        modeId: 'open_frontier',
        signature: 'hydrology-test-frontier-42',
        wetCandidateCells: 2,
        channelCandidateCells: 1,
        channelPolylines: 0,
        biomePolicyEnabled: false,
        materialMaskEnabled: false,
        wetBiomeId: null,
        channelBiomeId: null,
      });
      expect(mockVegetationRegenerateAll).not.toHaveBeenCalled();

      terrain.setHydrologyBake(null);
      expect(terrain.getHydrologyBakeDebugInfo().loaded).toBe(false);
    });

    it('adds hydrology target biomes to vegetation configuration only when the policy is enabled', () => {
      terrain.setHydrologyBiomePolicy({
        wetBiomeId: 'swamp',
        channelBiomeId: 'riverbank',
        maxSlopeDeg: 16,
      });

      expect(mockVegetationConfigure).toHaveBeenLastCalledWith(
        expect.anything(),
        'denseJungle',
        expect.any(Map),
        [],
        null,
      );
      const configuredPaletteMap = mockVegetationConfigure.mock.calls.at(-1)?.[2] as Map<string, unknown>;
      expect([...configuredPaletteMap.keys()]).toEqual(['denseJungle', 'swamp', 'riverbank']);
      expect(terrain.getHydrologyBakeDebugInfo()).toEqual(expect.objectContaining({
        biomePolicyEnabled: true,
        wetBiomeId: 'swamp',
        channelBiomeId: 'riverbank',
      }));
    });

    it('creates a feathered hydrology material mask for terrain blending', () => {
      terrain.setHydrologyBiomePolicy({
        wetBiomeId: 'swamp',
        channelBiomeId: 'riverbank',
        maxSlopeDeg: 16,
      });
      terrain.setHydrologyBake({
        manifest: {
          schemaVersion: 1,
          generator: 'test',
          entries: [],
        },
        entry: {
          modeId: 'a_shau_valley',
          source: 'dem',
          seed: null,
          signature: 'hydrology-test-ashau',
          hydrologyAsset: '/data/hydrology/a_shau_valley-hydrology.json',
          worldSize: 21136,
          sampleGridSize: 3,
          sampleWorldInsetPercent: 4,
          sampleSpacingMeters: 79.26,
          depressionHandling: 'epsilon-fill',
          wetCandidateAccumulationQuantile: 0.92,
          channelCandidateAccumulationQuantile: 0.98,
          wetCandidateSlopeMaxDegrees: 16,
          wetCandidateElevationMaxMeters: 980,
          currentHydrologyBiomeIds: ['swamp', 'riverbank'],
        },
        artifact: {
          schemaVersion: 1,
          width: 3,
          height: 3,
          cellSizeMeters: 79.26,
          depressionHandling: 'epsilon-fill',
          transform: {
            originX: -79.26,
            originZ: -79.26,
            cellSizeMeters: 79.26,
          },
          thresholds: {
            accumulationP90Cells: 1,
            accumulationP95Cells: 2,
            accumulationP98Cells: 3,
            accumulationP99Cells: 4,
          },
          masks: {
            wetCandidateCells: [4],
            channelCandidateCells: [4],
          },
          channelPolylines: [],
        },
      });

      const surfaceRuntime = (terrain as unknown as {
        surfaceRuntime: {
          hydrologyMaskTexture: THREE.DataTexture | null;
          hydrologyMaskMaterial: { wetStrength?: number; channelStrength?: number } | null;
        };
      }).surfaceRuntime;
      const texture = surfaceRuntime.hydrologyMaskTexture;
      const data = texture?.image.data as Uint8Array | undefined;
      const centerOffset = 4 * 4;
      const adjacentOffset = 1 * 4;

      expect(texture?.magFilter).toBe(THREE.LinearFilter);
      expect(texture?.minFilter).toBe(THREE.LinearFilter);
      expect(data?.[centerOffset]).toBe(255);
      expect(data?.[adjacentOffset]).toBeGreaterThan(0);
      expect(data?.[adjacentOffset]).toBeLessThan(255);
      expect(surfaceRuntime.hydrologyMaskMaterial?.wetStrength).toBeCloseTo(0.08);
      expect(surfaceRuntime.hydrologyMaskMaterial?.channelStrength).toBeCloseTo(0.14);
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

    it('forwards far-canopy tint policy to the terrain material runtime', async () => {
      await terrain.init();

      terrain.setFarCanopyTint({
        enabled: true,
        startDistance: 560,
        endDistance: 1250,
        strength: 0.28,
      });

      expect(mockUpdateFarCanopyTint).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          enabled: true,
          startDistance: 560,
          endDistance: 1250,
        }),
      );
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
