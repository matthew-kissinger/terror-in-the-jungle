import { describe, expect, it } from 'vitest';
import { classifyHydrologyBiome, createHydrologyBiomeClassifier } from './HydrologyBiomeClassifier';
import type { HydrologyBakeArtifact } from './HydrologyBake';

const ARTIFACT: HydrologyBakeArtifact = {
  schemaVersion: 1,
  width: 3,
  height: 3,
  cellSizeMeters: 10,
  depressionHandling: 'epsilon-fill',
  transform: {
    originX: -10,
    originZ: -10,
    cellSizeMeters: 10,
  },
  thresholds: {
    accumulationP90Cells: 3,
    accumulationP95Cells: 4,
    accumulationP98Cells: 5,
    accumulationP99Cells: 6,
  },
  masks: {
    wetCandidateCells: [4, 5],
    channelCandidateCells: [5],
  },
  channelPolylines: [],
};

describe('HydrologyBiomeClassifier', () => {
  it('keeps the base biome outside hydrology mask coverage', () => {
    const classifier = createHydrologyBiomeClassifier(ARTIFACT, {
      wetBiomeId: 'swamp',
      channelBiomeId: 'riverbank',
    });

    expect(classifyHydrologyBiome('denseJungle', 10, 5, -10, -10, classifier)).toBe('denseJungle');
  });

  it('uses wet and channel candidate masks as explicit biome overrides', () => {
    const classifier = createHydrologyBiomeClassifier(ARTIFACT, {
      wetBiomeId: 'swamp',
      channelBiomeId: 'riverbank',
    });

    expect(classifyHydrologyBiome('denseJungle', 10, 5, 0, 0, classifier)).toBe('swamp');
    expect(classifyHydrologyBiome('denseJungle', 10, 5, 10, 0, classifier)).toBe('riverbank');
  });

  it('lets the slope cap reject hydrology overrides on steep terrain', () => {
    const classifier = createHydrologyBiomeClassifier(ARTIFACT, {
      wetBiomeId: 'swamp',
      channelBiomeId: 'riverbank',
      maxSlopeDeg: 12,
    });

    expect(classifyHydrologyBiome('denseJungle', 10, 20, 10, 0, classifier)).toBe('denseJungle');
  });
});
