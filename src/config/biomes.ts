// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  elevationBlendWidth?: number; // shader material blend around elevation thresholds
  priority: number;          // higher wins ties
}

export interface TerrainFarCanopyTintConfig {
  enabled: boolean;
  startDistance?: number;
  endDistance?: number;
  strength?: number;
  fogStrength?: number;
  coverageDistance?: number;
  coverageStrength?: number;
  coverageScale?: number;
  color?: readonly [number, number, number];
}

export interface TerrainConfig {
  defaultBiome: string;                       // BiomeConfig.id used when no rules match
  biomeRules?: BiomeClassificationRule[];     // optional elevation/slope classification (DEM)
  farCanopyTint?: TerrainFarCanopyTintConfig;
}

// ---------------------------------------------------------------------------
// Built-in biome presets
// ---------------------------------------------------------------------------

const BIOME_DENSE_JUNGLE: BiomeConfig = {
  id: 'denseJungle',
  name: 'Dense Jungle',
  groundTexture: 'jungle-floor',
  groundTileScale: 0.14,
  groundRoughness: 0.85,
  vegetationPalette: [
    // GLB canopy heroes (Phase II): scattered as a real mesh near, octa impostor far.
    // typeId matches the vegetation-library asset id / static-impostor archetype slug.
    // Ignored by the billboard scatterer (no matching VegetationTypeConfig); picked up
    // only by the GLBHeroScatterer when hero scatter is enabled.
    { typeId: 'jungle-tree',  densityMultiplier: 0.2 },
    { typeId: 'teak-a',       densityMultiplier: 0.1 },
    { typeId: 'teak-b',       densityMultiplier: 0.08 },
    { typeId: 'rubber-a',     densityMultiplier: 0.1 },
    { typeId: 'rubber-b',     densityMultiplier: 0.08 },
    // GLB mid heroes (promoted understory): full-res mesh near, octa impostor far.
    // Replace the old fanPalm/bambooGrove billboards; sparse so the per-instance GLB
    // clone cost stays bounded (NOT placed in the dense bambooGrove biome).
    { typeId: 'fan-palm',     densityMultiplier: 0.55 },
    { typeId: 'bamboo-grove', densityMultiplier: 0.28 },
    // Dense understory is now the library ground-cover cards (kebab ids): real cheap mesh
    // near, INSTANCED alpha card far, hard-culled. Consumed by the GroundCardScatterer
    // (keyed on these slugs via vegetationLibraryGroundCards()); inert for the billboard +
    // hero scatterers, which do not recognise the slug. These REPLACE the old fern /
    // elephantEar billboards (removed); densities re-tuned to keep total ground cover
    // similar-or-slightly-lower (the cross cards cover more area per instance).
    { typeId: 'understory-fern',   densityMultiplier: 0.8 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.5 },
    { typeId: 'coconut-palm',      densityMultiplier: 0.8 },
    // Banana fronds: real mesh near, baked alpha card far (kebab id, GroundCardScatterer).
    { typeId: 'banana-plant', densityMultiplier: 0.5 },
  ],
};

const BIOME_ASHAU_JUNGLE: BiomeConfig = {
  id: 'ashauJungle',
  name: 'A Shau Jungle',
  groundTexture: 'jungle-floor',
  groundTileScale: 0.14,
  groundRoughness: 0.85,
  vegetationPalette: [
    { typeId: 'jungle-tree',  densityMultiplier: 0.15 },
    { typeId: 'teak-a',       densityMultiplier: 0.08 },
    { typeId: 'teak-b',       densityMultiplier: 0.06 },
    { typeId: 'rubber-a',     densityMultiplier: 0.06 },
    { typeId: 'rubber-b',     densityMultiplier: 0.05 },
    { typeId: 'fan-palm',     densityMultiplier: 0.45 },
    { typeId: 'bamboo-grove', densityMultiplier: 0.13 },
    // Library ground-cover cards (lighter than denseJungle; same id set so the two jungle
    // palettes stay comparable). Replace the old fern / elephantEar billboards (removed).
    { typeId: 'understory-fern',   densityMultiplier: 0.4 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.25 },
    { typeId: 'coconut-palm',      densityMultiplier: 0.55 },
    { typeId: 'banana-plant', densityMultiplier: 0.28 },
  ],
};

const BIOME_HIGHLAND: BiomeConfig = {
  id: 'highland',
  name: 'Highland',
  groundTexture: 'rocky-highland',
  groundTileScale: 0.1,
  groundRoughness: 0.78,
  vegetationPalette: [
    // Ground cover is now the library understory-fern card (kebab id, GroundCardScatterer);
    // the old fern billboard is removed. fanPalm + sparse bamboo billboards stay (no card art).
    { typeId: 'understory-fern', densityMultiplier: 0.8 },
    { typeId: 'fanPalm',      densityMultiplier: 0.3 },
    { typeId: 'bambooGrove',  densityMultiplier: 0.2 },
  ],
};

const BIOME_RICE_PADDY: BiomeConfig = {
  id: 'ricePaddy',
  name: 'Rice Paddy',
  groundTexture: 'rice-paddy',
  groundTileScale: 0.12,
  groundRoughness: 0.95,
  vegetationPalette: [
    // Library ground-cover cards replace the old fern/elephantEar/bananaPlant billboards
    // (kebab ids, GroundCardScatterer): mesh near, baked alpha card far.
    { typeId: 'understory-fern',   densityMultiplier: 0.7 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.35 },
    { typeId: 'banana-plant',      densityMultiplier: 0.3 },
  ],
};

const BIOME_RIVERBANK: BiomeConfig = {
  id: 'riverbank',
  name: 'Riverbank',
  groundTexture: 'river-bank',
  groundTileScale: 0.1,
  groundRoughness: 0.9,
  vegetationPalette: [
    { typeId: 'jungle-tree',  densityMultiplier: 0.28 },
    { typeId: 'teak-a',       densityMultiplier: 0.08 },
    { typeId: 'rubber-a',     densityMultiplier: 0.06 },
    { typeId: 'fan-palm',     densityMultiplier: 0.6 },
    { typeId: 'coconut-palm',      densityMultiplier: 1.25 },
    { typeId: 'banana-plant', densityMultiplier: 0.45 },
    // Library ground-cover cards: the wet riverbank understory. The taro card carries the
    // broadleaf cover that the dense elephantEar billboard used to (both elephantEar + fern
    // billboards removed); rice paddy thrives here. Total ground cover kept slightly lower.
    { typeId: 'understory-fern',   densityMultiplier: 0.45 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.55 },
    { typeId: 'rice-paddy',        densityMultiplier: 0.5 },
  ],
};

const BIOME_CLEARED: BiomeConfig = {
  id: 'cleared',
  name: 'Cleared Area',
  groundTexture: 'firebase-ground',
  groundTileScale: 0.1,
  groundRoughness: 0.88,
  vegetationPalette: [
    // Sparse understory-fern card replaces the old fern billboard (kebab id).
    { typeId: 'understory-fern', densityMultiplier: 0.25 },
  ],
};

const BIOME_TALL_GRASS: BiomeConfig = {
  id: 'tallGrass',
  name: 'Tall Grass',
  groundTexture: 'tall-grass',
  groundTileScale: 0.1,
  groundRoughness: 0.87,
  vegetationPalette: [
    // Library ground-cover cards replace the old fern/elephantEar/bananaPlant billboards
    // (kebab ids, GroundCardScatterer): mesh near, baked alpha card far.
    { typeId: 'understory-fern',   densityMultiplier: 1.2 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.5 },
    { typeId: 'banana-plant',      densityMultiplier: 0.2 },
  ],
};

const BIOME_MUD_TRAIL: BiomeConfig = {
  id: 'mudTrail',
  name: 'Mud Trail',
  groundTexture: 'mud-ground',
  groundTileScale: 0.12,
  groundRoughness: 0.92,
  vegetationPalette: [
    // Sparse understory-fern card replaces the old fern billboard (kebab id).
    { typeId: 'understory-fern', densityMultiplier: 0.2 },
  ],
};

const BIOME_BAMBOO_GROVE: BiomeConfig = {
  id: 'bambooGrove',
  name: 'Bamboo Grove',
  groundTexture: 'bamboo-floor',
  groundTileScale: 0.135,
  groundRoughness: 0.84,
  vegetationPalette: [
    // Dense bamboo is now a ground CARD (bamboo-thicket, kebab id): the far band is a
    // baked alpha card (2 tris) and the near-mesh tier is globally capped at 32, so the
    // old billboard's per-instance GLB-clone memory blowup at this density (2.8) is gone.
    // The sparse hero bamboo-grove (mesh+octa) stays for low-density jungle understory.
    { typeId: 'bamboo-thicket',    densityMultiplier: 2.8 },
    // Understory cards (kebab ids) replace the old fern/elephantEar billboards.
    { typeId: 'understory-fern',   densityMultiplier: 0.8 },
    { typeId: 'taro-elephant-ear', densityMultiplier: 0.3 },
  ],
};

const BIOME_SWAMP: BiomeConfig = {
  id: 'swamp',
  name: 'Swamp',
  groundTexture: 'swamp',
  groundTileScale: 0.14,
  groundRoughness: 0.96,
  vegetationPalette: [
    { typeId: 'coconut-palm',  densityMultiplier: 1.0 },
    { typeId: 'fanPalm',       densityMultiplier: 0.9 },
    // Understory cards (kebab ids) replace the old fern/elephantEar/bananaPlant billboards;
    // the coconut palm is now the coconut-palm card (mesh-near + alpha card far). fanPalm
    // stays a billboard (no card art for that species yet).
    { typeId: 'taro-elephant-ear', densityMultiplier: 1.2 },
    { typeId: 'understory-fern',   densityMultiplier: 0.75 },
    { typeId: 'banana-plant',      densityMultiplier: 0.55 },
  ],
};

const BIOME_DEFOLIATED: BiomeConfig = {
  id: 'defoliated',
  name: 'Defoliated Zone',
  groundTexture: 'defoliated-ground',
  groundTileScale: 0.1,
  groundRoughness: 0.9,
  vegetationPalette: [
    // Sparse understory-fern card replaces the old fern billboard (kebab id).
    { typeId: 'understory-fern', densityMultiplier: 0.1 },
  ],
};

/** All built-in biomes keyed by id for fast lookup. */
const BIOMES: Record<string, BiomeConfig> = {
  [BIOME_DENSE_JUNGLE.id]: BIOME_DENSE_JUNGLE,
  [BIOME_ASHAU_JUNGLE.id]: BIOME_ASHAU_JUNGLE,
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
