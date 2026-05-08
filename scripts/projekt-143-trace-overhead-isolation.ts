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

interface CaptureSummary {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  status?: string;
  failureReason?: string | null;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: MeasurementTrust;
  harnessOverhead?: {
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    sampleCount?: number;
  };
  startupTiming?: {
    thresholdReachedSec?: number;
  };
}

interface MeasurementTrust {
  status?: string;
  probeRoundTripAvgMs?: number;
  probeRoundTripP95Ms?: number;
  probeRoundTripMaxMs?: number;
  sampleCount?: number;
  missedSampleRate?: number;
}

interface TraceProbe {
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  trace?: {
    present?: boolean;
    fileSizeBytes?: number | null;
    eventCount?: number;
    spanMs?: number | null;
    gpuLike?: {
      maxDurationMs?: number | null;
    };
    renderCommitLike?: {
      maxDurationMs?: number | null;
    };
    gcLike?: {
      maxDurationMs?: number | null;
    };
  };
  cpuProfile?: {
    present?: boolean;
  };
  heapSampling?: {
    present?: boolean;
  };
}

const OUTPUT_NAME = 'projekt-143-trace-overhead-isolation';

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function requireDir(flag: string): string {
  const value = argValue(flag);
  if (!value) throw new Error(`Usage: npx tsx scripts/projekt-143-trace-overhead-isolation.ts ${flag} <artifact-dir> --control <artifact-dir>`);
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory for ${flag}: ${value}`);
  return resolved;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function check(summary: CaptureSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((entry) => entry.id === id) ?? null;
}

function numberCheck(summary: CaptureSummary, id: string): number | null {
  const value = check(summary, id)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fileSize(path: string): number | null {
  return existsSync(path) ? statSync(path).size : null;
}

function summarizeCapture(dir: string, label: string): Record<string, unknown> {
  const summary = readJson<CaptureSummary>(join(dir, 'summary.json'));
  const measurementPath = join(dir, 'measurement-trust.json');
  const measurement = existsSync(measurementPath)
    ? readJson<MeasurementTrust>(measurementPath)
    : summary.measurementTrust ?? {};

  return {
    label,
    artifactDir: rel(dir),
    captureStatus: summary.status ?? null,
    failureReason: summary.failureReason ?? null,
    validation: summary.validation?.overall ?? null,
    measurementTrust: measurement.status ?? null,
    probeRoundTripAvgMs: round(measurement.probeRoundTripAvgMs ?? summary.harnessOverhead?.probeRoundTripAvgMs),
    probeRoundTripP95Ms: round(measurement.probeRoundTripP95Ms ?? summary.harnessOverhead?.probeRoundTripP95Ms),
    sampleCount: measurement.sampleCount ?? summary.harnessOverhead?.sampleCount ?? null,
    finalFrameCount: summary.finalFrameCount ?? null,
    startupThresholdSeconds: summary.startupTiming?.thresholdReachedSec ?? null,
    samplesCollected: check(summary, 'samples_collected'),
    avgFrameMs: check(summary, 'avg_frame_ms'),
    peakP99FrameMs: check(summary, 'peak_p99_frame_ms'),
    peakMaxFrameMs: check(summary, 'peak_max_frame_ms'),
    maxFrameStallSeconds: check(summary, 'max_frame_stall_seconds'),
    aiBudgetStarvationEvents: check(summary, 'ai_budget_starvation_events'),
    harnessMinShotsFired: check(summary, 'harness_min_shots_fired'),
    measurementTrustCheck: check(summary, 'measurement_trust'),
    chromeTraceBytes: fileSize(join(dir, 'chrome-trace.json')),
    cpuProfileBytes: fileSize(join(dir, 'cpu-profile.cpuprofile')),
    heapSamplingBytes: fileSize(join(dir, 'heap-sampling.json'))
  };
}

function writeMarkdown(path: string, report: Record<string, unknown>): void {
  const lines = [
    '# Projekt Objekt-143 Trace Overhead Isolation',
    '',
    `- status: ${report.status}`,
    `- classification: ${(report.classification as Record<string, unknown>).owner}`,
    `- trace artifact: ${((report.inputs as Record<string, unknown>).traceArtifactDir as string)}`,
    `- control artifact: ${((report.inputs as Record<string, unknown>).controlArtifactDir as string)}`,
    '',
    '## Findings',
    ...((report.findings as string[]) ?? []).map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    ...((report.nextActions as string[]) ?? []).map((action) => `- ${action}`),
    ''
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

function main(): void {
  const traceDir = requireDir('--trace');
  const controlDir = requireDir('--control');
  const outputDir = join(traceDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const traceSummary = readJson<CaptureSummary>(join(traceDir, 'summary.json'));
  const controlSummary = readJson<CaptureSummary>(join(controlDir, 'summary.json'));
  const traceProbePath = join(traceDir, 'projekt-143-max-frame-trace-probe', 'trace-probe.json');
  const traceProbe = existsSync(traceProbePath) ? readJson<TraceProbe>(traceProbePath) : null;
  const traceMeasurement = traceSummary.measurementTrust ?? readJson<MeasurementTrust>(join(traceDir, 'measurement-trust.json'));
  const controlMeasurement = controlSummary.measurementTrust ?? readJson<MeasurementTrust>(join(controlDir, 'measurement-trust.json'));

  const traceValidation = traceSummary.validation?.overall ?? null;
  const controlValidation = controlSummary.validation?.overall ?? null;
  const traceTrust = traceMeasurement.status ?? null;
  const controlTrust = controlMeasurement.status ?? null;
  const avgProbeDeltaMs = round((traceMeasurement.probeRoundTripAvgMs ?? 0) - (controlMeasurement.probeRoundTripAvgMs ?? 0));
  const p95ProbeDeltaMs = round((traceMeasurement.probeRoundTripP95Ms ?? 0) - (controlMeasurement.probeRoundTripP95Ms ?? 0));
  const sampleDelta = (traceMeasurement.sampleCount ?? 0) - (controlMeasurement.sampleCount ?? 0);
  const controlAvgFrame = numberCheck(controlSummary, 'avg_frame_ms');
  const traceAvgFrame = numberCheck(traceSummary, 'avg_frame_ms');
  const owner = controlTrust !== 'pass' || controlValidation === 'fail'
    ? 'control_capture_shape_untrusted_before_trace'
    : traceTrust !== 'pass'
      ? 'trace_collection_overhead_untrusted'
      : 'trace_collection_overhead_not_detected';
  const status: Status = owner === 'trace_collection_overhead_not_detected' ? 'pass' : 'warn';
  const controlTrusted = controlTrust === 'pass' && controlValidation !== 'fail';
  const traceTrusted = traceTrust === 'pass';
  const overheadIsolated = controlTrusted && traceTrusted;

  const findings = [
    `Trace-only artifact ${rel(traceDir)} captured Chrome trace bytes=${fileSize(join(traceDir, 'chrome-trace.json')) ?? 'missing'} with validation ${traceValidation ?? 'unknown'} and measurement trust ${traceTrust ?? 'unknown'}.`,
    `Control artifact ${rel(controlDir)} is the non-trace comparison packet with validation ${controlValidation ?? 'unknown'} and measurement trust ${controlTrust ?? 'unknown'}.`,
    `Control probe avg/p95=${round(controlMeasurement.probeRoundTripAvgMs)}/${round(controlMeasurement.probeRoundTripP95Ms)}ms; trace-only probe avg/p95=${round(traceMeasurement.probeRoundTripAvgMs)}/${round(traceMeasurement.probeRoundTripP95Ms)}ms; deltas avg/p95=${avgProbeDeltaMs}/${p95ProbeDeltaMs}ms and samples delta=${sampleDelta}.`,
    `Control avg frame=${controlAvgFrame ?? 'unknown'}ms; trace-only avg frame=${traceAvgFrame ?? 'unknown'}ms. Trace validation remains ${traceValidation ?? 'unknown'}, so this packet isolates collection overhead only and does not authorize a baseline refresh.`,
    traceProbe
      ? `Trace sidecar classification=${traceProbe.classification?.owner ?? 'unknown'}; GPU-like max=${traceProbe.trace?.gpuLike?.maxDurationMs ?? 'n/a'}ms, render/commit-like max=${traceProbe.trace?.renderCommitLike?.maxDurationMs ?? 'n/a'}ms, GC-like max=${traceProbe.trace?.gcLike?.maxDurationMs ?? 'n/a'}ms.`
      : 'Trace sidecar is missing; the isolation packet cannot classify trace event owners beyond capture-level trust.',
    overheadIsolated
      ? 'Probe deltas do not identify Chrome trace collection as the runtime stall owner.'
      : 'Capture trust is insufficient to isolate Chrome trace collection from runtime stall behavior.'
  ];

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      traceArtifactDir: rel(traceDir),
      controlArtifactDir: rel(controlDir),
      traceProbe: existsSync(traceProbePath) ? rel(traceProbePath) : null
    },
    traceCapture: summarizeCapture(traceDir, 'trace-only'),
    controlCapture: summarizeCapture(controlDir, 'no-cdp-control'),
    comparison: {
      probeRoundTripAvgDeltaMs: avgProbeDeltaMs,
      probeRoundTripP95DeltaMs: p95ProbeDeltaMs,
      sampleCountDelta: sampleDelta,
      traceHasChromeTrace: existsSync(join(traceDir, 'chrome-trace.json')),
      controlHasChromeTrace: existsSync(join(controlDir, 'chrome-trace.json'))
    },
    traceProbe: traceProbe ? {
      classification: traceProbe.classification ?? null,
      trace: traceProbe.trace ?? null,
      cpuProfile: traceProbe.cpuProfile ?? null,
      heapSampling: traceProbe.heapSampling ?? null
    } : null,
    classification: {
      owner,
      confidence: controlTrust !== 'pass' || controlValidation === 'fail' ? 'high' : traceTrust === 'pass' ? 'medium' : 'low',
      acceptance: 'harness_diagnostic_only'
    },
    findings,
    nextActions: owner === 'control_capture_shape_untrusted_before_trace'
      ? [
        'Do not use the trace or control packets for perf-baseline decisions.',
        'Align any future trace isolation to the production-shaped combat120 harness command before testing trace overhead again.',
        'Keep the measurement-trusted standard artifact as the current comparison authority until a trace packet passes the same trust gate.'
      ]
      : [
        'Do not refresh baselines from the trace packet.',
        'If trace overhead is isolated, reduce tracing categories or move trace collection to a narrower window.',
        'Bind any runtime source change with a fresh standard combat120 capture.'
      ],
    nonClaims: [
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize combat120 baseline refresh.',
      overheadIsolated
        ? 'This packet does not prove GPU/commit stalls are production owners; it only keeps Chrome trace collection from being the measured overhead owner.'
        : 'This packet does not prove GPU/commit stalls are production owners because capture trust is insufficient.'
    ],
    files: {
      summary: rel(join(outputDir, 'isolation.json')),
      markdown: rel(join(outputDir, 'isolation.md'))
    }
  };

  const jsonPath = join(outputDir, 'isolation.json');
  const markdownPath = join(outputDir, 'isolation.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  writeMarkdown(markdownPath, report);

  console.log(`Projekt 143 trace overhead isolation ${status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`classification=${owner}/${report.classification.confidence}`);
  console.log(`traceTrust=${traceTrust ?? 'unknown'} controlTrust=${controlTrust ?? 'unknown'} avgDeltaMs=${avgProbeDeltaMs ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-trace-overhead-isolation failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
