// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Tier-gated bloom pass for the P6 post stack.
 *
 * Thin wrapper over the Three.js addon `bloom()` TSL node
 * (`three/addons/tsl/display/BloomNode.js`). It owns no render target — it
 * returns a bloom colour node that `NodePostProcessing` adds onto the graded
 * scene colour. Bloom is the heaviest term in the stack (multi-tap blur), so it
 * is GPU-tier gated: `'low'` disables it entirely (returns null), `'medium'`
 * runs a tighter/cheaper bloom, `'high'` runs the full look. Mobile never gets
 * here (the whole stack is mobile-off in `NodePostProcessing`).
 *
 * The bloom threshold is chosen so ordinary lit surfaces (which AGX tonemaps to
 * <= ~1.0) do NOT bloom, but the muzzle-flash and explosion VFX — whose vertex
 * colours / emissive are pushed above the threshold in `MuzzleFlashSystem` and
 * `ExplosionEffectFactory` — do. Keeping the threshold above the lit-surface
 * ceiling avoids the "everything glows" failure of an un-thresholded bloom.
 */

import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import type { TslNode } from '../../../core/tsl/PostGradeNodes';
import type { GPUTier } from '../../../utils/DeviceDetector';

export type { TslNode };

/** Brightness above which a fragment contributes to bloom. */
export const BLOOM_THRESHOLD = 1.0;

export interface BloomTierParams {
  strength: number;
  radius: number;
  threshold: number;
}

/**
 * Per-tier bloom parameters. `low` is intentionally absent — bloom is skipped on
 * low-tier GPUs (see {@link buildBloomNode}).
 */
export const BLOOM_TIER_PARAMS: Record<Exclude<GPUTier, 'low'>, BloomTierParams> = {
  medium: { strength: 0.55, radius: 0.4, threshold: BLOOM_THRESHOLD },
  high: { strength: 0.8, radius: 0.6, threshold: BLOOM_THRESHOLD },
};

export function isBloomEnabledForTier(tier: GPUTier): boolean {
  return tier !== 'low';
}

/**
 * Build a tier-gated bloom node for the given source colour. Returns `null` on
 * `'low'` (and any unknown tier), which the caller treats as "no bloom term".
 * The returned node is the bloom contribution to ADD onto the scene colour.
 */
export function buildBloomNode(sourceColor: TslNode, tier: GPUTier): TslNode | null {
  if (!isBloomEnabledForTier(tier)) return null;
  const params = BLOOM_TIER_PARAMS[tier as Exclude<GPUTier, 'low'>];
  // bloom(node, strength, radius, threshold)
  return (bloom as (node: TslNode, strength: number, radius: number, threshold: number) => TslNode)(
    sourceColor,
    params.strength,
    params.radius,
    params.threshold,
  );
}
