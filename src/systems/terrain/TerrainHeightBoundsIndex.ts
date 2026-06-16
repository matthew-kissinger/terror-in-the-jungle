// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TerrainTileHeightBounds } from './CDLODQuadtree';

interface HeightBoundsLevel {
  width: number;
  height: number;
  min: Float32Array;
  max: Float32Array;
}

interface CachedHeightBounds {
  minY: number;
  maxY: number;
}

export interface TerrainHeightBoundsIndexInfo {
  gridSize: number;
  worldSize: number;
  levels: number;
  sampleSpacingMeters: number;
}

const GRID_EPSILON = 1e-6;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/**
 * Conservative min/max hierarchy for the baked terrain height texture.
 *
 * CDLOD frustum culling needs vertical tile bounds, but sampling a few terrain
 * points misses A Shau ridges and can reject tiles that are actually visible.
 * This index builds a min/max mip pyramid over the exact baked height grid the
 * vertex shader samples, then answers rectangular world-space queries by
 * covering every texel corner whose bilinear cell can contribute to the tile.
 */
export class TerrainHeightBoundsIndex {
  private readonly levels: HeightBoundsLevel[] = [];
  private readonly gridSize: number;
  private readonly worldSize: number;
  private readonly halfWorld: number;
  private readonly gridMax: number;
  private readonly sampleSpacingMeters: number;
  private queryMinY = 0;
  private queryMaxY = 0;
  private queryMatched = false;
  private readonly queryCache = new Map<string, CachedHeightBounds>();

  constructor(data: Float32Array, gridSize: number, worldSize: number) {
    if (!Number.isInteger(gridSize) || gridSize < 2) {
      throw new Error(`TerrainHeightBoundsIndex requires gridSize >= 2; got ${gridSize}`);
    }
    if (!Number.isFinite(worldSize) || worldSize <= 0) {
      throw new Error(`TerrainHeightBoundsIndex requires positive worldSize; got ${worldSize}`);
    }
    if (data.length < gridSize * gridSize) {
      throw new Error(`TerrainHeightBoundsIndex data length ${data.length} is smaller than ${gridSize}x${gridSize}`);
    }

    this.gridSize = gridSize;
    this.worldSize = worldSize;
    this.halfWorld = worldSize * 0.5;
    this.gridMax = gridSize - 1;
    this.sampleSpacingMeters = worldSize / this.gridMax;
    this.buildLevels(data);
  }

  getInfo(): TerrainHeightBoundsIndexInfo {
    return {
      gridSize: this.gridSize,
      worldSize: this.worldSize,
      levels: this.levels.length,
      sampleSpacingMeters: this.sampleSpacingMeters,
    };
  }

  queryTileBounds(
    cx: number,
    cz: number,
    size: number,
    target: TerrainTileHeightBounds,
    padMeters = 0,
  ): TerrainTileHeightBounds | null {
    if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(size) || size <= 0) {
      return null;
    }
    const half = size * 0.5;
    return this.queryWorldBounds(
      cx - half,
      cz - half,
      cx + half,
      cz + half,
      target,
      padMeters,
    );
  }

  queryWorldBounds(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    target: TerrainTileHeightBounds,
    padMeters = 0,
  ): TerrainTileHeightBounds | null {
    if (
      !Number.isFinite(minX)
      || !Number.isFinite(minZ)
      || !Number.isFinite(maxX)
      || !Number.isFinite(maxZ)
    ) {
      return null;
    }

    const x0World = Math.min(minX, maxX);
    const x1World = Math.max(minX, maxX);
    const z0World = Math.min(minZ, maxZ);
    const z1World = Math.max(minZ, maxZ);
    const x0 = this.worldToInclusiveLowIndex(x0World);
    const x1 = this.worldToInclusiveHighIndex(x1World);
    const z0 = this.worldToInclusiveLowIndex(z0World);
    const z1 = this.worldToInclusiveHighIndex(z1World);
    if (x1 < x0 || z1 < z0) return null;

    const pad = Number.isFinite(padMeters) && padMeters > 0 ? padMeters : 0;
    const cacheKey = `${x0}:${x1}:${z0}:${z1}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      target.minY = cached.minY - pad;
      target.maxY = cached.maxY + pad;
      return target;
    }

    this.queryMinY = Number.POSITIVE_INFINITY;
    this.queryMaxY = Number.NEGATIVE_INFINITY;
    this.queryMatched = false;
    this.visitNode(this.levels.length - 1, 0, 0, x0, x1, z0, z1);
    if (!this.queryMatched) return null;

    this.queryCache.set(cacheKey, { minY: this.queryMinY, maxY: this.queryMaxY });
    target.minY = this.queryMinY - pad;
    target.maxY = this.queryMaxY + pad;
    return target;
  }

  private buildLevels(data: Float32Array): void {
    let width = this.gridSize;
    let height = this.gridSize;
    const min = new Float32Array(data.subarray(0, width * height));
    const max = min;
    this.levels.push({ width, height, min, max });

    while (width > 1 || height > 1) {
      const prev = this.levels[this.levels.length - 1];
      const nextWidth = Math.ceil(width / 2);
      const nextHeight = Math.ceil(height / 2);
      const nextMin = new Float32Array(nextWidth * nextHeight);
      const nextMax = new Float32Array(nextWidth * nextHeight);

      for (let z = 0; z < nextHeight; z++) {
        for (let x = 0; x < nextWidth; x++) {
          let minY = Number.POSITIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (let dz = 0; dz < 2; dz++) {
            const childZ = z * 2 + dz;
            if (childZ >= prev.height) continue;
            for (let dx = 0; dx < 2; dx++) {
              const childX = x * 2 + dx;
              if (childX >= prev.width) continue;
              const childIndex = childZ * prev.width + childX;
              minY = Math.min(minY, prev.min[childIndex]);
              maxY = Math.max(maxY, prev.max[childIndex]);
            }
          }
          const index = z * nextWidth + x;
          nextMin[index] = minY;
          nextMax[index] = maxY;
        }
      }

      this.levels.push({ width: nextWidth, height: nextHeight, min: nextMin, max: nextMax });
      width = nextWidth;
      height = nextHeight;
    }
  }

  private worldToGrid(world: number): number {
    return ((world + this.halfWorld) / this.worldSize) * this.gridMax;
  }

  private worldToInclusiveLowIndex(world: number): number {
    return clampInt(Math.floor(this.worldToGrid(world) - GRID_EPSILON), 0, this.gridMax);
  }

  private worldToInclusiveHighIndex(world: number): number {
    return clampInt(Math.ceil(this.worldToGrid(world) + GRID_EPSILON), 0, this.gridMax);
  }

  private visitNode(
    levelIndex: number,
    nodeX: number,
    nodeZ: number,
    queryX0: number,
    queryX1: number,
    queryZ0: number,
    queryZ1: number,
  ): void {
    const level = this.levels[levelIndex];
    if (!level || nodeX < 0 || nodeZ < 0 || nodeX >= level.width || nodeZ >= level.height) {
      return;
    }

    const span = 2 ** levelIndex;
    const nodeX0 = nodeX * span;
    const nodeZ0 = nodeZ * span;
    const nodeX1 = Math.min((nodeX + 1) * span - 1, this.gridMax);
    const nodeZ1 = Math.min((nodeZ + 1) * span - 1, this.gridMax);
    if (nodeX1 < queryX0 || nodeX0 > queryX1 || nodeZ1 < queryZ0 || nodeZ0 > queryZ1) {
      return;
    }

    const index = nodeZ * level.width + nodeX;
    if (queryX0 <= nodeX0 && nodeX1 <= queryX1 && queryZ0 <= nodeZ0 && nodeZ1 <= queryZ1) {
      this.queryMatched = true;
      this.queryMinY = Math.min(this.queryMinY, level.min[index]);
      this.queryMaxY = Math.max(this.queryMaxY, level.max[index]);
      return;
    }

    if (levelIndex === 0) {
      this.queryMatched = true;
      this.queryMinY = Math.min(this.queryMinY, level.min[index]);
      this.queryMaxY = Math.max(this.queryMaxY, level.max[index]);
      return;
    }

    const childLevelIndex = levelIndex - 1;
    const childLevel = this.levels[childLevelIndex];
    const childX0 = nodeX * 2;
    const childZ0 = nodeZ * 2;
    for (let dz = 0; dz < 2; dz++) {
      const childZ = childZ0 + dz;
      if (childZ >= childLevel.height) continue;
      for (let dx = 0; dx < 2; dx++) {
        const childX = childX0 + dx;
        if (childX >= childLevel.width) continue;
        this.visitNode(childLevelIndex, childX, childZ, queryX0, queryX1, queryZ0, queryZ1);
      }
    }
  }
}
