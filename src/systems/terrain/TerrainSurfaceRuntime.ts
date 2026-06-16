// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  type TerrainAtmosphereLightingMaterialConfig,
  updateTerrainMaterialAtmosphereLighting,
  updateTerrainMaterialFarCanopyTint,
  updateTerrainMaterialLodRanges,
  updateTerrainMaterialTextures,
  updateTerrainMaterialWetness,
} from './TerrainMaterial';
import { buildTerrainBiomeMaterialConfig } from './TerrainBiomeRuntimeConfig';

const MIN_HEIGHTMAP_GRID_SIZE = 256;
const MAX_HEIGHTMAP_GRID_SIZE = 1024;

/**
 * Gameplay (CPU) height/slope queries read the same grid spec the GPU surface
 * is baked at whenever that grid is fine enough; the query grid below only
 * out-resolves the surface when the surface is capped coarser. Since
 * ashau-load-freeze (2026-06-10) DEM-scale worlds bake the surface at the
 * 1024 cap (~21m/sample on A Shau — comfortably above the 9m DEM floor, so
 * this never out-resolves the asset), which makes the two grids IDENTICAL
 * there: collision, BVH, AI slope, vegetation, and the rendered surface all
 * interpolate one grid, and the render↔collision divergence reduces to the
 * GPU rasterizer's triangle interpolation between mesh vertices (~±0.3m at
 * LOD0 spacing). History: pre-2026-06-09 the queries read a 512 surface grid
 * (~42m/sample) whose C0-smoothing flipped the slope GRADIENT DIRECTION fed
 * to the NPC contour solver (the combat-movement-stall-tail root); #354
 * introduced the finer CPU-only query grid, and the surface grid was lifted
 * to match once StampSpatialIndex made DEM+stamp sampling cheap.
 */
const GAMEPLAY_QUERY_TARGET_METERS_PER_SAMPLE = 20;
const MAX_GAMEPLAY_QUERY_GRID_SIZE = 1024;
const ATMOSPHERE_LIGHTING_EPSILON = 1e-5;

function roundUpToPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result <<= 1;
  }
  return result;
}

export function computeTerrainSurfaceGridSize(worldSize: number): number {
  // DEM-scale target lowered 48 → 24 (ashau-load-freeze): lands the A Shau
  // surface grid on the 1024 cap so it matches the gameplay-query grid (one
  // shared grid, render↔collision coherent). Costs +3MB R32F + +3MB RGBA8
  // normals GPU vs the old 512 — accepted on the only mode at this scale.
  const targetMetersPerSample =
    worldSize >= 16384 ? 24 :
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
 * Grid size for the CPU gameplay-query heightmap over the PLAYABLE world extent.
 *
 * Targets ~{@link GAMEPLAY_QUERY_TARGET_METERS_PER_SAMPLE}m/sample, capped at
 * {@link MAX_GAMEPLAY_QUERY_GRID_SIZE}, and never coarser than the GPU surface
 * grid for the same extent (so small procedural worlds — whose surface grid is
 * already fine — get no extra grid and no extra memory). For A Shau this lands at
 * 1024 over ~21.1km ⇒ ~20.6m/sample, ~2x the GPU surface and ~9x fewer slope
 * gradient-direction flips than the 512-grid (measured against the real DEM:
 * steep-cell aspect flips 0.74% → 0.08%; mean |Δh| vs DEM 1.12m → 0.34m). Cost is
 * a single 1024² Float32 (~4MB CPU), replacing the ~1MB coarse copy ⇒ ~+3MB CPU,
 * zero GPU.
 */
export function computeGameplayQueryGridSize(playableWorldSize: number): number {
  const requested = Math.ceil(playableWorldSize / GAMEPLAY_QUERY_TARGET_METERS_PER_SAMPLE) + 1;
  const surfaceGrid = computeTerrainSurfaceGridSize(playableWorldSize);
  return Math.max(
    surfaceGrid,
    Math.min(MAX_GAMEPLAY_QUERY_GRID_SIZE, requested),
  );
}

function terrainAtmosphereLightingEquals(
  current: TerrainAtmosphereLightingMaterialConfig,
  next: TerrainAtmosphereLightingMaterialConfig,
): boolean {
  return Math.abs(current.nightFillColor.r - next.nightFillColor.r) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.nightFillColor.g - next.nightFillColor.g) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.nightFillColor.b - next.nightFillColor.b) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.nightFillStrength - next.nightFillStrength) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.directLightDirection.x - next.directLightDirection.x) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.directLightDirection.y - next.directLightDirection.y) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.directLightDirection.z - next.directLightDirection.z) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.daylightFactor - next.daylightFactor) <= ATMOSPHERE_LIGHTING_EPSILON
    && Math.abs(current.lowSunOcclusionStrength - next.lowSunOcclusionStrength) <= ATMOSPHERE_LIGHTING_EPSILON;
}

/**
 * Bake a CPU gameplay-query height grid from a source provider, sampled over
 * `worldSize` centred on the origin. Mirrors {@link HeightmapGPU.bakeFromProvider}
 * sample placement so a {@link BakedHeightProvider} wrapping this grid maps world
 * coordinates identically to the GPU surface — but at a finer resolution and with
 * no GPU texture allocation (CPU-only, gameplay-query path).
 */
export function bakeGameplayQueryGrid(
  provider: IHeightProvider,
  gridSize: number,
  worldSize: number,
): Float32Array {
  const data = new Float32Array(gridSize * gridSize);
  const halfWorld = worldSize / 2;
  const step = worldSize / (gridSize - 1);
  for (let z = 0; z < gridSize; z++) {
    const worldZ = -halfWorld + z * step;
    for (let x = 0; x < gridSize; x++) {
      data[z * gridSize + x] = provider.getHeightAt(-halfWorld + x * step, worldZ);
    }
  }
  return data;
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
  private atmosphereLighting: TerrainAtmosphereLightingMaterialConfig = {
    nightFillColor: new THREE.Color(0, 0, 0),
    nightFillStrength: 0,
    directLightDirection: new THREE.Vector3(0, 1, 0),
    daylightFactor: 1,
    lowSunOcclusionStrength: 0,
  };
  private readonly nextAtmosphereLighting: TerrainAtmosphereLightingMaterialConfig = {
    nightFillColor: new THREE.Color(0, 0, 0),
    nightFillStrength: 0,
    directLightDirection: new THREE.Vector3(0, 1, 0),
    daylightFactor: 1,
    lowSunOcclusionStrength: 0,
  };
  private featureSurfacePatches: TerrainSurfacePatch[] = [];
  private currentWorldSize = 0;
  private currentPlayableWorldSize = 0;
  private currentVisualMargin = 0;
  private currentLodRanges: number[];
  private currentMorphStart = 0.8;
  private currentDefaultBiomeId = 'denseJungle';
  private currentBiomeRules: BiomeClassificationRule[] = [];

  constructor(assetLoader: AssetLoader, splatmap: SplatmapConfig, tileGridResolution = 32, lodRanges: readonly number[] = []) {
    this.assetLoader = assetLoader;
    this.splatmap = splatmap;
    this.tileGridResolution = tileGridResolution;
    this.currentLodRanges = [...lodRanges];
    this.heightmapGPU = new HeightmapGPU();
  }

  setLodRanges(lodRanges: readonly number[], morphStart = 0.8): void {
    this.currentLodRanges = [...lodRanges];
    this.currentMorphStart = morphStart;
    if (this.terrainMaterial) {
      updateTerrainMaterialLodRanges(this.terrainMaterial, this.currentWorldSize, this.currentLodRanges, morphStart);
    }
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
      farCanopyTint: this.farCanopyTint,
      atmosphereLighting: this.atmosphereLighting,
      surfaceWetness: this.surfaceWetness,
      tileGridResolution: this.tileGridResolution,
      lodRanges: this.currentLodRanges,
      morphStart: this.currentMorphStart,
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
      farCanopyTint: this.farCanopyTint,
      atmosphereLighting: this.atmosphereLighting,
      surfaceWetness: this.surfaceWetness,
      tileGridResolution: this.tileGridResolution,
      lodRanges: this.currentLodRanges,
      morphStart: this.currentMorphStart,
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

  setAtmosphereLighting(lighting: TerrainAtmosphereLightingMaterialConfig): void {
    const nextLighting = this.nextAtmosphereLighting;
    const directLightDirection = nextLighting.directLightDirection;
    nextLighting.nightFillColor.copy(lighting.nightFillColor);
    nextLighting.nightFillStrength = THREE.MathUtils.clamp(lighting.nightFillStrength, 0, 0.5);
    nextLighting.daylightFactor = THREE.MathUtils.clamp(lighting.daylightFactor, 0, 1);
    nextLighting.lowSunOcclusionStrength = THREE.MathUtils.clamp(lighting.lowSunOcclusionStrength, 0, 1);
    directLightDirection.copy(lighting.directLightDirection);
    if (directLightDirection.lengthSq() < 1e-8) {
      directLightDirection.set(0, 1, 0);
    } else {
      directLightDirection.normalize();
    }

    if (terrainAtmosphereLightingEquals(this.atmosphereLighting, nextLighting)) {
      return;
    }

    this.atmosphereLighting.nightFillColor.copy(nextLighting.nightFillColor);
    this.atmosphereLighting.directLightDirection.copy(nextLighting.directLightDirection);
    this.atmosphereLighting.nightFillStrength = nextLighting.nightFillStrength;
    this.atmosphereLighting.daylightFactor = nextLighting.daylightFactor;
    this.atmosphereLighting.lowSunOcclusionStrength = nextLighting.lowSunOcclusionStrength;
    if (this.terrainMaterial) {
      updateTerrainMaterialAtmosphereLighting(this.terrainMaterial, this.atmosphereLighting);
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
      this.buildBiomeMaterialConfig(
        defaultBiomeId ?? this.currentDefaultBiomeId,
        biomeRules ?? this.currentBiomeRules,
      ),
    this.splatmap,
    this.featureSurfacePatches,
    this.farCanopyTint,
    this.currentPlayableWorldSize,
    this.currentVisualMargin,
    this.currentLodRanges,
    this.currentMorphStart,
  );
    updateTerrainMaterialWetness(this.terrainMaterial, this.surfaceWetness);
    updateTerrainMaterialAtmosphereLighting(this.terrainMaterial, this.atmosphereLighting);
  }

  private buildBiomeMaterialConfig(defaultBiomeId: string, biomeRules: BiomeClassificationRule[]) {
    return buildTerrainBiomeMaterialConfig(
      this.assetLoader,
      defaultBiomeId,
      biomeRules,
      [],
    );
  }
}
