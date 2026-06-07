// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { WaterBodyConfig } from '../../../config/gameModeTypes';
import {
  WaterBodyAuthority,
  compileWaterBodyQuerySegments,
  compileWaterBodyTerrainFeatures,
} from './WaterBodyAuthority';

function makeReach(overrides: Partial<WaterBodyConfig> = {}): WaterBodyConfig {
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

describe('WaterBodyAuthority', () => {
  it('compiles level reaches into constant-surface query segments with variable bed depth', () => {
    const segments = compileWaterBodyQuerySegments([makeReach()]);

    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => segment.startSurfaceY === 12 && segment.endSurfaceY === 12)).toBe(true);
    expect(segments[0]?.startBedY).toBe(10);
    expect(segments[0]?.endBedY).toBe(7);
    expect(segments[1]?.startDepthMeters).toBe(5);
    expect(segments[1]?.endDepthMeters).toBe(5);
    expect(segments[0]?.halfWidth).toBe(20);
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

  it('publishes stable debug stats for active authored water', () => {
    const authority = new WaterBodyAuthority();

    authority.setBodies([makeReach()]);

    expect(authority.isActive()).toBe(true);
    expect(authority.getQuerySegments()).toHaveLength(2);
    expect(authority.getStats()).toMatchObject({
      bodyCount: 1,
      segmentCount: 2,
      minSurfaceY: 12,
      maxSurfaceY: 12,
      minDepthMeters: 2,
      maxDepthMeters: 5,
    });
  });
});
