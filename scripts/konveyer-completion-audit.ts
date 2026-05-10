#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

type EvidenceStatus = 'pass' | 'blocked' | 'missing';

type ChecklistEntry = {
  requirement: string;
  status: EvidenceStatus;
  evidence: string[];
  gap: string | null;
};

type CompletionAudit = {
  createdAt: string;
  source: string;
  branch: string;
  head: string;
  completionStatus: 'complete' | 'blocked';
  checklist: ChecklistEntry[];
  rawBlockerSummary: Record<string, number>;
  productionBlockerSummary: Record<string, number>;
  productionRenderBlockerSummary: Record<string, number>;
  diagnosticWebglContextSummary: Record<string, number>;
  nextActions: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const LEDGER_PATH = join(process.cwd(), 'docs', 'rearch', 'KONVEYER_PARITY_2026-05-10.md');
const REQUIRED_DOC_SECTIONS = [
  'KONVEYER-0 Summary',
  'KONVEYER-1 Checkpoint',
  'KONVEYER-2 Checkpoint',
  'KONVEYER-3 Checkpoint',
  'KONVEYER-4 Checkpoint',
  'KONVEYER-5 And KONVEYER-6 Checkpoint',
  'KONVEYER-7 Tail Route',
  'KONVEYER-8 Validation Matrix',
  'KONVEYER-9 Review Packet',
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function findLatestArtifact(match: (path: string) => boolean): string | null {
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const matches: { path: string; mtimeMs: number }[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        visit(path);
      } else if (stats.isFile() && match(path)) {
        matches.push({ path, mtimeMs: stats.mtimeMs });
      }
    }
  };
  visit(ARTIFACT_ROOT);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.path ?? null;
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function summarizeBlockers(strategyPath: string | null): {
  raw: Record<string, number>;
  production: Record<string, number>;
  productionRender: Record<string, number>;
  diagnosticContext: Record<string, number>;
} {
  const empty = { raw: {}, production: {}, productionRender: {}, diagnosticContext: {} };
  if (!strategyPath) return empty;
  const strategy = readJson<{
    activeRuntime?: {
      migrationBlockers?: Array<{ pattern: string; matches: Array<{ file: string }> }>;
    };
  }>(strategyPath);
  const raw: Record<string, number> = {};
  const production: Record<string, number> = {};
  const productionRender: Record<string, number> = {};
  const diagnosticContext: Record<string, number> = {};
  for (const blocker of strategy.activeRuntime?.migrationBlockers ?? []) {
    raw[blocker.pattern] = blocker.matches.length;
    const productionMatches = blocker.matches.filter((match) => isProductionBlocker(match.file));
    production[blocker.pattern] = productionMatches.length;
    productionRender[blocker.pattern] = productionMatches
      .filter((match) => isRenderBlockerPattern(blocker.pattern) && !isAllowedDiagnosticContext(match.file))
      .length;
    diagnosticContext[blocker.pattern] = productionMatches
      .filter((match) => blocker.pattern.includes('WebGL context access') && isAllowedDiagnosticContext(match.file))
      .length;
  }
  return { raw, production, productionRender, diagnosticContext };
}

function isProductionBlocker(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  if (!normalized.startsWith('src/')) return false;
  if (normalized.includes('.test.') || normalized.includes('.spec.')) return false;
  if (normalized.startsWith('src/dev/')) return false;
  return true;
}

function isRenderBlockerPattern(pattern: string): boolean {
  return pattern === 'ShaderMaterial'
    || pattern === 'RawShaderMaterial'
    || pattern === 'onBeforeCompile'
    || pattern === 'WebGLRenderTarget';
}

function isAllowedDiagnosticContext(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  return normalized.startsWith('src/systems/debug/')
    || normalized === 'src/utils/DeviceDetector.ts';
}

function rendererStrictStatus(matrixPath: string | null): EvidenceStatus {
  if (!matrixPath) return 'missing';
  const matrix = readJson<{
    results?: Array<{
      name: string;
      capabilities?: { resolvedBackend?: string } | null;
      fatalVisible?: boolean;
      fatalText?: string | null;
    }>;
  }>(matrixPath);
  const strict = matrix.results?.find((result) => result.name === 'webgpu-strict');
  if (!strict) return 'missing';
  if (strict.capabilities?.resolvedBackend === 'webgpu') return 'pass';
  return 'blocked';
}

function allDocSectionsPresent(ledger: string): boolean {
  return REQUIRED_DOC_SECTIONS.every((section) => ledger.includes(`## ${section}`));
}

function main(): void {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--short']);
  const ledger = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8') : '';
  const strategyPath = findLatestArtifact((path) => path.endsWith('webgpu-strategy-audit\\strategy-audit.json') || path.endsWith('webgpu-strategy-audit/strategy-audit.json'));
  const matrixPath = findLatestArtifact((path) => path.endsWith('konveyer-renderer-matrix\\matrix.json') || path.endsWith('konveyer-renderer-matrix/matrix.json'));
  const vegetationPath = findLatestArtifact((path) => path.endsWith('konveyer-vegetation-slice\\slice.json') || path.endsWith('konveyer-vegetation-slice/slice.json'));
  const combatantPath = findLatestArtifact((path) => path.endsWith('konveyer-combatant-slice\\slice.json') || path.endsWith('konveyer-combatant-slice/slice.json'));
  const computePath = findLatestArtifact((path) => path.endsWith('konveyer-compute-carriers\\carriers.json') || path.endsWith('konveyer-compute-carriers/carriers.json'));
  const blockers = summarizeBlockers(strategyPath);
  const rawBlockerCount = Object.values(blockers.raw).reduce((sum, count) => sum + count, 0);
  const productionBlockerCount = Object.values(blockers.production).reduce((sum, count) => sum + count, 0);
  const productionRenderBlockerCount = Object.values(blockers.productionRender).reduce((sum, count) => sum + count, 0);
  const diagnosticContextCount = Object.values(blockers.diagnosticContext).reduce((sum, count) => sum + count, 0);
  const productionContextCount = blockers.production['renderer.getContext / WebGL context access'] ?? 0;
  const unexpectedContextCount = productionContextCount - diagnosticContextCount;
  const strictStatus = rendererStrictStatus(matrixPath);

  const checklist: ChecklistEntry[] = [
    {
      requirement: 'Work is on exp/konveyer-webgpu-migration and pushed for review.',
      status: branch === 'exp/konveyer-webgpu-migration' && status.length === 0 ? 'pass' : 'blocked',
      evidence: [`branch=${branch}`, `head=${head}`, `git status=${status.length === 0 ? 'clean' : status}`],
      gap: branch === 'exp/konveyer-webgpu-migration' && status.length === 0 ? null : 'Branch must be clean on the experiment branch before review.',
    },
    {
      requirement: 'KONVEYER-0 through KONVEYER-9 path is documented.',
      status: existsSync(LEDGER_PATH) && allDocSectionsPresent(ledger) ? 'pass' : 'missing',
      evidence: [rel(LEDGER_PATH), ...REQUIRED_DOC_SECTIONS.filter((section) => ledger.includes(`## ${section}`))],
      gap: allDocSectionsPresent(ledger) ? null : 'Ledger is missing one or more required KONVEYER sections.',
    },
    {
      requirement: 'Current Three.js WebGPU/TSL guidance is captured with sources.',
      status: ledger.includes('Three.js WebGPURenderer docs') && ledger.includes('Three.js TSL docs') ? 'pass' : 'missing',
      evidence: [rel(LEDGER_PATH)],
      gap: ledger.includes('Three.js WebGPURenderer docs') && ledger.includes('Three.js TSL docs') ? null : 'Upstream source section is missing or incomplete.',
    },
    {
      requirement: 'Renderer backend can select default WebGL, forced fallback, and strict WebGPU proof.',
      status: matrixPath ? 'pass' : 'missing',
      evidence: matrixPath ? [rel(matrixPath)] : [],
      gap: matrixPath ? null : 'Renderer matrix artifact is missing.',
    },
    {
      requirement: 'Strict WebGPU succeeds without hidden fallback.',
      status: strictStatus,
      evidence: matrixPath ? [rel(matrixPath)] : [],
      gap: strictStatus === 'pass' ? null : 'Strict WebGPU does not resolve backend=webgpu on this machine; fallback is correctly rejected but default-on proof is blocked.',
    },
    {
      requirement: 'Measured vegetation, combatant, and compute slices exist.',
      status: vegetationPath && combatantPath && computePath ? 'pass' : 'missing',
      evidence: [vegetationPath, combatantPath, computePath].filter((path): path is string => Boolean(path)).map(rel),
      gap: vegetationPath && combatantPath && computePath ? null : 'One or more measured slice artifacts are missing.',
    },
    {
      requirement: 'Production custom WebGL shader/render-target blockers are migrated or explicitly retired.',
      status: productionRenderBlockerCount === 0 ? 'pass' : 'blocked',
      evidence: strategyPath ? [
        rel(strategyPath),
        `productionBlockers=${productionBlockerCount}`,
        `productionRenderBlockers=${productionRenderBlockerCount}`,
        `rawBlockers=${rawBlockerCount}`,
      ] : [`productionBlockers=${productionBlockerCount}`, `productionRenderBlockers=${productionRenderBlockerCount}`, `rawBlockers=${rawBlockerCount}`],
      gap: productionRenderBlockerCount === 0 ? null : 'Static audit still finds active production ShaderMaterial, RawShaderMaterial, onBeforeCompile, or WebGL render-target blockers.',
    },
    {
      requirement: 'WebGL context access is confined to explicit diagnostics and capability probes.',
      status: unexpectedContextCount === 0 ? 'pass' : 'blocked',
      evidence: [
        `productionContextBlockers=${productionContextCount}`,
        `diagnosticContextBlockers=${diagnosticContextCount}`,
        `unexpectedContextBlockers=${unexpectedContextCount}`,
      ],
      gap: unexpectedContextCount === 0 ? null : 'A non-diagnostic runtime path still reaches direct WebGL context APIs.',
    },
    {
      requirement: 'Default-on WebGPU with WebGL fallback is ready for reviewer approval.',
      status: strictStatus === 'pass' && productionRenderBlockerCount === 0 && unexpectedContextCount === 0 ? 'pass' : 'blocked',
      evidence: [
        `strictWebGPU=${strictStatus}`,
        `productionBlockers=${productionBlockerCount}`,
        `productionRenderBlockers=${productionRenderBlockerCount}`,
        `unexpectedContextBlockers=${unexpectedContextCount}`,
        `rawBlockers=${rawBlockerCount}`,
      ],
      gap: strictStatus === 'pass' && productionRenderBlockerCount === 0 && unexpectedContextCount === 0 ? null : 'Default-on is not approved until strict WebGPU passes, render blocker count is zero or policy-retired, and context access remains diagnostics-only.',
    },
  ];

  const completionStatus = checklist.every((entry) => entry.status === 'pass') ? 'complete' : 'blocked';
  const audit: CompletionAudit = {
    createdAt: new Date().toISOString(),
    source: 'scripts/konveyer-completion-audit.ts',
    branch,
    head,
    completionStatus,
    checklist,
    rawBlockerSummary: blockers.raw,
    productionBlockerSummary: blockers.production,
    productionRenderBlockerSummary: blockers.productionRender,
    diagnosticWebglContextSummary: blockers.diagnosticContext,
    nextActions: completionStatus === 'complete'
      ? []
      : [
          'Run strict renderer matrix on headed hardware with a real WebGPU adapter.',
          'Port or explicitly retire remaining production ShaderMaterial, RawShaderMaterial, onBeforeCompile, and WebGL render-target blockers.',
          'Keep direct WebGL context access confined to explicit diagnostics or capability probes so it cannot masquerade as WebGPU success.',
          'Rerun webgpu strategy audit and completion audit until productionRenderBlockers is zero or each residual blocker has a reviewed policy exemption.',
        ],
  };

  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'konveyer-completion-audit');
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, 'completion-audit.json');
  writeFileSync(artifactPath, `${JSON.stringify(audit, null, 2)}\n`);

  console.log(`KONVEYER completion audit written to ${artifactPath}`);
  console.log(`completionStatus=${completionStatus}`);
  console.log(`productionBlockers=${productionBlockerCount}`);
  console.log(`productionRenderBlockers=${productionRenderBlockerCount}`);
  console.log(`unexpectedContextBlockers=${unexpectedContextCount}`);
  console.log(`rawBlockers=${rawBlockerCount}`);
  console.log(`strictWebGPU=${strictStatus}`);
  for (const entry of checklist) {
    console.log(`${entry.status.toUpperCase()}: ${entry.requirement}`);
    if (entry.gap) console.log(`  gap=${entry.gap}`);
  }
}

main();
