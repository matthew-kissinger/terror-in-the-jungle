// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior coverage for the A Shau gameplay-query heightmap resolution.
 *
 * The defect (combat-movement-stall-tail root): A Shau CPU height/slope queries
 * used to read a coarse 512 surface grid (~42m/sample over a ~21.5km world).
 * Over a real 9m DEM that coarse grid C0-smooths sharp ridges, so the slope
 * GRADIENT DIRECTION (which decides which way an NPC contours around a slope)
 * flips relative to the true terrain — the input signal that drives the
 * contour-direction oscillation.
 *
 * Since ashau-load-freeze (2026-06-10) the GPU surface grid for DEM-scale
 * worlds is baked at the same 1024 cap as the gameplay-query grid, so render
 * and collision interpolate ONE grid. These tests assert:
 *  - the surface and gameplay-query grids are the same fine grid for
 *    DEM-scale worlds (render↔collision coherence),
 *  - small procedural worlds don't over-resolve (no needless memory growth),
 *  - a sharp, asymmetric ridge narrower than the pre-fix 42m cell keeps its
 *    real slope sign at the shared resolution (the historical defect repro
 *    stays pinned at the old 512 grid).
 */

import { describe, it, expect } from 'vitest';
import { BakedHeightProvider } from './BakedHeightProvider';
import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';
import {
  computeTerrainSurfaceGridSize,
  computeGameplayQueryGridSize,
} from './TerrainSurfaceRuntime';

const NOISE_CONFIG: HeightProviderConfig = { type: 'noise', seed: 1 };

/**
 * Synthetic A Shau-like source: an asymmetric ridge running along Z, centred at
 * x = ridgeX. The east face climbs gently over `eastRun` metres; the west face
 * drops steeply over `westRun` metres. The steep face is far narrower than a
 * ~42m coarse surface cell, so a coarse bake cannot represent it.
 */
function makeAsymmetricRidgeProvider(ridgeX: number, peak: number): IHeightProvider {
  const eastRun = 120; // gentle approach from the east
  const westRun = 18; // steep drop to the west (sub-cell at 42m/sample)
  return {
    getHeightAt: (worldX: number): number => {
      const d = worldX - ridgeX;
      if (d <= -eastRun) return 0;
      if (d >= westRun) return 0;
      if (d <= 0) {
        // east face: gentle rise to the peak
        return peak * (1 + d / eastRun);
      }
      // west face: steep drop from the peak
      return peak * (1 - d / westRun);
    },
    getWorkerConfig: (): HeightProviderConfig => NOISE_CONFIG,
  };
}

/** Bake an along-X provider into a square grid the way HeightmapGPU does. */
function bakeGrid(provider: IHeightProvider, gridSize: number, worldSize: number): Float32Array {
  const data = new Float32Array(gridSize * gridSize);
  const half = worldSize / 2;
  const step = worldSize / (gridSize - 1);
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      data[z * gridSize + x] = provider.getHeightAt(-half + x * step, -half + z * step);
    }
  }
  return data;
}

/** Central-difference east-west slope at a point (matches the AI contour scale). */
function eastWestGradient(provider: IHeightProvider, x: number, z: number, sample: number): number {
  const e = provider.getHeightAt(x + sample, z);
  const w = provider.getHeightAt(x - sample, z);
  return (e - w) / (2 * sample);
}

describe('gameplay heightmap resolution (A Shau contour-input fidelity)', () => {
  const A_SHAU_WORLD = 21136;
  const A_SHAU_SURFACE = A_SHAU_WORLD + 400; // default visualMargin 200 each side

  it('surface and gameplay-query grids are the same fine grid for A Shau (coherence)', () => {
    const surfaceGrid = computeTerrainSurfaceGridSize(A_SHAU_SURFACE);
    const queryGrid = computeGameplayQueryGridSize(A_SHAU_WORLD);

    // One shared grid: the rendered surface and every CPU height query
    // (collision, BVH, AI slope, vegetation) interpolate identical data.
    expect(surfaceGrid).toBe(queryGrid);

    // And that grid is fine enough to be DEM-faithful (~21m/sample, not the
    // pre-fix ~42m that C0-smoothed sharp ridges).
    const surfaceMetersPerSample = A_SHAU_SURFACE / (surfaceGrid - 1);
    expect(surfaceMetersPerSample).toBeLessThan(25);
  });

  it('does not over-resolve small procedural worlds (no needless memory growth)', () => {
    // A 3200m Open Frontier world already bakes a fine surface grid; the gameplay
    // grid must not balloon past it.
    const small = 3200;
    expect(computeGameplayQueryGridSize(small)).toBeLessThanOrEqual(
      computeTerrainSurfaceGridSize(small),
    );
  });

  it('coarse surface-resolution bake flattens a sub-cell ridge (the defect repro)', () => {
    const ridgeX = 137; // off-grid so the ridge sits inside a coarse cell
    const provider = makeAsymmetricRidgeProvider(ridgeX, 60);
    // Pinned at the PRE-FIX surface grid (512 ⇒ ~42m/sample): this documents
    // the defect the resolution lift fixed, independent of the live sizing.
    const surfaceGrid = 512;

    const coarse = bakeGrid(provider, surfaceGrid, A_SHAU_SURFACE);
    const coarseProvider = new BakedHeightProvider(coarse, surfaceGrid, A_SHAU_SURFACE, NOISE_CONFIG);

    // Truth: 4m onto the steep west face the ground is dropping sharply as we go
    // west (west side higher than east ⇒ steep negative east-west gradient).
    // Sample at the AI contour scale (3m).
    const truthGradJustWest = eastWestGradient(provider, ridgeX + 4, 0, 3);
    expect(truthGradJustWest).toBeLessThan(-1); // genuinely steep

    // The ~42m/sample bake cannot see an 18m-wide steep face: it reports a near-flat
    // slope at the same point — the C0 smoothing plateau.
    const coarseGradJustWest = eastWestGradient(coarseProvider, ridgeX + 4, 0, 3);
    expect(Math.abs(coarseGradJustWest)).toBeLessThan(0.5); // flattened
  });

  it('gameplay-query-resolution bake preserves the ridge slope sign (the fix)', () => {
    const ridgeX = 137;
    const provider = makeAsymmetricRidgeProvider(ridgeX, 60);
    const queryGrid = computeGameplayQueryGridSize(A_SHAU_WORLD);

    const fine = bakeGrid(provider, queryGrid, A_SHAU_WORLD);
    const fineProvider = new BakedHeightProvider(fine, queryGrid, A_SHAU_WORLD, NOISE_CONFIG);

    const truthGradJustWest = eastWestGradient(provider, ridgeX + 4, 0, 3);
    const fineGradJustWest = eastWestGradient(fineProvider, ridgeX + 4, 0, 3);

    // The fine bake keeps the real east-west slope sign (no contour flip) and a
    // meaningful magnitude — the faithful slope the contour solver needs.
    expect(Math.sign(fineGradJustWest)).toBe(Math.sign(truthGradJustWest));
    expect(Math.abs(fineGradJustWest)).toBeGreaterThan(0.5);
  });
});
