// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  BakedHeightProvider,
  ConstantHeightProvider,
  DemHeightProvider,
  StampedHeightProvider,
  bakeStampedHeightmapGrid,
  createHeightProvider,
  type TerrainStampConfig,
} from './index';

const circleStamp: TerrainStampConfig = {
  kind: 'flatten_circle',
  centerX: 0,
  centerZ: 0,
  innerRadius: 2,
  outerRadius: 4,
  gradeRadius: 6,
  gradeStrength: 0.25,
  priority: 1,
  samplingRadius: 0,
  targetHeightMode: 'center',
  fixedTargetHeight: 10,
  heightOffset: 0,
};

describe('terrain-height-core', () => {
  it('samples DEM data with bilinear interpolation', () => {
    const provider = new DemHeightProvider(new Float32Array([0, 10, 20, 30]), 2, 2, 10);
    expect(provider.getHeightAt(-5, -5)).toBeCloseTo(15);
  });

  it('samples baked grids with GPU-style coordinates', () => {
    const provider = new BakedHeightProvider(new Float32Array([0, 10, 20, 30]), 2, 10);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(15);
  });

  it('flattens circular stamps', () => {
    const provider = new StampedHeightProvider(new ConstantHeightProvider(0), [circleStamp]);
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(10);
    expect(provider.getHeightAt(20, 20)).toBeCloseTo(0);
  });

  it('bakes stamped heightmap grids', () => {
    const baked = bakeStampedHeightmapGrid(
      new Float32Array(25),
      5,
      8,
      new ConstantHeightProvider(0),
      [circleStamp],
    );
    expect(baked[12]).toBeCloseTo(10);
  });

  it('creates providers from config', () => {
    const provider = createHeightProvider({
      type: 'stamped',
      base: { type: 'constant', height: 0 },
      stamps: [circleStamp],
    });
    expect(provider.getHeightAt(0, 0)).toBeCloseTo(10);
  });
});