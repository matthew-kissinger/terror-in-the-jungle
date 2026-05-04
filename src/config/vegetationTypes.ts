/**
 * Vegetation type registry — single source of truth for all billboard vegetation.
 *
 * GPUBillboardSystem, ChunkVegetationGenerator, and the chunk worker all
 * read from this registry so adding/removing a type is a one-file change.
 */

import { PIXEL_FORGE_VEGETATION_ASSETS, type PixelForgeVegetationAsset } from './pixelForgeAssets';

export type VegetationTier = 'groundCover' | 'midLevel' | 'canopy';
export type VegetationRepresentation = 'imposter';
export type VegetationAtlasProfile = 'ground-compact' | 'mid-balanced' | 'canopy-balanced' | 'canopy-hero';
export type VegetationShaderProfile = 'hemisphere' | 'normal-lit';

export interface VegetationClusterConfig {
  scale: number;
  threshold: number;
  edgeFeather: number;
}

export interface VegetationAlphaCrop {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

export interface VegetationImposterAtlasConfig {
  tilesX: number;
  tilesY: number;
  layout: 'latlon';
  tileSize: 256 | 512 | 1024;
  alphaCrop?: VegetationAlphaCrop;
  stableAzimuthColumn?: number;
  maxElevationRow?: number;
}

export interface VegetationTypeConfig {
  id: string;
  textureName: string;       // AssetLoader key
  normalTextureName?: string; // Optional normal atlas key when imported from Pixel Forge
  size: number;              // Square billboard size (meters)
  maxInstances: number;      // GPU buffer cap
  yOffset: number;           // Quad-center offset above terrain (accounts for texture bottom padding)
  fadeDistance: number;
  maxDistance: number;
  baseDensity: number;       // Multiplier on DENSITY_PER_UNIT (1 / 128 sq-units)
  placement: 'random' | 'poisson';
  poissonMinDistance?: number;
  cluster?: VegetationClusterConfig;
  tier: VegetationTier;
  representation: VegetationRepresentation;
  atlasProfile: VegetationAtlasProfile;
  shaderProfile: VegetationShaderProfile;
  imposterAtlas?: VegetationImposterAtlasConfig;
  normalSpace?: 'capture-view';
}

type VegetationTuning = Pick<
  VegetationTypeConfig,
  'maxInstances' | 'fadeDistance' | 'maxDistance' | 'baseDensity' | 'placement' | 'poissonMinDistance'
> & {
  cluster?: VegetationClusterConfig;
};

const VEGETATION_TUNING: Record<string, VegetationTuning> = {
  fern: {
    maxInstances: 100_000,
    fadeDistance: 200,
    maxDistance: 250,
    baseDensity: 6.0,
    placement: 'random',
  },
  elephantEar: {
    maxInstances: 30_000,
    fadeDistance: 250,
    maxDistance: 300,
    baseDensity: 0.8,
    placement: 'random',
  },
  fanPalm: {
    maxInstances: 25_000,
    fadeDistance: 360,
    maxDistance: 430,
    baseDensity: 0.8,
    placement: 'random',
  },
  coconut: {
    maxInstances: 20_000,
    fadeDistance: 450,
    maxDistance: 520,
    baseDensity: 0.45,
    placement: 'poisson',
    poissonMinDistance: 12,
  },
  bambooGrove: {
    maxInstances: 12_000,
    fadeDistance: 350,
    maxDistance: 400,
    baseDensity: 1.15,
    placement: 'poisson',
    poissonMinDistance: 7,
    cluster: {
      scale: 260,
      threshold: 0.72,
      edgeFeather: 0.06,
    },
  },
  bananaPlant: {
    maxInstances: 20_000,
    fadeDistance: 250,
    maxDistance: 300,
    baseDensity: 0.55,
    placement: 'random',
  },
  giantPalm: {
    maxInstances: 15_000,
    fadeDistance: 500,
    maxDistance: 600,
    baseDensity: 0.35,
    placement: 'poisson',
    poissonMinDistance: 12,
  },
};

// Low-camera atlas rows in several Pixel Forge packages have transparent
// padding below the visible trunk/leaf base. Lower only those center anchors
// so the visible cutout base sits on terrain instead of floating above it.
const VEGETATION_GROUNDING_SINK: Record<string, number> = {
  bambooGrove: 0.6,
  coconut: 2.45,
  elephantEar: 0.45,
  fanPalm: 2.8,
  giantPalm: 0.6,
};

const VEGETATION_GROUNDING_LIFT: Record<string, number> = {
  fern: 2.15,
};

const VEGETATION_RUNTIME_SCALE: Record<string, number> = {
  fern: 1.25,
  giantPalm: 2.25,
};

// Skinny, asymmetric trunks do not survive atlas cross-fading: blending two
// azimuth columns draws two trunks instead of a rotated trunk. Coconut also
// has a bad low-elevation atlas row with a duplicated palm silhouette, so keep
// ground-view sampling on the clean row until the asset can be regenerated.
const VEGETATION_STABLE_AZIMUTH_COLUMN: Record<string, number> = {
  coconut: 2,
  giantPalm: 3,
};

const VEGETATION_MAX_ELEVATION_ROW: Record<string, number> = {
  coconut: 2,
};

function toVegetationType(asset: PixelForgeVegetationAsset): VegetationTypeConfig {
  const tuning = VEGETATION_TUNING[asset.id];
  if (!tuning) {
    throw new Error(`Missing Pixel Forge vegetation tuning for ${asset.id}`);
  }
  const runtimeScale = VEGETATION_RUNTIME_SCALE[asset.id] ?? 1;
  const groundingSink = VEGETATION_GROUNDING_SINK[asset.id] ?? 0;
  const groundingLift = VEGETATION_GROUNDING_LIFT[asset.id] ?? 0;

  return {
    id: asset.id,
    textureName: asset.textureName,
    normalTextureName: asset.normalTextureName,
    size: asset.worldSize * runtimeScale,
    maxInstances: tuning.maxInstances,
    yOffset: (asset.yOffset - groundingSink + groundingLift) * runtimeScale,
    fadeDistance: tuning.fadeDistance,
    maxDistance: tuning.maxDistance,
    baseDensity: tuning.baseDensity,
    placement: tuning.placement,
    poissonMinDistance: tuning.poissonMinDistance,
    cluster: tuning.cluster,
    tier: asset.tier,
    representation: 'imposter',
    atlasProfile: asset.atlasProfile,
    shaderProfile: asset.shaderProfile,
    imposterAtlas: {
      tilesX: asset.tilesX,
      tilesY: asset.tilesY,
      layout: 'latlon',
      tileSize: asset.tileSize,
      stableAzimuthColumn: VEGETATION_STABLE_AZIMUTH_COLUMN[asset.id],
      maxElevationRow: VEGETATION_MAX_ELEVATION_ROW[asset.id],
    },
    normalSpace: asset.shaderProfile === 'normal-lit' ? 'capture-view' : undefined,
  };
}

export const VEGETATION_TYPES: VegetationTypeConfig[] =
  PIXEL_FORGE_VEGETATION_ASSETS.map(toVegetationType);

