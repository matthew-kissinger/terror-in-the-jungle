#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'fail';

interface Requirement {
  id: string;
  label: string;
  requiredTerms: string[];
}

interface RequirementResult {
  id: string;
  label: string;
  status: Status;
  missingTerms: string[];
}

interface GateAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-dizayn-art-direction-gate-audit';
  status: Status;
  gatePath: string;
  summary: {
    requirements: number;
    passed: number;
    failed: number;
    lines: number;
    bytes: number;
  };
  requirements: RequirementResult[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-dizayn-art-direction-gate-audit';
const GATE_PATH = 'docs/dizayn/art-direction-gate.md';
const REQUIREMENTS: Requirement[] = [
  {
    id: 'invocation',
    label: 'Invocable looks-right gate',
    requiredTerms: ['looks right', 'Invoke this gate', 'Directive ID', 'Requesting bureau', 'Artifact path under `artifacts/perf/<ts>/`'],
  },
  {
    id: 'evidence-trust',
    label: 'Evidence trust contract',
    requiredTerms: ['Evidence trust', 'trusted', 'diagnostic', 'blocked evidence', 'does not close a directive'],
  },
  {
    id: 'decisions',
    label: 'Decision vocabulary',
    requiredTerms: ['signed', 'returned_with_notes', 'blocked', 'Reviewer decision'],
  },
  {
    id: 'source-docs',
    label: 'Source operating documents',
    requiredTerms: ['docs/dizayn/vision-charter.md', 'docs/PLAYTEST_CHECKLIST.md', 'docs/ASSET_ACCEPTANCE_STANDARD.md'],
  },
  {
    id: 'non-claims',
    label: 'Non-claims and limits',
    requiredTerms: ['Non-Claims', 'does not prove runtime correctness', 'does not replace', 'Cloudflare Pages production parity'],
  },
  {
    id: 'measurement-boundary',
    label: 'KB-METRIK boundary',
    requiredTerms: ['KB-METRIK', 'measurement trust', 'runtime validation', 'Politburo signoff'],
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

function checkRequirement(text: string, requirement: Requirement): RequirementResult {
  const missingTerms = requirement.requiredTerms.filter((term) => !text.includes(term));
  return {
    id: requirement.id,
    label: requirement.label,
    status: missingTerms.length === 0 ? 'pass' : 'fail',
    missingTerms,
  };
}

function buildReport(outDir: string): GateAudit {
  const gateAbsolute = resolve(GATE_PATH);
  if (!existsSync(gateAbsolute)) {
    throw new Error(`Missing DIZAYN-2 art-direction gate: ${GATE_PATH}`);
  }
  const text = readFileSync(gateAbsolute, 'utf-8');
  const results = REQUIREMENTS.map((requirement) => checkRequirement(text, requirement));
  const failed = results.filter((result) => result.status === 'fail').length;
  const outputJson = join(outDir, 'art-direction-gate-audit.json');
  const outputMd = join(outDir, 'art-direction-gate-audit.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-dizayn-art-direction-gate-audit',
    status: failed === 0 ? 'pass' : 'fail',
    gatePath: GATE_PATH,
    summary: {
      requirements: results.length,
      passed: results.filter((result) => result.status === 'pass').length,
      failed,
      lines: text.split(/\r?\n/).length,
      bytes: Buffer.byteLength(text, 'utf-8'),
    },
    requirements: results,
    nextActions: [
      'Invoke this gate when Article III directives claim visual or feel completion.',
      'Attach a concrete artifacts/perf packet before KB-DIZAYN signs a directive.',
      'Rerun this audit when the gate procedure changes.',
    ],
    nonClaims: [
      'This packet does not validate runtime behavior.',
      'This packet does not prove production deployment state.',
      'This packet does not satisfy human playtest acceptance.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: GateAudit): string {
  return [
    '# Projekt 143 DIZAYN Art-Direction Gate Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Gate: ${report.gatePath}`,
    `Requirements: ${report.summary.passed}/${report.summary.requirements} passed`,
    '',
    '## Requirements',
    ...report.requirements.map((requirement) => `- ${requirement.status.toUpperCase()} ${requirement.id}: ${requirement.missingTerms.length > 0 ? `missing ${requirement.missingTerms.join(', ')}` : 'complete'}`),
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
  writeFileSync(join(outDir, 'art-direction-gate-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'art-direction-gate-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DIZAYN art-direction gate audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`requirements=${report.summary.passed}/${report.summary.requirements} lines=${report.summary.lines} bytes=${report.summary.bytes}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-dizayn-art-direction-gate-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
