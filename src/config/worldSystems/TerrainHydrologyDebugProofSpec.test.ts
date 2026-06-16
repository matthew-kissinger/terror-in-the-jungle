// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS,
  TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES,
  type TerrainHydrologyForbiddenOutput,
  type TerrainHydrologyProofHook,
  type TerrainHydrologyProtectedAuthorityId,
} from './TerrainHydrologyDebugProofSpec';

const REQUIRED_AUTHORITIES: readonly TerrainHydrologyProtectedAuthorityId[] = [
  'terrainSystem',
  'terrainSurfaceRuntime',
  'heightProviderFactory',
  'aShauDemConfig',
  'openFrontierSeedConfig',
  'mapSeedRegistry',
  'prebakedNavmeshAssets',
  'prebakedHeightmapAssets',
];

const REQUIRED_FORBIDDEN_OUTPUTS: readonly TerrainHydrologyForbiddenOutput[] = [
  'runtimeWaterRendering',
  'runtimeWaterQueryPhysics',
  'swimmingOrBuoyancy',
  'watercraftSpawnOrBoarding',
  'waterSystemReactivation',
  'hydrologySystemReactivation',
  'terrainAuthoritySwap',
  'demOrNavmeshMutation',
  'fableAssetImport',
  'fableWaterMaterial',
];

const REQUIRED_SHARED_HOOKS: readonly TerrainHydrologyProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
];

describe('TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS', () => {
  it('keeps every lane default-off, non-authoritative, and free of runtime gameplay water', () => {
    for (const spec of TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS) {
      expect(spec.runtimeDefault).toBe(false);
      expect(spec.authoritativeTerrainMutation).toBe(false);
      expect(spec.runtimeWaterDependency).toBe('none');
      expect(spec.fableAssetsAllowed).toBe(false);
    }
  });

  it('protects the current terrain, DEM, navmesh, and heightmap authorities', () => {
    const protectedIds = TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES.map((authority) => authority.id);

    expect(protectedIds).toEqual(REQUIRED_AUTHORITIES);
    for (const authority of TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES) {
      expect(authority.files.length).toBeGreaterThan(0);
      expect(authority.contract).not.toHaveLength(0);
    }
    for (const spec of TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS) {
      expect(spec.protectedAuthorities).toEqual(REQUIRED_AUTHORITIES);
    }
  });

  it('forbids gameplay water, terrain authority swaps, DEM/navmesh mutation, and Fable imports', () => {
    for (const spec of TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS) {
      for (const forbidden of REQUIRED_FORBIDDEN_OUTPUTS) {
        expect(spec.forbiddenOutputs).toContain(forbidden);
      }
    }
  });

  it('requires terrain, visual, perf, and profile proof hooks for every lane', () => {
    for (const spec of TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS) {
      for (const hook of REQUIRED_SHARED_HOOKS) {
        expect(spec.proofHooks).toContain(hook);
      }
    }
  });

  it('requires owner approval before any debug water or hydrology water-level proof lane', () => {
    const waterLanes = TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS
      .filter((spec) => spec.waterOutput === 'debug-only-water-level-proof');

    expect(waterLanes.length).toBeGreaterThan(0);
    for (const spec of waterLanes) {
      expect(spec.status).toBe('owner-approval-required');
      expect(spec.proofHooks).toContain('ownerDebugWaterApproval');
      expect(spec.allowedOutputs.join(' ')).toContain('debug');
    }
  });
});
