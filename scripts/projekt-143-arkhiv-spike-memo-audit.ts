#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'fail';

interface SpikeMemo {
  id: string;
  branch: string;
  localPaths: string[];
  branchMemoPaths: string[];
  foldedTerms: string[];
}

interface Check {
  id: string;
  status: Status;
  detail: string;
}

interface SpikeMemoResult {
  id: string;
  branch: string;
  branchSha: string | null;
  branchExists: boolean;
  branchMemoPaths: string[];
  missingBranchMemoPaths: string[];
  localPaths: string[];
  missingLocalPaths: string[];
}

interface SpikeMemoAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-arkhiv-spike-memo-audit';
  status: Status;
  archiveIndexPath: string;
  summary: {
    spikes: number;
    branchesPresent: number;
    branchMemoPaths: number;
    branchMemoPathsPresent: number;
    localArchivePaths: number;
    localArchivePathsPresent: number;
    checks: number;
    passed: number;
    failed: number;
  };
  checks: Check[];
  spikes: SpikeMemoResult[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-arkhiv-spike-memo-audit';
const ARCHIVE_INDEX_PATH = 'docs/archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md';
const CODEX_PATH = 'docs/PROJEKT_OBJEKT_143.md';
const BACKLOG_PATH = 'docs/BACKLOG.md';
const EXPECTED_SPIKES: SpikeMemo[] = [
  {
    id: 'E1',
    branch: 'origin/spike/E1-ecs',
    localPaths: ['docs/rearch/E1-ecs-evaluation.md'],
    branchMemoPaths: ['docs/rearch/E1-ecs-evaluation.md'],
    foldedTerms: ['E1', 'ECS migration', 'Defer ECS'],
  },
  {
    id: 'E2',
    branch: 'origin/spike/E2-rendering-at-scale',
    localPaths: [],
    branchMemoPaths: ['docs/rearch/E2-rendering-evaluation.md'],
    foldedTerms: ['E2', 'GPU-driven rendering', 'WebGPU'],
  },
  {
    id: 'E3',
    branch: 'origin/spike/E3-combat-ai-paradigm',
    localPaths: [],
    branchMemoPaths: ['docs/rearch/E3-combat-ai-evaluation.md'],
    foldedTerms: ['E3', 'utility layer', 'GOAP'],
  },
  {
    id: 'E4',
    branch: 'origin/spike/E4-agent-player-api',
    localPaths: [],
    branchMemoPaths: ['docs/rearch/E4-agent-player-api.md'],
    foldedTerms: ['E4', 'agent-facing adapter', 'movement/observation'],
  },
  {
    id: 'E5',
    branch: 'origin/spike/E5-deterministic-sim',
    localPaths: ['docs/rearch/C2-determinism-open-sources.md'],
    branchMemoPaths: ['docs/rearch/E5-deterministic-sim.md', 'docs/rearch/E5-determinism-evaluation.md', 'docs/rearch/E5-nondeterminism-audit.md'],
    foldedTerms: ['E5', 'SimClock', 'SimRng'],
  },
  {
    id: 'E6',
    branch: 'origin/spike/E6-vehicle-physics-rebuild',
    localPaths: [],
    branchMemoPaths: ['docs/rearch/E6-vehicle-physics-evaluation.md', 'docs/rearch/E6-vehicle-physics-design.md'],
    foldedTerms: ['E6', 'Skyraider', 'Airframe'],
  },
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function gitBranchSha(ref: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--verify', ref], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function gitObjectExists(spec: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', spec], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
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

function missingTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => !text.includes(term));
}

function buildReport(outDir: string): SpikeMemoAudit {
  if (!existsSync(ARCHIVE_INDEX_PATH)) {
    throw new Error(`Missing archive index: ${ARCHIVE_INDEX_PATH}`);
  }
  const archiveText = readFileSync(ARCHIVE_INDEX_PATH, 'utf-8');
  const codexText = readFileSync(CODEX_PATH, 'utf-8');
  const backlogText = readFileSync(BACKLOG_PATH, 'utf-8');
  const outputJson = join(outDir, 'spike-memo-audit.json');
  const outputMd = join(outDir, 'spike-memo-audit.md');

  const spikes: SpikeMemoResult[] = EXPECTED_SPIKES.map((spike) => {
    const branchSha = gitBranchSha(spike.branch);
    const missingBranchMemoPaths = spike.branchMemoPaths.filter((path) => !gitObjectExists(`${spike.branch}:${path}`));
    const missingLocalPaths = spike.localPaths.filter((path) => !existsSync(path));
    return {
      id: spike.id,
      branch: spike.branch,
      branchSha,
      branchExists: branchSha !== null,
      branchMemoPaths: spike.branchMemoPaths,
      missingBranchMemoPaths,
      localPaths: spike.localPaths,
      missingLocalPaths,
    };
  });

  const archiveTerms = EXPECTED_SPIKES.flatMap((spike) => [
    spike.id,
    spike.branch,
    ...spike.branchMemoPaths,
    ...(spikes.find((result) => result.id === spike.id)?.branchSha ? [spikes.find((result) => result.id === spike.id)?.branchSha ?? ''] : []),
    ...spike.foldedTerms,
  ]);
  const codexTerms = ['Phase F candidates from E-track spikes', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', ARCHIVE_INDEX_PATH];
  const backlogTerms = ['Phase F Candidates', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
  const missingArchiveTerms = missingTerms(archiveText, archiveTerms);
  const missingCodexTerms = missingTerms(codexText, codexTerms);
  const missingBacklogTerms = missingTerms(backlogText, backlogTerms);
  const missingBranches = spikes.filter((spike) => !spike.branchExists);
  const missingBranchMemos = spikes.flatMap((spike) => spike.missingBranchMemoPaths.map((path) => `${spike.branch}:${path}`));
  const missingLocalArchives = spikes.flatMap((spike) => spike.missingLocalPaths);

  const checks: Check[] = [
    missingBranches.length === 0
      ? pass('branch-refs', `${spikes.length} E-track branch refs resolve.`)
      : fail('branch-refs', `Missing refs: ${missingBranches.map((spike) => spike.branch).join(', ')}`),
    missingBranchMemos.length === 0
      ? pass('branch-memo-paths', 'All branch-local memo paths exist at their refs.')
      : fail('branch-memo-paths', `Missing branch memo paths: ${missingBranchMemos.join(', ')}`),
    missingLocalArchives.length === 0
      ? pass('merged-local-archives', 'Merged local memo/support paths exist.')
      : fail('merged-local-archives', `Missing local archive paths: ${missingLocalArchives.join(', ')}`),
    missingArchiveTerms.length === 0
      ? pass('archive-index', 'Archive index records all refs, SHAs, memo paths, and folded decisions.')
      : fail('archive-index', `Archive index missing terms: ${missingArchiveTerms.join(', ')}`),
    missingCodexTerms.length === 0
      ? pass('codex-fold', 'Codex folds E-track outcomes and indexes the archive record.')
      : fail('codex-fold', `Codex missing terms: ${missingCodexTerms.join(', ')}`),
    missingBacklogTerms.length === 0
      ? pass('backlog-fold', 'Backlog Strategic Reserve names all E-track candidates.')
      : fail('backlog-fold', `Backlog missing terms: ${missingBacklogTerms.join(', ')}`),
  ];
  const failed = checks.filter((check) => check.status === 'fail').length;
  const branchMemoPathCount = EXPECTED_SPIKES.reduce((count, spike) => count + spike.branchMemoPaths.length, 0);
  const missingBranchMemoPathCount = spikes.reduce((count, spike) => count + spike.missingBranchMemoPaths.length, 0);
  const localArchivePathCount = EXPECTED_SPIKES.reduce((count, spike) => count + spike.localPaths.length, 0);
  const missingLocalArchivePathCount = spikes.reduce((count, spike) => count + spike.missingLocalPaths.length, 0);

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-arkhiv-spike-memo-audit',
    status: failed === 0 ? 'pass' : 'fail',
    archiveIndexPath: ARCHIVE_INDEX_PATH,
    summary: {
      spikes: EXPECTED_SPIKES.length,
      branchesPresent: EXPECTED_SPIKES.length - missingBranches.length,
      branchMemoPaths: branchMemoPathCount,
      branchMemoPathsPresent: branchMemoPathCount - missingBranchMemoPathCount,
      localArchivePaths: localArchivePathCount,
      localArchivePathsPresent: localArchivePathCount - missingLocalArchivePathCount,
      checks: checks.length,
      passed: checks.filter((check) => check.status === 'pass').length,
      failed,
    },
    checks,
    spikes,
    nextActions: [
      'Do not delete E2-E6 branch refs until full memo content is imported, superseded, or exported to durable storage.',
      'Use the folded Article IV and backlog outcomes for planning; use branch memos only as source evidence.',
      'Rerun this audit when any E-track branch, memo, or folded outcome changes.',
    ],
    nonClaims: [
      'This packet does not validate runtime behavior.',
      'This packet does not approve E-track implementation work.',
      'This packet does not prove branch refs will remain available forever.',
      'This packet does not satisfy Article VII closeout.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: SpikeMemoAudit): string {
  return [
    '# Projekt 143 ARKHIV Spike Memo Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Archive index: ${report.archiveIndexPath}`,
    `Spikes: ${report.summary.branchesPresent}/${report.summary.spikes} branches present`,
    `Branch memos: ${report.summary.branchMemoPathsPresent}/${report.summary.branchMemoPaths} present`,
    `Checks: ${report.summary.passed}/${report.summary.checks} passed`,
    '',
    '## Checks',
    ...report.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.detail}`),
    '',
    '## Spikes',
    ...report.spikes.map((spike) => `- ${spike.id}: ${spike.branch} ${spike.branchSha ?? 'missing'}; branch memos missing=${spike.missingBranchMemoPaths.length}; local paths missing=${spike.missingLocalPaths.length}`),
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
  writeFileSync(join(outDir, 'spike-memo-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'spike-memo-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 ARKHIV spike memo audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`spikes=${report.summary.branchesPresent}/${report.summary.spikes} memos=${report.summary.branchMemoPathsPresent}/${report.summary.branchMemoPaths} checks=${report.summary.passed}/${report.summary.checks}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-arkhiv-spike-memo-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
