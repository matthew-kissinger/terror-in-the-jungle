import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import type { IHeightProvider } from './IHeightProvider';
import type { SplatmapConfig } from './TerrainConfig';
import type { BiomeClassificationRule } from '../../config/biomes';
import { HeightmapGPU } from './HeightmapGPU';
import {
  createTerrainMaterial,
  updateTerrainMaterialTextures,
  updateTerrainMaterialWetness,
} from './TerrainMaterial';
import { buildTerrainBiomeMaterialConfig } from './TerrainBiomeRuntimeConfig';

const MIN_HEIGHTMAP_GRID_SIZE = 256;
const MAX_HEIGHTMAP_GRID_SIZE = 1024;

function roundUpToPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result <<= 1;
  }
  return result;
}

export function computeTerrainSurfaceGridSize(worldSize: number): number {
  const targetMetersPerSample =
    worldSize >= 16384 ? 48 :
    worldSize >= 8192 ? 32 :
    worldSize >= 4096 ? 8 :
    worldSize >= 1024 ? 4 :
    16;

  const requestedGridSize = Math.ceil(worldSize / targetMetersPerSample);
  return Math.max(
    MIN_HEIGHTMAP_GRID_SIZE,
    Math.min(MAX_HEIGHTMAP_GRID_SIZE, roundUpToPowerOfTwo(requestedGridSize)),
  );
}

/**
 * Owns GPU terrain surface data and material refresh logic.
 */
export class TerrainSurfaceRuntime {
  private readonly assetLoader: AssetLoader;
  private readonly splatmap: SplatmapConfig;
  private readonly heightmapGPU: HeightmapGPU;
  private readonly tileGridResolution: number;
  private terrainMaterial: THREE.MeshStandardMaterial | null = null;
  private surfaceWetness = 0;

  constructor(assetLoader: AssetLoader, splatmap: SplatmapConfig, tileGridResolution = 32) {
    this.assetLoader = assetLoader;
    this.splatmap = splatmap;
    this.tileGridResolution = tileGridResolution;
    this.heightmapGPU = new HeightmapGPU();
  }

  initialize(
    provider: IHeightProvider,
    worldSize: number,
    defaultBiomeId: string,
    biomeRules: BiomeClassificationRule[],
  ): THREE.MeshStandardMaterial {
    this.heightmapGPU.bakeFromProvider(provider, computeTerrainSurfaceGridSize(worldSize), worldSize);
    const heightTexture = this.heightmapGPU.getHeightTexture();
    const normalTexture = this.heightmapGPU.getNormalTexture();

    if (!heightTexture || !normalTexture) {
      throw new Error('Failed to create terrain heightmap textures');
    }

    this.terrainMaterial = createTerrainMaterial({
      heightTexture,
      normalTexture,
      worldSize,
      splatmap: this.splatmap,
      biomeConfig: buildTerrainBiomeMaterialConfig(this.assetLoader, defaultBiomeId, biomeRules),
      surfaceWetness: this.surfaceWetness,
      tileGridResolution: this.tileGridResolution,
    });

    return this.terrainMaterial;
  }

  updateBiomeMaterial(worldSize: number, defaultBiomeId: string, biomeRules: BiomeClassificationRule[]): void {
    this.updateMaterial(worldSize, defaultBiomeId, biomeRules);
  }

  rebake(provider: IHeightProvider, worldSize: number, defaultBiomeId: string, biomeRules: BiomeClassificationRule[]): void {
    this.heightmapGPU.bakeFromProvider(provider, computeTerrainSurfaceGridSize(worldSize), worldSize);
    this.updateMaterial(worldSize, defaultBiomeId, biomeRules);
  }

  getMaterial(): THREE.MeshStandardMaterial {
    if (!this.terrainMaterial) {
      throw new Error('Terrain material requested before initialization');
    }
    return this.terrainMaterial;
  }

  setSurfaceWetness(surfaceWetness: number): void {
    this.surfaceWetness = THREE.MathUtils.clamp(surfaceWetness, 0, 1);
    if (this.terrainMaterial) {
      updateTerrainMaterialWetness(this.terrainMaterial, this.surfaceWetness);
    }
  }

  getBakedHeightmap(): { data: Float32Array; gridSize: number; worldSize: number } | null {
    const data = this.heightmapGPU.getHeightData();
    if (!data) return null;
    return { data, gridSize: this.heightmapGPU.getGridSize(), worldSize: this.heightmapGPU.getWorldSize() };
  }

  dispose(): void {
    this.heightmapGPU.dispose();
    this.terrainMaterial?.dispose();
    this.terrainMaterial = null;
  }

  private updateMaterial(worldSize: number, defaultBiomeId: string, biomeRules: BiomeClassificationRule[]): void {
    const heightTexture = this.heightmapGPU.getHeightTexture();
    const normalTexture = this.heightmapGPU.getNormalTexture();

    if (!heightTexture || !normalTexture || !this.terrainMaterial) {
      throw new Error('Terrain textures are unavailable during terrain surface update');
    }

    updateTerrainMaterialTextures(
      this.terrainMaterial,
      heightTexture,
      normalTexture,
      worldSize,
      buildTerrainBiomeMaterialConfig(this.assetLoader, defaultBiomeId, biomeRules),
      this.splatmap,
    );
    updateTerrainMaterialWetness(this.terrainMaterial, this.surfaceWetness);
  }
}
