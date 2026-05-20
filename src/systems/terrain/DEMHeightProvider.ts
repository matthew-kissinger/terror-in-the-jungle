import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';

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
 */

/**
 * Distance (in world meters) over which the outside-DEM heightmap ramps
 * from the boundary sample to {@link DEM_EDGE_BASELINE_M}. Sized to
 * cover A Shau's visible margin (cameraFar ~4000 m); samples past this
 * radius saturate at the baseline.
 */
export const DEM_EDGE_TAPER_RADIUS_M = 1500;

/**
 * Floor elevation the outside-DEM taper ramps toward. Default 0 m sea
 * level — visually clean for A Shau (long downhill into distance) and
 * the player can't navigate there, so no gameplay impact.
 */
export const DEM_EDGE_BASELINE_M = 0;
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
   * Static bilinear sampling - used both by the class and by inline worker code.
   *
   * For samples inside the DEM box this returns the bilinear interpolation
   * of the four nearest pixels (byte-identical to the pre-2026-05-19 clamp
   * path). For samples outside the box the boundary value tapers smoothly
   * toward {@link DEM_EDGE_BASELINE_M} over {@link DEM_EDGE_TAPER_RADIUS_M}
   * using a smoothstep, providing C1-continuous heightmap behavior past
   * the DEM boundary instead of an extruded boundary value.
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
    // Map world coords to grid coords
    // World origin is at center of DEM grid
    const relX = worldX - originX + halfWidthMeters;
    const relZ = worldZ - originZ + halfHeightMeters;

    const gxf = relX / metersPerPixel;
    const gzf = relZ / metersPerPixel;

    // Clamp to grid bounds. The 1.001 epsilon keeps x1 = x0 + 1 a valid
    // sample for the bilinear taps; this is the existing in-DEM path.
    const gx = Math.max(0, Math.min(gridWidth - 1.001, gxf));
    const gz = Math.max(0, Math.min(gridHeight - 1.001, gzf));

    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, gridWidth - 1);
    const z1 = Math.min(z0 + 1, gridHeight - 1);

    const fx = gx - x0;
    const fz = gz - z0;

    // Row-major: index = z * width + x
    const h00 = data[z0 * gridWidth + x0];
    const h10 = data[z0 * gridWidth + x1];
    const h01 = data[z1 * gridWidth + x0];
    const h11 = data[z1 * gridWidth + x1];

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    const boundarySample = h0 * (1 - fz) + h1 * fz;

    // Outside-DEM taper. The DEM box covers world coords [-halfW, +halfW]
    // x [-halfH, +halfH], which maps to gxf in [0, gridWidth] and gzf in
    // [0, gridHeight] — note the box edge is at gridWidth, not gridWidth-1
    // (that bound only constrains the bilinear taps). The "outside
    // distance" is the world-meter separation between the query and the
    // DEM bounding box; it is exactly 0 for any sample inside the box,
    // so the in-DEM path returns boundarySample unmodified and remains
    // byte-identical to the pre-taper sampler.
    const outsideGx = gxf < 0 ? -gxf : gxf > gridWidth ? gxf - gridWidth : 0;
    const outsideGz = gzf < 0 ? -gzf : gzf > gridHeight ? gzf - gridHeight : 0;
    if (outsideGx === 0 && outsideGz === 0) {
      return boundarySample;
    }

    const outsideX = outsideGx * metersPerPixel;
    const outsideZ = outsideGz * metersPerPixel;
    const outsideDist = Math.hypot(outsideX, outsideZ);
    const t = outsideDist >= DEM_EDGE_TAPER_RADIUS_M
      ? 1
      : outsideDist / DEM_EDGE_TAPER_RADIUS_M;
    // smoothstep(0, 1, t) = t*t*(3 - 2t) — C1-continuous; derivative is 0
    // at both endpoints so the taper joins the boundary value without a
    // kink and saturates cleanly at the baseline past the radius.
    const s = t * t * (3 - 2 * t);
    return boundarySample + (DEM_EDGE_BASELINE_M - boundarySample) * s;
  }
}
