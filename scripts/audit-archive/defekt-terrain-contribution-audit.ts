#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface CategorySummary {
  category?: string;
  drawSubmissions?: number;
  drawShare?: number | null;
  triangles?: number;
  triangleShare?: number | null;
  instances?: number;
  instanceShare?: number | null;
  examples?: Array<{
    nameChain?: string | null;
    type?: string | null;
    materialType?: string | null;
    triangles?: number | null;
    instances?: number | null;
  }>;
}

interface RenderSubmissionPacket {
  sourceSummary?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    runtimeSamples?: number | null;
    runtimeRenderSubmissionSamples?: number | null;
  };
  peakSample?: {
    renderer?: {
      drawCalls?: number | null;
      triangles?: number | null;
    };
    rendererRenderUserTimingMaxMs?: number | null;
    webglTextureUploadMaxMs?: number | null;
    longAnimationFrameMaxMs?: number | null;
  } | null;
  frameSelection?: {
    exactPeakFrame?: boolean;
    frameCount?: number | null;
    totalDrawSubmissions?: number | null;
    totalTriangles?: number | null;
    categories?: CategorySummary[];
    topByDrawSubmissions?: CategorySummary | null;
    topByTriangles?: CategorySummary | null;
  };
  rendererReconciliation?: {
    drawSubmissionsToRendererDrawCalls?: number | null;
    selectedFrameTrianglesToRendererTriangles?: number | null;
  };
}

interface OwnerSplitAudit {
  status?: Status;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  postTag?: {
    topDrawCategory?: string | null;
    topDrawShare?: number | null;
    topTriangleCategory?: string | null;
    topTriangleShare?: number | null;
    drawReconciliation?: number | null;
    triangleReconciliation?: number | null;
  };
}

interface SourceAnchor {
  file: string;
  line: number | null;
  pattern: string;
  present: boolean;
}

interface Check {
  id: string;
  status: Status;
  value: string | number | boolean | null;
  threshold: string;
  message: string;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-defekt-terrain-contribution-audit';
  status: Status;
  inputs: {
    ownerSplitAudit: string;
    postTagSubmissionPacket: string;
  };
  classification: {
    owner: 'terrain_triangle_axis_source_bound_timing_unisolated' | 'terrain_triangle_axis_blocked';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only' | 'blocked';
  };
  checks: Check[];
  facts: {
    captureMeasurementTrust: string | null;
    exactPeakFrame: boolean;
    peakFrameCount: number | null;
    rendererRenderUserTimingMaxMs: number | null;
    peakRendererDrawCalls: number | null;
    peakRendererTriangles: number | null;
    totalDrawSubmissions: number | null;
    totalSubmissionTriangles: number | null;
    submissionTriangleReconciliation: number | null;
    drawSubmissionReconciliation: number | null;
    terrainDrawSubmissions: number;
    terrainDrawShare: number | null;
    terrainTriangles: number;
    terrainTriangleShare: number | null;
    terrainInstances: number;
    terrainInstancesPerSubmission: number | null;
    terrainTrianglesPerSubmission: number | null;
    terrainTrianglesPerInstance: number | null;
    terrainToPeakRendererTriangles: number | null;
    topDrawCategory: string | null;
    topTriangleCategory: string | null;
    passTypeCaptured: boolean;
    sourceAnchors: SourceAnchor[];
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-defekt-terrain-contribution-audit';
const DEFAULT_OWNER_SPLIT = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T22-49-28-445Z',
  'projekt-143-defekt-render-owner-split-audit',
  'render-owner-split-audit.json',
);
const DEFAULT_POST_TAG = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T17-28-02-506Z',
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function outputDir(): string {
  const raw = argValue('--out-dir');
  return raw ? resolve(raw) : join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function resolveExisting(raw: string, label: string): string {
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing ${label}: ${raw}`);
  return resolved;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function category(packet: RenderSubmissionPacket, name: string): CategorySummary {
  return packet.frameSelection?.categories?.find((entry) => entry.category === name) ?? {};
}

function sourceAnchor(file: string, pattern: RegExp, label: string): SourceAnchor {
  const abs = join(process.cwd(), file);
  if (!existsSync(abs)) {
    return { file, line: null, pattern: label, present: false };
  }
  const lines = readFileSync(abs, 'utf-8').split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return {
    file,
    line: index >= 0 ? index + 1 : null,
    pattern: label,
    present: index >= 0,
  };
}

function check(
  id: string,
  status: Status,
  value: string | number | boolean | null,
  threshold: string,
  message: string,
): Check {
  return { id, status, value, threshold, message };
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0) return null;
  return round(numerator / denominator);
}

function makeMarkdown(report: AuditReport): string {
  const lines = [
    '# DEFEKT-3 Terrain Contribution Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification.owner}`,
    '',
    '## Evidence',
    '',
    `Owner-split audit: ${report.inputs.ownerSplitAudit}`,
    `Post-tag submission packet: ${report.inputs.postTagSubmissionPacket}`,
    '',
    '## Terrain Axis',
    '',
    `Terrain draw submissions: ${report.facts.terrainDrawSubmissions}`,
    `Terrain draw share: ${report.facts.terrainDrawShare}`,
    `Terrain triangles: ${report.facts.terrainTriangles}`,
    `Terrain triangle share: ${report.facts.terrainTriangleShare}`,
    `Terrain-to-peak renderer triangles: ${report.facts.terrainToPeakRendererTriangles}`,
    `Terrain instances per submission: ${report.facts.terrainInstancesPerSubmission}`,
    `Terrain triangles per instance: ${report.facts.terrainTrianglesPerInstance}`,
    `Pass type captured: ${report.facts.passTypeCaptured}`,
    '',
    '## Source Anchors',
    '',
    ...report.facts.sourceAnchors.map((anchor) => `- ${anchor.file}:${anchor.line ?? 'n/a'} ${anchor.pattern} (${anchor.present ? 'present' : 'missing'})`),
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const ownerSplitPath = resolveExisting(argValue('--owner-split') ?? DEFAULT_OWNER_SPLIT, 'owner split audit');
  const postTagPath = resolveExisting(argValue('--post-tag') ?? DEFAULT_POST_TAG, 'post-tag submission packet');
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const ownerSplit = readJson<OwnerSplitAudit>(ownerSplitPath);
  const postTag = readJson<RenderSubmissionPacket>(postTagPath);
  const terrain = category(postTag, 'terrain');
  const terrainDraws = num(terrain.drawSubmissions);
  const terrainTriangles = num(terrain.triangles);
  const terrainInstances = num(terrain.instances);
  const terrainExamples = terrain.examples ?? [];
  const passTypeCaptured = terrainExamples.some((example) => 'renderPass' in example || 'passType' in example);
  const terrainInstancesPerSubmission = terrainDraws > 0 ? round(terrainInstances / terrainDraws, 2) : null;
  const terrainTrianglesPerSubmission = terrainDraws > 0 ? round(terrainTriangles / terrainDraws, 0) : null;
  const terrainTrianglesPerInstance = terrainInstances > 0 ? round(terrainTriangles / terrainInstances, 0) : null;
  const sourceAnchors = [
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /new THREE\.PlaneGeometry\(1,\s*1,\s*tileResolution - 1,\s*tileResolution - 1\)/, 'shared CDLOD tile grid uses tileResolution - 1 quads'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /new THREE\.InstancedMesh\(geo,\s*material,\s*maxInstances\)/, 'terrain is one InstancedMesh source path'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /this\.mesh\.name = 'CDLODTerrain'/, 'terrain mesh stable name feeds attribution'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /this\.mesh\.castShadow = true/, 'terrain casts shadow'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /this\.mesh\.receiveShadow = true/, 'terrain receives shadow'),
    sourceAnchor('src/systems/terrain/TerrainRenderRuntime.ts', /this\.renderer\.updateInstances\(tiles\)/, 'terrain draw instances come from CDLOD selected tiles'),
    sourceAnchor('src/systems/terrain/TerrainConfig.ts', /tileResolution: overrides\.tileResolution \?\? 33/, 'default tile resolution is 33 vertices per edge'),
    sourceAnchor('src/core/GameRenderer.ts', /this\.renderer\.shadowMap\.enabled = shouldEnableShadows\(\)/, 'renderer shadow map is device-adaptive'),
  ];

  const facts: AuditReport['facts'] = {
    captureMeasurementTrust: postTag.sourceSummary?.measurementTrust ?? null,
    exactPeakFrame: postTag.frameSelection?.exactPeakFrame === true,
    peakFrameCount: round(postTag.frameSelection?.frameCount, 0),
    rendererRenderUserTimingMaxMs: round(postTag.peakSample?.rendererRenderUserTimingMaxMs, 2),
    peakRendererDrawCalls: round(postTag.peakSample?.renderer?.drawCalls, 0),
    peakRendererTriangles: round(postTag.peakSample?.renderer?.triangles, 0),
    totalDrawSubmissions: round(postTag.frameSelection?.totalDrawSubmissions, 0),
    totalSubmissionTriangles: round(postTag.frameSelection?.totalTriangles, 0),
    submissionTriangleReconciliation: round(postTag.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles),
    drawSubmissionReconciliation: round(postTag.rendererReconciliation?.drawSubmissionsToRendererDrawCalls),
    terrainDrawSubmissions: terrainDraws,
    terrainDrawShare: round(terrain.drawShare),
    terrainTriangles,
    terrainTriangleShare: round(terrain.triangleShare),
    terrainInstances,
    terrainInstancesPerSubmission,
    terrainTrianglesPerSubmission,
    terrainTrianglesPerInstance,
    terrainToPeakRendererTriangles: ratio(terrainTriangles, postTag.peakSample?.renderer?.triangles),
    topDrawCategory: postTag.frameSelection?.topByDrawSubmissions?.category ?? null,
    topTriangleCategory: postTag.frameSelection?.topByTriangles?.category ?? null,
    passTypeCaptured,
    sourceAnchors,
  };

  const checks: Check[] = [
    check(
      'owner_split_accepted',
      ownerSplit.status === 'warn' && ownerSplit.classification?.acceptance === 'owner_review_only' ? 'pass' : 'fail',
      `${ownerSplit.status ?? 'unknown'}/${ownerSplit.classification?.acceptance ?? 'unknown'}`,
      'prior owner split is WARN owner_review_only',
      'The terrain audit must build on the accepted owner-review split, not on a failed packet.',
    ),
    check(
      'exact_peak_frame',
      facts.exactPeakFrame ? 'pass' : 'fail',
      facts.exactPeakFrame,
      'post-tag terrain facts come from exact peak frame',
      'Terrain contribution must be measured at the selected max-frame boundary.',
    ),
    check(
      'terrain_top_triangle_category',
      facts.topTriangleCategory === 'terrain' && (facts.terrainTriangleShare ?? 0) >= 0.5 ? 'pass' : 'fail',
      `${facts.topTriangleCategory ?? 'n/a'}@${facts.terrainTriangleShare ?? 'n/a'}`,
      'terrain is top triangle category and share >= 0.5',
      'Terrain triangle dominance is the isolated branch under review.',
    ),
    check(
      'terrain_low_draw_share',
      facts.terrainDrawSubmissions <= 2 && (facts.terrainDrawShare ?? 1) <= 0.05 ? 'pass' : 'fail',
      `${facts.terrainDrawSubmissions}@${facts.terrainDrawShare ?? 'n/a'}`,
      'terrain draw submissions <= 2 and draw share <= 0.05',
      'Terrain is not the top draw-submission owner in this packet.',
    ),
    check(
      'terrain_renderer_triangle_bound',
      (facts.terrainToPeakRendererTriangles ?? 0) >= 0.5 ? 'pass' : 'fail',
      facts.terrainToPeakRendererTriangles,
      'terrain submitted triangles account for >= 0.5 of peak renderer triangles',
      'The terrain branch is material enough to justify a bounded isolation packet.',
    ),
    check(
      'cdlod_source_anchors_present',
      sourceAnchors.every((anchor) => anchor.present) ? 'pass' : 'fail',
      `${sourceAnchors.filter((anchor) => anchor.present).length}/${sourceAnchors.length}`,
      'all source anchors present',
      'Terrain contribution must be bound to current source, not only artifact labels.',
    ),
    check(
      'terrain_tile_geometry_shape',
      facts.terrainTrianglesPerInstance === 2048 ? 'pass' : 'warn',
      facts.terrainTrianglesPerInstance,
      '33x33 tile grid yields 2048 triangles per active terrain instance',
      'The packet should expose whether triangle dominance follows the CDLOD tile grid shape.',
    ),
    check(
      'pass_type_uninstrumented',
      facts.passTypeCaptured ? 'pass' : 'warn',
      facts.passTypeCaptured,
      'render submission packet includes passType/renderPass metadata',
      'Current evidence cannot distinguish main terrain pass from shadow/depth pass.',
    ),
  ];

  const failed = checks.some((entry) => entry.status === 'fail');
  const reportPath = join(outDir, 'terrain-contribution-audit.json');
  const markdownPath = join(outDir, 'terrain-contribution-audit.md');
  const report: AuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: failed ? 'fail' : 'warn',
    inputs: {
      ownerSplitAudit: rel(ownerSplitPath),
      postTagSubmissionPacket: rel(postTagPath),
    },
    classification: {
      owner: failed ? 'terrain_triangle_axis_blocked' : 'terrain_triangle_axis_source_bound_timing_unisolated',
      confidence: failed ? 'low' : 'high',
      acceptance: failed ? 'blocked' : 'owner_review_only',
    },
    checks,
    facts,
    findings: [
      `The post-tag exact peak frame ${facts.peakFrameCount} records terrain as top triangle category at ${facts.terrainTriangleShare} share while top draw remains ${facts.topDrawCategory}.`,
      `Terrain records ${facts.terrainDrawSubmissions} draw submissions, ${facts.terrainTriangles} submitted triangles, ${facts.terrainInstances} submitted instances, and ${facts.terrainTrianglesPerInstance} triangles per terrain instance.`,
      `Terrain submitted triangles account for ${facts.terrainToPeakRendererTriangles} of peak renderer triangles, while draw-submission reconciliation remains ${facts.drawSubmissionReconciliation} and triangle reconciliation remains ${facts.submissionTriangleReconciliation}.`,
      'Source anchors bind the terrain path to one CDLOD InstancedMesh, selected-tile instance updates, default 33-vertex tile resolution, and device-adaptive shadow capability.',
      'Current render-submission evidence does not capture pass type, so the two terrain submissions cannot yet be separated into main, shadow, depth, or other render passes.',
    ],
    nextActions: [
      'Do not reduce terrain quality from this packet alone; it identifies a material triangle axis without per-pass timing.',
      'Next DEFEKT-3 terrain packet should add pass-aware render-submission metadata or run a controlled terrain-shadow/tile-resolution diagnostic against the same combat120 shape.',
      'Keep ground-marker/imposter draw batching and renderer-submission reconciliation as separate remaining axes; do not blend them into the terrain packet.',
      'Keep STABILIZAT-1 baseline refresh blocked until a standard or separately accepted capture clears compare gates.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove terrain is the full renderer.render stall owner.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize a terrain LOD, shadow, or visual-quality change.',
      'This packet does not certify combat or visual feel.',
      'This packet does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(reportPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DEFEKT-3 terrain contribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`terrainTriangles=${facts.terrainTriangleShare} terrainToRenderer=${facts.terrainToPeakRendererTriangles} passTypeCaptured=${facts.passTypeCaptured}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
