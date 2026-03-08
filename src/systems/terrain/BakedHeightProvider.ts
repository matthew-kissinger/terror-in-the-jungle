import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';

/**
 * Height provider that samples from a pre-baked heightmap grid using triangle
 * interpolation on the LOD 0 mesh grid. This matches the GPU rasterizer's
 * barycentric interpolation within each triangle, eliminating the render/collision
 * divergence that bilinear interpolation produces on curved terrain.
 *
 * The mesh grid may differ from the heightmap grid (e.g. A Shau: 512 heightmap
 * texels, 8192 mesh quads). Mesh vertex heights are bilinear-sampled from the
 * heightmap, then triangle interpolation is applied within each mesh quad - the
 * same two-step process the GPU vertex shader + rasterizer performs.
 *
 * Created automatically after HeightmapGPU bakes from any source provider
 * (noise or DEM). Workers continue using the original provider config since
 * they don't need pixel-perfect GPU alignment.
 */
export class BakedHeightProvider implements IHeightProvider {
  private readonly data: Float32Array;
  private readonly gridSize: number;
  private readonly worldSize: number;
  private readonly halfWorld: number;
  private readonly gridMax: number;
  private readonly meshQuadsPerEdge: number;
  private readonly workerConfig: HeightProviderConfig;

  constructor(
    data: Float32Array,
    gridSize: number,
    worldSize: number,
    workerConfig: HeightProviderConfig,
    meshQuadsPerEdge?: number,
  ) {
    this.data = data;
    this.gridSize = gridSize;
    this.worldSize = worldSize;
    this.halfWorld = worldSize / 2;
    this.gridMax = gridSize - 1;
    this.meshQuadsPerEdge = meshQuadsPerEdge ?? this.gridMax;
    this.workerConfig = workerConfig;
  }

  /**
   * Bilinear-sample the heightmap at a mesh vertex position.
   * Converts mesh grid index to heightmap grid coordinate, then interpolates.
   * When meshQuadsPerEdge == gridMax, mesh indices land on texel centers and
   * this degenerates to a direct array lookup.
   */
  private sampleHeightmapBilinear(meshI: number, meshJ: number): number {
    // Map mesh grid index to heightmap grid coordinate
    const gx = (meshI / this.meshQuadsPerEdge) * this.gridMax;
    const gz = (meshJ / this.meshQuadsPerEdge) * this.gridMax;

    const cx = Math.max(0, Math.min(this.gridMax - 1, Math.floor(gx)));
    const cz = Math.max(0, Math.min(this.gridMax - 1, Math.floor(gz)));

    const fx = gx - cx;
    const fz = gz - cz;

    const gs = this.gridSize;
    const h00 = this.data[cz * gs + cx];
    const h10 = this.data[cz * gs + cx + 1];
    const h01 = this.data[(cz + 1) * gs + cx];
    const h11 = this.data[(cz + 1) * gs + cx + 1];

    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    // Map world coords to mesh grid coords [0, meshQuadsPerEdge].
    const mx = ((worldX + this.halfWorld) / this.worldSize) * this.meshQuadsPerEdge;
    const mz = ((worldZ + this.halfWorld) / this.worldSize) * this.meshQuadsPerEdge;

    // Find mesh quad and fractional position within it.
    // Clamp to valid range (mirrors GPU ClampToEdgeWrapping).
    const cx = Math.max(0, Math.min(this.meshQuadsPerEdge - 1, Math.floor(mx)));
    const cz = Math.max(0, Math.min(this.meshQuadsPerEdge - 1, Math.floor(mz)));

    const fx = Math.max(0, Math.min(1, mx - cx));
    const fz = Math.max(0, Math.min(1, mz - cz));

    // Sample heightmap bilinearly at the 4 mesh vertex positions.
    const h00 = this.sampleHeightmapBilinear(cx, cz);
    const h10 = this.sampleHeightmapBilinear(cx + 1, cz);
    const h01 = this.sampleHeightmapBilinear(cx, cz + 1);
    const h11 = this.sampleHeightmapBilinear(cx + 1, cz + 1);

    // Triangle interpolation using "/" diagonal (PlaneGeometry topology).
    // NW triangle: fx + fz <= 1, SE triangle: fx + fz > 1.
    if (fx + fz <= 1) {
      return h00 * (1 - fx - fz) + h10 * fx + h01 * fz;
    }
    return h10 * (1 - fz) + h01 * (1 - fx) + h11 * (fx + fz - 1);
  }

  getWorkerConfig(): HeightProviderConfig {
    return this.workerConfig;
  }
}
