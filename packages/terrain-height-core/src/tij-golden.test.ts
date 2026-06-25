// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  BakedHeightProvider,
  ConstantHeightProvider,
  DemHeightProvider,
  StampedHeightProvider,
  bakeStampedHeightmapGrid,
  type TerrainStampConfig,
} from './index';

// Golden samples copied from TIJ terrain provider tests before any Wave 2
// backport. These pin the extracted math against the current game contract.

describe('terrain-height-core TIJ golden samples', () => {
  it('matches TIJ DEM bilinear and origin samples', () => {
    const dem = new DemHeightProvider(new Float32Array([
      100, 200, 300, 400,
      150, 250, 350, 450,
      200, 300, 400, 500,
      250, 350, 450, 550,
    ]), 4, 4, 10, 0, 0);

    expect(dem.getHeightAt(-20, -20)).toBeCloseTo(100, 2);
    expect(dem.getHeightAt(-10, -10)).toBeCloseTo(250, 2);
    expect(dem.getHeightAt(-15, -15)).toBeCloseTo(175, 2);
    expect(dem.getHeightAt(-15, -20)).toBeCloseTo(150, 2);
    expect(dem.getHeightAt(-1000, -1000)).toBeCloseTo(100, 2);

    const offsetDem = new DemHeightProvider(new Float32Array([
      10, 20, 30, 40,
      50, 60, 70, 80,
      90, 100, 110, 120,
      130, 140, 150, 160,
    ]), 4, 4, 10, 100, 200);

    expect(offsetDem.getHeightAt(80, 180)).toBeCloseTo(10, 2);
    expect(offsetDem.getHeightAt(100, 200)).toBeCloseTo(110, 2);
  });

  it('matches TIJ baked heightmap grid samples', () => {
    const provider = new BakedHeightProvider(new Float32Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
    ]), 3, 100);

    expect(provider.getHeightAt(-50, -50)).toBeCloseTo(10);
    expect(provider.getHeightAt(50, 50)).toBeCloseTo(90);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(50);

    const clamped = new BakedHeightProvider(new Float32Array([5, 15, 25, 35]), 2, 100);
    expect(clamped.getHeightAt(-200, -50)).toBeCloseTo(5);
    expect(clamped.getHeightAt(200, 50)).toBeCloseTo(35);
  });

  it('matches TIJ flatten stamp and grid-bake samples', () => {
    const stamp: TerrainStampConfig = {
      kind: 'flatten_circle',
      centerX: 0,
      centerZ: 0,
      innerRadius: 4,
      outerRadius: 6,
      gradeRadius: 6,
      gradeStrength: 0,
      samplingRadius: 4,
      targetHeightMode: 'center',
      heightOffset: 8,
      priority: 100,
    };

    const provider = new StampedHeightProvider(new ConstantHeightProvider(0), [stamp]);
    expect(provider.getHeightAt(0, 0)).toBe(8);
    expect(provider.getHeightAt(20, 20)).toBe(0);

    const baked = bakeStampedHeightmapGrid(
      new Float32Array(5 * 5),
      5,
      40,
      new ConstantHeightProvider(0),
      [stamp],
    );

    expect(baked[2 * 5 + 2]).toBe(8);
    expect(baked[0]).toBe(0);
  });
});