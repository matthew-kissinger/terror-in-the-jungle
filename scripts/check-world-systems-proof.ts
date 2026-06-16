// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * World-systems alignment guard for the 2026-06-13 Fable/WebGPU follow-up.
 *
 * This is a lightweight invariant check, not a runtime visual/perf proof. It
 * keeps the shipped R1 feature-profile predecessor separated from the broader
 * debug/prototype cycle and verifies that runtime gameplay water remains out
 * of scope until a future VODA cycle explicitly reopens it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type CheckStatus = 'pass' | 'fail';

interface NamedCheck {
  name: string;
  status: CheckStatus;
  details: string[];
}

const REPO_ROOT = process.cwd();

const DOCS = {
  predecessor: 'docs/tasks/cycle-2026-06-13-fable5-webgpu-world-systems.md',
  debugProofs: 'docs/tasks/cycle-2026-06-13-fable5-world-systems-debug-proofs.md',
  releaseDecision: 'docs/tasks/cycle-2026-06-13-world-systems-release-decision-run.md',
  goalStatements: 'docs/tasks/cycle-2026-06-13-world-systems-goal-statements.md',
  backlog: 'docs/BACKLOG.md',
} as const;

const RENDERER_PROFILE = 'src/core/RendererFeatureProfile.ts';

const FORBIDDEN_RUNTIME_WATER_PATHS = [
  'src/systems/environment/water',
  'src/systems/environment/WaterSystem.ts',
  'src/systems/environment/HydrologySystem.ts',
  'src/systems/water',
];

const REQUIRED_FEATURE_IDS = [
  'storageBufferWorldFields',
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

const REQUIRED_POLICIES = [
  'requiredWebGPU',
  'degradedFallback',
  'sharedNodeSafe',
  'diagnosticOnly',
  'disabled',
];

function abs(relPath: string): string {
  return join(REPO_ROOT, ...relPath.split('/'));
}

function readRequired(relPath: string): string {
  const fullPath = abs(relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return readFileSync(fullPath, 'utf8');
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

function missingTerms(text: string, terms: readonly string[]): string[] {
  const haystack = normalized(text);
  return terms.filter((term) => !haystack.includes(normalized(term)));
}

function hasAll(text: string, terms: readonly string[]): boolean {
  return missingTerms(text, terms).length === 0;
}

function makeCheck(name: string, passed: boolean, details: string[]): NamedCheck {
  return {
    name,
    status: passed ? 'pass' : 'fail',
    details,
  };
}

function formatDetails(details: readonly string[]): string {
  return details.length === 0 ? 'ok' : details.join('; ');
}

function checkPredecessor(predecessor: string): NamedCheck {
  const requiredTerms = [
    'Status: shipped predecessor',
    'Completed Result',
    'RendererFeatureProfile',
    'Follow-Up Split',
    DOCS.debugProofs,
    DOCS.releaseDecision,
    DOCS.goalStatements,
    'must not be used as an active release gate',
  ];
  const missing = missingTerms(predecessor, requiredTerms);
  return makeCheck(
    'predecessor split',
    missing.length === 0,
    missing.length === 0
      ? ['predecessor is framed as shipped R1 policy surface']
      : [`missing: ${missing.join(', ')}`],
  );
}

function checkDebugProofDoc(debugProofs: string): NamedCheck {
  const requiredTerms = [
    'heightfield',
    'erosion',
    'hydrology',
    'debug-only water-level',
    'sky/cloud/post',
    'generated-species',
    'forest LOD',
    'Nanite',
    'TIJ terrain',
    'runtime gameplay water is still out of scope',
    'no Fable generated species or assets',
    'quiet-machine',
    'VietnamSpeciesSourceSpecs',
    'npm run check:vietnam-species-source-specs',
    'TerrainHydrologyDebugProofSpec',
    'npm run check:terrain-hydrology-debug-proof',
    'VisualForestWorldSystemsProofSpec',
    'npm run check:visual-forest-world-systems-proof',
    'npm run check:world-systems-release-readiness',
    'npm run check:world-systems-proof',
  ];
  const missing = missingTerms(debugProofs, requiredTerms);
  return makeCheck(
    'debug/proof scope',
    missing.length === 0,
    missing.length === 0
      ? ['debug/proof brief keeps Fable topics TIJ-owned and default-off']
      : [`missing: ${missing.join(', ')}`],
  );
}

function checkReleaseDecisionDoc(releaseDecision: string): NamedCheck {
  const requiredTerms = [
    'ship/default-off/defer/no-go',
    'owner-selected latest releasable code',
    'no-go report',
    'Do not default-on',
    'runtime water',
    'forest/HLOD runtime swaps',
    'npm run check:live-release',
  ];
  const missing = missingTerms(releaseDecision, requiredTerms);
  return makeCheck(
    'release-decision handoff',
    missing.length === 0,
    missing.length === 0
      ? ['release handoff requires explicit lane decisions before deploy']
      : [`missing: ${missing.join(', ')}`],
  );
}

function checkGoalSurface(goalStatements: string): NamedCheck {
  const requiredTerms = [
    'task/fable5-world-systems-followup',
    'Shipped Predecessor',
    'Debug / Proof World-Systems Cycle',
    'Release-Decision Run',
    'npm run check:world-systems-proof',
    'npm run check:terrain-hydrology-debug-proof',
    'npm run check:visual-forest-world-systems-proof',
    'npm run check:world-systems-release-readiness',
  ];
  const missing = missingTerms(goalStatements, requiredTerms);
  return makeCheck(
    'owner goal surface',
    missing.length === 0,
    missing.length === 0
      ? ['goal statements expose current branch and verification command']
      : [`missing: ${missing.join(', ')}`],
  );
}

function checkBacklog(backlog: string): NamedCheck {
  const requiredTerms = [
    'cycle-2026-06-13-world-systems-release-decision-run',
    'cycle-2026-06-13-fable5-world-systems-debug-proofs',
    'static scope guards pass',
    'visual/forest authority scope',
    DOCS.goalStatements,
  ];
  const missing = missingTerms(backlog, requiredTerms);
  return makeCheck(
    'backlog links',
    missing.length === 0,
    missing.length === 0
      ? ['backlog points to release-decision and debug/proof follow-ups']
      : [`missing: ${missing.join(', ')}`],
  );
}

function checkRendererProfile(rendererProfile: string): NamedCheck {
  const missingIds = missingTerms(rendererProfile, REQUIRED_FEATURE_IDS);
  const missingPolicies = missingTerms(rendererProfile, REQUIRED_POLICIES);
  const requiredSentences = [
    'requiredLimits',
    'proofHooks',
    'deviceLossPolicy',
    'Runtime water is disabled by the 2026-06-13 Fable/WebGPU world-systems cycle decision.',
    'Debug-only water-level and basin/river proof buffers may be produced for future VODA design; they cannot become gameplay water.',
    'Species work is a Vietnam source-asset specification lane only; no Fable generated species or assets are runtime inputs.',
    'Hydrology can produce analysis buffers for future VODA design; it cannot drive runtime water this cycle.',
    'Runtime water is explicitly out of scope for this cycle.',
  ];
  const missingSentences = missingTerms(rendererProfile, requiredSentences);
  const failed = [
    ...missingIds.map((item) => `feature id: ${item}`),
    ...missingPolicies.map((item) => `policy: ${item}`),
    ...missingSentences.map((item) => `sentence: ${item}`),
  ];
  return makeCheck(
    'renderer feature profile',
    failed.length === 0,
    failed.length === 0
      ? ['world-system lanes are classified; runtime water is disabled']
      : [`missing ${failed.join(', ')}`],
  );
}

function checkRuntimeWaterPaths(): NamedCheck {
  const existing = FORBIDDEN_RUNTIME_WATER_PATHS.filter((relPath) => existsSync(abs(relPath)));
  return makeCheck(
    'runtime water stripped paths',
    existing.length === 0,
    existing.length === 0
      ? ['no obvious runtime water system paths exist']
      : [`unexpected runtime water paths: ${existing.join(', ')}`],
  );
}

function checkPackageScript(packageJson: string): NamedCheck {
  return makeCheck(
    'package script',
    hasAll(packageJson, [
      '"check:world-systems-profile"',
      'scripts/check-world-systems-profile.ts',
      '"check:world-systems-proof"',
      'scripts/check-world-systems-proof.ts',
      '"check:vietnam-species-source-specs"',
      'scripts/check-vietnam-species-source-specs.ts',
      '"check:terrain-hydrology-debug-proof"',
      'scripts/check-terrain-hydrology-debug-proof.ts',
      '"check:visual-forest-world-systems-proof"',
      'scripts/check-visual-forest-world-systems-proof.ts',
      '"check:world-systems-release-readiness"',
      'scripts/check-world-systems-release-readiness.ts',
    ]),
    ['package.json exposes world-systems, profile, Vietnam species, terrain/hydrology, visual/forest, and release-readiness checks'],
  );
}

function main(): void {
  const packageJson = readRequired('package.json');
  const predecessor = readRequired(DOCS.predecessor);
  const debugProofs = readRequired(DOCS.debugProofs);
  const releaseDecision = readRequired(DOCS.releaseDecision);
  const goalStatements = readRequired(DOCS.goalStatements);
  const backlog = readRequired(DOCS.backlog);
  const rendererProfile = readRequired(RENDERER_PROFILE);

  const checks = [
    checkPackageScript(packageJson),
    checkPredecessor(predecessor),
    checkDebugProofDoc(debugProofs),
    checkReleaseDecisionDoc(releaseDecision),
    checkGoalSurface(goalStatements),
    checkBacklog(backlog),
    checkRendererProfile(rendererProfile),
    checkRuntimeWaterPaths(),
  ];

  for (const check of checks) {
    const label = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[world-systems-proof] ${label} ${check.name}: ${formatDetails(check.details)}`);
  }

  const failed = checks.filter((check) => check.status === 'fail');
  if (failed.length > 0) {
    console.error(`[world-systems-proof] FAIL ${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[world-systems-proof] PASS ${checks.length}/${checks.length} checks passed.`);
}

main();
