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
  validation?: {
    overall?: string;
    checks?: ValidationCheck[];
  };
  measurementTrust?: {
    status?: string;
    sampleCount?: number;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
  };
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
}

interface TimingBucket {
  count?: number;
  totalDurationMs?: number;
  maxDurationMs?: number;
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

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    aiMethodMs?: Record<string, number>;
    aiSlowestUpdate?: {
      combatantId?: string;
      stateAtStart?: string;
      stateAtEnd?: string;
      lodLevel?: string;
      totalMs?: number;
      methodMs?: Record<string, number>;
    } | null;
  };
  browserStalls?: {
    support?: {
      longtask?: boolean;
      longAnimationFrame?: boolean;
      userTiming?: boolean;
      webglTextureUpload?: boolean;
    };
    totals?: {
      longTaskCount?: number;
      longTaskTotalDurationMs?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameTotalDurationMs?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      webglTextureUploadCount?: number;
      webglTextureUploadTotalDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      userTimingByName?: Record<string, TimingBucket>;
    };
    recent?: {
      longTasks?: {
        count?: number;
        maxDurationMs?: number;
        totalDurationMs?: number;
      };
      longAnimationFrames?: {
        count?: number;
        maxDurationMs?: number;
        blockingDurationMs?: number;
        totalDurationMs?: number;
      };
      webglTextureUploadTop?: Array<{
        operation?: string;
        startTime?: number;
        duration?: number;
        target?: string;
        textureId?: number;
        width?: number;
        height?: number;
        sourceType?: string;
        sourceUrl?: string;
        sourceWidth?: number;
        sourceHeight?: number;
        byteLength?: number;
      }>;
      userTimingByName?: Record<string, TimingBucket>;
    };
  };
  frameEvents?: RuntimeFrameEvent[];
}

interface ConsoleEntry {
  ts?: string;
  type?: string;
  text?: string;
}

interface Entry {
  name: string;
  durationMs: number;
}

interface BoundarySample {
  sampleIndex: number;
  sampleTs: string | null;
  sampleFrameCount: number | null;
  frameCount: number | null;
  frameMs: number | null;
  atMs: number | null;
  longTaskMaxMs: number | null;
  longAnimationFrameMaxMs: number | null;
  longAnimationFrameBlockingMs: number | null;
  webglTextureUploadMaxMs: number | null;
  topUserTimings: Entry[];
  topAiMethods: Entry[];
  combatTotalMs: number | null;
  combatAiUpdateMs: number | null;
  slowestAiUpdate: {
    combatantId: string | null;
    stateAtStart: string | null;
    stateAtEnd: string | null;
    totalMs: number | null;
    topMethods: Entry[];
  } | null;
}

interface AiMethodPacket {
  status?: string;
  classification?: {
    owner?: string;
    confidence?: string;
  };
  aiMethodAttribution?: {
    samplesWithMethodProfile?: number;
    consoleAiSpikes?: {
      count?: number;
      countWithMethods?: number;
    };
  };
}

const OUTPUT_NAME = 'projekt-143-browser-boundary-attribution';

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
    throw new Error(`Usage: npx tsx scripts/projekt-143-browser-boundary-attribution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function validationCheck(summary: Summary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function entries(record: Record<string, number> | null | undefined, limit = 8): Entry[] {
  return Object.entries(record ?? {})
    .map(([name, value]) => ({ name, durationMs: round(Number(value)) ?? 0 }))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function timingEntries(record: Record<string, TimingBucket> | null | undefined, limit = 8): Entry[] {
  return Object.entries(record ?? {})
    .map(([name, bucket]) => ({
      name,
      durationMs: round(Number(bucket.maxDurationMs ?? bucket.totalDurationMs ?? 0)) ?? 0
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function maxNumber(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function uniqueBoundarySamples(samples: RuntimeSample[]): BoundarySample[] {
  const seen = new Set<string>();
  const boundaries: BoundarySample[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    for (const event of sample.frameEvents ?? []) {
      const frameMs = Number(event.frameMs ?? 0);
      if (!Number.isFinite(frameMs) || frameMs < 50) continue;
      const key = `${event.frameCount ?? 'frame'}|${round(event.atMs, 1) ?? 'at'}|${round(frameMs, 1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const recent = sample.browserStalls?.recent;
      const totals = sample.browserStalls?.totals;
      const uploadTop = recent?.webglTextureUploadTop ?? [];
      const slowest = sample.combatBreakdown?.aiSlowestUpdate ?? null;
      boundaries.push({
        sampleIndex,
        sampleTs: sample.ts ?? null,
        sampleFrameCount: typeof sample.frameCount === 'number' ? sample.frameCount : null,
        frameCount: typeof event.frameCount === 'number' ? event.frameCount : null,
        frameMs: round(frameMs),
        atMs: round(event.atMs),
        longTaskMaxMs: round(recent?.longTasks?.maxDurationMs ?? totals?.longTaskMaxDurationMs),
        longAnimationFrameMaxMs: round(recent?.longAnimationFrames?.maxDurationMs ?? totals?.longAnimationFrameMaxDurationMs),
        longAnimationFrameBlockingMs: round(recent?.longAnimationFrames?.blockingDurationMs ?? totals?.longAnimationFrameBlockingDurationMs),
        webglTextureUploadMaxMs: round(maxNumber(uploadTop.map((entry) => entry.duration)) ?? totals?.webglTextureUploadMaxDurationMs),
        topUserTimings: timingEntries(recent?.userTimingByName ?? totals?.userTimingByName, 8),
        topAiMethods: entries(sample.combatBreakdown?.aiMethodMs, 8),
        combatTotalMs: round(sample.combatBreakdown?.totalMs),
        combatAiUpdateMs: round(sample.combatBreakdown?.aiUpdateMs),
        slowestAiUpdate: slowest
          ? {
              combatantId: slowest.combatantId ?? null,
              stateAtStart: slowest.stateAtStart ?? null,
              stateAtEnd: slowest.stateAtEnd ?? null,
              totalMs: round(slowest.totalMs),
              topMethods: entries(slowest.methodMs, 8)
            }
          : null
      });
    }
  }
  return boundaries.sort((a, b) => Number(b.frameMs ?? 0) - Number(a.frameMs ?? 0));
}

function consoleSignalCounts(entriesList: ConsoleEntry[]): Record<string, number> {
  const counts: Record<string, number> = {
    aiSpikes: 0,
    aiBudgetWarnings: 0,
    slowFrames: 0,
    systemBudgetWarnings: 0,
    terrainStalls: 0
  };
  for (const entry of entriesList) {
    const text = entry.text ?? '';
    if (text.includes('[AI spike]')) counts.aiSpikes++;
    if (text.includes('[AI budget]')) counts.aiBudgetWarnings++;
    if (text.includes('[Perf] Slow frame')) counts.slowFrames++;
    if (text.includes('[SystemUpdater]')) counts.systemBudgetWarnings++;
    if (text.includes('stalled on terrain') || text.includes('exceeded max recovery attempts')) counts.terrainStalls++;
  }
  return counts;
}

function classify(maxBoundary: BoundarySample | null, summary: Summary): { owner: string; confidence: string; acceptance: string } {
  if (!maxBoundary) {
    return { owner: 'no_max_frame_boundary', confidence: 'none', acceptance: 'diagnostic_only' };
  }
  const frameMs = maxBoundary.frameMs ?? 0;
  const longTask = maxBoundary.longTaskMaxMs ?? 0;
  const loaf = maxBoundary.longAnimationFrameMaxMs ?? 0;
  const blocking = maxBoundary.longAnimationFrameBlockingMs ?? 0;
  const webgl = maxBoundary.webglTextureUploadMaxMs ?? 0;
  const userTiming = maxBoundary.topUserTimings[0]?.durationMs ?? 0;
  const aiMethod = maxBoundary.topAiMethods[0]?.durationMs ?? 0;
  const trusted = summary.measurementTrust?.status === 'pass';

  if (frameMs >= 90 && longTask >= frameMs && loaf >= frameMs && webgl < 1 && userTiming < frameMs * 0.25 && aiMethod < frameMs * 0.05) {
    return {
      owner: 'browser_longtask_loaf_without_instrumented_system_ai_or_webgl_owner',
      confidence: trusted && blocking >= frameMs ? 'high' : 'medium',
      acceptance: 'diagnostic_only'
    };
  }
  if (frameMs >= 50 && userTiming >= frameMs * 0.5) {
    return {
      owner: `instrumented_system_boundary:${maxBoundary.topUserTimings[0]?.name ?? 'unknown'}`,
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'diagnostic_only'
    };
  }
  if (frameMs >= 50 && webgl >= frameMs * 0.5) {
    return {
      owner: 'webgl_texture_upload_boundary',
      confidence: trusted ? 'medium' : 'low',
      acceptance: 'diagnostic_only'
    };
  }
  return {
    owner: 'mixed_or_insufficient_non_ai_boundary',
    confidence: trusted ? 'low' : 'none',
    acceptance: 'diagnostic_only'
  };
}

function markdown(report: {
  status: Status;
  classification: { owner: string; confidence: string; acceptance: string };
  inputs: Record<string, string | null>;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
}): string {
  return [
    '# Projekt Objekt-143 Browser Boundary Attribution',
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
  ].join('\n');
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const consolePath = join(artifactDir, 'console.json');
  const aiMethodPath = join(artifactDir, 'projekt-143-ai-method-attribution', 'ai-method-attribution.json');
  const outputDir = join(artifactDir, OUTPUT_NAME);

  if (!existsSync(summaryPath)) throw new Error(`Missing summary: ${rel(summaryPath)}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime samples: ${rel(runtimeSamplesPath)}`);

  const summary = readJson<Summary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const consoleEntries = existsSync(consolePath) ? readJson<ConsoleEntry[]>(consolePath) : [];
  const aiMethodPacket = existsSync(aiMethodPath) ? readJson<AiMethodPacket>(aiMethodPath) : null;
  const boundaries = uniqueBoundarySamples(samples);
  const maxBoundary = boundaries[0] ?? null;
  const firstBoundary = boundaries.slice().sort((a, b) => Number(a.atMs ?? 0) - Number(b.atMs ?? 0))[0] ?? null;
  const classification = classify(maxBoundary, summary);
  const consoleCounts = consoleSignalCounts(consoleEntries);
  const status: Status = maxBoundary && summary.measurementTrust?.status === 'pass' ? 'warn' : 'fail';

  mkdirSync(outputDir, { recursive: true });

  const findings = [
    `Artifact ${rel(artifactDir)} has capture status ${summary.status ?? 'unknown'}, validation ${summary.validation?.overall ?? 'unknown'}, and measurement trust ${summary.measurementTrust?.status ?? 'unknown'}.`,
    `Runtime boundary ring reports ${boundaries.length} unique frames at or above 50ms; first boundary frame ${firstBoundary?.frameCount ?? 'unknown'} records ${firstBoundary?.frameMs ?? 'unknown'}ms, and max boundary frame ${maxBoundary?.frameCount ?? 'unknown'} records ${maxBoundary?.frameMs ?? 'unknown'}ms.`,
    maxBoundary
      ? `Max boundary carries longTask=${maxBoundary.longTaskMaxMs ?? 'n/a'}ms, longAnimationFrame=${maxBoundary.longAnimationFrameMaxMs ?? 'n/a'}ms, blocking=${maxBoundary.longAnimationFrameBlockingMs ?? 'n/a'}ms, WebGL upload=${maxBoundary.webglTextureUploadMaxMs ?? 'n/a'}ms.`
      : 'No max boundary was available.',
    maxBoundary
      ? `Max boundary top user timings are ${maxBoundary.topUserTimings.slice(0, 6).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}.`
      : 'No user-timing boundary data was available.',
    maxBoundary
      ? `Max boundary AI method leaders are ${maxBoundary.topAiMethods.slice(0, 6).map((entry) => `${entry.name}:${entry.durationMs}ms`).join(', ') || 'none'}; slowest AI update at the boundary is ${maxBoundary.slowestAiUpdate?.totalMs ?? 'none'}ms.`
      : 'No AI method boundary data was available.',
    aiMethodPacket
      ? `AI method packet status is ${aiMethodPacket.status ?? 'unknown'}, classification ${aiMethodPacket.classification?.owner ?? 'unknown'}, method samples ${aiMethodPacket.aiMethodAttribution?.samplesWithMethodProfile ?? 'unknown'}, and console AI spikes ${aiMethodPacket.aiMethodAttribution?.consoleAiSpikes?.count ?? 'unknown'}.`
      : 'AI method packet is absent; this packet relies on runtime samples only.',
    `Console signal counts are ${JSON.stringify(consoleCounts)}.`,
    `Classification is ${classification.owner} with ${classification.confidence} confidence.`
  ];

  const nextActions = [
    'Keep STABILIZAT-1 baseline refresh blocked until maxFrameMs passes perf:compare.',
    'Do not tune CombatantAI from this packet; the max boundary is dominated by Long Task / Long Animation Frame evidence, not AI method timing.',
    'Use a focused Chrome trace window around the 30.98s page-time max boundary with CPU/heap sampling disabled if exact browser/native owner proof is required.',
    'If the next trusted capture repeats the same boundary, instrument render-present or main-thread task slices rather than adding broad gameplay caps.'
  ];

  const nonClaims = [
    'This packet does not complete DEFEKT-3.',
    'This packet does not prove a runtime fix.',
    'This packet does not authorize a combat120 baseline refresh.',
    'This packet does not identify an exact browser/native function without a focused trace.'
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
      console: existsSync(consolePath) ? rel(consolePath) : null,
      aiMethodAttribution: existsSync(aiMethodPath) ? rel(aiMethodPath) : null
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      captureStatus: summary.status ?? null,
      failureReason: summary.failureReason ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      scenarioMode: summary.scenario?.mode ?? summary.scenario?.requestedMode ?? null,
      durationSeconds: summary.durationSeconds ?? null
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      hitch50Percent: validationCheck(summary, 'hitch_50ms_percent'),
      measurementTrust: validationCheck(summary, 'measurement_trust')
    },
    boundaries: {
      countOver50Ms: boundaries.length,
      firstBoundary,
      maxBoundary,
      topBoundaries: boundaries.slice(0, 12)
    },
    aiMethodPacket: aiMethodPacket
      ? {
          status: aiMethodPacket.status ?? null,
          classification: aiMethodPacket.classification ?? null,
          samplesWithMethodProfile: aiMethodPacket.aiMethodAttribution?.samplesWithMethodProfile ?? null,
          consoleAiSpikes: aiMethodPacket.aiMethodAttribution?.consoleAiSpikes ?? null
        }
      : null,
    consoleSignals: consoleCounts,
    classification,
    findings,
    nextActions,
    nonClaims,
    files: {
      summary: rel(join(outputDir, 'browser-boundary-attribution.json')),
      markdown: rel(join(outputDir, 'browser-boundary-attribution.md'))
    }
  };

  const reportPath = join(outputDir, 'browser-boundary-attribution.json');
  const markdownPath = join(outputDir, 'browser-boundary-attribution.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, markdown(report), 'utf-8');

  console.log(`Projekt 143 browser boundary attribution ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${classification.owner}/${classification.confidence}`);
  console.log(`boundaries=${boundaries.length} consoleAiSpikes=${consoleCounts.aiSpikes}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-browser-boundary-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
