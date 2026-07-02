// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Time-of-day coherence — pure ANCHOR-VALIDITY logic.
 *
 * Cycle `cycle-2026-07-02-lighting-truth-and-shadows` task
 * `tod-coherence-fixture-truth`. Extracted out of `capture-tod-coherence-sweep.ts`
 * (which launches a headless browser sweep on import) so the anchor-truth
 * decision is unit-testable WITHOUT a browser — the same split idiom as
 * `tod-coherence-gate.ts`.
 *
 * --- Why this exists (the 0.977-vs-0.810 artifact contradiction) ---
 * The sweep anchors the foliage / npc / glb families on the projected screen
 * position of their live scene instances, then samples a tight box there. The
 * anchor scan reported `foliage=anchored` whenever ANY instance projected on
 * screen — even when the geometric-median anchor landed on the terrain
 * foreground at the very bottom screen edge. Proof: the 2026-06-25 gate run
 * (`artifacts/lighting-rig/tod-sweep/gate/curves.json`) anchored foliage at
 * screen y=0.971 (INSIDE the terrain sample band 0.82-0.98) with the box clamped
 * to y1=1.0 at every TOD. That reading is terrain-vs-terrain: corr 0.977 /
 * rangeRatio 0.969 measured the ground under the cards, not the cards. A run four
 * days later (2026-06-29 cinematic-field-pass) anchored on a DIFFERENT degenerate
 * spot (or fell back) and read corr 0.810 / rangeRatio 2.735 — hence two "valid"
 * artifacts disagreeing. The instrument was measuring noise.
 *
 * The fix: an anchor is only GENUINE if its box (a) is not clamped hard against a
 * screen edge (edge clamp means the subject projected off-frame and the box was
 * pinned), and (b) does not fall inside the terrain sample band (a foliage/npc
 * anchor there is reading the ground). A degenerate anchor is treated as
 * UNMEASURED — the family falls back to the fixed box AND the sample records
 * `foliage=degenerate`, which the gate turns into a loud "instrument broken"
 * failure for a hard-gated family, never a silent terrain-vs-terrain pass.
 */

import type { AnchorProvenanceKind, Region } from './tod-coherence-sweep-types';

/**
 * A projected anchor box is "edge clamped" when either extent is pinned to a
 * screen edge to within this fraction. `resolveAnchorRegions` builds the box by
 * clamping `centre ± ANCHOR_BOX_HALF_FRAC` into [0, 1]; when the projected centre
 * sits at/near an edge the box loses half its extent and pins to 0 or 1, which is
 * the signature of a subject that projected off-frame (or into the extreme
 * foreground bottom edge, where only terrain renders).
 */
export const ANCHOR_EDGE_CLAMP_EPS = 0.02;

export interface AnchorEvaluationInput {
  /** The tight box built around the projected anchor centre. Null => no anchor. */
  box: Region | null;
  /** On-screen candidate instance count for the family (0 => no live subject). */
  instanceCount: number;
  /** The fixed terrain sample band; an anchor inside it is reading the ground. */
  terrainBand: Region;
}

export interface AnchorEvaluation {
  kind: AnchorProvenanceKind;
  reason: string;
}

/** Screen-y centre of a box. */
function centreY(box: Region): number {
  return (box.y0 + box.y1) / 2;
}

/** True when a box extent is pinned to a screen edge (subject off-frame). */
function isEdgeClamped(box: Region): boolean {
  return (
    box.x0 <= ANCHOR_EDGE_CLAMP_EPS ||
    box.x1 >= 1 - ANCHOR_EDGE_CLAMP_EPS ||
    box.y0 <= ANCHOR_EDGE_CLAMP_EPS ||
    box.y1 >= 1 - ANCHOR_EDGE_CLAMP_EPS
  );
}

/**
 * Vertical overlap between a box and the terrain sample band, as a fraction of
 * the box height. A foliage/npc anchor centred in the terrain band (or heavily
 * overlapping it) is reading the ground the cards stand on, not the cards.
 */
function terrainBandOverlapFrac(box: Region, terrainBand: Region): number {
  const top = Math.max(box.y0, terrainBand.y0);
  const bot = Math.min(box.y1, terrainBand.y1);
  const overlap = Math.max(0, bot - top);
  const h = Math.max(1e-6, box.y1 - box.y0);
  return overlap / h;
}

/**
 * Classify a projected anchor as GENUINE (`anchored`), `degenerate` (projected
 * onto the terrain foreground / clamped to a screen edge — UNMEASURED), or
 * `fallback` (no live instance / no projected box — UNMEASURED). Pure.
 *
 * Degenerate rules (any one degrades the anchor):
 *   1. no on-screen instance / no box  -> `fallback`
 *   2. box clamped to a screen edge     -> `degenerate` (subject off-frame)
 *   3. box centre inside the terrain band, or >50% vertical overlap with it
 *      -> `degenerate` (anchor is on the ground under the subject)
 */
export function evaluateAnchor(input: AnchorEvaluationInput): AnchorEvaluation {
  const { box, instanceCount, terrainBand } = input;
  if (!box || instanceCount <= 0) {
    return {
      kind: 'fallback',
      reason: instanceCount <= 0 ? 'no on-screen instance' : 'no projected anchor box',
    };
  }
  if (isEdgeClamped(box)) {
    return {
      kind: 'degenerate',
      reason: `anchor box clamped to a screen edge (x[${box.x0.toFixed(3)},${box.x1.toFixed(3)}] y[${box.y0.toFixed(3)},${box.y1.toFixed(3)}]) — subject projected off-frame`,
    };
  }
  const yc = centreY(box);
  const inBand = yc >= terrainBand.y0 && yc <= terrainBand.y1;
  const overlap = terrainBandOverlapFrac(box, terrainBand);
  if (inBand || overlap > 0.5) {
    return {
      kind: 'degenerate',
      reason: `anchor centre y=${yc.toFixed(3)} falls in the terrain sample band [${terrainBand.y0.toFixed(3)}, ${terrainBand.y1.toFixed(3)}] (overlap ${(overlap * 100).toFixed(0)}%) — reading terrain, not the family`,
    };
  }
  return { kind: 'anchored', reason: '' };
}

/**
 * True when a provenance kind means the family measurement is UNMEASURED (the
 * reading is terrain-vs-terrain, not the subject material). Both a degenerate
 * anchor and a fixed-box fallback are unmeasured; only `anchored` is real.
 */
export function isUnmeasuredAnchor(kind: AnchorProvenanceKind): boolean {
  return kind !== 'anchored';
}
