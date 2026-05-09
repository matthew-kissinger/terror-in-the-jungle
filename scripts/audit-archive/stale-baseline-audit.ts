#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';
type RowStatus = 'PASS' | 'WARN' | 'FAIL';
type RefreshDisposition =
  | 'current'
  | 'eligible_but_stale'
  | 'blocked_no_capture'
  | 'blocked_failed_capture'
  | 'blocked_validation'
  | 'blocked_measurement_trust'
  | 'blocked_compare_warn'
  | 'blocked_compare_fail';

interface Threshold {
  pass: number;
  warn: number;
}

interface ScenarioBaseline {
  description: string;
  thresholds: Record<string, Threshold>;
  lastMeasured?: {
    date?: string;
    artifactDir?: string;
    [key: string]: unknown;
  };
}

interface BaselineFile {
  version: number;
  lastUpdated: string;
  scenarios: Record<string, ScenarioBaseline>;
}

interface RuntimeSample {
  avgFrameMs?: number;
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  overBudgetPercent?: number;
  heapUsedMb?: number;
}

interface ValidationCheck {
  id?: string;
  status?: string;
  value?: number;
}

interface ValidationReport {
  overall?: string;
  checks?: ValidationCheck[];
}

interface MeasurementTrust {
  status?: string;
  probeRoundTripAvgMs?: number;
  probeRoundTripP95Ms?: number;
  probeRoundTripMaxMs?: number;
  sampleCount?: number;
  missedSamples?: number;
}

interface CaptureSummary {
  startedAt?: string;
  durationSeconds?: number;
  npcs?: number;
  requestedNpcs?: number;
  status?: string;
  failureReason?: string;
  finalFrameCount?: number;
  validation?: ValidationReport;
  measurementTrust?: MeasurementTrust;
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
}

interface CaptureArtifact {
  dirName: string;
  path: string;
  summary: CaptureSummary;
  samples: RuntimeSample[];
  validation: ValidationReport | null;
}

interface ExtractedMetrics {
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch50Pct: number;
  hitch100Pct: number;
  overBudgetPct: number;
  heapGrowthMb: number;
  sampleCount: number;
  durationSeconds: number;
  requestedNpcs: number;
  mode: string;
}

interface ComparisonRow {
  metric: string;
  value: number;
  passThreshold: number;
  warnThreshold: number;
  status: RowStatus;
}

interface ScenarioAudit {
  scenario: string;
  description: string;
  baseline: {
    lastMeasuredDate: string | null;
    artifactDir: string | null;
    ageDays: number | null;
    staleAfterDays: number;
    staleByAge: boolean;
  };
  latestCapture: {
    artifactDir: string | null;
    startedAt: string | null;
    status: string | null;
    validation: string | null;
    measurementTrust: string | null;
    durationSeconds: number | null;
    requestedNpcs: number | null;
    mode: string | null;
    sampleCount: number;
    failureReason: string | null;
  };
  comparison: {
    pass: number;
    warn: number;
    fail: number;
    rows: ComparisonRow[];
  };
  refreshDisposition: RefreshDisposition;
  finding: string;
}

interface StaleBaselineAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-stale-baseline-audit';
  status: Status;
  asOfDate: string;
  inputs: {
    baselineFile: string;
    artifactRoot: string;
    staleAfterDays: number;
  };
  summary: {
    scenarioCount: number;
    current: number;
    eligibleButStale: number;
    blocked: number;
    staleByAge: number;
  };
  scenarios: ScenarioAudit[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-stale-baseline-audit';
const BASELINE_PATH = join(process.cwd(), 'perf-baselines.json');
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const DEFAULT_STALE_AFTER_DAYS = 14;

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function asOfDate(): string {
  return argValue('--as-of') ?? new Date().toISOString().slice(0, 10);
}

function staleAfterDays(): number {
  const raw = Number(argValue('--stale-after-days') ?? DEFAULT_STALE_AFTER_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_STALE_AFTER_DAYS;
}

function outputDir(): string {
  const explicit = argValue('--out-dir');
  if (explicit) return resolve(explicit);
  return join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function dayIndex(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function ageDays(fromDate: string | null | undefined, toDate: string): number | null {
  if (!fromDate) return null;
  const from = dayIndex(fromDate);
  const to = dayIndex(toDate);
  return from === null || to === null ? null : to - from;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function checkValue(validation: ValidationReport | null, id: string): number {
  const check = validation?.checks?.find((entry) => entry.id === id);
  return typeof check?.value === 'number' ? check.value : 0;
}

function listCaptures(): CaptureArtifact[] {
  if (!existsSync(ARTIFACT_ROOT)) return [];
  return readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(ARTIFACT_ROOT, entry.name);
      const summaryPath = join(path, 'summary.json');
      const samplesPath = join(path, 'runtime-samples.json');
      const validationPath = join(path, 'validation.json');
      if (!existsSync(summaryPath) || !existsSync(samplesPath)) return null;
      try {
        const summary = readJson<CaptureSummary>(summaryPath);
        const samples = readJson<unknown>(samplesPath);
        const validation = existsSync(validationPath) ? readJson<ValidationReport>(validationPath) : null;
        return {
          dirName: entry.name,
          path,
          summary,
          samples: Array.isArray(samples) ? samples as RuntimeSample[] : [],
          validation,
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is CaptureArtifact => entry !== null)
    .sort((a, b) => a.dirName.localeCompare(b.dirName));
}

function extractMetrics(capture: CaptureArtifact): ExtractedMetrics {
  const samples = capture.samples;
  const summary = capture.summary;
  const validation = capture.validation ?? summary.validation ?? null;
  const heapSamples = samples.filter((sample) => typeof sample.heapUsedMb === 'number');
  const baselineHeap = heapSamples.length > 0
    ? avg(heapSamples.slice(0, Math.min(3, heapSamples.length)).map((sample) => Number(sample.heapUsedMb ?? 0)))
    : 0;
  const endHeap = heapSamples.length > 0 ? Number(heapSamples[heapSamples.length - 1].heapUsedMb ?? 0) : 0;
  const validationHeap = checkValue(validation, 'heap_growth_mb');
  const heapGrowthMb = heapSamples.length > 1 ? endHeap - baselineHeap : validationHeap;

  return {
    avgFrameMs: avg(samples.map((sample) => Number(sample.avgFrameMs ?? 0))),
    p95FrameMs: samples.length > 0 ? Math.max(...samples.map((sample) => Number(sample.p95FrameMs ?? 0))) : 0,
    p99FrameMs: samples.length > 0 ? Math.max(...samples.map((sample) => Number(sample.p99FrameMs ?? 0))) : 0,
    maxFrameMs: samples.length > 0 ? Math.max(...samples.map((sample) => Number(sample.maxFrameMs ?? 0))) : 0,
    hitch50Pct: checkValue(validation, 'hitch_50ms_percent'),
    hitch100Pct: checkValue(validation, 'hitch_100ms_percent'),
    overBudgetPct: avg(samples.map((sample) => Number(sample.overBudgetPercent ?? 0))),
    heapGrowthMb,
    sampleCount: samples.length,
    durationSeconds: Number(summary.durationSeconds ?? 0),
    requestedNpcs: Number(summary.requestedNpcs ?? summary.npcs ?? 0),
    mode: summary.scenario?.mode ?? 'unknown',
  };
}

function detectScenario(metrics: ExtractedMetrics): string | null {
  if (metrics.mode === 'ai_sandbox' && metrics.requestedNpcs >= 120 && metrics.durationSeconds >= 85) {
    return 'combat120';
  }
  if (metrics.mode === 'open_frontier' && metrics.durationSeconds >= 1_200) {
    return 'frontier30m';
  }
  if (
    metrics.mode === 'open_frontier'
    && metrics.requestedNpcs >= 120
    && metrics.durationSeconds >= 150
    && metrics.durationSeconds < 600
  ) {
    return 'openfrontier:short';
  }
  if (
    metrics.mode === 'a_shau_valley'
    && metrics.requestedNpcs >= 60
    && metrics.durationSeconds >= 150
    && metrics.durationSeconds < 600
  ) {
    return 'ashau:short';
  }
  return null;
}

function compareMetric(metric: string, value: number, threshold: Threshold): ComparisonRow {
  const status: RowStatus = value <= threshold.pass ? 'PASS' : value <= threshold.warn ? 'WARN' : 'FAIL';
  return {
    metric,
    value: Number(value.toFixed(3)),
    passThreshold: threshold.pass,
    warnThreshold: threshold.warn,
    status,
  };
}

function compareMetrics(metrics: ExtractedMetrics, baseline: ScenarioBaseline): ComparisonRow[] {
  const values: Record<string, number> = {
    avgFrameMs: metrics.avgFrameMs,
    p95FrameMs: metrics.p95FrameMs,
    p99FrameMs: metrics.p99FrameMs,
    maxFrameMs: metrics.maxFrameMs,
    hitch50Pct: metrics.hitch50Pct,
    hitch100Pct: metrics.hitch100Pct,
    overBudgetPct: metrics.overBudgetPct,
    heapGrowthMb: metrics.heapGrowthMb,
  };
  return Object.entries(baseline.thresholds)
    .map(([metric, threshold]) => compareMetric(metric, values[metric] ?? 0, threshold));
}

function latestCaptureForScenario(captures: CaptureArtifact[], scenario: string): CaptureArtifact | null {
  return [...captures]
    .reverse()
    .find((capture) => detectScenario(extractMetrics(capture)) === scenario) ?? null;
}

function disposition(
  capture: CaptureArtifact | null,
  rows: ComparisonRow[],
  baselineAgeDays: number | null,
  staleLimitDays: number,
): RefreshDisposition {
  if (!capture) return 'blocked_no_capture';
  if (capture.summary.status !== 'ok') return 'blocked_failed_capture';
  const validation = capture.validation?.overall ?? capture.summary.validation?.overall ?? null;
  if (validation !== 'pass') return 'blocked_validation';
  const measurementTrust = capture.summary.measurementTrust?.status ?? null;
  if (measurementTrust && measurementTrust !== 'pass') return 'blocked_measurement_trust';
  if (rows.some((row) => row.status === 'FAIL')) return 'blocked_compare_fail';
  if (rows.some((row) => row.status === 'WARN')) return 'blocked_compare_warn';
  return baselineAgeDays !== null && baselineAgeDays > staleLimitDays ? 'eligible_but_stale' : 'current';
}

function findingText(audit: Omit<ScenarioAudit, 'finding'>): string {
  const latest = audit.latestCapture.artifactDir ?? 'none';
  switch (audit.refreshDisposition) {
    case 'current':
      return `${audit.scenario} baseline is current against latest eligible capture ${latest}.`;
    case 'eligible_but_stale':
      return `${audit.scenario} baseline is age-stale but latest capture ${latest} is strict-pass eligible for refresh review.`;
    case 'blocked_no_capture':
      return `${audit.scenario} has no detected capture matching the tracked baseline scenario.`;
    case 'blocked_failed_capture':
      return `${audit.scenario} latest capture ${latest} is failed and cannot refresh a baseline.`;
    case 'blocked_validation':
      return `${audit.scenario} latest capture ${latest} has validation ${audit.latestCapture.validation}; baseline refresh is blocked.`;
    case 'blocked_measurement_trust':
      return `${audit.scenario} latest capture ${latest} has measurement trust ${audit.latestCapture.measurementTrust}; baseline refresh is blocked.`;
    case 'blocked_compare_warn':
      return `${audit.scenario} latest capture ${latest} has comparison WARN rows; strict baseline refresh is blocked.`;
    case 'blocked_compare_fail':
      return `${audit.scenario} latest capture ${latest} has comparison FAIL rows; baseline refresh is blocked.`;
  }
}

function auditScenario(
  scenario: string,
  baseline: ScenarioBaseline,
  captures: CaptureArtifact[],
  currentDate: string,
  staleLimitDays: number,
): ScenarioAudit {
  const baselineAge = ageDays(baseline.lastMeasured?.date, currentDate);
  const capture = latestCaptureForScenario(captures, scenario);
  const metrics = capture ? extractMetrics(capture) : null;
  const rows = metrics ? compareMetrics(metrics, baseline) : [];
  const refreshDisposition = disposition(capture, rows, baselineAge, staleLimitDays);
  const validation = capture?.validation?.overall ?? capture?.summary.validation?.overall ?? null;
  const measurementTrust = capture?.summary.measurementTrust?.status ?? null;
  const withoutFinding: Omit<ScenarioAudit, 'finding'> = {
    scenario,
    description: baseline.description,
    baseline: {
      lastMeasuredDate: baseline.lastMeasured?.date ?? null,
      artifactDir: baseline.lastMeasured?.artifactDir ?? null,
      ageDays: baselineAge,
      staleAfterDays: staleLimitDays,
      staleByAge: baselineAge !== null && baselineAge > staleLimitDays,
    },
    latestCapture: {
      artifactDir: capture?.dirName ?? null,
      startedAt: capture?.summary.startedAt ?? null,
      status: capture?.summary.status ?? null,
      validation,
      measurementTrust,
      durationSeconds: metrics?.durationSeconds ?? null,
      requestedNpcs: metrics?.requestedNpcs ?? null,
      mode: metrics?.mode ?? null,
      sampleCount: metrics?.sampleCount ?? 0,
      failureReason: capture?.summary.failureReason ?? null,
    },
    comparison: {
      pass: rows.filter((row) => row.status === 'PASS').length,
      warn: rows.filter((row) => row.status === 'WARN').length,
      fail: rows.filter((row) => row.status === 'FAIL').length,
      rows,
    },
    refreshDisposition,
  };
  return {
    ...withoutFinding,
    finding: findingText(withoutFinding),
  };
}

function toMarkdown(report: StaleBaselineAuditReport): string {
  return [
    '# Projekt Objekt-143 Stale Baseline Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `As of: ${report.asOfDate}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Scenarios: ${report.summary.scenarioCount}`,
    `- Current: ${report.summary.current}`,
    `- Eligible but stale: ${report.summary.eligibleButStale}`,
    `- Blocked: ${report.summary.blocked}`,
    `- Stale by age: ${report.summary.staleByAge}`,
    '',
    '## Scenarios',
    '',
    ...report.scenarios.flatMap((scenario) => [
      `### ${scenario.scenario}`,
      '',
      `- Disposition: ${scenario.refreshDisposition}`,
      `- Finding: ${scenario.finding}`,
      `- Baseline: ${scenario.baseline.lastMeasuredDate ?? 'none'} (${scenario.baseline.ageDays ?? 'unknown'} days)`,
      `- Latest capture: ${scenario.latestCapture.artifactDir ?? 'none'}`,
      `- Validation: ${scenario.latestCapture.validation ?? 'none'}`,
      `- Measurement trust: ${scenario.latestCapture.measurementTrust ?? 'none'}`,
      `- Compare: ${scenario.comparison.pass} pass, ${scenario.comparison.warn} warn, ${scenario.comparison.fail} fail`,
      '',
    ]),
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  if (!existsSync(BASELINE_PATH)) {
    throw new Error('perf-baselines.json is missing.');
  }
  const baselineFile = readJson<BaselineFile>(BASELINE_PATH);
  const currentDate = asOfDate();
  const staleLimitDays = staleAfterDays();
  const captures = listCaptures();
  const scenarios = Object.entries(baselineFile.scenarios)
    .map(([scenario, baseline]) => auditScenario(scenario, baseline, captures, currentDate, staleLimitDays));
  const current = scenarios.filter((scenario) => scenario.refreshDisposition === 'current').length;
  const eligibleButStale = scenarios.filter((scenario) => scenario.refreshDisposition === 'eligible_but_stale').length;
  const blocked = scenarios.length - current - eligibleButStale;
  const staleByAge = scenarios.filter((scenario) => scenario.baseline.staleByAge).length;
  const status: Status = scenarios.length === 0 ? 'fail' : blocked > 0 || eligibleButStale > 0 || staleByAge > 0 ? 'warn' : 'pass';
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'stale-baseline-audit.json');
  const markdownPath = join(outDir, 'stale-baseline-audit.md');
  const report: StaleBaselineAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-stale-baseline-audit',
    status,
    asOfDate: currentDate,
    inputs: {
      baselineFile: rel(BASELINE_PATH),
      artifactRoot: rel(ARTIFACT_ROOT),
      staleAfterDays: staleLimitDays,
    },
    summary: {
      scenarioCount: scenarios.length,
      current,
      eligibleButStale,
      blocked,
      staleByAge,
    },
    scenarios,
    nextActions: [
      'Keep perf-baselines.json unchanged until each tracked scenario has a strict-pass capture with validation PASS and measurement trust PASS.',
      'Prioritize combat120 because STABILIZAT-1 and validate:full depend on it.',
      'Run Open Frontier, A Shau, and frontier30m refresh captures only after combat120 and release blockers stop invalidating the baseline chain.',
    ],
    nonClaims: [
      'This audit does not refresh perf-baselines.json.',
      'This audit does not prove a runtime performance fix.',
      'This audit does not certify local machine quietness or live production performance.',
    ],
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
  };
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 stale baseline audit ${status.toUpperCase()}: ${rel(jsonPath)}`);
  for (const scenario of scenarios) {
    console.log(`- ${scenario.scenario}: ${scenario.refreshDisposition}; ${scenario.finding}`);
  }
  if (status === 'fail') process.exitCode = 1;
}

main();
