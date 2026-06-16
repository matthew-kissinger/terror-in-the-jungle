#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Artifact-producing guard for sky/cloud/post and forest/Nanite-lite scope.
 *
 * This is not a browser screenshot, visual acceptance, or perf proof. It
 * verifies that Fable-inspired visual and forest ideas are default-off,
 * TIJ-owned diagnostic/source-spec lanes that protect current atmosphere,
 * lighting, post, vegetation, source-asset, and evidence authorities.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  VISUAL_FOREST_PROTECTED_AUTHORITIES,
  VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS,
  type VisualForestForbiddenOutput,
  type VisualForestProofHook,
  type VisualForestWorldSystemsLaneSpec,
} from '../src/config/worldSystems/VisualForestWorldSystemsProofSpec';

type CheckStatus = 'pass' | 'fail';

interface NamedCheck {
  id: string;
  status: CheckStatus;
  message: string;
  evidence: unknown;
}

interface VisualForestWorldSystemsProofArtifact {
  createdAt: string;
  source: 'visual-forest-world-systems-proof';
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  summary: {
    laneCount: number;
    skyCloudPostLaneCount: number;
    forestNaniteLaneCount: number;
    protectedAuthorityCount: number;
    failingChecks: number;
    runtimeDefaultEnabledCount: number;
    fableRuntimePortAllowedCount: number;
    trueMeshletNaniteCount: number;
  };
  checks: NamedCheck[];
  lanes: readonly VisualForestWorldSystemsLaneSpec[];
  protectedAuthorities: typeof VISUAL_FOREST_PROTECTED_AUTHORITIES;
  files: {
    summary: string;
    markdown: string;
  };
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'visual-forest-world-systems-proof';

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

const REQUIRED_SKY_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  'secondLightingAuthority',
  'defaultOnCloudOrPostReplacement',
  'fallbackBehaviorUnspecified',
  'retiredPostProcessPathRevival',
  'fableSkyCloudPostPort',
  'runtimeWaterDependency',
];

const REQUIRED_FOREST_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  'fableForestRuntimePort',
  'fableGeneratedSpecies',
  'unacceptedSourceAsset',
  'hiddenRoutesBasesOrNpcs',
  'defaultOnForestHlodSwap',
  'trueMeshletNanite',
  'runtimeWaterDependency',
];

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

function checkUniqueLaneIds(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck {
  const ids = specs.map((spec) => spec.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return makeCheck(
    'unique-visual-forest-lane-ids',
    duplicates.length === 0,
    'Visual/forest world-system lanes must have stable unique IDs.',
    { ids, duplicates },
  );
}

function checkDefaultOffNoRuntimePorts(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck {
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
    .map((spec) => ({
      id: spec.id,
      runtimeDefault: spec.runtimeDefault,
      lightingAuthorityMutation: spec.lightingAuthorityMutation,
      runtimeVegetationMutation: spec.runtimeVegetationMutation,
      runtimeWaterDependency: spec.runtimeWaterDependency,
      fableAssetsAllowed: spec.fableAssetsAllowed,
      fableRuntimePortAllowed: spec.fableRuntimePortAllowed,
      trueMeshletNanite: spec.trueMeshletNanite,
    }));

  return makeCheck(
    'default-off-no-runtime-ports',
    offenders.length === 0,
    'All lanes must remain default-off, authority-preserving, Fable-free, water-independent, and true-Nanite-free.',
    { offenders },
  );
}

function checkProofHooks(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck {
  const missing = specs
    .map((spec) => {
      const required = spec.group === 'sky-cloud-post'
        ? REQUIRED_SKY_HOOKS
        : spec.id === 'octahedralImpostorBakeSpec'
          ? REQUIRED_FOREST_HOOKS.filter((hook) => hook !== 'quietMachinePerfAttribution')
          : REQUIRED_FOREST_HOOKS;
      return {
        id: spec.id,
        missing: required.filter((hook) => !spec.proofHooks.includes(hook)),
      };
    })
    .filter((entry) => entry.missing.length > 0);

  return makeCheck(
    'required-proof-hooks',
    missing.length === 0,
    'Sky lanes must carry TOD/atmosphere/perf hooks; forest lanes must carry asset/gallery/terrain/visual/perf hooks.',
    { missing },
  );
}

function checkForbiddenOutputs(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck {
  const missing = specs
    .map((spec) => {
      const required = spec.group === 'sky-cloud-post'
        ? REQUIRED_SKY_FORBIDDEN_OUTPUTS
        : REQUIRED_FOREST_FORBIDDEN_OUTPUTS;
      return {
        id: spec.id,
        missing: required.filter((item) => !spec.forbiddenOutputs.includes(item)),
      };
    })
    .filter((entry) => entry.missing.length > 0);

  return makeCheck(
    'forbidden-runtime-outputs',
    missing.length === 0,
    'Lanes must explicitly forbid second lighting authority, default-on replacements, Fable ports, unaccepted assets, hidden gameplay readability regressions, and true Nanite.',
    { missing },
  );
}

function checkProtectedAuthorityFilesExist(): NamedCheck {
  const missing = VISUAL_FOREST_PROTECTED_AUTHORITIES
    .flatMap((authority) => authority.files)
    .filter((file) => !existsSync(abs(file)));

  return makeCheck(
    'protected-authority-files-exist',
    missing.length === 0,
    'Current sky/cloud/post and vegetation/forest authority files must exist before proof work can claim alignment.',
    { missing },
  );
}

function checkAtmosphereAuthorityText(): NamedCheck {
  const atmosphere = readRequired('src/systems/environment/AtmosphereSystem.ts');
  const lightingRig = readRequired('src/systems/environment/LightingRig.ts');
  const visualLessons = readRequired('docs/dev/visual-rearch-lessons.md');
  const post = readRequired('src/systems/effects/PostProcessingManager.ts');
  const requiredTerms = [
    'AtmosphereSystem implements GameSystem, ISkyRuntime, ICloudRuntime',
    'SunDiscMesh',
    'deriveLightingRigState',
    'World.Atmosphere.Clouds',
    'Keep one effective lighting state',
    '`SunDiscMesh` owns',
    'narrow compatibility shim',
    'future node-based post pipeline is approved',
  ];
  const haystack = [atmosphere, lightingRig, visualLessons, post].join('\n');
  const missing = requiredTerms.filter((term) => !haystack.includes(term));

  return makeCheck(
    'atmosphere-lighting-post-authority-text',
    missing.length === 0,
    'Atmosphere, lighting, sun-body, cloud timing, and post-shim authority text must remain present.',
    { missing },
  );
}

function checkVegetationAuthorityText(): NamedCheck {
  const globalBillboard = readRequired('src/systems/world/billboard/GlobalBillboardSystem.ts');
  const vegetationRuntime = readRequired('src/systems/terrain/TerrainVegetationRuntime.ts');
  const scatterer = readRequired('src/systems/terrain/VegetationScatterer.ts');
  const groundRing = readRequired('src/systems/terrain/JungleGroundRing.ts');
  const vegetationTypes = readRequired('src/config/vegetationTypes.ts');
  const speciesSpecs = readRequired('src/config/worldSystems/VietnamSpeciesSourceSpecs.ts');
  const requiredTerms = [
    'VEGETATION_TYPES',
    'GPUBillboardSystem',
    'TerrainVegetationRuntime',
    'VegetationScatterer',
    'JungleGroundRing',
    'Cell-based vegetation scatterer',
    'Camera-following near-field ground cover',
    'representation: \'imposter\'',
    'source-spec-only',
    'generatedFableSpeciesAllowed: false',
  ];
  const haystack = [
    globalBillboard,
    vegetationRuntime,
    scatterer,
    groundRing,
    vegetationTypes,
    speciesSpecs,
  ].join('\n');
  const missing = requiredTerms.filter((term) => !haystack.includes(term));

  return makeCheck(
    'vegetation-source-authority-text',
    missing.length === 0,
    'Vegetation, billboard, source-spec, and Fable-blocking authority text must remain present.',
    { missing },
  );
}

function checkPackageScripts(packageJson: string): NamedCheck {
  const requiredTerms = [
    '"check:tod-coherence"',
    'scripts/capture-tod-coherence-sweep.ts',
    '"evidence:atmosphere"',
    'scripts/capture-atmosphere-recovery-shots.ts',
    '"check:vegetation-horizon"',
    'scripts/vegetation-horizon-audit.ts',
    '"check:vegetation-grounding"',
    'scripts/vegetation-grounding-audit.ts',
    '"check:asset-gallery"',
    'scripts/check-asset-gallery.ts',
  ];
  const missing = requiredTerms.filter((term) => !packageJson.includes(term));

  return makeCheck(
    'package-evidence-scripts',
    missing.length === 0,
    'Package scripts must expose atmosphere, TOD, vegetation horizon, vegetation grounding, and asset-gallery evidence gates.',
    { missing },
  );
}

function buildChecks(specs: readonly VisualForestWorldSystemsLaneSpec[]): NamedCheck[] {
  const packageJson = readRequired('package.json');
  return [
    checkUniqueLaneIds(specs),
    checkDefaultOffNoRuntimePorts(specs),
    checkProofHooks(specs),
    checkForbiddenOutputs(specs),
    checkProtectedAuthorityFilesExist(),
    checkAtmosphereAuthorityText(),
    checkVegetationAuthorityText(),
    checkPackageScripts(packageJson),
  ];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownFor(artifact: VisualForestWorldSystemsProofArtifact): string {
  const lines = [
    '# Visual Forest World Systems Proof',
    '',
    `Created: ${artifact.createdAt}`,
    `Status: ${artifact.status}`,
    `Source git SHA: ${artifact.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Lanes: ${artifact.summary.laneCount}`,
    `- Sky/cloud/post lanes: ${artifact.summary.skyCloudPostLaneCount}`,
    `- Forest/Nanite-lite lanes: ${artifact.summary.forestNaniteLaneCount}`,
    `- Protected authorities: ${artifact.summary.protectedAuthorityCount}`,
    `- Runtime defaults enabled: ${artifact.summary.runtimeDefaultEnabledCount}`,
    `- Fable runtime ports allowed: ${artifact.summary.fableRuntimePortAllowedCount}`,
    `- True meshlet Nanite lanes: ${artifact.summary.trueMeshletNaniteCount}`,
    `- Failing checks: ${artifact.summary.failingChecks}`,
    '',
    '## Lanes',
    '',
  ];

  for (const lane of artifact.lanes) {
    lines.push(
      `- ${lane.id}: ${lane.displayName} (${lane.group}; ${lane.status}; fallback=${lane.webglFallbackBehavior})`,
    );
  }

  lines.push('', '## Non-Claims', '');
  for (const nonClaim of artifact.nonClaims) {
    lines.push(`- ${nonClaim}`);
  }
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const lanes = VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS;
  const checks = buildChecks(lanes);
  const failed = checks.filter((check) => check.status === 'fail');
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const skyCloudPostLaneCount = lanes.filter((lane) => lane.group === 'sky-cloud-post').length;
  const forestNaniteLaneCount = lanes.filter((lane) => lane.group === 'forest-nanite-lite').length;
  const runtimeDefaultEnabledCount = lanes.filter((lane) => lane.runtimeDefault).length;
  const fableRuntimePortAllowedCount = lanes.filter((lane) => lane.fableRuntimePortAllowed).length;
  const trueMeshletNaniteCount = lanes.filter((lane) => lane.trueMeshletNanite).length;

  const jsonPath = join(outputDir, 'visual-forest-world-systems-proof.json');
  const markdownPath = join(outputDir, 'visual-forest-world-systems-proof.md');
  const artifact: VisualForestWorldSystemsProofArtifact = {
    createdAt: new Date().toISOString(),
    source: 'visual-forest-world-systems-proof',
    sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
    sourceGitStatus: gitStatus(),
    status: failed.length === 0 ? 'pass' : 'fail',
    summary: {
      laneCount: lanes.length,
      skyCloudPostLaneCount,
      forestNaniteLaneCount,
      protectedAuthorityCount: VISUAL_FOREST_PROTECTED_AUTHORITIES.length,
      failingChecks: failed.length,
      runtimeDefaultEnabledCount,
      fableRuntimePortAllowedCount,
      trueMeshletNaniteCount,
    },
    checks,
    lanes,
    protectedAuthorities: VISUAL_FOREST_PROTECTED_AUTHORITIES,
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
    nonClaims: [
      'This proof does not run browser rendering, screenshots, WebGPU device allocation, TOD coherence, atmosphere evidence, asset gallery, vegetation horizon, vegetation grounding, or quiet-machine perf commands.',
      'This proof does not approve owner-visible sky, cloud, post, vegetation, forest, or Nanite-lite visuals.',
      'This proof does not approve default-on cloud/post replacement, a second lighting authority, Fable Forests runtime, generated Fable species, unaccepted source assets, true meshlet Nanite, runtime gameplay water, deploy, or live release.',
      'This proof does not replace the release-decision run or any lane-specific GO/NO-GO decision.',
    ],
  };

  writeJson(jsonPath, artifact);
  writeFileSync(markdownPath, markdownFor(artifact), 'utf8');

  for (const check of checks) {
    const label = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[visual-forest] ${label} ${check.id}: ${check.message}`);
  }
  console.log(`[visual-forest] artifact: ${rel(jsonPath)}`);

  if (failed.length > 0) {
    console.error(`[visual-forest] FAIL ${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[visual-forest] PASS ${checks.length}/${checks.length} checks passed.`);
}

main();
