#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { PIXEL_FORGE_VEGETATION_ASSETS } from '../src/config/pixelForgeAssets';

type CheckStatus = 'pass' | 'warn' | 'fail';
type ImportState = 'dry_run_ready' | 'applied' | 'blocked';

interface GalleryManifestEntry {
  kind?: string;
  id?: string;
  meta?: Record<string, unknown>;
}

interface GalleryManifest {
  generatedAt?: string;
  entries?: GalleryManifestEntry[];
}

interface CandidateProof {
  status?: CheckStatus;
  files?: {
    summary?: string;
    contactSheet?: string;
  };
  target?: {
    atlasSize?: string | null;
    tileSize?: number | null;
    selectedVariants?: string[];
  };
  aggregate?: {
    completePairs?: number;
    expectedPairs?: number;
    missingCandidatePairs?: number;
  };
}

interface ImageInfo {
  width: number;
  height: number;
}

interface MetaInfo {
  atlasWidth: number | null;
  atlasHeight: number | null;
  tileSize: number | null;
  normalSpace: string | null;
  auxLayers: string[];
  textureColorSpace: string | null;
}

interface ImportPlanItem {
  species: string;
  variant: string;
  runtime: {
    color: string;
    normal: string;
    meta: string;
  };
  candidate: {
    color: string | null;
    normal: string | null;
    meta: string | null;
  };
  candidateImage: {
    color: ImageInfo | null;
    normal: ImageInfo | null;
  };
  candidateMeta: MetaInfo | null;
  candidateQuality: {
    strongCyanStemPixels: number | null;
  };
  checks: Array<{ id: string; status: CheckStatus; message: string }>;
  applied: boolean;
}

interface ImportPlanReport {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  source: 'projekt-143-vegetation-candidate-import-plan';
  status: CheckStatus;
  importState: ImportState;
  dryRun: boolean;
  applyRequested: boolean;
  ownerAccepted: boolean;
  inputs: {
    candidateProof: string | null;
    candidateContactSheet: string | null;
    pixelForgeRoot: string;
    candidateManifest: string | null;
  };
  target: {
    atlasSize: string | null;
    tileSize: number | null;
    selectedVariants: string[];
  };
  files: {
    report: string;
    markdown: string;
  };
  summary: {
    expectedItems: number;
    readyItems: number;
    appliedItems: number;
    blockedItems: number;
    runtimeDestinations: string[];
  };
  items: ImportPlanItem[];
  findings: string[];
  requiredNextActions: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-vegetation-candidate-import-plan';
const PIXEL_FORGE_ROOT = resolve(process.env.PIXEL_FORGE_ROOT ?? join(process.cwd(), '..', 'pixel-forge'));
const CANDIDATE_MANIFEST = join(PIXEL_FORGE_ROOT, 'packages/server/output/tij-candidates/kb-load-vegetation-256/gallery-manifest.json');

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

function resolvePixelForgePath(path: string | null): string | null {
  if (!path) return null;
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
    ? path
    : join(PIXEL_FORGE_ROOT, path);
}

function manifestVariants(entry: GalleryManifestEntry | undefined): Record<string, unknown>[] {
  const variants = entry?.meta?.variants;
  return Array.isArray(variants)
    ? variants.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

async function imageInfo(path: string | null): Promise<ImageInfo | null> {
  if (!path || !existsSync(path)) return null;
  const meta = await sharp(path).metadata();
  return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
}

async function countStrongCyanStemPixels(path: string | null): Promise<number | null> {
  if (!path || !existsSync(path)) return null;
  const { data } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let strongCyanStemPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 24) {
      continue;
    }

    if (r < 90 && g > 95 && b > 85 && b > r + 35 && g > r + 45) {
      strongCyanStemPixels += 1;
    }
  }

  return strongCyanStemPixels;
}

function readMeta(path: string | null): MetaInfo | null {
  const json = readJson<Record<string, unknown>>(path);
  if (!json) return null;
  return {
    atlasWidth: asNumber(json.atlasWidth),
    atlasHeight: asNumber(json.atlasHeight),
    tileSize: asNumber(json.tileSize),
    normalSpace: asString(json.normalSpace),
    auxLayers: asStringArray(json.auxLayers),
    textureColorSpace: asString(json.textureColorSpace),
  };
}

function expectedAtlasSize(targetAtlasSize: string | null): { width: number | null; height: number | null } {
  if (!targetAtlasSize) return { width: null, height: null };
  const match = /^(\d+)x(\d+)$/.exec(targetAtlasSize);
  return {
    width: match ? Number.parseInt(match[1] ?? '', 10) : null,
    height: match ? Number.parseInt(match[2] ?? '', 10) : null,
  };
}

function checkStatus(checks: ImportPlanItem['checks'], id: string, status: CheckStatus, message: string): void {
  checks.push({ id, status, message });
}

async function buildItem(
  selectedVariant: string,
  manifest: GalleryManifest | null,
  targetTileSize: number | null,
  targetAtlasSize: string | null,
  apply: boolean,
  ownerAccepted: boolean,
): Promise<ImportPlanItem | null> {
  const [species, variant] = selectedVariant.split('/');
  if (!species || !variant) return null;
  const asset = PIXEL_FORGE_VEGETATION_ASSETS.find((entry) => entry.id === species && entry.variant === variant);
  if (!asset) return null;

  const manifestEntry = manifest?.entries?.find((entry) => entry.kind === 'vegetation' && entry.id === species);
  const candidateVariant = manifestVariants(manifestEntry).find((entry) => asString(entry.variant) === variant);
  const candidateColor = resolvePixelForgePath(asString(candidateVariant?.imposter));
  const candidateNormal = resolvePixelForgePath(asString(candidateVariant?.imposterNormal));
  const candidateMeta = resolvePixelForgePath(asString(candidateVariant?.imposterMeta));
  const runtime = {
    color: join(process.cwd(), 'public/assets', asset.colorFile),
    normal: join(process.cwd(), 'public/assets', asset.normalFile),
    meta: join(process.cwd(), 'public/assets', asset.sourceMetaFile),
  };
  const candidateMetaInfo = readMeta(candidateMeta);
  const candidateColorInfo = await imageInfo(candidateColor);
  const candidateNormalInfo = await imageInfo(candidateNormal);
  const strongCyanStemPixels = species === 'bananaPlant'
    ? await countStrongCyanStemPixels(candidateColor)
    : null;
  const atlas = expectedAtlasSize(targetAtlasSize);
  const checks: ImportPlanItem['checks'] = [];

  checkStatus(
    checks,
    'candidate-files-present',
    candidateColor && candidateNormal && candidateMeta && existsSync(candidateColor) && existsSync(candidateNormal) && existsSync(candidateMeta) ? 'pass' : 'fail',
    'candidate color/normal/meta files must exist before any import',
  );
  checkStatus(
    checks,
    'runtime-destinations-present',
    existsSync(runtime.color) && existsSync(runtime.normal) && existsSync(runtime.meta) ? 'pass' : 'fail',
    'runtime color/normal/meta destination files must already exist so this remains a replacement-only import plan',
  );
  checkStatus(
    checks,
    'candidate-color-dimensions',
    candidateColorInfo?.width === atlas.width && candidateColorInfo?.height === atlas.height ? 'pass' : 'fail',
    `candidate color ${candidateColorInfo ? `${candidateColorInfo.width}x${candidateColorInfo.height}` : 'missing'} target ${targetAtlasSize ?? 'missing'}`,
  );
  checkStatus(
    checks,
    'candidate-normal-dimensions',
    candidateNormalInfo?.width === atlas.width && candidateNormalInfo?.height === atlas.height ? 'pass' : 'fail',
    `candidate normal ${candidateNormalInfo ? `${candidateNormalInfo.width}x${candidateNormalInfo.height}` : 'missing'} target ${targetAtlasSize ?? 'missing'}`,
  );
  checkStatus(
    checks,
    'candidate-meta-tile-size',
    candidateMetaInfo?.tileSize === targetTileSize ? 'pass' : 'fail',
    `candidate tileSize=${candidateMetaInfo?.tileSize ?? 'missing'} target=${targetTileSize ?? 'missing'}`,
  );
  checkStatus(
    checks,
    'candidate-meta-atlas-size',
    candidateMetaInfo?.atlasWidth === atlas.width && candidateMetaInfo?.atlasHeight === atlas.height ? 'pass' : 'fail',
    `candidate meta atlas=${candidateMetaInfo?.atlasWidth ?? 'missing'}x${candidateMetaInfo?.atlasHeight ?? 'missing'} target=${targetAtlasSize ?? 'missing'}`,
  );
  checkStatus(
    checks,
    'normal-contract',
    candidateMetaInfo?.auxLayers.includes('normal') === true && candidateMetaInfo.normalSpace === 'capture-view' ? 'pass' : 'fail',
    `candidate auxLayers=${candidateMetaInfo?.auxLayers.join(',') || 'missing'} normalSpace=${candidateMetaInfo?.normalSpace ?? 'missing'}`,
  );
  checkStatus(
    checks,
    'color-space-contract',
    candidateMetaInfo?.textureColorSpace === 'srgb' ? 'pass' : 'warn',
    `candidate textureColorSpace=${candidateMetaInfo?.textureColorSpace ?? 'missing'}`,
  );
  if (species === 'bananaPlant') {
    checkStatus(
      checks,
      'banana-stem-cyan-blue-guard',
      strongCyanStemPixels === 0 ? 'pass' : 'fail',
      `candidate strong cyan-blue opaque stem pixels=${strongCyanStemPixels ?? 'missing'}; expected 0 to avoid reintroducing the owner-reported blue stem`,
    );
  }

  const ready = checks.every((check) => check.status !== 'fail');
  let applied = false;
  if (apply && ownerAccepted && ready && candidateColor && candidateNormal && candidateMeta) {
    mkdirSync(dirname(runtime.color), { recursive: true });
    copyFileSync(candidateColor, runtime.color);
    copyFileSync(candidateNormal, runtime.normal);
    copyFileSync(candidateMeta, runtime.meta);
    applied = true;
  }

  return {
    species,
    variant,
    runtime: {
      color: rel(runtime.color) ?? runtime.color,
      normal: rel(runtime.normal) ?? runtime.normal,
      meta: rel(runtime.meta) ?? runtime.meta,
    },
    candidate: {
      color: candidateColor && existsSync(candidateColor) ? rel(candidateColor) : null,
      normal: candidateNormal && existsSync(candidateNormal) ? rel(candidateNormal) : null,
      meta: candidateMeta && existsSync(candidateMeta) ? rel(candidateMeta) : null,
    },
    candidateImage: {
      color: candidateColorInfo,
      normal: candidateNormalInfo,
    },
    candidateMeta: candidateMetaInfo,
    candidateQuality: {
      strongCyanStemPixels,
    },
    checks,
    applied,
  };
}

function summarizeStatus(items: ImportPlanItem[], expectedItems: number, apply: boolean, ownerAccepted: boolean): { status: CheckStatus; importState: ImportState } {
  if (expectedItems === 0 || items.length !== expectedItems) return { status: 'fail', importState: 'blocked' };
  if (apply && !ownerAccepted) return { status: 'fail', importState: 'blocked' };
  if (items.some((item) => item.checks.some((check) => check.status === 'fail'))) return { status: 'fail', importState: 'blocked' };
  if (items.some((item) => item.checks.some((check) => check.status === 'warn'))) return { status: 'warn', importState: apply ? 'applied' : 'dry_run_ready' };
  return { status: 'pass', importState: apply ? 'applied' : 'dry_run_ready' };
}

function writeMarkdown(report: ImportPlanReport, path: string): void {
  const lines = [
    '# Projekt 143 Vegetation Candidate Import Plan',
    '',
    `Generated: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Import state: ${report.importState}`,
    `Dry run: ${report.dryRun}`,
    `Owner accepted: ${report.ownerAccepted}`,
    '',
    '## Inputs',
    '',
    `- Candidate proof: ${report.inputs.candidateProof ?? 'missing'}`,
    `- Contact sheet: ${report.inputs.candidateContactSheet ?? 'missing'}`,
    `- Candidate manifest: ${report.inputs.candidateManifest ?? 'missing'}`,
    `- Target: ${report.target.atlasSize ?? 'unknown'} / tile ${report.target.tileSize ?? 'unknown'}`,
    '',
    '## Import Plan',
    '',
    '| Species | Runtime color | Runtime normal | Candidate color | Candidate normal | Checks |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.items.map((item) => {
      const checks = item.checks.map((check) => `${check.id}:${check.status}`).join('<br>');
      return `| ${item.species}/${item.variant} | ${item.runtime.color} | ${item.runtime.normal} | ${item.candidate.color ?? 'missing'} | ${item.candidate.normal ?? 'missing'} | ${checks} |`;
    }),
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Required Next Actions',
    '',
    ...report.requiredNextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const ownerAccepted = process.argv.includes('--owner-accepted');
  const files = walkFiles(ARTIFACT_ROOT);
  const candidateProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-candidate-proof', 'summary.json')));
  const candidateProof = readJson<CandidateProof>(candidateProofPath);
  const manifest = readJson<GalleryManifest>(CANDIDATE_MANIFEST);
  const selectedVariants = candidateProof?.target?.selectedVariants ?? [];
  const items = (await Promise.all(
    selectedVariants.map((variant) =>
      buildItem(
        variant,
        manifest,
        candidateProof?.target?.tileSize ?? null,
        candidateProof?.target?.atlasSize ?? null,
        apply,
        ownerAccepted,
      )
    ),
  )).filter((item): item is ImportPlanItem => Boolean(item));
  const readyItems = items.filter((item) => item.checks.every((check) => check.status !== 'fail')).length;
  const appliedItems = items.filter((item) => item.applied).length;
  const blockedItems = selectedVariants.length - readyItems;
  const { status, importState } = summarizeStatus(items, selectedVariants.length, apply, ownerAccepted);
  const cyanStemBlockedItem = items.find((item) => (item.candidateQuality.strongCyanStemPixels ?? 0) > 0);
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'import-plan.json');
  const markdownPath = join(outputDir, 'import-plan.md');

  const findings = [
    `${readyItems}/${selectedVariants.length} selected Pixel Forge vegetation candidates are replacement-ready by path, dimension, metadata, and normal-map contract.`,
    apply && ownerAccepted
      ? `${appliedItems}/${selectedVariants.length} candidate sets were copied into TIJ runtime asset paths.`
      : 'Dry run only: no TIJ runtime assets were copied or overwritten.',
    candidateProof?.status === 'pass'
      ? 'Latest candidate proof is PASS and provides the contact sheet for owner visual review.'
      : `Latest candidate proof is ${candidateProof?.status ?? 'missing'}, so import remains blocked.`,
    cyanStemBlockedItem
      ? `${cyanStemBlockedItem.species}/${cyanStemBlockedItem.variant} candidate is blocked: strong cyan-blue opaque stem pixels=${cyanStemBlockedItem.candidateQuality.strongCyanStemPixels}.`
      : 'Banana candidate cyan-blue stem guard is clear.',
  ];

  const report: ImportPlanReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    source: 'projekt-143-vegetation-candidate-import-plan',
    status,
    importState,
    dryRun: !apply,
    applyRequested: apply,
    ownerAccepted,
    inputs: {
      candidateProof: rel(candidateProofPath),
      candidateContactSheet: candidateProof?.files?.contactSheet ?? null,
      pixelForgeRoot: PIXEL_FORGE_ROOT,
      candidateManifest: existsSync(CANDIDATE_MANIFEST) ? rel(CANDIDATE_MANIFEST) : null,
    },
    target: {
      atlasSize: candidateProof?.target?.atlasSize ?? null,
      tileSize: candidateProof?.target?.tileSize ?? null,
      selectedVariants,
    },
    files: {
      report: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
    summary: {
      expectedItems: selectedVariants.length,
      readyItems,
      appliedItems,
      blockedItems,
      runtimeDestinations: items.flatMap((item) => [item.runtime.color, item.runtime.normal, item.runtime.meta]),
    },
    items,
    findings,
    requiredNextActions: importState === 'dry_run_ready'
      ? [
          'Owner must accept or reject the candidate contact sheet before any runtime import.',
          'If accepted, rerun with --apply --owner-accepted, then rerun texture audit, startup UI Open Frontier/Zone Control tables, Cycle 3 kickoff, and completion audit.',
        ]
      : importState === 'applied'
        ? [
            'Rerun texture audit and Pixel Forge cutover checks.',
            'Run quiet-machine Open Frontier/Zone Control startup before/after tables and visual proof before accepting KB-LOAD.',
          ]
        : [
            'Regenerate or repair Pixel Forge vegetation candidates, then rerun candidate proof and this import plan.',
          ],
    nonClaims: [
      'Dry-run PASS means import inputs are mechanically ready; it is not owner visual acceptance.',
      'This command does not prove in-game lighting, startup performance, or production parity.',
      'This command does not change runtime assets unless --apply and --owner-accepted are both supplied.',
    ],
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeMarkdown(report, markdownPath);

  console.log(`Projekt 143 vegetation candidate import plan ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`- importState=${importState}`);
  console.log(`- readyItems=${readyItems}/${selectedVariants.length}`);
  if (status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('projekt-143-vegetation-candidate-import-plan failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
