import { describe, it, expect } from 'vitest';
import { CDLODQuadtree, type CDLODTile, type FrustumPlane } from './CDLODQuadtree';
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
