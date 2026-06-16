// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  computeLOD0VertexSpacing,
  computeMaxLODLevels,
  computeSourceAwareMaxLODLevels,
} from './TerrainConfig';

describe('TerrainConfig CDLOD source-aware resolution', () => {
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
