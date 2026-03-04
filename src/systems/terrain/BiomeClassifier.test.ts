import { describe, expect, it } from 'vitest';
import { A_SHAU_VALLEY_CONFIG } from '../../config/AShauValleyConfig';
import { classifyBiome } from './BiomeClassifier';

describe('BiomeClassifier', () => {
  it('keeps mid-elevation A Shau terrain in jungle instead of forcing highland rock', () => {
    const terrainConfig = A_SHAU_VALLEY_CONFIG.terrain;
    expect(terrainConfig).toBeDefined();

    const biomeId = classifyBiome(
      1000,
      24,
      terrainConfig?.biomeRules,
      terrainConfig?.defaultBiome ?? 'denseJungle',
    );

    expect(biomeId).toBe('denseJungle');
  });

  it('limits A Shau highland rock to upper ridges', () => {
    const terrainConfig = A_SHAU_VALLEY_CONFIG.terrain;
    expect(terrainConfig).toBeDefined();

    const biomeId = classifyBiome(
      1550,
      22,
      terrainConfig?.biomeRules,
      terrainConfig?.defaultBiome ?? 'denseJungle',
    );

    expect(biomeId).toBe('highland');
  });

  it('uses bamboo grove on flatter upland shelves before the highland cutoff', () => {
    const terrainConfig = A_SHAU_VALLEY_CONFIG.terrain;
    expect(terrainConfig).toBeDefined();

    const biomeId = classifyBiome(
      1200,
      12,
      terrainConfig?.biomeRules,
      terrainConfig?.defaultBiome ?? 'denseJungle',
    );

    expect(biomeId).toBe('bambooGrove');
  });
});
