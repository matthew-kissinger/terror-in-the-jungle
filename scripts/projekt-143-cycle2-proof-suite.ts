#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

type CheckStatus = 'pass' | 'warn' | 'fail';

type ProofCheck = {
  id: string;
  status: CheckStatus;
  summary: string;
  evidence: Record<string, unknown>;
};

type SceneAttributionEntry = {
  category?: string;
  drawCallLike?: number;
  visibleTriangles?: number;
  triangles?: number;
};

type PerfSummary = {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  artifactDir?: string;
  scenario?: {
    mode?: string;
  };
};

type RuntimeShot = {
  kind?: string;
  file?: string;
  metrics?: {
    rendererInfo?: {
      drawCalls?: number;
      triangles?: number;
      textures?: number;
      programs?: number;
    };
    terrain?: {
      activeTerrainTiles?: number;
      vegetationActiveTotal?: number | null;
    };
  };
  imageMetrics?: unknown;
};

type RuntimeScenario = {
  key?: string;
  mode?: string;
  shots?: RuntimeShot[];
  browserErrors?: string[];
  browserWarnings?: string[];
  error?: string;
};

type RuntimeProofSummary = {
  generatedAt?: string;
  serverMode?: string;
  outputDir?: string;
  scenarios?: RuntimeScenario[];
};

type OpticsAudit = {
  createdAt?: string;
  summary?: {
    npcEntries?: number;
    npcFlaggedEntries?: number;
    vegetationEntries?: number;
    vegetationFlaggedEntries?: number;
  };
};

type HorizonAudit = {
  createdAt?: string;
  summary?: {
    modes?: number;
    flaggedModes?: number;
    largestBareTerrainBandMeters?: number;
    largestBareTerrainBandMode?: string | null;
  };
};

type ProofSuite = {
  createdAt: string;
  sourceGitSha: string;
  status: CheckStatus;
  mode: 'cycle2-visual-runtime-proof';
  inputs: Record<string, string | null>;
  checks: ProofCheck[];
  openItems: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-cycle2-proof-suite';
const REQUIRED_SCENE_CATEGORIES = [
  'world_static_features',
  'fixed_wing_aircraft',
  'helicopters',
  'vegetation_imposters',
  'npc_imposters',
  'npc_close_glb',
];

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(root: string, predicate: (path: string) => boolean): string | null {
  const files = walkFiles(root, predicate);
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function findLatestPerfSummaryForMode(mode: string): string | null {
  const candidates = walkFiles(ARTIFACT_ROOT, (path) => path.endsWith('summary.json'));
  const matches = candidates.filter((path) => {
    try {
      return readJson<PerfSummary>(path).scenario?.mode === mode && existsSync(join(path, '..', 'scene-attribution.json'));
    } catch {
      return false;
    }
  });
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function severity(checks: ProofCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function checkRuntimeHorizon(summaryPath: string | null): ProofCheck {
  if (!summaryPath) {
    return {
      id: 'runtime_horizon_screenshots',
      status: 'fail',
      summary: 'No Cycle 2 runtime screenshot summary was found.',
      evidence: {},
    };
  }

  const summary = readJson<RuntimeProofSummary>(summaryPath);
  const requiredModes = ['open_frontier', 'a_shau_valley'];
  const scenarioEvidence = requiredModes.map((mode) => {
    const scenario = summary.scenarios?.find((candidate) => candidate.mode === mode);
    const shots = scenario?.shots ?? [];
    const requiredShots = ['ground-readability', 'sky-coverage', 'aircraft-clouds'];
    const missingShots = requiredShots.filter((kind) => {
      const shot = shots.find((candidate) => candidate.kind === kind);
      return !shot?.file || !existsSync(shot.file);
    });
    const rendererSamples = shots
      .map((shot) => ({
        kind: shot.kind,
        rendererInfo: shot.metrics?.rendererInfo ?? null,
        activeTerrainTiles: shot.metrics?.terrain?.activeTerrainTiles ?? null,
        vegetationActiveTotal: shot.metrics?.terrain?.vegetationActiveTotal ?? null,
      }));
    return {
      mode,
      found: Boolean(scenario),
      error: scenario?.error ?? null,
      missingShots,
      browserErrors: scenario?.browserErrors?.length ?? 0,
      browserWarnings: scenario?.browserWarnings?.length ?? 0,
      rendererSamples,
    };
  });

  const hardFailures = scenarioEvidence.filter((entry) => !entry.found || entry.error || entry.missingShots.length > 0);
  const warnings = scenarioEvidence.filter((entry) => entry.browserErrors > 0);
  return {
    id: 'runtime_horizon_screenshots',
    status: hardFailures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    summary: hardFailures.length > 0
      ? 'Open Frontier and A Shau runtime horizon screenshots are incomplete.'
      : 'Open Frontier and A Shau elevated runtime screenshots exist with renderer/terrain samples.',
    evidence: {
      summaryPath: rel(summaryPath),
      generatedAt: summary.generatedAt ?? null,
      serverMode: summary.serverMode ?? null,
      scenarios: scenarioEvidence,
    },
  };
}

function checkCullingAttribution(summaryPaths: string[]): ProofCheck {
  if (summaryPaths.length < 2) {
    return {
      id: 'culling_scene_attribution',
      status: 'fail',
      summary: 'Open Frontier and A Shau scene-attribution captures are both required.',
      evidence: { summaryPaths: summaryPaths.map(rel) },
    };
  }

  const captures = summaryPaths.map((summaryPath) => {
    const summary = readJson<PerfSummary>(summaryPath);
    const attributionPath = join(summaryPath, '..', 'scene-attribution.json');
    const entries = readJson<SceneAttributionEntry[]>(attributionPath);
    const totalVisibleTriangles = entries.reduce((sum, entry) => sum + Number(entry.visibleTriangles ?? 0), 0);
    const byCategory = new Map(entries.map((entry) => [entry.category ?? 'unknown', entry]));
    const unattributed = byCategory.get('unattributed');
    const unattributedVisibleTriangles = Number(unattributed?.visibleTriangles ?? 0);
    const missingCategories = REQUIRED_SCENE_CATEGORIES.filter((category) => !byCategory.has(category));
    const zeroVisibleCategories = REQUIRED_SCENE_CATEGORIES.filter((category) => {
      const entry = byCategory.get(category);
      return entry && Number(entry.visibleTriangles ?? 0) <= 0;
    });

    return {
      mode: summary.scenario?.mode ?? null,
      startedAt: summary.startedAt ?? null,
      endedAt: summary.endedAt ?? null,
      durationSeconds: summary.durationSeconds ?? null,
      summaryPath: rel(summaryPath),
      sceneAttributionPath: rel(attributionPath),
      totalVisibleTriangles,
      unattributedVisibleTriangles,
      unattributedVisibleTrianglePercent: totalVisibleTriangles > 0
        ? Number(((unattributedVisibleTriangles / totalVisibleTriangles) * 100).toFixed(2))
        : null,
      missingCategories,
      zeroVisibleCategories,
      categories: REQUIRED_SCENE_CATEGORIES.map((category) => {
        const entry = byCategory.get(category);
        return {
          category,
          drawCallLike: entry?.drawCallLike ?? null,
          visibleTriangles: entry?.visibleTriangles ?? null,
          triangles: entry?.triangles ?? null,
        };
      }),
    };
  });

  const missing = captures.filter((capture) => capture.missingCategories.length > 0);
  const overUnattributedBudget = captures.filter((capture) =>
    capture.unattributedVisibleTrianglePercent !== null && capture.unattributedVisibleTrianglePercent > 10
  );
  const zeroVisible = captures.filter((capture) => capture.zeroVisibleCategories.length > 0);
  const status: CheckStatus = missing.length > 0 || overUnattributedBudget.length > 0
    ? 'fail'
    : zeroVisible.length > 0
      ? 'warn'
      : 'pass';

  return {
    id: 'culling_scene_attribution',
    status,
    summary: status === 'pass'
      ? 'Representative captures identify required renderer categories with unattributed visible triangles under 10%.'
      : status === 'warn'
        ? 'Scene attribution is under the unattributed triangle budget, but some required categories have zero visible triangles and need dedicated views before certification.'
        : 'Scene attribution is missing required categories or exceeds the unattributed triangle budget.',
    evidence: { captures },
  };
}

function checkNpcMatchedProof(opticsPath: string | null): ProofCheck {
  const optics = opticsPath ? readJson<OpticsAudit>(opticsPath) : null;
  return {
    id: 'npc_glb_imposter_matched_screenshots',
    status: 'warn',
    summary: 'Static optics evidence exists, but matched close-GLB/imposter screenshot crops are not certified yet.',
    evidence: {
      opticsAuditPath: rel(opticsPath),
      createdAt: optics?.createdAt ?? null,
      npcEntries: optics?.summary?.npcEntries ?? null,
      npcFlaggedEntries: optics?.summary?.npcFlaggedEntries ?? null,
      requiredNextEvidence: [
        'close GLB crop at selected LOD switch distance',
        'matching imposter crop from the same camera/light setup',
        'projected height delta',
        'mean opaque luma/chroma delta',
      ],
    },
  };
}

function checkStaticHorizon(horizonPath: string | null): ProofCheck {
  if (!horizonPath) {
    return {
      id: 'static_horizon_audit',
      status: 'fail',
      summary: 'No static vegetation horizon audit was found.',
      evidence: {},
    };
  }
  const audit = readJson<HorizonAudit>(horizonPath);
  return {
    id: 'static_horizon_audit',
    status: 'pass',
    summary: 'Static vegetation horizon audit is available to pair with runtime screenshots.',
    evidence: {
      horizonAuditPath: rel(horizonPath),
      createdAt: audit.createdAt ?? null,
      modes: audit.summary?.modes ?? null,
      flaggedModes: audit.summary?.flaggedModes ?? null,
      largestBareTerrainBandMeters: audit.summary?.largestBareTerrainBandMeters ?? null,
      largestBareTerrainBandMode: audit.summary?.largestBareTerrainBandMode ?? null,
    },
  };
}

function writeMarkdown(report: ProofSuite, file: string): void {
  const lines = [
    '# Projekt Objekt-143 Cycle 2 Proof Suite',
    '',
    `Generated: ${report.createdAt}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Status: ${report.status.toUpperCase()}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Summary |',
    '| --- | --- | --- |',
    ...report.checks.map((check) => `| ${check.id} | ${check.status.toUpperCase()} | ${check.summary} |`),
    '',
    '## Open Items',
    '',
    ...report.openItems.map((item) => `- ${item}`),
    '',
  ];
  writeFileSync(file, lines.join('\n'), 'utf-8');
}

function main(): void {
  const runtimeSummary = argValue('--runtime-summary')
    ?? latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join(OUTPUT_NAME.replace('proof-suite', 'runtime-proof'), 'summary.json')));
  const openFrontierSummary = argValue('--openfrontier-summary') ?? findLatestPerfSummaryForMode('open_frontier');
  const aShauSummary = argValue('--ashau-summary') ?? findLatestPerfSummaryForMode('a_shau_valley');
  const opticsAudit = argValue('--optics-audit')
    ?? latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('pixel-forge-imposter-optics-audit', 'optics-audit.json')));
  const horizonAudit = argValue('--horizon-audit')
    ?? latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('vegetation-horizon-audit', 'horizon-audit.json')));

  const checks: ProofCheck[] = [
    checkRuntimeHorizon(runtimeSummary),
    checkStaticHorizon(horizonAudit),
    checkCullingAttribution([openFrontierSummary, aShauSummary].filter((path): path is string => Boolean(path))),
    checkNpcMatchedProof(opticsAudit),
  ];

  const report: ProofSuite = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    status: severity(checks),
    mode: 'cycle2-visual-runtime-proof',
    inputs: {
      runtimeSummary: rel(runtimeSummary),
      openFrontierSummary: rel(openFrontierSummary),
      aShauSummary: rel(aShauSummary),
      opticsAudit: rel(opticsAudit),
      horizonAudit: rel(horizonAudit),
    },
    checks,
    openItems: [
      'Add dedicated matched close-GLB/imposter screenshot crops for NPC LOD switch distances.',
      'Add dedicated close-NPC and NPC-imposter culling views where those categories are visibly populated.',
      'Do not accept shader, atlas, culling, or far-canopy remediation until this suite is PASS or a documented exception exists.',
    ],
  };

  const outputDir = argValue('--out-dir') ?? join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'cycle2-proof-summary.json');
  const markdownFile = join(outputDir, 'cycle2-proof-summary.md');
  writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');
  writeMarkdown(report, markdownFile);

  console.log(`Cycle 2 proof suite ${report.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const check of checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}: ${check.summary}`);
  }

  if (process.argv.includes('--strict') && report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
