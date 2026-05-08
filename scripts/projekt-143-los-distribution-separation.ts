#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type WindowLabel = 'early' | 'middle' | 'late';

interface PerfSummary {
  startedAt?: string;
  endedAt?: string;
  status?: string;
  validation?: {
    overall?: string;
  };
  measurementTrust?: {
    status?: string;
  };
  scenario?: {
    mode?: string;
  };
}

interface RuntimeSample {
  frameCount?: number;
  avgFrameMs?: number;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    closeEngagement?: Record<string, unknown>;
  };
}

interface OwnerAttributionReport {
  inputs?: {
    counterPacket?: string | null;
    artifactDir?: string | null;
    summary?: string | null;
    runtimeSamples?: string | null;
  };
  sourceSummary?: {
    validation?: string | null;
    measurementTrust?: string | null;
  };
}

interface SourceAnchor {
  path: string;
  directLosReference: boolean;
  directDistributionReference: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface WindowSeparation {
  label: WindowLabel;
  samples: number;
  firstFrame: number | null;
  lastFrame: number | null;
  avgFrameMs: number | null;
  combatTotalMs: number | null;
  aiUpdateMs: number | null;
  acquisitionDemandDelta: number | null;
  clusterDistributionCalls: number | null;
  distributionSchedulingDelta: number | null;
  distributionCalls: number | null;
  assignmentChurn: number | null;
  targetCountRebuilds: number | null;
  losExecutionDelta: number | null;
  losFullEvaluations: number | null;
  losTerrainRaycasts: number | null;
  losBlocked: number | null;
  losPerDistributionCall: number | null;
  terrainRaycastsPerDistributionCall: number | null;
  distributionChurnPerCall: number | null;
}

interface SeparationReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-los-distribution-separation';
  status: CheckStatus;
  inputs: {
    ownerAttribution: string;
    artifactDir: string | null;
    summary: string | null;
    runtimeSamples: string | null;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
  };
  sourceAnchors: SourceAnchor[];
  windows: WindowSeparation[];
  correlations: {
    avgFrameVsLosExecutionDelta: number | null;
    avgFrameVsDistributionSchedulingDelta: number | null;
    combatTotalVsLosExecutionDelta: number | null;
    combatTotalVsDistributionSchedulingDelta: number | null;
    losExecutionVsDistributionSchedulingDelta: number | null;
  };
  classification: {
    path: 'coupled_distribution_scheduling_with_separate_los_execution' | 'missing_counter_runtime_samples';
    acceptance: 'diagnostic_only';
    confidence: 'medium' | 'low';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-los-distribution-separation';
const DEFAULT_OWNER_ATTRIBUTION = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T08-29-10-043Z',
  'projekt-143-close-engagement-owner-attribution',
  'owner-attribution.json',
);

const PATHS = {
  acquisitionDemand: [
    'combatBreakdown.closeEngagement.targetAcquisition.findNearestEnemyCalls',
    'combatBreakdown.closeEngagement.targetAcquisition.clusterDistributionCalls',
  ],
  clusterDistributionCalls: 'combatBreakdown.closeEngagement.targetAcquisition.clusterDistributionCalls',
  distributionScheduling: [
    'combatBreakdown.closeEngagement.targetDistribution.distributionCalls',
    'combatBreakdown.closeEngagement.targetDistribution.assignmentChurn',
    'combatBreakdown.closeEngagement.targetDistribution.targetCountRebuilds',
  ],
  distributionCalls: 'combatBreakdown.closeEngagement.targetDistribution.distributionCalls',
  assignmentChurn: 'combatBreakdown.closeEngagement.targetDistribution.assignmentChurn',
  targetCountRebuilds: 'combatBreakdown.closeEngagement.targetDistribution.targetCountRebuilds',
  losExecution: [
    'combatBreakdown.closeEngagement.lineOfSight.fullEvaluations',
    'combatBreakdown.closeEngagement.lineOfSight.terrainRaycasts',
    'combatBreakdown.closeEngagement.lineOfSight.fullEvaluationBlocked',
  ],
  losFullEvaluations: 'combatBreakdown.closeEngagement.lineOfSight.fullEvaluations',
  losTerrainRaycasts: 'combatBreakdown.closeEngagement.lineOfSight.terrainRaycasts',
  losBlocked: 'combatBreakdown.closeEngagement.lineOfSight.fullEvaluationBlocked',
};

const SOURCE_SPECS = [
  {
    path: 'src/systems/combat/ai/AITargetAcquisition.ts',
    patterns: [
      'findNearestEnemy(',
      'this.telemetry.clusterDistributionCalls++',
      'clusterManager.assignDistributedTarget',
      'private getNearbyIds(',
    ],
  },
  {
    path: 'src/systems/combat/ClusterManager.ts',
    patterns: [
      'assignDistributedTarget(',
      'this.telemetry.distributionCalls++',
      'this.telemetry.assignmentChurn++',
      'this.telemetry.targetCountRebuilds++',
    ],
  },
  {
    path: 'src/systems/combat/ai/AILineOfSight.ts',
    patterns: [
      'canSeeTarget(',
      'AILineOfSight.fullEvaluations++',
      'AILineOfSight.terrainRaycasts++',
      'this.terrainSystem.raycastTerrain',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'if (!canSeeTarget(combatant, target, playerPosition))',
      'this.telemetry.suppressionTransitions++',
      'const nearbyEnemyCount = countNearbyEnemies',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStatePatrol.ts',
    patterns: [
      'const enemy = findNearestEnemy',
      'veryCloseRange || canSeeTarget',
      'getClusterDensity(combatant, allCombatants, spatialGrid)',
    ],
  },
  {
    path: 'src/systems/combat/ai/AIStateDefend.ts',
    patterns: [
      'const enemy = findNearestEnemy',
      'veryCloseRange || canSeeTarget',
      'getClusterDensity(combatant, allCombatants, spatialGrid)',
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
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function resolveRepoPath(path: string | null | undefined): string | null {
  if (!path) return null;
  return resolve(process.cwd(), path);
}

function numberAt(source: unknown, path: string): number | null {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 3): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function counterDelta(samples: RuntimeSample[], path: string): number | null {
  if (samples.length < 2) return null;
  const first = numberAt(samples[0], path);
  const last = numberAt(samples[samples.length - 1], path);
  if (first === null || last === null) return null;
  return Math.max(0, last - first);
}

function sumDelta(samples: RuntimeSample[], paths: string[]): number | null {
  let total = 0;
  for (const path of paths) {
    const delta = counterDelta(samples, path);
    if (delta === null) return null;
    total += delta;
  }
  return total;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round(numerator / denominator);
}

function phaseSlices(samples: RuntimeSample[]): Array<{ label: WindowLabel; samples: RuntimeSample[] }> {
  const labels: WindowLabel[] = ['early', 'middle', 'late'];
  return labels.map((label, index) => {
    const start = Math.floor((samples.length * index) / labels.length);
    const end = index === labels.length - 1
      ? samples.length
      : Math.floor((samples.length * (index + 1)) / labels.length);
    return { label, samples: samples.slice(start, Math.max(start + 1, end)) };
  });
}

function windowSeparation(label: WindowLabel, samples: RuntimeSample[]): WindowSeparation {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const acquisitionDemandDelta = sumDelta(samples, PATHS.acquisitionDemand);
  const clusterDistributionCalls = counterDelta(samples, PATHS.clusterDistributionCalls);
  const distributionSchedulingDelta = sumDelta(samples, PATHS.distributionScheduling);
  const distributionCalls = counterDelta(samples, PATHS.distributionCalls);
  const assignmentChurn = counterDelta(samples, PATHS.assignmentChurn);
  const targetCountRebuilds = counterDelta(samples, PATHS.targetCountRebuilds);
  const losExecutionDelta = sumDelta(samples, PATHS.losExecution);
  const losFullEvaluations = counterDelta(samples, PATHS.losFullEvaluations);
  const losTerrainRaycasts = counterDelta(samples, PATHS.losTerrainRaycasts);
  const losBlocked = counterDelta(samples, PATHS.losBlocked);
  return {
    label,
    samples: samples.length,
    firstFrame: typeof first?.frameCount === 'number' ? first.frameCount : null,
    lastFrame: typeof last?.frameCount === 'number' ? last.frameCount : null,
    avgFrameMs: round(average(samples.map((sample) => sample.avgFrameMs)), 2),
    combatTotalMs: round(average(samples.map((sample) => sample.combatBreakdown?.totalMs)), 2),
    aiUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.aiUpdateMs)), 2),
    acquisitionDemandDelta,
    clusterDistributionCalls,
    distributionSchedulingDelta,
    distributionCalls,
    assignmentChurn,
    targetCountRebuilds,
    losExecutionDelta,
    losFullEvaluations,
    losTerrainRaycasts,
    losBlocked,
    losPerDistributionCall: ratio(losFullEvaluations, distributionCalls),
    terrainRaycastsPerDistributionCall: ratio(losTerrainRaycasts, distributionCalls),
    distributionChurnPerCall: ratio(assignmentChurn, distributionCalls),
  };
}

function sampleDeltas(samples: RuntimeSample[], paths: string[]): Array<number | null> {
  const deltas: Array<number | null> = [];
  for (let index = 1; index < samples.length; index++) {
    let total = 0;
    let complete = true;
    for (const path of paths) {
      const previous = numberAt(samples[index - 1], path);
      const current = numberAt(samples[index], path);
      if (previous === null || current === null) {
        complete = false;
        break;
      }
      total += Math.max(0, current - previous);
    }
    deltas.push(complete ? total : null);
  }
  return deltas;
}

function pearson(xs: Array<number | null | undefined>, ys: Array<number | null | undefined>): number | null {
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < xs.length; index++) {
    const x = xs[index];
    const y = ys[index];
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      pairs.push([x, y]);
    }
  }
  if (pairs.length < 3) return null;
  const xMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const yMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  for (const [x, y] of pairs) {
    const dx = x - xMean;
    const dy = y - yMean;
    numerator += dx * dy;
    xDenominator += dx * dx;
    yDenominator += dy * dy;
  }
  if (xDenominator === 0 || yDenominator === 0) return null;
  return numerator / Math.sqrt(xDenominator * yDenominator);
}

function findLine(lines: string[], pattern: string): { line: number | null; text: string | null } {
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index < 0) return { line: null, text: null };
  return { line: index + 1, text: lines[index].trim() };
}

function collectSourceAnchors(): SourceAnchor[] {
  return SOURCE_SPECS.map((spec) => {
    const absolute = join(process.cwd(), spec.path);
    const text = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : '';
    const lines = text.split(/\r?\n/);
    return {
      path: spec.path,
      directLosReference: /AILineOfSight|canSeeTarget\(/.test(text),
      directDistributionReference: /assignDistributedTarget|clusterManager/.test(text),
      anchors: spec.patterns.map((pattern) => ({
        pattern,
        ...findLine(lines, pattern),
      })),
    };
  });
}

function sourceAnchorsPresent(anchors: SourceAnchor[]): boolean {
  return anchors.every((source) => source.anchors.every((anchor) => anchor.line !== null));
}

function markdownFor(report: SeparationReport): string {
  const lines: string[] = [
    '# Projekt 143 LOS Distribution Separation',
    '',
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.path}`,
    `- Owner attribution: ${report.inputs.ownerAttribution}`,
    `- Runtime samples: ${report.inputs.runtimeSamples ?? 'none'}`,
    '',
    '## Source Summary',
    '',
    `- Validation: ${report.sourceSummary.validation ?? 'n/a'}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust ?? 'n/a'}`,
    '',
    '## Window Separation',
    '',
    '| Window | Samples | Frames | Avg frame | Combat total | Acquisition demand | Distribution scheduling | Distribution calls | Assignment churn | LOS execution | LOS full eval | Terrain raycasts | LOS/distribution call |',
    '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const window of report.windows) {
    lines.push(
      `| ${window.label} | ${window.samples} | ${window.firstFrame ?? 'n/a'}..${window.lastFrame ?? 'n/a'} | ` +
      `${window.avgFrameMs ?? 'n/a'} | ${window.combatTotalMs ?? 'n/a'} | ` +
      `${window.acquisitionDemandDelta ?? 'n/a'} | ${window.distributionSchedulingDelta ?? 'n/a'} | ` +
      `${window.distributionCalls ?? 'n/a'} | ${window.assignmentChurn ?? 'n/a'} | ` +
      `${window.losExecutionDelta ?? 'n/a'} | ${window.losFullEvaluations ?? 'n/a'} | ` +
      `${window.losTerrainRaycasts ?? 'n/a'} | ${window.losPerDistributionCall ?? 'n/a'} |`
    );
  }
  lines.push('', '## Source Anchors', '');
  for (const source of report.sourceAnchors) {
    lines.push(`- ${source.path}: directLosReference=${source.directLosReference}, directDistributionReference=${source.directDistributionReference}`);
    for (const anchor of source.anchors) {
      lines.push(`  - ${anchor.pattern}: ${anchor.line ?? 'missing'}`);
    }
  }
  lines.push('', '## Correlations', '');
  for (const [key, value] of Object.entries(report.correlations)) {
    lines.push(`- ${key}: ${value ?? 'n/a'}`);
  }
  lines.push('', '## Findings', '', ...report.findings.map((finding) => `- ${finding}`));
  lines.push('', '## Next Actions', '', ...report.nextActions.map((action) => `- ${action}`));
  lines.push('', '## Non-Claims', '', ...report.nonClaims.map((claim) => `- ${claim}`), '');
  return lines.join('\n');
}

function latestMinusEarly(windows: WindowSeparation[], key: keyof WindowSeparation): number | null {
  const early = windows.find((window) => window.label === 'early')?.[key];
  const late = windows.find((window) => window.label === 'late')?.[key];
  if (typeof early !== 'number' || typeof late !== 'number') return null;
  return late - early;
}

function main(): void {
  const ownerAttributionPath = resolve(argValue('--owner-attribution') ?? DEFAULT_OWNER_ATTRIBUTION);
  if (!existsSync(ownerAttributionPath)) {
    throw new Error(`Owner attribution not found: ${ownerAttributionPath}`);
  }

  const ownerReport = readJson<OwnerAttributionReport>(ownerAttributionPath);
  const runtimeSamplesPath = resolveRepoPath(argValue('--runtime-samples') ?? ownerReport.inputs?.runtimeSamples);
  if (!runtimeSamplesPath || !existsSync(runtimeSamplesPath)) {
    throw new Error(`Runtime samples not found: ${runtimeSamplesPath ?? 'none'}`);
  }

  const summaryPath = resolveRepoPath(ownerReport.inputs?.summary);
  const artifactDir = resolveRepoPath(ownerReport.inputs?.artifactDir);
  const summary = summaryPath && existsSync(summaryPath) ? readJson<PerfSummary>(summaryPath) : null;
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath)
    .filter((sample) => sample.combatBreakdown?.closeEngagement);
  const windows = samples.length > 0
    ? phaseSlices(samples).map((window) => windowSeparation(window.label, window.samples))
    : [];

  const sourceAnchors = collectSourceAnchors();
  const compareSamples = samples.slice(1);
  const losExecutionDeltas = sampleDeltas(samples, PATHS.losExecution);
  const distributionSchedulingDeltas = sampleDeltas(samples, PATHS.distributionScheduling);
  const outputRoot = resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath()));
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'separation.json');
  const markdownPath = join(outputDir, 'separation.md');

  const targetAcquisitionSource = sourceAnchors.find((source) => source.path.endsWith('AITargetAcquisition.ts'));
  const clusterManagerSource = sourceAnchors.find((source) => source.path.endsWith('ClusterManager.ts'));
  const losLateDelta = latestMinusEarly(windows, 'losExecutionDelta');
  const distributionLateDelta = latestMinusEarly(windows, 'distributionSchedulingDelta');
  const lateWindow = windows.find((window) => window.label === 'late');

  const report: SeparationReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-los-distribution-separation',
    status: samples.length > 0 && sourceAnchorsPresent(sourceAnchors) ? 'warn' : 'fail',
    inputs: {
      ownerAttribution: rel(ownerAttributionPath) ?? ownerAttributionPath,
      artifactDir: rel(artifactDir),
      summary: rel(summaryPath),
      runtimeSamples: rel(runtimeSamplesPath),
    },
    sourceSummary: {
      startedAt: summary?.startedAt ?? null,
      endedAt: summary?.endedAt ?? null,
      scenarioMode: summary?.scenario?.mode ?? null,
      captureStatus: summary?.status ?? null,
      validation: summary?.validation?.overall ?? ownerReport.sourceSummary?.validation ?? null,
      measurementTrust: summary?.measurementTrust?.status ?? ownerReport.sourceSummary?.measurementTrust ?? null,
    },
    sourceAnchors,
    windows,
    correlations: {
      avgFrameVsLosExecutionDelta: round(pearson(losExecutionDeltas, compareSamples.map((sample) => sample.avgFrameMs))),
      avgFrameVsDistributionSchedulingDelta: round(pearson(distributionSchedulingDeltas, compareSamples.map((sample) => sample.avgFrameMs))),
      combatTotalVsLosExecutionDelta: round(pearson(losExecutionDeltas, compareSamples.map((sample) => sample.combatBreakdown?.totalMs))),
      combatTotalVsDistributionSchedulingDelta: round(pearson(distributionSchedulingDeltas, compareSamples.map((sample) => sample.combatBreakdown?.totalMs))),
      losExecutionVsDistributionSchedulingDelta: round(pearson(losExecutionDeltas, distributionSchedulingDeltas)),
    },
    classification: {
      path: samples.length > 0
        ? 'coupled_distribution_scheduling_with_separate_los_execution'
        : 'missing_counter_runtime_samples',
      acceptance: 'diagnostic_only',
      confidence: samples.length > 0 && sourceAnchorsPresent(sourceAnchors) ? 'medium' : 'low',
    },
    findings: [
      `Target acquisition direct LOS reference is ${targetAcquisitionSource?.directLosReference ?? 'unknown'}; ClusterManager direct LOS reference is ${clusterManagerSource?.directLosReference ?? 'unknown'}.`,
      `Late-minus-early LOS execution delta is ${losLateDelta ?? 'n/a'}; late-minus-early distribution scheduling delta is ${distributionLateDelta ?? 'n/a'}.`,
      `Late window records ${lateWindow?.losPerDistributionCall ?? 'n/a'} LOS full evaluations per distribution call and ${lateWindow?.terrainRaycastsPerDistributionCall ?? 'n/a'} terrain raycasts per distribution call.`,
      'Target distribution is a scheduling/fan-out path. LOS is an execution path reached through state-handler visibility checks after target selection.',
      'The source capture remains validation WARN and compare-blocked; this packet is separation evidence, not release evidence.',
    ],
    nextActions: [
      'Patch or instrument the state-handler LOS execution cadence before changing close-model visual caps.',
      'If distribution churn remains suspect, add a bounded A/B diagnostic that holds target assignment stable while leaving LOS unchanged.',
      'Keep STABILIZAT-1 open until a standard combat120 capture and perf:compare are clean.',
    ],
    nonClaims: [
      'This packet does not prove a performance fix.',
      'This packet does not authorize perf-baselines.json refresh.',
      'This packet does not close DEFEKT-3 or STABILIZAT-1.',
    ],
    files: {
      summary: rel(jsonPath) ?? jsonPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownFor(report));

  console.log(`Projekt 143 LOS/distribution separation ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`classification=${report.classification.path}`);
  console.log(`runtimeSamples=${report.inputs.runtimeSamples ?? 'none'}`);
}

main();
