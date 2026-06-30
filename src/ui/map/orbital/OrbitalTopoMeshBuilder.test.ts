// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  buildTopoMeshData,
  downsampleHeightGrid,
  sampleHeightGrid,
  hypsometricColor,
  type HeightGrid,
} from './OrbitalTopoMeshBuilder';

/** A simple ramp grid: height increases linearly with column, 0..(size-1). */
function rampGrid(size: number, worldSize = 100): HeightGrid {
  const data = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      data[row * size + col] = col;
    }
  }
  return { data, gridSize: size, worldSize };
}

describe('orbital topo mesh builder', () => {
  it('samples the corners of a ramp grid at the grid extremes', () => {
    const grid = rampGrid(8);
    expect(sampleHeightGrid(grid, 0, 0)).toBeCloseTo(0);
    expect(sampleHeightGrid(grid, 1, 0)).toBeCloseTo(7);
    expect(sampleHeightGrid(grid, 0.5, 0.5)).toBeCloseTo(3.5);
  });

  it('downsampling preserves the height extremes and never aliases the source buffer', () => {
    const grid = rampGrid(16);
    const coarse = downsampleHeightGrid(grid, 8);
    expect(coarse.gridSize).toBe(8);
    expect(coarse.data.buffer).not.toBe(grid.data.buffer);
    // Min at col 0, max at the last col of the source ramp.
    let min = Infinity;
    let max = -Infinity;
    for (const h of coarse.data) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeCloseTo(0);
    expect(max).toBeCloseTo(15);
  });

  it('does not write into a read-only source buffer when building the mesh', () => {
    const grid = rampGrid(8);
    const snapshot = Float32Array.from(grid.data);
    buildTopoMeshData(grid, { resolution: 8 });
    expect(Array.from(grid.data)).toEqual(Array.from(snapshot));
  });

  it('produces a centred plane whose vertical extent grows with height', () => {
    const grid = rampGrid(8, 100);
    const mesh = buildTopoMeshData(grid, { resolution: 8, displaySize: 100, verticalExaggeration: 1 });
    // (resolution + 1)² vertices.
    expect(mesh.positions.length).toBe(9 * 9 * 3);
    // X spans roughly [-50, 50] for displaySize 100.
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      minX = Math.min(minX, mesh.positions[i]);
      maxX = Math.max(maxX, mesh.positions[i]);
      maxY = Math.max(maxY, mesh.positions[i + 1]);
    }
    expect(minX).toBeCloseTo(-50);
    expect(maxX).toBeCloseTo(50);
    // The tallest vertex sits above the base plane.
    expect(maxY).toBeGreaterThan(0);
  });

  it('emits per-vertex normalized height in [0,1] spanning the full range', () => {
    const grid = rampGrid(8);
    const mesh = buildTopoMeshData(grid, { resolution: 8 });
    let min = Infinity;
    let max = -Infinity;
    for (const n of mesh.heightNorm) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    expect(min).toBeCloseTo(0);
    expect(max).toBeCloseTo(1);
  });

  it('hypsometric colour moves from the low stop toward the peak stop as height rises', () => {
    const lowColor = hypsometricColor(0);
    const peakColor = hypsometricColor(1);
    // The default peak stop is paler (higher) than the low jungle stop.
    expect(peakColor[0] + peakColor[1] + peakColor[2]).toBeGreaterThan(
      lowColor[0] + lowColor[1] + lowColor[2],
    );
  });
});
