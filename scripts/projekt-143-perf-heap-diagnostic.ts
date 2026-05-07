#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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
  };
  scenario?: {
    mode?: string;
  };
}

interface VegetationStreamDebug {
  activeCells?: number;
  targetCells?: number;
  pendingAdditions?: number;
  pendingRemovals?: number;
  lastUpdate?: {
    requestedAddBudget?: number;
    resolvedAddBudget?: number;
    maxRemovalsPerFrame?: number;
    addedCells?: number;
    removedCells?: number;
    generatedInstances?: number;
    emptyCells?: number;
    lastGeneratedCell?: {
      cellKey?: string;
      biomeId?: string | null;
      instanceCount?: number;
      typeCounts?: Record<string, number>;
      skippedReason?: string | null;
    } | null;
  };
}

interface TerrainStreamSample {
  name?: string;
  budgetMs?: number;
  timeMs?: number;
  pendingUnits?: number;
  debug?: {
    vegetation?: VegetationStreamDebug;
  };
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  heapUsedMb?: number;
  heapTotalMb?: number;
  shotsThisSession?: number;
  hitsThisSession?: number;
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
  };
  terrainStreams?: TerrainStreamSample[];
  movement?: {
    player?: {
      avgActualSpeed?: number;
      blockedByTerrain?: number;
      walkabilityTransitions?: number;
    };
  };
}

interface ConsoleEntry {
  text?: string;
  message?: string;
}

interface HeapSampleSummary {
  index: number;
  ts: string | null;
  frame: number | null;
  heapUsedMb: number | null;
  heapTotalMb: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  maxFrameMs: number | null;
  renderer: RuntimeSample['renderer'] | null;
  terrainStreams: RuntimeSample['terrainStreams'] | null;
  playerMovement: RuntimeSample['movement']['player'] | null;
  shots: number | null;
  hits: number | null;
}

interface HeapDiagnosticReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-perf-heap-diagnostic';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    validation: string | null;
    console: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    status: string | null;
    validation: string | null;
    measurementTrust: string | null;
    failureReason: string | null;
  };
  validationHighlights: {
    avgFrameMs: ValidationCheck | null;
    peakP99FrameMs: ValidationCheck | null;
    heapGrowthMb: ValidationCheck | null;
    heapPeakGrowthMb: ValidationCheck | null;
    heapRecoveryRatio: ValidationCheck | null;
    shots: ValidationCheck | null;
    hits: ValidationCheck | null;
  };
  heap: {
    sampleCount: number;
    baselineMb: number | null;
    peakMb: number | null;
    endMb: number | null;
    peakGrowthMb: number | null;
    endGrowthMb: number | null;
    reclaimedFromPeakMb: number | null;
    reclaimedFromPeakRatio: number | null;
    peakSample: HeapSampleSummary | null;
    previousSample: HeapSampleSummary | null;
    nextSample: HeapSampleSummary | null;
    topSamples: HeapSampleSummary[];
  };
  rendererDeltas: {
    startToPeak: Record<string, number | null>;
    peakToEnd: Record<string, number | null>;
  };
  streamSignalsNearPeak: {
    window: HeapSampleSummary[];
    vegetationPendingObserved: boolean;
    collisionPendingObserved: boolean;
    maxVegetationTimeMs: number | null;
    maxCollisionPendingUnits: number | null;
    maxVegetationGeneratedInstances: number | null;
    maxVegetationAddedCells: number | null;
    maxVegetationRemovedCells: number | null;
    maxVegetationActiveCells: number | null;
    vegetationDebugSnapshots: Array<{
      sampleIndex: number;
      activeCells: number | null;
      targetCells: number | null;
      pendingAdditions: number | null;
      pendingRemovals: number | null;
      lastUpdate: VegetationStreamDebug['lastUpdate'] | null;
    }>;
  };
  consoleSignals: Record<string, number>;
  classification: {
    heapShape: string;
    likelySource: string;
    acceptance: 'rejected';
  };
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-perf-heap-diagnostic';

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

function walkFiles(root: string, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, results);
    } else {
      results.push(path);
    }
  }
  return results;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function findLatestPerfArtifact(mode: string): string {
  const summaries = walkFiles(ARTIFACT_ROOT)
    .filter((path) => path.endsWith('summary.json'))
    .map((path) => {
      try {
        return { path, summary: readJson<PerfSummary>(path), mtime: statSync(path).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { path: string; summary: PerfSummary; mtime: number } =>
      Boolean(entry)
      && entry.summary.scenario?.mode === mode
      && typeof entry.summary.durationSeconds === 'number'
    )
    .sort((a, b) => b.mtime - a.mtime);
  if (!summaries[0]) {
    throw new Error(`No perf summary found for mode ${mode}`);
  }
  return dirname(summaries[0].path);
}

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sampleSummary(sample: RuntimeSample | undefined, index: number): HeapSampleSummary | null {
  if (!sample) return null;
  return {
    index,
    ts: sample.ts ?? null,
    frame: typeof sample.frameCount === 'number' ? sample.frameCount : null,
    heapUsedMb: round(sample.heapUsedMb),
    heapTotalMb: round(sample.heapTotalMb),
    avgFrameMs: round(sample.avgFrameMs),
    p99FrameMs: round(sample.p99FrameMs),
    maxFrameMs: round(sample.maxFrameMs),
    renderer: sample.renderer ?? null,
    terrainStreams: sample.terrainStreams ?? null,
    playerMovement: sample.movement?.player ?? null,
    shots: typeof sample.shotsThisSession === 'number' ? sample.shotsThisSession : null,
    hits: typeof sample.hitsThisSession === 'number' ? sample.hitsThisSession : null,
  };
}

function delta(a: number | undefined, b: number | undefined): number | null {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return round(b - a);
}

function consoleSignals(consolePath: string | null): Record<string, number> {
  if (!consolePath || !existsSync(consolePath)) return {};
  const entries = readJson<ConsoleEntry[]>(consolePath);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const text = String(entry.text ?? entry.message ?? '');
    const key = text.includes('stalled on terrain')
      ? 'terrain_stall_backtracking'
      : text.includes('AI budget')
      ? 'ai_budget_warning'
      : text.includes('SystemUpdater')
      ? 'system_budget_warning'
      : text.includes('preloaded')
      ? 'unused_preload_warning'
      : text.slice(0, 100);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function maxStreamValue(samples: HeapSampleSummary[], streamName: string, key: 'timeMs' | 'pendingUnits'): number | null {
  const values = samples.flatMap((sample) =>
    (sample.terrainStreams ?? [])
      .filter((stream) => stream.name === streamName)
      .map((stream) => stream[key])
      .filter((value): value is number => typeof value === 'number')
  );
  return values.length > 0 ? round(Math.max(...values), 3) : null;
}

function vegetationDebug(sample: HeapSampleSummary): VegetationStreamDebug | null {
  const stream = (sample.terrainStreams ?? []).find((entry) => entry.name === 'vegetation');
  return stream?.debug?.vegetation ?? null;
}

function maxVegetationDebugValue(
  samples: HeapSampleSummary[],
  read: (debug: VegetationStreamDebug) => number | undefined,
): number | null {
  const values = samples
    .map(vegetationDebug)
    .filter((debug): debug is VegetationStreamDebug => Boolean(debug))
    .map(read)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length > 0 ? round(Math.max(...values), 3) : null;
}

function classify(report: Pick<HeapDiagnosticReport, 'heap' | 'rendererDeltas' | 'streamSignalsNearPeak'>): HeapDiagnosticReport['classification'] {
  const recovered = (report.heap.reclaimedFromPeakRatio ?? 0) >= 0.7;
  const textureDeltaAfterPeak = Math.abs(report.rendererDeltas.peakToEnd.textures ?? 0);
  const geometryDeltaAfterPeak = Math.abs(report.rendererDeltas.peakToEnd.geometries ?? 0);
  const rendererStableAfterPeak = textureDeltaAfterPeak <= 2 && geometryDeltaAfterPeak <= 6;
  if (recovered && rendererStableAfterPeak && report.streamSignalsNearPeak.vegetationPendingObserved) {
    return {
      heapShape: 'transient_gc_wave',
      likelySource: 'vegetation_cell_streaming_or_other_short_lived_runtime_allocations_near_player_traversal',
      acceptance: 'rejected',
    };
  }
  if (recovered && rendererStableAfterPeak) {
    return {
      heapShape: 'transient_gc_wave',
      likelySource: 'short_lived_runtime_allocations_after_renderer_resources_stabilized',
      acceptance: 'rejected',
    };
  }
  return {
    heapShape: recovered ? 'recovering_but_unattributed' : 'retained_or_unrecovered_peak',
    likelySource: 'needs_heap_or_runtime_allocation_attribution',
    acceptance: 'rejected',
  };
}

function markdown(report: HeapDiagnosticReport): string {
  return [
    '# Projekt Objekt-143 Perf Heap Diagnostic',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source summary: ${report.inputs.summary}`,
    '',
    '## Source',
    '',
    `- Scenario: ${report.sourceSummary.scenarioMode ?? 'unknown'}`,
    `- Capture status: ${report.sourceSummary.status ?? 'unknown'}`,
    `- Validation: ${report.sourceSummary.validation ?? 'unknown'}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust ?? 'unknown'}`,
    `- Failure reason: ${report.sourceSummary.failureReason ?? 'none'}`,
    '',
    '## Heap',
    '',
    `- Baseline MB: ${report.heap.baselineMb ?? 'n/a'}`,
    `- Peak MB: ${report.heap.peakMb ?? 'n/a'}`,
    `- End MB: ${report.heap.endMb ?? 'n/a'}`,
    `- Peak growth MB: ${report.heap.peakGrowthMb ?? 'n/a'}`,
    `- End growth MB: ${report.heap.endGrowthMb ?? 'n/a'}`,
    `- Reclaimed from peak: ${report.heap.reclaimedFromPeakMb ?? 'n/a'} MB (${report.heap.reclaimedFromPeakRatio ?? 'n/a'})`,
    '',
    '## Classification',
    '',
    `- Heap shape: ${report.classification.heapShape}`,
    `- Likely source: ${report.classification.likelySource}`,
    `- Acceptance: ${report.classification.acceptance}`,
    '',
    '## Stream Signals Near Peak',
    '',
    `- Vegetation pending observed: ${report.streamSignalsNearPeak.vegetationPendingObserved}`,
    `- Collision pending observed: ${report.streamSignalsNearPeak.collisionPendingObserved}`,
    `- Max vegetation time ms: ${report.streamSignalsNearPeak.maxVegetationTimeMs ?? 'n/a'}`,
    `- Max collision pending units: ${report.streamSignalsNearPeak.maxCollisionPendingUnits ?? 'n/a'}`,
    `- Max vegetation generated instances: ${report.streamSignalsNearPeak.maxVegetationGeneratedInstances ?? 'n/a'}`,
    `- Max vegetation added cells: ${report.streamSignalsNearPeak.maxVegetationAddedCells ?? 'n/a'}`,
    `- Max vegetation removed cells: ${report.streamSignalsNearPeak.maxVegetationRemovedCells ?? 'n/a'}`,
    `- Max vegetation active cells: ${report.streamSignalsNearPeak.maxVegetationActiveCells ?? 'n/a'}`,
    `- Vegetation debug snapshots: ${report.streamSignalsNearPeak.vegetationDebugSnapshots.length}`,
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

function buildReport(artifactDir: string, outputDir: string): HeapDiagnosticReport {
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const consolePath = join(artifactDir, 'console.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const heapSamples = samples
    .map((sample, index) => ({ sample, index }))
    .filter((entry) => typeof entry.sample.heapUsedMb === 'number');
  const baselineCount = Math.max(3, Math.ceil(heapSamples.length * 0.05));
  const baselineValues = heapSamples.slice(0, baselineCount).map((entry) => Number(entry.sample.heapUsedMb));
  const baselineMb = baselineValues.length > 0
    ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
    : null;
  const peakEntry = heapSamples.slice().sort((a, b) => Number(b.sample.heapUsedMb) - Number(a.sample.heapUsedMb))[0] ?? null;
  const endEntry = heapSamples[heapSamples.length - 1] ?? null;
  const peakMb = peakEntry ? Number(peakEntry.sample.heapUsedMb) : null;
  const endMb = endEntry ? Number(endEntry.sample.heapUsedMb) : null;
  const peakGrowthMb = peakMb !== null && baselineMb !== null ? peakMb - baselineMb : null;
  const endGrowthMb = endMb !== null && baselineMb !== null ? endMb - baselineMb : null;
  const reclaimedFromPeakMb = peakMb !== null && endMb !== null ? peakMb - endMb : null;
  const reclaimedFromPeakRatio = reclaimedFromPeakMb !== null && peakGrowthMb !== null && peakGrowthMb > 0
    ? reclaimedFromPeakMb / peakGrowthMb
    : null;
  const peakIndex = peakEntry?.index ?? -1;
  const peakWindow = samples
    .map((sample, index) => ({ sample, index }))
    .filter((entry) => Math.abs(entry.index - peakIndex) <= 3)
    .map((entry) => sampleSummary(entry.sample, entry.index))
    .filter((entry): entry is HeapSampleSummary => Boolean(entry));
  const startSample = heapSamples[0]?.sample;
  const peakSample = peakEntry?.sample;
  const endSample = endEntry?.sample;
  const streamSignalsNearPeak = {
    window: peakWindow,
    vegetationPendingObserved: peakWindow.some((sample) =>
      (sample.terrainStreams ?? []).some((stream) => stream.name === 'vegetation' && (stream.pendingUnits ?? 0) > 0)
    ),
    collisionPendingObserved: peakWindow.some((sample) =>
      (sample.terrainStreams ?? []).some((stream) => stream.name === 'collision' && (stream.pendingUnits ?? 0) > 0)
    ),
    maxVegetationTimeMs: maxStreamValue(peakWindow, 'vegetation', 'timeMs'),
    maxCollisionPendingUnits: maxStreamValue(peakWindow, 'collision', 'pendingUnits'),
    maxVegetationGeneratedInstances: maxVegetationDebugValue(
      peakWindow,
      (debug) => debug.lastUpdate?.generatedInstances,
    ),
    maxVegetationAddedCells: maxVegetationDebugValue(
      peakWindow,
      (debug) => debug.lastUpdate?.addedCells,
    ),
    maxVegetationRemovedCells: maxVegetationDebugValue(
      peakWindow,
      (debug) => debug.lastUpdate?.removedCells,
    ),
    maxVegetationActiveCells: maxVegetationDebugValue(peakWindow, (debug) => debug.activeCells),
    vegetationDebugSnapshots: peakWindow
      .map((sample) => {
        const debug = vegetationDebug(sample);
        return {
          sampleIndex: sample.index,
          activeCells: round(debug?.activeCells ?? null, 0),
          targetCells: round(debug?.targetCells ?? null, 0),
          pendingAdditions: round(debug?.pendingAdditions ?? null, 0),
          pendingRemovals: round(debug?.pendingRemovals ?? null, 0),
          lastUpdate: debug?.lastUpdate ?? null,
        };
      })
      .filter((entry) =>
        entry.activeCells !== null
        || entry.targetCells !== null
        || entry.pendingAdditions !== null
        || entry.pendingRemovals !== null
        || entry.lastUpdate !== null
      ),
  };
  const rendererDeltas = {
    startToPeak: {
      textures: delta(startSample?.renderer?.textures, peakSample?.renderer?.textures),
      geometries: delta(startSample?.renderer?.geometries, peakSample?.renderer?.geometries),
      drawCalls: delta(startSample?.renderer?.drawCalls, peakSample?.renderer?.drawCalls),
      triangles: delta(startSample?.renderer?.triangles, peakSample?.renderer?.triangles),
    },
    peakToEnd: {
      textures: delta(peakSample?.renderer?.textures, endSample?.renderer?.textures),
      geometries: delta(peakSample?.renderer?.geometries, endSample?.renderer?.geometries),
      drawCalls: delta(peakSample?.renderer?.drawCalls, endSample?.renderer?.drawCalls),
      triangles: delta(peakSample?.renderer?.triangles, endSample?.renderer?.triangles),
    },
  };
  const heap = {
    sampleCount: heapSamples.length,
    baselineMb: round(baselineMb),
    peakMb: round(peakMb),
    endMb: round(endMb),
    peakGrowthMb: round(peakGrowthMb),
    endGrowthMb: round(endGrowthMb),
    reclaimedFromPeakMb: round(reclaimedFromPeakMb),
    reclaimedFromPeakRatio: round(reclaimedFromPeakRatio, 4),
    peakSample: sampleSummary(peakEntry?.sample, peakEntry?.index ?? -1),
    previousSample: sampleSummary(samples[peakIndex - 1], peakIndex - 1),
    nextSample: sampleSummary(samples[peakIndex + 1], peakIndex + 1),
    topSamples: heapSamples
      .slice()
      .sort((a, b) => Number(b.sample.heapUsedMb) - Number(a.sample.heapUsedMb))
      .slice(0, 8)
      .map((entry) => sampleSummary(entry.sample, entry.index))
      .filter((entry): entry is HeapSampleSummary => Boolean(entry)),
  };
  const partialReport = { heap, rendererDeltas, streamSignalsNearPeak };
  const report: HeapDiagnosticReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-perf-heap-diagnostic',
    status: summary.validation?.overall === 'fail' || summary.status === 'failed' ? 'warn' : 'pass',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      console: existsSync(consolePath) ? rel(consolePath) : null,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? null,
      status: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      failureReason: summary.failureReason ?? null,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapPeakGrowthMb: validationCheck(summary, 'heap_peak_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      shots: validationCheck(summary, 'harness_min_shots_fired'),
      hits: validationCheck(summary, 'harness_min_hits_recorded'),
    },
    heap,
    rendererDeltas,
    streamSignalsNearPeak,
    consoleSignals: consoleSignals(existsSync(consolePath) ? consolePath : null),
    classification: classify(partialReport),
    nextActions: [
      'Do not use this perf capture for KB-TERRAIN acceptance.',
      'Instrument or reduce short-lived vegetation/runtime allocation around cell residency changes before rerunning the matched Open Frontier/A Shau perf pair.',
      'If the next run still fails on peak heap with strong recovery, inspect allocation churn rather than renderer retained resources first.',
    ],
    nonClaims: [
      'This diagnostic does not prove a heap fix.',
      'This diagnostic does not certify matched terrain perf or production parity.',
      'This diagnostic does not replace owner terrain visual review.',
    ],
    files: {
      summary: rel(join(outputDir, 'heap-diagnostic.json')) ?? '',
      markdown: rel(join(outputDir, 'heap-diagnostic.md')) ?? '',
    },
  };
  return report;
}

function main(): void {
  const mode = argValue('--mode') ?? 'open_frontier';
  const artifactArg = argValue('--artifact');
  const artifactDir = artifactArg ? resolve(artifactArg) : findLatestPerfArtifact(mode);
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(artifactDir, outputDir);
  writeFileSync(join(outputDir, 'heap-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'heap-diagnostic.md'), markdown(report), 'utf-8');
  console.log(`Projekt 143 perf heap diagnostic ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`source=${report.inputs.summary}`);
  console.log(`classification=${report.classification.heapShape}/${report.classification.likelySource}`);
  console.log(`heap peak=${report.heap.peakMb}MB end=${report.heap.endMb}MB reclaimed=${report.heap.reclaimedFromPeakRatio}`);
}

main();
