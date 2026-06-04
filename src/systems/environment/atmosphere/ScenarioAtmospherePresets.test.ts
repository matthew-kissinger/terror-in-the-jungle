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
});
