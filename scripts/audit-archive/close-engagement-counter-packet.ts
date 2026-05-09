#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

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

interface RuntimeSample {
  combatBreakdown?: {
    closeEngagement?: {
      engagement?: Record<string, number | Record<string, number> | undefined>;
      targetAcquisition?: Record<string, number>;
      targetDistribution?: Record<string, number>;
      lineOfSight?: Record<string, number>;
    };
  };
}

interface CounterWindow {
  samples: number;
  first: Record<string, number | null>;
  last: Record<string, number | null>;
  delta: Record<string, number | null>;
  phases: CounterPhaseWindow[];
}

interface CounterPhaseWindow {
  label: 'early' | 'middle' | 'late';
  samples: number;
  firstSampleIndex: number;
  lastSampleIndex: number;
  firstFrame: number | null;
  lastFrame: number | null;
  first: Record<string, number | null>;
  last: Record<string, number | null>;
  delta: Record<string, number | null>;
}

interface CounterPacket {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-close-engagement-counter-packet';
  status: CheckStatus;
  classification: {
    counterChain: 'instrumentation_landed_capture_required' | 'runtime_counter_samples_present';
    acceptance: 'diagnostic_only';
  };
  inputs: {
    runtimeArtifactDir: string | null;
    runtimeSamples: string | null;
  };
  sourceAnchors: AnchorResult[];
  testAnchors: AnchorResult[];
  runtimeCounterWindow: CounterWindow | null;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-close-engagement-counter-packet';

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'export interface CloseEngagementTelemetry',
      'closeRangeFullAutoActivations',
      'nearbyEnemyBurstTriggers',
      'suppressionTransitions',
      'targetDistanceBuckets',
      'getCloseEngagementTelemetry()',
    ],
  },
  {
    path: 'src/systems/combat/ai/AILineOfSight.ts',
    patterns: [
      'fullEvaluations',
      'terrainRaycasts',
      'fullEvaluationClear',
      'fullEvaluationBlocked',
    ],
  },
  {
    path: 'src/systems/combat/ai/AITargetAcquisition.ts',
    patterns: [
      'export interface TargetAcquisitionTelemetry',
      'potentialTargetsTotal',
      'clusterDistributionCalls',
      'nearbyEnemyCountTotal',
      'spatialQueryCacheHits',
    ],
  },
  {
    path: 'src/systems/combat/ClusterManager.ts',
    patterns: [
      'export interface TargetDistributionTelemetry',
      'targetCountRebuilds',
      'assignmentChurn',
      'targeterCountSamples',
      'getTargetDistributionTelemetry()',
    ],
  },
  {
    path: 'src/systems/combat/CombatantSystem.ts',
    patterns: [
      'this.profiler.profiling.closeEngagement',
      'this.combatantAI.getCloseEngagementTelemetry()',
      'clusterManager.getTargetDistributionTelemetry()',
      'lineOfSight: losStats',
    ],
  },
  {
    path: 'scripts/perf-capture.ts',
    patterns: [
      'closeEngagement?:',
      'closeEngagement: combatProfile.timing.closeEngagement',
      'targetDistanceBuckets',
      'fullEvaluationBlocked',
    ],
  },
];

const TEST_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/ai/AIStateEngage.test.ts',
    patterns: [
      'closeRangeFullAutoActivations',
      'nearbyEnemyBurstTriggers',
      'suppressionTransitions',
    ],
  },
  {
    path: 'src/systems/combat/ai/AILineOfSight.test.ts',
    patterns: [
      'fullEvaluations',
      'terrainRaycasts',
      'fullEvaluationClear',
    ],
  },
  {
    path: 'src/systems/combat/ai/AITargetAcquisition.test.ts',
    patterns: [
      'potentialTargetsTotal',
      'nearbyEnemyCountTotal',
      'spatialQueryCacheHits',
    ],
  },
  {
    path: 'src/systems/combat/ClusterManager.test.ts',
    patterns: [
      'records distribution telemetry and reassignment churn',
      'assignmentChurn',
      'targeterCountSamples',
    ],
  },
];

const RUNTIME_COUNTER_PATHS = [
  'combatBreakdown.closeEngagement.engagement.closeRangeFullAutoActivations',
  'combatBreakdown.closeEngagement.engagement.nearbyEnemyBurstTriggers',
  'combatBreakdown.closeEngagement.engagement.suppressionTransitions',
  'combatBreakdown.closeEngagement.engagement.nearbyEnemyCountSamples',
  'combatBreakdown.closeEngagement.engagement.nearbyEnemyCountTotal',
  'combatBreakdown.closeEngagement.engagement.nearbyEnemyCountMax',
  'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.lt5m',
  'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.m5to10',
  'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.m10to15',
  'combatBreakdown.closeEngagement.engagement.targetDistanceBuckets.m15to30',
  'combatBreakdown.closeEngagement.targetAcquisition.clusterDistributionCalls',
  'combatBreakdown.closeEngagement.targetAcquisition.nearbyEnemyCountCalls',
  'combatBreakdown.closeEngagement.targetAcquisition.nearbyEnemyCountTotal',
  'combatBreakdown.closeEngagement.targetDistribution.assignmentChurn',
  'combatBreakdown.closeEngagement.lineOfSight.fullEvaluations',
  'combatBreakdown.closeEngagement.lineOfSight.terrainRaycasts',
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

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function findLine(lines: string[], pattern: string): { line: number | null; text: string | null } {
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index < 0) return { line: null, text: null };
  return { line: index + 1, text: lines[index].trim() };
}

function collectAnchors(specs: AnchorSpec[]): AnchorResult[] {
  return specs.map((spec) => {
    const absolute = join(process.cwd(), spec.path);
    const present = existsSync(absolute);
    const lines = present ? readFileSync(absolute, 'utf-8').split(/\r?\n/) : [];
    return {
      path: spec.path,
      present,
      anchors: spec.patterns.map((pattern) => ({
        pattern,
        ...findLine(lines, pattern),
      })),
    };
  });
}

function numberAt(source: unknown, path: string): number | null {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasAllAnchors(groups: AnchorResult[]): boolean {
  return groups.every((group) => group.present && group.anchors.every((anchor) => anchor.line !== null));
}

function counterValues(sample: RuntimeSample): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const path of RUNTIME_COUNTER_PATHS) {
    values[path] = numberAt(sample, path);
  }
  return values;
}

function counterDelta(
  first: Record<string, number | null>,
  last: Record<string, number | null>
): Record<string, number | null> {
  const delta: Record<string, number | null> = {};
  for (const path of RUNTIME_COUNTER_PATHS) {
    delta[path] = first[path] === null || last[path] === null
      ? null
      : Math.max(0, (last[path] ?? 0) - (first[path] ?? 0));
  }
  return delta;
}

function frameOf(sample: RuntimeSample): number | null {
  return numberAt(sample, 'frameCount');
}

function phaseWindows(samples: RuntimeSample[]): CounterPhaseWindow[] {
  const labels: CounterPhaseWindow['label'][] = ['early', 'middle', 'late'];
  return labels.map((label, index) => {
    const start = Math.floor((samples.length * index) / labels.length);
    const endExclusive = index === labels.length - 1
      ? samples.length
      : Math.floor((samples.length * (index + 1)) / labels.length);
    const slice = samples.slice(start, Math.max(start + 1, endExclusive));
    const firstSample = slice[0] ?? samples[start];
    const lastSample = slice[slice.length - 1] ?? firstSample;
    const first = counterValues(firstSample);
    const last = counterValues(lastSample);
    return {
      label,
      samples: slice.length,
      firstSampleIndex: start,
      lastSampleIndex: start + slice.length - 1,
      firstFrame: frameOf(firstSample),
      lastFrame: frameOf(lastSample),
      first,
      last,
      delta: counterDelta(first, last),
    };
  });
}

function runtimeWindow(samplesPath: string | null): CounterWindow | null {
  if (!samplesPath || !existsSync(samplesPath)) return null;
  const samples = readJson<RuntimeSample[]>(samplesPath)
    .filter((sample) => sample.combatBreakdown?.closeEngagement);
  if (samples.length === 0) return null;
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const first = counterValues(firstSample);
  const last = counterValues(lastSample);
  return {
    samples: samples.length,
    first,
    last,
    delta: counterDelta(first, last),
    phases: phaseWindows(samples),
  };
}

function markdownFor(packet: CounterPacket): string {
  const lines: string[] = [
    '# Projekt 143 Close-Engagement Counter Packet',
    '',
    `- Status: ${packet.status}`,
    `- Classification: ${packet.classification.counterChain}`,
    `- Runtime artifact: ${packet.inputs.runtimeArtifactDir ?? 'none'}`,
    `- Runtime samples: ${packet.inputs.runtimeSamples ?? 'none'}`,
    '',
    '## Source Anchors',
    '',
  ];
  for (const group of packet.sourceAnchors) {
    lines.push(`### ${group.path}`, '');
    for (const anchor of group.anchors) {
      lines.push(`- ${anchor.line ?? 'missing'} - ${anchor.pattern}`);
    }
    lines.push('');
  }
  lines.push('## Test Anchors', '');
  for (const group of packet.testAnchors) {
    lines.push(`### ${group.path}`, '');
    for (const anchor of group.anchors) {
      lines.push(`- ${anchor.line ?? 'missing'} - ${anchor.pattern}`);
    }
    lines.push('');
  }
  if (packet.runtimeCounterWindow) {
    lines.push('## Runtime Counter Window', '', '| Counter | First | Last | Delta |', '|---|---:|---:|---:|');
    for (const path of RUNTIME_COUNTER_PATHS) {
      lines.push(
        `| ${path} | ${packet.runtimeCounterWindow.first[path] ?? 'n/a'} | ` +
        `${packet.runtimeCounterWindow.last[path] ?? 'n/a'} | ${packet.runtimeCounterWindow.delta[path] ?? 'n/a'} |`
      );
    }
    lines.push('');
    lines.push('## Runtime Phase Deltas', '');
    for (const phase of packet.runtimeCounterWindow.phases) {
      lines.push(
        `### ${phase.label}`,
        '',
        `- Samples: ${phase.samples}`,
        `- Sample indexes: ${phase.firstSampleIndex}..${phase.lastSampleIndex}`,
        `- Frames: ${phase.firstFrame ?? 'n/a'}..${phase.lastFrame ?? 'n/a'}`,
        '',
        '| Counter | Delta |',
        '|---|---:|'
      );
      for (const path of RUNTIME_COUNTER_PATHS) {
        lines.push(`| ${path} | ${phase.delta[path] ?? 'n/a'} |`);
      }
      lines.push('');
    }
  }
  lines.push('## Findings', '', ...packet.findings.map((finding) => `- ${finding}`));
  lines.push('', '## Next Actions', '', ...packet.nextActions.map((action) => `- ${action}`));
  lines.push('', '## Non-Claims', '', ...packet.nonClaims.map((claim) => `- ${claim}`), '');
  return lines.join('\n');
}

function main(): void {
  const outputRoot = resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath()));
  const runtimeArtifactArg = argValue('--artifact');
  const runtimeArtifactDir = runtimeArtifactArg ? resolve(runtimeArtifactArg) : null;
  const runtimeSamples = runtimeArtifactDir ? join(runtimeArtifactDir, 'runtime-samples.json') : null;
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'counter-packet.json');
  const markdownPath = join(outputDir, 'counter-packet.md');

  const sourceAnchors = collectAnchors(SOURCE_SPECS);
  const testAnchors = collectAnchors(TEST_SPECS);
  const counterWindow = runtimeWindow(runtimeSamples);
  const sourceComplete = hasAllAnchors(sourceAnchors);
  const testComplete = hasAllAnchors(testAnchors);
  const runtimePresent = counterWindow !== null;

  const packet: CounterPacket = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-close-engagement-counter-packet',
    status: sourceComplete && testComplete ? 'warn' : 'fail',
    classification: {
      counterChain: runtimePresent ? 'runtime_counter_samples_present' : 'instrumentation_landed_capture_required',
      acceptance: 'diagnostic_only',
    },
    inputs: {
      runtimeArtifactDir: rel(runtimeArtifactDir),
      runtimeSamples: rel(runtimeSamples),
    },
    sourceAnchors,
    testAnchors,
    runtimeCounterWindow: counterWindow,
    findings: [
      sourceComplete
        ? 'Runtime counter plumbing is present in source and perf-capture serialization.'
        : 'Runtime counter plumbing has missing source anchors.',
      testComplete
        ? 'Targeted tests cover the new close-engagement, LOS, target-acquisition, and target-distribution counters.'
        : 'Targeted test anchors are incomplete.',
      runtimePresent
        ? 'A runtime capture includes close-engagement counter samples and phase-window deltas.'
        : 'No runtime capture with close-engagement counter samples was supplied; the next combat120 capture must prove counter deltas under load.',
    ],
    nextActions: [
      'Run a trusted combat120 capture with the counter build and analyze early/middle/late counter deltas.',
      'Use counter deltas to separate close-range engage ladder, LOS full-evaluation pressure, and target-distribution churn before tuning.',
      'Keep STABILIZAT-1 open until perf:compare is clean and baseline thresholds are met.',
    ],
    nonClaims: [
      'This packet does not prove a runtime performance fix.',
      'This packet does not authorize perf-baselines.json refresh.',
      'This packet does not close DEFEKT-3 or STABILIZAT-1.',
    ],
    files: {
      summary: rel(jsonPath) ?? jsonPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  writeFileSync(markdownPath, markdownFor(packet));

  console.log(`Projekt 143 close-engagement counter packet ${packet.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`classification=${packet.classification.counterChain}`);
  console.log(`runtimeSamples=${packet.inputs.runtimeSamples ?? 'none'}`);
}

main();
