/**
 * Biome definitions — each biome selects a ground texture and a vegetation palette.
 *
 * Game modes reference biomes by id. Noise-based modes typically use a single
 * default biome; DEM modes can use elevation/slope rules to classify chunks
 * into different biomes.
 */

export interface BiomeVegetationEntry {
  typeId: string;            // References VegetationTypeConfig.id
  densityMultiplier: number; // 0 = absent, 1 = normal, >1 = dense
}

export interface BiomeConfig {
  id: string;
  name: string;
  groundTexture: string;     // AssetLoader texture key for terrain
  groundTileScale: number;   // UV repeat per world unit
  groundRoughness: number;
  vegetationPalette: BiomeVegetationEntry[];
}

export interface BiomeClassificationRule {
  biomeId: string;
  elevationMin?: number;     // metres
  elevationMax?: number;
  slopeMax?: number;         // degrees
  priority: number;          // higher wins ties
}

export interface TerrainConfig {
  defaultBiome: string;                       // BiomeConfig.id used when no rules match
  biomeRules?: BiomeClassificationRule[];     // optional elevation/slope classification (DEM)
}

// ---------------------------------------------------------------------------
// Built-in biome presets
// ---------------------------------------------------------------------------

export const BIOME_DENSE_JUNGLE: BiomeConfig = {
  id: 'denseJungle',
  name: 'Dense Jungle',
  groundTexture: 'jungle-floor',
  groundTileScale: 0.1,
  groundRoughness: 0.85,
  vegetationPalette: [
    { typeId: 'fern',          densityMultiplier: 1.0 },
    { typeId: 'elephantEar',   densityMultiplier: 1.0 },
    { typeId: 'elephantGrass', densityMultiplier: 0.3 },
    { typeId: 'fanPalm',      densityMultiplier: 1.0 },
    { typeId: 'coconut',      densityMultiplier: 0.8 },
    { typeId: 'areca',        densityMultiplier: 0.6 },
    { typeId: 'bambooGrove',  densityMultiplier: 0.4 },
    { typeId: 'bananaPlant',  densityMultiplier: 0.5 },
    { typeId: 'dipterocarp',  densityMultiplier: 0.5 },
    { typeId: 'banyan',       densityMultiplier: 0.5 },
    { typeId: 'rubberTree',   densityMultiplier: 0.3 },
  ],
};

export const BIOME_HIGHLAND: BiomeConfig = {
  id: 'highland',
  name: 'Highland',
  groundTexture: 'rocky-highland',
  groundTileScale: 0.08,
  groundRoughness: 0.78,
  vegetationPalette: [
    { typeId: 'fern',          densityMultiplier: 0.6 },
    { typeId: 'elephantGrass', densityMultiplier: 0.5 },
    { typeId: 'fanPalm',      densityMultiplier: 0.3 },
    { typeId: 'areca',        densityMultiplier: 0.4 },
    { typeId: 'dipterocarp',  densityMultiplier: 0.8 },
    { typeId: 'rubberTree',   densityMultiplier: 0.5 },
  ],
};

export const BIOME_RICE_PADDY: BiomeConfig = {
  id: 'ricePaddy',
  name: 'Rice Paddy',
  groundTexture: 'rice-paddy',
  groundTileScale: 0.12,
  groundRoughness: 0.95,
  vegetationPalette: [
    { typeId: 'ricePaddyPlants', densityMultiplier: 1.5 },
    { typeId: 'elephantGrass',   densityMultiplier: 0.4 },
    { typeId: 'bananaPlant',     densityMultiplier: 0.3 },
  ],
};

export const BIOME_RIVERBANK: BiomeConfig = {
  id: 'riverbank',
  name: 'Riverbank',
  groundTexture: 'river-bank',
  groundTileScale: 0.1,
  groundRoughness: 0.9,
  vegetationPalette: [
    { typeId: 'elephantEar',   densityMultiplier: 1.2 },
    { typeId: 'fanPalm',      densityMultiplier: 0.8 },
    { typeId: 'coconut',      densityMultiplier: 1.0 },
    { typeId: 'mangrove',     densityMultiplier: 1.0 },
    { typeId: 'fern',         densityMultiplier: 0.5 },
  ],
};

export const BIOME_CLEARED: BiomeConfig = {
  id: 'cleared',
  name: 'Cleared Area',
  groundTexture: 'firebase-ground',
  groundTileScale: 0.1,
  groundRoughness: 0.88,
  vegetationPalette: [
    { typeId: 'elephantGrass', densityMultiplier: 0.3 },
  ],
};

export const BIOME_TALL_GRASS: BiomeConfig = {
  id: 'tallGrass',
  name: 'Tall Grass',
  groundTexture: 'tall-grass',
  groundTileScale: 0.1,
  groundRoughness: 0.87,
  vegetationPalette: [
    { typeId: 'elephantGrass', densityMultiplier: 1.5 },
    { typeId: 'fern',          densityMultiplier: 0.4 },
    { typeId: 'bananaPlant',   densityMultiplier: 0.2 },
  ],
};

export const BIOME_MUD_TRAIL: BiomeConfig = {
  id: 'mudTrail',
  name: 'Mud Trail',
  groundTexture: 'mud-ground',
  groundTileScale: 0.12,
  groundRoughness: 0.92,
  vegetationPalette: [
    { typeId: 'fern',          densityMultiplier: 0.2 },
    { typeId: 'elephantGrass', densityMultiplier: 0.1 },
  ],
};

export const BIOME_BAMBOO_GROVE: BiomeConfig = {
  id: 'bambooGrove',
  name: 'Bamboo Grove',
  groundTexture: 'bamboo-floor',
  groundTileScale: 0.11,
  groundRoughness: 0.84,
  vegetationPalette: [
    { typeId: 'bambooGrove',   densityMultiplier: 2.0 },
    { typeId: 'fern',          densityMultiplier: 0.8 },
    { typeId: 'elephantEar',   densityMultiplier: 0.3 },
  ],
};

export const BIOME_SWAMP: BiomeConfig = {
  id: 'swamp',
  name: 'Swamp',
  groundTexture: 'swamp',
  groundTileScale: 0.14,
  groundRoughness: 0.96,
  vegetationPalette: [
    { typeId: 'mangrove',      densityMultiplier: 1.2 },
    { typeId: 'elephantEar',   densityMultiplier: 0.8 },
    { typeId: 'fern',          densityMultiplier: 0.6 },
  ],
};

export const BIOME_DEFOLIATED: BiomeConfig = {
  id: 'defoliated',
  name: 'Defoliated Zone',
  groundTexture: 'defoliated-ground',
  groundTileScale: 0.1,
  groundRoughness: 0.9,
  vegetationPalette: [
    { typeId: 'elephantGrass', densityMultiplier: 0.1 },
  ],
};

/** All built-in biomes keyed by id for fast lookup. */
export const BIOMES: Record<string, BiomeConfig> = {
  [BIOME_DENSE_JUNGLE.id]: BIOME_DENSE_JUNGLE,
  [BIOME_HIGHLAND.id]:     BIOME_HIGHLAND,
  [BIOME_RICE_PADDY.id]:   BIOME_RICE_PADDY,
  [BIOME_RIVERBANK.id]:    BIOME_RIVERBANK,
  [BIOME_CLEARED.id]:      BIOME_CLEARED,
  [BIOME_TALL_GRASS.id]:   BIOME_TALL_GRASS,
  [BIOME_MUD_TRAIL.id]:    BIOME_MUD_TRAIL,
  [BIOME_BAMBOO_GROVE.id]: BIOME_BAMBOO_GROVE,
  [BIOME_SWAMP.id]:        BIOME_SWAMP,
  [BIOME_DEFOLIATED.id]:   BIOME_DEFOLIATED,
};

/** Resolve a BiomeConfig by id and fail fast when configuration is invalid. */
export function getBiome(id: string): BiomeConfig {
  const biome = BIOMES[id];
  if (!biome) {
    throw new Error(`Unknown biome id: ${id}`);
  }
  return biome;
}

/**
 * Serialisable biome subset sent to the chunk worker.
 * Only the vegetation palette is needed — ground texture is handled on the main thread.
 */
export interface WorkerBiomeConfig {
  id: string;
  vegetationPalette: BiomeVegetationEntry[];
}

export function toWorkerBiomeConfig(biome: BiomeConfig): WorkerBiomeConfig {
  return {
    id: biome.id,
    vegetationPalette: biome.vegetationPalette,
  };
}
