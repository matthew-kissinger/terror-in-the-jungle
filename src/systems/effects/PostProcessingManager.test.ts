import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('WorldBuilder postProcessEnabled wiring', () => {
    const FULL_WB_STATE = {
      invulnerable: false,
      infiniteAmmo: false,
      noClip: false,
      oneShotKills: false,
      shadowsEnabled: true,
      postProcessEnabled: true,
      hudVisible: true,
      ambientAudioEnabled: true,
      npcTickPaused: false,
      forceTimeOfDay: -1,
      active: true,
    };

    afterEach(() => {
      delete (globalThis as any).window?.__worldBuilder;
    });

    function makeRecordingRenderer(): {
      renderer: THREE.WebGLRenderer;
      setRenderTargetCalls: (THREE.WebGLRenderTarget | null)[];
      renderCalls: number;
    } {
      const setRenderTargetCalls: (THREE.WebGLRenderTarget | null)[] = [];
      let renderCalls = 0;
      const renderer = {
        getSize: (target: THREE.Vector2) => target.set(1920, 1080),
        setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
          setRenderTargetCalls.push(target);
        },
        render: () => {
          renderCalls++;
        },
      } as unknown as THREE.WebGLRenderer;
      return {
        renderer,
        setRenderTargetCalls,
        get renderCalls() {
          return renderCalls;
        },
      };
    }

    it('skips begin/end render when postProcessEnabled flag is false', () => {
      (globalThis as any).window = (globalThis as any).window ?? {};
      (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, postProcessEnabled: false };

      const rec = makeRecordingRenderer();
      const pp = new PostProcessingManager(rec.renderer, new THREE.Scene(), new THREE.PerspectiveCamera());

      pp.beginFrame();
      pp.endFrame();

      expect(rec.setRenderTargetCalls.length).toBe(0);
      expect(rec.renderCalls).toBe(0);

      pp.dispose();
    });

    it('runs the begin/end pass when postProcessEnabled flag is true', () => {
      (globalThis as any).window = (globalThis as any).window ?? {};
      (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, postProcessEnabled: true };

      const rec = makeRecordingRenderer();
      const pp = new PostProcessingManager(rec.renderer, new THREE.Scene(), new THREE.PerspectiveCamera());

      pp.beginFrame();
      pp.endFrame();

      // beginFrame redirects to the low-res target; endFrame restores null
      // and triggers one render call (the blit).
      expect(rec.setRenderTargetCalls.length).toBe(2);
      expect(rec.setRenderTargetCalls[0]).not.toBeNull();
      expect(rec.setRenderTargetCalls[1]).toBeNull();
      expect(rec.renderCalls).toBe(1);

      pp.dispose();
    });
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
