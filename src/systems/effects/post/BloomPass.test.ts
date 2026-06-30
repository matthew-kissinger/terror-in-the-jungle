// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec3 } from 'three/tsl';

import { buildBloomNode, isBloomEnabledForTier } from './BloomPass';

/**
 * Behavior contract for the tier-gated bloom pass.
 *
 * Observable behavior without a GPU: bloom is skipped on low-tier GPUs (returns
 * null = "no bloom term") and builds a usable additive node on medium/high. We
 * deliberately don't assert the strength/radius tuning constants (those are
 * tuning values per docs/TESTING.md) — only the tier gate behavior.
 */
describe('bloom pass tier gating', () => {
  const sceneColor = vec3(0.4, 0.5, 0.6);

  it('skips bloom on low-tier GPUs', () => {
    expect(isBloomEnabledForTier('low')).toBe(false);
    expect(buildBloomNode(sceneColor, 'low')).toBeNull();
  });

  it('builds an additive bloom node on medium and high tiers', () => {
    for (const tier of ['medium', 'high'] as const) {
      expect(isBloomEnabledForTier(tier)).toBe(true);
      const bloomNode = buildBloomNode(sceneColor, tier);
      expect(bloomNode).not.toBeNull();
      // The bloom term must add onto a scene colour into a well-formed graph.
      const material = new MeshBasicNodeMaterial();
      material.colorNode = sceneColor.add(bloomNode);
      expect(material.colorNode).toBeDefined();
    }
  });
});
