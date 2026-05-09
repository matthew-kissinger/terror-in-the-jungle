#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  PROJEKT_143_REQUIRED_SCENE_CATEGORIES,
  type SceneAttributionEntry,
} from './scene-attribution';

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
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
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

interface UserTimingSummary {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  frameEvents?: RuntimeFrameEvent[];
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
    programs?: number;
  };
  browserStalls?: {
    totals?: {
      longTaskCount?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      userTimingByName?: Record<string, UserTimingSummary>;
    };
    recent?: {
      userTimingByName?: Record<string, UserTimingSummary>;
    };
  };
}

interface PriorPacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  files?: {
    summary?: string;
    markdown?: string;
  };
}

interface RenderBoundaryPacket extends PriorPacket {
  peakSample?: {
    index?: number;
    topGameEngineLoopTimings?: Array<{
      name?: string;
      maxDurationMs?: number;
      totalDurationMs?: number;
      count?: number;
    }>;
  };
}

interface RenderPresentPacket extends PriorPacket {
  peakSample?: {
    sampleIndex?: number;
    maxFrameMs?: number;
    longTaskMaxMs?: number;
    loafMaxMs?: number;
    webglTextureUploadMaxMs?: number;
    rendererRenderUserTimingMaxMs?: number;
    peakLoaf?: {
      scriptTotalDurationMs?: number;
      scriptDurationShare?: number;
      renderTailAfterScriptsMs?: number;
      scriptForcedStyleAndLayoutTotalMs?: number;
    };
  };
}

interface RafSourcePacket extends PriorPacket {
  bundleResolution?: {
    line?: number;
    column?: number;
    enclosingFunction?: string | null;
    targetFunction?: string | null;
  };
  sourceResolution?: {
    bestSourcePath?: string | null;
    anchorMatches?: number;
    anchorTotal?: number;
  };
}

interface CategorySummary {
  category: string;
  visibleTriangles: number;
  visibleTriangleShare: number | null;
  visibleDrawCallLike: number;
  visibleDrawShare: number | null;
  visibleMeshes: number;
  visibleMeshShare: number | null;
  visibleInstances: number;
  objects: number;
  visibleObjects: number;
  examples: Array<{
    nameChain?: string;
    type?: string;
    modelPath?: string | null;
    materialType?: string | null;
    triangles?: number;
    instances?: number;
  }>;
}

interface PeakSampleSummary {
  sampleIndex: number;
  ts: string | null;
  sampleFrameCount: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  frameEvent: RuntimeFrameEvent | null;
  renderer: {
    drawCalls: number | null;
    triangles: number | null;
    geometries: number | null;
    textures: number | null;
    programs: number | null;
  };
  longTaskMaxMs: number | null;
  longAnimationFrameMaxMs: number | null;
  longAnimationFrameBlockingMs: number | null;
  webglTextureUploadMaxMs: number | null;
  rendererRenderUserTimingMaxMs: number | null;
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-render-scene-category-subdivision';
  status: Status;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    sceneAttribution: string;
    renderBoundaryTiming: string | null;
    renderPresentSubdivision: string | null;
    rafCallbackSourceResolution: string | null;
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
    runtimeSamples: number;
  };
  validationHighlights: {
    avgFrameMs: ValidationCheck | null;
    peakP99FrameMs: ValidationCheck | null;
    peakMaxFrameMs: ValidationCheck | null;
    heapGrowthMb: ValidationCheck | null;
    heapRecoveryRatio: ValidationCheck | null;
    measurementTrust: ValidationCheck | null;
  };
  priorPackets: {
    renderBoundaryTiming: RenderBoundaryPacket | null;
    renderPresentSubdivision: RenderPresentPacket | null;
    rafCallbackSourceResolution: RafSourcePacket | null;
  };
  peakSample: PeakSampleSummary | null;
  sceneCensus: {
    capturedAfterRuntimeSampling: true;
    totalVisibleTriangles: number;
    totalVisibleDrawCallLike: number;
    totalVisibleMeshes: number;
    totalVisibleInstances: number;
    categories: CategorySummary[];
    topByVisibleTriangles: CategorySummary | null;
    topByVisibleDrawCallLike: CategorySummary | null;
    topByVisibleInstances: CategorySummary | null;
    missingRequiredCategories: string[];
    zeroVisibleRequiredCategories: string[];
    unattributedVisibleDrawShare: number | null;
  };
  rendererReconciliation: {
    peakRendererDrawCalls: number | null;
    sceneVisibleDrawCallLike: number;
    sceneDrawCallLikeToPeakRendererDrawCalls: number | null;
    peakRendererTriangles: number | null;
    sceneVisibleTriangles: number;
    sceneVisibleTrianglesToPeakRendererTriangles: number | null;
    reconciliationStatus: 'partial_scene_census_not_renderer_counter_equivalent' | 'insufficient_renderer_counter_data';
  };
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

const OUTPUT_NAME = 'projekt-143-render-scene-category-subdivision';
const RENDERER_RENDER_TIMING = 'GameEngineLoop.RenderMain.renderer.render';

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function readOptionalJson<T>(path: string): T | null {
  return existsSync(path) ? readJson<T>(path) : null;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function requireArtifactDir(): string {
  const raw = argValue('--artifact');
  if (!raw) {
    throw new Error('Usage: npx tsx scripts/projekt-143-render-scene-category-subdivision.ts --artifact <perf-artifact-dir>');
  }
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${raw}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function peakRuntimeSample(samples: RuntimeSample[]): { sample: RuntimeSample; index: number } | null {
  let best: { sample: RuntimeSample; index: number } | null = null;
  samples.forEach((sample, index) => {
    const frameMs = num(sample.maxFrameMs);
    if (!best || frameMs > num(best.sample.maxFrameMs)) {
      best = { sample, index };
    }
  });
  return best;
}

function peakFrameEvent(sample: RuntimeSample): RuntimeFrameEvent | null {
  const events = sample.frameEvents ?? [];
  let best: RuntimeFrameEvent | null = null;
  for (const event of events) {
    if (!best || num(event.frameMs) > num(best.frameMs)) {
      best = event;
    }
  }
  return best;
}

function rendererRenderTiming(sample: RuntimeSample): number | null {
  const recent = sample.browserStalls?.recent?.userTimingByName?.[RENDERER_RENDER_TIMING]?.maxDurationMs;
  if (typeof recent === 'number' && Number.isFinite(recent)) return round(recent, 2);
  const total = sample.browserStalls?.totals?.userTimingByName?.[RENDERER_RENDER_TIMING]?.maxDurationMs;
  return round(total, 2);
}

function buildPeakSample(samples: RuntimeSample[]): PeakSampleSummary | null {
  const peak = peakRuntimeSample(samples);
  if (!peak) return null;
  const sample = peak.sample;
  return {
    sampleIndex: peak.index,
    ts: sample.ts ?? null,
    sampleFrameCount: round(sample.frameCount, 0),
    avgFrameMs: round(sample.avgFrameMs, 2),
    p99FrameMs: round(sample.p99FrameMs, 2),
    maxFrameMs: round(sample.maxFrameMs, 2),
    frameEvent: peakFrameEvent(sample),
    renderer: {
      drawCalls: round(sample.renderer?.drawCalls, 0),
      triangles: round(sample.renderer?.triangles, 0),
      geometries: round(sample.renderer?.geometries, 0),
      textures: round(sample.renderer?.textures, 0),
      programs: round(sample.renderer?.programs, 0),
    },
    longTaskMaxMs: round(sample.browserStalls?.totals?.longTaskMaxDurationMs, 2),
    longAnimationFrameMaxMs: round(sample.browserStalls?.totals?.longAnimationFrameMaxDurationMs, 2),
    longAnimationFrameBlockingMs: round(sample.browserStalls?.totals?.longAnimationFrameBlockingDurationMs, 2),
    webglTextureUploadMaxMs: round(sample.browserStalls?.totals?.webglTextureUploadMaxDurationMs, 2),
    rendererRenderUserTimingMaxMs: rendererRenderTiming(sample),
  };
}

function summarizeScene(entries: SceneAttributionEntry[]): Report['sceneCensus'] {
  const totalVisibleTriangles = entries.reduce((sum, entry) => sum + num(entry.visibleTriangles), 0);
  const totalVisibleDrawCallLike = entries.reduce((sum, entry) => sum + num(entry.visibleDrawCallLike), 0);
  const totalVisibleMeshes = entries.reduce((sum, entry) => sum + num(entry.visibleMeshes), 0);
  const totalVisibleInstances = entries.reduce((sum, entry) => sum + num(entry.visibleInstances), 0);
  const categories = entries.map((entry): CategorySummary => ({
    category: entry.category,
    visibleTriangles: num(entry.visibleTriangles),
    visibleTriangleShare: round(num(entry.visibleTriangles) / Math.max(1, totalVisibleTriangles), 4),
    visibleDrawCallLike: num(entry.visibleDrawCallLike),
    visibleDrawShare: round(num(entry.visibleDrawCallLike) / Math.max(1, totalVisibleDrawCallLike), 4),
    visibleMeshes: num(entry.visibleMeshes),
    visibleMeshShare: round(num(entry.visibleMeshes) / Math.max(1, totalVisibleMeshes), 4),
    visibleInstances: num(entry.visibleInstances),
    objects: num(entry.objects),
    visibleObjects: num(entry.visibleObjects),
    examples: entry.visibleExamples ?? [],
  }));
  const byTriangles = [...categories].sort((a, b) => b.visibleTriangles - a.visibleTriangles);
  const byDraws = [...categories].sort((a, b) => b.visibleDrawCallLike - a.visibleDrawCallLike);
  const byInstances = [...categories].sort((a, b) => b.visibleInstances - a.visibleInstances);
  const categorySet = new Set(categories.map((entry) => entry.category));
  const missingRequiredCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => !categorySet.has(category));
  const zeroVisibleRequiredCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => {
    const entry = categories.find((candidate) => candidate.category === category);
    return Boolean(entry) && entry.visibleDrawCallLike === 0 && entry.visibleTriangles === 0;
  });
  const unattributed = categories.find((entry) => entry.category === 'unattributed') ?? null;
  return {
    capturedAfterRuntimeSampling: true,
    totalVisibleTriangles,
    totalVisibleDrawCallLike,
    totalVisibleMeshes,
    totalVisibleInstances,
    categories: byTriangles,
    topByVisibleTriangles: byTriangles[0] ?? null,
    topByVisibleDrawCallLike: byDraws[0] ?? null,
    topByVisibleInstances: byInstances[0] ?? null,
    missingRequiredCategories,
    zeroVisibleRequiredCategories,
    unattributedVisibleDrawShare: unattributed ? unattributed.visibleDrawShare : null,
  };
}

function buildRendererReconciliation(
  peakSample: PeakSampleSummary | null,
  sceneCensus: Report['sceneCensus'],
): Report['rendererReconciliation'] {
  const peakDrawCalls = peakSample?.renderer.drawCalls ?? null;
  const peakTriangles = peakSample?.renderer.triangles ?? null;
  return {
    peakRendererDrawCalls: peakDrawCalls,
    sceneVisibleDrawCallLike: sceneCensus.totalVisibleDrawCallLike,
    sceneDrawCallLikeToPeakRendererDrawCalls: peakDrawCalls ? round(sceneCensus.totalVisibleDrawCallLike / peakDrawCalls, 4) : null,
    peakRendererTriangles: peakTriangles,
    sceneVisibleTriangles: sceneCensus.totalVisibleTriangles,
    sceneVisibleTrianglesToPeakRendererTriangles: peakTriangles ? round(sceneCensus.totalVisibleTriangles / peakTriangles, 4) : null,
    reconciliationStatus: peakDrawCalls && peakTriangles
      ? 'partial_scene_census_not_renderer_counter_equivalent'
      : 'insufficient_renderer_counter_data',
  };
}

function classification(
  summary: Summary,
  sceneCensus: Report['sceneCensus'],
  peakSample: PeakSampleSummary | null,
): Report['classification'] {
  const sourceTrusted = summary.status === 'ok' && summary.measurementTrust?.status === 'pass';
  const hasScene = sceneCensus.categories.length > 0;
  const hasPeakRender = Boolean(peakSample?.rendererRenderUserTimingMaxMs);
  return {
    owner: 'renderer_render_category_timing_gap_static_scene_census_only',
    confidence: sourceTrusted && hasScene && hasPeakRender ? 'high' : sourceTrusted && hasScene ? 'medium' : 'low',
    acceptance: 'owner_review_only',
  };
}

function makeMarkdown(report: Report): string {
  const categoryRows = report.sceneCensus.categories.map((category) =>
    `| ${category.category} | ${category.visibleTriangles} | ${category.visibleTriangleShare ?? 'n/a'} | ${category.visibleDrawCallLike} | ${category.visibleDrawShare ?? 'n/a'} | ${category.visibleMeshes} | ${category.visibleInstances} |`);
  return [
    '# Projekt 143 Render Scene-Category Subdivision',
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
    `- Sample index: ${report.peakSample?.sampleIndex ?? 'n/a'}`,
    `- Runtime frame: ${report.peakSample?.frameEvent ? `frame=${report.peakSample.frameEvent.frameCount ?? 'n/a'} ${report.peakSample.frameEvent.frameMs ?? 'n/a'}ms` : 'n/a'}`,
    `- Renderer draw calls: ${report.peakSample?.renderer.drawCalls ?? 'n/a'}`,
    `- Renderer triangles: ${report.peakSample?.renderer.triangles ?? 'n/a'}`,
    `- Renderer.render user timing max: ${report.peakSample?.rendererRenderUserTimingMaxMs ?? 'n/a'}ms`,
    `- Long task max: ${report.peakSample?.longTaskMaxMs ?? 'n/a'}ms`,
    `- LoAF max: ${report.peakSample?.longAnimationFrameMaxMs ?? 'n/a'}ms`,
    `- WebGL texture-upload max: ${report.peakSample?.webglTextureUploadMaxMs ?? 'n/a'}ms`,
    '',
    '## Scene Census',
    '',
    `- Total visible triangles: ${report.sceneCensus.totalVisibleTriangles}`,
    `- Total visible draw-call-like entries: ${report.sceneCensus.totalVisibleDrawCallLike}`,
    `- Draw-call reconciliation: ${report.rendererReconciliation.sceneDrawCallLikeToPeakRendererDrawCalls ?? 'n/a'} of peak renderer draw calls`,
    `- Triangle reconciliation: ${report.rendererReconciliation.sceneVisibleTrianglesToPeakRendererTriangles ?? 'n/a'} of peak renderer triangles`,
    `- Top triangle category: ${report.sceneCensus.topByVisibleTriangles?.category ?? 'n/a'}`,
    `- Top draw category: ${report.sceneCensus.topByVisibleDrawCallLike?.category ?? 'n/a'}`,
    `- Missing required categories: ${report.sceneCensus.missingRequiredCategories.join(', ') || 'none'}`,
    `- Zero-visible required categories: ${report.sceneCensus.zeroVisibleRequiredCategories.join(', ') || 'none'}`,
    '',
    '| Category | Visible triangles | Triangle share | Visible draw-like | Draw share | Visible meshes | Visible instances |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...categoryRows,
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
  const sceneAttributionPath = join(artifactDir, 'scene-attribution.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);
  if (!existsSync(sceneAttributionPath)) throw new Error(`Missing scene attribution: ${rel(sceneAttributionPath)}`);

  const renderBoundaryPath = join(artifactDir, 'projekt-143-render-boundary-timing', 'render-boundary-timing.json');
  const renderPresentPath = join(artifactDir, 'projekt-143-render-present-subdivision', 'render-present-subdivision.json');
  const rafSourcePath = join(artifactDir, 'projekt-143-raf-callback-source-resolution', 'raf-callback-source-resolution.json');
  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const sceneAttribution = readJson<SceneAttributionEntry[]>(sceneAttributionPath);
  const renderBoundary = readOptionalJson<RenderBoundaryPacket>(renderBoundaryPath);
  const renderPresent = readOptionalJson<RenderPresentPacket>(renderPresentPath);
  const rafSource = readOptionalJson<RafSourcePacket>(rafSourcePath);
  const peakSample = buildPeakSample(samples);
  const sceneCensus = summarizeScene(sceneAttribution);
  const rendererReconciliation = buildRendererReconciliation(peakSample, sceneCensus);
  const packetClassification = classification(summary, sceneCensus, peakSample);
  const status: Status = summary.status === 'ok'
    && summary.measurementTrust?.status === 'pass'
    && sceneAttribution.length > 0
    && Boolean(peakSample?.rendererRenderUserTimingMaxMs)
    ? 'warn'
    : 'fail';
  const reportPath = join(outputDir, 'render-scene-category-subdivision.json');
  const markdownPath = join(outputDir, 'render-scene-category-subdivision.md');
  const topTriangles = sceneCensus.topByVisibleTriangles;
  const topDraws = sceneCensus.topByVisibleDrawCallLike;
  const topInstances = sceneCensus.topByVisibleInstances;
  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, ${samples.length} runtime samples, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Validation highlights are avg=${validationCheck(summary, 'avg_frame_ms')?.value ?? 'n/a'}ms, p99=${validationCheck(summary, 'peak_p99_frame_ms')?.value ?? 'n/a'}ms, max-frame=${validationCheck(summary, 'peak_max_frame_ms')?.value ?? 'n/a'}ms, heap end-growth=${validationCheck(summary, 'heap_growth_mb')?.value ?? 'n/a'}MB, and heap recovery=${validationCheck(summary, 'heap_recovery_ratio')?.value ?? 'n/a'}.`,
    peakSample
      ? `Peak sample index ${peakSample.sampleIndex} carries runtime frame ${peakSample.frameEvent?.frameCount ?? 'n/a'} at ${peakSample.frameEvent?.frameMs ?? 'n/a'}ms, renderer draw calls ${peakSample.renderer.drawCalls ?? 'n/a'}, renderer triangles ${peakSample.renderer.triangles ?? 'n/a'}, long task ${peakSample.longTaskMaxMs ?? 'n/a'}ms, LoAF ${peakSample.longAnimationFrameMaxMs ?? 'n/a'}ms, renderer.render user timing ${peakSample.rendererRenderUserTimingMaxMs ?? 'n/a'}ms, and WebGL upload ${peakSample.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No peak runtime sample exists.',
    renderPresent
      ? `Prior render-present packet classifies ${renderPresent.classification?.owner ?? 'unknown'} with peak script share ${renderPresent.peakSample?.peakLoaf?.scriptDurationShare ?? 'n/a'} and render tail ${renderPresent.peakSample?.peakLoaf?.renderTailAfterScriptsMs ?? 'n/a'}ms.`
      : 'No prior render-present packet is present beside the artifact.',
    rafSource
      ? `Prior RAF source packet classifies ${rafSource.classification?.owner ?? 'unknown'} and keeps the owner path at GameEngineLoop animate / RenderMain.`
      : 'No prior RAF source-resolution packet is present beside the artifact.',
    `Scene census after runtime sampling records ${sceneCensus.totalVisibleDrawCallLike} visible draw-call-like entries, ${sceneCensus.totalVisibleTriangles} visible triangles, ${sceneCensus.totalVisibleMeshes} visible meshes, and ${sceneCensus.totalVisibleInstances} visible instances.`,
    `Scene census reconciles only ${rendererReconciliation.sceneDrawCallLikeToPeakRendererDrawCalls ?? 'n/a'} of peak renderer draw calls and ${rendererReconciliation.sceneVisibleTrianglesToPeakRendererTriangles ?? 'n/a'} of peak renderer triangles, so it is not equivalent to Three.WebGLRenderer runtime counters.`,
    topTriangles
      ? `Visible triangle candidate is ${topTriangles.category} at ${topTriangles.visibleTriangles} triangles (${topTriangles.visibleTriangleShare} share).`
      : 'No visible triangle candidate exists.',
    topDraws
      ? `Visible draw-call candidate is ${topDraws.category} at ${topDraws.visibleDrawCallLike} draw-call-like entries (${topDraws.visibleDrawShare} share).`
      : 'No visible draw-call candidate exists.',
    topInstances
      ? `Visible instance candidate is ${topInstances.category} at ${topInstances.visibleInstances} instances.`
      : 'No visible instance candidate exists.',
    `The top triangle and draw-call candidates diverge, so a single category remediation is not evidence-authorized from this static census.`,
    `Required scene categories missing from the census are ${sceneCensus.missingRequiredCategories.join(', ') || 'none'}; required categories present but zero-visible are ${sceneCensus.zeroVisibleRequiredCategories.join(', ') || 'none'}.`,
    `Unattributed visible draw share is ${sceneCensus.unattributedVisibleDrawShare ?? 'n/a'}, which keeps perfCategory coverage incomplete for render-owner assignment.`,
    `Classification is ${packetClassification.owner} with ${packetClassification.confidence} confidence.`,
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
      sceneAttribution: rel(sceneAttributionPath) ?? sceneAttributionPath,
      renderBoundaryTiming: rel(renderBoundary ? renderBoundaryPath : null),
      renderPresentSubdivision: rel(renderPresent ? renderPresentPath : null),
      rafCallbackSourceResolution: rel(rafSource ? rafSourcePath : null),
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
      runtimeSamples: samples.length,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    priorPackets: {
      renderBoundaryTiming: renderBoundary,
      renderPresentSubdivision: renderPresent,
      rafCallbackSourceResolution: rafSource,
    },
    peakSample,
    sceneCensus,
    rendererReconciliation,
    classification: packetClassification,
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until maxFrameMs clears the compare gate.',
      'Add a runtime render-category attribution packet that samples scene categories during the active sample window, not only after sampling ends.',
      'Reconcile category counters to Three.WebGLRenderer counters by reducing unattributed draw coverage and by capturing the renderer render-list or equivalent category-tagged draw counts.',
      'Treat terrain triangle load and close-GLB draw load as separate candidate axes until per-category timing or visibility-isolation evidence identifies the stall owner.',
      'Do not return to suppression raycast cost, GPU present, or baseline refresh until a trusted packet moves the owner path there.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime fix.',
      'This packet does not assign renderer.render stall time to a single scene category.',
      'This packet does not split Three.WebGLRenderer internals.',
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
  writeFileSync(join(outputDir, 'render-scene-category-subdivision.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'render-scene-category-subdivision.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 render scene-category subdivision ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`triangleCandidate=${report.sceneCensus.topByVisibleTriangles?.category ?? 'n/a'}@${report.sceneCensus.topByVisibleTriangles?.visibleTriangleShare ?? 'n/a'} drawCandidate=${report.sceneCensus.topByVisibleDrawCallLike?.category ?? 'n/a'}@${report.sceneCensus.topByVisibleDrawCallLike?.visibleDrawShare ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-render-scene-category-subdivision failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
