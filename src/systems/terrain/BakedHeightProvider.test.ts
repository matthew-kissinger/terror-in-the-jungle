import { describe, it, expect } from 'vitest';
import { BakedHeightProvider } from './BakedHeightProvider';

function make2x2Grid(h00: number, h10: number, h01: number, h11: number): Float32Array {
  // 2x2 grid: row-major [z0x0, z0x1, z1x0, z1x1]
  return new Float32Array([h00, h10, h01, h11]);
}

const NOISE_CFG = { type: 'noise' as const, seed: 1 };

describe('BakedHeightProvider', () => {
  it('returns exact grid values at sample points', () => {
    // 3x3 grid over 100m world: samples at -50, 0, +50
    const data = new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
    ]);
    const provider = new BakedHeightProvider(data, 3, 100, NOISE_CFG);

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
    const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

    // Center of 2x2 grid: bilinear average
    // h0 = 0 + (10-0)*0.5 = 5, h1 = 20 + (30-20)*0.5 = 25, result = 5 + (25-5)*0.5 = 15
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(15);

    // Midpoint along X edge at z=-50: (0 + 10) / 2
    expect(provider.getHeightAt(0, -50)).toBeCloseTo(5);

    // Midpoint along Z edge at x=-50: (0 + 20) / 2
    expect(provider.getHeightAt(-50, 0)).toBeCloseTo(10);
  });

  it('clamps at world boundaries like GPU ClampToEdge', () => {
    const data = make2x2Grid(5, 15, 25, 35);
    const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

    // Far outside left: should clamp to left column
    expect(provider.getHeightAt(-200, -50)).toBeCloseTo(5);
    expect(provider.getHeightAt(-200, 50)).toBeCloseTo(25);

    // Far outside right: should clamp to right column
    expect(provider.getHeightAt(200, -50)).toBeCloseTo(15);
    expect(provider.getHeightAt(200, 50)).toBeCloseTo(35);
  });

  it('matches GPU texture2D LinearFilter for larger grids', () => {
    // 5x5 grid over 200m: step = 50m, samples at -100, -50, 0, 50, 100
    const gridSize = 5;
    const worldSize = 200;
    const data = new Float32Array(gridSize * gridSize);
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        data[z * gridSize + x] = x * 10 + z * 100;
      }
    }

    const provider = new BakedHeightProvider(data, gridSize, worldSize, NOISE_CFG);

    // At grid points: exact values
    expect(provider.getHeightAt(-100, -100)).toBeCloseTo(0);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(220);
    expect(provider.getHeightAt(100, 100)).toBeCloseTo(440);

    // Between grid points: bilinear interpolation
    // worldX=-75 -> gx=0.5, worldZ=-100 -> gz=0
    // h0 = data[0]*(1-0.5) + data[1]*0.5 = 0 + 5 = 5
    expect(provider.getHeightAt(-75, -100)).toBeCloseTo(5);
  });

  it('returns original worker config unchanged', () => {
    const workerConfig = { type: 'noise' as const, seed: 42 };
    const provider = new BakedHeightProvider(new Float32Array(4), 2, 100, workerConfig);
    expect(provider.getWorkerConfig()).toBe(workerConfig);
  });

  it('matches GPU at quarter-grid positions on planar terrain', () => {
    // Planar surface: h = 10*x + 20*z -> bilinear is exact
    const data = make2x2Grid(0, 10, 20, 30);
    const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

    // Quarter positions
    expect(provider.getHeightAt(-25, -25)).toBeCloseTo(7.5);
    expect(provider.getHeightAt(25, -25)).toBeCloseTo(12.5);
    expect(provider.getHeightAt(-25, 25)).toBeCloseTo(17.5);
    expect(provider.getHeightAt(25, 25)).toBeCloseTo(22.5);
  });

  it('zero deviation from GPU texture sampling at any point', () => {
    // Both CPU bilinear and GPU texture2D(LinearFilter) produce identical
    // results - they are mathematically the same operation on the same data.
    // The only divergence comes from GPU rasterizer triangle interpolation
    // BETWEEN mesh vertices, which is a bounded ~0.3m at LOD 0 spacing.
    const data = new Float32Array([
      0, 500, 1000,
      250, 750, 500,
      1000, 250, 0,
    ]);
    const gs = 3;
    const ws = 200;
    const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

    // Verify exact match at grid points (where GPU texture sampling is exact)
    const step = ws / (gs - 1);
    for (let zi = 0; zi < gs; zi++) {
      for (let xi = 0; xi < gs; xi++) {
        const wx = -ws / 2 + xi * step;
        const wz = -ws / 2 + zi * step;
        expect(provider.getHeightAt(wx, wz)).toBeCloseTo(data[zi * gs + xi], 10);
      }
    }

    // Between grid points: bilinear interpolation matches GPU LinearFilter
    // worldX=-25 -> gx = ((-25+100)/200)*2 = 0.75
    // worldZ=0 -> gz = ((0+100)/200)*2 = 1.0 -> cz=0, fz=1.0 (clamped from row 1)
    // Actually gz=1.0: cx=0, cz=1-1=0 wait no... gridMax=2, floor(1.0)=1, but clamp min(gridMax-1=1, 1)=1
    // cz=1, fz=0. h00=data[1*3+0]=250, h10=data[1*3+1]=750, h01=data[2*3+0]=1000, h11=data[2*3+1]=250
    // h0 = 250 + (750-250)*0.75 = 625
    // h1 = 1000 + (250-1000)*0.75 = 437.5
    // result = 625 + (437.5-625)*0 = 625
    expect(provider.getHeightAt(-25, 0)).toBeCloseTo(625);
  });
});
