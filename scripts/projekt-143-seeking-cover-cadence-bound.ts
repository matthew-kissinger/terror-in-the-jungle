#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CallsiteDelta {
  calls?: number | null;
}

interface CallsiteWindow {
  label?: string;
  avgFrameMs?: number | null;
  deltas?: Record<string, CallsiteDelta | undefined>;
}

interface CallsiteCadencePacket {
  runtimeCallsiteWindows?: CallsiteWindow[] | null;
}

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

interface CallsiteComparison {
  callsite: string;
  beforeLateCalls: number | null;
  afterLateCalls: number | null;
  callDelta: number | null;
  reductionPercent: number | null;
}

interface SeekingCoverCadenceReport {
  createdAt: string;
  sourceGitSha: string;
  worktreeDirty: boolean;
  mode: 'projekt-143-seeking-cover-cadence-bound';
  status: CheckStatus;
  inputs: {
    beforeCallsite: string;
    afterCallsite: string;
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
  callsiteComparison: {
    lateWindowAvgFrameMs: MetricComparison;
    seekingCoverValidation: CallsiteComparison;
    patrolDetection: CallsiteComparison;
    engageSuppressionCheck: CallsiteComparison;
    afterLateDominantCallsites: string[];
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-seeking-cover-cadence-bound';

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStateMovement.ts',
    patterns: [
      'SEEKING_COVER_VISIBILITY_RECHECK_MS = 250',
      'private seekingCoverVisibilityByCombatant',
      'this.hasSeekingCoverLineOfSight(combatant, combatant.target, playerPosition, canSeeTarget)',
      'private hasSeekingCoverLineOfSight(',
      'sample.visible',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateMovement.test.ts',
    patterns: [
      'reuses a recent visible seeking-cover LOS result inside the cadence window',
      'rechecks seeking-cover LOS after the cadence window expires',
      'returns to engagement when cover data is missing',
    ],
  },
];

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
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Path for --${name} does not exist: ${resolved}`);
  return resolved;
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

function checkValue(summary: CaptureSummary, id: string): number | null {
  const value = summary.validation?.checks?.find((check) => check.id === id)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function diff(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return Number((after - before).toFixed(3));
}

function compareMetric(before: number | null, after: number | null): MetricComparison {
  return {
    before,
    after,
    delta: diff(after, before),
  };
}

function lateWindow(packet: CallsiteCadencePacket): CallsiteWindow | null {
  return packet.runtimeCallsiteWindows?.find((window) => window.label === 'late') ?? null;
}

function lateCalls(packet: CallsiteCadencePacket, callsite: string): number | null {
  const calls = lateWindow(packet)?.deltas?.[callsite]?.calls;
  return typeof calls === 'number' && Number.isFinite(calls) ? calls : null;
}

function compareCallsite(before: CallsiteCadencePacket, after: CallsiteCadencePacket, callsite: string): CallsiteComparison {
  const beforeLateCalls = lateCalls(before, callsite);
  const afterLateCalls = lateCalls(after, callsite);
  const callDelta = diff(afterLateCalls, beforeLateCalls);
  const reductionPercent = beforeLateCalls !== null && afterLateCalls !== null && beforeLateCalls > 0
    ? Number((((beforeLateCalls - afterLateCalls) / beforeLateCalls) * 100).toFixed(1))
    : null;

  return {
    callsite,
    beforeLateCalls,
    afterLateCalls,
    callDelta,
    reductionPercent,
  };
}

function dominantLateCallsites(packet: CallsiteCadencePacket): string[] {
  const deltas = lateWindow(packet)?.deltas;
  if (!deltas) return [];
  return Object.entries(deltas)
    .map(([callsite, metrics]) => ({
      callsite,
      calls: typeof metrics?.calls === 'number' ? metrics.calls : 0,
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 3)
    .map((entry) => `${entry.callsite}=${entry.calls}`);
}

function renderNumber(value: number | null, suffix = ''): string {
  return value === null ? 'n/a' : `${value}${suffix}`;
}

function renderMarkdown(report: SeekingCoverCadenceReport): string {
  const cover = report.callsiteComparison.seekingCoverValidation;
  const patrol = report.callsiteComparison.patrolDetection;
  const engage = report.callsiteComparison.engageSuppressionCheck;

  return [
    '# Projekt Objekt-143 Seeking Cover Cadence Bound',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Worktree dirty: ${report.worktreeDirty}`,
    '',
    '## Inputs',
    `- Before callsite packet: ${report.inputs.beforeCallsite}`,
    `- After callsite packet: ${report.inputs.afterCallsite}`,
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
    '## Late Window Callsite Comparison',
    `- seekingCoverValidation: ${cover.beforeLateCalls} -> ${cover.afterLateCalls} calls, delta ${cover.callDelta}, reduction ${renderNumber(cover.reductionPercent, '%')}`,
    `- patrolDetection: ${patrol.beforeLateCalls} -> ${patrol.afterLateCalls} calls, delta ${patrol.callDelta}, reduction ${renderNumber(patrol.reductionPercent, '%')}`,
    `- engageSuppressionCheck: ${engage.beforeLateCalls} -> ${engage.afterLateCalls} calls, delta ${engage.callDelta}, reduction ${renderNumber(engage.reductionPercent, '%')}`,
    `- After dominant callsites: ${report.callsiteComparison.afterLateDominantCallsites.join(', ')}`,
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
  const beforeCallsitePath = requiredPath('before-callsite');
  const afterCallsitePath = requiredPath('after-callsite');
  const beforeSummaryPath = requiredPath('before-summary');
  const afterSummaryPath = requiredPath('after-summary');
  const outputDir = join(outputRoot(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const beforeCallsite = readJson<CallsiteCadencePacket>(beforeCallsitePath);
  const afterCallsite = readJson<CallsiteCadencePacket>(afterCallsitePath);
  const beforeSummary = readJson<CaptureSummary>(beforeSummaryPath);
  const afterSummary = readJson<CaptureSummary>(afterSummaryPath);

  const anchors = SOURCE_SPECS.map(findAnchors);
  const coverComparison = compareCallsite(beforeCallsite, afterCallsite, 'seekingCoverValidation');
  const patrolComparison = compareCallsite(beforeCallsite, afterCallsite, 'patrolDetection');
  const engageComparison = compareCallsite(beforeCallsite, afterCallsite, 'engageSuppressionCheck');
  const anchorsPresent = anchors.every((anchor) => anchor.present);
  const coverReduced = (coverComparison.callDelta ?? 0) < 0;
  const patrolIncreased = (patrolComparison.callDelta ?? 0) > 0;
  const afterValidation = afterSummary.validation?.overall ?? null;
  const status: CheckStatus = anchorsPresent && coverReduced
    ? afterValidation === 'pass' && !patrolIncreased ? 'pass' : 'warn'
    : 'fail';

  const report: SeekingCoverCadenceReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    worktreeDirty: worktreeDirty(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      beforeCallsite: rel(beforeCallsitePath),
      afterCallsite: rel(afterCallsitePath),
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
    callsiteComparison: {
      lateWindowAvgFrameMs: compareMetric(lateWindow(beforeCallsite)?.avgFrameMs ?? null, lateWindow(afterCallsite)?.avgFrameMs ?? null),
      seekingCoverValidation: coverComparison,
      patrolDetection: patrolComparison,
      engageSuppressionCheck: engageComparison,
      afterLateDominantCallsites: dominantLateCallsites(afterCallsite),
    },
    findings: [
      'The source anchor adds a SEEKING_COVER_VISIBILITY_RECHECK_MS=250 positive-visibility reuse bound for seeking-cover target validation.',
      `Late-window seekingCoverValidation calls moved ${coverComparison.beforeLateCalls} -> ${coverComparison.afterLateCalls}, a ${renderNumber(coverComparison.reductionPercent, '%')} reduction.`,
      `Late-window patrolDetection calls moved ${patrolComparison.beforeLateCalls} -> ${patrolComparison.afterLateCalls}, so the dominant residual LOS pressure returned to patrol detection.`,
      `The post-change capture is ${afterSummary.validation?.overall ?? 'unknown'} with measurement trust ${afterSummary.measurementTrust?.status ?? 'unknown'}, and the packet remains warning-class evidence.`,
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until combat120 validation and perf compare pass together.',
      'Return to patrolDetection distribution or max-frame attribution before another source cadence bound.',
      'Run human close-actor playtest before treating LOS cadence reuse as game-feel accepted.',
    ],
    nonClaims: [
      'This packet does not certify a combat120 baseline refresh.',
      'This packet does not declare DEFEKT-3 complete.',
      'This packet does not certify human playtest acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'seeking-cover-cadence-bound.json')),
      markdown: rel(join(outputDir, 'seeking-cover-cadence-bound.md')),
    },
  };

  writeFileSync(join(outputDir, 'seeking-cover-cadence-bound.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'seeking-cover-cadence-bound.md'), renderMarkdown(report), 'utf-8');

  console.log(JSON.stringify({
    status: report.status,
    summary: report.files.summary,
    markdown: report.files.markdown,
    seekingCoverValidation: report.callsiteComparison.seekingCoverValidation,
    patrolDetection: report.callsiteComparison.patrolDetection,
    validation: report.captureComparison.validation,
    measurementTrust: report.captureComparison.measurementTrust,
  }, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
