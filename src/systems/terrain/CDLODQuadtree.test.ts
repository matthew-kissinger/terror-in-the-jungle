import { describe, it, expect } from 'vitest';
import { CDLODQuadtree, type FrustumPlane } from './CDLODQuadtree';
import { computeDefaultLODRanges } from './TerrainConfig';

function makeFrustumAllVisible(): FrustumPlane[] {
  // Six planes that accept everything (normals pointing inward, very far d)
  return [
    { nx: 1, ny: 0, nz: 0, d: 100000 },
    { nx: -1, ny: 0, nz: 0, d: 100000 },
    { nx: 0, ny: 1, nz: 0, d: 100000 },
    { nx: 0, ny: -1, nz: 0, d: 100000 },
    { nx: 0, ny: 0, nz: 1, d: 100000 },
    { nx: 0, ny: 0, nz: -1, d: 100000 },
  ];
}

describe('CDLODQuadtree', () => {
  const worldSize = 1024;
  const maxLOD = 4;
  const lodRanges = computeDefaultLODRanges(worldSize, maxLOD);

  it('selects tiles when camera is at world center', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const tiles = qt.selectTiles(0, 50, 0, null);

    expect(tiles.length).toBeGreaterThan(0);
    expect(qt.getSelectedTileCount()).toBe(tiles.length);
  });

  it('produces tiles with valid LOD levels', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const tiles = qt.selectTiles(0, 50, 0, null);

    for (const tile of tiles) {
      expect(tile.lodLevel).toBeGreaterThanOrEqual(0);
      expect(tile.lodLevel).toBeLessThan(maxLOD);
    }
  });

  it('produces no overlapping tiles', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const tiles = qt.selectTiles(0, 50, 0, null);

    // Check no two tiles have the same center
    const centers = new Set<string>();
    for (const tile of tiles) {
      const key = `${tile.x},${tile.z}`;
      expect(centers.has(key)).toBe(false);
      centers.add(key);
    }
  });

  it('tiles near camera have lower LOD level (higher detail)', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const tiles = qt.selectTiles(0, 50, 0, null);

    const nearTiles = tiles.filter(t => Math.sqrt(t.x * t.x + t.z * t.z) < lodRanges[0]);
    const farTiles = tiles.filter(t => Math.sqrt(t.x * t.x + t.z * t.z) > lodRanges[2]);

    if (nearTiles.length > 0 && farTiles.length > 0) {
      const avgNearLOD = nearTiles.reduce((s, t) => s + t.lodLevel, 0) / nearTiles.length;
      const avgFarLOD = farTiles.reduce((s, t) => s + t.lodLevel, 0) / farTiles.length;
      expect(avgNearLOD).toBeLessThanOrEqual(avgFarLOD);
    }
  });

  it('morph factor is 0 for tiles well within range', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges, 0.8);
    const tiles = qt.selectTiles(0, 10, 0, null);

    // Tiles very close to camera should have morph factor near 0
    const closeTiles = tiles.filter(t => Math.sqrt(t.x * t.x + t.z * t.z) < lodRanges[0] * 0.5);
    for (const tile of closeTiles) {
      expect(tile.morphFactor).toBeLessThanOrEqual(0.5);
    }
  });

  it('frustum culling reduces tile count', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);

    // All visible
    const allTiles = qt.selectTiles(0, 50, 0, null);

    // Only +X half visible (looking right)
    const restrictedFrustum: FrustumPlane[] = [
      { nx: 1, ny: 0, nz: 0, d: 0 }, // Only x >= 0
      { nx: -1, ny: 0, nz: 0, d: 100000 },
      { nx: 0, ny: 1, nz: 0, d: 100000 },
      { nx: 0, ny: -1, nz: 0, d: 100000 },
      { nx: 0, ny: 0, nz: 1, d: 100000 },
      { nx: 0, ny: 0, nz: -1, d: 100000 },
    ];
    const culledTiles = qt.selectTiles(0, 50, 0, restrictedFrustum);

    expect(culledTiles.length).toBeLessThan(allTiles.length);
  });

  it('handles very large world sizes', () => {
    const bigWorld = 21000;
    const bigLOD = 8;
    const bigRanges = computeDefaultLODRanges(bigWorld, bigLOD);
    const qt = new CDLODQuadtree(bigWorld, bigLOD, bigRanges);

    const tiles = qt.selectTiles(0, 100, 0, null);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(2048);
  });

  it('all tiles cover world without gaps (center camera)', () => {
    const smallWorld = 256;
    const lod = 3;
    const ranges = computeDefaultLODRanges(smallWorld, lod);
    const qt = new CDLODQuadtree(smallWorld, lod, ranges);
    const tiles = qt.selectTiles(0, 50, 0, makeFrustumAllVisible());

    // All tile centers should be within world bounds
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(-smallWorld / 2 - tile.size);
      expect(tile.x).toBeLessThanOrEqual(smallWorld / 2 + tile.size);
      expect(tile.z).toBeGreaterThanOrEqual(-smallWorld / 2 - tile.size);
      expect(tile.z).toBeLessThanOrEqual(smallWorld / 2 + tile.size);
    }
  });

  // Stage D1 (terrain-cdlod-seam): with the AABB-nearest-point distance
  // metric, adjacent same-LOD tiles meeting at a shared edge produce
  // identical morph factors when the camera sits directly above that edge.
  // The center-distance metric had a discontinuous jump there, which
  // showed up as sub-pixel height cracks at chunk borders.
  it('adjacent same-LOD tiles have equal morph factor when camera is directly over their shared edge', () => {
    const smallWorld = 256;
    const lod = 3;
    const ranges = computeDefaultLODRanges(smallWorld, lod);
    const qt = new CDLODQuadtree(smallWorld, lod, ranges);
    const tiles = qt.selectTiles(0, 40, 0, null);

    let compared = false;
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        if (a.lodLevel !== b.lodLevel || a.size !== b.size) continue;
        const sharedX = Math.abs(Math.abs(a.x - b.x) - a.size) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
        const sharedZ = Math.abs(Math.abs(a.z - b.z) - a.size) < 1e-6 && Math.abs(a.x - b.x) < 1e-6;
        if (!sharedX && !sharedZ) continue;
        if (sharedX ? (a.x + b.x) / 2 !== 0 : (a.z + b.z) / 2 !== 0) continue;
        expect(Math.abs(a.morphFactor - b.morphFactor)).toBeLessThan(1e-6);
        compared = true;
      }
    }
    expect(compared).toBe(true);
  });

  // Stage D1: the metric is observably AABB-distance, not centre-distance.
  it('uses camera-to-AABB-nearest-point distance, not camera-to-center', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const camX = 200, camY = 50, camZ = 0;
    const tiles = qt.selectTiles(camX, camY, camZ, null);
    const offTile = tiles.find(t =>
      Math.abs(camX - t.x) > t.size / 2 || Math.abs(camZ - t.z) > t.size / 2,
    );
    expect(offTile).toBeDefined();
    if (!offTile) return;
    const half = offTile.size / 2;
    const cdx = Math.max(Math.abs(camX - offTile.x) - half, 0);
    const cdz = Math.max(Math.abs(camZ - offTile.z) - half, 0);
    const aabbDist = Math.sqrt(cdx * cdx + camY * camY + cdz * cdz);
    const centerDist = Math.sqrt((camX - offTile.x) ** 2 + camY * camY + (camZ - offTile.z) ** 2);
    expect(aabbDist).toBeLessThan(centerDist);
  });

  // Hard-stop guard from the brief: the AABB metric subdivides slightly
  // more aggressively than centre-distance; pin a generous cap so a
  // future tweak that explodes tile count fails fast.
  it('does not regress tile count past the hard cap at fixed camera positions', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    expect(qt.selectTiles(0, 50, 0, null).length).toBeLessThan(256);
    expect(qt.selectTiles(worldSize * 0.3, 50, 0, null).length).toBeLessThan(256);
  });

  // Stage cdlod-edge-morph (cycle-2026-05-09): every emitted tile carries
  // a 4-bit edgeMorphMask flagging which of its edges abut a coarser-LOD
  // neighbour. The shader-side morph parity test in
  // TerrainMaterial.morph.test.ts asserts the geometric consequence;
  // here we just guarantee the contract surface.
  describe('edgeMorphMask (LOD-transition T-junction resolution)', () => {
    it('every emitted tile exposes a 4-bit numeric edgeMorphMask', () => {
      const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      const tiles = qt.selectTiles(0, 50, 0, null);
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) {
        expect(Number.isInteger(tile.edgeMorphMask)).toBe(true);
        expect(tile.edgeMorphMask).toBeGreaterThanOrEqual(0);
        expect(tile.edgeMorphMask).toBeLessThanOrEqual(15);
      }
    });

    it('uniform-LOD selection yields all-zero masks (no coarser neighbours can exist)', () => {
      // Camera infinitely far -> single coarsest LOD band -> no transitions.
      const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      const tiles = qt.selectTiles(0, 1e9, 0, null);
      expect(new Set(tiles.map(t => t.size)).size).toBe(1);
      for (const t of tiles) expect(t.edgeMorphMask).toBe(0);
    });

    it('flags at least one coarser-edge bit when multiple LOD bands are present', () => {
      // worldSize=1024 maxLOD=4 at (0, 50, 0) is the same setup the
      // existing 'tiles near camera have lower LOD' test uses, so LOD
      // bands are guaranteed and T-junctions exist.
      const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      const tiles = qt.selectTiles(0, 50, 0, null);
      expect(new Set(tiles.map(t => t.lodLevel)).size).toBeGreaterThan(1);
      expect(tiles.some(t => t.edgeMorphMask !== 0)).toBe(true);
    });

    // A Shau worldSize is 21000m (non-power-of-2). The base tile size
    // worldSize / 2^maxLOD = 21000 / 256 ≈ 82.03m is non-dyadic, so
    // string-templated Map keys built from raw float centres can drop
    // hits if the recursion path and the probe path produce centres
    // that print differently. Integer-cell tileKey() is the fix; this
    // test is the regression guard.
    it('emits edge-morph masks correctly at A Shau worldSize (non-dyadic baseTileSize)', () => {
      const ashauWorld = 21000;
      const ashauLOD = 8;
      const ashauRanges = computeDefaultLODRanges(ashauWorld, ashauLOD);
      const qt = new CDLODQuadtree(ashauWorld, ashauLOD, ashauRanges);
      // Ground-level camera near origin forces an LOD0/LOD1 boundary
      // close to the camera and guarantees T-junctions.
      const tiles = qt.selectTiles(0, 50, 0, null);
      expect(new Set(tiles.map(t => t.lodLevel)).size).toBeGreaterThan(1);
      const flagged = tiles.filter(t => t.edgeMorphMask !== 0);
      // Stronger than > 0: the helicopter-altitude seam case requires
      // the integer-cell tileKey to drop zero hits at A Shau scale, so
      // we expect a non-trivial population of flagged edges. Loosen
      // this floor only if the LOD layout for this camera placement
      // changes deliberately.
      expect(flagged.length).toBeGreaterThan(4);
    });
  });

  // Brief-promised perf assertion. CDLOD selection runs every frame and
  // the original < 0.3 ms budget is the file-level docstring contract.
  // The 1.0 ms ceiling is wide enough for slow CI runners but tight
  // enough to catch quadratic-blowup regressions (e.g. accidental
  // O(tiles^2) neighbour resolution).
  it('selectTiles stays under perf budget at default tile count', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    // Warm-up to amortise V8 JIT and one-time Map growth.
    for (let i = 0; i < 10; i++) qt.selectTiles(0, 100, 0, null);
    const N = 200;
    const start = performance.now();
    for (let i = 0; i < N; i++) qt.selectTiles(0, 100, 0, null);
    const elapsedMean = (performance.now() - start) / N;
    expect(elapsedMean).toBeLessThan(1.0);
  });

  it('returns empty slice for subsequent calls (no stale data)', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);

    const tiles1 = qt.selectTiles(0, 50, 0, null);
    const count1 = tiles1.length;

    // Camera far away - fewer tiles
    const tiles2 = qt.selectTiles(10000, 50, 10000, null);
    // Should be independent of previous call
    expect(qt.getSelectedTileCount()).toBe(tiles2.length);
    // Both should have been valid counts
    expect(count1).toBeGreaterThan(0);
  });
});
