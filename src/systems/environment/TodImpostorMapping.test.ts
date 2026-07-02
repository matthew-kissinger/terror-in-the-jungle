// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  FULL_DAY_ELEVATION_RAD,
  NIGHT_ELEVATION_RAD,
  TOD_IMPOSTOR_FAMILY_CURVES,
  TodImpostorMappingConfig,
  evaluateTodImpostorGrade,
  isTodImpostorMappingEnabled,
  todImpostorDayFactor,
  todImpostorMappingBindings,
  updateTodImpostorMapping,
  type TodImpostorFamily,
  type TodImpostorGrade,
} from './TodImpostorMapping';

/**
 * L1 behavior tests for the per-family TOD impostor mapping
 * (`tod-impostor-dynamic-mapping`). These assert the observable contract the
 * three card materials depend on — identity at high sun (midday look preserved),
 * monotonic dimming toward night, bounded per-family divergence, and a kill-switch
 * that freezes the grade at identity — NOT the specific tuning constants (which
 * are artistic values that will be re-tuned against the coherence gate). See
 * docs/TESTING.md.
 */

const FAMILIES: TodImpostorFamily[] = ['foliage', 'staticImpostor', 'npc'];

function freshGrade(): TodImpostorGrade {
  return { exposureMul: 1, saturationMul: 1, tint: new THREE.Color(1, 1, 1) };
}

describe('TodImpostorMapping day factor', () => {
  it('is full daylight (1) at and above the full-day sun elevation', () => {
    expect(todImpostorDayFactor(FULL_DAY_ELEVATION_RAD)).toBeCloseTo(1, 6);
    expect(todImpostorDayFactor(FULL_DAY_ELEVATION_RAD + 0.5)).toBeCloseTo(1, 6);
    expect(todImpostorDayFactor(Math.PI / 2)).toBeCloseTo(1, 6);
  });

  it('is full night (0) at and below the night sun elevation', () => {
    expect(todImpostorDayFactor(NIGHT_ELEVATION_RAD)).toBeCloseTo(0, 6);
    expect(todImpostorDayFactor(NIGHT_ELEVATION_RAD - 0.3)).toBeCloseTo(0, 6);
  });

  it('rises monotonically (no pop) as the sun climbs through the dawn shoulder', () => {
    let prev = -1;
    for (let e = NIGHT_ELEVATION_RAD; e <= FULL_DAY_ELEVATION_RAD; e += 0.01) {
      const d = todImpostorDayFactor(e);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
  });
});

describe('TodImpostorMapping grade evaluator', () => {
  it('is exact identity at full daylight for every family (midday look preserved)', () => {
    for (const family of FAMILIES) {
      const grade = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], 1, freshGrade());
      expect(grade.exposureMul).toBeCloseTo(1, 6);
      expect(grade.saturationMul).toBeCloseTo(1, 6);
      expect(grade.tint.r).toBeCloseTo(1, 6);
      expect(grade.tint.g).toBeCloseTo(1, 6);
      expect(grade.tint.b).toBeCloseTo(1, 6);
    }
  });

  it('dims and desaturates every family toward night relative to midday', () => {
    for (const family of FAMILIES) {
      const day = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], 1, freshGrade());
      const night = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], 0, freshGrade());
      expect(night.exposureMul).toBeLessThan(day.exposureMul);
      expect(night.saturationMul).toBeLessThan(day.saturationMul);
    }
  });

  it('exposure dims monotonically from midday to night for every family', () => {
    for (const family of FAMILIES) {
      let prev = Infinity;
      for (let d = 1; d >= 0; d -= 0.05) {
        const grade = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], d, freshGrade());
        expect(grade.exposureMul).toBeLessThanOrEqual(prev + 1e-9);
        prev = grade.exposureMul;
      }
    }
  });

  it('warms the night tint (red >= blue) so cards redden toward dusk, not cool', () => {
    for (const family of FAMILIES) {
      const night = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], 0, freshGrade());
      expect(night.tint.r).toBeGreaterThanOrEqual(night.tint.b);
    }
  });

  it('dims the npc family harder than foliage at night (the low-sun overshoot fix)', () => {
    // The measured defect: npc OVERSHOT terrain brightness at low sun. Its night
    // grade must pull brightness down more aggressively than foliage so its
    // luminance curve tracks terrain instead of glowing at dusk.
    const npcNight = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES.npc, 0, freshGrade());
    const foliageNight = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES.foliage, 0, freshGrade());
    expect(npcNight.exposureMul).toBeLessThan(foliageNight.exposureMul);
  });

  it('keeps per-family divergence bounded — no family collapses to black or blows up', () => {
    for (const family of FAMILIES) {
      for (const d of [0, 0.5, 1]) {
        const grade = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], d, freshGrade());
        // A night grade dims, but stays a readable fraction (never zero) and never
        // brightens past the midday identity.
        expect(grade.exposureMul).toBeGreaterThan(0.25);
        expect(grade.exposureMul).toBeLessThanOrEqual(1 + 1e-9);
        expect(grade.saturationMul).toBeGreaterThan(0.4);
        expect(grade.saturationMul).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('TodImpostorMapping shared bindings update', () => {
  afterEach(() => {
    // Restore the production default (ON) after any kill-switch flip.
    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(Math.PI / 2);
  });

  it('defaults ON so production applies the per-family grade', () => {
    expect(isTodImpostorMappingEnabled()).toBe(true);
  });

  it('writes identity into every family binding at a high sun', () => {
    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(Math.PI / 2);
    expect(todImpostorMappingBindings.enabled.value).toBe(1);
    for (const family of FAMILIES) {
      const b = todImpostorMappingBindings[family];
      expect(b.exposureMul.value).toBeCloseTo(1, 6);
      expect(b.saturationMul.value).toBeCloseTo(1, 6);
      expect(b.tint.value.r).toBeCloseTo(1, 6);
    }
  });

  it('dims the family bindings at a low sun (the visible dawn/dusk change)', () => {
    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(NIGHT_ELEVATION_RAD);
    for (const family of FAMILIES) {
      expect(todImpostorMappingBindings[family].exposureMul.value).toBeLessThan(1);
    }
  });

  it('freezes every binding at identity when the kill-switch is OFF', () => {
    // First push a night grade so the bindings are non-identity...
    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(NIGHT_ELEVATION_RAD);
    // ...then flip OFF and confirm the update pins them all back to identity,
    // reproducing construction-time static-uniform behavior exactly.
    TodImpostorMappingConfig.enabled = false;
    updateTodImpostorMapping(NIGHT_ELEVATION_RAD);
    expect(todImpostorMappingBindings.enabled.value).toBe(0);
    for (const family of FAMILIES) {
      const b = todImpostorMappingBindings[family];
      expect(b.exposureMul.value).toBe(1);
      expect(b.saturationMul.value).toBe(1);
      expect(b.tint.value.r).toBe(1);
      expect(b.tint.value.g).toBe(1);
      expect(b.tint.value.b).toBe(1);
    }
  });
});
