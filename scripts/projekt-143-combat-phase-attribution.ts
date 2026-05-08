#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

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
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  renderer?: {
    drawCalls?: number;
    triangles?: number;
  };
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    billboardUpdateMs?: number;
    aiStateMs?: Record<string, number>;
  };
}

interface CounterSpec {
  id: string;
  label: string;
  path: string;
  unit: string;
}

interface WindowSummary {
  name: string;
  sampleStart: number;
  sampleEnd: number;
  sampleCount: number;
  avgFrameMs: number | null;
  p99FrameMs: number | null;
  renderer: {
    drawCalls: number | null;
    triangles: number | null;
  };
  combat: {
    totalMs: number | null;
    aiUpdateMs: number | null;
    billboardUpdateMs: number | null;
    aiStateMs: Record<string, number | null>;
  };
  engagement: {
    nearestOpforDistance: number | null;
    currentTargetDistance: number | null;
  };
  counters: Record<string, {
    first: number | null;
    last: number | null;
    delta: number | null;
    deltaPerSample: number | null;
    unit: string;
  }>;
}

interface CorrelationSummary {
  metric: string;
  value: number | null;
  interpretation: string;
}

interface CombatPhaseAttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-combat-phase-attribution';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    priorAvgFrameSidecar: string | null;
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
  windows: WindowSummary[];
  correlations: CorrelationSummary[];
  classification: {
    combatPhaseOwner: string;
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

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-combat-phase-attribution';

const COUNTERS: CounterSpec[] = [
  { id: 'shots', label: 'Player shots', path: 'shotsThisSession', unit: 'shots' },
  { id: 'hits', label: 'Player hits', path: 'hitsThisSession', unit: 'hits' },
  { id: 'kills', label: 'Harness kills', path: 'harnessDriver.kills', unit: 'kills' },
  { id: 'damageTaken', label: 'Harness damage taken', path: 'harnessDriver.damageTaken', unit: 'damage' },
  { id: 'losMisses', label: 'LOS misses', path: 'combatBreakdown.losCache.misses', unit: 'queries' },
  { id: 'losHits', label: 'LOS hits', path: 'combatBreakdown.losCache.hits', unit: 'queries' },
  { id: 'raycastRequests', label: 'LOS raycast requests', path: 'combatBreakdown.raycastBudget.totalRequested', unit: 'queries' },
  { id: 'fireRaycastRequests', label: 'Fire raycast requests', path: 'combatBreakdown.combatFireRaycastBudget.totalRequested', unit: 'queries' },
  { id: 'npcMovementSamples', label: 'NPC movement samples', path: 'movement.npc.samples', unit: 'samples' },
  { id: 'npcLowProgress', label: 'NPC low-progress events', path: 'movement.npc.lowProgressEvents', unit: 'events' },
  { id: 'npcBacktracks', label: 'NPC backtrack activations', path: 'movement.npc.backtrackActivations', unit: 'events' },
  { id: 'aiBudgetExceeded', label: 'AI budget exceeded events', path: 'combatBreakdown.aiScheduling.aiBudgetExceededEvents', unit: 'events' },
];

const AI_STATES = [
  'patrolling',
  'alert',
  'engaging',
  'suppressing',
  'advancing',
  'seeking_cover',
  'defending',
  'retreating',
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

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function findLatestPerfArtifact(mode: string | null): string {
  if (!existsSync(ARTIFACT_ROOT)) throw new Error(`Missing artifact root ${ARTIFACT_ROOT}`);
  const candidates = readdirSync(ARTIFACT_ROOT)
    .map((name) => join(ARTIFACT_ROOT, name))
    .filter((path) => statSync(path).isDirectory())
    .filter((path) => existsSync(join(path, 'summary.json')) && existsSync(join(path, 'runtime-samples.json')))
    .map((path) => ({ path, summary: readJson<PerfSummary>(join(path, 'summary.json')) }))
    .filter((entry) => entry.summary.status === 'ok')
    .filter((entry) => !mode || entry.summary.scenario?.mode === mode)
    .sort((a, b) => String(b.summary.startedAt ?? '').localeCompare(String(a.summary.startedAt ?? '')));
  const latest = candidates[0];
  if (!latest) throw new Error(`No perf capture artifact found for mode ${mode ?? '(any)'}`);
  return latest.path;
}

function numberAt(source: unknown, path: string): number | null {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = finiteNumbers(values);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function maximum(values: Array<number | null | undefined>): number | null {
  const finite = finiteNumbers(values);
  return finite.length > 0 ? Math.max(...finite) : null;
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

function counterDelta(samples: RuntimeSample[], spec: CounterSpec): number | null {
  if (samples.length < 2) return null;
  const first = numberAt(samples[0], spec.path);
  const last = numberAt(samples[samples.length - 1], spec.path);
  if (first === null || last === null) return null;
  return Math.max(0, last - first);
}

function sampleDeltas(samples: RuntimeSample[], path: string): Array<number | null> {
  const deltas: Array<number | null> = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = numberAt(samples[index - 1], path);
    const current = numberAt(samples[index], path);
    deltas.push(previous === null || current === null ? null : Math.max(0, current - previous));
  }
  return deltas;
}

function windowSlices(samples: RuntimeSample[]): Array<{ name: string; samples: RuntimeSample[]; start: number; end: number }> {
  const third = Math.floor(samples.length / 3);
  return [
    { name: 'early', samples: samples.slice(0, third), start: 0, end: third - 1 },
    { name: 'middle', samples: samples.slice(third, third * 2), start: third, end: third * 2 - 1 },
    { name: 'late', samples: samples.slice(third * 2), start: third * 2, end: samples.length - 1 },
  ].filter((entry) => entry.samples.length > 0);
}

function summarizeWindow(name: string, samples: RuntimeSample[], start: number, end: number): WindowSummary {
  const counters: WindowSummary['counters'] = {};
  for (const spec of COUNTERS) {
    const first = numberAt(samples[0], spec.path);
    const last = numberAt(samples[samples.length - 1], spec.path);
    const delta = counterDelta(samples, spec);
    counters[spec.id] = {
      first: round(first),
      last: round(last),
      delta: round(delta),
      deltaPerSample: round(delta === null ? null : delta / Math.max(1, samples.length - 1), 3),
      unit: spec.unit,
    };
  }

  const aiStateMs: Record<string, number | null> = {};
  for (const state of AI_STATES) {
    aiStateMs[state] = round(average(samples.map((sample) => sample.combatBreakdown?.aiStateMs?.[state])));
  }

  return {
    name,
    sampleStart: start,
    sampleEnd: end,
    sampleCount: samples.length,
    avgFrameMs: round(average(samples.map((sample) => sample.avgFrameMs))),
    p99FrameMs: round(average(samples.map((sample) => sample.p99FrameMs))),
    renderer: {
      drawCalls: round(average(samples.map((sample) => sample.renderer?.drawCalls))),
      triangles: round(average(samples.map((sample) => sample.renderer?.triangles)), 0),
    },
    combat: {
      totalMs: round(average(samples.map((sample) => sample.combatBreakdown?.totalMs))),
      aiUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.aiUpdateMs))),
      billboardUpdateMs: round(average(samples.map((sample) => sample.combatBreakdown?.billboardUpdateMs))),
      aiStateMs,
    },
    engagement: {
      nearestOpforDistance: round(average(samples.map((sample) => numberAt(sample, 'harnessDriver.nearestOpforDistance')))),
      currentTargetDistance: round(average(samples.map((sample) => numberAt(sample, 'harnessDriver.currentTargetDistance')))),
    },
    counters,
  };
}

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function buildCorrelations(samples: RuntimeSample[]): CorrelationSummary[] {
  const avgFrames = samples.map((sample) => sample.avgFrameMs);
  const avgFramesForDeltas = samples.slice(1).map((sample) => sample.avgFrameMs);
  const raw: CorrelationSummary[] = [
    {
      metric: 'shots_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'shotsThisSession')), 3),
      interpretation: 'positive means player fire cadence tracks frame cost',
    },
    {
      metric: 'damage_taken_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'harnessDriver.damageTaken')), 3),
      interpretation: 'positive means close incoming fire pressure tracks frame cost',
    },
    {
      metric: 'los_miss_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'combatBreakdown.losCache.misses')), 3),
      interpretation: 'positive means LOS miss/raycast pressure tracks frame cost',
    },
    {
      metric: 'los_hit_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'combatBreakdown.losCache.hits')), 3),
      interpretation: 'negative here means clear LOS work is not the late owner',
    },
    {
      metric: 'fire_raycast_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'combatBreakdown.combatFireRaycastBudget.totalRequested')), 3),
      interpretation: 'near zero means shot validation raycasts do not dominate the rise',
    },
    {
      metric: 'npc_movement_delta_per_sample',
      value: round(pearson(avgFramesForDeltas, sampleDeltas(samples, 'movement.npc.samples')), 3),
      interpretation: 'negative means movement volume does not explain the late rise',
    },
    {
      metric: 'current_target_distance',
      value: round(pearson(avgFrames, samples.map((sample) => numberAt(sample, 'harnessDriver.currentTargetDistance'))), 3),
      interpretation: 'negative means closer target range tracks higher frame cost',
    },
    {
      metric: 'nearest_opfor_distance',
      value: round(pearson(avgFrames, samples.map((sample) => numberAt(sample, 'harnessDriver.nearestOpforDistance'))), 3),
      interpretation: 'negative means close-contact density tracks higher frame cost',
    },
    {
      metric: 'combat_total_ms',
      value: round(pearson(avgFrames, samples.map((sample) => sample.combatBreakdown?.totalMs)), 3),
      interpretation: 'positive means Combat timing still tracks the frame rise',
    },
    {
      metric: 'ai_update_ms',
      value: round(pearson(avgFrames, samples.map((sample) => sample.combatBreakdown?.aiUpdateMs)), 3),
      interpretation: 'positive means AI update remains a contributing owner',
    },
    {
      metric: 'renderer_draw_calls',
      value: round(pearson(avgFrames, samples.map((sample) => sample.renderer?.drawCalls)), 3),
      interpretation: 'negative means scene draw growth does not explain the late rise',
    },
  ];
  return raw.sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));
}

function classify(windows: WindowSummary[], correlations: CorrelationSummary[]): CombatPhaseAttributionReport['classification'] {
  const early = windows.find((window) => window.name === 'early');
  const late = windows.find((window) => window.name === 'late');
  const corr = (metric: string) => correlations.find((entry) => entry.metric === metric)?.value ?? null;
  const avgRise = (late?.avgFrameMs ?? 0) - (early?.avgFrameMs ?? 0);
  const drawDelta = (late?.renderer.drawCalls ?? 0) - (early?.renderer.drawCalls ?? 0);
  const shotsCorr = corr('shots_delta_per_sample') ?? 0;
  const distanceCorr = corr('current_target_distance') ?? 0;
  const movementCorr = corr('npc_movement_delta_per_sample') ?? 0;
  if (avgRise >= 4 && drawDelta < 0 && shotsCorr >= 0.5 && distanceCorr <= -0.4 && movementCorr < 0) {
    return {
      combatPhaseOwner: 'late_close_engagement_pressure_not_renderer_or_movement_volume',
      confidence: 'high',
      acceptance: 'diagnostic_only',
    };
  }
  if (avgRise >= 2 && shotsCorr >= 0.3) {
    return {
      combatPhaseOwner: 'probable_late_engagement_pressure',
      confidence: 'medium',
      acceptance: 'diagnostic_only',
    };
  }
  return {
    combatPhaseOwner: 'unclassified_combat_phase_pressure',
    confidence: 'low',
    acceptance: 'diagnostic_only',
  };
}

function formatValue(value: number | null, suffix = ''): string {
  return value === null ? 'n/a' : `${value}${suffix}`;
}

function markdownFor(report: CombatPhaseAttributionReport): string {
  const lines: string[] = [
    '# Projekt 143 Combat-Phase Attribution',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Capture validation: ${report.sourceSummary.validation ?? 'n/a'}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust ?? 'n/a'}`,
    `- Classification: ${report.classification.combatPhaseOwner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Windows',
    '',
    '| Window | Avg frame ms | Combat total ms | AI update ms | Draw calls | Target m | Shots delta | Damage delta | LOS miss delta | NPC movement delta |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const window of report.windows) {
    lines.push(
      `| ${window.name} | ${formatValue(window.avgFrameMs)} | ${formatValue(window.combat.totalMs)} | ` +
      `${formatValue(window.combat.aiUpdateMs)} | ${formatValue(window.renderer.drawCalls)} | ` +
      `${formatValue(window.engagement.currentTargetDistance)} | ${formatValue(window.counters.shots?.delta ?? null)} | ` +
      `${formatValue(window.counters.damageTaken?.delta ?? null)} | ${formatValue(window.counters.losMisses?.delta ?? null)} | ` +
      `${formatValue(window.counters.npcMovementSamples?.delta ?? null)} |`,
    );
  }
  lines.push('', '## AI State Timing', '', '| Window | Patrolling | Engaging | Seeking cover | Suppressing |', '|---|---:|---:|---:|---:|');
  for (const window of report.windows) {
    lines.push(
      `| ${window.name} | ${formatValue(window.combat.aiStateMs.patrolling)} | ` +
      `${formatValue(window.combat.aiStateMs.engaging)} | ${formatValue(window.combat.aiStateMs.seeking_cover)} | ` +
      `${formatValue(window.combat.aiStateMs.suppressing)} |`,
    );
  }
  lines.push('', '## Correlations', '', '| Metric | r | Interpretation |', '|---|---:|---|');
  for (const entry of report.correlations) {
    lines.push(`| ${entry.metric} | ${formatValue(entry.value)} | ${entry.interpretation} |`);
  }
  lines.push('', '## Findings', '', ...report.findings.map((finding) => `- ${finding}`));
  lines.push('', '## Next Actions', '', ...report.nextActions.map((action) => `- ${action}`));
  lines.push('', '## Non-Claims', '', ...report.nonClaims.map((claim) => `- ${claim}`));
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const explicitArtifact = argValue('--artifact');
  const artifactDir = explicitArtifact ? resolve(explicitArtifact) : findLatestPerfArtifact('ai_sandbox');
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  if (samples.length < 9) throw new Error(`Need at least 9 runtime samples for phase attribution; got ${samples.length}`);

  const slices = windowSlices(samples);
  const windows = slices.map((slice) => summarizeWindow(slice.name, slice.samples, slice.start, slice.end));
  const correlations = buildCorrelations(samples);
  const classification = classify(windows, correlations);
  const early = windows.find((window) => window.name === 'early');
  const late = windows.find((window) => window.name === 'late');
  const corr = (metric: string) => correlations.find((entry) => entry.metric === metric)?.value ?? null;
  const priorAvgFrameSidecarPath = join(artifactDir, 'projekt-143-avg-frame-attribution', 'avg-frame-attribution.json');

  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'combat-phase-attribution.json');
  const markdownPath = join(outputDir, 'combat-phase-attribution.md');

  const report: CombatPhaseAttributionReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-combat-phase-attribution',
    status: 'warn',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      priorAvgFrameSidecar: existsSync(priorAvgFrameSidecarPath) ? rel(priorAvgFrameSidecarPath) : null,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      aiBudgetStarvationEvents: validationCheck(summary, 'ai_budget_starvation_events'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    windows,
    correlations,
    classification,
    findings: [
      `Average frame rises from ${formatValue(early?.avgFrameMs ?? null, 'ms')} early to ${formatValue(late?.avgFrameMs ?? null, 'ms')} late while draw calls fall from ${formatValue(early?.renderer.drawCalls ?? null)} to ${formatValue(late?.renderer.drawCalls ?? null)}.`,
      `Current target distance falls from ${formatValue(early?.engagement.currentTargetDistance ?? null, 'm')} to ${formatValue(late?.engagement.currentTargetDistance ?? null, 'm')}; nearest OPFOR distance falls from ${formatValue(early?.engagement.nearestOpforDistance ?? null, 'm')} to ${formatValue(late?.engagement.nearestOpforDistance ?? null, 'm')}.`,
      `Shots delta rises from ${formatValue(early?.counters.shots?.delta ?? null)} early to ${formatValue(late?.counters.shots?.delta ?? null)} late; damage-taken delta rises from ${formatValue(early?.counters.damageTaken?.delta ?? null)} to ${formatValue(late?.counters.damageTaken?.delta ?? null)}.`,
      `NPC movement sample delta falls from ${formatValue(early?.counters.npcMovementSamples?.delta ?? null)} early to ${formatValue(late?.counters.npcMovementSamples?.delta ?? null)} late, so movement volume does not own the frame rise.`,
      `Correlation checks: shots delta r=${formatValue(corr('shots_delta_per_sample'))}, damage-taken delta r=${formatValue(corr('damage_taken_delta_per_sample'))}, target distance r=${formatValue(corr('current_target_distance'))}, NPC movement delta r=${formatValue(corr('npc_movement_delta_per_sample'))}.`,
    ],
    nextActions: [
      'Do not refresh combat120 baseline from this packet.',
      'Instrument or target close-engagement AI owners before broad visual caps: AIStateEngage, AITargeting LOS miss paths, and close-contact target distribution.',
      'Keep renderer and terrain-stream work out of the next DEFEKT-3 action unless a new trusted packet reverses this owner classification.',
    ],
    nonClaims: [
      'This sidecar does not prove a runtime fix.',
      'This sidecar does not authorize a perf baseline refresh.',
      'This sidecar does not provide human visual acceptance for the lower close-actor cap.',
    ],
    files: {
      summary: rel(jsonPath) ?? jsonPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownFor(report));

  console.log(`Projekt 143 combat-phase attribution ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`source=${report.inputs.summary}`);
  console.log(`classification=${report.classification.combatPhaseOwner}/${report.classification.confidence}`);
  console.log(`shotsDeltaCorrelation=${formatValue(corr('shots_delta_per_sample'))}`);
}

main();
