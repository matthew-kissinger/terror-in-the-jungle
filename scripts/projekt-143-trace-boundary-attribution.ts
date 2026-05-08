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

interface UserTimingBucket {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
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
      userTimingByName?: Record<string, UserTimingBucket>;
    };
  };
  frameEvents?: RuntimeFrameEvent[];
}

interface ConsoleEntry {
  ts?: string;
  type?: string;
  text?: string;
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

interface ThreadLabel {
  processName: string;
  threadName: string;
}

interface RuntimeBoundary {
  sampleIndex: number;
  sampleTs: string | null;
  sampleFrameCount: number | null;
  frameCount: number | null;
  frameMs: number | null;
  atMs: number | null;
  hitch50: boolean | null;
  hitch100: boolean | null;
  recentLongTaskMaxMs: number | null;
  recentLongAnimationFrameMaxMs: number | null;
  recentLongAnimationFrameBlockingMs: number | null;
  topUserTimings: Array<{
    name: string;
    maxDurationMs: number | null;
    totalDurationMs: number | null;
    count: number | null;
  }>;
}

interface TraceSlice {
  name: string;
  category: string;
  durationMs: number;
  relativeStartMs: number;
  relativeEndMs: number;
  processName: string;
  threadName: string;
  source: string | null;
}

interface Signal {
  ts: string | null;
  type: string | null;
  text: string;
  kind: string;
  durationMs: number | null;
  details: Record<string, string | number | null>;
}

const OUTPUT_NAME = 'projekt-143-trace-boundary-attribution';

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
    throw new Error(`Usage: npx tsx scripts/projekt-143-trace-boundary-attribution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function fileSize(path: string): number | null {
  return existsSync(path) ? statSync(path).size : null;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function topUserTimings(sample: RuntimeSample, limit: number): RuntimeBoundary['topUserTimings'] {
  const timings = sample.browserStalls?.recent?.userTimingByName ?? {};
  return Object.entries(timings)
    .map(([name, bucket]) => ({
      name,
      maxDurationMs: round(bucket.maxDurationMs),
      totalDurationMs: round(bucket.totalDurationMs),
      count: typeof bucket.count === 'number' ? bucket.count : null
    }))
    .sort((a, b) => Number(b.maxDurationMs ?? 0) - Number(a.maxDurationMs ?? 0))
    .slice(0, limit);
}

function runtimeBoundaries(samples: RuntimeSample[]): RuntimeBoundary[] {
  const seen = new Set<string>();
  const boundaries: RuntimeBoundary[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const events = Array.isArray(sample.frameEvents) ? sample.frameEvents : [];
    for (const event of events) {
      const frameMs = Number(event.frameMs ?? 0);
      if (!Number.isFinite(frameMs) || frameMs < 50) continue;
      const key = [
        event.frameCount ?? 'unknown-frame',
        round(event.atMs, 1) ?? 'unknown-at',
        round(frameMs, 1)
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      boundaries.push({
        sampleIndex,
        sampleTs: sample.ts ?? null,
        sampleFrameCount: typeof sample.frameCount === 'number' ? sample.frameCount : null,
        frameCount: typeof event.frameCount === 'number' ? event.frameCount : null,
        frameMs: round(frameMs),
        atMs: round(event.atMs),
        hitch50: typeof event.hitch50 === 'boolean' ? event.hitch50 : null,
        hitch100: typeof event.hitch100 === 'boolean' ? event.hitch100 : null,
        recentLongTaskMaxMs: round(sample.browserStalls?.recent?.longTasks?.maxDurationMs),
        recentLongAnimationFrameMaxMs: round(sample.browserStalls?.recent?.longAnimationFrames?.maxDurationMs),
        recentLongAnimationFrameBlockingMs: round(sample.browserStalls?.recent?.longAnimationFrames?.blockingDurationMs),
        topUserTimings: topUserTimings(sample, 8)
      });
    }
  }
  return boundaries.sort((a, b) => {
    const frameDelta = Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0);
    if (frameDelta !== 0) return frameDelta;
    return Number(a.atMs ?? 0) - Number(b.atMs ?? 0);
  });
}

function traceEvents(path: string): TraceEvent[] {
  const parsed = readJson<{ traceEvents?: TraceEvent[] } | TraceEvent[]>(path);
  return Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [];
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

function metadataMap(events: TraceEvent[]): Map<string, ThreadLabel> {
  const processes = new Map<number, string>();
  const threads = new Map<string, string>();
  for (const event of events) {
    if (event.ph !== 'M') continue;
    const pid = Number(event.pid);
    const tid = Number(event.tid);
    const args = event.args ?? {};
    const name = typeof args.name === 'string' ? args.name : null;
    if (!Number.isFinite(pid) || !name) continue;
    if (event.name === 'process_name') processes.set(pid, name);
    if (event.name === 'thread_name' && Number.isFinite(tid)) threads.set(`${pid}:${tid}`, name);
  }
  const labels = new Map<string, ThreadLabel>();
  for (const [key, threadName] of threads) {
    const [pidText] = key.split(':');
    const pid = Number(pidText);
    labels.set(key, {
      processName: processes.get(pid) ?? `pid:${pidText}`,
      threadName
    });
  }
  return labels;
}

function eventSource(event: TraceEvent): string | null {
  const args = event.args ?? {};
  const data = typeof args.data === 'object' && args.data !== null
    ? args.data as Record<string, unknown>
    : args;
  const url = typeof data.url === 'string' ? data.url : '';
  const line = typeof data.lineNumber === 'number' ? data.lineNumber : null;
  const column = typeof data.columnNumber === 'number' ? data.columnNumber : null;
  const file = typeof data.src_file === 'string' ? data.src_file : '';
  const func = typeof data.src_func === 'string' ? data.src_func : '';
  if (url) {
    const suffix = line !== null ? `:${line}${column !== null ? `:${column}` : ''}` : '';
    return `${url}${suffix}`;
  }
  if (file || func) return [file, func].filter(Boolean).join(':');
  return null;
}

function timedTraceSlices(
  events: TraceEvent[],
  minTs: number | null,
  labels: Map<string, ThreadLabel>,
  predicate: (event: TraceEvent, label: ThreadLabel) => boolean,
  limit: number
): TraceSlice[] {
  if (minTs === null) return [];
  const slices: TraceSlice[] = [];
  for (const event of events) {
    if (typeof event.dur !== 'number' || event.dur <= 0) continue;
    const pid = Number(event.pid);
    const tid = Number(event.tid);
    const label = labels.get(`${pid}:${tid}`) ?? {
      processName: Number.isFinite(pid) ? `pid:${pid}` : 'unknown-process',
      threadName: Number.isFinite(tid) ? `tid:${tid}` : 'unknown-thread'
    };
    if (!predicate(event, label)) continue;
    const durationMs = Number(event.dur) / 1000;
    slices.push({
      name: String(event.name ?? 'unknown'),
      category: String(event.cat ?? 'unknown'),
      durationMs: round(durationMs) ?? 0,
      relativeStartMs: round((Number(event.ts) - minTs) / 1000) ?? 0,
      relativeEndMs: round((Number(event.ts) + Number(event.dur) - minTs) / 1000) ?? 0,
      processName: label.processName,
      threadName: label.threadName,
      source: eventSource(event)
    });
  }
  return slices
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function longTraceClusters(slices: TraceSlice[], thresholdMs: number): TraceSlice[] {
  return slices.filter((slice) => slice.durationMs >= thresholdMs);
}

function consoleSignals(entries: ConsoleEntry[]): Signal[] {
  const signals: Signal[] = [];
  for (const entry of entries) {
    const text = String(entry.text ?? '');
    const aiSpike = /\[combat-ai\] \[AI spike\] ([0-9.]+)ms combatant=([^\s]+) state=([^\s]+) squad=([^\s]+) target=([^\s]+)/.exec(text);
    if (aiSpike) {
      signals.push({
        ts: entry.ts ?? null,
        type: entry.type ?? null,
        text,
        kind: 'combat_ai_spike',
        durationMs: round(Number(aiSpike[1])),
        details: {
          combatant: aiSpike[2],
          state: aiSpike[3],
          squad: aiSpike[4],
          target: aiSpike[5]
        }
      });
      continue;
    }
    const slowFrame = /\[performance\] \[Perf\] Slow frame: ([0-9.]+)ms - Heavy systems: (.+)$/.exec(text);
    if (slowFrame) {
      signals.push({
        ts: entry.ts ?? null,
        type: entry.type ?? null,
        text,
        kind: 'slow_frame',
        durationMs: round(Number(slowFrame[1])),
        details: {
          heavySystems: slowFrame[2]
        }
      });
      continue;
    }
    const budget = /\[(SystemUpdater|combat-ai)\].*?(over budget|AI budget).*?([0-9.]+)ms/i.exec(text);
    if (budget) {
      signals.push({
        ts: entry.ts ?? null,
        type: entry.type ?? null,
        text,
        kind: 'budget_warning',
        durationMs: round(Number(budget[3])),
        details: {
          owner: budget[1],
          signal: budget[2]
        }
      });
    }
  }
  return signals.sort((a, b) => Number(b.durationMs ?? 0) - Number(a.durationMs ?? 0));
}

function signalSummary(signals: Signal[]): Record<string, { count: number; maxDurationMs: number | null }> {
  const grouped = new Map<string, { count: number; maxDurationMs: number | null }>();
  for (const signal of signals) {
    const entry = grouped.get(signal.kind) ?? { count: 0, maxDurationMs: null };
    entry.count += 1;
    if (signal.durationMs !== null && (entry.maxDurationMs === null || signal.durationMs > entry.maxDurationMs)) {
      entry.maxDurationMs = signal.durationMs;
    }
    grouped.set(signal.kind, entry);
  }
  return Object.fromEntries(grouped.entries());
}

function hasUserTiming(boundary: RuntimeBoundary | null, pattern: RegExp, thresholdMs: number): boolean {
  if (!boundary) return false;
  return boundary.topUserTimings.some((timing) => pattern.test(timing.name) && Number(timing.maxDurationMs ?? 0) >= thresholdMs);
}

function makeMarkdown(report: {
  status: Status;
  classification: { owner: string; confidence: string; acceptance: string };
  inputs: Record<string, string | null>;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
}): string {
  const lines = [
    '# Projekt Objekt-143 Trace Boundary Attribution',
    '',
    `- status: ${report.status}`,
    `- classification: ${report.classification.owner}`,
    `- confidence: ${report.classification.confidence}`,
    `- acceptance: ${report.classification.acceptance}`,
    `- artifact: ${report.inputs.artifactDir}`,
    '',
    '## Findings',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    ''
  ];
  return lines.join('\n');
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const consolePath = join(artifactDir, 'console.json');
  const tracePath = join(artifactDir, 'chrome-trace.json');
  const traceProbePath = join(artifactDir, 'projekt-143-max-frame-trace-probe', 'trace-probe.json');
  const isolationPath = join(artifactDir, 'projekt-143-trace-overhead-isolation', 'isolation.json');
  const outputDir = join(artifactDir, OUTPUT_NAME);

  const summary = readJson<Summary>(summaryPath);
  const samples = existsSync(runtimeSamplesPath) ? readJson<RuntimeSample[]>(runtimeSamplesPath) : [];
  const consoleEntries = existsSync(consolePath) ? readJson<ConsoleEntry[]>(consolePath) : [];
  const trace = existsSync(tracePath) ? traceEvents(tracePath) : [];
  const bounds = traceBounds(trace.filter((event) => event.ph !== 'M'));
  const labels = metadataMap(trace);
  const runtimeBoundaryList = runtimeBoundaries(samples);
  const firstBoundary = runtimeBoundaryList
    .slice()
    .sort((a, b) => Number(a.atMs ?? 0) - Number(b.atMs ?? 0))[0] ?? null;
  const maxBoundary = runtimeBoundaryList[0] ?? null;
  const signals = consoleSignals(consoleEntries);
  const topSignals = signals.slice(0, 16);
  const rendererMainSlices = timedTraceSlices(
    trace,
    bounds.minTs,
    labels,
    (_event, label) => label.processName === 'Renderer' && label.threadName === 'CrRendererMain',
    24
  );
  const gpuSlices = timedTraceSlices(
    trace,
    bounds.minTs,
    labels,
    (_event, label) => label.processName === 'GPU Process' || /Gpu/i.test(label.threadName),
    16
  );
  const traceInternalSlices = timedTraceSlices(
    trace,
    bounds.minTs,
    labels,
    (event) => /CpuProfiler::StartProfiling|TracingStartedInBrowser|process_name|thread_name/i.test(String(event.name ?? '')),
    12
  );
  const allSlices = timedTraceSlices(trace, bounds.minTs, labels, () => true, 32);
  const longRendererMain = longTraceClusters(rendererMainSlices, 50);
  const longGpu = longTraceClusters(gpuSlices, 40);
  const longTraceInternal = longTraceClusters(traceInternalSlices, 25);
  const representativeRafSlice = longRendererMain.find((slice) => slice.name === 'FunctionCall' && Boolean(slice.source))
    ?? longRendererMain.find((slice) => slice.name === 'FireAnimationFrame')
    ?? longRendererMain.find((slice) => /RunTask|ThreadControllerImpl::RunTask/.test(slice.name))
    ?? null;
  const representativeGpuSlice = longGpu.find((slice) => /GPUTask|TryScheduleSequence/.test(slice.name) || /gpu\/command_buffer/.test(slice.source ?? ''))
    ?? longGpu[0]
    ?? null;
  const combatSignals = signals.filter((signal) => signal.kind === 'combat_ai_spike');
  const slowFrameSignals = signals.filter((signal) => signal.kind === 'slow_frame');
  const hasFirstBoundaryCombatTiming = hasUserTiming(firstBoundary, /SystemUpdater\.Combat/, 50);
  const hasCombatAiSpike = combatSignals.some((signal) => Number(signal.durationMs ?? 0) >= 50);
  const hasLongRaf = longRendererMain.some((slice) => /FireAnimationFrame|FunctionCall|RunTask|ThreadControllerImpl::RunTask/.test(slice.name));
  const hasLongGpu = longGpu.length > 0;
  const hasTraceStartInternal = longTraceInternal.some((slice) => /CpuProfiler::StartProfiling/.test(slice.name));
  const measurementTrust = summary.measurementTrust?.status ?? null;
  const validationStatus = summary.validation?.overall ?? null;
  const traceSpanMs = bounds.minTs !== null && bounds.maxTs !== null ? round((bounds.maxTs - bounds.minTs) / 1000) : null;

  const status: Status = existsSync(tracePath) && samples.length > 0 ? 'warn' : 'fail';
  const owner = hasCombatAiSpike && hasFirstBoundaryCombatTiming && hasLongRaf && hasLongGpu
    ? 'runtime_combat_spike_plus_late_raf_gpu_clusters'
    : hasCombatAiSpike && hasFirstBoundaryCombatTiming
      ? 'first_boundary_runtime_combat_spike_late_owner_unresolved'
      : hasLongRaf && hasLongGpu
        ? 'trace_raf_gpu_clusters_without_runtime_combat_boundary'
        : existsSync(tracePath)
          ? 'trace_boundary_owner_unresolved'
          : 'trace_missing';

  mkdirSync(outputDir, { recursive: true });

  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${validationStatus ?? 'unknown'}, and measurement trust ${measurementTrust ?? 'unknown'}.`,
    `Runtime frame-event ring reports ${runtimeBoundaryList.length} unique frames at or above 50ms; first boundary frame ${firstBoundary?.frameCount ?? 'unknown'} at page ${firstBoundary?.atMs ?? 'unknown'}ms records ${firstBoundary?.frameMs ?? 'unknown'}ms, and max boundary frame ${maxBoundary?.frameCount ?? 'unknown'} records ${maxBoundary?.frameMs ?? 'unknown'}ms.`,
    hasFirstBoundaryCombatTiming
      ? `First runtime boundary carries SystemUpdater.Combat max ${firstBoundary?.topUserTimings.find((timing) => timing.name === 'SystemUpdater.Combat')?.maxDurationMs ?? 'unknown'}ms in the runtime observer window.`
      : 'First runtime boundary does not carry a >=50ms SystemUpdater.Combat user-timing maximum in the exported observer window.',
    hasCombatAiSpike
      ? `Console records combat AI spike ${combatSignals[0]?.durationMs ?? 'unknown'}ms: ${combatSignals[0]?.details.combatant ?? 'unknown'} state=${combatSignals[0]?.details.state ?? 'unknown'} squad=${combatSignals[0]?.details.squad ?? 'unknown'} target=${combatSignals[0]?.details.target ?? 'unknown'}.`
      : 'Console does not record a >=50ms combat AI spike signal in this packet.',
    `Console slow-frame max is ${slowFrameSignals[0]?.durationMs ?? 'n/a'}ms; signal counts are ${JSON.stringify(signalSummary(signals))}.`,
    `Chrome trace contains ${trace.length} events over ${traceSpanMs ?? 'unknown'}ms; renderer-main longest slice is ${rendererMainSlices[0]?.name ?? 'none'} ${rendererMainSlices[0]?.durationMs ?? 'n/a'}ms at relative ${rendererMainSlices[0]?.relativeStartMs ?? 'n/a'}ms.`,
    hasLongRaf
      ? `Renderer-main RAF/FunctionCall boundary is present: ${representativeRafSlice?.name ?? 'unknown'} ${representativeRafSlice?.durationMs ?? 'unknown'}ms source ${representativeRafSlice?.source ?? 'unknown'}.`
      : 'Renderer-main RAF/FunctionCall boundary above 50ms is absent.',
    hasLongGpu
      ? `GPU command-buffer boundary is present: ${representativeGpuSlice?.name ?? 'unknown'} ${representativeGpuSlice?.durationMs ?? 'unknown'}ms source ${representativeGpuSlice?.source ?? 'unknown'}.`
      : 'GPU command-buffer boundary above 40ms is absent.',
    hasTraceStartInternal
      ? `Trace-start instrumentation event ${longTraceInternal[0]?.name ?? 'unknown'} ${longTraceInternal[0]?.durationMs ?? 'unknown'}ms is isolated as trace-internal and is not treated as runtime owner.`
      : 'No long trace-start instrumentation event was found.',
    'The trace and runtime frame clocks are reported as separate domains; this packet does not assert exact timestamp identity between page frameEvents and Chrome trace relative times.'
  ];

  const leadingCombatSignal = combatSignals[0];
  const leadingCombatSignalText = leadingCombatSignal
    ? `${leadingCombatSignal.details.combatant ?? 'unknown'} in ${leadingCombatSignal.details.state ?? 'unknown'} state`
    : 'no combat AI spike signal';

  const nextActions = [
    'Keep STABILIZAT-1 baseline refresh blocked until a standard combat120 capture and perf:compare are clean.',
    `Instrument source-level user timings around the combat AI patrol/high-LOD update path before changing behavior; this packet names ${leadingCombatSignalText} but not the TypeScript callsite.`,
    'Generate or retain source-map resolution for perf builds before assigning the renderer-main bundle callsite at index-DgRsSaJr.js:1736:12289 to a repository owner.',
    'Bind any runtime code change with a fresh standard combat120 capture, then rerun this sidecar and perf:compare before updating baselines.'
  ];

  const nonClaims = [
    'This packet does not complete DEFEKT-3.',
    'This packet does not authorize a combat120 baseline refresh.',
    'This packet does not prove that Chrome trace collection caused the max-frame failure.',
    'This packet does not assign the late renderer-main bundle callsite to a TypeScript source file without source-map evidence.'
  ];

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      summary: rel(summaryPath),
      runtimeSamples: existsSync(runtimeSamplesPath) ? rel(runtimeSamplesPath) : null,
      console: existsSync(consolePath) ? rel(consolePath) : null,
      chromeTrace: existsSync(tracePath) ? rel(tracePath) : null,
      traceProbe: existsSync(traceProbePath) ? rel(traceProbePath) : null,
      traceOverheadIsolation: existsSync(isolationPath) ? rel(isolationPath) : null
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: validationStatus,
      measurementTrust,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      finalFrameCount: summary.finalFrameCount ?? null
    },
    validationHighlights: {
      samplesCollected: validationCheck(summary, 'samples_collected'),
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      frameProgression: validationCheck(summary, 'frame_progression'),
      measurementTrust: validationCheck(summary, 'measurement_trust')
    },
    runtimeBoundaries: {
      countOver50Ms: runtimeBoundaryList.length,
      firstBoundary,
      maxBoundary,
      topBoundaries: runtimeBoundaryList.slice(0, 12)
    },
    consoleSignals: {
      summary: signalSummary(signals),
      topSignals
    },
    traceBoundary: {
      present: existsSync(tracePath),
      fileSizeBytes: fileSize(tracePath),
      eventCount: trace.length,
      spanMs: traceSpanMs,
      rendererMainTop: rendererMainSlices.slice(0, 12),
      rendererMainLongOver50Ms: longRendererMain,
      gpuTop: gpuSlices.slice(0, 8),
      gpuLongOver40Ms: longGpu,
      traceInternalLong: longTraceInternal,
      allTop: allSlices.slice(0, 12)
    },
    classification: {
      owner,
      confidence: measurementTrust === 'pass' ? 'medium' : 'low',
      acceptance: 'owner_review_only'
    },
    findings,
    nextActions,
    nonClaims,
    files: {
      summary: rel(join(outputDir, 'boundary-attribution.json')),
      markdown: rel(join(outputDir, 'boundary-attribution.md'))
    }
  };

  const reportPath = join(outputDir, 'boundary-attribution.json');
  const markdownPath = join(outputDir, 'boundary-attribution.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');

  console.log(`Projekt 143 trace boundary attribution ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${owner}/${report.classification.confidence}`);
  console.log(`runtimeBoundaries=${runtimeBoundaryList.length} traceEvents=${trace.length}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-trace-boundary-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
