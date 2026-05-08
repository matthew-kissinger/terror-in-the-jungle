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
  status?: string;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
  };
  scenario?: {
    mode?: string;
  };
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  overBudgetPercent?: number;
  shotsThisSession?: number;
  hitRate?: number;
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
  };
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    spatialSyncMs?: number;
    billboardUpdateMs?: number;
    effectPoolsMs?: number;
    influenceMapMs?: number;
  };
  terrainStreams?: Array<{
    name?: string;
    timeMs?: number;
    budgetMs?: number;
    pendingUnits?: number;
  }>;
  systemTop?: Array<{
    name?: string;
    emaMs?: number;
    peakMs?: number;
  }>;
}

interface SceneAttributionEntry {
  category?: string;
  visibleDrawCallLike?: number;
  visibleTriangles?: number;
  visibleInstances?: number;
  drawCallLike?: number;
  triangles?: number;
  instances?: number;
}

interface WindowSummary {
  name: string;
  sampleStart: number;
  sampleEnd: number;
  sampleCount: number;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  overBudgetPercent: number | null;
  shotsThisSessionMax: number | null;
  hitRateAvg: number | null;
  renderer: {
    drawCalls: number | null;
    triangles: number | null;
    geometries: number | null;
    textures: number | null;
  };
  combatBreakdown: {
    totalMs: number | null;
    aiUpdateMs: number | null;
    billboardUpdateMs: number | null;
    spatialSyncMs: number | null;
    effectPoolsMs: number | null;
    influenceMapMs: number | null;
  };
  terrainMaxMs: number | null;
  topSystems: Array<{
    name: string;
    meanEmaMs: number;
    maxPeakMs: number | null;
  }>;
}

interface AvgFrameAttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-avg-frame-attribution';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    sceneAttribution: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  windows: WindowSummary[];
  trend: {
    lateMinusEarlyAvgFrameMs: number | null;
    lateMinusEarlyCombatTotalMs: number | null;
    lateMinusEarlyAiUpdateMs: number | null;
    lateMinusEarlyDrawCalls: number | null;
    lateMinusEarlyTriangles: number | null;
    lateMinusEarlyShots: number | null;
  };
  correlations: Record<string, number | null>;
  sceneAttribution: Array<{
    category: string;
    visibleDrawCallLike: number | null;
    visibleTriangles: number | null;
    visibleInstances: number | null;
  }>;
  classification: {
    avgFrameOwner: string;
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
const OUTPUT_NAME = 'projekt-143-avg-frame-attribution';

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

function finiteNumbers(values: Array<number | undefined | null>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function average(values: Array<number | undefined | null>): number | null {
  const finite = finiteNumbers(values);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function maximum(values: Array<number | undefined | null>): number | null {
  const finite = finiteNumbers(values);
  return finite.length > 0 ? Math.max(...finite) : null;
}

function pearson(
  samples: RuntimeSample[],
  x: (sample: RuntimeSample) => number | undefined | null,
  y: (sample: RuntimeSample) => number | undefined | null,
): number | null {
  const pairs = samples
    .map((sample) => [x(sample), y(sample)] as const)
    .filter((pair): pair is readonly [number, number] =>
      typeof pair[0] === 'number' && Number.isFinite(pair[0])
      && typeof pair[1] === 'number' && Number.isFinite(pair[1]));
  if (pairs.length < 3) return null;
  const meanX = average(pairs.map((pair) => pair[0])) ?? 0;
  const meanY = average(pairs.map((pair) => pair[1])) ?? 0;
  let numerator = 0;
  let x2 = 0;
  let y2 = 0;
  for (const [xValue, yValue] of pairs) {
    const dx = xValue - meanX;
    const dy = yValue - meanY;
    numerator += dx * dy;
    x2 += dx * dx;
    y2 += dy * dy;
  }
  if (x2 === 0 || y2 === 0) return null;
  return numerator / Math.sqrt(x2 * y2);
}

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function topSystems(samples: RuntimeSample[]): WindowSummary['topSystems'] {
  const byName = new Map<string, { ema: number[]; peak: number[] }>();
  for (const sample of samples) {
    for (const entry of sample.systemTop ?? []) {
      const name = String(entry.name ?? '');
      if (!name) continue;
      const current = byName.get(name) ?? { ema: [], peak: [] };
      current.ema.push(Number(entry.emaMs ?? 0));
      current.peak.push(Number(entry.peakMs ?? 0));
      byName.set(name, current);
    }
  }
  return [...byName.entries()]
    .map(([name, values]) => ({
      name,
      meanEmaMs: round(average(values.ema), 2) ?? 0,
      maxPeakMs: round(maximum(values.peak), 2),
    }))
    .sort((a, b) => b.meanEmaMs - a.meanEmaMs)
    .slice(0, 8);
}

function windowSummary(name: string, samples: RuntimeSample[], sampleStart: number): WindowSummary {
  const terrainTimes = samples.flatMap((sample) => (sample.terrainStreams ?? []).map((stream) => Number(stream.timeMs ?? 0)));
  return {
    name,
    sampleStart,
    sampleEnd: sampleStart + samples.length - 1,
    sampleCount: samples.length,
    avgFrameMs: round(average(samples.map((sample) => sample.avgFrameMs))),
    p99FrameMs: round(average(samples.map((sample) => sample.p99FrameMs))),
    maxFrameMs: round(maximum(samples.map((sample) => sample.maxFrameMs))),
    overBudgetPercent: round(average(samples.map((sample) => sample.overBudgetPercent))),
    shotsThisSessionMax: round(maximum(samples.map((sample) => sample.shotsThisSession)), 0),
    hitRateAvg: round(average(samples.map((sample) => sample.hitRate)), 4),
    renderer: {
      drawCalls: round(average(samples.map((sample) => sample.renderer?.drawCalls))),
      triangles: round(average(samples.map((sample) => sample.renderer?.triangles)), 0),
      geometries: round(average(samples.map((sample) => sample.renderer?.geometries)), 0),
      textures: round(average(samples.map((sample) => sample.renderer?.textures)), 0),
    },
    combatBreakdown: {
      totalMs: round(average(samples.map((sample) => sample.combatBreakdown?.totalMs))),
      aiUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.aiUpdateMs))),
      billboardUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.billboardUpdateMs))),
      spatialSyncMs: round(average(samples.map((sample) => sample.combatBreakdown?.spatialSyncMs))),
      effectPoolsMs: round(average(samples.map((sample) => sample.combatBreakdown?.effectPoolsMs))),
      influenceMapMs: round(average(samples.map((sample) => sample.combatBreakdown?.influenceMapMs))),
    },
    terrainMaxMs: round(maximum(terrainTimes)),
    topSystems: topSystems(samples),
  };
}

function splitWindows(samples: RuntimeSample[]): WindowSummary[] {
  const firstBreak = Math.floor(samples.length / 3);
  const secondBreak = Math.floor((samples.length * 2) / 3);
  return [
    windowSummary('early', samples.slice(0, firstBreak), 0),
    windowSummary('middle', samples.slice(firstBreak, secondBreak), firstBreak),
    windowSummary('late', samples.slice(secondBreak), secondBreak),
  ];
}

function diff(a: number | null, b: number | null): number | null {
  return round((a ?? Number.NaN) - (b ?? Number.NaN));
}

function sceneSummary(path: string): AvgFrameAttributionReport['sceneAttribution'] {
  if (!existsSync(path)) return [];
  return readJson<SceneAttributionEntry[]>(path)
    .map((entry) => ({
      category: String(entry.category ?? 'unknown'),
      visibleDrawCallLike: round(entry.visibleDrawCallLike ?? entry.drawCallLike, 0),
      visibleTriangles: round(entry.visibleTriangles ?? entry.triangles, 0),
      visibleInstances: round(entry.visibleInstances ?? entry.instances, 0),
    }))
    .sort((a, b) => Number(b.visibleDrawCallLike ?? 0) - Number(a.visibleDrawCallLike ?? 0))
    .slice(0, 12);
}

function classify(windows: WindowSummary[], scene: AvgFrameAttributionReport['sceneAttribution']): AvgFrameAttributionReport['classification'] {
  const early = windows[0];
  const late = windows[2];
  const avgRise = (late.avgFrameMs ?? 0) - (early.avgFrameMs ?? 0);
  const combatRise = (late.combatBreakdown.totalMs ?? 0) - (early.combatBreakdown.totalMs ?? 0);
  const drawDelta = (late.renderer.drawCalls ?? 0) - (early.renderer.drawCalls ?? 0);
  const terrainMax = maximum(windows.map((window) => window.terrainMaxMs)) ?? 0;
  const closeGlb = scene.find((entry) => entry.category === 'npc_close_glb');
  if (avgRise >= 4 && combatRise >= 1 && drawDelta <= 0 && terrainMax < 1) {
    return {
      avgFrameOwner: 'late_combat_phase_cpu_pressure_not_renderer_or_terrain_stream_growth',
      confidence: closeGlb ? 'high' : 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (avgRise >= 4 && drawDelta > 20) {
    return {
      avgFrameOwner: 'late_renderer_visibility_growth',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  return {
    avgFrameOwner: 'mixed_or_insufficient_avg_frame_attribution',
    confidence: 'low',
    acceptance: 'diagnostic_only',
  };
}

function buildReport(artifactDir: string, outputDir: string): AvgFrameAttributionReport {
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const sceneAttributionPath = join(artifactDir, 'scene-attribution.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const windows = splitWindows(samples);
  const early = windows[0];
  const late = windows[2];
  const scene = sceneSummary(sceneAttributionPath);
  const classification = classify(windows, scene);
  const reportPath = join(outputDir, 'avg-frame-attribution.json');
  const markdownPath = join(outputDir, 'avg-frame-attribution.md');
  const findings = [
    `Average frame window rises from ${early.avgFrameMs ?? 'n/a'}ms early to ${late.avgFrameMs ?? 'n/a'}ms late while draw calls move from ${early.renderer.drawCalls ?? 'n/a'} to ${late.renderer.drawCalls ?? 'n/a'}.`,
    `Combat total rises from ${early.combatBreakdown.totalMs ?? 'n/a'}ms early to ${late.combatBreakdown.totalMs ?? 'n/a'}ms late; AI update rises from ${early.combatBreakdown.aiUpdateMs ?? 'n/a'}ms to ${late.combatBreakdown.aiUpdateMs ?? 'n/a'}ms.`,
    `Late top system is ${late.topSystems[0]?.name ?? 'n/a'} at ${late.topSystems[0]?.meanEmaMs ?? 'n/a'}ms mean EMA; terrain stream max across windows is ${maximum(windows.map((window) => window.terrainMaxMs)) ?? 'n/a'}ms.`,
    `Classification is ${classification.avgFrameOwner} with ${classification.confidence} confidence.`,
  ];
  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-avg-frame-attribution',
    status: summary.status === 'ok' && summary.measurementTrust?.status === 'pass' ? 'warn' : 'fail',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      sceneAttribution: existsSync(sceneAttributionPath) ? rel(sceneAttributionPath) : null,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
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
    windows,
    trend: {
      lateMinusEarlyAvgFrameMs: diff(late.avgFrameMs, early.avgFrameMs),
      lateMinusEarlyCombatTotalMs: diff(late.combatBreakdown.totalMs, early.combatBreakdown.totalMs),
      lateMinusEarlyAiUpdateMs: diff(late.combatBreakdown.aiUpdateMs, early.combatBreakdown.aiUpdateMs),
      lateMinusEarlyDrawCalls: diff(late.renderer.drawCalls, early.renderer.drawCalls),
      lateMinusEarlyTriangles: diff(late.renderer.triangles, early.renderer.triangles),
      lateMinusEarlyShots: diff(late.shotsThisSessionMax, early.shotsThisSessionMax),
    },
    correlations: {
      avgFrameVsCombatTotal: round(pearson(samples, (sample) => sample.avgFrameMs, (sample) => sample.combatBreakdown?.totalMs), 3),
      avgFrameVsAiUpdate: round(pearson(samples, (sample) => sample.avgFrameMs, (sample) => sample.combatBreakdown?.aiUpdateMs), 3),
      avgFrameVsBillboardUpdate: round(pearson(samples, (sample) => sample.avgFrameMs, (sample) => sample.combatBreakdown?.billboardUpdateMs), 3),
      avgFrameVsDrawCalls: round(pearson(samples, (sample) => sample.avgFrameMs, (sample) => sample.renderer?.drawCalls), 3),
      avgFrameVsShots: round(pearson(samples, (sample) => sample.avgFrameMs, (sample) => sample.shotsThisSession), 3),
    },
    sceneAttribution: scene,
    classification,
    findings,
    nextActions: [
      'Do not refresh combat120 baseline from this packet.',
      'Treat the residual avg-frame warning as late engagement-phase Combat CPU pressure until a focused owner change proves otherwise.',
      'Target the already mapped Combat AI, close-model scenegraph animation, and terrain-height query owners before changing visual caps again.',
    ],
    nonClaims: [
      'This sidecar does not prove a runtime fix.',
      'This sidecar does not authorize a perf baseline refresh.',
      'This sidecar does not provide human visual acceptance for the lower close-actor cap.',
    ],
    files: {
      summary: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };
}

function markdown(report: AvgFrameAttributionReport): string {
  const rows = report.windows.map((window) =>
    `| ${window.name} | ${window.avgFrameMs ?? 'n/a'} | ${window.combatBreakdown.totalMs ?? 'n/a'} | ${window.combatBreakdown.aiUpdateMs ?? 'n/a'} | ${window.renderer.drawCalls ?? 'n/a'} | ${window.shotsThisSessionMax ?? 'n/a'} | ${window.topSystems[0]?.name ?? 'n/a'} ${window.topSystems[0]?.meanEmaMs ?? 'n/a'} |`);
  return [
    '# Projekt 143 Avg-Frame Attribution',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Classification: ${report.classification.avgFrameOwner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Windows',
    '',
    '| Window | Avg frame ms | Combat total ms | AI update ms | Draw calls | Shots max | Top system |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...rows,
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
  writeFileSync(join(outputDir, 'avg-frame-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'avg-frame-attribution.md'), markdown(report), 'utf-8');
  console.log(`Projekt 143 avg-frame attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`source=${report.inputs.summary}`);
  console.log(`classification=${report.classification.avgFrameOwner}/${report.classification.confidence}`);
  console.log(`lateMinusEarlyAvgFrameMs=${report.trend.lateMinusEarlyAvgFrameMs ?? 'n/a'}`);
}

main();
