// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getBiome } from './biomes';
import { VEGETATION_TYPES } from './vegetationTypes';
import { vegetationLibraryGroundCards } from './vegetation/vegetationLibraryAdapter';
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
    // Dense understory is now the library ground-cover CARDS (kebab ids), not the old
    // fern/elephantEar billboards (removed). The instanced cross cards cover more area per
    // instance, so the multiplier backbone is lower while coverage stays comparable.
    const denseGroundCoverMultiplier = denseJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'understory-fern' || entry.typeId === 'taro-elephant-ear')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);
    const highlandGroundCoverMultiplier =
      getBiome('highland').vegetationPalette.find((entry) => entry.typeId === 'understory-fern')?.densityMultiplier ?? 0;

    // The old fanPalm/bambooGrove billboards are gone from the jungle palette (promoted to heroes).
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'fanPalm')).toBe(false);
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'bambooGrove')).toBe(false);
    // The old fern/elephantEar billboards are gone too (replaced by the instanced cards).
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'fern')).toBe(false);
    expect(denseJungle.vegetationPalette.some((e) => e.typeId === 'elephantEar')).toBe(false);
    // The tall palm hero is denser than the bamboo hero (palm is the prominent mid feature).
    expect(fanPalmHero).toBeGreaterThan(bambooHero);
    // Card ground cover is still the dense understory backbone (highland now carries the same
    // understory-fern ground card instead of the retired fern billboard).
    expect(denseGroundCoverMultiplier).toBeGreaterThan(1.0);
    expect(highlandGroundCoverMultiplier).toBeGreaterThan(0.7);
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
    // Ground cover is now the library cards (understory-fern + taro-elephant-ear); both
    // jungle palettes carry the same card id set so they stay directly comparable.
    const ashauGroundCoverMultiplier = ashauJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'understory-fern' || entry.typeId === 'taro-elephant-ear')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);
    const denseGroundCoverMultiplier = denseJungle.vegetationPalette
      .filter((entry) => entry.typeId === 'understory-fern' || entry.typeId === 'taro-elephant-ear')
      .reduce((sum, entry) => sum + entry.densityMultiplier, 0);

    expect(ashauIds).toEqual(denseIds);
    expect(ashauGroundCoverMultiplier).toBeLessThan(denseGroundCoverMultiplier);
    expect(ashauGroundCoverMultiplier).toBeLessThan(denseGroundCoverMultiplier * 0.6);
    expect(ashauGroundCoverMultiplier).toBeGreaterThan(0.5);
  });

  it('quarantines the broken low-angle coconut atlas row and trunk cross-fade', () => {
    const coconut = VEGETATION_TYPES.find((type) => type.id === 'coconut');

    expect(coconut).toBeDefined();
    expect(coconut?.imposterAtlas?.stableAzimuthColumn).toBe(2);
    expect(coconut?.imposterAtlas?.maxElevationRow).toBe(2);
  });

  it('wires the library ground-cover cards into the jungle + riverbank palettes (dual-namespace)', () => {
    const groundCards = vegetationLibraryGroundCards();
    const denseIds = getBiome('denseJungle').vegetationPalette.map((entry) => entry.typeId);
    const ashauIds = getBiome('ashauJungle').vegetationPalette.map((entry) => entry.typeId);
    const riverbankIds = getBiome('riverbank').vegetationPalette.map((entry) => entry.typeId);

    // The new kebab ground-card ids are present and resolve to a baked archetype.
    for (const slug of ['understory-fern', 'taro-elephant-ear']) {
      expect(groundCards[slug], slug).toBeDefined();
      expect(denseIds).toContain(slug);
      expect(ashauIds).toContain(slug);
    }
    expect(groundCards['rice-paddy']).toBeDefined();
    expect(riverbankIds).toContain('rice-paddy');

    // Dual-namespace: kebab ground-card ids never collide with the camelCase Pixel
    // Forge billboard ids, so the billboard scatterer leaves them alone.
    const billboardIds = new Set(VEGETATION_TYPES.map((type) => type.id));
    for (const slug of Object.keys(groundCards)) {
      expect(billboardIds.has(slug)).toBe(false);
    }

    // The old Pixel Forge fern/elephantEar billboards are now TRIMMED from the jungle +
    // riverbank palettes: the live GroundCardScatterer cards replace them (dual-namespace,
    // re-tuned to keep total ground cover similar-or-slightly-lower).
    for (const ids of [denseIds, ashauIds, riverbankIds]) {
      expect(ids).not.toContain('fern');
      expect(ids).not.toContain('elephantEar');
    }
  });

  it('finishes the fern/elephantEar ground-card cutover in tallGrass + bambooGrove', () => {
    const groundCards = vegetationLibraryGroundCards();
    const tallGrass = getBiome('tallGrass').vegetationPalette;
    const bambooGrove = getBiome('bambooGrove').vegetationPalette;

    for (const palette of [tallGrass, bambooGrove]) {
      const ids = palette.map((entry) => entry.typeId);
      // The old camelCase fern/elephantEar billboards are gone, replaced by baked cards.
      expect(ids).not.toContain('fern');
      expect(ids).not.toContain('elephantEar');
      expect(ids).toContain('understory-fern');
      expect(ids).toContain('taro-elephant-ear');
      // Both swapped ids resolve to a baked ground-card archetype (live, not a dangling id).
      expect(groundCards['understory-fern']).toBeDefined();
      expect(groundCards['taro-elephant-ear']).toBeDefined();
    }

    // The dense bamboo grove is now a ground CARD (bamboo-thicket): the far band is a
    // baked alpha card and the near-mesh tier is globally capped, so the old billboard's
    // per-instance GLB-clone memory blowup at this density is gone. Density still reads as
    // dense (>1) but is no longer the wall-it-off value retuned in vegetation-density-retune.
    const denseBamboo = bambooGrove.find((entry) => entry.typeId === 'bamboo-thicket');
    expect(denseBamboo?.densityMultiplier).toBeGreaterThan(1);
    expect(groundCards['bamboo-thicket']).toBeDefined();
  });

  it('leaves no old fern/elephantEar/bananaPlant billboard id in any biome palette', () => {
    // The fern/elephantEar/banana-plant cards (and now the bamboo-thicket + coconut-palm
    // cards) cover these. fanPalm + the sparse highland bamboo billboard are the remaining
    // camelCase holdouts.
    const biomeIds = [
      'ashauJungle', 'denseJungle', 'highland', 'ricePaddy', 'riverbank',
      'cleared', 'tallGrass', 'mudTrail', 'bambooGrove', 'swamp', 'defoliated',
    ];
    for (const biomeId of biomeIds) {
      const ids = getBiome(biomeId).vegetationPalette.map((entry) => entry.typeId);
      expect(ids, biomeId).not.toContain('fern');
      expect(ids, biomeId).not.toContain('elephantEar');
      expect(ids, biomeId).not.toContain('bananaPlant');
    }
  });

  it('wires the baked banana-plant ground card into the jungle/riverbank/tallGrass palettes', () => {
    const groundCards = vegetationLibraryGroundCards();
    expect(groundCards['banana-plant']).toBeDefined();
    for (const biomeId of ['denseJungle', 'ashauJungle', 'riverbank', 'tallGrass', 'ricePaddy', 'swamp']) {
      const ids = getBiome(biomeId).vegetationPalette.map((entry) => entry.typeId);
      expect(ids, biomeId).toContain('banana-plant');
    }
    // Dual-namespace: the kebab banana-plant card id never collides with the camelCase
    // bananaPlant billboard id, so the billboard scatterer ignores it.
    const billboardIds = new Set(VEGETATION_TYPES.map((type) => type.id));
    expect(billboardIds.has('banana-plant')).toBe(false);
  });

  it('wires the bamboo-thicket + coconut-palm cards (kiln-held-assets cutover)', () => {
    const groundCards = vegetationLibraryGroundCards();
    // Both new cards resolve to live ground-card archetypes.
    expect(groundCards['bamboo-thicket']).toBeDefined();
    expect(groundCards['coconut-palm']).toBeDefined();
    // Dense bamboo -> bamboo-thicket card; coconut billboard -> coconut-palm card (swamp).
    expect(getBiome('bambooGrove').vegetationPalette.map((e) => e.typeId)).toContain('bamboo-thicket');
    expect(getBiome('swamp').vegetationPalette.map((e) => e.typeId)).toContain('coconut-palm');
    // The old camelCase 'coconut' billboard id is gone from every palette.
    const allBiomeIds = ['ashauJungle', 'denseJungle', 'highland', 'ricePaddy', 'riverbank',
      'cleared', 'tallGrass', 'mudTrail', 'bambooGrove', 'swamp', 'defoliated'];
    for (const biomeId of allBiomeIds) {
      expect(getBiome(biomeId).vegetationPalette.map((e) => e.typeId), biomeId).not.toContain('coconut');
    }
    // Dual-namespace: kebab card ids never collide with the camelCase billboard scatterer ids.
    const billboardIds = new Set(VEGETATION_TYPES.map((type) => type.id));
    expect(billboardIds.has('bamboo-thicket')).toBe(false);
    expect(billboardIds.has('coconut-palm')).toBe(false);
  });
});
