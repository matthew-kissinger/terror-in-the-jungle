#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface Summary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  failureReason?: string | null;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
    checks?: Array<{
      id?: string;
      status?: string;
      value?: number | string | null;
      message?: string;
    }>;
  };
  measurementTrust?: {
    status?: string;
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
}

interface TimingBucket {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  combatBreakdown?: {
    aiMethodMs?: Record<string, number>;
  };
  browserStalls?: {
    totals?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
    recent?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
  };
  frameEvents?: RuntimeFrameEvent[];
}

interface MethodEntry {
  name: string;
  durationMs: number;
}

interface BoundaryEntry {
  sampleIndex: number;
  sampleTs: string | null;
  sampleFrameCount: number | null;
  frameCount: number | null;
  frameMs: number | null;
  atMs: number | null;
  topCoverUserTimings: MethodEntry[];
  topCoverMethods: MethodEntry[];
}

const OUTPUT_NAME = 'projekt-143-cover-search-attribution';
const COVER_PREFIX = 'cover.findNearestCover.';
const TERRAIN_SCAN_PREFIX = 'cover.findNearestCover.terrainScan.';
const COVER_TEST_PREFIX = 'cover.findNearestCover.terrainScan.coverTest.';
const SUPPRESSION_COVER_LABEL = 'engage.suppression.initiate.coverSearch';
const REQUIRED_COVER_LABELS = [
  'cover.findNearestCover.budget',
  'cover.findNearestCover.sandbagScan',
  'cover.findNearestCover.vegetationScan',
  'cover.findNearestCover.vegetationScore',
  'cover.findNearestCover.terrainScan',
  'cover.findNearestCover.terrainScan.heightQuery',
  'cover.findNearestCover.terrainScan.coverTest',
  'cover.findNearestCover.terrainScan.coverTest.heightGate',
  'cover.findNearestCover.terrainScan.coverTest.distance',
  'cover.findNearestCover.terrainScan.coverTest.eyeSetup',
  'cover.findNearestCover.terrainScan.coverTest.direction',
  'cover.findNearestCover.terrainScan.coverTest.raycastTerrain',
  'cover.findNearestCover.terrainScan.coverTest.hitResult',
  'cover.findNearestCover.terrainScan.score',
  'cover.findNearestCover.cacheStore',
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
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function requireArtifactDir(): string {
  const value = argValue('--artifact');
  if (!value) {
    throw new Error(`Usage: npx tsx scripts/projekt-143-cover-search-attribution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function methodEntries(methodMs: Record<string, number> | null | undefined, limit = 12): MethodEntry[] {
  if (!methodMs) return [];
  return Object.entries(methodMs)
    .map(([name, duration]) => ({ name, durationMs: round(Number(duration)) ?? 0 }))
    .filter((entry) => Number.isFinite(entry.durationMs) && entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function isCoverMethod(name: string): boolean {
  return name.startsWith(COVER_PREFIX) || name === SUPPRESSION_COVER_LABEL;
}

function aggregateMethods(samples: RuntimeSample[], predicate: (name: string) => boolean): MethodEntry[] {
  const totals = new Map<string, number>();
  for (const sample of samples) {
    for (const [name, duration] of Object.entries(sample.combatBreakdown?.aiMethodMs ?? {})) {
      if (!predicate(name)) continue;
      totals.set(name, (totals.get(name) ?? 0) + Number(duration ?? 0));
    }
  }
  return methodEntries(Object.fromEntries(totals.entries()), 16);
}

function timingEntries(
  buckets: Record<string, TimingBucket> | null | undefined,
  predicate: (name: string) => boolean,
  limit = 12
): MethodEntry[] {
  if (!buckets) return [];
  return Object.entries(buckets)
    .filter(([name]) => predicate(name.replace(/^CombatAI\.method\./, '')))
    .map(([name, bucket]) => ({
      name,
      durationMs: round(bucket.maxDurationMs) ?? round(bucket.totalDurationMs) ?? 0,
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function latestCoverUserTimings(samples: RuntimeSample[]): MethodEntry[] {
  for (let index = samples.length - 1; index >= 0; index--) {
    const entries = timingEntries(
      samples[index].browserStalls?.totals?.userTimingByName,
      isCoverMethod,
      16
    );
    if (entries.length > 0) return entries;
  }
  return [];
}

function boundaryEntries(samples: RuntimeSample[]): BoundaryEntry[] {
  const seen = new Set<string>();
  const boundaries: BoundaryEntry[] = [];
  samples.forEach((sample, sampleIndex) => {
    for (const event of sample.frameEvents ?? []) {
      const frameMs = Number(event.frameMs ?? 0);
      if (frameMs < 50) continue;
      const key = `${event.frameCount ?? 'unknown'}:${event.atMs ?? 'unknown'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      boundaries.push({
        sampleIndex,
        sampleTs: sample.ts ?? null,
        sampleFrameCount: sample.frameCount ?? null,
        frameCount: event.frameCount ?? null,
        frameMs: round(frameMs),
        atMs: round(event.atMs),
        topCoverUserTimings: timingEntries(sample.browserStalls?.recent?.userTimingByName, isCoverMethod, 12),
        topCoverMethods: methodEntries(sample.combatBreakdown?.aiMethodMs, 16).filter((entry) => isCoverMethod(entry.name)),
      });
    }
  });
  return boundaries.sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0));
}

function sourceAnchors(): {
  file: string;
  presentLabels: string[];
  missingLabels: string[];
  testAnchorPresent: boolean;
} {
  const sourcePath = resolve('src/systems/combat/ai/AICoverFinding.ts');
  const testPath = resolve('src/systems/combat/ai/AICoverFinding.test.ts');
  const source = readFileSync(sourcePath, 'utf-8');
  const test = readFileSync(testPath, 'utf-8');
  const presentLabels = REQUIRED_COVER_LABELS.filter((label) => source.includes(`'${label}'`));
  return {
    file: rel(sourcePath) ?? sourcePath,
    presentLabels,
    missingLabels: REQUIRED_COVER_LABELS.filter((label) => !presentLabels.includes(label)),
    testAnchorPresent: test.includes('emits cover-search subphase timings without changing terrain cover selection'),
  };
}

function classify(topOwner: MethodEntry | null, anchors: ReturnType<typeof sourceAnchors>): {
  status: Status;
  owner: string;
  confidence: 'low' | 'medium' | 'high';
  acceptance: 'owner_review_only';
} {
  if (anchors.missingLabels.length > 0 || !anchors.testAnchorPresent) {
    return {
      status: 'fail',
      owner: 'cover_search_internal_timing_source_anchors_missing',
      confidence: 'high',
      acceptance: 'owner_review_only',
    };
  }
  if (!topOwner) {
    return {
      status: 'warn',
      owner: 'cover_search_internal_timing_present_but_not_exercised',
      confidence: 'medium',
      acceptance: 'owner_review_only',
    };
  }
  const suffix = topOwner.name.startsWith(COVER_PREFIX)
    ? topOwner.name.slice(COVER_PREFIX.length)
    : topOwner.name;
  return {
    status: 'warn',
    owner: `cover_search_internal_owner_${suffix}`,
    confidence: topOwner.durationMs >= 1 ? 'medium' : 'low',
    acceptance: 'owner_review_only',
  };
}

function renderMarkdown(report: any): string {
  const lines: string[] = [
    '# Projekt Objekt-143 Cover Search Attribution',
    '',
    `- status: ${report.status}`,
    `- classification: ${report.classification.owner}`,
    `- confidence: ${report.classification.confidence}`,
    `- acceptance: ${report.classification.acceptance}`,
    `- artifact: ${report.inputs.artifactDir}`,
    '',
    '## Findings',
    ...report.findings.map((finding: string) => `- ${finding}`),
    '',
    '## Source Anchors',
    `- file: ${report.sourceAnchors.file}`,
    `- present labels: ${report.sourceAnchors.presentLabels.join(', ') || 'none'}`,
    `- missing labels: ${report.sourceAnchors.missingLabels.join(', ') || 'none'}`,
    `- test anchor present: ${report.sourceAnchors.testAnchorPresent}`,
    '',
    '## Next Actions',
    ...report.nextActions.map((action: string) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim: string) => `- ${claim}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimePath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimePath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimePath);
  const anchors = sourceAnchors();
  const internalCoverLeaders = aggregateMethods(samples, (name) => name.startsWith(COVER_PREFIX));
  const terrainScanLeaders = aggregateMethods(samples, (name) => name.startsWith(TERRAIN_SCAN_PREFIX));
  const coverTestLeaders = aggregateMethods(samples, (name) => name.startsWith(COVER_TEST_PREFIX));
  const coverLeaders = aggregateMethods(samples, isCoverMethod);
  const latestUserTiming = latestCoverUserTimings(samples);
  const boundaries = boundaryEntries(samples);
  const samplesWithInternalCover = samples.filter((sample) =>
    Object.keys(sample.combatBreakdown?.aiMethodMs ?? {}).some((name) => name.startsWith(COVER_PREFIX))
  ).length;
  const coverTestOwner = coverTestLeaders[0] ?? null;
  const terrainScanOwner = terrainScanLeaders[0] ?? null;
  const classification = classify(coverTestOwner ?? terrainScanOwner ?? internalCoverLeaders[0] ?? null, anchors);
  const status = classification.status;

  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const topInternal = internalCoverLeaders[0] ?? null;
  const topTerrainScanInternal = terrainScanLeaders[0] ?? null;
  const topCoverTestInternal = coverTestLeaders[0] ?? null;
  const topBoundary = boundaries[0] ?? null;
  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      summary: rel(summaryPath),
      runtimeSamples: rel(runtimePath),
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      finalFrameCount: summary.finalFrameCount ?? null,
    },
    sourceAnchors: anchors,
    sampleCoverage: {
      runtimeSamples: samples.length,
      samplesWithInternalCover,
      internalCoverSampleRate: round(samples.length > 0 ? samplesWithInternalCover / samples.length : 0, 4),
    },
    methodAttribution: {
      internalCoverLeaders,
      terrainScanLeaders,
      coverTestLeaders,
      coverLeaders,
      latestCoverUserTimings: latestUserTiming,
      boundaryLeaders: boundaries.slice(0, 5),
    },
    classification,
    findings: [
      `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, and measurement trust ${summary.measurementTrust?.status ?? 'unknown'}.`,
      `${samplesWithInternalCover}/${samples.length} runtime samples carry internal ${COVER_PREFIX} timing labels.`,
      topInternal
        ? `Top internal cover method is ${topInternal.name}:${topInternal.durationMs}ms.`
        : `No internal ${COVER_PREFIX} method timing was exercised in this artifact.`,
      topTerrainScanInternal
        ? `Top terrain-scan submethod is ${topTerrainScanInternal.name}:${topTerrainScanInternal.durationMs}ms.`
        : `No ${TERRAIN_SCAN_PREFIX} submethod timing was exercised in this artifact.`,
      topCoverTestInternal
        ? `Top terrain cover-test submethod is ${topCoverTestInternal.name}:${topCoverTestInternal.durationMs}ms.`
        : `No ${COVER_TEST_PREFIX} submethod timing was exercised in this artifact.`,
      coverLeaders.length > 0
        ? `Top inclusive cover/suppression leaders are ${coverLeaders.slice(0, 6).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ')}.`
        : 'No cover/suppression cover-search leaders were recorded in aiMethodMs.',
      latestUserTiming.length > 0
        ? `Latest CombatAI user-timing cover leaders are ${latestUserTiming.slice(0, 6).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ')}.`
        : 'No CombatAI user-timing cover leaders were recorded above the runtime threshold.',
      topBoundary
        ? `Largest >=50ms boundary frame is ${topBoundary.frameCount} at ${topBoundary.frameMs}ms with cover user-timing leaders ${topBoundary.topCoverUserTimings.map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}.`
        : 'No >=50ms frame boundary was present in runtime-samples.json.',
      'This packet ranks scoped diagnostic ownership and is not an exclusive CPU flame graph.',
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until a standard combat120 capture and perf:compare are clean.',
      'If coverTest.raycastTerrain dominates, inspect raycast cadence and cache reuse before behavior or LOD reductions.',
      'If terrainScan or vegetationScan dominates outside coverTest, inspect height-query cadence and cache reuse before behavior or LOD reductions.',
      'If budget dominates or internal labels do not appear, inspect callsite rate and CoverSearchBudget saturation before changing cover quality rules.',
      'Retain the standard headed combat120 proof gate for any candidate bound.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not authorize a combat120 baseline refresh.',
      'This packet does not prove a runtime fix.',
      'This packet does not certify combat feel or visual acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'cover-search-attribution.json')),
      markdown: rel(join(outputDir, 'cover-search-attribution.md')),
    },
  };

  writeFileSync(join(outputDir, 'cover-search-attribution.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'cover-search-attribution.md'), renderMarkdown(report), 'utf-8');

  console.log(`Projekt 143 cover search attribution ${status.toUpperCase()}: ${rel(join(outputDir, 'cover-search-attribution.json'))}`);
  console.log(`classification=${classification.owner}/${classification.confidence}`);
  console.log(`samplesWithInternalCover=${samplesWithInternalCover} topInternal=${topInternal ? `${topInternal.name}:${topInternal.durationMs}ms` : 'none'} topTerrainScanInternal=${topTerrainScanInternal ? `${topTerrainScanInternal.name}:${topTerrainScanInternal.durationMs}ms` : 'none'} topCoverTestInternal=${topCoverTestInternal ? `${topCoverTestInternal.name}:${topCoverTestInternal.durationMs}ms` : 'none'}`);
  if (status === 'fail') {
    process.exitCode = 1;
  }
}

main();
