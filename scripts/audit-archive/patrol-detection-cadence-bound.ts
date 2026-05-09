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
  status?: CheckStatus;
  runtimeCallsiteWindows?: CallsiteWindow[] | null;
}

interface ValidationCheck {
  id?: string;
  status?: CheckStatus;
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

interface CaptureComparison {
  captureStatus: {
    before: string | null;
    after: string | null;
  };
  validation: {
    before: CheckStatus | null;
    after: CheckStatus | null;
  };
  measurementTrust: {
    before: CheckStatus | null;
    after: CheckStatus | null;
  };
  avgFrameMs: MetricComparison;
  peakP99FrameMs: MetricComparison;
  heapEndGrowthMb: MetricComparison;
  heapPeakGrowthMb: MetricComparison;
  heapRecoveryRatio: MetricComparison;
}

interface CallsiteComparison {
  callsite: string;
  beforeLateCalls: number | null;
  afterLateCalls: number | null;
  callDelta: number | null;
  reductionPercent: number | null;
}

interface PatrolCadenceReport {
  createdAt: string;
  sourceGitSha: string;
  worktreeDirty: boolean;
  mode: 'projekt-143-patrol-detection-cadence-bound';
  status: CheckStatus;
  inputs: {
    beforeCallsite: string;
    afterCallsite: string;
    beforeSummary: string;
    afterSummary: string;
  };
  sourceAnchors: AnchorResult[];
  captureComparison: CaptureComparison;
  callsiteComparison: {
    lateWindowAvgFrameMs: MetricComparison;
    patrolDetection: CallsiteComparison;
    engageSuppressionCheck: CallsiteComparison;
    seekingCoverValidation: CallsiteComparison;
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

const OUTPUT_NAME = 'projekt-143-patrol-detection-cadence-bound';

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStatePatrol.ts',
    patterns: [
      'PATROL_VISIBILITY_RECHECK_MS = 250',
      'private patrolVisibilityByCombatant',
      'this.hasPatrolLineOfSight(combatant, enemy, playerPosition, canSeeTarget)',
      'private hasPatrolLineOfSight(',
      'PATROL_VISIBILITY_RECHECK_MS',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStatePatrol.test.ts',
    patterns: [
      'reuses a recent blocked patrol LOS result inside the cadence window',
      'rechecks patrol LOS after the cadence window expires',
      'expect(canSeeTarget).not.toHaveBeenCalled()',
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
  return configured
    ? resolve(configured)
    : join(process.cwd(), 'artifacts', 'perf', timestampForPath());
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

function renderMarkdown(report: PatrolCadenceReport): string {
  const patrol = report.callsiteComparison.patrolDetection;
  const engage = report.callsiteComparison.engageSuppressionCheck;
  const cover = report.callsiteComparison.seekingCoverValidation;

  return [
    '# Projekt Objekt-143 Patrol Detection Cadence Bound',
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
    `- Heap end-growth: ${renderNumber(report.captureComparison.heapEndGrowthMb.before, 'MB')} -> ${renderNumber(report.captureComparison.heapEndGrowthMb.after, 'MB')}`,
    `- Heap peak-growth: ${renderNumber(report.captureComparison.heapPeakGrowthMb.before, 'MB')} -> ${renderNumber(report.captureComparison.heapPeakGrowthMb.after, 'MB')}`,
    `- Heap recovery: ${renderNumber(report.captureComparison.heapRecoveryRatio.before)} -> ${renderNumber(report.captureComparison.heapRecoveryRatio.after)}`,
    '',
    '## Late Window Callsite Comparison',
    `- patrolDetection: ${patrol.beforeLateCalls} -> ${patrol.afterLateCalls} calls, delta ${patrol.callDelta}, reduction ${renderNumber(patrol.reductionPercent, '%')}`,
    `- engageSuppressionCheck: ${engage.beforeLateCalls} -> ${engage.afterLateCalls} calls, delta ${engage.callDelta}, reduction ${renderNumber(engage.reductionPercent, '%')}`,
    `- seekingCoverValidation: ${cover.beforeLateCalls} -> ${cover.afterLateCalls} calls, delta ${cover.callDelta}, reduction ${renderNumber(cover.reductionPercent, '%')}`,
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
  const patrolComparison = compareCallsite(beforeCallsite, afterCallsite, 'patrolDetection');
  const engageComparison = compareCallsite(beforeCallsite, afterCallsite, 'engageSuppressionCheck');
  const coverComparison = compareCallsite(beforeCallsite, afterCallsite, 'seekingCoverValidation');
  const afterValidation = afterSummary.validation?.overall ?? null;
  const anchorsPresent = anchors.every((anchor) => anchor.present);
  const patrolReduced = (patrolComparison.callDelta ?? 0) < 0;
  const status: CheckStatus = anchorsPresent && patrolReduced
    ? afterValidation === 'pass' ? 'pass' : 'warn'
    : 'fail';

  const report: PatrolCadenceReport = {
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
      heapEndGrowthMb: compareMetric(checkValue(beforeSummary, 'heap_growth_mb'), checkValue(afterSummary, 'heap_growth_mb')),
      heapPeakGrowthMb: compareMetric(checkValue(beforeSummary, 'heap_peak_growth_mb'), checkValue(afterSummary, 'heap_peak_growth_mb')),
      heapRecoveryRatio: compareMetric(checkValue(beforeSummary, 'heap_recovery_ratio'), checkValue(afterSummary, 'heap_recovery_ratio')),
    },
    callsiteComparison: {
      lateWindowAvgFrameMs: compareMetric(lateWindow(beforeCallsite)?.avgFrameMs ?? null, lateWindow(afterCallsite)?.avgFrameMs ?? null),
      patrolDetection: patrolComparison,
      engageSuppressionCheck: engageComparison,
      seekingCoverValidation: coverComparison,
      afterLateDominantCallsites: dominantLateCallsites(afterCallsite),
    },
    findings: [
      'The source anchor adds a PATROL_VISIBILITY_RECHECK_MS=250 per-combatant patrol LOS reuse bound while preserving very-close detection bypass.',
      `Late-window patrolDetection calls moved ${patrolComparison.beforeLateCalls} -> ${patrolComparison.afterLateCalls}, a ${renderNumber(patrolComparison.reductionPercent, '%')} reduction.`,
      `Late-window engageSuppressionCheck calls moved ${engageComparison.beforeLateCalls} -> ${engageComparison.afterLateCalls}; the prior suppression bound remains active in the follow-up capture.`,
      `Late-window seekingCoverValidation calls moved ${coverComparison.beforeLateCalls} -> ${coverComparison.afterLateCalls}, making cover validation the next residual LOS pressure source.`,
      `The post-change capture is ${afterSummary.validation?.overall ?? 'unknown'} with measurement trust ${afterSummary.measurementTrust?.status ?? 'unknown'}, so the packet remains warning-class evidence rather than baseline authorization.`,
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until combat120 validation and perf compare pass together.',
      'Interrogate seekingCoverValidation or the max-frame event path next if the Politburo keeps DEFEKT-3 as driver.',
      'Run human close-actor playtest before treating LOS cadence reuse as game-feel accepted.',
    ],
    nonClaims: [
      'This packet does not certify a combat120 baseline refresh.',
      'This packet does not declare DEFEKT-3 complete.',
      'This packet does not certify human playtest acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'patrol-detection-cadence-bound.json')),
      markdown: rel(join(outputDir, 'patrol-detection-cadence-bound.md')),
    },
  };

  writeFileSync(join(outputDir, 'patrol-detection-cadence-bound.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'patrol-detection-cadence-bound.md'), renderMarkdown(report), 'utf-8');

  console.log(JSON.stringify({
    status: report.status,
    summary: report.files.summary,
    markdown: report.files.markdown,
    patrolDetection: report.callsiteComparison.patrolDetection,
    validation: report.captureComparison.validation,
    measurementTrust: report.captureComparison.measurementTrust,
  }, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
