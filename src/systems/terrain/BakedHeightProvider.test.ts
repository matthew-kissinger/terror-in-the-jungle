import { describe, it, expect } from 'vitest';
import { BakedHeightProvider } from './BakedHeightProvider';

function make2x2Grid(h00: number, h10: number, h01: number, h11: number): Float32Array {
  // 2x2 grid: row-major [z0x0, z0x1, z1x0, z1x1]
  return new Float32Array([h00, h10, h01, h11]);
}

describe('BakedHeightProvider', () => {
  it('returns exact grid values at sample points', () => {
    // 3x3 grid over 100m world: samples at -50, 0, +50
    const data = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
    ]);
    const provider = new BakedHeightProvider(data, 3, 100, { type: 'noise', seed: 1 });

    expect(provider.getHeightAt(-50, -50)).toBeCloseTo(10);
    expect(provider.getHeightAt(0, -50)).toBeCloseTo(20);
    expect(provider.getHeightAt(50, -50)).toBeCloseTo(30);
    expect(provider.getHeightAt(-50, 0)).toBeCloseTo(40);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(50);
    expect(provider.getHeightAt(50, 0)).toBeCloseTo(60);
    expect(provider.getHeightAt(-50, 50)).toBeCloseTo(70);
    expect(provider.getHeightAt(0, 50)).toBeCloseTo(80);
    expect(provider.getHeightAt(50, 50)).toBeCloseTo(90);
  });

  it('bilinear interpolates between grid points', () => {
    const data = make2x2Grid(0, 10, 20, 30);
    const provider = new BakedHeightProvider(data, 2, 100, { type: 'noise', seed: 1 });

    // Center of 2x2 grid: average of all four corners
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(15);

    // Midpoint along X edge at z=-50: (0 + 10) / 2
    expect(provider.getHeightAt(0, -50)).toBeCloseTo(5);

    // Midpoint along Z edge at x=-50: (0 + 20) / 2
    expect(provider.getHeightAt(-50, 0)).toBeCloseTo(10);
  });

  it('clamps at world boundaries like GPU ClampToEdge', () => {
    const data = make2x2Grid(5, 15, 25, 35);
    const provider = new BakedHeightProvider(data, 2, 100, { type: 'noise', seed: 1 });

    // Far outside left: should clamp to left column
    expect(provider.getHeightAt(-200, -50)).toBeCloseTo(5);
    expect(provider.getHeightAt(-200, 50)).toBeCloseTo(25);

    // Far outside right: should clamp to right column
    expect(provider.getHeightAt(200, -50)).toBeCloseTo(15);
    expect(provider.getHeightAt(200, 50)).toBeCloseTo(35);
  });

  it('matches HeightmapGPU.sampleHeight for larger grids', () => {
    // 5x5 grid over 200m: step = 50m, samples at -100, -50, 0, 50, 100
    const gridSize = 5;
    const worldSize = 200;
    const data = new Float32Array(gridSize * gridSize);
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        data[z * gridSize + x] = x * 10 + z * 100;
      }
    }

    const provider = new BakedHeightProvider(data, gridSize, worldSize, { type: 'noise', seed: 1 });

    // Test at grid points
    expect(provider.getHeightAt(-100, -100)).toBeCloseTo(0);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(220);
    expect(provider.getHeightAt(100, 100)).toBeCloseTo(440);

    // Test between grid points (quarter way from (-100,-100) to (-50,-100))
    expect(provider.getHeightAt(-75, -100)).toBeCloseTo(5);
  });

  it('returns original worker config unchanged', () => {
    const workerConfig = { type: 'noise' as const, seed: 42 };
    const provider = new BakedHeightProvider(new Float32Array(4), 2, 100, workerConfig);
    expect(provider.getWorkerConfig()).toBe(workerConfig);
  });
});
