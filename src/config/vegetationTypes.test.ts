import { describe, expect, it } from 'vitest';
import { VEGETATION_TYPES } from './vegetationTypes';
import { PIXEL_FORGE_BLOCKED_VEGETATION_IDS, PIXEL_FORGE_VEGETATION_ASSETS } from './pixelForgeAssets';

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
      'giantPalm',
    ]);
    for (const blockedId of PIXEL_FORGE_BLOCKED_VEGETATION_IDS) {
      expect(runtimeIds).not.toContain(blockedId);
    }
  });

  it('does not reference old vegetation texture keys', () => {
    for (const type of VEGETATION_TYPES) {
      expect(type.textureName.startsWith('PixelForge.Vegetation.')).toBe(true);
      expect(type.normalTextureName?.startsWith('PixelForge.Vegetation.')).toBe(true);
      expect(type.imposterAtlas).toBeDefined();
    }
  });

  it('grounds low-angle atlas silhouettes so visible vegetation bases do not float', () => {
    const lowAngleVisibleBasePaddingMeters: Record<string, number> = {
      bambooGrove: 0.56,
      coconut: 2.41,
      elephantEar: 2.10,
      fanPalm: 2.79,
      giantPalm: 0.96,
    };

    for (const type of VEGETATION_TYPES) {
      const visiblePadding = lowAngleVisibleBasePaddingMeters[type.id] ?? 0;
      const visibleBaseY = type.yOffset - type.size * 0.5 + visiblePadding;
      expect(visibleBaseY).toBeLessThanOrEqual(0.12);
    }
  });

  it('enlarges and stabilizes the small palm impostor to reduce trunk snapping', () => {
    const giantPalm = VEGETATION_TYPES.find((type) => type.id === 'giantPalm');

    expect(giantPalm).toBeDefined();
    expect(giantPalm?.size).toBeGreaterThan(6);
    expect(giantPalm?.imposterAtlas?.stableAzimuthColumn).toBe(3);
  });

  it('quarantines the broken low-angle coconut atlas row and trunk cross-fade', () => {
    const coconut = VEGETATION_TYPES.find((type) => type.id === 'coconut');

    expect(coconut).toBeDefined();
    expect(coconut?.imposterAtlas?.stableAzimuthColumn).toBe(2);
    expect(coconut?.imposterAtlas?.maxElevationRow).toBe(2);
  });
});
