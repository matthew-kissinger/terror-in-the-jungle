#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Artifact-producing guard for terrain/hydrology debug-proof scope.
 *
 * This is not a terrain, visual, browser, or perf proof. It verifies that the
 * Fable-inspired heightfield/erosion/hydrology work is encoded as default-off
 * diagnostics that protect TIJ terrain, DEM, navmesh, heightmap, and
 * water-stripped authority before any future owner-approved implementation.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS,
  TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES,
  type TerrainHydrologyDebugLaneSpec,
  type TerrainHydrologyForbiddenOutput,
  type TerrainHydrologyProofHook,
} from '../src/config/worldSystems/TerrainHydrologyDebugProofSpec';

type CheckStatus = 'pass' | 'fail';

interface NamedCheck {
  id: string;
  status: CheckStatus;
  message: string;
  evidence: unknown;
}

interface TerrainHydrologyDebugProofArtifact {
  createdAt: string;
  source: 'terrain-hydrology-debug-proof';
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  summary: {
    laneCount: number;
    protectedAuthorityCount: number;
    failingChecks: number;
    debugWaterLaneCount: number;
    runtimeDefaultEnabledCount: number;
    terrainMutationLaneCount: number;
  };
  checks: NamedCheck[];
  lanes: readonly TerrainHydrologyDebugLaneSpec[];
  protectedAuthorities: typeof TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES;
  files: {
    summary: string;
    markdown: string;
  };
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'terrain-hydrology-debug-proof';

const FORBIDDEN_RUNTIME_WATER_PATHS = [
  'src/systems/environment/water',
  'src/systems/environment/WaterSystem.ts',
  'src/systems/environment/HydrologySystem.ts',
  'src/systems/water',
] as const;

const REQUIRED_FORBIDDEN_OUTPUTS: readonly TerrainHydrologyForbiddenOutput[] = [
  'runtimeWaterRendering',
  'runtimeWaterQueryPhysics',
  'swimmingOrBuoyancy',
  'watercraftSpawnOrBoarding',
  'waterSystemReactivation',
  'hydrologySystemReactivation',
  'terrainAuthoritySwap',
  'demOrNavmeshMutation',
  'fableAssetImport',
  'fableWaterMaterial',
];

const REQUIRED_SHARED_HOOKS: readonly TerrainHydrologyProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
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

function checkUniqueLaneIds(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck {
  const ids = specs.map((spec) => spec.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return makeCheck(
    'unique-terrain-hydrology-lane-ids',
    duplicates.length === 0,
    'Terrain/hydrology debug-proof lanes must have stable unique IDs.',
    { ids, duplicates },
  );
}

function checkDefaultOffNonRuntime(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck {
  const offenders = specs
    .filter((spec) => (
      spec.runtimeDefault
      || spec.authoritativeTerrainMutation
      || spec.runtimeWaterDependency !== 'none'
      || spec.fableAssetsAllowed
    ))
    .map((spec) => ({
      id: spec.id,
      runtimeDefault: spec.runtimeDefault,
      authoritativeTerrainMutation: spec.authoritativeTerrainMutation,
      runtimeWaterDependency: spec.runtimeWaterDependency,
      fableAssetsAllowed: spec.fableAssetsAllowed,
    }));

  return makeCheck(
    'default-off-no-runtime-authority',
    offenders.length === 0,
    'All lanes must remain default-off, non-authoritative, Fable-free, and independent from runtime gameplay water.',
    { offenders },
  );
}

function checkForbiddenOutputs(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck {
  const missing = specs
    .map((spec) => ({
      id: spec.id,
      missing: REQUIRED_FORBIDDEN_OUTPUTS.filter((item) => !spec.forbiddenOutputs.includes(item)),
    }))
    .filter((entry) => entry.missing.length > 0);

  return makeCheck(
    'runtime-water-and-authority-swaps-forbidden',
    missing.length === 0,
    'Every lane must explicitly forbid gameplay water, terrain authority swaps, DEM/navmesh mutation, and Fable imports.',
    { missing },
  );
}

function checkProofHooks(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck {
  const missing = specs
    .map((spec) => ({
      id: spec.id,
      missing: [
        ...REQUIRED_SHARED_HOOKS.filter((hook) => !spec.proofHooks.includes(hook)),
        ...(spec.waterOutput === 'debug-only-water-level-proof' && !spec.proofHooks.includes('ownerDebugWaterApproval')
          ? ['ownerDebugWaterApproval' as const]
          : []),
      ],
    }))
    .filter((entry) => entry.missing.length > 0);

  return makeCheck(
    'required-proof-hooks',
    missing.length === 0,
    'Lanes must carry profile, terrain, visual, quiet-machine perf, and owner approval hooks where water proof is mentioned.',
    { missing },
  );
}

function checkProtectedAuthorityFilesExist(): NamedCheck {
  const missing = TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES
    .flatMap((authority) => authority.files)
    .filter((file) => !existsSync(abs(file)));

  return makeCheck(
    'protected-authority-files-exist',
    missing.length === 0,
    'Current TIJ terrain, DEM, navmesh, and heightmap authority files must exist before proof work can claim alignment.',
    { missing },
  );
}

function checkRuntimeWaterPathsRemainStripped(): NamedCheck {
  const existing = FORBIDDEN_RUNTIME_WATER_PATHS.filter((path) => existsSync(abs(path)));
  return makeCheck(
    'runtime-water-system-paths-stripped',
    existing.length === 0,
    'The 2026-06-09 water scorch must remain intact: no runtime WaterSystem/HydrologySystem paths can reappear in this cycle.',
    { existing },
  );
}

function checkAShauAuthority(): NamedCheck {
  const config = readRequired('src/config/AShauValleyConfig.ts');
  const requiredTerms = [
    'ASHAU_DEM_ASSET_ID',
    "type: 'dem'",
    "path: '/data/vietnam/big-map/a-shau-z14-9x9.f32'",
    "navmeshAsset: '/data/navmesh/a_shau_valley.bin'",
    'the hydrology mask that drove them was removed in the water rework',
  ];
  const missing = requiredTerms.filter((term) => !config.includes(term));

  return makeCheck(
    'a-shau-dem-navmesh-authority',
    missing.length === 0,
    'A Shau must retain real DEM height source, prebaked navmesh, and dry-terrain biome authority.',
    { missing },
  );
}

function checkOpenFrontierAuthority(): NamedCheck {
  const config = readRequired('src/config/OpenFrontierConfig.ts');
  const registry = readRequired('src/config/MapSeedRegistry.ts');
  const manifest = readRequired('public/data/navmesh/bake-manifest.json');
  const requiredTerms = [
    "navmeshAsset: '/data/navmesh/open_frontier-42.bin'",
    "heightmapAsset: '/data/heightmaps/open_frontier-42.f32'",
    '"navmeshAsset": "/data/navmesh/open_frontier-42.bin"',
    '"heightmapAsset": "/data/heightmaps/open_frontier-42.f32"',
  ];
  const haystacks = [config, registry, manifest].join('\n');
  const missing = requiredTerms.filter((term) => !haystacks.includes(term));

  return makeCheck(
    'open-frontier-navmesh-heightmap-authority',
    missing.length === 0,
    'Open Frontier must retain seeded prebaked navmesh and heightmap authority.',
    { missing },
  );
}

function checkGeneratedSeedPairs(): NamedCheck {
  const registry = readRequired('src/config/MapSeedRegistry.ts');
  const manifest = readRequired('public/data/navmesh/bake-manifest.json');
  const requiredPairs = [
    '/data/navmesh/open_frontier-42.bin',
    '/data/heightmaps/open_frontier-42.f32',
    '/data/navmesh/zone_control-42.bin',
    '/data/heightmaps/zone_control-42.f32',
    '/data/navmesh/tdm-42.bin',
    '/data/heightmaps/tdm-42.f32',
  ];
  const haystacks = [registry, manifest].join('\n');
  const missing = requiredPairs.filter((asset) => !haystacks.includes(asset));

  return makeCheck(
    'generated-mode-seed-pairs',
    missing.length === 0,
    'Generated modes must keep explicit navmesh/heightmap pairs in registry and bake manifest.',
    { missing },
  );
}

function buildChecks(specs: readonly TerrainHydrologyDebugLaneSpec[]): NamedCheck[] {
  return [
    checkUniqueLaneIds(specs),
    checkDefaultOffNonRuntime(specs),
    checkForbiddenOutputs(specs),
    checkProofHooks(specs),
    checkProtectedAuthorityFilesExist(),
    checkRuntimeWaterPathsRemainStripped(),
    checkAShauAuthority(),
    checkOpenFrontierAuthority(),
    checkGeneratedSeedPairs(),
  ];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownFor(artifact: TerrainHydrologyDebugProofArtifact): string {
  const lines = [
    '# Terrain Hydrology Debug Proof',
    '',
    `Created: ${artifact.createdAt}`,
    `Status: ${artifact.status}`,
    `Source git SHA: ${artifact.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Lanes: ${artifact.summary.laneCount}`,
    `- Protected authorities: ${artifact.summary.protectedAuthorityCount}`,
    `- Debug-water lanes: ${artifact.summary.debugWaterLaneCount}`,
    `- Runtime defaults enabled: ${artifact.summary.runtimeDefaultEnabledCount}`,
    `- Terrain mutation lanes: ${artifact.summary.terrainMutationLaneCount}`,
    `- Failing checks: ${artifact.summary.failingChecks}`,
    '',
    '## Lanes',
    '',
  ];

  for (const lane of artifact.lanes) {
    lines.push(
      `- ${lane.id}: ${lane.displayName} (${lane.status}; waterOutput=${lane.waterOutput})`,
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
  const lanes = TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS;
  const checks = buildChecks(lanes);
  const failed = checks.filter((check) => check.status === 'fail');
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const debugWaterLaneCount = lanes
    .filter((lane) => lane.waterOutput === 'debug-only-water-level-proof').length;
  const runtimeDefaultEnabledCount = lanes.filter((lane) => lane.runtimeDefault).length;
  const terrainMutationLaneCount = lanes.filter((lane) => lane.authoritativeTerrainMutation).length;

  const jsonPath = join(outputDir, 'terrain-hydrology-debug-proof.json');
  const markdownPath = join(outputDir, 'terrain-hydrology-debug-proof.md');
  const artifact: TerrainHydrologyDebugProofArtifact = {
    createdAt: new Date().toISOString(),
    source: 'terrain-hydrology-debug-proof',
    sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
    sourceGitStatus: gitStatus(),
    status: failed.length === 0 ? 'pass' : 'fail',
    summary: {
      laneCount: lanes.length,
      protectedAuthorityCount: TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES.length,
      failingChecks: failed.length,
      debugWaterLaneCount,
      runtimeDefaultEnabledCount,
      terrainMutationLaneCount,
    },
    checks,
    lanes,
    protectedAuthorities: TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES,
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
    nonClaims: [
      'This proof does not run browser rendering, screenshots, WebGPU device allocation, terrain baseline capture, or quiet-machine perf attribution.',
      'This proof does not approve owner-visible terrain, erosion, hydrology, or water visuals.',
      'This proof does not approve runtime gameplay water, water queries, swimming, buoyancy, or watercraft reactivation.',
      'This proof does not modify A Shau DEM data, generated heightmaps, navmesh binaries, terrain authority, or scenario placement.',
      'This proof does not replace deploy, CI, or live-release gates.',
    ],
  };

  writeJson(jsonPath, artifact);
  writeFileSync(markdownPath, markdownFor(artifact), 'utf8');

  for (const check of checks) {
    const label = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[terrain-hydrology] ${label} ${check.id}: ${check.message}`);
  }
  console.log(`[terrain-hydrology] artifact: ${rel(jsonPath)}`);

  if (failed.length > 0) {
    console.error(`[terrain-hydrology] FAIL ${failed.length}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`[terrain-hydrology] PASS ${checks.length}/${checks.length} checks passed.`);
}

main();
