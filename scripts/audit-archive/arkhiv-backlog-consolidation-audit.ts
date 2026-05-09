#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'fail';

interface Check {
  id: string;
  status: Status;
  detail: string;
}

interface BacklogAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-arkhiv-backlog-consolidation-audit';
  status: Status;
  backlogPath: string;
  summary: {
    lineCount: number;
    maxLines: number;
    checks: number;
    passed: number;
    failed: number;
    requiredCycleResults: number;
    missingCycleResults: number;
  };
  checks: Check[];
  missingCycleResults: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-arkhiv-backlog-consolidation-audit';
const BACKLOG_PATH = 'docs/BACKLOG.md';
const MAX_LINES = 200;
const REQUIRED_TERMS = [
  'Active directives live in',
  'docs/PROJEKT_OBJEKT_143.md',
  'Article III',
  'Strategic Reserve',
  'docs/cycles/<cycle-id>/RESULT.md',
  'ARKHIV-2 contract',
  'VODA-1',
  'VEKHIKL-1',
  'AVIATSIYA-3',
  'SVYAZ-1',
  'UX-1',
  'STABILIZAT-1',
  'DEFEKT-3',
  'ARKHIV-2',
  'Phase F Candidates',
  'Historical Cycle Index',
];
const FORBIDDEN_TERMS = [
  '### Round 1',
  '### Round 2',
  '### Round 3',
  'PR #',
  'Six merged PRs across',
  'Thirteen merged PRs across',
];
const REQUIRED_CYCLE_RESULTS = [
  'docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md',
  'docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md',
  'docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md',
  'docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md',
  'docs/cycles/cycle-2026-04-21-stabilization-reset/RESULT.md',
  'docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/RESULT.md',
  'docs/cycles/cycle-2026-04-20-atmosphere-foundation/RESULT.md',
  'docs/cycles/cycle-2026-04-18-harness-flight-combat/RESULT.md',
  'docs/cycles/cycle-2026-04-18-rebuild-foundation/RESULT.md',
  'docs/cycles/cycle-2026-04-17-drift-correction-run/RESULT.md',
  'docs/cycles/cycle-2026-04-06-vehicle-stack-foundation/RESULT.md',
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function outputDir(): string {
  const explicit = argValue('--out-dir');
  if (explicit) return resolve(explicit);
  return join(process.cwd(), 'artifacts', 'perf', new Date().toISOString().replaceAll(':', '-'), OUTPUT_NAME);
}

function pass(id: string, detail: string): Check {
  return { id, status: 'pass', detail };
}

function fail(id: string, detail: string): Check {
  return { id, status: 'fail', detail };
}

function buildReport(outDir: string): BacklogAudit {
  if (!existsSync(BACKLOG_PATH)) {
    throw new Error(`Missing backlog: ${BACKLOG_PATH}`);
  }
  const text = readFileSync(BACKLOG_PATH, 'utf-8');
  const lines = text.split(/\r?\n/).length;
  const missingTerms = REQUIRED_TERMS.filter((term) => !text.includes(term));
  const forbiddenTerms = FORBIDDEN_TERMS.filter((term) => text.includes(term));
  const missingCycleResults = REQUIRED_CYCLE_RESULTS.filter((path) => !existsSync(path));
  const outputJson = join(outDir, 'backlog-consolidation-audit.json');
  const outputMd = join(outDir, 'backlog-consolidation-audit.md');

  const checks: Check[] = [
    lines <= MAX_LINES
      ? pass('line-count', `Backlog has ${lines} measured lines, ceiling ${MAX_LINES}.`)
      : fail('line-count', `Backlog has ${lines} measured lines, ceiling ${MAX_LINES}.`),
    missingTerms.length === 0
      ? pass('routing-terms', 'Backlog carries required directive and reserve routing terms.')
      : fail('routing-terms', `Missing terms: ${missingTerms.join(', ')}`),
    forbiddenTerms.length === 0
      ? pass('historical-pruning', 'Backlog no longer carries long PR/round cycle logs.')
      : fail('historical-pruning', `Forbidden terms remain: ${forbiddenTerms.join(', ')}`),
    missingCycleResults.length === 0
      ? pass('cycle-results', `${REQUIRED_CYCLE_RESULTS.length} required RESULT records exist.`)
      : fail('cycle-results', `Missing RESULT records: ${missingCycleResults.join(', ')}`),
  ];
  const failed = checks.filter((check) => check.status === 'fail').length;

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-arkhiv-backlog-consolidation-audit',
    status: failed === 0 ? 'pass' : 'fail',
    backlogPath: BACKLOG_PATH,
    summary: {
      lineCount: lines,
      maxLines: MAX_LINES,
      checks: checks.length,
      passed: checks.filter((check) => check.status === 'pass').length,
      failed,
      requiredCycleResults: REQUIRED_CYCLE_RESULTS.length,
      missingCycleResults: missingCycleResults.length,
    },
    checks,
    missingCycleResults,
    nextActions: [
      'Keep active directive status in docs/PROJEKT_OBJEKT_143.md Article III.',
      'Add future historical cycle detail to docs/cycles/<cycle-id>/RESULT.md instead of docs/BACKLOG.md.',
      'Rerun this audit when the backlog changes.',
    ],
    nonClaims: [
      'This packet does not validate runtime behavior.',
      'This packet does not prove production deployment state.',
      'This packet does not satisfy Article VII closeout.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: BacklogAudit): string {
  return [
    '# Projekt 143 ARKHIV Backlog Consolidation Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Backlog: ${report.backlogPath}`,
    `Lines: ${report.summary.lineCount}/${report.summary.maxLines}`,
    `Checks: ${report.summary.passed}/${report.summary.checks} passed`,
    '',
    '## Checks',
    ...report.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.detail}`),
    '',
    '## Missing Cycle Results',
    ...(report.missingCycleResults.length > 0 ? report.missingCycleResults.map((path) => `- ${path}`) : ['- none']),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const report = buildReport(outDir);
  writeFileSync(join(outDir, 'backlog-consolidation-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'backlog-consolidation-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 ARKHIV backlog consolidation audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`lines=${report.summary.lineCount}/${report.summary.maxLines} checks=${report.summary.passed}/${report.summary.checks} cycleResults=${report.summary.requiredCycleResults - report.summary.missingCycleResults}/${report.summary.requiredCycleResults}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-arkhiv-backlog-consolidation-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
