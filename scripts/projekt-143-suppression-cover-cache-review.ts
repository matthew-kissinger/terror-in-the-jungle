#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface RuntimeSample {
  frameCount?: number;
  combatBreakdown?: {
    aiMethodTotalCounts?: Record<string, number>;
    closeEngagement?: {
      engagement?: {
        suppressionFlankDestinationComputations?: number;
        suppressionFlankCoverSearches?: number;
        suppressionFlankCoverSearchReuseSkips?: number;
        suppressionFlankCoverSearchCapSkips?: number;
      };
    };
  };
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  validation?: { overall?: string };
  measurementTrust?: { status?: string };
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

interface CounterDeltas {
  present: boolean;
  destinationComputations: number | null;
  coverSearches: number | null;
  reuseSkips: number | null;
  capSkips: number | null;
  explainedSkips: number | null;
  computedSkipDelta: number;
  methodCounterCoverageMatches: boolean | null;
  skipCoverageMatches: boolean | null;
}

interface SuppressionCoverCacheReview {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-suppression-cover-cache-review';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    cacheLocalityPacket: string | null;
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
  suppressionShape: {
    initiationDelta: number;
    computeFlankDestinationDelta: number;
    coverSearchDelta: number;
    assignFlankerDelta: number;
    assignSuppressorDelta: number;
    searchSkipsOrCapDelta: number;
    coverSearchesPerInitiation: number | null;
    flankDestinationsPerInitiation: number | null;
    raycastsPerSuppressionCoverSearch: number | null;
  };
  counterDeltas: CounterDeltas;
  classification: {
    status: CheckStatus;
    owner:
      | 'suppression_cover_skip_reasons_countered'
      | 'suppression_cover_counter_mismatch'
      | 'suppression_cover_search_skip_reason_underinstrumented'
      | 'suppression_cover_search_every_flanker_candidate'
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

const OUTPUT_NAME = 'projekt-143-suppression-cover-cache-review';
const DEFAULT_ARTIFACT = join(process.cwd(), 'artifacts', 'perf', '2026-05-07T13-13-32-364Z');
const DEFAULT_CACHE_LOCALITY = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T13-26-30-853Z',
  'projekt-143-cover-cache-locality-review',
  'cover-cache-locality-review.json',
);

const METHODS = {
  initiate: 'engage.suppression.initiate',
  computeFlankDestination: 'engage.suppression.initiate.computeFlankDestination',
  coverSearch: 'engage.suppression.initiate.coverSearch',
  assignFlanker: 'engage.suppression.initiate.assignFlanker',
  assignSuppressor: 'engage.suppression.initiate.assignSuppressor',
  cacheStore: 'cover.findNearestCover.cacheStore',
  cacheHit: 'cover.findNearestCover.cacheHit',
  raycastTerrain: 'cover.findNearestCover.terrainScan.coverTest.raycastTerrain',
};

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'private readonly MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2',
      'private readonly FLANK_DESTINATION_REUSE_RADIUS_SQ = 12 * 12',
      'const flankCoverProbe = { position: new THREE.Vector3() } as Combatant',
      'let flankCoverSearches = 0',
      "'engage.suppression.initiate.computeFlankDestination'",
      'const hasReusableFlankDestination = !!existingDestination',
      'this.telemetry.suppressionFlankDestinationComputations++',
      'this.telemetry.suppressionFlankCoverSearchReuseSkips++',
      'flankCoverSearches >= this.MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION',
      'this.telemetry.suppressionFlankCoverSearchCapSkips++',
      "'engage.suppression.initiate.coverSearch'",
      'flankCoverProbe.position.copy(flankDestination)',
      'this.telemetry.suppressionFlankCoverSearches++',
      'return findNearestCover(flankCoverProbe, targetPos)',
      "'engage.suppression.initiate.assignFlanker'",
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateEngage.test.ts',
    patterns: [
      'reuses a nearby existing flank destination instead of re-searching cover',
      'caps flank cover searches per suppression initiation for larger squads',
      'emits suppression initiation subphase timings without changing squad orders',
    ],
  },
  {
    path: 'scripts/projekt-143-cover-cache-locality-review.ts',
    patterns: [
      'cover_cache_miss_explained_by_suppression_flank_unique_probe_path',
      'suppressionFlankCoverSearchDelta',
    ],
  },
  {
    path: 'scripts/perf-capture.ts',
    patterns: [
      'suppressionFlankDestinationComputations?: number;',
      'suppressionFlankCoverSearches?: number;',
      'suppressionFlankCoverSearchReuseSkips?: number;',
      'suppressionFlankCoverSearchCapSkips?: number;',
      'suppressionFlankDestinationComputations: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankDestinationComputations ?? 0)',
      'suppressionFlankCoverSearchReuseSkips: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankCoverSearchReuseSkips ?? 0)',
      'suppressionFlankCoverSearchCapSkips: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankCoverSearchCapSkips ?? 0)',
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

function parseArgs(): { artifactDir: string; cacheLocalityPacket: string | null; outputRoot: string } {
  const artifactDir = resolve(argValue('--artifact') ?? DEFAULT_ARTIFACT);
  if (!existsSync(artifactDir)) throw new Error(`Missing artifact directory: ${artifactDir}`);

  const cacheArg = argValue('--cache-locality');
  const cacheLocalityPacket = resolve(cacheArg ?? DEFAULT_CACHE_LOCALITY);
  const outputRoot = resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath()));
  return {
    artifactDir,
    cacheLocalityPacket: existsSync(cacheLocalityPacket) ? cacheLocalityPacket : null,
    outputRoot,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
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

type CounterKey =
  | 'suppressionFlankDestinationComputations'
  | 'suppressionFlankCoverSearches'
  | 'suppressionFlankCoverSearchReuseSkips'
  | 'suppressionFlankCoverSearchCapSkips';

function counterAt(sample: RuntimeSample | null, key: CounterKey): number | null {
  const value = sample?.combatBreakdown?.closeEngagement?.engagement?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function counterDelta(samples: RuntimeSample[], key: CounterKey): number | null {
  const first = counterAt(samples[0] ?? null, key);
  const last = counterAt(samples[samples.length - 1] ?? null, key);
  if (first == null || last == null) return null;
  return Math.max(0, last - first);
}

function computeCounterDeltas(
  samples: RuntimeSample[],
  computeFlankDestinationDelta: number,
  coverSearchDelta: number
): CounterDeltas {
  const destinationComputations = counterDelta(samples, 'suppressionFlankDestinationComputations');
  const coverSearches = counterDelta(samples, 'suppressionFlankCoverSearches');
  const reuseSkips = counterDelta(samples, 'suppressionFlankCoverSearchReuseSkips');
  const capSkips = counterDelta(samples, 'suppressionFlankCoverSearchCapSkips');
  const present = destinationComputations != null
    && coverSearches != null
    && reuseSkips != null
    && capSkips != null;
  const explainedSkips = present ? reuseSkips + capSkips : null;
  const computedSkipDelta = Math.max(0, computeFlankDestinationDelta - coverSearchDelta);

  return {
    present,
    destinationComputations,
    coverSearches,
    reuseSkips,
    capSkips,
    explainedSkips,
    computedSkipDelta,
    methodCounterCoverageMatches: present
      ? destinationComputations === computeFlankDestinationDelta && coverSearches === coverSearchDelta
      : null,
    skipCoverageMatches: present ? explainedSkips === computedSkipDelta : null,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  return Number((numerator / denominator).toFixed(3));
}

function classify(
  anchors: AnchorResult[],
  searchSkipsOrCapDelta: number,
  coverSearchDelta: number,
  counterDeltas: CounterDeltas
): SuppressionCoverCacheReview['classification'] {
  if (!anchors.every((anchor) => anchor.present)) {
    return {
      status: 'fail',
      owner: 'source_anchor_missing',
      confidence: 'low',
      acceptance: 'diagnostic_only',
    };
  }

  if (counterDeltas.present) {
    if (counterDeltas.methodCounterCoverageMatches && counterDeltas.skipCoverageMatches) {
      return {
        status: 'warn',
        owner: 'suppression_cover_skip_reasons_countered',
        confidence: 'high',
        acceptance: 'diagnostic_only',
      };
    }

    return {
      status: 'fail',
      owner: 'suppression_cover_counter_mismatch',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }

  if (searchSkipsOrCapDelta > 0) {
    return {
      status: 'warn',
      owner: 'suppression_cover_search_skip_reason_underinstrumented',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }

  return {
    status: 'warn',
    owner: coverSearchDelta > 0
      ? 'suppression_cover_search_every_flanker_candidate'
      : 'suppression_cover_search_skip_reason_underinstrumented',
    confidence: 'low',
    acceptance: 'diagnostic_only',
  };
}

function renderMarkdown(report: SuppressionCoverCacheReview): string {
  const lines = [
    '# Projekt Objekt-143 Suppression Cover Cache Review',
    '',
    `- Created: ${report.createdAt}`,
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.owner}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    '',
    '## Suppression Shape',
    '',
    `- Initiations: ${report.suppressionShape.initiationDelta}`,
    `- Flank-destination computations: ${report.suppressionShape.computeFlankDestinationDelta}`,
    `- Cover searches: ${report.suppressionShape.coverSearchDelta}`,
    `- Assign flanker calls: ${report.suppressionShape.assignFlankerDelta}`,
    `- Search skips or cap skips: ${report.suppressionShape.searchSkipsOrCapDelta}`,
    `- Cover searches per initiation: ${report.suppressionShape.coverSearchesPerInitiation ?? 'n/a'}`,
    `- Raycasts per suppression cover search: ${report.suppressionShape.raycastsPerSuppressionCoverSearch ?? 'n/a'}`,
    '',
    '## Counter Deltas',
    '',
    `- Counter-bearing capture: ${report.counterDeltas.present}`,
    `- Destination computations: ${report.counterDeltas.destinationComputations ?? 'n/a'}`,
    `- Cover searches: ${report.counterDeltas.coverSearches ?? 'n/a'}`,
    `- Reuse skips: ${report.counterDeltas.reuseSkips ?? 'n/a'}`,
    `- Cap skips: ${report.counterDeltas.capSkips ?? 'n/a'}`,
    `- Explained skips: ${report.counterDeltas.explainedSkips ?? 'n/a'}`,
    `- Method counter coverage matches: ${report.counterDeltas.methodCounterCoverageMatches ?? 'n/a'}`,
    `- Skip coverage matches: ${report.counterDeltas.skipCoverageMatches ?? 'n/a'}`,
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
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const { artifactDir, cacheLocalityPacket, outputRoot } = parseArgs();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimePath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimePath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimePath);
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error(`Need at least two runtime samples in ${runtimePath}`);
  }

  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const sourceAnchors = SOURCE_SPECS.map(findAnchors);
  const methodDeltas = {
    initiate: methodDelta(samples, METHODS.initiate),
    computeFlankDestination: methodDelta(samples, METHODS.computeFlankDestination),
    coverSearch: methodDelta(samples, METHODS.coverSearch),
    assignFlanker: methodDelta(samples, METHODS.assignFlanker),
    assignSuppressor: methodDelta(samples, METHODS.assignSuppressor),
    cacheStore: methodDelta(samples, METHODS.cacheStore),
    cacheHit: methodDelta(samples, METHODS.cacheHit),
    raycastTerrain: methodDelta(samples, METHODS.raycastTerrain),
  };

  const initiationDelta = methodDeltas.initiate.delta;
  const computeDelta = methodDeltas.computeFlankDestination.delta;
  const coverSearchDelta = methodDeltas.coverSearch.delta;
  const assignFlankerDelta = methodDeltas.assignFlanker.delta;
  const assignSuppressorDelta = methodDeltas.assignSuppressor.delta;
  const raycastDelta = methodDeltas.raycastTerrain.delta;
  const searchSkipsOrCapDelta = Math.max(0, computeDelta - coverSearchDelta);
  const counterDeltas = computeCounterDeltas(samples, computeDelta, coverSearchDelta);
  const classification = classify(sourceAnchors, searchSkipsOrCapDelta, coverSearchDelta, counterDeltas);
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const counterFinding = counterDeltas.present
    ? `The counter-bearing capture splits the ${counterDeltas.computedSkipDelta} skipped cover searches into ${counterDeltas.reuseSkips} destination-reuse skips and ${counterDeltas.capSkips} max-search-cap skips.`
    : `The available runtime counters expose ${searchSkipsOrCapDelta} flank-destination computations without cover searches, but they do not distinguish destination reuse from max-search cap skips.`;
  const skipDominanceAction = counterDeltas.present && (counterDeltas.capSkips ?? 0) > (counterDeltas.reuseSkips ?? 0)
    ? 'Cap skips dominate this capture; preserve the two-search cap and target per-search terrain-raycast cost before raising suppression coverage.'
    : 'If reuse skips dominate, test a bounded per-squad suppression cover-result cache; if max cap dominates, preserve current cap and target search cost.';

  const report: SuppressionCoverCacheReview = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-suppression-cover-cache-review',
    status: classification.status,
    inputs: {
      artifactDir: rel(artifactDir)!,
      summary: rel(summaryPath)!,
      runtimeSamples: rel(runtimePath)!,
      cacheLocalityPacket: rel(cacheLocalityPacket),
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
    suppressionShape: {
      initiationDelta,
      computeFlankDestinationDelta: computeDelta,
      coverSearchDelta,
      assignFlankerDelta,
      assignSuppressorDelta,
      searchSkipsOrCapDelta,
      coverSearchesPerInitiation: ratio(coverSearchDelta, initiationDelta),
      flankDestinationsPerInitiation: ratio(computeDelta, initiationDelta),
      raycastsPerSuppressionCoverSearch: ratio(raycastDelta, coverSearchDelta),
    },
    counterDeltas,
    classification,
    findings: [
      `The sampled window records ${initiationDelta} suppression initiations, ${computeDelta} flank-destination computations, and ${coverSearchDelta} suppression cover searches.`,
      `The source has two cover-search skip gates: existing destination reuse within 12m and the maximum two cover searches per suppression initiation.`,
      counterFinding,
      `Counter coverage against AI method totals is ${counterDeltas.methodCounterCoverageMatches ?? 'not present'}; skip coverage is ${counterDeltas.skipCoverageMatches ?? 'not present'}.`,
      `The current sampled window records ${methodDeltas.cacheStore.delta} AICoverFinding cache stores and ${methodDeltas.cacheHit.delta} cache hits; the prior cache-locality packet supplies caller-locality context.`,
      `The sampled window records ${raycastDelta} terrain raycasts, or ${ratio(raycastDelta, coverSearchDelta) ?? 0} raycasts per suppression cover search.`,
    ],
    nextActions: [
      counterDeltas.present
        ? 'Use the reuse-vs-cap split to choose the next bounded proof before changing cover-search behavior.'
        : 'Add behavior-neutral counters for suppression flank destination reuse skips and max-search cap skips before changing cover-search behavior.',
      skipDominanceAction,
      'Keep the 24-candidate AICoverFinding terrain search contract unchanged until a behavior-quality proof exists.',
      'Any runtime change requires headed standard combat120 capture and perf:compare before baseline refresh discussion.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize perf-baseline refresh.',
      'This packet does not certify suppression maneuver quality or combat feel.',
    ],
    files: {
      summary: rel(join(outputDir, 'suppression-cover-cache-review.json'))!,
      markdown: rel(join(outputDir, 'suppression-cover-cache-review.md'))!,
    },
  };

  writeFileSync(join(outputDir, 'suppression-cover-cache-review.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'suppression-cover-cache-review.md'), renderMarkdown(report), 'utf-8');

  console.log(`Projekt 143 suppression cover cache ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`initiations=${initiationDelta} flankDestinations=${computeDelta} coverSearches=${coverSearchDelta} skipOrCap=${searchSkipsOrCapDelta} raycasts=${raycastDelta}`);
  if (counterDeltas.present) {
    console.log(`counters=reuseSkips=${counterDeltas.reuseSkips} capSkips=${counterDeltas.capSkips} explainedSkips=${counterDeltas.explainedSkips}`);
  }

  if (report.status === 'fail') process.exitCode = 1;
}

main();
