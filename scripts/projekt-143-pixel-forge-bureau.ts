#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_RETIRED_VEGETATION_IDS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from '../src/config/pixelForgeAssets';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface ManifestEntry {
  kind?: string;
  id?: string;
  meta?: Record<string, unknown>;
}

interface GalleryManifest {
  version?: number;
  generatedAt?: string;
  counts?: Record<string, number>;
  entries?: ManifestEntry[];
}

interface FileProbe {
  path: string;
  exists: boolean;
  bytes: number;
}

interface PixelForgeBureauReport {
  createdAt: string;
  source: 'projekt-143-pixel-forge-bureau';
  status: CheckStatus;
  pixelForgeRoot: string;
  pixelForgeRootExists: boolean;
  packageScripts: Record<string, string>;
  surfaces: Record<string, FileProbe>;
  currentTijContract: {
    runtimeVegetationSpecies: string[];
    retiredVegetationSpecies: string[];
    blockedVegetationSpecies: string[];
  };
  galleryManifest: {
    exists: boolean;
    generatedAt: string | null;
    counts: Record<string, number>;
    totalEntries: number;
    kinds: Record<string, number>;
    vegetationSpecies: string[];
    productionStatuses: Record<string, string>;
    runtimeSpeciesPresent: string[];
    runtimeSpeciesMissing: string[];
    retiredSpeciesPresent: string[];
    blockedSpeciesPresent: string[];
    manifestOnlySpecies: string[];
  };
  npcPackage: {
    exists: boolean;
    manifestPath: string;
    factionCount: number | null;
    clipCount: number | null;
    imposterCount: number | null;
  };
  findings: string[];
  recommendations: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PIXEL_FORGE_ROOT = resolve(process.env.PIXEL_FORGE_ROOT ?? join(process.cwd(), '..', 'pixel-forge'));

const SURFACES = {
  packageJson: 'package.json',
  tijPipelineRunner: 'scripts/run-tij-pipeline.ts',
  tijVegetationValidator: 'scripts/validate-tij-vegetation-package.ts',
  tijNpcPackager: 'scripts/package-tij-npc-assets.ts',
  tijGalleryRoute: 'packages/server/src/routes/gallery-tij.ts',
  tijGalleryHtml: 'packages/server/tij-gallery/index.html',
  tijGalleryManifest: 'packages/server/output/tij/gallery-manifest.json',
  tijPipelineProposal: 'docs/tij-asset-pipeline-proposal.md',
  tijNpcAssetCycle: 'docs/tij-npc-asset-cycle.md',
} as const;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function probe(path: string): FileProbe {
  const exists = existsSync(path);
  return {
    path: relative(process.cwd(), path),
    exists,
    bytes: exists ? statSync(path).size : 0,
  };
}

function countKinds(entries: ManifestEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    const kind = entry.kind ?? 'unknown';
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countCollection(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return null;
}

function collectMatchingStrings(value: unknown, pattern: RegExp, matches = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const normalized = value.replaceAll('\\', '/');
    if (pattern.test(normalized)) {
      matches.add(normalized);
    }
    return matches;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectMatchingStrings(item, pattern, matches);
    }
    return matches;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectMatchingStrings(item, pattern, matches);
    }
  }

  return matches;
}

function inspectNpcPackage(pixelForgeRoot: string): PixelForgeBureauReport['npcPackage'] {
  const manifestPath = join(pixelForgeRoot, 'tmp/tij-npc-asset-package/tij-character-pack-v1/npc-package-manifest.json');
  const manifest = readJson<{
    factions?: unknown;
    clips?: unknown;
  }>(manifestPath);
  const imposterDirs = collectMatchingStrings(manifest, /(?:^|\/)impostors\/[^/]+\/[^/]+$/);
  const imposterSidecarDirs = new Set(
    [...collectMatchingStrings(manifest, /(?:^|\/)impostors\/[^/]+\/[^/]+\/animated-imposter\.json$/)].map((path) =>
      path.slice(0, -'/animated-imposter.json'.length)
    ),
  );
  const imposterCount = Math.max(imposterDirs.size, imposterSidecarDirs.size);

  return {
    exists: Boolean(manifest),
    manifestPath: relative(process.cwd(), manifestPath),
    factionCount: countCollection(manifest?.factions),
    clipCount: countCollection(manifest?.clips),
    imposterCount: imposterCount > 0 ? imposterCount : null,
  };
}

function buildReport(): PixelForgeBureauReport {
  const packageJson = readJson<{ scripts?: Record<string, string> }>(join(PIXEL_FORGE_ROOT, 'package.json'));
  const surfaces = Object.fromEntries(
    Object.entries(SURFACES).map(([key, value]) => [key, probe(join(PIXEL_FORGE_ROOT, value))]),
  );

  const manifest = readJson<GalleryManifest>(join(PIXEL_FORGE_ROOT, SURFACES.tijGalleryManifest));
  const entries = manifest?.entries ?? [];
  const vegetationEntries = entries.filter((entry) => entry.kind === 'vegetation' && entry.id);
  const vegetationSpecies = vegetationEntries.map((entry) => entry.id!).sort((a, b) => a.localeCompare(b));
  const productionStatuses = Object.fromEntries(
    vegetationEntries.map((entry) => [entry.id!, asString(entry.meta?.productionStatus)]),
  );

  const runtimeSpecies = PIXEL_FORGE_VEGETATION_ASSETS.map((asset) => asset.id).sort((a, b) => a.localeCompare(b));
  const retiredSpecies = [...PIXEL_FORGE_RETIRED_VEGETATION_IDS].sort((a, b) => a.localeCompare(b));
  const blockedSpecies = [...PIXEL_FORGE_BLOCKED_VEGETATION_IDS].sort((a, b) => a.localeCompare(b));
  const manifestSpecies = new Set(vegetationSpecies);
  const runtimeSpeciesPresent = runtimeSpecies.filter((id) => manifestSpecies.has(id));
  const runtimeSpeciesMissing = runtimeSpecies.filter((id) => !manifestSpecies.has(id));
  const retiredSpeciesPresent = retiredSpecies.filter((id) => manifestSpecies.has(id));
  const blockedSpeciesPresent = blockedSpecies.filter((id) => manifestSpecies.has(id));
  const allowedKnownSpecies = new Set([...runtimeSpecies, ...retiredSpecies, ...blockedSpecies]);
  const manifestOnlySpecies = vegetationSpecies.filter((id) => !allowedKnownSpecies.has(id));

  const findings: string[] = [];
  if (!existsSync(PIXEL_FORGE_ROOT)) {
    findings.push('Pixel Forge sibling repo is not present at the expected path.');
  } else {
    findings.push('Pixel Forge sibling repo is present and readable.');
  }
  if (packageJson?.scripts?.['tij:pipeline'] && packageJson.scripts['tij:vegetation-validate']) {
    findings.push('Pixel Forge already exposes TIJ pipeline and vegetation-validation commands.');
  } else {
    findings.push('Pixel Forge TIJ pipeline command surface is incomplete or unavailable.');
  }
  if (manifest) {
    findings.push(`Gallery manifest is present with ${entries.length} entries and ${vegetationSpecies.length} vegetation species.`);
  } else {
    findings.push('Gallery manifest is missing; run Pixel Forge tij:pipeline before relying on package inventory.');
  }
  if (retiredSpeciesPresent.length > 0) {
    findings.push(`Gallery manifest still includes retired TIJ species: ${retiredSpeciesPresent.join(', ')}.`);
  }
  if (blockedSpeciesPresent.length > 0) {
    findings.push(`Gallery manifest includes blocked/review-only species: ${blockedSpeciesPresent.join(', ')}.`);
  }
  if (runtimeSpeciesMissing.length > 0) {
    findings.push(`Gallery manifest is missing current TIJ runtime species: ${runtimeSpeciesMissing.join(', ')}.`);
  }

  const hardMissing = !existsSync(PIXEL_FORGE_ROOT) || !surfaces.packageJson.exists;
  const hasWarnings =
    !manifest
    || retiredSpeciesPresent.length > 0
    || blockedSpeciesPresent.length > 0
    || runtimeSpeciesMissing.length > 0
    || manifestOnlySpecies.length > 0
    || !surfaces.tijPipelineRunner.exists
    || !surfaces.tijVegetationValidator.exists
    || !surfaces.tijGalleryRoute.exists;

  return {
    createdAt: new Date().toISOString(),
    source: 'projekt-143-pixel-forge-bureau',
    status: hardMissing ? 'fail' : hasWarnings ? 'warn' : 'pass',
    pixelForgeRoot: PIXEL_FORGE_ROOT,
    pixelForgeRootExists: existsSync(PIXEL_FORGE_ROOT),
    packageScripts: packageJson?.scripts ?? {},
    surfaces,
    currentTijContract: {
      runtimeVegetationSpecies: runtimeSpecies,
      retiredVegetationSpecies: retiredSpecies,
      blockedVegetationSpecies: blockedSpecies,
    },
    galleryManifest: {
      exists: Boolean(manifest),
      generatedAt: manifest?.generatedAt ?? null,
      counts: manifest?.counts ?? {},
      totalEntries: entries.length,
      kinds: countKinds(entries),
      vegetationSpecies,
      productionStatuses,
      runtimeSpeciesPresent,
      runtimeSpeciesMissing,
      retiredSpeciesPresent,
      blockedSpeciesPresent,
      manifestOnlySpecies,
    },
    npcPackage: inspectNpcPackage(PIXEL_FORGE_ROOT),
    findings,
    recommendations: [
      'Treat KB-FORGE as the local Pixel Forge liaison bureau for TIJ: catalog relevance, run package validation, and produce review-only handoff evidence before TIJ runtime import.',
      'Do not use external EZ-Tree or asset-library outputs as a replacement for Pixel Forge; use them as optional source inputs that Pixel Forge can ingest, bake, validate, and gallery-review.',
      'First KB-FORGE vegetation task: refresh the Pixel Forge TIJ vegetation manifest so retired giantPalm is no longer a production target and blocked species remain explicitly review-only.',
      'Second KB-FORGE vegetation task: catalog missing Vietnam families for grass, ground cover, trail-edge clumps, understory, and far-canopy silhouettes against what Pixel Forge can already generate or bake.',
      'Keep Pixel Forge output under review-only/package directories until TIJ asset acceptance has screenshots, texture/upload evidence, and Open Frontier/A Shau coverage.',
    ],
    nonClaims: [
      'This audit does not mutate Pixel Forge.',
      'This audit does not accept any Pixel Forge output for TIJ runtime.',
      'This audit does not prove visual fit, texture residency, culling, LOD, or production parity.',
    ],
  };
}

function writeReport(report: PixelForgeBureauReport): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-pixel-forge-bureau');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'pixel-forge-bureau.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const report = buildReport();
  const outputPath = writeReport(report);
  console.log(`Projekt 143 Pixel Forge bureau ${report.status.toUpperCase()}: ${relative(process.cwd(), outputPath)}`);
  console.log(`- root=${report.pixelForgeRootExists ? 'present' : 'missing'} ${report.pixelForgeRoot}`);
  console.log(`- manifest=${report.galleryManifest.exists ? 'present' : 'missing'} entries=${report.galleryManifest.totalEntries} vegetation=${report.galleryManifest.vegetationSpecies.length}`);
  console.log(`- runtime present=${report.galleryManifest.runtimeSpeciesPresent.length}, runtime missing=${report.galleryManifest.runtimeSpeciesMissing.length}, retired present=${report.galleryManifest.retiredSpeciesPresent.length}, blocked present=${report.galleryManifest.blockedSpeciesPresent.length}`);
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
