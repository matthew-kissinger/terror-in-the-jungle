#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Artifact-producing proof for Vietnam species source specs.
 *
 * This is not an asset import. It verifies that future vegetation diversity,
 * aggregate LOD, and Nanite-lite study work is expressed as TIJ-owned source
 * requirements with no Fable assets, no generated Fable species, no runtime
 * gameplay-water dependency, and no silent runtime vegetation IDs.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_RETIRED_VEGETATION_IDS,
} from '../src/config/pixelForgeAssets';
import { VEGETATION_TYPES } from '../src/config/vegetationTypes';
import {
  VIETNAM_SPECIES_SOURCE_SPECS,
  type VietnamSpeciesProofHook,
  type VietnamSpeciesSourceSpec,
} from '../src/config/worldSystems/VietnamSpeciesSourceSpecs';

type CheckStatus = 'pass' | 'fail';

interface NamedCheck {
  id: string;
  status: CheckStatus;
  message: string;
  evidence: unknown;
}

interface VietnamSpeciesSourceSpecArtifact {
  createdAt: string;
  source: 'vietnam-species-source-specs';
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  summary: {
    totalSpecs: number;
    runtimeApprovedSpecs: number;
    sourceOnlySpecs: number;
    failingChecks: number;
    habitatCount: number;
    aggregateLodCandidates: number;
    naniteLiteStudyCandidates: number;
  };
  checks: NamedCheck[];
  runtimeApprovedSpecs: VietnamSpeciesSourceSpec[];
  sourceOnlySpecs: VietnamSpeciesSourceSpec[];
  files: {
    summary: string;
    markdown: string;
  };
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'vietnam-species-source-specs';

const REQUIRED_SOURCE_ONLY_HOOKS: readonly VietnamSpeciesProofHook[] = [
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
  'rendererFeatureProfileSnapshot',
];

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

function lower(value: string): string {
  return value.toLowerCase();
}

function checkUniqueIds(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const ids = specs.map((spec) => spec.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return makeCheck(
    'unique-spec-ids',
    duplicates.length === 0,
    'Species source specs must have stable unique IDs.',
    { duplicates },
  );
}

function checkRuntimeApprovedCoverage(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const runtimeIds = VEGETATION_TYPES.map((type) => type.id).sort();
  const approvedSpecRuntimeIds = specs
    .filter((spec) => spec.status === 'runtime-approved-impostor')
    .map((spec) => spec.runtimeVegetationId)
    .sort();

  return makeCheck(
    'runtime-approved-specs-match-vegetation-registry',
    JSON.stringify(approvedSpecRuntimeIds) === JSON.stringify(runtimeIds),
    'Runtime-approved specs must describe exactly the currently approved vegetation registry.',
    { runtimeIds, approvedSpecRuntimeIds },
  );
}

function checkSourceOnlySpecsStayNonRuntime(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => spec.status === 'source-spec-only')
    .filter((spec) => spec.runtimeVegetationId !== undefined || !spec.sourceAsset.acceptedSourceRequired)
    .map((spec) => ({
      id: spec.id,
      runtimeVegetationId: spec.runtimeVegetationId,
      acceptedSourceRequired: spec.sourceAsset.acceptedSourceRequired,
    }));

  return makeCheck(
    'source-only-specs-stay-non-runtime',
    offenders.length === 0,
    'Source-only species specs cannot register runtime vegetation IDs or skip accepted-source review.',
    { offenders },
  );
}

function checkNoFableOrWaterDependency(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => (
      spec.sourceAsset.fableAssetsAllowed
      || spec.sourceAsset.generatedFableSpeciesAllowed
      || spec.runtimeWaterDependency !== 'none'
      || spec.representationPlan.trueMeshletNanite
    ))
    .map((spec) => spec.id);

  return makeCheck(
    'no-fable-water-or-true-nanite',
    offenders.length === 0,
    'Specs must forbid Fable assets/generated species, gameplay-water dependency, and true meshlet Nanite.',
    { offenders },
  );
}

function checkSourceOnlyProofHooks(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const missing = specs
    .filter((spec) => spec.status === 'source-spec-only')
    .map((spec) => ({
      id: spec.id,
      missing: REQUIRED_SOURCE_ONLY_HOOKS.filter((hook) => !spec.proofHooks.includes(hook)),
    }))
    .filter((entry) => entry.missing.length > 0);

  return makeCheck(
    'source-only-proof-hooks',
    missing.length === 0,
    'Source-only specs must carry asset, terrain, visual, perf, and profile proof hooks.',
    { missing },
  );
}

function checkBlockedRuntimeIdsAreNotApproved(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const blocked = new Set<string>([
    ...PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
    ...PIXEL_FORGE_RETIRED_VEGETATION_IDS,
  ]);
  const offenders = specs
    .filter((spec) => spec.runtimeVegetationId !== undefined && blocked.has(spec.runtimeVegetationId))
    .map((spec) => ({ id: spec.id, runtimeVegetationId: spec.runtimeVegetationId }));

  return makeCheck(
    'no-blocked-runtime-ids-approved',
    offenders.length === 0,
    'Specs must not approve blocked or retired Pixel Forge vegetation runtime IDs.',
    { offenders },
  );
}

function checkSpecTextAvoidsLegacyRuntimeIds(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const forbidden = [
    ...PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
    ...PIXEL_FORGE_RETIRED_VEGETATION_IDS,
    'dipterocarp',
  ].map(lower);
  const offenders = specs
    .flatMap((spec) => {
      const text = lower([
        spec.id,
        spec.displayName,
        ...spec.notes,
      ].join(' '));
      return forbidden
        .filter((token) => text.includes(token))
        .map((token) => ({ id: spec.id, token }));
    });

  return makeCheck(
    'source-spec-text-avoids-legacy-runtime-ids',
    offenders.length === 0,
    'Source-spec IDs/display text must avoid legacy blocked runtime tokens so future imports cannot treat them as approved IDs.',
    { offenders },
  );
}

function checkHabitatAndLodCoverage(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck {
  const habitats = new Set(specs.flatMap((spec) => spec.habitats));
  const aggregateLodCandidates = specs.filter((spec) => spec.representationPlan.aggregateLod === 'allowed-after-proof');
  const naniteLiteStudyCandidates = specs.filter((spec) => spec.representationPlan.naniteLite === 'cluster-study-only');

  return makeCheck(
    'habitat-and-lod-coverage',
    habitats.size >= 7
      && aggregateLodCandidates.length >= 5
      && naniteLiteStudyCandidates.every((spec) => spec.tier === 'canopy' || spec.tier === 'canopyShell'),
    'Specs must cover jungle habitats and keep Nanite-lite cluster study limited to canopy-style source work.',
    {
      habitats: Array.from(habitats).sort(),
      aggregateLodCandidates: aggregateLodCandidates.map((spec) => spec.id),
      naniteLiteStudyCandidates: naniteLiteStudyCandidates.map((spec) => spec.id),
    },
  );
}

function buildChecks(specs: readonly VietnamSpeciesSourceSpec[]): NamedCheck[] {
  return [
    checkUniqueIds(specs),
    checkRuntimeApprovedCoverage(specs),
    checkSourceOnlySpecsStayNonRuntime(specs),
    checkNoFableOrWaterDependency(specs),
    checkSourceOnlyProofHooks(specs),
    checkBlockedRuntimeIdsAreNotApproved(specs),
    checkSpecTextAvoidsLegacyRuntimeIds(specs),
    checkHabitatAndLodCoverage(specs),
  ];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownFor(artifact: VietnamSpeciesSourceSpecArtifact): string {
  const lines = [
    '# Vietnam Species Source Specs',
    '',
    `Created: ${artifact.createdAt}`,
    `Status: ${artifact.status}`,
    `Source git SHA: ${artifact.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Total specs: ${artifact.summary.totalSpecs}`,
    `- Runtime-approved specs: ${artifact.summary.runtimeApprovedSpecs}`,
    `- Source-only specs: ${artifact.summary.sourceOnlySpecs}`,
    `- Habitats: ${artifact.summary.habitatCount}`,
    `- Aggregate LOD candidates: ${artifact.summary.aggregateLodCandidates}`,
    `- Nanite-lite study candidates: ${artifact.summary.naniteLiteStudyCandidates}`,
    `- Failing checks: ${artifact.summary.failingChecks}`,
    '',
    '## Source-Only Specs',
    '',
  ];

  for (const spec of artifact.sourceOnlySpecs) {
    lines.push(
      `- ${spec.id}: ${spec.displayName} (${spec.tier}; habitats=${spec.habitats.join(', ')})`,
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
  const specs = VIETNAM_SPECIES_SOURCE_SPECS;
  const checks = buildChecks(specs);
  const failed = checks.filter((check) => check.status === 'fail');
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const runtimeApprovedSpecs = specs.filter((spec) => spec.status === 'runtime-approved-impostor');
  const sourceOnlySpecs = specs.filter((spec) => spec.status === 'source-spec-only');
  const habitats = new Set(specs.flatMap((spec) => spec.habitats));
  const aggregateLodCandidates = specs
    .filter((spec) => spec.representationPlan.aggregateLod === 'allowed-after-proof');
  const naniteLiteStudyCandidates = specs
    .filter((spec) => spec.representationPlan.naniteLite === 'cluster-study-only');

  const jsonPath = join(outputDir, 'vietnam-species-source-specs.json');
  const markdownPath = join(outputDir, 'vietnam-species-source-specs.md');
  const artifact: VietnamSpeciesSourceSpecArtifact = {
    createdAt: new Date().toISOString(),
    source: 'vietnam-species-source-specs',
    sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
    sourceGitStatus: gitStatus(),
    status: failed.length === 0 ? 'pass' : 'fail',
    summary: {
      totalSpecs: specs.length,
      runtimeApprovedSpecs: runtimeApprovedSpecs.length,
      sourceOnlySpecs: sourceOnlySpecs.length,
      failingChecks: failed.length,
      habitatCount: habitats.size,
      aggregateLodCandidates: aggregateLodCandidates.length,
      naniteLiteStudyCandidates: naniteLiteStudyCandidates.length,
    },
    checks,
    runtimeApprovedSpecs,
    sourceOnlySpecs,
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
    nonClaims: [
      'This proof does not import, generate, register, or ship any new runtime vegetation asset.',
      'This proof does not approve blocked or retired Pixel Forge vegetation IDs.',
      'This proof does not replace asset-gallery review, terrain screenshots, quiet-machine perf attribution, owner visual acceptance, or live-release proof.',
      'This proof does not approve runtime gameplay water; every species spec has runtimeWaterDependency=none.',
    ],
  };

  writeJson(jsonPath, artifact);
  writeFileSync(markdownPath, markdownFor(artifact), 'utf8');

  for (const check of checks) {
    const label = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[vietnam-species] ${label} ${check.id}: ${check.message}`);
  }
  console.log(`[vietnam-species] artifact: ${rel(jsonPath)}`);

  if (failed.length > 0) {
    console.error(`[vietnam-species] FAIL ${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[vietnam-species] PASS ${checks.length}/${checks.length} checks passed.`);
}

main();
