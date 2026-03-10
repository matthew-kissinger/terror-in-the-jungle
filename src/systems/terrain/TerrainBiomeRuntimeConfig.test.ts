import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { buildTerrainBiomeMaterialConfig } from './TerrainBiomeRuntimeConfig';
import { createTerrainMaterial } from './TerrainMaterial';
import { getBiome } from '../../config/biomes';
import { getGameModeConfig } from '../../config/gameModes';
import { GameMode } from '../../config/gameModeTypes';

const ALL_GAME_MODES: readonly GameMode[] = [
  GameMode.ZONE_CONTROL,
  GameMode.OPEN_FRONTIER,
  GameMode.TEAM_DEATHMATCH,
  GameMode.AI_SANDBOX,
  GameMode.A_SHAU_VALLEY,
];

function getBiomeIdsForMode(mode: GameMode): string[] {
  const config = getGameModeConfig(mode);
  const biomeIds = [config.terrain.defaultBiome];
  for (const rule of config.terrain.biomeRules ?? []) {
    if (!biomeIds.includes(rule.biomeId)) {
      biomeIds.push(rule.biomeId);
    }
  }
  return biomeIds;
}

describe('TerrainBiomeRuntimeConfig', () => {
  it('maps every game mode terrain biome to an on-disk terrain texture', () => {
    for (const mode of ALL_GAME_MODES) {
      for (const biomeId of getBiomeIdsForMode(mode)) {
        const biome = getBiome(biomeId);
        const texturePath = resolve(process.cwd(), 'public', 'assets', `${biome.groundTexture}.webp`);
        expect(existsSync(texturePath), `${mode} missing ${biome.groundTexture} for biome ${biomeId}`).toBe(true);
      }
    }
  });

  it('builds terrain material bindings for every game mode', () => {
    const textureByName = new Map<string, THREE.Texture>();
    for (const mode of ALL_GAME_MODES) {
      for (const biomeId of getBiomeIdsForMode(mode)) {
        const biome = getBiome(biomeId);
        textureByName.set(biome.groundTexture, new THREE.Texture());
      }
    }

    const assetLoader = {
      getTexture(name: string): THREE.Texture | undefined {
        return textureByName.get(name);
      },
    };

    for (const mode of ALL_GAME_MODES) {
      const config = getGameModeConfig(mode);
      const materialConfig = buildTerrainBiomeMaterialConfig(
        assetLoader as any,
        config.terrain.defaultBiome,
        config.terrain.biomeRules ?? [],
      );

      expect(materialConfig.layers.length).toBeGreaterThan(0);
      expect(materialConfig.layers.every((layer) => layer.texture instanceof THREE.Texture)).toBe(true);
    }
  });

  it('creates live terrain materials for every shipped game mode', () => {
    const textureByName = new Map<string, THREE.Texture>();
    for (const mode of ALL_GAME_MODES) {
      for (const biomeId of getBiomeIdsForMode(mode)) {
        const biome = getBiome(biomeId);
        textureByName.set(biome.groundTexture, new THREE.Texture());
      }
    }

    const assetLoader = {
      getTexture(name: string): THREE.Texture | undefined {
        return textureByName.get(name);
      },
    };

    const heightTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    const normalTexture = new THREE.DataTexture(new Uint8Array([128, 255, 128, 255]), 1, 1);

    for (const mode of ALL_GAME_MODES) {
      const config = getGameModeConfig(mode);
      const biomeConfig = buildTerrainBiomeMaterialConfig(
        assetLoader as any,
        config.terrain.defaultBiome,
        config.terrain.biomeRules ?? [],
      );

      const material = createTerrainMaterial({
        heightTexture,
        normalTexture,
        worldSize: config.worldSize,
        biomeConfig,
        splatmap: {
          layers: [],
          triplanarSlopeThreshold: 0.707,
          antiTilingStrength: 0.3,
        },
      });

      expect(material.userData.terrainUniforms).toBeDefined();
      expect(material.userData.terrainUniforms.biomeTexture0.value).toBeInstanceOf(THREE.Texture);
    }
  });
});
