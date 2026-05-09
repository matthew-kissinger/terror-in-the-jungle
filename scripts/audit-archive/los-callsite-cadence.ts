#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type WindowLabel = 'early' | 'middle' | 'late';

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
  frameCount?: number;
  avgFrameMs?: number;
  combatBreakdown?: {
    closeEngagement?: {
      losCallsites?: Record<string, Record<string, number | undefined>>;
    };
  };
}

interface LosDistributionPacket {
  inputs?: {
    runtimeSamples?: string | null;
  };
  sourceSummary?: {
    validation?: string | null;
    measurementTrust?: string | null;
  };
  correlations?: {
    losExecutionVsDistributionSchedulingDelta?: number | null;
  };
}

interface CallsiteDelta {
  calls: number | null;
  visible: number | null;
  blocked: number | null;
}

interface CallsiteWindow {
  label: WindowLabel;
  samples: number;
  firstFrame: number | null;
  lastFrame: number | null;
  avgFrameMs: number | null;
  deltas: Record<string, CallsiteDelta>;
}

interface LosCallsiteCadenceReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-los-callsite-cadence';
  status: CheckStatus;
  inputs: {
    losDistributionSeparation: string | null;
    runtimeSamples: string | null;
  };
  sourceSummary: {
    priorValidation: string | null;
    priorMeasurementTrust: string | null;
    priorLosDistributionCorrelation: number | null;
  };
  sourceAnchors: AnchorResult[];
  runtimeCallsiteWindows: CallsiteWindow[] | null;
  classification: {
    callsiteChain: 'state_handler_callsite_instrumentation_landed_capture_required' | 'runtime_callsite_cadence_present' | 'source_anchor_missing';
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

const OUTPUT_NAME = 'projekt-143-los-callsite-cadence';
const DEFAULT_LOS_DISTRIBUTION = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T08-39-12-950Z',
  'projekt-143-los-distribution-separation',
  'separation.json',
);

const CALLSITES = [
  'patrolDetection',
  'alertConfirmation',
  'engageSuppressionCheck',
  'advancingDetection',
  'seekingCoverValidation',
  'defendDetection',
] as const;

const SOURCE_SPECS: AnchorSpec[] = [
  {
    path: 'src/systems/combat/CombatantAI.ts',
    patterns: [
      'export type LosCallsiteName',
      'getLosCallsiteTelemetry()',
      'private canSeeTargetForCallsite(',
      'this.canSeeTargetForPatrolDetection',
      'this.canSeeTargetForAlertConfirmation',
      'this.canSeeTargetForEngageSuppressionCheck',
      'this.canSeeTargetForAdvancingDetection',
      'this.canSeeTargetForSeekingCoverValidation',
      'this.canSeeTargetForDefendDetection',
    ],
  },
  {
    path: 'src/systems/combat/CombatantSystem.ts',
    patterns: [
      'losCallsites: this.combatantAI.getLosCallsiteTelemetry()',
    ],
  },
  {
    path: 'src/systems/combat/CombatantProfiler.ts',
    patterns: [
      'losCallsites: LosCallsiteTelemetry',
      'patrolDetection: { calls: 0, visible: 0, blocked: 0 }',
    ],
  },
  {
    path: 'scripts/perf-capture.ts',
    patterns: [
      'losCallsites?: Record<string, Record<string, number>>',
      'combatProfile.timing.closeEngagement.losCallsites',
    ],
  },
  {
    path: 'src/systems/combat/CombatantAI.test.ts',
    patterns: [
      'should record state-handler visibility callbacks by callsite',
      'engageSuppressionCheck: { calls: 1, visible: 0, blocked: 1 }',
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
  if (!path) return null;
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

function parseArgs(): {
  losDistribution: string | null;
  runtimeSamples: string | null;
  outputRoot: string | null;
} {
  const args = process.argv.slice(2);
  let losDistribution: string | null = DEFAULT_LOS_DISTRIBUTION;
  let runtimeSamples: string | null = null;
  let outputRoot: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--los-distribution') {
      losDistribution = resolve(args[++i]);
    } else if (arg === '--runtime-samples') {
      runtimeSamples = resolve(args[++i]);
    } else if (arg === '--output-root') {
      outputRoot = resolve(args[++i]);
    }
  }

  return { losDistribution, runtimeSamples, outputRoot };
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function findAnchors(spec: AnchorSpec): AnchorResult {
  const fullPath = join(process.cwd(), spec.path);
  if (!existsSync(fullPath)) {
    return {
      path: spec.path,
      present: false,
      anchors: spec.patterns.map(pattern => ({ pattern, line: null, text: null })),
    };
  }

  const lines = readFileSync(fullPath, 'utf-8').split(/\r?\n/);
  const anchors = spec.patterns.map(pattern => {
    const index = lines.findIndex(line => line.includes(pattern));
    return {
      pattern,
      line: index >= 0 ? index + 1 : null,
      text: index >= 0 ? lines[index].trim() : null,
    };
  });

  return {
    path: spec.path,
    present: anchors.every(anchor => anchor.line != null),
    anchors,
  };
}

function numberOrNull(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function hasCallsiteTelemetry(sample: RuntimeSample): boolean {
  const callsites = sample.combatBreakdown?.closeEngagement?.losCallsites;
  return !!callsites && CALLSITES.some(callsite => typeof callsites[callsite]?.calls === 'number');
}

function avg(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(2));
}

function delta(first: RuntimeSample, last: RuntimeSample, callsite: string, metric: keyof CallsiteDelta): number | null {
  const firstValue = numberOrNull(first.combatBreakdown?.closeEngagement?.losCallsites?.[callsite]?.[metric]);
  const lastValue = numberOrNull(last.combatBreakdown?.closeEngagement?.losCallsites?.[callsite]?.[metric]);
  if (firstValue == null || lastValue == null) return null;
  return lastValue - firstValue;
}

function summarizeRuntimeWindows(samples: RuntimeSample[]): CallsiteWindow[] | null {
  const withCallsites = samples.filter(hasCallsiteTelemetry);
  if (withCallsites.length < 2) return null;

  const windowSize = Math.max(1, Math.floor(withCallsites.length / 3));
  const windows: Array<{ label: WindowLabel; samples: RuntimeSample[] }> = [
    { label: 'early', samples: withCallsites.slice(0, windowSize) },
    { label: 'middle', samples: withCallsites.slice(windowSize, windowSize * 2) },
    { label: 'late', samples: withCallsites.slice(windowSize * 2) },
  ].filter(window => window.samples.length >= 2);

  return windows.map(window => {
    const first = window.samples[0];
    const last = window.samples[window.samples.length - 1];
    return {
      label: window.label,
      samples: window.samples.length,
      firstFrame: numberOrNull(first.frameCount),
      lastFrame: numberOrNull(last.frameCount),
      avgFrameMs: avg(window.samples.map(sample => numberOrNull(sample.avgFrameMs))),
      deltas: Object.fromEntries(
        CALLSITES.map(callsite => [
          callsite,
          {
            calls: delta(first, last, callsite, 'calls'),
            visible: delta(first, last, callsite, 'visible'),
            blocked: delta(first, last, callsite, 'blocked'),
          },
        ]),
      ),
    };
  });
}

function renderMarkdown(report: LosCallsiteCadenceReport): string {
  const windowLines = report.runtimeCallsiteWindows
    ? report.runtimeCallsiteWindows.map(window => {
        const deltas = CALLSITES
          .map(callsite => `${callsite}=${window.deltas[callsite]?.calls ?? 'n/a'}`)
          .join(', ');
        return `- ${window.label}: samples ${window.samples}, frame ${window.firstFrame ?? 'n/a'} -> ${window.lastFrame ?? 'n/a'}, avg ${window.avgFrameMs ?? 'n/a'}ms, call deltas ${deltas}`;
      })
    : ['- No runtime samples contain `combatBreakdown.closeEngagement.losCallsites`; capture is required.'];

  return [
    '# Projekt Objekt-143 LOS Callsite Cadence',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Classification: ${report.classification.callsiteChain}`,
    '',
    '## Inputs',
    `- LOS/distribution packet: ${report.inputs.losDistributionSeparation ?? 'n/a'}`,
    `- Runtime samples: ${report.inputs.runtimeSamples ?? 'n/a'}`,
    '',
    '## Runtime Windows',
    ...windowLines,
    '',
    '## Findings',
    ...report.findings.map(finding => `- ${finding}`),
    '',
    '## Next Actions',
    ...report.nextActions.map(action => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map(claim => `- ${claim}`),
    '',
  ].join('\n');
}

function lateWindowDominantCallsites(runtimeCallsiteWindows: CallsiteWindow[] | null): string[] {
  const lateWindow = runtimeCallsiteWindows?.find(window => window.label === 'late');
  if (!lateWindow) return [];

  return Object.entries(lateWindow.deltas)
    .map(([callsite, delta]) => ({ callsite, calls: delta.calls ?? 0 }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 3)
    .map(entry => `${entry.callsite}=${entry.calls}`);
}

function main(): void {
  const args = parseArgs();
  const losDistribution = readJson<LosDistributionPacket>(args.losDistribution);
  const runtimeSamplesPath = args.runtimeSamples
    ?? (losDistribution?.inputs?.runtimeSamples ? resolve(losDistribution.inputs.runtimeSamples) : null);
  const runtimeSamples = readJson<RuntimeSample[]>(runtimeSamplesPath) ?? [];
  const sourceAnchors = SOURCE_SPECS.map(findAnchors);
  const runtimeCallsiteWindows = summarizeRuntimeWindows(runtimeSamples);
  const sourceAnchorsPass = sourceAnchors.every(anchor => anchor.present);

  const outputRoot = args.outputRoot ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath());
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const classification = !sourceAnchorsPass
    ? 'source_anchor_missing'
    : runtimeCallsiteWindows
      ? 'runtime_callsite_cadence_present'
      : 'state_handler_callsite_instrumentation_landed_capture_required';

  const findings = [
    'CombatantAI now exposes six explicit LOS callsite buckets for patrol detection, alert confirmation, engage suppression checks, advancing detection, cover validation, and zone defense detection.',
    'CombatantSystem and perf-capture now place the callsite buckets under `combatBreakdown.closeEngagement.losCallsites`.',
    runtimeCallsiteWindows
      ? 'The runtime sample chain contains callsite counters and can rank state-handler cadence by window.'
      : 'The consumed runtime sample chain predates the new callsite counters; it cannot yet rank callsite cadence.',
  ];
  const dominantLateCallsites = lateWindowDominantCallsites(runtimeCallsiteWindows);
  if (dominantLateCallsites.length > 0) {
    findings.push(`Late-window dominant LOS callsite deltas are ${dominantLateCallsites.join(', ')}.`);
  }
  const nextActions = runtimeCallsiteWindows
    ? [
        'Treat `engageSuppressionCheck` cadence as the first bounded source target and `patrolDetection` fanout as the second; do not tune both in one packet.',
        'If changing cadence, run combat120 again and rerun this sidecar against the fresh `runtime-samples.json` before comparing baselines.',
        'Keep STABILIZAT-1 baseline refresh blocked until the standard capture and `perf:compare -- --scenario combat120` are clean.',
      ]
    : [
        'Run a fresh `npm run perf:capture:combat120` so runtime samples contain `losCallsites`.',
        'Rerun `npm run check:projekt-143-los-callsite-cadence -- --runtime-samples <fresh artifact>/runtime-samples.json` and compare late-window callsite deltas before tuning.',
        'Keep STABILIZAT-1 baseline refresh blocked until the standard capture and `perf:compare -- --scenario combat120` are clean.',
      ];

  const report: LosCallsiteCadenceReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-los-callsite-cadence',
    status: sourceAnchorsPass ? 'warn' : 'fail',
    inputs: {
      losDistributionSeparation: rel(args.losDistribution),
      runtimeSamples: rel(runtimeSamplesPath),
    },
    sourceSummary: {
      priorValidation: losDistribution?.sourceSummary?.validation ?? null,
      priorMeasurementTrust: losDistribution?.sourceSummary?.measurementTrust ?? null,
      priorLosDistributionCorrelation: losDistribution?.correlations?.losExecutionVsDistributionSchedulingDelta ?? null,
    },
    sourceAnchors,
    runtimeCallsiteWindows,
    classification: {
      callsiteChain: classification,
      acceptance: 'diagnostic_only',
    },
    findings,
    nextActions,
    nonClaims: [
      'This packet does not tune combat AI.',
      'This packet does not authorize a combat120 baseline refresh.',
      'This packet does not certify the close-actor visual cap or human playtest acceptance.',
    ],
    files: {
      summary: rel(join(outputDir, 'callsite-cadence.json')) ?? '',
      markdown: rel(join(outputDir, 'callsite-cadence.md')) ?? '',
    },
  };

  writeFileSync(join(outputDir, 'callsite-cadence.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(outputDir, 'callsite-cadence.md'), renderMarkdown(report), 'utf-8');

  console.log(JSON.stringify({
    status: report.status,
    classification: report.classification.callsiteChain,
    summary: report.files.summary,
    markdown: report.files.markdown,
  }, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
