#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

type EvidenceStep = {
  id: string;
  command: string[];
  artifactPattern: RegExp;
};

type EvidenceStepResult = {
  id: string;
  command: string;
  ok: boolean;
  durationMs: number;
  artifactPath: string | null;
  stdoutTail: string[];
  error: string | null;
};

type EvidenceSuiteReport = {
  createdAt: string;
  source: string;
  status: 'pass' | 'fail';
  notes: string[];
  steps: EvidenceStepResult[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const TSX_CLI = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

const STEPS: EvidenceStep[] = [
  {
    id: 'kb-cull-texture-audit',
    command: ['scripts/pixel-forge-texture-audit.ts'],
    artifactPattern: /Pixel Forge texture audit written:\s+(.+texture-audit\.json)/,
  },
  {
    id: 'kb-optik-imposter-optics-audit',
    command: ['scripts/pixel-forge-imposter-optics-audit.ts'],
    artifactPattern: /Pixel Forge imposter optics audit wrote\s+(.+optics-audit\.json)/,
  },
  {
    id: 'kb-terrain-vegetation-horizon-audit',
    command: ['scripts/vegetation-horizon-audit.ts'],
    artifactPattern: /Vegetation horizon audit written to\s+(.+horizon-audit\.json)/,
  },
  {
    id: 'kb-terrain-pixel-forge-structure-review',
    command: ['scripts/projekt-143-pixel-forge-structure-review.ts'],
    artifactPattern: /Projekt 143 Pixel Forge structure review \w+:\s+(.+structure-review\.json)/,
  },
  {
    id: 'kb-strategie-webgpu-audit',
    command: ['scripts/webgpu-strategy-audit.ts'],
    artifactPattern: /WebGPU strategy audit written to\s+(.+strategy-audit\.json)/,
  },
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function tailLines(output: string, lineCount = 12): string[] {
  return output
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-lineCount);
}

function runStep(step: EvidenceStep): EvidenceStepResult {
  const started = performance.now();
  const args = [TSX_CLI, ...step.command];
  const commandText = `node ${['node_modules/tsx/dist/cli.mjs', ...step.command].join(' ')}`;
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const match = stdout.match(step.artifactPattern);
    return {
      id: step.id,
      command: commandText,
      ok: Boolean(match?.[1]),
      durationMs: Math.round(performance.now() - started),
      artifactPath: match?.[1] ?? null,
      stdoutTail: tailLines(stdout),
      error: match?.[1] ? null : 'Audit completed but artifact path was not found in stdout.',
    };
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error);
    return {
      id: step.id,
      command: commandText,
      ok: false,
      durationMs: Math.round(performance.now() - started),
      artifactPath: null,
      stdoutTail: [],
      error: stderr,
    };
  }
}

function writeReport(report: EvidenceSuiteReport): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-evidence-suite');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'suite-summary.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const steps = STEPS.map(runStep);
  const report: EvidenceSuiteReport = {
    createdAt: new Date().toISOString(),
    source: 'Projekt Objekt-143 Cycle 0 static evidence suite',
    status: steps.every((step) => step.ok) ? 'pass' : 'fail',
    notes: [
      'This suite runs static bureau audits only.',
      'It does not run perf:grenade-spike because that is a headed runtime probe with build/browser cost.',
      'Use this suite to verify the evidence slice is wired; use perf probes for runtime remediation claims.',
    ],
    steps,
  };
  const outputPath = writeReport(report);

  console.log(`Projekt Objekt-143 evidence suite wrote ${outputPath}`);
  for (const step of steps) {
    console.log(`${step.ok ? 'PASS' : 'FAIL'} ${step.id} ${step.artifactPath ?? ''}`.trim());
  }
  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
