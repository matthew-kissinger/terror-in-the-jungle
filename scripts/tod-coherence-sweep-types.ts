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

/**
 * Per-family anchor provenance for one swept TOD. Distinguishes a GENUINE
 * on-subject anchor from a degenerate one (an anchor that projected onto the
 * terrain foreground / clamped to a screen edge) and from a fixed-box fallback.
 * `degenerate` and `fallback` both mean the family measurement is UNMEASURED —
 * the family reading is terrain-vs-terrain, not the subject material. This is the
 * fix for the 0.977-PASS-vs-0.810-FAIL artifact contradiction: the old harness
 * reported `foliage=anchored` even when the anchor box overlapped the terrain
 * band and was clamped to the bottom screen edge (verified: gate/curves.json
 * 2026-06-25 foliage anchored at y=0.971, inside the terrain band 0.82-0.98).
 */
export type AnchorProvenanceKind = 'anchored' | 'degenerate' | 'fallback';

export interface AnchorProvenance {
  kind: AnchorProvenanceKind;
  /** On-screen instance candidates found for this family (0 => no live subject). */
  instanceCount: number;
  /** Screen-fraction anchor centre (null when no anchor projected). */
  screen: { x: number; y: number } | null;
  /** World-space anchor centre (null when no anchor projected). */
  world: { x: number; y: number; z: number } | null;
  /** Why the anchor is degenerate / fell back (empty for a genuine anchor). */
  reason: string;
}

export interface TodSample {
  hour: number;
  forceTimeOfDay: number;
  pngBytes: number;
  regions: Record<FamilyKey, Region>;
  /** Mean relative luminance per family; null where the region had no valid pixels. */
  luminance: Record<FamilyKey, number | null>;
  /** Anchor provenance per family, e.g. `foliage=anchored npc=degenerate glb=fallback`. */
  notes: string;
  /**
   * Structured anchor provenance per anchored family (foliage/npc/glb). Absent
   * on older curves.json; the gate treats a missing entry as `fallback`. This is
   * the machine-readable form of `notes` used to mark a family UNMEASURED.
   */
  anchors?: Partial<Record<FamilyKey, AnchorProvenance>>;
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
