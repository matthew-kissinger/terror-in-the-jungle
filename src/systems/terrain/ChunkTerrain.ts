import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { MathUtils } from '../../utils/Math';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';
import { AssetLoader } from '../assets/AssetLoader';

export class ChunkTerrain {
  private noiseGenerator: NoiseGenerator;
  private assetLoader: AssetLoader;
  private size: number;
  private chunkX: number;
  private chunkZ: number;
  private heightData: Float32Array = new Float32Array(0);
  private debugMode = false;

  constructor(
    noiseGenerator: NoiseGenerator,
    assetLoader: AssetLoader,
    size: number,
    chunkX: number,
    chunkZ: number
  ) {
    this.noiseGenerator = noiseGenerator;
    this.assetLoader = assetLoader;
    this.size = size;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
  }

  generateHeightData(): Float32Array {
    const resolution = 32;
    this.heightData = new Float32Array((resolution + 1) * (resolution + 1));

    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const worldX = baseX + (x / resolution) * this.size;
        const worldZ = baseZ + (z / resolution) * this.size;

        // Continental/base terrain shape
        let continentalHeight = this.noiseGenerator.noise(worldX * 0.001, worldZ * 0.001);

        // Mountain ranges using ridge noise
        let ridgeNoise = 1 - Math.abs(this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003));
        ridgeNoise = Math.pow(ridgeNoise, 1.5);

        // Valley carving
        let valleyNoise = this.noiseGenerator.noise(worldX * 0.008, worldZ * 0.008);
        valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);

        // Hills and medium features
        let hillNoise = 0;
        hillNoise += this.noiseGenerator.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
        hillNoise += this.noiseGenerator.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
        hillNoise += this.noiseGenerator.noise(worldX * 0.06, worldZ * 0.06) * 0.125;

        // Fine details
        let detailNoise = this.noiseGenerator.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

        // Combine all noise layers
        let height = 0;
        height += (continentalHeight * 0.5 + 0.5) * 30;

        const ridgeStrength = MathUtils.smoothstep(-0.3, 0.2, continentalHeight);
        height += ridgeNoise * 80 * ridgeStrength;

        height += valleyNoise * 40;
        height += hillNoise * 35;
        height += detailNoise * 8;

        // Create water areas
        const waterNoise = this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003);
        const riverNoise = this.noiseGenerator.noise(worldX * 0.01, worldZ * 0.01);

        if (waterNoise < -0.4 && height < 15) {
          height = -3 - waterNoise * 2;
        } else if (Math.abs(riverNoise) < 0.1 && height < 25) {
          height = height * 0.3 - 2;
        } else if (height < 20) {
          height = height * 0.7;
        }

        height = Math.max(-8, height);

        const index = z * (resolution + 1) + x;
        this.heightData[index] = height;
      }
    }

    return this.heightData;
  }

  createTerrainMesh(scene: THREE.Scene): THREE.Mesh {
    const segments = 32;
    const geometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);

    // Rotate to XZ plane
    geometry.rotateX(-Math.PI / 2);

    // Apply heightmap
    const positions = geometry.attributes.position;
    const vertices = positions.array as Float32Array;

    let vertexIndex = 0;
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const heightIndex = z * (segments + 1) + x;
        const height = this.heightData[heightIndex];
        vertices[vertexIndex * 3 + 1] = height;
        vertexIndex++;
      }
    }

    geometry.computeVertexNormals();
    positions.needsUpdate = true;

    // Create material - use lit material so terrain responds to scene lighting
    let material: THREE.Material;

    if (this.debugMode) {
      material = new THREE.MeshBasicMaterial({
        color: 0x00FF00,
        wireframe: true,
        side: THREE.DoubleSide
      });
    } else {
      const texture = this.assetLoader.getTexture('forestfloor');
      if (texture) {
        // Use lit material for natural shading based on scene lights
        material = PixelPerfectUtils.createPixelPerfectLitMaterial(texture);
        texture.repeat.set(8, 8);
        Logger.info('terrain', `Using forestfloor texture for chunk (${this.chunkX}, ${this.chunkZ})`);
      } else {
        // Fallback: lit material with color
        material = new THREE.MeshLambertMaterial({
          color: 0x4a7c59,
          side: THREE.DoubleSide
        });
        Logger.warn('terrain', `Using fallback color for chunk (${this.chunkX}, ${this.chunkZ})`);
      }
    }

    // Create mesh
    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.position.set(
      this.chunkX * this.size + this.size / 2,
      0,
      this.chunkZ * this.size + this.size / 2
    );
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.chunkId = `${this.chunkX},${this.chunkZ}`;

    scene.add(terrainMesh);
    return terrainMesh;
  }

  sampleHeight(localX: number, localZ: number): number {
    const resolution = 32;

    // Clamp to valid range
    localX = Math.max(0, Math.min(this.size - 0.001, localX));
    localZ = Math.max(0, Math.min(this.size - 0.001, localZ));

    const normalizedX = (localX / this.size) * resolution;
    const normalizedZ = (localZ / this.size) * resolution;

    const x0 = Math.floor(Math.max(0, Math.min(normalizedX, resolution)));
    const x1 = Math.min(x0 + 1, resolution);
    const z0 = Math.floor(Math.max(0, Math.min(normalizedZ, resolution)));
    const z1 = Math.min(z0 + 1, resolution);

    const fx = normalizedX - x0;
    const fz = normalizedZ - z0;

    // heightData is stored in row-major order
    const h00 = this.heightData[z0 * (resolution + 1) + x0] || 0;
    const h10 = this.heightData[z0 * (resolution + 1) + x1] || 0;
    const h01 = this.heightData[z1 * (resolution + 1) + x0] || 0;
    const h11 = this.heightData[z1 * (resolution + 1) + x1] || 0;

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
  }

  getHeightData(): Float32Array {
    return this.heightData;
  }
}