// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { HydrologyBakeArtifact } from './HydrologyBake';
import { resolveHydrologyRiverWidthMeters } from './HydrologyRiverMetrics';

function makeArtifact(): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 4,
    height: 4,
    cellSizeMeters: 12,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 12 },
    thresholds: {
      accumulationP90Cells: 120,
      accumulationP95Cells: 320,
      accumulationP98Cells: 680,
      accumulationP99Cells: 1640,
    },
    masks: { wetCandidateCells: [], channelCandidateCells: [] },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: 3,
        lengthCells: 4,
        lengthMeters: 48,
        maxAccumulationCells: 26000,
        points: [
          { cell: 0, x: 0, z: 0, elevationMeters: 0, accumulationCells: 700 },
          { cell: 1, x: 12, z: 0, elevationMeters: 0, accumulationCells: 26000 },
        ],
      },
    ],
  };
}

describe('resolveHydrologyRiverWidthMeters', () => {
  it('keeps mid-flow tributaries visually subordinate to main rivers', () => {
    const artifact = makeArtifact();

    const headwater = resolveHydrologyRiverWidthMeters(700, artifact);
    const tributary = resolveHydrologyRiverWidthMeters(5000, artifact);
    const mainRiver = resolveHydrologyRiverWidthMeters(26000, artifact);

    expect(headwater).toBeLessThan(tributary);
    expect(tributary).toBeLessThan(mainRiver);
    expect(tributary).toBeLessThan(mainRiver * 0.65);
  });
});
