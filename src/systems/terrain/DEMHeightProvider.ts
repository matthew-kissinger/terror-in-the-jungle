import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';
import {
  DEM_EDGE_BASELINE_M,
  DEM_EDGE_TAPER_RADIUS_M,
  sampleDEMBilinearWithTaper,
} from './DEMSampling';

/**
 * Provides terrain height from a Digital Elevation Model (DEM) file.
 * Samples from a Float32Array grid using bilinear interpolation.
 *
 * World coordinate mapping:
 * - The DEM grid is centered at (originX, originZ) in world space.
 * - Each pixel covers metersPerPixel x metersPerPixel meters.
 * - Inside the DEM box, bilinear interpolation of the four nearest pixels.
 * - Outside the DEM box, the boundary value tapers smoothly toward
 *   DEM_EDGE_BASELINE_M over DEM_EDGE_TAPER_RADIUS_M, eliminating the
 *   vertical "fin" artifacts that the pre-2026-05-19 boundary clamp
 *   produced at the visible quadtree margin (closes Stage D3 of
 *   cycle-2026-05-09-cdlod-edge-morph).
 *
 * The bilinear + taper math lives in {@link ./DEMSampling.ts} so the
 * main-thread provider and the worker-thread bake path share one
 * canonical implementation (no main-vs-worker divergence in the
 * visual margin past the playable bounds).
 */

// Re-export the constants so existing call sites continue to import
// them from this module (back-compat with the v1 PR).
export { DEM_EDGE_BASELINE_M, DEM_EDGE_TAPER_RADIUS_M };

export class DEMHeightProvider implements IHeightProvider {
  private readonly data: Float32Array;
  private readonly width: number;
  private readonly height: number;
  private readonly metersPerPixel: number;
  private readonly originX: number;
  private readonly originZ: number;

  // Precomputed bounds for fast coordinate mapping
  private readonly halfWidthMeters: number;
  private readonly halfHeightMeters: number;

  constructor(
    data: Float32Array,
    width: number,
    height: number,
    metersPerPixel: number,
    originX: number = 0,
    originZ: number = 0
  ) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.metersPerPixel = metersPerPixel;
    this.originX = originX;
    this.originZ = originZ;
    this.halfWidthMeters = (width * metersPerPixel) / 2;
    this.halfHeightMeters = (height * metersPerPixel) / 2;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    return DEMHeightProvider.sampleBilinear(
      this.data, this.width, this.height,
      this.metersPerPixel, this.originX, this.originZ,
      this.halfWidthMeters, this.halfHeightMeters,
      worldX, worldZ
    );
  }

  getWorkerConfig(): HeightProviderConfig {
    return {
      type: 'dem',
      width: this.width,
      height: this.height,
      metersPerPixel: this.metersPerPixel,
      originX: this.originX,
      originZ: this.originZ,
      buffer: (this.data.buffer as ArrayBuffer).slice(0)
    };
  }

  /**
   * Bulk query for a full chunk - faster than per-vertex calls since
   * it avoids repeated function call overhead and bounds computation.
   */
  getHeightData(
    chunkX: number,
    chunkZ: number,
    size: number,
    segments: number
  ): Float32Array {
    const dataSize = (segments + 1) * (segments + 1);
    const heightData = new Float32Array(dataSize);
    const worldOffsetX = chunkX * size;
    const worldOffsetZ = chunkZ * size;

    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const worldX = worldOffsetX + (x / segments) * size;
        const worldZ = worldOffsetZ + (z / segments) * size;
        heightData[z * (segments + 1) + x] = this.getHeightAt(worldX, worldZ);
      }
    }

    return heightData;
  }

  /**
   * Static bilinear sampling — delegates to the canonical implementation
   * in {@link ./DEMSampling.ts}. Kept as a static method for back-compat
   * with existing call sites that reach for `DEMHeightProvider.sampleBilinear`
   * directly. The worker-side `sampleDEM` calls the same shared helper, so
   * heights past the DEM boundary stay in lockstep between threads.
   */
  static sampleBilinear(
    data: Float32Array,
    gridWidth: number,
    gridHeight: number,
    metersPerPixel: number,
    originX: number,
    originZ: number,
    halfWidthMeters: number,
    halfHeightMeters: number,
    worldX: number,
    worldZ: number
  ): number {
    return sampleDEMBilinearWithTaper(
      data, gridWidth, gridHeight,
      metersPerPixel, originX, originZ,
      halfWidthMeters, halfHeightMeters,
      worldX, worldZ
    );
  }
}
