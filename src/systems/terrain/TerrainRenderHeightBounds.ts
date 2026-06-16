// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TerrainTileHeightBounds, TerrainTileHeightBoundsProvider } from './CDLODQuadtree';

export type TerrainHeightBoundsSource = 'none' | 'baked-grid' | 'heuristic-samples';

interface TerrainHeightBoundsIndexLike {
  getInfo(): { worldSize: number };
  queryTileBounds(
    cx: number,
    cz: number,
    size: number,
    target: TerrainTileHeightBounds,
  ): TerrainTileHeightBounds | null;
}

interface TerrainHeightBoundsSurfaceLike {
  getHeightBoundsIndex(): TerrainHeightBoundsIndexLike | null;
}

export interface TerrainHeightBoundsSelection {
  source: TerrainHeightBoundsSource;
  provider?: TerrainTileHeightBoundsProvider;
}

const HEIGHT_BOUNDS_MIN_PAD_METERS = 96;
const HEIGHT_BOUNDS_SKIRT_PAD_METERS = 48;
const HEIGHT_BOUNDS_TILE_PAD_FRACTION = 0.06;
const HEIGHT_BOUNDS_MAX_PAD_METERS = 640;

function readBooleanQueryFlag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === null) return false;
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

function isTerrainHeuristicHeightAwareFrustumEnabled(): boolean {
  return (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')
    && readBooleanQueryFlag('terrainEnableHeightAwareFrustum');
}

function writePaddedHeightBounds(
  minYInput: number,
  maxYInput: number,
  size: number,
  target: TerrainTileHeightBounds,
): TerrainTileHeightBounds {
  const minY = Math.min(minYInput, maxYInput);
  const maxY = Math.max(minYInput, maxYInput);
  const pad = Math.min(
    HEIGHT_BOUNDS_MAX_PAD_METERS,
    Math.max(
      HEIGHT_BOUNDS_MIN_PAD_METERS,
      size * HEIGHT_BOUNDS_TILE_PAD_FRACTION,
      (maxY - minY) * 0.25,
    ) + HEIGHT_BOUNDS_SKIRT_PAD_METERS,
  );
  target.minY = minY - pad;
  target.maxY = maxY + pad;
  return target;
}

function createIndexedHeightBoundsProvider(
  terrainHeightBoundsForTile: TerrainTileHeightBoundsProvider,
): TerrainTileHeightBoundsProvider {
  const rawHeightBoundsScratch: TerrainTileHeightBounds = { minY: 0, maxY: 0 };
  return (cx, cz, size, target) => {
    const rawBounds = terrainHeightBoundsForTile(cx, cz, size, rawHeightBoundsScratch);
    if (!rawBounds || !Number.isFinite(rawBounds.minY) || !Number.isFinite(rawBounds.maxY)) {
      return null;
    }
    return writePaddedHeightBounds(rawBounds.minY, rawBounds.maxY, size, target);
  };
}

function createHeuristicHeightBoundsProvider(
  terrainHeightAt: (x: number, z: number) => number,
): TerrainTileHeightBoundsProvider {
  return (cx, cz, size, target) => {
    const half = size * 0.5;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let samples = 0;
    const sample = (x: number, z: number): void => {
      const height = terrainHeightAt(x, z);
      if (!Number.isFinite(height)) return;
      minY = Math.min(minY, height);
      maxY = Math.max(maxY, height);
      samples += 1;
    };

    sample(cx, cz);
    sample(cx - half, cz - half);
    sample(cx, cz - half);
    sample(cx + half, cz - half);
    sample(cx - half, cz);
    sample(cx + half, cz);
    sample(cx - half, cz + half);
    sample(cx, cz + half);
    sample(cx + half, cz + half);
    return samples > 0 ? writePaddedHeightBounds(minY, maxY, size, target) : null;
  };
}

export function createTerrainHeightBoundsSelection(
  terrainHeightBoundsForTile?: TerrainTileHeightBoundsProvider,
  terrainHeightAt?: (x: number, z: number) => number,
): TerrainHeightBoundsSelection {
  if (terrainHeightBoundsForTile) {
    return { source: 'baked-grid', provider: createIndexedHeightBoundsProvider(terrainHeightBoundsForTile) };
  }
  if (terrainHeightAt && isTerrainHeuristicHeightAwareFrustumEnabled()) {
    return { source: 'heuristic-samples', provider: createHeuristicHeightBoundsProvider(terrainHeightAt) };
  }
  return { source: 'none' };
}

export function createBakedTerrainHeightBoundsProvider(
  surface: TerrainHeightBoundsSurfaceLike,
  getVisualWorldSize: () => number,
): TerrainTileHeightBoundsProvider {
  return (cx, cz, size, target) => {
    const index = surface.getHeightBoundsIndex();
    if (!index) return null;
    if (Math.abs(index.getInfo().worldSize - getVisualWorldSize()) > 1e-3) {
      return null;
    }
    return index.queryTileBounds(cx, cz, size, target);
  };
}
