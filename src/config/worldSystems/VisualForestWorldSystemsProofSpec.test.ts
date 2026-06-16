// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  VISUAL_FOREST_PROTECTED_AUTHORITIES,
  VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS,
  type VisualForestAuthorityId,
  type VisualForestForbiddenOutput,
  type VisualForestProofHook,
} from './VisualForestWorldSystemsProofSpec';

const REQUIRED_SKY_AUTHORITIES: readonly VisualForestAuthorityId[] = [
  'atmosphereSystem',
  'lightingRig',
  'scenarioAtmospherePresets',
  'sunDiscMesh',
  'postProcessingShim',
  'todCoherenceGate',
  'atmosphereEvidenceMatrix',
];

const REQUIRED_FOREST_AUTHORITIES: readonly VisualForestAuthorityId[] = [
  'globalBillboardSystem',
  'gpuBillboardSystem',
  'terrainVegetationRuntime',
  'vegetationScatterer',
  'jungleGroundRing',
  'vegetationTypes',
  'vietnamSpeciesSourceSpecs',
  'assetAcceptanceStandard',
  'assetGalleryProof',
  'vegetationHorizonAudit',
  'vegetationGroundingAudit',
];

const REQUIRED_SKY_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  'secondLightingAuthority',
  'defaultOnCloudOrPostReplacement',
  'fallbackBehaviorUnspecified',
  'retiredPostProcessPathRevival',
  'fableSkyCloudPostPort',
];

const REQUIRED_FOREST_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  'fableForestRuntimePort',
  'fableGeneratedSpecies',
  'unacceptedSourceAsset',
  'hiddenRoutesBasesOrNpcs',
  'defaultOnForestHlodSwap',
  'trueMeshletNanite',
];

const REQUIRED_SKY_HOOKS: readonly VisualForestProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'todCoherenceGate',
  'atmosphereEvidenceMatrix',
  'quietMachinePerfAttribution',
];

const REQUIRED_FOREST_HOOKS: readonly VisualForestProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
];

describe('VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS', () => {
  it('keeps every visual and forest lane default-off, Fable-free, and water-independent', () => {
    for (const spec of VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS) {
      expect(spec.runtimeDefault).toBe(false);
      expect(spec.lightingAuthorityMutation).toBe(false);
      expect(spec.runtimeVegetationMutation).toBe('none');
      expect(spec.runtimeWaterDependency).toBe('none');
      expect(spec.fableAssetsAllowed).toBe(false);
      expect(spec.fableRuntimePortAllowed).toBe(false);
      expect(spec.trueMeshletNanite).toBe(false);
      expect(spec.forbiddenOutputs).toContain('runtimeWaterDependency');
    }
  });

  it('protects current sky, lighting, post, and evidence authorities for every sky lane', () => {
    const skyLanes = VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS
      .filter((spec) => spec.group === 'sky-cloud-post');

    expect(skyLanes.length).toBeGreaterThan(0);
    for (const spec of skyLanes) {
      expect(spec.protectedAuthorities).toEqual(REQUIRED_SKY_AUTHORITIES);
      for (const forbidden of REQUIRED_SKY_FORBIDDEN_OUTPUTS) {
        expect(spec.forbiddenOutputs).toContain(forbidden);
      }
      for (const hook of REQUIRED_SKY_HOOKS) {
        expect(spec.proofHooks).toContain(hook);
      }
    }
  });

  it('protects current vegetation, source-spec, asset, and audit authorities for every forest lane', () => {
    const forestLanes = VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS
      .filter((spec) => spec.group === 'forest-nanite-lite');

    expect(forestLanes.length).toBeGreaterThan(0);
    for (const spec of forestLanes) {
      expect(spec.protectedAuthorities).toEqual(REQUIRED_FOREST_AUTHORITIES);
      for (const forbidden of REQUIRED_FOREST_FORBIDDEN_OUTPUTS) {
        expect(spec.forbiddenOutputs).toContain(forbidden);
      }
      for (const hook of REQUIRED_FOREST_HOOKS) {
        if (spec.id === 'octahedralImpostorBakeSpec' && hook === 'quietMachinePerfAttribution') {
          continue;
        }
        expect(spec.proofHooks).toContain(hook);
      }
    }
  });

  it('has authority file coverage for every protected authority', () => {
    const ids = VISUAL_FOREST_PROTECTED_AUTHORITIES.map((authority) => authority.id);
    for (const id of [...REQUIRED_SKY_AUTHORITIES, ...REQUIRED_FOREST_AUTHORITIES]) {
      expect(ids).toContain(id);
    }
    for (const authority of VISUAL_FOREST_PROTECTED_AUTHORITIES) {
      expect(authority.files.length).toBeGreaterThan(0);
      expect(authority.contract).not.toHaveLength(0);
    }
  });

  it('keeps WebGL fallback behavior explicit for every lane', () => {
    for (const spec of VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS) {
      expect([
        'existing-authority-only',
        'disabled-or-existing-authority-only',
      ]).toContain(spec.webglFallbackBehavior);
      expect(spec.webglFallbackBehavior).not.toBe('fallbackBehaviorUnspecified');
    }
  });
});
