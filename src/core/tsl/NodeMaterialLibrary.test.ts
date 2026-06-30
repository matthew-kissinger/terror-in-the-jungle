// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, uv, vec3 } from 'three/tsl';

import {
  contourLineNode,
  heightDisplaceNode,
  heightFieldNormalNode,
  hypsometricTintNode,
  reliefShadeNode,
} from './NodeMaterialLibrary';

/**
 * Behavior contract for the shared terrain TSL node-builders.
 *
 * These helpers build shader-graph nodes; they render nothing on their own.
 * vitest has no GPU device, so the observable behavior we can assert is: each
 * builder returns a usable TSL node, and the nodes compose into a node material
 * whose graph is well-formed (wiring a malformed graph or referencing a missing
 * TSL primitive would throw on assignment). The same backend-agnostic graph is
 * what compiles on both the WebGPU backend and its WebGL2 fallback.
 */
describe('terrain TSL node-builders', () => {
  it('relief shade builds a node and wires into a node material color graph', () => {
    const shade = reliefShadeNode(vec3(0, 1, 0));
    expect(shade).toBeDefined();

    const material = new MeshBasicNodeMaterial();
    material.colorNode = vec3(shade);
    expect(material.isNodeMaterial).toBe(true);
    expect(material.colorNode).toBeDefined();
  });

  it('reconstructs a surface normal from height-field finite differences', () => {
    const normal = heightFieldNormalNode(
      float(0.0),
      float(1.0),
      float(0.0),
      float(2.0),
      float(4.0),
    );
    expect(normal).toBeDefined();

    const material = new MeshBasicNodeMaterial();
    material.colorNode = normal;
    expect(material.colorNode).toBeDefined();
  });

  it('hypsometric tint composes a four-stop elevation ramp into a color node', () => {
    const tint = hypsometricTintNode(
      uv().x,
      vec3(0.1, 0.3, 0.1),
      vec3(0.4, 0.5, 0.2),
      vec3(0.6, 0.5, 0.4),
      vec3(0.95, 0.95, 0.95),
    );
    const material = new MeshBasicNodeMaterial();
    material.colorNode = tint;
    expect(material.colorNode).toBeDefined();
  });

  it('contour line builds a scalar node usable as an opacity graph', () => {
    const contour = contourLineNode(float(123.0), float(50.0), float(2.0));
    const material = new MeshBasicNodeMaterial();
    material.opacityNode = contour;
    expect(material.opacityNode).toBeDefined();
  });

  it('height displacement returns a displaced position usable as a vertex graph', () => {
    const displaced = heightDisplaceNode(
      vec3(1, 0, 1),
      vec3(0, 1, 0),
      float(0.5),
      float(10.0),
    );
    const material = new MeshBasicNodeMaterial();
    material.positionNode = displaced;
    expect(material.positionNode).toBeDefined();
  });

  it('builders accept default parameters (light dir, ambient, spacing, amplitude)', () => {
    // Calling with only the required inputs exercises the Fn default-parameter
    // path, which is where a missing/renamed TSL primitive would surface.
    expect(reliefShadeNode(vec3(0, 1, 0))).toBeDefined();
    expect(contourLineNode(float(10.0))).toBeDefined();
    expect(
      heightDisplaceNode(vec3(0, 0, 0), vec3(0, 1, 0), float(0.25)),
    ).toBeDefined();
  });
});
