import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ImprovedChunk } from './ImprovedChunk';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
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

// Mock three-mesh-bvh
vi.mock('three-mesh-bvh', () => ({
  computeBoundsTree: vi.fn(),
  disposeBoundsTree: vi.fn(),
  acceleratedRaycast: vi.fn()
}));

// Mock ChunkHeightGenerator
vi.mock('./ChunkHeightGenerator', () => ({
  ChunkHeightGenerator: {
    generateHeightData: vi.fn((chunkX, chunkZ, size, segments) => {
      // Generate simple test height data
      const dataSize = (segments + 1) * (segments + 1);
      const heightData = new Float32Array(dataSize);
      for (let z = 0; z <= segments; z++) {
        for (let x = 0; x <= segments; x++) {
          heightData[z * (segments + 1) + x] = x + z; // Simple gradient
        }
      }
      return heightData;
    })
  }
}));

// Mock ChunkVegetationGenerator
vi.mock('./ChunkVegetationGenerator', () => ({
  ChunkVegetationGenerator: {
    generateVegetation: vi.fn(() => ({
      fernInstances: [],
      elephantEarInstances: [],
      fanPalmInstances: [],
      coconutInstances: [],
      arecaInstances: [],
      dipterocarpInstances: [],
      banyanInstances: []
    }))
  }
}));

// Mock TerrainMeshFactory
vi.mock('./TerrainMeshFactory', () => ({
  TerrainMeshFactory: {
    createTerrainMesh: vi.fn(() => {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      return mesh;
    }),
    createTerrainMeshFromGeometry: vi.fn((geometry) => {
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      return mesh;
    })
  }
}));

// Mock ChunkWorkerAdapter
vi.mock('./ChunkWorkerAdapter', () => ({
  ChunkWorkerAdapter: {
    applyWorkerData: vi.fn().mockResolvedValue({
      terrainMesh: undefined,
      terrainGeometry: undefined,
      fernInstances: [],
      elephantEarInstances: [],
      fanPalmInstances: [],
      coconutInstances: [],
      arecaInstances: [],
      dipterocarpInstances: [],
      banyanInstances: []
    })
  }
}));

// Helper to create mock scene
function createMockScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add = vi.fn();
  scene.remove = vi.fn();
  return scene;
}

// Helper to create mock asset loader
function createMockAssetLoader(): AssetLoader {
  const mockTexture = new THREE.Texture();
  return {
    getTexture: vi.fn(() => mockTexture),
    loadTexture: vi.fn().mockResolvedValue(mockTexture),
  } as unknown as AssetLoader;
}

// Helper to create mock noise generator
function createMockNoiseGenerator(): NoiseGenerator {
  return {
    noise: vi.fn(() => 0.5),
  } as unknown as NoiseGenerator;
}

// Helper to create mock billboard system
function createMockBillboardSystem(): GlobalBillboardSystem {
  return {
    addChunkInstances: vi.fn(),
    removeChunkInstances: vi.fn(),
    reserveBillboardsForChunk: vi.fn(),
    activateBillboardsForChunk: vi.fn(),
    releaseBillboardsForChunk: vi.fn(),
  } as unknown as GlobalBillboardSystem;
}

describe('ImprovedChunk', () => {
  let scene: THREE.Scene;
  let assetLoader: AssetLoader;
  let noiseGenerator: NoiseGenerator;
  let billboardSystem: GlobalBillboardSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = createMockScene();
    assetLoader = createMockAssetLoader();
    noiseGenerator = createMockNoiseGenerator();
    billboardSystem = createMockBillboardSystem();
  });

  describe('Constructor', () => {
    it('should create chunk with correct position', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 2, 3, 64, noiseGenerator, billboardSystem);
      
      const position = chunk.getPosition();
      expect(position.x).toBe(2 * 64 + 32); // chunkX * size + size/2
      expect(position.y).toBe(0);
      expect(position.z).toBe(3 * 64 + 32); // chunkZ * size + size/2
    });

    it('should initialize with given chunk coordinates', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 5, 10, 64, noiseGenerator, billboardSystem);
      
      expect(chunk.isInBounds(5 * 64, 10 * 64)).toBe(true);
      expect(chunk.isInBounds(5 * 64 + 32, 10 * 64 + 32)).toBe(true);
    });

    it('should initialize with given size', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 128, noiseGenerator, billboardSystem);
      
      expect(chunk.isInBounds(0, 0)).toBe(true);
      expect(chunk.isInBounds(127, 127)).toBe(true);
      expect(chunk.isInBounds(128, 128)).toBe(false);
    });

    it('should handle negative chunk coordinates', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, -2, -3, 64, noiseGenerator, billboardSystem);
      
      const position = chunk.getPosition();
      expect(position.x).toBe(-2 * 64 + 32);
      expect(position.z).toBe(-3 * 64 + 32);
    });

    it('should support skipTerrainMesh flag', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem, true);
      
      expect(chunk).toBeDefined();
    });
  });

  describe('getPosition', () => {
    it('should return cached position vector', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 1, 2, 64, noiseGenerator, billboardSystem);
      
      const pos1 = chunk.getPosition();
      const pos2 = chunk.getPosition();
      
      expect(pos1).toBe(pos2); // Same reference
    });

    it('should calculate center position correctly', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 3, 4, 100, noiseGenerator, billboardSystem);
      
      const position = chunk.getPosition();
      expect(position.x).toBe(3 * 100 + 50);
      expect(position.y).toBe(0);
      expect(position.z).toBe(4 * 100 + 50);
    });
  });

  describe('isInBounds', () => {
    it('should return true for positions within chunk', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      expect(chunk.isInBounds(0, 0)).toBe(true);
      expect(chunk.isInBounds(32, 32)).toBe(true);
      expect(chunk.isInBounds(63, 63)).toBe(true);
    });

    it('should return false for positions outside chunk', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      expect(chunk.isInBounds(-1, 0)).toBe(false);
      expect(chunk.isInBounds(0, -1)).toBe(false);
      expect(chunk.isInBounds(64, 0)).toBe(false);
      expect(chunk.isInBounds(0, 64)).toBe(false);
      expect(chunk.isInBounds(100, 100)).toBe(false);
    });

    it('should handle chunk at non-zero coordinates', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 2, 3, 64, noiseGenerator, billboardSystem);
      
      const baseX = 2 * 64;
      const baseZ = 3 * 64;
      
      expect(chunk.isInBounds(baseX, baseZ)).toBe(true);
      expect(chunk.isInBounds(baseX + 32, baseZ + 32)).toBe(true);
      expect(chunk.isInBounds(baseX + 63, baseZ + 63)).toBe(true);
      expect(chunk.isInBounds(baseX - 1, baseZ)).toBe(false);
      expect(chunk.isInBounds(baseX + 64, baseZ)).toBe(false);
    });

    it('should handle boundary conditions correctly', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 1, 1, 64, noiseGenerator, billboardSystem);
      
      // Lower boundary (inclusive)
      expect(chunk.isInBounds(64, 64)).toBe(true);
      
      // Upper boundary (exclusive)
      expect(chunk.isInBounds(128, 128)).toBe(false);
      expect(chunk.isInBounds(127.99, 127.99)).toBe(true);
    });
  });

  describe('getHeightAt', () => {
    it('should return height for position within chunk', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const height = chunk.getHeightAt(32, 32);
      expect(typeof height).toBe('number');
    });

    it('should return 0 for position outside chunk bounds', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      expect(chunk.getHeightAt(-10, 32)).toBe(0);
      expect(chunk.getHeightAt(32, -10)).toBe(0);
      expect(chunk.getHeightAt(100, 32)).toBe(0);
      expect(chunk.getHeightAt(32, 100)).toBe(0);
    });

    it('should convert world coordinates to local coordinates', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 2, 3, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const worldX = 2 * 64 + 10;
      const worldZ = 3 * 64 + 20;
      
      const height = chunk.getHeightAt(worldX, worldZ);
      expect(typeof height).toBe('number');
    });

    it('should handle chunk at origin', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      expect(chunk.getHeightAt(0, 0)).toBeGreaterThanOrEqual(0);
      expect(chunk.getHeightAt(32, 32)).toBeGreaterThanOrEqual(0);
      expect(chunk.getHeightAt(63, 63)).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative chunk coordinates', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, -1, -1, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const worldX = -64 + 32;
      const worldZ = -64 + 32;
      
      const height = chunk.getHeightAt(worldX, worldZ);
      expect(typeof height).toBe('number');
    });
  });

  describe('getHeightAtLocal - Bilinear Interpolation', () => {
    it('should interpolate height at chunk corners', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Corner (0, 0) should be close to heightData[0]
      const h00 = chunk.getHeightAt(0, 0);
      expect(h00).toBeCloseTo(0, 1); // heightData[0] = 0 + 0
      
      // Corner (64, 0) should be close to heightData[32]
      const h10 = chunk.getHeightAt(64, 0);
      expect(h10).toBeCloseTo(32, 1); // heightData[32] = 32 + 0
      
      // Corner (0, 64) should be close to heightData[32 * 33]
      const h01 = chunk.getHeightAt(0, 64);
      expect(h01).toBeCloseTo(32, 1); // heightData[32 * 33] = 0 + 32
    });

    it('should interpolate height at chunk center', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Center should be average of surrounding heights
      const centerHeight = chunk.getHeightAt(32, 32);
      expect(centerHeight).toBeGreaterThanOrEqual(0);
      expect(centerHeight).toBeLessThanOrEqual(64);
    });

    it('should clamp coordinates to chunk bounds', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Coordinates beyond bounds should return 0 (out of bounds check)
      expect(chunk.getHeightAt(-1, 32)).toBe(0);
      expect(chunk.getHeightAt(32, -1)).toBe(0);
      expect(chunk.getHeightAt(65, 32)).toBe(0);
      expect(chunk.getHeightAt(32, 65)).toBe(0);
    });

    it('should handle fractional coordinates with bilinear interpolation', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Test interpolation at fractional position
      const h1 = chunk.getHeightAt(10.5, 20.5);
      const h2 = chunk.getHeightAt(10.0, 20.0);
      const h3 = chunk.getHeightAt(11.0, 21.0);
      
      // Interpolated value should be between neighbors
      expect(h1).toBeGreaterThanOrEqual(Math.min(h2, h3));
      expect(h1).toBeLessThanOrEqual(Math.max(h2, h3));
    });

    it('should produce smooth height transitions', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Sample heights along a line
      const heights = [];
      for (let x = 0; x <= 64; x += 8) {
        heights.push(chunk.getHeightAt(x, 32));
      }
      
      // Heights should form a smooth gradient (no sudden jumps)
      for (let i = 1; i < heights.length; i++) {
        const diff = Math.abs(heights[i] - heights[i - 1]);
        expect(diff).toBeLessThan(20); // Reasonable gradient
      }
    });

    it('should handle edge interpolation correctly', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();

      // Test edge positions - getHeightAt uses > (not >=) for bounds, so 64 is inclusive
      const edgeX = chunk.getHeightAt(64, 32);
      const edgeZ = chunk.getHeightAt(32, 64);

      // Edge positions at exact boundary are clamped and return valid heights
      expect(typeof edgeX).toBe('number');
      expect(typeof edgeZ).toBe('number');

      // Past the boundary should return 0
      expect(chunk.getHeightAt(65, 32)).toBe(0);
      expect(chunk.getHeightAt(32, 65)).toBe(0);
    });

    it('should interpolate correctly with custom height data', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // With our mock height data (x + z), center should be around 32
      const centerHeight = chunk.getHeightAt(32, 32);
      expect(centerHeight).toBeGreaterThan(20);
      expect(centerHeight).toBeLessThan(40);
    });
  });

  describe('generate', () => {
    it('should generate terrain mesh', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      await chunk.generate();
      
      expect(scene.add).toHaveBeenCalled();
    });

    it('should skip terrain mesh when skipTerrainMesh is true', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem, true);
      
      await chunk.generate();
      
      expect(scene.add).not.toHaveBeenCalled();
    });

    it('should generate vegetation', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      await chunk.generate();
      
      expect(billboardSystem.addChunkInstances).toHaveBeenCalled();
    });

    it('should not regenerate if already generated', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      await chunk.generate();
      const firstCallCount = (scene.add as any).mock.calls.length;
      
      await chunk.generate();
      const secondCallCount = (scene.add as any).mock.calls.length;
      
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should register billboard instances with correct chunk key', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 2, 3, 64, noiseGenerator, billboardSystem);
      
      await chunk.generate();
      
      expect(billboardSystem.addChunkInstances).toHaveBeenCalledWith(
        '2,3',
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array)
      );
    });
  });

  describe('generateFromWorker', () => {
    it('should use worker-provided geometry', async () => {
      // Override mock to return a terrain mesh
      const { ChunkWorkerAdapter } = await import('./ChunkWorkerAdapter');
      const mockMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
      vi.mocked(ChunkWorkerAdapter.applyWorkerData).mockResolvedValueOnce({
        terrainMesh: mockMesh,
        terrainGeometry: new THREE.BufferGeometry(),
        fernInstances: [],
        elephantEarInstances: [],
        fanPalmInstances: [],
        coconutInstances: [],
        arecaInstances: [],
        dipterocarpInstances: [],
        banyanInstances: []
      });

      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);

      const workerGeometry = new THREE.BufferGeometry();
      const workerHeightData = new Float32Array(33 * 33);

      await chunk.generateFromWorker(workerGeometry, workerHeightData, undefined, false);

      expect(chunk.getTerrainMesh()).toBeDefined();
    });

    it('should use worker-provided height data', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      const workerGeometry = new THREE.BufferGeometry();
      const workerHeightData = new Float32Array(33 * 33);
      for (let i = 0; i < workerHeightData.length; i++) {
        workerHeightData[i] = 10.0; // Flat terrain at height 10
      }
      
      await chunk.generateFromWorker(workerGeometry, workerHeightData, undefined, false);
      
      const height = chunk.getHeightAt(32, 32);
      expect(height).toBeCloseTo(10.0, 1);
    });

    it('should not regenerate if already generated', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      await chunk.generate();
      
      const workerGeometry = new THREE.BufferGeometry();
      const workerHeightData = new Float32Array(33 * 33);
      
      await chunk.generateFromWorker(workerGeometry, workerHeightData, undefined, false);
      
      // Should not call ChunkWorkerAdapter since already generated
      const { ChunkWorkerAdapter } = await import('./ChunkWorkerAdapter');
      expect(ChunkWorkerAdapter.applyWorkerData).not.toHaveBeenCalled();
    });

    it('should handle BVH already computed flag', async () => {
      const { ChunkWorkerAdapter } = await import('./ChunkWorkerAdapter');
      vi.mocked(ChunkWorkerAdapter.applyWorkerData).mockClear();

      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);

      const workerGeometry = new THREE.BufferGeometry();
      const workerHeightData = new Float32Array(33 * 33);

      await chunk.generateFromWorker(workerGeometry, workerHeightData, undefined, true);

      expect(ChunkWorkerAdapter.applyWorkerData).toHaveBeenCalledTimes(1);
      // Verify bvhAlreadyComputed (12th arg, index 11) is true
      const callArgs = vi.mocked(ChunkWorkerAdapter.applyWorkerData).mock.calls[0];
      expect(callArgs[11]).toBe(true);
      // Last arg should be a height query function
      expect(typeof callArgs[12]).toBe('function');
    });
  });

  describe('getHeightAtRaycast', () => {
    it('should return 0 when terrain mesh is not available', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      const height = chunk.getHeightAtRaycast(32, 32);
      expect(height).toBe(0);
    });

    it('should use raycasting when terrain mesh is available', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const height = chunk.getHeightAtRaycast(32, 32);
      expect(typeof height).toBe('number');
    });
  });

  describe('setVisible', () => {
    it('should set terrain mesh visibility', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const mesh = chunk.getTerrainMesh();
      if (mesh) {
        chunk.setVisible(false);
        expect(mesh.visible).toBe(false);
        
        chunk.setVisible(true);
        expect(mesh.visible).toBe(true);
      }
    });

    it('should not throw when terrain mesh is not available', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      expect(() => {
        chunk.setVisible(false);
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should remove terrain mesh from scene', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      chunk.dispose();
      
      expect(scene.remove).toHaveBeenCalled();
    });

    it('should remove billboard instances', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 2, 3, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      chunk.dispose();
      
      expect(billboardSystem.removeChunkInstances).toHaveBeenCalledWith('2,3');
    });

    it('should dispose geometry and material', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const mesh = chunk.getTerrainMesh();
      if (mesh) {
        const geometry = mesh.geometry;
        const material = mesh.material as THREE.Material;
        
        const geometryDispose = vi.spyOn(geometry, 'dispose');
        const materialDispose = vi.spyOn(material, 'dispose');
        
        chunk.dispose();
        
        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
      }
    });

    it('should not throw when terrain mesh is not available', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      expect(() => {
        chunk.dispose();
      }).not.toThrow();
    });

    it('should be safe to call dispose multiple times', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      expect(() => {
        chunk.dispose();
        chunk.dispose();
        chunk.dispose();
      }).not.toThrow();
    });
  });

  describe('getTerrainMesh', () => {
    it('should return undefined before generation', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      expect(chunk.getTerrainMesh()).toBeUndefined();
    });

    it('should return mesh after generation', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const mesh = chunk.getTerrainMesh();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
    });

    it('should return undefined when skipTerrainMesh is true', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem, true);
      await chunk.generate();
      
      expect(chunk.getTerrainMesh()).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-sized chunk', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 0, noiseGenerator, billboardSystem);

      // With size=0, isInBounds uses strict < so 0 < 0+0 is false
      expect(chunk.isInBounds(0, 0)).toBe(false);
      expect(chunk.isInBounds(1, 1)).toBe(false);
    });

    it('should handle very large chunk coordinates', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 1000, 2000, 64, noiseGenerator, billboardSystem);
      
      const position = chunk.getPosition();
      expect(position.x).toBe(1000 * 64 + 32);
      expect(position.z).toBe(2000 * 64 + 32);
    });

    it('should handle very large chunk size', () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 1024, noiseGenerator, billboardSystem);
      
      expect(chunk.isInBounds(0, 0)).toBe(true);
      expect(chunk.isInBounds(1023, 1023)).toBe(true);
      expect(chunk.isInBounds(1024, 1024)).toBe(false);
    });

    it('should handle height queries at exact boundaries', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();

      // Lower boundary (inclusive)
      expect(chunk.getHeightAt(0, 0)).toBeGreaterThanOrEqual(0);

      // Upper boundary - getHeightAt uses > (not >=), so 64 is inclusive and clamped
      const h = chunk.getHeightAt(64, 64);
      expect(typeof h).toBe('number');

      // Past the boundary should return 0
      expect(chunk.getHeightAt(65, 65)).toBe(0);
    });

    it('should handle floating point precision in bounds checks', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Very close to boundary
      expect(chunk.getHeightAt(63.999, 63.999)).toBeGreaterThanOrEqual(0);
      expect(chunk.getHeightAt(64.001, 64.001)).toBe(0);
    });
  });

  describe('Integration tests', () => {
    it('should generate chunk and query heights correctly', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 1, 2, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      // Test multiple positions
      const positions = [
        [64 + 10, 128 + 10],
        [64 + 32, 128 + 32],
        [64 + 50, 128 + 50]
      ];
      
      for (const [x, z] of positions) {
        const height = chunk.getHeightAt(x, z);
        expect(typeof height).toBe('number');
        expect(height).toBeGreaterThanOrEqual(0);
      }
    });

    it('should maintain consistent heights across multiple queries', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      await chunk.generate();
      
      const x = 32;
      const z = 32;
      
      const h1 = chunk.getHeightAt(x, z);
      const h2 = chunk.getHeightAt(x, z);
      const h3 = chunk.getHeightAt(x, z);
      
      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    });

    it('should handle full lifecycle: create, generate, query, dispose', async () => {
      const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      
      // Generate
      await chunk.generate();
      expect(scene.add).toHaveBeenCalled();
      
      // Query
      const height = chunk.getHeightAt(32, 32);
      expect(typeof height).toBe('number');
      
      // Visibility
      chunk.setVisible(false);
      
      // Dispose
      chunk.dispose();
      expect(scene.remove).toHaveBeenCalled();
      expect(billboardSystem.removeChunkInstances).toHaveBeenCalled();
    });

    it('should work with different chunk sizes', async () => {
      const sizes = [32, 64, 128, 256];
      
      for (const size of sizes) {
        const chunk = new ImprovedChunk(scene, assetLoader, 0, 0, size, noiseGenerator, billboardSystem);
        await chunk.generate();
        
        const height = chunk.getHeightAt(size / 2, size / 2);
        expect(typeof height).toBe('number');
        
        chunk.dispose();
      }
    });

    it('should handle adjacent chunks correctly', async () => {
      const chunk1 = new ImprovedChunk(scene, assetLoader, 0, 0, 64, noiseGenerator, billboardSystem);
      const chunk2 = new ImprovedChunk(scene, assetLoader, 1, 0, 64, noiseGenerator, billboardSystem);
      
      await chunk1.generate();
      await chunk2.generate();
      
      // Chunk 1 should handle its bounds
      expect(chunk1.isInBounds(32, 32)).toBe(true);
      expect(chunk1.isInBounds(64, 32)).toBe(false);
      
      // Chunk 2 should handle its bounds
      expect(chunk2.isInBounds(64, 32)).toBe(true);
      expect(chunk2.isInBounds(128, 32)).toBe(false);
      
      chunk1.dispose();
      chunk2.dispose();
    });
  });
});
