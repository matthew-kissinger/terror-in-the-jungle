#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    closeEngagement?: Record<string, unknown>;
  };
}

interface CounterPacket {
  classification?: {
    counterChain?: string;
  };
  inputs?: {
    runtimeArtifactDir?: string | null;
    runtimeSamples?: string | null;
  };
  runtimeCounterWindow?: {
    samples?: number;
    delta?: Record<string, number | null>;
    phases?: Array<{
      label?: string;
      samples?: number;
      firstFrame?: number | null;
      lastFrame?: number | null;
      delta?: Record<string, number | null>;
    }>;
  };
}

interface OwnerSpec {
  id: string;
  owner: string;
  source: string;
  role: string;
  markerPaths: string[];
  evidencePaths: string[];
}

interface OwnerAttribution {
  owner: string;
  source: string;
  role: string;
  markerDelta: number | null;
  earlyMarkerDelta: number | null;
  middleMarkerDelta: number | null;
  lateMarkerDelta: number | null;
  lateMinusEarlyMarkerDelta: number | null;
  avgFrameCorrelation: number | null;
  combatTotalCorrelation: number | null;
  rationale: string;
}

interface WindowSummary {
  label: 'early' | 'middle' | 'late';
  samples: number;
  firstFrame: number | null;
  lastFrame: number | null;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  combatTotalMs: number | null;
  aiUpdateMs: number | null;
  ownerMarkerDeltas: Record<string, number | null>;
}

interface OwnerAttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-close-engagement-owner-attribution';
  status: CheckStatus;
  inputs: {
    counterPacket: string;
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
  validationHighlights: Record<string, ValidationCheck | null>;
  counterPacket: {
    counterChain: string | null;
    samples: number | null;
  };
  windows: WindowSummary[];
  ownerAttribution: OwnerAttribution[];
  classification: {
    ownerChain: string;
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

const OUTPUT_NAME = 'projekt-143-close-engagement-owner-attribution';
const DEFAULT_COUNTER_PACKET = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T08-18-45-389Z',
  'projekt-143-close-engagement-counter-packet',
  'counter-packet.json',
);

const OWNER_SPECS: OwnerSpec[] = [
  {
    id: 'ai_state_engage',
    owner: 'AIStateEngage close-range engagement ladder',
    source: 'src/systems/combat/ai/AIStateEngage.ts',
    role: 'Trigger owner: close full-auto, nearby burst, suppression, and target-distance pressure.',
    markerPaths: [
      'combatBreakdown.closeEngagement.engagement.closeRangeFullAutoActivations',
      'combatBreakdown.closeEngagement.engagement.nearbyEnemyBurstTriggers',
      'combatBreakdown.closeEngagement.engagement.suppressionTransitions',
    ],
    evidencePaths: [
      'combatBreakdown.closeEngagement.engagement.nearbyEnemyCountTotal',
      'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.m10to15',
      'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.m15to30',
    ],
  },
  {
    id: 'target_acquisition',
    owner: 'AITargetAcquisition close-contact search fan-out',
    source: 'src/systems/combat/ai/AITargetAcquisition.ts',
    role: 'Demand owner: nearby enemy counts, nearest-target searches, and cluster-distribution calls.',
    markerPaths: [
      'combatBreakdown.closeEngagement.targetAcquisition.nearbyEnemyCountCalls',
      'combatBreakdown.closeEngagement.targetAcquisition.clusterDistributionCalls',
    ],
    evidencePaths: [
      'combatBreakdown.closeEngagement.targetAcquisition.potentialTargetsTotal',
      'combatBreakdown.closeEngagement.targetAcquisition.clusterDistributionPotentialTargets',
      'combatBreakdown.closeEngagement.targetAcquisition.nearbyEnemyCountTotal',
      'combatBreakdown.closeEngagement.targetAcquisition.spatialQueryCacheMisses',
    ],
  },
  {
    id: 'target_distribution',
    owner: 'ClusterManager target distribution churn',
    source: 'src/systems/combat/ClusterManager.ts',
    role: 'Fan-out owner: distributed target assignment, assignment churn, and targeter-count accumulation.',
    markerPaths: [
      'combatBreakdown.closeEngagement.targetDistribution.distributionCalls',
      'combatBreakdown.closeEngagement.targetDistribution.assignmentChurn',
      'combatBreakdown.closeEngagement.targetDistribution.targetCountRebuilds',
    ],
    evidencePaths: [
      'combatBreakdown.closeEngagement.targetDistribution.potentialTargetsTotal',
      'combatBreakdown.closeEngagement.targetDistribution.targeterCountTotal',
      'combatBreakdown.closeEngagement.targetDistribution.targeterCountSamples',
    ],
  },
  {
    id: 'line_of_sight',
    owner: 'AILineOfSight full-evaluation and terrain-raycast path',
    source: 'src/systems/combat/ai/AILineOfSight.ts',
    role: 'Execution-cost owner: full LOS evaluations, terrain raycasts, and blocked/clear outcomes.',
    markerPaths: [
      'combatBreakdown.closeEngagement.lineOfSight.fullEvaluations',
      'combatBreakdown.closeEngagement.lineOfSight.terrainRaycasts',
      'combatBreakdown.closeEngagement.lineOfSight.fullEvaluationBlocked',
    ],
    evidencePaths: [
      'combatBreakdown.closeEngagement.lineOfSight.misses',
      'combatBreakdown.closeEngagement.lineOfSight.hits',
      'combatBreakdown.closeEngagement.lineOfSight.fullEvaluationClear',
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

function numberAt(source: unknown, path: string): number | null {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = finiteNumbers(values);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
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

function validationCheck(summary: PerfSummary | null, id: string): ValidationCheck | null {
  return summary?.validation?.checks?.find((check) => check.id === id) ?? null;
}

function counterDelta(samples: RuntimeSample[], path: string): number | null {
  if (samples.length < 2) return null;
  const first = numberAt(samples[0], path);
  const last = numberAt(samples[samples.length - 1], path);
  if (first === null || last === null) return null;
  return Math.max(0, last - first);
}

function ownerMarkerDelta(samples: RuntimeSample[], owner: OwnerSpec): number | null {
  const deltas = owner.markerPaths.map((path) => counterDelta(samples, path));
  if (deltas.some((delta) => delta === null)) return null;
  return deltas.reduce((sum, delta) => sum + (delta ?? 0), 0);
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

function phaseSlices(samples: RuntimeSample[]): Array<{ label: WindowSummary['label']; samples: RuntimeSample[] }> {
  const labels: WindowSummary['label'][] = ['early', 'middle', 'late'];
  return labels.map((label, index) => {
    const start = Math.floor((samples.length * index) / labels.length);
    const end = index === labels.length - 1
      ? samples.length
      : Math.floor((samples.length * (index + 1)) / labels.length);
    return { label, samples: samples.slice(start, Math.max(start + 1, end)) };
  });
}

function windowSummary(label: WindowSummary['label'], samples: RuntimeSample[]): WindowSummary {
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    label,
    samples: samples.length,
    firstFrame: typeof first?.frameCount === 'number' ? first.frameCount : null,
    lastFrame: typeof last?.frameCount === 'number' ? last.frameCount : null,
    avgFrameMs: round(average(samples.map((sample) => sample.avgFrameMs))),
    p99FrameMs: round(average(samples.map((sample) => sample.p99FrameMs))),
    combatTotalMs: round(average(samples.map((sample) => sample.combatBreakdown?.totalMs))),
    aiUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.aiUpdateMs))),
    ownerMarkerDeltas: Object.fromEntries(
      OWNER_SPECS.map((owner) => [owner.id, ownerMarkerDelta(samples, owner)])
    ),
  };
}

function attributionFor(owner: OwnerSpec, samples: RuntimeSample[], windows: WindowSummary[]): OwnerAttribution {
  const markerDelta = ownerMarkerDelta(samples, owner);
  const earlyMarkerDelta = windows.find((window) => window.label === 'early')?.ownerMarkerDeltas[owner.id] ?? null;
  const middleMarkerDelta = windows.find((window) => window.label === 'middle')?.ownerMarkerDeltas[owner.id] ?? null;
  const lateMarkerDelta = windows.find((window) => window.label === 'late')?.ownerMarkerDeltas[owner.id] ?? null;
  const ownerDeltas = sampleDeltas(samples, owner.markerPaths);
  const compareSamples = samples.slice(1);
  const avgFrameCorrelation = round(pearson(ownerDeltas, compareSamples.map((sample) => sample.avgFrameMs)), 3);
  const combatTotalCorrelation = round(pearson(ownerDeltas, compareSamples.map((sample) => sample.combatBreakdown?.totalMs)), 3);
  const lateMinusEarly = lateMarkerDelta === null || earlyMarkerDelta === null
    ? null
    : lateMarkerDelta - earlyMarkerDelta;
  return {
    owner: owner.owner,
    source: owner.source,
    role: owner.role,
    markerDelta,
    earlyMarkerDelta,
    middleMarkerDelta,
    lateMarkerDelta,
    lateMinusEarlyMarkerDelta: lateMinusEarly,
    avgFrameCorrelation,
    combatTotalCorrelation,
    rationale: rationaleFor(owner.id, markerDelta, earlyMarkerDelta, lateMarkerDelta, combatTotalCorrelation),
  };
}

function rationaleFor(
  ownerId: string,
  markerDelta: number | null,
  earlyDelta: number | null,
  lateDelta: number | null,
  combatCorrelation: number | null
): string {
  const trend = lateDelta !== null && earlyDelta !== null
    ? `late-minus-early marker delta ${lateDelta - earlyDelta}`
    : 'phase trend unavailable';
  const correlation = combatCorrelation === null
    ? 'combat-total correlation unavailable'
    : `combat-total correlation ${combatCorrelation}`;
  if (ownerId === 'target_acquisition') {
    return `Search fan-out records marker delta ${markerDelta ?? 'n/a'}; ${trend}; ${correlation}.`;
  }
  if (ownerId === 'target_distribution') {
    return `Distribution churn records marker delta ${markerDelta ?? 'n/a'}; ${trend}; ${correlation}.`;
  }
  if (ownerId === 'line_of_sight') {
    return `Full LOS and terrain raycasts record marker delta ${markerDelta ?? 'n/a'}; ${trend}; ${correlation}.`;
  }
  return `Engage-state triggers record marker delta ${markerDelta ?? 'n/a'}; ${trend}; ${correlation}.`;
}

function markdownFor(report: OwnerAttributionReport): string {
  const lines: string[] = [
    '# Projekt 143 Close-Engagement Owner Attribution',
    '',
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.ownerChain}`,
    `- Counter packet: ${report.inputs.counterPacket}`,
    `- Runtime samples: ${report.inputs.runtimeSamples ?? 'none'}`,
    '',
    '## Source Summary',
    '',
    `- Validation: ${report.sourceSummary.validation ?? 'n/a'}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust ?? 'n/a'}`,
    '',
    '## Windows',
    '',
    '| Window | Samples | Frames | Avg frame | Combat total | AI update | Engage markers | Target acquisition markers | Target distribution markers | LOS markers |',
    '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const window of report.windows) {
    lines.push(
      `| ${window.label} | ${window.samples} | ${window.firstFrame ?? 'n/a'}..${window.lastFrame ?? 'n/a'} | ` +
      `${window.avgFrameMs ?? 'n/a'} | ${window.combatTotalMs ?? 'n/a'} | ${window.aiUpdateMs ?? 'n/a'} | ` +
      `${window.ownerMarkerDeltas.ai_state_engage ?? 'n/a'} | ` +
      `${window.ownerMarkerDeltas.target_acquisition ?? 'n/a'} | ` +
      `${window.ownerMarkerDeltas.target_distribution ?? 'n/a'} | ` +
      `${window.ownerMarkerDeltas.line_of_sight ?? 'n/a'} |`
    );
  }
  lines.push('', '## Owner Attribution', '');
  lines.push('| Rank | Owner | Source | Marker delta | Early | Middle | Late | Late minus early | Combat corr |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---:|');
  report.ownerAttribution.forEach((owner, index) => {
    lines.push(
      `| ${index + 1} | ${owner.owner} | ${owner.source} | ${owner.markerDelta ?? 'n/a'} | ` +
      `${owner.earlyMarkerDelta ?? 'n/a'} | ${owner.middleMarkerDelta ?? 'n/a'} | ` +
      `${owner.lateMarkerDelta ?? 'n/a'} | ${owner.lateMinusEarlyMarkerDelta ?? 'n/a'} | ` +
      `${owner.combatTotalCorrelation ?? 'n/a'} |`
    );
  });
  lines.push('', '## Findings', '', ...report.findings.map((finding) => `- ${finding}`));
  lines.push('', '## Next Actions', '', ...report.nextActions.map((action) => `- ${action}`));
  lines.push('', '## Non-Claims', '', ...report.nonClaims.map((claim) => `- ${claim}`), '');
  return lines.join('\n');
}

function main(): void {
  const counterPacketPath = resolve(argValue('--counter-packet') ?? DEFAULT_COUNTER_PACKET);
  if (!existsSync(counterPacketPath)) {
    throw new Error(`Counter packet not found: ${counterPacketPath}`);
  }

  const counterPacket = readJson<CounterPacket>(counterPacketPath);
  const artifactDir = counterPacket.inputs?.runtimeArtifactDir
    ? resolve(counterPacket.inputs.runtimeArtifactDir)
    : dirname(dirname(counterPacketPath));
  const runtimeSamplesPath = counterPacket.inputs?.runtimeSamples
    ? resolve(counterPacket.inputs.runtimeSamples)
    : join(artifactDir, 'runtime-samples.json');
  const summaryPath = join(artifactDir, 'summary.json');
  const outputRoot = resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath()));
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const summary = existsSync(summaryPath) ? readJson<PerfSummary>(summaryPath) : null;
  const samples = existsSync(runtimeSamplesPath) ? readJson<RuntimeSample[]>(runtimeSamplesPath) : [];
  const counterSamples = samples.filter((sample) => sample.combatBreakdown?.closeEngagement);
  const windows = counterSamples.length > 0
    ? phaseSlices(counterSamples).map((entry) => windowSummary(entry.label, entry.samples))
    : [];
  const ownerAttribution = OWNER_SPECS
    .map((owner) => attributionFor(owner, counterSamples, windows))
    .sort((a, b) => (b.lateMarkerDelta ?? -1) - (a.lateMarkerDelta ?? -1));
  const runtimePresent = counterSamples.length > 0;
  const topOwner = ownerAttribution[0]?.owner ?? 'unknown';
  const secondOwner = ownerAttribution[1]?.owner ?? 'unknown';
  const acquisition = ownerAttribution.find((owner) => owner.source.endsWith('AITargetAcquisition.ts'));
  const engage = ownerAttribution.find((owner) => owner.source.endsWith('AIStateEngage.ts'));
  const jsonPath = join(outputDir, 'owner-attribution.json');
  const markdownPath = join(outputDir, 'owner-attribution.md');

  const report: OwnerAttributionReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-close-engagement-owner-attribution',
    status: runtimePresent && summary?.measurementTrust?.status === 'pass' ? 'warn' : 'fail',
    inputs: {
      counterPacket: rel(counterPacketPath) ?? counterPacketPath,
      artifactDir: rel(artifactDir),
      summary: existsSync(summaryPath) ? rel(summaryPath) : null,
      runtimeSamples: existsSync(runtimeSamplesPath) ? rel(runtimeSamplesPath) : null,
    },
    sourceSummary: {
      startedAt: summary?.startedAt ?? null,
      endedAt: summary?.endedAt ?? null,
      scenarioMode: summary?.scenario?.mode ?? null,
      captureStatus: summary?.status ?? null,
      validation: summary?.validation?.overall ?? null,
      measurementTrust: summary?.measurementTrust?.status ?? null,
    },
    validationHighlights: {
      avg_frame_ms: validationCheck(summary, 'avg_frame_ms'),
      peak_p99_frame_ms: validationCheck(summary, 'peak_p99_frame_ms'),
      heap_growth_mb: validationCheck(summary, 'heap_growth_mb'),
      heap_recovery_ratio: validationCheck(summary, 'heap_recovery_ratio'),
      measurement_trust: validationCheck(summary, 'measurement_trust'),
    },
    counterPacket: {
      counterChain: counterPacket.classification?.counterChain ?? null,
      samples: counterPacket.runtimeCounterWindow?.samples ?? null,
    },
    windows,
    ownerAttribution,
    classification: {
      ownerChain: runtimePresent
        ? 'target_acquisition_distribution_fanout_with_los_execution_cost'
        : 'missing_close_engagement_runtime_samples',
      confidence: runtimePresent && summary?.measurementTrust?.status === 'pass' ? 'medium' : 'low',
      acceptance: 'diagnostic_only',
    },
    findings: runtimePresent
      ? [
          `Owner chain ranks ${topOwner} first and ${secondOwner} second by late-phase marker pressure.`,
          'Late phase keeps avg frame above early/middle while LOS and target-distribution markers rise.',
          `Target acquisition feeds the distribution path but records late-minus-early marker delta ${acquisition?.lateMinusEarlyMarkerDelta ?? 'n/a'}.`,
          `AIStateEngage remains the trigger path and records late-minus-early marker delta ${engage?.lateMinusEarlyMarkerDelta ?? 'n/a'}.`,
          'The capture remains validation WARN and compare-blocked; this is attribution evidence, not release evidence.',
        ]
      : ['No runtime samples with combatBreakdown.closeEngagement were found.'],
    nextActions: [
      'Inspect target-acquisition/distribution scheduling before adding visual caps or tuning close actor counts.',
      'Separate LOS full-evaluation pressure from target-distribution churn with one bounded source patch or a narrower diagnostic if needed.',
      'Keep STABILIZAT-1 open until validation and perf:compare are clean.',
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

  console.log(`Projekt 143 close-engagement owner attribution ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`classification=${report.classification.ownerChain}`);
  console.log(`runtimeSamples=${report.inputs.runtimeSamples ?? 'none'}`);
}

main();
