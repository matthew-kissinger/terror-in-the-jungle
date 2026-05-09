#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { PIXEL_FORGE_VEGETATION_ASSETS } from '../src/config/pixelForgeAssets';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface GalleryManifestEntry {
  kind?: string;
  id?: string;
  meta?: Record<string, unknown>;
}

interface GalleryManifest {
  generatedAt?: string;
  entries?: GalleryManifestEntry[];
}

interface ReadinessReport {
  branchExecutionState?: string;
  summary?: {
    selectedVariants?: string[];
    targetTileSize?: number | null;
    targetAtlasSize?: string | null;
  };
}

interface ImageStats {
  width: number;
  height: number;
  opaquePixels: number;
  opaqueRatio: number;
  opaqueLumaMean: number;
  opaqueChromaMean: number;
}

interface CandidatePair {
  species: string;
  variant: string;
  defaultColor: string;
  defaultNormal: string;
  defaultMeta: string;
  candidateColor: string | null;
  candidateNormal: string | null;
  candidateMeta: string | null;
  defaultColorStats: ImageStats | null;
  candidateColorStats: ImageStats | null;
  defaultNormalStats: ImageStats | null;
  candidateNormalStats: ImageStats | null;
  candidateTileSize: number | null;
  candidateAtlasSize: string | null;
  candidateNormalSpace: string | null;
  candidateAuxLayers: string[];
  checks: Array<{ id: string; status: CheckStatus; message: string }>;
}

interface Summary {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  source: 'projekt-143-vegetation-candidate-proof';
  status: CheckStatus;
  inputs: {
    readiness: string | null;
    pixelForgeRoot: string;
    candidateManifest: string | null;
  };
  target: {
    atlasSize: string | null;
    tileSize: number | null;
    selectedVariants: string[];
  };
  files: {
    summary: string;
    markdown: string;
    contactSheet: string;
  };
  pairs: CandidatePair[];
  aggregate: {
    expectedPairs: number;
    completePairs: number;
    missingCandidatePairs: number;
    maxOpaqueLumaDeltaPercent: number | null;
    maxOpaqueRatioDelta: number | null;
  };
  findings: string[];
  requiredNextActions: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-vegetation-candidate-proof';
const PIXEL_FORGE_ROOT = resolve(process.env.PIXEL_FORGE_ROOT ?? join(process.cwd(), '..', 'pixel-forge'));
const CANDIDATE_MANIFEST = join(PIXEL_FORGE_ROOT, 'packages/server/output/tij-candidates/kb-load-vegetation-256/gallery-manifest.json');
const CELL_WIDTH = 360;
const CELL_HEIGHT = 360;
const LABEL_HEIGHT = 56;
const PAIR_HEIGHT = LABEL_HEIGHT + CELL_HEIGHT * 2 + 24;
const SHEET_WIDTH = CELL_WIDTH * 2 + 48;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function gitStatusShort(): string[] {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matches = files.filter(predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function resolvePixelForge(path: string | null): string | null {
  if (!path) return null;
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
    ? path
    : join(PIXEL_FORGE_ROOT, path);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

async function imageStats(path: string | null): Promise<ImageStats | null> {
  if (!path || !existsSync(path)) return null;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaquePixels = 0;
  let lumaTotal = 0;
  let chromaTotal = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 32) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    opaquePixels++;
    lumaTotal += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    chromaTotal += max - min;
  }
  const totalPixels = info.width * info.height;
  return {
    width: info.width,
    height: info.height,
    opaquePixels,
    opaqueRatio: totalPixels > 0 ? round(opaquePixels / totalPixels, 6) : 0,
    opaqueLumaMean: opaquePixels > 0 ? round(lumaTotal / opaquePixels) : 0,
    opaqueChromaMean: opaquePixels > 0 ? round(chromaTotal / opaquePixels) : 0,
  };
}

function variantRecords(entry: GalleryManifestEntry | undefined): Record<string, unknown>[] {
  const variants = entry?.meta?.variants;
  return Array.isArray(variants)
    ? variants.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function buildChecks(pair: CandidatePair, targetTileSize: number | null, targetAtlasSize: string | null): CandidatePair['checks'] {
  const checks: CandidatePair['checks'] = [];
  const candidateFilesPresent = Boolean(pair.candidateColor && pair.candidateNormal && pair.candidateMeta);
  checks.push({
    id: 'candidate-files-present',
    status: candidateFilesPresent ? 'pass' : 'warn',
    message: candidateFilesPresent ? 'candidate color/normal/meta files are present' : 'candidate color/normal/meta files are missing; run Pixel Forge candidate generation first',
  });
  checks.push({
    id: 'candidate-tile-size',
    status: pair.candidateTileSize === targetTileSize ? 'pass' : 'warn',
    message: `candidate tileSize=${pair.candidateTileSize ?? 'missing'}, target=${targetTileSize ?? 'missing'}`,
  });
  checks.push({
    id: 'candidate-atlas-size',
    status: pair.candidateAtlasSize === targetAtlasSize ? 'pass' : 'warn',
    message: `candidate atlas=${pair.candidateAtlasSize ?? 'missing'}, target=${targetAtlasSize ?? 'missing'}`,
  });
  checks.push({
    id: 'normal-contract',
    status: pair.candidateAuxLayers.includes('normal') && pair.candidateNormalSpace === 'capture-view' ? 'pass' : 'warn',
    message: `candidate auxLayers=${pair.candidateAuxLayers.join(',') || 'missing'} normalSpace=${pair.candidateNormalSpace ?? 'missing'}`,
  });
  return checks;
}

async function buildPair(assetVariant: string, candidateManifest: GalleryManifest | null, targetTileSize: number | null, targetAtlasSize: string | null): Promise<CandidatePair | null> {
  const [species, variant] = assetVariant.split('/');
  if (!species || !variant) return null;
  const asset = PIXEL_FORGE_VEGETATION_ASSETS.find((item) => item.id === species && item.variant === variant);
  if (!asset) return null;
  const candidateEntry = candidateManifest?.entries?.find((entry) => entry.kind === 'vegetation' && entry.id === species);
  const candidateVariant = variantRecords(candidateEntry).find((entry) => asString(entry.variant) === variant);
  const candidateColor = resolvePixelForge(asString(candidateVariant?.imposter));
  const candidateNormal = resolvePixelForge(asString(candidateVariant?.imposterNormal));
  const candidateMeta = resolvePixelForge(asString(candidateVariant?.imposterMeta));
  const candidateMetaJson = readJson<Record<string, unknown>>(candidateMeta);
  const candidateAtlasSize = candidateMetaJson
    ? `${asNumber(candidateMetaJson.atlasWidth) ?? 'unknown'}x${asNumber(candidateMetaJson.atlasHeight) ?? 'unknown'}`
    : null;
  const pair: CandidatePair = {
    species,
    variant,
    defaultColor: join(process.cwd(), 'public/assets', asset.colorFile),
    defaultNormal: join(process.cwd(), 'public/assets', asset.normalFile),
    defaultMeta: join(process.cwd(), 'public/assets', asset.sourceMetaFile),
    candidateColor: candidateColor && existsSync(candidateColor) ? candidateColor : null,
    candidateNormal: candidateNormal && existsSync(candidateNormal) ? candidateNormal : null,
    candidateMeta: candidateMeta && existsSync(candidateMeta) ? candidateMeta : null,
    defaultColorStats: null,
    candidateColorStats: null,
    defaultNormalStats: null,
    candidateNormalStats: null,
    candidateTileSize: asNumber(candidateMetaJson?.tileSize),
    candidateAtlasSize,
    candidateNormalSpace: asString(candidateMetaJson?.normalSpace),
    candidateAuxLayers: asStringArray(candidateMetaJson?.auxLayers),
    checks: [],
  };
  pair.defaultColorStats = await imageStats(pair.defaultColor);
  pair.candidateColorStats = await imageStats(pair.candidateColor);
  pair.defaultNormalStats = await imageStats(pair.defaultNormal);
  pair.candidateNormalStats = await imageStats(pair.candidateNormal);
  pair.checks = buildChecks(pair, targetTileSize, targetAtlasSize);
  return pair;
}

function textSvg(text: string, width: number, height: number, fontSize = 18): Buffer {
  const lines = text.split('\n');
  const tspans = lines.map((line, index) =>
    `<tspan x="12" y="${24 + index * (fontSize + 5)}">${escapeXml(line)}</tspan>`
  ).join('');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0f172a"/>
    <text font-family="Arial, sans-serif" font-size="${fontSize}" fill="#e5e7eb">${tspans}</text>
  </svg>`);
}

function placeholderSvg(label: string): Buffer {
  return Buffer.from(`<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111827"/>
    <rect x="8" y="8" width="${CELL_WIDTH - 16}" height="${CELL_HEIGHT - 16}" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#fecaca">${escapeXml(label)}</text>
  </svg>`);
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function resizedCell(path: string | null, fallback: string): Promise<Buffer> {
  if (!path || !existsSync(path)) return sharp(placeholderSvg(fallback)).png().toBuffer();
  return sharp(path).resize(CELL_WIDTH, CELL_HEIGHT, { fit: 'contain', background: { r: 17, g: 24, b: 39, alpha: 1 } }).png().toBuffer();
}

async function writeContactSheet(pairs: CandidatePair[], outputPath: string): Promise<void> {
  const sheetHeight = Math.max(PAIR_HEIGHT * pairs.length + 24, PAIR_HEIGHT + 24);
  const composites: sharp.OverlayOptions[] = [];
  const rows = pairs.length > 0 ? pairs : [];

  if (rows.length === 0) {
    composites.push({ input: textSvg('No selected vegetation candidates found', SHEET_WIDTH, PAIR_HEIGHT), left: 0, top: 0 });
  }

  for (const [index, pair] of rows.entries()) {
    const top = 12 + index * PAIR_HEIGHT;
    composites.push({
      input: textSvg(`${pair.species}/${pair.variant}\ndefault runtime 512px source vs candidate 256px profile`, SHEET_WIDTH, LABEL_HEIGHT, 16),
      left: 0,
      top,
    });
    composites.push({ input: await resizedCell(pair.defaultColor, 'missing default color'), left: 12, top: top + LABEL_HEIGHT });
    composites.push({ input: await resizedCell(pair.candidateColor, 'missing candidate color'), left: CELL_WIDTH + 36, top: top + LABEL_HEIGHT });
    composites.push({ input: await resizedCell(pair.defaultNormal, 'missing default normal'), left: 12, top: top + LABEL_HEIGHT + CELL_HEIGHT + 12 });
    composites.push({ input: await resizedCell(pair.candidateNormal, 'missing candidate normal'), left: CELL_WIDTH + 36, top: top + LABEL_HEIGHT + CELL_HEIGHT + 12 });
  }

  await sharp({
    create: {
      width: SHEET_WIDTH,
      height: sheetHeight,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  }).composite(composites).png().toFile(outputPath);
}

function statusFromPairs(pairs: CandidatePair[], expectedPairs: number): CheckStatus {
  if (expectedPairs === 0) return 'fail';
  if (pairs.some((pair) => !existsSync(pair.defaultColor) || !existsSync(pair.defaultNormal))) return 'fail';
  if (pairs.length !== expectedPairs) return 'warn';
  if (pairs.some((pair) => pair.checks.some((check) => check.status !== 'pass'))) return 'warn';
  return 'pass';
}

function lumaDeltaPercent(pair: CandidatePair): number | null {
  if (!pair.defaultColorStats || !pair.candidateColorStats || pair.defaultColorStats.opaqueLumaMean <= 0) return null;
  return round(((pair.candidateColorStats.opaqueLumaMean - pair.defaultColorStats.opaqueLumaMean) / pair.defaultColorStats.opaqueLumaMean) * 100, 2);
}

function opaqueRatioDelta(pair: CandidatePair): number | null {
  if (!pair.defaultColorStats || !pair.candidateColorStats) return null;
  return round(pair.candidateColorStats.opaqueRatio - pair.defaultColorStats.opaqueRatio, 6);
}

function writeMarkdown(summary: Summary, path: string): void {
  const lines = [
    '# Projekt 143 Vegetation Candidate Proof',
    '',
    `Generated: ${summary.createdAt}`,
    `Status: ${summary.status.toUpperCase()}`,
    '',
    '## Inputs',
    '',
    `- Readiness: ${summary.inputs.readiness ?? 'missing'}`,
    `- Candidate manifest: ${summary.inputs.candidateManifest ?? 'missing'}`,
    `- Target: ${summary.target.atlasSize ?? 'unknown'} / tile ${summary.target.tileSize ?? 'unknown'}`,
    '',
    '## Pairs',
    '',
    '| Species | Default atlas | Candidate atlas | Candidate tile | Luma delta | Checks |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summary.pairs.map((pair) => {
      const checks = pair.checks.map((check) => `${check.id}:${check.status}`).join('<br>');
      return `| ${pair.species}/${pair.variant} | ${pair.defaultColorStats ? `${pair.defaultColorStats.width}x${pair.defaultColorStats.height}` : 'missing'} | ${pair.candidateColorStats ? `${pair.candidateColorStats.width}x${pair.candidateColorStats.height}` : 'missing'} | ${pair.candidateTileSize ?? 'missing'} | ${lumaDeltaPercent(pair) ?? 'n/a'}% | ${checks} |`;
    }),
    '',
    '## Findings',
    '',
    ...summary.findings.map((finding) => `- ${finding}`),
    '',
    '## Required Next Actions',
    '',
    ...summary.requiredNextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...summary.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  const artifactFiles = walkFiles(ARTIFACT_ROOT);
  const readinessPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-pixel-forge-vegetation-readiness', 'vegetation-readiness.json')));
  const readiness = readJson<ReadinessReport>(readinessPath);
  const candidateManifest = readJson<GalleryManifest>(CANDIDATE_MANIFEST);
  const selectedVariants = readiness?.summary?.selectedVariants ?? [];
  const pairs = (await Promise.all(
    selectedVariants.map((variant) => buildPair(variant, candidateManifest, readiness?.summary?.targetTileSize ?? null, readiness?.summary?.targetAtlasSize ?? null)),
  )).filter((pair): pair is CandidatePair => Boolean(pair));

  const completePairs = pairs.filter((pair) => pair.checks.every((check) => check.status === 'pass')).length;
  const lumaDeltas = pairs.map(lumaDeltaPercent).filter((value): value is number => typeof value === 'number');
  const opaqueRatioDeltas = pairs.map(opaqueRatioDelta).filter((value): value is number => typeof value === 'number');
  const status = statusFromPairs(pairs, selectedVariants.length);
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');
  const contactSheetPath = join(outputDir, 'candidate-contact-sheet.png');

  const findings: string[] = [];
  if (!candidateManifest) {
    findings.push('Pixel Forge candidate manifest is missing; run bun run tij:pipeline:kb-load-vegetation-256 before visual/static candidate comparison.');
  }
  if (readiness?.branchExecutionState !== 'ready_for_candidate_generation') {
    findings.push(`Latest readiness state is ${readiness?.branchExecutionState ?? 'missing'}, not ready_for_candidate_generation.`);
  }
  if (completePairs > 0) {
    findings.push(`${completePairs}/${selectedVariants.length} selected candidate pairs have color, normal, metadata, target tile size, target atlas size, and normal-contract checks passing.`);
  }
  if (completePairs < selectedVariants.length) {
    findings.push(`${selectedVariants.length - completePairs}/${selectedVariants.length} selected candidate pairs are not complete yet.`);
  }

  const summary: Summary = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    source: 'projekt-143-vegetation-candidate-proof',
    status,
    inputs: {
      readiness: rel(readinessPath),
      pixelForgeRoot: PIXEL_FORGE_ROOT,
      candidateManifest: existsSync(CANDIDATE_MANIFEST) ? rel(CANDIDATE_MANIFEST) : null,
    },
    target: {
      atlasSize: readiness?.summary?.targetAtlasSize ?? null,
      tileSize: readiness?.summary?.targetTileSize ?? null,
      selectedVariants,
    },
    files: {
      summary: rel(summaryPath) ?? summaryPath,
      markdown: rel(markdownPath) ?? markdownPath,
      contactSheet: rel(contactSheetPath) ?? contactSheetPath,
    },
    pairs,
    aggregate: {
      expectedPairs: selectedVariants.length,
      completePairs,
      missingCandidatePairs: selectedVariants.length - completePairs,
      maxOpaqueLumaDeltaPercent: lumaDeltas.length > 0 ? Math.max(...lumaDeltas.map(Math.abs)) : null,
      maxOpaqueRatioDelta: opaqueRatioDeltas.length > 0 ? Math.max(...opaqueRatioDeltas.map((value) => Math.abs(value))) : null,
    },
    findings,
    requiredNextActions: completePairs === selectedVariants.length
      ? [
          'Use the generated contact sheet for owner-side visual review before importing candidate atlases into TIJ.',
          'After owner visual acceptance, copy/import the accepted color/normal pairs into TIJ and rerun texture audit, startup tables, Cycle 3 kickoff, and completion audit.',
        ]
      : [
          'Run Pixel Forge candidate generation: bun run tij:pipeline:kb-load-vegetation-256.',
          'Run Pixel Forge candidate validation: bun run tij:vegetation-validate:kb-load-vegetation-256.',
          'Rerun this proof command to generate a complete side-by-side candidate contact sheet.',
        ],
    nonClaims: [
      'This static atlas comparison does not prove in-game lighting, depth sorting, vegetation distribution, startup performance, or production parity.',
      'This proof does not import candidate atlases into TIJ.',
      'This proof does not replace owner visual review or quiet-machine Open Frontier/Zone Control startup captures.',
    ],
  };

  await writeContactSheet(pairs, contactSheetPath);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  writeMarkdown(summary, markdownPath);

  console.log(`Projekt 143 vegetation candidate proof ${summary.status.toUpperCase()}: ${rel(summaryPath)}`);
  console.log(`- contactSheet=${rel(contactSheetPath)}`);
  console.log(`- completePairs=${completePairs}/${selectedVariants.length}`);
  if (summary.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('projekt-143-vegetation-candidate-proof failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
