// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  // The SystemManager routes `globalWaterPlaneEnabled === true` into
  // `WaterSystem.setEnabled()`. These tests document the resolution intent at
  // the config level so a future agent can't accidentally re-couple the old
  // global sea-level plane to the high-level "water exists in scenario" flag.
  function resolveGlobalPlaneEnabled(config: {
    waterEnabled?: boolean;
    globalWaterPlaneEnabled?: boolean;
  }): boolean {
    return config.globalWaterPlaneEnabled === true;
  }

  it('A Shau renders water without the sea-level global plane', () => {
    // The Sampan needs the hydrology river to render, but the 2000m flat
    // plane at Y=0 would sit ~580m below the valley floor — invisible and
    // wasted. The explicit decouple makes this legible.
    expect(A_SHAU_VALLEY_CONFIG.waterEnabled).toBe(true);
    expect(A_SHAU_VALLEY_CONFIG.globalWaterPlaneEnabled).toBe(false);
    expect(resolveGlobalPlaneEnabled(A_SHAU_VALLEY_CONFIG)).toBe(false);
  });

  it('Open Frontier renders hydrology water without the legacy global plane', () => {
    expect(OPEN_FRONTIER_CONFIG.waterEnabled).toBe(true);
    expect(OPEN_FRONTIER_CONFIG.globalWaterPlaneEnabled).toBe(false);
    expect(resolveGlobalPlaneEnabled(OPEN_FRONTIER_CONFIG)).toBe(false);
  });

  it('keeps the global plane off unless explicitly requested', () => {
    expect(resolveGlobalPlaneEnabled({ waterEnabled: false })).toBe(false);
    expect(resolveGlobalPlaneEnabled({ waterEnabled: true })).toBe(false);
    expect(resolveGlobalPlaneEnabled({})).toBe(false);
  });

  it('allows an explicit legacy override for debug or ocean-specific work', () => {
    expect(
      resolveGlobalPlaneEnabled({ waterEnabled: true, globalWaterPlaneEnabled: false }),
    ).toBe(false);
    expect(
      resolveGlobalPlaneEnabled({ waterEnabled: false, globalWaterPlaneEnabled: true }),
    ).toBe(true);
  });
});
