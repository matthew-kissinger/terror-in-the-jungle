// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared hydrology bake-artifact fixtures for Terror in the Jungle tests.
 *
 * Usage in test files:
 *   import { makeHydrologyArtifact, makeChannelPolyline } from '../../test-utils';
 *
 * The defaults describe a single straight channel running along +X with
 * monotonically falling elevation - the minimal valid input a river-geometry
 * builder accepts. Override any field for layer/shape-specific scenarios.
 */
import {
  HYDROLOGY_BAKE_ARTIFACT_VERSION,
  type HydrologyBakeArtifact,
  type HydrologyChannelPolyline,
  type HydrologyPolylinePoint,
} from '../systems/terrain/hydrology/HydrologyBake';

/** A single channel point. Defaults sit at the origin with mid accumulation. */
export function makePolylinePoint(
  overrides: Partial<HydrologyPolylinePoint> = {},
): HydrologyPolylinePoint {
  return {
    cell: 0,
    x: 0,
    z: 0,
    elevationMeters: 2,
    accumulationCells: 8,
    ...overrides,
  };
}

/**
 * A straight two-point channel along +X (from x=-5 to x=15) with a small
 * downstream drop. `points` can be overridden wholesale for curved/long paths.
 */
export function makeChannelPolyline(
  overrides: Partial<HydrologyChannelPolyline> = {},
): HydrologyChannelPolyline {
  const points = overrides.points ?? [
    makePolylinePoint({ cell: 0, x: -5, z: 0, elevationMeters: 2, accumulationCells: 8 }),
    makePolylinePoint({ cell: 1, x: 15, z: 0, elevationMeters: 1, accumulationCells: 16 }),
  ];
  return {
    headCell: 0,
    outletCell: 1,
    lengthCells: 2,
    lengthMeters: 20,
    maxAccumulationCells: 16,
    ...overrides,
    points,
  };
}

/**
 * A minimal valid {@link HydrologyBakeArtifact} with one straight channel.
 * Override `channelPolylines` (or any top-level field) per scenario.
 */
export function makeHydrologyArtifact(
  overrides: Partial<HydrologyBakeArtifact> = {},
): HydrologyBakeArtifact {
  return {
    schemaVersion: HYDROLOGY_BAKE_ARTIFACT_VERSION,
    width: 2,
    height: 2,
    cellSizeMeters: 10,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 10 },
    thresholds: {
      accumulationP90Cells: 2,
      accumulationP95Cells: 4,
      accumulationP98Cells: 8,
      accumulationP99Cells: 16,
    },
    masks: { wetCandidateCells: [1], channelCandidateCells: [1] },
    channelPolylines: [makeChannelPolyline()],
    ...overrides,
  };
}
