#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  combatBreakdown?: {
    aiMethodTotalCounts?: Record<string, number>;
  };
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  failureReason?: string | null;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
  };
  measurementTrust?: {
    status?: string;
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

interface MethodDelta {
  method: string;
  firstTotal: number;
  lastTotal: number;
  delta: number;
}

interface CoverCacheLocalityReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-cover-cache-locality-review';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    cadencePacket: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    captureStatus: string | null;
    failureReason: string | null;
    validation: string | null;
    measurementTrust: string | null;
    runtimeSamples: number;
    firstFrameCount: number | null;
    lastFrameCount: number | null;
    frameDelta: number | null;
  };
  sourceAnchors: AnchorResult[];
  methodDeltas: Record<string, MethodDelta>;
  locality: {
    cacheStoreDelta: number;
    cacheHitDelta: number;
    cacheHitRate: number | null;
    budgetDelta: number;
    raycastDelta: number;
    suppressionFlankCoverSearchDelta: number;
    normalFallbackCoverSearchDelta: number;
    coverSystemFindBestCoverDelta: number;
    suppressionSearchesPerCacheStore: number | null;
    raycastsPerCacheStore: number | null;
  };
  classification: {
    status: CheckStatus;
    owner:
      | 'cover_cache_miss_explained_by_suppression_flank_unique_probe_path'
      | 'cover_cache_locality_inconclusive'
      | 'source_anchor_missing';
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

const OUTPUT_NAME = 'projekt-143-cover-cache-locality-review';
const DEFAULT_SOURCE_ARTIFACT = join(process.cwd(), 'artifacts', 'perf', '2026-05-07T13-13-32-364Z');

const METHODS = {
  budget: 'cover.findNearestCover.budget',
  cacheHit: 'cover.findNearestCover.cacheHit',
  cacheStore: 'cover.findNearestCover.cacheStore',
  raycastTerrain: 'cover.findNearestCover.terrainScan.coverTest.raycastTerrain',
  normalFallbackCoverSearch: 'engage.cover.findNearestCover',
  coverSystemFindBestCover: 'engage.cover.findBestCover',
  suppressionFlankCoverSearch: 'engage.suppression.initiate.coverSearch',
};

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AICoverFinding.ts',
    patterns: [
      'private readonly COVER_SEARCH_CACHE_GRID_METERS = 6',
      'private readonly MAX_COVER_SEARCH_CACHE_ENTRIES = 256',
      'this.coverSearchCache.clear()',
      'const cacheKey = this.getCoverSearchCacheKey(combatant.position, threatPosition)',
      "'cover.findNearestCover.cacheHit'",
      "'cover.findNearestCover.cacheStore'",
      'private getCoverSearchCacheKey(position: THREE.Vector3, threatPosition: THREE.Vector3): string',
      'Math.round(position.x / grid)',
      'return `${px},${pz}:${tx},${tz}`',
    ],
  },
  {
    path: 'src/systems/combat/ai/AITargeting.ts',
    patterns: [
      'this.coverFinding.beginFrame()',
      'return this.coverFinding.findNearestCover(combatant, threatPosition)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'private readonly MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2',
      'private readonly FLANK_DESTINATION_REUSE_RADIUS_SQ = 12 * 12',
      "'engage.cover.findNearestCover'",
      "'engage.cover.findBestCover'",
      "'engage.suppression.initiate.coverSearch'",
      'flankCoverProbe.position.copy(flankDestination)',
      'return findNearestCover(flankCoverProbe, targetPos)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AICoverFinding.test.ts',
    patterns: [
      'reuses cached cover results for nearby same-frame searches',
      'clears the frame-local cache on beginFrame',
    ],
  },
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replace(/\\/g, '/') : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function parseArgs(): { artifactDir: string; outputRoot: string } {
  const artifactArg = argValue('--artifact');
  const artifactDir = resolve(artifactArg ?? DEFAULT_SOURCE_ARTIFACT);
  if (!existsSync(artifactDir)) {
    throw new Error(`Missing artifact directory: ${artifactDir}`);
  }

  const outputArg = argValue('--output-root');
  const outputRoot = outputArg
    ? resolve(outputArg)
    : join(process.cwd(), 'artifacts', 'perf', timestampForPath());

  return { artifactDir, outputRoot };
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

function totalAt(sample: RuntimeSample | null, method: string): number {
  return Number(sample?.combatBreakdown?.aiMethodTotalCounts?.[method] ?? 0);
}

function methodDelta(samples: RuntimeSample[], method: string): MethodDelta {
  const first = samples[0] ?? null;
  const last = samples[samples.length - 1] ?? null;
  const firstTotal = totalAt(first, method);
  const lastTotal = totalAt(last, method);
  return {
    method,
    firstTotal,
    lastTotal,
    delta: Math.max(0, lastTotal - firstTotal),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return Number((numerator / denominator).toFixed(3));
}

function classify(
  anchors: AnchorResult[],
  deltas: Record<string, MethodDelta>
): CoverCacheLocalityReport['classification'] {
  if (!anchors.every((anchor) => anchor.present)) {
    return {
      status: 'fail',
      owner: 'source_anchor_missing',
      confidence: 'low',
      acceptance: 'diagnostic_only',
    };
  }

  const cacheHit = deltas.cacheHit.delta;
  const cacheStore = deltas.cacheStore.delta;
  const suppression = deltas.suppressionFlankCoverSearch.delta;
  const normalFallback = deltas.normalFallbackCoverSearch.delta;

  if (cacheStore > 0 && cacheHit === 0 && suppression === cacheStore && normalFallback === 0) {
    return {
      status: 'warn',
      owner: 'cover_cache_miss_explained_by_suppression_flank_unique_probe_path',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }

  return {
    status: 'warn',
    owner: 'cover_cache_locality_inconclusive',
    confidence: 'medium',
    acceptance: 'diagnostic_only',
  };
}

function renderMarkdown(report: CoverCacheLocalityReport): string {
  const lines: string[] = [];
  lines.push('# Projekt Objekt-143 Cover Cache Locality Review');
  lines.push('');
  lines.push(`- Created: ${report.createdAt}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Classification: ${report.classification.owner}`);
  lines.push(`- Source artifact: ${report.inputs.artifactDir}`);
  lines.push('');
  lines.push('## Locality');
  lines.push('');
  lines.push(`- Cache stores: ${report.locality.cacheStoreDelta}`);
  lines.push(`- Cache hits: ${report.locality.cacheHitDelta}`);
  lines.push(`- Cache hit rate: ${report.locality.cacheHitRate ?? 'n/a'}`);
  lines.push(`- Suppression flank cover searches: ${report.locality.suppressionFlankCoverSearchDelta}`);
  lines.push(`- Normal fallback cover searches: ${report.locality.normalFallbackCoverSearchDelta}`);
  lines.push(`- CoverSystem findBestCover calls: ${report.locality.coverSystemFindBestCoverDelta}`);
  lines.push(`- Terrain raycasts: ${report.locality.raycastDelta}`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  for (const finding of report.findings) lines.push(`- ${finding}`);
  lines.push('');
  lines.push('## Next Actions');
  lines.push('');
  for (const action of report.nextActions) lines.push(`- ${action}`);
  lines.push('');
  lines.push('## Non-Claims');
  lines.push('');
  for (const claim of report.nonClaims) lines.push(`- ${claim}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const { artifactDir, outputRoot } = parseArgs();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimePath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimePath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimePath);
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error(`Need at least two runtime samples in ${runtimePath}`);
  }

  const cadencePath = join(artifactDir, 'projekt-143-cover-raycast-cadence', 'cover-raycast-cadence.json');
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const sourceAnchors = SOURCE_SPECS.map(findAnchors);
  const methodDeltas = {
    budget: methodDelta(samples, METHODS.budget),
    cacheHit: methodDelta(samples, METHODS.cacheHit),
    cacheStore: methodDelta(samples, METHODS.cacheStore),
    raycastTerrain: methodDelta(samples, METHODS.raycastTerrain),
    normalFallbackCoverSearch: methodDelta(samples, METHODS.normalFallbackCoverSearch),
    coverSystemFindBestCover: methodDelta(samples, METHODS.coverSystemFindBestCover),
    suppressionFlankCoverSearch: methodDelta(samples, METHODS.suppressionFlankCoverSearch),
  };

  const classification = classify(sourceAnchors, methodDeltas);
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const cacheStores = methodDeltas.cacheStore.delta;
  const cacheHits = methodDeltas.cacheHit.delta;
  const suppressionSearches = methodDeltas.suppressionFlankCoverSearch.delta;
  const normalFallback = methodDeltas.normalFallbackCoverSearch.delta;
  const coverSystemFindBest = methodDeltas.coverSystemFindBestCover.delta;
  const raycasts = methodDeltas.raycastTerrain.delta;

  const report: CoverCacheLocalityReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-cover-cache-locality-review',
    status: classification.status,
    inputs: {
      artifactDir: rel(artifactDir)!,
      summary: rel(summaryPath)!,
      runtimeSamples: rel(runtimePath)!,
      cadencePacket: existsSync(cadencePath) ? rel(cadencePath) : null,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      runtimeSamples: samples.length,
      firstFrameCount: typeof firstSample.frameCount === 'number' ? firstSample.frameCount : null,
      lastFrameCount: typeof lastSample.frameCount === 'number' ? lastSample.frameCount : null,
      frameDelta: typeof firstSample.frameCount === 'number' && typeof lastSample.frameCount === 'number'
        ? lastSample.frameCount - firstSample.frameCount
        : null,
    },
    sourceAnchors,
    methodDeltas,
    locality: {
      cacheStoreDelta: cacheStores,
      cacheHitDelta: cacheHits,
      cacheHitRate: ratio(cacheHits, cacheHits + cacheStores),
      budgetDelta: methodDeltas.budget.delta,
      raycastDelta: raycasts,
      suppressionFlankCoverSearchDelta: suppressionSearches,
      normalFallbackCoverSearchDelta: normalFallback,
      coverSystemFindBestCoverDelta: coverSystemFindBest,
      suppressionSearchesPerCacheStore: ratio(suppressionSearches, cacheStores),
      raycastsPerCacheStore: ratio(raycasts, cacheStores),
    },
    classification,
    findings: [
      `The sampled window records ${cacheStores} cache stores and ${cacheHits} cache hits, so the frame-local cache hit rate is ${ratio(cacheHits, cacheHits + cacheStores) ?? 0}.`,
      `All ${cacheStores} cached AICoverFinding searches align with ${suppressionSearches} engage.suppression.initiate.coverSearch calls; normal engage fallback findNearestCover delta is ${normalFallback}.`,
      `The active normal engage path uses AICoverSystem findBestCover separately; its sampled delta is ${coverSystemFindBest}, so widening AICoverFinding would not address that caller.`,
      `AICoverFinding clears its cache on beginFrame and keys by 6m-rounded combatant and threat positions.`,
      `The suppression callsite uses a scratch flank-cover probe at the computed flank destination and caps searches at two per suppression event, which explains zero same-frame key reuse in this capture.`,
      `The sampled window records ${raycasts} terrain raycasts, or ${ratio(raycasts, cacheStores) ?? 0} raycasts per cache store.`,
    ],
    nextActions: [
      'Do not widen the AICoverFinding cache as the next step without a behavior-quality proof; the current miss class is callsite locality, not missing same-frame reuse.',
      'If optimizing this path, review suppression flank destination reuse or a bounded per-squad suppression cover cache before changing the 24-candidate terrain search contract.',
      'Any candidate runtime change must be followed by headed standard combat120 capture and perf:compare before baseline discussion.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize perf-baseline refresh.',
      'This packet does not certify cover behavior quality or combat feel.',
    ],
    files: {
      summary: rel(join(outputDir, 'cover-cache-locality-review.json'))!,
      markdown: rel(join(outputDir, 'cover-cache-locality-review.md'))!,
    },
  };

  writeFileSync(join(outputDir, 'cover-cache-locality-review.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'cover-cache-locality-review.md'), renderMarkdown(report), 'utf-8');

  console.log(`Projekt 143 cover cache locality ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`cacheStores=${cacheStores} cacheHits=${cacheHits} suppressionSearches=${suppressionSearches} normalFallback=${normalFallback} raycasts=${raycasts}`);

  if (report.status === 'fail') process.exitCode = 1;
}

main();
