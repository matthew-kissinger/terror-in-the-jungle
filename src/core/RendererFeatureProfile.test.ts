// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { RendererBackendCapabilities } from './RendererBackend';
import { buildRendererFeatureProfile } from './RendererFeatureProfile';

function makeCapabilities(
  overrides: Partial<RendererBackendCapabilities> = {},
): RendererBackendCapabilities {
  const base: RendererBackendCapabilities = {
    requestedMode: 'webgpu',
    resolvedBackend: 'webgpu',
    initStatus: 'ready',
    isWebGPURenderer: true,
    forceWebGL: false,
    strictWebGPU: false,
    navigatorGpuAvailable: true,
    adapterAvailable: true,
    adapterName: 'test-adapter',
    adapterFeatures: ['shader-f16'],
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
    notes: ['test caps'],
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

describe('buildRendererFeatureProfile', () => {
  it('unlocks WebGPU-only world-system probes on a ready WebGPU backend', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());

    expect(profile.posture).toBe('webgpuPrimary');
    expect(profile.webglCompatibilityMode).toBe('none');
    expect(profile.requiredLimits.worldFieldStorageBufferFloorBytes).toBeGreaterThan(0);
    expect(profile.requiredLimits.maxComputeInvocationsPerWorkgroup.satisfied).toBe(true);
    expect(profile.deviceLoss.diagnosticLanesReprofileAfterRestore).toBe(true);
    expect(profile.decisions.webgpuCompute.available).toBe(true);
    expect(profile.decisions.webgpuCompute.policy).toBe('requiredWebGPU');
    expect(profile.decisions.webgpuCompute.proofHooks).toContain('npm run check:platform-capabilities');
    expect(profile.decisions.webgpuCompute.requiredLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'maxComputeInvocationsPerWorkgroup',
          satisfied: true,
        }),
      ]),
    );
    expect(profile.decisions.storageBufferWorldFields.available).toBe(true);
    expect(profile.decisions.terrainHeightfieldErosion.policy).toBe('diagnosticOnly');
    expect(profile.decisions.terrainHeightfieldErosion.proofHooks).toContain('terrainBaselineProof');
    expect(profile.decisions.debugWaterLevelProof.available).toBe(true);
    expect(profile.decisions.debugWaterLevelProof.policy).toBe('diagnosticOnly');
    expect(profile.decisions.debugWaterLevelProof.reason).toContain('cannot become gameplay water');
    expect(profile.decisions.volumetricCloudPrototype.policy).toBe('diagnosticOnly');
    expect(profile.decisions.gpuForestCulling.policy).toBe('diagnosticOnly');
    expect(profile.decisions.debugWaterProof.available).toBe(true);
    expect(profile.decisions.debugWaterProof.policy).toBe('diagnosticOnly');
    expect(profile.decisions.aggregateForestLod.proofHooks).toContain('assetAcceptanceReview');
    expect(profile.decisions.naniteLiteClusterStudy.reason).toContain('true meshlet Nanite remains out of scope');
    expect(profile.decisions.vietnamSpeciesSourceSpecs.available).toBe(true);
    expect(profile.decisions.vietnamSpeciesSourceSpecs.deviceLossPolicy).toBe('noRuntimeGpuState');
    expect(profile.proofHookDescriptions.todCoherenceGate).toContain('sky');
  });

  it('keeps the unified WebGL2 fallback as compatibility without mirroring WebGPU-only systems', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      resolvedBackend: 'webgpu-webgl-fallback',
      navigatorGpuAvailable: false,
      adapterAvailable: false,
      adapterFeatures: [],
      adapterLimits: {},
    }));

    expect(profile.posture).toBe('compatibilityFallback');
    expect(profile.webglCompatibilityMode).toBe('degraded');
    expect(profile.decisions.sharedTslNodeMaterials.available).toBe(true);
    expect(profile.decisions.sharedTslNodeMaterials.policy).toBe('sharedNodeSafe');
    expect(profile.decisions.webgpuCompute.available).toBe(false);
    expect(profile.decisions.volumetricCloudPrototype.available).toBe(false);
    expect(profile.decisions.gpuForestCulling.available).toBe(false);
    expect(profile.decisions.terrainHeightfieldErosion.available).toBe(false);
    expect(profile.decisions.debugWaterLevelProof.available).toBe(false);
    expect(profile.decisions.debugWaterProof.available).toBe(true);
    expect(profile.decisions.vietnamSpeciesSourceSpecs.available).toBe(true);
  });

  it('treats explicit legacy WebGL as diagnostic instead of a new feature target', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      requestedMode: 'webgl',
      resolvedBackend: 'webgl',
      isWebGPURenderer: false,
      navigatorGpuAvailable: false,
      adapterAvailable: false,
      adapterFeatures: [],
      adapterLimits: {},
    }));

    expect(profile.posture).toBe('legacyWebGLDiagnostic');
    expect(profile.webglCompatibilityMode).toBe('diagnostic');
    expect(profile.decisions.sharedTslNodeMaterials.available).toBe(false);
    expect(profile.decisions.webgpuCompute.available).toBe(false);
    expect(profile.decisions.renderPipelinePost.available).toBe(false);
    expect(profile.decisions.debugWaterProof.available).toBe(false);
  });

  it('refuses GPU world fields when the adapter storage-buffer limit is below the cycle floor', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      adapterLimits: {
        maxStorageBufferBindingSize: 64 * 1024 * 1024,
        maxComputeInvocationsPerWorkgroup: 256,
      },
    }));

    expect(profile.decisions.webgpuCompute.available).toBe(true);
    expect(profile.decisions.storageBufferWorldFields.available).toBe(false);
    expect(profile.decisions.storageBufferWorldFields.policy).toBe('diagnosticOnly');
    expect(profile.requiredLimits.maxStorageBufferBindingSize.satisfied).toBe(false);
    expect(profile.decisions.storageBufferWorldFields.requiredLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'maxStorageBufferBindingSize',
          satisfied: false,
        }),
      ]),
    );
    expect(profile.decisions.hydrologyAnalysis.available).toBe(false);
    expect(profile.decisions.debugWaterLevelProof.available).toBe(false);
  });

  it('keeps runtime water disabled even when the WebGPU backend is fully capable', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());

    expect(profile.decisions.runtimeWater.available).toBe(false);
    expect(profile.decisions.runtimeWater.policy).toBe('disabled');
    expect(profile.decisions.runtimeWater.reason).toContain('out of scope');
    expect(profile.decisions.runtimeWater.deviceLossPolicy).toBe('disabledUntilFutureCycle');
    expect(profile.deviceLoss.runtimeWaterRestores).toBe(false);
    expect(profile.decisions.debugWaterProof.available).toBe(true);
  });

  it('requires strict WebGPU proof mode to revalidate the backend after device loss', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      requestedMode: 'webgpu-strict',
      strictWebGPU: true,
    }));

    expect(profile.deviceLoss.strictWebGPURequiresBackendReinit).toBe(true);
    expect(profile.deviceLoss.notes.join(' ')).toContain('fail loudly');
    expect(profile.decisions.storageBufferWorldFields.deviceLossPolicy).toBe('requiresRendererReinit');
  });

  it('disables WebGPU-only proof lanes after device loss is reported', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      deviceLoss: {
        supported: true,
        lost: true,
        reason: 'unknown',
        message: 'test device reset',
        eventCount: 1,
        lastEventAtMs: 1000,
      },
    }));

    expect(profile.posture).toBe('unavailable');
    expect(profile.deviceLoss.lost).toBe(true);
    expect(profile.decisions.webgpuCompute.available).toBe(false);
    expect(profile.decisions.storageBufferWorldFields.available).toBe(false);
    expect(profile.decisions.debugWaterProof.available).toBe(false);
    expect(profile.decisions.webgpuCompute.reason).toContain('device loss');
  });
});
