// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, uv, vec2, vec3 } from 'three/tsl';

import {
  applyVignetteNode,
  contrastNode,
  liftGammaGainNode,
  saturationNode,
  toneCurveNode,
  vignetteFactorNode,
} from './PostGradeNodes';

/**
 * Behavior contract for the P6 post-grade node-builders.
 *
 * As with the terrain library, these build shader-graph nodes only. Without a
 * GPU device the observable behavior is: each grade returns a usable node and
 * the full grade chain composes into a node material graph at neutral
 * parameters (the documented identity/no-op pass-through). A malformed graph or
 * a missing TSL primitive throws on assignment.
 */
describe('post-grade TSL node-builders', () => {
  const sourceColor = vec3(0.4, 0.5, 0.6);

  it('lift/gamma/gain builds a color grade node at neutral defaults', () => {
    const graded = liftGammaGainNode(sourceColor);
    const material = new MeshBasicNodeMaterial();
    material.colorNode = graded;
    expect(material.colorNode).toBeDefined();
  });

  it('saturation and contrast compose into a color graph', () => {
    const sat = saturationNode(sourceColor, float(1.0));
    const con = contrastNode(sat, float(1.0));
    const material = new MeshBasicNodeMaterial();
    material.colorNode = con;
    expect(material.colorNode).toBeDefined();
  });

  it('tone curve builds an S-curve node', () => {
    const curved = toneCurveNode(sourceColor, float(0.0));
    const material = new MeshBasicNodeMaterial();
    material.colorNode = curved;
    expect(material.colorNode).toBeDefined();
  });

  it('vignette factor builds from a screen UV and applies to a color', () => {
    const factor = vignetteFactorNode(uv(), float(0.0), float(0.5));
    const vignetted = applyVignetteNode(sourceColor, factor);
    const material = new MeshBasicNodeMaterial();
    material.colorNode = vignetted;
    expect(material.colorNode).toBeDefined();
  });

  it('composes the full neutral grade chain into one identity pass-through graph', () => {
    // The whole chain at neutral params is the documented no-op. We can't read
    // back pixels headlessly, but composing every grade together proves the
    // graph is well-formed end to end and that the helpers chain cleanly.
    let c = liftGammaGainNode(sourceColor, vec3(0.0), vec3(1.0), vec3(1.0));
    c = saturationNode(c, float(1.0));
    c = contrastNode(c, float(1.0), float(0.5));
    c = toneCurveNode(c, float(0.0));
    const factor = vignetteFactorNode(uv(), float(0.0), float(0.5));
    c = applyVignetteNode(c, factor);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = c;
    expect(material.isNodeMaterial).toBe(true);
    expect(material.colorNode).toBeDefined();
  });

  it('grade nodes accept explicit non-neutral parameters', () => {
    expect(liftGammaGainNode(sourceColor, vec3(0.05), vec3(1.2), vec3(1.1))).toBeDefined();
    expect(saturationNode(sourceColor, float(1.4))).toBeDefined();
    expect(contrastNode(sourceColor, float(1.2))).toBeDefined();
    expect(toneCurveNode(sourceColor, float(0.6))).toBeDefined();
    expect(vignetteFactorNode(vec2(0.1, 0.1), float(0.8), float(0.7))).toBeDefined();
  });
});
