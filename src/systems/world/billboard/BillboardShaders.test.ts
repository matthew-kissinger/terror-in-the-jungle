import { describe, expect, it } from 'vitest';
import { BILLBOARD_FRAGMENT_SHADER, BILLBOARD_VERTEX_SHADER } from './BillboardShaders';

describe('BillboardShaders Pixel Forge vegetation calibration', () => {
  it('hardens close alpha separately from near-distance fade', () => {
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('uniform float nearAlphaSolidDistance');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('float nearAlphaBlend');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('float hardenedAlpha');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('float vegetationAlpha');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('smoothstep(nearAlphaSolidDistance, nearAlphaSolidDistance + 25.0, vDistance)');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('if (nearFadeDistance > 0.001)');
  });

  it('clamps vegetation lighting and applies close readability exposure', () => {
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('uniform float vegetationExposure');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('uniform float nearLightBoostDistance');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('uniform float minVegetationLight');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('light = max(light, vec3(minVegetationLight))');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('float nearLightBoost');
    expect(BILLBOARD_FRAGMENT_SHADER).toContain('shaded *= vegetationExposure * nearLightBoost');
  });

  it('keeps wind sway on the GPU and roots motion at the billboard base', () => {
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform float windStrength');
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform float windSpeed');
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform float windSpatialScale');
    expect(BILLBOARD_VERTEX_SHADER).toContain('float windPhase');
    expect(BILLBOARD_VERTEX_SHADER).toContain('float gustSway');
    expect(BILLBOARD_VERTEX_SHADER).toContain('float swayWeight = uv.y * uv.y');
    expect(BILLBOARD_VERTEX_SHADER).toContain('rotatedPosition += right * sway * swayWeight');
  });

  it('supports stable atlas columns for asymmetric impostors', () => {
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform bool stableAtlasAzimuth');
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform float stableAtlasColumn');
    expect(BILLBOARD_VERTEX_SHADER).toContain('if (stableAtlasAzimuth)');
    expect(BILLBOARD_VERTEX_SHADER).toContain('floor(stableAtlasColumn + 0.5)');
    expect(BILLBOARD_VERTEX_SHADER).toContain('vAtlasBlend = 0.0');
  });

  it('can cap bad low-elevation atlas rows for reviewed vegetation packages', () => {
    expect(BILLBOARD_VERTEX_SHADER).toContain('uniform float maxAtlasElevationRow');
    expect(BILLBOARD_VERTEX_SHADER).toContain('if (maxAtlasElevationRow >= 0.0)');
    expect(BILLBOARD_VERTEX_SHADER).toContain('tileY = min(tileY, maxAtlasElevationRow)');
  });
});
