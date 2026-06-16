// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { RendererFeatureDecision, RendererFeatureProfile } from '../../core/RendererFeatureProfile';

export const SKY_CLOUD_POST_PROOF_FLAG = 'sky-cloud-post';

export interface SkyCloudPostProofRequest {
  requested: boolean;
  renderPipelinePost: boolean;
  volumetricCloudPrototype: boolean;
  cloudShadowProbe: boolean;
}

export type SkyCloudPostProofState = 'not-requested' | 'webgpu-proof' | 'blocked';
export type SkyCloudPostFeatureStatus = 'not-requested' | 'enabled' | 'blocked';

export interface SkyCloudPostFeatureGate {
  status: SkyCloudPostFeatureStatus;
  reason: string;
  proofHooks: string[];
}

export interface SkyCloudPostProofMatrix {
  renderers: readonly ['webgpu-strict'];
  scenarios: readonly ['open_frontier', 'a_shau_valley', 'team_deathmatch', 'zone_control', 'combat120'];
  timesOfDay: readonly ['noon', 'golden', 'twilight', 'midnight'];
  perspectives: readonly ['ground', 'elevated', 'aircraft'];
  gates: readonly ['npm run check:tod-coherence', 'npm run evidence:atmosphere', 'npm run validate:fast'];
}

export interface SkyCloudPostProofGate {
  state: SkyCloudPostProofState;
  enabled: boolean;
  requested: boolean;
  runtimeDefault: false;
  webgpuOnly: true;
  lightingAuthority: 'AtmosphereSystem/LightingRig';
  rendererPosture: RendererFeatureProfile['posture'];
  resolvedBackend: RendererFeatureProfile['resolvedBackend'];
  renderPipelinePost: SkyCloudPostFeatureGate;
  volumetricCloudPrototype: SkyCloudPostFeatureGate;
  cloudShadowProbe: SkyCloudPostFeatureGate;
  requiredProofMatrix: SkyCloudPostProofMatrix;
  blockers: string[];
  notes: string[];
}

const DEFAULT_REQUEST: SkyCloudPostProofRequest = {
  requested: false,
  renderPipelinePost: true,
  volumetricCloudPrototype: true,
  cloudShadowProbe: false,
};

const REQUIRED_PROOF_MATRIX: SkyCloudPostProofMatrix = {
  renderers: ['webgpu-strict'],
  scenarios: ['open_frontier', 'a_shau_valley', 'team_deathmatch', 'zone_control', 'combat120'],
  timesOfDay: ['noon', 'golden', 'twilight', 'midnight'],
  perspectives: ['ground', 'elevated', 'aircraft'],
  gates: ['npm run check:tod-coherence', 'npm run evidence:atmosphere', 'npm run validate:fast'],
};

const PROOF_QUERY_KEYS = [
  'worldProof',
  'proof',
  'featureProof',
  'skyCloudPostProof',
] as const;

export function readSkyCloudPostProofRequestFromSearch(search: string): SkyCloudPostProofRequest {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const requested = hasProofFlag(params);

  return {
    requested,
    renderPipelinePost: requested && flagNotDisabled(params, 'post'),
    volumetricCloudPrototype: requested && flagNotDisabled(params, 'clouds'),
    cloudShadowProbe: requested && flagEnabled(params, 'cloudShadows'),
  };
}

export function buildSkyCloudPostProofGate(
  profile: RendererFeatureProfile,
  request: SkyCloudPostProofRequest = DEFAULT_REQUEST,
): SkyCloudPostProofGate {
  const blockers: string[] = [];

  if (!request.requested) {
    blockers.push(`Missing proof flag '${SKY_CLOUD_POST_PROOF_FLAG}'.`);
  }

  if (profile.posture !== 'webgpuPrimary' || profile.resolvedBackend !== 'webgpu' || !profile.strictWebGPU) {
    blockers.push('Sky/cloud/post proof requires a strict WebGPU backend; fallback paths stay compatibility-only.');
  }

  if (profile.deviceLoss.lost) {
    blockers.push('WebGPU device loss was reported; recreate the renderer before running sky/cloud/post proof.');
  }

  if (!request.renderPipelinePost && !request.volumetricCloudPrototype && !request.cloudShadowProbe) {
    blockers.push('At least one sky/cloud/post proof feature must be requested.');
  }

  const renderPipelinePost = buildDecisionGate(
    request.renderPipelinePost,
    profile.decisions.renderPipelinePost,
  );
  const volumetricCloudPrototype = buildDecisionGate(
    request.volumetricCloudPrototype,
    profile.decisions.volumetricCloudPrototype,
  );
  const cloudShadowProbe = buildCloudShadowGate(request.cloudShadowProbe, volumetricCloudPrototype);

  appendFeatureBlockers(blockers, 'renderPipelinePost', renderPipelinePost);
  appendFeatureBlockers(blockers, 'volumetricCloudPrototype', volumetricCloudPrototype);
  appendFeatureBlockers(blockers, 'cloudShadowProbe', cloudShadowProbe);

  const enabled = request.requested && blockers.length === 0;

  return {
    state: request.requested ? (enabled ? 'webgpu-proof' : 'blocked') : 'not-requested',
    enabled,
    requested: request.requested,
    runtimeDefault: false,
    webgpuOnly: true,
    lightingAuthority: 'AtmosphereSystem/LightingRig',
    rendererPosture: profile.posture,
    resolvedBackend: profile.resolvedBackend,
    renderPipelinePost,
    volumetricCloudPrototype,
    cloudShadowProbe,
    requiredProofMatrix: REQUIRED_PROOF_MATRIX,
    blockers,
    notes: [
      'This gate authorizes only a diagnostic prototype; it does not replace AtmosphereSystem, LightingRig, SunDiscMesh, or the retired PostProcessingManager shim.',
      'Cloud and post work must consume the existing atmosphere lighting authority instead of creating a second sun, fog, or exposure source.',
      'Passing this gate is not visual acceptance; the required proof matrix must still be captured before default-on behavior.',
    ],
  };
}

function buildDecisionGate(
  requested: boolean,
  decision: RendererFeatureDecision,
): SkyCloudPostFeatureGate {
  if (!requested) {
    return {
      status: 'not-requested',
      reason: 'Feature disabled by the proof request.',
      proofHooks: [],
    };
  }

  return {
    status: decision.available ? 'enabled' : 'blocked',
    reason: decision.reason,
    proofHooks: [...decision.proofHooks],
  };
}

function buildCloudShadowGate(
  requested: boolean,
  cloudGate: SkyCloudPostFeatureGate,
): SkyCloudPostFeatureGate {
  if (!requested) {
    return {
      status: 'not-requested',
      reason: 'Cloud-shadow projection is not requested by the proof flag.',
      proofHooks: [],
    };
  }
  if (cloudGate.status !== 'enabled') {
    return {
      status: 'blocked',
      reason: 'Cloud-shadow projection requires the volumetric cloud prototype gate first.',
      proofHooks: [...cloudGate.proofHooks],
    };
  }
  return {
    status: 'enabled',
    reason: 'Cloud-shadow projection may run only as a visual diagnostic paired with the atmosphere evidence matrix.',
    proofHooks: [
      ...cloudGate.proofHooks,
      'npm run evidence:atmosphere',
    ],
  };
}

function appendFeatureBlockers(
  blockers: string[],
  name: string,
  gate: SkyCloudPostFeatureGate,
): void {
  if (gate.status === 'blocked') {
    blockers.push(`${name} blocked: ${gate.reason}`);
  }
}

function hasProofFlag(params: URLSearchParams): boolean {
  for (const key of PROOF_QUERY_KEYS) {
    if (key === 'skyCloudPostProof' && flagEnabled(params, key)) return true;
    const values = params.getAll(key);
    for (const value of values) {
      if (hasToken(value, SKY_CLOUD_POST_PROOF_FLAG) || hasToken(value, 'fable-sky-post')) {
        return true;
      }
    }
  }
  return false;
}

function flagEnabled(params: URLSearchParams, key: string): boolean {
  const value = params.get(key);
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function flagNotDisabled(params: URLSearchParams, key: string): boolean {
  const value = params.get(key);
  if (value === null) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

function hasToken(value: string, expected: string): boolean {
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .includes(expected);
}
