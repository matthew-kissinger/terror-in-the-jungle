// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  SCENARIO_ATMOSPHERE_PRESETS,
  scenarioKeyForMode,
  type ScenarioAtmosphereKey,
} from './ScenarioAtmospherePresets';
import { GameMode } from '../../../config/gameModeTypes';

/**
 * Behaviour contract for the per-scenario atmosphere preset table. We
 * intentionally assert on bounded ranges and inter-scenario relative
 * ordering — NOT on specific exposure literals — because exposure values
 * are tuning constants that move with each tonemap-operator swap (see
 * `cycle-sun-and-atmosphere-overhaul` for the AGX vs ACES recalibration).
 * Per `docs/TESTING.md` rule 2, asserting on tuning constants creates
 * tests that die in the next retune.
 *
 * What we DO assert:
 * - Every scenario's exposure stays inside a safe rendering bound so a
 *   typo (e.g. dropping the leading zero) is caught before it ships an
 *   eye-melting white sky to playtest.
 * - The historical relative-brightness ordering between scenarios holds:
 *   noon scenarios (openfrontier, combat120) > dawn / golden hour
 *   (ashau, zc) > dusk (tdm). This monotonicity is the design intent
 *   (more sunlight = higher dome exposure), and it must survive the
 *   AGX recalibration just like it survived ACES.
 */
describe('SCENARIO_ATMOSPHERE_PRESETS', () => {
  const allKeys: ScenarioAtmosphereKey[] = [
    'ashau',
    'openfrontier',
    'tdm',
    'zc',
    'combat120',
  ];

  describe('exposure sanity', () => {
    for (const key of allKeys) {
      it(`${key} exposure is inside a reasonable rendering range`, () => {
        const exposure = SCENARIO_ATMOSPHERE_PRESETS[key].exposure;
        // 0.1 floor: anything lower and the dome reads near-black even
        // at noon (the pre-AGX low end was 0.16; halve that for slack).
        // 1.0 ceiling: anything higher and we're either mis-calibrated
        // against the renderer's tonemap or the preset has a typo
        // (e.g. someone dropped a leading zero).
        expect(exposure).toBeGreaterThan(0.1);
        expect(exposure).toBeLessThan(1.0);
      });
    }
  });

  describe('relative brightness ordering (post-tonemap-swap)', () => {
    // Design intent: noon scenes drive higher dome exposure than
    // dawn / golden hour, which in turn drive higher exposure than
    // dusk. This monotonicity has held across ACES and AGX recalibrations.
    // If it breaks, either a value got mistuned or the design intent
    // genuinely changed — both warrant a code-review prompt.

    it('noon (openfrontier) reads brighter than dawn (ashau)', () => {
      expect(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.exposure)
        .toBeGreaterThan(SCENARIO_ATMOSPHERE_PRESETS.ashau.exposure);
    });

    it('noon (openfrontier) reads brighter than golden hour (zc)', () => {
      expect(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.exposure)
        .toBeGreaterThan(SCENARIO_ATMOSPHERE_PRESETS.zc.exposure);
    });

    it('noon (openfrontier) reads brighter than dusk (tdm)', () => {
      expect(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.exposure)
        .toBeGreaterThan(SCENARIO_ATMOSPHERE_PRESETS.tdm.exposure);
    });

    it('combat120 (perf-noon) tracks openfrontier (visual-noon) exposure', () => {
      // combat120 mirrors openfrontier so the perf-baseline PNG diff
      // stays meaningful. If these drift apart, perf comparisons stop
      // being apples-to-apples with the historical baseline.
      expect(SCENARIO_ATMOSPHERE_PRESETS.combat120.exposure)
        .toBe(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.exposure);
    });

    it('dawn (ashau) and golden hour (zc) read brighter than dusk (tdm)', () => {
      // Dusk historically sat at the lowest exposure because the heavy
      // turbidity (7.0) already cranks the warm horizon band hot.
      expect(SCENARIO_ATMOSPHERE_PRESETS.ashau.exposure)
        .toBeGreaterThan(SCENARIO_ATMOSPHERE_PRESETS.tdm.exposure);
      expect(SCENARIO_ATMOSPHERE_PRESETS.zc.exposure)
        .toBeGreaterThan(SCENARIO_ATMOSPHERE_PRESETS.tdm.exposure);
    });
  });

  describe('scenarioKeyForMode mapping coverage', () => {
    it('routes every GameMode to a real preset key', () => {
      const modes: GameMode[] = [
        GameMode.A_SHAU_VALLEY,
        GameMode.OPEN_FRONTIER,
        GameMode.TEAM_DEATHMATCH,
        GameMode.ZONE_CONTROL,
        GameMode.AI_SANDBOX,
      ];
      for (const mode of modes) {
        const key = scenarioKeyForMode(mode);
        expect(SCENARIO_ATMOSPHERE_PRESETS[key]).toBeDefined();
      }
    });
  });

  /**
   * Phase 3 rig trims (`exposure-fog-presets-rig`): on the rig path each scenario
   * contributes BOUNDED tint/intensity multipliers over the physical baseline
   * instead of an absolute color stack. We assert the trims stay inside the
   * narrow band (so a trim can never re-create the old absolute-stack dominance)
   * and that the per-scenario INTENT reads correctly — warm scenarios lean warm,
   * the perf-baseline scenario stays identity. Bound magnitudes themselves are
   * tuning values, so we assert directional intent + the band, not literals.
   */
  describe('rig trims are bounded nudges over the physical baseline', () => {
    // Mirror of the trim band in LightingRigPresetTrim (kept local so this test
    // fails loudly if the band silently widens past a sane nudge range).
    const TINT_FLOOR = 0.7;
    const TINT_CEIL = 1.4;
    const INTENSITY_FLOOR = 0.75;
    const INTENSITY_CEIL = 1.35;

    for (const key of allKeys) {
      it(`${key} trim (if present) stays inside the nudge band`, () => {
        const trim = SCENARIO_ATMOSPHERE_PRESETS[key].rigTrim;
        if (!trim) return; // identity baseline is allowed (e.g. combat120)
        for (const tint of [trim.sunTint, trim.skyTint, trim.fogTint]) {
          if (!tint) continue;
          for (const ch of [tint.r, tint.g, tint.b]) {
            expect(ch).toBeGreaterThanOrEqual(TINT_FLOOR);
            expect(ch).toBeLessThanOrEqual(TINT_CEIL);
          }
        }
        if (trim.intensity !== undefined) {
          expect(trim.intensity).toBeGreaterThanOrEqual(INTENSITY_FLOOR);
          expect(trim.intensity).toBeLessThanOrEqual(INTENSITY_CEIL);
        }
      });
    }

    it('warm scenarios (dawn, dusk, golden hour) carry a warm sun tint (red > blue)', () => {
      for (const key of ['ashau', 'tdm', 'zc'] as const) {
        const sunTint = SCENARIO_ATMOSPHERE_PRESETS[key].rigTrim?.sunTint;
        expect(sunTint, `${key} should define a warm sun tint`).toBeDefined();
        expect(sunTint!.r).toBeGreaterThan(sunTint!.b);
      }
    });

    it('combat120 (perf baseline) carries no trim so its rig-path luminance stays directly comparable', () => {
      // A trim here would couple the perf baseline to artistic tuning. Identity
      // by design keeps the combat120 rig-path read comparable to openfrontier's.
      expect(SCENARIO_ATMOSPHERE_PRESETS.combat120.rigTrim).toBeUndefined();
    });
  });
});
