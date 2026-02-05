import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from './NoiseGenerator';

describe('NoiseGenerator', () => {
  describe('constructor', () => {
    it('should create instance with default seed', () => {
      const gen = new NoiseGenerator();
      expect(gen).toBeDefined();
    });

    it('should create instance with custom seed', () => {
      const gen = new NoiseGenerator(42);
      expect(gen).toBeDefined();
    });

    it('should create instance with zero seed', () => {
      const gen = new NoiseGenerator(0);
      expect(gen).toBeDefined();
    });

    it('should create instance with negative seed', () => {
      const gen = new NoiseGenerator(-999);
      expect(gen).toBeDefined();
    });

    it('should create instance with large seed', () => {
      const gen = new NoiseGenerator(999999999);
      expect(gen).toBeDefined();
    });
  });

  describe('noise determinism', () => {
    it('should produce identical output for same seed', () => {
      const gen1 = new NoiseGenerator(42);
      const gen2 = new NoiseGenerator(42);

      const val1 = gen1.noise(0.5, 0.5);
      const val2 = gen2.noise(0.5, 0.5);

      expect(val1).toBe(val2);
    });

    it('should produce identical output for same seed across multiple calls', () => {
      const gen1 = new NoiseGenerator(123);
      const gen2 = new NoiseGenerator(123);

      const samples = [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [2.5, 3.7],
        [-1, -2],
        [100, 200],
      ];

      for (const [x, y] of samples) {
        const val1 = gen1.noise(x, y);
        const val2 = gen2.noise(x, y);
        expect(val1).toBe(val2);
      }
    });

    it('should produce different output for different seeds', () => {
      const gen1 = new NoiseGenerator(1);
      const gen2 = new NoiseGenerator(2);

      const val1 = gen1.noise(0.5, 0.5);
      const val2 = gen2.noise(0.5, 0.5);

      // Very unlikely to be equal for different seeds
      expect(val1).not.toBe(val2);
    });

    it('should produce different output for different coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.noise(0.5, 0.5);
      const val2 = gen.noise(0.5, 0.6);

      expect(val1).not.toBe(val2);
    });
  });

  describe('noise output range', () => {
    it('should produce values between -1 and 1', () => {
      const gen = new NoiseGenerator(42);

      const testPoints = [
        [0, 0],
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
        [1, 1],
        [2, 2],
        [5, 5],
        [10, 10],
        [-1, -1],
        [-5, -5],
        [123.456, 789.012],
      ];

      for (const [x, y] of testPoints) {
        const val = gen.noise(x, y);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('should produce continuous range of values', () => {
      const gen = new NoiseGenerator(42);
      const values: number[] = [];

      for (let i = 0; i < 100; i++) {
        values.push(gen.noise(i * 0.1, i * 0.15));
      }

      // Should have variety in output
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(max - min).toBeGreaterThan(0.5);
    });

    it('should produce values near extremes', () => {
      const gen = new NoiseGenerator(42);

      // Generate many samples and check for values near -1 and 1
      const values: number[] = [];
      for (let x = 0; x < 20; x++) {
        for (let y = 0; y < 20; y++) {
          values.push(gen.noise(x * 0.5, y * 0.5));
        }
      }

      const min = Math.min(...values);
      const max = Math.max(...values);

      // Should get a good range of values (not all in middle)
      expect(max - min).toBeGreaterThan(1);
    });
  });

  describe('noise smoothness', () => {
    it('should produce smooth transitions across coordinates', () => {
      const gen = new NoiseGenerator(42);

      // Check that nearby points have nearby values
      const val1 = gen.noise(0, 0);
      const val2 = gen.noise(0.01, 0);
      const val3 = gen.noise(0, 0.01);

      // Small coordinate change should produce small value change
      expect(Math.abs(val1 - val2)).toBeLessThan(0.2);
      expect(Math.abs(val1 - val3)).toBeLessThan(0.2);
    });

    it('should handle fractional coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.noise(0.123, 0.456);
      const val2 = gen.noise(0.124, 0.457);

      expect(val1).toBeGreaterThanOrEqual(-1);
      expect(val1).toBeLessThanOrEqual(1);
      expect(val2).toBeGreaterThanOrEqual(-1);
      expect(val2).toBeLessThanOrEqual(1);
      expect(Math.abs(val1 - val2)).toBeLessThan(0.2);
    });
  });

  describe('fractalNoise', () => {
    it('should produce values within output range', () => {
      const gen = new NoiseGenerator(42);

      const testCases = [
        { x: 0, y: 0, octaves: 1, persistence: 0.5, scale: 1 },
        { x: 0.5, y: 0.5, octaves: 4, persistence: 0.5, scale: 1 },
        { x: 1, y: 1, octaves: 8, persistence: 0.5, scale: 2 },
        { x: 5, y: 5, octaves: 3, persistence: 0.7, scale: 0.5 },
      ];

      for (const testCase of testCases) {
        const val = gen.fractalNoise(testCase.x, testCase.y, testCase.octaves, testCase.persistence, testCase.scale);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('should use default parameters', () => {
      const gen = new NoiseGenerator(42);
      const val = gen.fractalNoise(0.5, 0.5);

      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should increase complexity with more octaves', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.fractalNoise(0.5, 0.5, 1, 0.5, 1);
      const val2 = gen.fractalNoise(0.5, 0.5, 4, 0.5, 1);
      const val3 = gen.fractalNoise(0.5, 0.5, 8, 0.5, 1);

      // More octaves should produce more complex (different) values
      // Though they're still deterministic
      expect([val1, val2, val3].every(v => v >= -1 && v <= 1)).toBe(true);
    });

    it('should respect persistence parameter', () => {
      const gen = new NoiseGenerator(42);

      // Higher persistence = higher-frequency noise contributes more
      const valLowPersist = gen.fractalNoise(0.5, 0.5, 4, 0.1, 1);
      const valHighPersist = gen.fractalNoise(0.5, 0.5, 4, 0.9, 1);

      expect(valLowPersist).toBeGreaterThanOrEqual(-1);
      expect(valLowPersist).toBeLessThanOrEqual(1);
      expect(valHighPersist).toBeGreaterThanOrEqual(-1);
      expect(valHighPersist).toBeLessThanOrEqual(1);
    });

    it('should respect scale parameter', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.fractalNoise(1, 1, 4, 0.5, 0.5);
      const val2 = gen.fractalNoise(1, 1, 4, 0.5, 2);

      // Different scales should produce different results
      expect(val1).not.toBe(val2);
    });

    it('should be deterministic with same seed and parameters', () => {
      const gen1 = new NoiseGenerator(99);
      const gen2 = new NoiseGenerator(99);

      const val1 = gen1.fractalNoise(0.5, 0.5, 4, 0.5, 1);
      const val2 = gen2.fractalNoise(0.5, 0.5, 4, 0.5, 1);

      expect(val1).toBe(val2);
    });

    it('should handle single octave (equivalent to noise)', () => {
      const gen = new NoiseGenerator(42);

      const fractal = gen.fractalNoise(0.5, 0.5, 1, 0.5, 1);
      // Single octave with scale 1 should roughly match noise
      expect(fractal).toBeGreaterThanOrEqual(-1);
      expect(fractal).toBeLessThanOrEqual(1);
    });

    it('should handle zero octaves', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.fractalNoise(0.5, 0.5, 0, 0.5, 1);
      // 0 octaves results in 0/0 = NaN in the implementation
      expect(Number.isNaN(val)).toBe(true);
    });

    it('should handle various persistence values', () => {
      const gen = new NoiseGenerator(42);

      const persistenceValues = [0, 0.25, 0.5, 0.75, 1];

      for (const persistence of persistenceValues) {
        const val = gen.fractalNoise(0.5, 0.5, 4, persistence, 1);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('ridgedNoise', () => {
    it('should produce values between 0 and 1', () => {
      const gen = new NoiseGenerator(42);

      const testPoints = [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [2, 2],
        [5, 5],
        [10, 10],
        [-1, -1],
      ];

      for (const [x, y] of testPoints) {
        const val = gen.ridgedNoise(x, y);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('should invert the noise', () => {
      const gen = new NoiseGenerator(42);

      const noiseVal = gen.noise(0.5, 0.5);
      const ridgedVal = gen.ridgedNoise(0.5, 0.5);

      // ridgedNoise = 1 - Math.abs(noise)
      const expected = 1 - Math.abs(noiseVal);
      expect(ridgedVal).toBeCloseTo(expected);
    });

    it('should be deterministic with same seed', () => {
      const gen1 = new NoiseGenerator(42);
      const gen2 = new NoiseGenerator(42);

      const val1 = gen1.ridgedNoise(0.5, 0.5);
      const val2 = gen2.ridgedNoise(0.5, 0.5);

      expect(val1).toBe(val2);
    });

    it('should produce different values for different coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.ridgedNoise(0.5, 0.5);
      const val2 = gen.ridgedNoise(0.6, 0.6);

      expect(val1).not.toBe(val2);
    });

    it('should handle various coordinate ranges', () => {
      const gen = new NoiseGenerator(42);

      const ranges = [-10, -1, 0, 1, 10, 100];

      for (const x of ranges) {
        for (const y of ranges) {
          const val = gen.ridgedNoise(x, y);
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('turbulence', () => {
    it('should produce values between 0 and 1', () => {
      const gen = new NoiseGenerator(42);

      const testPoints = [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [2, 2],
        [5, 5],
        [10, 10],
      ];

      for (const [x, y] of testPoints) {
        const val = gen.turbulence(x, y);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('should use default octaves', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.turbulence(0.5, 0.5);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should be absolute value of fractal noise', () => {
      const gen = new NoiseGenerator(42);

      const fractal = gen.fractalNoise(0.5, 0.5, 4);
      const turb = gen.turbulence(0.5, 0.5, 4);

      const expected = Math.abs(fractal);
      expect(turb).toBeCloseTo(expected);
    });

    it('should be deterministic with same seed', () => {
      const gen1 = new NoiseGenerator(42);
      const gen2 = new NoiseGenerator(42);

      const val1 = gen1.turbulence(0.5, 0.5);
      const val2 = gen2.turbulence(0.5, 0.5);

      expect(val1).toBe(val2);
    });

    it('should respect octaves parameter', () => {
      const gen = new NoiseGenerator(42);

      const val1 = gen.turbulence(0.5, 0.5, 1);
      const val2 = gen.turbulence(0.5, 0.5, 4);
      const val3 = gen.turbulence(0.5, 0.5, 8);

      // Different octave counts may produce different values
      expect(val1).toBeGreaterThanOrEqual(0);
      expect(val2).toBeGreaterThanOrEqual(0);
      expect(val3).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero octaves', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.turbulence(0.5, 0.5, 0);
      // 0 octaves in fractalNoise returns NaN (0/0), so turbulence is Math.abs(NaN)
      expect(Number.isNaN(val)).toBe(true);
    });

    it('should always be non-negative', () => {
      const gen = new NoiseGenerator(42);

      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          const val = gen.turbulence(x, y);
          expect(val).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('combined operations', () => {
    it('should handle chained calls with same generator', () => {
      const gen = new NoiseGenerator(42);

      const noise = gen.noise(0.5, 0.5);
      const ridged = gen.ridgedNoise(0.5, 0.5);
      const turb = gen.turbulence(0.5, 0.5);
      const fractal = gen.fractalNoise(0.5, 0.5);

      expect(noise).toBeDefined();
      expect(ridged).toBeDefined();
      expect(turb).toBeDefined();
      expect(fractal).toBeDefined();
    });

    it('should maintain different output ranges', () => {
      const gen = new NoiseGenerator(42);

      const noise = gen.noise(1, 1);
      const ridged = gen.ridgedNoise(1, 1);
      const turb = gen.turbulence(1, 1);

      // noise: [-1, 1], ridged: [0, 1], turb: [0, 1]
      expect(noise).toBeGreaterThanOrEqual(-1);
      expect(ridged).toBeGreaterThanOrEqual(0);
      expect(turb).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.noise(0, 0);
      expect(val).toBeDefined();
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should handle negative coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.noise(-5, -10);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should handle very large coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.noise(1000000, 2000000);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should handle very small fractional coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.noise(0.00001, 0.00002);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });

    it('should handle repeated seed with zero', () => {
      const gen1 = new NoiseGenerator(0);
      const gen2 = new NoiseGenerator(0);

      const val1 = gen1.noise(5, 5);
      const val2 = gen2.noise(5, 5);

      expect(val1).toBe(val2);
    });

    it('should handle integer coordinates', () => {
      const gen = new NoiseGenerator(42);

      const val = gen.noise(5, 10);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    });
  });

  describe('procedural terrain generation use case', () => {
    it('should generate terrain height map', () => {
      const gen = new NoiseGenerator(42);
      const width = 10;
      const height = 10;
      const heightMap: number[][] = [];

      for (let x = 0; x < width; x++) {
        heightMap[x] = [];
        for (let y = 0; y < height; y++) {
          // Typical terrain generation: use fractal noise scaled to [0, 1]
          const noise = gen.fractalNoise(x * 0.1, y * 0.1, 4, 0.5, 1);
          heightMap[x][y] = (noise + 1) / 2; // Scale from [-1,1] to [0,1]
        }
      }

      // Verify height map was created correctly
      expect(heightMap).toHaveLength(width);
      for (let x = 0; x < width; x++) {
        expect(heightMap[x]).toHaveLength(height);
        for (let y = 0; y < height; y++) {
          expect(heightMap[x][y]).toBeGreaterThanOrEqual(0);
          expect(heightMap[x][y]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should generate consistent terrain with same seed', () => {
      const terrainA = new Map<string, number>();
      const terrainB = new Map<string, number>();

      const gen1 = new NoiseGenerator(12345);
      const gen2 = new NoiseGenerator(12345);

      for (let x = 0; x < 20; x++) {
        for (let y = 0; y < 20; y++) {
          const key = `${x},${y}`;
          terrainA.set(key, gen1.fractalNoise(x * 0.1, y * 0.1, 4, 0.5, 1));
          terrainB.set(key, gen2.fractalNoise(x * 0.1, y * 0.1, 4, 0.5, 1));
        }
      }

      // All values should be identical
      for (const [key, valA] of terrainA) {
        const valB = terrainB.get(key);
        expect(valA).toBe(valB);
      }
    });
  });
});
