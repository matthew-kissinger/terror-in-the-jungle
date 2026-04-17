import { describe, it, expect } from 'vitest';
import { BakedHeightProvider } from './BakedHeightProvider';

function make2x2Grid(h00: number, h10: number, h01: number, h11: number): Float32Array {
  // 2x2 grid: row-major [z0x0, z0x1, z1x0, z1x1]
  return new Float32Array([h00, h10, h01, h11]);
}

const NOISE_CFG = { type: 'noise' as const, seed: 1 };

describe('BakedHeightProvider', () => {
  it('returns exact grid values at sample points', () => {
    const data = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
    ]);
    const provider = new BakedHeightProvider(data, 3, 100, NOISE_CFG);

    // Corners of the 3x3 grid over a 100m world (samples at -50, 0, +50).
    expect(provider.getHeightAt(-50, -50)).toBeCloseTo(10);
    expect(provider.getHeightAt(50, 50)).toBeCloseTo(90);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(50);
  });

  it('bilinear interpolates between grid points', () => {
    const data = make2x2Grid(0, 10, 20, 30);
    const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

    // Midpoint between all four corners of a 2x2 grid averages to 15.
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(15);
  });

  it('clamps queries outside the world to the edge sample (ClampToEdge semantics)', () => {
    const data = make2x2Grid(5, 15, 25, 35);
    const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

    expect(provider.getHeightAt(-200, -50)).toBeCloseTo(5);
    expect(provider.getHeightAt(200, 50)).toBeCloseTo(35);
  });

  it('returns the original worker config unchanged for re-bake flows', () => {
    const workerConfig = { type: 'noise' as const, seed: 42 };
    const provider = new BakedHeightProvider(new Float32Array(4), 2, 100, workerConfig);
    expect(provider.getWorkerConfig()).toBe(workerConfig);
  });

  it('is exact at grid sample points for non-trivial grids', () => {
    const data = new Float32Array([
      0, 500, 1000,
      250, 750, 500,
      1000, 250, 0,
    ]);
    const gs = 3;
    const ws = 200;
    const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

    const step = ws / (gs - 1);
    for (let zi = 0; zi < gs; zi++) {
      for (let xi = 0; xi < gs; xi++) {
        const wx = -ws / 2 + xi * step;
        const wz = -ws / 2 + zi * step;
        expect(provider.getHeightAt(wx, wz)).toBeCloseTo(data[zi * gs + xi], 10);
      }
    }
  });
});
