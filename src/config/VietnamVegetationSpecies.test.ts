// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from './pixelForgeAssets';
import {
  FOREST_NANITE_LITE_STRATEGY,
  getBlockedVegetationSpeciesSpecs,
  getRuntimeAcceptedVegetationSpecies,
  getVietnamVegetationSpeciesById,
  VIETNAM_VEGETATION_LOD_BANDS,
  VIETNAM_VEGETATION_SPECIES,
} from './VietnamVegetationSpecies';

describe('VIETNAM_VEGETATION_SPECIES', () => {
  it('keeps accepted runtime species aligned with imported Pixel Forge vegetation assets', () => {
    const importedIds = PIXEL_FORGE_VEGETATION_ASSETS.map((asset) => asset.id).sort();
    const acceptedIds = getRuntimeAcceptedVegetationSpecies().map((spec) => spec.id).sort();

    expect(acceptedIds).toEqual(importedIds);
    for (const spec of getRuntimeAcceptedVegetationSpecies()) {
      expect(spec.existingRuntimeTypeId).toBe(spec.id);
      expect(spec.sourceRequirements.sourceKind).toBe('accepted-impostor-atlas');
      expect(spec.sourceRequirements.acceptanceGates).toContain('npm run check:vegetation-horizon');
    }
  });

  it('keeps blocked Pixel Forge vegetation candidates out of runtime adoption', () => {
    const blockedSpecs = getBlockedVegetationSpeciesSpecs();
    const blockedIds = blockedSpecs.map((spec) => spec.id).sort();

    expect(blockedIds).toEqual([...PIXEL_FORGE_BLOCKED_VEGETATION_IDS].sort());
    for (const spec of blockedSpecs) {
      expect(spec.existingRuntimeTypeId).toBeNull();
      expect(spec.sourceStatus).toBe('blockedPendingSource');
      expect(spec.sourceRequirements.sourceKind).toBe('blocked-reroll');
      expect(spec.sourceRequirements.acceptanceGates.length).toBeGreaterThan(0);
    }
  });

  it('defines Vietnam-specific future species as source specs instead of copied demo assets', () => {
    const futureIds = ['teakBroadleaf', 'jungleDeadfall', 'lianaVines'] as const;

    for (const id of futureIds) {
      const spec = getVietnamVegetationSpeciesById(id);
      expect(spec.sourceStatus).toBe('sourceSpecOnly');
      expect(spec.existingRuntimeTypeId).toBeNull();
      expect(spec.sourceRequirements.budgetNotes).toContain('No runtime asset');
      expect(spec.notes.toLowerCase()).not.toContain('fable');
    }
  });

  it('assigns canopy species to aggregate LOD bands including future impostor and horizon coverage', () => {
    const canopySpecs = VIETNAM_VEGETATION_SPECIES.filter((spec) => spec.tier === 'canopy');

    expect(canopySpecs.length).toBeGreaterThan(0);
    for (const spec of canopySpecs) {
      const bands = spec.lod.map((lod) => lod.band);
      expect(bands).toContain('horizonCanopyCoverage');
      if (spec.sourceStatus !== 'acceptedRuntimeAtlas') {
        expect(bands).toContain('farOctahedralImpostor');
      }
    }
  });

  it('keeps Nanite-lite as aggregate and impostor strategy, not true meshlet Nanite', () => {
    expect(FOREST_NANITE_LITE_STRATEGY.ownsTrueMeshlets).toBe(false);
    expect(FOREST_NANITE_LITE_STRATEGY.copiesFableAssets).toBe(false);
    expect(FOREST_NANITE_LITE_STRATEGY.runtimeDefaultEnabled).toBe(false);
    expect(FOREST_NANITE_LITE_STRATEGY.requiredRendererFeatureIds).toContain('gpuForestCulling');
    expect(FOREST_NANITE_LITE_STRATEGY.requiredRendererFeatureIds).toContain('octahedralImpostorBake');
    expect(FOREST_NANITE_LITE_STRATEGY.adaptationPath.join(' ')).toContain('accepted source assets');
  });

  it('keeps WebGPU culling optional until the renderer proof lane is available', () => {
    expect(VIETNAM_VEGETATION_LOD_BANDS.midClusterCard.webgpuPath).toBe('optional-gpu-cull');
    expect(VIETNAM_VEGETATION_LOD_BANDS.farOctahedralImpostor.webgpuPath).toBe('required-webgpu-proof');
    expect(VIETNAM_VEGETATION_LOD_BANDS.horizonCanopyCoverage.owner).toBe('TerrainMaterial');
  });
});
