#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

interface LoafScript {
  name?: string;
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  sourceCharPosition?: number;
  windowAttribution?: string;
  executionStart?: number;
  duration?: number;
  pauseDuration?: number;
  forcedStyleAndLayoutDuration?: number;
}

interface LongAnimationFrameEntry {
  startTime?: number;
  duration?: number;
  blockingDuration?: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  firstUIEventTimestamp?: number;
  scripts?: LoafScript[];
}

interface LongTaskEntry {
  name?: string;
  startTime?: number;
  duration?: number;
  attribution?: Array<{
    name?: string;
    entryType?: string;
    startTime?: number;
    duration?: number;
    containerType?: string;
    containerSrc?: string;
    containerId?: string;
    containerName?: string;
  }>;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  heapUsedMb?: number;
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
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      userTimingByName?: Record<string, {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
      }>;
    };
    recent?: {
      longTasks?: {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
        entries?: LongTaskEntry[];
      };
      longAnimationFrames?: {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
        blockingDurationMs?: number;
        entries?: LongAnimationFrameEntry[];
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
      userTimingByName?: Record<string, {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
      }>;
    };
  };
}

interface RenderBoundaryPacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
  };
  peakSample?: {
    topGameEngineLoopTimings?: Array<{
      name?: string;
      maxDurationMs?: number;
    }>;
  };
}

interface ScriptSummary {
  name: string;
  invoker: string;
  invokerType: string;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  windowAttribution: string;
  executionStart: number;
  durationMs: number;
  pauseDurationMs: number;
  forcedStyleAndLayoutDurationMs: number;
}

interface LoafSummary {
  startTime: number;
  durationMs: number;
  blockingDurationMs: number;
  hasTimingDetail: boolean;
  hasScriptDetail: boolean;
  renderStart: number;
  renderStartOffsetMs: number | null;
  styleAndLayoutStart: number;
  styleAndLayoutStartOffsetMs: number | null;
  firstUIEventTimestamp: number;
  scriptTotalDurationMs: number;
  scriptMaxDurationMs: number;
  scriptPauseTotalMs: number;
  scriptForcedStyleAndLayoutTotalMs: number;
  scriptDurationShare: number | null;
  renderTailAfterScriptsMs: number | null;
  topScripts: ScriptSummary[];
}

interface PeakSample {
  sampleIndex: number;
  ts: string | null;
  sampleFrameCount: number | null;
  maxFrameMs: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  frameEvent: RuntimeFrameEvent | null;
  longTaskMaxMs: number | null;
  longTaskEntries: LongTaskEntry[];
  loafMaxMs: number | null;
  loafEntries: LoafSummary[];
  peakLoaf: LoafSummary | null;
  webglTextureUploadMaxMs: number | null;
  rendererRenderUserTimingMaxMs: number | null;
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-render-present-subdivision';
  status: Status;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    renderBoundaryTiming: string | null;
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
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  renderBoundaryPacket: {
    status: string | null;
    owner: string | null;
    confidence: string | null;
    peakRendererRenderMaxMs: number | null;
  } | null;
  peakSample: PeakSample | null;
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

const OUTPUT_NAME = 'projekt-143-render-present-subdivision';

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
    throw new Error(`Usage: npx tsx scripts/projekt-143-render-present-subdivision.ts --artifact <perf-artifact-dir> [--render-boundary <render-boundary-timing.json>]`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function finiteMax(values: Array<number | null | undefined>): number | null {
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

function peakFrameEvent(sample: RuntimeSample): RuntimeFrameEvent | null {
  const events = (sample.frameEvents ?? [])
    .map(normalizeFrameEvent)
    .filter((event): event is RuntimeFrameEvent => event !== null);
  if (events.length === 0) return null;
  const maxFrame = Number(sample.maxFrameMs ?? 0);
  return events.find((event) => Math.abs(Number(event.frameMs ?? 0) - maxFrame) <= 0.5)
    ?? [...events].sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0))[0]
    ?? null;
}

function scriptSummary(script: LoafScript): ScriptSummary {
  return {
    name: String(script.name ?? ''),
    invoker: String(script.invoker ?? ''),
    invokerType: String(script.invokerType ?? ''),
    sourceURL: String(script.sourceURL ?? ''),
    sourceFunctionName: String(script.sourceFunctionName ?? ''),
    sourceCharPosition: Number(script.sourceCharPosition ?? 0),
    windowAttribution: String(script.windowAttribution ?? ''),
    executionStart: Number(script.executionStart ?? 0),
    durationMs: round(script.duration, 2) ?? 0,
    pauseDurationMs: round(script.pauseDuration, 2) ?? 0,
    forcedStyleAndLayoutDurationMs: round(script.forcedStyleAndLayoutDuration, 2) ?? 0,
  };
}

function summarizeLoaf(entry: LongAnimationFrameEntry): LoafSummary {
  const startTime = Number(entry.startTime ?? 0);
  const durationMs = Number(entry.duration ?? 0);
  const renderStart = Number(entry.renderStart ?? 0);
  const styleAndLayoutStart = Number(entry.styleAndLayoutStart ?? 0);
  const rawScripts = Array.isArray(entry.scripts) ? entry.scripts : null;
  const scripts = (rawScripts ?? []).map(scriptSummary).sort((a, b) => b.durationMs - a.durationMs);
  const hasTimingDetail = renderStart > 0 || styleAndLayoutStart > 0;
  const hasScriptDetail = rawScripts !== null;
  const scriptTotalDurationMs = scripts.reduce((sum, script) => sum + script.durationMs, 0);
  const scriptPauseTotalMs = scripts.reduce((sum, script) => sum + script.pauseDurationMs, 0);
  const scriptForcedStyleAndLayoutTotalMs = scripts.reduce((sum, script) => sum + script.forcedStyleAndLayoutDurationMs, 0);
  const renderStartOffsetMs = renderStart > 0 ? renderStart - startTime : null;
  const styleAndLayoutStartOffsetMs = styleAndLayoutStart > 0 ? styleAndLayoutStart - startTime : null;
  return {
    startTime: round(startTime) ?? 0,
    durationMs: round(durationMs) ?? 0,
    blockingDurationMs: round(entry.blockingDuration) ?? 0,
    hasTimingDetail,
    hasScriptDetail,
    renderStart: round(renderStart) ?? 0,
    renderStartOffsetMs: round(renderStartOffsetMs),
    styleAndLayoutStart: round(styleAndLayoutStart) ?? 0,
    styleAndLayoutStartOffsetMs: round(styleAndLayoutStartOffsetMs),
    firstUIEventTimestamp: round(entry.firstUIEventTimestamp) ?? 0,
    scriptTotalDurationMs: round(scriptTotalDurationMs) ?? 0,
    scriptMaxDurationMs: round(finiteMax(scripts.map((script) => script.durationMs))) ?? 0,
    scriptPauseTotalMs: round(scriptPauseTotalMs) ?? 0,
    scriptForcedStyleAndLayoutTotalMs: round(scriptForcedStyleAndLayoutTotalMs) ?? 0,
    scriptDurationShare: hasScriptDetail && durationMs > 0 ? round(scriptTotalDurationMs / durationMs, 4) : null,
    renderTailAfterScriptsMs: hasScriptDetail && durationMs > 0 ? round(Math.max(0, durationMs - scriptTotalDurationMs)) : null,
    topScripts: scripts.slice(0, 8),
  };
}

function peakSample(samples: RuntimeSample[]): PeakSample | null {
  const peakMaxFrameMs = finiteMax(samples.map((sample) => sample.maxFrameMs));
  if (peakMaxFrameMs === null) return null;
  const entry = samples
    .map((sample, sampleIndex) => ({ sample, sampleIndex }))
    .find(({ sample }) => Number(sample.maxFrameMs ?? 0) >= peakMaxFrameMs);
  if (!entry) return null;
  const { sample, sampleIndex } = entry;
  const recent = sample.browserStalls?.recent;
  const totals = sample.browserStalls?.totals;
  const loafEntries = (recent?.longAnimationFrames?.entries ?? [])
    .map(summarizeLoaf)
    .sort((a, b) => b.durationMs - a.durationMs);
  const longTaskEntries = recent?.longTasks?.entries ?? [];
  const userTimings = recent?.userTimingByName ?? totals?.userTimingByName ?? {};
  return {
    sampleIndex,
    ts: sample.ts ?? null,
    sampleFrameCount: round(sample.frameCount, 0),
    maxFrameMs: round(sample.maxFrameMs),
    avgFrameMs: round(sample.avgFrameMs),
    p99FrameMs: round(sample.p99FrameMs),
    frameEvent: peakFrameEvent(sample),
    longTaskMaxMs: round(recent?.longTasks?.maxDurationMs ?? totals?.longTaskMaxDurationMs),
    longTaskEntries,
    loafMaxMs: round(recent?.longAnimationFrames?.maxDurationMs ?? totals?.longAnimationFrameMaxDurationMs),
    loafEntries,
    peakLoaf: loafEntries[0] ?? null,
    webglTextureUploadMaxMs: round(finiteMax((recent?.webglTextureUploadTop ?? []).map((upload) => upload.duration)) ?? totals?.webglTextureUploadMaxDurationMs),
    rendererRenderUserTimingMaxMs: round(userTimings['GameEngineLoop.RenderMain.renderer.render']?.maxDurationMs),
  };
}

function readRenderBoundary(path: string | null): Report['renderBoundaryPacket'] {
  if (!path) return null;
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Missing render-boundary packet: ${path}`);
  const packet = readJson<RenderBoundaryPacket>(resolved);
  const peakRenderer = packet.peakSample?.topGameEngineLoopTimings
    ?.find((timing) => timing.name === 'GameEngineLoop.RenderMain.renderer.render');
  return {
    status: packet.status ?? null,
    owner: packet.classification?.owner ?? null,
    confidence: packet.classification?.confidence ?? null,
    peakRendererRenderMaxMs: round(peakRenderer?.maxDurationMs),
  };
}

function classify(summary: Summary, peak: PeakSample | null): Report['classification'] {
  if (!peak?.peakLoaf) {
    return {
      owner: 'loaf_script_detail_missing',
      confidence: 'low',
      acceptance: 'owner_review_only',
    };
  }
  const trusted = summary.measurementTrust?.status === 'pass';
  const loaf = peak.peakLoaf;
  if (!loaf.hasScriptDetail) {
    return {
      owner: 'loaf_script_detail_missing',
      confidence: 'low',
      acceptance: 'owner_review_only',
    };
  }
  const scriptShare = loaf.scriptDurationShare ?? 0;
  const renderTail = loaf.renderTailAfterScriptsMs ?? 0;
  const webglUpload = peak.webglTextureUploadMaxMs ?? 0;
  const forcedStyle = loaf.scriptForcedStyleAndLayoutTotalMs;
  if (scriptShare >= 0.65 && webglUpload < 1) {
    return {
      owner: 'loaf_script_window_dominates_renderer_render_boundary',
      confidence: trusted ? 'high' : 'medium',
      acceptance: 'owner_review_only',
    };
  }
  if (forcedStyle >= 20) {
    return {
      owner: 'loaf_forced_style_layout_inside_script_window',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'owner_review_only',
    };
  }
  if (renderTail >= 40 && scriptShare < 0.5) {
    return {
      owner: 'loaf_render_present_tail_after_script_window',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'owner_review_only',
    };
  }
  return {
    owner: 'loaf_subdivision_mixed_or_inconclusive',
    confidence: trusted ? 'low' : 'low',
    acceptance: 'owner_review_only',
  };
}

function makeMarkdown(report: Report): string {
  const peak = report.peakSample;
  const loaf = peak?.peakLoaf;
  const scriptRows = (loaf?.topScripts ?? []).map((script) =>
    `| ${script.durationMs} | ${script.sourceFunctionName || 'n/a'} | ${script.invoker || 'n/a'} | ${script.sourceURL || 'n/a'} |`);
  return [
    '# Projekt 143 Render-Present Subdivision',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Peak Boundary',
    '',
    `- Sample index: ${peak?.sampleIndex ?? 'n/a'}`,
    `- Runtime frame: ${peak?.frameEvent ? `frame=${peak.frameEvent.frameCount ?? 'n/a'} ${peak.frameEvent.frameMs ?? 'n/a'}ms` : 'n/a'}`,
    `- Long task max: ${peak?.longTaskMaxMs ?? 'n/a'}ms`,
    `- LoAF max: ${peak?.loafMaxMs ?? 'n/a'}ms`,
    `- Renderer.render user timing max: ${peak?.rendererRenderUserTimingMaxMs ?? 'n/a'}ms`,
    `- WebGL texture-upload max: ${peak?.webglTextureUploadMaxMs ?? 'n/a'}ms`,
    `- LoAF timing detail: ${loaf?.hasTimingDetail ?? false}`,
    `- LoAF script detail: ${loaf?.hasScriptDetail ?? false}`,
    '',
    '## Peak LoAF',
    '',
    `- Duration: ${loaf?.durationMs ?? 'n/a'}ms`,
    `- Blocking: ${loaf?.blockingDurationMs ?? 'n/a'}ms`,
    `- Render-start offset: ${loaf?.renderStartOffsetMs ?? 'n/a'}ms`,
    `- Style/layout-start offset: ${loaf?.styleAndLayoutStartOffsetMs ?? 'n/a'}ms`,
    `- Script total: ${loaf?.scriptTotalDurationMs ?? 'n/a'}ms`,
    `- Script share: ${loaf?.scriptDurationShare ?? 'n/a'}`,
    `- Script pause total: ${loaf?.scriptPauseTotalMs ?? 'n/a'}ms`,
    `- Forced style/layout total: ${loaf?.scriptForcedStyleAndLayoutTotalMs ?? 'n/a'}ms`,
    `- Render tail after scripts: ${loaf?.renderTailAfterScriptsMs ?? 'n/a'}ms`,
    '',
    '## Top Scripts',
    '',
    '| Duration ms | Source function | Invoker | Source URL |',
    '|---:|---|---|---|',
    ...scriptRows,
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
  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);
  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const renderBoundaryPacket = readRenderBoundary(argValue('--render-boundary'));
  const peak = peakSample(samples);
  const classification = classify(summary, peak);
  const status: Status = summary.status === 'ok' && summary.measurementTrust?.status === 'pass' && peak?.peakLoaf?.hasScriptDetail ? 'warn' : 'fail';
  const reportPath = join(outputDir, 'render-present-subdivision.json');
  const markdownPath = join(outputDir, 'render-present-subdivision.md');
  const loaf = peak?.peakLoaf;
  const topScript = loaf?.topScripts[0] ?? null;
  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, ${samples.length} runtime samples, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Validation highlights are avg=${validationCheck(summary, 'avg_frame_ms')?.value ?? 'n/a'}ms, p99=${validationCheck(summary, 'peak_p99_frame_ms')?.value ?? 'n/a'}ms, max-frame=${validationCheck(summary, 'peak_max_frame_ms')?.value ?? 'n/a'}ms, heap end-growth=${validationCheck(summary, 'heap_growth_mb')?.value ?? 'n/a'}MB, and heap recovery=${validationCheck(summary, 'heap_recovery_ratio')?.value ?? 'n/a'}.`,
    peak
      ? `Peak sample index ${peak.sampleIndex} carries runtime frame ${peak.frameEvent?.frameCount ?? 'n/a'} at ${peak.frameEvent?.frameMs ?? 'n/a'}ms, long task ${peak.longTaskMaxMs ?? 'n/a'}ms, LoAF ${peak.loafMaxMs ?? 'n/a'}ms, renderer.render user timing ${peak.rendererRenderUserTimingMaxMs ?? 'n/a'}ms, and WebGL upload ${peak.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No peak runtime sample exists.',
    loaf
      ? `Peak LoAF duration ${loaf.durationMs}ms subdivides into script total ${loaf.scriptTotalDurationMs}ms, script share ${loaf.scriptDurationShare ?? 'n/a'}, forced style/layout ${loaf.scriptForcedStyleAndLayoutTotalMs}ms, and render tail after scripts ${loaf.renderTailAfterScriptsMs ?? 'n/a'}ms.`
      : 'No LoAF script-detail entry exists for the peak sample.',
    loaf
      ? `LoAF detail fields are timing=${loaf.hasTimingDetail} and scripts=${loaf.hasScriptDetail}.`
      : 'LoAF detail fields are absent.',
    topScript
      ? `Top LoAF script is ${topScript.sourceFunctionName || 'unknown'} at ${topScript.durationMs}ms from ${topScript.sourceURL || 'unknown source'} via ${topScript.invoker || 'unknown invoker'}.`
      : 'No LoAF script attribution is available.',
    renderBoundaryPacket
      ? `Prior render-boundary packet status ${renderBoundaryPacket.status ?? 'unknown'} classified ${renderBoundaryPacket.owner ?? 'unknown'} with renderer.render peak ${renderBoundaryPacket.peakRendererRenderMaxMs ?? 'n/a'}ms.`
      : 'No prior render-boundary packet was provided.',
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
      renderBoundaryTiming: rel(argValue('--render-boundary') ? resolve(argValue('--render-boundary') as string) : null),
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
    renderBoundaryPacket,
    peakSample: peak,
    classification,
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until maxFrameMs clears the compare gate.',
      'If LoAF script attribution dominates, resolve the top script source against the perf bundle and Three.js render stack before changing gameplay systems.',
      'If the render tail dominates after scripts, move the next packet to GPU present / compositor / command-buffer evidence rather than TypeScript gameplay code.',
      'Do not return to suppression raycast work unless a new trusted packet puts suppression back above the render/browser boundary.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime fix.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not certify visual or combat feel.',
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
  writeFileSync(join(outputDir, 'render-present-subdivision.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'render-present-subdivision.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 render-present subdivision ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`peakMaxFrameMs=${report.peakSample?.maxFrameMs ?? 'n/a'} loafMaxMs=${report.peakSample?.loafMaxMs ?? 'n/a'} scriptShare=${report.peakSample?.peakLoaf?.scriptDurationShare ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-render-present-subdivision failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
