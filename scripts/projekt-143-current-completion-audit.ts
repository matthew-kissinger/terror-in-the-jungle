#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

type GateStatus = 'pass' | 'warn' | 'fail';
type DirectiveState = 'closed' | 'deferred' | 'open' | 'unknown';

interface EvidenceRef {
  path: string;
  exists: boolean;
}

interface DirectiveAudit {
  id: string;
  owner: string;
  title: string;
  line: number;
  statusText: string;
  state: DirectiveState;
  successCriteria: string;
  evidenceRefs: EvidenceRef[];
  blockers: string[];
}

interface GitState {
  head: string;
  branchLine: string;
  shortStatus: string[];
  dirty: boolean;
  aheadOfOriginMaster: number | null;
  behindOriginMaster: number | null;
}

interface ChecklistItem {
  id: string;
  criterion: string;
  status: GateStatus;
  evidence: string[];
  blockers: string[];
}

interface LatestArtifact {
  path: string | null;
  status: string | null;
  createdAt: string | null;
  head: string | null;
  manifestGitSha: string | null;
}

interface CompletionAuditReport {
  createdAt: string;
  mode: 'projekt-143-current-completion-audit';
  commandAlias: 'check:projekt-143-completion-audit';
  objective: string;
  sourceGitSha: string;
  codexRevision: string | null;
  completionStatus: 'complete' | 'not_complete';
  canMarkGoalComplete: boolean;
  git: GitState;
  articleIII: {
    directiveCount: number;
    closedCount: number;
    deferredCount: number;
    openCount: number;
    unknownCount: number;
    missingEvidenceRefs: EvidenceRef[];
    directives: DirectiveAudit[];
  };
  liveReleaseProof: LatestArtifact;
  docDriftProof: LatestArtifact;
  promptToArtifactChecklist: ChecklistItem[];
  blockers: string[];
  nextRequiredActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const CODEX_PATH = 'docs/PROJEKT_OBJEKT_143.md';
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-completion-audit';
const ARTIFACT_REF_PATTERN = /artifacts\/(?:perf|mobile-ui)\/[A-Za-z0-9._/<>:-]+/g;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function gitOutput(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gitOutputOrNull(args: string[]): string | null {
  try {
    return gitOutput(args);
  } catch {
    return null;
  }
}

function getGitState(): GitState {
  const branchLine = gitOutputOrNull(['status', '--short', '--branch'])?.split(/\r?\n/)[0] ?? 'unknown';
  const statusOutput = gitOutputOrNull(['status', '--short']) ?? '';
  const shortStatus = statusOutput.split(/\r?\n/).filter(Boolean);
  const aheadBehind = gitOutputOrNull(['rev-list', '--left-right', '--count', 'origin/master...HEAD']);
  const [behindText, aheadText] = aheadBehind?.split(/\s+/) ?? [];

  return {
    head: gitOutputOrNull(['rev-parse', 'HEAD']) ?? 'unknown',
    branchLine,
    shortStatus,
    dirty: shortStatus.length > 0,
    aheadOfOriginMaster: aheadText === undefined ? null : Number.parseInt(aheadText, 10),
    behindOriginMaster: behindText === undefined ? null : Number.parseInt(behindText, 10),
  };
}

function lineAtIndex(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function extractSection(text: string, startHeading: string, endHeading: string): string {
  const start = text.indexOf(startHeading);
  if (start === -1) {
    throw new Error(`Missing section ${startHeading}`);
  }
  const end = text.indexOf(endHeading, start);
  if (end === -1) {
    throw new Error(`Missing section boundary ${endHeading}`);
  }
  return text.slice(start, end);
}

function normalizeEvidenceRef(raw: string): string {
  return raw.replace(/[.,;:)]+$/g, '').replace(/`/g, '');
}

function evidenceRefsFrom(block: string): EvidenceRef[] {
  const refs = new Set<string>();
  for (const match of block.matchAll(ARTIFACT_REF_PATTERN)) {
    const refPath = normalizeEvidenceRef(match[0]);
    if (!refPath.includes('<')) {
      refs.add(refPath);
    }
  }

  return Array.from(refs).map((path) => ({
    path,
    exists: existsSync(join(process.cwd(), path)),
  }));
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function captureAfterLabel(block: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\*${escaped}:\\*\\s*([\\s\\S]*?)(?=\\n\\*(?:Status|Success criteria|Latest evidence path|Evidence path|Current packet|Scope):|\\n\\*\\*|\\n###|$)`);
  const match = block.match(pattern);
  return compact(match?.[1] ?? '');
}

function directiveState(statusText: string): DirectiveState {
  const lower = statusText.toLowerCase();
  if (lower.includes('politburo') && lower.includes('strategic reserve')) {
    return 'deferred';
  }
  if (lower.includes('evidence-complete') || lower === 'standing.' || lower === 'standing') {
    return 'closed';
  }
  if (
    lower.includes('evidence-in-progress')
    || lower.includes('not opened')
    || lower.includes('opened')
    || lower.includes('carryover')
    || lower.includes('blocked')
    || lower.includes('awaits')
    || lower.includes('active remediation')
    || lower.includes('surgical edit landed')
  ) {
    return 'open';
  }
  return lower.length === 0 ? 'unknown' : 'open';
}

function parseDirectives(codex: string): DirectiveAudit[] {
  const articleIII = extractSection(codex, '## Article III', '## Article IV');
  const sectionOffset = codex.indexOf(articleIII);
  const headingMatches = Array.from(articleIII.matchAll(/^\*\*([A-Z]+-\d+)\s+\u2014\s+(.+?)\*\*/gm));

  return headingMatches.map((match, index) => {
    const localIndex = match.index ?? 0;
    const nextIndex = headingMatches[index + 1]?.index ?? articleIII.length;
    const block = articleIII.slice(localIndex, nextIndex);
    const ownerMatches = Array.from(articleIII.slice(0, localIndex).matchAll(/^### (KB-[^\r\n]+)/gm));
    const owner = ownerMatches.at(-1)?.[1] ?? 'KB-UNKNOWN';
    const id = match[1] ?? 'UNKNOWN';
    const title = compact(match[2] ?? '');
    const statusText = captureAfterLabel(block, 'Status');
    const successCriteria = captureAfterLabel(block, 'Success criteria');
    const evidenceRefs = evidenceRefsFrom(block);
    const state = directiveState(statusText);
    const blockers: string[] = [];

    if (state === 'open') {
      blockers.push(`Directive ${id} remains active: ${statusText}`);
    }
    if (state === 'unknown') {
      blockers.push(`Directive ${id} lacks a parseable status.`);
    }
    if ((state === 'closed' || state === 'deferred') && evidenceRefs.some((ref) => !ref.exists)) {
      blockers.push(`Directive ${id} cites missing evidence artifacts.`);
    }

    return {
      id,
      owner,
      title,
      line: lineAtIndex(codex, sectionOffset + localIndex),
      statusText,
      state,
      successCriteria,
      evidenceRefs,
      blockers,
    };
  });
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function latestArtifactFile(slug: string, filename: string): string | null {
  const files = collectFiles(ARTIFACT_ROOT)
    .filter((path) => basename(path) === filename && rel(path).includes(`/${slug}/`))
    .sort((a, b) => rel(a).localeCompare(rel(b)));
  return files.at(-1) ?? null;
}

function readJson(path: string | null): unknown {
  if (path === null) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringAt(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (record === null) {
      return null;
    }
    current = record[segment];
  }
  return typeof current === 'string' ? current : null;
}

function latestArtifactSummary(slug: string, filename: string): LatestArtifact {
  const path = latestArtifactFile(slug, filename);
  const json = readJson(path);
  return {
    path: path === null ? null : rel(path),
    status: stringAt(json, ['status']),
    createdAt: stringAt(json, ['createdAt']),
    head: stringAt(json, ['git', 'head']),
    manifestGitSha: stringAt(json, ['manifest', 'gitSha']),
  };
}

function datePartFromArtifact(path: string): Date | null {
  const match = path.match(/artifacts\/perf\/(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return null;
  }
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function codexRevision(codex: string): string | null {
  return codex.match(/Codex revision:\s*([^\r\n]+)/)?.[1]?.trim() ?? null;
}

function hasPolitburoSignature(codex: string): boolean {
  return /^Politburo (?:signature|seal):\s*(?:signed|approved)/im.test(codex)
    || /^Signed by the Politburo:\s*(?:yes|true|signed|approved)/im.test(codex);
}

function isWithinDays(date: Date | null, days: number): boolean {
  if (date === null) {
    return false;
  }
  const ageMs = Date.now() - date.getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function buildChecklist(
  directives: DirectiveAudit[],
  git: GitState,
  liveReleaseProof: LatestArtifact,
  docDriftProof: LatestArtifact,
  codex: string,
): ChecklistItem[] {
  const activeBlockers = directives.flatMap((directive) => directive.blockers);
  const missingEvidence = directives.flatMap((directive) => directive.evidenceRefs.filter((ref) => !ref.exists));
  const arkhiv = directives.filter((directive) => directive.id.startsWith('ARKHIV-'));
  const arkhivFresh = arkhiv.length >= 3 && arkhiv.every((directive) => {
    const latestRef = directive.evidenceRefs.at(-1);
    return directive.state === 'closed' && latestRef !== undefined && latestRef.exists
      && isWithinDays(datePartFromArtifact(latestRef.path), 30);
  });
  const liveReleaseCurrent = liveReleaseProof.status === 'pass'
    && liveReleaseProof.head === git.head
    && liveReleaseProof.manifestGitSha === git.head
    && !git.dirty
    && git.aheadOfOriginMaster === 0
    && git.behindOriginMaster === 0;
  const signed = hasPolitburoSignature(codex);
  const docDriftLocalPass = docDriftProof.status === 'pass';

  return [
    {
      id: 'article-iii-directives',
      criterion: 'Every active Article III directive is evidence-complete or explicitly deferred to Strategic Reserve with Politburo annotation.',
      status: activeBlockers.length === 0 && missingEvidence.length === 0 ? 'pass' : 'fail',
      evidence: [
        CODEX_PATH,
        ...directives.flatMap((directive) => directive.evidenceRefs.map((ref) => ref.path)),
      ],
      blockers: [
        ...activeBlockers,
        ...missingEvidence.map((ref) => `Missing cited artifact: ${ref.path}`),
      ],
    },
    {
      id: 'stabilizat-3-live-release',
      criterion: 'Live release verified per STABILIZAT-3.',
      status: liveReleaseCurrent ? 'pass' : 'fail',
      evidence: [
        liveReleaseProof.path ?? 'No projekt-143-live-release-proof artifact found.',
        `git head ${git.head}`,
        git.branchLine,
      ],
      blockers: liveReleaseCurrent ? [] : [
        'No current clean live-release proof exists for this working tree HEAD.',
        `latest release proof status=${liveReleaseProof.status ?? 'missing'} head=${liveReleaseProof.head ?? 'missing'} manifest=${liveReleaseProof.manifestGitSha ?? 'missing'}`,
        `working tree dirty=${git.dirty}`,
      ],
    },
    {
      id: 'arkhiv-strategic-reserve',
      criterion: 'Strategic Reserve audited by KB-ARKHIV in the last 30 days.',
      status: arkhivFresh ? 'pass' : 'fail',
      evidence: arkhiv.flatMap((directive) => directive.evidenceRefs.map((ref) => ref.path)),
      blockers: arkhivFresh ? [] : [
        'ARKHIV-1, ARKHIV-2, and ARKHIV-3 are not all closed with fresh existing evidence artifacts.',
      ],
    },
    {
      id: 'politburo-seal',
      criterion: 'Codex revision incremented and signed by the Politburo.',
      status: signed ? 'pass' : 'fail',
      evidence: [CODEX_PATH, codexRevision(codex) ?? 'No codex revision found.'],
      blockers: signed ? [] : [
        'Codex revision exists, but no explicit Politburo signature or seal marker is present.',
      ],
    },
    {
      id: 'defekt-14-day-live-drift',
      criterion: 'KB-DEFEKT confirms no active drift between docs, code, and live deployment for 14 consecutive days.',
      status: 'fail',
      evidence: [
        docDriftProof.path ?? 'No projekt-143-doc-drift artifact found.',
        `latest local doc-drift status=${docDriftProof.status ?? 'missing'}`,
      ],
      blockers: [
        docDriftLocalPass
          ? 'Local doc/code/artifact drift gate passes, but no 14-day live deployment drift watch is recorded.'
          : 'The latest local doc/code/artifact drift gate is missing or failing.',
      ],
    },
  ];
}

function tableRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
}

function writeMarkdown(report: CompletionAuditReport): string {
  const lines = [
    '# Projekt Objekt-143 Completion Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.completionStatus}`,
    `Can mark goal complete: ${String(report.canMarkGoalComplete)}`,
    `Git head: ${report.git.head}`,
    `Git status: ${report.git.branchLine}`,
    '',
    '## Article VII Checklist',
    '',
    tableRow(['Criterion', 'Status', 'Blockers']),
    tableRow(['---', '---', '---']),
    ...report.promptToArtifactChecklist.map((item) => tableRow([
      item.id,
      item.status,
      item.blockers.length === 0 ? 'none' : item.blockers.join('<br>'),
    ])),
    '',
    '## Active Directive Summary',
    '',
    tableRow(['State', 'Count']),
    tableRow(['---', '---']),
    tableRow(['closed', String(report.articleIII.closedCount)]),
    tableRow(['deferred', String(report.articleIII.deferredCount)]),
    tableRow(['open', String(report.articleIII.openCount)]),
    tableRow(['unknown', String(report.articleIII.unknownCount)]),
    '',
    '## Open Directives',
    '',
    tableRow(['Directive', 'Owner', 'Line', 'Status']),
    tableRow(['---', '---', '---', '---']),
    ...report.articleIII.directives
      .filter((directive) => directive.state === 'open' || directive.state === 'unknown')
      .map((directive) => tableRow([
        directive.id,
        directive.owner,
        String(directive.line),
        directive.statusText,
      ])),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
    '## Next Required Actions',
    '',
    ...report.nextRequiredActions.map((action) => `- ${action}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const createdAt = new Date().toISOString();
  const codex = readFileSync(CODEX_PATH, 'utf-8');
  const directives = parseDirectives(codex);
  const git = getGitState();
  const liveReleaseProof = latestArtifactSummary('projekt-143-live-release-proof', 'release-proof.json');
  const docDriftProof = latestArtifactSummary('projekt-143-doc-drift', 'doc-drift.json');
  const promptToArtifactChecklist = buildChecklist(directives, git, liveReleaseProof, docDriftProof, codex);
  const blockers = promptToArtifactChecklist.flatMap((item) => item.blockers.map((blocker) => `${item.id}: ${blocker}`));
  const missingEvidenceRefs = directives.flatMap((directive) => directive.evidenceRefs.filter((ref) => !ref.exists));
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  const summaryPath = join(outputDir, 'completion-audit.json');
  const markdownPath = join(outputDir, 'completion-audit.md');
  const completionStatus = blockers.length === 0 ? 'complete' : 'not_complete';
  const report: CompletionAuditReport = {
    createdAt,
    mode: 'projekt-143-current-completion-audit',
    commandAlias: 'check:projekt-143-completion-audit',
    objective: 'Measure Projekt Objekt-143 closeout against current docs/PROJEKT_OBJEKT_143.md Article VII, current Article III directive state, and current local git/live-release evidence.',
    sourceGitSha: git.head,
    codexRevision: codexRevision(codex),
    completionStatus,
    canMarkGoalComplete: completionStatus === 'complete',
    git,
    articleIII: {
      directiveCount: directives.length,
      closedCount: directives.filter((directive) => directive.state === 'closed').length,
      deferredCount: directives.filter((directive) => directive.state === 'deferred').length,
      openCount: directives.filter((directive) => directive.state === 'open').length,
      unknownCount: directives.filter((directive) => directive.state === 'unknown').length,
      missingEvidenceRefs,
      directives,
    },
    liveReleaseProof,
    docDriftProof,
    promptToArtifactChecklist,
    blockers,
    nextRequiredActions: [
      'Close or explicitly defer each open Article III directive with Politburo annotation and artifact-backed evidence.',
      'Restore a clean master working tree, run CI, deploy manually, and refresh check:projekt-143-live-release-proof for the current HEAD.',
      'Record the Politburo seal in the codex only after closeout criteria are met.',
      'Run and record a 14-day KB-DEFEKT live docs/code/deploy drift watch before closeout.',
    ],
    nonClaims: [
      'This audit does not deploy production.',
      'This audit does not certify live production parity for the current working tree.',
      'This audit does not refresh performance baselines.',
      'This audit does not close any directive without an Article III artifact path.',
      'This audit does not mark the active Codex goal complete.',
    ],
    files: {
      summary: rel(summaryPath),
      markdown: rel(markdownPath),
    },
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, writeMarkdown(report));

  console.log(`Projekt Objekt-143 current completion audit: ${report.completionStatus.toUpperCase()}`);
  console.log(`Summary: ${report.files.summary}`);
  console.log(`Markdown: ${report.files.markdown}`);
  console.log(`Blockers: ${report.blockers.length}`);

  if (strict && report.completionStatus !== 'complete') {
    process.exitCode = 1;
  }
}

main();
