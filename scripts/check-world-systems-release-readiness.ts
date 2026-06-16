#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Release-readiness artifact for the Fable/WebGPU world-systems follow-up.
 *
 * This checker is allowed to PASS while the release outcome is NO-GO. Its job
 * is to prove the current branch is safely default-off/deferred, and to make
 * the remaining owner, visual, quiet-machine, deploy, and live gates explicit
 * before anyone can treat static scope guards as release evidence.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS,
  type TerrainHydrologyDebugLaneSpec,
} from '../src/config/worldSystems/TerrainHydrologyDebugProofSpec';
import {
  VIETNAM_SPECIES_SOURCE_SPECS,
  type VietnamSpeciesSourceSpec,
} from '../src/config/worldSystems/VietnamSpeciesSourceSpecs';
import {
  VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS,
  type VisualForestWorldSystemsLaneSpec,
} from '../src/config/worldSystems/VisualForestWorldSystemsProofSpec';
import {
  buildRendererFeatureProfile,
  type RendererFeatureId,
} from '../src/core/RendererFeatureProfile';
import type { RendererBackendCapabilities } from '../src/core/RendererBackend';

type CheckStatus = 'pass' | 'fail';
type GateStatus = 'pass' | 'partial' | 'missing' | 'blocked';
type ReleaseOutcome = 'go' | 'no-go';
type LaneDecisionStatus = 'ship' | 'default-off' | 'deferred' | 'no-go';

interface NamedCheck {
  id: string;
  status: CheckStatus;
  message: string;
  evidence: unknown;
}

interface ReleaseGate {
  id: string;
  status: GateStatus;
  requiredForRelease: boolean;
  evidence: string;
}

interface LaneDecision {
  id: string;
  displayName: string;
  status: LaneDecisionStatus;
  currentEvidence: string[];
  releaseBlockers: string[];
  nextProof: string[];
  safeToRemainDefaultOff: boolean;
}

interface ReleaseReadinessArtifact {
  createdAt: string;
  source: 'world-systems-release-readiness';
  sourceGitSha: string;
  sourceGitStatus: string[];
  outcome: ReleaseOutcome;
  status: CheckStatus;
  summary: {
    laneCount: number;
    releaseGateCount: number;
    blockingReleaseGateCount: number;
    failingCheckCount: number;
    runtimeWaterAvailable: boolean;
    unsafeDefaultOnLaneCount: number;
    fableAssetAllowanceCount: number;
    staticProofArtifactCount: number;
    browserVisualArtifactCount: number;
    perfAttributionArtifactCount: number;
  };
  releaseGates: ReleaseGate[];
  laneDecisions: LaneDecision[];
  staticProofArtifacts: ProofArtifactReference[];
  browserVisualArtifacts: ProofArtifactReference[];
  perfAttributionArtifacts: ProofArtifactReference[];
  checks: NamedCheck[];
  files: {
    summary: string;
    markdown: string;
  };
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'world-systems-release-readiness';

interface ProofArtifactReference {
  id: string;
  required: boolean;
  status: 'present' | 'historical' | 'missing';
  path: string | null;
  sourceGitSha?: string | null;
  captureStatus?: string | null;
  validationOverall?: string | null;
  quietMachineAttested?: boolean | null;
  durationSeconds?: number | null;
  npcCount?: number | null;
  requiredDurationSeconds?: number | null;
  requiredNpcCount?: number | null;
}

const PROFILE_FEATURES: readonly RendererFeatureId[] = [
  'terrainHeightfieldErosion',
  'debugWaterLevelProof',
  'hydrologyAnalysis',
  'renderPipelinePost',
  'volumetricCloudPrototype',
  'vietnamSpeciesSourceSpecs',
  'gpuForestCulling',
  'aggregateForestLod',
  'naniteLiteClusterStudy',
  'octahedralImpostorBake',
  'runtimeWater',
];

const STRICT_WEBGPU_CAPABILITIES: RendererBackendCapabilities = {
  requestedMode: 'webgpu-strict',
  resolvedBackend: 'webgpu',
  initStatus: 'ready',
  isWebGPURenderer: true,
  forceWebGL: false,
  strictWebGPU: true,
  navigatorGpuAvailable: true,
  adapterAvailable: true,
  adapterName: 'release-readiness-synthetic-webgpu',
  adapterFeatures: [],
  adapterLimits: {
    maxStorageBufferBindingSize: 256 * 1024 * 1024,
    maxComputeInvocationsPerWorkgroup: 256,
  },
  error: null,
  notes: ['Synthetic strict WebGPU capability sample for policy inspection only.'],
};

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function abs(relPath: string): string {
  return join(process.cwd(), ...relPath.split('/'));
}

function readRequired(relPath: string): string {
  const fullPath = abs(relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return readFileSync(fullPath, 'utf8');
}

function readJsonObject(relPath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readRequired(relPath));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
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

function currentGitSha(): string {
  return gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown');
}

function sourceGitShaFor(relPath: string): string | null {
  const json = readJsonObject(relPath);
  const value = json?.sourceGitSha;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nestedString(value: unknown, keys: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.length > 0 ? current : null;
}

function nestedBoolean(value: unknown, keys: readonly string[]): boolean | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'boolean' ? current : null;
}

function nestedNumber(value: unknown, keys: readonly string[]): number | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  const parsed = Number(current);
  return Number.isFinite(parsed) ? parsed : null;
}

function listArtifactDirectories(): string[] {
  if (!existsSync(ARTIFACT_ROOT)) return [];
  return readdirSync(ARTIFACT_ROOT)
    .map((entry) => join(ARTIFACT_ROOT, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .sort((a, b) => b.localeCompare(a));
}

function collectFiles(rootPath: string, fileName: string): string[] {
  if (!existsSync(rootPath)) return [];
  const output: string[] = [];
  for (const entry of readdirSync(rootPath)) {
    const entryPath = join(rootPath, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      output.push(...collectFiles(entryPath, fileName));
    } else if (entry === fileName) {
      output.push(entryPath);
    }
  }
  return output;
}

function latestFileUnder(relRoot: string, fileName: string): string | null {
  const rootPath = abs(relRoot);
  const files = collectFiles(rootPath, fileName)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ? rel(files[0]) : null;
}

function latestArtifactPath(outputName: string, fileName: string): string | null {
  for (const timestampDir of listArtifactDirectories()) {
    const candidate = join(timestampDir, outputName, fileName);
    if (existsSync(candidate)) return rel(candidate);
  }
  return null;
}

function latestPerfCapturePathForMode(mode: string): string | null {
  for (const timestampDir of listArtifactDirectories()) {
    const candidate = join(timestampDir, 'summary.json');
    if (!existsSync(candidate)) continue;
    const parsed = readJsonObject(rel(candidate));
    const summaryMode = nestedString(parsed, ['scenario', 'mode'])
      ?? nestedString(parsed, ['scenario', 'requestedMode']);
    if (summaryMode === mode) {
      return rel(candidate);
    }
  }
  return null;
}

function buildStaticProofArtifacts(): ProofArtifactReference[] {
  const specs = [
    ['world-systems-profile', 'world-systems-profile-proof', 'world-systems-profile-proof.json'],
    ['terrain-hydrology-debug-proof', 'terrain-hydrology-debug-proof', 'terrain-hydrology-debug-proof.json'],
    ['vietnam-species-source-specs', 'vietnam-species-source-specs', 'vietnam-species-source-specs.json'],
    ['visual-forest-world-systems-proof', 'visual-forest-world-systems-proof', 'visual-forest-world-systems-proof.json'],
    ['vegetation-horizon-audit', 'vegetation-horizon-audit', 'horizon-audit.json'],
    ['vegetation-grounding-audit', 'vegetation-grounding-audit', 'summary.json'],
    ['world-systems-release-readiness', OUTPUT_NAME, 'world-systems-release-readiness.json'],
  ] as const;

  return specs.map(([id, outputName, fileName]) => {
    const path = latestArtifactPath(outputName, fileName);
    return {
      id,
      required: true,
      status: path ? 'present' : 'missing',
      path,
    };
  });
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

function checkRendererProfilePolicy(): NamedCheck {
  const profile = buildRendererFeatureProfile(STRICT_WEBGPU_CAPABILITIES);
  const unsafeFeatures = PROFILE_FEATURES
    .filter((id) => profile.decisions[id].policy !== 'disabled')
    .filter((id) => profile.decisions[id].policy !== 'diagnosticOnly');
  const missingProofHooks = PROFILE_FEATURES
    .map((id) => ({
      id,
      proofHooks: profile.decisions[id].proofHooks,
    }))
    .filter((entry) => entry.proofHooks.length === 0);
  const runtimeWater = profile.decisions.runtimeWater;
  const passed = unsafeFeatures.length === 0
    && missingProofHooks.length === 0
    && runtimeWater.available === false
    && runtimeWater.policy === 'disabled';

  return makeCheck(
    'renderer-profile-release-policy',
    passed,
    'World-system profile features must be disabled or diagnostic-only; runtime water must stay disabled.',
    {
      unsafeFeatures,
      missingProofHooks,
      runtimeWater,
    },
  );
}

function checkTerrainHydrologySafety(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => (
      spec.runtimeDefault
      || spec.authoritativeTerrainMutation
      || spec.runtimeWaterDependency !== 'none'
      || spec.fableAssetsAllowed
    ))
    .map((spec) => spec.id);

  return makeCheck(
    'terrain-hydrology-release-safety',
    offenders.length === 0,
    'Terrain/hydrology lanes must remain default-off, non-authoritative, Fable-free, and runtime-water-free.',
    { offenders },
  );
}

function checkVisualForestSafety(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => (
      spec.runtimeDefault
      || spec.lightingAuthorityMutation
      || spec.runtimeVegetationMutation !== 'none'
      || spec.runtimeWaterDependency !== 'none'
      || spec.fableAssetsAllowed
      || spec.fableRuntimePortAllowed
      || spec.trueMeshletNanite
    ))
    .map((spec) => spec.id);

  return makeCheck(
    'visual-forest-release-safety',
    offenders.length === 0,
    'Sky/cloud/post and forest/Nanite-lite lanes must remain default-off and authority-preserving.',
    { offenders },
  );
}

function checkVietnamSpeciesSafety(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => (
      spec.sourceAsset.fableAssetsAllowed
      || spec.sourceAsset.generatedFableSpeciesAllowed
      || spec.representationPlan.trueMeshletNanite
      || spec.runtimeWaterDependency !== 'none'
    ))
    .map((spec) => spec.id);

  return makeCheck(
    'vietnam-species-source-safety',
    offenders.length === 0,
    'Species lanes must use TIJ source specs, never Fable assets, generated Fable species, true Nanite, or runtime water.',
    { offenders },
  );
}

function checkHandoffDocs(): NamedCheck {
  const releaseDecision = readRequired('docs/tasks/cycle-2026-06-13-world-systems-release-decision-run.md');
  const goalStatements = readRequired('docs/tasks/cycle-2026-06-13-world-systems-goal-statements.md');
  const requiredTerms = [
    'ship/default-off/defer/no-go',
    'owner-selected latest releasable code',
    'quiet-machine',
    'visual evidence',
    'no-go report',
    'Debug / Proof World-Systems Cycle',
    'Release-Decision Run',
  ];
  const haystack = `${releaseDecision}\n${goalStatements}`;
  const missing = requiredTerms.filter((term) => !haystack.includes(term));

  return makeCheck(
    'release-handoff-docs',
    missing.length === 0,
    'Release handoff docs must carry the full owner objective and no-go path.',
    { missing },
  );
}

function checkPackageScripts(): NamedCheck {
  const packageJson = readRequired('package.json');
  const requiredTerms = [
    '"check:world-systems-profile"',
    '"check:terrain-hydrology-debug-proof"',
    '"check:vietnam-species-source-specs"',
    '"check:visual-forest-world-systems-proof"',
    '"check:world-systems-proof"',
    '"check:world-systems-release-readiness"',
  ];
  const missing = requiredTerms.filter((term) => !packageJson.includes(term));

  return makeCheck(
    'package-release-readiness-script',
    missing.length === 0,
    'Package scripts must expose all world-systems proof and release-readiness checks.',
    { missing },
  );
}

function buildBrowserVisualArtifacts(): ProofArtifactReference[] {
  const currentSha = currentGitSha();
  const specs = [
    ['terrain-baseline-browser-screenshots', latestArtifactPath('projekt-143-terrain-horizon-baseline', 'summary.json')],
    ['tod-coherence-sweep', latestFileUnder('artifacts/lighting-rig/tod-sweep', 'verdict.json')],
    ['atmosphere-evidence-matrix', latestFileUnder('artifacts/architecture-recovery/cycle9-atmosphere', 'summary.json')],
    ['asset-gallery-screenshots', latestFileUnder('artifacts/asset-gallery', 'summary.json')],
  ] as const;

  return specs.map(([id, path]) => {
    const sourceGitSha = path ? sourceGitShaFor(path) : null;
    return {
      id,
      required: true,
      status: path
        ? sourceGitSha === currentSha ? 'present' : 'historical'
        : 'missing',
      path,
      sourceGitSha,
    };
  });
}

function buildPerfAttributionArtifacts(): ProofArtifactReference[] {
  const currentSha = currentGitSha();
  const specs = [
    ['open-frontier-perf-capture', 'open_frontier', 180, 120],
    ['a-shau-perf-capture', 'a_shau_valley', 180, 60],
  ] as const;

  return specs.map(([id, mode, requiredDurationSeconds, requiredNpcCount]) => {
    const path = latestPerfCapturePathForMode(mode);
    const json = path ? readJsonObject(path) : null;
    const sourceGitSha = path ? sourceGitShaFor(path) : null;
    const captureStatus = json ? nestedString(json, ['status']) : null;
    const validationOverall = json ? nestedString(json, ['validation', 'overall']) : null;
    const quietMachineAttested = json
      ? nestedBoolean(json, ['captureEnvironment', 'quietMachineAttested'])
      : null;
    const durationSeconds = json ? nestedNumber(json, ['durationSeconds']) : null;
    const npcCount = json ? nestedNumber(json, ['npcs']) : null;

    return {
      id,
      required: true,
      status: path
        ? sourceGitSha === currentSha ? 'present' : 'historical'
        : 'missing',
      path,
      sourceGitSha,
      captureStatus,
      validationOverall,
      quietMachineAttested,
      durationSeconds,
      npcCount,
      requiredDurationSeconds,
      requiredNpcCount,
    };
  });
}

function hasReleaseSizedPerfShape(artifact: ProofArtifactReference): boolean {
  return typeof artifact.durationSeconds === 'number'
    && typeof artifact.npcCount === 'number'
    && typeof artifact.requiredDurationSeconds === 'number'
    && typeof artifact.requiredNpcCount === 'number'
    && artifact.durationSeconds >= artifact.requiredDurationSeconds
    && artifact.npcCount >= artifact.requiredNpcCount;
}

function buildReleaseGates(
  staticProofArtifacts: readonly ProofArtifactReference[],
  browserVisualArtifacts: readonly ProofArtifactReference[],
  perfAttributionArtifacts: readonly ProofArtifactReference[],
): ReleaseGate[] {
  const missingStaticArtifacts = staticProofArtifacts.filter((artifact) => artifact.status !== 'present');
  const staticEvidence = missingStaticArtifacts.length === 0
    ? `Static scope artifacts present: ${staticProofArtifacts.map((artifact) => `${artifact.id}=${artifact.path}`).join(', ')}.`
    : `Missing static proof artifacts: ${missingStaticArtifacts.map((artifact) => artifact.id).join(', ')}.`;
  const presentBrowserVisualArtifacts = browserVisualArtifacts.filter((artifact) => artifact.status === 'present');
  const historicalBrowserVisualArtifacts = browserVisualArtifacts.filter((artifact) => artifact.status === 'historical');
  const missingBrowserVisualArtifacts = browserVisualArtifacts.filter((artifact) => artifact.status === 'missing');
  const nonCurrentBrowserVisualArtifacts = browserVisualArtifacts.filter((artifact) => artifact.status !== 'present');
  const browserVisualStatus: GateStatus = missingBrowserVisualArtifacts.length === 0
    && historicalBrowserVisualArtifacts.length === 0
    ? 'pass'
    : presentBrowserVisualArtifacts.length > 0
      ? 'partial'
      : 'missing';
  const browserVisualEvidence = presentBrowserVisualArtifacts.length === 0
    ? `No current-branch browser visual artifacts found. Historical: ${historicalBrowserVisualArtifacts.map((artifact) => `${artifact.id}=${artifact.path}`).join(', ') || 'none'}. Missing: ${missingBrowserVisualArtifacts.map((artifact) => artifact.id).join(', ') || 'none'}.`
    : `Current-branch browser visual artifacts present: ${presentBrowserVisualArtifacts.map((artifact) => `${artifact.id}=${artifact.path}`).join(', ')}. Non-current or missing: ${nonCurrentBrowserVisualArtifacts.map((artifact) => `${artifact.id}=${artifact.status}`).join(', ') || 'none'}.`;
  const presentPerfArtifacts = perfAttributionArtifacts.filter((artifact) => artifact.status === 'present');
  const historicalPerfArtifacts = perfAttributionArtifacts.filter((artifact) => artifact.status === 'historical');
  const missingPerfArtifacts = perfAttributionArtifacts.filter((artifact) => artifact.status === 'missing');
  const failingPerfArtifacts = presentPerfArtifacts.filter((artifact) => (
    artifact.captureStatus !== 'ok'
    || artifact.validationOverall === 'fail'
  ));
  const untrustedPerfArtifacts = presentPerfArtifacts.filter((artifact) => artifact.quietMachineAttested !== true);
  const underSizedPerfArtifacts = presentPerfArtifacts.filter((artifact) => !hasReleaseSizedPerfShape(artifact));
  const nonCurrentPerfArtifacts = perfAttributionArtifacts.filter((artifact) => artifact.status !== 'present');
  const perfStatus: GateStatus = missingPerfArtifacts.length === 0
    && historicalPerfArtifacts.length === 0
    && failingPerfArtifacts.length === 0
    && untrustedPerfArtifacts.length === 0
    && underSizedPerfArtifacts.length === 0
    ? 'pass'
    : presentPerfArtifacts.length > 0
      ? 'partial'
      : 'missing';
  const perfEvidence = presentPerfArtifacts.length === 0
    ? `No current-branch Open Frontier/A Shau perf captures found. Historical: ${historicalPerfArtifacts.map((artifact) => `${artifact.id}=${artifact.path}`).join(', ') || 'none'}. Missing: ${missingPerfArtifacts.map((artifact) => artifact.id).join(', ') || 'none'}.`
    : `Current-branch perf captures present: ${presentPerfArtifacts.map((artifact) => `${artifact.id}=${artifact.path} status=${artifact.captureStatus ?? 'unknown'} validation=${artifact.validationOverall ?? 'unknown'} quiet=${artifact.quietMachineAttested === true} duration=${artifact.durationSeconds ?? 'unknown'}/${artifact.requiredDurationSeconds ?? 'unknown'} npcs=${artifact.npcCount ?? 'unknown'}/${artifact.requiredNpcCount ?? 'unknown'}`).join(', ')}. Failed, undersized, untrusted, or non-current: ${[
      ...failingPerfArtifacts.map((artifact) => `${artifact.id}=validation-${artifact.validationOverall ?? artifact.captureStatus ?? 'unknown'}`),
      ...underSizedPerfArtifacts.map((artifact) => `${artifact.id}=duration-or-npcs-insufficient`),
      ...untrustedPerfArtifacts.map((artifact) => `${artifact.id}=quiet-not-attested`),
      ...nonCurrentPerfArtifacts.map((artifact) => `${artifact.id}=${artifact.status}`),
    ].join(', ') || 'none'}.`;

  return [
    {
      id: 'owner-selected-release-candidate',
      status: 'missing',
      requiredForRelease: true,
      evidence: 'No owner-selected release candidate or owner lane decision is recorded on this branch.',
    },
    {
      id: 'static-scope-guards',
      status: missingStaticArtifacts.length === 0 ? 'pass' : 'missing',
      requiredForRelease: true,
      evidence: staticEvidence,
    },
    {
      id: 'quiet-machine-perf-attribution',
      status: perfStatus,
      requiredForRelease: true,
      evidence: perfEvidence,
    },
    {
      id: 'browser-visual-evidence',
      status: browserVisualStatus,
      requiredForRelease: true,
      evidence: browserVisualEvidence,
    },
    {
      id: 'runtime-water-approval',
      status: 'blocked',
      requiredForRelease: true,
      evidence: 'Runtime water is deliberately disabled; debug water proof still requires explicit owner approval.',
    },
    {
      id: 'release-validation',
      status: 'missing',
      requiredForRelease: true,
      evidence: '`npm run validate` has not been run for this release candidate in this checker artifact.',
    },
    {
      id: 'deploy-live-release',
      status: 'missing',
      requiredForRelease: true,
      evidence: '`deploy:prod` and `check:live-release` have not passed for this branch.',
    },
  ];
}

function findProofPath(
  artifacts: readonly ProofArtifactReference[],
  id: string,
): string | null {
  const artifact = artifacts.find((candidate) => candidate.id === id);
  return artifact?.status === 'present' ? artifact.path : null;
}

function buildLaneDecisions(
  staticProofArtifacts: readonly ProofArtifactReference[],
  browserVisualArtifacts: readonly ProofArtifactReference[],
  perfAttributionArtifacts: readonly ProofArtifactReference[],
): LaneDecision[] {
  const terrainBaselinePath = findProofPath(browserVisualArtifacts, 'terrain-baseline-browser-screenshots');
  const todCoherencePath = findProofPath(browserVisualArtifacts, 'tod-coherence-sweep');
  const atmosphereMatrixPath = findProofPath(browserVisualArtifacts, 'atmosphere-evidence-matrix');
  const assetGalleryPath = findProofPath(browserVisualArtifacts, 'asset-gallery-screenshots');
  const horizonAuditPath = findProofPath(staticProofArtifacts, 'vegetation-horizon-audit');
  const groundingAuditPath = findProofPath(staticProofArtifacts, 'vegetation-grounding-audit');
  const openFrontierPerfPath = findProofPath(perfAttributionArtifacts, 'open-frontier-perf-capture');
  const aShauPerfPath = findProofPath(perfAttributionArtifacts, 'a-shau-perf-capture');
  const hasTrustedPerfPair = perfAttributionArtifacts.every((artifact) => (
    artifact.status === 'present'
    && artifact.captureStatus === 'ok'
    && artifact.validationOverall !== 'fail'
    && artifact.quietMachineAttested === true
    && hasReleaseSizedPerfShape(artifact)
  ));

  return [
    {
      id: 'terrain-erosion',
      displayName: 'Terrain heightfield / erosion',
      status: 'default-off',
      currentEvidence: [
        'RendererFeatureProfile classifies terrainHeightfieldErosion as diagnostic-only/disabled by capability.',
        'TerrainHydrologyDebugProofSpec forbids terrain authority swaps and DEM/navmesh mutation.',
        ...(terrainBaselinePath ? [`Current terrain baseline browser proof: ${terrainBaselinePath}.`] : []),
        ...(openFrontierPerfPath ? [`Current Open Frontier perf capture: ${openFrontierPerfPath}.`] : []),
        ...(aShauPerfPath ? [`Current A Shau perf capture: ${aShauPerfPath}.`] : []),
      ],
      releaseBlockers: [
        ...(terrainBaselinePath ? [] : ['No current A Shau/Open Frontier terrain baseline artifact for a runtime candidate.']),
        ...(hasTrustedPerfPair ? [] : ['No quiet-machine terrain/startup attribution for a default-on change.']),
      ],
      nextProof: [
        'npm run check:terrain-baseline',
        'npm run perf:capture:openfrontier:short',
        'npm run perf:capture:ashau:short',
      ],
      safeToRemainDefaultOff: true,
    },
    {
      id: 'water-hydrology',
      displayName: 'Hydrology / debug water-level proof',
      status: 'default-off',
      currentEvidence: [
        'RendererFeatureProfile keeps runtimeWater disabled.',
        'TerrainHydrologyDebugProofSpec permits only debug-only water-level proof outputs.',
      ],
      releaseBlockers: [
        'Debug water proof requires explicit owner approval.',
        'Runtime gameplay water, swimming, buoyancy, and watercraft remain out of scope.',
      ],
      nextProof: [
        'Owner approval for debug-only water proof scope.',
        'npm run check:terrain-hydrology-debug-proof',
      ],
      safeToRemainDefaultOff: true,
    },
    {
      id: 'sky-cloud-post',
      displayName: 'Sky / cloud / post',
      status: 'default-off',
      currentEvidence: [
        'VisualForestWorldSystemsProofSpec protects atmosphere, lighting, sun body, and post-shim authority.',
        'RendererFeatureProfile keeps post/cloud lanes diagnostic-only/disabled by capability.',
        ...(todCoherencePath ? [`Current TOD coherence gate proof: ${todCoherencePath}.`] : []),
        ...(atmosphereMatrixPath ? [`Current atmosphere evidence matrix: ${atmosphereMatrixPath}.`] : []),
        ...(openFrontierPerfPath ? [`Current Open Frontier perf capture: ${openFrontierPerfPath}.`] : []),
        ...(aShauPerfPath ? [`Current A Shau perf capture: ${aShauPerfPath}.`] : []),
      ],
      releaseBlockers: [
        ...(todCoherencePath ? [] : ['No current TOD coherence gate for this branch.']),
        ...(atmosphereMatrixPath ? [] : ['No current atmosphere evidence matrix for this branch.']),
        ...(hasTrustedPerfPair ? [] : ['No quiet-machine attribution for cloud/post work.']),
      ],
      nextProof: [
        'npm run check:tod-coherence',
        'npm run evidence:atmosphere',
        'npm run check:visual-forest-world-systems-proof',
      ],
      safeToRemainDefaultOff: true,
    },
    {
      id: 'species-source-assets',
      displayName: 'Generated species / Vietnam source specs',
      status: 'deferred',
      currentEvidence: [
        'VietnamSpeciesSourceSpecs keeps future species source-spec-only unless already approved.',
        'Fable assets and generated Fable species are forbidden.',
        ...(assetGalleryPath ? [`Current asset-gallery proof: ${assetGalleryPath}.`] : []),
      ],
      releaseBlockers: [
        ...(assetGalleryPath ? [] : ['No current asset-gallery proof for this branch.']),
        'Future species need accepted source assets before runtime promotion.',
      ],
      nextProof: [
        'npm run check:vietnam-species-source-specs',
        'npm run check:asset-gallery',
      ],
      safeToRemainDefaultOff: true,
    },
    {
      id: 'forest-lod-nanite-lite',
      displayName: 'Forest LOD / HLOD / Nanite-lite',
      status: 'default-off',
      currentEvidence: [
        'VisualForestWorldSystemsProofSpec forbids runtime Fable Forests ports, default-on HLOD swaps, and true meshlet Nanite.',
        'RendererFeatureProfile keeps forest/Nanite-lite lanes diagnostic-only/disabled by capability.',
        ...(horizonAuditPath ? [`Current vegetation horizon audit: ${horizonAuditPath}.`] : []),
        ...(groundingAuditPath ? [`Current vegetation grounding audit: ${groundingAuditPath}.`] : []),
        ...(terrainBaselinePath ? [`Current Open Frontier/A Shau terrain baseline browser proof: ${terrainBaselinePath}.`] : []),
      ],
      releaseBlockers: [
        'No trusted before/after perf proof for a runtime forest culling or LOD change.',
        'No accepted source asset/gallery evidence for new aggregate tree families.',
      ],
      nextProof: [
        'npm run check:vegetation-horizon',
        'npm run check:vegetation-grounding',
        'npm run check:terrain-baseline',
        'npm run check:asset-gallery',
      ],
      safeToRemainDefaultOff: true,
    },
  ];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownFor(artifact: ReleaseReadinessArtifact): string {
  const lines = [
    '# World Systems Release Readiness',
    '',
    `Created: ${artifact.createdAt}`,
    `Outcome: ${artifact.outcome}`,
    `Status: ${artifact.status}`,
    `Source git SHA: ${artifact.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Lanes: ${artifact.summary.laneCount}`,
    `- Release gates: ${artifact.summary.releaseGateCount}`,
    `- Blocking release gates: ${artifact.summary.blockingReleaseGateCount}`,
    `- Runtime water available: ${artifact.summary.runtimeWaterAvailable}`,
    `- Unsafe default-on lanes: ${artifact.summary.unsafeDefaultOnLaneCount}`,
    `- Fable asset allowances: ${artifact.summary.fableAssetAllowanceCount}`,
    `- Static proof artifacts: ${artifact.summary.staticProofArtifactCount}`,
    `- Browser visual artifacts: ${artifact.summary.browserVisualArtifactCount}`,
    `- Perf attribution artifacts: ${artifact.summary.perfAttributionArtifactCount}`,
    `- Failing checks: ${artifact.summary.failingCheckCount}`,
    '',
    '## Static Proof Artifacts',
    '',
  ];

  for (const proof of artifact.staticProofArtifacts) {
    lines.push(`- ${proof.id}: ${proof.status} - ${proof.path ?? 'missing'}`);
  }

  lines.push('', '## Browser Visual Artifacts', '');
  for (const proof of artifact.browserVisualArtifacts) {
    lines.push(`- ${proof.id}: ${proof.status} - ${proof.path ?? 'missing'}`);
  }

  lines.push('', '## Perf Attribution Artifacts', '');
  for (const proof of artifact.perfAttributionArtifacts) {
    lines.push(`- ${proof.id}: ${proof.status} - ${proof.path ?? 'missing'} status=${proof.captureStatus ?? 'unknown'} validation=${proof.validationOverall ?? 'unknown'} quiet=${proof.quietMachineAttested === true} duration=${proof.durationSeconds ?? 'unknown'}/${proof.requiredDurationSeconds ?? 'unknown'} npcs=${proof.npcCount ?? 'unknown'}/${proof.requiredNpcCount ?? 'unknown'}`);
  }

  lines.push(
    '',
    '## Release Gates',
    '',
  );

  for (const gate of artifact.releaseGates) {
    lines.push(`- ${gate.id}: ${gate.status} - ${gate.evidence}`);
  }

  lines.push('', '## Lane Decisions', '');
  for (const lane of artifact.laneDecisions) {
    lines.push(`- ${lane.id}: ${lane.status}; safeDefaultOff=${lane.safeToRemainDefaultOff}`);
    for (const blocker of lane.releaseBlockers) {
      lines.push(`  - blocker: ${blocker}`);
    }
  }

  lines.push('', '## Non-Claims', '');
  for (const nonClaim of artifact.nonClaims) {
    lines.push(`- ${nonClaim}`);
  }
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const terrainSpecs = TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS;
  const visualForestSpecs = VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS;
  const speciesSpecs = VIETNAM_SPECIES_SOURCE_SPECS;
  const profile = buildRendererFeatureProfile(STRICT_WEBGPU_CAPABILITIES);
  const staticProofArtifacts = buildStaticProofArtifacts();
  const browserVisualArtifacts = buildBrowserVisualArtifacts();
  const perfAttributionArtifacts = buildPerfAttributionArtifacts();
  const releaseGates = buildReleaseGates(
    staticProofArtifacts,
    browserVisualArtifacts,
    perfAttributionArtifacts,
  );
  const laneDecisions = buildLaneDecisions(
    staticProofArtifacts,
    browserVisualArtifacts,
    perfAttributionArtifacts,
  );

  const checks = [
    checkPackageScripts(),
    checkRendererProfilePolicy(),
    checkTerrainHydrologySafety(terrainSpecs),
    checkVisualForestSafety(visualForestSpecs),
    checkVietnamSpeciesSafety(speciesSpecs),
    checkHandoffDocs(),
  ];
  const failed = checks.filter((check) => check.status === 'fail');
  const blockingReleaseGates = releaseGates
    .filter((gate) => gate.requiredForRelease && gate.status !== 'pass');
  const unsafeDefaultOnLaneCount = [
    ...terrainSpecs.filter((spec) => spec.runtimeDefault),
    ...visualForestSpecs.filter((spec) => spec.runtimeDefault),
  ].length;
  const fableAssetAllowanceCount = [
    ...terrainSpecs.filter((spec) => spec.fableAssetsAllowed),
    ...visualForestSpecs.filter((spec) => spec.fableAssetsAllowed || spec.fableRuntimePortAllowed),
    ...speciesSpecs.filter((spec) => (
      spec.sourceAsset.fableAssetsAllowed
      || spec.sourceAsset.generatedFableSpeciesAllowed
    )),
  ].length;
  const outcome: ReleaseOutcome = failed.length === 0 && blockingReleaseGates.length === 0
    ? 'go'
    : 'no-go';

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const jsonPath = join(outputDir, 'world-systems-release-readiness.json');
  const markdownPath = join(outputDir, 'world-systems-release-readiness.md');
  const artifact: ReleaseReadinessArtifact = {
    createdAt: new Date().toISOString(),
    source: 'world-systems-release-readiness',
    sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
    sourceGitStatus: gitStatus(),
    outcome,
    status: failed.length === 0 ? 'pass' : 'fail',
    summary: {
      laneCount: laneDecisions.length,
      releaseGateCount: releaseGates.length,
      blockingReleaseGateCount: blockingReleaseGates.length,
      failingCheckCount: failed.length,
      runtimeWaterAvailable: profile.decisions.runtimeWater.available,
      unsafeDefaultOnLaneCount,
      fableAssetAllowanceCount,
      staticProofArtifactCount: staticProofArtifacts.filter((artifact) => artifact.status === 'present').length,
      browserVisualArtifactCount: browserVisualArtifacts.filter((artifact) => artifact.status === 'present').length,
      perfAttributionArtifactCount: perfAttributionArtifacts.filter((artifact) => artifact.status === 'present').length,
    },
    releaseGates,
    laneDecisions,
    staticProofArtifacts,
    browserVisualArtifacts,
    perfAttributionArtifacts,
    checks,
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
    nonClaims: [
      'This artifact does not prove browser visuals, WebGPU device allocation, quiet-machine perf, deploy, or live release.',
      'This artifact does not approve runtime gameplay water or a default-on debug water proof.',
      'This artifact does not approve default-on sky/cloud/post replacement, runtime forest/HLOD swaps, or true Nanite.',
      'A PASS status means the current branch is safely scoped; the release outcome remains NO-GO until all release gates pass.',
    ],
  };

  writeJson(jsonPath, artifact);
  writeFileSync(markdownPath, markdownFor(artifact), 'utf8');

  for (const check of checks) {
    const label = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[world-systems-release] ${label} ${check.id}: ${check.message}`);
  }
  console.log(`[world-systems-release] outcome: ${artifact.outcome}`);
  console.log(`[world-systems-release] artifact: ${rel(jsonPath)}`);

  if (failed.length > 0) {
    console.error(`[world-systems-release] FAIL ${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[world-systems-release] PASS ${checks.length}/${checks.length} checks passed.`);
}

main();
