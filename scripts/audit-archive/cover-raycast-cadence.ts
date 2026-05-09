#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface TimingBucket {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
}

interface RuntimeFrameEvent {
  frameCount?: number;
  frameMs?: number;
  atMs?: number;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  browserStalls?: {
    totals?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
    recent?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
  };
  combatBreakdown?: {
    aiMethodCounts?: Record<string, number>;
    aiMethodTotalCounts?: Record<string, number>;
  };
  frameEvents?: RuntimeFrameEvent[];
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  failureReason?: string | null;
  finalFrameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  validation?: {
    overall?: string;
  };
  measurementTrust?: {
    status?: string;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
}

interface AnchorSpec {
  path: string;
  patterns: string[];
}

interface AnchorResult {
  path: string;
  present: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface BucketSummary {
  label: string;
  present: boolean;
  count: number;
  totalDurationMs: number | null;
  maxDurationMs: number | null;
  avgDurationMs: number | null;
}

interface BucketProgressionPoint extends BucketSummary {
  sampleIndex: number;
  sampleTs: string | null;
  frameCount: number | null;
  deltaCount: number;
  deltaDurationMs: number | null;
}

const OUTPUT_NAME = 'projekt-143-cover-raycast-cadence';
const COVER_LABEL_PREFIX = 'CombatAI.method.cover.findNearestCover.';
const LABELS = {
  budget: `${COVER_LABEL_PREFIX}budget`,
  cacheHit: `${COVER_LABEL_PREFIX}cacheHit`,
  cacheStore: `${COVER_LABEL_PREFIX}cacheStore`,
  terrainScan: `${COVER_LABEL_PREFIX}terrainScan`,
  heightQuery: `${COVER_LABEL_PREFIX}terrainScan.heightQuery`,
  coverTest: `${COVER_LABEL_PREFIX}terrainScan.coverTest`,
  raycastTerrain: `${COVER_LABEL_PREFIX}terrainScan.coverTest.raycastTerrain`,
};
const RAW_METHODS = {
  budget: 'cover.findNearestCover.budget',
  cacheHit: 'cover.findNearestCover.cacheHit',
  cacheStore: 'cover.findNearestCover.cacheStore',
  terrainScan: 'cover.findNearestCover.terrainScan',
  heightQuery: 'cover.findNearestCover.terrainScan.heightQuery',
  coverTest: 'cover.findNearestCover.terrainScan.coverTest',
  raycastTerrain: 'cover.findNearestCover.terrainScan.coverTest.raycastTerrain',
};

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AICoverFinding.ts',
    patterns: [
      'private readonly COVER_SEARCH_CACHE_GRID_METERS = 6',
      'private coverSearchCache: Map<string, THREE.Vector3 | null> = new Map()',
      'this.coverSearchCache.clear()',
      'const cacheKey = this.getCoverSearchCacheKey(combatant.position, threatPosition)',
      "'cover.findNearestCover.cacheHit'",
      "'cover.findNearestCover.cacheStore'",
      'for (let i = 0; i < SEARCH_SAMPLES; i++)',
      'for (const radius of [10, 20, 30])',
      "'cover.findNearestCover.terrainScan.coverTest.raycastTerrain'",
      'this.terrainSystem!.raycastTerrain(_threatEyePos, _direction, distance)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AITargeting.ts',
    patterns: [
      'this.coverFinding.beginFrame()',
    ],
  },
  {
    path: 'src/systems/combat/CombatantAI.ts',
    patterns: [
      'this.targeting.beginFrame()',
      'this.aiMethodMs = {}',
    ],
  },
  {
    path: 'src/systems/combat/CombatantLODManager.ts',
    patterns: [
      'this.combatantAI.beginFrame?.()',
    ],
  },
  {
    path: 'src/systems/combat/ai/AICoverFinding.test.ts',
    patterns: [
      'reuses cached cover results for nearby same-frame searches',
      'expect(mockTerrainSystem.raycastTerrain).toHaveBeenCalledTimes(raycastsAfterFirstSearch)',
      'clears the frame-local cache on beginFrame',
    ],
  },
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replace(/\\/g, '/') : null;
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
    throw new Error(`Usage: npx tsx scripts/projekt-143-cover-raycast-cadence.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function bucketFor(sample: RuntimeSample, label: string): TimingBucket | null {
  return sample.browserStalls?.totals?.userTimingByName?.[label] ?? null;
}

function summarizeBucket(label: string, bucket: TimingBucket | null): BucketSummary {
  const count = Number(bucket?.count ?? 0);
  const totalDurationMs = round(Number(bucket?.totalDurationMs ?? 0));
  const maxDurationMs = round(Number(bucket?.maxDurationMs ?? 0));
  return {
    label,
    present: count > 0,
    count,
    totalDurationMs,
    maxDurationMs,
    avgDurationMs: count > 0 ? round(Number(bucket?.totalDurationMs ?? 0) / count, 3) : null,
  };
}

function finalBucket(samples: RuntimeSample[], label: string): TimingBucket | null {
  for (let index = samples.length - 1; index >= 0; index--) {
    const bucket = bucketFor(samples[index], label);
    if (Number(bucket?.count ?? 0) > 0) return bucket;
  }
  return null;
}

function totalCountAt(sample: RuntimeSample | null, method: string): number {
  return Number(sample?.combatBreakdown?.aiMethodTotalCounts?.[method] ?? 0);
}

function frameCountAt(sample: RuntimeSample | null, method: string): number {
  return Number(sample?.combatBreakdown?.aiMethodCounts?.[method] ?? 0);
}

function totalCountDelta(samples: RuntimeSample[], method: string): {
  method: string;
  present: boolean;
  firstTotal: number;
  lastTotal: number;
  delta: number;
  maxSampledFrameCount: number;
} {
  const firstSample = samples[0] ?? null;
  const lastSample = samples[samples.length - 1] ?? null;
  const firstTotal = totalCountAt(firstSample, method);
  const lastTotal = totalCountAt(lastSample, method);
  return {
    method,
    present: samples.some((sample) => sample.combatBreakdown?.aiMethodTotalCounts != null),
    firstTotal,
    lastTotal,
    delta: Math.max(0, lastTotal - firstTotal),
    maxSampledFrameCount: samples.reduce(
      (max, sample) => Math.max(max, frameCountAt(sample, method)),
      0
    ),
  };
}

function progression(samples: RuntimeSample[], label: string): BucketProgressionPoint[] {
  const points: BucketProgressionPoint[] = [];
  let previousCount = 0;
  let previousDuration = 0;
  samples.forEach((sample, sampleIndex) => {
    const bucket = bucketFor(sample, label);
    const count = Number(bucket?.count ?? 0);
    const duration = Number(bucket?.totalDurationMs ?? 0);
    const deltaCount = count - previousCount;
    const deltaDurationMs = duration - previousDuration;
    if (count > 0 || deltaCount > 0) {
      points.push({
        ...summarizeBucket(label, bucket),
        sampleIndex,
        sampleTs: sample.ts ?? null,
        frameCount: sample.frameCount ?? null,
        deltaCount,
        deltaDurationMs: round(deltaDurationMs),
      });
    }
    previousCount = count;
    previousDuration = duration;
  });
  return points;
}

function elapsedSeconds(startTs: string | null | undefined, endTs: string | null | undefined): number | null {
  if (!startTs || !endTs) return null;
  const start = Date.parse(startTs);
  const end = Date.parse(endTs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 1000;
}

function findAnchors(spec: AnchorSpec): AnchorResult {
  const fullPath = join(process.cwd(), spec.path);
  if (!existsSync(fullPath)) {
    return {
      path: spec.path,
      present: false,
      anchors: spec.patterns.map((pattern) => ({ pattern, line: null, text: null })),
    };
  }
  const lines = readFileSync(fullPath, 'utf-8').split(/\r?\n/);
  const anchors = spec.patterns.map((pattern) => {
    const index = lines.findIndex((line) => line.includes(pattern));
    return {
      pattern,
      line: index >= 0 ? index + 1 : null,
      text: index >= 0 ? lines[index].trim() : null,
    };
  });
  return {
    path: spec.path,
    present: anchors.every((anchor) => anchor.line != null),
    anchors,
  };
}

function boundaryCoverTimings(samples: RuntimeSample[]): Array<{
  sampleIndex: number;
  frameCount: number | null;
  frameMs: number | null;
  raycastRecent: BucketSummary;
}> {
  const rows: Array<{
    sampleIndex: number;
    frameCount: number | null;
    frameMs: number | null;
    raycastRecent: BucketSummary;
  }> = [];
  samples.forEach((sample, sampleIndex) => {
    for (const event of sample.frameEvents ?? []) {
      const frameMs = Number(event.frameMs ?? 0);
      if (frameMs < 50) continue;
      rows.push({
        sampleIndex,
        frameCount: event.frameCount ?? null,
        frameMs: round(frameMs),
        raycastRecent: summarizeBucket(
          LABELS.raycastTerrain,
          sample.browserStalls?.recent?.userTimingByName?.[LABELS.raycastTerrain] ?? null
        ),
      });
    }
  });
  return rows.sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0)).slice(0, 5);
}

function classify(options: {
  anchors: AnchorResult[];
  raycast: BucketSummary;
  raycastRawDelta: number;
  cacheHit: BucketSummary;
  cacheHitRawDelta: number;
}): {
  status: Status;
  owner: string;
  confidence: 'low' | 'medium' | 'high';
  acceptance: 'diagnostic_only';
} {
  if (!options.anchors.every((anchor) => anchor.present)) {
    return {
      status: 'fail',
      owner: 'cover_raycast_cadence_source_anchor_missing',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }
  if (!options.raycast.present && options.raycastRawDelta <= 0) {
    return {
      status: 'warn',
      owner: 'cover_raycast_cadence_not_exercised_in_artifact',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (options.raycastRawDelta > 0 && options.cacheHitRawDelta > 0) {
    return {
      status: 'warn',
      owner: 'cover_raycast_raw_call_cadence_counted_runtime_cache_hit_present',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (options.raycastRawDelta > 0) {
    return {
      status: 'warn',
      owner: 'cover_raycast_raw_call_cadence_counted_cache_hit_zero_in_capture',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  if (!options.cacheHit.present) {
    return {
      status: 'warn',
      owner: 'cover_raycast_user_timing_cadence_counted_cache_reuse_source_proven_runtime_cache_hit_not_quantified',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  return {
    status: 'warn',
    owner: 'cover_raycast_user_timing_cadence_counted_runtime_cache_hit_present',
    confidence: 'medium',
    acceptance: 'diagnostic_only',
  };
}

function renderMarkdown(report: any): string {
  const lines: string[] = [
    '# Projekt Objekt-143 Cover Raycast Cadence',
    '',
    `- status: ${report.status}`,
    `- classification: ${report.classification.owner}`,
    `- confidence: ${report.classification.confidence}`,
    `- artifact: ${report.inputs.artifactDir}`,
    '',
    '## Findings',
    ...report.findings.map((finding: string) => `- ${finding}`),
    '',
    '## Cadence',
    `- raw raycast count: ${report.cadence.rawMethodCounts?.raycast?.present ? report.cadence.rawMethodCounts.raycast.delta : 'not captured'}`,
    `- user-timing raycast emissions: ${report.cadence.raycast.count}`,
    `- raycast duration total: ${report.cadence.raycast.totalDurationMs}ms`,
    `- raycast max: ${report.cadence.raycast.maxDurationMs}ms`,
    `- raycast emitted-frame avg: ${report.cadence.raycast.avgDurationMs}ms`,
    `- raw full-window rate: ${report.cadence.rawRaycastPerSecondFullWindow ?? 'not captured'}/sec`,
    `- raw calls per 1000 frames: ${report.cadence.rawRaycastPer1000Frames ?? 'not captured'}`,
    `- max user-timing interval delta: ${report.cadence.maxRaycastDeltaCount} emissions`,
    '',
    '## Source Anchors',
    ...report.sourceAnchors.map((anchor: AnchorResult) =>
      `- ${anchor.path}: ${anchor.present ? 'present' : 'missing'}`
    ),
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
  const anchors = SOURCE_SPECS.map(findAnchors);
  const firstSample = samples[0] ?? null;
  const lastSample = samples[samples.length - 1] ?? null;
  const fullWindowSeconds = elapsedSeconds(firstSample?.ts, lastSample?.ts);
  const frameDelta = typeof firstSample?.frameCount === 'number' && typeof lastSample?.frameCount === 'number'
    ? lastSample.frameCount - firstSample.frameCount
    : null;

  const raycastProgression = progression(samples, LABELS.raycastTerrain);
  const firstRaycastPoint = raycastProgression.find((point) => point.count > 0) ?? null;
  const lastRaycastPoint = raycastProgression[raycastProgression.length - 1] ?? null;
  const activeRaycastSeconds = elapsedSeconds(firstRaycastPoint?.sampleTs, lastRaycastPoint?.sampleTs);
  const raycast = summarizeBucket(LABELS.raycastTerrain, finalBucket(samples, LABELS.raycastTerrain));
  const coverTest = summarizeBucket(LABELS.coverTest, finalBucket(samples, LABELS.coverTest));
  const terrainScan = summarizeBucket(LABELS.terrainScan, finalBucket(samples, LABELS.terrainScan));
  const heightQuery = summarizeBucket(LABELS.heightQuery, finalBucket(samples, LABELS.heightQuery));
  const cacheHit = summarizeBucket(LABELS.cacheHit, finalBucket(samples, LABELS.cacheHit));
  const cacheStore = summarizeBucket(LABELS.cacheStore, finalBucket(samples, LABELS.cacheStore));
  const budget = summarizeBucket(LABELS.budget, finalBucket(samples, LABELS.budget));
  const rawCounts = {
    terrainScan: totalCountDelta(samples, RAW_METHODS.terrainScan),
    coverTest: totalCountDelta(samples, RAW_METHODS.coverTest),
    raycast: totalCountDelta(samples, RAW_METHODS.raycastTerrain),
    heightQuery: totalCountDelta(samples, RAW_METHODS.heightQuery),
    budget: totalCountDelta(samples, RAW_METHODS.budget),
    cacheHit: totalCountDelta(samples, RAW_METHODS.cacheHit),
    cacheStore: totalCountDelta(samples, RAW_METHODS.cacheStore),
  };
  const maxRaycastDeltaCount = raycastProgression.reduce((max, point) => Math.max(max, point.deltaCount), 0);
  const maxRaycastDeltaDurationMs = raycastProgression.reduce(
    (max, point) => Math.max(max, Number(point.deltaDurationMs ?? 0)),
    0
  );
  const classification = classify({
    anchors,
    raycast,
    raycastRawDelta: rawCounts.raycast.delta,
    cacheHit,
    cacheHitRawDelta: rawCounts.cacheHit.delta,
  });
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: classification.status,
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
      avgFrameMs: round(summary.avgFrameMs),
      p99FrameMs: round(summary.p99FrameMs),
      maxFrameMs: round(summary.maxFrameMs),
    },
    sourceAnchors: anchors,
    cadence: {
      sampleWindow: {
        runtimeSamples: samples.length,
        firstSampleTs: firstSample?.ts ?? null,
        lastSampleTs: lastSample?.ts ?? null,
        fullWindowSeconds: round(fullWindowSeconds, 3),
        firstFrameCount: firstSample?.frameCount ?? null,
        lastFrameCount: lastSample?.frameCount ?? null,
        frameDelta,
      },
      raycastWindow: {
        firstRaycastSampleIndex: firstRaycastPoint?.sampleIndex ?? null,
        firstRaycastSampleTs: firstRaycastPoint?.sampleTs ?? null,
        lastRaycastSampleIndex: lastRaycastPoint?.sampleIndex ?? null,
        lastRaycastSampleTs: lastRaycastPoint?.sampleTs ?? null,
        activeRaycastSeconds: round(activeRaycastSeconds, 3),
      },
      terrainScan,
      coverTest,
      raycast,
      heightQuery,
      budget,
      cacheHit,
      cacheStore,
      rawMethodCounts: rawCounts,
      raycastPerSecondFullWindow: fullWindowSeconds && raycast.count > 0
        ? round(raycast.count / fullWindowSeconds, 3)
        : null,
      rawRaycastPerSecondFullWindow: fullWindowSeconds && rawCounts.raycast.delta > 0
        ? round(rawCounts.raycast.delta / fullWindowSeconds, 3)
        : null,
      raycastPerSecondActiveWindow: activeRaycastSeconds && raycast.count > 0
        ? round(raycast.count / activeRaycastSeconds, 3)
        : null,
      raycastPer1000Frames: frameDelta && raycast.count > 0
        ? round((raycast.count / frameDelta) * 1000, 3)
        : null,
      rawRaycastPer1000Frames: frameDelta && rawCounts.raycast.delta > 0
        ? round((rawCounts.raycast.delta / frameDelta) * 1000, 3)
        : null,
      terrainScanToRaycastCountRatio: raycast.count > 0 ? round(terrainScan.count / raycast.count, 3) : null,
      coverTestToRaycastCountRatio: raycast.count > 0 ? round(coverTest.count / raycast.count, 3) : null,
      heightQueryToRaycastCountRatio: raycast.count > 0 ? round(heightQuery.count / raycast.count, 3) : null,
      maxRaycastDeltaCount,
      maxRaycastDeltaDurationMs: round(maxRaycastDeltaDurationMs),
      raycastProgression: raycastProgression.filter((point) => point.deltaCount > 0),
      boundaryCoverTimings: boundaryCoverTimings(samples),
    },
    classification,
    findings: [
      `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, and measurement trust ${summary.measurementTrust?.status ?? 'unknown'}.`,
      rawCounts.raycast.present
        ? `Raw AI method totals record ${rawCounts.raycast.delta} raycastTerrain calls over ${round(fullWindowSeconds, 3)}s and ${frameDelta ?? 'unknown'} frames: ${round(rawCounts.raycast.delta / Number(fullWindowSeconds ?? NaN), 3)} calls/sec, ${frameDelta ? round((rawCounts.raycast.delta / frameDelta) * 1000, 3) : null} calls/1000 frames.`
        : `Raycast user timing records ${raycast.count} emitted method-frame measurements over ${round(fullWindowSeconds, 3)}s and ${frameDelta ?? 'unknown'} frames; raw method totals are absent in this artifact.`,
      `Raycast user timing duration total is ${raycast.totalDurationMs}ms, max is ${raycast.maxDurationMs}ms, and emitted-frame mean is ${raycast.avgDurationMs}ms.`,
      rawCounts.raycast.present
        ? `Raw terrainScan, coverTest, and raycastTerrain deltas are ${rawCounts.terrainScan.delta}/${rawCounts.coverTest.delta}/${rawCounts.raycast.delta}; cacheHit/cacheStore deltas are ${rawCounts.cacheHit.delta}/${rawCounts.cacheStore.delta}.`
        : `Emitted terrainScan, coverTest, and raycastTerrain timing counts are ${terrainScan.count}/${coverTest.count}/${raycast.count}; these are duration emissions, not raw call counts.`,
      `Height-query user timing records ${heightQuery.count} emitted method-frame measurements above threshold; source anchors prove the uncached terrain search shape is 8 angles by 3 radii.`,
      rawCounts.cacheHit.present
        ? `Runtime cache-hit raw count delta is ${rawCounts.cacheHit.delta}; runtime cache-store raw count delta is ${rawCounts.cacheStore.delta}.`
        : cacheHit.present
          ? `Runtime cache-hit user timing records ${cacheHit.count} emitted method-frame measurements above the CombatAI user-timing threshold.`
          : 'Runtime cache-hit user timing is absent above the CombatAI user-timing threshold; cache reuse remains source/test-proven but not runtime-quantified in this older capture.',
      cacheStore.present
        ? `Runtime cache-store user timing records ${cacheStore.count} emitted method-frame measurements above the CombatAI user-timing threshold.`
        : 'Runtime cache-store user timing is absent above the CombatAI user-timing threshold; short cache operations are below the emitted timing surface.',
      `Source anchors prove a 6m frame-local cover-search cache key, per-frame cache clear, cache-hit/cache-store labels, a 24-candidate terrain search shape, and the raycastTerrain callsite.`,
      'This packet advances cadence and cache-reuse evidence only; it does not change cover behavior.',
    ],
    nextActions: [
      'Do not refresh the combat120 baseline until a standard combat120 capture and perf:compare are clean.',
      'If the next change optimizes raycastTerrain, preserve the current 24-candidate terrain search contract unless a behavior capture proves replacement quality.',
      'If cache-hit count remains zero in a fresh counted capture, inspect callsite locality before widening the cache.',
      'Keep headed standard combat120 as the proof gate for any candidate raycast or cache bound.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not prove a runtime fix.',
      'This packet does not certify combat feel or visual acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'cover-raycast-cadence.json')),
      markdown: rel(join(outputDir, 'cover-raycast-cadence.md')),
    },
  };

  writeFileSync(join(outputDir, 'cover-raycast-cadence.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'cover-raycast-cadence.md'), renderMarkdown(report), 'utf-8');

  console.log(`Projekt 143 cover raycast cadence ${classification.status.toUpperCase()}: ${rel(join(outputDir, 'cover-raycast-cadence.json'))}`);
  console.log(`classification=${classification.owner}/${classification.confidence}`);
  console.log(`raycastCount=${rawCounts.raycast.present ? rawCounts.raycast.delta : raycast.count} raycastTotalMs=${raycast.totalDurationMs} raycastMaxMs=${raycast.maxDurationMs} fullWindowRate=${report.cadence.rawRaycastPerSecondFullWindow ?? report.cadence.raycastPerSecondFullWindow}/s cacheHitCount=${rawCounts.cacheHit.present ? rawCounts.cacheHit.delta : cacheHit.count}`);
  if (classification.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
