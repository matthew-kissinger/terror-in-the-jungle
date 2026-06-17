// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  computeDefaultLODRanges,
  computeLOD0VertexSpacing,
  computeMaxLODLevels,
  computeSourceAwareMaxLODLevels,
  createTerrainConfig,
} from './TerrainConfig';

describe('TerrainConfig CDLOD source-aware resolution', () => {
  it('derives LOD ranges from the visual quadtree extent, not playable-only size', () => {
    const worldSize = 3200;
    const visualMargin = 200;
    const maxLODLevels = 6;

    const ranges = computeDefaultLODRanges(worldSize, maxLODLevels, visualMargin);
    const playableOnlyRanges = computeDefaultLODRanges(worldSize, maxLODLevels, 0);
    const quadtreeSize = worldSize + visualMargin * 2;

    expect(ranges[0]).toBeCloseTo((quadtreeSize / 2 ** maxLODLevels) * 4);
    expect(ranges[0]).toBeGreaterThan(playableOnlyRanges[0]);
    expect(ranges.at(-1)).toBeCloseTo(playableOnlyRanges.at(-1)! * (quadtreeSize / worldSize));
  });

  it('creates default terrain config with LOD ranges aligned to visual margin', () => {
    const config = createTerrainConfig({
      worldSize: 3200,
      visualMargin: 200,
      maxLODLevels: 6,
    });

    expect(config.lodRanges).toEqual(computeDefaultLODRanges(3200, 6, 200));
  });

  it('keeps procedural terrain on the existing 4m target path', () => {
    const worldSize = 3200;
    const visualMargin = 200;

    expect(computeSourceAwareMaxLODLevels(worldSize, visualMargin, 32)).toBe(
      computeMaxLODLevels(worldSize, visualMargin, 32),
    );
  });

  it('caps DEM render depth so A Shau does not oversample below source spacing', () => {
    const worldSize = 21136;
    const visualMargin = 200;
    const demMetersPerPixel = 9;

    const defaultLevels = computeMaxLODLevels(worldSize, visualMargin, 32);
    const sourceAwareLevels = computeSourceAwareMaxLODLevels(
      worldSize,
      visualMargin,
      32,
      4,
      demMetersPerPixel,
    );

    expect(sourceAwareLevels).toBeLessThan(defaultLevels);
    expect(computeLOD0VertexSpacing(worldSize, visualMargin, sourceAwareLevels, 32))
      .toBeGreaterThanOrEqual(demMetersPerPixel);
  });

  it('does not reduce render depth for finite sources finer than the target path', () => {
    const worldSize = 3200;
    const visualMargin = 200;
    const finePrebakedSpacing = 3200 / 1023;

    expect(computeSourceAwareMaxLODLevels(worldSize, visualMargin, 32, 4, finePrebakedSpacing)).toBe(
      computeMaxLODLevels(worldSize, visualMargin, 32),
    );
  });
});
