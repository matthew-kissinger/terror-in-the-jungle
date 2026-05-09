#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type CaptureStatus = string | null;

interface CallsiteDelta {
  calls?: number | null;
  visible?: number | null;
  blocked?: number | null;
}

interface CallsiteWindow {
  label?: string;
  avgFrameMs?: number | null;
  deltas?: Record<string, CallsiteDelta | undefined>;
}

interface CallsiteCadencePacket {
  status?: CheckStatus;
  classification?: {
    callsiteChain?: string;
    acceptance?: string;
  };
  inputs?: {
    runtimeSamples?: string | null;
  };
  runtimeCallsiteWindows?: CallsiteWindow[] | null;
}

interface ValidationCheck {
  id?: string;
  status?: CheckStatus;
  value?: number | string | boolean | null;
  message?: string;
}

interface CaptureSummary {
  status?: string;
  failureReason?: string;
  validation?: {
    overall?: CheckStatus;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: CheckStatus;
    summary?: string;
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

interface CaptureComparison {
  captureStatus: {
    before: CaptureStatus;
    after: CaptureStatus;
  };
  validation: {
    before: CaptureStatus;
    after: CaptureStatus;
  };
  measurementTrust: {
    before: CaptureStatus;
    after: CaptureStatus;
  };
  avgFrameMs: {
    before: number | null;
    after: number | null;
    delta: number | null;
  };
  peakP99FrameMs: {
    before: number | null;
    after: number | null;
    delta: number | null;
  };
  heapEndGrowthMb: {
    before: number | null;
    after: number | null;
    delta: number | null;
  };
  heapRecoveryRatio: {
    before: number | null;
    after: number | null;
    delta: number | null;
  };
}

interface CallsiteComparison {
  callsite: string;
  beforeLateCalls: number | null;
  afterLateCalls: number | null;
  callDelta: number | null;
  reductionPercent: number | null;
}

interface CadenceBoundReport {
  createdAt: string;
  sourceGitSha: string;
  worktreeDirty: boolean;
  mode: 'projekt-143-engage-suppression-cadence-bound';
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
    lateWindowAvgFrameMs: {
      before: number | null;
      after: number | null;
      delta: number | null;
    };
    engageSuppressionCheck: CallsiteComparison;
    patrolDetection: CallsiteComparison;
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

const OUTPUT_NAME = 'projekt-143-engage-suppression-cadence-bound';

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'SUPPRESSION_VISIBILITY_RECHECK_MS = 250',
      'private suppressionVisibilityByCombatant',
      'private hasSuppressionLineOfSight(',
      'sample.visible',
      'this.hasSuppressionLineOfSight(combatant, target, playerPosition, canSeeTarget)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateEngage.test.ts',
    patterns: [
      'suppression visibility cadence',
      'reuses a recent visible suppression LOS result inside the cadence window',
      'rechecks suppression LOS after the cadence window expires',
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

function optionalOutputRoot(): string {
  const outputRoot = parseArg('output-root');
  return outputRoot
    ? resolve(outputRoot)
    : join(process.cwd(), 'artifacts', 'perf', timestampForPath());
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function gitStatusShort(): string {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim();
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

function delta(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return Number((after - before).toFixed(3));
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
  const callDelta = delta(afterLateCalls, beforeLateCalls);
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

function renderMarkdown(report: CadenceBoundReport): string {
  const engage = report.callsiteComparison.engageSuppressionCheck;
  const patrol = report.callsiteComparison.patrolDetection;
  const cover = report.callsiteComparison.seekingCoverValidation;
  return [
    '# Projekt Objekt-143 Engage Suppression Cadence Bound',
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
    `- Heap recovery: ${renderNumber(report.captureComparison.heapRecoveryRatio.before)} -> ${renderNumber(report.captureComparison.heapRecoveryRatio.after)}`,
    '',
    '## Late Window Callsite Comparison',
    `- engageSuppressionCheck: ${engage.beforeLateCalls} -> ${engage.afterLateCalls} calls, delta ${engage.callDelta}, reduction ${renderNumber(engage.reductionPercent, '%')}`,
    `- patrolDetection: ${patrol.beforeLateCalls} -> ${patrol.afterLateCalls} calls, delta ${patrol.callDelta}, reduction ${renderNumber(patrol.reductionPercent, '%')}`,
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
  const outputRoot = optionalOutputRoot();
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const beforeCallsite = readJson<CallsiteCadencePacket>(beforeCallsitePath);
  const afterCallsite = readJson<CallsiteCadencePacket>(afterCallsitePath);
  const beforeSummary = readJson<CaptureSummary>(beforeSummaryPath);
  const afterSummary = readJson<CaptureSummary>(afterSummaryPath);
  const anchors = SOURCE_SPECS.map(findAnchors);

  const engageComparison = compareCallsite(beforeCallsite, afterCallsite, 'engageSuppressionCheck');
  const patrolComparison = compareCallsite(beforeCallsite, afterCallsite, 'patrolDetection');
  const coverComparison = compareCallsite(beforeCallsite, afterCallsite, 'seekingCoverValidation');
  const afterValidation = afterSummary.validation?.overall ?? null;
  const afterMeasurementTrust = afterSummary.measurementTrust?.status ?? null;
  const anchorsPresent = anchors.every((anchor) => anchor.present);
  const engageReduced = (engageComparison.callDelta ?? 0) < 0;
  const status: CheckStatus = anchorsPresent && engageReduced
    ? afterValidation === 'pass' ? 'pass' : 'warn'
    : 'fail';

  const beforeLateAvg = lateWindow(beforeCallsite)?.avgFrameMs ?? null;
  const afterLateAvg = lateWindow(afterCallsite)?.avgFrameMs ?? null;
  const report: CadenceBoundReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    worktreeDirty: gitStatusShort().length > 0,
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
        after: afterValidation,
      },
      measurementTrust: {
        before: beforeSummary.measurementTrust?.status ?? null,
        after: afterMeasurementTrust,
      },
      avgFrameMs: {
        before: checkValue(beforeSummary, 'avg_frame_ms'),
        after: checkValue(afterSummary, 'avg_frame_ms'),
        delta: delta(checkValue(afterSummary, 'avg_frame_ms'), checkValue(beforeSummary, 'avg_frame_ms')),
      },
      peakP99FrameMs: {
        before: checkValue(beforeSummary, 'peak_p99_frame_ms'),
        after: checkValue(afterSummary, 'peak_p99_frame_ms'),
        delta: delta(checkValue(afterSummary, 'peak_p99_frame_ms'), checkValue(beforeSummary, 'peak_p99_frame_ms')),
      },
      heapEndGrowthMb: {
        before: checkValue(beforeSummary, 'heap_growth_mb'),
        after: checkValue(afterSummary, 'heap_growth_mb'),
        delta: delta(checkValue(afterSummary, 'heap_growth_mb'), checkValue(beforeSummary, 'heap_growth_mb')),
      },
      heapRecoveryRatio: {
        before: checkValue(beforeSummary, 'heap_recovery_ratio'),
        after: checkValue(afterSummary, 'heap_recovery_ratio'),
        delta: delta(checkValue(afterSummary, 'heap_recovery_ratio'), checkValue(beforeSummary, 'heap_recovery_ratio')),
      },
    },
    callsiteComparison: {
      lateWindowAvgFrameMs: {
        before: beforeLateAvg,
        after: afterLateAvg,
        delta: delta(afterLateAvg, beforeLateAvg),
      },
      engageSuppressionCheck: engageComparison,
      patrolDetection: patrolComparison,
      seekingCoverValidation: coverComparison,
      afterLateDominantCallsites: dominantLateCallsites(afterCallsite),
    },
    findings: [
      `The source anchor adds a ${SOURCE_SPECS[0].patterns[0].replace(' = ', '=')} positive-visibility reuse bound for suppression LOS.`,
      `Late-window engageSuppressionCheck calls moved ${engageComparison.beforeLateCalls} -> ${engageComparison.afterLateCalls}, a ${renderNumber(engageComparison.reductionPercent, '%')} reduction.`,
      `Late-window patrolDetection calls moved ${patrolComparison.beforeLateCalls} -> ${patrolComparison.afterLateCalls}; the residual LOS driver shifted to patrol fanout.`,
      `The post-change capture remains diagnostic for baseline work because validation is ${afterValidation} while measurement trust is ${afterMeasurementTrust}.`,
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until combat120 validation and perf compare pass together.',
      'Treat patrolDetection fanout as the next bounded DEFEKT-3 source target if the Politburo keeps the same driver.',
      'Do not expand combat behavior scope until this cadence packet is reviewed against human-visible close-actor behavior.',
    ],
    nonClaims: [
      'This packet does not certify a combat120 baseline refresh.',
      'This packet does not declare DEFEKT-3 complete.',
      'This packet does not certify human playtest acceptance of close-actor visual behavior.',
    ],
    files: {
      summary: rel(join(outputDir, 'engage-suppression-cadence-bound.json')),
      markdown: rel(join(outputDir, 'engage-suppression-cadence-bound.md')),
    },
  };

  writeFileSync(join(outputDir, 'engage-suppression-cadence-bound.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'engage-suppression-cadence-bound.md'), renderMarkdown(report), 'utf-8');

  console.log(JSON.stringify({
    status: report.status,
    summary: report.files.summary,
    markdown: report.files.markdown,
    engageSuppressionCheck: report.callsiteComparison.engageSuppressionCheck,
    validation: report.captureComparison.validation,
    measurementTrust: report.captureComparison.measurementTrust,
  }, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
