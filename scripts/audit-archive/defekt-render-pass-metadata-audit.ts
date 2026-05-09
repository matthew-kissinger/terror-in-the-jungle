#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
  passTypes?: Record<string, number>;
  examples?: Array<{
    nameChain?: string | null;
    type?: string | null;
    materialType?: string | null;
    passType?: string | null;
    triangles?: number | null;
    instances?: number | null;
  }>;
}

interface RenderSubmissionPacket {
  status?: Status;
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
  } | null;
  frameSelection?: {
    exactPeakFrame?: boolean;
    frameCount?: number | null;
    totalDrawSubmissions?: number | null;
    totalTriangles?: number | null;
    passTypes?: Record<string, number>;
    categories?: CategorySummary[];
    topByDrawSubmissions?: CategorySummary | null;
    topByTriangles?: CategorySummary | null;
  };
  rendererReconciliation?: {
    drawSubmissionsToRendererDrawCalls?: number | null;
    selectedFrameTrianglesToRendererTriangles?: number | null;
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
  mode: 'projekt-143-defekt-render-pass-metadata-audit';
  status: Status;
  inputs: {
    passAwareSubmissionPacket: string;
  };
  classification: {
    owner:
      | 'render_pass_metadata_bound_timing_unisolated'
      | 'render_pass_metadata_blocked';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only' | 'blocked';
  };
  checks: Check[];
  facts: {
    captureStatus: string | null;
    captureValidation: string | null;
    measurementTrust: string | null;
    exactPeakFrame: boolean;
    peakFrameCount: number | null;
    peakRendererDrawCalls: number | null;
    peakRendererTriangles: number | null;
    rendererRenderUserTimingMaxMs: number | null;
    totalDrawSubmissions: number | null;
    totalTriangles: number | null;
    drawSubmissionReconciliation: number | null;
    triangleReconciliation: number | null;
    framePassTypes: Record<string, number>;
    terrainPassTypes: Record<string, number>;
    terrainMainSubmissions: number;
    terrainShadowSubmissions: number;
    terrainDrawSubmissions: number;
    terrainDrawShare: number | null;
    terrainTriangles: number;
    terrainTriangleShare: number | null;
    terrainInstances: number;
    topDrawCategory: string | null;
    topTriangleCategory: string | null;
    terrainExamplePassTypes: string[];
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

const OUTPUT_NAME = 'projekt-143-defekt-render-pass-metadata-audit';
const PACKET_DIR = 'projekt-143-render-submission-category-attribution';
const PACKET_NAME = 'render-submission-category-attribution.json';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string | null): string | null {
  if (!path) return null;
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

function passTypes(value: Record<string, number> | null | undefined): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[0] === 'string' && Number.isFinite(entry[1]))
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function passTypeLabel(value: Record<string, number> | null | undefined): string {
  const entries = Object.entries(passTypes(value));
  if (entries.length === 0) return 'n/a';
  return entries.map(([name, count]) => `${name}:${count}`).join(', ');
}

function passTypeTotal(value: Record<string, number> | null | undefined): number {
  return Object.values(passTypes(value)).reduce((sum, count) => sum + count, 0);
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

function latestPacket(): string {
  const artifactRoot = join(process.cwd(), 'artifacts', 'perf');
  if (!existsSync(artifactRoot)) throw new Error('Missing artifacts/perf root.');
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packetPath = join(artifactRoot, entry.name, PACKET_DIR, PACKET_NAME);
    if (!existsSync(packetPath)) continue;
    candidates.push({ path: packetPath, mtimeMs: statSync(packetPath).mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates[0]) throw new Error(`No ${PACKET_NAME} packet found under artifacts/perf.`);
  return candidates[0].path;
}

function packetPath(): string {
  const raw = argValue('--packet') ?? latestPacket();
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing pass-aware submission packet: ${raw}`);
  return resolved;
}

function makeMarkdown(report: AuditReport): string {
  const lines = [
    '# DEFEKT-3 Render Pass Metadata Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification.owner}`,
    '',
    '## Evidence',
    '',
    `Pass-aware submission packet: ${report.inputs.passAwareSubmissionPacket}`,
    '',
    '## Pass Split',
    '',
    `Frame pass types: ${passTypeLabel(report.facts.framePassTypes)}`,
    `Terrain pass types: ${passTypeLabel(report.facts.terrainPassTypes)}`,
    `Terrain draw submissions: ${report.facts.terrainDrawSubmissions}`,
    `Terrain triangle share: ${report.facts.terrainTriangleShare}`,
    `Terrain examples: ${report.facts.terrainExamplePassTypes.join(', ') || 'n/a'}`,
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
  const packet = packetPath();
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const submissionPacket = readJson<RenderSubmissionPacket>(packet);
  const terrain = category(submissionPacket, 'terrain');
  const framePassTypes = passTypes(submissionPacket.frameSelection?.passTypes);
  const terrainPassTypes = passTypes(terrain.passTypes);
  const terrainExamplePassTypes = Array.from(
    new Set((terrain.examples ?? []).map((example) => example.passType).filter((value): value is string => typeof value === 'string' && value.length > 0)),
  ).sort((a, b) => a.localeCompare(b));

  const sourceAnchors = [
    sourceAnchor('scripts/projekt-143-scene-attribution.ts', /passTypes: serializePassTypes\(frame\.passTypes\)/, 'frame passTypes serialized'),
    sourceAnchor('scripts/projekt-143-scene-attribution.ts', /state\.record\(this, geometry, material, group, 'main'\)/, 'main render pass recorded'),
    sourceAnchor('scripts/projekt-143-scene-attribution.ts', /object\.onBeforeShadow = function/, 'shadow render callback wrapped'),
    sourceAnchor('scripts/projekt-143-scene-attribution.ts', /state\.record\(this, geometry, material, group, 'shadow'\)/, 'shadow render pass recorded'),
    sourceAnchor('scripts/projekt-143-render-submission-category-attribution.ts', /passTypeLabel\(category\.passTypes\)/, 'packet markdown exposes category pass types'),
    sourceAnchor('node_modules/three/src/renderers/webgl/WebGLShadowMap.js', /object\.onBeforeShadow/, 'Three shadow renderer invokes onBeforeShadow'),
  ];

  const facts: AuditReport['facts'] = {
    captureStatus: submissionPacket.sourceSummary?.captureStatus ?? null,
    captureValidation: submissionPacket.sourceSummary?.validation ?? null,
    measurementTrust: submissionPacket.sourceSummary?.measurementTrust ?? null,
    exactPeakFrame: submissionPacket.frameSelection?.exactPeakFrame === true,
    peakFrameCount: round(submissionPacket.frameSelection?.frameCount, 0),
    peakRendererDrawCalls: round(submissionPacket.peakSample?.renderer?.drawCalls, 0),
    peakRendererTriangles: round(submissionPacket.peakSample?.renderer?.triangles, 0),
    rendererRenderUserTimingMaxMs: round(submissionPacket.peakSample?.rendererRenderUserTimingMaxMs, 2),
    totalDrawSubmissions: round(submissionPacket.frameSelection?.totalDrawSubmissions, 0),
    totalTriangles: round(submissionPacket.frameSelection?.totalTriangles, 0),
    drawSubmissionReconciliation: round(submissionPacket.rendererReconciliation?.drawSubmissionsToRendererDrawCalls),
    triangleReconciliation: round(submissionPacket.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles),
    framePassTypes,
    terrainPassTypes,
    terrainMainSubmissions: num(terrainPassTypes.main),
    terrainShadowSubmissions: num(terrainPassTypes.shadow),
    terrainDrawSubmissions: num(terrain.drawSubmissions),
    terrainDrawShare: round(terrain.drawShare),
    terrainTriangles: num(terrain.triangles),
    terrainTriangleShare: round(terrain.triangleShare),
    terrainInstances: num(terrain.instances),
    topDrawCategory: submissionPacket.frameSelection?.topByDrawSubmissions?.category ?? null,
    topTriangleCategory: submissionPacket.frameSelection?.topByTriangles?.category ?? null,
    terrainExamplePassTypes,
    sourceAnchors,
  };

  const checks: Check[] = [
    check(
      'submission_packet_usable_for_owner_review',
      submissionPacket.sourceSummary?.captureStatus === 'ok'
        && num(submissionPacket.sourceSummary?.runtimeRenderSubmissionSamples) > 0
        ? 'pass'
        : 'fail',
      `${submissionPacket.status ?? 'unknown'}/${submissionPacket.sourceSummary?.captureStatus ?? 'unknown'}/${submissionPacket.sourceSummary?.measurementTrust ?? 'unknown'}`,
      'capture status ok with at least one render-submission sample',
      'The pass audit may use WARN-trust packet data for owner review only, but not for baseline refresh or completion claims.',
    ),
    check(
      'exact_peak_frame',
      facts.exactPeakFrame ? 'pass' : 'fail',
      facts.exactPeakFrame,
      'pass metadata comes from exact peak frame',
      'Pass split evidence must stay bound to the selected max-frame boundary.',
    ),
    check(
      'frame_pass_types_present',
      passTypeTotal(facts.framePassTypes) > 0 ? 'pass' : 'fail',
      passTypeLabel(facts.framePassTypes),
      'selected frame includes passTypes totals',
      'The tracker must emit pass-level metadata into the render-submission packet.',
    ),
    check(
      'terrain_pass_types_present',
      passTypeTotal(facts.terrainPassTypes) > 0 ? 'pass' : 'fail',
      passTypeLabel(facts.terrainPassTypes),
      'terrain category includes passTypes totals',
      'The terrain branch must be split by pass before terrain quality changes are considered.',
    ),
    check(
      'terrain_shadow_pass_visible',
      facts.terrainShadowSubmissions > 0 ? 'pass' : 'warn',
      facts.terrainShadowSubmissions,
      'terrain shadow submissions > 0 when shadow path contributes',
      'A zero value means this packet captured main-pass metadata but did not isolate a terrain shadow contribution.',
    ),
    check(
      'terrain_top_triangle_category',
      facts.topTriangleCategory === 'terrain' && (facts.terrainTriangleShare ?? 0) >= 0.5 ? 'pass' : 'fail',
      `${facts.topTriangleCategory ?? 'n/a'}@${facts.terrainTriangleShare ?? 'n/a'}`,
      'terrain remains top triangle category and share >= 0.5',
      'Pass metadata must preserve the same terrain branch under DEFEKT-3 review.',
    ),
    check(
      'source_anchors_present',
      sourceAnchors.every((anchor) => anchor.present) ? 'pass' : 'fail',
      `${sourceAnchors.filter((anchor) => anchor.present).length}/${sourceAnchors.length}`,
      'all source anchors present',
      'The audit must bind packet facts to current tracker and Three shadow callback behavior.',
    ),
  ];

  const failed = checks.some((entry) => entry.status === 'fail');
  const reportPath = join(outDir, 'pass-metadata-audit.json');
  const markdownPath = join(outDir, 'pass-metadata-audit.md');
  const report: AuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: failed ? 'fail' : 'warn',
    inputs: {
      passAwareSubmissionPacket: rel(packet) ?? packet,
    },
    classification: {
      owner: failed ? 'render_pass_metadata_blocked' : 'render_pass_metadata_bound_timing_unisolated',
      confidence: failed ? 'low' : facts.terrainShadowSubmissions > 0 ? 'high' : 'medium',
      acceptance: failed ? 'blocked' : 'owner_review_only',
    },
    checks,
    facts,
    findings: [
      `The selected peak frame ${facts.peakFrameCount ?? 'n/a'} records frame pass types ${passTypeLabel(facts.framePassTypes)}.`,
      `Terrain records pass types ${passTypeLabel(facts.terrainPassTypes)}, ${facts.terrainDrawSubmissions} draw submissions, ${facts.terrainTriangles} submitted triangles, and ${facts.terrainTriangleShare} triangle share.`,
      `Terrain examples expose pass labels ${facts.terrainExamplePassTypes.join(', ') || 'n/a'} while top draw remains ${facts.topDrawCategory ?? 'n/a'} and top triangles remain ${facts.topTriangleCategory ?? 'n/a'}.`,
      `Renderer reconciliation remains draw=${facts.drawSubmissionReconciliation ?? 'n/a'} and triangles=${facts.triangleReconciliation ?? 'n/a'}; pass metadata does not by itself turn category counts into per-pass timing.`,
      'Source anchors bind the metadata to main render callbacks, Three shadow callbacks, packet serialization, and packet markdown exposure.',
    ],
    nextActions: [
      'Keep DEFEKT-3 open; this packet resolves the missing pass label, not the renderer.render stall owner.',
      'Use the pass split to decide whether the next terrain diagnostic disables terrain shadows, lowers only shadow terrain resolution, or isolates tile resolution under the same combat120 shape.',
      'Keep ground-marker/imposter draw batching and renderer-submission reconciliation as separate DEFEKT-3 axes.',
      'Keep STABILIZAT-1 baseline refresh blocked until standard compare gates pass or receive separate owner-review acceptance.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove terrain is the full renderer.render stall owner.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize terrain LOD, shadow, or visual-quality changes.',
      'This packet does not certify combat or visual feel.',
      'This packet does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DEFEKT-3 render pass metadata ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`framePassTypes=${passTypeLabel(facts.framePassTypes)} terrainPassTypes=${passTypeLabel(facts.terrainPassTypes)}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
