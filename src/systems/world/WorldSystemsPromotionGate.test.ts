// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { RendererBackendCapabilities } from '../../core/RendererBackend';
import { buildRendererFeatureProfile } from '../../core/RendererFeatureProfile';
import {
  buildSkyCloudPostProofGate,
  readSkyCloudPostProofRequestFromSearch,
} from '../environment/SkyCloudPostProofGate';
import { createDebugWaterProof } from '../environment/water/DebugWaterProof';
import { buildForestAggregateLodPlan } from '../terrain/ForestAggregateLodPlan';
import { buildHeightfieldErosionAuthoritySpike } from '../terrain/HeightfieldErosionAuthoritySpike';
import { buildWorldSystemsPromotionGate } from './WorldSystemsPromotionGate';

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

function buildGate(
  overrides: Partial<RendererBackendCapabilities> = {},
) {
  const rendererProfile = buildRendererFeatureProfile(makeCapabilities(overrides));
  const skyCloudPostGate = buildSkyCloudPostProofGate(
    rendererProfile,
    readSkyCloudPostProofRequestFromSearch('?worldProof=sky-cloud-post'),
  );
  const heightfieldErosion = buildHeightfieldErosionAuthoritySpike(
    {
      getHeightAt: (x: number, z: number) => Math.sin(x * 0.02) * 8 + Math.cos(z * 0.03) * 4,
    },
    { worldSize: 512, gridSize: 17 },
  );
  const debugWaterProof = createDebugWaterProof({
    id: 'debug-proof',
    basins: [
      {
        id: 'basin-a',
        centerX: 0,
        centerZ: 0,
        radiusX: 40,
        radiusZ: 30,
        surfaceY: 12,
        bedY: 8,
      },
    ],
  });
  const forestAggregateLodPlan = buildForestAggregateLodPlan(
    rendererProfile,
    [
      {
        cellId: 'fan-palm-cell',
        centerX: 180,
        centerZ: 0,
        radiusMeters: 32,
        speciesIds: ['fanPalm', 'fern'],
        estimatedInstances: 1200,
      },
      {
        cellId: 'future-banyan-cell',
        centerX: 80,
        centerZ: 0,
        radiusMeters: 20,
        speciesIds: ['banyan'],
        estimatedInstances: 24,
      },
    ],
    { cameraX: 0, cameraZ: 0 },
  );

  return buildWorldSystemsPromotionGate({
    rendererProfile,
    skyCloudPostGate,
    heightfieldErosion,
    debugWaterProof,
    forestAggregateLodPlan,
    vehicleInteractionClarity: {
      factionAwarePrompts: true,
      enemyBoardingBlocked: true,
      proofHooks: [
        'npm run test:quick -- src/systems/vehicle/GroundVehicleProximityChecker.test.ts',
      ],
    },
  });
}

describe('WorldSystemsPromotionGate', () => {
  it('classifies safe runtime lanes separately from spikes and no-go lanes', () => {
    const gate = buildGate();
    const byLane = new Map(gate.decisions.map((decision) => [decision.lane, decision]));

    expect(gate.releaseReady).toBe(true);
    expect(gate.runtimeDefaultPromotions).toContain('webgpuPolicy');
    expect(gate.runtimeDefaultPromotions).toContain('vegetationRuntimeAssets');
    expect(gate.runtimeDefaultPromotions).toContain('vehicleInteractionClarity');
    expect(byLane.get('terrainAuthority')?.status).toBe('spike');
    expect(byLane.get('debugWaterProof')?.status).toBe('spike');
    expect(byLane.get('skyCloudPost')?.status).toBe('spike');
    expect(byLane.get('forestAggregateLod')?.status).toBe('spike');
    expect(byLane.get('runtimeWater')?.status).toBe('no-go');
    expect(byLane.get('trueMeshletNanite')?.status).toBe('no-go');
    expect(byLane.get('fableAssetPort')?.status).toBe('no-go');
  });

  it('does not treat WebGPU capability as permission to ship runtime water', () => {
    const gate = buildGate();
    const runtimeWater = gate.decisions.find((decision) => decision.lane === 'runtimeWater');

    expect(runtimeWater?.status).toBe('no-go');
    expect(runtimeWater?.runtimeDefaultEnabled).toBe(false);
    expect(runtimeWater?.blockers.join(' ')).toContain('dedicated first-principles VODA cycle');
  });

  it('blocks the release if the renderer policy cannot initialize a supported posture', () => {
    const gate = buildGate({
      initStatus: 'failed',
      resolvedBackend: 'webgl',
      isWebGPURenderer: false,
      navigatorGpuAvailable: false,
      adapterAvailable: false,
      adapterFeatures: [],
      adapterLimits: {},
    });
    const webgpuPolicy = gate.decisions.find((decision) => decision.lane === 'webgpuPolicy');

    expect(webgpuPolicy?.status).toBe('no-go');
    expect(webgpuPolicy?.runtimeDefaultEnabled).toBe(false);
    expect(gate.releaseReady).toBe(false);
  });
});
