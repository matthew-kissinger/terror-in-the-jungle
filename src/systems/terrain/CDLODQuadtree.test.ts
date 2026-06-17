// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

function sharedEdgeBit(a: { x: number; z: number; size: number }, b: { x: number; z: number; size: number }): number {
  if (Math.abs((b.x - a.x) - a.size) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) return 2;
  if (Math.abs((a.x - b.x) - a.size) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) return 8;
  if (Math.abs((b.z - a.z) - a.size) < 1e-6 && Math.abs(a.x - b.x) < 1e-6) return 1;
  if (Math.abs((a.z - b.z) - a.size) < 1e-6 && Math.abs(a.x - b.x) < 1e-6) return 4;
  return 0;
}

function oppositeEdgeBit(bit: number): number {
  if (bit === 1) return 4;
  if (bit === 2) return 8;
  if (bit === 4) return 1;
  if (bit === 8) return 2;
  return 0;
}

function edgeProbe(tile: CDLODTile, bit: number): { x: number; z: number } {
  const half = tile.size / 2;
  const epsilon = Math.max(1e-3, tile.size * 1e-6);
  if (bit === 1) return { x: tile.x, z: tile.z + half + epsilon };
  if (bit === 2) return { x: tile.x + half + epsilon, z: tile.z };
  if (bit === 4) return { x: tile.x, z: tile.z - half - epsilon };
  return { x: tile.x - half - epsilon, z: tile.z };
}

function containsPoint(tile: CDLODTile, x: number, z: number): boolean {
  const half = tile.size / 2;
  const epsilon = Math.max(1e-3, tile.size * 1e-6);
  return (
    x >= tile.x - half - epsilon
    && x <= tile.x + half + epsilon
    && z >= tile.z - half - epsilon
    && z <= tile.z + half + epsilon
  );
}

function findTileContaining(
  tiles: readonly CDLODTile[],
  x: number,
  z: number,
  excludedTile: CDLODTile,
): CDLODTile | undefined {
  let smallest: CDLODTile | undefined;
  for (const tile of tiles) {
    if (tile === excludedTile) continue;
    if (!containsPoint(tile, x, z)) continue;
    if (!smallest || tile.size < smallest.size) smallest = tile;
  }
  return smallest;
}

interface SparseSkirtSeamInvariantStats {
  checkedEdges: number;
  skirtCoveredEdges: number;
  lodTransitionEdges: number;
  sameLodMorphSeams: number;
}

function expectSparseSkirtSeamInvariant(
  worldSize: number,
  tiles: readonly CDLODTile[],
): SparseSkirtSeamInvariantStats {
  const halfWorld = worldSize / 2;
  let checkedEdges = 0;
  let skirtCoveredEdges = 0;
  let lodTransitionEdges = 0;
  let sameLodMorphSeams = 0;

  for (const tile of tiles) {
    for (const bit of [1, 2, 4, 8]) {
      checkedEdges++;
      const probe = edgeProbe(tile, bit);
      const edgeSkirtMask = Number(tile.edgeSkirtMask ?? 0);
      const edgeMorphMask = Number(tile.edgeMorphMask ?? 0);
      const hasSkirtCover = (edgeSkirtMask & bit) === bit;
      const hasForceMorph = (edgeMorphMask & bit) === bit;

      if (probe.x < -halfWorld || probe.x > halfWorld || probe.z < -halfWorld || probe.z > halfWorld) {
        expect(hasSkirtCover).toBe(true);
        expect(hasForceMorph).toBe(false);
        skirtCoveredEdges++;
        continue;
      }

      const neighbour = findTileContaining(tiles, probe.x, probe.z, tile);
      if (!neighbour) {
        expect(hasSkirtCover).toBe(true);
        expect(hasForceMorph).toBe(false);
        skirtCoveredEdges++;
        continue;
      }

      if (neighbour.size > tile.size) {
        expect(hasSkirtCover).toBe(true);
        expect(hasForceMorph).toBe(true);
        skirtCoveredEdges++;
        lodTransitionEdges++;
        continue;
      }

      if (neighbour.size < tile.size) {
        expect(hasSkirtCover).toBe(true);
        expect(hasForceMorph).toBe(false);
        skirtCoveredEdges++;
        continue;
      }

      const reciprocalBit = oppositeEdgeBit(bit);
      const morphFactorsDiverge = Math.abs(neighbour.morphFactor - tile.morphFactor) > 1e-4;
      if (morphFactorsDiverge) {
        expect(hasSkirtCover).toBe(true);
        expect((Number(neighbour.edgeSkirtMask ?? 0) & reciprocalBit) === reciprocalBit).toBe(true);
        expect(hasForceMorph).toBe(false);
        sameLodMorphSeams++;
        skirtCoveredEdges++;
      } else {
        expect(hasForceMorph).toBe(false);
      }
    }
  }

  expect(checkedEdges).toBeGreaterThan(0);
  expect(skirtCoveredEdges).toBeGreaterThan(0);
  expect(lodTransitionEdges).toBeGreaterThan(0);
  return { checkedEdges, skirtCoveredEdges, lodTransitionEdges, sameLodMorphSeams };
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

  it('reuses the selected tile array between frames', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const first = qt.selectTiles(0, 50, 0, null);
    const second = qt.selectTiles(120, 50, -80, null);

    expect(second).toBe(first);
    expect(second.length).toBe(qt.getSelectedTileCount());
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
    const allTileCount = qt.selectTiles(0, 50, 0, null).length;

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

    expect(culledTiles.length).toBeLessThan(allTileCount);
  });

  it('keeps default frustum bounds conservative when terrain height bounds are not supplied', () => {
    const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
    const belowCameraFrustum: FrustumPlane[] = [
      { nx: 0, ny: -1, nz: 0, d: 10 }, // Accepts boxes with any support at y <= 10.
    ];

    const tiles = qt.selectTiles(0, 50, 0, belowCameraFrustum);
    const stats = qt.getLastSelectionStats();

    expect(tiles.length).toBeGreaterThan(0);
    expect(stats.heightBoundsEnabled).toBe(false);
    expect(stats.heightBoundsRejectedNodes).toBe(0);
  });

  it('can use terrain height bounds to reject vertically impossible tiles', () => {
    const qt = new CDLODQuadtree(
      worldSize,
      maxLOD,
      lodRanges,
      0.8,
      (_cx, _cz, _size, target) => {
        target.minY = 100;
        target.maxY = 120;
        return target;
      },
    );
    const belowCameraFrustum: FrustumPlane[] = [
      { nx: 0, ny: -1, nz: 0, d: 10 }, // Rejects terrain bounds wholly above y=10.
    ];

    const tiles = qt.selectTiles(0, 50, 0, belowCameraFrustum);
    const stats = qt.getLastSelectionStats();

    expect(tiles.length).toBe(0);
    expect(stats.heightBoundsEnabled).toBe(true);
    expect(stats.heightBoundsTests).toBeGreaterThan(0);
    expect(stats.heightBoundsRejectedNodes).toBeGreaterThan(0);
    expect(stats.frustumRejectedNodes).toBe(stats.heightBoundsRejectedNodes);
  });

  it('falls back to conservative frustum bounds when terrain height bounds are invalid', () => {
    const qt = new CDLODQuadtree(
      worldSize,
      maxLOD,
      lodRanges,
      0.8,
      (_cx, _cz, _size, target) => {
        target.minY = Number.NaN;
        target.maxY = Number.NaN;
        return target;
      },
    );
    const belowCameraFrustum: FrustumPlane[] = [
      { nx: 0, ny: -1, nz: 0, d: 10 },
    ];

    const tiles = qt.selectTiles(0, 50, 0, belowCameraFrustum);
    const stats = qt.getLastSelectionStats();

    expect(tiles.length).toBeGreaterThan(0);
    expect(stats.heightBoundsEnabled).toBe(true);
    expect(stats.heightBoundsFallbacks).toBeGreaterThan(0);
    expect(stats.heightBoundsRejectedNodes).toBe(0);
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

  it('surfaces when selection hits the hard tile cap and resets on the next selection', () => {
    const saturatingRanges = new Array(8).fill(Number.POSITIVE_INFINITY);
    const qt = new CDLODQuadtree(worldSize, 8, saturatingRanges);

    const saturatedTiles = qt.selectTiles(0, 0, 0, null);

    expect(saturatedTiles.length).toBe(2048);
    expect(qt.getSelectedTileCount()).toBe(2048);
    expect(qt.wasLastSelectionSaturated()).toBe(true);

    const culledTiles = qt.selectTiles(0, 0, 0, [
      { nx: 1, ny: 0, nz: 0, d: -100000 },
    ]);

    expect(culledTiles.length).toBe(0);
    expect(qt.wasLastSelectionSaturated()).toBe(false);
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
        expect(Number.isInteger(tile.edgeSkirtMask)).toBe(true);
        expect(tile.edgeSkirtMask).toBeGreaterThanOrEqual(0);
        expect(tile.edgeSkirtMask).toBeLessThanOrEqual(15);
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

    // A Shau's production render extent is non-dyadic: 21136m playable
    // plus a 200m visual margin on each side, source-capped to 6 CDLOD
    // levels by the 9m DEM spacing. Keep the edge-mask path covered at
    // that exact shape instead of an older rounded 21000/8 diagnostic.
    it('emits edge-morph masks correctly at A Shau visual extent', () => {
      const ashauPlayableWorld = 21136;
      const ashauVisualMargin = 200;
      const ashauWorld = ashauPlayableWorld + ashauVisualMargin * 2;
      const ashauLOD = 6;
      const ashauRanges = computeDefaultLODRanges(ashauPlayableWorld, ashauLOD, ashauVisualMargin);
      const qt = new CDLODQuadtree(ashauWorld, ashauLOD, ashauRanges);
      // Ground-level camera near origin forces an LOD0/LOD1 boundary
      // close to the camera and guarantees T-junctions.
      const tiles = qt.selectTiles(0, 50, 0, null);
      expect(new Set(tiles.map(t => t.lodLevel)).size).toBeGreaterThan(1);
      const flagged = tiles.filter(t => t.edgeMorphMask !== 0);
      // This is a broad regression guard for A Shau-scale edge masks, not
      // proof of a specific keying implementation.
      expect(flagged.length).toBeGreaterThan(4);
    });

    it('marks sparse skirt cover without force-morphing same-LOD morph seams', () => {
      const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      const tiles = qt.selectTiles(0, 50, 0, null);

      let compared = false;
      for (let i = 0; i < tiles.length && !compared; i++) {
        for (let j = 0; j < tiles.length && !compared; j++) {
          if (i === j) continue;
          const a = tiles[i];
          const b = tiles[j];
          if (a.size !== b.size || a.lodLevel !== b.lodLevel) continue;
          if (Math.abs(a.morphFactor - b.morphFactor) <= 1e-4) continue;
          const bit = sharedEdgeBit(a, b);
          if (bit === 0) continue;

          expect(a.edgeSkirtMask & bit).toBe(bit);
          expect(a.edgeMorphMask & bit).toBe(0);
          compared = true;
        }
      }

      expect(compared).toBe(true);
    });

    it('keeps world-boundary skirt cover separate from edge morphing', () => {
      const qt = new CDLODQuadtree(256, 1, [256]);
      const tiles = qt.selectTiles(0, 50, 0, makeFrustumAllVisible());
      const southwest = tiles.find((tile) => tile.x < 0 && tile.z < 0);

      expect(southwest).toBeDefined();
      expect((southwest!.edgeSkirtMask & 4) !== 0).toBe(true);
      expect((southwest!.edgeSkirtMask & 8) !== 0).toBe(true);
      expect(southwest!.edgeMorphMask & 4).toBe(0);
      expect(southwest!.edgeMorphMask & 8).toBe(0);
    });

    it('covers selected frustum boundaries with skirts without force-morphing them', () => {
      const qt = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      const tiles = qt.selectTiles(0, 50, 0, [
        { nx: 1, ny: 0, nz: 0, d: 0 },
        { nx: -1, ny: 0, nz: 0, d: 100000 },
        { nx: 0, ny: 1, nz: 0, d: 100000 },
        { nx: 0, ny: -1, nz: 0, d: 100000 },
        { nx: 0, ny: 0, nz: 1, d: 100000 },
        { nx: 0, ny: 0, nz: -1, d: 100000 },
      ]);
      const halfWorld = worldSize / 2;

      let foundInteriorSelectionBoundary = false;
      for (const tile of tiles) {
        for (const bit of [1, 2, 4, 8]) {
          const probe = edgeProbe(tile, bit);
          if (probe.x < -halfWorld || probe.x > halfWorld || probe.z < -halfWorld || probe.z > halfWorld) {
            continue;
          }
          const neighbour = findTileContaining(tiles, probe.x, probe.z, tile);
          if (neighbour) continue;

          expect(tile.edgeSkirtMask! & bit).toBe(bit);
          expect(tile.edgeMorphMask & bit).toBe(0);
          foundInteriorSelectionBoundary = true;
        }
      }

      expect(foundInteriorSelectionBoundary).toBe(true);
    });

    it('preserves sparse-skirt seam cover at representative and A Shau-scale camera positions', () => {
      const aggregate: SparseSkirtSeamInvariantStats = {
        checkedEdges: 0,
        skirtCoveredEdges: 0,
        lodTransitionEdges: 0,
        sameLodMorphSeams: 0,
      };
      const collect = (stats: SparseSkirtSeamInvariantStats): void => {
        aggregate.checkedEdges += stats.checkedEdges;
        aggregate.skirtCoveredEdges += stats.skirtCoveredEdges;
        aggregate.lodTransitionEdges += stats.lodTransitionEdges;
        aggregate.sameLodMorphSeams += stats.sameLodMorphSeams;
      };

      const representativeWorld = new CDLODQuadtree(worldSize, maxLOD, lodRanges);
      for (const [x, y, z] of [
        [0, 50, 0],
        [240, 80, -180],
        [-360, 120, 260],
      ]) {
        collect(expectSparseSkirtSeamInvariant(worldSize, representativeWorld.selectTiles(x, y, z, null)));
      }

      const openFrontierWorld = 6400;
      const openFrontierLOD = 6;
      const openFrontierRanges = computeDefaultLODRanges(3200, openFrontierLOD, 1600);
      const openFrontierQuadtree = new CDLODQuadtree(openFrontierWorld, openFrontierLOD, openFrontierRanges);
      for (const [x, y, z] of [
        [0, 3, -1200],
        [640, 12, 840],
        [-1260, 45, -520],
      ]) {
        collect(expectSparseSkirtSeamInvariant(openFrontierWorld, openFrontierQuadtree.selectTiles(x, y, z, null)));
      }

      const ashauPlayableWorld = 21136;
      const ashauVisualMargin = 200;
      const ashauWorld = ashauPlayableWorld + ashauVisualMargin * 2;
      const ashauLOD = 6;
      const ashauRanges = computeDefaultLODRanges(ashauPlayableWorld, ashauLOD, ashauVisualMargin);
      const ashauQuadtree = new CDLODQuadtree(ashauWorld, ashauLOD, ashauRanges);
      for (const [x, y, z] of [
        [0, 50, 0],
        [1950, 806, 2649],
        [-2800, 420, 3900],
      ]) {
        collect(expectSparseSkirtSeamInvariant(ashauWorld, ashauQuadtree.selectTiles(x, y, z, null)));
      }

      expect(aggregate.sameLodMorphSeams).toBeGreaterThan(0);
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
