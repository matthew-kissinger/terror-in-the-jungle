#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CallFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface HeapProfileNode {
  id: number;
  selfSize?: number;
  callFrame?: CallFrame;
  children?: HeapProfileNode[];
}

interface HeapSamplingProfile {
  head?: HeapProfileNode;
  samples?: Array<{ size?: number; nodeId?: number; ordinal?: number }>;
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
  heapUsedMb?: number;
  heapTotalMb?: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
  };
}

interface ConsoleEntry {
  text?: string;
  message?: string;
}

interface FlatNode {
  id: number;
  selfSizeBytes: number;
  functionName: string;
  url: string;
  lineNumber: number | null;
  columnNumber: number | null;
  stack: string[];
  category: string;
}

interface CategorySummary {
  category: string;
  bytes: number;
  mb: number;
  percent: number;
  nodeCount: number;
  topFrames: Array<{
    functionName: string;
    source: string;
    mb: number;
    percent: number;
  }>;
}

interface SourceUrlSummary {
  url: string;
  category: string;
  mb: number;
  percent: number;
  nodeCount: number;
}

interface AttributionReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-heap-sampling-attribution';
  status: CheckStatus;
  inputs: {
    artifactDir: string;
    summary: string;
    runtimeSamples: string;
    validation: string | null;
    measurementTrust: string | null;
    console: string | null;
    heapSampling: string;
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
  heapWindow: {
    sampleCount: number;
    baselineMb: number | null;
    peakMb: number | null;
    endMb: number | null;
    peakGrowthMb: number | null;
    endGrowthMb: number | null;
    recoveryRatio: number | null;
    peakSample: RuntimeSample | null;
    endSample: RuntimeSample | null;
  };
  samplingProfile: {
    sampledNodeCount: number;
    sampledAllocationCount: number;
    totalSelfSizeMb: number;
    topNodes: Array<{
      functionName: string;
      source: string;
      mb: number;
      percent: number;
      category: string;
      stack: string[];
    }>;
    categories: CategorySummary[];
    sourceUrlTotals: SourceUrlSummary[];
  };
  consoleSignals: Record<string, number>;
  classification: {
    allocationShape: string;
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

const OUTPUT_NAME = 'projekt-143-heap-sampling-attribution';

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

function mb(bytes: number): number {
  return bytes / (1024 * 1024);
}

function sourceLabel(node: Pick<FlatNode, 'url' | 'lineNumber' | 'columnNumber'>): string {
  const source = node.url ? basename(node.url) : '(native)';
  const line = node.lineNumber === null ? 'na' : String(node.lineNumber);
  const column = node.columnNumber === null ? 'na' : String(node.columnNumber);
  return `${source}:${line}:${column}`;
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
  return clean;
}

function classifyNode(functionName: string, url: string): string {
  const name = functionName || '(anonymous)';
  const source = normalizedUrl(url);
  if (
    source.includes('/node_modules/.vite/deps/three') ||
    source.includes('/three.module') ||
    source.includes('/three-')
  ) {
    return 'three_renderer_math_and_skinning';
  }
  if (source.includes('/src/systems/combat/combatantrenderer.ts')) {
    return 'combatant_renderer_runtime';
  }
  if (
    source.includes('/src/systems/terrain/gameplaysurfacesampling.ts') ||
    source.includes('/src/systems/terrain/heightquerycache.ts') ||
    source.includes('/src/systems/terrain/noiseheightprovider.ts') ||
    source.includes('/src/utils/noisegenerator.ts')
  ) {
    return 'terrain_height_sampling';
  }
  if (source.includes('/src/systems/combat/combatantmovement.ts')) {
    return 'combat_movement_terrain_queries';
  }
  if (source.includes('/src/systems/combat/influencemapcomputations.ts')) {
    return 'combat_influence_map';
  }
  if (source.includes('/src/systems/combat/spatialoctreequeries.ts')) {
    return 'combat_spatial_queries';
  }
  if (source.includes('/src/systems/combat/clustermanager.ts')) {
    return 'combat_cluster_runtime';
  }
  if (source.includes('/src/systems/combat/combatantlodmanager.ts')) {
    return 'combat_lod_runtime';
  }
  if (source.includes('/src/systems/combat/ai/aitargetacquisition.ts')) {
    return 'combat_target_acquisition';
  }
  if (source.includes('/src/systems/combat/combatanthitdetection.ts')) {
    return 'combat_hit_detection';
  }
  if (source.includes('/src/systems/combat/combatantrenderinterpolator.ts')) {
    return 'combat_render_interpolation';
  }
  if (source.includes('/src/systems/combat/combatantmeshfactory.ts')) {
    return 'combat_mesh_factory';
  }
  if (source.includes('/src/systems/debug/performancetelemetry.ts')) {
    return 'performance_telemetry';
  }
  if (source.includes('/src/systems/effects/impacteffectspool.ts')) {
    return 'effects_impact_pool';
  }
  if (source.includes('/src/core/systemupdater.ts')) {
    return 'system_updater_runtime';
  }
  if (source.includes('/src/ui/minimap/minimaprenderer.ts')) {
    return 'minimap_renderer_runtime';
  }
  if (source.includes('/node_modules/.vite/deps/@recast-navigation_core')) {
    return 'recast_navigation_runtime';
  }
  if (
    name === 'applyTerrainAwareVelocity' ||
    name === 'getHeightAt' ||
    name === 'computeDirectionalSpeedFactor' ||
    name === 'sampleSupportNormal' ||
    url.includes('PersistenceSystem')
  ) {
    return 'combat_movement_and_terrain_height_queries';
  }
  if (
    name === 'getImpostorViewTile' ||
    name === 'solveArmToTarget' ||
    name === 'setBoneDirectionWorld' ||
    name === 'updateWeaponSocket' ||
    name === 'ensureImpostorBucket'
  ) {
    return 'pixel_forge_npc_animation_and_impostor_runtime';
  }
  if (url.includes('/three-') || url.includes('\\three-')) {
    return 'three_renderer_math_and_skinning';
  }
  if (name === 'join' || name === 'sort' || name === 'evaluate') {
    return 'native_array_string_or_eval_churn';
  }
  if (url.includes('/index-') || url.includes('\\index-')) {
    return 'gameplay_bundle_other';
  }
  return 'browser_or_unknown';
}

function sourceUrlSummaries(nodes: FlatNode[], totalBytes: number): SourceUrlSummary[] {
  const grouped = new Map<string, { bytes: number; nodeCount: number; categoryBytes: Map<string, number> }>();
  for (const node of nodes) {
    const url = sourceUrlLabel(node.url);
    const entry = grouped.get(url) ?? { bytes: 0, nodeCount: 0, categoryBytes: new Map<string, number>() };
    entry.bytes += node.selfSizeBytes;
    entry.nodeCount += 1;
    entry.categoryBytes.set(node.category, (entry.categoryBytes.get(node.category) ?? 0) + node.selfSizeBytes);
    grouped.set(url, entry);
  }
  return [...grouped.entries()]
    .map(([url, entry]) => {
      const category = [...entry.categoryBytes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'browser_or_unknown';
      return {
        url,
        category,
        mb: round(mb(entry.bytes)) ?? 0,
        percent: round(totalBytes > 0 ? (entry.bytes / totalBytes) * 100 : 0, 2) ?? 0,
        nodeCount: entry.nodeCount,
      };
    })
    .sort((a, b) => b.mb - a.mb)
    .slice(0, 30);
}

function flattenProfile(profile: HeapSamplingProfile): FlatNode[] {
  const results: FlatNode[] = [];
  const visit = (node: HeapProfileNode, stack: string[]): void => {
    const callFrame = node.callFrame ?? {};
    const functionName = callFrame.functionName || '(anonymous)';
    const url = callFrame.url ?? '';
    const nextStack = [...stack, `${functionName}@${sourceLabel({
      url,
      lineNumber: typeof callFrame.lineNumber === 'number' ? callFrame.lineNumber : null,
      columnNumber: typeof callFrame.columnNumber === 'number' ? callFrame.columnNumber : null,
    })}`];
    results.push({
      id: node.id,
      selfSizeBytes: Number(node.selfSize ?? 0),
      functionName,
      url,
      lineNumber: typeof callFrame.lineNumber === 'number' ? callFrame.lineNumber : null,
      columnNumber: typeof callFrame.columnNumber === 'number' ? callFrame.columnNumber : null,
      stack: nextStack.slice(-8),
      category: classifyNode(functionName, url),
    });
    for (const child of node.children ?? []) {
      visit(child, nextStack);
    }
  };
  if (profile.head) {
    visit(profile.head, []);
  }
  return results;
}

function topByKey(nodes: FlatNode[], key: (node: FlatNode) => string): FlatNode[] {
  const grouped = new Map<string, FlatNode>();
  for (const node of nodes) {
    const groupKey = key(node);
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.selfSizeBytes += node.selfSizeBytes;
    } else {
      grouped.set(groupKey, { ...node, stack: [...node.stack] });
    }
  }
  return [...grouped.values()].sort((a, b) => b.selfSizeBytes - a.selfSizeBytes);
}

function categorySummaries(nodes: FlatNode[], totalBytes: number): CategorySummary[] {
  const grouped = new Map<string, FlatNode[]>();
  for (const node of nodes) {
    const entries = grouped.get(node.category) ?? [];
    entries.push(node);
    grouped.set(node.category, entries);
  }
  return [...grouped.entries()]
    .map(([category, entries]) => {
      const bytes = entries.reduce((sum, node) => sum + node.selfSizeBytes, 0);
      const topFrames = topByKey(entries, (node) => `${node.functionName}|${sourceLabel(node)}`)
        .slice(0, 5)
        .map((node) => ({
          functionName: node.functionName,
          source: sourceLabel(node),
          mb: round(mb(node.selfSizeBytes)) ?? 0,
          percent: round(totalBytes > 0 ? (node.selfSizeBytes / totalBytes) * 100 : 0, 2) ?? 0,
        }));
      return {
        category,
        bytes,
        mb: round(mb(bytes)) ?? 0,
        percent: round(totalBytes > 0 ? (bytes / totalBytes) * 100 : 0, 2) ?? 0,
        nodeCount: entries.length,
        topFrames,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

function consoleSignals(consolePath: string | null): Record<string, number> {
  if (!consolePath || !existsSync(consolePath)) return {};
  const entries = readJson<ConsoleEntry[]>(consolePath);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const text = String(entry.text ?? entry.message ?? '');
    const key = text.includes('stalled on terrain')
      ? 'terrain_stall_backtracking'
      : text.includes('additional terrain-stall recoveries suppressed')
      ? 'terrain_stall_suppression_summary'
      : text.includes('AI budget')
      ? 'ai_budget_warning'
      : text.includes('SystemUpdater')
      ? 'system_budget_warning'
      : text.includes('preloaded')
      ? 'unused_preload_warning'
      : text.slice(0, 100);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function heapWindow(samples: RuntimeSample[]): AttributionReport['heapWindow'] {
  const heapSamples = samples.filter((sample) => typeof sample.heapUsedMb === 'number');
  const baselineValues = heapSamples.slice(0, Math.max(3, Math.ceil(heapSamples.length * 0.05))).map((sample) => Number(sample.heapUsedMb));
  const baselineMb = baselineValues.length > 0
    ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
    : null;
  const peakSample = heapSamples.slice().sort((a, b) => Number(b.heapUsedMb) - Number(a.heapUsedMb))[0] ?? null;
  const endSample = heapSamples[heapSamples.length - 1] ?? null;
  const peakMb = peakSample ? Number(peakSample.heapUsedMb) : null;
  const endMb = endSample ? Number(endSample.heapUsedMb) : null;
  const peakGrowthMb = peakMb !== null && baselineMb !== null ? peakMb - baselineMb : null;
  const endGrowthMb = endMb !== null && baselineMb !== null ? endMb - baselineMb : null;
  const recoveryRatio = peakGrowthMb !== null && peakGrowthMb > 0 && peakMb !== null && endMb !== null
    ? (peakMb - endMb) / peakGrowthMb
    : null;
  return {
    sampleCount: heapSamples.length,
    baselineMb: round(baselineMb),
    peakMb: round(peakMb),
    endMb: round(endMb),
    peakGrowthMb: round(peakGrowthMb),
    endGrowthMb: round(endGrowthMb),
    recoveryRatio: round(recoveryRatio, 4),
    peakSample,
    endSample,
  };
}

function markdown(report: AttributionReport): string {
  return [
    '# Projekt Objekt-143 Heap Sampling Attribution',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source capture: ${report.inputs.artifactDir}`,
    `Heap sampling: ${report.inputs.heapSampling}`,
    '',
    '## Source Result',
    '',
    `- Validation: ${report.sourceSummary.validation}`,
    `- Measurement trust: ${report.sourceSummary.measurementTrust}`,
    `- Failure reason: ${report.sourceSummary.failureReason ?? 'none'}`,
    `- Avg frame: ${report.validationHighlights.avg_frame_ms?.value ?? 'n/a'}`,
    `- Peak p99: ${report.validationHighlights.peak_p99_frame_ms?.value ?? 'n/a'}`,
    `- Heap end-growth: ${report.validationHighlights.heap_growth_mb?.value ?? 'n/a'}`,
    `- Heap peak-growth: ${report.validationHighlights.heap_peak_growth_mb?.value ?? 'n/a'}`,
    `- Heap recovery: ${report.validationHighlights.heap_recovery_ratio?.value ?? 'n/a'}`,
    '',
    '## Allocation Categories',
    '',
    ...report.samplingProfile.categories.map((entry) =>
      `- ${entry.category}: ${entry.mb} MB (${entry.percent}%)`
    ),
    '',
    '## Top Frames',
    '',
    ...report.samplingProfile.topNodes.slice(0, 12).map((entry) =>
      `- ${entry.mb} MB (${entry.percent}%) ${entry.functionName} ${entry.source} [${entry.category}]`
    ),
    '',
    '## Source URL Totals',
    '',
    ...report.samplingProfile.sourceUrlTotals.slice(0, 15).map((entry) =>
      `- ${entry.mb} MB (${entry.percent}%) ${entry.url} [${entry.category}]`
    ),
    '',
    '## Findings',
    '',
    ...report.findings.map((item) => `- ${item}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((item) => `- ${item}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function buildReport(artifactDir: string, outputDir: string): AttributionReport {
  const summaryPath = join(artifactDir, 'summary.json');
  const runtimeSamplesPath = join(artifactDir, 'runtime-samples.json');
  const validationPath = join(artifactDir, 'validation.json');
  const measurementTrustPath = join(artifactDir, 'measurement-trust.json');
  const consolePath = join(artifactDir, 'console.json');
  const heapSamplingPath = join(artifactDir, 'heap-sampling.json');
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${artifactDir}`);
  if (!existsSync(runtimeSamplesPath)) throw new Error(`Missing runtime-samples.json in ${artifactDir}`);
  if (!existsSync(heapSamplingPath)) throw new Error(`Missing heap-sampling.json in ${artifactDir}`);

  const summary = readJson<PerfSummary>(summaryPath);
  const samples = readJson<RuntimeSample[]>(runtimeSamplesPath);
  const profile = readJson<HeapSamplingProfile>(heapSamplingPath);
  const nodes = flattenProfile(profile).filter((node) => node.selfSizeBytes > 0);
  const totalBytes = nodes.reduce((sum, node) => sum + node.selfSizeBytes, 0);
  const groupedTopNodes = topByKey(nodes, (node) => `${node.functionName}|${sourceLabel(node)}|${node.category}`);
  const categories = categorySummaries(nodes, totalBytes);
  const primaryOwners = categories.slice(0, 4).map((entry) => entry.category);
  const validationHighlights = {
    avg_frame_ms: validationCheck(summary, 'avg_frame_ms'),
    peak_p99_frame_ms: validationCheck(summary, 'peak_p99_frame_ms'),
    heap_growth_mb: validationCheck(summary, 'heap_growth_mb'),
    heap_peak_growth_mb: validationCheck(summary, 'heap_peak_growth_mb'),
    heap_recovery_ratio: validationCheck(summary, 'heap_recovery_ratio'),
    measurement_trust: validationCheck(summary, 'measurement_trust'),
  };
  const sampleCount = Array.isArray(profile.samples) ? profile.samples.length : 0;
  const allocationShape = totalBytes > 1024 * 1024 * 1024
    ? 'high_churn_sampling_profile'
    : 'bounded_sampling_profile';
  const reportPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-heap-sampling-attribution',
    status: 'warn',
    inputs: {
      artifactDir: rel(artifactDir) ?? artifactDir,
      summary: rel(summaryPath) ?? summaryPath,
      runtimeSamples: rel(runtimeSamplesPath) ?? runtimeSamplesPath,
      validation: existsSync(validationPath) ? rel(validationPath) : null,
      measurementTrust: existsSync(measurementTrustPath) ? rel(measurementTrustPath) : null,
      console: existsSync(consolePath) ? rel(consolePath) : null,
      heapSampling: rel(heapSamplingPath) ?? heapSamplingPath,
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
    validationHighlights,
    heapWindow: heapWindow(samples),
    samplingProfile: {
      sampledNodeCount: nodes.length,
      sampledAllocationCount: sampleCount,
      totalSelfSizeMb: round(mb(totalBytes)) ?? 0,
      topNodes: groupedTopNodes.slice(0, 40).map((node) => ({
        functionName: node.functionName,
        source: sourceLabel(node),
        mb: round(mb(node.selfSizeBytes)) ?? 0,
        percent: round(totalBytes > 0 ? (node.selfSizeBytes / totalBytes) * 100 : 0, 2) ?? 0,
        category: node.category,
        stack: node.stack,
      })),
      categories,
      sourceUrlTotals: sourceUrlSummaries(nodes, totalBytes),
    },
    consoleSignals: consoleSignals(existsSync(consolePath) ? consolePath : null),
    classification: {
      allocationShape,
      primaryOwners,
      acceptance: 'rejected',
    },
    findings: [
      `Heap sampling captured ${sampleCount} allocation samples and ${round(mb(totalBytes))} MB of sampled self-size allocation volume.`,
      `Top allocation categories are ${primaryOwners.join(', ')}.`,
      `Top source URLs are ${sourceUrlSummaries(nodes, totalBytes).slice(0, 5).map((entry) => entry.url).join(', ')}.`,
      'The sample identifies allocation churn owners; it does not prove retained heap ownership because the capture includes objects collected by major and minor GC.',
    ],
    nextActions: [
      'Do not refresh the combat120 baseline from this capture.',
      'Inspect the top gameplay allocation owners before applying another cap: combat movement/terrain height query churn and Pixel Forge NPC animation/impostor runtime churn.',
      'If production-bundle frames remain too minified for owner assignment, run a dev-shape deep-CDP attribution capture or add source-map-backed profile symbolication before changing runtime policy.',
    ],
    nonClaims: [
      'This attribution does not prove a heap fix.',
      'This attribution does not certify close-actor visual acceptance.',
      'This attribution does not prove retained renderer-resource growth.',
      'This attribution does not authorize perf-baselines.json refresh.',
    ],
    files: {
      summary: rel(reportPath) ?? reportPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };
}

function main(): void {
  const artifactArg = argValue('--artifact');
  if (!artifactArg) {
    throw new Error('Usage: npx tsx scripts/projekt-143-heap-sampling-attribution.ts --artifact <perf-artifact-dir>');
  }
  const artifactDir = resolve(process.cwd(), artifactArg);
  const outputDir = resolve(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(artifactDir, outputDir);
  writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'summary.md'), markdown(report), 'utf-8');
  statSync(join(outputDir, 'summary.json'));
  console.log(`Projekt 143 heap sampling attribution ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`source=${report.inputs.heapSampling}`);
  console.log(`sampledAllocationCount=${report.samplingProfile.sampledAllocationCount}`);
  console.log(`totalSelfSizeMb=${report.samplingProfile.totalSelfSizeMb}`);
  console.log(`topCategories=${report.classification.primaryOwners.join(',')}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-heap-sampling-attribution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
