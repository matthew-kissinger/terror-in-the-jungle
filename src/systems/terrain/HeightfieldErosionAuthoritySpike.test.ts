// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';
import { buildHeightfieldErosionAuthoritySpike } from './HeightfieldErosionAuthoritySpike';

function providerFromHeight(fn: (x: number, z: number) => number): IHeightProvider {
  return {
    getHeightAt: fn,
    getWorkerConfig(): HeightProviderConfig {
      return { type: 'noise', seed: 1 };
    },
  };
}

describe('buildHeightfieldErosionAuthoritySpike', () => {
  it('keeps flat terrain diagnostic-only and non-authoritative', () => {
    const report = buildHeightfieldErosionAuthoritySpike(
      providerFromHeight(() => 12),
      { worldSize: 100, gridSize: 5 },
    );

    expect(report.debugOnly).toBe(true);
    expect(report.authoritative).toBe(false);
    expect(report.mutatesTerrain).toBe(false);
    expect(report.sourceAuthority).toBe('IHeightProvider');
    expect(report.heightRange.range).toBe(0);
    expect(report.slope.maxDeg).toBe(0);
    expect(report.flow.sinkCellRatio).toBe(0);
    expect(report.erosionRisk.maxRisk01).toBe(0);
  });

  it('reports slope and erosion risk from the existing height provider without swapping authority', () => {
    const report = buildHeightfieldErosionAuthoritySpike(
      providerFromHeight((x) => x * 0.6),
      { worldSize: 80, gridSize: 5, highSlopeDeg: 24 },
    );

    expect(report.sampleSpacingMeters).toBe(20);
    expect(report.heightRange.range).toBeGreaterThan(40);
    expect(report.slope.maxDeg).toBeGreaterThan(25);
    expect(report.slope.highSlopeCellRatio).toBe(1);
    expect(report.flow.meanFlowStrength).toBeGreaterThan(0.5);
    expect(report.erosionRisk.meanRisk01).toBeGreaterThan(0.4);
    expect(report.authoritative).toBe(false);
  });

  it('detects basin-like sinks as hydrology/erosion candidates without creating water', () => {
    const report = buildHeightfieldErosionAuthoritySpike(
      providerFromHeight((x, z) => Math.sqrt(x * x + z * z)),
      { worldSize: 100, gridSize: 5 },
    );

    expect(report.flow.sinkCellRatio).toBeGreaterThan(0);
    expect(report.heightRange.min).toBe(0);
    expect(report.heightRange.max).toBeGreaterThan(60);
    expect(report.erosionRisk.maxRisk01).toBeGreaterThan(0);
  });

  it('rejects invalid analysis grids before sampling terrain', () => {
    const provider = providerFromHeight(() => 0);

    expect(() => buildHeightfieldErosionAuthoritySpike(provider, { worldSize: 100, gridSize: 2 }))
      .toThrow('gridSize');
    expect(() => buildHeightfieldErosionAuthoritySpike(provider, { worldSize: 0, gridSize: 5 }))
      .toThrow('worldSize');
  });
});
