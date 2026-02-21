#!/usr/bin/env tsx

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
  combatBreakdown?: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    effectPoolsMs: number;
    influenceMapMs: number;
    aiStateMs?: Record<string, number>;
  };
  systemTop: Array<{ name: string; emaMs: number; peakMs: number }>;
};

const root = join(process.cwd(), 'artifacts', 'perf');

function listCaptureDirs(): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const dirs = listCaptureDirs();
if (dirs.length === 0) {
  console.error('No capture artifacts found under artifacts/perf');
  process.exit(1);
}

const latest = dirs[dirs.length - 1];
const latestDir = join(root, latest);
const summaryPath = join(latestDir, 'summary.json');
const validationPath = join(latestDir, 'validation.json');
const samplesPath = join(latestDir, 'runtime-samples.json');

if (!existsSync(summaryPath)) {
  console.error(`Missing summary.json in ${latestDir}`);
  process.exit(1);
}

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

const topSystemCounts = new Map<string, number>();
for (const s of samples) {
  const top = s.systemTop?.[0]?.name ?? 'unknown';
  topSystemCounts.set(top, (topSystemCounts.get(top) ?? 0) + 1);
}
const dominantSystems = [...topSystemCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);

console.log(`Artifact: ${latestDir}`);
console.log(`Status: ${summary.status}`);
if (summary.failureReason) console.log(`Failure: ${summary.failureReason}`);
console.log(`Final frameCount: ${summary.finalFrameCount}`);
console.log(`Samples: ${samples.length}`);
console.log(`Avg frame ms: ${avgFrameMs.toFixed(2)}`);
console.log(`Max p95 frame ms: ${maxP95.toFixed(2)}`);
console.log(`Avg over-budget %: ${avgOverBudget.toFixed(2)}`);
if (heapSamples.length > 0) {
  console.log(`Heap growth (MB): ${heapGrowth.toFixed(2)}`);
  console.log(`Heap peak growth (MB): ${heapPeakGrowth.toFixed(2)}`);
  console.log(`Heap recovered from peak (MB): ${heapRecoveryFromPeak.toFixed(2)}`);
}
console.log('Dominant top systems:');
for (const [name, count] of dominantSystems) {
  console.log(`- ${name}: ${count} samples`);
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
