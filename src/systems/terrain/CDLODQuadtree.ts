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

  constructor(worldSize: number, maxLOD: number, lodRanges: readonly number[], morphStart = 0.8) {
    this.worldSize = worldSize;
    this.maxLOD = maxLOD;
    this.lodRanges = lodRanges;
    this.morphStart = morphStart;

    // Pre-allocate tile objects
    for (let i = 0; i < MAX_TILES; i++) {
      this.tileBuffer.push({ x: 0, z: 0, size: 0, lodLevel: 0, morphFactor: 0 });
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

    return this.tileBuffer.slice(0, this.tileCount);
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

    // Distance from camera to node center (XZ plane)
    const dx = camX - cx;
    const dz = camZ - cz;
    const dist = Math.sqrt(dx * dx + camY * camY + dz * dz);

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
