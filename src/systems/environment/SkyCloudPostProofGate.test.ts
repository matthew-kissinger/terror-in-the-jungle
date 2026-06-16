// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { RendererBackendCapabilities } from '../../core/RendererBackend';
import { buildRendererFeatureProfile } from '../../core/RendererFeatureProfile';
import {
  buildSkyCloudPostProofGate,
  readSkyCloudPostProofRequestFromSearch,
} from './SkyCloudPostProofGate';

function makeCapabilities(
  overrides: Partial<RendererBackendCapabilities> = {},
): RendererBackendCapabilities {
  const base: RendererBackendCapabilities = {
    requestedMode: 'webgpu-strict',
    resolvedBackend: 'webgpu',
    initStatus: 'ready',
    isWebGPURenderer: true,
    forceWebGL: false,
    strictWebGPU: true,
    navigatorGpuAvailable: true,
    adapterAvailable: true,
    adapterName: 'test-adapter',
    adapterFeatures: [],
    adapterLimits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024,
      maxComputeInvocationsPerWorkgroup: 256,
    },
    deviceLoss: {
      supported: true,
      lost: false,
      reason: null,
      message: null,
      eventCount: 0,
      lastEventAtMs: null,
    },
    error: null,
    notes: [],
  };

  return {
    ...base,
    ...overrides,
    adapterFeatures: overrides.adapterFeatures ?? base.adapterFeatures,
    adapterLimits: overrides.adapterLimits ?? base.adapterLimits,
    deviceLoss: overrides.deviceLoss ?? base.deviceLoss,
    notes: overrides.notes ?? base.notes,
  };
}

function profile(overrides: Partial<RendererBackendCapabilities> = {}) {
  return buildRendererFeatureProfile(makeCapabilities(overrides));
}

describe('SkyCloudPostProofGate', () => {
  it('stays default-off until a browser proof flag requests it', () => {
    const gate = buildSkyCloudPostProofGate(profile());

    expect(gate.enabled).toBe(false);
    expect(gate.state).toBe('not-requested');
    expect(gate.runtimeDefault).toBe(false);
    expect(gate.webgpuOnly).toBe(true);
    expect(gate.lightingAuthority).toBe('AtmosphereSystem/LightingRig');
    expect(gate.blockers).toContain("Missing proof flag 'sky-cloud-post'.");
  });

  it('parses the sky/cloud/post proof request without enabling cloud shadows by default', () => {
    const request = readSkyCloudPostProofRequestFromSearch(
      '?renderer=webgpu-strict&worldProof=sky-cloud-post,debug-water',
    );

    expect(request).toEqual({
      requested: true,
      renderPipelinePost: true,
      volumetricCloudPrototype: true,
      cloudShadowProbe: false,
    });
  });

  it('enables only as a strict WebGPU diagnostic proof and preserves matrix gates', () => {
    const request = readSkyCloudPostProofRequestFromSearch(
      '?renderer=webgpu-strict&proof=sky-cloud-post&cloudShadows=1',
    );
    const gate = buildSkyCloudPostProofGate(profile(), request);

    expect(gate.enabled).toBe(true);
    expect(gate.state).toBe('webgpu-proof');
    expect(gate.renderPipelinePost.status).toBe('enabled');
    expect(gate.volumetricCloudPrototype.status).toBe('enabled');
    expect(gate.cloudShadowProbe.status).toBe('enabled');
    expect(gate.renderPipelinePost.proofHooks).toContain('npm run check:tod-coherence');
    expect(gate.requiredProofMatrix.renderers).toEqual(['webgpu-strict']);
    expect(gate.requiredProofMatrix.scenarios).toContain('a_shau_valley');
    expect(gate.requiredProofMatrix.gates).toContain('npm run evidence:atmosphere');
  });

  it('blocks default WebGPU mode so visual proof must use explicit strict mode', () => {
    const gate = buildSkyCloudPostProofGate(
      profile({ requestedMode: 'webgpu', strictWebGPU: false }),
      readSkyCloudPostProofRequestFromSearch('?worldProof=sky-cloud-post'),
    );

    expect(gate.enabled).toBe(false);
    expect(gate.state).toBe('blocked');
    expect(gate.blockers).toContain(
      'Sky/cloud/post proof requires a strict WebGPU backend; fallback paths stay compatibility-only.',
    );
  });

  it('blocks compatibility fallback instead of mirroring cloud/post systems to WebGL2', () => {
    const gate = buildSkyCloudPostProofGate(
      profile({
        resolvedBackend: 'webgpu-webgl-fallback',
        navigatorGpuAvailable: false,
        adapterAvailable: false,
        adapterLimits: {},
      }),
      readSkyCloudPostProofRequestFromSearch('?worldProof=sky-cloud-post'),
    );

    expect(gate.enabled).toBe(false);
    expect(gate.state).toBe('blocked');
    expect(gate.renderPipelinePost.status).toBe('blocked');
    expect(gate.volumetricCloudPrototype.status).toBe('blocked');
    expect(gate.blockers.some((blocker) => blocker.includes('fallback paths stay compatibility-only'))).toBe(true);
  });

  it('keeps post-only proof possible when storage-buffer limits block compute clouds', () => {
    const request = readSkyCloudPostProofRequestFromSearch(
      '?worldProof=sky-cloud-post&clouds=0',
    );
    const gate = buildSkyCloudPostProofGate(
      profile({
        adapterLimits: {
          maxStorageBufferBindingSize: 64 * 1024 * 1024,
          maxComputeInvocationsPerWorkgroup: 256,
        },
      }),
      request,
    );

    expect(gate.enabled).toBe(true);
    expect(gate.renderPipelinePost.status).toBe('enabled');
    expect(gate.volumetricCloudPrototype.status).toBe('not-requested');
    expect(gate.blockers).toEqual([]);
  });

  it('blocks cloud shadows when cloud proof was not requested', () => {
    const request = readSkyCloudPostProofRequestFromSearch(
      '?worldProof=sky-cloud-post&clouds=0&cloudShadows=1',
    );
    const gate = buildSkyCloudPostProofGate(profile(), request);

    expect(gate.enabled).toBe(false);
    expect(gate.cloudShadowProbe.status).toBe('blocked');
    expect(gate.cloudShadowProbe.reason).toContain('requires the volumetric cloud prototype');
  });
});
