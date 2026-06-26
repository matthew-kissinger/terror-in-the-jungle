// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getBiome } from './biomes';
import { VEGETATION_TYPES } from './vegetationTypes';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_RETIRED_VEGETATION_IDS,
  PIXEL_FORGE_TEXTURE_ASSETS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from './pixelForgeAssets';

const BANANA_PLANT_ATLAS_PATH =
  'public/assets/pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png';

describe('VEGETATION_TYPES production imposter policy', () => {
  it('marks every vegetation type as a GLB-sourced imposter target', () => {
    expect(VEGETATION_TYPES.length).toBeGreaterThan(0);
    expect(VEGETATION_TYPES.every((type) => type.representation === 'imposter')).toBe(true);
  });

  it('uses compact hemisphere-lit profiles for dense ground cover', () => {
    const groundCover = VEGETATION_TYPES.filter((type) => type.tier === 'groundCover');

    expect(groundCover.map((type) => type.id).sort()).toEqual([
      'elephantEar',
      'fern',
    ]);
    expect(groundCover.every((type) => type.atlasProfile === 'ground-compact')).toBe(true);
    expect(groundCover.every((type) => type.shaderProfile === 'hemisphere')).toBe(true);
  });

  it('reserves normal-lit profiles for mid-level and canopy vegetation', () => {
    const tallVegetation = VEGETATION_TYPES.filter((type) => type.tier !== 'groundCover');

    expect(tallVegetation.length).toBeGreaterThan(0);
    expect(tallVegetation.every((type) => type.shaderProfile === 'normal-lit')).toBe(true);
    expect(tallVegetation.every((type) => type.normalSpace === 'capture-view')).toBe(true);
    expect(tallVegetation.every((type) => type.atlasProfile !== 'ground-compact')).toBe(true);
  });

  it('keeps hemisphere-only ground-cover normal maps out of the startup texture manifest', () => {
    const manifestNames = new Set(PIXEL_FORGE_TEXTURE_ASSETS.map((asset) => asset.name));
    const groundCover = PIXEL_FORGE_VEGETATION_ASSETS.filter((asset) => asset.shaderProfile === 'hemisphere');
    const normalLit = PIXEL_FORGE_VEGETATION_ASSETS.filter((asset) => asset.shaderProfile === 'normal-lit');

    expect(groundCover.map((asset) => asset.id).sort()).toEqual(['elephantEar', 'fern']);
    for (const asset of groundCover) {
      expect(manifestNames).toContain(asset.textureName);
      expect(manifestNames).not.toContain(asset.normalTextureName);
    }
    for (const asset of normalLit) {
      expect(manifestNames).toContain(asset.textureName);
      expect(manifestNames).toContain(asset.normalTextureName);
    }
  });

  it('uses only approved Pixel Forge vegetation assets', () => {
    const approvedIds = PIXEL_FORGE_VEGETATION_ASSETS.map((asset) => asset.id).sort();
    const runtimeIds = VEGETATION_TYPES.map((type) => type.id).sort();

    expect(runtimeIds).toEqual(approvedIds);
    expect(runtimeIds).toEqual([
      'bambooGrove',
      'bananaPlant',
      'coconut',
      'elephantEar',
      'fanPalm',
      'fern',
    ]);
    for (const excludedId of [
      ...PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
      ...PIXEL_FORGE_RETIRED_VEGETATION_IDS,
    ]) {
      expect(runtimeIds).not.toContain(excludedId);
    }
  });

  it('keeps the retired small palm out of runtime vegetation and biome palettes', () => {
    const runtimeIds = VEGETATION_TYPES.map((type) => type.id);
    const biomeIds = [
      'ashauJungle',
      'denseJungle',
      'highland',
      'ricePaddy',
      'riverbank',
      'cleared',
      'tallGrass',
      'mudTrail',
      'bambooGrove',
      'swamp',
      'defoliated',
    ];

    for (const retiredId of PIXEL_FORGE_RETIRED_VEGETATION_IDS) {
      expect(runtimeIds).not.toContain(retiredId);
      for (const biomeId of biomeIds) {
        expect(getBiome(biomeId).vegetationPalette.map((entry) => entry.typeId)).not.toContain(retiredId);
      }
    }
  });

  it('does not reference old vegetation texture keys', () => {
    for (const type of VEGETATION_TYPES) {
      expect(type.textureName.startsWith('PixelForge.Vegetation.')).toBe(true);
      expect(type.normalTextureName?.startsWith('PixelForge.Vegetation.')).toBe(true);
      expect(type.imposterAtlas).toBeDefined();
    }
  });

  it('grounds low-angle atlas silhouettes so visible vegetation bases stay near terrain', () => {
    const lowAngleVisibleBasePaddingMeters: Record<string, number> = {
      bambooGrove: 0.56,
      bananaPlant: 0.96,
      coconut: 2.23,
      elephantEar: 2.0,
      fanPalm: 2.77,
      fern: 0.42,
    };

    for (const type of VEGETATION_TYPES) {
      const visiblePadding = lowAngleVisibleBasePaddingMeters[type.id];
      expect(visiblePadding).toBeDefined();
      const visibleBaseY = type.yOffset - type.size * 0.5 + visiblePadding;
      expect(visibleBaseY).toBeGreaterThanOrEqual(-0.3);
      expect(visibleBaseY).toBeLessThanOrEqual(0.3);
    }
  });

  it('promotes the approved palms as the first runtime canopy tree tier', () => {
    const fanPalm = VEGETATION_TYPES.find((type) => type.id === 'fanPalm');
    const coconut = VEGETATION_TYPES.find((type) => type.id === 'coconut');
    const canopyIds = VEGETATION_TYPES
      .filter((type) => type.tier === 'canopy')
      .map((type) => type.id)
      .sort();

    expect(fanPalm).toBeDefined();
    expect(coconut).toBeDefined();
    expect(fanPalm?.size).toBeGreaterThan(16);
    expect(coconut?.size).toBeGreaterThan(25);
    expect(canopyIds).toEqual(['coconut', 'fanPalm']);
  });

  it('lifts and enlarges fern ground cover so it is not buried below terrain', () => {
    const fern = VEGETATION_TYPES.find((type) => type.id === 'fern');

    expect(fern).toBeDefined();
    expect(fern?.size).toBeGreaterThan(4.5);
    expect((fern?.yOffset ?? 0) - ((fern?.size ?? 0) * 0.5)).toBeGreaterThan(-0.35);
  });

  it('lifts and slope-caps banana plant impostors so they do not sit half below terrain', () => {
    const bananaPlant = VEGETATION_TYPES.find((type) => type.id === 'bananaPlant');

    expect(bananaPlant).toBeDefined();
    expect((bananaPlant?.yOffset ?? 0) - ((bananaPlant?.size ?? 0) * 0.5) + 0.96)
      .toBeGreaterThanOrEqual(0);
    expect(bananaPlant?.maxSlopeDeg).toBeLessThanOrEqual(18);
  });

  it('keeps the banana plant stem green instead of cyan-blue', async () => {
    const { data } = await sharp(BANANA_PLANT_ATLAS_PATH)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let strongCyanStemPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 24) {
        continue;
      }

      if (r < 90 && g > 95 && b > 85 && b > r + 35 && g > r + 45) {
        strongCyanStemPixels += 1;
      }
    }

    expect(strongCyanStemPixels).toBe(0);
  });

  it('slope-caps ground and mid-level random vegetation that can clip into hillside terrain', () => {
    const randomTypes = VEGETATION_TYPES
      .filter((type) => type.placement === 'random')
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(randomTypes.map((type) => type.id)).toEqual([
      'bananaPlant',
      'elephantEar',
      'fern',
    ]);
    expect(randomTypes.every((type) => type.maxSlopeDeg !== undefined)).toBe(true);
    expect(VEGETATION_TYPES.find((type) => type.id === 'fern')?.maxSlopeDeg).toBeLessThanOrEqual(24);
    expect(VEGETATION_TYPES.find((type) => type.id === 'elephantEar')?.maxSlopeDeg).toBeLessThanOrEqual(22);
  });

  it('promotes the tall palm + bamboo to GLB heroes and keeps trimmed ground cover', () => {
    const bamboo = VEGETATION_TYPES.find((type) => type.id === 'bambooGrove');
    const denseJungle = getBiome('denseJungle');
    // Palms + bamboo are now GLB hero archetypes (kebab library ids), not billboards.
    const fanPalmHero =
      denseJungle.vegetationPalette.find((entry) => entry.typeId === 'fan-palm')?.densityMultiplier ?? 0;
    const bambooHero =
      denseJungle.vegetationPalette.find((entry) => entry.typeId === 'bamboo-grove')?.densityMultiplier ?? 0;
    const denseGroundCoverMultiplier = denseJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'fern' || entry.typeId === 'elephantEar')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);
    const highlandFernMultiplier =
      getBiome('highland').vegetationPalette.find((entry) => entry.typeId === 'fern')?.densityMultiplier ?? 0;

    // The old fanPalm/bambooGrove billboards are gone from the jungle palette (promoted to heroes).
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'fanPalm')).toBe(false);
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'bambooGrove')).toBe(false);
    // The tall palm hero is denser than the bamboo hero (palm is the prominent mid feature).
    expect(fanPalmHero).toBeGreaterThan(bambooHero);
    // Ground cover trimmed for fill-rate headroom but still the understory backbone.
    expect(denseGroundCoverMultiplier).toBeGreaterThan(1.5);
    expect(highlandFernMultiplier).toBeGreaterThan(0.7);
    // The bamboo billboard config (still used by the dense bambooGrove biome) stays clustered.
    expect(bamboo?.poissonMinDistance).toBeLessThan(8);
    expect(bamboo?.cluster?.scale).toBeGreaterThan(200);
    expect(bamboo?.cluster?.threshold).toBeGreaterThan(0.7);
  });

  it('keeps the A Shau jungle palette lighter than the default dense jungle palette', () => {
    const ashauJungle = getBiome('ashauJungle');
    const denseJungle = getBiome('denseJungle');
    const ashauIds = ashauJungle.vegetationPalette.map((entry) => entry.typeId).sort();
    const denseIds = denseJungle.vegetationPalette.map((entry) => entry.typeId).sort();
    const ashauGroundCoverMultiplier = ashauJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'fern' || entry.typeId === 'elephantEar')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);
    const denseGroundCoverMultiplier = denseJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'fern' || entry.typeId === 'elephantEar')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);

    expect(ashauIds).toEqual(denseIds);
    expect(ashauGroundCoverMultiplier).toBeLessThan(denseGroundCoverMultiplier);
    expect(ashauGroundCoverMultiplier).toBeLessThan(denseGroundCoverMultiplier * 0.5);
    expect(ashauGroundCoverMultiplier).toBeGreaterThan(0.6);
  });

  it('quarantines the broken low-angle coconut atlas row and trunk cross-fade', () => {
    const coconut = VEGETATION_TYPES.find((type) => type.id === 'coconut');

    expect(coconut).toBeDefined();
    expect(coconut?.imposterAtlas?.stableAzimuthColumn).toBe(2);
    expect(coconut?.imposterAtlas?.maxElevationRow).toBe(2);
  });
});
