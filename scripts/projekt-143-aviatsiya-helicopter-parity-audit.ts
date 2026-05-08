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

interface HelicopterParityAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-aviatsiya-helicopter-parity-audit';
  status: Status;
  memoPath: string;
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

const OUTPUT_NAME = 'projekt-143-aviatsiya-helicopter-parity-audit';
const MEMO_PATH = 'docs/rearch/helicopter-parity-audit.md';
const REQUIREMENTS: Requirement[] = [
  {
    id: 'scope',
    label: 'AVIATSIYA-3 scope and source paths',
    requiredTerms: ['AVIATSIYA-3', 'HelicopterVehicleAdapter', 'HelicopterPlayerAdapter', 'FixedWingPlayerAdapter', 'VehicleSessionController'],
  },
  {
    id: 'authority-map',
    label: 'Authority map',
    requiredTerms: ['Current Authority Map', 'PlayerVehicleAdapter', 'FixedWingVehicleAdapter', 'HelicopterModel', 'FixedWingModel'],
  },
  {
    id: 'state-authority-gaps',
    label: 'State-authority gaps',
    requiredTerms: ['State-Authority Gaps', 'IHelicopterModel', 'getPlayerExitPlan', 'HelicopterInteraction.exitHelicopter', 'requestVehicleExit'],
  },
  {
    id: 'recommended-consolidation',
    label: 'Recommended consolidation',
    requiredTerms: ['Recommended Consolidation', 'Do not merge', 'local `HelicopterExitPlanner`', 'Legacy exit cleanup'],
  },
  {
    id: 'fixed-wing-parity',
    label: 'Fixed-wing parity comparison',
    requiredTerms: ['normal exit', 'blocked exit', 'emergency ejection', 'setPilotedAircraft'],
  },
  {
    id: 'validation-boundary',
    label: 'Validation and non-claims',
    requiredTerms: ['Non-Claims', 'human playtest', 'does not validate helicopter feel', 'does not prove production deployment state'],
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

function buildReport(outDir: string): HelicopterParityAudit {
  const memoAbsolute = resolve(MEMO_PATH);
  if (!existsSync(memoAbsolute)) {
    throw new Error(`Missing AVIATSIYA-3 memo: ${MEMO_PATH}`);
  }
  const text = readFileSync(memoAbsolute, 'utf-8');
  const results = REQUIREMENTS.map((requirement) => checkRequirement(text, requirement));
  const failed = results.filter((result) => result.status === 'fail').length;
  const outputJson = join(outDir, 'helicopter-parity-audit.json');
  const outputMd = join(outDir, 'helicopter-parity-audit.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-aviatsiya-helicopter-parity-audit',
    status: failed === 0 ? 'pass' : 'fail',
    memoPath: MEMO_PATH,
    summary: {
      requirements: results.length,
      passed: results.filter((result) => result.status === 'pass').length,
      failed,
      lines: text.split(/\r?\n/).length,
      bytes: Buffer.byteLength(text, 'utf-8'),
    },
    requirements: results,
    nextActions: [
      'Use the memo as AVIATSIYA-3 source evidence before changing helicopter player/session adapters.',
      'Do not change fenced interfaces until a narrow local contract proves insufficient.',
      'Require human playtest for any helicopter feel or exit-flow implementation that follows.',
    ],
    nonClaims: [
      'This packet does not validate helicopter feel.',
      'This packet does not validate rotor visual parity.',
      'This packet does not prove production deployment state.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: HelicopterParityAudit): string {
  return [
    '# Projekt 143 AVIATSIYA Helicopter Parity Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Memo: ${report.memoPath}`,
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
  writeFileSync(join(outDir, 'helicopter-parity-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'helicopter-parity-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 AVIATSIYA helicopter parity audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`requirements=${report.summary.passed}/${report.summary.requirements} lines=${report.summary.lines} bytes=${report.summary.bytes}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-aviatsiya-helicopter-parity-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
