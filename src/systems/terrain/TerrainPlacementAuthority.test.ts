// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveGroundPlacement, resolveWatercraftPlacement } from './TerrainPlacementAuthority';

describe('resolveGroundPlacement', () => {
  it('snaps a cloned position to a finite terrain height', () => {
    const base = new THREE.Vector3(10, 2, -20);

    const result = resolveGroundPlacement(base, { getHeightAt: () => 42 });

    expect(result.source).toBe('terrain');
    expect(result.position).not.toBe(base);
    expect(result.position.toArray()).toEqual([10, 42, -20]);
    expect(base.toArray()).toEqual([10, 2, -20]);
  });

  it('keeps the base height when terrain has no finite height for the point', () => {
    const base = new THREE.Vector3(1, 7, 3);

    const result = resolveGroundPlacement(base, { getHeightAt: () => Number.NaN });

    expect(result.source).toBe('base');
    expect(result.position).not.toBe(base);
    expect(result.position.toArray()).toEqual([1, 7, 3]);
  });
});

describe('resolveWatercraftPlacement', () => {
  it('uses water surface plus freeboard when the scenario enables water', () => {
    const base = new THREE.Vector3(-12, 0, 34);
    const terrainSystem = { getHeightAt: vi.fn(() => -9) };
    const waterSystem = { getWaterSurfaceY: vi.fn(() => 5) };

    const result = resolveWatercraftPlacement(base, {
      terrainSystem,
      waterSystem,
      waterEnabled: true,
      freeboardMeters: 0.35,
    });

    expect(result.source).toBe('water');
    expect(result.position.toArray()).toEqual([-12, 5.35, 34]);
    expect(terrainSystem.getHeightAt).not.toHaveBeenCalled();
    expect(waterSystem.getWaterSurfaceY).toHaveBeenCalledWith(base);
  });

  it('skips the water sampler when water is disabled and falls back to terrain', () => {
    const base = new THREE.Vector3(4, 0, 6);
    const terrainSystem = { getHeightAt: vi.fn(() => 11) };
    const waterSystem = { getWaterSurfaceY: vi.fn(() => 100) };

    const result = resolveWatercraftPlacement(base, {
      terrainSystem,
      waterSystem,
      waterEnabled: false,
      freeboardMeters: 0.3,
    });

    expect(result.source).toBe('terrain');
    expect(result.position.toArray()).toEqual([4, 11, 6]);
    expect(waterSystem.getWaterSurfaceY).not.toHaveBeenCalled();
  });

  it('falls back to terrain when enabled water does not cover the spawn point', () => {
    const base = new THREE.Vector3(8, 1, 9);

    const result = resolveWatercraftPlacement(base, {
      terrainSystem: { getHeightAt: () => 13 },
      waterSystem: { getWaterSurfaceY: () => null },
      waterEnabled: true,
    });

    expect(result.source).toBe('terrain');
    expect(result.position.toArray()).toEqual([8, 13, 9]);
  });
});
