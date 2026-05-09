#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

type Status = 'pass' | 'warn' | 'fail';

interface ValidationCheck {
  id?: string;
  status?: string;
  value?: number | string | boolean | null;
  message?: string;
}

interface Summary {
  status?: string;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
  durationSeconds?: number;
  finalFrameCount?: number;
  runtimeSamples?: unknown[];
  perfRuntime?: {
    terrainShadowsDisabled?: boolean;
  };
}

interface CategorySummary {
  category?: string;
  drawSubmissions?: number;
  drawShare?: number | null;
  triangles?: number;
  triangleShare?: number | null;
  instances?: number;
  passTypes?: Record<string, number>;
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

interface VariantFacts {
  artifactDir: string;
  captureStatus: string | null;
  validation: string | null;
  measurementTrust: string | null;
  mode: string | null;
  durationSeconds: number | null;
  finalFrameCount: number | null;
  runtimeSamples: number | null;
  terrainShadowsDisabled: boolean;
  exactPeakFrame: boolean;
  peakFrameCount: number | null;
  avgFrameMs: number | null;
  peakP99FrameMs: number | null;
  peakMaxFrameMs: number | null;
  heapGrowthMb: number | null;
  heapRecoveryRatio: number | null;
  totalDrawSubmissions: number | null;
  totalTriangles: number | null;
  framePassTypes: Record<string, number>;
  terrainPassTypes: Record<string, number>;
  terrainDrawSubmissions: number;
  terrainTriangles: number;
  terrainTriangleShare: number | null;
  topDrawCategory: string | null;
  topTriangleCategory: string | null;
  drawReconciliation: number | null;
  triangleReconciliation: number | null;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-defekt-terrain-shadow-diagnostic-audit';
  status: Status;
  inputs: {
    controlPacket: string;
    shadowOffPacket: string;
  };
  classification: {
    owner:
      | 'terrain_shadow_contribution_isolated_timing_still_untrusted'
      | 'terrain_shadow_diagnostic_blocked';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only' | 'blocked';
  };
  checks: Check[];
  control: VariantFacts;
  shadowOff: VariantFacts;
  deltas: {
    terrainShadowSubmissions: number;
    terrainDrawSubmissions: number;
    terrainTriangles: number;
    terrainTriangleShare: number | null;
    totalDrawSubmissions: number | null;
    avgFrameMs: number | null;
    peakP99FrameMs: number | null;
    peakMaxFrameMs: number | null;
    drawReconciliation: number | null;
    triangleReconciliation: number | null;
  };
  sourceAnchors: SourceAnchor[];
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-defekt-terrain-shadow-diagnostic-audit';

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

function resolveExisting(raw: string | null, label: string): string {
  if (!raw) throw new Error(`Missing ${label}. Provide --${label}.`);
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

function delta(after: number | null | undefined, before: number | null | undefined): number | null {
  if (typeof after !== 'number' || typeof before !== 'number') return null;
  return round(after - before);
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

function category(packet: RenderSubmissionPacket, name: string): CategorySummary {
  return packet.frameSelection?.categories?.find((entry) => entry.category === name) ?? {};
}

function artifactDirFromPacket(packetPath: string): string {
  return dirname(dirname(packetPath));
}

function validationValue(summary: Summary, id: string): number | null {
  const value = summary.validation?.checks?.find((check) => check.id === id)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? round(value, 4) : null;
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

function buildVariant(packetPath: string): VariantFacts {
  const packet = readJson<RenderSubmissionPacket>(packetPath);
  const artifactDir = artifactDirFromPacket(packetPath);
  const summaryPath = join(artifactDir, 'summary.json');
  const summary = existsSync(summaryPath) ? readJson<Summary>(summaryPath) : {};
  const terrain = category(packet, 'terrain');
  return {
    artifactDir: rel(artifactDir),
    captureStatus: packet.sourceSummary?.captureStatus ?? summary.status ?? null,
    validation: packet.sourceSummary?.validation ?? summary.validation?.overall ?? null,
    measurementTrust: packet.sourceSummary?.measurementTrust ?? summary.measurementTrust?.status ?? null,
    mode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
    durationSeconds: round(summary.durationSeconds, 0),
    finalFrameCount: round(summary.finalFrameCount, 0),
    runtimeSamples: round(packet.sourceSummary?.runtimeSamples ?? (Array.isArray(summary.runtimeSamples) ? summary.runtimeSamples.length : undefined), 0),
    terrainShadowsDisabled: summary.perfRuntime?.terrainShadowsDisabled === true,
    exactPeakFrame: packet.frameSelection?.exactPeakFrame === true,
    peakFrameCount: round(packet.frameSelection?.frameCount, 0),
    avgFrameMs: validationValue(summary, 'avg_frame_ms'),
    peakP99FrameMs: validationValue(summary, 'peak_p99_frame_ms'),
    peakMaxFrameMs: validationValue(summary, 'peak_max_frame_ms'),
    heapGrowthMb: validationValue(summary, 'heap_growth_mb'),
    heapRecoveryRatio: validationValue(summary, 'heap_recovery_ratio'),
    totalDrawSubmissions: round(packet.frameSelection?.totalDrawSubmissions, 0),
    totalTriangles: round(packet.frameSelection?.totalTriangles, 0),
    framePassTypes: passTypes(packet.frameSelection?.passTypes),
    terrainPassTypes: passTypes(terrain.passTypes),
    terrainDrawSubmissions: num(terrain.drawSubmissions),
    terrainTriangles: num(terrain.triangles),
    terrainTriangleShare: round(terrain.triangleShare),
    topDrawCategory: packet.frameSelection?.topByDrawSubmissions?.category ?? null,
    topTriangleCategory: packet.frameSelection?.topByTriangles?.category ?? null,
    drawReconciliation: round(packet.rendererReconciliation?.drawSubmissionsToRendererDrawCalls),
    triangleReconciliation: round(packet.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles),
  };
}

function makeMarkdown(report: AuditReport): string {
  const lines = [
    '# DEFEKT-3 Terrain Shadow Diagnostic Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification.owner}`,
    '',
    '## Evidence',
    '',
    `Control packet: ${report.inputs.controlPacket}`,
    `Shadow-off packet: ${report.inputs.shadowOffPacket}`,
    '',
    '## Pass Split',
    '',
    `Control terrain pass types: ${passTypeLabel(report.control.terrainPassTypes)}`,
    `Shadow-off terrain pass types: ${passTypeLabel(report.shadowOff.terrainPassTypes)}`,
    `Terrain shadow submission delta: ${report.deltas.terrainShadowSubmissions}`,
    `Terrain draw submission delta: ${report.deltas.terrainDrawSubmissions}`,
    `Terrain triangle-share delta: ${report.deltas.terrainTriangleShare}`,
    '',
    '## Performance Deltas',
    '',
    `Avg frame delta: ${report.deltas.avgFrameMs}`,
    `P99 frame delta: ${report.deltas.peakP99FrameMs}`,
    `Max frame delta: ${report.deltas.peakMaxFrameMs}`,
    `Draw reconciliation delta: ${report.deltas.drawReconciliation}`,
    `Triangle reconciliation delta: ${report.deltas.triangleReconciliation}`,
    '',
    '## Source Anchors',
    '',
    ...report.sourceAnchors.map((anchor) => `- ${anchor.file}:${anchor.line ?? 'n/a'} ${anchor.pattern} (${anchor.present ? 'present' : 'missing'})`),
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
  const controlPacketPath = resolveExisting(argValue('--control-packet'), 'control-packet');
  const shadowOffPacketPath = resolveExisting(argValue('--shadow-off-packet'), 'shadow-off-packet');
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const control = buildVariant(controlPacketPath);
  const shadowOff = buildVariant(shadowOffPacketPath);
  const sourceAnchors = [
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /perfDisableTerrainShadows/, 'terrain shadow isolation query flag is source-anchored'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /this\.mesh\.castShadow = !isTerrainShadowPerfIsolationEnabled\(\)/, 'terrain castShadow is gated by the diagnostic flag'),
    sourceAnchor('src/systems/terrain/CDLODRenderer.ts', /this\.mesh\.receiveShadow = true/, 'terrain continues to receive shadows under isolation'),
    sourceAnchor('scripts/perf-capture.ts', /--disable-terrain-shadows/, 'perf capture exposes terrain-shadow diagnostic flag'),
    sourceAnchor('scripts/perf-capture.ts', /perfDisableTerrainShadows=1/, 'perf capture passes terrain-shadow query flag into runtime'),
    sourceAnchor('scripts/perf-capture.ts', /terrainShadowsDisabled: disableTerrainShadows/, 'summary records terrain-shadow diagnostic state'),
  ];

  const checks = [
    check(
      'control_shape_shadow_enabled',
      !control.terrainShadowsDisabled && num(control.terrainPassTypes.shadow) > 0 ? 'pass' : 'fail',
      `disabled=${control.terrainShadowsDisabled} terrainPassTypes=${passTypeLabel(control.terrainPassTypes)}`,
      'control terrain shadow pass count > 0 and diagnostic flag false',
      'The diagnostic requires a valid terrain-shadow control packet.',
    ),
    check(
      'shadow_off_runtime_flag_recorded',
      shadowOff.terrainShadowsDisabled ? 'pass' : 'fail',
      shadowOff.terrainShadowsDisabled,
      'shadow-off summary records terrainShadowsDisabled=true',
      'The runtime capture must prove it actually used the terrain-shadow isolation flag.',
    ),
    check(
      'shadow_off_terrain_shadow_removed',
      num(shadowOff.terrainPassTypes.shadow) === 0 ? 'pass' : 'fail',
      passTypeLabel(shadowOff.terrainPassTypes),
      'shadow-off terrain shadow pass count is zero',
      'The controlled diagnostic must remove the terrain shadow submission from attribution.',
    ),
    check(
      'shadow_off_main_terrain_preserved',
      num(shadowOff.terrainPassTypes.main) > 0 ? 'pass' : 'fail',
      passTypeLabel(shadowOff.terrainPassTypes),
      'shadow-off terrain main pass count remains > 0',
      'The diagnostic must isolate shadow casting without removing the terrain main draw.',
    ),
    check(
      'same_capture_shape',
      control.mode === shadowOff.mode
        && control.durationSeconds === shadowOff.durationSeconds
        && control.runtimeSamples === shadowOff.runtimeSamples
        ? 'pass'
        : 'warn',
      `${control.mode}/${shadowOff.mode}; ${control.durationSeconds}/${shadowOff.durationSeconds}; samples ${control.runtimeSamples}/${shadowOff.runtimeSamples}`,
      'mode, duration, and runtime sample count match',
      'Different shapes remain owner-review evidence only and cannot support baseline decisions.',
    ),
    check(
      'exact_frames_present',
      control.exactPeakFrame && shadowOff.exactPeakFrame ? 'pass' : 'fail',
      `${control.exactPeakFrame}/${shadowOff.exactPeakFrame}`,
      'both packets select exact peak frames',
      'Terrain-shadow contribution must be measured at exact peak-frame boundaries.',
    ),
    check(
      'source_anchors_present',
      sourceAnchors.every((anchor) => anchor.present) ? 'pass' : 'fail',
      `${sourceAnchors.filter((anchor) => anchor.present).length}/${sourceAnchors.length}`,
      'all diagnostic source anchors present',
      'The packet must bind the control to current source, not only artifact labels.',
    ),
  ] satisfies Check[];

  const failed = checks.some((entry) => entry.status === 'fail');
  const reportPath = join(outDir, 'terrain-shadow-diagnostic-audit.json');
  const markdownPath = join(outDir, 'terrain-shadow-diagnostic-audit.md');
  const report: AuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: failed ? 'fail' : 'warn',
    inputs: {
      controlPacket: rel(controlPacketPath),
      shadowOffPacket: rel(shadowOffPacketPath),
    },
    classification: {
      owner: failed ? 'terrain_shadow_diagnostic_blocked' : 'terrain_shadow_contribution_isolated_timing_still_untrusted',
      confidence: failed ? 'low' : 'high',
      acceptance: failed ? 'blocked' : 'owner_review_only',
    },
    checks,
    control,
    shadowOff,
    deltas: {
      terrainShadowSubmissions: num(shadowOff.terrainPassTypes.shadow) - num(control.terrainPassTypes.shadow),
      terrainDrawSubmissions: shadowOff.terrainDrawSubmissions - control.terrainDrawSubmissions,
      terrainTriangles: shadowOff.terrainTriangles - control.terrainTriangles,
      terrainTriangleShare: delta(shadowOff.terrainTriangleShare, control.terrainTriangleShare),
      totalDrawSubmissions: delta(shadowOff.totalDrawSubmissions, control.totalDrawSubmissions),
      avgFrameMs: delta(shadowOff.avgFrameMs, control.avgFrameMs),
      peakP99FrameMs: delta(shadowOff.peakP99FrameMs, control.peakP99FrameMs),
      peakMaxFrameMs: delta(shadowOff.peakMaxFrameMs, control.peakMaxFrameMs),
      drawReconciliation: delta(shadowOff.drawReconciliation, control.drawReconciliation),
      triangleReconciliation: delta(shadowOff.triangleReconciliation, control.triangleReconciliation),
    },
    sourceAnchors,
    findings: [
      `Control terrain pass types are ${passTypeLabel(control.terrainPassTypes)}; shadow-off terrain pass types are ${passTypeLabel(shadowOff.terrainPassTypes)}.`,
      `The diagnostic moves terrain draw submissions ${control.terrainDrawSubmissions} -> ${shadowOff.terrainDrawSubmissions}, terrain triangle share ${control.terrainTriangleShare} -> ${shadowOff.terrainTriangleShare}, and total draw submissions ${control.totalDrawSubmissions ?? 'n/a'} -> ${shadowOff.totalDrawSubmissions ?? 'n/a'}.`,
      `Frame metrics move avg ${control.avgFrameMs ?? 'n/a'}ms -> ${shadowOff.avgFrameMs ?? 'n/a'}ms, p99 ${control.peakP99FrameMs ?? 'n/a'}ms -> ${shadowOff.peakP99FrameMs ?? 'n/a'}ms, and max ${control.peakMaxFrameMs ?? 'n/a'}ms -> ${shadowOff.peakMaxFrameMs ?? 'n/a'}ms.`,
      `Measurement trust remains control=${control.measurementTrust ?? 'unknown'} and shadow-off=${shadowOff.measurementTrust ?? 'unknown'}, so this is owner-review evidence only.`,
      'Source anchors prove the runtime flag only gates CDLOD terrain shadow casting and leaves terrain shadow receiving intact.',
    ],
    nextActions: [
      'Keep DEFEKT-3 open; terrain-shadow isolation removes the terrain shadow submission but does not provide per-pass timing or baseline-grade trust.',
      'If the shadow-off packet materially improves the max-frame path, prepare a visual-quality review before considering any shadow policy change.',
      'If the shadow-off packet does not materially improve the max-frame path, move the terrain branch to tile-resolution or terrain material cost isolation under the same combat120 shape.',
      'Keep ground-marker/imposter draw batching and renderer-submission reconciliation as separate DEFEKT-3 axes.',
      'Keep STABILIZAT-1 baseline refresh blocked until standard compare gates pass or receive separate owner-review acceptance.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize disabling terrain shadows in production.',
      'This packet does not certify visual or combat feel.',
      'This packet does not supersede the measurement-PASS owner packet for regression comparison.',
      'This packet does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(reportPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DEFEKT-3 terrain shadow diagnostic ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`controlTerrain=${passTypeLabel(control.terrainPassTypes)} shadowOffTerrain=${passTypeLabel(shadowOff.terrainPassTypes)} p99Delta=${report.deltas.peakP99FrameMs ?? 'n/a'} maxDelta=${report.deltas.peakMaxFrameMs ?? 'n/a'}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
