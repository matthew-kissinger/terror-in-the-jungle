// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { evaluateCoherenceGate } from './tod-coherence-gate';
import type { FamilyCurve, FamilyKey, TodSample } from './tod-coherence-sweep-types';

/**
 * Behavior proof for the TOD coherence gate (Phase 4 R1, L1). Drives the pure
 * verdict function with synthetic sweep results and asserts the OBSERVABLE
 * outcome — does the gate pass, and on failure does it name the right family —
 * rather than the internal tolerance constants (those are tuning values per
 * docs/TESTING.md). The synthetic numbers are modeled on the PR #379 merge
 * evidence: a coherent rig-path run (foliage corr ~0.99, npc tracking terrain)
 * passes; the legacy clamp-band defect (foliage range << terrain) and the dawn
 * white-out fail with the family named.
 */

const TOD_HOURS = [0, 6, 12, 17];

/** A fully-anchored, in-band sample at one hour. */
function sample(
  hour: number,
  lum: Partial<Record<FamilyKey, number | null>>,
  npcAnchored = true
): TodSample {
  const luminance: Record<FamilyKey, number | null> = {
    terrain: lum.terrain ?? null,
    foliage: lum.foliage ?? null,
    npc: lum.npc ?? null,
    glb: lum.glb ?? null,
  };
  const notes = `foliage=anchored npc=${npcAnchored ? 'anchored' : 'fallback'} glb=anchored`;
  const region = { x0: 0, x1: 1, y0: 0, y1: 1 };
  return {
    hour,
    forceTimeOfDay: hour / 24,
    pngBytes: 1000,
    regions: { terrain: region, foliage: region, npc: region, glb: region },
    luminance,
    notes,
  };
}

function curve(
  family: FamilyKey,
  values: number[],
  hours: number[],
  rangeRatioVsTerrain: number | null,
  correlationVsTerrain: number | null
): FamilyCurve {
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  return {
    family,
    values,
    hours,
    min,
    max,
    range: min !== null && max !== null ? max - min : null,
    rangeRatioVsTerrain,
    correlationVsTerrain,
  };
}

describe('evaluateCoherenceGate', () => {
  it('passes a coherent rig-path sweep where every family tracks terrain', () => {
    // Terrain swings day/night; foliage + npc + glb track it (high corr, in-band range).
    const samples: TodSample[] = [
      sample(0, { terrain: 0.04, foliage: 0.045, npc: 0.05, glb: 0.042 }),
      sample(6, { terrain: 0.30, foliage: 0.28, npc: 0.31, glb: 0.30 }),
      sample(12, { terrain: 0.62, foliage: 0.58, npc: 0.60, glb: 0.61 }),
      sample(17, { terrain: 0.34, foliage: 0.33, npc: 0.35, glb: 0.34 }),
    ];
    const curves: FamilyCurve[] = [
      curve('terrain', [0.04, 0.30, 0.62, 0.34], TOD_HOURS, 1.0, 1.0),
      curve('foliage', [0.045, 0.28, 0.58, 0.33], TOD_HOURS, 0.95, 0.99),
      curve('npc', [0.05, 0.31, 0.60, 0.35], TOD_HOURS, 0.96, 0.99),
      curve('glb', [0.042, 0.30, 0.61, 0.34], TOD_HOURS, 0.98, 0.99),
    ];
    const verdict = evaluateCoherenceGate(curves, samples, TOD_HOURS);
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.npcAnchored).toBe(true);
    expect(verdict.allTodsMeasurable).toBe(true);
  });

  it('fails and names foliage when it swings far less than terrain (the clamp-band defect)', () => {
    const samples: TodSample[] = [
      sample(0, { terrain: 0.04, foliage: 0.40, npc: 0.31, glb: 0.042 }),
      sample(6, { terrain: 0.30, foliage: 0.50, npc: 0.31, glb: 0.30 }),
      sample(12, { terrain: 0.62, foliage: 0.55, npc: 0.60, glb: 0.61 }),
      sample(17, { terrain: 0.34, foliage: 0.48, npc: 0.35, glb: 0.34 }),
    ];
    const curves: FamilyCurve[] = [
      curve('terrain', [0.04, 0.30, 0.62, 0.34], TOD_HOURS, 1.0, 1.0),
      // Foliage clamped: tiny range relative to terrain -> rangeRatio well below the band.
      curve('foliage', [0.40, 0.50, 0.55, 0.48], TOD_HOURS, 0.26, 0.70),
      curve('npc', [0.31, 0.31, 0.60, 0.35], TOD_HOURS, 0.95, 0.96),
      curve('glb', [0.042, 0.30, 0.61, 0.34], TOD_HOURS, 0.98, 0.99),
    ];
    const verdict = evaluateCoherenceGate(curves, samples, TOD_HOURS);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((f) => f.includes('foliage'))).toBe(true);
  });

  it('fails on a dawn terrain white-out (terrain too bright at the dawn TOD)', () => {
    const samples: TodSample[] = [
      sample(0, { terrain: 0.04, foliage: 0.045, npc: 0.05, glb: 0.042 }),
      // Dawn white-out: terrain reads near-white at 6h.
      sample(6, { terrain: 0.95, foliage: 0.88, npc: 0.90, glb: 0.93 }),
      sample(12, { terrain: 0.62, foliage: 0.58, npc: 0.60, glb: 0.61 }),
      sample(17, { terrain: 0.34, foliage: 0.33, npc: 0.35, glb: 0.34 }),
    ];
    const curves: FamilyCurve[] = [
      curve('terrain', [0.04, 0.95, 0.62, 0.34], TOD_HOURS, 1.0, 1.0),
      curve('foliage', [0.045, 0.88, 0.58, 0.33], TOD_HOURS, 0.95, 0.99),
      curve('npc', [0.05, 0.90, 0.60, 0.35], TOD_HOURS, 0.96, 0.99),
      curve('glb', [0.042, 0.93, 0.61, 0.34], TOD_HOURS, 0.98, 0.99),
    ];
    const verdict = evaluateCoherenceGate(curves, samples, TOD_HOURS);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((f) => f.toLowerCase().includes('white-out') || f.includes('dawn'))).toBe(true);
  });

  it('fails when the npc family fell back to the fixed box (not real pixels)', () => {
    const samples: TodSample[] = [
      sample(0, { terrain: 0.04, foliage: 0.045, npc: 0.05, glb: 0.042 }, false),
      sample(6, { terrain: 0.30, foliage: 0.28, npc: 0.31, glb: 0.30 }, false),
      sample(12, { terrain: 0.62, foliage: 0.58, npc: 0.60, glb: 0.61 }, false),
      sample(17, { terrain: 0.34, foliage: 0.33, npc: 0.35, glb: 0.34 }, false),
    ];
    const curves: FamilyCurve[] = [
      curve('terrain', [0.04, 0.30, 0.62, 0.34], TOD_HOURS, 1.0, 1.0),
      curve('foliage', [0.045, 0.28, 0.58, 0.33], TOD_HOURS, 0.95, 0.99),
      curve('npc', [0.05, 0.31, 0.60, 0.35], TOD_HOURS, 0.96, 0.99),
      curve('glb', [0.042, 0.30, 0.61, 0.34], TOD_HOURS, 0.98, 0.99),
    ];
    const verdict = evaluateCoherenceGate(curves, samples, TOD_HOURS);
    expect(verdict.npcAnchored).toBe(false);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.some((f) => f.includes('npc'))).toBe(true);
  });

  it('fails when a swept TOD produced no terrain reading (a hole in the curve)', () => {
    const samples: TodSample[] = [
      sample(0, { terrain: 0.04, foliage: 0.045, npc: 0.05, glb: 0.042 }),
      sample(6, { terrain: 0.30, foliage: 0.28, npc: 0.31, glb: 0.30 }),
      // 12h terrain unmeasurable.
      sample(12, { terrain: null, foliage: 0.58, npc: 0.60, glb: 0.61 }),
      sample(17, { terrain: 0.34, foliage: 0.33, npc: 0.35, glb: 0.34 }),
    ];
    const curves: FamilyCurve[] = [
      curve('terrain', [0.04, 0.30, 0.34], [0, 6, 17], 1.0, 1.0),
      curve('foliage', [0.045, 0.28, 0.58, 0.33], TOD_HOURS, 0.95, 0.99),
      curve('npc', [0.05, 0.31, 0.60, 0.35], TOD_HOURS, 0.96, 0.99),
      curve('glb', [0.042, 0.30, 0.61, 0.34], TOD_HOURS, 0.98, 0.99),
    ];
    const verdict = evaluateCoherenceGate(curves, samples, TOD_HOURS);
    expect(verdict.allTodsMeasurable).toBe(false);
    expect(verdict.passed).toBe(false);
  });
});
