import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ImprovedChunkManager, ChunkConfig } from './ImprovedChunkManager';
import { ImprovedChunk } from './ImprovedChunk';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn()
  }
}));

// Create module-level mock instances that will be accessed by mocked constructors
let mockPriorityManager: any;
let mockLifecycleManager: any;
let mockTerrainQueries: any;
let mockLoadQueueManager: any;

// Mock all dependencies
vi.mock('../../utils/NoiseGenerator');
vi.mock('../combat/LOSAccelerator');
vi.mock('../../workers/BVHWorker');

// Mock ChunkWorkerPool with methods
vi.mock('./ChunkWorkerPool', () => ({
  ChunkWorkerPool: vi.fn().mockImplementation(() => ({
    generateChunk: vi.fn().mockResolvedValue({
      vertices: new Float32Array([0, 1, 0]),
      normals: new Float32Array([0, 1, 0]),
      uvs: new Float32Array([0, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }),
    getStats: vi.fn(() => ({
      queueLength: 0,
      busyWorkers: 0,
      totalWorkers: 4,
    })),
    getTelemetry: vi.fn(() => ({
      chunksGenerated: 0,
      avgGenerationTimeMs: 0,
      workersReady: 4,
      duplicatesAvoided: 0,
      queueLength: 0,
      busyWorkers: 0,
      inFlightChunks: 0,
    })),
    dispose: vi.fn(),
  }))
}));

// Mock sub-managers with factory functions that return our mocks
vi.mock('./ChunkPriorityManager', () => ({
  ChunkPriorityManager: vi.fn(function(this: any) {
    return mockPriorityManager;
  })
}));

vi.mock('./ChunkLifecycleManager', () => ({
  ChunkLifecycleManager: vi.fn(function(this: any) {
    return mockLifecycleManager;
  })
}));

vi.mock('./ChunkTerrainQueries', () => ({
  ChunkTerrainQueries: vi.fn(function(this: any) {
    return mockTerrainQueries;
  })
}));

vi.mock('./ChunkLoadQueueManager', () => ({
  ChunkLoadQueueManager: vi.fn(function(this: any) {
    return mockLoadQueueManager;
  })
}));

// Helper to create mock scene
function createMockScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add = vi.fn();
  scene.remove = vi.fn();
  return scene;
}

// Helper to create mock camera
function createMockCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
}

// Helper to create mock asset loader
function createMockAssetLoader(): AssetLoader {
  return {
    getTexture: vi.fn(() => new THREE.Texture()),
    loadTexture: vi.fn().mockResolvedValue(new THREE.Texture()),
  } as unknown as AssetLoader;
}

// Helper to create mock billboard system
function createMockBillboardSystem(): GlobalBillboardSystem {
  return {
    reserveBillboardsForChunk: vi.fn(),
    activateBillboardsForChunk: vi.fn(),
    releaseBillboardsForChunk: vi.fn(),
    clearBillboardsInArea: vi.fn(),
  } as unknown as GlobalBillboardSystem;
}

// Helper to create mock chunk
function createMockChunk(x: number, z: number): ImprovedChunk {
  return {
    chunkX: x,
    chunkZ: z,
    getPosition: vi.fn(() => new THREE.Vector3(x * 100, 0, z * 100)),
    dispose: vi.fn(),
    mesh: new THREE.Mesh(),
    billboardCount: 100,
  } as unknown as ImprovedChunk;
}

describe('ImprovedChunkManager', () => {
  let manager: ImprovedChunkManager;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let assetLoader: AssetLoader;
  let billboardSystem: GlobalBillboardSystem;
  let config: ChunkConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock performance.now to return stable values so the adaptive render distance
    // cooldown (1500ms) never elapses during tests. Constructor captures lastAdaptTime
    // from performance.now(), and update() checks elapsed time against ADAPT_COOLDOWN_MS.
    const baseTime = 1000;
    vi.spyOn(performance, 'now').mockReturnValue(baseTime);

    scene = createMockScene();
    camera = createMockCamera();
    assetLoader = createMockAssetLoader();
    billboardSystem = createMockBillboardSystem();

    config = {
      size: 64,
      renderDistance: 6,
      loadDistance: 7,
      lodLevels: 4,
    };

    // Setup mock managers that will be returned by mocked constructors
    mockPriorityManager = {
      updatePlayerPosition: vi.fn(),
      hasPlayerMovedChunk: vi.fn(() => false),
      getChunksInRadius: vi.fn(() => []),
      shouldChunkBeUnloaded: vi.fn(() => false),
      getChunkDistance: vi.fn(() => 5),
      calculateLOD: vi.fn(() => 0),
      shouldChunkBeVisible: vi.fn(() => true),
      updateConfig: vi.fn(),
      clearQueue: vi.fn(),
    };

    mockLifecycleManager = {
      loadChunkImmediate: vi.fn().mockResolvedValue(createMockChunk(0, 0)),
      updatePlayerPosition: vi.fn(),
      unloadDistantChunks: vi.fn(),
      updateChunkVisibility: vi.fn(),
      getLoadedChunkCount: vi.fn(() => 0),
      getChunkAt: vi.fn(() => undefined),
      isChunkLoaded: vi.fn(() => false),
      getLoadingCount: vi.fn(() => 0),
      updateConfig: vi.fn(),
      dispose: vi.fn(),
      getMergerStats: vi.fn(() => ({
        activeRings: 0,
        totalChunks: 0,
        pendingMerge: false,
        estimatedDrawCallSavings: 0,
      })),
    };

    mockTerrainQueries = {
      getHeightAt: vi.fn(() => 5.0),
      getEffectiveHeightAt: vi.fn(() => 5.0),
      checkObjectCollision: vi.fn(() => false),
      raycastTerrain: vi.fn(() => ({ hit: false })),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
    };

    mockLoadQueueManager = {
      updateLoadQueue: vi.fn(),
      drainLoadQueue: vi.fn(),
      getQueueSize: vi.fn(() => 0),
      cancelBackgroundLoader: vi.fn(),
    };
  });

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem);
      expect(manager).toBeDefined();
    });

    it('should create with custom config', () => {
      const customConfig: ChunkConfig = {
        size: 128,
        renderDistance: 8,
        loadDistance: 9,
        lodLevels: 5,
      };
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, customConfig);
      expect(manager).toBeDefined();
    });
  });

  describe('init', () => {
    it('should load initial chunks', async () => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);

      mockPriorityManager.getChunksInRadius.mockReturnValue([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ]);

      await manager.init();

      expect(mockPriorityManager.getChunksInRadius).toHaveBeenCalled();
      expect(mockLifecycleManager.loadChunkImmediate).toHaveBeenCalledTimes(2);
    });

    it('should update load queue after init', async () => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
      await manager.init();

      expect(mockLoadQueueManager.updateLoadQueue).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should accumulate delta time', () => {
      manager.update(0.05);
      manager.update(0.05);
      manager.update(0.05);

      // Should not update on first few calls (UPDATE_INTERVAL = 0.25)
      expect(mockPriorityManager.updatePlayerPosition).not.toHaveBeenCalled();

      manager.update(0.15);

      // Should update after accumulating >= 0.25s (0.05 + 0.05 + 0.05 + 0.15 = 0.30)
      expect(mockPriorityManager.updatePlayerPosition).toHaveBeenCalled();
    });

    it('should update player position in sub-managers after interval', () => {
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 20));
      manager.update(0.3); // Exceeds UPDATE_INTERVAL

      expect(mockPriorityManager.updatePlayerPosition).toHaveBeenCalled();
      expect(mockLifecycleManager.updatePlayerPosition).toHaveBeenCalled();
    });

    it('should update load queue when player moves chunk', () => {
      mockPriorityManager.hasPlayerMovedChunk.mockReturnValue(true);

      manager.update(0.3);

      expect(mockPriorityManager.hasPlayerMovedChunk).toHaveBeenCalled();
      expect(mockLoadQueueManager.updateLoadQueue).toHaveBeenCalled();
    });

    it('should not update load queue when player stays in same chunk', () => {
      mockPriorityManager.hasPlayerMovedChunk.mockReturnValue(false);
      mockLoadQueueManager.updateLoadQueue.mockClear();

      manager.update(0.3);

      // Should not be called during update (only during init)
      expect(mockLoadQueueManager.updateLoadQueue).not.toHaveBeenCalled();
    });

    it('should drain load queue after interval', () => {
      manager.update(0.3);

      expect(mockLoadQueueManager.drainLoadQueue).toHaveBeenCalledWith(
        expect.any(Number), // IN_FRAME_BUDGET_MS
        expect.any(Number)  // MAX_CHUNKS_PER_FRAME
      );
    });

    it('should update chunk visibility after interval', () => {
      manager.update(0.3);

      expect(mockLifecycleManager.updateChunkVisibility).toHaveBeenCalledWith(
        expect.any(Function), // getChunkDistance
        expect.any(Function), // calculateLOD
        expect.any(Function)  // shouldChunkBeVisible
      );
    });

    it('should unload distant chunks after interval', () => {
      manager.update(0.3);

      expect(mockLifecycleManager.unloadDistantChunks).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should reset update timer after processing', () => {
      manager.update(0.3); // Should process
      mockPriorityManager.updatePlayerPosition.mockClear();

      manager.update(0.1); // Should not process (timer reset)
      expect(mockPriorityManager.updatePlayerPosition).not.toHaveBeenCalled();
    });
  });

  describe('updatePlayerPosition', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should update player position in priority manager', () => {
      const position = new THREE.Vector3(100, 0, 200);
      manager.updatePlayerPosition(position);

      expect(mockPriorityManager.updatePlayerPosition).toHaveBeenCalledWith(position);
    });

    it('should update player position in lifecycle manager', () => {
      const position = new THREE.Vector3(100, 0, 200);
      manager.updatePlayerPosition(position);

      expect(mockLifecycleManager.updatePlayerPosition).toHaveBeenCalledWith(position);
    });

    it('should handle multiple position updates', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 10));
      manager.updatePlayerPosition(new THREE.Vector3(20, 0, 20));

      expect(mockPriorityManager.updatePlayerPosition).toHaveBeenCalledTimes(3);
    });
  });

  describe('Chunk query methods', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should get loaded chunk count from lifecycle manager', () => {
      mockLifecycleManager.getLoadedChunkCount.mockReturnValue(42);

      const count = manager.getLoadedChunkCount();

      expect(count).toBe(42);
      expect(mockLifecycleManager.getLoadedChunkCount).toHaveBeenCalled();
    });

    it('should get chunk at position from lifecycle manager', () => {
      const mockChunk = createMockChunk(5, 5);
      mockLifecycleManager.getChunkAt.mockReturnValue(mockChunk);

      const position = new THREE.Vector3(320, 0, 320);
      const chunk = manager.getChunkAt(position);

      expect(chunk).toBe(mockChunk);
      expect(mockLifecycleManager.getChunkAt).toHaveBeenCalledWith(position);
    });

    it('should get height at position from terrain queries', () => {
      mockTerrainQueries.getHeightAt.mockReturnValue(10.5);

      const height = manager.getHeightAt(100, 200);

      expect(height).toBe(10.5);
      expect(mockTerrainQueries.getHeightAt).toHaveBeenCalledWith(100, 200);
    });

    it('should get terrain height using getTerrainHeightAt', () => {
      mockTerrainQueries.getHeightAt.mockReturnValue(15.0);

      const height = manager.getTerrainHeightAt(50, 75);

      expect(height).toBe(15.0);
      expect(mockTerrainQueries.getHeightAt).toHaveBeenCalledWith(50, 75);
    });

    it('should check if chunk is loaded', () => {
      mockLifecycleManager.isChunkLoaded.mockReturnValue(true);

      const isLoaded = manager.isChunkLoaded(3, 4);

      expect(isLoaded).toBe(true);
      expect(mockLifecycleManager.isChunkLoaded).toHaveBeenCalledWith(3, 4);
    });
  });

  describe('Collision object management', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should register collision object', () => {
      const object = new THREE.Mesh();
      manager.registerCollisionObject('test-id', object);

      expect(mockTerrainQueries.registerCollisionObject).toHaveBeenCalledWith('test-id', object);
    });

    it('should unregister collision object', () => {
      manager.unregisterCollisionObject('test-id');

      expect(mockTerrainQueries.unregisterCollisionObject).toHaveBeenCalledWith('test-id');
    });

    it('should get effective height at position', () => {
      mockTerrainQueries.getEffectiveHeightAt.mockReturnValue(12.0);

      const height = manager.getEffectiveHeightAt(100, 200);

      expect(height).toBe(12.0);
      expect(mockTerrainQueries.getEffectiveHeightAt).toHaveBeenCalledWith(100, 200);
    });

    it('should check object collision', () => {
      mockTerrainQueries.checkObjectCollision.mockReturnValue(true);

      const position = new THREE.Vector3(10, 5, 20);
      const hasCollision = manager.checkObjectCollision(position, 1.5);

      expect(hasCollision).toBe(true);
      expect(mockTerrainQueries.checkObjectCollision).toHaveBeenCalledWith(position, 1.5);
    });

    it('should check object collision with default radius', () => {
      const position = new THREE.Vector3(10, 5, 20);
      manager.checkObjectCollision(position);

      expect(mockTerrainQueries.checkObjectCollision).toHaveBeenCalledWith(position, 0.5);
    });
  });

  describe('Terrain raycasting', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should raycast terrain and return hit result', () => {
      mockTerrainQueries.raycastTerrain.mockReturnValue({
        hit: true,
        point: new THREE.Vector3(10, 5, 10),
        distance: 15.0,
      });

      const origin = new THREE.Vector3(0, 10, 0);
      const direction = new THREE.Vector3(0, -1, 0);
      const result = manager.raycastTerrain(origin, direction, 100);

      expect(result.hit).toBe(true);
      expect(result.point).toBeDefined();
      expect(result.distance).toBe(15.0);
      expect(mockTerrainQueries.raycastTerrain).toHaveBeenCalledWith(origin, direction, 100);
    });

    it('should raycast terrain and return miss result', () => {
      mockTerrainQueries.raycastTerrain.mockReturnValue({ hit: false });

      const origin = new THREE.Vector3(0, 10, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      const result = manager.raycastTerrain(origin, direction, 50);

      expect(result.hit).toBe(false);
      expect(mockTerrainQueries.raycastTerrain).toHaveBeenCalledWith(origin, direction, 50);
    });
  });

  describe('Queue and loading stats', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should get queue size', () => {
      mockLoadQueueManager.getQueueSize.mockReturnValue(8);

      const size = manager.getQueueSize();

      expect(size).toBe(8);
      expect(mockLoadQueueManager.getQueueSize).toHaveBeenCalled();
    });

    it('should get loading count', () => {
      mockLifecycleManager.getLoadingCount.mockReturnValue(3);

      const count = manager.getLoadingCount();

      expect(count).toBe(3);
      expect(mockLifecycleManager.getLoadingCount).toHaveBeenCalled();
    });
  });

  describe('Worker telemetry', () => {
    it('should return null when workers are disabled', () => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);

      const stats = manager.getWorkerStats();

      // Workers fail to initialize in test environment (mocked), so should be null
      expect(stats).toBeNull();
    });

    it('should return null telemetry when workers are disabled', () => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);

      const telemetry = manager.getWorkerTelemetry();

      // Workers fail to initialize in test environment (mocked), so should be null
      expect(telemetry).toBeNull();
    });
  });

  describe('setRenderDistance', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should update render distance config in sub-managers', () => {
      manager.setRenderDistance(8);

      expect(mockPriorityManager.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          renderDistance: 8,
          loadDistance: 9, // render + 1
        })
      );
    });

    it('should update lifecycle manager config', () => {
      manager.setRenderDistance(10);

      expect(mockLifecycleManager.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          renderDistance: 10,
          loadDistance: 11,
        })
      );
    });

    it('should trigger load queue update', () => {
      mockLoadQueueManager.updateLoadQueue.mockClear();

      manager.setRenderDistance(7);

      expect(mockLoadQueueManager.updateLoadQueue).toHaveBeenCalled();
    });
  });

  describe('getLOSAccelerator', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should return LOSAccelerator instance', () => {
      const losAccelerator = manager.getLOSAccelerator();

      expect(losAccelerator).toBeDefined();
    });
  });

  describe('getMergerStats', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should get merger stats from lifecycle manager', () => {
      const mockStats = {
        activeRings: 3,
        totalChunks: 25,
        pendingMerge: false,
        estimatedDrawCallSavings: 20,
      };
      mockLifecycleManager.getMergerStats.mockReturnValue(mockStats);

      const stats = manager.getMergerStats();

      expect(stats).toEqual(mockStats);
      expect(mockLifecycleManager.getMergerStats).toHaveBeenCalled();
    });

    it('should return null if merger stats are unavailable', () => {
      mockLifecycleManager.getMergerStats.mockReturnValue(null);

      const stats = manager.getMergerStats();

      expect(stats).toBeNull();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      manager = new ImprovedChunkManager(scene, camera, assetLoader, billboardSystem, config);
    });

    it('should cancel background loader', () => {
      manager.dispose();

      expect(mockLoadQueueManager.cancelBackgroundLoader).toHaveBeenCalled();
    });

    it('should dispose lifecycle manager', () => {
      manager.dispose();

      expect(mockLifecycleManager.dispose).toHaveBeenCalled();
    });

    it('should clear priority queue', () => {
      manager.dispose();

      expect(mockPriorityManager.clearQueue).toHaveBeenCalled();
    });

    it('should be safe to call dispose multiple times', () => {
      expect(() => {
        manager.dispose();
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });
});
