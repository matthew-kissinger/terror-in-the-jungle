// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Time-of-day cross-material coherence GATE — pure verdict logic.
 *
 * Cycle `cycle-2026-06-09-lighting-acceptance` task `tod-coherence-gate`
 * (Phase 4 of `docs/CAMPAIGN_2026-06-09-lighting-rig.md`). This module holds the
 * committed tolerances and the pass/fail evaluation, extracted out of
 * `capture-tod-coherence-sweep.ts` so the gate verdict is unit-testable WITHOUT
 * importing the capture script (which launches a headless browser sweep on
 * import). Mirrors the `perf-tail-attribution.ts` split idiom.
 *
 * The tolerances are the committed coherence band from
 * `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §5 ("Coherence band"). They are
 * the FLOOR a regression must not cross — the cross-material coherence SOL-1's
 * channel gates never checked. They live here as named constants with the memo
 * reference so a future tightening (the memo's Phase-2-exit `r >= 0.95` /
 * `[0.7, 1.4]` target) is an obvious one-line edit against a documented source,
 * not a magic-number hunt.
 */

import type { AnchorProvenanceKind, FamilyCurve, FamilyKey, TodSample } from './tod-coherence-sweep-types';
import { isUnmeasuredAnchor } from './tod-coherence-anchor';

/**
 * Committed coherence tolerances. Source:
 * `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §5 "Coherence band".
 *
 * - MIN_CORRELATION: each non-terrain family's normalized luminance curve must
 *   track terrain's with Pearson r >= this. "Families must brighten/darken
 *   together" — the cross-material coherence assertion.
 * - RANGE_RATIO_(MIN|MAX): at the curve level, each family's luminance RANGE
 *   must sit within [MIN, MAX]x terrain's range. The band the [0.40, 0.78]
 *   foliage clamp violates at the TOD extremes today.
 * - DAWN_TERRAIN_MAX_LUMINANCE: terrain mean luminance at the dawn TOD must be
 *   <= this. A direct assertion against HACK 1's dawn white-out failure mode.
 * - DAWN_HOUR: the absolute clock hour treated as "dawn" for the white-out
 *   guard. Matches the ashau preset sunrise (~6h) used by the sweep fixture.
 */
export const COHERENCE_TOLERANCES = {
  /** Pearson r floor of each family curve vs terrain. Memo §5 bullet 1. */
  MIN_CORRELATION: 0.92,
  /** Lower bound of family-range / terrain-range. Memo §5 bullet 2. */
  RANGE_RATIO_MIN: 0.6,
  /** Upper bound of family-range / terrain-range. Memo §5 bullet 2. */
  RANGE_RATIO_MAX: 1.6,
  /** Dawn-TOD terrain mean-luminance ceiling (white-out guard). Memo §5 bullet 3. */
  DAWN_TERRAIN_MAX_LUMINANCE: 0.85,
  /** Absolute clock hour used as the dawn sample for the white-out guard. */
  DAWN_HOUR: 6,
} as const;

/**
 * The non-terrain families the gate evaluates. Terrain is the reference
 * (always r=1, ratio=1); GLB is the de-facto PBR truth family and is reported,
 * but the campaign's owner-headline families are foliage + npc.
 */
export const GATED_FAMILIES: FamilyKey[] = ['foliage', 'npc', 'glb'];

/**
 * Families whose correlation + range-ratio failure is a HARD gate failure (the
 * owner's headline symptom and the campaign's reason to exist). GLB is reported
 * but advisory — it was never the defect and has no per-family clamp.
 */
export const HARD_GATED_FAMILIES: FamilyKey[] = ['foliage', 'npc'];

export type CheckStatus = 'pass' | 'fail' | 'unmeasurable';

export interface GateCheck {
  /** Stable identifier, e.g. `foliage.correlation`, `terrain.dawnLuminance`. */
  id: string;
  status: CheckStatus;
  /** Whether this check, when not passing, fails the overall gate. */
  hard: boolean;
  /** Measured value (null when unmeasurable). */
  value: number | null;
  /** Human-readable band, e.g. `>= 0.92` or `[0.6, 1.6]`. */
  bound: string;
  /** One-line explanation for the verdict log. */
  detail: string;
}

export interface GateVerdict {
  passed: boolean;
  /** True when every swept TOD produced a measurable terrain luminance. */
  allTodsMeasurable: boolean;
  /** True when the npc family anchored on real pixels at every measured TOD. */
  npcAnchored: boolean;
  /**
   * Per anchored family: is the family GENUINELY MEASURED (anchored on real
   * subject pixels at every measured TOD), or UNMEASURED (a degenerate anchor or
   * a fixed-box fallback at one or more TODs — a terrain-vs-terrain reading)?
   * A hard-gated family that is UNMEASURED means the instrument is broken for
   * that family; its corr/rangeRatio numbers are not trustworthy.
   */
  familyMeasured: Partial<Record<FamilyKey, boolean>>;
  checks: GateCheck[];
  /** Short reasons the gate failed, empty when passed. */
  failures: string[];
}

function findCurve(curves: FamilyCurve[], family: FamilyKey): FamilyCurve | undefined {
  return curves.find((c) => c.family === family);
}

/**
 * Resolve the per-TOD anchor provenance kind for a family, preferring the
 * structured `sample.anchors` entry and falling back to parsing the legacy
 * `notes` string (`<family>=anchored|degenerate|fallback`). A missing entry is
 * treated as `fallback` (UNMEASURED) — an older curves.json without provenance
 * cannot prove it measured real pixels.
 */
function anchorKindForSample(sample: TodSample, family: FamilyKey): AnchorProvenanceKind {
  const structured = sample.anchors?.[family]?.kind;
  if (structured) return structured;
  if (new RegExp(`\\b${family}=anchored\\b`).test(sample.notes)) return 'anchored';
  if (new RegExp(`\\b${family}=degenerate\\b`).test(sample.notes)) return 'degenerate';
  return 'fallback';
}

/**
 * A family is GENUINELY MEASURED only when it anchored on real subject pixels at
 * EVERY TOD that produced a luminance reading. A single degenerate/fallback TOD
 * poisons the family's whole curve (its corr/rangeRatio mixes real cards with
 * terrain foreground), so the whole family is treated as UNMEASURED. Families
 * with no measured TOD at all are also UNMEASURED.
 */
function isFamilyMeasured(samples: TodSample[], family: FamilyKey): boolean {
  const measured = samples.filter((s) => s.luminance[family] !== null);
  return (
    measured.length > 0 &&
    measured.every((s) => !isUnmeasuredAnchor(anchorKindForSample(s, family)))
  );
}

/**
 * Evaluate the committed coherence gate against a completed sweep's curves +
 * per-TOD samples. Pure: no IO, no clock, deterministic in its inputs.
 *
 * Hard failure modes (any one fails the gate):
 *   - any hard-gated family (foliage, npc) UNMEASURED — a degenerate anchor
 *     (projected onto the terrain foreground) or a fixed-box fallback at any TOD;
 *     the instrument is broken for that family and its corr/rangeRatio numbers
 *     are terrain-vs-terrain, NOT a coherence signal (the 0.977-vs-0.810
 *     artifact contradiction root cause);
 *   - any hard-gated family that IS measured but below MIN_CORRELATION;
 *   - any hard-gated family that IS measured but range ratio outside
 *     [RANGE_RATIO_MIN, MAX];
 *   - dawn terrain luminance above DAWN_TERRAIN_MAX_LUMINANCE;
 *   - any swept TOD with no measurable terrain luminance (curve has a hole).
 *
 * A hard-gated family that is UNMEASURED fails the gate LOUDLY (an
 * `<family>.measured` check with status `unmeasurable`) instead of silently
 * passing a terrain-vs-terrain reading. The corr/rangeRatio checks for an
 * UNMEASURED family are still recorded for evidence but are marked
 * `unmeasurable` and do not themselves fail the gate (the `.measured` check owns
 * the failure). GLB checks are recorded but advisory (hard=false).
 */
export function evaluateCoherenceGate(
  curves: FamilyCurve[],
  samples: TodSample[],
  todHours: number[]
): GateVerdict {
  const checks: GateCheck[] = [];
  const failures: string[] = [];

  // --- All-TODs-measurable: every swept hour must have a terrain reading. ---
  const measuredHours = new Set(
    samples.filter((s) => s.luminance.terrain !== null).map((s) => s.hour)
  );
  const missingHours = todHours.filter((h) => !measuredHours.has(h));
  const allTodsMeasurable = missingHours.length === 0;
  checks.push({
    id: 'sweep.allTodsMeasurable',
    status: allTodsMeasurable ? 'pass' : 'fail',
    hard: true,
    value: measuredHours.size,
    bound: `== ${todHours.length} TODs`,
    detail: allTodsMeasurable
      ? `all ${todHours.length} TODs produced a terrain luminance`
      : `terrain unmeasurable at hours [${missingHours.join(', ')}]`,
  });
  if (!allTodsMeasurable) failures.push(`terrain unmeasurable at ${missingHours.length} TOD(s)`);

  // --- Per-family measured-status + correlation + range ratio. ---
  const familyMeasured: Partial<Record<FamilyKey, boolean>> = {};
  for (const family of GATED_FAMILIES) {
    const hard = HARD_GATED_FAMILIES.includes(family);
    const curve = findCurve(curves, family);
    const corr = curve?.correlationVsTerrain ?? null;
    const ratio = curve?.rangeRatioVsTerrain ?? null;

    // FIXTURE TRUTH: is this family anchored on real subject pixels at every
    // measured TOD, or did an anchor project onto the terrain foreground / fall
    // back to the fixed box (UNMEASURED — terrain-vs-terrain)? A hard-gated
    // UNMEASURED family fails LOUDLY: the instrument is broken, not "coherent".
    const measured = isFamilyMeasured(samples, family);
    familyMeasured[family] = measured;
    const degenTods = samples
      .filter((s) => s.luminance[family] !== null && isUnmeasuredAnchor(anchorKindForSample(s, family)))
      .map((s) => s.hour);
    checks.push({
      id: `${family}.measured`,
      status: measured ? 'pass' : 'unmeasurable',
      hard,
      value: null,
      bound: 'anchored on real pixels at every measured TOD',
      detail: measured
        ? `${family} anchored on real subject pixels at every measured TOD`
        : `${family} UNMEASURED — anchor was degenerate/fallback (terrain-vs-terrain) at TOD(s) [${degenTods.join(', ') || 'none measured'}]`,
    });
    if (hard && !measured) {
      failures.push(
        `${family} UNMEASURED — anchor fell onto terrain / fixed box (instrument broken; corr/rangeRatio are terrain-vs-terrain)`
      );
    }

    // Correlation / range-ratio: only a HARD failure when the family IS
    // measured. For an UNMEASURED family we still record the numbers as evidence
    // but mark them `unmeasurable` (they are terrain-vs-terrain) so they never
    // masquerade as a real coherence pass — the `.measured` check owns the fail.
    const corrPass = corr !== null && corr >= COHERENCE_TOLERANCES.MIN_CORRELATION;
    const corrStatus: CheckStatus =
      corr === null || !measured ? 'unmeasurable' : corrPass ? 'pass' : 'fail';
    checks.push({
      id: `${family}.correlation`,
      status: corrStatus,
      hard,
      value: corr,
      bound: `>= ${COHERENCE_TOLERANCES.MIN_CORRELATION}`,
      detail:
        corr === null
          ? `${family} correlation unmeasurable (curve has < 2 shared points)`
          : !measured
            ? `${family} corr vs terrain = ${corr.toFixed(3)} (UNMEASURED — terrain-vs-terrain, not a coherence signal)`
            : `${family} corr vs terrain = ${corr.toFixed(3)}`,
    });
    if (hard && measured && corrStatus !== 'pass') {
      failures.push(
        `${family} correlation ${corr === null ? 'unmeasurable' : corr.toFixed(3)} (need >= ${COHERENCE_TOLERANCES.MIN_CORRELATION})`
      );
    }

    const ratioInBand =
      ratio !== null && ratio >= COHERENCE_TOLERANCES.RANGE_RATIO_MIN && ratio <= COHERENCE_TOLERANCES.RANGE_RATIO_MAX;
    const ratioStatus: CheckStatus =
      ratio === null || !measured ? 'unmeasurable' : ratioInBand ? 'pass' : 'fail';
    checks.push({
      id: `${family}.rangeRatio`,
      status: ratioStatus,
      hard,
      value: ratio,
      bound: `[${COHERENCE_TOLERANCES.RANGE_RATIO_MIN}, ${COHERENCE_TOLERANCES.RANGE_RATIO_MAX}]`,
      detail:
        ratio === null
          ? `${family} range ratio unmeasurable (no terrain range or family curve)`
          : !measured
            ? `${family} range ratio vs terrain = ${ratio.toFixed(3)} (UNMEASURED — terrain-vs-terrain)`
            : `${family} range ratio vs terrain = ${ratio.toFixed(3)}`,
    });
    if (hard && measured && ratioStatus !== 'pass') {
      failures.push(
        `${family} range ratio ${ratio === null ? 'unmeasurable' : ratio.toFixed(3)} (need [${COHERENCE_TOLERANCES.RANGE_RATIO_MIN}, ${COHERENCE_TOLERANCES.RANGE_RATIO_MAX}])`
      );
    }
  }

  // --- Dawn white-out guard: terrain mean luminance at the dawn TOD. ---
  const dawnSample = samples.find((s) => s.hour === COHERENCE_TOLERANCES.DAWN_HOUR);
  const dawnTerrain = dawnSample?.luminance.terrain ?? null;
  const dawnStatus: CheckStatus =
    dawnTerrain === null
      ? 'unmeasurable'
      : dawnTerrain <= COHERENCE_TOLERANCES.DAWN_TERRAIN_MAX_LUMINANCE
        ? 'pass'
        : 'fail';
  checks.push({
    id: 'terrain.dawnLuminance',
    status: dawnStatus,
    hard: true,
    value: dawnTerrain,
    bound: `<= ${COHERENCE_TOLERANCES.DAWN_TERRAIN_MAX_LUMINANCE}`,
    detail:
      dawnTerrain === null
        ? `dawn (${COHERENCE_TOLERANCES.DAWN_HOUR}h) terrain luminance unmeasurable`
        : `dawn (${COHERENCE_TOLERANCES.DAWN_HOUR}h) terrain luminance = ${dawnTerrain.toFixed(3)}`,
  });
  if (dawnStatus !== 'pass') {
    failures.push(
      dawnTerrain === null
        ? `dawn terrain luminance unmeasurable`
        : `dawn terrain luminance ${dawnTerrain.toFixed(3)} (need <= ${COHERENCE_TOLERANCES.DAWN_TERRAIN_MAX_LUMINANCE} — white-out guard)`
    );
  }

  // --- NPC-anchored: the npc family must measure real pixels (not the fixed ---
  // --- fallback box, and not a degenerate terrain-foreground anchor) at every ---
  // --- measured TOD. Reuses the structured provenance helper so a degenerate ---
  // --- anchor (projected onto terrain) counts as NOT anchored — the same ---
  // --- unmeasured verdict as a fixed-box fallback. Retained for callers that ---
  // --- read `npcAnchored`; it mirrors the `npc.measured` check above. ---
  const npcMeasured = samples.filter((s) => s.luminance.npc !== null);
  const npcAnchored = isFamilyMeasured(samples, 'npc');
  checks.push({
    id: 'npc.anchored',
    status: npcAnchored ? 'pass' : 'fail',
    hard: true,
    value: npcMeasured.length,
    bound: 'npc=anchored at every measured TOD',
    detail: npcAnchored
      ? `npc anchored on real impostor pixels at all ${npcMeasured.length} measured TODs`
      : `npc fell back to the fixed box / a degenerate terrain anchor at one or more TODs (not real pixels)`,
  });
  if (!npcAnchored) failures.push('npc not anchored on real pixels (fallback / degenerate anchor)');

  const passed = checks.every((c) => !c.hard || c.status === 'pass');
  return { passed, allTodsMeasurable, npcAnchored, familyMeasured, checks, failures };
}
