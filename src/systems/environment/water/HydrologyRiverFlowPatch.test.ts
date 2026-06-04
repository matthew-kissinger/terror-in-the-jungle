// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  installHydrologyRiverFlowPatch,
  type HydrologyRiverShaderRefs,
} from './HydrologyRiverFlowPatch';

// L1/L2 behavior tests for the river-flow onBeforeCompile patch. We assert the
// observable contract the owning WaterSurfaceBinding relies on:
//   - a live uniform-ref object is returned and wired into the compiled shader
//     (so ticking uTime.value per frame is visible to the GPU),
//   - the patch rewrites the standard shader chunks it documents (vertex
//     attributes/varyings + fragment normal/foam injection),
//   - the normal map passes through and can be late-bound.
// We do NOT assert tuning constants (flow speed, foam intensity, normal scale).

/** A stand-in for the THREE.WebGLProgramParametersWithUniforms object that
 * three hands to onBeforeCompile. Contains the GLSL include tokens the patch
 * replaces so we can observe the rewrite without a real WebGL context. */
function makeFakeShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: [
      '#include <common>',
      'void main() {',
      '  #include <worldpos_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: [
      '#include <common>',
      'void main() {',
      '  #include <normal_fragment_maps>',
      '  #include <opaque_fragment>',
      '}',
    ].join('\n'),
  };
}

function compile(refs: HydrologyRiverShaderRefs, material: THREE.MeshStandardMaterial) {
  const shader = makeFakeShader();
  // installHydrologyRiverFlowPatch wires material.onBeforeCompile; three would
  // call it during program build. Invoke it directly to observe the rewrite.
  (material.onBeforeCompile as (s: ReturnType<typeof makeFakeShader>) => void)(shader);
  void refs;
  return shader;
}

describe('installHydrologyRiverFlowPatch', () => {
  it('returns a uniform-ref object with the slots the binding layer ticks and late-binds', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);

    expect(refs.uTime.value).toBe(0);
    expect(typeof refs.uFlowSpeed.value).toBe('number');
    expect(typeof refs.uFoamIntensity.value).toBe('number');
    expect(refs.uFoamColor.value).toBeInstanceOf(THREE.Color);
    expect(typeof refs.uRiverNormalScale.value).toBe('number');
    // No texture was supplied yet.
    expect(refs.uRiverNormalMap.value).toBeNull();
  });

  it('installs an onBeforeCompile patch and flags the material for recompile', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(material.onBeforeCompile).toBeTypeOf('function'); // three default is a no-op fn
    const before = material.version;

    installHydrologyRiverFlowPatch(material, null);

    expect(material.onBeforeCompile).toBeTypeOf('function');
    // needsUpdate = true bumps the material version so renderers rebuild it.
    expect(material.version).toBeGreaterThan(before);
  });

  it('passes an initial normal map through into the live uniform refs', () => {
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();

    const refs = installHydrologyRiverFlowPatch(material, texture);

    expect(refs.uRiverNormalMap.value).toBe(texture);
  });

  it('wires the returned refs as the same objects the compiled shader receives', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);
    const shader = compile(refs, material);

    // The shader uniforms must be the very same ref objects, so a later
    // refs.uTime.value = t is visible to the program without recompiling.
    expect(shader.uniforms.uTime).toBe(refs.uTime);
    expect(shader.uniforms.uFlowSpeed).toBe(refs.uFlowSpeed);
    expect(shader.uniforms.uFoamIntensity).toBe(refs.uFoamIntensity);
    expect(shader.uniforms.uFoamColor).toBe(refs.uFoamColor);
    expect(shader.uniforms.uRiverNormalMap).toBe(refs.uRiverNormalMap);
    expect(shader.uniforms.uRiverNormalScale).toBe(refs.uRiverNormalScale);
  });

  it('keeps a live link so ticking uTime after compile is visible through the shader uniform', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);
    const shader = compile(refs, material);

    refs.uTime.value = 12.5;
    expect((shader.uniforms.uTime as { value: number }).value).toBe(12.5);
  });

  it('late-binds a normal map after compile via the shared uniform ref', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);
    const shader = compile(refs, material);
    const texture = new THREE.Texture();

    refs.uRiverNormalMap.value = texture;

    expect((shader.uniforms.uRiverNormalMap as { value: unknown }).value).toBe(texture);
  });

  it('declares the per-vertex flow attributes and varyings the geometry builder bakes', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);
    const shader = compile(refs, material);

    // The geometry builder emits aFlowDir / aFoamMask; the vertex shader must
    // declare and forward them so the fragment stage can read the flow.
    expect(shader.vertexShader).toContain('attribute vec2 aFlowDir');
    expect(shader.vertexShader).toContain('attribute float aFoamMask');
    expect(shader.vertexShader).toContain('varying');
    // The original chunk is preserved, not clobbered.
    expect(shader.vertexShader).toContain('#include <worldpos_vertex>');
  });

  it('injects flow-aligned normal and foam contributions into the fragment shader', () => {
    const material = new THREE.MeshStandardMaterial();
    const refs = installHydrologyRiverFlowPatch(material, null);
    const shader = compile(refs, material);

    // Fragment stage samples the river normal map and references the foam mask
    // varying. We assert the uniforms/varyings are wired, not the math.
    expect(shader.fragmentShader).toContain('uniform sampler2D uRiverNormalMap');
    expect(shader.fragmentShader).toContain('uniform float uTime');
    expect(shader.fragmentShader).toContain('vFoamMask');
    // Standard chunks are preserved so base lighting still composes.
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>');
    expect(shader.fragmentShader).toContain('#include <opaque_fragment>');
  });

  it('produces independent uniform refs per install (no shared mutable state)', () => {
    const a = installHydrologyRiverFlowPatch(new THREE.MeshStandardMaterial(), null);
    const b = installHydrologyRiverFlowPatch(new THREE.MeshStandardMaterial(), null);

    a.uTime.value = 99;
    expect(b.uTime.value).toBe(0);
    // The foam color is cloned per install, not a shared singleton.
    expect(a.uFoamColor.value).not.toBe(b.uFoamColor.value);
  });
});
