// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  TodImpostorMappingConfig,
  todImpostorMappingBindings,
  updateTodImpostorMapping,
} from './TodImpostorMapping';
import {
  createBillboardNodeMaterial,
  HUMID_JUNGLE_VEGETATION_EXPOSURE,
  HUMID_JUNGLE_VEGETATION_SATURATION,
} from '../world/billboard/BillboardNodeMaterial';
import { createStaticImpostorNodeMaterial } from '../world/staticImpostors/StaticImpostorMaterial';
import { PixelForgeStaticPropModels, STATIC_IMPOSTOR_ARCHETYPES } from '../../config/staticImpostorArchetypes';

/**
 * L2 consumer-wiring contract for the per-family TOD impostor mapping
 * (`tod-impostor-dynamic-mapping`). These assert the SEAM behavior the three card
 * materials depend on, at the CPU level (the TSL node graph itself is an L4 render
 * concern): the mapping rides shared singleton bindings, a TOD change moves those
 * bindings while the kill-switch OFF freezes them, and constructing a card
 * material still preserves its construction-time static tuning (the mapping is a
 * multiplicative layer that is identity at noon, so noon shading is unchanged).
 * See docs/TESTING.md.
 */

function billboardConfigFixture(): Parameters<typeof createBillboardNodeMaterial>[0] {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return {
    texture,
    normalTexture: null,
    fadeDistance: 120,
    maxDistance: 260,
    height: 6,
    atlasProfile: 'canopy-hero',
    shaderProfile: 'unlit',
  } as unknown as Parameters<typeof createBillboardNodeMaterial>[0];
}

function billboardMaterial(): ReturnType<typeof createBillboardNodeMaterial> {
  const position = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  const scale = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
  const rotation = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
  return createBillboardNodeMaterial(
    billboardConfigFixture(),
    { minU: 0, minV: 0, maxU: 1, maxV: 1 } as Parameters<typeof createBillboardNodeMaterial>[1],
    position,
    scale,
    rotation,
  );
}

function foliageStaticImpostorMaterial(): ReturnType<typeof createStaticImpostorNodeMaterial> {
  const archetype = STATIC_IMPOSTOR_ARCHETYPES[PixelForgeStaticPropModels.TREE];
  const tex = (): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  };
  const position = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  const scale = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
  const yaw = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
  return createStaticImpostorNodeMaterial(
    archetype,
    { baseColorMap: tex(), normalMap: tex(), depthMap: tex() },
    position,
    scale,
    yaw,
  );
}

describe('TodImpostorMapping consumer wiring', () => {
  afterEach(() => {
    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(Math.PI / 2);
  });

  it('constructs the billboard foliage material with its construction-time tuning intact', () => {
    // The mapping is a multiplicative layer; the material must still carry its
    // static artistic uniforms (the grade multiplies them, identity at noon).
    const material = billboardMaterial();
    expect(material.uniforms.vegetationExposure.value).toBeCloseTo(HUMID_JUNGLE_VEGETATION_EXPOSURE, 6);
    expect(material.uniforms.vegetationSaturation.value).toBeCloseTo(HUMID_JUNGLE_VEGETATION_SATURATION, 6);
    expect(material.colorNode).toBeDefined();
  });

  it('constructs the foliage static-impostor material (unified wrapped-Lambert path)', () => {
    const material = foliageStaticImpostorMaterial();
    expect(material.uniforms.foliageExposure.value).toBeGreaterThan(0);
    expect(material.colorNode).toBeDefined();
  });

  it('drives the shared bindings the materials reference when TOD changes', () => {
    // Build a material so the reference() nodes bind to the singleton, then move
    // the sun: the SAME binding objects the material reads must change value.
    billboardMaterial();
    foliageStaticImpostorMaterial();

    TodImpostorMappingConfig.enabled = true;
    updateTodImpostorMapping(Math.PI / 2); // high sun -> identity
    const noonFoliageExposure = todImpostorMappingBindings.foliage.exposureMul.value;
    const noonNpcExposure = todImpostorMappingBindings.npc.exposureMul.value;

    updateTodImpostorMapping(-0.05); // night -> graded down
    const nightFoliageExposure = todImpostorMappingBindings.foliage.exposureMul.value;
    const nightNpcExposure = todImpostorMappingBindings.npc.exposureMul.value;

    expect(noonFoliageExposure).toBeCloseTo(1, 6);
    expect(noonNpcExposure).toBeCloseTo(1, 6);
    expect(nightFoliageExposure).toBeLessThan(noonFoliageExposure);
    expect(nightNpcExposure).toBeLessThan(nightFoliageExposure); // npc dims harder
  });

  it('freezes the shared bindings at identity when the kill-switch is OFF (construction-time parity)', () => {
    billboardMaterial();
    TodImpostorMappingConfig.enabled = false;
    updateTodImpostorMapping(-0.05); // would grade down if enabled
    expect(todImpostorMappingBindings.enabled.value).toBe(0);
    expect(todImpostorMappingBindings.foliage.exposureMul.value).toBe(1);
    expect(todImpostorMappingBindings.foliage.saturationMul.value).toBe(1);
    expect(todImpostorMappingBindings.foliage.tint.value.r).toBe(1);
    expect(todImpostorMappingBindings.staticImpostor.exposureMul.value).toBe(1);
    expect(todImpostorMappingBindings.npc.exposureMul.value).toBe(1);
  });
});
