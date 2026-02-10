import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChunkLoadingStrategy } from './ChunkLoadingStrategy';
import * as THREE from 'three';

// Mock all dependencies
vi.mock('./ImprovedChunk', () => ({
  ImprovedChunk: vi.fn(),
}));
vi.mock('../../utils/NoiseGenerator');
vi.mock('../assets/AssetLoader');
vi.mock('../world/billboard/GlobalBillboardSystem');
vi.mock('../combat/LOSAccelerator');
vi.mock('./ChunkWorkerPool');
vi.mock('../../workers/BVHWorker');
vi.mock('../../utils/Logger');
vi.mock('./ChunkSpatialUtils', () => ({
  getChunkKey: (x: number, z: number) => `${x},${z}`,
  getChunkDistanceFromPlayer: vi.fn(() => 5),
}));

import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { ChunkWorkerPool } from './ChunkWorkerPool';
import { ViteBVHWorker } from '../../workers/BVHWorker';
import { getChunkDistanceFromPlayer } from './ChunkSpatialUtils';

describe('ChunkLoadingStrategy', () => {
  let strategy: ChunkLoadingStrategy;
  let mockScene: THREE.Scene;
  let mockAssetLoader: AssetLoader;
  let mockBillboardSystem: GlobalBillboardSystem;
  let mockNoiseGenerator: NoiseGenerator;
  let mockLOSAccelerator: LOSAccelerator;
  let mockWorkerPool: ChunkWorkerPool | null;
  let mockBVHWorker: ViteBVHWorker | null;
  let chunks: Map<string, ImprovedChunk>;
  let loadingChunks: Set<string>;
  let playerPosition: THREE.Vector3;
  let mockGetConfig: ReturnType<typeof vi.fn>;
  let mockUpdateMergedMeshes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    mockScene = new THREE.Scene();
    mockScene.add = vi.fn();
    mockAssetLoader = {} as AssetLoader;
    mockBillboardSystem = {} as GlobalBillboardSystem;
    mockNoiseGenerator = {} as NoiseGenerator;
    mockLOSAccelerator = {
      registerChunk: vi.fn(),
    } as any;
    mockWorkerPool = null;
    mockBVHWorker = null;
    chunks = new Map();
    loadingChunks = new Set();
    playerPosition = new THREE.Vector3(0, 0, 0);
    mockGetConfig = vi.fn(() => ({
      size: 100,
      loadDistance: 10,
      skipTerrainMesh: false,
    }));
    mockUpdateMergedMeshes = vi.fn();

    // Reset getChunkDistanceFromPlayer mock
    vi.mocked(getChunkDistanceFromPlayer).mockReturnValue(5);

    strategy = new ChunkLoadingStrategy({
      scene: mockScene,
      assetLoader: mockAssetLoader,
      globalBillboardSystem: mockBillboardSystem,
      noiseGenerator: mockNoiseGenerator,
      losAccelerator: mockLOSAccelerator,
      workerPool: mockWorkerPool,
      bvhWorker: mockBVHWorker,
      chunks,
      loadingChunks,
      playerPosition,
      getConfig: mockGetConfig,
      updateMergedMeshes: mockUpdateMergedMeshes,
    });
  });

  describe('constructor', () => {
    it('should store all dependencies', () => {
      expect(strategy).toBeDefined();
      expect(strategy['scene']).toBe(mockScene);
      expect(strategy['assetLoader']).toBe(mockAssetLoader);
      expect(strategy['globalBillboardSystem']).toBe(mockBillboardSystem);
      expect(strategy['noiseGenerator']).toBe(mockNoiseGenerator);
      expect(strategy['losAccelerator']).toBe(mockLOSAccelerator);
      expect(strategy['workerPool']).toBe(mockWorkerPool);
      expect(strategy['bvhWorker']).toBe(mockBVHWorker);
      expect(strategy['chunks']).toBe(chunks);
      expect(strategy['loadingChunks']).toBe(loadingChunks);
      expect(strategy['playerPosition']).toBe(playerPosition);
      expect(strategy['getConfig']).toBe(mockGetConfig);
      expect(strategy['updateMergedMeshes']).toBe(mockUpdateMergedMeshes);
    });
  });

  describe('loadChunkAsync', () => {
    it('should skip if chunk already exists in chunks Map', async () => {
      const mockChunk = {} as ImprovedChunk;
      chunks.set('5,10', mockChunk);

      await strategy.loadChunkAsync(5, 10);

      expect(loadingChunks.has('5,10')).toBe(false);
    });

    it('should skip if chunk already in loadingChunks Set', async () => {
      loadingChunks.add('5,10');

      await strategy.loadChunkAsync(5, 10);

      expect(chunks.has('5,10')).toBe(false);
    });

    it('should add chunkKey to loadingChunks Set', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(loadingChunks.has('5,10')).toBe(true);
    });

    it('should route to worker-based loading when workerPool is available', async () => {
      const mockGeometry = new THREE.BufferGeometry();
      mockGeometry.dispose = vi.fn();

      mockWorkerPool = {
        generateChunk: vi.fn(async () => ({
          geometry: mockGeometry,
          heightData: new Float32Array(100),
          vegetation: [],
        })),
      } as any;

      strategy = new ChunkLoadingStrategy({
        scene: mockScene,
        assetLoader: mockAssetLoader,
        globalBillboardSystem: mockBillboardSystem,
        noiseGenerator: mockNoiseGenerator,
        losAccelerator: mockLOSAccelerator,
        workerPool: mockWorkerPool,
        bvhWorker: mockBVHWorker,
        chunks,
        loadingChunks,
        playerPosition,
        getConfig: mockGetConfig,
        updateMergedMeshes: mockUpdateMergedMeshes,
      });

      const mockChunk = {
        generateFromWorker: vi.fn(async () => undefined),
        getTerrainMesh: vi.fn(() => new THREE.Mesh()),
      };

      vi.mocked(ImprovedChunk).mockImplementation(function(this: any) {
        return mockChunk;
      } as any);

      await strategy.loadChunkAsync(5, 10);

      expect(mockWorkerPool.generateChunk).toHaveBeenCalledWith(5, 10, 100, 5);
    });

    it('should fall back to main-thread loading when workerPool is null', async () => {
      const mockChunk = {
        generate: vi.fn(async () => undefined),
        getTerrainMesh: vi.fn(() => new THREE.Mesh()),
        dispose: vi.fn(),
      };

      vi.mocked(ImprovedChunk).mockImplementation(function(this: any) {
        return mockChunk;
      } as any);

      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout and async operations
      await vi.waitFor(() => {
        expect(mockChunk.generate).toHaveBeenCalled();
      }, { timeout: 100 });
    });
  });

  describe('worker-based loading path', () => {
    let mockGeometry: THREE.BufferGeometry;
    let mockChunk: any;

    beforeEach(() => {
      mockGeometry = new THREE.BufferGeometry();
      mockGeometry.dispose = vi.fn();

      mockChunk = {
        generateFromWorker: vi.fn(async () => undefined),
        getTerrainMesh: vi.fn(() => new THREE.Mesh()),
      };

      vi.mocked(ImprovedChunk).mockImplementation(function(this: any) {
        return mockChunk;
      } as any);

      mockWorkerPool = {
        generateChunk: vi.fn(async () => ({
          geometry: mockGeometry,
          heightData: new Float32Array(100),
          vegetation: [],
        })),
      } as any;

      strategy = new ChunkLoadingStrategy({
        scene: mockScene,
        assetLoader: mockAssetLoader,
        globalBillboardSystem: mockBillboardSystem,
        noiseGenerator: mockNoiseGenerator,
        losAccelerator: mockLOSAccelerator,
        workerPool: mockWorkerPool,
        bvhWorker: mockBVHWorker,
        chunks,
        loadingChunks,
        playerPosition,
        getConfig: mockGetConfig,
        updateMergedMeshes: mockUpdateMergedMeshes,
      });
    });

    it('should call workerPool.generateChunk with correct params', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(mockWorkerPool!.generateChunk).toHaveBeenCalledWith(5, 10, 100, 5);
    });

    it('should create ImprovedChunk from worker results', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(ImprovedChunk).toHaveBeenCalledWith(
        mockScene,
        mockAssetLoader,
        5,
        10,
        100,
        mockNoiseGenerator,
        mockBillboardSystem,
        false
      );
    });

    it('should add chunk to scene and chunks Map', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(chunks.has('5,10')).toBe(true);
      expect(chunks.get('5,10')).toBe(mockChunk);
    });

    it('should remove from loadingChunks Set', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(loadingChunks.has('5,10')).toBe(false);
    });

    it('should call updateMergedMeshes callback', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(mockUpdateMergedMeshes).toHaveBeenCalled();
    });

    it('should register chunk with LOSAccelerator', async () => {
      await strategy.loadChunkAsync(5, 10);

      expect(mockLOSAccelerator.registerChunk).toHaveBeenCalledWith(
        '5,10',
        expect.any(THREE.Mesh)
      );
    });

    it('should skip LOSAccelerator registration when skipTerrainMesh is true', async () => {
      mockGetConfig.mockReturnValue({
        size: 100,
        loadDistance: 10,
        skipTerrainMesh: true,
      });

      await strategy.loadChunkAsync(5, 10);

      expect(mockLOSAccelerator.registerChunk).not.toHaveBeenCalled();
    });

    it('should dispose geometry if chunk no longer needed', async () => {
      vi.mocked(getChunkDistanceFromPlayer).mockReturnValue(15);

      await strategy.loadChunkAsync(5, 10);

      expect(mockGeometry.dispose).toHaveBeenCalled();
      expect(chunks.has('5,10')).toBe(false);
    });

    it('should compute BVH in worker when bvhWorker is available', async () => {
      const mockBVH = {};
      mockBVHWorker = {
        generate: vi.fn(async () => mockBVH),
      } as any;

      strategy = new ChunkLoadingStrategy({
        scene: mockScene,
        assetLoader: mockAssetLoader,
        globalBillboardSystem: mockBillboardSystem,
        noiseGenerator: mockNoiseGenerator,
        losAccelerator: mockLOSAccelerator,
        workerPool: mockWorkerPool,
        bvhWorker: mockBVHWorker,
        chunks,
        loadingChunks,
        playerPosition,
        getConfig: mockGetConfig,
        updateMergedMeshes: mockUpdateMergedMeshes,
      });

      await strategy.loadChunkAsync(5, 10);

      expect(mockBVHWorker.generate).toHaveBeenCalledWith(mockGeometry, {});
      expect((mockGeometry as any).boundsTree).toBe(mockBVH);
    });

    it('should handle BVH worker failure gracefully', async () => {
      mockBVHWorker = {
        generate: vi.fn(async () => {
          throw new Error('BVH failed');
        }),
      } as any;

      strategy = new ChunkLoadingStrategy({
        scene: mockScene,
        assetLoader: mockAssetLoader,
        globalBillboardSystem: mockBillboardSystem,
        noiseGenerator: mockNoiseGenerator,
        losAccelerator: mockLOSAccelerator,
        workerPool: mockWorkerPool,
        bvhWorker: mockBVHWorker,
        chunks,
        loadingChunks,
        playerPosition,
        getConfig: mockGetConfig,
        updateMergedMeshes: mockUpdateMergedMeshes,
      });

      await strategy.loadChunkAsync(5, 10);

      expect(chunks.has('5,10')).toBe(true);
    });

    it('should fall back to main thread on worker error', async () => {
      mockWorkerPool!.generateChunk = vi.fn(async () => {
        throw new Error('Worker failed');
      });

      const mockMainThreadChunk = {
        generate: vi.fn(async () => undefined),
        getTerrainMesh: vi.fn(() => new THREE.Mesh()),
        dispose: vi.fn(),
      };

      vi.mocked(ImprovedChunk).mockImplementation(function(this: any) {
        return mockMainThreadChunk;
      } as any);

      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout fallback to execute and async operations to complete
      await vi.waitFor(() => {
        expect(mockMainThreadChunk.generate).toHaveBeenCalled();
      }, { timeout: 100 });
    });
  });

  describe('main-thread loading path', () => {
    let mockChunk: any;

    beforeEach(() => {
      mockChunk = {
        generate: vi.fn(async () => undefined),
        getTerrainMesh: vi.fn(() => new THREE.Mesh()),
        dispose: vi.fn(),
      };

      vi.mocked(ImprovedChunk).mockImplementation(function(this: any) {
        return mockChunk;
      } as any);
    });

    it('should create ImprovedChunk directly', async () => {
      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(ImprovedChunk).toHaveBeenCalledWith(
          mockScene,
          mockAssetLoader,
          5,
          10,
          100,
          mockNoiseGenerator,
          mockBillboardSystem,
          false
        );
      }, { timeout: 100 });
    });

    it('should generate terrain on main thread', async () => {
      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(mockChunk.generate).toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should add to scene and chunks Map', async () => {
      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(chunks.has('5,10')).toBe(true);
      }, { timeout: 100 });
    });

    it('should dispose chunk if no longer needed', async () => {
      vi.mocked(getChunkDistanceFromPlayer).mockReturnValue(15);

      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(mockChunk.dispose).toHaveBeenCalled();
      }, { timeout: 100 });

      expect(chunks.has('5,10')).toBe(false);
    });

    it('should handle chunk creation failure', async () => {
      mockChunk.generate = vi.fn(async () => {
        throw new Error('Generation failed');
      });

      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(loadingChunks.has('5,10')).toBe(false);
      }, { timeout: 100 });

      expect(chunks.has('5,10')).toBe(false);
    });

    it('should remove from loadingChunks Set after completion', async () => {
      await strategy.loadChunkAsync(5, 10);

      // Wait for setTimeout to execute and async operations to complete
      await vi.waitFor(() => {
        expect(loadingChunks.has('5,10')).toBe(false);
      }, { timeout: 100 });
    });
  });
});
