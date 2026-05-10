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
  nearMetalPlatformTrack: {
    sourceMatches: {
      gpuTiming: MatchEntry[];
      deviceClassPolicy: MatchEntry[];
      offscreenCanvas: MatchEntry[];
      sharedArrayBuffer: MatchEntry[];
      crossOriginIsolation: MatchEntry[];
      workerRendering: MatchEntry[];
    };
    browserProbeStatus: 'deferred_resource_contention' | 'ready_to_run';
    requiredBrowserProbeFields: string[];
    nextActions: string[];
    nonClaims: string[];
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
const TOOLING_SELF_EXCLUDES = new Set([
  'scripts/webgpu-strategy-audit.ts',
  'scripts/audit-archive/completion-audit.ts',
  'scripts/check-platform-capabilities.ts',
]);
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
        if (TOOLING_SELF_EXCLUDES.has(relative(process.cwd(), path).replaceAll('\\', '/'))) {
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
  const browserProbeStatus = process.env.PROJEKT_143_PLATFORM_BROWSER_READY === '1'
    ? 'ready_to_run'
    : 'deferred_resource_contention';
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
    nearMetalPlatformTrack: {
      sourceMatches: {
        gpuTiming: findMatches(files, /EXT_disjoint_timer_query|GPUTimingTelemetry|gpuTiming|GPU_DISJOINT_EXT/),
        deviceClassPolicy: findMatches(files, /estimateGPUTier|DeviceDetector|deviceMemory|hardwareConcurrency|isMobileDevice/),
        offscreenCanvas: findMatches(files, /OffscreenCanvas|transferControlToOffscreen/),
        sharedArrayBuffer: findMatches(files, /SharedArrayBuffer|Atomics\b/),
        crossOriginIsolation: findMatches(files, /crossOriginIsolated|Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy|COOP|COEP/),
        workerRendering: findMatches(files, /new\s+Worker|WorkerNavigator|worker\.requestAnimationFrame|DedicatedWorkerGlobalScope/),
      },
      browserProbeStatus,
      requiredBrowserProbeFields: [
        'navigator.gpu availability, adapter info where exposed, supported features, and limits.',
        'WebGL2 extension set, including EXT_disjoint_timer_query_webgl2 availability.',
        'OffscreenCanvas and transferControlToOffscreen availability for the game canvas.',
        'crossOriginIsolated, SharedArrayBuffer constructor visibility, Atomics availability, hardwareConcurrency, and deviceMemory.',
        'WebGL renderer/vendor strings and current DeviceDetector tier result.',
        'Whether the capture window is single-monitor, fixed 1920x1080, and deviceScaleFactor=1.',
      ],
      nextActions: [
        'Run npm run check:platform-capabilities -- --run-browser --headed only when the machine is quiet.',
        'Keep the probe read-only; it must not select WebGPU or OffscreenCanvas runtime code by itself.',
        'Use the probe to decide whether WebGL2 timer coverage, WASM threads, worker rendering, or WebGPU spikes are even viable on the owner machine and deployed Pages.',
      ],
      nonClaims: [
        'This static audit does not prove browser support on the owner machine.',
        'This static audit does not approve native bindings, WebGPU migration, OffscreenCanvas rendering, or WASM-thread rewrites.',
      ],
    },
    priorSpike: getPriorSpike(),
    recommendation: {
      decision: 'commit-webgpu-migration',
      rationale: [
        'The active runtime now has a deployable WebGPURenderer path and default startup requests WebGPU.',
        'Strict WebGPU proof is separated from fallback behavior; strict must resolve backend=webgpu and the forced fallback path is explicitly labeled.',
        'Production custom shader and render-target blockers have been ported or retired in the completion audit; remaining raw matches are docs, tests, archived scripts, asset metadata, and diagnostics.',
        'Remaining review risk is perf/browser acceptance and GPU timing telemetry policy, not renderer construction or active production GLSL material blockers.',
      ],
      webgpuUnlocks: [
        'Compute-driven terrain and vegetation culling.',
        'Storage-buffer or compute-updated transforms.',
        'Indirect draw paths for GPU-driven render submission.',
        'Modern post-processing and MRT composition through Three WebGPU/TSL.',
      ],
      migrationEstimate: {
        calendarWeeks: 'branch migration is review-ready; expect 1-2 weeks for hardware matrix, perf hardening, and rollout approval',
        engineerHours: '40-80h for reviewer hardening and cross-browser/default-on release checks',
        notes: [
          'Estimate now assumes the KONVEYER branch ports stay accepted and no cross-browser WebGPU renderer regressions appear.',
          'The critical path after this point is perf evidence, headed hardware coverage, telemetry policy, and release rollback behavior.',
          'WebGL remains available as an explicit compatibility path; fallback success must not satisfy strict WebGPU proof.',
        ],
      },
      nextActions: [
        'Keep the default-on WebGPU branch isolated until headed renderer matrix, terrain visual, combat120, and perf comparison evidence are reviewed.',
        'Run strict WebGPU proof only on hardware adapter runs; use headless fallback artifacts as compatibility evidence, not success proof.',
        'Plan a separate GPU timing telemetry follow-up for WebGPU timestamp query support or explicit unavailable status.',
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
  console.log(`nearMetalBrowserProbeStatus=${audit.nearMetalPlatformTrack.browserProbeStatus}`);
  console.log(`e2SpikeAvailable=${audit.priorSpike.available}`);
  console.log(`recommendation=${audit.recommendation.decision}`);
}

main();
