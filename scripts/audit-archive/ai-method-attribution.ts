#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface ValidationCheck {
  id?: string;
  status?: string;
  value?: number | string | null;
  message?: string;
}

interface Summary {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  status?: string;
  failureReason?: string | null;
  finalFrameCount?: number;
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
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
  previousMaxFrameMs?: number;
  newMax?: boolean;
  hitch33?: boolean;
  hitch50?: boolean;
  hitch100?: boolean;
}

interface AiUpdateBreakdown {
  combatantId?: string;
  stateAtStart?: string;
  stateAtEnd?: string;
  lodLevel?: string;
  totalMs?: number;
  methodMs?: Record<string, number>;
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
  frameEvents?: RuntimeFrameEvent[];
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    aiStateMs?: Record<string, number>;
    aiMethodMs?: Record<string, number>;
    aiSlowestUpdate?: AiUpdateBreakdown | null;
  };
  browserStalls?: {
    totals?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
    recent?: {
      userTimingByName?: Record<string, TimingBucket>;
    };
  };
}

interface TimingBucket {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
}

interface ConsoleEntry {
  ts?: string;
  type?: string;
  text?: string;
}

interface MethodEntry {
  name: string;
  durationMs: number;
}

interface ConsoleAiSpike {
  ts: string | null;
  type: string | null;
  durationMs: number | null;
  combatant: string | null;
  state: string | null;
  squad: string | null;
  target: string | null;
  methods: MethodEntry[];
  text: string;
}

interface RuntimeBoundary {
  sampleIndex: number;
  sampleTs: string | null;
  sampleFrameCount: number | null;
  frameCount: number | null;
  frameMs: number | null;
  atMs: number | null;
  topUserTimings: MethodEntry[];
  topCombatAiUserTimings: MethodEntry[];
  topAiMethods: MethodEntry[];
  slowestUpdate: {
    combatantId: string | null;
    stateAtStart: string | null;
    stateAtEnd: string | null;
    lodLevel: string | null;
    totalMs: number | null;
    topMethods: MethodEntry[];
  } | null;
}

const OUTPUT_NAME = 'projekt-143-ai-method-attribution';

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
    throw new Error(`Usage: npx tsx scripts/projekt-143-ai-method-attribution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function methodEntries(methodMs: Record<string, number> | null | undefined, limit = 8): MethodEntry[] {
  if (!methodMs || typeof methodMs !== 'object') return [];
  return Object.entries(methodMs)
    .map(([name, duration]) => ({
      name,
      durationMs: round(Number(duration)) ?? 0
    }))
    .filter((entry) => Number.isFinite(entry.durationMs) && entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function parseMethodList(text: string | undefined): MethodEntry[] {
  if (!text || text === 'none') return [];
  return text
    .split(',')
    .map((entry) => entry.trim())
    .map((entry) => {
      const match = /^(?<name>[^:]+):(?<duration>[\d.]+)$/.exec(entry);
      if (!match?.groups) return null;
      return {
        name: match.groups.name,
        durationMs: round(Number(match.groups.duration)) ?? 0
      };
    })
    .filter((entry): entry is MethodEntry => Boolean(entry) && entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs);
}

function consoleAiSpikes(entries: ConsoleEntry[]): ConsoleAiSpike[] {
  return entries
    .filter((entry) => typeof entry.text === 'string' && entry.text.includes('[AI spike]'))
    .map((entry) => {
      const match = /\[AI spike\]\s+(?<duration>[\d.]+)ms combatant=(?<combatant>\S+) state=(?<state>\S+) squad=(?<squad>\S+) target=(?<target>\S+)(?: methods=(?<methods>.*))?/.exec(entry.text ?? '');
      return {
        ts: entry.ts ?? null,
        type: entry.type ?? null,
        durationMs: match?.groups ? round(Number(match.groups.duration)) : null,
        combatant: match?.groups?.combatant ?? null,
        state: match?.groups?.state ?? null,
        squad: match?.groups?.squad ?? null,
        target: match?.groups?.target ?? null,
        methods: parseMethodList(match?.groups?.methods),
        text: entry.text ?? ''
      };
    })
    .sort((a, b) => Number(b.durationMs ?? 0) - Number(a.durationMs ?? 0));
}

function topUserTimings(sample: RuntimeSample, limit: number): MethodEntry[] {
  const timings = sample.browserStalls?.recent?.userTimingByName ?? {};
  return Object.entries(timings)
    .map(([name, bucket]) => ({
      name,
      durationMs: round(bucket.maxDurationMs)
        ?? round(bucket.totalDurationMs)
        ?? 0
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function timingEntries(
  buckets: Record<string, TimingBucket> | null | undefined,
  prefix: string,
  limit = 12
): MethodEntry[] {
  if (!buckets || typeof buckets !== 'object') return [];
  return Object.entries(buckets)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, bucket]) => ({
      name,
      durationMs: round(bucket.maxDurationMs)
        ?? round(bucket.totalDurationMs)
        ?? 0
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function latestCombatAiUserTimings(samples: RuntimeSample[]): MethodEntry[] {
  for (let index = samples.length - 1; index >= 0; index--) {
    const entries = timingEntries(samples[index].browserStalls?.totals?.userTimingByName, 'CombatAI.', 16);
    if (entries.length > 0) return entries;
  }
  return [];
}

function slowestUpdate(sample: RuntimeSample): RuntimeBoundary['slowestUpdate'] {
  const update = sample.combatBreakdown?.aiSlowestUpdate;
  if (!update) return null;
  return {
    combatantId: update.combatantId ?? null,
    stateAtStart: update.stateAtStart ?? null,
    stateAtEnd: update.stateAtEnd ?? null,
    lodLevel: update.lodLevel ?? null,
    totalMs: round(update.totalMs),
    topMethods: methodEntries(update.methodMs, 8)
  };
}

function runtimeBoundaries(samples: RuntimeSample[]): RuntimeBoundary[] {
  const seen = new Set<string>();
  const boundaries: RuntimeBoundary[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const events = Array.isArray(sample.frameEvents) ? sample.frameEvents : [];
    for (const event of events) {
      const frameMs = Number(event.frameMs ?? 0);
      if (!Number.isFinite(frameMs) || frameMs < 50) continue;
      const key = [
        event.frameCount ?? 'unknown-frame',
        round(event.atMs, 1) ?? 'unknown-at',
        round(frameMs, 1)
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      boundaries.push({
        sampleIndex,
        sampleTs: sample.ts ?? null,
        sampleFrameCount: typeof sample.frameCount === 'number' ? sample.frameCount : null,
        frameCount: typeof event.frameCount === 'number' ? event.frameCount : null,
        frameMs: round(frameMs),
        atMs: round(event.atMs),
        topUserTimings: topUserTimings(sample, 8),
        topCombatAiUserTimings: timingEntries(sample.browserStalls?.recent?.userTimingByName, 'CombatAI.', 8),
        topAiMethods: methodEntries(sample.combatBreakdown?.aiMethodMs, 8),
        slowestUpdate: slowestUpdate(sample)
      });
    }
  }
  return boundaries.sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0));
}

function samplesWithMethodProfiles(samples: RuntimeSample[]): RuntimeSample[] {
  return samples.filter((sample) => methodEntries(sample.combatBreakdown?.aiMethodMs, 1).length > 0);
}

function aggregateMethodTotals(samples: RuntimeSample[]): MethodEntry[] {
  const totals = new Map<string, number>();
  for (const sample of samples) {
    const methodMs = sample.combatBreakdown?.aiMethodMs;
    if (!methodMs) continue;
    for (const [name, value] of Object.entries(methodMs)) {
      const duration = Number(value);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + duration);
    }
  }
  return Array.from(totals.entries())
    .map(([name, duration]) => ({ name, durationMs: round(duration) ?? 0 }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 16);
}

function slowestUpdates(samples: RuntimeSample[]): Array<RuntimeBoundary['slowestUpdate'] & { sampleIndex: number; sampleTs: string | null; sampleFrameCount: number | null }> {
  const updates: Array<RuntimeBoundary['slowestUpdate'] & { sampleIndex: number; sampleTs: string | null; sampleFrameCount: number | null }> = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const update = slowestUpdate(samples[sampleIndex]);
    if (!update || update.totalMs === null) continue;
    updates.push({
      ...update,
      sampleIndex,
      sampleTs: samples[sampleIndex].ts ?? null,
      sampleFrameCount: typeof samples[sampleIndex].frameCount === 'number' ? samples[sampleIndex].frameCount : null
    });
  }
  return updates
    .sort((a, b) => Number(b.totalMs ?? 0) - Number(a.totalMs ?? 0))
    .slice(0, 16);
}

function makeMarkdown(report: {
  status: Status;
  classification: { owner: string; confidence: string; acceptance: string };
  inputs: Record<string, string | null>;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
}): string {
  const lines = [
    '# Projekt Objekt-143 AI Method Attribution',
    '',
    `- status: ${report.status}`,
    `- classification: ${report.classification.owner}`,
    `- confidence: ${report.classification.confidence}`,
    `- acceptance: ${report.classification.acceptance}`,
    `- artifact: ${report.inputs.artifactDir}`,
    '',
    '## Findings',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    ''
  ];
  return lines.join('\n');
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const consolePath = join(artifactDir, 'console.json');
  const outputDir = join(artifactDir, OUTPUT_NAME);

  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const consoleEntries = existsSync(consolePath) ? readJson<ConsoleEntry[]>(consolePath) : [];
  const methodProfileSamples = samplesWithMethodProfiles(samples);
  const boundaries = runtimeBoundaries(samples);
  const spikes = consoleAiSpikes(consoleEntries);
  const spikesWithMethods = spikes.filter((spike) => spike.methods.length > 0);
  const updateLeaders = slowestUpdates(samples);
  const aggregateMethods = aggregateMethodTotals(samples);
  const firstSpike = spikes[0] ?? null;
  const firstMethodSpike = spikesWithMethods[0] ?? null;
  const maxBoundary = boundaries[0] ?? null;
  const firstBoundary = boundaries
    .slice()
    .sort((a, b) => Number(a.atMs ?? 0) - Number(b.atMs ?? 0))[0] ?? null;

  const hasRuntimeMethodProfile = methodProfileSamples.length > 0;
  const hasConsoleMethodSpike = spikesWithMethods.length > 0;
  const hasSlowestUpdate = updateLeaders.length > 0;
  const combatAiUserTimings = latestCombatAiUserTimings(samples);
  const hasCombatAiUserTimings = combatAiUserTimings.length > 0;
  const status: Status = hasRuntimeMethodProfile || hasConsoleMethodSpike || hasSlowestUpdate || hasCombatAiUserTimings ? 'warn' : 'fail';
  const owner = hasConsoleMethodSpike
    ? 'combat_ai_console_spike_method_attribution_captured'
    : hasCombatAiUserTimings && hasRuntimeMethodProfile
      ? 'combat_ai_user_timing_and_method_surface_captured_no_console_spike'
      : hasSlowestUpdate && hasRuntimeMethodProfile
        ? 'combat_ai_runtime_method_surface_captured_no_console_spike'
        : hasRuntimeMethodProfile
          ? 'combat_ai_frame_method_surface_captured'
          : hasCombatAiUserTimings
            ? 'combat_ai_user_timing_surface_captured_no_method_profile'
            : 'combat_ai_method_timing_absent';
  const confidence = hasConsoleMethodSpike && summary.measurementTrust?.status === 'pass'
    ? 'medium'
    : hasRuntimeMethodProfile || hasSlowestUpdate || hasCombatAiUserTimings
      ? 'low'
      : 'none';

  mkdirSync(outputDir, { recursive: true });

  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, and measurement trust ${summary.measurementTrust?.status ?? 'unknown'}.`,
    `Runtime samples number ${samples.length}; ${methodProfileSamples.length} samples carry combatBreakdown.aiMethodMs and ${updateLeaders.length} samples carry combatBreakdown.aiSlowestUpdate.`,
    `Runtime frame-event ring reports ${boundaries.length} unique frames at or above 50ms; first boundary frame ${firstBoundary?.frameCount ?? 'unknown'} at page ${firstBoundary?.atMs ?? 'unknown'}ms records ${firstBoundary?.frameMs ?? 'unknown'}ms, and max boundary frame ${maxBoundary?.frameCount ?? 'unknown'} records ${maxBoundary?.frameMs ?? 'unknown'}ms.`,
    maxBoundary
      ? `Max boundary leaders are userTiming=${maxBoundary.topUserTimings.slice(0, 4).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}, combatAiUserTiming=${maxBoundary.topCombatAiUserTimings.slice(0, 4).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}, and aiMethod=${maxBoundary.topAiMethods.slice(0, 4).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}.`
      : 'No max-frame boundary leaders were available.',
    hasConsoleMethodSpike
      ? `Console records ${spikesWithMethods.length}/${spikes.length} AI spike lines with method breakdowns; leading spike is ${firstMethodSpike?.durationMs ?? 'unknown'}ms combatant=${firstMethodSpike?.combatant ?? 'unknown'} state=${firstMethodSpike?.state ?? 'unknown'} methods=${firstMethodSpike?.methods.map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') ?? 'none'}.`
      : firstSpike
        ? `Console records ${spikes.length} AI spike lines, but the leading spike ${firstSpike.durationMs ?? 'unknown'}ms has no method breakdown in this artifact.`
        : 'Console records no AI spike line in this artifact.',
    aggregateMethods.length > 0
      ? `Aggregate frame method leaders are ${aggregateMethods.slice(0, 6).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ')}.`
      : 'No aggregate frame method leaders were exported.',
    combatAiUserTimings.length > 0
      ? `Combat AI user-timing leaders are ${combatAiUserTimings.slice(0, 8).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ')}.`
      : 'No CombatAI.* user-timing entries were exported.',
    updateLeaders[0]
      ? `Slowest sampled update is ${updateLeaders[0].totalMs ?? 'unknown'}ms combatant=${updateLeaders[0].combatantId ?? 'unknown'} state=${updateLeaders[0].stateAtStart ?? 'unknown'}->${updateLeaders[0].stateAtEnd ?? 'unknown'} lod=${updateLeaders[0].lodLevel ?? 'unknown'} methods=${updateLeaders[0].topMethods.map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}.`
      : 'No slowest per-update AI breakdown was exported.',
    'The method counters are scoped source instrumentation and may include nested inclusive time; this packet ranks ownership evidence and is not an exclusive CPU flame graph.'
  ];

  const nextActions = [
    'Keep STABILIZAT-1 baseline refresh blocked until a standard combat120 capture and perf:compare are clean.',
    hasConsoleMethodSpike
      ? 'Use the leading console spike method list to choose the next bounded DEFEKT-3 code change; retain the same standard combat120 gate for proof.'
      : hasCombatAiUserTimings
        ? 'Use the CombatAI.* user-timing leaders with aiMethodMs to choose the next bounded DEFEKT-3 source change; retain the same standard combat120 gate for proof.'
        : hasRuntimeMethodProfile
        ? 'Treat this standard capture as negative method-spike evidence; if DEFEKT-3 remains max-frame focused, isolate non-AI browser, render, or harness boundaries before changing AI behavior.'
        : 'Run a fresh standard combat120 capture against the instrumented build so runtime samples include AI method breakdowns.',
    'Do not reduce AI behavior or LOD policy from this packet alone; bind any candidate behavior change to before/after artifacts under artifacts/perf/<ts>/.',
    'If method totals point to patrol target search or line-of-sight calls, review cadence and cache ownership before changing tuning values.'
  ];

  const nonClaims = [
    'This packet does not complete DEFEKT-3.',
    'This packet does not authorize a combat120 baseline refresh.',
    'This packet does not prove a runtime fix.',
    'This packet does not replace Chrome trace or CPU profile evidence for renderer/GPU boundaries.'
  ];

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      summary: rel(summaryPath),
      runtimeSamples: rel(runtimeSamplesPath),
      console: existsSync(consolePath) ? rel(consolePath) : null
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      finalFrameCount: summary.finalFrameCount ?? null
    },
    validationHighlights: {
      samplesCollected: validationCheck(summary, 'samples_collected'),
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      frameProgression: validationCheck(summary, 'frame_progression'),
      measurementTrust: validationCheck(summary, 'measurement_trust')
    },
    runtimeBoundaries: {
      countOver50Ms: boundaries.length,
      firstBoundary,
      maxBoundary,
      topBoundaries: boundaries.slice(0, 12)
    },
    aiMethodAttribution: {
      samplesWithMethodProfile: methodProfileSamples.length,
      aggregateMethodLeaders: aggregateMethods,
      combatAiUserTimingLeaders: combatAiUserTimings,
      slowestUpdates: updateLeaders,
      consoleAiSpikes: {
        count: spikes.length,
        countWithMethods: spikesWithMethods.length,
        topSpikes: spikes.slice(0, 12)
      }
    },
    classification: {
      owner,
      confidence,
      acceptance: 'owner_review_only'
    },
    findings,
    nextActions,
    nonClaims,
    files: {
      summary: rel(join(outputDir, 'ai-method-attribution.json')),
      markdown: rel(join(outputDir, 'ai-method-attribution.md'))
    }
  };

  const reportPath = join(outputDir, 'ai-method-attribution.json');
  const markdownPath = join(outputDir, 'ai-method-attribution.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');

  console.log(`Projekt 143 AI method attribution ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${owner}/${confidence}`);
  console.log(`methodSamples=${methodProfileSamples.length} aiSpikes=${spikes.length} aiSpikesWithMethods=${spikesWithMethods.length}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-ai-method-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
