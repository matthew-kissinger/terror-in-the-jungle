// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WaterBodySurface } from './WaterBodySurface';
import type { WaterBodyQuerySegment, WaterBodyStats } from './WaterBodyAuthority';

function makeSegment(): WaterBodyQuerySegment {
  return {
    waterBodyId: 'test_reach',
    startX: 0,
    startZ: 0,
    endX: 20,
    endZ: 0,
    startSurfaceY: 4,
    endSurfaceY: 4,
    halfWidth: 6,
    startDepthMeters: 2,
    endDepthMeters: 3,
  };
}

function makeStats(): WaterBodyStats {
  return {
    bodyCount: 1,
    segmentCount: 1,
    totalLengthMeters: 20,
    minSurfaceY: 4,
    maxSurfaceY: 4,
    minDepthMeters: 2,
    maxDepthMeters: 3,
  };
}

function materialFrom(scene: THREE.Scene): THREE.MeshStandardMaterial {
  return meshFrom(scene).material as THREE.MeshStandardMaterial;
}

function meshFrom(scene: THREE.Scene): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const group = scene.getObjectByName('level-depth-water-bodies');
  const mesh = group?.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material> | undefined;
  if (!mesh) throw new Error('water body mesh missing');
  return mesh;
}

describe('WaterBodySurface lighting', () => {
  it('dims authored water body material for night without hiding the surface', () => {
    const scene = new THREE.Scene();
    const surface = new WaterBodySurface(scene);
    surface.setSegments([makeSegment()], makeStats());

    surface.setLightingFactor(1);
    const material = materialFrom(scene);
    const dayEnv = material.envMapIntensity;
    const dayEmissive = material.emissiveIntensity;
    const dayOpacity = material.opacity;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.vertexColors).toBe(true);
    expect(material.color.r).toBeCloseTo(1, 5);

    surface.setLightingFactor(0);
    const nightMaterial = meshFrom(scene).material as THREE.MeshBasicMaterial;

    expect(surface.isVisible()).toBe(true);
    expect(nightMaterial.name).toBe('level-depth-water-body-night-material');
    expect(nightMaterial.color.r).toBeLessThan(0.2);
    expect(nightMaterial.color.b).toBeGreaterThan(nightMaterial.color.r);
    expect(material.envMapIntensity).toBeLessThan(dayEnv * 0.2);
    expect(material.emissiveIntensity).toBeLessThan(dayEmissive);
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    expect(material.opacity).toBeGreaterThan(dayOpacity);
    expect(nightMaterial.transparent).toBe(false);
    expect(nightMaterial.depthWrite).toBe(true);
    expect(nightMaterial.vertexColors).toBe(false);
  });

  it('raises authored water opacity at night so riverbed color does not dominate', () => {
    const scene = new THREE.Scene();
    const surface = new WaterBodySurface(scene);
    surface.setSegments([makeSegment()], makeStats());
    const material = materialFrom(scene);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <color_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    };

    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms);
    surface.setLightingFactor(1);
    const dayBlend = material.userData.waterBodyNightBlend;
    surface.setLightingFactor(0);

    expect(dayBlend).toBe(0);
    expect(material.userData.waterBodyNightBlend).toBe(1);
    expect(material.userData.waterBodyNightAlphaFloor).toBeGreaterThan(0.8);
    expect(shader.fragmentShader).toContain('uniform vec3 waterBodyNightRenderColor');
    expect(shader.fragmentShader).toContain('waterBodyNightRenderColor');
    expect(shader.fragmentShader).toContain('max(vWaterAlpha, waterBodyNightAlphaFloor)');
    expect(shader.uniforms).toHaveProperty('waterBodyNightBlend');
    expect(shader.uniforms).toHaveProperty('waterBodyNightRenderColor');
  });

  it('keeps water RGB separate from custom alpha for WebGPU material stability', () => {
    const scene = new THREE.Scene();
    const surface = new WaterBodySurface(scene);
    surface.setSegments([makeSegment()], makeStats());
    const mesh = meshFrom(scene);

    expect(mesh.geometry.getAttribute('color').itemSize).toBe(3);
    expect(mesh.geometry.getAttribute('waterAlpha').itemSize).toBe(1);
  });
});
