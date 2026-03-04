import * as THREE from 'three';
import type { IHeightProvider } from './IHeightProvider';

/**
 * Bakes IHeightProvider data into GPU textures (R32F heightmap + RGB8 normal map).
 * The vertex shader samples texture2D(heightmap, worldUV) so all LOD levels
 * share the same height data - eliminating cracks between LOD transitions.
 */
export class HeightmapGPU {
  private heightTexture: THREE.DataTexture | null = null;
  private normalTexture: THREE.DataTexture | null = null;

  private gridSize = 0;
  private worldSize = 0;

  /** Height data on CPU for queries (kept for BVH mesh generation). */
  private heightData: Float32Array | null = null;

  getHeightTexture(): THREE.DataTexture | null {
    return this.heightTexture;
  }

  getNormalTexture(): THREE.DataTexture | null {
    return this.normalTexture;
  }

  getGridSize(): number {
    return this.gridSize;
  }

  getWorldSize(): number {
    return this.worldSize;
  }

  getHeightData(): Float32Array | null {
    return this.heightData;
  }

  /**
   * Upload DEM Float32Array directly as a heightmap texture.
   */
  uploadDEM(data: Float32Array, width: number, height: number, worldSize: number): void {
    this.gridSize = width;
    this.worldSize = worldSize;
    this.heightData = new Float32Array(data);

    this.createHeightTexture(data, width, height);
    this.generateNormalMap(data, width, height, worldSize);
  }

  /**
   * Bake a noise-based height provider into a grid texture.
   */
  bakeFromProvider(provider: IHeightProvider, gridSize: number, worldSize: number): void {
    this.gridSize = gridSize;
    this.worldSize = worldSize;

    const data = new Float32Array(gridSize * gridSize);
    const halfWorld = worldSize / 2;
    const step = worldSize / (gridSize - 1);

    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const worldX = -halfWorld + x * step;
        const worldZ = -halfWorld + z * step;
        data[z * gridSize + x] = provider.getHeightAt(worldX, worldZ);
      }
    }

    this.heightData = data;
    this.createHeightTexture(data, gridSize, gridSize);
    this.generateNormalMap(data, gridSize, gridSize, worldSize);
  }

  /**
   * Sample height at world coordinates from CPU-side data.
   * Bilinear interpolation matching DEMHeightProvider.
   */
  sampleHeight(worldX: number, worldZ: number): number {
    if (!this.heightData || this.gridSize === 0) return 0;

    const halfWorld = this.worldSize / 2;
    // Map world coords to [0, gridSize-1]
    const gx = ((worldX + halfWorld) / this.worldSize) * (this.gridSize - 1);
    const gz = ((worldZ + halfWorld) / this.worldSize) * (this.gridSize - 1);

    const x0 = Math.max(0, Math.min(this.gridSize - 2, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(this.gridSize - 2, Math.floor(gz)));
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const fx = gx - x0;
    const fz = gz - z0;

    const h00 = this.heightData[z0 * this.gridSize + x0];
    const h10 = this.heightData[z0 * this.gridSize + x1];
    const h01 = this.heightData[z1 * this.gridSize + x0];
    const h11 = this.heightData[z1 * this.gridSize + x1];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  private createHeightTexture(data: Float32Array, width: number, height: number): void {
    if (this.heightTexture) {
      this.heightTexture.dispose();
    }

    this.heightTexture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;
  }

  private generateNormalMap(
    heightData: Float32Array, width: number, height: number, worldSize: number,
  ): void {
    if (this.normalTexture) {
      this.normalTexture.dispose();
    }

    const normalData = new Uint8Array(width * height * 4);
    const cellSize = worldSize / (width - 1);

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const idx = z * width + x;

        // 4-sample central difference
        const xp = Math.min(x + 1, width - 1);
        const xm = Math.max(x - 1, 0);
        const zp = Math.min(z + 1, height - 1);
        const zm = Math.max(z - 1, 0);

        const hL = heightData[z * width + xm];
        const hR = heightData[z * width + xp];
        const hD = heightData[zm * width + x];
        const hU = heightData[zp * width + x];

        const dx = (hR - hL) / (cellSize * (xp - xm));
        const dz = (hU - hD) / (cellSize * (zp - zm));

        // Normal = normalize(-dx, 1, -dz)
        const len = Math.sqrt(dx * dx + 1 + dz * dz);
        const nx = -dx / len;
        const ny = 1 / len;
        const nz = -dz / len;

        // Encode to [0,255]
        const outIdx = idx * 4;
        normalData[outIdx] = Math.round((nx * 0.5 + 0.5) * 255);
        normalData[outIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        normalData[outIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        normalData[outIdx + 3] = 255;
      }
    }

    this.normalTexture = new THREE.DataTexture(
      normalData,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.normalTexture.minFilter = THREE.LinearFilter;
    this.normalTexture.magFilter = THREE.LinearFilter;
    this.normalTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.normalTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.normalTexture.needsUpdate = true;
  }

  dispose(): void {
    this.heightTexture?.dispose();
    this.normalTexture?.dispose();
    this.heightTexture = null;
    this.normalTexture = null;
    this.heightData = null;
  }
}
