import { describe, it, expect } from 'vitest';
import { BakedHeightProvider } from './BakedHeightProvider';

function make2x2Grid(h00: number, h10: number, h01: number, h11: number): Float32Array {
  // 2x2 grid: row-major [z0x0, z0x1, z1x0, z1x1]
  return new Float32Array([h00, h10, h01, h11]);
}

const NOISE_CFG = { type: 'noise' as const, seed: 1 };

/**
 * Reference bilinear interpolation (the OLD method) for comparison.
 * Operates on the heightmap grid directly - no mesh grid awareness.
 */
function bilinearHeight(
  data: Float32Array, gridSize: number, worldSize: number,
  worldX: number, worldZ: number,
): number {
  const halfWorld = worldSize / 2;
  const gridMax = gridSize - 1;
  const gx = ((worldX + halfWorld) / worldSize) * gridMax;
  const gz = ((worldZ + halfWorld) / worldSize) * gridMax;
  const cx = Math.max(0, Math.min(gridMax - 1, Math.floor(gx)));
  const cz = Math.max(0, Math.min(gridMax - 1, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - cx));
  const fz = Math.max(0, Math.min(1, gz - cz));
  const h00 = data[cz * gridSize + cx];
  const h10 = data[cz * gridSize + cx + 1];
  const h01 = data[(cz + 1) * gridSize + cx];
  const h11 = data[(cz + 1) * gridSize + cx + 1];
  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fz;
}

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

    const provider = new BakedHeightProvider(data, gridSize, worldSize, NOISE_CFG);

    // Test at grid points
    expect(provider.getHeightAt(-100, -100)).toBeCloseTo(0);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(220);
    expect(provider.getHeightAt(100, 100)).toBeCloseTo(440);

    // Test between grid points: worldX=-75 -> mx=0.5, worldZ=-100 -> mz=0
    // NW triangle (fx=0.5, fz=0): h00*(1-0.5) + h10*0.5 + h01*0 = 0*0.5 + 10*0.5 = 5
    expect(provider.getHeightAt(-75, -100)).toBeCloseTo(5);
  });

  it('returns original worker config unchanged', () => {
    const workerConfig = { type: 'noise' as const, seed: 42 };
    const provider = new BakedHeightProvider(new Float32Array(4), 2, 100, workerConfig);
    expect(provider.getWorkerConfig()).toBe(workerConfig);
  });

  describe('triangle interpolation', () => {
    it('differs from bilinear on twisted quads', () => {
      // h00=0 (NW), h10=0 (NE), h01=0 (SW), h11=10 (SE)
      // Only SE corner is raised, creating maximum bilinear vs triangle divergence.
      const data = make2x2Grid(0, 0, 0, 10);
      const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

      // Point at (0.7, 0.7) in fractional coords -> SE triangle (fx+fz=1.4 > 1)
      // Triangle: h10*(1-fz) + h01*(1-fx) + h11*(fx+fz-1) = 0*0.3 + 0*0.3 + 10*0.4 = 4.0
      // Bilinear would give: h0 = 0 + 0*0.7 = 0, h1 = 0 + 10*0.7 = 7, result = 0 + 7*0.7 = 4.9
      // World coords: fx=0.7 -> worldX = -50 + 0.7*100 = 20, fz=0.7 -> worldZ = -50 + 0.7*100 = 20
      expect(provider.getHeightAt(20, 20)).toBeCloseTo(4.0);
    });

    it('uses "/" diagonal topology: NW vs SE triangle', () => {
      // Saddle surface: h00=10 (NW), h10=0 (NE), h01=0 (SW), h11=10 (SE)
      const data = make2x2Grid(10, 0, 0, 10);
      const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

      // Point in NW triangle: fx=0.2, fz=0.2 (fx+fz=0.4 <= 1)
      // h00*(1-0.2-0.2) + h10*0.2 + h01*0.2 = 10*0.6 + 0*0.2 + 0*0.2 = 6.0
      // worldX = -50 + 0.2*100 = -30, worldZ = -50 + 0.2*100 = -30
      expect(provider.getHeightAt(-30, -30)).toBeCloseTo(6.0);

      // Point in SE triangle: fx=0.8, fz=0.8 (fx+fz=1.6 > 1)
      // h10*(1-0.8) + h01*(1-0.8) + h11*(0.8+0.8-1) = 0*0.2 + 0*0.2 + 10*0.6 = 6.0
      // worldX = -50 + 0.8*100 = 30, worldZ = -50 + 0.8*100 = 30
      expect(provider.getHeightAt(30, 30)).toBeCloseTo(6.0);

      // On the "/" diagonal itself: fx=0.5, fz=0.5 (fx+fz=1 -> NW triangle boundary)
      // NW: h00*(1-0.5-0.5) + h10*0.5 + h01*0.5 = 10*0 + 0*0.5 + 0*0.5 = 0
      // worldX = 0, worldZ = 0
      expect(provider.getHeightAt(0, 0)).toBeCloseTo(0);
    });

    it('interpolates on mesh grid finer than heightmap', () => {
      // 3x3 heightmap (2 quads) but 4 mesh quads per edge.
      // Mesh vertices between heightmap texels get bilinear-sampled heights.
      const data = new Float32Array([
        0, 10, 20,
        30, 40, 50,
        60, 70, 80,
      ]);
      const provider = new BakedHeightProvider(data, 3, 100, NOISE_CFG, 4);

      // At grid points of the heightmap, exact values still hold
      expect(provider.getHeightAt(-50, -50)).toBeCloseTo(0);
      expect(provider.getHeightAt(0, -50)).toBeCloseTo(10);
      expect(provider.getHeightAt(50, -50)).toBeCloseTo(20);

      // Mid-mesh vertex (mesh quad 0 to 1 boundary, at mesh index 1 out of 4):
      // heightmap gx = (1/4)*2 = 0.5 -> bilinear between texels 0 and 1
      // At worldX = -50 + (1/4)*100 = -25, worldZ = -50 (fz=0 in mesh quad 0)
      // Mesh vertex heights: h at mesh(0,0)=0, h at mesh(1,0)=bilinear(gx=0.5,gz=0)=5
      // Query at worldX=-25 lands on mesh vertex 1, so result = 5
      expect(provider.getHeightAt(-25, -50)).toBeCloseTo(5);
    });

    it('defaults meshQuadsPerEdge to gridSize-1 when omitted', () => {
      // Without explicit meshQuadsPerEdge, should behave as mesh = heightmap grid.
      const data = make2x2Grid(0, 10, 20, 30);
      const withDefault = new BakedHeightProvider(data, 2, 100, NOISE_CFG);
      const withExplicit = new BakedHeightProvider(data, 2, 100, NOISE_CFG, 1);

      // Should produce identical results
      for (const x of [-50, -25, 0, 25, 50]) {
        for (const z of [-50, -25, 0, 25, 50]) {
          expect(withDefault.getHeightAt(x, z)).toBeCloseTo(withExplicit.getHeightAt(x, z));
        }
      }
    });

    it('returns exact values at mesh grid vertices', () => {
      // On a flat heightmap, triangle interp should return exact values at vertices
      const data = new Float32Array([
        0, 10,
        20, 30,
      ]);
      const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

      expect(provider.getHeightAt(-50, -50)).toBeCloseTo(0);
      expect(provider.getHeightAt(50, -50)).toBeCloseTo(10);
      expect(provider.getHeightAt(-50, 50)).toBeCloseTo(20);
      expect(provider.getHeightAt(50, 50)).toBeCloseTo(30);
    });
  });

  describe('triangle vs bilinear deviation', () => {
    // These tests quantify the exact numerical difference between the new
    // triangle interpolation and the old bilinear method, using terrain
    // configurations that match real game modes.

    it('zero deviation on planar quads (no twist)', () => {
      // When h00+h11 == h10+h01 the quad is planar and both methods agree.
      // Planar: h00=0, h10=10, h01=20, h11=30 -> 0+30 == 10+20
      const data = make2x2Grid(0, 10, 20, 30);
      const provider = new BakedHeightProvider(data, 2, 100, NOISE_CFG);

      for (const fx of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        for (const fz of [0.1, 0.25, 0.5, 0.75, 0.9]) {
          const wx = -50 + fx * 100;
          const wz = -50 + fz * 100;
          const tri = provider.getHeightAt(wx, wz);
          const bil = bilinearHeight(new Float32Array([0, 10, 20, 30]), 2, 100, wx, wz);
          expect(tri).toBeCloseTo(bil, 10);
        }
      }
    });

    it('quantifies deviation on single-corner-raised quad', () => {
      // h00=0, h10=0, h01=0, h11=10 -- maximum twist for this height range
      // Bilinear error formula: (h00+h11-h10-h01)*fx*fz = 10*fx*fz
      const data = make2x2Grid(0, 0, 0, 10);
      const gs = 2; const ws = 100;
      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

      // Sample grid of fractional positions and compare
      const results: { fx: number; fz: number; triangle: number; bilinear: number; diff: number }[] = [];
      for (const fx of [0.25, 0.5, 0.75]) {
        for (const fz of [0.25, 0.5, 0.75]) {
          const wx = -50 + fx * 100;
          const wz = -50 + fz * 100;
          const tri = provider.getHeightAt(wx, wz);
          const bil = bilinearHeight(data, gs, ws, wx, wz);
          results.push({ fx, fz, triangle: tri, bilinear: bil, diff: bil - tri });
        }
      }

      //    fx   fz   triangle  bilinear  diff (bilinear error)
      // --------------------------------------------------------
      // (0.25, 0.25) -> NW tri:  0.00     0.625    +0.625
      // (0.50, 0.25) -> NW tri:  0.00     1.25     +1.25
      // (0.75, 0.25) -> SE tri:  0.00     1.875    +1.875
      // (0.25, 0.50) -> NW tri:  0.00     1.25     +1.25
      // (0.50, 0.50) -> NW tri:  0.00     2.50     +2.50    <-- max at center
      // (0.75, 0.50) -> SE tri:  2.50     3.75     +1.25
      // (0.25, 0.75) -> SE tri:  0.00     1.875    +1.875
      // (0.50, 0.75) -> SE tri:  2.50     3.75     +1.25
      // (0.75, 0.75) -> SE tri:  5.00     5.625    +0.625

      // Center of quad has maximum deviation
      expect(results.find(r => r.fx === 0.5 && r.fz === 0.5)!.diff).toBeCloseTo(2.5);

      // Deviation is always >= 0 (bilinear overshoots on this quad)
      for (const r of results) {
        expect(r.diff).toBeGreaterThanOrEqual(-1e-10);
      }

      // Max deviation is 2.5m (= 10 * 0.5 * 0.5)
      const maxDiff = Math.max(...results.map(r => Math.abs(r.diff)));
      expect(maxDiff).toBeCloseTo(2.5);
    });

    it('deviation on Open Frontier scale (3200m, steep terrain)', () => {
      // Simulates a 3x3 heightmap patch on Open Frontier with a ridge.
      // gridSize=3 (2 quads), worldSize=3200m, meshQuadsPerEdge=2 (mesh = heightmap).
      // Vertex spacing = 1600m per quad (extreme, but tests the math).
      //
      // Ridge terrain: valley-peak-valley with 200m height variation
      const data = new Float32Array([
        100, 300, 100,   // z=0: valley - peak - valley
        200, 100, 200,   // z=1: peak - valley - peak (saddle)
        100, 300, 100,   // z=2: valley - peak - valley
      ]);
      const gs = 3; const ws = 3200;
      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

      // Center of NW quad (0,0): fx=0.5, fz=0.5
      // h00=100, h10=300, h01=200, h11=100
      // Triangle (NW, fx+fz=1): h00*(1-0.5-0.5) + h10*0.5 + h01*0.5 = 0 + 150 + 100 = 250
      // Bilinear: h0=200, h1=150, result=175
      const wx = -1600 + 0.5 * 1600;  // -800
      const wz = -1600 + 0.5 * 1600;  // -800
      const tri = provider.getHeightAt(wx, wz);
      const bil = bilinearHeight(data, gs, ws, wx, wz);

      expect(tri).toBeCloseTo(250);
      expect(bil).toBeCloseTo(175);
      expect(bil - tri).toBeCloseTo(-75); // 75m divergence on saddle terrain!
    });

    it('deviation on A Shau scale (mesh 16x finer than heightmap)', () => {
      // A Shau: 512 heightmap texels, 8192 mesh quads (16x finer).
      // Simulates a small 3x3 heightmap patch with mountainous terrain.
      //
      // Mountain ridge: 500m elevation range
      const data = new Float32Array([
        200, 700, 200,
        500, 300, 500,
        200, 700, 200,
      ]);
      const gs = 3; const ws = 1000;
      const meshQuads = 32; // 16x finer than heightmap's 2 quads

      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG, meshQuads);

      // Query at the center of heightmap quad (0,0): worldX=-250, worldZ=-250
      // This falls on mesh quad 8 (out of 32), fx_mesh=0, fz_mesh=0
      // Mesh vertex at (8,8): heightmap gx = 8/32*2 = 0.5, gz = 0.5
      // Bilinear on heightmap: h0 = 200+(700-200)*0.5=450, h1=500+(300-500)*0.5=400, result=425
      // Triangle provider also samples mesh vertices bilinearly, so at a mesh vertex it returns 425
      const triAtMeshVertex = provider.getHeightAt(-250, -250);
      const bilDirect = bilinearHeight(data, gs, ws, -250, -250);
      expect(triAtMeshVertex).toBeCloseTo(bilDirect); // same at mesh vertex center

      // But between mesh vertices, the two methods diverge.
      // Mesh quad is ws/meshQuads = 31.25m wide. Query midway between mesh vertices.
      // worldX = -500 + (8.5/32)*1000 = -234.375 (between mesh vertices 8 and 9)
      const wxMid = -500 + (8.5 / 32) * 1000;
      const wzMid = -500 + (8.5 / 32) * 1000;
      const triMid = provider.getHeightAt(wxMid, wzMid);
      const bilMid = bilinearHeight(data, gs, ws, wxMid, wzMid);

      // The deviation is small because the mesh is 16x finer than heightmap.
      // With 31.25m mesh quads, the bilinear-vs-triangle error is proportional
      // to quad twist * fx_mesh * fz_mesh, which is much smaller than on coarse grids.
      expect(Math.abs(triMid - bilMid)).toBeLessThan(5); // small deviation on fine mesh
    });

    it('deviation on saddle surface at all sample points', () => {
      // Saddle: h00=50, h10=0, h01=0, h11=50 -> twist = 50+50-0-0 = 100
      // Maximum bilinear error = 100 * 0.5 * 0.5 = 25m
      const data = make2x2Grid(50, 0, 0, 50);
      const gs = 2; const ws = 100;
      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

      const deviations: { fx: number; fz: number; tri: number; bil: number; diff: number }[] = [];
      for (let fxi = 1; fxi <= 9; fxi++) {
        for (let fzi = 1; fzi <= 9; fzi++) {
          const fx = fxi / 10;
          const fz = fzi / 10;
          const wx = -50 + fx * 100;
          const wz = -50 + fz * 100;
          const tri = provider.getHeightAt(wx, wz);
          const bil = bilinearHeight(data, gs, ws, wx, wz);
          deviations.push({ fx, fz, tri, bil, diff: bil - tri });
        }
      }

      // Maximum absolute deviation should be at quad center (0.5, 0.5)
      const maxDev = deviations.reduce((max, d) => Math.abs(d.diff) > Math.abs(max.diff) ? d : max);
      expect(maxDev.fx).toBe(0.5);
      expect(maxDev.fz).toBe(0.5);
      expect(Math.abs(maxDev.diff)).toBeCloseTo(25); // 25m at center of 100-twist saddle

      // All deviations on NW triangle (fx+fz<=1) have same sign
      const nwDevs = deviations.filter(d => d.fx + d.fz <= 1);
      const seDevs = deviations.filter(d => d.fx + d.fz > 1);
      const nwSigns = nwDevs.map(d => Math.sign(d.diff));
      const seSigns = seDevs.map(d => Math.sign(d.diff));
      // All NW deviations should be same direction (bilinear undershoots on this saddle)
      expect(new Set(nwSigns.filter(s => s !== 0)).size).toBeLessThanOrEqual(1);
      expect(new Set(seSigns.filter(s => s !== 0)).size).toBeLessThanOrEqual(1);
    });

    it('zero deviation at grid vertices regardless of terrain', () => {
      // Both methods agree at grid vertices (mesh vertices that land on heightmap texels).
      // Test with extreme terrain: 0-1000m height range.
      const data = new Float32Array([
        0, 500, 1000,
        250, 750, 500,
        1000, 250, 0,
      ]);
      const gs = 3; const ws = 200;
      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

      const step = ws / (gs - 1); // 100m
      for (let zi = 0; zi < gs; zi++) {
        for (let xi = 0; xi < gs; xi++) {
          const wx = -ws / 2 + xi * step;
          const wz = -ws / 2 + zi * step;
          const tri = provider.getHeightAt(wx, wz);
          const bil = bilinearHeight(data, gs, ws, wx, wz);
          const expected = data[zi * gs + xi];
          expect(tri).toBeCloseTo(expected, 10);
          expect(bil).toBeCloseTo(expected, 10);
        }
      }
    });

    it('zero deviation on edges between vertices (fx=0 or fz=0)', () => {
      // Along grid edges (one fractional coord = 0), triangle and bilinear
      // reduce to the same linear interpolation.
      const data = make2x2Grid(0, 100, 200, 50);
      const gs = 2; const ws = 100;
      const provider = new BakedHeightProvider(data, gs, ws, NOISE_CFG);

      // Along top edge (fz=0): both methods interpolate linearly between h00 and h10
      for (const fx of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const wx = -50 + fx * 100;
        const tri = provider.getHeightAt(wx, -50); // fz=0
        const bil = bilinearHeight(data, gs, ws, wx, -50);
        expect(tri).toBeCloseTo(bil, 10);
      }

      // Along left edge (fx=0): both methods interpolate linearly between h00 and h01
      for (const fz of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const wz = -50 + fz * 100;
        const tri = provider.getHeightAt(-50, wz); // fx=0
        const bil = bilinearHeight(data, gs, ws, -50, wz);
        expect(tri).toBeCloseTo(bil, 10);
      }
    });
  });
});
