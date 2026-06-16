#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

type ValidationCheck = {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  value: number;
  message: string;
};

type ValidationReport = {
  overall: 'pass' | 'warn' | 'fail';
  checks: ValidationCheck[];
};

type RuntimeSample = {
  ts: string;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  combatantCount: number;
  overBudgetPercent: number;
  heapUsedMb?: number;
  heapTotalMb?: number;
  vegetation?: {
    activeTotal: number;
    reservedTotal: number;
    freeTotal: number;
    chunksTracked: number;
    byType: Record<string, {
      active: number;
      highWater: number;
      free: number;
    }>;
  };
  renderer?: {
    drawCalls: number;
    drawCallsSinceLastSample?: number | null;
    drawCallsPerFrameSinceLastSample?: number | null;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  browserStalls?: {
    totals?: {
      longTaskCount?: number;
      longTaskTotalDurationMs?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameTotalDurationMs?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      rafCadence?: {
        intervalCount?: number;
        overBudget60HzMs?: number;
        overBudget60HzMsPerSecond?: number;
        droppedFrameTime60HzMs?: number;
        droppedFrameTime60HzMsPerSecond?: number;
        estimatedDropped60HzFrames?: number;
        estimatedDropped60HzFramesPerSecond?: number;
      };
      userTimingByName?: Record<string, {
        count?: number;
        totalDurationMs?: number;
        maxDurationMs?: number;
      }>;
    };
  };
  combatBreakdown?: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    effectPoolsMs: number;
    influenceMapMs: number;
    aiStateMs?: Record<string, number>;
  };
  terrainStreams?: Array<{
    name: string;
    budgetMs: number;
    timeMs: number;
    pendingUnits: number;
    debug?: Record<string, unknown>;
  }>;
  systemTop: Array<{ name: string; emaMs: number; peakMs: number }>;
};

const root = join(process.cwd(), 'artifacts', 'perf');

function listCaptureDirs(): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => {
      const summaryPath = join(root, name, 'summary.json');
      const samplesPath = join(root, name, 'runtime-samples.json');
      if (!existsSync(summaryPath) || !existsSync(samplesPath)) return false;
      try {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        const samples = JSON.parse(readFileSync(samplesPath, 'utf-8'));
        const finalFrameCount = Number(summary?.finalFrameCount ?? 0);
        return Array.isArray(samples) && (samples.length > 0 || finalFrameCount > 0);
      } catch {
        return false;
      }
    })
    .sort();
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const dirs = listCaptureDirs();
if (dirs.length === 0) {
  console.error('No complete capture artifacts found under artifacts/perf');
  process.exit(1);
}

const latest = dirs[dirs.length - 1];
const latestDir = join(root, latest);
const summaryPath = join(latestDir, 'summary.json');
const validationPath = join(latestDir, 'validation.json');
const samplesPath = join(latestDir, 'runtime-samples.json');

const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
const validation = existsSync(validationPath)
  ? (JSON.parse(readFileSync(validationPath, 'utf-8')) as ValidationReport)
  : null;
const samples = existsSync(samplesPath)
  ? (JSON.parse(readFileSync(samplesPath, 'utf-8')) as RuntimeSample[])
  : [];

const avgFrameMs = avg(samples.map(s => s.avgFrameMs));
const avgOverBudget = avg(samples.map(s => s.overBudgetPercent));
const maxP95 = samples.reduce((max, s) => Math.max(max, s.p95FrameMs), 0);
const heapSamples = samples.filter(s => typeof s.heapUsedMb === 'number');
const heapBaselineCount = Math.min(3, heapSamples.length);
const heapBaseline = heapBaselineCount > 0
  ? avg(heapSamples.slice(0, heapBaselineCount).map(s => Number(s.heapUsedMb ?? 0)))
  : 0;
const heapEnd = heapSamples.length > 0 ? Number(heapSamples[heapSamples.length - 1].heapUsedMb ?? 0) : 0;
const heapPeak = heapSamples.length > 0 ? Math.max(...heapSamples.map(s => Number(s.heapUsedMb ?? 0))) : 0;
const heapGrowth = heapSamples.length >= 2
  ? heapEnd - heapBaseline
  : 0;
const heapPeakGrowth = heapSamples.length >= 2
  ? heapPeak - heapBaseline
  : 0;
const heapRecoveryFromPeak = heapSamples.length >= 2
  ? heapPeak - heapEnd
  : 0;
const rendererSamples = samples.filter(s => s.renderer);
const avgDrawCalls = rendererSamples.length > 0
  ? avg(rendererSamples.map(s => Number(s.renderer?.drawCalls ?? 0)))
  : 0;
const drawCallDeltaSamples = rendererSamples
  .map(s => Number(s.renderer?.drawCallsSinceLastSample))
  .filter(value => Number.isFinite(value));
const avgDrawCallsSinceLastSample = drawCallDeltaSamples.length > 0
  ? avg(drawCallDeltaSamples)
  : null;
const drawCallsPerFrameSamples = rendererSamples
  .map(s => Number(s.renderer?.drawCallsPerFrameSinceLastSample))
  .filter(value => Number.isFinite(value));
const avgDrawCallsPerFrame = drawCallsPerFrameSamples.length > 0
  ? avg(drawCallsPerFrameSamples)
  : null;
const avgTriangles = rendererSamples.length > 0
  ? avg(rendererSamples.map(s => Number(s.renderer?.triangles ?? 0)))
  : 0;
const maxTextures = rendererSamples.length > 0
  ? Math.max(...rendererSamples.map(s => Number(s.renderer?.textures ?? 0)))
  : 0;
const maxGeometries = rendererSamples.length > 0
  ? Math.max(...rendererSamples.map(s => Number(s.renderer?.geometries ?? 0)))
  : 0;
const vegetationSamples = samples.filter(s => s.vegetation);
const avgVegetationActive = vegetationSamples.length > 0
  ? avg(vegetationSamples.map(s => Number(s.vegetation?.activeTotal ?? 0)))
  : null;
const peakVegetationActive = vegetationSamples.length > 0
  ? Math.max(...vegetationSamples.map(s => Number(s.vegetation?.activeTotal ?? 0)))
  : null;
const avgVegetationReserved = vegetationSamples.length > 0
  ? avg(vegetationSamples.map(s => Number(s.vegetation?.reservedTotal ?? 0)))
  : null;
const peakVegetationChunks = vegetationSamples.length > 0
  ? Math.max(...vegetationSamples.map(s => Number(s.vegetation?.chunksTracked ?? 0)))
  : null;
const vegetationTypeBuckets = new Map<string, number[]>();
for (const sample of vegetationSamples) {
  for (const [type, stats] of Object.entries(sample.vegetation?.byType ?? {})) {
    const bucket = vegetationTypeBuckets.get(type) ?? [];
    bucket.push(Number(stats.active ?? 0));
    vegetationTypeBuckets.set(type, bucket);
  }
}
const topVegetationTypes = [...vegetationTypeBuckets.entries()]
  .map(([type, values]) => ({
    type,
    avgActive: avg(values),
    peakActive: values.length > 0 ? Math.max(...values) : 0,
  }))
  .filter(entry => entry.peakActive > 0)
  .sort((a, b) => b.avgActive - a.avgActive)
  .slice(0, 5);
const stallSamples = samples.filter(s => s.browserStalls?.totals);
const longTaskCount = stallSamples.length > 0
  ? Math.max(...stallSamples.map(s => Number(s.browserStalls?.totals?.longTaskCount ?? 0)))
  : 0;
const longTaskMaxMs = stallSamples.length > 0
  ? Math.max(...stallSamples.map(s => Number(s.browserStalls?.totals?.longTaskMaxDurationMs ?? 0)))
  : 0;
const loafCount = stallSamples.length > 0
  ? Math.max(...stallSamples.map(s => Number(s.browserStalls?.totals?.longAnimationFrameCount ?? 0)))
  : 0;
const loafBlockingMs = stallSamples.length > 0
  ? Math.max(...stallSamples.map(s => Number(s.browserStalls?.totals?.longAnimationFrameBlockingDurationMs ?? 0)))
  : 0;
const latestRafCadence = stallSamples.length > 0
  ? stallSamples[stallSamples.length - 1].browserStalls?.totals?.rafCadence
  : undefined;
const hasRafTimeMetrics = typeof summary?.droppedFrameMetrics?.browserRaf?.overBudget60HzMs === 'number'
  || typeof summary?.droppedFrameMetrics?.browserRaf?.droppedFrameTime60HzMs === 'number'
  || typeof latestRafCadence?.overBudget60HzMs === 'number'
  || typeof latestRafCadence?.droppedFrameTime60HzMs === 'number';
const rafDropped60HzFrames = Number(
  summary?.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFrames
    ?? latestRafCadence?.estimatedDropped60HzFrames
    ?? 0
);
const rafDropped60HzFramesPerSecond = Number(
  summary?.droppedFrameMetrics?.browserRaf?.estimatedDropped60HzFramesPerSecond
    ?? latestRafCadence?.estimatedDropped60HzFramesPerSecond
    ?? 0
);
const rafOverBudget60HzMs = Number(
  summary?.droppedFrameMetrics?.browserRaf?.overBudget60HzMs
    ?? latestRafCadence?.overBudget60HzMs
    ?? 0
);
const rafOverBudget60HzMsPerSecond = Number(
  summary?.droppedFrameMetrics?.browserRaf?.overBudget60HzMsPerSecond
    ?? latestRafCadence?.overBudget60HzMsPerSecond
    ?? 0
);
const rafDroppedFrameTime60HzMs = Number(
  summary?.droppedFrameMetrics?.browserRaf?.droppedFrameTime60HzMs
    ?? latestRafCadence?.droppedFrameTime60HzMs
    ?? 0
);
const rafDroppedFrameTime60HzMsPerSecond = Number(
  summary?.droppedFrameMetrics?.browserRaf?.droppedFrameTime60HzMsPerSecond
    ?? latestRafCadence?.droppedFrameTime60HzMsPerSecond
    ?? 0
);
const tailAttributionConclusion = typeof summary?.tailAttribution?.conclusion === 'string'
  ? String(summary.tailAttribution.conclusion)
  : null;
const latestUserTiming = stallSamples.length > 0
  ? (stallSamples[stallSamples.length - 1].browserStalls?.totals?.userTimingByName ?? {})
  : {};
const topUserTiming = Object.entries(latestUserTiming)
  .map(([name, bucket]) => ({
    name,
    count: Number(bucket?.count ?? 0),
    totalDurationMs: Number(bucket?.totalDurationMs ?? 0),
    maxDurationMs: Number(bucket?.maxDurationMs ?? 0)
  }))
  .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
  .slice(0, 5);

const topSystemCounts = new Map<string, number>();
for (const s of samples) {
  const top = s.systemTop?.[0]?.name ?? 'unknown';
  topSystemCounts.set(top, (topSystemCounts.get(top) ?? 0) + 1);
}
const dominantSystems = [...topSystemCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);
const terrainStreamSamples = samples.filter(s => Array.isArray(s.terrainStreams) && s.terrainStreams.length > 0);
const terrainBuckets = new Map<string, {
  sampleCount: number;
  timeMs: number[];
  budgetMs: number[];
  pendingUnits: number[];
  pendingSequence: number[];
  overBudgetSamples: number;
}>();
for (const sample of terrainStreamSamples) {
  for (const stream of sample.terrainStreams ?? []) {
    const bucket = terrainBuckets.get(stream.name) ?? {
      sampleCount: 0,
      timeMs: [],
      budgetMs: [],
      pendingUnits: [],
      pendingSequence: [],
      overBudgetSamples: 0
    };
    bucket.sampleCount += 1;
    bucket.timeMs.push(Number(stream.timeMs ?? 0));
    bucket.budgetMs.push(Number(stream.budgetMs ?? 0));
    bucket.pendingUnits.push(Number(stream.pendingUnits ?? 0));
    bucket.pendingSequence.push(Number(stream.pendingUnits ?? 0));
    if (Number(stream.timeMs ?? 0) > Number(stream.budgetMs ?? 0)) {
      bucket.overBudgetSamples += 1;
    }
    terrainBuckets.set(stream.name, bucket);
  }
}
const terrainSummary = [...terrainBuckets.entries()]
  .map(([name, bucket]) => ({
    name,
    samples: bucket.sampleCount,
    avgTimeMs: avg(bucket.timeMs),
    peakTimeMs: bucket.timeMs.length > 0 ? Math.max(...bucket.timeMs) : 0,
    avgBudgetMs: avg(bucket.budgetMs),
    avgPendingUnits: avg(bucket.pendingUnits),
    peakPendingUnits: bucket.pendingUnits.length > 0 ? Math.max(...bucket.pendingUnits) : 0,
    overBudgetRate: bucket.sampleCount > 0 ? bucket.overBudgetSamples / bucket.sampleCount : 0,
    firstPendingUnits: bucket.pendingSequence.length > 0 ? bucket.pendingSequence[0] : 0,
    lastPendingUnits: bucket.pendingSequence.length > 0 ? bucket.pendingSequence[bucket.pendingSequence.length - 1] : 0,
    zeroPendingSamples: bucket.pendingSequence.filter(v => v === 0).length,
  }))
  .sort((a, b) => {
    const pendingDelta = b.avgPendingUnits - a.avgPendingUnits;
    if (Math.abs(pendingDelta) > 0.001) return pendingDelta;
    return b.avgTimeMs - a.avgTimeMs;
  });
const terrainQueueFlags = terrainSummary.flatMap(stream => {
  const flags: string[] = [];
  const pendingDidNotDrain = stream.peakPendingUnits >= 8
    && stream.zeroPendingSamples === 0
    && stream.lastPendingUnits >= stream.firstPendingUnits;
  if (pendingDidNotDrain) {
    flags.push(
      `${stream.name}: pending queue did not drain (start ${stream.firstPendingUnits.toFixed(0)}, ` +
      `end ${stream.lastPendingUnits.toFixed(0)}, peak ${stream.peakPendingUnits.toFixed(0)})`
    );
  }
  if (stream.overBudgetRate >= 0.5) {
    flags.push(
      `${stream.name}: over budget in ${(stream.overBudgetRate * 100).toFixed(1)}% of sampled frames`
    );
  }
  return flags;
});
const renderTerrainDebugSamples = samples
  .map(sample => sample.terrainStreams?.find(stream => stream.name === 'render')?.debug)
  .filter((debug): debug is Record<string, unknown> => Boolean(debug));
const latestRenderTerrainDebug = renderTerrainDebugSamples.length > 0
  ? renderTerrainDebugSamples[renderTerrainDebugSamples.length - 1]
  : null;
const peakTerrainSelectionMs = renderTerrainDebugSamples.length > 0
  ? Math.max(...renderTerrainDebugSamples.map(debug => Number(debug.lastSelectionMs ?? 0)).filter(Number.isFinite))
  : null;
const peakTerrainUpdateInstancesMs = renderTerrainDebugSamples.length > 0
  ? Math.max(...renderTerrainDebugSamples.map(debug => Number(debug.lastUpdateInstancesMs ?? 0)).filter(Number.isFinite))
  : null;

console.log(`Artifact: ${latestDir}`);
console.log(`Status: ${summary.status}`);
if (summary.failureReason) console.log(`Failure: ${summary.failureReason}`);
console.log(`Final frameCount: ${summary.finalFrameCount}`);
console.log(`Samples: ${samples.length}`);
console.log(`Avg frame ms: ${avgFrameMs.toFixed(2)}`);
console.log(`Max p95 frame ms: ${maxP95.toFixed(2)}`);
console.log(`Avg over-budget %: ${avgOverBudget.toFixed(2)}`);
console.log(`rAF dropped 60Hz frames: ${rafDropped60HzFrames.toFixed(0)} (${rafDropped60HzFramesPerSecond.toFixed(2)}/s)`);
if (hasRafTimeMetrics) {
  console.log(`rAF over-budget 60Hz time: ${rafOverBudget60HzMs.toFixed(1)}ms (${rafOverBudget60HzMsPerSecond.toFixed(2)}ms/s)`);
  console.log(`rAF dropped-frame 60Hz time: ${rafDroppedFrameTime60HzMs.toFixed(1)}ms (${rafDroppedFrameTime60HzMsPerSecond.toFixed(2)}ms/s)`);
} else {
  console.log('rAF over-budget 60Hz time: unavailable (artifact predates rAF time metrics)');
  console.log('rAF dropped-frame 60Hz time: unavailable (artifact predates rAF time metrics)');
}
if (tailAttributionConclusion) {
  console.log(`Tail attribution: ${tailAttributionConclusion}`);
}
if (heapSamples.length > 0) {
  console.log(`Heap growth (MB): ${heapGrowth.toFixed(2)}`);
  console.log(`Heap peak growth (MB): ${heapPeakGrowth.toFixed(2)}`);
  console.log(`Heap recovered from peak (MB): ${heapRecoveryFromPeak.toFixed(2)}`);
}
if (rendererSamples.length > 0) {
  if (avgDrawCallsSinceLastSample !== null) {
    console.log(`Avg draw-call delta/sample: ${avgDrawCallsSinceLastSample.toFixed(2)}`);
  }
  if (avgDrawCallsPerFrame !== null) {
    console.log(`Avg draw calls/frame: ${avgDrawCallsPerFrame.toFixed(2)}`);
  }
  console.log(`Avg raw draw calls: ${avgDrawCalls.toFixed(2)}`);
  console.log(`Avg triangles: ${avgTriangles.toFixed(0)}`);
  console.log(`Max textures: ${maxTextures}`);
  console.log(`Max geometries: ${maxGeometries}`);
}
if (
  avgVegetationActive !== null &&
  peakVegetationActive !== null &&
  avgVegetationReserved !== null &&
  peakVegetationChunks !== null
) {
  console.log(
    `Vegetation: avg active ${avgVegetationActive.toFixed(0)}, peak active ${peakVegetationActive.toFixed(0)}, ` +
    `avg reserved ${avgVegetationReserved.toFixed(0)}, peak chunks ${peakVegetationChunks.toFixed(0)}`
  );
  if (topVegetationTypes.length > 0) {
    console.log('Vegetation top active types:');
    for (const entry of topVegetationTypes) {
      console.log(`- ${entry.type}: avg ${entry.avgActive.toFixed(0)}, peak ${entry.peakActive.toFixed(0)}`);
    }
  }
}
if (stallSamples.length > 0) {
  console.log(`Long tasks observed: ${longTaskCount} (max ${longTaskMaxMs.toFixed(2)}ms)`);
  console.log(`Long animation frames observed: ${loafCount} (blocking ${loafBlockingMs.toFixed(2)}ms)`);
  if (topUserTiming.length > 0) {
    console.log('User timing totals (latest cumulative snapshot):');
    for (const entry of topUserTiming) {
      console.log(`- ${entry.name}: total ${entry.totalDurationMs.toFixed(2)}ms, count ${entry.count}, max ${entry.maxDurationMs.toFixed(2)}ms`);
    }
  }
}
console.log('Dominant top systems:');
for (const [name, count] of dominantSystems) {
  console.log(`- ${name}: ${count} samples`);
}
if (terrainSummary.length > 0) {
  console.log('Terrain stream summary:');
  for (const stream of terrainSummary) {
    console.log(
      `- ${stream.name}: avg ${stream.avgTimeMs.toFixed(2)}ms / ${stream.avgBudgetMs.toFixed(2)}ms, ` +
      `peak ${stream.peakTimeMs.toFixed(2)}ms, avg pending ${stream.avgPendingUnits.toFixed(1)}, ` +
      `peak pending ${stream.peakPendingUnits.toFixed(0)}, over-budget ${(stream.overBudgetRate * 100).toFixed(1)}%`
    );
  }
  if (terrainQueueFlags.length > 0) {
    console.log('Terrain queue flags:');
    for (const flag of terrainQueueFlags) {
      console.log(`- ${flag}`);
    }
  }
}
if (latestRenderTerrainDebug) {
  console.log(
    `Terrain render-sync submissions: regular ${Number(latestRenderTerrainDebug.regularInstanceSubmissions ?? 0)}, ` +
    `late ${Number(latestRenderTerrainDebug.lateSyncInstanceSubmissions ?? 0)} ` +
    `(same ${Number(latestRenderTerrainDebug.lateSyncSameIdentitySubmissions ?? 0)}, ` +
    `dynamics ${Number(latestRenderTerrainDebug.lateSyncDynamicsChangedSubmissions ?? 0)}, ` +
    `tile ${Number(latestRenderTerrainDebug.lateSyncTileSetChangedSubmissions ?? 0)})`
  );
  if (peakTerrainSelectionMs !== null && peakTerrainUpdateInstancesMs !== null) {
    console.log(
      `Terrain render-sync peak select/updateInstances: ` +
      `${peakTerrainSelectionMs.toFixed(2)}ms / ${peakTerrainUpdateInstancesMs.toFixed(2)}ms`
    );
  }
}

const combatSamples = samples
  .map(s => s.combatBreakdown)
  .filter((s): s is NonNullable<RuntimeSample['combatBreakdown']> => Boolean(s));
if (combatSamples.length > 0) {
  console.log('Combat substage avg (ms):');
  console.log(`- total: ${avg(combatSamples.map(s => s.totalMs)).toFixed(2)}`);
  console.log(`- aiUpdate: ${avg(combatSamples.map(s => s.aiUpdateMs)).toFixed(2)}`);
  console.log(`- spatialSync: ${avg(combatSamples.map(s => s.spatialSyncMs)).toFixed(2)}`);
  console.log(`- billboardUpdate: ${avg(combatSamples.map(s => s.billboardUpdateMs)).toFixed(2)}`);
  console.log(`- effectPools: ${avg(combatSamples.map(s => s.effectPoolsMs)).toFixed(2)}`);
  console.log(`- influenceMap: ${avg(combatSamples.map(s => s.influenceMapMs)).toFixed(2)}`);
  const stateTotals = new Map<string, number>();
  for (const sample of combatSamples) {
    if (!sample.aiStateMs) continue;
    for (const [state, value] of Object.entries(sample.aiStateMs)) {
      stateTotals.set(state, (stateTotals.get(state) ?? 0) + Number(value));
    }
  }
  if (stateTotals.size > 0) {
    const topStates = [...stateTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log('Combat AI state hotspots (sum ms):');
    for (const [state, total] of topStates) {
      console.log(`- ${state}: ${total.toFixed(2)}`);
    }
  }
}

if (validation) {
  console.log(`Validation overall: ${validation.overall.toUpperCase()}`);
  for (const check of validation.checks) {
    console.log(`- [${check.status}] ${check.id}: ${check.message}`);
  }
  if (validation.overall === 'fail') {
    process.exit(1);
  }
}
