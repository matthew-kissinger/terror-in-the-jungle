#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Artifact-producing proof for the Fable/WebGPU world-systems profile.
 *
 * This evaluates the real `buildRendererFeatureProfile` code against
 * representative backend states. It proves lane policy and proof-hook
 * invariants only; it deliberately does not claim runtime visuals, perf, owner
 * approval, production release, or gameplay-water readiness.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RendererBackendCapabilities } from '../src/core/RendererBackend';
import {
  buildRendererFeatureProfile,
  type RendererFeatureId,
  type RendererFeatureProfile,
  type RendererFeatureProofHook,
} from '../src/core/RendererFeatureProfile';

type CheckStatus = 'pass' | 'fail';

type ScenarioName =
  | 'strict-webgpu-ready'
  | 'default-webgpu-ready'
  | 'webgpu-low-storage'
  | 'webgpu-low-compute'
  | 'webgpu-webgl-fallback'
  | 'legacy-webgl'
  | 'failed-webgpu-init';

type ScenarioResult = {
  name: ScenarioName;
  profile: RendererFeatureProfile;
  checks: NamedCheck[];
};

type NamedCheck = {
  id: string;
  status: CheckStatus;
  message: string;
  evidence: unknown;
};

type WorldSystemsProfileArtifact = {
  createdAt: string;
  source: 'world-systems-profile-proof';
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  scenarios: ScenarioResult[];
  summary: {
    scenarioCount: number;
    failingChecks: number;
    runtimeWaterAvailableCount: number;
    diagnosticLaneAvailableCount: number;
  };
  files: {
    summary: string;
    markdown: string;
  };
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'world-systems-profile-proof';

const WORLD_SYSTEM_LANES: RendererFeatureId[] = [
  'terrainHeightfieldErosion',
  'debugWaterLevelProof',
  'renderPipelinePost',
  'volumetricCloudPrototype',
  'gpuForestCulling',
  'aggregateForestLod',
  'naniteLiteClusterStudy',
  'octahedralImpostorBake',
  'vietnamSpeciesSourceSpecs',
  'hydrologyAnalysis',
  'runtimeWater',
];

const ALWAYS_DIAGNOSTIC_OR_DISABLED: RendererFeatureId[] = [
  'terrainHeightfieldErosion',
  'debugWaterLevelProof',
  'renderPipelinePost',
  'volumetricCloudPrototype',
  'gpuForestCulling',
  'aggregateForestLod',
  'naniteLiteClusterStudy',
  'octahedralImpostorBake',
  'vietnamSpeciesSourceSpecs',
  'hydrologyAnalysis',
];

const REQUIRED_HOOKS: Partial<Record<RendererFeatureId, RendererFeatureProofHook[]>> = {
  terrainHeightfieldErosion: ['terrainBaselineProof', 'terrainVisualMatrix', 'quietMachinePerfAttribution'],
  debugWaterLevelProof: ['ownerDebugWaterApproval', 'terrainBaselineProof'],
  renderPipelinePost: ['todCoherenceGate', 'atmosphereEvidenceMatrix', 'quietMachinePerfAttribution'],
  volumetricCloudPrototype: ['todCoherenceGate', 'atmosphereEvidenceMatrix', 'quietMachinePerfAttribution'],
  gpuForestCulling: ['terrainBaselineProof', 'terrainVisualMatrix', 'quietMachinePerfAttribution'],
  aggregateForestLod: ['assetAcceptanceReview', 'assetGalleryReview', 'terrainBaselineProof'],
  naniteLiteClusterStudy: ['assetAcceptanceReview', 'terrainVisualMatrix'],
  octahedralImpostorBake: ['assetAcceptanceReview', 'assetGalleryReview'],
  vietnamSpeciesSourceSpecs: ['assetAcceptanceReview', 'assetGalleryReview'],
  hydrologyAnalysis: ['ownerDebugWaterApproval', 'terrainBaselineProof'],
  runtimeWater: ['ownerDebugWaterApproval', 'liveReleaseGate'],
};

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function gitOutputOrFallback(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function gitStatus(): string[] {
  const output = gitOutputOrFallback(['status', '--short'], '');
  return output.split(/\r?\n/).filter(Boolean);
}

function baseCapabilities(overrides: Partial<RendererBackendCapabilities>): RendererBackendCapabilities {
  const base: RendererBackendCapabilities = {
    requestedMode: 'webgpu',
    resolvedBackend: 'webgpu',
    initStatus: 'ready',
    isWebGPURenderer: true,
    forceWebGL: false,
    strictWebGPU: false,
    navigatorGpuAvailable: true,
    adapterAvailable: true,
    adapterName: 'world-systems-proof-adapter',
    adapterFeatures: ['shader-f16'],
    adapterLimits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024,
      maxComputeInvocationsPerWorkgroup: 256,
    },
    error: null,
    notes: ['Synthetic profile proof capability snapshot.'],
  };

  return {
    ...base,
    ...overrides,
    adapterFeatures: overrides.adapterFeatures ?? base.adapterFeatures,
    adapterLimits: overrides.adapterLimits ?? base.adapterLimits,
    notes: overrides.notes ?? base.notes,
  };
}

function scenarioCapabilities(): Array<{ name: ScenarioName; capabilities: RendererBackendCapabilities }> {
  return [
    {
      name: 'strict-webgpu-ready',
      capabilities: baseCapabilities({
        requestedMode: 'webgpu-strict',
        strictWebGPU: true,
        notes: ['Strict WebGPU proof mode synthetic snapshot.'],
      }),
    },
    {
      name: 'default-webgpu-ready',
      capabilities: baseCapabilities({
        requestedMode: 'webgpu',
        strictWebGPU: false,
      }),
    },
    {
      name: 'webgpu-low-storage',
      capabilities: baseCapabilities({
        adapterLimits: {
          maxStorageBufferBindingSize: 64 * 1024 * 1024,
          maxComputeInvocationsPerWorkgroup: 256,
        },
      }),
    },
    {
      name: 'webgpu-low-compute',
      capabilities: baseCapabilities({
        adapterLimits: {
          maxStorageBufferBindingSize: 256 * 1024 * 1024,
          maxComputeInvocationsPerWorkgroup: 64,
        },
      }),
    },
    {
      name: 'webgpu-webgl-fallback',
      capabilities: baseCapabilities({
        resolvedBackend: 'webgpu-webgl-fallback',
        navigatorGpuAvailable: false,
        adapterAvailable: false,
        adapterFeatures: [],
        adapterLimits: {},
        notes: ['Synthetic unified WebGPURenderer WebGL2 fallback snapshot.'],
      }),
    },
    {
      name: 'legacy-webgl',
      capabilities: baseCapabilities({
        requestedMode: 'webgl',
        resolvedBackend: 'webgl',
        isWebGPURenderer: false,
        navigatorGpuAvailable: false,
        adapterAvailable: false,
        adapterFeatures: [],
        adapterLimits: {},
        notes: ['Synthetic legacy WebGL diagnostic renderer snapshot.'],
      }),
    },
    {
      name: 'failed-webgpu-init',
      capabilities: baseCapabilities({
        resolvedBackend: 'unknown',
        initStatus: 'failed',
        isWebGPURenderer: false,
        navigatorGpuAvailable: true,
        adapterAvailable: false,
        adapterFeatures: [],
        adapterLimits: {},
        error: 'synthetic init failure',
        notes: ['Synthetic failed WebGPU init snapshot.'],
      }),
    },
  ];
}

function makeCheck(
  id: string,
  passed: boolean,
  message: string,
  evidence: unknown,
): NamedCheck {
  return {
    id,
    status: passed ? 'pass' : 'fail',
    message,
    evidence,
  };
}

function lanePolicyChecks(profile: RendererFeatureProfile): NamedCheck[] {
  const checks: NamedCheck[] = [];

  checks.push(makeCheck(
    'runtime-water-disabled',
    profile.decisions.runtimeWater.available === false
      && profile.decisions.runtimeWater.policy === 'disabled',
    'Runtime water must be unavailable and disabled in every profile.',
    profile.decisions.runtimeWater,
  ));

  checks.push(makeCheck(
    'runtime-water-no-device-restore',
    profile.deviceLoss.runtimeWaterRestores === false
      && profile.decisions.runtimeWater.deviceLossPolicy === 'disabledUntilFutureCycle',
    'Runtime water must have no restore path this cycle.',
    {
      deviceLoss: profile.deviceLoss,
      runtimeWaterDecision: profile.decisions.runtimeWater,
    },
  ));

  for (const lane of ALWAYS_DIAGNOSTIC_OR_DISABLED) {
    const decision = profile.decisions[lane];
    checks.push(makeCheck(
      `${lane}-not-production`,
      decision.policy === 'diagnosticOnly' || decision.policy === 'disabled',
      `${lane} must remain diagnostic-only or disabled.`,
      decision,
    ));
  }

  for (const lane of WORLD_SYSTEM_LANES) {
    const decision = profile.decisions[lane];
    checks.push(makeCheck(
      `${lane}-has-proof-hooks`,
      decision.proofHooks.length > 0,
      `${lane} must publish proof hooks for handoff scripts and docs.`,
      decision.proofHooks,
    ));
  }

  for (const [lane, hooks] of Object.entries(REQUIRED_HOOKS) as Array<[RendererFeatureId, RendererFeatureProofHook[]]>) {
    const decision = profile.decisions[lane];
    const missing = hooks.filter((hook) => !decision.proofHooks.includes(hook));
    checks.push(makeCheck(
      `${lane}-required-proof-hooks`,
      missing.length === 0,
      `${lane} must retain required proof hooks.`,
      { actual: decision.proofHooks, missing },
    ));
  }

  return checks;
}

function capabilityChecks(name: ScenarioName, profile: RendererFeatureProfile): NamedCheck[] {
  const checks: NamedCheck[] = [];

  if (name === 'strict-webgpu-ready' || name === 'default-webgpu-ready') {
    checks.push(makeCheck(
      `${name}-world-fields-available`,
      profile.decisions.storageBufferWorldFields.available === true,
      'Capable WebGPU profiles must unlock world-field proof lanes.',
      profile.decisions.storageBufferWorldFields,
    ));
    checks.push(makeCheck(
      `${name}-debug-water-diagnostic`,
      profile.decisions.debugWaterLevelProof.available === true
        && profile.decisions.debugWaterLevelProof.policy === 'diagnosticOnly',
      'Capable WebGPU profiles may expose debug water proof only as diagnostic-only.',
      profile.decisions.debugWaterLevelProof,
    ));
  }

  if (name === 'webgpu-low-storage') {
    checks.push(makeCheck(
      'low-storage-world-fields-disabled',
      profile.decisions.storageBufferWorldFields.available === false
        && profile.decisions.debugWaterLevelProof.available === false
        && profile.decisions.hydrologyAnalysis.available === false,
      'Below-floor storage buffers must disable world-field and water/hydrology proof lanes.',
      {
        storageBufferWorldFields: profile.decisions.storageBufferWorldFields,
        debugWaterLevelProof: profile.decisions.debugWaterLevelProof,
        hydrologyAnalysis: profile.decisions.hydrologyAnalysis,
      },
    ));
  }

  if (name === 'webgpu-low-compute') {
    checks.push(makeCheck(
      'low-compute-world-fields-disabled',
      profile.decisions.webgpuCompute.available === false
        && profile.decisions.storageBufferWorldFields.available === false
        && profile.decisions.gpuForestCulling.available === false,
      'Below-floor compute limits must disable compute-dependent world-system lanes.',
      {
        webgpuCompute: profile.decisions.webgpuCompute,
        storageBufferWorldFields: profile.decisions.storageBufferWorldFields,
        gpuForestCulling: profile.decisions.gpuForestCulling,
      },
    ));
  }

  if (name === 'webgpu-webgl-fallback' || name === 'legacy-webgl' || name === 'failed-webgpu-init') {
    checks.push(makeCheck(
      `${name}-compute-lanes-disabled`,
      profile.decisions.webgpuCompute.available === false
        && profile.decisions.storageBufferWorldFields.available === false
        && profile.decisions.volumetricCloudPrototype.available === false
        && profile.decisions.gpuForestCulling.available === false,
      'Fallback, legacy, and failed profiles must disable WebGPU compute/world-field lanes.',
      {
        webgpuCompute: profile.decisions.webgpuCompute,
        storageBufferWorldFields: profile.decisions.storageBufferWorldFields,
        volumetricCloudPrototype: profile.decisions.volumetricCloudPrototype,
        gpuForestCulling: profile.decisions.gpuForestCulling,
      },
    ));
  }

  checks.push(makeCheck(
    `${name}-species-specs-available`,
    profile.decisions.vietnamSpeciesSourceSpecs.available === true
      && profile.decisions.vietnamSpeciesSourceSpecs.deviceLossPolicy === 'noRuntimeGpuState',
    'Vietnam species source specs are non-runtime documentation/proof work and should not depend on GPU backend availability.',
    profile.decisions.vietnamSpeciesSourceSpecs,
  ));

  return checks;
}

function evaluateScenario(name: ScenarioName, profile: RendererFeatureProfile): ScenarioResult {
  return {
    name,
    profile,
    checks: [
      ...lanePolicyChecks(profile),
      ...capabilityChecks(name, profile),
    ],
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownFor(artifact: WorldSystemsProfileArtifact): string {
  const lines = [
    '# World Systems Profile Proof',
    '',
    `Created: ${artifact.createdAt}`,
    `Status: ${artifact.status}`,
    `Source git SHA: ${artifact.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Scenarios: ${artifact.summary.scenarioCount}`,
    `- Failing checks: ${artifact.summary.failingChecks}`,
    `- Runtime-water available count: ${artifact.summary.runtimeWaterAvailableCount}`,
    `- Diagnostic lane available count: ${artifact.summary.diagnosticLaneAvailableCount}`,
    '',
    '## Scenarios',
    '',
  ];

  for (const scenario of artifact.scenarios) {
    const failed = scenario.checks.filter((check) => check.status === 'fail');
    lines.push(
      `### ${scenario.name}`,
      '',
      `- Posture: ${scenario.profile.posture}`,
      `- Resolved backend: ${scenario.profile.resolvedBackend}`,
      `- WebGL compatibility: ${scenario.profile.webglCompatibilityMode}`,
      `- Runtime water: ${scenario.profile.decisions.runtimeWater.policy}, available=${scenario.profile.decisions.runtimeWater.available}`,
      `- Failing checks: ${failed.length}`,
      '',
    );
    if (failed.length > 0) {
      for (const check of failed) {
        lines.push(`  - ${check.id}: ${check.message}`);
      }
      lines.push('');
    }
  }

  lines.push('## Non-Claims', '');
  for (const nonClaim of artifact.nonClaims) {
    lines.push(`- ${nonClaim}`);
  }
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const scenarios = scenarioCapabilities().map(({ name, capabilities }) => (
    evaluateScenario(name, buildRendererFeatureProfile(capabilities))
  ));
  const allChecks = scenarios.flatMap((scenario) => scenario.checks);
  const failingChecks = allChecks.filter((check) => check.status === 'fail');
  const runtimeWaterAvailableCount = scenarios.filter((scenario) => (
    scenario.profile.decisions.runtimeWater.available
  )).length;
  const diagnosticLaneAvailableCount = scenarios.reduce((total, scenario) => (
    total + ALWAYS_DIAGNOSTIC_OR_DISABLED.filter((lane) => (
      scenario.profile.decisions[lane].available
    )).length
  ), 0);

  const jsonPath = join(outputDir, 'world-systems-profile-proof.json');
  const markdownPath = join(outputDir, 'world-systems-profile-proof.md');
  const artifact: WorldSystemsProfileArtifact = {
    createdAt: new Date().toISOString(),
    source: 'world-systems-profile-proof',
    sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
    sourceGitStatus: gitStatus(),
    status: failingChecks.length === 0 ? 'pass' : 'fail',
    scenarios,
    summary: {
      scenarioCount: scenarios.length,
      failingChecks: failingChecks.length,
      runtimeWaterAvailableCount,
      diagnosticLaneAvailableCount,
    },
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
    nonClaims: [
      'This proof does not run browser rendering, screenshots, or WebGPU device allocation.',
      'This proof does not replace quiet-machine perf attribution.',
      'This proof does not replace terrain, TOD, atmosphere, asset-gallery, owner-approval, deploy, or live-release gates.',
      'This proof does not approve runtime gameplay water; runtimeWater remains disabled in every profile.',
    ],
  };

  writeJson(jsonPath, artifact);
  writeFileSync(markdownPath, markdownFor(artifact), 'utf8');

  for (const scenario of scenarios) {
    const failed = scenario.checks.filter((check) => check.status === 'fail');
    const label = failed.length === 0 ? 'PASS' : 'FAIL';
    console.log(`[world-systems-profile] ${label} ${scenario.name}: ${scenario.checks.length - failed.length}/${scenario.checks.length} checks passed`);
  }
  console.log(`[world-systems-profile] artifact: ${rel(jsonPath)}`);

  if (failingChecks.length > 0) {
    console.error(`[world-systems-profile] FAIL ${failingChecks.length}/${allChecks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[world-systems-profile] PASS ${allChecks.length}/${allChecks.length} checks passed.`);
}

main();
