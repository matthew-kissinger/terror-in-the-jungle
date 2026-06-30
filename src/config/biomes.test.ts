// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { getBiome } from './biomes';

/**
 * Behavior: the two worst over-dense offenders from the 2026-06-28 owner playtest
 * (bamboo-thicket and the riverbank coconut-palm) were thinned so they no longer
 * wall in the player. We assert the live densities are LOWER than the pre-retune
 * baselines (and still place the species) rather than enshrining the exact retuned
 * tuning values, so a future re-tune in the same direction does not break this test.
 */
describe('vegetation density retune (vegetation-density-retune)', () => {
  // Pre-retune baselines captured at the time of the retune. These are the values
  // the owner flagged as too dense; the current config must read as strictly thinner.
  const PRE_RETUNE_BAMBOO_THICKET_DENSITY = 2.8;
  const PRE_RETUNE_RIVERBANK_COCONUT_DENSITY = 1.25;

  const densityFor = (biomeId: string, typeId: string): number | undefined =>
    getBiome(biomeId).vegetationPalette.find((entry) => entry.typeId === typeId)?.densityMultiplier;

  it('thins the bamboo-thicket below its wall-it-off baseline while keeping the species', () => {
    const density = densityFor('bambooGrove', 'bamboo-thicket');

    expect(density).toBeDefined();
    expect(density!).toBeLessThan(PRE_RETUNE_BAMBOO_THICKET_DENSITY);
    // Still present and still reads as dense bamboo (positive, above neutral).
    expect(density!).toBeGreaterThan(1);
  });

  it('thins the riverbank coconut palms below their wall-it-off baseline while keeping the species', () => {
    const density = densityFor('riverbank', 'coconut-palm');

    expect(density).toBeDefined();
    expect(density!).toBeLessThan(PRE_RETUNE_RIVERBANK_COCONUT_DENSITY);
    // Still scattered on the shoreline, just thinner.
    expect(density!).toBeGreaterThan(0);
  });
});
