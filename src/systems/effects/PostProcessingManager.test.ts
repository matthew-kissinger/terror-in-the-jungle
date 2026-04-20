import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PostProcessingManager } from './PostProcessingManager';

// Mock Logger so construction does not write to console.
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DeviceDetector so construction does not touch `navigator`.
vi.mock('../../utils/DeviceDetector', () => ({
  isMobileGPU: vi.fn().mockReturnValue(false),
}));

/**
 * Minimal renderer stub: PostProcessingManager's constructor only calls
 * `renderer.getSize(Vector2)`. No real WebGL context is needed to assert
 * on the blit material that gets built.
 */
function stubRenderer(width = 1920, height = 1080): THREE.WebGLRenderer {
  return {
    getSize: (target: THREE.Vector2) => target.set(width, height),
  } as unknown as THREE.WebGLRenderer;
}

describe('PostProcessingManager', () => {
  it('defaults exposure to a neutral 1.0 so the pipeline ships as a no-op for in-range color', () => {
    const pp = new PostProcessingManager(
      stubRenderer(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    const material = (pp as unknown as { blitMaterial: THREE.ShaderMaterial }).blitMaterial;
    expect(material.uniforms.uExposure).toBeDefined();
    expect(material.uniforms.uExposure.value).toBe(1.0);

    pp.dispose();
  });

  it('tone-maps HDR color BEFORE the Bayer dither + 24-level quantize so near-1.0 warm hues do not uniformly clip to white', () => {
    // Behavior-level contract: the blit stage must compress HDR into [0,1]
    // BEFORE the quantize floor, otherwise any value > 1 clips to the same
    // quantized white bucket regardless of hue. We verify this by locating
    // the tone-map call and the quantize call in the shader source and
    // asserting their relative order. The specific tone-map curve (ACES,
    // Reinhard, etc.) is a tuning choice; the ordering is not.
    const pp = new PostProcessingManager(
      stubRenderer(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    const material = (pp as unknown as { blitMaterial: THREE.ShaderMaterial }).blitMaterial;
    const src = material.fragmentShader;

    const toneMapIdx = src.search(/\b(acesFilm|toneMap|tonemap|reinhard)\s*\(/);
    const quantizeIdx = src.indexOf('floor(');
    expect(toneMapIdx).toBeGreaterThanOrEqual(0);
    expect(quantizeIdx).toBeGreaterThanOrEqual(0);
    expect(toneMapIdx).toBeLessThan(quantizeIdx);

    pp.dispose();
  });
});
