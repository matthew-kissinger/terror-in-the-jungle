import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';

/**
 * Height provider that bilinear-interpolates a pre-baked heightmap grid.
 *
 * This matches the GPU vertex shader's texture2D(heightmap, uv) with
 * LinearFilter exactly - both perform bilinear interpolation on the same
 * heightmap data at the same coordinates. The small residual divergence
 * between CPU and rendered surface comes from the GPU rasterizer's triangle
 * interpolation between mesh vertices, which is view-dependent (morph
 * factor) and bounded to ~0.3m at LOD 0 vertex spacing.
 *
 * This is the industry-standard approach: Unity, Unreal, Godot, and Flax
 * all use the raw heightmap (not the LOD mesh) as the collision/physics
 * source of truth.
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
  private readonly workerConfig: HeightProviderConfig;

  constructor(
    data: Float32Array,
    gridSize: number,
    worldSize: number,
    workerConfig: HeightProviderConfig,
  ) {
    this.data = data;
    this.gridSize = gridSize;
    this.worldSize = worldSize;
    this.halfWorld = worldSize / 2;
    this.gridMax = gridSize - 1;
    this.workerConfig = workerConfig;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    // Map world coords to continuous grid coords [0, gridSize-1].
    // Matches the GPU's texture2D sampling with half-texel UV correction:
    //   GPU: tc = normalizedPos * (gridSize - 1) + 0.5
    //   LinearFilter bilinear: floor(tc - 0.5) = floor(gx), fract(tc - 0.5) = fract(gx)
    const gx = ((worldX + this.halfWorld) / this.worldSize) * this.gridMax;
    const gz = ((worldZ + this.halfWorld) / this.worldSize) * this.gridMax;

    // Clamp to valid grid range (mirrors GPU ClampToEdgeWrapping).
    const cx = Math.max(0, Math.min(this.gridMax - 1, Math.floor(gx)));
    const cz = Math.max(0, Math.min(this.gridMax - 1, Math.floor(gz)));

    const fx = Math.max(0, Math.min(1, gx - cx));
    const fz = Math.max(0, Math.min(1, gz - cz));

    const gs = this.gridSize;
    const h00 = this.data[cz * gs + cx];
    const h10 = this.data[cz * gs + cx + 1];
    const h01 = this.data[(cz + 1) * gs + cx];
    const h11 = this.data[(cz + 1) * gs + cx + 1];

    // Bilinear blend (same as GPU LinearFilter on R32F texture).
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  }

  getWorkerConfig(): HeightProviderConfig {
    return this.workerConfig;
  }
}
