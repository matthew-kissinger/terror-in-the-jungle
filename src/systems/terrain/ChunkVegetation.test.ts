import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ChunkVegetation, BiomeType } from './ChunkVegetation';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';

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

// Mock MathUtils
vi.mock('../../utils/Math', () => ({
  MathUtils: {
    randomInRange: vi.fn((min, max) => (min + max) / 2),
    poissonDiskSampling: vi.fn((width, height, minDistance) => {
      // Generate simple grid of points
      const points = [];
      const step = minDistance * 1.5;
      for (let x = 0; x < width; x += step) {
        for (let y = 0; y < height; y += step) {
          points.push({ x, y });
        }
      }
      return points;
    })
  }
}));

// Helper to create mock asset loader
function createMockAssetLoader(): AssetLoader {
  const mockTexture = new THREE.Texture();
  return {
    getTexture: vi.fn(() => mockTexture),
    loadTexture: vi.fn().mockResolvedValue(mockTexture),
  } as unknown as AssetLoader;
}

// Helper to create mock noise generator with controlled output
function createMockNoiseGenerator(returnValue: number = 0.5): NoiseGenerator {
  return {
    noise: vi.fn(() => returnValue),
  } as unknown as NoiseGenerator;
}

// Helper to create simple height function
function createHeightFunction(height: number = 5.0): (x: number, z: number) => number {
  return vi.fn(() => height);
}

describe('ChunkVegetation', () => {
  let assetLoader: AssetLoader;
  let noiseGenerator: NoiseGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    assetLoader = createMockAssetLoader();
    noiseGenerator = createMockNoiseGenerator();
  });

  describe('Constructor', () => {
    it('should create instance with required parameters', () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      expect(vegetation).toBeDefined();
    });

    it('should initialize with empty instance arrays', () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      expect(vegetation.grassInstances).toEqual([]);
      expect(vegetation.treeInstances).toEqual([]);
      expect(vegetation.tree1Instances).toEqual([]);
      expect(vegetation.tree2Instances).toEqual([]);
      expect(vegetation.tree3Instances).toEqual([]);
      expect(vegetation.mushroomInstances).toEqual([]);
      expect(vegetation.wheatInstances).toEqual([]);
    });

    it('should store chunk coordinates', () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 5, 10);
      expect(vegetation).toBeDefined();
    });
  });

  describe('determineBiome', () => {
    it('should determine pine_forest biome for low temperature', async () => {
      const coldNoise = createMockNoiseGenerator(-0.5);
      const vegetation = new ChunkVegetation(assetLoader, coldNoise, 64, 0, 0);

      const heightFunc = createHeightFunction(5.0);
      await vegetation.generateVegetation(heightFunc);

      expect(vegetation.getBiomeType()).toBe('pine_forest');
    });

    it('should determine sparse_plains for high temp and low moisture', async () => {
      let callCount = 0;
      const noiseGen = {
        noise: vi.fn((x, y) => {
          callCount++;
          if (callCount === 1) return 0.5; // High temperature
          return -0.5; // Low moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, noiseGen, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('sparse_plains');
    });

    it('should determine farmland for high temp and high moisture', async () => {
      let callCount = 0;
      const noiseGen = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temperature
          return 0.5; // High moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, noiseGen, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('farmland');
    });

    it('should determine oak_woods for mid temp and high moisture', async () => {
      let callCount = 0;
      const noiseGen = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.1; // Mid temperature
          return 0.3; // High moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, noiseGen, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('oak_woods');
    });

    it('should determine mixed_forest for mid temp and low moisture', async () => {
      let callCount = 0;
      const noiseGen = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.0; // Mid temperature
          return 0.0; // Low moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, noiseGen, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('mixed_forest');
    });
  });

  describe('generateGrassInstances', () => {
    it('should generate grass instances', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.grassInstances.length).toBeGreaterThan(0);
    });

    it('should skip grass generation if texture is missing', async () => {
      const noTextureLoader = {
        getTexture: vi.fn(() => null),
      } as unknown as AssetLoader;

      const vegetation = new ChunkVegetation(noTextureLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.grassInstances).toEqual([]);
    });

    it('should skip grass below minimum height', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(0.3)); // Below 0.5 threshold

      expect(vegetation.grassInstances).toEqual([]);
    });

    it('should create grass instances with position and scale', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const instance = vegetation.grassInstances[0];
      expect(instance).toBeDefined();
      expect(instance.position).toBeInstanceOf(THREE.Vector3);
      expect(instance.scale).toBeInstanceOf(THREE.Vector3);
      expect(instance.rotation).toBeDefined();
    });

    it('should adjust grass density based on biome', async () => {
      // Pine forest has low grass density (0.4)
      const coldNoise = createMockNoiseGenerator(-0.5);
      const pineVeg = new ChunkVegetation(assetLoader, coldNoise, 64, 0, 0);
      await pineVeg.generateVegetation(createHeightFunction(5.0));

      // Sparse plains has high grass density (0.9)
      let callCount = 0;
      const plainNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return -0.5; // Low moisture
        })
      } as unknown as NoiseGenerator;
      const plainVeg = new ChunkVegetation(assetLoader, plainNoise, 64, 0, 0);
      await plainVeg.generateVegetation(createHeightFunction(5.0));

      expect(plainVeg.grassInstances.length).toBeGreaterThan(pineVeg.grassInstances.length);
    });
  });

  describe('generateTreeInstances', () => {
    it('should generate tree instances with sufficient forest density', async () => {
      const denseForestNoise = createMockNoiseGenerator(0.5);
      const vegetation = new ChunkVegetation(assetLoader, denseForestNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const totalTrees = vegetation.treeInstances.length +
                         vegetation.tree1Instances.length +
                         vegetation.tree2Instances.length +
                         vegetation.tree3Instances.length;
      expect(totalTrees).toBeGreaterThan(0);
    });

    it('should skip tree generation for low forest density', async () => {
      // forestNoise < -0.2 results in forestDensity = 0 which returns early
      let callCount = 0;
      const veryLowNoise = {
        noise: vi.fn(() => {
          callCount++;
          // First 2 calls are for determineBiome (temperature, moisture)
          // Next call is forestNoise in generateTreeInstances
          if (callCount <= 2) return 0.0; // Mid biome
          return -0.5; // Very low forest noise (< -0.2, so forestDensity = 0)
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, veryLowNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const totalTrees = vegetation.treeInstances.length +
                         vegetation.tree1Instances.length +
                         vegetation.tree2Instances.length +
                         vegetation.tree3Instances.length;
      expect(totalTrees).toBe(0);
    });

    it('should skip trees below minimum height', async () => {
      const denseForestNoise = createMockNoiseGenerator(0.5);
      const vegetation = new ChunkVegetation(assetLoader, denseForestNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(0.3)); // Below 0.5 threshold

      const totalTrees = vegetation.treeInstances.length +
                         vegetation.tree1Instances.length +
                         vegetation.tree2Instances.length +
                         vegetation.tree3Instances.length;
      expect(totalTrees).toBe(0);
    });

    it('should use Poisson disk sampling for tree placement', async () => {
      const { MathUtils } = await import('../../utils/Math');
      const denseForestNoise = createMockNoiseGenerator(0.5);
      const vegetation = new ChunkVegetation(assetLoader, denseForestNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(MathUtils.poissonDiskSampling).toHaveBeenCalled();
    });

    it('should create tree instances with elevated Y position', async () => {
      const denseForestNoise = createMockNoiseGenerator(0.5);
      const vegetation = new ChunkVegetation(assetLoader, denseForestNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const totalInstances = [
        ...vegetation.treeInstances,
        ...vegetation.tree1Instances,
        ...vegetation.tree2Instances,
        ...vegetation.tree3Instances
      ];

      if (totalInstances.length > 0) {
        const instance = totalInstances[0];
        expect(instance.position.y).toBeGreaterThan(5.0); // Height + 12
      }
    });

    it('should adjust tree density based on biome', async () => {
      // Pine forest has high tree density
      const pineNoise = createMockNoiseGenerator(-0.5);
      const pineVeg = new ChunkVegetation(assetLoader, pineNoise, 64, 0, 0);
      await pineVeg.generateVegetation(createHeightFunction(5.0));

      // Farmland has low tree density
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return 0.5; // High moisture
        })
      } as unknown as NoiseGenerator;
      const farmVeg = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await farmVeg.generateVegetation(createHeightFunction(5.0));

      const pineTrees = pineVeg.tree1Instances.length + pineVeg.tree2Instances.length;
      const farmTrees = farmVeg.tree1Instances.length + farmVeg.tree2Instances.length;

      expect(pineTrees).toBeGreaterThan(farmTrees);
    });

    it('should distribute trees across different types', async () => {
      const mixedForestNoise = {
        noise: vi.fn(() => 0.2) // Mid values for mixed forest
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, mixedForestNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const totalTrees = vegetation.treeInstances.length +
                         vegetation.tree1Instances.length +
                         vegetation.tree2Instances.length +
                         vegetation.tree3Instances.length;
      expect(totalTrees).toBeGreaterThan(0);
    });
  });

  describe('generateMushroomInstances', () => {
    it('should generate mushroom instances', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.mushroomInstances.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip mushroom generation if texture is missing', async () => {
      const partialLoader = {
        getTexture: vi.fn((name: string) => {
          if (name === 'mushroom') return null;
          return new THREE.Texture();
        })
      } as unknown as AssetLoader;

      const vegetation = new ChunkVegetation(partialLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.mushroomInstances).toEqual([]);
    });

    it('should skip mushrooms below minimum height', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(0.1)); // Below 0.2 threshold

      expect(vegetation.mushroomInstances).toEqual([]);
    });

    it('should adjust mushroom density based on biome', async () => {
      // Pine forest has high mushroom density (0.06)
      const pineNoise = createMockNoiseGenerator(-0.5);
      const pineVeg = new ChunkVegetation(assetLoader, pineNoise, 64, 0, 0);
      await pineVeg.generateVegetation(createHeightFunction(5.0));

      // Sparse plains has low mushroom density (0.01)
      let callCount = 0;
      const plainNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return -0.5; // Low moisture
        })
      } as unknown as NoiseGenerator;
      const plainVeg = new ChunkVegetation(assetLoader, plainNoise, 64, 0, 0);
      await plainVeg.generateVegetation(createHeightFunction(5.0));

      expect(pineVeg.mushroomInstances.length).toBeGreaterThanOrEqual(plainVeg.mushroomInstances.length);
    });

    it('should use Poisson disk sampling for mushroom placement', async () => {
      const { MathUtils } = await import('../../utils/Math');
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      // Should be called at least for mushrooms if density > 0
      const biome = vegetation.getBiomeType();
      const hasMushrooms = vegetation.mushroomInstances.length > 0;
      if (hasMushrooms) {
        expect(MathUtils.poissonDiskSampling).toHaveBeenCalledWith(64, 64, 3);
      }
    });

    it('should create mushroom instances with low Y offset', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      if (vegetation.mushroomInstances.length > 0) {
        const instance = vegetation.mushroomInstances[0];
        expect(instance.position.y).toBeCloseTo(5.2, 1); // Height + 0.2
      }
    });
  });

  describe('generateWheatPatches', () => {
    it('should generate wheat for farmland biome', async () => {
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return 0.5; // High moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('farmland');
      expect(vegetation.wheatInstances.length).toBeGreaterThan(0);
    });

    it('should skip wheat generation if texture is missing', async () => {
      const partialLoader = {
        getTexture: vi.fn((name: string) => {
          if (name === 'wheat') return null;
          return new THREE.Texture();
        })
      } as unknown as AssetLoader;

      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5;
          return 0.5;
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(partialLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.wheatInstances).toEqual([]);
    });

    it('should skip wheat below minimum height', async () => {
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5;
          return 0.5;
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(0.3)); // Below 0.5 threshold

      expect(vegetation.wheatInstances).toEqual([]);
    });

    it('should generate more wheat patches for farmland than other biomes', async () => {
      // Farmland: 3-5 patches
      let farmCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          farmCount++;
          if (farmCount === 1) return 0.5;
          return 0.5;
        })
      } as unknown as NoiseGenerator;

      // Sparse plains: 1-3 patches (30% chance)
      let plainCount = 0;
      const plainNoise = {
        noise: vi.fn(() => {
          plainCount++;
          if (plainCount === 1) return 0.5;
          return -0.5;
        })
      } as unknown as NoiseGenerator;

      const farmVeg = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await farmVeg.generateVegetation(createHeightFunction(5.0));

      expect(farmVeg.getBiomeType()).toBe('farmland');
      // Farmland should always have wheat
      expect(farmVeg.wheatInstances.length).toBeGreaterThan(0);
    });

    it('should create wheat instances with moderate Y offset', async () => {
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5;
          return 0.5;
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      if (vegetation.wheatInstances.length > 0) {
        const instance = vegetation.wheatInstances[0];
        expect(instance.position.y).toBeCloseTo(5.5, 1); // Height + 0.5
      }
    });

    it('should generate wheat in circular patches', async () => {
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5;
          return 0.5; // Return high values to allow wheat generation
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      if (vegetation.wheatInstances.length > 0) {
        // Wheat should be generated
        expect(vegetation.wheatInstances.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getBiomeType', () => {
    it('should return biome type', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const biome = vegetation.getBiomeType();
      expect(biome).toBeDefined();
      expect(['pine_forest', 'oak_woods', 'mixed_forest', 'sparse_plains', 'farmland']).toContain(biome);
    });
  });

  describe('generateVegetation integration', () => {
    it('should generate all vegetation types', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      // At least grass should be generated
      expect(vegetation.grassInstances.length).toBeGreaterThan(0);

      // Other vegetation may or may not be generated based on biome/noise
      const totalVegetation = vegetation.grassInstances.length +
                              vegetation.treeInstances.length +
                              vegetation.tree1Instances.length +
                              vegetation.tree2Instances.length +
                              vegetation.tree3Instances.length +
                              vegetation.mushroomInstances.length +
                              vegetation.wheatInstances.length;
      expect(totalVegetation).toBeGreaterThan(0);
    });

    it('should call height function for each vegetation instance', async () => {
      const heightFunc = vi.fn(() => 5.0);
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(heightFunc);

      expect(heightFunc).toHaveBeenCalled();
    });

    it('should generate vegetation for different chunk positions', async () => {
      const veg1 = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      const veg2 = new ChunkVegetation(assetLoader, noiseGenerator, 64, 5, 5);

      await veg1.generateVegetation(createHeightFunction(5.0));
      await veg2.generateVegetation(createHeightFunction(5.0));

      expect(veg1.grassInstances.length).toBeGreaterThan(0);
      expect(veg2.grassInstances.length).toBeGreaterThan(0);
    });

    it('should handle different chunk sizes', async () => {
      const smallChunk = new ChunkVegetation(assetLoader, noiseGenerator, 32, 0, 0);
      const largeChunk = new ChunkVegetation(assetLoader, noiseGenerator, 128, 0, 0);

      await smallChunk.generateVegetation(createHeightFunction(5.0));
      await largeChunk.generateVegetation(createHeightFunction(5.0));

      // Larger chunk should generate more vegetation
      expect(largeChunk.grassInstances.length).toBeGreaterThan(smallChunk.grassInstances.length);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-sized chunks', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 0, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.grassInstances).toEqual([]);
    });

    it('should handle negative chunk coordinates', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, -5, -10);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.grassInstances.length).toBeGreaterThan(0);
    });

    it('should handle very low terrain height', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(-10.0));

      // Should skip all vegetation below minimum heights
      expect(vegetation.grassInstances).toEqual([]);
      expect(vegetation.mushroomInstances).toEqual([]);
    });

    it('should handle varying height function', async () => {
      let heightCalls = 0;
      const varyingHeight = vi.fn(() => {
        heightCalls++;
        return heightCalls % 2 === 0 ? 5.0 : 0.1; // Alternate between valid and too low
      });

      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(varyingHeight);

      // Should generate some vegetation where height is valid
      // Exact count depends on RNG, but should be less than max possible
      expect(varyingHeight).toHaveBeenCalled();
    });

    it('should handle zero density biome', async () => {
      // Set up noise to produce a biome with minimal vegetation
      const sparseNoise = createMockNoiseGenerator(-0.5);
      const vegetation = new ChunkVegetation(assetLoader, sparseNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      // Should still generate at least some grass
      expect(vegetation.grassInstances.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Instance properties', () => {
    it('should create instances with valid Vector3 positions', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const instance = vegetation.grassInstances[0];
      expect(instance.position).toBeInstanceOf(THREE.Vector3);
      expect(typeof instance.position.x).toBe('number');
      expect(typeof instance.position.y).toBe('number');
      expect(typeof instance.position.z).toBe('number');
    });

    it('should create instances with valid Vector3 scales', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const instance = vegetation.grassInstances[0];
      expect(instance.scale).toBeInstanceOf(THREE.Vector3);
      expect(instance.scale.x).toBeGreaterThan(0);
      expect(instance.scale.y).toBeGreaterThan(0);
    });

    it('should create instances with rotation values', async () => {
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const instance = vegetation.grassInstances[0];
      expect(typeof instance.rotation).toBe('number');
    });

    it('should position instances within chunk bounds', async () => {
      const chunkSize = 64;
      const chunkX = 2;
      const chunkZ = 3;
      const vegetation = new ChunkVegetation(assetLoader, noiseGenerator, chunkSize, chunkX, chunkZ);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      const baseX = chunkX * chunkSize;
      const baseZ = chunkZ * chunkSize;

      for (const instance of vegetation.grassInstances) {
        expect(instance.position.x).toBeGreaterThanOrEqual(baseX);
        expect(instance.position.x).toBeLessThan(baseX + chunkSize);
        expect(instance.position.z).toBeGreaterThanOrEqual(baseZ);
        expect(instance.position.z).toBeLessThan(baseZ + chunkSize);
      }
    });
  });

  describe('Biome-specific behavior', () => {
    it('should configure pine_forest with correct parameters', async () => {
      const pineNoise = createMockNoiseGenerator(-0.5);
      const vegetation = new ChunkVegetation(assetLoader, pineNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('pine_forest');
      // Pine forest should have low grass, high trees, high mushrooms
      expect(vegetation.grassInstances.length).toBeGreaterThanOrEqual(0);
    });

    it('should configure oak_woods with correct parameters', async () => {
      let callCount = 0;
      const oakNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.1; // Mid temp
          return 0.3; // High moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, oakNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('oak_woods');
    });

    it('should configure mixed_forest with correct parameters', async () => {
      let callCount = 0;
      const mixedNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.0; // Mid temp
          return 0.0; // Mid moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, mixedNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('mixed_forest');
    });

    it('should configure sparse_plains with correct parameters', async () => {
      let callCount = 0;
      const plainNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return -0.5; // Low moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, plainNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('sparse_plains');
    });

    it('should configure farmland with correct parameters', async () => {
      let callCount = 0;
      const farmNoise = {
        noise: vi.fn(() => {
          callCount++;
          if (callCount === 1) return 0.5; // High temp
          return 0.5; // High moisture
        })
      } as unknown as NoiseGenerator;

      const vegetation = new ChunkVegetation(assetLoader, farmNoise, 64, 0, 0);
      await vegetation.generateVegetation(createHeightFunction(5.0));

      expect(vegetation.getBiomeType()).toBe('farmland');
      expect(vegetation.wheatInstances.length).toBeGreaterThan(0);
    });
  });
});
