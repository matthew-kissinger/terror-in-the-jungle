import { describe, expect, it } from 'vitest';
import type { HydrologyBakeArtifact } from './HydrologyBake';
import { compileHydrologyTerrainFeatures } from './HydrologyTerrainFeatures';

function makeArtifact(): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 4,
    height: 4,
    cellSizeMeters: 20,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 20 },
    thresholds: {
      accumulationP90Cells: 10,
      accumulationP95Cells: 20,
      accumulationP98Cells: 40,
      accumulationP99Cells: 80,
    },
    masks: { wetCandidateCells: [1, 2], channelCandidateCells: [2] },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: 3,
        lengthCells: 4,
        lengthMeters: 80,
        maxAccumulationCells: 320,
        points: [
          { cell: 0, x: 0, z: 0, elevationMeters: 10, accumulationCells: 42 },
          { cell: 1, x: 20, z: 0, elevationMeters: 9, accumulationCells: 80 },
          { cell: 2, x: 40, z: 10, elevationMeters: 8, accumulationCells: 160 },
          { cell: 3, x: 60, z: 10, elevationMeters: 7, accumulationCells: 320 },
        ],
      },
    ],
  };
}

describe('compileHydrologyTerrainFeatures', () => {
  it('returns no terrain work without a hydrology artifact', () => {
    expect(compileHydrologyTerrainFeatures(null)).toEqual({
      stamps: [],
      vegetationExclusionZones: [],
    });
  });

  it('creates riverbed stamps and vegetation exclusions along channels', () => {
    const result = compileHydrologyTerrainFeatures(makeArtifact());

    expect(result.stamps.length).toBeGreaterThan(0);
    expect(result.vegetationExclusionZones.length).toBeGreaterThan(result.stamps.length);

    const first = result.stamps[0];
    expect(first?.kind).toBe('flatten_capsule');
    if (first?.kind !== 'flatten_capsule') throw new Error('expected flatten_capsule');

    expect(first.priority).toBeLessThan(50);
    expect(first.fixedTargetHeight).toBeLessThan(10);
    expect(first.innerRadius).toBeGreaterThan(0);
    expect(first.outerRadius).toBeGreaterThan(first.innerRadius);
    expect(first.gradeRadius).toBeGreaterThan(first.outerRadius);

    const exclusion = result.vegetationExclusionZones[0];
    expect(exclusion?.sourceId).toBe('hydrology-river-0');
    expect(exclusion?.radius).toBeGreaterThan(first.innerRadius);
    expect(exclusion?.radius).toBeGreaterThan(first.outerRadius);
  });

  it('keeps vegetation exclusion circles overlapping along long channel spans', () => {
    const artifact = makeArtifact();
    artifact.channelPolylines[0]!.points = [
      { cell: 0, x: 0, z: 0, elevationMeters: 10, accumulationCells: 160 },
      { cell: 1, x: 360, z: 0, elevationMeters: 8, accumulationCells: 320 },
    ];

    const result = compileHydrologyTerrainFeatures(artifact);

    expect(result.stamps).toHaveLength(1);
    expect(result.vegetationExclusionZones.length).toBeGreaterThan(4);
    for (let index = 1; index < result.vegetationExclusionZones.length; index++) {
      const previous = result.vegetationExclusionZones[index - 1]!;
      const current = result.vegetationExclusionZones[index]!;
      const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
      expect(distance).toBeLessThan(previous.radius + current.radius);
    }
  });
});
