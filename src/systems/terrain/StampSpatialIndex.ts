// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { ResolvedTerrainStampConfig } from './TerrainFeatureTypes';

/**
 * Uniform-grid spatial index over terrain stamps.
 *
 * A stamp's influence is hard-bounded by its gradeRadius
 * (`applyResolvedStamp` returns the base height unchanged at
 * distance >= gradeRadius), so for any sample point only the stamps whose
 * influence AABB covers that point can change the result. A Shau carries
 * ~1,364 stamps; the brute-force per-sample loop made every height sample
 * cost ~50µs, which turned the 1024² gameplay-grid bake into a ~47s
 * main-thread freeze at mode load (measured 2026-06-10). With this index a
 * sample visits only the handful of locally-overlapping stamps.
 *
 * Buckets preserve the input stamp order, and skipping a non-overlapping
 * stamp is an exact identity (it would have returned the height unchanged),
 * so applying a bucket in order is bit-identical to the brute-force loop.
 */
export class StampSpatialIndex {
  private readonly minX: number = 0;
  private readonly minZ: number = 0;
  private readonly maxX: number = 0;
  private readonly maxZ: number = 0;
  private readonly cellSize: number = 1;
  private readonly cols: number = 0;
  private readonly rows: number = 0;
  private readonly buckets: (ResolvedTerrainStampConfig[] | undefined)[] = [];

  private static readonly EMPTY: readonly ResolvedTerrainStampConfig[] = Object.freeze([]);

  /** Grid resolution cap per axis — bounds bucket-array memory on huge maps. */
  private static readonly MAX_CELLS_PER_AXIS = 192;
  /** Floor on cell size so small maps don't degenerate into per-meter cells. */
  private static readonly MIN_CELL_SIZE = 64;

  constructor(stamps: readonly ResolvedTerrainStampConfig[]) {
    if (stamps.length === 0) return;

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    const bounds = new Float64Array(stamps.length * 4);
    for (let i = 0; i < stamps.length; i++) {
      const [sMinX, sMinZ, sMaxX, sMaxZ] = stampBounds(stamps[i]);
      bounds[i * 4] = sMinX;
      bounds[i * 4 + 1] = sMinZ;
      bounds[i * 4 + 2] = sMaxX;
      bounds[i * 4 + 3] = sMaxZ;
      if (sMinX < minX) minX = sMinX;
      if (sMinZ < minZ) minZ = sMinZ;
      if (sMaxX > maxX) maxX = sMaxX;
      if (sMaxZ > maxZ) maxZ = sMaxZ;
    }

    this.minX = minX;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxZ = maxZ;
    const extent = Math.max(maxX - minX, maxZ - minZ, 1);
    this.cellSize = Math.max(
      StampSpatialIndex.MIN_CELL_SIZE,
      extent / StampSpatialIndex.MAX_CELLS_PER_AXIS,
    );
    this.cols = Math.max(1, Math.ceil((maxX - minX) / this.cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / this.cellSize));
    this.buckets = new Array<ResolvedTerrainStampConfig[] | undefined>(this.cols * this.rows);

    for (let i = 0; i < stamps.length; i++) {
      const c0 = this.colFor(bounds[i * 4]);
      const r0 = this.rowFor(bounds[i * 4 + 1]);
      const c1 = this.colFor(bounds[i * 4 + 2]);
      const r1 = this.rowFor(bounds[i * 4 + 3]);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * this.cols + c;
          (this.buckets[key] ??= []).push(stamps[i]);
        }
      }
    }
  }

  /**
   * Stamps whose influence AABB covers the given point, in original
   * (priority-sorted) order. Returns a shared empty array for points
   * outside every stamp's reach.
   */
  stampsNear(worldX: number, worldZ: number): readonly ResolvedTerrainStampConfig[] {
    if (
      this.buckets.length === 0 ||
      worldX < this.minX || worldX > this.maxX ||
      worldZ < this.minZ || worldZ > this.maxZ
    ) {
      return StampSpatialIndex.EMPTY;
    }
    return this.buckets[this.rowFor(worldZ) * this.cols + this.colFor(worldX)]
      ?? StampSpatialIndex.EMPTY;
  }

  private colFor(worldX: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((worldX - this.minX) / this.cellSize)));
  }

  private rowFor(worldZ: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((worldZ - this.minZ) / this.cellSize)));
  }
}

function stampBounds(stamp: ResolvedTerrainStampConfig): [number, number, number, number] {
  const reach = Math.max(stamp.gradeRadius, stamp.outerRadius, stamp.innerRadius, 0);
  if (stamp.kind === 'flatten_circle') {
    return [
      stamp.centerX - reach,
      stamp.centerZ - reach,
      stamp.centerX + reach,
      stamp.centerZ + reach,
    ];
  }
  return [
    Math.min(stamp.startX, stamp.endX) - reach,
    Math.min(stamp.startZ, stamp.endZ) - reach,
    Math.max(stamp.startX, stamp.endX) + reach,
    Math.max(stamp.startZ, stamp.endZ) + reach,
  ];
}

const indexCache = new WeakMap<object, StampSpatialIndex>();

/**
 * Cached index lookup keyed on the stamps array identity. The main-thread
 * StampedHeightProvider and the terrain worker both hold a stable stamps
 * array per provider config, so each builds its index exactly once.
 */
export function getStampSpatialIndex(
  stamps: readonly ResolvedTerrainStampConfig[],
): StampSpatialIndex {
  let index = indexCache.get(stamps);
  if (!index) {
    index = new StampSpatialIndex(stamps);
    indexCache.set(stamps, index);
  }
  return index;
}
