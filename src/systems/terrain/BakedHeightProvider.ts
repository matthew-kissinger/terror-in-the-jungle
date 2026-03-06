import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';

/**
 * Height provider that samples from a pre-baked heightmap grid using bilinear
 * interpolation. This produces the same values the GPU vertex shader gets from
 * texture2D(heightmap, uv) with LinearFilter, so CPU collision / vegetation /
 * raycast heights match the rendered surface exactly.
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
    // Matches the bake loop: worldX = -halfWorld + x * step, step = worldSize / (gridSize - 1).
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
