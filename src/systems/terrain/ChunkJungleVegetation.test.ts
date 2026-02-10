import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ChunkJungleVegetation } from './ChunkJungleVegetation';
import { MathUtils } from '../../utils/Math';

// Mock MathUtils
vi.mock('../../utils/Math', () => ({
  MathUtils: {
    randomInRange: vi.fn((min: number, max: number) => (min + max) / 2),
    poissonDiskSampling: vi.fn((width: number, height: number, minDistance: number) => {
      // Generate simple grid of points for deterministic testing
      const points: THREE.Vector2[] = [];
      const step = minDistance * 1.5;
      for (let x = 0; x < width; x += step) {
        for (let y = 0; y < height; y += step) {
          points.push(new THREE.Vector2(x, y));
        }
      }
      return points;
    })
  }
}));

describe('ChunkJungleVegetation', () => {
  const size = 64;
  const chunkX = 1;
  const chunkZ = 2;
  const getHeightAtLocal = vi.fn((x: number, z: number) => 10.0);

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Math.random for deterministic generation
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  describe('generateVegetation', () => {
    it('should return all expected vegetation instance categories', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      
      expect(result).toHaveProperty('fernInstances');
      expect(result).toHaveProperty('elephantEarInstances');
      expect(result).toHaveProperty('fanPalmInstances');
      expect(result).toHaveProperty('coconutInstances');
      expect(result).toHaveProperty('arecaInstances');
      expect(result).toHaveProperty('dipterocarpInstances');
      expect(result).toHaveProperty('banyanInstances');
    });

    it('should generate fern instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(result.fernInstances.length).toBeGreaterThan(0);
      
      const instance = result.fernInstances[0];
      expect(instance.position.y).toBeCloseTo(10.2, 1); // height + 0.2
      expect(instance.scale.x).toBe(3.0); // (2.4 + 3.6) / 2 from mock randomInRange
      expect(instance.rotation).toBe(0);
    });

    it('should generate elephant ear instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(result.elephantEarInstances.length).toBeGreaterThan(0);
      
      const instance = result.elephantEarInstances[0];
      expect(instance.position.y).toBeCloseTo(10.8, 1); // height + 0.8
      expect(instance.scale.x).toBe(1.25); // (1.0 + 1.5) / 2
    });

    it('should generate fan palm instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(result.fanPalmInstances.length).toBeGreaterThan(0);
      
      const instance = result.fanPalmInstances[0];
      expect(instance.position.y).toBeCloseTo(10.6, 1); // height + 0.6
      expect(instance.scale.x).toBe(1.0); // (0.8 + 1.2) / 2
    });

    it('should generate coconut instances using Poisson disk sampling', () => {
      ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(MathUtils.poissonDiskSampling).toHaveBeenCalledWith(size, size, 12);
    });

    it('should generate coconut instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(result.coconutInstances.length).toBeGreaterThan(0);
      
      const instance = result.coconutInstances[0];
      expect(instance.position.y).toBeCloseTo(12.0, 1); // height + 2.0
      expect(instance.scale.x).toBe(0.9); // (0.8 + 1.0) / 2
    });

    it('should generate areca palm instances using Poisson disk sampling', () => {
      ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(MathUtils.poissonDiskSampling).toHaveBeenCalledWith(size, size, 8);
    });

    it('should generate areca instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(result.arecaInstances.length).toBeGreaterThan(0);
      
      const instance = result.arecaInstances[0];
      expect(instance.position.y).toBeCloseTo(11.6, 1); // height + 1.6
      expect(instance.scale.x).toBe(0.9); // (0.8 + 1.0) / 2
    });

    it('should generate canopy trees using Poisson disk sampling', () => {
      ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(MathUtils.poissonDiskSampling).toHaveBeenCalledWith(size, size, 16);
    });

    it('should alternate between dipterocarp and banyan for giant trees', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      
      expect(result.dipterocarpInstances.length).toBeGreaterThan(0);
      expect(result.banyanInstances.length).toBeGreaterThan(0);
      
      // Since our mock poisson returns points in a grid, and the loop alternates
      // We should see roughly equal numbers if maxTrees permits
      expect(result.dipterocarpInstances.length + result.banyanInstances.length).toBeLessThanOrEqual(
        Math.floor(size * size * (1.0 / 128.0) * 0.15) + 1 // Density calculation from source
      );
    });

    it('should generate dipterocarp instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      const instance = result.dipterocarpInstances[0];
      expect(instance.position.y).toBeCloseTo(18.0, 1); // height + 8.0
      expect(instance.scale.x).toBe(1.0); // (0.9 + 1.1) / 2
    });

    it('should generate banyan instances with correct properties', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      const instance = result.banyanInstances[0];
      expect(instance.position.y).toBeCloseTo(17.0, 1); // height + 7.0
      expect(instance.scale.x).toBe(1.0); // (0.9 + 1.1) / 2
    });

    it('should position instances within chunk bounds', () => {
      const result = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      const baseX = chunkX * size;
      const baseZ = chunkZ * size;

      // Check all instances
      for (const category of Object.values(result)) {
        for (const instance of category) {
          expect(instance.position.x).toBeGreaterThanOrEqual(baseX);
          expect(instance.position.x).toBeLessThanOrEqual(baseX + size);
          expect(instance.position.z).toBeGreaterThanOrEqual(baseZ);
          expect(instance.position.z).toBeLessThanOrEqual(baseZ + size);
        }
      }
    });

    it('should use getHeightAtLocal for each instance', () => {
      ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      expect(getHeightAtLocal).toHaveBeenCalled();
      // Should be called for each instance generated
    });

    it('should handle origin chunk (0,0)', () => {
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      for (const category of Object.values(result)) {
        for (const instance of category) {
          expect(instance.position.x).toBeGreaterThanOrEqual(0);
          expect(instance.position.x).toBeLessThanOrEqual(size);
          expect(instance.position.z).toBeGreaterThanOrEqual(0);
          expect(instance.position.z).toBeLessThanOrEqual(size);
        }
      }
    });

    it('should handle negative chunk coordinates', () => {
      const result = ChunkJungleVegetation.generateVegetation(-1, -1, size, getHeightAtLocal);
      const baseX = -1 * size;
      const baseZ = -1 * size;
      for (const category of Object.values(result)) {
        for (const instance of category) {
          expect(instance.position.x).toBeGreaterThanOrEqual(baseX);
          expect(instance.position.x).toBeLessThanOrEqual(baseX + size);
          expect(instance.position.z).toBeGreaterThanOrEqual(baseZ);
          expect(instance.position.z).toBeLessThanOrEqual(baseZ + size);
        }
      }
    });

    it('should be deterministic when random is mocked', () => {
      const result1 = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      const result2 = ChunkJungleVegetation.generateVegetation(chunkX, chunkZ, size, getHeightAtLocal);
      
      expect(result1).toEqual(result2);
    });

    it('should produce different counts for different chunk sizes', () => {
      const result32 = ChunkJungleVegetation.generateVegetation(0, 0, 32, getHeightAtLocal);
      const result64 = ChunkJungleVegetation.generateVegetation(0, 0, 64, getHeightAtLocal);
      
      expect(result64.fernInstances.length).toBeGreaterThan(result32.fernInstances.length);
      expect(result64.elephantEarInstances.length).toBeGreaterThan(result32.elephantEarInstances.length);
    });

    it('should handle zero size chunk', () => {
      const result = ChunkJungleVegetation.generateVegetation(0, 0, 0, getHeightAtLocal);
      expect(result.fernInstances.length).toBe(0);
      expect(result.elephantEarInstances.length).toBe(0);
      expect(result.fanPalmInstances.length).toBe(0);
      expect(result.coconutInstances.length).toBe(0);
    });

    it('should respect height returned by callback', () => {
      const customHeight = (x: number, z: number) => x + z;
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, customHeight);
      
      for (const instance of result.fernInstances) {
        const localX = instance.position.x;
        const localZ = instance.position.z;
        const expectedHeight = localX + localZ + 0.2;
        expect(instance.position.y).toBeCloseTo(expectedHeight, 1);
      }
    });

    it('should generate different positions for different chunk coordinates', () => {
      const result1 = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      const result2 = ChunkJungleVegetation.generateVegetation(1, 1, size, getHeightAtLocal);
      
      // Even if random is mocked, baseX/baseZ should make positions different
      expect(result1.fernInstances[0].position.x).not.toBe(result2.fernInstances[0].position.x);
    });

    it('should generate fern instances with scale in range [2.4, 3.6]', () => {
      vi.mocked(MathUtils.randomInRange).mockImplementation((min, max) => (min + max) / 2);
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      
      expect(MathUtils.randomInRange).toHaveBeenCalledWith(2.4, 3.6);
      for (const instance of result.fernInstances) {
        expect(instance.scale.x).toBeGreaterThanOrEqual(2.4);
        expect(instance.scale.x).toBeLessThanOrEqual(3.6);
      }
    });

    it('should generate elephant ear instances with scale in range [1.0, 1.5]', () => {
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      expect(MathUtils.randomInRange).toHaveBeenCalledWith(1.0, 1.5);
      for (const instance of result.elephantEarInstances) {
        expect(instance.scale.x).toBeGreaterThanOrEqual(1.0);
        expect(instance.scale.x).toBeLessThanOrEqual(1.5);
      }
    });

    it('should generate fan palm instances with scale in range [0.8, 1.2]', () => {
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      expect(MathUtils.randomInRange).toHaveBeenCalledWith(0.8, 1.2);
      for (const instance of result.fanPalmInstances) {
        expect(instance.scale.x).toBeGreaterThanOrEqual(0.8);
        expect(instance.scale.x).toBeLessThanOrEqual(1.2);
      }
    });

    it('should generate giant trees with scale in range [0.9, 1.1]', () => {
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      expect(MathUtils.randomInRange).toHaveBeenCalledWith(0.9, 1.1);
      for (const instance of result.dipterocarpInstances) {
        expect(instance.scale.x).toBeGreaterThanOrEqual(0.9);
        expect(instance.scale.x).toBeLessThanOrEqual(1.1);
      }
      for (const instance of result.banyanInstances) {
        expect(instance.scale.x).toBeGreaterThanOrEqual(0.9);
        expect(instance.scale.x).toBeLessThanOrEqual(1.1);
      }
    });

    it('should handle large chunk sizes', () => {
      const largeSize = 256;
      const result = ChunkJungleVegetation.generateVegetation(0, 0, largeSize, getHeightAtLocal);
      expect(result.fernInstances.length).toBeGreaterThan(size * size * (1.0/128.0) * 5);
    });

    it('should handle very high terrain heights', () => {
      const highHeight = (x: number, z: number) => 1000.0;
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, highHeight);
      expect(result.fernInstances[0].position.y).toBeGreaterThan(1000.0);
    });

    it('should handle very low terrain heights', () => {
      const lowHeight = (x: number, z: number) => -500.0;
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, lowHeight);
      expect(result.fernInstances[0].position.y).toBeGreaterThan(-500.0);
    });

    it('should respect the maxCoconuts limit', () => {
      // Mock poisson to return many points
      vi.mocked(MathUtils.poissonDiskSampling).mockReturnValue(Array(1000).fill(new THREE.Vector2(0, 0)));
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      
      const DENSITY_PER_UNIT = 1.0 / 128.0;
      const maxCoconuts = Math.floor(size * size * DENSITY_PER_UNIT * 0.3);
      expect(result.coconutInstances.length).toBeLessThanOrEqual(maxCoconuts);
    });

    it('should respect the maxAreca limit', () => {
      vi.mocked(MathUtils.poissonDiskSampling).mockReturnValue(Array(1000).fill(new THREE.Vector2(0, 0)));
      const result = ChunkJungleVegetation.generateVegetation(0, 0, size, getHeightAtLocal);
      
      const DENSITY_PER_UNIT = 1.0 / 128.0;
      const maxAreca = Math.floor(size * size * DENSITY_PER_UNIT * 0.4);
      expect(result.arecaInstances.length).toBeLessThanOrEqual(maxAreca);
    });
  });

  describe('applyWorkerVegetation', () => {
    it('should correctly map fern data', () => {
      const veg = createEmptyWorkerData();
      veg.fern.push({ x: 10, y: 20, z: 30, sx: 2, sy: 3 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.fernInstances.length).toBe(1);
      expect(result.fernInstances[0].position.x).toBe(10);
      expect(result.fernInstances[0].position.y).toBe(20);
      expect(result.fernInstances[0].position.z).toBe(30);
      expect(result.fernInstances[0].scale.x).toBe(2);
      expect(result.fernInstances[0].scale.y).toBe(3);
      expect(result.fernInstances[0].rotation).toBe(0);
    });

    it('should correctly map elephant ear data', () => {
      const veg = createEmptyWorkerData();
      veg.elephantEar.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.elephantEarInstances.length).toBe(1);
      expect(result.elephantEarInstances[0].position.y).toBe(2);
    });

    it('should correctly map fan palm data', () => {
      const veg = createEmptyWorkerData();
      veg.fanPalm.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.fanPalmInstances.length).toBe(1);
      expect(result.fanPalmInstances[0].position.y).toBe(2);
    });

    it('should correctly map coconut data', () => {
      const veg = createEmptyWorkerData();
      veg.coconut.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.coconutInstances.length).toBe(1);
      expect(result.coconutInstances[0].position.y).toBe(2);
    });

    it('should correctly map areca data', () => {
      const veg = createEmptyWorkerData();
      veg.areca.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.arecaInstances.length).toBe(1);
      expect(result.arecaInstances[0].position.y).toBe(2);
    });

    it('should correctly map dipterocarp data', () => {
      const veg = createEmptyWorkerData();
      veg.dipterocarp.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.dipterocarpInstances.length).toBe(1);
      expect(result.dipterocarpInstances[0].position.y).toBe(2);
    });

    it('should correctly map banyan data', () => {
      const veg = createEmptyWorkerData();
      veg.banyan.push({ x: 1, y: 2, z: 3, sx: 4, sy: 5 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.banyanInstances.length).toBe(1);
      expect(result.banyanInstances[0].position.y).toBe(2);
    });

    it('should handle multiple instances per type', () => {
      const veg = createEmptyWorkerData();
      veg.fern.push({ x: 1, y: 1, z: 1, sx: 1, sy: 1 });
      veg.fern.push({ x: 2, y: 2, z: 2, sx: 2, sy: 2 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      expect(result.fernInstances.length).toBe(2);
    });

    it('should handle all empty arrays', () => {
      const veg = createEmptyWorkerData();
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      
      expect(result.fernInstances).toEqual([]);
      expect(result.elephantEarInstances).toEqual([]);
      expect(result.fanPalmInstances).toEqual([]);
      expect(result.coconutInstances).toEqual([]);
      expect(result.arecaInstances).toEqual([]);
      expect(result.dipterocarpInstances).toEqual([]);
      expect(result.banyanInstances).toEqual([]);
    });

    it('should return BillboardInstance objects with Vector3s', () => {
      const veg = createEmptyWorkerData();
      veg.fern.push({ x: 10, y: 20, z: 30, sx: 2, sy: 3 });
      
      const result = ChunkJungleVegetation.applyWorkerVegetation(veg);
      const instance = result.fernInstances[0];
      
      expect(instance.position).toBeInstanceOf(THREE.Vector3);
      expect(instance.scale).toBeInstanceOf(THREE.Vector3);
      expect(typeof instance.rotation).toBe('number');
    });
  });

  function createEmptyWorkerData() {
    return {
      fern: [],
      elephantEar: [],
      fanPalm: [],
      coconut: [],
      areca: [],
      dipterocarp: [],
      banyan: []
    } as any;
  }
});
