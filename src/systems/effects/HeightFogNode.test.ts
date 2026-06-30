// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

import {
  applyHeightFogNode,
  heightAttenuatedFogNode,
  heightFogFactorNode,
} from './HeightFogNode';

/**
 * Behavior contract for the P6 atmospheric-depth (height fog) node-builders.
 *
 * Like the shared post-grade library these build shader-graph nodes only, so
 * without a GPU the observable behavior is: each builder returns a usable node
 * and the fog chain composes into a node-material graph. The documented no-op is
 * density 0 (fog factor returns the input scene colour unchanged); a malformed
 * graph or a missing TSL primitive throws on assignment.
 */
describe('height fog TSL node-builders', () => {
  const sceneColor = vec3(0.4, 0.5, 0.6);
  const fogColor = vec3(0.5, 0.6, 0.55);

  it('builds an atmospheric-depth factor node from a view distance', () => {
    const factor = heightFogFactorNode(float(100.0), float(0.01), float(20.0));
    const material = new MeshBasicNodeMaterial();
    material.colorNode = vec3(factor);
    expect(material.colorNode).toBeDefined();
  });

  it('applies fog toward a fog colour and composes into a colour graph', () => {
    const factor = heightFogFactorNode(float(80.0), float(0.02), float(10.0));
    const fogged = applyHeightFogNode(sceneColor, fogColor, factor);
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged;
    expect(material.isNodeMaterial).toBe(true);
    expect(material.colorNode).toBeDefined();
  });

  it('composes a height-attenuated fog factor into a colour graph', () => {
    const base = heightFogFactorNode(float(150.0), float(0.02), float(0.0));
    const attenuated = heightAttenuatedFogNode(base, float(120.0), float(80.0), float(0.01));
    const fogged = applyHeightFogNode(sceneColor, fogColor, attenuated);
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged;
    expect(material.colorNode).toBeDefined();
  });

  it('is a no-op pass-through graph at zero density', () => {
    // Density 0 → factor 0 → applyHeightFog returns the scene colour. We cannot
    // read pixels headlessly, but the full neutral chain must still compose into
    // a well-formed node material.
    const factor = heightFogFactorNode(float(500.0), float(0.0), float(0.0));
    const fogged = applyHeightFogNode(sceneColor, fogColor, factor);
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged;
    expect(material.colorNode).toBeDefined();
  });
});
