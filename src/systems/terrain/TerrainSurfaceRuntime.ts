import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import type { IHeightProvider } from './IHeightProvider';
import type { SplatmapConfig } from './TerrainConfig';
import type { BiomeClassificationRule } from '../../config/biomes';
import type { TerrainSurfacePatch } from './TerrainFeatureTypes';
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
  private featureSurfacePatches: TerrainSurfacePatch[] = [];
  private currentWorldSize = 0;
  private currentDefaultBiomeId = 'denseJungle';
  private currentBiomeRules: BiomeClassificationRule[] = [];

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
    this.currentWorldSize = worldSize;
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
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
      surfacePatches: this.featureSurfacePatches,
    });

    return this.terrainMaterial;
  }

  updateBiomeMaterial(worldSize: number, defaultBiomeId: string, biomeRules: BiomeClassificationRule[]): void {
    this.currentWorldSize = worldSize;
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
    this.updateMaterial(worldSize, defaultBiomeId, biomeRules);
  }

  /**
   * Initialize from a pre-baked Float32Array heightmap grid (from worker or asset).
   * Skips the synchronous per-sample provider loop.
   */
  initializeFromPrebakedGrid(
    data: Float32Array,
    gridSize: number,
    worldSize: number,
    defaultBiomeId: string,
    biomeRules: BiomeClassificationRule[],
  ): THREE.MeshStandardMaterial {
    this.currentWorldSize = worldSize;
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
    this.heightmapGPU.uploadPrebakedGrid(data, gridSize, worldSize);
    const heightTexture = this.heightmapGPU.getHeightTexture();
    const normalTexture = this.heightmapGPU.getNormalTexture();

    if (!heightTexture || !normalTexture) {
      throw new Error('Failed to create terrain heightmap textures from pre-baked grid');
    }

    this.terrainMaterial = createTerrainMaterial({
      heightTexture,
      normalTexture,
      worldSize,
      splatmap: this.splatmap,
      biomeConfig: buildTerrainBiomeMaterialConfig(this.assetLoader, defaultBiomeId, biomeRules),
      surfaceWetness: this.surfaceWetness,
      tileGridResolution: this.tileGridResolution,
      surfacePatches: this.featureSurfacePatches,
    });

    return this.terrainMaterial;
  }

  rebake(provider: IHeightProvider, worldSize: number, defaultBiomeId: string, biomeRules: BiomeClassificationRule[]): void {
    this.currentWorldSize = worldSize;
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
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

  setFeatureSurfacePatches(surfacePatches: TerrainSurfacePatch[]): void {
    this.featureSurfacePatches = surfacePatches.slice();
    if (this.terrainMaterial) {
      this.updateMaterialArguments();
    }
  }

  getHeightmapInfo(): { texture: THREE.DataTexture; gridSize: number; worldSize: number } | null {
    const texture = this.heightmapGPU.getHeightTexture();
    if (!texture) return null;
    return { texture, gridSize: this.heightmapGPU.getGridSize(), worldSize: this.heightmapGPU.getWorldSize() };
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

    this.updateMaterialArguments(worldSize, defaultBiomeId, biomeRules, heightTexture, normalTexture);
  }

  private updateMaterialArguments(
    worldSize?: number,
    defaultBiomeId?: string,
    biomeRules?: BiomeClassificationRule[],
    heightTexture?: THREE.DataTexture,
    normalTexture?: THREE.DataTexture,
  ): void {
    if (!this.terrainMaterial) {
      throw new Error('Terrain material is unavailable during terrain surface update');
    }

    const resolvedWorldSize = worldSize ?? this.heightmapGPU.getWorldSize();
    const resolvedHeightTexture = heightTexture ?? this.heightmapGPU.getHeightTexture();
    const resolvedNormalTexture = normalTexture ?? this.heightmapGPU.getNormalTexture();
    if (!resolvedHeightTexture || !resolvedNormalTexture) {
      throw new Error('Terrain textures are unavailable during terrain surface update');
    }

    updateTerrainMaterialTextures(
      this.terrainMaterial,
      resolvedHeightTexture,
      resolvedNormalTexture,
      resolvedWorldSize,
      buildTerrainBiomeMaterialConfig(
        this.assetLoader,
        defaultBiomeId ?? this.currentDefaultBiomeId,
        biomeRules ?? this.currentBiomeRules,
      ),
      this.splatmap,
      this.featureSurfacePatches,
    );
    updateTerrainMaterialWetness(this.terrainMaterial, this.surfaceWetness);
  }
}
