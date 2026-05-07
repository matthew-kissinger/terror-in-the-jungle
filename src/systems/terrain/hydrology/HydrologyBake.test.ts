import { describe, expect, it } from 'vitest';
import {
  bakeHydrologyFromHeightGrid,
  computeD8FlowDirections,
  createHydrologyBakeArtifact,
  createHydrologyChannelPolylines,
  createHydrologyMasks,
  extractHydrologyChannelPaths,
  fillHydrologyDepressions,
  hydrologyCellIndex,
  isHydrologyWetCandidate,
  materializeHydrologyMasksFromArtifact,
  sampleHydrologyArtifactMasksAtWorld,
} from './HydrologyBake';

describe('HydrologyBake', () => {
  it('routes a simple slope downhill and accumulates contributing cells', () => {
    const width = 5;
    const height = 3;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = width - x;
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const middleLeft = hydrologyCellIndex(0, 1, width);
    const middleRight = hydrologyCellIndex(width - 1, 1, width);

    expect(result.downslope[middleLeft]).toBe(hydrologyCellIndex(1, 1, width));
    expect(result.downslope[middleRight]).toBe(-1);
    expect(result.accumulation[middleRight]).toBeGreaterThan(result.accumulation[middleLeft] ?? 0);
  });

  it('converges flow into a valley-floor channel', () => {
    const width = 5;
    const height = 5;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const distanceFromCenter = Math.abs(x - 2);
        heights[hydrologyCellIndex(x, z, width)] = distanceFromCenter * 10 + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 20, heights });
    const outlet = hydrologyCellIndex(2, height - 1, width);
    const side = hydrologyCellIndex(0, height - 1, width);

    expect(result.accumulation[outlet]).toBeGreaterThan(10);
    expect(result.accumulation[outlet]).toBeGreaterThan(result.accumulation[side] ?? 0);
    expect(result.thresholds.accumulationP98Cells).toBeGreaterThan(1);
  });

  it('exposes wet-candidate classification from accumulation, slope, and elevation', () => {
    const width = 4;
    const height = 4;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = (width - x) + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const outlet = hydrologyCellIndex(width - 1, height - 1, width);
    const ridge = hydrologyCellIndex(0, 0, width);

    expect(isHydrologyWetCandidate(result, outlet, 4, {
      minAccumulationCells: 4,
      maxElevationMeters: 20,
      maxSlopeDegrees: 12,
    })).toBe(true);
    expect(isHydrologyWetCandidate(result, ridge, 4, {
      minAccumulationCells: 4,
      maxElevationMeters: 20,
      maxSlopeDegrees: 12,
    })).toBe(false);
  });

  it('can epsilon-fill enclosed pits so D8 routing reaches an outlet', () => {
    const width = 5;
    const height = 5;
    const heights = new Float32Array(width * height);
    heights.fill(10);
    heights[hydrologyCellIndex(2, 2, width)] = 0;
    for (let z = 1; z < height - 1; z++) {
      for (let x = 1; x < width - 1; x++) {
        if (x === 2 && z === 2) continue;
        heights[hydrologyCellIndex(x, z, width)] = 5;
      }
    }

    const raw = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const filled = bakeHydrologyFromHeightGrid({
      width,
      height,
      cellSizeMeters: 10,
      heights,
      depressionHandling: 'epsilon-fill',
    });
    const center = hydrologyCellIndex(2, 2, width);
    const centerTarget = filled.downslope[center] ?? -1;

    expect(raw.downslope[center]).toBe(-1);
    expect(centerTarget).not.toBe(-1);
    expect(filled.heights[center]).toBe(0);
    expect(filled.routedHeights[center]).toBeGreaterThan(filled.routedHeights[centerTarget] ?? 0);
  });

  it('keeps already-draining terrain unchanged during epsilon fill', () => {
    const width = 4;
    const height = 4;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = (width - x) + (height - z);
      }
    }

    const filled = fillHydrologyDepressions(heights, width, height, 10);
    expect(Array.from(filled)).toEqual(Array.from(heights));
  });

  it('creates reusable wet and channel masks from a bake result', () => {
    const width = 4;
    const height = 4;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = (width - x) + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const slopes = new Float32Array(width * height);
    slopes.fill(4);
    const masks = createHydrologyMasks(result, {
      slopes,
      wetCandidate: {
        minAccumulationCells: 4,
        maxElevationMeters: 20,
        maxSlopeDegrees: 12,
      },
      channelMinAccumulationCells: 4,
    });
    const outlet = hydrologyCellIndex(width - 1, height - 1, width);
    const ridge = hydrologyCellIndex(0, 0, width);

    expect(masks.wetCandidate[outlet]).toBe(1);
    expect(masks.channelCandidate[outlet]).toBe(1);
    expect(masks.wetCandidate[ridge]).toBe(0);
    expect(masks.channelCandidate[ridge]).toBe(0);
    expect(() => createHydrologyMasks(result, {
      slopes: new Float32Array(1),
      wetCandidate: {
        minAccumulationCells: 1,
        maxElevationMeters: 1,
        maxSlopeDegrees: 1,
      },
      channelMinAccumulationCells: 1,
    })).toThrow(/slopes/);
  });

  it('extracts channel paths from thresholded accumulation', () => {
    const width = 5;
    const height = 5;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const distanceFromCenter = Math.abs(x - 2);
        heights[hydrologyCellIndex(x, z, width)] = distanceFromCenter * 10 + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 20, heights });
    const paths = extractHydrologyChannelPaths(result, {
      minAccumulationCells: 3,
      minLengthCells: 2,
    });

    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0]?.cells.length).toBeGreaterThanOrEqual(2);
    expect(paths[0]?.outletCell).toBe(hydrologyCellIndex(2, height - 1, width));
    expect(paths[0]?.maxAccumulationCells).toBeGreaterThanOrEqual(3);
  });

  it('converts channel paths into bounded world-space polylines', () => {
    const width = 5;
    const height = 5;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const distanceFromCenter = Math.abs(x - 2);
        heights[hydrologyCellIndex(x, z, width)] = distanceFromCenter * 10 + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 20, heights });
    const paths = extractHydrologyChannelPaths(result, {
      minAccumulationCells: 3,
      minLengthCells: 2,
    });
    const polylines = createHydrologyChannelPolylines(result, paths, {
      originX: -40,
      originZ: -40,
      cellSizeMeters: 20,
    }, { maxPointsPerPath: 3 });

    expect(polylines.length).toBeGreaterThan(0);
    expect(polylines[0]?.points.length).toBeLessThanOrEqual(4);
    expect(polylines[0]?.points[0]?.x).toBe(0);
    expect(polylines[0]?.points[0]?.z).toBeLessThanOrEqual(0);
    const lastPoint = polylines[0]?.points[(polylines[0]?.points.length ?? 1) - 1];
    expect(lastPoint?.cell).toBe(polylines[0]?.outletCell);
    expect(polylines[0]?.lengthMeters).toBe((polylines[0]?.lengthCells ?? 0) * 20);
  });

  it('serializes cacheable masks and channel polylines into a hydrology artifact', () => {
    const width = 4;
    const height = 4;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = (width - x) + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const slopes = new Float32Array(width * height);
    slopes.fill(4);
    const masks = createHydrologyMasks(result, {
      slopes,
      wetCandidate: {
        minAccumulationCells: 4,
        maxElevationMeters: 20,
        maxSlopeDegrees: 12,
      },
      channelMinAccumulationCells: 4,
    });
    const paths = extractHydrologyChannelPaths(result, {
      minAccumulationCells: 4,
      minLengthCells: 2,
    });
    const channelPolylines = createHydrologyChannelPolylines(result, paths, {
      originX: 100,
      originZ: 200,
      cellSizeMeters: 10,
    });

    const artifact = createHydrologyBakeArtifact(result, {
      transform: {
        originX: 100,
        originZ: 200,
        cellSizeMeters: 10,
      },
      masks,
      channelPolylines,
    });
    const restoredMasks = materializeHydrologyMasksFromArtifact(artifact);
    const outlet = hydrologyCellIndex(width - 1, height - 1, width);

    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.masks.wetCandidateCells).toContain(outlet);
    expect(artifact.masks.channelCandidateCells).toContain(outlet);
    expect(artifact.channelPolylines.length).toBe(channelPolylines.length);
    expect(Array.from(restoredMasks.wetCandidate)).toEqual(Array.from(masks.wetCandidate));
    expect(Array.from(restoredMasks.channelCandidate)).toEqual(Array.from(masks.channelCandidate));
  });

  it('samples serialized hydrology masks by world position', () => {
    const width = 4;
    const height = 4;
    const heights = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        heights[hydrologyCellIndex(x, z, width)] = (width - x) + (height - z);
      }
    }

    const result = bakeHydrologyFromHeightGrid({ width, height, cellSizeMeters: 10, heights });
    const slopes = new Float32Array(width * height);
    slopes.fill(4);
    const masks = createHydrologyMasks(result, {
      slopes,
      wetCandidate: {
        minAccumulationCells: 4,
        maxElevationMeters: 20,
        maxSlopeDegrees: 12,
      },
      channelMinAccumulationCells: 4,
    });
    const artifact = createHydrologyBakeArtifact(result, {
      transform: {
        originX: 100,
        originZ: 200,
        cellSizeMeters: 10,
      },
      masks,
    });

    const wetSample = sampleHydrologyArtifactMasksAtWorld(artifact, 130, 230);
    const ridgeSample = sampleHydrologyArtifactMasksAtWorld(artifact, 100, 200);

    expect(wetSample?.gridX).toBe(3);
    expect(wetSample?.gridZ).toBe(3);
    expect(wetSample?.wetCandidate).toBe(true);
    expect(wetSample?.channelCandidate).toBe(true);
    expect(ridgeSample?.wetCandidate).toBe(false);
    expect(sampleHydrologyArtifactMasksAtWorld(artifact, 1000, 2000)).toBeNull();
    expect(() => materializeHydrologyMasksFromArtifact({
      ...artifact,
      masks: {
        wetCandidateCells: [width * height],
        channelCandidateCells: [],
      },
    })).toThrow(/out of range/);
  });

  it('rejects malformed bake inputs', () => {
    expect(() => computeD8FlowDirections(new Float32Array(3), 2, 2, 10)).toThrow(/does not match/);
  });
});
