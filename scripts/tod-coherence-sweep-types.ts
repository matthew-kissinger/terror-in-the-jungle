// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared result types for the time-of-day coherence sweep + gate.
 *
 * Cycle `cycle-2026-06-09-lighting-acceptance` task `tod-coherence-gate`. These
 * types are extracted out of `capture-tod-coherence-sweep.ts` (which launches a
 * headless browser sweep on import) so the pure gate logic in
 * `tod-coherence-gate.ts` and its unit test can type the sweep's `curves.json`
 * shape without dragging in the capture machinery. Mirrors the
 * `perf-tail-attribution.ts` module split.
 */

export type FamilyKey = 'terrain' | 'foliage' | 'npc' | 'glb';

export interface Region {
  /** Fractional screen box, all in [0, 1]; x grows right, y grows down. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface TodSample {
  hour: number;
  forceTimeOfDay: number;
  pngBytes: number;
  regions: Record<FamilyKey, Region>;
  /** Mean relative luminance per family; null where the region had no valid pixels. */
  luminance: Record<FamilyKey, number | null>;
  /** Anchor provenance per family, e.g. `foliage=anchored npc=anchored glb=fallback`. */
  notes: string;
}

export interface FamilyCurve {
  family: FamilyKey;
  /** Luminance per swept hour (aligned to TOD_HOURS that produced a sample). */
  values: number[];
  hours: number[];
  min: number | null;
  max: number | null;
  range: number | null;
  /** range / terrain.range. Foliage << 1 is the known clamp-band defect signature. */
  rangeRatioVsTerrain: number | null;
  /** Pearson correlation of this family's curve against terrain's. */
  correlationVsTerrain: number | null;
}

export interface CurvesFile {
  createdAt: string;
  label: string;
  scenario: string;
  todHours: number[];
  samples: TodSample[];
  curves: FamilyCurve[];
}
