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

describe('global water plane decouple flag', () => {
  // The SystemManager routes `globalWaterPlaneEnabled ?? waterEnabled` into
  // `WaterSystem.setEnabled()`. These tests document the resolution intent at
  // the config level so a future agent can't accidentally re-couple the
  // global sea-level plane to the high-level "water exists in scenario" flag.
  function resolveGlobalPlaneEnabled(config: {
    waterEnabled?: boolean;
    globalWaterPlaneEnabled?: boolean;
  }): boolean {
    const waterEnabled = config.waterEnabled !== false;
    return config.globalWaterPlaneEnabled ?? waterEnabled;
  }

  it('A Shau renders water without the sea-level global plane', () => {
    // The Sampan needs the hydrology river to render, but the 2000m flat
    // plane at Y=0 would sit ~580m below the valley floor — invisible and
    // wasted. The explicit decouple makes this legible.
    expect(A_SHAU_VALLEY_CONFIG.waterEnabled).toBe(true);
    expect(A_SHAU_VALLEY_CONFIG.globalWaterPlaneEnabled).toBe(false);
    expect(resolveGlobalPlaneEnabled(A_SHAU_VALLEY_CONFIG)).toBe(false);
  });

  it('Open Frontier keeps the legacy default (global plane on by default)', () => {
    // OF did not set either flag prior to this cycle; it should keep both
    // the global plane and the hydrology river rendering as today.
    expect(OPEN_FRONTIER_CONFIG.globalWaterPlaneEnabled).toBeUndefined();
    expect(resolveGlobalPlaneEnabled(OPEN_FRONTIER_CONFIG)).toBe(true);
  });

  it('defaults global plane to the waterEnabled value when only waterEnabled is set', () => {
    expect(resolveGlobalPlaneEnabled({ waterEnabled: false })).toBe(false);
    expect(resolveGlobalPlaneEnabled({ waterEnabled: true })).toBe(true);
    expect(resolveGlobalPlaneEnabled({})).toBe(true);
  });

  it('lets globalWaterPlaneEnabled override the waterEnabled default', () => {
    expect(
      resolveGlobalPlaneEnabled({ waterEnabled: true, globalWaterPlaneEnabled: false }),
    ).toBe(false);
    expect(
      resolveGlobalPlaneEnabled({ waterEnabled: false, globalWaterPlaneEnabled: true }),
    ).toBe(true);
  });
});
