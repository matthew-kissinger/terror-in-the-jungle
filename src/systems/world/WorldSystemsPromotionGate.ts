// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import {
  getBlockedVegetationSpeciesSpecs,
  getRuntimeAcceptedVegetationSpecies,
} from '../../config/VietnamVegetationSpecies';
import type { RendererFeatureProfile } from '../../core/RendererFeatureProfile';
import type { SkyCloudPostProofGate } from '../environment/SkyCloudPostProofGate';
import type { DebugWaterProof } from '../environment/water/DebugWaterProof';
import type { ForestAggregateLodPlan } from '../terrain/ForestAggregateLodPlan';
import type { HeightfieldErosionAuthoritySpikeReport } from '../terrain/HeightfieldErosionAuthoritySpike';

export type WorldSystemsPromotionStatus = 'go' | 'spike' | 'no-go';

export type WorldSystemsPromotionLane =
  | 'webgpuPolicy'
  | 'vegetationRuntimeAssets'
  | 'vegetationSpeciesSpecs'
  | 'terrainAuthority'
  | 'debugWaterProof'
  | 'runtimeWater'
  | 'skyCloudPost'
  | 'forestAggregateLod'
  | 'trueMeshletNanite'
  | 'fableAssetPort'
  | 'vehicleInteractionClarity';

export interface VehicleInteractionClarityProof {
  factionAwarePrompts: boolean;
  enemyBoardingBlocked: boolean;
  proofHooks: readonly string[];
}

export interface WorldSystemsPromotionGateInput {
  rendererProfile: RendererFeatureProfile;
  skyCloudPostGate: SkyCloudPostProofGate;
  heightfieldErosion: HeightfieldErosionAuthoritySpikeReport;
  debugWaterProof: DebugWaterProof;
  forestAggregateLodPlan: ForestAggregateLodPlan;
  vehicleInteractionClarity: VehicleInteractionClarityProof;
}

export interface WorldSystemsPromotionDecision {
  lane: WorldSystemsPromotionLane;
  status: WorldSystemsPromotionStatus;
  runtimeDefaultEnabled: boolean;
  reason: string;
  blockers: string[];
  proofHooks: string[];
}

export interface WorldSystemsPromotionGate {
  releaseReady: boolean;
  decisions: WorldSystemsPromotionDecision[];
  counts: Record<WorldSystemsPromotionStatus, number>;
  runtimeDefaultPromotions: WorldSystemsPromotionLane[];
  notes: string[];
}

export function buildWorldSystemsPromotionGate(
  input: WorldSystemsPromotionGateInput,
): WorldSystemsPromotionGate {
  const acceptedVegetation = getRuntimeAcceptedVegetationSpecies();
  const blockedVegetation = getBlockedVegetationSpeciesSpecs();
  const decisions: WorldSystemsPromotionDecision[] = [
    decideWebgpuPolicy(input.rendererProfile),
    {
      lane: 'vegetationRuntimeAssets',
      status: acceptedVegetation.length > 0 ? 'go' : 'no-go',
      runtimeDefaultEnabled: acceptedVegetation.length > 0,
      reason: acceptedVegetation.length > 0
        ? `${acceptedVegetation.length} accepted TIJ vegetation atlas species may stay in runtime.`
        : 'No accepted TIJ vegetation runtime assets are available.',
      blockers: acceptedVegetation.length > 0 ? [] : ['Vegetation runtime needs at least one accepted atlas/source asset.'],
      proofHooks: [
        'npm run check:vegetation-horizon',
        'npm run check:vegetation-grounding',
      ],
    },
    {
      lane: 'vegetationSpeciesSpecs',
      status: 'go',
      runtimeDefaultEnabled: false,
      reason: 'Fable generated-species concepts are translated into TIJ Vietnam species specs only.',
      blockers: blockedVegetation.map((spec) => `${spec.displayName} remains blocked until accepted source assets exist.`),
      proofHooks: ['npm run check:forest-lod-plan'],
    },
    decideTerrainAuthority(input.heightfieldErosion),
    decideDebugWater(input.debugWaterProof),
    {
      lane: 'runtimeWater',
      status: 'no-go',
      runtimeDefaultEnabled: false,
      reason: input.rendererProfile.decisions.runtimeWater.reason,
      blockers: ['Runtime water waits for a dedicated first-principles VODA cycle.'],
      proofHooks: input.rendererProfile.decisions.runtimeWater.proofHooks,
    },
    decideSkyCloudPost(input.skyCloudPostGate),
    decideForestAggregate(input.forestAggregateLodPlan),
    {
      lane: 'trueMeshletNanite',
      status: 'no-go',
      runtimeDefaultEnabled: false,
      reason: input.forestAggregateLodPlan.trueMeshletNanite
        ? 'True meshlet Nanite appeared in the plan and must be removed before release.'
        : 'True meshlet Nanite is outside the browser/WebGPU runtime target; evaluate only aggregate/Nanite-lite culling.',
      blockers: ['No true meshlet Nanite runtime path without an explicit engine-architecture approval.'],
      proofHooks: ['npm run check:forest-lod-plan'],
    },
    {
      lane: 'fableAssetPort',
      status: 'no-go',
      runtimeDefaultEnabled: false,
      reason: 'Fable5 remains reference code; runtime assets and generated content must be TIJ-authored or importer-accepted.',
      blockers: ['No wholesale Fable assets, generated species, terrain authority, water, or Forests port.'],
      proofHooks: ['npm run assets:import-war-catalog', 'npm run check:asset-gallery'],
    },
    decideVehicleInteractionClarity(input.vehicleInteractionClarity),
  ];

  const counts: Record<WorldSystemsPromotionStatus, number> = {
    go: 0,
    spike: 0,
    'no-go': 0,
  };
  for (const decision of decisions) {
    counts[decision.status] += 1;
  }

  return {
    releaseReady: decisions.every((decision) => {
      if (decision.lane === 'webgpuPolicy' && decision.status === 'no-go') return false;
      return decision.status !== 'no-go' || !decision.runtimeDefaultEnabled;
    }),
    decisions,
    counts,
    runtimeDefaultPromotions: decisions
      .filter((decision) => decision.status === 'go' && decision.runtimeDefaultEnabled)
      .map((decision) => decision.lane),
    notes: [
      'GO means safe to keep or ship in this cycle with listed proof hooks.',
      'SPIKE means useful reference/prototype work but not default-on runtime behavior.',
      'NO-GO means intentionally excluded from production for this cycle.',
    ],
  };
}

function decideWebgpuPolicy(profile: RendererFeatureProfile): WorldSystemsPromotionDecision {
  const canShip = profile.posture === 'webgpuPrimary' || profile.posture === 'compatibilityFallback';
  return {
    lane: 'webgpuPolicy',
    status: canShip ? 'go' : 'no-go',
    runtimeDefaultEnabled: canShip,
    reason: canShip
      ? 'One project remains WebGPU-primary with a compatibility fallback; advanced systems are feature-gated instead of mirrored into a second app.'
      : `Renderer posture ${profile.posture} cannot support the release policy.`,
    blockers: canShip ? [] : ['Renderer must initialize through WebGPURenderer or its compatibility fallback.'],
    proofHooks: ['npm run check:platform-capabilities'],
  };
}

function decideTerrainAuthority(
  report: HeightfieldErosionAuthoritySpikeReport,
): WorldSystemsPromotionDecision {
  const diagnosticOnly = report.debugOnly && !report.authoritative && !report.mutatesTerrain;
  return {
    lane: 'terrainAuthority',
    status: diagnosticOnly ? 'spike' : 'no-go',
    runtimeDefaultEnabled: false,
    reason: diagnosticOnly
      ? 'Heightfield/erosion analysis is useful as a TIJ terrain diagnostic, but it does not own terrain.'
      : 'Heightfield/erosion analysis tried to become authoritative or mutating.',
    blockers: diagnosticOnly
      ? ['Terrain ownership swap requires A Shau DEM, navmesh, startup, and visual proof in a separate cycle.']
      : ['Remove authority/mutation before release.'],
    proofHooks: ['npm run check:terrain-baseline', 'npm run check:terrain-visual'],
  };
}

function decideDebugWater(proof: DebugWaterProof): WorldSystemsPromotionDecision {
  const diagnosticOnly = proof.debugOnly && !proof.authoritative;
  return {
    lane: 'debugWaterProof',
    status: diagnosticOnly ? 'spike' : 'no-go',
    runtimeDefaultEnabled: false,
    reason: diagnosticOnly
      ? 'Debug basin/river samples are acceptable as non-authoritative design proof only.'
      : 'Debug water proof became authoritative and must not ship.',
    blockers: diagnosticOnly
      ? ['No runtime water, query API, swimming, buoyancy, or watercraft reactivation in this cycle.']
      : ['Restore debug-only/non-authoritative water semantics.'],
    proofHooks: ['npm run test:quick -- src/systems/environment/water/DebugWaterProof.test.ts'],
  };
}

function decideSkyCloudPost(gate: SkyCloudPostProofGate): WorldSystemsPromotionDecision {
  return {
    lane: 'skyCloudPost',
    status: 'spike',
    runtimeDefaultEnabled: false,
    reason: gate.enabled
      ? 'Strict-WebGPU sky/cloud/post proof may run behind the proof flag, but default-on needs the full visual matrix.'
      : `Sky/cloud/post remains default-off: ${gate.blockers.join(' ')}`,
    blockers: [
      'Default-on cloud/post replacement requires clean strict-WebGPU visual matrix, fallback review, and owner visual acceptance.',
      ...gate.blockers,
    ],
    proofHooks: [
      'npm run check:sky-cloud-post-proof',
      ...gate.requiredProofMatrix.gates,
    ],
  };
}

function decideForestAggregate(plan: ForestAggregateLodPlan): WorldSystemsPromotionDecision {
  const proofCells = plan.counts.webgpuCompactProof + plan.counts.terrainHorizonCoverage;
  return {
    lane: 'forestAggregateLod',
    status: 'spike',
    runtimeDefaultEnabled: false,
    reason: proofCells > 0
      ? 'Forest aggregate LOD strategy is useful as proof/planning, while current runtime vegetation keeps existing residency paths.'
      : 'Forest aggregate LOD is still blocked by missing source assets or renderer proof.',
    blockers: [
      'No full Forests port or runtime HLOD swap until trusted large-mode perf and visual pop/flicker proof pass.',
    ],
    proofHooks: ['npm run check:forest-lod-plan', 'npm run check:culling-baseline'],
  };
}

function decideVehicleInteractionClarity(
  proof: VehicleInteractionClarityProof,
): WorldSystemsPromotionDecision {
  const canShip = proof.factionAwarePrompts && proof.enemyBoardingBlocked;
  return {
    lane: 'vehicleInteractionClarity',
    status: canShip ? 'go' : 'spike',
    runtimeDefaultEnabled: canShip,
    reason: canShip
      ? 'Vehicle prompts now distinguish friendly boardable vehicles from enemy non-boardable vehicles.'
      : 'Vehicle ownership/boardability clarity still needs faction-aware prompt proof.',
    blockers: canShip ? [] : ['Enemy-owned vehicles must not expose a boardable prompt id.'],
    proofHooks: [...proof.proofHooks],
  };
}
