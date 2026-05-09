#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface ValidationCheck {
  id?: string;
  status?: string;
  value?: number | string | null;
  message?: string;
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  status?: string;
  failureReason?: string;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  harnessOverhead?: {
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    sampleCount?: number;
    sampleIntervalMs?: number;
    detailEverySamples?: number;
  };
  measurementTrust?: MeasurementTrust;
}

interface MeasurementTrust {
  status?: string;
  probeRoundTripAvgMs?: number;
  probeRoundTripP95Ms?: number;
  probeRoundTripMaxMs?: number;
  probeRoundTripSamplesMs?: number[];
  sampleCount?: number;
  missedSamples?: number;
  missedSampleRate?: number;
  sampleIntervalMs?: number;
  detailEverySamples?: number;
}

interface ProbeStats {
  rawPresent: boolean;
  count: number;
  minMs: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  avgMs: number | null;
  over25Count: number | null;
  over75Count: number | null;
  over150Count: number | null;
  avgWithoutMaxMs: number | null;
}

interface ArtifactFacts {
  artifactDir: string;
  captureStatus: string | null;
  failureReason: string | null;
  validation: string | null;
  measurementTrust: string | null;
  runtimeSamples: number;
  renderSubmissionSamples: number;
  renderSubmissionBytes: number;
  finalFrameCount: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  sampleIntervalMs: number | null;
  detailEverySamples: number | null;
  probe: ProbeStats;
}

interface InspectionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-measurement-path-inspection';
  status: Status;
  inputs: {
    targetArtifact: string;
    referenceArtifacts: string[];
  };
  target: ArtifactFacts;
  references: ArtifactFacts[];
  classification: {
    owner:
      | 'per_sample_render_submission_probe_overhead_captured'
      | 'measurement_probe_raw_series_missing'
      | 'measurement_path_acceptable';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'diagnostic_only';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-measurement-path-inspection';
const DEFAULT_TARGET = join(process.cwd(), 'artifacts', 'perf', '2026-05-07T17-19-54-240Z');
const DEFAULT_REFERENCES = [
  join(process.cwd(), 'artifacts', 'perf', '2026-05-07T16-23-11-889Z'),
  join(process.cwd(), 'artifacts', 'perf', '2026-05-07T17-03-50-248Z'),
  join(process.cwd(), 'artifacts', 'perf', '2026-05-07T17-11-26-382Z'),
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function argValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg?.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else if (arg === name && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1] ?? '');
      i += 1;
    }
  }
  return values.filter(Boolean);
}

function artifactArg(): string {
  const raw = argValue('--artifact') ?? DEFAULT_TARGET;
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${raw}`);
  return resolved;
}

function referenceArgs(): string[] {
  const raw = argValues('--reference');
  const refs = raw.length > 0 ? raw : DEFAULT_REFERENCES;
  return refs.map((entry) => {
    const resolved = resolve(entry);
    if (!existsSync(resolved)) throw new Error(`Missing reference artifact directory: ${entry}`);
    return resolved;
  });
}

function checkValue(summary: Summary, id: string): number | null {
  const check = summary.validation?.checks?.find((entry) => entry.id === id);
  return typeof check?.value === 'number' ? check.value : null;
}

function countJsonArray(path: string): number {
  if (!existsSync(path)) return 0;
  const parsed = readJson<unknown>(path);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function fileBytes(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] ?? null;
}

function probeStats(measurement: MeasurementTrust): ProbeStats {
  const raw = Array.isArray(measurement.probeRoundTripSamplesMs)
    ? measurement.probeRoundTripSamplesMs.filter((value) => Number.isFinite(value))
    : [];
  if (raw.length === 0) {
    const avg = round(measurement.probeRoundTripAvgMs);
    const max = round(measurement.probeRoundTripMaxMs);
    const count = Math.max(0, Math.trunc(measurement.sampleCount ?? 0));
    const avgWithoutMax = avg !== null && max !== null && count > 1
      ? ((avg * count) - max) / (count - 1)
      : null;
    return {
      rawPresent: false,
      count,
      minMs: null,
      p50Ms: null,
      p90Ms: null,
      p95Ms: round(measurement.probeRoundTripP95Ms),
      maxMs: max,
      avgMs: avg,
      over25Count: null,
      over75Count: null,
      over150Count: null,
      avgWithoutMaxMs: round(avgWithoutMax),
    };
  }

  const sorted = [...raw].sort((a, b) => a - b);
  const sum = raw.reduce((total, value) => total + value, 0);
  const max = sorted[sorted.length - 1] ?? null;
  const avgWithoutMax = max !== null && raw.length > 1
    ? (sum - max) / (raw.length - 1)
    : null;
  return {
    rawPresent: true,
    count: raw.length,
    minMs: round(sorted[0]),
    p50Ms: round(percentile(sorted, 0.5)),
    p90Ms: round(percentile(sorted, 0.9)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(max),
    avgMs: round(sum / raw.length),
    over25Count: raw.filter((value) => value > 25).length,
    over75Count: raw.filter((value) => value > 75).length,
    over150Count: raw.filter((value) => value > 150).length,
    avgWithoutMaxMs: round(avgWithoutMax),
  };
}

function artifactFacts(artifactDir: string): ArtifactFacts {
  const summaryPath = join(artifactDir, 'summary.json');
  const measurementPath = join(artifactDir, 'measurement-trust.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${summaryPath}`);
  if (!existsSync(measurementPath)) throw new Error(`Missing measurement trust: ${measurementPath}`);
  const summary = readJson<Summary>(summaryPath);
  const measurement = readJson<MeasurementTrust>(measurementPath);
  const renderSubmissionPath = join(artifactDir, 'runtime-render-submission-samples.json');
  return {
    artifactDir: rel(artifactDir),
    captureStatus: summary.status ?? null,
    failureReason: summary.failureReason ?? null,
    validation: summary.validation?.overall ?? null,
    measurementTrust: measurement.status ?? summary.measurementTrust?.status ?? null,
    runtimeSamples: countJsonArray(join(artifactDir, 'runtime-samples.json')),
    renderSubmissionSamples: countJsonArray(renderSubmissionPath),
    renderSubmissionBytes: fileBytes(renderSubmissionPath),
    finalFrameCount: typeof summary.finalFrameCount === 'number' ? summary.finalFrameCount : null,
    avgFrameMs: round(checkValue(summary, 'avg_frame_ms')),
    p99FrameMs: round(checkValue(summary, 'peak_p99_frame_ms')),
    maxFrameMs: round(checkValue(summary, 'peak_max_frame_ms')),
    sampleIntervalMs: measurement.sampleIntervalMs ?? summary.harnessOverhead?.sampleIntervalMs ?? null,
    detailEverySamples: measurement.detailEverySamples ?? summary.harnessOverhead?.detailEverySamples ?? null,
    probe: probeStats(measurement),
  };
}

function buildReport(targetDir: string, referenceDirs: string[], outputDir: string): InspectionReport {
  const outputJson = join(outputDir, 'measurement-path-inspection.json');
  const outputMd = join(outputDir, 'measurement-path-inspection.md');
  const target = artifactFacts(targetDir);
  const references = referenceDirs.map(artifactFacts);
  const rawFail = target.probe.rawPresent
    && target.probe.over75Count === target.probe.count
    && target.probe.count > 0
    && target.measurementTrust === 'fail';
  const owner = rawFail
    ? 'per_sample_render_submission_probe_overhead_captured'
    : target.probe.rawPresent
      ? 'measurement_path_acceptable'
      : 'measurement_probe_raw_series_missing';
  const status: Status = rawFail ? 'fail' : target.measurementTrust === 'pass' ? 'pass' : 'warn';
  const confidence: 'high' | 'medium' | 'low' = rawFail ? 'high' : target.probe.rawPresent ? 'medium' : 'low';
  const positivePostTag = references.find((entry) => entry.artifactDir.includes('2026-05-07T17-03-50-248Z'));

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-measurement-path-inspection',
    status,
    inputs: {
      targetArtifact: rel(targetDir),
      referenceArtifacts: referenceDirs.map(rel),
    },
    target,
    references,
    classification: {
      owner,
      confidence,
      acceptance: 'diagnostic_only',
    },
    findings: [
      `Target artifact ${target.artifactDir} records capture status ${target.captureStatus}, validation ${target.validation}, measurement trust ${target.measurementTrust}, avg ${target.avgFrameMs}ms, p99 ${target.p99FrameMs}ms, and max ${target.maxFrameMs}ms.`,
      `The target measurement path now persists ${target.probe.count} raw probe samples; min=${target.probe.minMs}ms, p50=${target.probe.p50Ms}ms, p95=${target.probe.p95Ms}ms, max=${target.probe.maxMs}ms, and avg=${target.probe.avgMs}ms.`,
      `The target raw probe series has ${target.probe.over75Count}/${target.probe.count} samples over 75ms and ${target.probe.over150Count}/${target.probe.count} samples over 150ms.`,
      `The target render-submission drain wrote ${target.renderSubmissionSamples} samples and ${target.renderSubmissionBytes} bytes; this is not a baseline-quality capture shape.`,
      `Accepted owner reference ${references[0]?.artifactDir ?? 'n/a'} remains measurement ${references[0]?.measurementTrust ?? 'n/a'} with probe avg ${references[0]?.probe.avgMs ?? 'n/a'}ms and p95 ${references[0]?.probe.p95Ms ?? 'n/a'}ms.`,
      `Positive post-tag diagnostic reference ${positivePostTag?.artifactDir ?? 'n/a'} remains measurement ${positivePostTag?.measurementTrust ?? 'n/a'} and is not promoted by this failed measurement packet.`,
    ],
    nextActions: [
      'Keep probeRoundTripSamplesMs persisted for future captures; aggregate-only measurement trust is insufficient for owner-proof decisions.',
      'Do not use render-submission drain on every sample as a baseline or measurement-trust proof shape.',
      'For the next owner proof, run sparse render-submission attribution with raw probe persistence and classify the raw series before interpreting draw/triangle ownership.',
      'Keep STABILIZAT-1 baseline refresh blocked until a standard or explicitly accepted sparse capture clears measurement trust and perf compare gates.',
    ],
    nonClaims: [
      'This packet does not complete STABILIZAT-1.',
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not promote the post-tag owner packet over the 16:23 measurement-PASS owner reference.',
      'This packet does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: InspectionReport): string {
  return [
    '# Projekt 143 Measurement Path Inspection',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification.owner}/${report.classification.confidence}`,
    `Target: ${report.inputs.targetArtifact}`,
    '',
    '## Findings',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  const targetDir = artifactArg();
  const references = referenceArgs();
  const outputDir = join(targetDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(targetDir, references, outputDir);
  writeFileSync(join(outputDir, 'measurement-path-inspection.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'measurement-path-inspection.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 measurement path inspection ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`rawProbe=${report.target.probe.count} p95=${report.target.probe.p95Ms ?? 'n/a'}ms over75=${report.target.probe.over75Count ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-measurement-path-inspection failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
