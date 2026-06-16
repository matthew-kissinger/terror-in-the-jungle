// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { RendererFeatureProfile } from '../../core/RendererFeatureProfile';
import {
  FOREST_NANITE_LITE_STRATEGY,
  getVietnamVegetationSpeciesById,
  type VegetationAggregateLodSpec,
  type VegetationLodBand,
  type VietnamVegetationSpeciesId,
  type VietnamVegetationSpeciesSpec,
} from '../../config/VietnamVegetationSpecies';

export type ForestAggregateCullingPath =
  | 'currentCpuResidency'
  | 'webgpuCompactProof'
  | 'terrainHorizonCoverage'
  | 'blocked';

export interface ForestAggregateCellInput {
  cellId: string;
  centerX: number;
  centerZ: number;
  radiusMeters: number;
  speciesIds: readonly VietnamVegetationSpeciesId[];
  estimatedInstances: number;
  acceptedFutureSourceAssets?: boolean;
}

export interface ForestAggregateLodPlanOptions {
  cameraX: number;
  cameraZ: number;
}

export interface ForestAggregateLodDecision {
  cellId: string;
  distanceMeters: number;
  speciesIds: readonly VietnamVegetationSpeciesId[];
  estimatedInstances: number;
  selectedBand: VegetationLodBand | null;
  representation: string | null;
  owner: VegetationAggregateLodSpec['owner'] | null;
  cullingPath: ForestAggregateCullingPath;
  webgpuProofRequired: boolean;
  requiresAcceptedSourceAssets: boolean;
  runtimeDefaultEnabled: false;
  copiesFableAssets: false;
  trueMeshletNanite: false;
  blockers: string[];
  proofHooks: string[];
  reason: string;
}

export interface ForestAggregateLodPlan {
  debugOnly: true;
  runtimeDefaultEnabled: false;
  copiesFableAssets: false;
  trueMeshletNanite: false;
  rendererPosture: RendererFeatureProfile['posture'];
  decisions: ForestAggregateLodDecision[];
  counts: Record<ForestAggregateCullingPath, number>;
}

const LOD_DETAIL_ORDER: Record<VegetationLodBand, number> = {
  closeHeroHybrid: 0,
  midClusterCard: 1,
  farOctahedralImpostor: 2,
  horizonCanopyCoverage: 3,
};

export function buildForestAggregateLodPlan(
  profile: RendererFeatureProfile,
  cells: readonly ForestAggregateCellInput[],
  options: ForestAggregateLodPlanOptions,
): ForestAggregateLodPlan {
  const decisions = cells.map((cell) => buildCellDecision(profile, cell, options));
  const counts: Record<ForestAggregateCullingPath, number> = {
    currentCpuResidency: 0,
    webgpuCompactProof: 0,
    terrainHorizonCoverage: 0,
    blocked: 0,
  };

  for (const decision of decisions) {
    counts[decision.cullingPath] += 1;
  }

  return {
    debugOnly: true,
    runtimeDefaultEnabled: false,
    copiesFableAssets: FOREST_NANITE_LITE_STRATEGY.copiesFableAssets,
    trueMeshletNanite: FOREST_NANITE_LITE_STRATEGY.ownsTrueMeshlets,
    rendererPosture: profile.posture,
    decisions,
    counts,
  };
}

function buildCellDecision(
  profile: RendererFeatureProfile,
  cell: ForestAggregateCellInput,
  options: ForestAggregateLodPlanOptions,
): ForestAggregateLodDecision {
  const distanceMeters = distanceToCellEdge(cell, options);
  const allSpecs = cell.speciesIds.map((id) => getVietnamVegetationSpeciesById(id));
  const eligibleSpecs = allSpecs.filter((spec) => isEligibleForPlanning(spec, cell));
  const blockedSpecies = allSpecs.filter((spec) => !isEligibleForPlanning(spec, cell));
  const selectedBand = selectLodBand(eligibleSpecs, distanceMeters);
  const blockers: string[] = [];

  if (eligibleSpecs.length === 0) {
    blockers.push('No eligible TIJ vegetation source assets for this aggregate cell.');
  }
  if (blockedSpecies.length > 0) {
    blockers.push(`Blocked/source-only species excluded: ${blockedSpecies.map((spec) => spec.id).join(', ')}.`);
  }
  if (!selectedBand) {
    blockers.push('No vegetation LOD band covers this camera distance for the eligible species.');
  }

  const requiresAcceptedSourceAssets = eligibleSpecs.some((spec) => spec.sourceStatus !== 'acceptedRuntimeAtlas');
  const proofHooks = collectProofHooks(profile, selectedBand);
  const webgpuProofRequired = selectedBand?.webgpuPath === 'required-webgpu-proof';
  const sourceBlocked = requiresAcceptedSourceAssets && cell.acceptedFutureSourceAssets !== true;
  if (sourceBlocked) {
    blockers.push('Future tree/aggregate source assets must pass ASSET_ACCEPTANCE_STANDARD before runtime use.');
  }

  if (webgpuProofRequired) {
    if (!profile.decisions.gpuForestCulling.available) {
      blockers.push(`GPU forest culling unavailable: ${profile.decisions.gpuForestCulling.reason}`);
    }
    if (!profile.decisions.octahedralImpostorBake.available) {
      blockers.push(`Octahedral impostor bake unavailable: ${profile.decisions.octahedralImpostorBake.reason}`);
    }
  }

  const cullingPath = chooseCullingPath(profile, selectedBand, blockers);

  return {
    cellId: cell.cellId,
    distanceMeters,
    speciesIds: [...cell.speciesIds],
    estimatedInstances: Math.max(0, cell.estimatedInstances),
    selectedBand: selectedBand?.band ?? null,
    representation: selectedBand?.representation ?? null,
    owner: selectedBand?.owner ?? null,
    cullingPath,
    webgpuProofRequired,
    requiresAcceptedSourceAssets,
    runtimeDefaultEnabled: false,
    copiesFableAssets: false,
    trueMeshletNanite: false,
    blockers,
    proofHooks,
    reason: buildReason(cullingPath, selectedBand, profile, blockers),
  };
}

function distanceToCellEdge(
  cell: ForestAggregateCellInput,
  options: ForestAggregateLodPlanOptions,
): number {
  const dx = cell.centerX - options.cameraX;
  const dz = cell.centerZ - options.cameraZ;
  const centerDistance = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0, centerDistance - Math.max(0, cell.radiusMeters));
}

function isEligibleForPlanning(
  spec: VietnamVegetationSpeciesSpec,
  cell: ForestAggregateCellInput,
): boolean {
  if (spec.sourceStatus === 'acceptedRuntimeAtlas') return spec.existingRuntimeTypeId !== null;
  if (spec.sourceStatus === 'sourceSpecOnly') return cell.acceptedFutureSourceAssets === true;
  return false;
}

function selectLodBand(
  specs: readonly VietnamVegetationSpeciesSpec[],
  distanceMeters: number,
): VegetationAggregateLodSpec | null {
  const candidates = specs
    .flatMap((spec) => spec.lod)
    .filter((band) => distanceMeters >= band.distanceMinMeters && distanceMeters <= band.distanceMaxMeters)
    .sort(compareLodBands);
  if (candidates.length > 0) return candidates[0];

  const nearest = specs
    .flatMap((spec) => spec.lod)
    .sort((a, b) => {
      const aGap = distanceGap(a, distanceMeters);
      const bGap = distanceGap(b, distanceMeters);
      if (aGap !== bGap) return aGap - bGap;
      return compareLodBands(a, b);
    });
  return nearest[0] ?? null;
}

function compareLodBands(
  a: VegetationAggregateLodSpec,
  b: VegetationAggregateLodSpec,
): number {
  return LOD_DETAIL_ORDER[a.band] - LOD_DETAIL_ORDER[b.band];
}

function distanceGap(
  band: VegetationAggregateLodSpec,
  distanceMeters: number,
): number {
  if (distanceMeters < band.distanceMinMeters) return band.distanceMinMeters - distanceMeters;
  if (distanceMeters > band.distanceMaxMeters) return distanceMeters - band.distanceMaxMeters;
  return 0;
}

function collectProofHooks(
  profile: RendererFeatureProfile,
  selectedBand: VegetationAggregateLodSpec | null,
): string[] {
  const hooks = new Set<string>();
  if (!selectedBand) return [];

  if (selectedBand.webgpuPath === 'optional-gpu-cull' || selectedBand.webgpuPath === 'required-webgpu-proof') {
    for (const hook of profile.decisions.gpuForestCulling.proofHooks) hooks.add(hook);
  }
  if (selectedBand.band === 'farOctahedralImpostor') {
    for (const hook of profile.decisions.octahedralImpostorBake.proofHooks) hooks.add(hook);
  }
  return [...hooks];
}

function chooseCullingPath(
  profile: RendererFeatureProfile,
  selectedBand: VegetationAggregateLodSpec | null,
  blockers: readonly string[],
): ForestAggregateCullingPath {
  if (blockers.some((blocker) => !blocker.startsWith('Blocked/source-only species excluded:'))) {
    return 'blocked';
  }
  if (!selectedBand) return 'blocked';
  if (selectedBand.owner === 'TerrainMaterial') return 'terrainHorizonCoverage';
  if (selectedBand.webgpuPath === 'required-webgpu-proof') return 'webgpuCompactProof';
  if (selectedBand.webgpuPath === 'optional-gpu-cull' && profile.decisions.gpuForestCulling.available) {
    return 'webgpuCompactProof';
  }
  return 'currentCpuResidency';
}

function buildReason(
  cullingPath: ForestAggregateCullingPath,
  selectedBand: VegetationAggregateLodSpec | null,
  profile: RendererFeatureProfile,
  blockers: readonly string[],
): string {
  if (cullingPath === 'blocked') return blockers.join(' ');
  if (cullingPath === 'terrainHorizonCoverage') {
    return 'Very distant canopy resolves through terrain-material horizon coverage rather than individual tree geometry.';
  }
  if (cullingPath === 'webgpuCompactProof') {
    return selectedBand?.webgpuPath === 'required-webgpu-proof'
      ? 'Selected aggregate band requires strict WebGPU forest culling and impostor proof hooks.'
      : 'Selected aggregate band may use WebGPU compact/indirect proof while CPU residency remains the fallback.';
  }
  return profile.posture === 'compatibilityFallback'
    ? 'Compatibility fallback keeps the current CPU residency and billboard draw path.'
    : 'Current accepted vegetation uses the existing scatterer and billboard residency path.';
}
