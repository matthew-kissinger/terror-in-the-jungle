// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { RendererBackendCapabilities } from '../../core/RendererBackend';
import { buildRendererFeatureProfile } from '../../core/RendererFeatureProfile';
import { buildForestAggregateLodPlan, type ForestAggregateCellInput } from './ForestAggregateLodPlan';

function makeCapabilities(
  overrides: Partial<RendererBackendCapabilities> = {},
): RendererBackendCapabilities {
  const base: RendererBackendCapabilities = {
    requestedMode: 'webgpu',
    resolvedBackend: 'webgpu',
    initStatus: 'ready',
    isWebGPURenderer: true,
    forceWebGL: false,
    strictWebGPU: true,
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
    notes: overrides.notes ?? base.notes,
  };
}

function cell(overrides: Partial<ForestAggregateCellInput> = {}): ForestAggregateCellInput {
  return {
    cellId: 'fan-palm-cell',
    centerX: 180,
    centerZ: 0,
    radiusMeters: 32,
    speciesIds: ['fanPalm', 'fern'],
    estimatedInstances: 1200,
    ...overrides,
  };
}

describe('buildForestAggregateLodPlan', () => {
  it('uses WebGPU compact proof for accepted mid-range vegetation when the renderer lane is ready', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());
    const plan = buildForestAggregateLodPlan(profile, [cell()], { cameraX: 0, cameraZ: 0 });
    const [decision] = plan.decisions;

    expect(plan.runtimeDefaultEnabled).toBe(false);
    expect(plan.copiesFableAssets).toBe(false);
    expect(plan.trueMeshletNanite).toBe(false);
    expect(decision.selectedBand).toBe('midClusterCard');
    expect(decision.cullingPath).toBe('webgpuCompactProof');
    expect(decision.proofHooks).toContain('npm run check:culling-baseline');
    expect(decision.runtimeDefaultEnabled).toBe(false);
    expect(decision.trueMeshletNanite).toBe(false);
  });

  it('keeps current CPU residency for the WebGL2 compatibility fallback', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities({
      resolvedBackend: 'webgpu-webgl-fallback',
      navigatorGpuAvailable: false,
      adapterAvailable: false,
      adapterFeatures: [],
      adapterLimits: {},
    }));
    const plan = buildForestAggregateLodPlan(profile, [cell()], { cameraX: 0, cameraZ: 0 });

    expect(plan.rendererPosture).toBe('compatibilityFallback');
    expect(plan.decisions[0].selectedBand).toBe('midClusterCard');
    expect(plan.decisions[0].cullingPath).toBe('currentCpuResidency');
    expect(plan.decisions[0].reason).toContain('Compatibility fallback');
  });

  it('blocks source-spec tree families until accepted TIJ source assets exist', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());
    const plan = buildForestAggregateLodPlan(
      profile,
      [cell({
        cellId: 'future-banyan-cell',
        centerX: 80,
        radiusMeters: 20,
        speciesIds: ['banyan'],
        estimatedInstances: 24,
      })],
      { cameraX: 0, cameraZ: 0 },
    );
    const [decision] = plan.decisions;

    expect(decision.cullingPath).toBe('blocked');
    expect(decision.selectedBand).toBeNull();
    expect(decision.blockers.join(' ')).toContain('No eligible TIJ vegetation source assets');
    expect(decision.blockers.join(' ')).toContain('banyan');
  });

  it('classifies future accepted broadleaf far bands as WebGPU and impostor proof work', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());
    const plan = buildForestAggregateLodPlan(
      profile,
      [cell({
        cellId: 'future-teak-far-cell',
        centerX: 520,
        radiusMeters: 20,
        speciesIds: ['teakBroadleaf'],
        estimatedInstances: 180,
        acceptedFutureSourceAssets: true,
      })],
      { cameraX: 0, cameraZ: 0 },
    );
    const [decision] = plan.decisions;

    expect(decision.selectedBand).toBe('farOctahedralImpostor');
    expect(decision.cullingPath).toBe('webgpuCompactProof');
    expect(decision.webgpuProofRequired).toBe(true);
    expect(decision.requiresAcceptedSourceAssets).toBe(true);
    expect(decision.proofHooks).toContain('npm run check:culling-baseline');
    expect(decision.proofHooks).toContain('npm run check:asset-gallery');
  });

  it('uses terrain horizon coverage instead of individual tree geometry at extreme range', () => {
    const profile = buildRendererFeatureProfile(makeCapabilities());
    const plan = buildForestAggregateLodPlan(
      profile,
      [cell({
        cellId: 'horizon-cell',
        centerX: 1800,
        radiusMeters: 80,
        speciesIds: ['fanPalm', 'coconut'],
        estimatedInstances: 9000,
      })],
      { cameraX: 0, cameraZ: 0 },
    );
    const [decision] = plan.decisions;

    expect(decision.selectedBand).toBe('horizonCanopyCoverage');
    expect(decision.owner).toBe('TerrainMaterial');
    expect(decision.cullingPath).toBe('terrainHorizonCoverage');
    expect(decision.reason).toContain('terrain-material horizon coverage');
  });
});
