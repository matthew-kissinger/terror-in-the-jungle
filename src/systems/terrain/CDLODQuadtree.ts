// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * CDLOD (Continuous Distance-Dependent Level of Detail) quadtree.
 *
 * CPU-side tile selection that determines which tiles render at which LOD level.
 * Runs every frame (< 0.3ms). Zero per-frame allocation via pre-allocated tile array.
 *
 * Algorithm:
 * 1. Root = world bounds at highest LOD
 * 2. Frustum cull each node
 * 3. Range test: skip if node center outside lodRanges[lodLevel] from camera
 * 4. If at LOD 0 or camera is outside finer range: emit this tile
 * 5. Else: recurse 4 children at lodLevel - 1
 */

export interface CDLODTile {
  x: number;       // World-space center X
  z: number;       // World-space center Z
  size: number;    // Tile extent (half-width = size/2)
  lodLevel: number;
  /** Morph factor [0,1] for smooth transition to parent LOD */
  morphFactor: number;
  /**
   * Bitmask flagging which of this tile's four edges abut a coarser-LOD
   * (larger `size`) neighbour. The vertex shader force-morphs vertices on
   * those edges so they land exactly on the coarser neighbour's vertex
   * grid, closing T-junction cracks at LOD transitions.
   *
   * Bit layout: 1 = +Z (north), 2 = +X (east), 4 = -Z (south), 8 = -X (west).
   */
  edgeMorphMask: number;
}

export interface FrustumPlane {
  nx: number; ny: number; nz: number; d: number;
}

export interface TerrainTileHeightBounds {
  minY: number;
  maxY: number;
}

export type TerrainTileHeightBoundsProvider = (
  cx: number,
  cz: number,
  size: number,
  target: TerrainTileHeightBounds,
) => TerrainTileHeightBounds | null | undefined;

export interface CDLODSelectionStats {
  selectedTiles: number;
  nodesVisited: number;
  frustumTests: number;
  frustumRejectedNodes: number;
  heightBoundsEnabled: boolean;
  heightBoundsTests: number;
  heightBoundsFallbacks: number;
  heightBoundsRejectedNodes: number;
  saturated: boolean;
}

const MAX_TILES = 2048;
const EDGE_PROBE_EPSILON = 1e-3;
const DEFAULT_MIN_Y = -500;
const DEFAULT_MAX_Y = 2000;
// computeMaxLODLevels currently caps CDLOD depth at 8. Keep a wider stride so
// numeric grid keys stay collision-free if that cap moves modestly.
const TILE_KEY_STRIDE = 2048;
const TILE_KEY_LEVEL_STRIDE = TILE_KEY_STRIDE * TILE_KEY_STRIDE;

export class CDLODQuadtree {
  private readonly worldSize: number;
  private readonly maxLOD: number;
  private readonly lodRanges: readonly number[];
  private readonly morphStart: number; // fraction of range where morph begins (e.g. 0.8)
  private readonly heightBoundsForTile?: TerrainTileHeightBoundsProvider;
  private readonly selectionStatsEnabled: boolean;

  // Pre-allocated output buffer
  private readonly tileBuffer: CDLODTile[] = [];
  private readonly selectedTiles: CDLODTile[] = [];
  private tileCount = 0;

  // Reused index map for the neighbor-resolution pass. Cleared and refilled
  // each frame; integer-cell key (see tileKey()) -> tile index in tileBuffer.
  private readonly tileIndex: Map<number, number> = new Map();
  private selectionSaturated = false;
  private readonly heightBoundsScratch: TerrainTileHeightBounds = { minY: DEFAULT_MIN_Y, maxY: DEFAULT_MAX_Y };
  private readonly selectionStats: CDLODSelectionStats = {
    selectedTiles: 0,
    nodesVisited: 0,
    frustumTests: 0,
    frustumRejectedNodes: 0,
    heightBoundsEnabled: false,
    heightBoundsTests: 0,
    heightBoundsFallbacks: 0,
    heightBoundsRejectedNodes: 0,
    saturated: false,
  };

  constructor(
    worldSize: number,
    maxLOD: number,
    lodRanges: readonly number[],
    morphStart = 0.8,
    heightBoundsForTile?: TerrainTileHeightBoundsProvider,
  ) {
    this.worldSize = worldSize;
    this.maxLOD = maxLOD;
    this.lodRanges = lodRanges;
    this.morphStart = morphStart;
    this.heightBoundsForTile = heightBoundsForTile;
    this.selectionStatsEnabled = Boolean(heightBoundsForTile);

    // Pre-allocate tile objects
    for (let i = 0; i < MAX_TILES; i++) {
      this.tileBuffer.push({ x: 0, z: 0, size: 0, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 });
    }
  }

  /**
   * Select visible tiles for this frame.
   * Returns a view into the internal buffer (valid until next call).
   */
  selectTiles(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    frustumPlanes: readonly FrustumPlane[] | null,
  ): readonly CDLODTile[] {
    this.tileCount = 0;
    this.selectionSaturated = false;
    if (this.selectionStatsEnabled) this.resetSelectionStats();

    const rootSize = this.worldSize;
    const halfWorld = rootSize / 2;

    // Start recursion at the 4 quadrants of the root
    const quadSize = rootSize / 2;
    const low = -halfWorld + quadSize / 2;
    const high = quadSize / 2;
    const rootLOD = this.maxLOD - 1;

    this.selectNode(low, low, quadSize, rootLOD, cameraX, cameraY, cameraZ, frustumPlanes);
    this.selectNode(high, low, quadSize, rootLOD, cameraX, cameraY, cameraZ, frustumPlanes);
    this.selectNode(low, high, quadSize, rootLOD, cameraX, cameraY, cameraZ, frustumPlanes);
    this.selectNode(high, high, quadSize, rootLOD, cameraX, cameraY, cameraZ, frustumPlanes);

    this.resolveEdgeMorphMasks();

    this.selectedTiles.length = this.tileCount;
    for (let i = 0; i < this.tileCount; i++) {
      this.selectedTiles[i] = this.tileBuffer[i];
    }
    if (this.selectionStatsEnabled) {
      this.selectionStats.selectedTiles = this.tileCount;
      this.selectionStats.saturated = this.selectionSaturated;
    }
    return this.selectedTiles;
  }

  /**
   * Post-recursion neighbour pass: for every emitted tile, set bits in
   * `edgeMorphMask` for each of its four edges that abut a coarser-LOD
   * (larger `size`) tile. Tiles meet edge-to-edge by construction, so
   * walking up the size ladder from `tile.size * 2` to the world size
   * and snapping to that level's grid will hit the unique containing
   * tile if one was emitted at that scale.
   *
   * Costs O(tiles * 4 * maxLOD) Map lookups; typical tile count is < 256
   * and lookup is O(1), well under the 0.05 ms additional budget called
   * out in the brief.
   */
  private resolveEdgeMorphMasks(): void {
    this.tileIndex.clear();
    for (let i = 0; i < this.tileCount; i++) {
      const t = this.tileBuffer[i];
      this.tileIndex.set(this.tileKey(t.x, t.z, t.size), i);
    }

    const halfWorld = this.worldSize / 2;
    for (let i = 0; i < this.tileCount; i++) {
      const t = this.tileBuffer[i];
      const half = t.size / 2;

      // Probe points just outside each edge, then walk up the size
      // ladder snapping to that scale's centred grid.
      // Bit layout: 1=+Z (N), 2=+X (E), 4=-Z (S), 8=-X (W)
      this.applyEdgeMorphProbe(t, t.x, t.z + half + EDGE_PROBE_EPSILON, 1, halfWorld);
      this.applyEdgeMorphProbe(t, t.x + half + EDGE_PROBE_EPSILON, t.z, 2, halfWorld);
      this.applyEdgeMorphProbe(t, t.x, t.z - half - EDGE_PROBE_EPSILON, 4, halfWorld);
      this.applyEdgeMorphProbe(t, t.x - half - EDGE_PROBE_EPSILON, t.z, 8, halfWorld);
    }
  }

  private applyEdgeMorphProbe(
    tile: CDLODTile,
    px: number,
    pz: number,
    bit: number,
    halfWorld: number,
  ): void {
    // Probe outside the world bounds means the world edge - leave bit 0.
    if (px < -halfWorld || px > halfWorld || pz < -halfWorld || pz > halfWorld) return;

    for (let s = tile.size * 2; s <= this.worldSize; s *= 2) {
      // Snap probe point to the centred grid at scale `s`. Tiles of
      // size `s` have centres at `floor((p + halfWorld) / s) * s + s/2 - halfWorld`.
      const cx = Math.floor((px + halfWorld) / s) * s + s / 2 - halfWorld;
      const cz = Math.floor((pz + halfWorld) / s) * s + s / 2 - halfWorld;
      if (this.tileIndex.has(this.tileKey(cx, cz, s))) {
        tile.edgeMorphMask |= bit;
        return;
      }
    }
  }

  // Callers must skip world-edge probes before building neighbor keys.
  // Integer-cell keys are ulp-stable across the recursion path (binary
  // subdivision: tile centres land exactly on `(integer + 0.5) * size`)
  // and the probe path (`Math.floor((p + halfWorld) / s) * s + s/2 - halfWorld`),
  // so non-dyadic worldSize (e.g. A Shau 21000m, baseTileSize ≈ 82.03m)
  // can't drop Map hits via float-formatting drift in template literals.
  private tileKey(cx: number, cz: number, size: number): number {
    const halfWorld = this.worldSize / 2;
    const ix = Math.floor((cx + halfWorld) / size);
    const iz = Math.floor((cz + halfWorld) / size);
    const li = Math.round(Math.log2(this.worldSize / size));
    return li * TILE_KEY_LEVEL_STRIDE + iz * TILE_KEY_STRIDE + ix;
  }

  /**
   * Get the number of tiles selected in the last call.
   */
  getSelectedTileCount(): number {
    return this.tileCount;
  }

  wasLastSelectionSaturated(): boolean {
    return this.selectionSaturated;
  }

  getLastSelectionStats(): CDLODSelectionStats {
    return { ...this.selectionStats };
  }

  private resetSelectionStats(): void {
    this.selectionStats.selectedTiles = 0;
    this.selectionStats.nodesVisited = 0;
    this.selectionStats.frustumTests = 0;
    this.selectionStats.frustumRejectedNodes = 0;
    this.selectionStats.heightBoundsEnabled = Boolean(this.heightBoundsForTile);
    this.selectionStats.heightBoundsTests = 0;
    this.selectionStats.heightBoundsFallbacks = 0;
    this.selectionStats.heightBoundsRejectedNodes = 0;
    this.selectionStats.saturated = false;
  }

  private selectNode(
    cx: number, cz: number, size: number,
    lodLevel: number,
    camX: number, camY: number, camZ: number,
    frustum: readonly FrustumPlane[] | null,
  ): void {
    if (this.selectionStatsEnabled) this.selectionStats.nodesVisited += 1;
    if (this.tileCount >= MAX_TILES) {
      this.selectionSaturated = true;
      return;
    }

    // Frustum cull
    if (frustum) {
      if (this.selectionStatsEnabled) this.selectionStats.frustumTests += 1;
      const result = this.intersectsFrustum(cx, cz, size, frustum);
      if (!result.intersects) {
        if (this.selectionStatsEnabled) this.selectionStats.frustumRejectedNodes += 1;
        if (result.usedHeightBounds) {
          this.selectionStats.heightBoundsRejectedNodes += 1;
        }
        return;
      }
    }

    // Distance from camera to *nearest point* of this tile's XZ AABB
    // (not the node center). Adjacent tiles meeting at a shared edge then
    // return identical XZ-distance contributions when the camera is outside
    // their shared edge, so their morph factors line up at that edge and
    // the shader cannot produce a sub-pixel height crack between them.
    // See docs/tasks/terrain-cdlod-seam.md (Stage D1).
    const halfSize = size / 2;
    const cdx = Math.max(Math.abs(camX - cx) - halfSize, 0);
    const cdz = Math.max(Math.abs(camZ - cz) - halfSize, 0);
    const dist = Math.sqrt(cdx * cdx + camY * camY + cdz * cdz);

    const range = this.lodRanges[lodLevel] ?? this.lodRanges[this.lodRanges.length - 1];

    // Check if we should subdivide (higher detail).
    // A node called by its parent MUST either emit itself or subdivide -
    // never return empty, as the parent already delegated this area to us.
    const shouldSubdivide = lodLevel > 0 && dist < range;

    if (shouldSubdivide) {
      const childSize = size / 2;
      const childLOD = lodLevel - 1;
      const q = childSize / 2;

      this.selectNode(cx - q, cz - q, childSize, childLOD, camX, camY, camZ, frustum);
      this.selectNode(cx + q, cz - q, childSize, childLOD, camX, camY, camZ, frustum);
      this.selectNode(cx - q, cz + q, childSize, childLOD, camX, camY, camZ, frustum);
      this.selectNode(cx + q, cz + q, childSize, childLOD, camX, camY, camZ, frustum);
    } else {
      // Emit this tile
      const morphFactor = this.computeMorphFactor(dist, lodLevel);
      this.emitTile(cx, cz, size, lodLevel, morphFactor);
    }
  }

  private computeMorphFactor(dist: number, lodLevel: number): number {
    const range = this.lodRanges[lodLevel] ?? this.lodRanges[this.lodRanges.length - 1];
    const morphBegin = range * this.morphStart;
    if (dist <= morphBegin) return 0;
    if (dist >= range) return 1;
    return (dist - morphBegin) / (range - morphBegin);
  }

  private emitTile(cx: number, cz: number, size: number, lodLevel: number, morphFactor: number): void {
    if (this.tileCount >= MAX_TILES) {
      this.selectionSaturated = true;
      return;
    }
    const tile = this.tileBuffer[this.tileCount];
    tile.x = cx;
    tile.z = cz;
    tile.size = size;
    tile.lodLevel = lodLevel;
    tile.morphFactor = morphFactor;
    tile.edgeMorphMask = 0;
    this.tileCount++;
  }

  /**
   * Axis-aligned box vs frustum planes test.
   * The box is centered at (cx, 0, cz) with XZ half-extent = size/2
   * and either the default generous Y range or opt-in terrain height bounds.
   */
  private intersectsFrustum(
    cx: number, cz: number, size: number,
    planes: readonly FrustumPlane[],
  ): { intersects: boolean; usedHeightBounds: boolean } {
    const halfSize = size / 2;
    const minX = cx - halfSize, maxX = cx + halfSize;
    const minZ = cz - halfSize, maxZ = cz + halfSize;
    const bounds = this.getVerticalBounds(cx, cz, size);
    const minY = bounds.minY, maxY = bounds.maxY;

    for (const plane of planes) {
      // Find the vertex most in the direction of the plane normal (p-vertex)
      const px = plane.nx >= 0 ? maxX : minX;
      const py = plane.ny >= 0 ? maxY : minY;
      const pz = plane.nz >= 0 ? maxZ : minZ;

      if (plane.nx * px + plane.ny * py + plane.nz * pz + plane.d < 0) {
        return { intersects: false, usedHeightBounds: bounds.usedHeightBounds }; // Entirely outside this plane
      }
    }

    return { intersects: true, usedHeightBounds: bounds.usedHeightBounds };
  }

  private getVerticalBounds(
    cx: number,
    cz: number,
    size: number,
  ): { minY: number; maxY: number; usedHeightBounds: boolean } {
    if (!this.heightBoundsForTile) {
      return { minY: DEFAULT_MIN_Y, maxY: DEFAULT_MAX_Y, usedHeightBounds: false };
    }

    const provided = this.heightBoundsForTile(cx, cz, size, this.heightBoundsScratch);
    if (
      !provided
      || !Number.isFinite(provided.minY)
      || !Number.isFinite(provided.maxY)
    ) {
      if (this.selectionStatsEnabled) this.selectionStats.heightBoundsFallbacks += 1;
      return { minY: DEFAULT_MIN_Y, maxY: DEFAULT_MAX_Y, usedHeightBounds: false };
    }

    if (this.selectionStatsEnabled) this.selectionStats.heightBoundsTests += 1;
    const minY = Math.min(provided.minY, provided.maxY);
    const maxY = Math.max(provided.minY, provided.maxY);
    return { minY, maxY, usedHeightBounds: true };
  }
}
