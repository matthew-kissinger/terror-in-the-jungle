#!/usr/bin/env tsx

/**
 * Performance comparison script.
 *
 * Reads the latest perf capture artifact and compares metrics against
 * baselines defined in perf-baselines.json.
 *
 * Exit codes:
 *   0 = all pass
 *   1 = any warn (no fail)
 *   2 = any fail
 *
 * Usage:
 *   npx tsx scripts/perf-compare.ts
 *   npx tsx scripts/perf-compare.ts --scenario combat120
 *   npx tsx scripts/perf-compare.ts --update-baseline combat120
 *   npx tsx scripts/perf-compare.ts --dir 2026-02-21T16-35-52-406Z
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuntimeSample = {
  ts: string;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch33Count?: number;
  hitch50Count?: number;
  hitch100Count?: number;
  combatantCount: number;
  overBudgetPercent: number;
  heapUsedMb?: number;
  heapTotalMb?: number;
};

type ValidationCheck = {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  value: number;
  message: string;
};

type ValidationReport = {
  overall: 'pass' | 'warn' | 'fail';
  checks: ValidationCheck[];
};

type CaptureSummary = {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  npcs: number;
  requestedNpcs: number;
  status: 'ok' | 'failed';
  failureReason?: string;
  finalFrameCount: number;
  validation: ValidationReport;
  scenario: {
    mode: string;
    requestedMode: string;
  };
};

type Threshold = { pass: number; warn: number };

type ScenarioBaseline = {
  description: string;
  thresholds: Record<string, Threshold>;
  lastMeasured?: {
    date: string;
    artifactDir: string;
    [key: string]: unknown;
  };
};

type BaselineFile = {
  version: number;
  lastUpdated: string;
  scenarios: Record<string, ScenarioBaseline>;
};

type ExtractedMetrics = {
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch50Pct: number;
  hitch100Pct: number;
  overBudgetPct: number;
  heapGrowthMb: number;
  sampleCount: number;
  durationSeconds: number;
  npcs: number;
  mode: string;
  status: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const BASELINE_PATH = join(process.cwd(), 'perf-baselines.json');

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function listCaptureDirs(): string[] {
  if (!existsSync(ARTIFACT_ROOT)) return [];
  return readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function loadBaselines(): BaselineFile | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineFile;
  } catch {
    return null;
  }
}

function saveBaselines(baselines: BaselineFile): void {
  writeFileSync(BASELINE_PATH, JSON.stringify(baselines, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Metric extraction
// ---------------------------------------------------------------------------

function extractMetrics(
  summary: CaptureSummary,
  samples: RuntimeSample[],
  validation: ValidationReport | null
): ExtractedMetrics {
  const avgFrameMs = avg(samples.map(s => s.avgFrameMs));
  const p95FrameMs = samples.length > 0
    ? Math.max(...samples.map(s => s.p95FrameMs))
    : 0;
  const p99FrameMs = samples.length > 0
    ? Math.max(...samples.map(s => Number(s.p99FrameMs ?? 0)))
    : 0;
  const maxFrameMs = samples.length > 0
    ? Math.max(...samples.map(s => Number(s.maxFrameMs ?? 0)))
    : 0;

  const avgOverBudget = avg(samples.map(s => s.overBudgetPercent));

  // Hitch percentages from validation checks if available
  let hitch50Pct = 0;
  let hitch100Pct = 0;
  if (validation) {
    const h50 = validation.checks.find(c => c.id === 'hitch_50ms_percent');
    const h100 = validation.checks.find(c => c.id === 'hitch_100ms_percent');
    if (h50) hitch50Pct = h50.value;
    if (h100) hitch100Pct = h100.value;
  }

  // Heap growth: last sample heap - average of first 3 samples
  const heapSamples = samples.filter(s => typeof s.heapUsedMb === 'number');
  let heapGrowthMb = 0;
  if (heapSamples.length >= 2) {
    const baselineCount = Math.min(3, heapSamples.length);
    const baselineHeap = avg(heapSamples.slice(0, baselineCount).map(s => Number(s.heapUsedMb ?? 0)));
    const endHeap = Number(heapSamples[heapSamples.length - 1].heapUsedMb ?? 0);
    heapGrowthMb = endHeap - baselineHeap;
  }
  // Also check validation if samples don't have heap data
  if (heapGrowthMb === 0 && validation) {
    const hg = validation.checks.find(c => c.id === 'heap_growth_mb');
    if (hg) heapGrowthMb = hg.value;
  }

  return {
    avgFrameMs,
    p95FrameMs,
    p99FrameMs,
    maxFrameMs,
    hitch50Pct,
    hitch100Pct,
    overBudgetPct: avgOverBudget,
    heapGrowthMb,
    sampleCount: samples.length,
    durationSeconds: summary.durationSeconds,
    npcs: summary.npcs,
    mode: summary.scenario?.mode ?? 'unknown',
    status: summary.status,
  };
}

// ---------------------------------------------------------------------------
// Scenario auto-detection
// ---------------------------------------------------------------------------

function detectScenario(metrics: ExtractedMetrics): string | null {
  const mode = metrics.mode;
  if (mode === 'ai_sandbox' && metrics.npcs >= 100) return 'combat120';
  if (mode === 'open_frontier') return 'openFrontier';
  if (mode === 'a_shau_valley') return 'ashau';
  // Fallback: try to guess from NPC count and mode
  if (mode === 'ai_sandbox') return 'combat120';
  return null;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

type ComparisonRow = {
  metric: string;
  value: number;
  unit: string;
  passThreshold: number;
  warnThreshold: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  lastMeasured?: number;
};

function compareMetric(
  name: string,
  value: number,
  unit: string,
  threshold: Threshold,
  lastMeasured?: number
): ComparisonRow {
  let status: 'PASS' | 'WARN' | 'FAIL';
  if (value <= threshold.pass) {
    status = 'PASS';
  } else if (value <= threshold.warn) {
    status = 'WARN';
  } else {
    status = 'FAIL';
  }
  return {
    metric: name,
    value,
    unit,
    passThreshold: threshold.pass,
    warnThreshold: threshold.warn,
    status,
    lastMeasured,
  };
}

function buildComparison(
  metrics: ExtractedMetrics,
  scenario: ScenarioBaseline
): ComparisonRow[] {
  const t = scenario.thresholds;
  const lm = scenario.lastMeasured as Record<string, unknown> | undefined;
  const rows: ComparisonRow[] = [];

  if (t.avgFrameMs) rows.push(compareMetric('avgFrameMs', metrics.avgFrameMs, 'ms', t.avgFrameMs, Number(lm?.avgFrameMs ?? 0) || undefined));
  if (t.p95FrameMs) rows.push(compareMetric('p95FrameMs', metrics.p95FrameMs, 'ms', t.p95FrameMs, Number(lm?.p95FrameMs ?? 0) || undefined));
  if (t.p99FrameMs) rows.push(compareMetric('p99FrameMs', metrics.p99FrameMs, 'ms', t.p99FrameMs, Number(lm?.p99FrameMs ?? 0) || undefined));
  if (t.maxFrameMs) rows.push(compareMetric('maxFrameMs', metrics.maxFrameMs, 'ms', t.maxFrameMs, Number(lm?.maxFrameMs ?? 0) || undefined));
  if (t.hitch50Pct) rows.push(compareMetric('hitch50Pct', metrics.hitch50Pct, '%', t.hitch50Pct, Number(lm?.hitch50Pct ?? 0) || undefined));
  if (t.hitch100Pct) rows.push(compareMetric('hitch100Pct', metrics.hitch100Pct, '%', t.hitch100Pct, Number(lm?.hitch100Pct ?? 0) || undefined));
  if (t.overBudgetPct) rows.push(compareMetric('overBudgetPct', metrics.overBudgetPct, '%', t.overBudgetPct, Number(lm?.overBudgetPct ?? 0) || undefined));
  if (t.heapGrowthMb) rows.push(compareMetric('heapGrowthMb', metrics.heapGrowthMb, 'MB', t.heapGrowthMb, Number(lm?.heapGrowthMb ?? 0) || undefined));

  return rows;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printTable(rows: ComparisonRow[]): void {
  const header = [
    'Metric'.padEnd(16),
    'Value'.padStart(10),
    'Pass'.padStart(8),
    'Warn'.padStart(8),
    'Last'.padStart(10),
    'Status'.padStart(8),
  ].join('  ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of rows) {
    const valStr = `${r.value.toFixed(2)} ${r.unit}`;
    const passStr = `<${r.passThreshold}`;
    const warnStr = `<${r.warnThreshold}`;
    const lastStr = r.lastMeasured !== undefined ? `${r.lastMeasured.toFixed(2)}` : '-';
    const statusIcon = r.status === 'PASS' ? '  PASS' : r.status === 'WARN' ? '  WARN' : ' *FAIL';

    console.log([
      r.metric.padEnd(16),
      valStr.padStart(10),
      passStr.padStart(8),
      warnStr.padStart(8),
      lastStr.padStart(10),
      statusIcon.padStart(8),
    ].join('  '));
  }
}

function printMetricsSummary(metrics: ExtractedMetrics, artifactDir: string): void {
  console.log(`\nArtifact: ${artifactDir}`);
  console.log(`Mode: ${metrics.mode} | NPCs: ${metrics.npcs} | Duration: ${metrics.durationSeconds}s | Samples: ${metrics.sampleCount} | Status: ${metrics.status}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Update baseline
// ---------------------------------------------------------------------------

function updateBaseline(
  baselines: BaselineFile,
  scenarioName: string,
  metrics: ExtractedMetrics,
  artifactDirName: string
): void {
  if (!baselines.scenarios[scenarioName]) {
    console.error(`Unknown scenario: ${scenarioName}. Available: ${Object.keys(baselines.scenarios).join(', ')}`);
    process.exit(2);
  }

  baselines.scenarios[scenarioName].lastMeasured = {
    date: new Date().toISOString().slice(0, 10),
    artifactDir: artifactDirName,
    avgFrameMs: Number(metrics.avgFrameMs.toFixed(2)),
    p95FrameMs: Number(metrics.p95FrameMs.toFixed(2)),
    p99FrameMs: Number(metrics.p99FrameMs.toFixed(2)),
    maxFrameMs: Number(metrics.maxFrameMs.toFixed(2)),
    hitch50Pct: Number(metrics.hitch50Pct.toFixed(3)),
    hitch100Pct: Number(metrics.hitch100Pct.toFixed(3)),
    overBudgetPct: Number(metrics.overBudgetPct.toFixed(2)),
    heapGrowthMb: Number(metrics.heapGrowthMb.toFixed(2)),
  };
  baselines.lastUpdated = new Date().toISOString().slice(0, 10);

  saveBaselines(baselines);
  console.log(`Updated baseline for "${scenarioName}" from artifact ${artifactDirName}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { scenario?: string; updateBaseline?: string; dir?: string } {
  const args = process.argv.slice(2);
  const result: { scenario?: string; updateBaseline?: string; dir?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      result.scenario = args[++i];
    } else if (args[i] === '--update-baseline') {
      // --update-baseline with optional scenario name
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        result.updateBaseline = args[++i];
      } else {
        result.updateBaseline = 'auto';
      }
    } else if (args[i] === '--dir' && args[i + 1]) {
      result.dir = args[++i];
    }
  }

  return result;
}

function main(): void {
  const opts = parseArgs();

  // Find artifact directory
  const dirs = listCaptureDirs();
  if (dirs.length === 0) {
    console.error('No capture artifacts found under artifacts/perf/');
    process.exit(2);
  }

  let targetDir: string;
  if (opts.dir) {
    if (!dirs.includes(opts.dir)) {
      console.error(`Artifact directory not found: ${opts.dir}`);
      process.exit(2);
    }
    targetDir = opts.dir;
  } else {
    targetDir = dirs[dirs.length - 1];
  }

  const artifactPath = join(ARTIFACT_ROOT, targetDir);
  const summaryPath = join(artifactPath, 'summary.json');
  const samplesPath = join(artifactPath, 'runtime-samples.json');
  const validationPath = join(artifactPath, 'validation.json');

  if (!existsSync(summaryPath)) {
    console.error(`Missing summary.json in ${artifactPath}`);
    process.exit(2);
  }

  // Load artifact data
  const summary = JSON.parse(readFileSync(summaryPath, 'utf-8')) as CaptureSummary;
  const samples: RuntimeSample[] = existsSync(samplesPath)
    ? JSON.parse(readFileSync(samplesPath, 'utf-8'))
    : [];
  const validation: ValidationReport | null = existsSync(validationPath)
    ? JSON.parse(readFileSync(validationPath, 'utf-8'))
    : null;

  if (summary.status === 'failed') {
    console.error(`Capture failed: ${summary.failureReason ?? 'unknown reason'}`);
    console.error(`Artifact: ${artifactPath}`);
    process.exit(2);
  }

  // Extract metrics
  const metrics = extractMetrics(summary, samples, validation);
  printMetricsSummary(metrics, artifactPath);

  // Load baselines
  const baselines = loadBaselines();
  if (!baselines) {
    console.log('No perf-baselines.json found. Printing raw metrics only.\n');
    console.log(`avgFrameMs:    ${metrics.avgFrameMs.toFixed(2)} ms`);
    console.log(`p95FrameMs:    ${metrics.p95FrameMs.toFixed(2)} ms`);
    console.log(`p99FrameMs:    ${metrics.p99FrameMs.toFixed(2)} ms`);
    console.log(`maxFrameMs:    ${metrics.maxFrameMs.toFixed(2)} ms`);
    console.log(`hitch50Pct:    ${metrics.hitch50Pct.toFixed(3)}%`);
    console.log(`hitch100Pct:   ${metrics.hitch100Pct.toFixed(3)}%`);
    console.log(`overBudgetPct: ${metrics.overBudgetPct.toFixed(2)}%`);
    console.log(`heapGrowthMb:  ${metrics.heapGrowthMb.toFixed(2)} MB`);
    process.exit(0);
  }

  // Determine scenario
  let scenarioName = opts.scenario ?? null;
  if (!scenarioName) {
    scenarioName = detectScenario(metrics);
  }

  // Handle --update-baseline
  if (opts.updateBaseline) {
    const updateTarget = opts.updateBaseline === 'auto'
      ? (scenarioName ?? null)
      : opts.updateBaseline;

    if (!updateTarget) {
      console.error('Cannot auto-detect scenario for baseline update. Use --update-baseline <scenario>');
      process.exit(2);
    }

    updateBaseline(baselines, updateTarget, metrics, targetDir);
    process.exit(0);
  }

  if (!scenarioName || !baselines.scenarios[scenarioName]) {
    console.log(`Could not match artifact (mode=${metrics.mode}, npcs=${metrics.npcs}) to a known scenario.`);
    console.log(`Available scenarios: ${Object.keys(baselines.scenarios).join(', ')}`);
    console.log('Use --scenario <name> to specify explicitly.\n');

    // Still print raw metrics
    console.log(`avgFrameMs:    ${metrics.avgFrameMs.toFixed(2)} ms`);
    console.log(`p95FrameMs:    ${metrics.p95FrameMs.toFixed(2)} ms`);
    console.log(`p99FrameMs:    ${metrics.p99FrameMs.toFixed(2)} ms`);
    console.log(`maxFrameMs:    ${metrics.maxFrameMs.toFixed(2)} ms`);
    console.log(`hitch50Pct:    ${metrics.hitch50Pct.toFixed(3)}%`);
    console.log(`hitch100Pct:   ${metrics.hitch100Pct.toFixed(3)}%`);
    console.log(`overBudgetPct: ${metrics.overBudgetPct.toFixed(2)}%`);
    console.log(`heapGrowthMb:  ${metrics.heapGrowthMb.toFixed(2)} MB`);
    process.exit(0);
  }

  const scenario = baselines.scenarios[scenarioName];
  console.log(`Scenario: ${scenarioName} - ${scenario.description}\n`);

  // Compare against thresholds
  const rows = buildComparison(metrics, scenario);
  printTable(rows);

  // Determine overall status
  const hasFail = rows.some(r => r.status === 'FAIL');
  const hasWarn = rows.some(r => r.status === 'WARN');

  const passCount = rows.filter(r => r.status === 'PASS').length;
  const warnCount = rows.filter(r => r.status === 'WARN').length;
  const failCount = rows.filter(r => r.status === 'FAIL').length;

  console.log('');
  console.log(`Result: ${passCount} pass, ${warnCount} warn, ${failCount} fail`);

  if (hasFail) {
    console.log('\nFAIL - one or more metrics exceeded fail threshold');
    process.exit(2);
  } else if (hasWarn) {
    console.log('\nWARN - one or more metrics exceeded pass threshold but within warn limit');
    process.exit(1);
  } else {
    console.log('\nPASS - all metrics within acceptable range');
    process.exit(0);
  }
}

main();
