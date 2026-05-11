import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createAlphaTextureNodeMaterial,
  evaluateNodeMaterialReadiness,
} from './TslMaterialFactory';
import type { RendererBackendCapabilities } from './RendererBackend';

function capabilities(
  overrides: Partial<RendererBackendCapabilities>,
): RendererBackendCapabilities {
  return {
    requestedMode: 'webgl',
    resolvedBackend: 'webgl',
    initStatus: 'ready',
    isWebGPURenderer: false,
    forceWebGL: false,
    strictWebGPU: false,
    navigatorGpuAvailable: false,
    adapterAvailable: null,
    adapterName: null,
    adapterFeatures: [],
    adapterLimits: {},
    error: null,
    notes: [],
    ...overrides,
  };
}

describe('evaluateNodeMaterialReadiness', () => {
  it('does not enable TSL surfaces on the legacy WebGLRenderer path', () => {
    const result = evaluateNodeMaterialReadiness(capabilities({}), 'vegetation-billboard');
    expect(result.ready).toBe(false);
    expect(result.strictFailure).toBe(false);
  });

  it('fails loudly when strict WebGPU proof resolves to fallback', () => {
    const result = evaluateNodeMaterialReadiness(
      capabilities({
        requestedMode: 'webgpu-strict',
        resolvedBackend: 'webgpu-webgl-fallback',
        isWebGPURenderer: true,
        strictWebGPU: true,
      }),
      'combatant-impostor',
    );
    expect(result.ready).toBe(false);
    expect(result.strictFailure).toBe(true);
    expect(result.reason).toContain('refusing to hide');
  });

  it('rejects initialized WebGPURenderer node materials on the explicit fallback backend', () => {
    const result = evaluateNodeMaterialReadiness(
      capabilities({
        requestedMode: 'webgpu-force-webgl',
        resolvedBackend: 'webgpu-webgl-fallback',
        isWebGPURenderer: true,
        forceWebGL: true,
      }),
      'proof-fixture',
    );
    expect(result.ready).toBe(false);
    expect(result.strictFailure).toBe(true);
    expect(result.reason).toContain('refusing to hide');
  });
});

describe('createAlphaTextureNodeMaterial', () => {
  it('creates a typed TSL alpha texture material without a WebGL shader string', async () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;

    const material = await createAlphaTextureNodeMaterial({
      texture,
      alphaTest: 0.3,
      name: 'konveyer-test-alpha-node-material',
    });

    expect(material.name).toBe('konveyer-test-alpha-node-material');
    expect(material.isNodeMaterial).toBe(true);
    expect(material.colorNode).toBeDefined();
    expect(material.opacityNode).toBeDefined();
    expect(material.alphaTestNode).toBeDefined();
    expect(material.fog).toBe(false);
    expect(material.alphaTest).toBe(0.3);
  });
});
