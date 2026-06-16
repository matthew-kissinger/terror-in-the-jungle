// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { TerrainHeightBoundsIndex } from './TerrainHeightBoundsIndex';

function buildGrid(size: number, valueAt: (x: number, z: number) => number): Float32Array {
  const data = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      data[z * size + x] = valueAt(x, z);
    }
  }
  return data;
}

function sampleBilinear(data: Float32Array, gridSize: number, worldSize: number, worldX: number, worldZ: number): number {
  const halfWorld = worldSize * 0.5;
  const gridMax = gridSize - 1;
  const gx = ((worldX + halfWorld) / worldSize) * gridMax;
  const gz = ((worldZ + halfWorld) / worldSize) * gridMax;
  const x0 = Math.max(0, Math.min(gridMax - 1, Math.floor(gx)));
  const z0 = Math.max(0, Math.min(gridMax - 1, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - x0));
  const fz = Math.max(0, Math.min(1, gz - z0));
  const h00 = data[z0 * gridSize + x0];
  const h10 = data[z0 * gridSize + x0 + 1];
  const h01 = data[(z0 + 1) * gridSize + x0];
  const h11 = data[(z0 + 1) * gridSize + x0 + 1];
  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fz;
}

describe('TerrainHeightBoundsIndex', () => {
  it('returns conservative bounds for an interior spike missed by corner sampling', () => {
    const gridSize = 9;
    const data = buildGrid(gridSize, (x, z) => (x === 4 && z === 4 ? 750 : 10));
    const index = new TerrainHeightBoundsIndex(data, gridSize, 800);
    const target = { minY: 0, maxY: 0 };

    const bounds = index.queryWorldBounds(-150, -150, 150, 150, target, 20);

    expect(bounds).toBe(target);
    expect(bounds!.minY).toBe(-10);
    expect(bounds!.maxY).toBe(770);
  });

  it('includes every texel corner needed by bilinear samples along partial tile edges', () => {
    const gridSize = 5;
    const data = buildGrid(gridSize, (x, z) => x + z * 10);
    const index = new TerrainHeightBoundsIndex(data, gridSize, 400);
    const target = { minY: 0, maxY: 0 };

    const bounds = index.queryWorldBounds(-1, -1, 1, 1, target);

    // The tiny query around the world origin spans the four center cells, so
    // bilinear filtering can read the surrounding 3x3 texel-corner range.
    expect(bounds).toEqual({ minY: 11, maxY: 33 });
  });

  it('clamps queries at the visual surface edge like the height texture', () => {
    const gridSize = 4;
    const data = buildGrid(gridSize, (x, z) => x === 3 && z === 3 ? 99 : 1);
    const index = new TerrainHeightBoundsIndex(data, gridSize, 300);
    const target = { minY: 0, maxY: 0 };

    const bounds = index.queryWorldBounds(150, 150, 300, 300, target);

    expect(bounds).toEqual({ minY: 1, maxY: 99 });
  });

  it('answers CDLOD tile-shaped queries with reusable targets', () => {
    const gridSize = 8;
    const data = buildGrid(gridSize, (x, z) => (x >= 2 && x <= 5 && z >= 2 && z <= 5 ? 40 : -5));
    const index = new TerrainHeightBoundsIndex(data, gridSize, 700);
    const target = { minY: 123, maxY: 456 };

    const bounds = index.queryTileBounds(0, 0, 350, target, 8);

    expect(bounds).toBe(target);
    expect(bounds!.minY).toBe(-13);
    expect(bounds!.maxY).toBe(48);
  });

  it('contains bilinear terrain samples for non-dyadic A Shau-like visual extents', () => {
    const gridSize = 33;
    const worldSize = 21136 + 400;
    const data = buildGrid(gridSize, (x, z) => (
      Math.sin(x * 0.7) * 120
      + Math.cos(z * 0.4) * 80
      + (x === 18 && z === 21 ? 600 : 0)
    ));
    const index = new TerrainHeightBoundsIndex(data, gridSize, worldSize);
    const target = { minY: 0, maxY: 0 };

    const probes = [
      { cx: 1950, cz: 2649, size: worldSize / 64 },
      { cx: -2800, cz: 3900, size: worldSize / 32 },
      { cx: worldSize * 0.49, cz: worldSize * 0.49, size: worldSize / 16 },
    ];

    for (const probe of probes) {
      const bounds = index.queryTileBounds(probe.cx, probe.cz, probe.size, target);
      expect(bounds).toBeDefined();
      const half = probe.size * 0.5;
      for (const tx of [0, 0.17, 0.5, 0.83, 1]) {
        for (const tz of [0, 0.23, 0.5, 0.77, 1]) {
          const x = probe.cx - half + probe.size * tx;
          const z = probe.cz - half + probe.size * tz;
          const height = sampleBilinear(data, gridSize, worldSize, x, z);
          expect(height).toBeGreaterThanOrEqual(bounds!.minY - 1e-4);
          expect(height).toBeLessThanOrEqual(bounds!.maxY + 1e-4);
        }
      }
    }
  });
});
