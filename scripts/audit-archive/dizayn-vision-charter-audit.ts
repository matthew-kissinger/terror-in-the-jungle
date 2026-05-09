#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

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

interface CharterAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-dizayn-vision-charter-audit';
  status: Status;
  charterPath: string;
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

const OUTPUT_NAME = 'projekt-143-dizayn-vision-charter-audit';
const CHARTER_PATH = 'docs/dizayn/vision-charter.md';
const REQUIREMENTS: Requirement[] = [
  {
    id: 'water',
    label: 'Water visual and gameplay target',
    requiredTerms: ['calm lowland water', 'Monsoon turbulence', 'wading', 'swimming', 'isUnderwater', 'getWaterDepth', 'getWaterSurfaceY'],
  },
  {
    id: 'air-combat',
    label: 'Air combat feel target',
    requiredTerms: ['Huey transport', 'rocket strafes', 'napalm', 'AC-47 Spooky', 'pylon turn', 'F-4 Phantom', 'playtest checklist'],
  },
  {
    id: 'squad-command',
    label: 'RTS-flavored squad command target',
    requiredTerms: ['go here', 'patrol', 'attack here', 'return to neutral', 'smoke', 'callsign discipline', 'engage while in transit'],
  },
  {
    id: 'deploy-flow',
    label: 'Deploy spawn respawn target',
    requiredTerms: ['PC and mobile information parity', 'Spawn options', 'Loadout categories', 'Death-to-respawn', 'first frame after deploy'],
  },
  {
    id: 'art-direction-gate',
    label: 'Art-direction evidence gate',
    requiredTerms: ['Artifact path', 'trusted, diagnostic, or blocked evidence', 'Non-Claims', 'looks right'],
  },
  {
    id: 'bureau-interfaces',
    label: 'Cross-bureau ownership',
    requiredTerms: ['KB-VODA', 'KB-AVIATSIYA', 'KB-SVYAZ', 'KB-UX', 'KB-METRIK'],
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

function buildReport(outDir: string): CharterAudit {
  const charterAbsolute = resolve(CHARTER_PATH);
  if (!existsSync(charterAbsolute)) {
    throw new Error(`Missing DIZAYN-1 charter: ${CHARTER_PATH}`);
  }
  const text = readFileSync(charterAbsolute, 'utf-8');
  const results = REQUIREMENTS.map((requirement) => checkRequirement(text, requirement));
  const failed = results.filter((result) => result.status === 'fail').length;
  const outputJson = join(outDir, 'vision-charter-audit.json');
  const outputMd = join(outDir, 'vision-charter-audit.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-dizayn-vision-charter-audit',
    status: failed === 0 ? 'pass' : 'fail',
    charterPath: CHARTER_PATH,
    summary: {
      requirements: results.length,
      passed: results.filter((result) => result.status === 'pass').length,
      failed,
      lines: text.split(/\r?\n/).length,
      bytes: Buffer.byteLength(text, 'utf-8'),
    },
    requirements: results,
    nextActions: [
      'Use the charter as the KB-DIZAYN review basis for VODA-1, aviation feel, squad command, and deploy-flow work.',
      'Do not use this charter as runtime acceptance without artifact-backed visual, playtest, or telemetry evidence.',
      'Rerun this audit when the charter changes.',
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

function makeMarkdown(report: CharterAudit): string {
  return [
    '# Projekt 143 DIZAYN Vision Charter Audit',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `Charter: ${report.charterPath}`,
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
  writeFileSync(join(outDir, 'vision-charter-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'vision-charter-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DIZAYN vision charter audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`requirements=${report.summary.passed}/${report.summary.requirements} lines=${report.summary.lines} bytes=${report.summary.bytes}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-dizayn-vision-charter-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
