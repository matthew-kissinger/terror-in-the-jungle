// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  collarExtrapolatedHeight,
  computePlayableHeightEnvelope,
  playableHeightEnvelopeFor,
} from './collarExtrapolation';

const HALF_PLAYABLE = 100;
/** Keep in sync with ENVELOPE_PAD_METERS in collarExtrapolation.ts. */
const PAD = 24;

describe('computePlayableHeightEnvelope', () => {
  it('captures the min/max of the playable square', () => {
    const env = computePlayableHeightEnvelope((x) => 0.5 * x, HALF_PLAYABLE);
    expect(env.min).toBeCloseTo(-50, 5);
    expect(env.max).toBeCloseTo(50, 5);
  });

  it('is flat for a flat provider', () => {
    expect(computePlayableHeightEnvelope(() => 20, HALF_PLAYABLE)).toEqual({ min: 20, max: 20 });
  });

  it('degenerates safely at zero playable size', () => {
    expect(computePlayableHeightEnvelope(() => 7, 0)).toEqual({ min: 7, max: 7 });
  });
});

describe('playableHeightEnvelopeFor', () => {
  it('memoizes per key so a per-texel bake loop computes it once', () => {
    let calls = 0;
    const sample = (x: number): number => { calls++; return 0.1 * x; };
    const key = {};
    const a = playableHeightEnvelopeFor(key, sample, HALF_PLAYABLE);
    const sampledOnce = calls;
    const b = playableHeightEnvelopeFor(key, sample, HALF_PLAYABLE);
    expect(b).toBe(a);
    expect(calls).toBe(sampledOnce);
  });
});

describe('collarExtrapolatedHeight', () => {
  it('never exceeds the playable height envelope + pad, even 1km out', () => {
    const sample = (x: number): number => 0.5 * x;
    const env = computePlayableHeightEnvelope(sample, HALF_PLAYABLE); // { -50, 50 }
    const farOut = collarExtrapolatedHeight(sample, 1100, 0, 100, 0, HALF_PLAYABLE, sample(100, 0), env);
    expect(farOut).toBeLessThanOrEqual(env.max + PAD + 1e-6);
    expect(farOut).toBeGreaterThanOrEqual(env.min - PAD - 1e-6);
  });

  it('bounds what was a >500m tower under the old linear extrapolation', () => {
    const sample = (x: number): number => 0.5 * x;
    const env = computePlayableHeightEnvelope(sample, HALF_PLAYABLE);
    // old math: 50 + 0.5 * 1000 = 550m spire. new: clamped to envelope.max + pad.
    const h = collarExtrapolatedHeight(sample, 1100, 0, 100, 0, HALF_PLAYABLE, 50, env);
    expect(h).toBeLessThan(100);
  });

  it('saturates with distance instead of growing linearly', () => {
    const sample = (x: number): number => 0.5 * x;
    const unclamped = { min: -1e9, max: 1e9 }; // isolate the falloff from the envelope clamp
    const nearDelta = collarExtrapolatedHeight(sample, 180, 0, 100, 0, HALF_PLAYABLE, 50, unclamped) - 50;
    const farDelta = collarExtrapolatedHeight(sample, 1100, 0, 100, 0, HALF_PLAYABLE, 50, unclamped) - 50;
    expect(farDelta).toBeGreaterThan(nearDelta);     // still rises with distance...
    expect(farDelta).toBeLessThan(nearDelta * 2.5);  // ...but saturates (linear would be ~11x)
  });

  it('keeps a flat playable edge flat (no spurious collar rise)', () => {
    const sample = (): number => 20;
    const env = computePlayableHeightEnvelope(sample, HALF_PLAYABLE);
    expect(collarExtrapolatedHeight(sample, 900, 0, 100, 0, HALF_PLAYABLE, 20, env)).toBeCloseTo(20, 5);
  });

  it('bakes zero collar towers over AI_SANDBOX-shape terrain (200m playable + 900m collar)', () => {
    // Deterministic rough playable terrain; the regression is collar towers.
    const sample = (x: number, z: number): number =>
      30 * Math.sin(x * 0.05) + 22 * Math.cos(z * 0.05) + 10 * Math.sin((x + z) * 0.11);
    const env = computePlayableHeightEnvelope(sample, HALF_PLAYABLE);

    const worldSize = 2000;
    const grid = 96;
    const step = worldSize / (grid - 1);
    const half = worldSize / 2;
    const heights = new Float32Array(grid * grid);
    const collar = new Uint8Array(grid * grid);
    for (let z = 0; z < grid; z++) {
      for (let x = 0; x < grid; x++) {
        const wx = -half + x * step;
        const wz = -half + z * step;
        const cx = Math.max(-HALF_PLAYABLE, Math.min(HALF_PLAYABLE, wx));
        const cz = Math.max(-HALF_PLAYABLE, Math.min(HALF_PLAYABLE, wz));
        const inPlayable = wx === cx && wz === cz;
        collar[z * grid + x] = inPlayable ? 0 : 1;
        heights[z * grid + x] = inPlayable
          ? sample(wx, wz)
          : collarExtrapolatedHeight(sample, wx, wz, cx, cz, HALF_PLAYABLE, sample(cx, cz), env);
      }
    }

    // No collar height escapes the playable envelope + pad.
    let maxCollar = -Infinity;
    for (let i = 0; i < heights.length; i++) if (collar[i]) maxCollar = Math.max(maxCollar, heights[i]);
    expect(maxCollar).toBeLessThanOrEqual(env.max + PAD + 1e-6);

    // No single-texel collar tower (>40m above all 4 neighbours) — the reported symptom.
    let towers = 0;
    for (let z = 1; z < grid - 1; z++) {
      for (let x = 1; x < grid - 1; x++) {
        if (!collar[z * grid + x]) continue;
        const c = heights[z * grid + x];
        const maxN = Math.max(
          heights[z * grid + x - 1],
          heights[z * grid + x + 1],
          heights[(z - 1) * grid + x],
          heights[(z + 1) * grid + x],
        );
        if (c - maxN > 40) towers++;
      }
    }
    expect(towers).toBe(0);
  });
});
