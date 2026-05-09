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
  failureReason?: string | null;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    sampleCount?: number;
    missedSampleRate?: number;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
}

interface RuntimeFrameEvent {
  frameCount?: number;
  frameMs?: number;
  atMs?: number;
  previousMaxFrameMs?: number;
  newMax?: boolean;
  hitch33?: boolean;
  hitch50?: boolean;
  hitch100?: boolean;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
  frameEvents?: RuntimeFrameEvent[];
  browserStalls?: {
    recent?: {
      longTasks?: {
        count?: number;
        maxDurationMs?: number;
      };
      longAnimationFrames?: {
        count?: number;
        maxDurationMs?: number;
        blockingDurationMs?: number;
      };
      userTimingByName?: Record<string, {
        maxDurationMs?: number;
      }>;
    };
  };
}

interface TraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
}

interface CpuNode {
  id: number;
  callFrame?: {
    functionName?: string;
    url?: string;
  };
}

interface CpuProfile {
  nodes?: CpuNode[];
  samples?: number[];
  timeDeltas?: number[];
  startTime?: number;
  endTime?: number;
}

interface TopEvent {
  name: string;
  category: string;
  durationMs: number;
  relativeStartMs: number;
  relativeEndMs: number;
  source: string | null;
}

const OUTPUT_NAME = 'projekt-143-max-frame-trace-probe';

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
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
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function requireArtifactDir(): string {
  const value = argValue('--artifact');
  if (!value) {
    throw new Error('Usage: npx tsx scripts/projekt-143-max-frame-trace-probe.ts --artifact <perf-artifact-dir>');
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function firstPeakSample(samples: RuntimeSample[]): RuntimeSample | null {
  let peak: RuntimeSample | null = null;
  for (const sample of samples) {
    const value = Number(sample.maxFrameMs ?? 0);
    if (!Number.isFinite(value)) continue;
    if (!peak || value > Number(peak.maxFrameMs ?? 0)) peak = sample;
  }
  return peak;
}

function firstRuntimeFrameEvent(samples: RuntimeSample[]): RuntimeFrameEvent | null {
  const events = samples.flatMap((sample) => Array.isArray(sample.frameEvents) ? sample.frameEvents : []);
  const over50 = events.find((event) => Number(event.frameMs ?? 0) >= 50);
  if (over50) return over50;
  return events.sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0))[0] ?? null;
}

function maxRuntimeFrameEvent(samples: RuntimeSample[]): RuntimeFrameEvent | null {
  let maxEvent: RuntimeFrameEvent | null = null;
  for (const sample of samples) {
    if (!Array.isArray(sample.frameEvents)) continue;
    for (const event of sample.frameEvents) {
      const frameMs = Number(event.frameMs ?? 0);
      if (!Number.isFinite(frameMs)) continue;
      const maxFrameMs = Number(maxEvent?.frameMs ?? 0);
      if (!maxEvent || frameMs > maxFrameMs) maxEvent = event;
    }
  }
  return maxEvent;
}

function traceEvents(path: string): TraceEvent[] {
  const parsed = readJson<{ traceEvents?: TraceEvent[] } | TraceEvent[]>(path);
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [];
  return events.filter((event) => typeof event.ts === 'number' && event.ts > 0 && event.ph !== 'M');
}

function eventSource(event: TraceEvent): string | null {
  const args = event.args ?? {};
  const data = typeof args.data === 'object' && args.data !== null
    ? args.data as Record<string, unknown>
    : args;
  const url = typeof data.url === 'string' ? data.url : '';
  const file = typeof data.src_file === 'string' ? data.src_file : '';
  const func = typeof data.src_func === 'string' ? data.src_func : '';
  if (url) return url;
  if (file || func) return [file, func].filter(Boolean).join(':');
  return null;
}

function topTraceEvents(events: TraceEvent[], limit: number): TopEvent[] {
  const timed = events.filter((event) => typeof event.dur === 'number');
  let minTs = Number.POSITIVE_INFINITY;
  for (const event of events) {
    const ts = Number(event.ts);
    if (Number.isFinite(ts) && ts < minTs) minTs = ts;
  }
  if (!Number.isFinite(minTs)) minTs = 0;
  return timed
    .sort((a, b) => Number(b.dur) - Number(a.dur))
    .slice(0, limit)
    .map((event) => ({
      name: String(event.name ?? 'unknown'),
      category: String(event.cat ?? 'unknown'),
      durationMs: round(Number(event.dur) / 1000) ?? 0,
      relativeStartMs: round((Number(event.ts) - minTs) / 1000) ?? 0,
      relativeEndMs: round((Number(event.ts) + Number(event.dur) - minTs) / 1000) ?? 0,
      source: eventSource(event)
    }));
}

function countLongEvents(events: TraceEvent[], pattern: RegExp): { count: number; maxDurationMs: number | null } {
  let count = 0;
  let max: number | null = null;
  for (const event of events) {
    if (!pattern.test(String(event.name ?? '')) || typeof event.dur !== 'number') continue;
    count++;
    const durationMs = Number(event.dur) / 1000;
    if (Number.isFinite(durationMs) && (max === null || durationMs > max)) max = durationMs;
  }
  return { count, maxDurationMs: round(max) };
}

function traceBounds(events: TraceEvent[]): { minTs: number | null; maxTs: number | null } {
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    const ts = Number(event.ts);
    if (!Number.isFinite(ts)) continue;
    const endTs = ts + Number(event.dur ?? 0);
    if (ts < minTs) minTs = ts;
    if (Number.isFinite(endTs) && endTs > maxTs) maxTs = endTs;
  }
  return {
    minTs: Number.isFinite(minTs) ? minTs : null,
    maxTs: Number.isFinite(maxTs) ? maxTs : null
  };
}

function groupedLongEvents(events: TraceEvent[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const event of events) {
    const durationMs = Number(event.dur ?? 0) / 1000;
    if (durationMs < 50) continue;
    const name = String(event.name ?? 'unknown');
    groups[name] = (groups[name] ?? 0) + 1;
  }
  return groups;
}

function summarizeCpuProfile(path: string): Array<{ functionName: string; url: string; selfMs: number }> {
  const profile = readJson<CpuProfile>(path);
  const nodes = new Map<number, CpuNode>((profile.nodes ?? []).map((node) => [node.id, node]));
  const totals = new Map<string, { functionName: string; url: string; selfMs: number }>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const node = nodes.get(samples[i]);
    const frame = node?.callFrame ?? {};
    const functionName = frame.functionName || '(anonymous)';
    const url = frame.url || '';
    if (functionName === '(program)' || functionName === '(idle)') continue;
    const selfMs = Number(deltas[i] ?? 0) / 1000;
    const key = `${functionName}|${url}`;
    const entry = totals.get(key) ?? { functionName, url, selfMs: 0 };
    entry.selfMs += selfMs;
    totals.set(key, entry);
  }
  return [...totals.values()]
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 12)
    .map((entry) => ({ ...entry, selfMs: round(entry.selfMs) ?? 0 }));
}

function fileSize(path: string): number | null {
  return existsSync(path) ? statSync(path).size : null;
}

function writeMarkdown(path: string, report: Record<string, unknown>): void {
  const lines = [
    '# Projekt Objekt-143 Max-Frame Trace Probe',
    '',
    `- status: ${report.status}`,
    `- classification: ${(report.classification as Record<string, unknown>).owner}`,
    `- artifact: ${report.inputs && (report.inputs as Record<string, unknown>).artifactDir}`,
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
  const artifactDir = requireArtifactDir();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const measurementTrustPath = join(artifactDir, 'measurement-trust.json');
  const tracePath = join(artifactDir, 'chrome-trace.json');
  const cpuProfilePath = join(artifactDir, 'cpu-profile.cpuprofile');
  const heapSamplingPath = join(artifactDir, 'heap-sampling.json');

  const summary = readJson<Summary>(summaryPath);
  const samples = existsSync(runtimeSamplesPath) ? readJson<RuntimeSample[]>(runtimeSamplesPath) : [];
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const tracePresent = existsSync(tracePath);
  const cpuProfilePresent = existsSync(cpuProfilePath);
  const heapSamplingPresent = existsSync(heapSamplingPath);
  const traceOnly = tracePresent && !cpuProfilePresent && !heapSamplingPresent;
  const events = tracePresent ? traceEvents(tracePath) : [];
  const { minTs: minTraceTs, maxTs: maxTraceTs } = traceBounds(events);
  const traceSpanMs = minTraceTs !== null && maxTraceTs !== null ? round((maxTraceTs - minTraceTs) / 1000) : null;
  const topEvents = events.length > 0 ? topTraceEvents(events, 16) : [];
  const gcSummary = countLongEvents(events, /GC|Garbage|Collect/i);
  const gpuSummary = countLongEvents(events, /GPUTask|Swap|Submit|Present|CommandBuffer|TryScheduleSequence/i);
  const renderCommitSummary = countLongEvents(events, /Commit|DrawFrame|BeginFrame|Composite|Paint|Raster|ScheduleBeginFrame/i);
  const longEventGroups = groupedLongEvents(events);
  const cpuTopSelf = cpuProfilePresent ? summarizeCpuProfile(cpuProfilePath) : [];
  const peakSample = firstPeakSample(samples);
  const peakEvent = firstRuntimeFrameEvent(samples);
  const maxFrameEvent = maxRuntimeFrameEvent(samples);
  const measurementStatus = summary.measurementTrust?.status ?? readJson<{ status?: string }>(measurementTrustPath).status ?? null;
  const validationStatus = summary.validation?.overall ?? null;
  const traceHasLongGpu = topEvents.some((event) => /GPUTask|TryScheduleSequence/.test(event.name) || /gpu\/command_buffer/.test(event.source ?? ''));
  const traceHasLongCommit = topEvents.some((event) => /Commit|ScheduledActionSendBeginMainFrame/.test(event.name) || /cc\/trees\/proxy_impl/.test(event.source ?? ''));
  const traceHasGcBlocker = (gcSummary.maxDurationMs ?? 0) >= 10;
  const status: Status = tracePresent ? 'warn' : 'fail';
  const owner = !tracePresent
    ? 'trace_not_captured'
    : measurementStatus === 'pass'
      ? traceOnly
        ? 'focused_trace_only_measurement_trusted'
        : 'focused_trace_captured_requires_owner_review'
      : traceHasLongGpu || traceHasLongCommit
        ? 'trace_captured_under_untrusted_deep_cdp_gpu_commit_stalls'
        : 'trace_captured_under_untrusted_deep_cdp_overhead';

  const findings = [
    `Focused artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${validationStatus ?? 'unknown'}, and measurement trust ${measurementStatus ?? 'unknown'}.`,
    tracePresent
      ? `Chrome trace was captured (${fileSize(tracePath)} bytes, ${events.length} events, span ${traceSpanMs}ms).`
      : 'Chrome trace was not captured.',
    `Runtime samples record ${samples.length} samples; peak sample frame=${peakSample?.frameCount ?? 'unknown'} max=${peakSample?.maxFrameMs ?? 'unknown'}ms, first >50ms frame event frame=${peakEvent?.frameCount ?? 'unknown'} at ${round(peakEvent?.atMs)}ms for ${peakEvent?.frameMs ?? 'unknown'}ms, and max frame event frame=${maxFrameEvent?.frameCount ?? 'unknown'} at ${round(maxFrameEvent?.atMs)}ms for ${maxFrameEvent?.frameMs ?? 'unknown'}ms.`,
    `Longest trace event is ${topEvents[0]?.name ?? 'none'} at ${topEvents[0]?.durationMs ?? 'n/a'}ms; GPU-like max=${gpuSummary.maxDurationMs ?? 'n/a'}ms and render/commit-like max=${renderCommitSummary.maxDurationMs ?? 'n/a'}ms.`,
    `GC-like trace events count=${gcSummary.count}, max=${gcSummary.maxDurationMs ?? 'n/a'}ms; GC is ${traceHasGcBlocker ? 'a possible blocker in this trace' : 'not a >10ms blocker in this trace'}.`,
    traceOnly
      ? 'This is a trace-only CDP packet; CPU profile and heap sampling were intentionally suppressed to reduce probe overhead.'
      : 'This packet includes additional CDP profiling or heap sampling artifacts when present.',
    cpuProfilePresent
      ? `CPU profile was captured (${fileSize(cpuProfilePath)} bytes); top non-idle self sample is ${cpuTopSelf[0]?.functionName ?? 'none'} at ${cpuTopSelf[0]?.selfMs ?? 'n/a'}ms.`
      : 'CPU profile was not captured.',
    heapSamplingPresent
      ? `Heap sampling was captured (${fileSize(heapSamplingPath)} bytes).`
      : 'Heap sampling was not captured.'
  ];

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      summary: rel(summaryPath),
      runtimeSamples: rel(runtimeSamplesPath),
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      measurementTrust: existsSync(measurementTrustPath) ? rel(measurementTrustPath) : null,
      chromeTrace: tracePresent ? rel(tracePath) : null,
      cpuProfile: cpuProfilePresent ? rel(cpuProfilePath) : null,
      heapSampling: heapSamplingPresent ? rel(heapSamplingPath) : null
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: validationStatus,
      measurementTrust: measurementStatus,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      finalFrameCount: summary.finalFrameCount ?? null
    },
    validationHighlights: {
      samplesCollected: validationCheck(summary, 'samples_collected'),
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      hitch50Percent: validationCheck(summary, 'hitch_50ms_percent'),
      measurementTrust: validationCheck(summary, 'measurement_trust')
    },
    runtimeBoundary: {
      sampleCount: samples.length,
      peakSample: peakSample ? {
        ts: peakSample.ts ?? null,
        frameCount: peakSample.frameCount ?? null,
        avgFrameMs: peakSample.avgFrameMs ?? null,
        p99FrameMs: peakSample.p99FrameMs ?? null,
        maxFrameMs: peakSample.maxFrameMs ?? null,
        hitch50Count: peakSample.hitch50Count ?? null,
        recentLongTaskMaxMs: peakSample.browserStalls?.recent?.longTasks?.maxDurationMs ?? null,
        recentLongAnimationFrameMaxMs: peakSample.browserStalls?.recent?.longAnimationFrames?.maxDurationMs ?? null,
        topUserTiming: peakSample.browserStalls?.recent?.userTimingByName ?? null
      } : null,
      firstRuntimeFrameEvent: peakEvent ?? null,
      maxRuntimeFrameEvent: maxFrameEvent ?? null
    },
    trace: {
      present: tracePresent,
      fileSizeBytes: fileSize(tracePath),
      eventCount: events.length,
      spanMs: traceSpanMs,
      topEvents,
      longEventGroups,
      gpuLike: gpuSummary,
      renderCommitLike: renderCommitSummary,
      gcLike: gcSummary
    },
    cpuProfile: {
      present: cpuProfilePresent,
      fileSizeBytes: fileSize(cpuProfilePath),
      topSelf: cpuTopSelf
    },
    heapSampling: {
      present: heapSamplingPresent,
      fileSizeBytes: fileSize(heapSamplingPath)
    },
    classification: {
      owner,
      confidence: measurementStatus === 'pass' ? 'medium' : 'low',
      acceptance: measurementStatus === 'pass' && traceOnly ? 'owner_review_only' : 'diagnostic_only'
    },
    findings,
    nextActions: measurementStatus === 'pass' && traceOnly
      ? [
        'Do not refresh combat120 baselines from this trace packet.',
        'Use this trace-only packet as owner-review input for the max-frame path, then bind any source change with a fresh standard combat120 capture.',
        'Use the trace facts to separate GC from GPU/commit/present-like stalls before attempting runtime tuning.',
        'Keep CPU and heap attribution separate from trace ownership unless a new packet proves combined CDP probes remain measurement-trusted.'
      ]
      : [
        'Do not refresh combat120 baselines from this trace packet.',
        'Treat this capture as proof that focused trace collection can write chrome-trace.json, but that deep-CDP still invalidates performance comparison trust in this configuration.',
        'Use the trace facts to separate GC from GPU/commit/present-like stalls before attempting runtime tuning.',
        'Next packet should reduce probe overhead or isolate trace collection from full CPU/heap profiling before using CDP output as owner proof.'
      ],
    nonClaims: [
      'This packet does not prove a production runtime fix.',
      'This packet does not supersede the measurement-trusted combat120 artifact.',
      'This packet does not authorize perf-baseline refresh because measurement trust failed.'
    ],
    files: {
      summary: rel(join(outputDir, 'trace-probe.json')),
      markdown: rel(join(outputDir, 'trace-probe.md'))
    }
  };

  const reportPath = join(outputDir, 'trace-probe.json');
  const markdownPath = join(outputDir, 'trace-probe.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeMarkdown(markdownPath, report);

  console.log(`Projekt 143 max-frame trace probe ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${owner}/${report.classification.confidence}`);
  console.log(`trace=${tracePresent ? `${events.length} events` : 'missing'} measurementTrust=${measurementStatus ?? 'unknown'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-max-frame-trace-probe failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
