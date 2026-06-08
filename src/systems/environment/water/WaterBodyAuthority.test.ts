// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { WaterBodyBasinConfig, WaterBodyReachConfig } from '../../../config/gameModeTypes';
import {
  WaterBodyAuthority,
  compileWaterBodyQuerySegments,
  compileWaterBodyTerrainFeatures,
} from './WaterBodyAuthority';

function makeReach(overrides: Partial<WaterBodyReachConfig> = {}): WaterBodyReachConfig {
  return {
    id: 'test_reach',
    kind: 'reach',
    surfaceY: 12,
    widthMeters: 40,
    depthMinMeters: 2,
    depthMaxMeters: 5,
    bankGradeMeters: 30,
    points: [
      { x: 0, z: 0 },
      { x: 100, z: 0, depthMeters: 5 },
      { x: 180, z: 40 },
    ],
    ...overrides,
  };
}

function makeBasin(overrides: Partial<WaterBodyBasinConfig> = {}): WaterBodyBasinConfig {
  return {
    id: 'test_basin',
    kind: 'basin',
    surfaceY: 18,
    center: { x: 50, z: 75 },
    radiusXMeters: 120,
    radiusZMeters: 45,
    rotationRadians: Math.PI / 6,
    depthMinMeters: 1.1,
    depthMaxMeters: 4.8,
    bankGradeMeters: 38,
    flowDirection: { x: 0, z: 1 },
    ...overrides,
  };
}

describe('WaterBodyAuthority', () => {
  it('compiles level reaches into constant-surface query segments with variable bed depth', () => {
    const segments = compileWaterBodyQuerySegments([makeReach()]);

    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => segment.shape === 'reach')).toBe(true);
    expect(segments.every((segment) => segment.startSurfaceY === 12 && segment.endSurfaceY === 12)).toBe(true);
    expect(segments[0]?.startBedY).toBe(10);
    expect(segments[0]?.endBedY).toBe(7);
    expect(segments[1]?.startDepthMeters).toBe(5);
    expect(segments[1]?.endDepthMeters).toBe(5);
    expect(segments[0]?.halfWidth).toBe(20);
  });

  it('compiles level basins into one bounded query footprint with deep-center metadata', () => {
    const segments = compileWaterBodyQuerySegments([makeBasin()]);

    expect(segments).toHaveLength(1);
    const basin = segments[0];
    expect(basin?.shape).toBe('basin');
    expect(basin?.centerX).toBe(50);
    expect(basin?.centerZ).toBe(75);
    expect(basin?.radiusXMeters).toBe(120);
    expect(basin?.radiusZMeters).toBe(45);
    expect(basin?.startSurfaceY).toBe(18);
    expect(basin?.endSurfaceY).toBe(18);
    expect(basin?.startDepthMeters).toBe(1.1);
    expect(basin?.endDepthMeters).toBe(4.8);
    expect(basin?.halfWidth).toBe(45);
    expect(basin?.flowZ).toBe(1);
  });

  it('compiles carved bed stamps below the level surface', () => {
    const features = compileWaterBodyTerrainFeatures([makeReach()]);

    expect(features.stamps).toHaveLength(2);
    expect(features.vegetationExclusionZones.length).toBeGreaterThan(features.stamps.length);
    const first = features.stamps[0];
    expect(first?.kind).toBe('flatten_capsule');
    if (first?.kind !== 'flatten_capsule') throw new Error('expected flatten_capsule');

    expect(first.fixedTargetHeight).toBeLessThan(12);
    expect(first.innerRadius).toBe(20);
    expect(first.gradeRadius).toBeGreaterThan(first.outerRadius);
    expect(first.obstructionPolicy).toBe('override');
    expect(first.targetHeightStrategy).toBe('baked');
  });

  it('compiles basin bed stamps without requiring hydrology river bands', () => {
    const features = compileWaterBodyTerrainFeatures([makeBasin()]);

    expect(features.stamps).toHaveLength(1);
    expect(features.vegetationExclusionZones.length).toBeGreaterThan(1);
    const stamp = features.stamps[0];
    expect(stamp?.kind).toBe('flatten_capsule');
    if (stamp?.kind !== 'flatten_capsule') throw new Error('expected flatten_capsule');
    expect(stamp.innerRadius).toBe(45);
    expect(stamp.fixedTargetHeight).toBeCloseTo(13.2, 5);
    expect(stamp.gradeRadius).toBeGreaterThan(stamp.outerRadius);
  });

  it('publishes stable debug stats for active authored water', () => {
    const authority = new WaterBodyAuthority();

    authority.setBodies([makeReach(), makeBasin()]);

    expect(authority.isActive()).toBe(true);
    expect(authority.getQuerySegments()).toHaveLength(3);
    expect(authority.getStats()).toMatchObject({
      bodyCount: 2,
      segmentCount: 3,
      minSurfaceY: 12,
      maxSurfaceY: 18,
      minDepthMeters: 1.1,
      maxDepthMeters: 5,
    });
  });
});
