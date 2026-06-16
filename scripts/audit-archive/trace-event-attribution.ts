#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  finalFrameCount?: number;
  failureReason?: string | null;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
  };
  droppedFrameMetrics?: {
    browserRaf?: {
      stutter25Percent?: number;
      hitch33Percent?: number;
      estimatedDropped60HzFrames?: number;
      estimatedDropped60HzFramesPerSecond?: number;
    };
  };
  tailAttribution?: {
    conclusion?: string;
    loopFrameBreakdown?: {
      slowestCallbackMs?: number;
      slowestTimestampDeltaMs?: number;
      unmeasuredCallbackMs?: number;
      topSegments?: Array<{ name?: string; ms?: number; percentOfCallback?: number }>;
    } | null;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
}

interface TraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  tdur?: number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
}

interface EventSummary {
  bucket: string;
  name: string;
  cat: string;
  durationMs: number;
  threadDurationMs: number | null;
  tsMs: number | null;
  pid: number | null;
  tid: number | null;
}

interface BucketSummary {
  bucket: string;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  topEvents: EventSummary[];
  topNames: Array<{
    name: string;
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
  }>;
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-trace-event-attribution';
  status: Status;
  inputs: {
    artifactDir: string;
    summary: string;
    chromeTrace: string;
  };
  sourceSummary: {
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    scenarioMode: string | null;
    durationSeconds: number | null;
    finalFrameCount: number | null;
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  droppedFrameHighlights: {
    rafStutter25Percent: number | null;
    rafHitch33Percent: number | null;
    estimatedDropped60HzFrames: number | null;
    estimatedDropped60HzFramesPerSecond: number | null;
  };
  loopBreakdown: {
    slowestCallbackMs: number | null;
    slowestTimestampDeltaMs: number | null;
    unmeasuredCallbackMs: number | null;
    topSegments: Array<{ name: string; ms: number; percentOfCallback: number | null }>;
  };
  trace: {
    fileSizeBytes: number;
    eventCount: number;
    completeEventCount: number;
    spanMs: number | null;
    minTsMs: number | null;
    maxTsMs: number | null;
    longEventThresholdMs: number;
  };
  buckets: BucketSummary[];
  topEvents: EventSummary[];
  classification: {
    owner: string;
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

const OUTPUT_NAME = 'projekt-143-trace-event-attribution';
const LONG_EVENT_THRESHOLD_MS = 1;
const TOP_EVENT_LIMIT = 20;
const TOP_BUCKET_EVENT_LIMIT = 10;
const TOP_NAME_LIMIT = 8;

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
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function requireArtifactDir(): string {
  const value = argValue('--artifact');
  if (!value) {
    throw new Error(`Usage: npx tsx scripts/audit-archive/trace-event-attribution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function traceEvents(value: unknown): TraceEvent[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as TraceEvent[];
  }
  if (isRecord(value) && Array.isArray(value.traceEvents)) {
    return value.traceEvents.filter(isRecord) as TraceEvent[];
  }
  return [];
}

function bucketForEvent(event: TraceEvent): string {
  const name = String(event.name ?? '');
  const cat = String(event.cat ?? '');
  const haystack = `${cat} ${name}`;
  if (/blink\.user_timing|GameEngineLoop|SystemUpdater|RenderMain|RenderOverlay|Simulation\.updateSystems/i.test(haystack)) {
    return 'user_timing';
  }
  if (/\bGC\b|MajorGC|MinorGC|Garbage|CollectGarbage|V8\.GC|Scavenge|MarkCompact/i.test(haystack)) {
    return 'gc';
  }
  if (/gpu|commandbuffer|command_buffer|swapbuffers|swap.?buffers|present|drawandswap|display::|viz|submitcompositorframe|skia.*renderer/i.test(haystack)) {
    return 'gpu_present';
  }
  if (/beginmainframe|update.?layertree|commit|composite|paint|prepaint|raster|layout|recalculatestyle|style.?recalc|hit.?test|cc::|blink\.graphics/i.test(haystack)) {
    return 'render_commit_layout';
  }
  if (/FireAnimationFrame|RequestAnimationFrame|FunctionCall|EvaluateScript|EventDispatch|TimerFire|RunTask|ThreadControllerImpl|v8|devtools\.timeline|toplevel/i.test(haystack)) {
    return 'scripting_raf_task';
  }
  return 'other';
}

function summarizeEvent(event: TraceEvent): EventSummary | null {
  const dur = Number(event.dur ?? 0);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const durationMs = dur / 1000;
  if (durationMs < LONG_EVENT_THRESHOLD_MS) return null;
  return {
    bucket: bucketForEvent(event),
    name: String(event.name ?? ''),
    cat: String(event.cat ?? ''),
    durationMs: round(durationMs) ?? 0,
    threadDurationMs: round(typeof event.tdur === 'number' ? event.tdur / 1000 : null),
    tsMs: round(typeof event.ts === 'number' ? event.ts / 1000 : null),
    pid: typeof event.pid === 'number' ? event.pid : null,
    tid: typeof event.tid === 'number' ? event.tid : null,
  };
}

function percentile(values: number[], quantile: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function bucketSummaries(events: EventSummary[]): BucketSummary[] {
  const byBucket = new Map<string, EventSummary[]>();
  for (const event of events) {
    const existing = byBucket.get(event.bucket) ?? [];
    existing.push(event);
    byBucket.set(event.bucket, existing);
  }
  return Array.from(byBucket.entries())
    .map(([bucket, bucketEvents]) => {
      const byName = new Map<string, { count: number; totalDurationMs: number; maxDurationMs: number }>();
      for (const event of bucketEvents) {
        const current = byName.get(event.name) ?? { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
        current.count += 1;
        current.totalDurationMs += event.durationMs;
        current.maxDurationMs = Math.max(current.maxDurationMs, event.durationMs);
        byName.set(event.name, current);
      }
      const durations = bucketEvents.map((event) => event.durationMs);
      const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
      const maxDurationMs = durations.reduce((max, value) => Math.max(max, value), 0);
      return {
        bucket,
        count: bucketEvents.length,
        totalDurationMs: round(totalDurationMs) ?? 0,
        maxDurationMs: round(maxDurationMs) ?? 0,
        p95DurationMs: round(percentile(durations, 0.95)) ?? 0,
        topEvents: bucketEvents.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, TOP_BUCKET_EVENT_LIMIT),
        topNames: Array.from(byName.entries())
          .map(([name, aggregate]) => ({
            name,
            count: aggregate.count,
            totalDurationMs: round(aggregate.totalDurationMs) ?? 0,
            maxDurationMs: round(aggregate.maxDurationMs) ?? 0,
          }))
          .sort((a, b) => b.maxDurationMs - a.maxDurationMs)
          .slice(0, TOP_NAME_LIMIT),
      };
    })
    .sort((a, b) => b.maxDurationMs - a.maxDurationMs);
}

function bucketMax(buckets: BucketSummary[], bucket: string): number {
  return buckets.find((entry) => entry.bucket === bucket)?.maxDurationMs ?? 0;
}

function classify(summary: Summary, buckets: BucketSummary[], topEvents: EventSummary[]): Report['classification'] {
  const trusted = summary.measurementTrust?.status === 'pass';
  const top = topEvents[0];
  const scriptingMax = bucketMax(buckets, 'scripting_raf_task');
  const renderMax = bucketMax(buckets, 'render_commit_layout');
  const gpuMax = bucketMax(buckets, 'gpu_present');
  const gcMax = bucketMax(buckets, 'gc');
  const userTimingMax = bucketMax(buckets, 'user_timing');
  const renderPresentMax = Math.max(renderMax, gpuMax);
  if (gcMax >= 15 && gcMax >= Math.max(scriptingMax, renderPresentMax) * 0.75) {
    return {
      owner: 'trace_gc_contributor',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'diagnostic_only',
    };
  }
  if (renderPresentMax >= 25 && scriptingMax >= 25 && renderPresentMax >= scriptingMax * 0.8 && scriptingMax >= renderPresentMax * 0.8) {
    return {
      owner: 'trace_scripting_and_render_present_mixed',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'diagnostic_only',
    };
  }
  if (renderPresentMax >= 25 && renderPresentMax > scriptingMax * 1.2) {
    return {
      owner: gpuMax >= renderMax ? 'trace_gpu_present_boundary' : 'trace_render_commit_layout_boundary',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'diagnostic_only',
    };
  }
  if (scriptingMax >= 25 && scriptingMax >= renderPresentMax) {
    return {
      owner: 'trace_renderer_main_script_or_raf_task',
      confidence: trusted && userTimingMax >= scriptingMax * 0.5 ? 'medium' : 'low',
      acceptance: 'diagnostic_only',
    };
  }
  if (top && top.durationMs >= 25) {
    return {
      owner: `trace_top_event:${top.bucket}:${top.name || 'unknown'}`,
      confidence: 'low',
      acceptance: 'diagnostic_only',
    };
  }
  return {
    owner: 'trace_mixed_or_no_long_owner',
    confidence: 'low',
    acceptance: 'diagnostic_only',
  };
}

function traceSpan(events: TraceEvent[]): { minTsMs: number | null; maxTsMs: number | null; spanMs: number | null } {
  let minTsMs = Number.POSITIVE_INFINITY;
  let maxTsMs = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (typeof event.ts !== 'number' || !Number.isFinite(event.ts) || event.ts <= 0) {
      continue;
    }
    const tsMs = event.ts / 1000;
    minTsMs = Math.min(minTsMs, tsMs);
    maxTsMs = Math.max(maxTsMs, tsMs);
  }
  if (!Number.isFinite(minTsMs) || !Number.isFinite(maxTsMs)) {
    return { minTsMs: null, maxTsMs: null, spanMs: null };
  }
  return {
    minTsMs: round(minTsMs),
    maxTsMs: round(maxTsMs),
    spanMs: round(maxTsMs - minTsMs),
  };
}

function makeMarkdown(report: Report): string {
  const bucketRows = report.buckets.map((bucket) =>
    `| ${bucket.bucket} | ${bucket.count} | ${bucket.maxDurationMs} | ${bucket.p95DurationMs} | ${bucket.totalDurationMs} | ${bucket.topNames[0]?.name ?? 'n/a'} |`);
  const eventRows = report.topEvents.slice(0, TOP_EVENT_LIMIT).map((event) =>
    `| ${event.durationMs} | ${event.bucket} | ${event.name || 'n/a'} | ${event.cat || 'n/a'} |`);
  return [
    '# Projekt 143 Trace Event Attribution',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Trace',
    '',
    `- File size: ${report.trace.fileSizeBytes} bytes`,
    `- Events: ${report.trace.eventCount}`,
    `- Complete events: ${report.trace.completeEventCount}`,
    `- Span: ${report.trace.spanMs ?? 'n/a'}ms`,
    '',
    '## Buckets',
    '',
    '| Bucket | Count | Max ms | P95 ms | Total ms | Top name |',
    '|---|---:|---:|---:|---:|---|',
    ...bucketRows,
    '',
    '## Top Events',
    '',
    '| Duration ms | Bucket | Name | Category |',
    '|---:|---|---|---|',
    ...eventRows,
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
  ].join('\n');
}

function buildReport(artifactDir: string, outputDir: string): Report {
  const summaryPath = join(artifactDir, 'summary.json');
  const tracePath = join(artifactDir, 'chrome-trace.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(tracePath)) throw new Error(`Missing chrome-trace.json in ${artifactDir}`);

  const summary = readJson<Summary>(summaryPath);
  const trace = readJson<unknown>(tracePath);
  const events = traceEvents(trace);
  const completeEvents = events.filter((event) => event.ph === 'X');
  const longEvents = completeEvents
    .map(summarizeEvent)
    .filter((event): event is EventSummary => event !== null)
    .sort((a, b) => b.durationMs - a.durationMs);
  const buckets = bucketSummaries(longEvents);
  const classification = classify(summary, buckets, longEvents);
  const span = traceSpan(events);
  const traceSize = statSync(tracePath).size;
  const reportPath = join(outputDir, 'trace-event-attribution.json');
  const markdownPath = join(outputDir, 'trace-event-attribution.md');
  const top = longEvents[0] ?? null;
  const renderPresentMax = Math.max(bucketMax(buckets, 'render_commit_layout'), bucketMax(buckets, 'gpu_present'));
  const scriptingMax = bucketMax(buckets, 'scripting_raf_task');
  const userTimingMax = bucketMax(buckets, 'user_timing');
  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Dropped-frame highlights are rAF >25ms=${round(summary.droppedFrameMetrics?.browserRaf?.stutter25Percent) ?? 'n/a'}%, rAF >33ms=${round(summary.droppedFrameMetrics?.browserRaf?.hitch33Percent) ?? 'n/a'}%, dropped60=${summary.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFrames ?? 'n/a'}, and dropped60/s=${round(summary.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFramesPerSecond) ?? 'n/a'}.`,
    `Trace ${rel(tracePath)} contains ${events.length} events, ${completeEvents.length} complete events, ${longEvents.length} complete events >=${LONG_EVENT_THRESHOLD_MS}ms, and spans ${span.spanMs ?? 'n/a'}ms.`,
    top
      ? `Longest trace event is ${top.name || 'unknown'} in bucket ${top.bucket} at ${top.durationMs}ms.`
      : 'No complete trace event exceeded the long-event threshold.',
    `Bucket maxima: scripting/RAF=${round(scriptingMax) ?? 0}ms, userTiming=${round(userTimingMax) ?? 0}ms, render/present=${round(renderPresentMax) ?? 0}ms, GC=${round(bucketMax(buckets, 'gc')) ?? 0}ms.`,
    summary.tailAttribution?.loopFrameBreakdown
      ? `Runtime loop breakdown reported slowest callback ${round(summary.tailAttribution.loopFrameBreakdown.slowestCallbackMs) ?? 'n/a'}ms with unmeasured callback ${round(summary.tailAttribution.loopFrameBreakdown.unmeasuredCallbackMs) ?? 'n/a'}ms.`
      : 'Runtime loop breakdown was unavailable in summary tail attribution.',
    `Classification is ${classification.owner} with ${classification.confidence} confidence.`,
  ];

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: summary.measurementTrust?.status === 'pass' && longEvents.length > 0 ? 'warn' : 'fail',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      chromeTrace: rel(tracePath) ?? tracePath,
    },
    sourceSummary: {
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      finalFrameCount: summary.finalFrameCount ?? null,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    droppedFrameHighlights: {
      rafStutter25Percent: round(summary.droppedFrameMetrics?.browserRaf?.stutter25Percent),
      rafHitch33Percent: round(summary.droppedFrameMetrics?.browserRaf?.hitch33Percent),
      estimatedDropped60HzFrames: round(summary.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFrames, 0),
      estimatedDropped60HzFramesPerSecond: round(summary.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFramesPerSecond),
    },
    loopBreakdown: {
      slowestCallbackMs: round(summary.tailAttribution?.loopFrameBreakdown?.slowestCallbackMs),
      slowestTimestampDeltaMs: round(summary.tailAttribution?.loopFrameBreakdown?.slowestTimestampDeltaMs),
      unmeasuredCallbackMs: round(summary.tailAttribution?.loopFrameBreakdown?.unmeasuredCallbackMs),
      topSegments: (summary.tailAttribution?.loopFrameBreakdown?.topSegments ?? []).map((segment) => ({
        name: String(segment.name ?? ''),
        ms: round(segment.ms) ?? 0,
        percentOfCallback: round(segment.percentOfCallback, 4),
      })),
    },
    trace: {
      fileSizeBytes: traceSize,
      eventCount: events.length,
      completeEventCount: completeEvents.length,
      spanMs: span.spanMs,
      minTsMs: span.minTsMs,
      maxTsMs: span.maxTsMs,
      longEventThresholdMs: LONG_EVENT_THRESHOLD_MS,
    },
    buckets,
    topEvents: longEvents.slice(0, TOP_EVENT_LIMIT),
    classification,
    findings,
    nextActions: [
      'If scripting/RAF dominates and maps to GameEngineLoop user timings, optimize the named runtime segment while preserving scene content.',
      'If render/present or GPU boundaries dominate, avoid gameplay-system cuts and move to renderer/GPU state-change, material, or command-submission evidence.',
      'If GC dominates, inspect allocation-heavy runtime samples and heap-sampling evidence before changing render density.',
      'Do not use this trace packet as release proof; bind any runtime fix with fresh non-CDP Open Frontier and A Shau dropped-frame captures.',
    ],
    nonClaims: [
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize content, combat, wildlife, vegetation, shadow, or draw-distance cuts.',
      'This packet does not certify production performance because Chrome trace collection changes measurement conditions.',
      'This packet only ranks trace-window owners for the artifact that supplied chrome-trace.json.',
    ],
    files: {
      summary: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(artifactDir, outputDir);
  writeFileSync(join(outputDir, 'trace-event-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'trace-event-attribution.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 trace event attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`traceEvents=${report.trace.eventCount} spanMs=${report.trace.spanMs ?? 'n/a'} top=${report.topEvents[0]?.bucket ?? 'n/a'}:${report.topEvents[0]?.durationMs ?? 'n/a'}ms`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-trace-event-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
