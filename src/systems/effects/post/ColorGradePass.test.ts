// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec3 } from 'three/tsl';

import {
  buildColorGradeNode,
  COLOR_GRADE_LUTS,
  COLOR_GRADE_PRESETS,
  DEFAULT_COLOR_GRADE_LUT,
  resolveColorGradeLut,
} from './ColorGradePass';

/**
 * Behavior contract for the filmic colour-grade pass.
 *
 * The pass composes the shared post-grade builders into a graded colour node. We
 * can't read pixels headlessly, so the observable behavior is: every shipped LUT
 * builds a well-formed node-material graph, the LUT resolver round-trips the
 * three names and rejects junk, and the neutral LUT exists for an identity look.
 */
describe('color grade pass', () => {
  const sourceColor = vec3(0.4, 0.5, 0.6);

  it('ships exactly three A/B-selectable LUTs including a neutral baseline', () => {
    expect([...COLOR_GRADE_LUTS]).toEqual(['neutral', 'golden', 'overcast']);
    expect(COLOR_GRADE_LUTS).toContain('neutral');
    expect(COLOR_GRADE_LUTS).toContain(DEFAULT_COLOR_GRADE_LUT);
  });

  it('builds a graded colour graph for every LUT', () => {
    for (const lut of COLOR_GRADE_LUTS) {
      const graded = buildColorGradeNode(sourceColor, lut);
      const material = new MeshBasicNodeMaterial();
      material.colorNode = graded;
      expect(material.isNodeMaterial).toBe(true);
      expect(material.colorNode).toBeDefined();
    }
  });

  it('resolves valid LUT names and rejects unknown ones', () => {
    expect(resolveColorGradeLut('neutral')).toBe('neutral');
    expect(resolveColorGradeLut('golden')).toBe('golden');
    expect(resolveColorGradeLut('overcast')).toBe('overcast');
    expect(resolveColorGradeLut('sepia')).toBeNull();
    expect(resolveColorGradeLut('')).toBeNull();
    expect(resolveColorGradeLut(null)).toBeNull();
    expect(resolveColorGradeLut(undefined)).toBeNull();
  });

  it('keeps the neutral LUT an identity preset (lift 0 / gamma 1 / gain 1)', () => {
    const neutral = COLOR_GRADE_PRESETS.neutral;
    expect(neutral.liftRgb).toEqual([0, 0, 0]);
    expect(neutral.gammaRgb).toEqual([1, 1, 1]);
    expect(neutral.gainRgb).toEqual([1, 1, 1]);
    expect(neutral.saturation).toBe(1);
    expect(neutral.toneStrength).toBe(0);
    expect(neutral.vignetteAmount).toBe(0);
  });
});
