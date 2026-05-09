#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PROJEKT_143_REQUIRED_SCENE_CATEGORIES } from './scene-attribution';

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

interface RendererCounters {
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  programs?: number;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  frameEvents?: RuntimeFrameEvent[];
  renderer?: RendererCounters;
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

interface RenderSubmissionCategory {
  category: string;
  drawSubmissions?: number;
  triangles?: number;
  instances?: number;
  meshes?: number;
  materials?: number;
  geometries?: number;
  passTypes?: Record<string, number>;
  examples?: Array<{
    nameChain?: string;
    type?: string;
    modelPath?: string | null;
    materialType?: string | null;
    passType?: string | null;
    triangles?: number;
    instances?: number;
  }>;
}

interface RenderSubmissionFrame {
  frameCount?: number;
  firstAtMs?: number;
  lastAtMs?: number;
  drawSubmissions?: number;
  triangles?: number;
  instances?: number;
  passTypes?: Record<string, number>;
  categories?: RenderSubmissionCategory[];
}

interface RenderSubmissionDrain {
  installedCount?: number;
  installPasses?: number;
  frameCountStart?: number | null;
  frameCountEnd?: number | null;
  frames?: RenderSubmissionFrame[];
  totals?: RenderSubmissionCategory[];
  errors?: string[];
}

interface RenderSubmissionSample {
  sampleIndex?: number;
  ts?: string;
  frameCount?: number;
  maxFrameMs?: number | null;
  renderer?: RendererCounters | null;
  renderSubmissions?: RenderSubmissionDrain | null;
  renderSubmissionError?: string | null;
}

interface PriorRuntimePacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  runtimeSceneCensus?: {
    topByVisibleTriangles?: { category?: string; visibleTriangleShare?: number | null };
    topByVisibleDrawCallLike?: { category?: string; visibleDrawShare?: number | null };
    topByVisibleInstances?: { category?: string; visibleInstanceShare?: number | null };
    unattributedVisibleDrawShare?: number | null;
  };
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

interface CategorySummary {
  category: string;
  drawSubmissions: number;
  drawShare: number | null;
  triangles: number;
  triangleShare: number | null;
  instances: number;
  instanceShare: number | null;
  meshes: number;
  materials: number;
  geometries: number;
  passTypes: Record<string, number>;
  examples: RenderSubmissionCategory['examples'];
}

interface FrameSelection {
  sampleIndex: number | null;
  sampleDistanceFromPeak: number | null;
  frameCount: number | null;
  frameDistanceFromPeak: number | null;
  exactPeakFrame: boolean;
  sampleFrameCount: number | null;
  sampleMaxFrameMs: number | null;
  renderSubmissionError: string | null;
  trackerInstalledCount: number | null;
  trackerInstallPasses: number | null;
  trackerErrors: string[];
  totalDrawSubmissions: number;
  totalTriangles: number;
  totalInstances: number;
  passTypes: Record<string, number>;
  categories: CategorySummary[];
  topByDrawSubmissions: CategorySummary | null;
  topByTriangles: CategorySummary | null;
  topByInstances: CategorySummary | null;
  missingRequiredCategories: string[];
  zeroSubmissionRequiredCategories: string[];
  unattributedDrawShare: number | null;
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-render-submission-category-attribution';
  status: Status;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    runtimeRenderSubmissionSamples: string;
    priorRuntimeCategoryAttribution: string | null;
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
    runtimeRenderSubmissionSamples: number;
  };
  validationHighlights: {
    avgFrameMs: ValidationCheck | null;
    peakP99FrameMs: ValidationCheck | null;
    peakMaxFrameMs: ValidationCheck | null;
    heapGrowthMb: ValidationCheck | null;
    heapRecoveryRatio: ValidationCheck | null;
    measurementTrust: ValidationCheck | null;
  };
  priorRuntimePacket: PriorRuntimePacket | null;
  peakSample: PeakSampleSummary | null;
  frameSelection: FrameSelection;
  rendererReconciliation: {
    peakRendererDrawCalls: number | null;
    selectedFrameDrawSubmissions: number;
    drawSubmissionsToRendererDrawCalls: number | null;
    peakRendererTriangles: number | null;
    selectedFrameTriangles: number;
    selectedFrameTrianglesToRendererTriangles: number | null;
    reconciliationStatus: 'submission_frame_close_to_renderer_counter' | 'submission_frame_not_renderer_counter_equivalent' | 'insufficient_renderer_counter_data';
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

const OUTPUT_NAME = 'projekt-143-render-submission-category-attribution';
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

function passTypes(value: Record<string, number> | null | undefined): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[0] === 'string' && Number.isFinite(entry[1]))
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function passTypeLabel(value: Record<string, number> | null | undefined): string {
  const entries = Object.entries(passTypes(value));
  if (entries.length === 0) return 'n/a';
  return entries.map(([name, count]) => `${name}:${count}`).join(', ');
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
    throw new Error('Usage: npx tsx scripts/projekt-143-render-submission-category-attribution.ts --artifact <perf-artifact-dir>');
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

function categorySummary(frame: RenderSubmissionFrame | null): CategorySummary[] {
  const categories = frame?.categories ?? [];
  const totalDraws = Math.max(1, num(frame?.drawSubmissions));
  const totalTriangles = Math.max(1, num(frame?.triangles));
  const totalInstances = Math.max(1, num(frame?.instances));
  return categories.map((category): CategorySummary => ({
    category: category.category,
    drawSubmissions: num(category.drawSubmissions),
    drawShare: round(num(category.drawSubmissions) / totalDraws, 4),
    triangles: num(category.triangles),
    triangleShare: round(num(category.triangles) / totalTriangles, 4),
    instances: num(category.instances),
    instanceShare: round(num(category.instances) / totalInstances, 4),
    meshes: num(category.meshes),
    materials: num(category.materials),
    geometries: num(category.geometries),
    passTypes: passTypes(category.passTypes),
    examples: category.examples ?? [],
  }));
}

function selectFrame(
  renderSamples: RenderSubmissionSample[],
  peakSample: PeakSampleSummary | null,
): { sample: RenderSubmissionSample | null; frame: RenderSubmissionFrame | null } {
  const peakSampleIndex = peakSample?.sampleIndex;
  const peakFrameCount = peakSample?.frameEvent?.frameCount;
  const candidates: Array<{
    sample: RenderSubmissionSample;
    frame: RenderSubmissionFrame;
    sampleDistance: number;
    frameDistance: number;
  }> = [];
  for (const sample of renderSamples) {
    for (const frame of sample.renderSubmissions?.frames ?? []) {
      const sampleDistance = typeof peakSampleIndex === 'number'
        ? Math.abs(num(sample.sampleIndex) - peakSampleIndex)
        : 0;
      const frameDistance = typeof peakFrameCount === 'number'
        ? Math.abs(num(frame.frameCount) - peakFrameCount)
        : 0;
      candidates.push({ sample, frame, sampleDistance, frameDistance });
    }
  }
  if (candidates.length === 0) return { sample: renderSamples[0] ?? null, frame: null };
  candidates.sort((a, b) => {
    if (a.frameDistance !== b.frameDistance) return a.frameDistance - b.frameDistance;
    if (a.sampleDistance !== b.sampleDistance) return a.sampleDistance - b.sampleDistance;
    return num(b.frame.drawSubmissions) - num(a.frame.drawSubmissions);
  });
  return { sample: candidates[0].sample, frame: candidates[0].frame };
}

function buildFrameSelection(
  selected: { sample: RenderSubmissionSample | null; frame: RenderSubmissionFrame | null },
  peakSample: PeakSampleSummary | null,
): FrameSelection {
  const categories = categorySummary(selected.frame).sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles);
  const byTriangles = [...categories].sort((a, b) => b.triangles - a.triangles);
  const byInstances = [...categories].sort((a, b) => b.instances - a.instances);
  const categorySet = new Set(categories.map((entry) => entry.category));
  const missingRequiredCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => !categorySet.has(category));
  const zeroSubmissionRequiredCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => {
    const entry = categories.find((candidate) => candidate.category === category);
    return Boolean(entry) && entry.drawSubmissions === 0;
  });
  const peakIndex = typeof peakSample?.sampleIndex === 'number' ? peakSample.sampleIndex : null;
  const peakFrame = typeof peakSample?.frameEvent?.frameCount === 'number' ? peakSample.frameEvent.frameCount : null;
  const sampleIndex = typeof selected.sample?.sampleIndex === 'number' ? selected.sample.sampleIndex : null;
  const frameCount = typeof selected.frame?.frameCount === 'number' ? selected.frame.frameCount : null;
  const unattributed = categories.find((entry) => entry.category === 'unattributed') ?? null;
  return {
    sampleIndex,
    sampleDistanceFromPeak: sampleIndex !== null && peakIndex !== null ? Math.abs(sampleIndex - peakIndex) : null,
    frameCount,
    frameDistanceFromPeak: frameCount !== null && peakFrame !== null ? Math.abs(frameCount - peakFrame) : null,
    exactPeakFrame: frameCount !== null && peakFrame !== null && frameCount === peakFrame,
    sampleFrameCount: round(selected.sample?.frameCount, 0),
    sampleMaxFrameMs: round(selected.sample?.maxFrameMs ?? undefined, 2),
    renderSubmissionError: selected.sample?.renderSubmissionError ?? null,
    trackerInstalledCount: round(selected.sample?.renderSubmissions?.installedCount, 0),
    trackerInstallPasses: round(selected.sample?.renderSubmissions?.installPasses, 0),
    trackerErrors: selected.sample?.renderSubmissions?.errors ?? [],
    totalDrawSubmissions: num(selected.frame?.drawSubmissions),
    totalTriangles: num(selected.frame?.triangles),
    totalInstances: num(selected.frame?.instances),
    passTypes: passTypes(selected.frame?.passTypes),
    categories,
    topByDrawSubmissions: categories[0] ?? null,
    topByTriangles: byTriangles[0] ?? null,
    topByInstances: byInstances[0] ?? null,
    missingRequiredCategories,
    zeroSubmissionRequiredCategories,
    unattributedDrawShare: unattributed ? unattributed.drawShare : null,
  };
}

function buildRendererReconciliation(
  peakSample: PeakSampleSummary | null,
  frameSelection: FrameSelection,
): Report['rendererReconciliation'] {
  const drawCalls = peakSample?.renderer.drawCalls ?? null;
  const triangles = peakSample?.renderer.triangles ?? null;
  const drawRatio = drawCalls ? round(frameSelection.totalDrawSubmissions / drawCalls, 4) : null;
  const triangleRatio = triangles ? round(frameSelection.totalTriangles / triangles, 4) : null;
  const close = drawRatio !== null && triangleRatio !== null
    && drawRatio >= 0.85 && drawRatio <= 1.15
    && triangleRatio >= 0.85 && triangleRatio <= 1.15;
  return {
    peakRendererDrawCalls: drawCalls,
    selectedFrameDrawSubmissions: frameSelection.totalDrawSubmissions,
    drawSubmissionsToRendererDrawCalls: drawRatio,
    peakRendererTriangles: triangles,
    selectedFrameTriangles: frameSelection.totalTriangles,
    selectedFrameTrianglesToRendererTriangles: triangleRatio,
    reconciliationStatus: drawCalls && triangles
      ? close
        ? 'submission_frame_close_to_renderer_counter'
        : 'submission_frame_not_renderer_counter_equivalent'
      : 'insufficient_renderer_counter_data',
  };
}

function classify(
  summary: Summary,
  renderSamples: RenderSubmissionSample[],
  frameSelection: FrameSelection,
  peakSample: PeakSampleSummary | null,
): Report['classification'] {
  const trusted = summary.status === 'ok' && summary.measurementTrust?.status === 'pass';
  const exact = frameSelection.exactPeakFrame;
  const hasFrame = frameSelection.totalDrawSubmissions > 0;
  const topDraw = frameSelection.topByDrawSubmissions?.category ?? null;
  const topTriangle = frameSelection.topByTriangles?.category ?? null;
  let owner = 'render_submission_attribution_missing';
  if (frameSelection.renderSubmissionError) {
    owner = 'render_submission_attribution_error';
  } else if (renderSamples.length > 0 && !exact) {
    owner = 'render_submission_nearest_frame_only';
  } else if (hasFrame && topDraw && topTriangle && topDraw !== topTriangle) {
    owner = 'render_submission_category_candidates_diverge_at_peak_frame';
  } else if (hasFrame && topDraw) {
    owner = 'render_submission_single_category_candidate_at_peak_frame';
  }
  return {
    owner,
    confidence: trusted && exact && hasFrame && Boolean(peakSample?.rendererRenderUserTimingMaxMs)
      ? 'high'
      : trusted && hasFrame
        ? 'medium'
        : 'low',
    acceptance: 'owner_review_only',
  };
}

function makeMarkdown(report: Report): string {
  const rows = report.frameSelection.categories.map((category) =>
    `| ${category.category} | ${category.drawSubmissions} | ${category.drawShare ?? 'n/a'} | ${category.triangles} | ${category.triangleShare ?? 'n/a'} | ${category.instances} | ${category.instanceShare ?? 'n/a'} | ${passTypeLabel(category.passTypes)} |`);
  return [
    '# Projekt 143 Render Submission Category Attribution',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Peak Frame',
    '',
    `- Peak sample index: ${report.peakSample?.sampleIndex ?? 'n/a'}`,
    `- Peak runtime frame: ${report.peakSample?.frameEvent?.frameCount ?? 'n/a'}`,
    `- Selected submission frame: ${report.frameSelection.frameCount ?? 'n/a'}`,
    `- Exact peak frame: ${report.frameSelection.exactPeakFrame}`,
    `- Renderer draw calls: ${report.peakSample?.renderer.drawCalls ?? 'n/a'}`,
    `- Submission draw count: ${report.frameSelection.totalDrawSubmissions}`,
    `- Renderer triangles: ${report.peakSample?.renderer.triangles ?? 'n/a'}`,
    `- Submission triangles: ${report.frameSelection.totalTriangles}`,
    `- Submission pass types: ${passTypeLabel(report.frameSelection.passTypes)}`,
    `- Renderer.render user timing max: ${report.peakSample?.rendererRenderUserTimingMaxMs ?? 'n/a'}ms`,
    '',
    '| Category | Draw submissions | Draw share | Triangles | Triangle share | Instances | Instance share | Pass types |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...rows,
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
  const renderSubmissionPath = join(artifactDir, 'runtime-render-submission-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);
  if (!existsSync(renderSubmissionPath)) throw new Error(`Missing runtime render-submission samples: ${rel(renderSubmissionPath)}`);

  const priorRuntimePath = join(
    artifactDir,
    'projekt-143-render-runtime-category-attribution',
    'render-runtime-category-attribution.json',
  );
  const summary = readJson<Summary>(summaryPath);
  const runtimeSamples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const renderSamples = readJson<RenderSubmissionSample[]>(renderSubmissionPath);
  const priorRuntimePacket = readOptionalJson<PriorRuntimePacket>(priorRuntimePath);
  const peakSample = buildPeakSample(runtimeSamples);
  const selected = selectFrame(renderSamples, peakSample);
  const frameSelection = buildFrameSelection(selected, peakSample);
  const rendererReconciliation = buildRendererReconciliation(peakSample, frameSelection);
  const packetClassification = classify(summary, renderSamples, frameSelection, peakSample);
  const status: Status = summary.status === 'ok'
    && summary.measurementTrust?.status === 'pass'
    && renderSamples.length > 0
    && frameSelection.totalDrawSubmissions > 0
    && !frameSelection.renderSubmissionError
    ? 'warn'
    : 'fail';
  const reportPath = join(outputDir, 'render-submission-category-attribution.json');
  const markdownPath = join(outputDir, 'render-submission-category-attribution.md');
  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, measurement trust ${summary.measurementTrust?.status ?? 'unknown'}, ${runtimeSamples.length} runtime samples, ${renderSamples.length} render-submission samples, and final frame count ${summary.finalFrameCount ?? 'unknown'}.`,
    `Validation highlights are avg=${validationCheck(summary, 'avg_frame_ms')?.value ?? 'n/a'}ms, p99=${validationCheck(summary, 'peak_p99_frame_ms')?.value ?? 'n/a'}ms, max-frame=${validationCheck(summary, 'peak_max_frame_ms')?.value ?? 'n/a'}ms, heap end-growth=${validationCheck(summary, 'heap_growth_mb')?.value ?? 'n/a'}MB, and heap recovery=${validationCheck(summary, 'heap_recovery_ratio')?.value ?? 'n/a'}.`,
    peakSample
      ? `Peak sample index ${peakSample.sampleIndex} carries runtime frame ${peakSample.frameEvent?.frameCount ?? 'n/a'} at ${peakSample.frameEvent?.frameMs ?? 'n/a'}ms, renderer draw calls ${peakSample.renderer.drawCalls ?? 'n/a'}, renderer triangles ${peakSample.renderer.triangles ?? 'n/a'}, long task ${peakSample.longTaskMaxMs ?? 'n/a'}ms, LoAF ${peakSample.longAnimationFrameMaxMs ?? 'n/a'}ms, renderer.render user timing ${peakSample.rendererRenderUserTimingMaxMs ?? 'n/a'}ms, and WebGL upload ${peakSample.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No peak runtime sample exists.',
    `Selected render-submission frame ${frameSelection.frameCount ?? 'n/a'} is ${frameSelection.frameDistanceFromPeak ?? 'n/a'} frame(s) from the peak event and ${frameSelection.sampleDistanceFromPeak ?? 'n/a'} sample(s) from the peak sample.`,
    `The selected frame records ${frameSelection.totalDrawSubmissions} draw submissions, ${frameSelection.totalTriangles} triangles, and ${frameSelection.totalInstances} instances.`,
    `The selected frame records pass types ${passTypeLabel(frameSelection.passTypes)}.`,
    `Submission frame reconciliation is ${rendererReconciliation.drawSubmissionsToRendererDrawCalls ?? 'n/a'} of peak renderer draw calls and ${rendererReconciliation.selectedFrameTrianglesToRendererTriangles ?? 'n/a'} of peak renderer triangles.`,
    frameSelection.topByDrawSubmissions
      ? `Top draw-submission category is ${frameSelection.topByDrawSubmissions.category} at ${frameSelection.topByDrawSubmissions.drawSubmissions} submissions (${frameSelection.topByDrawSubmissions.drawShare} share).`
      : 'No draw-submission category exists.',
    frameSelection.topByTriangles
      ? `Top triangle category is ${frameSelection.topByTriangles.category} at ${frameSelection.topByTriangles.triangles} triangles (${frameSelection.topByTriangles.triangleShare} share).`
      : 'No triangle category exists.',
    frameSelection.topByInstances
      ? `Top instance category is ${frameSelection.topByInstances.category} at ${frameSelection.topByInstances.instances} instances (${frameSelection.topByInstances.instanceShare} share).`
      : 'No instance category exists.',
    priorRuntimePacket
      ? `Prior runtime scene packet classifies ${priorRuntimePacket.classification?.owner ?? 'unknown'} with triangle candidate ${priorRuntimePacket.runtimeSceneCensus?.topByVisibleTriangles?.category ?? 'n/a'} and draw candidate ${priorRuntimePacket.runtimeSceneCensus?.topByVisibleDrawCallLike?.category ?? 'n/a'}.`
      : 'No prior runtime scene-category packet is present beside the artifact.',
    `Required scene categories missing from the submission frame are ${frameSelection.missingRequiredCategories.join(', ') || 'none'}; required categories present but zero-submission are ${frameSelection.zeroSubmissionRequiredCategories.join(', ') || 'none'}.`,
    `Unattributed draw-submission share is ${frameSelection.unattributedDrawShare ?? 'n/a'}.`,
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
      runtimeRenderSubmissionSamples: rel(renderSubmissionPath) ?? renderSubmissionPath,
      priorRuntimeCategoryAttribution: rel(priorRuntimePacket ? priorRuntimePath : null),
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
      runtimeRenderSubmissionSamples: renderSamples.length,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    priorRuntimePacket,
    peakSample,
    frameSelection,
    rendererReconciliation,
    classification: packetClassification,
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until p99 and maxFrameMs clear the compare gate.',
      'Use the category-tagged submission packet to pick the next isolation axis: top draw submissions, top triangles, or unattributed draw coverage.',
      'If submission counters do not reconcile to renderer counters, instrument the missing render pass before assigning a category owner.',
      'Do not return to suppression raycast cost, GPU present, or baseline refresh until a trusted packet moves the owner path there.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime fix.',
      'This packet does not certify visual or combat feel.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not replace a human playtest.',
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
  writeFileSync(join(outputDir, 'render-submission-category-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'render-submission-category-attribution.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 render submission category attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`frame=${report.frameSelection.frameCount ?? 'n/a'} exact=${report.frameSelection.exactPeakFrame} drawCandidate=${report.frameSelection.topByDrawSubmissions?.category ?? 'n/a'}@${report.frameSelection.topByDrawSubmissions?.drawShare ?? 'n/a'} triangleCandidate=${report.frameSelection.topByTriangles?.category ?? 'n/a'}@${report.frameSelection.topByTriangles?.triangleShare ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-render-submission-category-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
