#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  PROJEKT_143_REQUIRED_SCENE_CATEGORIES,
  type SceneAttributionEntry,
} from './projekt-143-scene-attribution';

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

interface UserTimingSummary {
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
  p99FrameMs?: number;
  maxFrameMs?: number;
  frameEvents?: RuntimeFrameEvent[];
  renderer?: RendererCounters;
  sceneAttribution?: SceneAttributionEntry[] | null;
  sceneAttributionError?: string | null;
  browserStalls?: {
    totals?: {
      longTaskMaxDurationMs?: number;
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

interface RendererCounters {
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  programs?: number;
}

interface RuntimeSceneAttributionSample {
  sampleIndex?: number;
  ts?: string;
  frameCount?: number;
  maxFrameMs?: number | null;
  renderer?: RendererCounters | null;
  sceneAttribution?: SceneAttributionEntry[] | null;
  sceneAttributionError?: string | null;
}

interface PriorStaticPacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  rendererReconciliation?: {
    sceneDrawCallLikeToPeakRendererDrawCalls?: number | null;
    sceneVisibleTrianglesToPeakRendererTriangles?: number | null;
  };
  sceneCensus?: {
    topByVisibleTriangles?: { category?: string; visibleTriangleShare?: number | null };
    topByVisibleDrawCallLike?: { category?: string; visibleDrawShare?: number | null };
    unattributedVisibleDrawShare?: number | null;
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
  visibleInstanceShare: number | null;
  visibleObjects: number;
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

interface RuntimeSceneSummary {
  sampleIndex: number | null;
  sampleDistanceFromPeak: number | null;
  sameAsPeakSample: boolean;
  ts: string | null;
  sampleFrameCount: number | null;
  maxFrameMs: number | null;
  sceneAttributionError: string | null;
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
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-render-runtime-category-attribution';
  status: Status;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    runtimeSceneAttributionSamples: string | null;
    priorStaticSceneCategorySubdivision: string | null;
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
    runtimeSceneAttributionSamples: number;
  };
  validationHighlights: {
    avgFrameMs: ValidationCheck | null;
    peakP99FrameMs: ValidationCheck | null;
    peakMaxFrameMs: ValidationCheck | null;
    heapGrowthMb: ValidationCheck | null;
    heapRecoveryRatio: ValidationCheck | null;
    measurementTrust: ValidationCheck | null;
  };
  priorStaticPacket: PriorStaticPacket | null;
  peakSample: PeakSampleSummary | null;
  runtimeSceneCensus: RuntimeSceneSummary;
  rendererReconciliation: {
    sampledRendererDrawCalls: number | null;
    sampledSceneVisibleDrawCallLike: number;
    sampledSceneDrawCallLikeToRendererDrawCalls: number | null;
    sampledRendererTriangles: number | null;
    sampledSceneVisibleTriangles: number;
    sampledSceneVisibleTrianglesToRendererTriangles: number | null;
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

const OUTPUT_NAME = 'projekt-143-render-runtime-category-attribution';
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
    throw new Error('Usage: npx tsx scripts/projekt-143-render-runtime-category-attribution.ts --artifact <perf-artifact-dir>');
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

function loadRuntimeSceneSamples(
  artifactDir: string,
  runtimeSamples: RuntimeSample[],
): { path: string | null; samples: RuntimeSceneAttributionSample[] } {
  const sidecarPath = join(artifactDir, 'runtime-scene-attribution-samples.json');
  if (existsSync(sidecarPath)) {
    return {
      path: sidecarPath,
      samples: readJson<RuntimeSceneAttributionSample[]>(sidecarPath),
    };
  }

  const embedded = runtimeSamples.flatMap((sample, sampleIndex): RuntimeSceneAttributionSample[] => {
    if (typeof sample.sceneAttribution === 'undefined' && !sample.sceneAttributionError) return [];
    return [{
      sampleIndex,
      ts: sample.ts,
      frameCount: sample.frameCount,
      maxFrameMs: typeof sample.maxFrameMs === 'number' ? sample.maxFrameMs : null,
      renderer: sample.renderer ?? null,
      sceneAttribution: sample.sceneAttribution ?? null,
      sceneAttributionError: sample.sceneAttributionError ?? null,
    }];
  });
  return { path: null, samples: embedded };
}

function nearestSceneSample(
  sceneSamples: RuntimeSceneAttributionSample[],
  peakSample: PeakSampleSummary | null,
): RuntimeSceneAttributionSample | null {
  if (sceneSamples.length === 0) return null;
  const peakIndex = peakSample?.sampleIndex;
  if (typeof peakIndex !== 'number') return sceneSamples[0] ?? null;
  return [...sceneSamples].sort((a, b) => {
    const aDistance = Math.abs(num(a.sampleIndex) - peakIndex);
    const bDistance = Math.abs(num(b.sampleIndex) - peakIndex);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return num(b.maxFrameMs) - num(a.maxFrameMs);
  })[0] ?? null;
}

function summarizeScene(
  sceneSample: RuntimeSceneAttributionSample | null,
  peakSample: PeakSampleSummary | null,
): RuntimeSceneSummary {
  const entries = Array.isArray(sceneSample?.sceneAttribution) ? sceneSample.sceneAttribution : [];
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
    visibleInstanceShare: round(num(entry.visibleInstances) / Math.max(1, totalVisibleInstances), 4),
    visibleObjects: num(entry.visibleObjects),
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
  const sampleIndex = typeof sceneSample?.sampleIndex === 'number' ? sceneSample.sampleIndex : null;
  const peakIndex = typeof peakSample?.sampleIndex === 'number' ? peakSample.sampleIndex : null;
  const unattributed = categories.find((entry) => entry.category === 'unattributed') ?? null;
  return {
    sampleIndex,
    sampleDistanceFromPeak: sampleIndex !== null && peakIndex !== null ? Math.abs(sampleIndex - peakIndex) : null,
    sameAsPeakSample: sampleIndex !== null && peakIndex !== null && sampleIndex === peakIndex,
    ts: sceneSample?.ts ?? null,
    sampleFrameCount: round(sceneSample?.frameCount, 0),
    maxFrameMs: round(sceneSample?.maxFrameMs, 2),
    sceneAttributionError: sceneSample?.sceneAttributionError ?? null,
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

function rendererForSceneSample(
  sceneSample: RuntimeSceneAttributionSample | null,
  runtimeSamples: RuntimeSample[],
): RendererCounters | null {
  const sampleIndex = typeof sceneSample?.sampleIndex === 'number' ? sceneSample.sampleIndex : null;
  if (sampleIndex !== null && runtimeSamples[sampleIndex]?.renderer) {
    return runtimeSamples[sampleIndex].renderer ?? null;
  }
  return sceneSample?.renderer ?? null;
}

function buildRendererReconciliation(
  sceneCensus: RuntimeSceneSummary,
  renderer: RendererCounters | null,
): Report['rendererReconciliation'] {
  const drawCalls = round(renderer?.drawCalls, 0);
  const triangles = round(renderer?.triangles, 0);
  return {
    sampledRendererDrawCalls: drawCalls,
    sampledSceneVisibleDrawCallLike: sceneCensus.totalVisibleDrawCallLike,
    sampledSceneDrawCallLikeToRendererDrawCalls: drawCalls
      ? round(sceneCensus.totalVisibleDrawCallLike / drawCalls, 4)
      : null,
    sampledRendererTriangles: triangles,
    sampledSceneVisibleTriangles: sceneCensus.totalVisibleTriangles,
    sampledSceneVisibleTrianglesToRendererTriangles: triangles
      ? round(sceneCensus.totalVisibleTriangles / triangles, 4)
      : null,
    reconciliationStatus: drawCalls && triangles
      ? 'partial_scene_census_not_renderer_counter_equivalent'
      : 'insufficient_renderer_counter_data',
  };
}

function classify(
  summary: Summary,
  sceneSamples: RuntimeSceneAttributionSample[],
  sceneCensus: RuntimeSceneSummary,
  rendererReconciliation: Report['rendererReconciliation'],
  peakSample: PeakSampleSummary | null,
): Report['classification'] {
  const sourceTrusted = summary.status === 'ok' && summary.measurementTrust?.status === 'pass';
  const sameSample = sceneCensus.sameAsPeakSample;
  const hasScene = sceneCensus.categories.length > 0 && !sceneCensus.sceneAttributionError;
  const hasRenderTiming = Boolean(peakSample?.rendererRenderUserTimingMaxMs);
  const topTriangles = sceneCensus.topByVisibleTriangles?.category ?? null;
  const topDraws = sceneCensus.topByVisibleDrawCallLike?.category ?? null;
  const partialCounters = (rendererReconciliation.sampledSceneDrawCallLikeToRendererDrawCalls ?? 1) < 0.9
    || (rendererReconciliation.sampledSceneVisibleTrianglesToRendererTriangles ?? 1) < 0.9;

  let owner = 'runtime_scene_attribution_missing';
  if (sceneCensus.sceneAttributionError) {
    owner = 'runtime_scene_attribution_error';
  } else if (sceneSamples.length > 0 && !sameSample) {
    owner = 'runtime_renderer_category_attribution_nearest_sample_only';
  } else if (hasScene && (topTriangles !== topDraws || partialCounters)) {
    owner = 'runtime_renderer_category_candidates_diverge_and_counters_remain_partial';
  } else if (hasScene) {
    owner = 'runtime_renderer_category_single_candidate_with_partial_counters';
  }

  return {
    owner,
    confidence: sourceTrusted && sameSample && hasScene && hasRenderTiming
      ? 'high'
      : sourceTrusted && hasScene
        ? 'medium'
        : 'low',
    acceptance: 'owner_review_only',
  };
}

function makeMarkdown(report: Report): string {
  const categoryRows = report.runtimeSceneCensus.categories.map((category) =>
    `| ${category.category} | ${category.visibleTriangles} | ${category.visibleTriangleShare ?? 'n/a'} | ${category.visibleDrawCallLike} | ${category.visibleDrawShare ?? 'n/a'} | ${category.visibleMeshes} | ${category.visibleInstances} |`);
  return [
    '# Projekt 143 Render Runtime Category Attribution',
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
    `- Sample index: ${report.peakSample?.sampleIndex ?? 'n/a'}`,
    `- Runtime frame: ${report.peakSample?.frameEvent ? `frame=${report.peakSample.frameEvent.frameCount ?? 'n/a'} ${report.peakSample.frameEvent.frameMs ?? 'n/a'}ms` : 'n/a'}`,
    `- Renderer draw calls: ${report.peakSample?.renderer.drawCalls ?? 'n/a'}`,
    `- Renderer triangles: ${report.peakSample?.renderer.triangles ?? 'n/a'}`,
    `- Renderer.render user timing max: ${report.peakSample?.rendererRenderUserTimingMaxMs ?? 'n/a'}ms`,
    '',
    '## Runtime Scene Sample',
    '',
    `- Scene sample index: ${report.runtimeSceneCensus.sampleIndex ?? 'n/a'}`,
    `- Distance from peak sample: ${report.runtimeSceneCensus.sampleDistanceFromPeak ?? 'n/a'}`,
    `- Same as peak sample: ${report.runtimeSceneCensus.sameAsPeakSample}`,
    `- Scene attribution error: ${report.runtimeSceneCensus.sceneAttributionError ?? 'none'}`,
    `- Total visible triangles: ${report.runtimeSceneCensus.totalVisibleTriangles}`,
    `- Total visible draw-call-like entries: ${report.runtimeSceneCensus.totalVisibleDrawCallLike}`,
    `- Draw-call reconciliation: ${report.rendererReconciliation.sampledSceneDrawCallLikeToRendererDrawCalls ?? 'n/a'} of sampled renderer draw calls`,
    `- Triangle reconciliation: ${report.rendererReconciliation.sampledSceneVisibleTrianglesToRendererTriangles ?? 'n/a'} of sampled renderer triangles`,
    `- Top triangle category: ${report.runtimeSceneCensus.topByVisibleTriangles?.category ?? 'n/a'}`,
    `- Top draw category: ${report.runtimeSceneCensus.topByVisibleDrawCallLike?.category ?? 'n/a'}`,
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
  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);

  const priorStaticPath = join(
    artifactDir,
    'projekt-143-render-scene-category-subdivision',
    'render-scene-category-subdivision.json',
  );
  const summary = readJson<Summary>(summaryPath);
  const runtimeSamples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const runtimeSceneSamples = loadRuntimeSceneSamples(artifactDir, runtimeSamples);
  const priorStaticPacket = readOptionalJson<PriorStaticPacket>(priorStaticPath);
  const peakSample = buildPeakSample(runtimeSamples);
  const nearestScene = nearestSceneSample(runtimeSceneSamples.samples, peakSample);
  const runtimeSceneCensus = summarizeScene(nearestScene, peakSample);
  const rendererReconciliation = buildRendererReconciliation(
    runtimeSceneCensus,
    rendererForSceneSample(nearestScene, runtimeSamples),
  );
  const packetClassification = classify(
    summary,
    runtimeSceneSamples.samples,
    runtimeSceneCensus,
    rendererReconciliation,
    peakSample,
  );
  const status: Status = summary.status === 'ok'
    && summary.measurementTrust?.status === 'pass'
    && runtimeSceneSamples.samples.length > 0
    && runtimeSceneCensus.categories.length > 0
    && !runtimeSceneCensus.sceneAttributionError
    ? 'warn'
    : 'fail';
  const reportPath = join(outputDir, 'render-runtime-category-attribution.json');
  const markdownPath = join(outputDir, 'render-runtime-category-attribution.md');
  const topTriangles = runtimeSceneCensus.topByVisibleTriangles;
  const topDraws = runtimeSceneCensus.topByVisibleDrawCallLike;
  const topInstances = runtimeSceneCensus.topByVisibleInstances;
  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, ${runtimeSamples.length} runtime samples, ${runtimeSceneSamples.samples.length} runtime scene-attribution samples, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Validation highlights are avg=${validationCheck(summary, 'avg_frame_ms')?.value ?? 'n/a'}ms, p99=${validationCheck(summary, 'peak_p99_frame_ms')?.value ?? 'n/a'}ms, max-frame=${validationCheck(summary, 'peak_max_frame_ms')?.value ?? 'n/a'}ms, heap end-growth=${validationCheck(summary, 'heap_growth_mb')?.value ?? 'n/a'}MB, and heap recovery=${validationCheck(summary, 'heap_recovery_ratio')?.value ?? 'n/a'}.`,
    peakSample
      ? `Peak sample index ${peakSample.sampleIndex} carries runtime frame ${peakSample.frameEvent?.frameCount ?? 'n/a'} at ${peakSample.frameEvent?.frameMs ?? 'n/a'}ms, renderer draw calls ${peakSample.renderer.drawCalls ?? 'n/a'}, renderer triangles ${peakSample.renderer.triangles ?? 'n/a'}, long task ${peakSample.longTaskMaxMs ?? 'n/a'}ms, LoAF ${peakSample.longAnimationFrameMaxMs ?? 'n/a'}ms, renderer.render user timing ${peakSample.rendererRenderUserTimingMaxMs ?? 'n/a'}ms, and WebGL upload ${peakSample.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No peak runtime sample exists.',
    nearestScene
      ? `Runtime scene-attribution sample index ${runtimeSceneCensus.sampleIndex ?? 'n/a'} is ${runtimeSceneCensus.sampleDistanceFromPeak ?? 'n/a'} sample(s) from the peak sample and records maxFrameMs ${runtimeSceneCensus.maxFrameMs ?? 'n/a'}ms.`
      : 'No runtime scene-attribution sample exists.',
    priorStaticPacket
      ? `Prior static packet classifies ${priorStaticPacket.classification?.owner ?? 'unknown'} with triangle candidate ${priorStaticPacket.sceneCensus?.topByVisibleTriangles?.category ?? 'n/a'} and draw candidate ${priorStaticPacket.sceneCensus?.topByVisibleDrawCallLike?.category ?? 'n/a'}.`
      : 'No prior static scene-category subdivision packet is present beside the artifact.',
    `Runtime scene census records ${runtimeSceneCensus.totalVisibleDrawCallLike} visible draw-call-like entries, ${runtimeSceneCensus.totalVisibleTriangles} visible triangles, ${runtimeSceneCensus.totalVisibleMeshes} visible meshes, and ${runtimeSceneCensus.totalVisibleInstances} visible instances.`,
    `Runtime scene census reconciles ${rendererReconciliation.sampledSceneDrawCallLikeToRendererDrawCalls ?? 'n/a'} of sampled renderer draw calls and ${rendererReconciliation.sampledSceneVisibleTrianglesToRendererTriangles ?? 'n/a'} of sampled renderer triangles, so it remains a scene census rather than a WebGLRenderer render-list equivalent.`,
    topTriangles
      ? `Visible triangle candidate is ${topTriangles.category} at ${topTriangles.visibleTriangles} triangles (${topTriangles.visibleTriangleShare} share).`
      : 'No visible triangle candidate exists.',
    topDraws
      ? `Visible draw-call candidate is ${topDraws.category} at ${topDraws.visibleDrawCallLike} draw-call-like entries (${topDraws.visibleDrawShare} share).`
      : 'No visible draw-call candidate exists.',
    topInstances
      ? `Visible instance candidate is ${topInstances.category} at ${topInstances.visibleInstances} instances (${topInstances.visibleInstanceShare} share).`
      : 'No visible instance candidate exists.',
    `Required scene categories missing from the runtime census are ${runtimeSceneCensus.missingRequiredCategories.join(', ') || 'none'}; required categories present but zero-visible are ${runtimeSceneCensus.zeroVisibleRequiredCategories.join(', ') || 'none'}.`,
    `Unattributed visible draw share is ${runtimeSceneCensus.unattributedVisibleDrawShare ?? 'n/a'}, so perfCategory coverage remains incomplete for authoritative render-owner assignment.`,
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
      runtimeSceneAttributionSamples: rel(runtimeSceneSamples.path),
      priorStaticSceneCategorySubdivision: rel(priorStaticPacket ? priorStaticPath : null),
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
      runtimeSamples: runtimeSamples.length,
      runtimeSceneAttributionSamples: runtimeSceneSamples.samples.length,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    priorStaticPacket,
    peakSample,
    runtimeSceneCensus,
    rendererReconciliation,
    classification: packetClassification,
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until maxFrameMs clears the compare gate.',
      'Instrument renderer-list or category-tagged draw submission if the next packet must assign renderer.render stall time rather than visible-scene census load.',
      'Reduce unattributed perfCategory coverage before declaring any category owner authoritative.',
      'Treat terrain triangle load, close-GLB draw-call load, and unattributed draw coverage as separate candidate axes until category-timed evidence collapses the owner path.',
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
  writeFileSync(join(outputDir, 'render-runtime-category-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'render-runtime-category-attribution.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 render runtime category attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`sceneSample=${report.runtimeSceneCensus.sampleIndex ?? 'n/a'} distance=${report.runtimeSceneCensus.sampleDistanceFromPeak ?? 'n/a'} triangleCandidate=${report.runtimeSceneCensus.topByVisibleTriangles?.category ?? 'n/a'}@${report.runtimeSceneCensus.topByVisibleTriangles?.visibleTriangleShare ?? 'n/a'} drawCandidate=${report.runtimeSceneCensus.topByVisibleDrawCallLike?.category ?? 'n/a'}@${report.runtimeSceneCensus.topByVisibleDrawCallLike?.visibleDrawShare ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-render-runtime-category-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
