import type { AssetLoader } from '../assets/AssetLoader';
import { getBiome, type BiomeClassificationRule, type BiomeVegetationEntry } from '../../config/biomes';
import type { TerrainBiomeMaterialConfig, TerrainBiomeRuleConfig } from './TerrainMaterial';

interface TerrainVegetationRuntimeConfig {
  biomeIds: string[];
  biomePalettes: Map<string, BiomeVegetationEntry[]>;
}

function getConfiguredBiomeIds(
  defaultBiomeId: string,
  biomeRules: BiomeClassificationRule[],
  extraBiomeIds: string[] = [],
): string[] {
  const biomeIds = [defaultBiomeId];
  for (const rule of biomeRules) {
    if (!biomeIds.includes(rule.biomeId)) {
      biomeIds.push(rule.biomeId);
    }
  }
  for (const biomeId of extraBiomeIds) {
    if (!biomeIds.includes(biomeId)) {
      biomeIds.push(biomeId);
    }
  }
  return biomeIds;
}

export function buildTerrainVegetationRuntimeConfig(
  defaultBiomeId: string,
  biomeRules: BiomeClassificationRule[],
): TerrainVegetationRuntimeConfig {
  const biomeIds = getConfiguredBiomeIds(defaultBiomeId, biomeRules);
  const biomePalettes = new Map<string, BiomeVegetationEntry[]>();
  for (const biomeId of biomeIds) {
    biomePalettes.set(biomeId, getBiome(biomeId).vegetationPalette);
  }
  return { biomeIds, biomePalettes };
}

export function buildTerrainBiomeMaterialConfig(
  assetLoader: AssetLoader,
  defaultBiomeId: string,
  biomeRules: BiomeClassificationRule[],
): TerrainBiomeMaterialConfig {
  const orderedBiomes = getConfiguredBiomeIds(defaultBiomeId, biomeRules, ['highland']).map((biomeId) => getBiome(biomeId));

  const biomeSlotById = new Map<string, number>();
  const layers = orderedBiomes.map((biome, index) => {
    biomeSlotById.set(biome.id, index);
    const texture = assetLoader.getTexture(biome.groundTexture);
    if (!texture) {
      throw new Error(`Missing terrain texture "${biome.groundTexture}" for biome "${biome.id}"`);
    }
    return {
      biomeId: biome.id,
      texture,
      tileScale: biome.groundTileScale,
      roughness: biome.groundRoughness,
    };
  });

  const rules: TerrainBiomeRuleConfig[] = biomeRules
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .map((rule) => {
      const biomeSlot = biomeSlotById.get(rule.biomeId);
      if (biomeSlot === undefined) {
        throw new Error(`Biome rule references unresolved biome "${rule.biomeId}"`);
      }
      return {
        biomeSlot,
        elevationMin: rule.elevationMin ?? -1e9,
        elevationMax: rule.elevationMax ?? 1e9,
        elevationBlendWidth: rule.elevationBlendWidth,
        minUpDot: rule.slopeMax !== undefined ? Math.cos((rule.slopeMax * Math.PI) / 180) : -1,
        priority: rule.priority,
      };
    });

  return { layers, rules, cliffRockBiomeSlot: biomeSlotById.get('highland') ?? 0 };
}
