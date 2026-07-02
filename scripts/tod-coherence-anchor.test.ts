// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { evaluateAnchor, isUnmeasuredAnchor } from './tod-coherence-anchor';
import type { Region } from './tod-coherence-sweep-types';

/**
 * Behavior proof for the pure anchor-validity classifier (task
 * `tod-coherence-fixture-truth`). Drives `evaluateAnchor` with synthetic
 * projected boxes and asserts the OBSERVABLE classification — genuine vs
 * degenerate vs fallback — modeled on the real 0.977-PASS-vs-0.810-FAIL artifact
 * contradiction: the 2026-06-25 gate run anchored foliage at screen y=0.971,
 * inside the terrain band (0.82-0.98) and clamped to the bottom edge, yet
 * reported `anchored`. This classifier catches exactly that case.
 */

// The fixed terrain sample band the sweep uses (FAMILY_FALLBACK_REGIONS.terrain).
const TERRAIN_BAND: Region = { x0: 0.3, x1: 0.7, y0: 0.82, y1: 0.98 };

// A tight box (half-extent 0.035) centred on a mid-frame screen point, clear of
// both the terrain band and the screen edges — a genuine on-subject anchor.
function boxAt(cx: number, cy: number, half = 0.035): Region {
  return {
    x0: Math.max(0, cx - half),
    x1: Math.min(1, cx + half),
    y0: Math.max(0, cy - half),
    y1: Math.min(1, cy + half),
  };
}

describe('evaluateAnchor', () => {
  it('accepts a genuine mid-frame anchor clear of the terrain band and edges', () => {
    const result = evaluateAnchor({
      box: boxAt(0.5, 0.62),
      instanceCount: 40,
      terrainBand: TERRAIN_BAND,
    });
    expect(result.kind).toBe('anchored');
    expect(result.reason).toBe('');
  });

  it('marks the 2026-06-25 bottom-edge foliage anchor DEGENERATE (the false-pass bug)', () => {
    // The real degenerate box: y0=0.941, y1=1.0 — clamped to the bottom edge AND
    // centred inside the terrain band. This is the reading that produced the
    // false corr 0.977 / rangeRatio 0.969 terrain-vs-terrain pass.
    const result = evaluateAnchor({
      box: { x0: 0.4696, x1: 0.5396, y0: 0.9412, y1: 1.0 },
      instanceCount: 128,
      terrainBand: TERRAIN_BAND,
    });
    expect(result.kind).toBe('degenerate');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('marks an anchor centred inside the terrain band DEGENERATE (reading the ground)', () => {
    const result = evaluateAnchor({
      box: boxAt(0.5, 0.88), // centre y=0.88 is inside [0.82, 0.98]
      instanceCount: 12,
      terrainBand: TERRAIN_BAND,
    });
    expect(result.kind).toBe('degenerate');
  });

  it('marks an anchor clamped to a side edge DEGENERATE (subject projected off-frame)', () => {
    const result = evaluateAnchor({
      box: { x0: 0, x1: 0.02, y0: 0.5, y1: 0.57 },
      instanceCount: 3,
      terrainBand: TERRAIN_BAND,
    });
    expect(result.kind).toBe('degenerate');
  });

  it('falls back when no on-screen instance was found', () => {
    const result = evaluateAnchor({ box: null, instanceCount: 0, terrainBand: TERRAIN_BAND });
    expect(result.kind).toBe('fallback');
    expect(result.reason).toContain('no on-screen instance');
  });

  it('falls back when there are instances but no projected box', () => {
    const result = evaluateAnchor({ box: null, instanceCount: 9, terrainBand: TERRAIN_BAND });
    expect(result.kind).toBe('fallback');
  });

  it('treats both degenerate and fallback as UNMEASURED, and only anchored as measured', () => {
    expect(isUnmeasuredAnchor('anchored')).toBe(false);
    expect(isUnmeasuredAnchor('degenerate')).toBe(true);
    expect(isUnmeasuredAnchor('fallback')).toBe(true);
  });
});
