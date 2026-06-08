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
  const group = scene.getObjectByName('level-depth-water-bodies');
  const mesh = group?.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
  if (!mesh) throw new Error('water body mesh missing');
  return mesh.material;
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
    expect(material.color.r).toBeCloseTo(1, 5);

    surface.setLightingFactor(0);

    expect(surface.isVisible()).toBe(true);
    expect(material.color.r).toBeLessThan(0.2);
    expect(material.color.b).toBeGreaterThan(material.color.r);
    expect(material.envMapIntensity).toBeLessThan(dayEnv * 0.2);
    expect(material.emissiveIntensity).toBeLessThan(dayEmissive * 0.2);
  });
});
