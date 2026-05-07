import { describe, expect, it } from 'vitest';
import type { HydrologyChannelPolyline } from './HydrologyBake';
import { findNearestHydrologyChannel, sampleHydrologyCorridor } from './HydrologyCorridor';

const POLYLINE: HydrologyChannelPolyline = {
  headCell: 0,
  outletCell: 10,
  lengthCells: 11,
  lengthMeters: 100,
  maxAccumulationCells: 64,
  points: [
    {
      cell: 0,
      x: 0,
      z: 0,
      elevationMeters: 20,
      accumulationCells: 8,
    },
    {
      cell: 10,
      x: 100,
      z: 0,
      elevationMeters: 10,
      accumulationCells: 64,
    },
  ],
};

describe('HydrologyCorridor', () => {
  it('classifies channel, bank, wetland, and upland bands from a polyline', () => {
    const bands = {
      channelRadiusMeters: 6,
      bankRadiusMeters: 24,
      wetlandRadiusMeters: 60,
    };

    expect(sampleHydrologyCorridor([POLYLINE], 50, 4, bands).zone).toBe('channel');
    expect(sampleHydrologyCorridor([POLYLINE], 50, 20, bands).zone).toBe('bank');
    expect(sampleHydrologyCorridor([POLYLINE], 50, 50, bands).zone).toBe('wetland');
    expect(sampleHydrologyCorridor([POLYLINE], 50, 80, bands).zone).toBe('upland');
  });

  it('returns the nearest projected channel point with interpolated metadata', () => {
    const nearest = findNearestHydrologyChannel([POLYLINE], 25, 10);

    expect(nearest?.pathIndex).toBe(0);
    expect(nearest?.segmentIndex).toBe(0);
    expect(nearest?.distanceMeters).toBeCloseTo(10);
    expect(nearest?.x).toBeCloseTo(25);
    expect(nearest?.z).toBeCloseTo(0);
    expect(nearest?.t).toBeCloseTo(0.25);
    expect(nearest?.elevationMeters).toBeCloseTo(17.5);
    expect(nearest?.accumulationCells).toBeCloseTo(22);
  });

  it('accepts a bake artifact source without materializing masks', () => {
    const sample = sampleHydrologyCorridor({
      schemaVersion: 1,
      width: 4,
      height: 4,
      cellSizeMeters: 10,
      depressionHandling: 'epsilon-fill',
      transform: { originX: 0, originZ: 0, cellSizeMeters: 10 },
      thresholds: {
        accumulationP90Cells: 1,
        accumulationP95Cells: 2,
        accumulationP98Cells: 3,
        accumulationP99Cells: 4,
      },
      masks: {
        wetCandidateCells: [],
        channelCandidateCells: [],
      },
      channelPolylines: [POLYLINE],
    }, 50, 20, {
      channelRadiusMeters: 6,
      bankRadiusMeters: 24,
      wetlandRadiusMeters: 60,
    });

    expect(sample.zone).toBe('bank');
    expect(sample.nearest?.distanceMeters).toBeCloseTo(20);
  });

  it('keeps empty corridor data as upland', () => {
    const sample = sampleHydrologyCorridor([], 0, 0, {
      channelRadiusMeters: 6,
      bankRadiusMeters: 24,
      wetlandRadiusMeters: 60,
    });

    expect(sample.zone).toBe('upland');
    expect(sample.nearest).toBeNull();
  });

  it('rejects unordered corridor bands', () => {
    expect(() => sampleHydrologyCorridor([POLYLINE], 0, 0, {
      channelRadiusMeters: 30,
      bankRadiusMeters: 20,
      wetlandRadiusMeters: 60,
    })).toThrow(/ordered/);
  });
});
