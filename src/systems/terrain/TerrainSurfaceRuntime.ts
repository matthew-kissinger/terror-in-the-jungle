import * as THREE from 'three';
import type { AssetLoader } from '../assets/AssetLoader';
import type { IHeightProvider } from './IHeightProvider';
import type { SplatmapConfig } from './TerrainConfig';
import type { BiomeClassificationRule, TerrainFarCanopyTintConfig } from '../../config/biomes';
import type { TerrainSurfacePatch } from './TerrainFeatureTypes';
import { HeightmapGPU } from './HeightmapGPU';
import {
  createTerrainMaterial,
  type TerrainMaterial,
  type TerrainHydrologyMaskMaterialConfig,
  updateTerrainMaterialFarCanopyTint,
  updateTerrainMaterialTextures,
  updateTerrainMaterialWetness,
} from './TerrainMaterial';
import { buildTerrainBiomeMaterialConfig } from './TerrainBiomeRuntimeConfig';
import { materializeHydrologyMasksFromArtifact } from './hydrology/HydrologyBake';
import type { LoadedHydrologyBake } from './hydrology/HydrologyBakeManifest';
import type { HydrologyBiomePolicy } from './hydrology/HydrologyBiomeClassifier';

const MIN_HEIGHTMAP_GRID_SIZE = 256;
const MAX_HEIGHTMAP_GRID_SIZE = 1024;
const HYDROLOGY_MASK_FEATHER_RADIUS_CELLS = 1;
const HYDROLOGY_WET_MATERIAL_STRENGTH = 0.08;
const HYDROLOGY_CHANNEL_MATERIAL_STRENGTH = 0.14;

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
  private terrainMaterial: TerrainMaterial | null = null;
  private surfaceWetness = 0;
  private farCanopyTint: TerrainFarCanopyTintConfig = { enabled: false };
  private hydrologyMaskMaterial: TerrainHydrologyMaskMaterialConfig | null = null;
  private hydrologyMaskTexture: THREE.DataTexture | null = null;
  private featureSurfacePatches: TerrainSurfacePatch[] = [];
  private currentWorldSize = 0;
  private currentPlayableWorldSize = 0;
  private currentVisualMargin = 0;
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
    surfaceWorldSize: number = worldSize,
  ): TerrainMaterial {
    this.currentWorldSize = surfaceWorldSize;
    this.currentPlayableWorldSize = worldSize;
    this.currentVisualMargin = Math.max(0, (surfaceWorldSize - worldSize) * 0.5);
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
    this.heightmapGPU.bakeFromProvider(provider, computeTerrainSurfaceGridSize(surfaceWorldSize), surfaceWorldSize);
    const heightTexture = this.heightmapGPU.getHeightTexture();
    const normalTexture = this.heightmapGPU.getNormalTexture();

    if (!heightTexture || !normalTexture) {
      throw new Error('Failed to create terrain heightmap textures');
    }

    this.terrainMaterial = createTerrainMaterial({
      heightTexture,
      normalTexture,
      worldSize: surfaceWorldSize,
      playableWorldSize: worldSize,
      visualMargin: this.currentVisualMargin,
      splatmap: this.splatmap,
      biomeConfig: this.buildBiomeMaterialConfig(defaultBiomeId, biomeRules),
      hydrologyMask: this.hydrologyMaskMaterial,
      farCanopyTint: this.farCanopyTint,
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
  ): TerrainMaterial {
    this.currentWorldSize = worldSize;
    this.currentPlayableWorldSize = worldSize;
    this.currentVisualMargin = 0;
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
      playableWorldSize: worldSize,
      visualMargin: 0,
      splatmap: this.splatmap,
      biomeConfig: this.buildBiomeMaterialConfig(defaultBiomeId, biomeRules),
      hydrologyMask: this.hydrologyMaskMaterial,
      farCanopyTint: this.farCanopyTint,
      surfaceWetness: this.surfaceWetness,
      tileGridResolution: this.tileGridResolution,
      surfacePatches: this.featureSurfacePatches,
    });

    return this.terrainMaterial;
  }

  rebake(
    provider: IHeightProvider,
    worldSize: number,
    defaultBiomeId: string,
    biomeRules: BiomeClassificationRule[],
    playableWorldSize: number = worldSize,
    visualMargin: number = Math.max(0, (worldSize - playableWorldSize) * 0.5),
  ): void {
    this.currentWorldSize = worldSize;
    this.currentPlayableWorldSize = playableWorldSize;
    this.currentVisualMargin = visualMargin;
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
    this.heightmapGPU.bakeFromProvider(provider, computeTerrainSurfaceGridSize(worldSize), worldSize);
    this.updateMaterial(worldSize, defaultBiomeId, biomeRules);
  }

  rebakeFromPrebakedGrid(
    data: Float32Array,
    gridSize: number,
    worldSize: number,
    defaultBiomeId: string,
    biomeRules: BiomeClassificationRule[],
    options: {
      normalData?: Uint8Array;
      playableWorldSize?: number;
      visualMargin?: number;
    } = {},
  ): void {
    this.currentWorldSize = worldSize;
    this.currentPlayableWorldSize = options.playableWorldSize ?? worldSize;
    this.currentVisualMargin = options.visualMargin ?? Math.max(0, (worldSize - this.currentPlayableWorldSize) * 0.5);
    this.currentDefaultBiomeId = defaultBiomeId;
    this.currentBiomeRules = biomeRules.slice();
    this.heightmapGPU.uploadPrebakedGrid(data, gridSize, worldSize, options.normalData);
    this.updateMaterial(worldSize, defaultBiomeId, biomeRules);
  }

  getMaterial(): TerrainMaterial {
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

  setFarCanopyTint(farCanopyTint?: TerrainFarCanopyTintConfig): void {
    this.farCanopyTint = farCanopyTint ?? { enabled: false };
    if (this.terrainMaterial) {
      updateTerrainMaterialFarCanopyTint(this.terrainMaterial, this.farCanopyTint);
    }
  }

  setHydrologyMaterialMask(
    hydrologyBake: LoadedHydrologyBake | null,
    policy: HydrologyBiomePolicy | null,
  ): void {
    this.disposeHydrologyMaskTexture();
    this.hydrologyMaskMaterial = null;

    if (hydrologyBake && policy) {
      const texture = createHydrologyMaskTexture(hydrologyBake.artifact);
      this.hydrologyMaskTexture = texture;
      this.hydrologyMaskMaterial = {
        texture,
        width: hydrologyBake.artifact.width,
        height: hydrologyBake.artifact.height,
        originX: hydrologyBake.artifact.transform.originX,
        originZ: hydrologyBake.artifact.transform.originZ,
        cellSizeMeters: hydrologyBake.artifact.transform.cellSizeMeters,
        wetBiomeId: policy.wetBiomeId,
        channelBiomeId: policy.channelBiomeId,
        wetStrength: HYDROLOGY_WET_MATERIAL_STRENGTH,
        channelStrength: HYDROLOGY_CHANNEL_MATERIAL_STRENGTH,
      };
    }

    if (this.terrainMaterial) {
      this.updateMaterialArguments();
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
    this.disposeHydrologyMaskTexture();
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
      this.buildBiomeMaterialConfig(
        defaultBiomeId ?? this.currentDefaultBiomeId,
        biomeRules ?? this.currentBiomeRules,
      ),
    this.splatmap,
    this.featureSurfacePatches,
    this.farCanopyTint,
    this.hydrologyMaskMaterial,
    this.currentPlayableWorldSize,
    this.currentVisualMargin,
  );
    updateTerrainMaterialWetness(this.terrainMaterial, this.surfaceWetness);
  }

  private buildBiomeMaterialConfig(defaultBiomeId: string, biomeRules: BiomeClassificationRule[]) {
    return buildTerrainBiomeMaterialConfig(
      this.assetLoader,
      defaultBiomeId,
      biomeRules,
      this.getHydrologyMaterialBiomeIds(),
    );
  }

  private getHydrologyMaterialBiomeIds(): string[] {
    if (!this.hydrologyMaskMaterial) return [];
    return [
      this.hydrologyMaskMaterial.wetBiomeId,
      this.hydrologyMaskMaterial.channelBiomeId,
    ];
  }

  private disposeHydrologyMaskTexture(): void {
    this.hydrologyMaskTexture?.dispose();
    this.hydrologyMaskTexture = null;
  }
}

function createHydrologyMaskTexture(artifact: LoadedHydrologyBake['artifact']): THREE.DataTexture {
  const masks = materializeHydrologyMasksFromArtifact(artifact);
  const cellCount = artifact.width * artifact.height;
  const data = new Uint8Array(cellCount * 4);
  const wetWeights = featherHydrologyMask(
    masks.wetCandidate,
    artifact.width,
    artifact.height,
    HYDROLOGY_MASK_FEATHER_RADIUS_CELLS,
  );
  const channelWeights = featherHydrologyMask(
    masks.channelCandidate,
    artifact.width,
    artifact.height,
    HYDROLOGY_MASK_FEATHER_RADIUS_CELLS,
  );

  for (let index = 0; index < cellCount; index++) {
    const offset = index * 4;
    data[offset] = wetWeights[index] ?? 0;
    data[offset + 1] = channelWeights[index] ?? 0;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
  }

  const texture = new THREE.DataTexture(
    data,
    artifact.width,
    artifact.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function featherHydrologyMask(mask: Uint8Array, width: number, height: number, radiusCells: number): Uint8Array {
  const weights = new Uint8Array(mask.length);
  const radius = Math.max(0, Math.floor(radiusCells));

  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) <= 0) continue;

    const centerX = index % width;
    const centerY = Math.floor(index / width);
    for (let dy = -radius; dy <= radius; dy++) {
      const y = centerY + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = centerX + dx;
        if (x < 0 || x >= width) continue;
        const distanceCells = Math.hypot(dx, dy);
        if (distanceCells > radius + 0.001) continue;
        const feather = 1 - distanceCells / (radius + 1);
        const weight = Math.round(255 * feather);
        const targetIndex = y * width + x;
        weights[targetIndex] = Math.max(weights[targetIndex] ?? 0, weight);
      }
    }
  }

  return weights;
}
