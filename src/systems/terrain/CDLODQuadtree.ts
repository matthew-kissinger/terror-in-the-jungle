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

const MAX_TILES = 2048;

export class CDLODQuadtree {
  private readonly worldSize: number;
  private readonly maxLOD: number;
  private readonly lodRanges: readonly number[];
  private readonly morphStart: number; // fraction of range where morph begins (e.g. 0.8)

  // Pre-allocated output buffer
  private readonly tileBuffer: CDLODTile[] = [];
  private tileCount = 0;

  // Reused index map for the neighbor-resolution pass. Cleared and refilled
  // each frame; integer-cell key (see tileKey()) -> tile index in tileBuffer.
  private readonly tileIndex: Map<string, number> = new Map();

  constructor(worldSize: number, maxLOD: number, lodRanges: readonly number[], morphStart = 0.8) {
    this.worldSize = worldSize;
    this.maxLOD = maxLOD;
    this.lodRanges = lodRanges;
    this.morphStart = morphStart;

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

    const rootSize = this.worldSize;
    const halfWorld = rootSize / 2;

    // Start recursion at the 4 quadrants of the root
    const quadSize = rootSize / 2;
    const offsets = [
      [-halfWorld + quadSize / 2, -halfWorld + quadSize / 2],
      [quadSize / 2, -halfWorld + quadSize / 2],
      [-halfWorld + quadSize / 2, quadSize / 2],
      [quadSize / 2, quadSize / 2],
    ];

    for (const [ox, oz] of offsets) {
      this.selectNode(
        ox, oz, quadSize,
        this.maxLOD - 1,
        cameraX, cameraY, cameraZ,
        frustumPlanes,
      );
    }

    this.resolveEdgeMorphMasks();

    return this.tileBuffer.slice(0, this.tileCount);
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
      const probes: ReadonlyArray<readonly [number, number, number]> = [
        [t.x, t.z + half + 1e-3, 1],
        [t.x + half + 1e-3, t.z, 2],
        [t.x, t.z - half - 1e-3, 4],
        [t.x - half - 1e-3, t.z, 8],
      ];

      for (const [px, pz, bit] of probes) {
        // Probe outside the world bounds means the world edge - leave bit 0.
        if (px < -halfWorld || px > halfWorld || pz < -halfWorld || pz > halfWorld) continue;

        for (let s = t.size * 2; s <= this.worldSize; s *= 2) {
          // Snap probe point to the centred grid at scale `s`. Tiles of
          // size `s` have centres at `floor((p + halfWorld) / s) * s + s/2 - halfWorld`.
          const cx = Math.floor((px + halfWorld) / s) * s + s / 2 - halfWorld;
          const cz = Math.floor((pz + halfWorld) / s) * s + s / 2 - halfWorld;
          if (this.tileIndex.has(this.tileKey(cx, cz, s))) {
            t.edgeMorphMask |= bit;
            break;
          }
        }
      }
    }
  }

  // Integer-cell keys are ulp-stable across the recursion path (binary
  // subdivision: tile centres land exactly on `(integer + 0.5) * size`)
  // and the probe path (`Math.floor((p + halfWorld) / s) * s + s/2 - halfWorld`),
  // so non-dyadic worldSize (e.g. A Shau 21000m, baseTileSize ≈ 82.03m)
  // can't drop Map hits via float-formatting drift in template literals.
  private tileKey(cx: number, cz: number, size: number): string {
    const halfWorld = this.worldSize / 2;
    const ix = Math.floor((cx + halfWorld) / size);
    const iz = Math.floor((cz + halfWorld) / size);
    const li = Math.round(Math.log2(this.worldSize / size));
    return `${ix}|${iz}|${li}`;
  }

  /**
   * Get the number of tiles selected in the last call.
   */
  getSelectedTileCount(): number {
    return this.tileCount;
  }

  private selectNode(
    cx: number, cz: number, size: number,
    lodLevel: number,
    camX: number, camY: number, camZ: number,
    frustum: readonly FrustumPlane[] | null,
  ): void {
    if (this.tileCount >= MAX_TILES) return;

    // Frustum cull
    if (frustum && !this.intersectsFrustum(cx, cz, size, frustum)) {
      return;
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
    if (this.tileCount >= MAX_TILES) return;
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
   * and a generous Y range of [-500, 2000] to cover all terrain heights.
   */
  private intersectsFrustum(
    cx: number, cz: number, size: number,
    planes: readonly FrustumPlane[],
  ): boolean {
    const halfSize = size / 2;
    const minX = cx - halfSize, maxX = cx + halfSize;
    const minY = -500, maxY = 2000;
    const minZ = cz - halfSize, maxZ = cz + halfSize;

    for (const plane of planes) {
      // Find the vertex most in the direction of the plane normal (p-vertex)
      const px = plane.nx >= 0 ? maxX : minX;
      const py = plane.ny >= 0 ? maxY : minY;
      const pz = plane.nz >= 0 ? maxZ : minZ;

      if (plane.nx * px + plane.ny * py + plane.nz * pz + plane.d < 0) {
        return false; // Entirely outside this plane
      }
    }

    return true;
  }
}
