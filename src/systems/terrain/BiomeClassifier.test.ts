import { describe, expect, it } from 'vitest';
import { A_SHAU_VALLEY_CONFIG } from '../../config/AShauValleyConfig';
import { OPEN_FRONTIER_CONFIG } from '../../config/OpenFrontierConfig';
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

  it('keeps A Shau upper ridges jungle as the primary biome instead of brown caps', () => {
    const terrainConfig = A_SHAU_VALLEY_CONFIG.terrain;
    expect(terrainConfig).toBeDefined();

    const biomeId = classifyBiome(
      1550,
      22,
      terrainConfig?.biomeRules,
      terrainConfig?.defaultBiome ?? 'denseJungle',
    );

    expect(biomeId).toBe('denseJungle');
  });

  it('does not use a broad A Shau bamboo belt as the primary terrain biome', () => {
    const terrainConfig = A_SHAU_VALLEY_CONFIG.terrain;
    expect(terrainConfig).toBeDefined();

    const biomeId = classifyBiome(
      1200,
      12,
      terrainConfig?.biomeRules,
      terrainConfig?.defaultBiome ?? 'denseJungle',
    );

    expect(biomeId).toBe('denseJungle');
  });

  it('keeps procedural mid-elevation ground in jungle instead of broad rocky highland', () => {
    const terrainConfig = OPEN_FRONTIER_CONFIG.terrain;

    const biomeId = classifyBiome(
      30,
      10,
      terrainConfig.biomeRules,
      terrainConfig.defaultBiome,
    );

    expect(biomeId).toBe('denseJungle');
  });

  it('keeps procedural hilltops jungle as the primary biome instead of grey caps', () => {
    const terrainConfig = OPEN_FRONTIER_CONFIG.terrain;

    const biomeId = classifyBiome(
      80,
      8,
      terrainConfig.biomeRules,
      terrainConfig.defaultBiome,
    );

    expect(biomeId).toBe('denseJungle');
  });

  it('does not use procedural highland as the primary biome for steep hillsides', () => {
    const terrainConfig = OPEN_FRONTIER_CONFIG.terrain;

    const biomeId = classifyBiome(
      80,
      50,
      terrainConfig.biomeRules,
      terrainConfig.defaultBiome,
    );

    expect(biomeId).toBe('denseJungle');
  });
});
