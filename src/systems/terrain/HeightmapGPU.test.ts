import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js
vi.mock('three', () => ({
  DataTexture: class {
    needsUpdate = false;
    minFilter = 0;
    magFilter = 0;
    wrapS = 0;
    wrapT = 0;
    dispose = vi.fn();
    constructor(public data: any, public width: number, public height: number) {}
  },
  RedFormat: 1024,
  RGBAFormat: 1028,
  FloatType: 1015,
  UnsignedByteType: 1009,
  LinearFilter: 1006,
  ClampToEdgeWrapping: 1001,
}));

import { HeightmapGPU } from './HeightmapGPU';
import type { IHeightProvider } from './IHeightProvider';

function makeFlatProvider(height: number): IHeightProvider {
  return {
    getHeightAt: () => height,
    getWorkerConfig: () => ({ type: 'noise', seed: 1 }),
  };
}

describe('HeightmapGPU', () => {
  let gpu: HeightmapGPU;

  beforeEach(() => {
    gpu = new HeightmapGPU();
  });

  describe('bakeFromProvider', () => {
    it('creates height texture with correct dimensions', () => {
      gpu.bakeFromProvider(makeFlatProvider(10), 64, 256);

      expect(gpu.getHeightTexture()).not.toBeNull();
      expect(gpu.getGridSize()).toBe(64);
      expect(gpu.getWorldSize()).toBe(256);
    });

    it('stores height data on CPU', () => {
      gpu.bakeFromProvider(makeFlatProvider(42), 16, 100);

      const data = gpu.getHeightData();
      expect(data).not.toBeNull();
      expect(data!.length).toBe(16 * 16);
      // All values should be 42 for a flat provider
      for (let i = 0; i < data!.length; i++) {
        expect(data![i]).toBe(42);
      }
    });

    it('creates normal map texture', () => {
      gpu.bakeFromProvider(makeFlatProvider(0), 16, 100);
      expect(gpu.getNormalTexture()).not.toBeNull();
    });
  });

  describe('uploadDEM', () => {
    it('uploads DEM data correctly', () => {
      const data = new Float32Array(4 * 4);
      data.fill(50);

      gpu.uploadDEM(data, 4, 4, 100);

      expect(gpu.getGridSize()).toBe(4);
      expect(gpu.getWorldSize()).toBe(100);
      expect(gpu.getHeightTexture()).not.toBeNull();
      expect(gpu.getNormalTexture()).not.toBeNull();
    });
  });

  describe('sampleHeight', () => {
    it('returns correct height for flat terrain', () => {
      gpu.bakeFromProvider(makeFlatProvider(25), 32, 200);

      expect(gpu.sampleHeight(0, 0)).toBeCloseTo(25, 1);
      expect(gpu.sampleHeight(50, 50)).toBeCloseTo(25, 1);
    });

    it('bilinear interpolates between grid points', () => {
      const data = new Float32Array([0, 10, 0, 10]);
      gpu.uploadDEM(data, 2, 2, 100);

      // Center should be interpolated
      const center = gpu.sampleHeight(0, 0);
      expect(center).toBeGreaterThanOrEqual(0);
      expect(center).toBeLessThanOrEqual(10);
    });

    it('returns 0 when no data loaded', () => {
      expect(gpu.sampleHeight(0, 0)).toBe(0);
    });
  });

  describe('dispose', () => {
    it('cleans up textures', () => {
      gpu.bakeFromProvider(makeFlatProvider(0), 16, 100);
      gpu.dispose();

      expect(gpu.getHeightTexture()).toBeNull();
      expect(gpu.getNormalTexture()).toBeNull();
      expect(gpu.getHeightData()).toBeNull();
    });
  });
});
