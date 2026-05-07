import { describe, expect, it } from 'vitest';
import { A_SHAU_VALLEY_CONFIG } from './AShauValleyConfig';
import { OPEN_FRONTIER_CONFIG } from './OpenFrontierConfig';

describe('large-map hydrology runtime configuration', () => {
  it('enables baked hydrology-backed vegetation classification for A Shau', () => {
    expect(A_SHAU_VALLEY_CONFIG.hydrology).toEqual({
      preload: true,
      biomeClassification: {
        enabled: true,
        wetBiomeId: 'swamp',
        channelBiomeId: 'riverbank',
        maxSlopeDeg: 16,
      },
    });
  });

  it('enables seeded hydrology-backed riverbank vegetation classification for Open Frontier', () => {
    expect(OPEN_FRONTIER_CONFIG.hydrology).toEqual({
      preload: true,
      allowSeededFallback: true,
      biomeClassification: {
        enabled: true,
        wetBiomeId: 'riverbank',
        channelBiomeId: 'riverbank',
        maxSlopeDeg: 16,
      },
    });
  });
});
