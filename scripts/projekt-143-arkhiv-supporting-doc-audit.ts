#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';
type Disposition = 'topic_reference' | 'archived';

interface DocTarget {
  id: string;
  path: string;
  formerPath?: string;
  disposition: Disposition;
  owner: string;
  purpose: string;
  rationale: string;
  supersededBy?: string[];
}

interface DocFact {
  id: string;
  path: string;
  formerPath: string | null;
  exists: boolean;
  formerExists: boolean | null;
  disposition: Disposition;
  owner: string;
  purpose: string;
  rationale: string;
  supersededBy: string[];
  bytes: number;
  lines: number;
  headingCount: number;
  firstHeading: string | null;
  dateAnchors: string[];
  codexReferenced: boolean;
  status: Status;
  findings: string[];
}

interface SupportingDocAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-arkhiv-supporting-doc-audit';
  status: Status;
  summary: {
    totalDocs: number;
    topicReferences: number;
    archived: number;
    missing: number;
    formerPathStillPresent: number;
    codexReferenceMisses: number;
  };
  docs: DocFact[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-arkhiv-supporting-doc-audit';
const CODEX_PATH = 'docs/PROJEKT_OBJEKT_143.md';
const TARGETS: DocTarget[] = [
  {
    id: 'handoff',
    path: 'docs/PROJEKT_OBJEKT_143_HANDOFF.md',
    disposition: 'topic_reference',
    owner: 'KB-ARKHIV / KB-STABILIZAT',
    purpose: 'Short fresh-agent handoff and continuation prompt.',
    rationale: 'The codex remains authoritative, but this file remains useful as an operational restart reference and is consumed by completion-audit tooling.',
  },
  {
    id: 'hydrology',
    path: 'docs/PROJEKT_OBJEKT_143_HYDROLOGY.md',
    disposition: 'topic_reference',
    owner: 'KB-VODA / KB-TERRAIN',
    purpose: 'Hydrology and provisional river-surface reference for VODA-1 and terrain ecology branches.',
    rationale: 'The codex carries the active directive; the topic file preserves detailed hydrology implementation findings and research basis without bloating Article III.',
  },
  {
    id: 'vegetation-source-pipeline',
    path: 'docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md',
    disposition: 'topic_reference',
    owner: 'KB-LOAD / KB-FORGE',
    purpose: 'Vegetation source-tool and Pixel Forge pipeline reference for future source-asset review.',
    rationale: 'The codex keeps vegetation source work in strategic reserve; this file preserves provenance and pipeline constraints as a topic reference.',
  },
  {
    id: 'status-24h-2026-05-04',
    path: 'docs/archive/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md',
    formerPath: 'docs/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md',
    disposition: 'archived',
    owner: 'KB-ARKHIV',
    purpose: 'Historical 24-hour status snapshot.',
    rationale: 'The status snapshot is superseded by the codex and current-state document, and no longer belongs in the active document root.',
    supersededBy: ['docs/PROJEKT_OBJEKT_143.md', 'docs/STATE_OF_REPO.md'],
  },
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

function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

function statusFromFindings(findings: string[], missing: boolean): Status {
  if (missing) return 'fail';
  return findings.length > 0 ? 'warn' : 'pass';
}

function docFact(target: DocTarget, codexText: string): DocFact {
  const absolute = resolve(target.path);
  const exists = existsSync(absolute);
  const formerExists = target.formerPath ? existsSync(resolve(target.formerPath)) : null;
  const findings: string[] = [];
  let bytes = 0;
  let lines = 0;
  let headingCount = 0;
  let firstHeading: string | null = null;
  let dateAnchors: string[] = [];

  if (!exists) {
    findings.push(`Expected ${target.disposition} path is missing: ${target.path}`);
  } else {
    const text = readText(absolute);
    bytes = Buffer.byteLength(text, 'utf-8');
    const split = text.split(/\r?\n/);
    lines = split.length;
    const headings = split.filter((line) => line.startsWith('#'));
    headingCount = headings.length;
    firstHeading = headings[0] ?? null;
    dateAnchors = Array.from(new Set((text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []))).sort();
  }

  if (formerExists) {
    findings.push(`Former active-root path still exists after archive disposition: ${target.formerPath}`);
  }

  const codexReferenced = codexText.includes(target.path);
  if (!codexReferenced) {
    findings.push(`Codex does not reference disposition path: ${target.path}`);
  }

  return {
    id: target.id,
    path: target.path,
    formerPath: target.formerPath ?? null,
    exists,
    formerExists,
    disposition: target.disposition,
    owner: target.owner,
    purpose: target.purpose,
    rationale: target.rationale,
    supersededBy: target.supersededBy ?? [],
    bytes,
    lines,
    headingCount,
    firstHeading,
    dateAnchors,
    codexReferenced,
    status: statusFromFindings(findings, !exists),
    findings,
  };
}

function overallStatus(docs: DocFact[]): Status {
  if (docs.some((doc) => doc.status === 'fail')) return 'fail';
  if (docs.some((doc) => doc.status === 'warn')) return 'warn';
  return 'pass';
}

function buildReport(outDir: string): SupportingDocAudit {
  const codexText = readText(resolve(CODEX_PATH));
  const docs = TARGETS.map((target) => docFact(target, codexText));
  const outputJson = join(outDir, 'supporting-doc-audit.json');
  const outputMd = join(outDir, 'supporting-doc-audit.md');
  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-arkhiv-supporting-doc-audit',
    status: overallStatus(docs),
    summary: {
      totalDocs: docs.length,
      topicReferences: docs.filter((doc) => doc.disposition === 'topic_reference').length,
      archived: docs.filter((doc) => doc.disposition === 'archived').length,
      missing: docs.filter((doc) => !doc.exists).length,
      formerPathStillPresent: docs.filter((doc) => doc.formerExists === true).length,
      codexReferenceMisses: docs.filter((doc) => !doc.codexReferenced).length,
    },
    docs,
    nextActions: [
      'Keep topic references out of the active directive board unless their owning bureau reopens implementation scope.',
      'Use the archived 24-hour status only as historical evidence; do not treat it as current repo state.',
      'Run this audit when supporting Projekt documents are moved, pruned, or reclassified.',
    ],
    nonClaims: [
      'This packet does not validate runtime behavior.',
      'This packet does not prove production deployment state.',
      'This packet does not satisfy the Article VII 14-day live drift watch.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: SupportingDocAudit): string {
  return [
    '# Projekt 143 Supporting Doc Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Documents: ${report.summary.totalDocs}`,
    `Topic references: ${report.summary.topicReferences}`,
    `Archived: ${report.summary.archived}`,
    '',
    '## Dispositions',
    ...report.docs.map((doc) => [
      `- ${doc.id}: ${doc.status.toUpperCase()} ${doc.disposition} ${doc.path}`,
      `  Purpose: ${doc.purpose}`,
      `  Findings: ${doc.findings.length > 0 ? doc.findings.join('; ') : 'none'}`,
    ].join('\n')),
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
  writeFileSync(join(outDir, 'supporting-doc-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'supporting-doc-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 supporting doc audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`topicReferences=${report.summary.topicReferences} archived=${report.summary.archived} missing=${report.summary.missing} formerPathStillPresent=${report.summary.formerPathStillPresent}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-arkhiv-supporting-doc-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
