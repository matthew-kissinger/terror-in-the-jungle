#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type WindowLabel = 'early' | 'middle' | 'late';

interface ValidationCheck {
  id?: string;
  value?: number | string | boolean | null;
}

interface CaptureSummary {
  status?: string;
  validation?: {
    overall?: CheckStatus;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: CheckStatus;
  };
}

interface RuntimeSample {
  frameCount?: number;
  avgFrameMs?: number;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    closeEngagement?: Record<string, unknown>;
  };
}

interface AnchorSpec {
  path: string;
  patterns: string[];
}

interface AnchorResult {
  path: string;
  present: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface MetricComparison {
  before: number | null;
  after: number | null;
  delta: number | null;
}

interface LateMetricComparison extends MetricComparison {
  reductionPercent: number | null;
}

interface RuntimeWindow {
  label: WindowLabel;
  samples: number;
  firstFrame: number | null;
  lastFrame: number | null;
  avgFrameMs: number | null;
  combatTotalMs: number | null;
  aiUpdateMs: number | null;
  distributionCalls: number | null;
  assignmentChurn: number | null;
  targetCountRebuilds: number | null;
  distributionChurnPerCall: number | null;
  patrolDetectionCalls: number | null;
  engageSuppressionCalls: number | null;
  seekingCoverCalls: number | null;
  losFullEvaluations: number | null;
  losTerrainRaycasts: number | null;
}

interface StabilityReport {
  createdAt: string;
  sourceGitSha: string;
  worktreeDirty: boolean;
  mode: 'projekt-143-target-distribution-stability-bound';
  status: CheckStatus;
  inputs: {
    beforeRuntimeSamples: string;
    afterRuntimeSamples: string;
    beforeSummary: string;
    afterSummary: string;
  };
  sourceAnchors: AnchorResult[];
  captureComparison: {
    captureStatus: { before: string | null; after: string | null };
    validation: { before: CheckStatus | null; after: CheckStatus | null };
    measurementTrust: { before: CheckStatus | null; after: CheckStatus | null };
    avgFrameMs: MetricComparison;
    peakP99FrameMs: MetricComparison;
    peakMaxFrameMs: MetricComparison;
    heapEndGrowthMb: MetricComparison;
    heapRecoveryRatio: MetricComparison;
    aiBudgetStarvationEvents: MetricComparison;
  };
  beforeWindows: RuntimeWindow[];
  afterWindows: RuntimeWindow[];
  lateComparison: {
    avgFrameMs: MetricComparison;
    distributionCalls: LateMetricComparison;
    assignmentChurn: LateMetricComparison;
    distributionChurnPerCall: MetricComparison;
    patrolDetectionCalls: LateMetricComparison;
    engageSuppressionCalls: LateMetricComparison;
    seekingCoverCalls: LateMetricComparison;
    losFullEvaluations: LateMetricComparison;
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-target-distribution-stability-bound';

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ClusterManager.ts',
    patterns: [
      'TARGET_STICKINESS_MS = 500',
      'lastAssignedAtByCombatant',
      'const stickyTarget = this.getStickyTarget',
      'private getStickyTarget(',
      'this.lastAssignedAtByCombatant.clear()',
    ],
  },
  {
    path: 'src/systems/combat/ClusterManager.test.ts',
    patterns: [
      'keeps a prior distributed target inside the stickiness window',
      'records distribution telemetry and reassignment churn',
    ],
  },
];

const PATHS = {
  distributionCalls: 'combatBreakdown.closeEngagement.targetDistribution.distributionCalls',
  assignmentChurn: 'combatBreakdown.closeEngagement.targetDistribution.assignmentChurn',
  targetCountRebuilds: 'combatBreakdown.closeEngagement.targetDistribution.targetCountRebuilds',
  patrolDetectionCalls: 'combatBreakdown.closeEngagement.losCallsites.patrolDetection.calls',
  engageSuppressionCalls: 'combatBreakdown.closeEngagement.losCallsites.engageSuppressionCheck.calls',
  seekingCoverCalls: 'combatBreakdown.closeEngagement.losCallsites.seekingCoverValidation.calls',
  losFullEvaluations: 'combatBreakdown.closeEngagement.lineOfSight.fullEvaluations',
  losTerrainRaycasts: 'combatBreakdown.closeEngagement.lineOfSight.terrainRaycasts',
};

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function requiredPath(name: string): string {
  const value = parseArg(name);
  if (!value) throw new Error(`Missing required --${name}`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`Path for --${name} does not exist: ${path}`);
  return path;
}

function outputRoot(): string {
  const configured = parseArg('output-root');
  return configured ? resolve(configured) : join(process.cwd(), 'artifacts', 'perf', timestampForPath());
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function worktreeDirty(): boolean {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim().length > 0;
}

function findAnchors(spec: AnchorSpec): AnchorResult {
  const fullPath = join(process.cwd(), spec.path);
  if (!existsSync(fullPath)) {
    return {
      path: spec.path,
      present: false,
      anchors: spec.patterns.map((pattern) => ({ pattern, line: null, text: null })),
    };
  }

  const lines = readFileSync(fullPath, 'utf-8').split(/\r?\n/);
  const anchors = spec.patterns.map((pattern) => {
    const index = lines.findIndex((line) => line.includes(pattern));
    return {
      pattern,
      line: index >= 0 ? index + 1 : null,
      text: index >= 0 ? lines[index].trim() : null,
    };
  });

  return {
    path: spec.path,
    present: anchors.every((anchor) => anchor.line !== null),
    anchors,
  };
}

function numberAt(source: unknown, path: string): number | null {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function checkValue(summary: CaptureSummary, id: string): number | null {
  const value = summary.validation?.checks?.find((check) => check.id === id)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 3): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function counterDelta(samples: RuntimeSample[], path: string): number | null {
  if (samples.length < 2) return null;
  const first = numberAt(samples[0], path);
  const last = numberAt(samples[samples.length - 1], path);
  if (first === null || last === null) return null;
  return Math.max(0, last - first);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round(numerator / denominator);
}

function phaseSlices(samples: RuntimeSample[]): Array<{ label: WindowLabel; samples: RuntimeSample[] }> {
  const labels: WindowLabel[] = ['early', 'middle', 'late'];
  return labels.map((label, index) => {
    const start = Math.floor((samples.length * index) / labels.length);
    const end = index === labels.length - 1
      ? samples.length
      : Math.floor((samples.length * (index + 1)) / labels.length);
    return { label, samples: samples.slice(start, Math.max(start + 1, end)) };
  });
}

function buildWindow(label: WindowLabel, samples: RuntimeSample[]): RuntimeWindow {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const distributionCalls = counterDelta(samples, PATHS.distributionCalls);
  const assignmentChurn = counterDelta(samples, PATHS.assignmentChurn);
  return {
    label,
    samples: samples.length,
    firstFrame: typeof first?.frameCount === 'number' ? first.frameCount : null,
    lastFrame: typeof last?.frameCount === 'number' ? last.frameCount : null,
    avgFrameMs: round(average(samples.map((sample) => sample.avgFrameMs)), 2),
    combatTotalMs: round(average(samples.map((sample) => sample.combatBreakdown?.totalMs)), 2),
    aiUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.aiUpdateMs)), 2),
    distributionCalls,
    assignmentChurn,
    targetCountRebuilds: counterDelta(samples, PATHS.targetCountRebuilds),
    distributionChurnPerCall: ratio(assignmentChurn, distributionCalls),
    patrolDetectionCalls: counterDelta(samples, PATHS.patrolDetectionCalls),
    engageSuppressionCalls: counterDelta(samples, PATHS.engageSuppressionCalls),
    seekingCoverCalls: counterDelta(samples, PATHS.seekingCoverCalls),
    losFullEvaluations: counterDelta(samples, PATHS.losFullEvaluations),
    losTerrainRaycasts: counterDelta(samples, PATHS.losTerrainRaycasts),
  };
}

function windows(samples: RuntimeSample[]): RuntimeWindow[] {
  const closeSamples = samples.filter((sample) => sample.combatBreakdown?.closeEngagement);
  return phaseSlices(closeSamples).map((slice) => buildWindow(slice.label, slice.samples));
}

function metricDelta(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return round(after - before);
}

function reduction(after: number | null, before: number | null): number | null {
  if (after === null || before === null || before <= 0) return null;
  return round(((before - after) / before) * 100, 1);
}

function compareMetric(before: number | null, after: number | null): MetricComparison {
  return {
    before,
    after,
    delta: metricDelta(after, before),
  };
}

function compareLateMetric(before: number | null, after: number | null): LateMetricComparison {
  return {
    ...compareMetric(before, after),
    reductionPercent: reduction(after, before),
  };
}

function lateWindow(windowsToSearch: RuntimeWindow[]): RuntimeWindow | null {
  return windowsToSearch.find((window) => window.label === 'late') ?? null;
}

function renderNumber(value: number | null, suffix = ''): string {
  return value === null ? 'n/a' : `${value}${suffix}`;
}

function renderMarkdown(report: StabilityReport): string {
  return [
    '# Projekt Objekt-143 Target Distribution Stability Bound',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Worktree dirty: ${report.worktreeDirty}`,
    '',
    '## Inputs',
    `- Before runtime samples: ${report.inputs.beforeRuntimeSamples}`,
    `- After runtime samples: ${report.inputs.afterRuntimeSamples}`,
    `- Before capture summary: ${report.inputs.beforeSummary}`,
    `- After capture summary: ${report.inputs.afterSummary}`,
    '',
    '## Capture Comparison',
    `- Validation: ${report.captureComparison.validation.before} -> ${report.captureComparison.validation.after}`,
    `- Measurement trust: ${report.captureComparison.measurementTrust.before} -> ${report.captureComparison.measurementTrust.after}`,
    `- Average frame: ${renderNumber(report.captureComparison.avgFrameMs.before, 'ms')} -> ${renderNumber(report.captureComparison.avgFrameMs.after, 'ms')}`,
    `- Peak p99 frame: ${renderNumber(report.captureComparison.peakP99FrameMs.before, 'ms')} -> ${renderNumber(report.captureComparison.peakP99FrameMs.after, 'ms')}`,
    `- Peak max frame: ${renderNumber(report.captureComparison.peakMaxFrameMs.before, 'ms')} -> ${renderNumber(report.captureComparison.peakMaxFrameMs.after, 'ms')}`,
    `- Heap end-growth: ${renderNumber(report.captureComparison.heapEndGrowthMb.before, 'MB')} -> ${renderNumber(report.captureComparison.heapEndGrowthMb.after, 'MB')}`,
    `- Heap recovery: ${renderNumber(report.captureComparison.heapRecoveryRatio.before)} -> ${renderNumber(report.captureComparison.heapRecoveryRatio.after)}`,
    `- AI budget starvation events: ${renderNumber(report.captureComparison.aiBudgetStarvationEvents.before)} -> ${renderNumber(report.captureComparison.aiBudgetStarvationEvents.after)}`,
    '',
    '## Late Window Comparison',
    `- Assignment churn: ${report.lateComparison.assignmentChurn.before} -> ${report.lateComparison.assignmentChurn.after}, reduction ${renderNumber(report.lateComparison.assignmentChurn.reductionPercent, '%')}`,
    `- Distribution churn per call: ${report.lateComparison.distributionChurnPerCall.before} -> ${report.lateComparison.distributionChurnPerCall.after}`,
    `- Patrol detection calls: ${report.lateComparison.patrolDetectionCalls.before} -> ${report.lateComparison.patrolDetectionCalls.after}, reduction ${renderNumber(report.lateComparison.patrolDetectionCalls.reductionPercent, '%')}`,
    `- Engage suppression calls: ${report.lateComparison.engageSuppressionCalls.before} -> ${report.lateComparison.engageSuppressionCalls.after}, reduction ${renderNumber(report.lateComparison.engageSuppressionCalls.reductionPercent, '%')}`,
    `- LOS full evaluations: ${report.lateComparison.losFullEvaluations.before} -> ${report.lateComparison.losFullEvaluations.after}, reduction ${renderNumber(report.lateComparison.losFullEvaluations.reductionPercent, '%')}`,
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
  const beforeRuntimePath = requiredPath('before-runtime');
  const afterRuntimePath = requiredPath('after-runtime');
  const beforeSummaryPath = requiredPath('before-summary');
  const afterSummaryPath = requiredPath('after-summary');
  const outputDir = join(outputRoot(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const beforeSummary = readJson<CaptureSummary>(beforeSummaryPath);
  const afterSummary = readJson<CaptureSummary>(afterSummaryPath);
  const beforeWindows = windows(readJson<RuntimeSample[]>(beforeRuntimePath));
  const afterWindows = windows(readJson<RuntimeSample[]>(afterRuntimePath));
  const beforeLate = lateWindow(beforeWindows);
  const afterLate = lateWindow(afterWindows);
  const anchors = SOURCE_SPECS.map(findAnchors);
  const anchorsPresent = anchors.every((anchor) => anchor.present);

  const assignmentChurn = compareLateMetric(beforeLate?.assignmentChurn ?? null, afterLate?.assignmentChurn ?? null);
  const patrolDetection = compareLateMetric(beforeLate?.patrolDetectionCalls ?? null, afterLate?.patrolDetectionCalls ?? null);
  const churnReduced = (assignmentChurn.delta ?? 0) < 0;
  const afterMeasurementTrust = afterSummary.measurementTrust?.status ?? null;
  const afterValidation = afterSummary.validation?.overall ?? null;
  const status: CheckStatus = anchorsPresent && churnReduced && afterMeasurementTrust === 'pass'
    ? afterValidation === 'pass' && (patrolDetection.delta ?? 1) <= 0 ? 'pass' : 'warn'
    : 'fail';

  const report: StabilityReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    worktreeDirty: worktreeDirty(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      beforeRuntimeSamples: rel(beforeRuntimePath),
      afterRuntimeSamples: rel(afterRuntimePath),
      beforeSummary: rel(beforeSummaryPath),
      afterSummary: rel(afterSummaryPath),
    },
    sourceAnchors: anchors,
    captureComparison: {
      captureStatus: {
        before: beforeSummary.status ?? null,
        after: afterSummary.status ?? null,
      },
      validation: {
        before: beforeSummary.validation?.overall ?? null,
        after: afterSummary.validation?.overall ?? null,
      },
      measurementTrust: {
        before: beforeSummary.measurementTrust?.status ?? null,
        after: afterSummary.measurementTrust?.status ?? null,
      },
      avgFrameMs: compareMetric(checkValue(beforeSummary, 'avg_frame_ms'), checkValue(afterSummary, 'avg_frame_ms')),
      peakP99FrameMs: compareMetric(checkValue(beforeSummary, 'peak_p99_frame_ms'), checkValue(afterSummary, 'peak_p99_frame_ms')),
      peakMaxFrameMs: compareMetric(checkValue(beforeSummary, 'peak_max_frame_ms'), checkValue(afterSummary, 'peak_max_frame_ms')),
      heapEndGrowthMb: compareMetric(checkValue(beforeSummary, 'heap_growth_mb'), checkValue(afterSummary, 'heap_growth_mb')),
      heapRecoveryRatio: compareMetric(checkValue(beforeSummary, 'heap_recovery_ratio'), checkValue(afterSummary, 'heap_recovery_ratio')),
      aiBudgetStarvationEvents: compareMetric(checkValue(beforeSummary, 'ai_budget_starvation_events'), checkValue(afterSummary, 'ai_budget_starvation_events')),
    },
    beforeWindows,
    afterWindows,
    lateComparison: {
      avgFrameMs: compareMetric(beforeLate?.avgFrameMs ?? null, afterLate?.avgFrameMs ?? null),
      distributionCalls: compareLateMetric(beforeLate?.distributionCalls ?? null, afterLate?.distributionCalls ?? null),
      assignmentChurn,
      distributionChurnPerCall: compareMetric(beforeLate?.distributionChurnPerCall ?? null, afterLate?.distributionChurnPerCall ?? null),
      patrolDetectionCalls: patrolDetection,
      engageSuppressionCalls: compareLateMetric(beforeLate?.engageSuppressionCalls ?? null, afterLate?.engageSuppressionCalls ?? null),
      seekingCoverCalls: compareLateMetric(beforeLate?.seekingCoverCalls ?? null, afterLate?.seekingCoverCalls ?? null),
      losFullEvaluations: compareLateMetric(beforeLate?.losFullEvaluations ?? null, afterLate?.losFullEvaluations ?? null),
    },
    findings: [
      'The source anchor adds a 500ms stable-target window for cluster-distributed targets that remain in the candidate set.',
      `Late-window assignment churn moved ${assignmentChurn.before} -> ${assignmentChurn.after}, a ${renderNumber(assignmentChurn.reductionPercent, '%')} reduction.`,
      `Late-window patrolDetection calls moved ${patrolDetection.before} -> ${patrolDetection.after}, a ${renderNumber(patrolDetection.reductionPercent, '%')} reduction.`,
      `The post-change capture is ${afterValidation ?? 'unknown'} with measurement trust ${afterMeasurementTrust ?? 'unknown'}, so the packet remains tied to the standard validation gate.`,
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until combat120 validation and perf compare pass together.',
      'If patrolDetection remains dominant, inspect remaining candidate fanout by state and distance before widening cadence windows.',
      'Run human close-actor playtest before treating the lower close-actor and AI distribution behavior as game-feel accepted.',
    ],
    nonClaims: [
      'This packet does not certify a combat120 baseline refresh.',
      'This packet does not declare DEFEKT-3 complete.',
      'This packet does not certify human playtest acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'target-distribution-stability-bound.json')),
      markdown: rel(join(outputDir, 'target-distribution-stability-bound.md')),
    },
  };

  writeFileSync(join(outputDir, 'target-distribution-stability-bound.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'target-distribution-stability-bound.md'), renderMarkdown(report), 'utf-8');

  console.log(JSON.stringify({
    status: report.status,
    summary: report.files.summary,
    markdown: report.files.markdown,
    assignmentChurn: report.lateComparison.assignmentChurn,
    patrolDetection: report.lateComparison.patrolDetectionCalls,
    validation: report.captureComparison.validation,
    measurementTrust: report.captureComparison.measurementTrust,
  }, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
