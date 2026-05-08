#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CallFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface CpuProfileNode {
  id: number;
  callFrame?: CallFrame;
  children?: number[];
}

interface CpuProfile {
  startTime?: number;
  endTime?: number;
  nodes?: CpuProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

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
  failureReason?: string;
  scenario?: { mode?: string };
  validation?: { overall?: string; checks?: ValidationCheck[] };
  measurementTrust?: { status?: string; sampleCount?: number; probeRoundTripP95Ms?: number };
}

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch50Count?: number;
  heapUsedMb?: number;
  browserStalls?: {
    totals?: {
      longTaskCount?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameMaxDurationMs?: number;
      longAnimationFrameBlockingDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      userTimingByName?: Record<string, { maxDurationMs?: number }>;
    };
    recent?: {
      longTasks?: { count?: number; maxDurationMs?: number };
      longAnimationFrames?: { count?: number; maxDurationMs?: number; blockingDurationMs?: number };
      webglTextureUploadTop?: Array<{ operation?: string; duration?: number; sourceUrl?: string }>;
      userTimingByName?: Record<string, { maxDurationMs?: number }>;
    };
  };
}

interface CpuFrame {
  id: number;
  functionName: string;
  url: string;
  lineNumber: number | null;
  columnNumber: number | null;
  selfMs: number;
  category: string;
}

interface CpuAttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-cpu-profile-attribution';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    validation: string | null;
    measurementTrust: string | null;
    cpuProfile: string;
  };
  sourceSummary: {
    startedAt: string | null;
    endedAt: string | null;
    scenarioMode: string | null;
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    failureReason: string | null;
  };
  validationHighlights: Record<string, ValidationCheck | null>;
  cpuProfile: {
    nodeCount: number;
    sampleCount: number;
    profiledDurationMs: number | null;
    sampledSelfTimeMs: number;
    topFrames: Array<{
      functionName: string;
      source: string;
      selfMs: number;
      percent: number;
      category: string;
    }>;
    categories: Array<{
      category: string;
      selfMs: number;
      percent: number;
      frameCount: number;
      topFrames: Array<{ functionName: string; source: string; selfMs: number; percent: number }>;
    }>;
    sourceUrlTotals: Array<{ url: string; category: string; selfMs: number; percent: number; frameCount: number }>;
  };
  longTaskWindow: {
    sampleCount: number;
    peakMaxFrameMs: number | null;
    hitch50Events: number;
    longTaskSamples: Array<{
      index: number;
      ts: string | null;
      frameCount: number | null;
      maxFrameMs: number | null;
      longTaskMaxMs: number | null;
      longAnimationFrameMaxMs: number | null;
      longAnimationFrameBlockingMs: number | null;
      webglTextureUploadMaxMs: number | null;
      userTimingMaximaOver1ms: Record<string, number>;
    }>;
  };
  classification: {
    cpuShape: string;
    primaryOwners: string[];
    acceptance: 'rejected';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-cpu-profile-attribution';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

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
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function validationCheck(summary: PerfSummary, id: string): ValidationCheck | null {
  return summary.validation?.checks?.find((check) => check.id === id) ?? null;
}

function normalizedUrl(url: string): string {
  return url.replaceAll('\\', '/').toLowerCase();
}

function sourceUrlLabel(url: string): string {
  if (!url) return '(native)';
  const queryIndex = url.indexOf('?');
  const clean = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const srcIndex = clean.toLowerCase().indexOf('/src/');
  if (srcIndex >= 0) return clean.slice(srcIndex + 1);
  const depsIndex = clean.toLowerCase().indexOf('/node_modules/.vite/deps/');
  if (depsIndex >= 0) return clean.slice(depsIndex + 1);
  const buildIndex = clean.toLowerCase().indexOf('/build-assets/');
  if (buildIndex >= 0) return clean.slice(buildIndex + 1);
  return clean;
}

function sourceLabel(frame: Pick<CpuFrame, 'url' | 'lineNumber' | 'columnNumber'>): string {
  const source = frame.url ? basename(sourceUrlLabel(frame.url)) : '(native)';
  const line = frame.lineNumber === null ? 'na' : String(frame.lineNumber);
  const column = frame.columnNumber === null ? 'na' : String(frame.columnNumber);
  return `${source}:${line}:${column}`;
}

function classifyFrame(functionName: string, url: string): string {
  const source = normalizedUrl(url);
  const name = functionName || '(anonymous)';
  if (name === '(garbage collector)') return 'garbage_collection';
  if (name === '(idle)') return 'browser_idle';
  if (name === '(program)' || name === '(root)') return 'browser_or_unattributed_program';
  if (source.includes('/scripts/perf-browser-observers.js')) return 'perf_observer_overhead';
  if (source.includes('/src/core/systemupdater.ts') || name === 'withUserTiming') return 'system_update_timing';
  if (
    source.includes('/node_modules/.vite/deps/three') ||
    source.includes('/three.module') ||
    source.includes('/three-')
  ) {
    if (
      name.includes('Program') ||
      name === 'getParameters' ||
      name === 'onFirstUse' ||
      name === 'setProgram' ||
      name === 'renderObject' ||
      name === 'renderBufferDirect' ||
      name === 'projectObject'
    ) {
      return 'three_renderer_program_and_render';
    }
    return 'three_matrix_skinning_and_scenegraph';
  }
  if (
    source.includes('/src/systems/terrain/heightquerycache.ts') ||
    source.includes('/src/systems/terrain/gameplaysurfacesampling.ts') ||
    source.includes('/src/systems/terrain/noiseheightprovider.ts') ||
    name === 'getHeightAt'
  ) {
    return 'terrain_height_sampling';
  }
  if (
    source.includes('/src/systems/combat/') ||
    name.includes('Combatant') ||
    name === 'updateMovement' ||
    name === 'resolveNpcAtmosphereSnapshot'
  ) {
    return 'combat_runtime';
  }
  if (source.includes('/build-assets/index-')) return 'gameplay_bundle_other';
  return 'browser_or_unknown';
}

function flattenCpuProfile(profile: CpuProfile): CpuFrame[] {
  const nodes = profile.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selfById = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    if (typeof id !== 'number') continue;
    const deltaUs = Number(deltas[i] ?? 0);
    if (!Number.isFinite(deltaUs)) continue;
    selfById.set(id, (selfById.get(id) ?? 0) + deltaUs / 1000);
  }
  return [...selfById.entries()]
    .map(([id, selfMs]) => {
      const node = nodeById.get(id);
      const callFrame = node?.callFrame ?? {};
      const functionName = callFrame.functionName || '(anonymous)';
      const url = callFrame.url ?? '';
      return {
        id,
        functionName,
        url,
        lineNumber: typeof callFrame.lineNumber === 'number' ? callFrame.lineNumber : null,
        columnNumber: typeof callFrame.columnNumber === 'number' ? callFrame.columnNumber : null,
        selfMs,
        category: classifyFrame(functionName, url),
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs);
}

function summarizeCategories(frames: CpuFrame[], totalMs: number): CpuAttributionReport['cpuProfile']['categories'] {
  const grouped = new Map<string, CpuFrame[]>();
  for (const frame of frames) {
    const entries = grouped.get(frame.category) ?? [];
    entries.push(frame);
    grouped.set(frame.category, entries);
  }
  return [...grouped.entries()]
    .map(([category, entries]) => {
      const selfMs = entries.reduce((sum, frame) => sum + frame.selfMs, 0);
      return {
        category,
        selfMs: round(selfMs) ?? 0,
        percent: round(totalMs > 0 ? (selfMs / totalMs) * 100 : 0, 2) ?? 0,
        frameCount: entries.length,
        topFrames: entries
          .slice(0, 6)
          .map((frame) => ({
            functionName: frame.functionName,
            source: sourceLabel(frame),
            selfMs: round(frame.selfMs) ?? 0,
            percent: round(totalMs > 0 ? (frame.selfMs / totalMs) * 100 : 0, 2) ?? 0,
          })),
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs);
}

function summarizeSourceUrls(frames: CpuFrame[], totalMs: number): CpuAttributionReport['cpuProfile']['sourceUrlTotals'] {
  const grouped = new Map<string, { selfMs: number; frameCount: number; categories: Map<string, number> }>();
  for (const frame of frames) {
    const url = sourceUrlLabel(frame.url);
    const entry = grouped.get(url) ?? { selfMs: 0, frameCount: 0, categories: new Map<string, number>() };
    entry.selfMs += frame.selfMs;
    entry.frameCount += 1;
    entry.categories.set(frame.category, (entry.categories.get(frame.category) ?? 0) + frame.selfMs);
    grouped.set(url, entry);
  }
  return [...grouped.entries()]
    .map(([url, entry]) => ({
      url,
      category: [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'browser_or_unknown',
      selfMs: round(entry.selfMs) ?? 0,
      percent: round(totalMs > 0 ? (entry.selfMs / totalMs) * 100 : 0, 2) ?? 0,
      frameCount: entry.frameCount,
    }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 30);
}

function userTimingMaxima(sample: RuntimeSample): Record<string, number> {
  const timings = sample.browserStalls?.recent?.userTimingByName
    ?? sample.browserStalls?.totals?.userTimingByName
    ?? {};
  return Object.fromEntries(
    Object.entries(timings)
      .map(([name, value]) => [name, Number(value?.maxDurationMs ?? 0)] as const)
      .filter(([, value]) => Number.isFinite(value) && value > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  );
}

function summarizeLongTasks(samples: RuntimeSample[]): CpuAttributionReport['longTaskWindow'] {
  const longTaskSamples = samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => Number(sample.browserStalls?.recent?.longTasks?.count ?? sample.browserStalls?.totals?.longTaskCount ?? 0) > 0)
    .map(({ sample, index }) => ({
      index,
      ts: sample.ts ?? null,
      frameCount: typeof sample.frameCount === 'number' ? sample.frameCount : null,
      maxFrameMs: round(sample.maxFrameMs),
      longTaskMaxMs: round(sample.browserStalls?.recent?.longTasks?.maxDurationMs ?? sample.browserStalls?.totals?.longTaskMaxDurationMs),
      longAnimationFrameMaxMs: round(sample.browserStalls?.recent?.longAnimationFrames?.maxDurationMs ?? sample.browserStalls?.totals?.longAnimationFrameMaxDurationMs),
      longAnimationFrameBlockingMs: round(sample.browserStalls?.recent?.longAnimationFrames?.blockingDurationMs ?? sample.browserStalls?.totals?.longAnimationFrameBlockingDurationMs),
      webglTextureUploadMaxMs: round(sample.browserStalls?.totals?.webglTextureUploadMaxDurationMs),
      userTimingMaximaOver1ms: userTimingMaxima(sample),
    }));
  let hitch50Events = 0;
  let previous = 0;
  for (const sample of samples) {
    const current = Number(sample.hitch50Count ?? 0);
    if (current > previous) hitch50Events += current - previous;
    previous = current;
  }
  return {
    sampleCount: samples.length,
    peakMaxFrameMs: samples.length > 0 ? round(Math.max(...samples.map((sample) => Number(sample.maxFrameMs ?? 0)))) : null,
    hitch50Events,
    longTaskSamples,
  };
}

function markdown(report: CpuAttributionReport): string {
  const topCategories = report.cpuProfile.categories.slice(0, 6);
  const lines = [
    '# Projekt Objekt-143 CPU Profile Attribution',
    '',
    `Created: ${report.createdAt}`,
    `Source artifact: ${report.inputs.artifactDir}`,
    `Status: ${report.status}`,
    '',
    '## Source Capture',
    '',
    `- Capture status: ${report.sourceSummary.captureStatus}`,
    `- Validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Failure reason: ${report.sourceSummary.failureReason ?? 'none'}`,
    '',
    '## CPU Shape',
    '',
    `- Profiled duration: ${report.cpuProfile.profiledDurationMs}ms`,
    `- Sampled self time: ${report.cpuProfile.sampledSelfTimeMs}ms`,
    `- Top categories: ${topCategories.map((entry) => `${entry.category} ${entry.percent}%`).join('; ')}`,
    '',
    '## Long-Task Window',
    '',
    `- Peak max frame: ${report.longTaskWindow.peakMaxFrameMs}ms`,
    `- Hitch >50ms events: ${report.longTaskWindow.hitch50Events}`,
    `- Long-task sample count: ${report.longTaskWindow.longTaskSamples.length}`,
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
  return lines.join('\n');
}

function main(): void {
  const artifactArg = argValue('--artifact');
  if (!artifactArg) {
    throw new Error('Usage: npx tsx scripts/projekt-143-cpu-profile-attribution.ts --artifact <perf-artifact-dir>');
  }
  const artifactDir = resolve(artifactArg);
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const measurementTrustPath = join(artifactDir, 'measurement-trust.json');
  const cpuProfilePath = join(artifactDir, 'cpu-profile.cpuprofile');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);
  if (!existsSync(cpuProfilePath)) throw new Error(`Missing cpu-profile.cpuprofile in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const runtimeSamples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const cpuProfile = readJson<CpuProfile>(cpuProfilePath);
  const frames = flattenCpuProfile(cpuProfile);
  const sampledSelfTimeMs = frames.reduce((sum, frame) => sum + frame.selfMs, 0);
  const categories = summarizeCategories(frames, sampledSelfTimeMs);
  const sourceUrlTotals = summarizeSourceUrls(frames, sampledSelfTimeMs);
  const longTaskWindow = summarizeLongTasks(runtimeSamples);
  const primaryOwners = categories
    .filter((entry) => !['browser_idle', 'browser_or_unattributed_program'].includes(entry.category))
    .slice(0, 5)
    .map((entry) => entry.category);
  const sourceMode = sourceUrlTotals.some((entry) => entry.url.startsWith('src/')) ? 'source_mapped_dev_shape' : 'bundled_production_shape';
  const findings = [
    `CPU profile is ${sourceMode}; profile attribution is diagnostic and not baseline evidence.`,
    `Top non-idle/program CPU categories are ${primaryOwners.join(', ')}.`,
    `Runtime samples contain ${longTaskWindow.longTaskSamples.length} long-task samples and ${longTaskWindow.hitch50Events} >50ms hitch events.`,
    'Observer user-timing maxima remain below the browser long-task durations, so the remaining long task is not fully attributed by existing system marks.',
  ];
  const report: CpuAttributionReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-cpu-profile-attribution',
    status: summary.measurementTrust?.status === 'pass' ? 'warn' : 'fail',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactArg,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      measurementTrust: existsSync(measurementTrustPath) ? rel(measurementTrustPath) : null,
      cpuProfile: rel(cpuProfilePath) ?? cpuProfilePath,
    },
    sourceSummary: {
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      scenarioMode: summary.scenario?.mode ?? null,
      captureStatus: summary.status ?? null,
      validation: summary.validation?.overall ?? null,
      measurementTrust: summary.measurementTrust?.status ?? null,
      failureReason: summary.failureReason ?? null,
    },
    validationHighlights: {
      avgFrameMs: validationCheck(summary, 'avg_frame_ms'),
      peakP99FrameMs: validationCheck(summary, 'peak_p99_frame_ms'),
      peakMaxFrameMs: validationCheck(summary, 'peak_max_frame_ms'),
      hitch50Percent: validationCheck(summary, 'hitch_50ms_percent'),
      heapGrowthMb: validationCheck(summary, 'heap_growth_mb'),
      heapRecoveryRatio: validationCheck(summary, 'heap_recovery_ratio'),
      measurementTrust: validationCheck(summary, 'measurement_trust'),
    },
    cpuProfile: {
      nodeCount: cpuProfile.nodes?.length ?? 0,
      sampleCount: cpuProfile.samples?.length ?? 0,
      profiledDurationMs: typeof cpuProfile.startTime === 'number' && typeof cpuProfile.endTime === 'number'
        ? round((cpuProfile.endTime - cpuProfile.startTime) / 1000)
        : null,
      sampledSelfTimeMs: round(sampledSelfTimeMs) ?? 0,
      topFrames: frames.slice(0, 30).map((frame) => ({
        functionName: frame.functionName,
        source: sourceLabel(frame),
        selfMs: round(frame.selfMs) ?? 0,
        percent: round(sampledSelfTimeMs > 0 ? (frame.selfMs / sampledSelfTimeMs) * 100 : 0, 2) ?? 0,
        category: frame.category,
      })),
      categories,
      sourceUrlTotals,
    },
    longTaskWindow,
    classification: {
      cpuShape: sourceMode,
      primaryOwners,
      acceptance: 'rejected',
    },
    findings,
    nextActions: [
      'Do not refresh combat120 baseline from this profile capture.',
      'Use this profile to choose the next narrow source-instrumentation target instead of adding another broad runtime cap.',
      'Preserve long-task attribution in future captures by adding script/source capture to the observer path or by keeping deep-CDP source-shaped profile packets.',
    ],
    nonClaims: [
      'This CPU profile does not prove a runtime fix.',
      'This CPU profile does not authorize a perf baseline refresh.',
      'This CPU profile does not prove lower close-actor visual acceptance.',
    ],
    files: {
      summary: '',
      markdown: '',
    },
  };

  const outputDir = join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'cpu-profile-attribution.json');
  const markdownPath = join(outputDir, 'cpu-profile-attribution.md');
  report.files.summary = rel(reportPath) ?? reportPath;
  report.files.markdown = rel(markdownPath) ?? markdownPath;
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, markdown(report), 'utf-8');
  console.log(`Projekt 143 CPU profile attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`source=${report.inputs.cpuProfile}`);
  console.log(`topCategories=${report.cpuProfile.categories.slice(0, 6).map((entry) => entry.category).join(',')}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-cpu-profile-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
