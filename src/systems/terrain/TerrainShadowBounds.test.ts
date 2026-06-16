// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeTerrainShadowBoundRadius,
  TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS,
} from './TerrainShadowBounds';

describe('computeTerrainShadowBoundRadius', () => {
  it('keeps the conservative fallback when no directional light is available', () => {
    expect(computeTerrainShadowBoundRadius(null)).toBe(TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS);
  });

  it('uses the actual valid shadow camera footprint even when it is below the fallback radius', () => {
    const light = new THREE.DirectionalLight();
    light.target.position.set(0, 0, 0);
    light.position.set(0, 300, 0);
    light.shadow.camera.left = -100;
    light.shadow.camera.right = 100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.far = 300;

    const radius = computeTerrainShadowBoundRadius(light);

    expect(radius).toBeLessThan(TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS);
    expect(radius).toBeCloseTo(Math.hypot(100, 100) + 64, 3);
  });

  it('expands with horizontal sun angle and shadow camera far plane', () => {
    const light = new THREE.DirectionalLight();
    light.target.position.set(25, 12, -75);
    light.position.set(325, 412, -75);
    light.shadow.camera.left = -100;
    light.shadow.camera.right = 100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.far = 1000;

    expect(computeTerrainShadowBoundRadius(light)).toBeCloseTo(805.421, 3);
  });
});
