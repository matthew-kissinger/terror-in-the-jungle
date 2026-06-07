// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { HeightProviderConfig, IHeightProvider } from '../IHeightProvider';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import { recomposeHydrologyArtifact } from './HydrologyArtifactRecomposer';
import type { AABB2D } from './TerrainStampConflictDetector';

/**
 * Behavior tests for Pass C — re-anchoring hydrology river polyline
 * elevations against the composed (post-stamp) provider. The tests use
 * synthetic providers + a hand-rolled artifact so we can assert on the
 * observable surface mesh inputs (elevation at sampled points) without
 * pulling in the full OF feature compile.
 */

function makeFlatProvider(height: number): IHeightProvider {
  return {
    getHeightAt: () => height,
    getWorkerConfig: () => ({ type: 'noise', seed: 0 }) as HeightProviderConfig,
  };
}

interface FlatPatchSpec {
  centerX: number;
  centerZ: number;
  halfExtent: number;
  height: number;
}

function makeFlatPatchProvider(
  baseHeight: number,
  patches: FlatPatchSpec[],
): IHeightProvider {
  return {
    getHeightAt: (x: number, z: number) => {
      for (const patch of patches) {
        if (
          Math.abs(x - patch.centerX) <= patch.halfExtent &&
          Math.abs(z - patch.centerZ) <= patch.halfExtent
        ) {
          return patch.height;
        }
      }
      return baseHeight;
    },
    getWorkerConfig: () => ({ type: 'noise', seed: 0 }) as HeightProviderConfig,
  };
}

function makeSyntheticArtifact(pointsXZ: Array<[number, number]>, elevationMeters: number): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 4,
    height: 4,
    cellSizeMeters: 50,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 50 },
    thresholds: {
      accumulationP90Cells: 10,
      accumulationP95Cells: 20,
      accumulationP98Cells: 40,
      accumulationP99Cells: 80,
    },
    masks: { wetCandidateCells: [], channelCandidateCells: [] },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: pointsXZ.length - 1,
        lengthCells: pointsXZ.length,
        lengthMeters: pointsXZ.length * 50,
        maxAccumulationCells: 320,
        points: pointsXZ.map((pt, i) => ({
          cell: i,
          x: pt[0],
          z: pt[1],
          elevationMeters,
          accumulationCells: 100 + i * 50,
        })),
      },
    ],
  };
}

describe('recomposeHydrologyArtifact', () => {
  it('returns a clone — the original artifact is never mutated', () => {
    const provider = makeFlatProvider(99);
    const artifact = makeSyntheticArtifact([[0, 0], [10, 0]], 5);
    const aabb: AABB2D = { minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 };

    const original = JSON.stringify(artifact);
    const { artifact: result } = recomposeHydrologyArtifact(artifact, provider, [aabb]);

    expect(result).not.toBe(artifact);
    expect(result.channelPolylines[0]).not.toBe(artifact.channelPolylines[0]);
    // Original elevations untouched.
    expect(JSON.stringify(artifact)).toBe(original);
    // Result has the provider's height.
    expect(result.channelPolylines[0].points.every((p) => p.elevationMeters === 99)).toBe(true);
  });

  it('writes the composed-provider sample to elevationMeters for points inside relevant AABBs', () => {
    // River runs along Z=0 from X=-200 to X=+200. An airfield-shaped flat
    // patch lives at the origin with halfExtent=80m at Y=15. Outside the
    // patch the ground sits at Y=5.
    const provider = makeFlatPatchProvider(5, [
      { centerX: 0, centerZ: 0, halfExtent: 80, height: 15 },
    ]);
    const points: Array<[number, number]> = [
      [-200, 0], [-50, 0], [0, 0], [50, 0], [200, 0],
    ];
    const artifact = makeSyntheticArtifact(points, 5); // baked elevation was Y=5

    // The "non-hydrology overlap" AABB is the airfield patch.
    const airfieldAABB: AABB2D = { minX: -80, minZ: -80, maxX: 80, maxZ: 80 };
    const { artifact: result, stats } = recomposeHydrologyArtifact(artifact, provider, [airfieldAABB]);

    const ys = result.channelPolylines[0].points.map((p) => p.elevationMeters);
    // Three points (-50, 0, 50) fall inside the airfield AABB → elevation 15.
    // Two points (-200, 200) sit outside → unchanged at 5.
    expect(ys[0]).toBe(5);     // -200, outside
    expect(ys[1]).toBe(15);    // -50, inside
    expect(ys[2]).toBe(15);    //   0, inside
    expect(ys[3]).toBe(15);    //  50, inside
    expect(ys[4]).toBe(5);     // 200, outside

    expect(stats.pointsScanned).toBe(5);
    expect(stats.pointsResampled).toBe(3);
    expect(stats.channelsTouched).toBe(1);
    expect(stats.maxAbsoluteDeltaMeters).toBe(10);
  });

  it('re-samples every point when no AABB filter is supplied', () => {
    const provider = makeFlatProvider(99);
    const artifact = makeSyntheticArtifact([[0, 0], [100, 0]], 12);

    const { artifact: recomposed, stats } = recomposeHydrologyArtifact(artifact, provider, []);
    expect(recomposed.channelPolylines[0].points.every((p) => p.elevationMeters === 99)).toBe(true);
    expect(stats.pointsResampled).toBe(2);
    expect(stats.pointsScanned).toBe(2);
  });

  it('leaves points outside the AABB filter unchanged in targeted mode', () => {
    const provider = makeFlatProvider(99);
    const artifact = makeSyntheticArtifact([[0, 0], [100, 0]], 12);

    const farAABB: AABB2D = { minX: 1000, minZ: 1000, maxX: 1100, maxZ: 1100 };
    const { artifact: stillUnchanged, stats: farStats } = recomposeHydrologyArtifact(artifact, provider, [farAABB]);
    expect(stillUnchanged.channelPolylines[0].points.every((p) => p.elevationMeters === 12)).toBe(true);
    expect(farStats.pointsResampled).toBe(0);
    expect(farStats.pointsScanned).toBe(2);
  });

  it('can force full-channel re-anchoring even when an AABB filter is present', () => {
    const provider = makeFlatProvider(21);
    const artifact = makeSyntheticArtifact([[-200, 0], [0, 0], [200, 0]], 5);
    const middleOnly: AABB2D = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };

    const { artifact: result, stats } = recomposeHydrologyArtifact(
      artifact,
      provider,
      [middleOnly],
      { resampleAllPoints: true },
    );

    expect(result.channelPolylines[0].points.every((p) => p.elevationMeters === 21)).toBe(true);
    expect(stats.pointsResampled).toBe(3);
    expect(stats.pointsScanned).toBe(3);
  });

  it('handles the empty-artifact and no-channels edge cases gracefully', () => {
    const provider = makeFlatProvider(5);
    const empty = makeSyntheticArtifact([], 0);
    empty.channelPolylines = []; // explicitly empty

    const { artifact, stats } = recomposeHydrologyArtifact(empty, provider, [
      { minX: -100, minZ: -100, maxX: 100, maxZ: 100 },
    ]);
    expect(artifact.channelPolylines).toEqual([]);
    expect(stats.pointsResampled).toBe(0);
    expect(stats.pointsScanned).toBe(0);
  });

  it('returns river-surface Y within 0.5 m of composedProvider + 0.85 m offset at 8 sample points', () => {
    // Acceptance assertion from the brief: at every point we re-sample,
    // the river surface (point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.85)
    // must land within 0.5 m of (composedProvider.getHeightAt + 0.85). Since
    // we write the composed height directly into elevationMeters, the delta
    // is structurally 0.
    const HYDROLOGY_RIVER_SURFACE_OFFSET = 0.85;
    const provider = makeFlatPatchProvider(2, [
      // 4 sample points inside an "airfield" overlap at Y=18.
      { centerX: 0, centerZ: 0, halfExtent: 200, height: 18 },
    ]);
    const insidePoints: Array<[number, number]> = [
      [-50, -50], [50, -50], [-50, 50], [50, 50],
    ];
    const outsidePoints: Array<[number, number]> = [
      [-400, -400], [400, -400], [-400, 400], [400, 400],
    ];

    const artifact = makeSyntheticArtifact(
      [...insidePoints, ...outsidePoints],
      2, // baked elevation was the base provider height
    );
    const aabb: AABB2D = { minX: -200, minZ: -200, maxX: 200, maxZ: 200 };

    const { artifact: result } = recomposeHydrologyArtifact(artifact, provider, [aabb]);
    const points = result.channelPolylines[0].points;

    for (let i = 0; i < 8; i++) {
      const point = points[i];
      const expectedGround = provider.getHeightAt(point.x, point.z);
      const expectedSurfaceY = expectedGround + HYDROLOGY_RIVER_SURFACE_OFFSET;
      const actualSurfaceY = point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET;
      expect(Math.abs(actualSurfaceY - expectedSurfaceY)).toBeLessThan(0.5);
    }
  });

  it('skips points whose composed-provider sample equals the baked elevation (delta = 0)', () => {
    // A point inside the AABB whose composed-provider sample matches the
    // baked elevation should NOT show up as "resampled" in stats —
    // re-sampling is a no-op there.
    const provider = makeFlatProvider(5);
    const artifact = makeSyntheticArtifact([[0, 0], [10, 0]], 5);
    const aabb: AABB2D = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };

    const { artifact: result, stats } = recomposeHydrologyArtifact(artifact, provider, [aabb]);
    expect(result.channelPolylines[0].points.every((p) => p.elevationMeters === 5)).toBe(true);
    expect(stats.pointsResampled).toBe(0);
    expect(stats.pointsScanned).toBe(2);
  });
});
