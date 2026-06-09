// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  mockUpdateAtmosphereLighting,
  mockBakeHeightmapSurface,
  mockBakePreparedVisualHeightmap,
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
  mockUpdateAtmosphereLighting: vi.fn(),
  mockBakeHeightmapSurface: vi.fn().mockResolvedValue({
    heightData: new Float32Array(16),
    normalData: new Uint8Array(64),
    gridSize: 4,
    worldSize: 256,
  }),
  mockBakePreparedVisualHeightmap: vi.fn().mockResolvedValue({
    heightData: new Float32Array(16),
    normalData: new Uint8Array(64),
    gridSize: 4,
    worldSize: 256,
  }),
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
  updateTerrainMaterialAtmosphereLighting: mockUpdateAtmosphereLighting,
  updateTerrainMaterialFarCanopyTint: mockUpdateFarCanopyTint,
  updateTerrainMaterialTextures: vi.fn(),
  updateTerrainMaterialWetness: vi.fn(),
}));

vi.mock('./TerrainWorkerPool', () => ({
  TerrainWorkerPool: class {
    sendHeightProvider = vi.fn();
    bakeHeightmapSurface = mockBakeHeightmapSurface;
    bakePreparedVisualHeightmap = mockBakePreparedVisualHeightmap;
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
    mockUpdateAtmosphereLighting.mockClear();
    mockBakeHeightmapSurface.mockClear();
    mockBakePreparedVisualHeightmap.mockClear();
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

    it('forwards atmosphere lighting as a bounded cool terrain night fill', async () => {
      await terrain.init();

      terrain.setAtmosphereLighting({
        skyColor: new THREE.Color(0.01, 0.012, 0.02),
        groundColor: new THREE.Color(0.008, 0.01, 0.014),
        ambientColor: new THREE.Color(0.055, 0.07, 0.105),
        directLightDirection: new THREE.Vector3(1, 0.18, 0),
        daylightFactor: 0.8,
        nightBlend: 1,
        sunAboveHorizon: true,
      });

      expect(mockUpdateAtmosphereLighting).toHaveBeenCalled();
      const lighting = mockUpdateAtmosphereLighting.mock.calls.at(-1)?.[1];
      expect(lighting.nightFillStrength).toBeGreaterThan(0.3);
      expect(lighting.nightFillStrength).toBeLessThanOrEqual(0.38);
      expect(lighting.nightFillColor.b).toBeGreaterThan(lighting.nightFillColor.r);
      expect(lighting.directLightDirection.length()).toBeCloseTo(1);
      expect(lighting.daylightFactor).toBeCloseTo(0.8);
      expect(lighting.lowSunOcclusionStrength).toBeGreaterThan(0.45);
      expect(lighting.lowSunOcclusionStrength).toBeLessThan(0.85);
    });

    it('does not apply low-sun terrain occlusion for high sun or sub-horizon light', async () => {
      await terrain.init();

      terrain.setAtmosphereLighting({
        skyColor: new THREE.Color(0.4, 0.55, 0.75),
        groundColor: new THREE.Color(0.14, 0.16, 0.12),
        ambientColor: new THREE.Color(0.8, 0.82, 0.78),
        directLightDirection: new THREE.Vector3(0.2, 0.95, 0.1),
        daylightFactor: 1,
        nightBlend: 0,
        sunAboveHorizon: true,
      });
      let lighting = mockUpdateAtmosphereLighting.mock.calls.at(-1)?.[1];
      expect(lighting.lowSunOcclusionStrength).toBe(0);

      terrain.setAtmosphereLighting({
        skyColor: new THREE.Color(0.01, 0.012, 0.02),
        groundColor: new THREE.Color(0.008, 0.01, 0.014),
        ambientColor: new THREE.Color(0.055, 0.07, 0.105),
        directLightDirection: new THREE.Vector3(-0.18, 0.36, -0.92),
        daylightFactor: 0,
        nightBlend: 1,
        sunAboveHorizon: false,
      });
      lighting = mockUpdateAtmosphereLighting.mock.calls.at(-1)?.[1];
      expect(lighting.lowSunOcclusionStrength).toBe(0);
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

    it('rebakes from the provider when a visual margin needs source-backed terrain beyond the prepared map', async () => {
      await terrain.init();
      mockBakeFromProvider.mockClear();
      mockUploadPrebakedGrid.mockClear();

      terrain.setPreparedHeightmap({
        data: new Float32Array(16),
        gridSize: 4,
        workerConfig: { type: 'noise', seed: 12345 },
      });
      terrain.setWorldSize(3200);

      expect(mockBakeFromProvider).toHaveBeenCalled();
      expect(mockUploadPrebakedGrid).not.toHaveBeenCalled();
    });

    it('uses prepared heightmaps directly when there is no visual margin to extend', async () => {
      await terrain.init();
      terrain.setVisualMargin(0);
      mockBakeFromProvider.mockClear();
      mockUploadPrebakedGrid.mockClear();

      terrain.setPreparedHeightmap({
        data: new Float32Array(16),
        gridSize: 4,
        workerConfig: { type: 'noise', seed: 12345 },
      });
      terrain.setWorldSize(3200);

      expect(mockUploadPrebakedGrid).toHaveBeenCalled();
      expect(mockBakeFromProvider).not.toHaveBeenCalled();
    });

    it('batches mode surface configuration through the prepared visual worker path', async () => {
      await terrain.init();
      mockBakeFromProvider.mockClear();
      mockUploadPrebakedGrid.mockClear();

      await terrain.configureModeSurface({
        preparedHeightmap: {
          data: new Float32Array(16),
          gridSize: 4,
          workerConfig: { type: 'noise', seed: 12345 },
        },
        worldSize: 3200,
        visualMargin: 1200,
        chunkSize: 256,
        renderDistance: 4,
        defaultBiomeId: 'denseJungle',
      });

      expect(mockBakePreparedVisualHeightmap).toHaveBeenCalledOnce();
      expect(mockBakeHeightmapSurface).not.toHaveBeenCalled();
      expect(mockUploadPrebakedGrid).toHaveBeenCalled();
      expect(mockBakeFromProvider).not.toHaveBeenCalled();
      expect(terrain.getWorldSize()).toBe(3200);
      expect(terrain.getVisualWorldSize()).toBe(5600);
      expect(terrain.getChunkSize()).toBe(256);
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
