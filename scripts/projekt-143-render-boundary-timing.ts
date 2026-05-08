#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  finalFrameCount?: number;
  status?: string;
  failureReason?: string | null;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    sampleCount?: number;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
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
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
  };
  frameEvents?: RuntimeFrameEvent[];
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

interface TimingAggregate {
  name: string;
  observed: boolean;
  count: number | null;
  totalDurationMs: number | null;
  maxDurationMs: number | null;
  meanDurationMs: number | null;
  firstObservedSampleIndex: number | null;
  maxObservedSampleIndex: number | null;
}

interface PeakSample {
  index: number;
  ts: string | null;
  sampleFrameCount: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  heapUsedMb: number | null;
  renderer: RuntimeSample['renderer'] | null;
  peakFrameEvent: RuntimeFrameEvent | null;
  frameEventsOver50: RuntimeFrameEvent[];
  longTaskMaxMs: number | null;
  longAnimationFrameMaxMs: number | null;
  longAnimationFrameBlockingMs: number | null;
  webglTextureUploadMaxMs: number | null;
  topGameEngineLoopTimings: TimingAggregate[];
  topAllUserTimings: TimingAggregate[];
}

interface PreviousCallsitePacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
  };
  callsite?: {
    bestSourceFile?: string | null;
    bestSourceScore?: number | null;
  };
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-render-boundary-timing';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    validation: string | null;
    measurementTrust: string | null;
    previousCallsite: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    durationSeconds: number | null;
    finalFrameCount: number | null;
    failureReason: string | null;
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  observerSupport: {
    longtask: boolean;
    longAnimationFrame: boolean;
    userTiming: boolean;
    webglTextureUpload: boolean;
  };
  peakSample: PeakSample | null;
  renderBoundaryTimings: TimingAggregate[];
  missingExpectedTimings: string[];
  previousCallsite: {
    status: string | null;
    owner: string | null;
    confidence: string | null;
    bestSourceFile: string | null;
    bestSourceScore: number | null;
  } | null;
  classification: {
    owner: string;
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-render-boundary-timing';
const EXPECTED_TIMINGS = [
  'GameEngineLoop.RenderMain.collectGPUTime',
  'GameEngineLoop.RenderMain.beginFrameStats',
  'GameEngineLoop.RenderMain.postProcessing.beginFrame',
  'GameEngineLoop.RenderMain.renderer.render',
  'GameEngineLoop.RenderMain.endGPUTimer',
  'GameEngineLoop.RenderOverlay.weapon',
  'GameEngineLoop.RenderOverlay.grenade',
  'GameEngineLoop.RenderOverlay.postProcessing.endFrame',
];

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
    throw new Error(`Usage: npx tsx scripts/projekt-143-render-boundary-timing.ts --artifact <perf-artifact-dir> [--callsite <callsite-resolution.json>]`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function cumulativeTimingRecord(sample: RuntimeSample): Record<string, TimingSummary> {
  return sample.browserStalls?.totals?.userTimingByName ?? sample.browserStalls?.recent?.userTimingByName ?? {};
}

function recentTimingRecord(sample: RuntimeSample): Record<string, TimingSummary> {
  return sample.browserStalls?.recent?.userTimingByName ?? sample.browserStalls?.totals?.userTimingByName ?? {};
}

function numericMax(values: Array<number | undefined | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function normalizeFrameEvent(event: RuntimeFrameEvent): RuntimeFrameEvent | null {
  const frameMs = round(event.frameMs);
  if (typeof frameMs !== 'number') return null;
  return {
    frameCount: round(event.frameCount, 0) ?? undefined,
    frameMs,
    atMs: round(event.atMs),
    previousMaxFrameMs: round(event.previousMaxFrameMs),
    newMax: Boolean(event.newMax),
    hitch33: Boolean(event.hitch33),
    hitch50: Boolean(event.hitch50),
    hitch100: Boolean(event.hitch100),
  };
}

function frameEvents(sample: RuntimeSample): RuntimeFrameEvent[] {
  return (sample.frameEvents ?? [])
    .map(normalizeFrameEvent)
    .filter((event): event is RuntimeFrameEvent => event !== null);
}

function peakFrameEvent(sample: RuntimeSample): RuntimeFrameEvent | null {
  const events = frameEvents(sample);
  if (events.length === 0) return null;
  const maxFrame = Number(sample.maxFrameMs ?? 0);
  const exact = events.find((event) => Math.abs(Number(event.frameMs ?? 0) - maxFrame) <= 0.5);
  return exact ?? [...events].sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0))[0] ?? null;
}

function aggregateTiming(samples: RuntimeSample[], name: string): TimingAggregate {
  let count: number | null = null;
  let totalDurationMs: number | null = null;
  let maxDurationMs: number | null = null;
  let firstObservedSampleIndex: number | null = null;
  let maxObservedSampleIndex: number | null = null;
  for (let index = 0; index < samples.length; index++) {
    const timing = cumulativeTimingRecord(samples[index])[name];
    if (!timing) continue;
    if (firstObservedSampleIndex === null) firstObservedSampleIndex = index;
    const maxDuration = Number(timing.maxDurationMs ?? 0);
    if (Number.isFinite(maxDuration) && (maxDurationMs === null || maxDuration > maxDurationMs)) {
      maxDurationMs = maxDuration;
      maxObservedSampleIndex = index;
    }
    if (index === samples.length - 1) {
      count = typeof timing.count === 'number' ? timing.count : null;
      totalDurationMs = typeof timing.totalDurationMs === 'number' ? timing.totalDurationMs : null;
    }
  }
  return {
    name,
    observed: firstObservedSampleIndex !== null,
    count: round(count, 0),
    totalDurationMs: round(totalDurationMs),
    maxDurationMs: round(maxDurationMs),
    meanDurationMs: count && totalDurationMs ? round(totalDurationMs / count, 4) : null,
    firstObservedSampleIndex,
    maxObservedSampleIndex,
  };
}

function aggregateAllTimings(samples: RuntimeSample[]): TimingAggregate[] {
  const names = new Set<string>();
  for (const sample of samples) {
    for (const name of Object.keys(cumulativeTimingRecord(sample))) names.add(name);
  }
  return [...names]
    .map((name) => aggregateTiming(samples, name))
    .sort((a, b) => Number(b.maxDurationMs ?? 0) - Number(a.maxDurationMs ?? 0));
}

function timingFromRecord(record: Record<string, TimingSummary>, name: string, sampleIndex: number): TimingAggregate {
  const timing = record[name];
  const count = typeof timing?.count === 'number' ? timing.count : null;
  const totalDurationMs = typeof timing?.totalDurationMs === 'number' ? timing.totalDurationMs : null;
  return {
    name,
    observed: Boolean(timing),
    count: round(count, 0),
    totalDurationMs: round(totalDurationMs),
    maxDurationMs: round(timing?.maxDurationMs),
    meanDurationMs: count && totalDurationMs ? round(totalDurationMs / count, 4) : null,
    firstObservedSampleIndex: timing ? sampleIndex : null,
    maxObservedSampleIndex: timing ? sampleIndex : null,
  };
}

function allTimingsFromRecord(record: Record<string, TimingSummary>, sampleIndex: number): TimingAggregate[] {
  return Object.keys(record)
    .map((name) => timingFromRecord(record, name, sampleIndex))
    .sort((a, b) => Number(b.maxDurationMs ?? 0) - Number(a.maxDurationMs ?? 0));
}

function peakSample(samples: RuntimeSample[]): PeakSample | null {
  const peakMaxFrameMs = numericMax(samples.map((sample) => sample.maxFrameMs));
  if (peakMaxFrameMs === null) return null;
  const entry = samples
    .map((sample, index) => ({ sample, index }))
    .find(({ sample }) => Number(sample.maxFrameMs ?? 0) >= peakMaxFrameMs);
  if (!entry) return null;
  const { sample, index } = entry;
  const recent = sample.browserStalls?.recent;
  const totals = sample.browserStalls?.totals;
  const sampleTimingRecord = recentTimingRecord(sample);
  return {
    index,
    ts: sample.ts ?? null,
    sampleFrameCount: round(sample.frameCount, 0),
    avgFrameMs: round(sample.avgFrameMs),
    p99FrameMs: round(sample.p99FrameMs),
    maxFrameMs: round(sample.maxFrameMs),
    heapUsedMb: round(sample.heapUsedMb),
    renderer: sample.renderer ?? null,
    peakFrameEvent: peakFrameEvent(sample),
    frameEventsOver50: frameEvents(sample).filter((event) => Number(event.frameMs ?? 0) >= 50),
    longTaskMaxMs: round(recent?.longTasks?.maxDurationMs ?? totals?.longTaskMaxDurationMs),
    longAnimationFrameMaxMs: round(recent?.longAnimationFrames?.maxDurationMs ?? totals?.longAnimationFrameMaxDurationMs),
    longAnimationFrameBlockingMs: round(recent?.longAnimationFrames?.blockingDurationMs ?? totals?.longAnimationFrameBlockingDurationMs),
    webglTextureUploadMaxMs: round(numericMax((recent?.webglTextureUploadTop ?? []).map((upload) => upload.duration)) ?? totals?.webglTextureUploadMaxDurationMs),
    topGameEngineLoopTimings: EXPECTED_TIMINGS
      .map((name) => timingFromRecord(sampleTimingRecord, name, index))
      .filter((timing) => timing.observed)
      .sort((a, b) => Number(b.maxDurationMs ?? 0) - Number(a.maxDurationMs ?? 0))
      .slice(0, 12),
    topAllUserTimings: allTimingsFromRecord(sampleTimingRecord, index).slice(0, 12),
  };
}

function observerSupport(samples: RuntimeSample[]): Report['observerSupport'] {
  const first = samples.find((sample) => sample.browserStalls?.support)?.browserStalls?.support;
  return {
    longtask: Boolean(first?.longtask),
    longAnimationFrame: Boolean(first?.longAnimationFrame),
    userTiming: Boolean(first?.userTiming),
    webglTextureUpload: Boolean(first?.webglTextureUpload),
  };
}

function readPreviousCallsite(path: string | null): Report['previousCallsite'] {
  if (!path) return null;
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Missing previous callsite packet: ${path}`);
  const packet = readJson<PreviousCallsitePacket>(resolved);
  return {
    status: packet.status ?? null,
    owner: packet.classification?.owner ?? null,
    confidence: packet.classification?.confidence ?? null,
    bestSourceFile: packet.callsite?.bestSourceFile ?? null,
    bestSourceScore: typeof packet.callsite?.bestSourceScore === 'number' ? packet.callsite.bestSourceScore : null,
  };
}

function classify(summary: PerfSummary, peak: PeakSample | null): Report['classification'] {
  const trusted = summary.measurementTrust?.status === 'pass';
  const maxFrame = peak?.maxFrameMs ?? 0;
  const renderMain = peak?.topGameEngineLoopTimings.find((timing) => timing.name === 'GameEngineLoop.RenderMain.renderer.render');
  const renderMainMax = renderMain?.maxDurationMs ?? 0;
  const webglMax = peak?.webglTextureUploadMaxMs ?? 0;
  const longTask = peak?.longTaskMaxMs ?? 0;
  const longAnimationFrame = peak?.longAnimationFrameMaxMs ?? 0;
  if (maxFrame >= 90 && renderMainMax >= maxFrame * 0.75 && longTask >= maxFrame && webglMax < 1) {
    return {
      owner: 'render_main_renderer_render_user_timing_contains_peak_longtask',
      confidence: trusted && longAnimationFrame >= maxFrame ? 'high' : 'medium',
      acceptance: 'owner_review_only',
    };
  }
  if (renderMainMax >= 40 && webglMax < 1) {
    return {
      owner: 'render_main_renderer_render_boundary_above_40ms_without_webgl_upload_owner',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'owner_review_only',
    };
  }
  if (maxFrame >= 90 && webglMax >= maxFrame * 0.5) {
    return {
      owner: 'webgl_texture_upload_boundary',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'owner_review_only',
    };
  }
  return {
    owner: 'render_boundary_user_timing_inconclusive',
    confidence: trusted ? 'low' : 'low',
    acceptance: 'owner_review_only',
  };
}

function markdown(report: Report): string {
  const timingRows = report.renderBoundaryTimings.map((timing) =>
    `| ${timing.name} | ${timing.observed ? 'yes' : 'no'} | ${timing.count ?? 'n/a'} | ${timing.maxDurationMs ?? 'n/a'} | ${timing.totalDurationMs ?? 'n/a'} | ${timing.meanDurationMs ?? 'n/a'} |`);
  return [
    '# Projekt 143 Render-Boundary Timing',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Peak Sample',
    '',
    `- Sample index: ${report.peakSample?.index ?? 'n/a'}`,
    `- Runtime peak frame: ${report.peakSample?.peakFrameEvent ? `frame=${report.peakSample.peakFrameEvent.frameCount ?? 'n/a'} ${report.peakSample.peakFrameEvent.frameMs ?? 'n/a'}ms` : 'n/a'}`,
    `- Max frame: ${report.peakSample?.maxFrameMs ?? 'n/a'}ms`,
    `- Long task max: ${report.peakSample?.longTaskMaxMs ?? 'n/a'}ms`,
    `- Long animation frame max: ${report.peakSample?.longAnimationFrameMaxMs ?? 'n/a'}ms`,
    `- Long animation blocking: ${report.peakSample?.longAnimationFrameBlockingMs ?? 'n/a'}ms`,
    `- WebGL texture-upload max: ${report.peakSample?.webglTextureUploadMaxMs ?? 'n/a'}ms`,
    '',
    '## Render Boundary Timings',
    '',
    '| Name | Observed | Count | Max ms | Total ms | Mean ms |',
    '|---|---:|---:|---:|---:|---:|',
    ...timingRows,
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
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const measurementTrustPath = join(artifactDir, 'measurement-trust.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const allTimings = aggregateAllTimings(samples);
  const renderTimings = EXPECTED_TIMINGS.map((name) => aggregateTiming(samples, name));
  const missingExpectedTimings = renderTimings.filter((timing) => !timing.observed).map((timing) => timing.name);
  const peak = peakSample(samples);
  const previousCallsite = readPreviousCallsite(argValue('--callsite'));
  const classification = classify(summary, peak);
  const status: CheckStatus = summary.status === 'ok' && summary.measurementTrust?.status === 'pass' && peak ? 'warn' : 'fail';
  const renderMainTiming = renderTimings.find((timing) => timing.name === 'GameEngineLoop.RenderMain.renderer.render');
  const reportPath = join(outputDir, 'render-boundary-timing.json');
  const markdownPath = join(outputDir, 'render-boundary-timing.md');

  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, ${samples.length} runtime samples, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Validation highlights are avg=${validationCheck(summary, 'avg_frame_ms')?.value ?? 'n/a'}ms, peak p99=${validationCheck(summary, 'peak_p99_frame_ms')?.value ?? 'n/a'}ms, peak max-frame=${validationCheck(summary, 'peak_max_frame_ms')?.value ?? 'n/a'}ms, heap end-growth=${validationCheck(summary, 'heap_growth_mb')?.value ?? 'n/a'}MB, and heap recovery=${validationCheck(summary, 'heap_recovery_ratio')?.value ?? 'n/a'}.`,
    peak
      ? `Peak sample index ${peak.index} carries runtime frame ${peak.peakFrameEvent?.frameCount ?? 'n/a'} at ${peak.peakFrameEvent?.frameMs ?? 'n/a'}ms, long task ${peak.longTaskMaxMs ?? 'n/a'}ms, long-animation-frame ${peak.longAnimationFrameMaxMs ?? 'n/a'}ms, blocking ${peak.longAnimationFrameBlockingMs ?? 'n/a'}ms, and WebGL upload max ${peak.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No peak runtime sample exists.',
    renderMainTiming?.observed
      ? `GameEngineLoop.RenderMain.renderer.render is observed with count ${renderMainTiming.count ?? 'n/a'}, total ${renderMainTiming.totalDurationMs ?? 'n/a'}ms, mean ${renderMainTiming.meanDurationMs ?? 'n/a'}ms, and max ${renderMainTiming.maxDurationMs ?? 'n/a'}ms.`
      : 'GameEngineLoop.RenderMain.renderer.render is not observed in user timing.',
    missingExpectedTimings.length > 0
      ? `Missing optional render-boundary timings are ${missingExpectedTimings.join(', ')}.`
      : 'All expected render-boundary timings were observed.',
    previousCallsite
      ? `Previous callsite packet status ${previousCallsite.status ?? 'unknown'} resolved owner ${previousCallsite.owner ?? 'unknown'} with source ${previousCallsite.bestSourceFile ?? 'unknown'} score ${previousCallsite.bestSourceScore ?? 'unknown'}.`
      : 'No previous callsite packet was provided.',
    `Classification is ${classification.owner} with ${classification.confidence} confidence.`,
  ];

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      measurementTrust: existsSync(measurementTrustPath) ? rel(measurementTrustPath) : null,
      previousCallsite: rel(argValue('--callsite') ? resolve(argValue('--callsite') as string) : null),
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      finalFrameCount: summary.finalFrameCount ?? null,
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
    observerSupport: observerSupport(samples),
    peakSample: peak,
    renderBoundaryTimings: renderTimings,
    missingExpectedTimings,
    previousCallsite,
    classification,
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until the standard combat120 packet passes the codex thresholds and perf:compare.',
      'Treat the peak max-frame owner as the main renderer.render boundary until a lower-level render-present or browser task packet splits that boundary further.',
      'Do not continue suppression-raycast cost work for the active max-frame blocker unless new evidence returns that owner to the top.',
      'If max-frame remains at 100ms after render-boundary subdivision, add a lower-level renderer/present probe or a source-map-enabled diagnostic build for the render call only.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime fix.',
      'This packet does not certify visual or combat feel.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not split renderer.render into native driver, GPU present, or browser GC internals.',
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
  writeFileSync(join(outputDir, 'render-boundary-timing.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'render-boundary-timing.md'), markdown(report), 'utf-8');
  console.log(`Projekt 143 render-boundary timing ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`peakMaxFrameMs=${report.peakSample?.maxFrameMs ?? 'n/a'} rendererRenderMaxMs=${report.renderBoundaryTimings.find((timing) => timing.name === 'GameEngineLoop.RenderMain.renderer.render')?.maxDurationMs ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-render-boundary-timing failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
