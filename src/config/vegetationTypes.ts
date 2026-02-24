/**
 * Vegetation type registry — single source of truth for all billboard vegetation.
 *
 * GPUBillboardSystem, ChunkVegetationGenerator, and the chunk worker all
 * read from this registry so adding/removing a type is a one-file change.
 */

export interface VegetationTypeConfig {
  id: string;
  textureName: string;       // AssetLoader key
  size: number;              // Square billboard size (meters)
  maxInstances: number;      // GPU buffer cap
  yOffset: number;           // Quad-center offset above terrain (accounts for texture bottom padding)
  fadeDistance: number;
  maxDistance: number;
  baseDensity: number;       // Multiplier on DENSITY_PER_UNIT (1 / 128 sq-units)
  placement: 'random' | 'poisson';
  poissonMinDistance?: number;
  tier: 'groundCover' | 'midLevel' | 'canopy';
}

export const VEGETATION_TYPES: VegetationTypeConfig[] = [
  // --- Ground cover ---
  {
    id: 'fern',
    textureName: 'Fern',
    size: 4,
    maxInstances: 100_000,
    yOffset: 0.9,
    fadeDistance: 200,
    maxDistance: 250,
    baseDensity: 6.0,
    placement: 'random',
    tier: 'groundCover',
  },
  {
    id: 'elephantEar',
    textureName: 'ElephantEarPlants',
    size: 5,
    maxInstances: 30_000,
    yOffset: 1.3,
    fadeDistance: 250,
    maxDistance: 300,
    baseDensity: 0.8,
    placement: 'random',
    tier: 'groundCover',
  },
  {
    id: 'elephantGrass',
    textureName: 'ElephantGrass',
    size: 3,
    maxInstances: 40_000,
    yOffset: 0.9,
    fadeDistance: 200,
    maxDistance: 250,
    baseDensity: 1.0,
    placement: 'random',
    tier: 'groundCover',
  },
  {
    id: 'ricePaddyPlants',
    textureName: 'RicePaddyPlants',
    size: 2,
    maxInstances: 50_000,
    yOffset: 0.3,
    fadeDistance: 150,
    maxDistance: 200,
    baseDensity: 4.0,
    placement: 'random',
    tier: 'groundCover',
  },

  // --- Mid-level ---
  {
    id: 'fanPalm',
    textureName: 'FanPalmCluster',
    size: 7,
    maxInstances: 25_000,
    yOffset: 2.1,
    fadeDistance: 300,
    maxDistance: 350,
    baseDensity: 0.5,
    placement: 'random',
    tier: 'midLevel',
  },
  {
    id: 'coconut',
    textureName: 'CoconutPalm',
    size: 10,
    maxInstances: 20_000,
    yOffset: 4.4,
    fadeDistance: 350,
    maxDistance: 400,
    baseDensity: 0.3,
    placement: 'poisson',
    poissonMinDistance: 12,
    tier: 'midLevel',
  },
  {
    id: 'areca',
    textureName: 'ArecaPalmCluster',
    size: 8,
    maxInstances: 30_000,
    yOffset: 3.0,
    fadeDistance: 300,
    maxDistance: 350,
    baseDensity: 0.4,
    placement: 'poisson',
    poissonMinDistance: 8,
    tier: 'midLevel',
  },
  {
    id: 'bambooGrove',
    textureName: 'BambooGrove',
    size: 12,
    maxInstances: 15_000,
    yOffset: 4.4,
    fadeDistance: 350,
    maxDistance: 400,
    baseDensity: 0.5,
    placement: 'poisson',
    poissonMinDistance: 8,
    tier: 'midLevel',
  },
  {
    id: 'bananaPlant',
    textureName: 'BananaPlant',
    size: 5,
    maxInstances: 15_000,
    yOffset: 2.0,
    fadeDistance: 250,
    maxDistance: 300,
    baseDensity: 0.4,
    placement: 'random',
    tier: 'midLevel',
  },
  {
    id: 'mangrove',
    textureName: 'Mangrove',
    size: 8,
    maxInstances: 10_000,
    yOffset: 2.9,  // 7.9% bottom padding — correct
    fadeDistance: 300,
    maxDistance: 350,
    baseDensity: 0.3,
    placement: 'poisson',
    poissonMinDistance: 10,
    tier: 'midLevel',
  },

  // --- Canopy ---
  {
    id: 'dipterocarp',
    textureName: 'DipterocarpGiant',
    size: 20,
    maxInstances: 10_000,
    yOffset: 9.3,
    fadeDistance: 500,
    maxDistance: 600,
    baseDensity: 0.15,
    placement: 'poisson',
    poissonMinDistance: 16,
    tier: 'canopy',
  },
  {
    id: 'banyan',
    textureName: 'TwisterBanyan',
    size: 18,
    maxInstances: 10_000,
    yOffset: 6.4,
    fadeDistance: 500,
    maxDistance: 600,
    baseDensity: 0.15,
    placement: 'poisson',
    poissonMinDistance: 16,
    tier: 'canopy',
  },
  {
    id: 'rubberTree',
    textureName: 'RubberTree',
    size: 15,
    maxInstances: 8_000,
    yOffset: 6.8,
    fadeDistance: 450,
    maxDistance: 550,
    baseDensity: 0.12,
    placement: 'poisson',
    poissonMinDistance: 16,
    tier: 'canopy',
  },
];

/** Lookup helper — returns undefined if id is unknown. */
export function getVegetationType(id: string): VegetationTypeConfig | undefined {
  return VEGETATION_TYPES.find(v => v.id === id);
}

/**
 * Serialisable subset sent to the chunk worker via postMessage.
 * Mirrors VegetationTypeConfig but drops the textureName (workers don't load textures).
 */
export interface WorkerVegetationTypeConfig {
  id: string;
  yOffset: number;
  baseDensity: number;
  placement: 'random' | 'poisson';
  poissonMinDistance?: number;
  tier: 'groundCover' | 'midLevel' | 'canopy';
}

/** Strip texture/GPU fields for worker transport. */
export function toWorkerVegetationConfigs(
  types: VegetationTypeConfig[],
): WorkerVegetationTypeConfig[] {
  return types.map(t => ({
    id: t.id,
    yOffset: t.yOffset,
    baseDensity: t.baseDensity,
    placement: t.placement,
    poissonMinDistance: t.poissonMinDistance,
    tier: t.tier,
  }));
}
