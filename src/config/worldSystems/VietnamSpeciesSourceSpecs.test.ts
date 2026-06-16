// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { VEGETATION_TYPES } from '../vegetationTypes';
import {
  VIETNAM_SPECIES_SOURCE_SPECS,
  type VietnamSpeciesProofHook,
} from './VietnamSpeciesSourceSpecs';

const REQUIRED_SOURCE_ONLY_HOOKS: readonly VietnamSpeciesProofHook[] = [
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
];

describe('VIETNAM_SPECIES_SOURCE_SPECS', () => {
  it('maps the existing approved runtime vegetation without adding new runtime IDs', () => {
    const runtimeIds = VEGETATION_TYPES.map((type) => type.id).sort();
    const approvedSpecIds = VIETNAM_SPECIES_SOURCE_SPECS
      .filter((spec) => spec.status === 'runtime-approved-impostor')
      .map((spec) => spec.runtimeVegetationId)
      .sort();

    expect(approvedSpecIds).toEqual(runtimeIds);
  });

  it('keeps future species as source specs only with no runtime vegetation IDs', () => {
    const sourceOnly = VIETNAM_SPECIES_SOURCE_SPECS
      .filter((spec) => spec.status === 'source-spec-only');

    expect(sourceOnly.length).toBeGreaterThan(0);
    for (const spec of sourceOnly) {
      expect(spec.runtimeVegetationId).toBeUndefined();
      expect(spec.sourceAsset.acceptedSourceRequired).toBe(true);
      expect(spec.sourceAsset.currentSource).toBe('future-tiJ-source-required');
    }
  });

  it('forbids Fable assets, generated Fable species, gameplay water, and true meshlet Nanite', () => {
    for (const spec of VIETNAM_SPECIES_SOURCE_SPECS) {
      expect(spec.sourceAsset.fableAssetsAllowed).toBe(false);
      expect(spec.sourceAsset.generatedFableSpeciesAllowed).toBe(false);
      expect(spec.runtimeWaterDependency).toBe('none');
      expect(spec.representationPlan.trueMeshletNanite).toBe(false);
    }
  });

  it('requires acceptance, visual, and perf hooks before source-only species can ship', () => {
    const sourceOnly = VIETNAM_SPECIES_SOURCE_SPECS
      .filter((spec) => spec.status === 'source-spec-only');

    for (const spec of sourceOnly) {
      for (const hook of REQUIRED_SOURCE_ONLY_HOOKS) {
        expect(spec.proofHooks).toContain(hook);
      }
      expect(spec.representationPlan.aggregateLod).toBe('allowed-after-proof');
    }
  });

  it('keeps cluster-study language limited to canopy and canopy-shell specs', () => {
    const naniteStudySpecs = VIETNAM_SPECIES_SOURCE_SPECS
      .filter((spec) => spec.representationPlan.naniteLite === 'cluster-study-only');

    expect(naniteStudySpecs.length).toBeGreaterThan(0);
    for (const spec of naniteStudySpecs) {
      expect(['canopy', 'canopyShell']).toContain(spec.tier);
    }
  });
});
