#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface RuntimeSample {
  frameCount?: number;
  combatBreakdown?: {
    aiMethodTotalCounts?: Record<string, number>;
  };
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  validation?: { overall?: string };
  measurementTrust?: { status?: string };
}

interface SuppressionPacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
  };
  suppressionShape?: {
    coverSearchDelta?: number;
    searchSkipsOrCapDelta?: number;
  };
  counterDeltas?: {
    present?: boolean;
    reuseSkips?: number | null;
    capSkips?: number | null;
    methodCounterCoverageMatches?: boolean | null;
    skipCoverageMatches?: boolean | null;
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

interface SuppressionRaycastCostReview {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-suppression-raycast-cost-review';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    beforeArtifactDir: string | null;
    summary: string;
    runtimeSamples: string;
    suppressionPacket: string;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    runtimeSamples: number;
    frameDelta: number | null;
  };
  sourceAnchors: AnchorResult[];
  methodDeltas: Record<string, MethodDelta>;
  suppressionPacketSummary: {
    status: string | null;
    classification: string | null;
    confidence: string | null;
    coverSearches: number;
    skippedByCapOrReuse: number;
    reuseSkips: number;
    capSkips: number;
    counterCoverageMatches: boolean;
  };
  raycastCost: {
    theoreticalCandidatesPerSearch: number;
    suppressionCoverSearches: number;
    cacheStores: number;
    cacheHits: number;
    terrainScans: number;
    heightQueries: number;
    coverTests: number;
    heightGateChecks: number;
    scoreGateChecks: number;
    scoreGateSkips: number;
    raycasts: number;
    terrainScores: number;
    heightQueriesPerSuppressionSearch: number | null;
    heightQueriesPerUncachedSearch: number | null;
    raycastsPerSuppressionSearch: number | null;
    raycastsPerUncachedSearch: number | null;
    raycastReachRate: number | null;
    heightGateRejectRate: number | null;
    scoreGateRejectRate: number | null;
    uncachedSearchesPerSuppressionSearch: number | null;
    cacheHitRate: number | null;
    capSkippedSearchTheoreticalCandidateBound: number;
    capSkippedSearchProjectedRaycastBound: number | null;
  };
  comparison: {
    beforeArtifactDir: string;
    beforeRaycasts: number;
    beforeUncachedSearches: number;
    beforeRaycastsPerUncachedSearch: number | null;
    afterRaycasts: number;
    afterUncachedSearches: number;
    afterRaycastsPerUncachedSearch: number | null;
    raycastsPerUncachedSearchDelta: number | null;
    raycastsPerUncachedSearchRatio: number | null;
    scoreGateSkips: number;
  } | null;
  classification: {
    status: CheckStatus;
    owner:
      | 'suppression_raycast_cost_height_gate_limited_under_two_search_cap'
      | 'suppression_raycast_score_gate_reduces_raycastTerrain_under_two_search_cap'
      | 'suppression_raycast_cost_counter_packet_missing'
      | 'suppression_raycast_cost_source_anchor_missing'
      | 'suppression_raycast_cost_method_count_mismatch';
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

const OUTPUT_NAME = 'projekt-143-suppression-raycast-cost-review';
const THEORETICAL_TERRAIN_CANDIDATES_PER_SEARCH = 8 * 3;

const METHODS = {
  suppressionCoverSearch: 'engage.suppression.initiate.coverSearch',
  budget: 'cover.findNearestCover.budget',
  cacheHit: 'cover.findNearestCover.cacheHit',
  cacheStore: 'cover.findNearestCover.cacheStore',
  terrainScan: 'cover.findNearestCover.terrainScan',
  heightQuery: 'cover.findNearestCover.terrainScan.heightQuery',
  coverTest: 'cover.findNearestCover.terrainScan.coverTest',
  heightGate: 'cover.findNearestCover.terrainScan.coverTest.heightGate',
  scoreGate: 'cover.findNearestCover.terrainScan.coverTest.scoreGate',
  direction: 'cover.findNearestCover.terrainScan.coverTest.direction',
  distance: 'cover.findNearestCover.terrainScan.coverTest.distance',
  eyeSetup: 'cover.findNearestCover.terrainScan.coverTest.eyeSetup',
  raycastTerrain: 'cover.findNearestCover.terrainScan.coverTest.raycastTerrain',
  hitResult: 'cover.findNearestCover.terrainScan.coverTest.hitResult',
  terrainScore: 'cover.findNearestCover.terrainScan.score',
};

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AICoverFinding.ts',
    patterns: [
      'const TERRAIN_COVER_SEARCH_SAMPLES = 8',
      'const TERRAIN_COVER_RADII = [10, 20, 30] as const',
      'for (let i = 0; i < TERRAIN_COVER_SEARCH_SAMPLES; i++)',
      'for (const radius of TERRAIN_COVER_RADII)',
      "'cover.findNearestCover.terrainScan.heightQuery'",
      "'cover.findNearestCover.terrainScan.coverTest'",
      "'cover.findNearestCover.terrainScan.coverTest.heightGate'",
      'const TERRAIN_COVER_HEIGHT_THRESHOLD = 1.0',
      'if (heightDifference >= TERRAIN_COVER_HEIGHT_THRESHOLD)',
      "'cover.findNearestCover.terrainScan.coverTest.scoreGate'",
      'sortTerrainCoverCandidates(candidateCount)',
      'candidate.score <= bestCoverScore',
      "'cover.findNearestCover.terrainScan.coverTest.raycastTerrain'",
      'this.terrainSystem!.raycastTerrain(_threatEyePos, _direction, distance)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'private readonly MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2',
      'this.telemetry.suppressionFlankCoverSearchReuseSkips++',
      'this.telemetry.suppressionFlankCoverSearchCapSkips++',
      "'engage.suppression.initiate.coverSearch'",
    ],
  },
  {
    path: 'src/systems/combat/ai/AICoverFinding.test.ts',
    patterns: [
      'emits cover-search subphase timings without changing terrain cover selection',
      'does not raycast terrain when height difference is below threshold',
      'reuses cached cover results for nearby same-frame searches',
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

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function parseArgs(): { artifactDir: string; beforeArtifactDir: string | null; suppressionPacket: string; outputRoot: string } {
  const artifactDir = resolve(argValue('--artifact') ?? join(process.cwd(), 'artifacts', 'perf', '2026-05-07T13-44-30-139Z'));
  if (!existsSync(artifactDir)) throw new Error(`Missing artifact directory: ${artifactDir}`);
  const beforeArtifactArg = argValue('--before-artifact');
  const beforeArtifactDir = beforeArtifactArg ? resolve(beforeArtifactArg) : null;
  if (beforeArtifactDir && !existsSync(beforeArtifactDir)) throw new Error(`Missing before artifact directory: ${beforeArtifactDir}`);

  const suppressionPacket = resolve(
    argValue('--suppression-packet') ??
    join(artifactDir, 'projekt-143-suppression-cover-cache-review', 'suppression-cover-cache-review.json')
  );
  if (!existsSync(suppressionPacket)) throw new Error(`Missing suppression packet: ${suppressionPacket}`);

  return {
    artifactDir,
    beforeArtifactDir,
    suppressionPacket,
    outputRoot: resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath())),
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 3): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  return round(numerator / denominator);
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

function methodDeltaFromArtifact(artifactDir: string, method: string): MethodDelta {
  const runtimePath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(runtimePath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);
  const samples = readJson<RuntimeSample[]>(runtimePath);
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error(`Need at least two runtime samples in ${runtimePath}`);
  }
  return methodDelta(samples, method);
}

function classify(
  anchors: AnchorResult[],
  suppression: SuppressionRaycastCostReview['suppressionPacketSummary'],
  cost: SuppressionRaycastCostReview['raycastCost']
): SuppressionRaycastCostReview['classification'] {
  if (!anchors.every((anchor) => anchor.present)) {
    return {
      status: 'fail',
      owner: 'suppression_raycast_cost_source_anchor_missing',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }

  if (!suppression.counterCoverageMatches || suppression.coverSearches <= 0) {
    return {
      status: 'fail',
      owner: 'suppression_raycast_cost_counter_packet_missing',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }

  const cacheMatchesSuppression = cost.cacheHits + cost.cacheStores === suppression.coverSearches;
  const terrainShapeMatches = cost.terrainScans === cost.cacheStores &&
    cost.heightQueries === cost.cacheStores * THEORETICAL_TERRAIN_CANDIDATES_PER_SEARCH &&
    cost.heightGateChecks === cost.heightQueries &&
    cost.scoreGateChecks <= cost.heightGateChecks &&
    cost.coverTests <= (cost.scoreGateChecks > 0 ? cost.scoreGateChecks : cost.heightGateChecks) &&
    cost.raycasts <= cost.coverTests;

  if (!cacheMatchesSuppression || !terrainShapeMatches || cost.raycasts > cost.heightGateChecks) {
    return {
      status: 'fail',
      owner: 'suppression_raycast_cost_method_count_mismatch',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }

  if (cost.scoreGateSkips > 0) {
    return {
      status: 'warn',
      owner: 'suppression_raycast_score_gate_reduces_raycastTerrain_under_two_search_cap',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }

  return {
    status: 'warn',
    owner: 'suppression_raycast_cost_height_gate_limited_under_two_search_cap',
    confidence: 'high',
    acceptance: 'diagnostic_only',
  };
}

function renderMarkdown(report: SuppressionRaycastCostReview): string {
  const lines = [
    '# Projekt Objekt-143 Suppression Raycast Cost Review',
    '',
    `- Created: ${report.createdAt}`,
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.owner}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    '',
    '## Raycast Cost',
    '',
    `- Suppression cover searches: ${report.raycastCost.suppressionCoverSearches}`,
    `- Cache stores / hits: ${report.raycastCost.cacheStores} / ${report.raycastCost.cacheHits}`,
    `- Height queries: ${report.raycastCost.heightQueries}`,
    `- Cover tests: ${report.raycastCost.coverTests}`,
    `- Score-gate checks / skips: ${report.raycastCost.scoreGateChecks} / ${report.raycastCost.scoreGateSkips}`,
    `- Raycasts: ${report.raycastCost.raycasts}`,
    `- Height queries per uncached search: ${report.raycastCost.heightQueriesPerUncachedSearch ?? 'n/a'}`,
    `- Raycasts per uncached search: ${report.raycastCost.raycastsPerUncachedSearch ?? 'n/a'}`,
    `- Raycasts per suppression search: ${report.raycastCost.raycastsPerSuppressionSearch ?? 'n/a'}`,
    `- Raycast reach rate: ${report.raycastCost.raycastReachRate ?? 'n/a'}`,
    '',
    ...(report.comparison ? [
      '## Before / After',
      '',
      `- Before artifact: ${report.comparison.beforeArtifactDir}`,
      `- Before raycasts per uncached search: ${report.comparison.beforeRaycastsPerUncachedSearch ?? 'n/a'}`,
      `- After raycasts per uncached search: ${report.comparison.afterRaycastsPerUncachedSearch ?? 'n/a'}`,
      `- Delta: ${report.comparison.raycastsPerUncachedSearchDelta ?? 'n/a'}`,
      `- Ratio: ${report.comparison.raycastsPerUncachedSearchRatio ?? 'n/a'}`,
      '',
    ] : []),
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
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const { artifactDir, beforeArtifactDir, suppressionPacket, outputRoot } = parseArgs();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimePath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimePath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimePath);
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error(`Need at least two runtime samples in ${runtimePath}`);
  }

  const suppressionSource = readJson<SuppressionPacket>(suppressionPacket);
  const sourceAnchors = SOURCE_SPECS.map(findAnchors);
  const methodDeltas = {
    suppressionCoverSearch: methodDelta(samples, METHODS.suppressionCoverSearch),
    budget: methodDelta(samples, METHODS.budget),
    cacheHit: methodDelta(samples, METHODS.cacheHit),
    cacheStore: methodDelta(samples, METHODS.cacheStore),
    terrainScan: methodDelta(samples, METHODS.terrainScan),
    heightQuery: methodDelta(samples, METHODS.heightQuery),
    coverTest: methodDelta(samples, METHODS.coverTest),
    heightGate: methodDelta(samples, METHODS.heightGate),
    scoreGate: methodDelta(samples, METHODS.scoreGate),
    direction: methodDelta(samples, METHODS.direction),
    distance: methodDelta(samples, METHODS.distance),
    eyeSetup: methodDelta(samples, METHODS.eyeSetup),
    raycastTerrain: methodDelta(samples, METHODS.raycastTerrain),
    hitResult: methodDelta(samples, METHODS.hitResult),
    terrainScore: methodDelta(samples, METHODS.terrainScore),
  };

  const suppressionCoverSearches = Number(suppressionSource.suppressionShape?.coverSearchDelta ?? methodDeltas.suppressionCoverSearch.delta);
  const reuseSkips = Number(suppressionSource.counterDeltas?.reuseSkips ?? 0);
  const capSkips = Number(suppressionSource.counterDeltas?.capSkips ?? 0);
  const counterCoverageMatches = suppressionSource.counterDeltas?.present === true &&
    suppressionSource.counterDeltas?.methodCounterCoverageMatches === true &&
    suppressionSource.counterDeltas?.skipCoverageMatches === true;
  const skippedByCapOrReuse = Number(suppressionSource.suppressionShape?.searchSkipsOrCapDelta ?? reuseSkips + capSkips);
  const scoreGateChecks = methodDeltas.scoreGate.delta;
  const scoreGateSkips = Math.max(0, scoreGateChecks - methodDeltas.raycastTerrain.delta);
  const heightGateRejectRate = scoreGateChecks > 0
    ? ratio(methodDeltas.heightGate.delta - scoreGateChecks, methodDeltas.heightGate.delta)
    : round(1 - Number(ratio(methodDeltas.raycastTerrain.delta, methodDeltas.heightGate.delta) ?? 0));

  const raycastCost: SuppressionRaycastCostReview['raycastCost'] = {
    theoreticalCandidatesPerSearch: THEORETICAL_TERRAIN_CANDIDATES_PER_SEARCH,
    suppressionCoverSearches,
    cacheStores: methodDeltas.cacheStore.delta,
    cacheHits: methodDeltas.cacheHit.delta,
    terrainScans: methodDeltas.terrainScan.delta,
    heightQueries: methodDeltas.heightQuery.delta,
    coverTests: methodDeltas.coverTest.delta,
    heightGateChecks: methodDeltas.heightGate.delta,
    scoreGateChecks,
    scoreGateSkips,
    raycasts: methodDeltas.raycastTerrain.delta,
    terrainScores: methodDeltas.terrainScore.delta,
    heightQueriesPerSuppressionSearch: ratio(methodDeltas.heightQuery.delta, suppressionCoverSearches),
    heightQueriesPerUncachedSearch: ratio(methodDeltas.heightQuery.delta, methodDeltas.cacheStore.delta),
    raycastsPerSuppressionSearch: ratio(methodDeltas.raycastTerrain.delta, suppressionCoverSearches),
    raycastsPerUncachedSearch: ratio(methodDeltas.raycastTerrain.delta, methodDeltas.cacheStore.delta),
    raycastReachRate: ratio(methodDeltas.raycastTerrain.delta, methodDeltas.heightGate.delta),
    heightGateRejectRate,
    scoreGateRejectRate: ratio(scoreGateSkips, scoreGateChecks),
    uncachedSearchesPerSuppressionSearch: ratio(methodDeltas.cacheStore.delta, suppressionCoverSearches),
    cacheHitRate: ratio(methodDeltas.cacheHit.delta, methodDeltas.cacheHit.delta + methodDeltas.cacheStore.delta),
    capSkippedSearchTheoreticalCandidateBound: capSkips * THEORETICAL_TERRAIN_CANDIDATES_PER_SEARCH,
    capSkippedSearchProjectedRaycastBound: raycastCostProjected(capSkips, methodDeltas.raycastTerrain.delta, methodDeltas.cacheStore.delta),
  };

  const suppressionPacketSummary: SuppressionRaycastCostReview['suppressionPacketSummary'] = {
    status: suppressionSource.status ?? null,
    classification: suppressionSource.classification?.owner ?? null,
    confidence: suppressionSource.classification?.confidence ?? null,
    coverSearches: suppressionCoverSearches,
    skippedByCapOrReuse,
    reuseSkips,
    capSkips,
    counterCoverageMatches,
  };

  const classification = classify(sourceAnchors, suppressionPacketSummary, raycastCost);
  const comparison = beforeArtifactDir ? buildComparison(beforeArtifactDir, raycastCost) : null;
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const cacheHitLabel = methodDeltas.cacheHit.delta === 1 ? 'cache hit' : 'cache hits';

  const report: SuppressionRaycastCostReview = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-suppression-raycast-cost-review',
    status: classification.status,
    inputs: {
      artifactDir: rel(artifactDir)!,
      beforeArtifactDir: rel(beforeArtifactDir),
      summary: rel(summaryPath)!,
      runtimeSamples: rel(runtimePath)!,
      suppressionPacket: rel(suppressionPacket)!,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      runtimeSamples: samples.length,
      frameDelta: typeof firstSample.frameCount === 'number' && typeof lastSample.frameCount === 'number'
        ? lastSample.frameCount - firstSample.frameCount
        : null,
    },
    sourceAnchors,
    methodDeltas,
    suppressionPacketSummary,
    raycastCost,
    comparison,
    classification,
    findings: [
      `The counter-bearing suppression packet records ${suppressionCoverSearches} suppression cover searches, ${reuseSkips} destination-reuse skips, and ${capSkips} max-search-cap skips.`,
      `The current capture records ${methodDeltas.cacheStore.delta} uncached cover searches and ${methodDeltas.cacheHit.delta} ${cacheHitLabel}; cache stores plus hits equal the suppression cover-search count.`,
      `Each uncached terrain scan keeps the source 24-candidate height-query shape: ${methodDeltas.heightQuery.delta} height queries over ${methodDeltas.cacheStore.delta} uncached searches.`,
      `The terrain scan then records ${scoreGateChecks} height-valid score checks and ${methodDeltas.coverTest.delta} raycast-bound cover tests.`,
      `The height gate passes ${scoreGateChecks} candidates and rejects ${raycastCost.heightGateRejectRate} of terrain candidates before score comparison.`,
      `The score gate skips ${scoreGateSkips} height-valid candidates that cannot beat the current best cover score before raycastTerrain.`,
      `The current capture limits raycastTerrain calls to ${methodDeltas.raycastTerrain.delta}, or ${raycastCost.raycastsPerUncachedSearch} raycasts per uncached search and ${raycastCost.raycastsPerSuppressionSearch} per suppression cover search.`,
      ...(comparison ? [
        `Against ${comparison.beforeArtifactDir}, raycasts per uncached search move ${comparison.beforeRaycastsPerUncachedSearch} -> ${comparison.afterRaycastsPerUncachedSearch}.`,
      ] : []),
      `The two-search cap avoided ${raycastCost.capSkippedSearchTheoreticalCandidateBound} theoretical terrain candidates in this sampled window; projected raycast avoidance at this capture's uncached-search rate is ${raycastCost.capSkippedSearchProjectedRaycastBound}.`,
      'This packet proves per-search terrain cost shape under the existing cap; it does not authorize cap expansion.',
    ],
    nextActions: [
      'Preserve the maximum two suppression cover-search cap and the sorted score gate together; neither authorizes search-count expansion.',
      'Run a repeatability combat120 capture before treating the p99/heap-peak WARN state as stable.',
      'Move the next DEFEKT-3 packet to residual avg-frame comparison WARN and capture validation WARN, not suppression raycast cost.',
      'Keep headed standard combat120 plus perf:compare as the proof gate for any candidate runtime fix.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize combat120 baseline refresh.',
      'This packet does not certify suppression maneuver quality or combat feel.',
    ],
    files: {
      summary: rel(join(outputDir, 'suppression-raycast-cost-review.json'))!,
      markdown: rel(join(outputDir, 'suppression-raycast-cost-review.md'))!,
    },
  };

  writeFileSync(join(outputDir, 'suppression-raycast-cost-review.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'suppression-raycast-cost-review.md'), renderMarkdown(report), 'utf-8');

  console.log(`Projekt 143 suppression raycast cost ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`coverSearches=${suppressionCoverSearches} uncached=${raycastCost.cacheStores} cacheHits=${raycastCost.cacheHits} heightQueries=${raycastCost.heightQueries} scoreGateSkips=${raycastCost.scoreGateSkips} raycasts=${raycastCost.raycasts} raycastsPerSearch=${raycastCost.raycastsPerSuppressionSearch}`);

  if (report.status === 'fail') process.exitCode = 1;
}

function raycastCostProjected(capSkips: number, raycasts: number, uncachedSearches: number): number | null {
  const perSearch = ratio(raycasts, uncachedSearches);
  return perSearch == null ? null : round(capSkips * perSearch);
}

function buildComparison(
  beforeArtifactDir: string,
  afterCost: SuppressionRaycastCostReview['raycastCost']
): SuppressionRaycastCostReview['comparison'] {
  const beforeRaycasts = methodDeltaFromArtifact(beforeArtifactDir, METHODS.raycastTerrain).delta;
  const beforeUncachedSearches = methodDeltaFromArtifact(beforeArtifactDir, METHODS.cacheStore).delta;
  const beforePerSearch = ratio(beforeRaycasts, beforeUncachedSearches);
  const afterPerSearch = afterCost.raycastsPerUncachedSearch;
  const delta = beforePerSearch != null && afterPerSearch != null
    ? round(afterPerSearch - beforePerSearch)
    : null;
  const ratioValue = beforePerSearch != null && afterPerSearch != null
    ? ratio(afterPerSearch, beforePerSearch)
    : null;

  return {
    beforeArtifactDir: rel(beforeArtifactDir)!,
    beforeRaycasts,
    beforeUncachedSearches,
    beforeRaycastsPerUncachedSearch: beforePerSearch,
    afterRaycasts: afterCost.raycasts,
    afterUncachedSearches: afterCost.cacheStores,
    afterRaycastsPerUncachedSearch: afterPerSearch,
    raycastsPerUncachedSearchDelta: delta,
    raycastsPerUncachedSearchRatio: ratioValue,
    scoreGateSkips: afterCost.scoreGateSkips,
  };
}

main();
