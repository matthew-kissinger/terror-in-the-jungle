#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, relative } from 'path';

type MatchEntry = {
  file: string;
  line: number;
  text: string;
};

type PatternSummary = {
  pattern: string;
  matches: MatchEntry[];
};

type WebgpuStrategyAudit = {
  createdAt: string;
  source: string;
  packageVersions: {
    three: string | null;
  };
  activeRuntime: {
    webglRendererEntrypoints: MatchEntry[];
    activeWebgpuSourceMatches: MatchEntry[];
    webglTypeReferences: MatchEntry[];
    migrationBlockers: PatternSummary[];
    combatantBucketCapacity: {
      defaultBucketCapacity: number | null;
      mountedBucketCapacity: number | null;
      overflowReportingPresent: boolean;
    };
  };
  priorSpike: {
    branch: string;
    commit: string | null;
    available: boolean;
    keyedInstancedPoolAt3000AvgMs: number | null;
    singleInstancedMeshAt3000AvgMs: number | null;
    recommendation: string | null;
    caveats: string[];
  };
  recommendation: {
    decision: 'reinforce-webgl' | 'commit-webgpu-migration' | 'defer-decision';
    rationale: string[];
    webgpuUnlocks: string[];
    migrationEstimate: {
      calendarWeeks: string;
      engineerHours: string;
      notes: string[];
    };
    nextActions: string[];
  };
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.html', '.json']);
const ACTIVE_DIRS = ['src', 'scripts', 'public'];
const SEARCH_EXCLUDES = new Set([
  'node_modules',
  'dist',
  'dist-perf',
  'artifacts',
  '.git',
  '.vite',
  'coverage',
]);

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readPackageThreeVersion(): string | null {
  const path = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(path, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return packageJson.dependencies?.three ?? packageJson.devDependencies?.three ?? null;
}

function collectFiles(rootDir: string): string[] {
  const root = join(process.cwd(), rootDir);
  if (!existsSync(root)) return [];
  const files: string[] = [];

  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SEARCH_EXCLUDES.has(entry)) continue;
      const path = join(dir, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        visit(path);
        continue;
      }
      if (stats.isFile() && TEXT_EXTENSIONS.has(extname(path))) {
        if (relative(process.cwd(), path).replaceAll('\\', '/') === 'scripts/webgpu-strategy-audit.ts') {
          continue;
        }
        files.push(path);
      }
    }
  };

  visit(root);
  return files;
}

function findMatches(files: string[], regex: RegExp): MatchEntry[] {
  const matches: MatchEntry[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!regex.test(lines[index])) continue;
      matches.push({
        file: relative(process.cwd(), file).replaceAll('\\', '/'),
        line: index + 1,
        text: lines[index].trim(),
      });
    }
  }
  return matches;
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function extractFirstNumber(memo: string, regex: RegExp): number | null {
  const match = memo.match(regex);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractConstNumber(content: string, name: string): number | null {
  const match = content.match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match?.[1]) return null;
  const value = Number(match[1].replaceAll('_', ''));
  return Number.isFinite(value) ? value : null;
}

function getPriorSpike(): WebgpuStrategyAudit['priorSpike'] {
  const branch = 'origin/spike/E2-rendering-at-scale';
  const commit = git(['rev-parse', branch]);
  const memo = git(['show', `${branch}:docs/rearch/E2-rendering-evaluation.md`]);
  if (!memo) {
    return {
      branch,
      commit,
      available: false,
      keyedInstancedPoolAt3000AvgMs: null,
      singleInstancedMeshAt3000AvgMs: null,
      recommendation: null,
      caveats: ['E2 spike memo was not available through git show in this checkout.'],
    };
  }

  const recommendationLine = memo
    .split(/\r?\n/)
    .find((line) => line.includes('Do NOT start a WebGPU migration')) ?? null;

  return {
    branch,
    commit,
    available: true,
    keyedInstancedPoolAt3000AvgMs: extractFirstNumber(
      memo,
      /\|\s*B\s*\|\s*3000\s*\|\s*([0-9.]+)\s*\|/,
    ),
    singleInstancedMeshAt3000AvgMs: extractFirstNumber(
      memo,
      /\|\s*C\s*\|\s*3000\s*\|\s*([0-9.]+)\s*\|/,
    ),
    recommendation: recommendationLine?.replace(/\*\*/g, '').trim() ?? null,
    caveats: [
      'Spike used a throwaway scene and reference workstation, not the current full runtime.',
      'Spike measured CPU-side renderer/update submission rather than GPU completion.',
      'Spike predates the Pixel Forge NPC/vegetation cutover and current three r184 package pin.',
    ],
  };
}

function buildAudit(): WebgpuStrategyAudit {
  const files = ACTIVE_DIRS.flatMap(collectFiles);
  const combatantMeshFactoryPath = join(process.cwd(), 'src', 'systems', 'combat', 'CombatantMeshFactory.ts');
  const combatantMeshFactory = existsSync(combatantMeshFactoryPath)
    ? readFileSync(combatantMeshFactoryPath, 'utf8')
    : '';

  const migrationPatterns = [
    { pattern: 'ShaderMaterial', regex: /\bShaderMaterial\b/ },
    { pattern: 'RawShaderMaterial', regex: /\bRawShaderMaterial\b/ },
    { pattern: 'onBeforeCompile', regex: /\bonBeforeCompile\b/ },
    { pattern: 'WebGLRenderTarget', regex: /\bWebGLRenderTarget\b/ },
    { pattern: 'renderer.getContext / WebGL context access', regex: /renderer\.getContext\(|getContext\(['"]webgl|WebGL2RenderingContext|WebGLRenderingContext|WebGLQuery|EXT_disjoint_timer_query/ },
  ];

  return {
    createdAt: new Date().toISOString(),
    source: 'KB-STRATEGIE WebGL/WebGPU strategy audit',
    packageVersions: {
      three: readPackageThreeVersion(),
    },
    activeRuntime: {
      webglRendererEntrypoints: findMatches(files, /new\s+THREE\.WebGLRenderer/),
      activeWebgpuSourceMatches: findMatches(files, /WebGPURenderer|three\/webgpu|navigator\.gpu|GPUDevice|GPUAdapter/i),
      webglTypeReferences: findMatches(files, /THREE\.WebGLRenderer|WebGL2RenderingContext|WebGLRenderingContext|WebGLQuery/),
      migrationBlockers: migrationPatterns.map(({ pattern, regex }) => ({
        pattern,
        matches: findMatches(files, regex),
      })),
      combatantBucketCapacity: {
        defaultBucketCapacity: extractConstNumber(combatantMeshFactory, 'DEFAULT_MESH_BUCKET_CAPACITY'),
        mountedBucketCapacity: extractConstNumber(combatantMeshFactory, 'MOUNTED_MESH_BUCKET_CAPACITY'),
        overflowReportingPresent: combatantMeshFactory.includes('reportBucketOverflow'),
      },
    },
    priorSpike: getPriorSpike(),
    recommendation: {
      decision: 'reinforce-webgl',
      rationale: [
        'The active runtime has no deployable WebGPU renderer path.',
        'Current high-count NPC rendering is already instanced and the E2 spike did not identify rendering as the active combat bottleneck.',
        'Current recovery blockers are texture upload, asset budgets, imposter contracts, first-use effects, culling certification, and terrain horizon representation; WebGPU does not remove those authoring and pipeline duties.',
        'Current source has many ShaderMaterial, RawShaderMaterial, onBeforeCompile, WebGLRenderTarget, and direct WebGL context dependencies that must be ported or abstracted for WebGPURenderer.',
      ],
      webgpuUnlocks: [
        'Compute-driven terrain and vegetation culling.',
        'Storage-buffer or compute-updated transforms.',
        'Indirect draw paths for GPU-driven render submission.',
        'Modern post-processing and MRT composition through Three WebGPU/TSL.',
      ],
      migrationEstimate: {
        calendarWeeks: '6-10 weeks for production replacement; 3-5 weeks for a credible dual-backend prototype',
        engineerHours: '240-400h for production replacement; 120-220h for prototype',
        notes: [
          'Estimate is based on active source dependency count, not a completed port.',
          'The critical path is shader/material/post-processing/telemetry migration plus cross-browser validation, not only swapping renderer construction.',
          'Any WebGPU route needs a WebGL fallback or explicit browser-support decision.',
        ],
      },
      nextActions: [
        'Do not commit to WebGPU migration in the stabilization cycle.',
        'Keep WebGL and fix measured blockers first: texture upload policy, asset acceptance, imposter parity, effect warmup, culling certification, and outer canopy representation.',
        'After stabilization, run a contained WebGPU/TSL spike for one isolated renderer path before any point-of-no-return migration.',
      ],
    },
  };
}

function writeAudit(audit: WebgpuStrategyAudit): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'webgpu-strategy-audit');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'strategy-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const audit = buildAudit();
  const outputPath = writeAudit(audit);
  const blockerCount = audit.activeRuntime.migrationBlockers
    .reduce((sum, blocker) => sum + blocker.matches.length, 0);
  console.log(`WebGPU strategy audit written to ${outputPath}`);
  console.log(`three=${audit.packageVersions.three ?? 'unknown'}`);
  console.log(`activeWebgpuSourceMatches=${audit.activeRuntime.activeWebgpuSourceMatches.length}`);
  console.log(`webglRendererEntrypoints=${audit.activeRuntime.webglRendererEntrypoints.length}`);
  console.log(`migrationBlockerMatches=${blockerCount}`);
  console.log(`e2SpikeAvailable=${audit.priorSpike.available}`);
  console.log(`recommendation=${audit.recommendation.decision}`);
}

main();
