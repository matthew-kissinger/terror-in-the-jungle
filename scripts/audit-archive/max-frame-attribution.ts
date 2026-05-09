#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface ValidationCheck {
  id?: string;
  status?: string;
  value?: number | string | null;
  message?: string;
}

interface PerfSummary {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  status?: string;
  failureReason?: string;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    sampleCount?: number;
    probeRoundTripP95Ms?: number;
  };
  scenario?: {
    mode?: string;
  };
}

interface TimingSummary {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
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
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
  hitch100Count?: number;
  heapUsedMb?: number;
  frameEvents?: RuntimeFrameEvent[];
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
  };
  browserStalls?: {
    support?: {
      longtask?: boolean;
      longAnimationFrame?: boolean;
      userTiming?: boolean;
      webglTextureUpload?: boolean;
    };
    totals?: {
      longTaskCount?: number;
      longTaskTotalDurationMs?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameTotalDurationMs?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      webglTextureUploadCount?: number;
      webglTextureUploadTotalDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      userTimingByName?: Record<string, TimingSummary>;
    };
    recent?: {
      longTasks?: {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
        entries?: Array<{ name?: string; startTime?: number; duration?: number }>;
      };
      longAnimationFrames?: {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
        blockingDurationMs?: number;
        entries?: Array<{ startTime?: number; duration?: number; blockingDuration?: number }>;
      };
      webglTextureUploadTop?: Array<{
        operation?: string;
        startTime?: number;
        duration?: number;
        sourceUrl?: string;
        width?: number;
        height?: number;
        byteLength?: number;
      }>;
      userTimingByName?: Record<string, TimingSummary>;
    };
  };
}

interface UserTimingOwner {
  name: string | null;
  maxDurationMs: number | null;
}

interface SpikeSample {
  index: number;
  ts: string | null;
  frameCount: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  hitch50Count: number | null;
  hitch100Count: number | null;
  heapUsedMb: number | null;
  renderer: RuntimeSample['renderer'] | null;
  longTaskCount: number;
  longTaskMaxMs: number | null;
  longAnimationFrameCount: number;
  longAnimationFrameMaxMs: number | null;
  longAnimationFrameBlockingMs: number | null;
  webglTextureUploadCount: number;
  webglTextureUploadMaxMs: number | null;
  webglTextureUploadTop: RuntimeSample['browserStalls']['recent']['webglTextureUploadTop'];
  runtimeFrameEventCount: number;
  peakRuntimeFrameEvent: RuntimeFrameEvent | null;
  runtimeFrameEventsOver50: RuntimeFrameEvent[];
  topUserTiming: UserTimingOwner;
  userTimingMaximaOver1Ms: Record<string, number>;
}

interface MaxFrameAttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-max-frame-attribution';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    validation: string | null;
    measurementTrust: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    failureReason: string | null;
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  frameWindow: {
    sampleCount: number;
    peakMaxFrameMs: number | null;
    firstPeakSample: SpikeSample | null;
    samplesWithRecentLongTasks: SpikeSample[];
    samplesWithRecentLongAnimationFrames: SpikeSample[];
    hitch50Events: number;
    hitch100Events: number;
  };
  classification: {
    maxFrameOwner: string;
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

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-max-frame-attribution';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

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

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function findLatestPerfArtifact(mode: string | null): string {
  if (!existsSync(ARTIFACT_ROOT)) throw new Error(`Missing artifact root ${ARTIFACT_ROOT}`);
  const candidates = readdirSync(ARTIFACT_ROOT)
    .map((name) => join(ARTIFACT_ROOT, name))
    .filter((path) => statSync(path).isDirectory())
    .filter((path) => existsSync(join(path, 'summary.json')) && existsSync(join(path, 'runtime-samples.json')))
    .map((path) => ({ path, summary: readJson<PerfSummary>(join(path, 'summary.json')) }))
    .filter((entry) => entry.summary.status === 'ok')
    .filter((entry) => !mode || entry.summary.scenario?.mode === mode)
    .sort((a, b) => String(b.summary.startedAt ?? '').localeCompare(String(a.summary.startedAt ?? '')));
  const latest = candidates[0];
  if (!latest) throw new Error(`No perf capture artifact found for mode ${mode ?? '(any)'}`);
  return latest.path;
}

function numericMax(values: Array<number | undefined | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function userTimingOwner(timings: Record<string, TimingSummary> | undefined): UserTimingOwner {
  let owner: UserTimingOwner = { name: null, maxDurationMs: null };
  for (const [name, timing] of Object.entries(timings ?? {})) {
    const duration = Number(timing.maxDurationMs ?? 0);
    if (!Number.isFinite(duration)) continue;
    if (owner.maxDurationMs === null || duration > owner.maxDurationMs) {
      owner = { name, maxDurationMs: duration };
    }
  }
  return { name: owner.name, maxDurationMs: round(owner.maxDurationMs) };
}

function userTimingOver1ms(timings: Record<string, TimingSummary> | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(timings ?? {})
      .map(([name, timing]) => [name, round(Number(timing.maxDurationMs ?? 0))] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === 'number' && entry[1] >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
  );
}

function normalizedFrameEvents(sample: RuntimeSample): RuntimeFrameEvent[] {
  return (sample.frameEvents ?? [])
    .map((event): RuntimeFrameEvent | null => {
      const frameMs = round(event.frameMs);
      if (typeof frameMs !== 'number' || !Number.isFinite(frameMs)) return null;
      return {
        frameCount: round(event.frameCount, 0) ?? undefined,
        frameMs,
        atMs: round(event.atMs) ?? undefined,
        previousMaxFrameMs: round(event.previousMaxFrameMs) ?? undefined,
        newMax: Boolean(event.newMax),
        hitch33: Boolean(event.hitch33),
        hitch50: Boolean(event.hitch50),
        hitch100: Boolean(event.hitch100),
      };
    })
    .filter((event): event is RuntimeFrameEvent => event !== null);
}

function peakRuntimeFrameEvent(sample: RuntimeSample): RuntimeFrameEvent | null {
  const events = normalizedFrameEvents(sample);
  if (events.length === 0) return null;
  const maxFrame = Number(sample.maxFrameMs ?? 0);
  const exact = events
    .filter((event) => Math.abs(Number(event.frameMs ?? 0) - maxFrame) <= 0.5)
    .sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0))[0];
  if (exact) return exact;
  return [...events].sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0))[0] ?? null;
}

function spikeSample(sample: RuntimeSample, index: number): SpikeSample {
  const recent = sample.browserStalls?.recent;
  const totals = sample.browserStalls?.totals;
  const topUploads = recent?.webglTextureUploadTop ?? [];
  const recentUserTimings = recent?.userTimingByName ?? totals?.userTimingByName;
  const frameEvents = normalizedFrameEvents(sample);
  return {
    index,
    ts: sample.ts ?? null,
    frameCount: round(sample.frameCount, 0),
    avgFrameMs: round(sample.avgFrameMs),
    p99FrameMs: round(sample.p99FrameMs),
    maxFrameMs: round(sample.maxFrameMs),
    hitch50Count: round(sample.hitch50Count, 0),
    hitch100Count: round(sample.hitch100Count, 0),
    heapUsedMb: round(sample.heapUsedMb),
    renderer: sample.renderer ?? null,
    longTaskCount: Number(recent?.longTasks?.count ?? 0),
    longTaskMaxMs: round(recent?.longTasks?.maxDurationMs ?? totals?.longTaskMaxDurationMs),
    longAnimationFrameCount: Number(recent?.longAnimationFrames?.count ?? 0),
    longAnimationFrameMaxMs: round(recent?.longAnimationFrames?.maxDurationMs ?? totals?.longAnimationFrameMaxDurationMs),
    longAnimationFrameBlockingMs: round(recent?.longAnimationFrames?.blockingDurationMs ?? totals?.longAnimationFrameBlockingDurationMs),
    webglTextureUploadCount: Number(totals?.webglTextureUploadCount ?? 0),
    webglTextureUploadMaxMs: round(
      numericMax(topUploads.map((entry) => entry.duration)) ?? totals?.webglTextureUploadMaxDurationMs,
    ),
    webglTextureUploadTop: topUploads.slice(0, 8),
    runtimeFrameEventCount: frameEvents.length,
    peakRuntimeFrameEvent: peakRuntimeFrameEvent(sample),
    runtimeFrameEventsOver50: frameEvents.filter((event) => Number(event.frameMs ?? 0) >= 50).slice(-12),
    topUserTiming: userTimingOwner(recentUserTimings),
    userTimingMaximaOver1Ms: userTimingOver1ms(recentUserTimings),
  };
}

function deltaEvents(samples: RuntimeSample[], key: 'hitch50Count' | 'hitch100Count'): number {
  let previous = Number(samples[0]?.[key] ?? 0);
  let events = 0;
  for (const sample of samples.slice(1)) {
    const current = Number(sample[key] ?? previous);
    if (current > previous) events += current - previous;
    previous = current;
  }
  return events;
}

function classify(firstPeakSample: SpikeSample | null): MaxFrameAttributionReport['classification'] {
  if (!firstPeakSample) {
    return {
      maxFrameOwner: 'no_runtime_samples',
      confidence: 'low',
      acceptance: 'diagnostic_only',
    };
  }
  const maxFrame = firstPeakSample.maxFrameMs ?? 0;
  const longTask = firstPeakSample.longTaskMaxMs ?? 0;
  const longAnimationFrame = firstPeakSample.longAnimationFrameMaxMs ?? 0;
  const webgl = firstPeakSample.webglTextureUploadMaxMs ?? 0;
  const userTiming = firstPeakSample.topUserTiming.maxDurationMs ?? 0;
  if (maxFrame >= 90 && longTask >= 90 && webgl < 1 && userTiming < longTask * 0.25) {
    return {
      maxFrameOwner: 'browser_native_gc_or_uninstrumented_render_present',
      confidence: longAnimationFrame >= longTask * 0.9 ? 'high' : 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (maxFrame >= 50 && longAnimationFrame >= maxFrame * 0.9 && webgl < 1 && userTiming < maxFrame * 0.5) {
    return {
      maxFrameOwner: 'browser_long_animation_frame_without_instrumented_system_or_webgl_owner',
      confidence: firstPeakSample.peakRuntimeFrameEvent ? 'high' : 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (maxFrame >= 50 && webgl >= maxFrame * 0.5) {
    return {
      maxFrameOwner: 'webgl_texture_upload',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }
  if (maxFrame >= 50 && userTiming >= maxFrame * 0.5 && firstPeakSample.topUserTiming.name) {
    return {
      maxFrameOwner: `instrumented_system:${firstPeakSample.topUserTiming.name}`,
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (maxFrame >= 50 && longTask <= 0 && longAnimationFrame <= 0) {
    return {
      maxFrameOwner: 'frame_metric_peak_without_observer_longtask',
      confidence: 'low',
      acceptance: 'diagnostic_only',
    };
  }
  return {
    maxFrameOwner: 'mixed_or_insufficient_attribution',
    confidence: 'low',
    acceptance: 'diagnostic_only',
  };
}

function buildReport(artifactDir: string, outputDir: string): MaxFrameAttributionReport {
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const measurementTrustPath = join(artifactDir, 'measurement-trust.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const peakMaxFrameMs = numericMax(samples.map((sample) => sample.maxFrameMs));
  const firstPeak = peakMaxFrameMs === null
    ? null
    : samples
      .map((sample, index) => ({ sample, index }))
      .find((entry) => Number(entry.sample.maxFrameMs ?? 0) >= peakMaxFrameMs);
  const firstPeakSample = firstPeak ? spikeSample(firstPeak.sample, firstPeak.index) : null;
  const longTaskSamples = samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => Number(sample.browserStalls?.recent?.longTasks?.count ?? 0) > 0)
    .map(({ sample, index }) => spikeSample(sample, index));
  const longAnimationFrameSamples = samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => Number(sample.browserStalls?.recent?.longAnimationFrames?.count ?? 0) > 0)
    .map(({ sample, index }) => spikeSample(sample, index));
  const classification = classify(firstPeakSample);
  const reportPath = join(outputDir, 'max-frame-attribution.json');
  const markdownPath = join(outputDir, 'max-frame-attribution.md');
  const findings = [
    firstPeakSample
      ? `First peak sample index ${firstPeakSample.index} records max-frame ${firstPeakSample.maxFrameMs}ms, long task ${firstPeakSample.longTaskMaxMs}ms, long-animation-frame ${firstPeakSample.longAnimationFrameMaxMs}ms, and blocking ${firstPeakSample.longAnimationFrameBlockingMs}ms.`
      : 'No peak sample was available.',
    firstPeakSample?.peakRuntimeFrameEvent
      ? `RuntimeMetrics frame-event ring records frame ${firstPeakSample.peakRuntimeFrameEvent.frameCount ?? 'n/a'} at ${firstPeakSample.peakRuntimeFrameEvent.frameMs ?? 'n/a'}ms inside the first peak sample.`
      : 'RuntimeMetrics frame-event ring data is absent from the first peak sample.',
    firstPeakSample
      ? `At first peak, WebGL texture upload max is ${firstPeakSample.webglTextureUploadMaxMs}ms and top user timing is ${firstPeakSample.topUserTiming.name ?? 'none'} at ${firstPeakSample.topUserTiming.maxDurationMs ?? 'n/a'}ms.`
      : 'No WebGL or user-timing comparison was available.',
    `Classification is ${classification.maxFrameOwner} with ${classification.confidence} confidence.`,
  ];
  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-max-frame-attribution',
    status: summary.measurementTrust?.status === 'pass' && firstPeakSample ? 'warn' : 'fail',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      measurementTrust: existsSync(measurementTrustPath) ? rel(measurementTrustPath) : null,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      failureReason: summary.failureReason ?? null,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      hitch50Percent: validationCheck(summary, 'hitch_50ms_percent'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    frameWindow: {
      sampleCount: samples.length,
      peakMaxFrameMs: round(peakMaxFrameMs),
      firstPeakSample,
      samplesWithRecentLongTasks: longTaskSamples,
      samplesWithRecentLongAnimationFrames: longAnimationFrameSamples,
      hitch50Events: deltaEvents(samples, 'hitch50Count'),
      hitch100Events: deltaEvents(samples, 'hitch100Count'),
    },
    classification,
    findings,
    nextActions: [
      'Do not refresh combat120 baseline from this packet.',
      'Treat the max-frame failure as outside current SystemUpdater and WebGL texture-upload attribution until a lower-level render/present or GC probe proves otherwise.',
      'Use the RuntimeMetrics frame-event ring as the accepted boundary marker for future peak-frame packets.',
      'If a future peak event lacks long-task/LoAF correlation, run a focused CDP trace window around that frame event.',
    ],
    nonClaims: [
      'This sidecar does not prove a runtime fix.',
      'This sidecar does not authorize a perf baseline refresh.',
      'This sidecar does not identify an exact browser/native function without a focused CDP trace.',
    ],
    files: {
      summary: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };
}

function markdown(report: MaxFrameAttributionReport): string {
  const first = report.frameWindow.firstPeakSample;
  return [
    '# Projekt 143 Max-Frame Attribution',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Peak max-frame: ${report.frameWindow.peakMaxFrameMs ?? 'n/a'}ms`,
    `- Classification: ${report.classification.maxFrameOwner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## First Peak Sample',
    '',
    `- Sample index: ${first?.index ?? 'n/a'}`,
    `- Timestamp: ${first?.ts ?? 'n/a'}`,
    `- Frame count: ${first?.frameCount ?? 'n/a'}`,
    `- Avg frame: ${first?.avgFrameMs ?? 'n/a'}ms`,
    `- P99 frame: ${first?.p99FrameMs ?? 'n/a'}ms`,
    `- Max frame: ${first?.maxFrameMs ?? 'n/a'}ms`,
    `- Long task max: ${first?.longTaskMaxMs ?? 'n/a'}ms`,
    `- Long animation frame max: ${first?.longAnimationFrameMaxMs ?? 'n/a'}ms`,
    `- Long animation blocking: ${first?.longAnimationFrameBlockingMs ?? 'n/a'}ms`,
    `- WebGL texture-upload max: ${first?.webglTextureUploadMaxMs ?? 'n/a'}ms`,
    `- Runtime frame-event count: ${first?.runtimeFrameEventCount ?? 'n/a'}`,
    `- Runtime peak frame event: ${first?.peakRuntimeFrameEvent ? `frame=${first.peakRuntimeFrameEvent.frameCount ?? 'n/a'} ${first.peakRuntimeFrameEvent.frameMs ?? 'n/a'}ms newMax=${Boolean(first.peakRuntimeFrameEvent.newMax)} h50=${Boolean(first.peakRuntimeFrameEvent.hitch50)} h100=${Boolean(first.peakRuntimeFrameEvent.hitch100)}` : 'n/a'}`,
    `- Top user timing: ${first?.topUserTiming.name ?? 'n/a'} ${first?.topUserTiming.maxDurationMs ?? 'n/a'}ms`,
    '',
    '## Findings',
    '',
    ...report.findings.map((item) => `- ${item}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((item) => `- ${item}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function main(): void {
  const artifactArg = argValue('--artifact');
  const mode = argValue('--mode') ?? 'ai_sandbox';
  const artifactDir = artifactArg ? resolve(artifactArg) : findLatestPerfArtifact(mode);
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(artifactDir, outputDir);
  writeFileSync(join(outputDir, 'max-frame-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'max-frame-attribution.md'), markdown(report), 'utf-8');
  console.log(`Projekt 143 max-frame attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`source=${report.inputs.summary}`);
  console.log(`classification=${report.classification.maxFrameOwner}/${report.classification.confidence}`);
  console.log(`peakMaxFrameMs=${report.frameWindow.peakMaxFrameMs ?? 'n/a'}`);
}

main();
