#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import {
  PROJEKT_143_REQUIRED_SCENE_CATEGORIES,
  type SceneAttributionEntry,
} from './scene-attribution';

type CheckStatus = 'pass' | 'warn' | 'fail';

type ProofCheck = {
  id: string;
  status: CheckStatus;
  summary: string;
  evidence: Record<string, unknown>;
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

type OpticsScaleProof = {
  createdAt?: string;
  sourceGitSha?: string;
  status?: CheckStatus;
  files?: {
    summary?: string;
    markdown?: string;
    lineupScreenshot?: string;
  };
  runtimeContracts?: {
    npc?: {
      visualHeightMeters?: number;
      spriteWidthMeters?: number;
      closeModelTargetHeightMeters?: number;
    };
  };
  npcComparisons?: Array<{
    runtimeFaction?: string;
    clip?: string;
    files?: {
      closeCrop?: string;
      imposterCrop?: string;
    };
    closeImageStats?: {
      visibleBounds?: { height?: number } | null;
      meanOpaqueLuma?: number | null;
      meanOpaqueChroma?: number | null;
    };
    imposterImageStats?: {
      visibleBounds?: { height?: number } | null;
      meanOpaqueLuma?: number | null;
      meanOpaqueChroma?: number | null;
    };
    deltas?: {
      renderedVisibleHeightRatio?: number | null;
      renderedVisibleHeightDeltaPercent?: number | null;
      meanOpaqueLumaDelta?: number | null;
      meanOpaqueChromaDelta?: number | null;
    };
    flags?: string[];
  }>;
  aircraftNativeScale?: Array<{
    key?: string;
    nativeBoundsMeters?: {
      widthX?: number;
      heightY?: number;
      depthZ?: number;
      longestAxis?: number;
    };
    nativeLongestAxisToNpcVisualHeight?: number;
  }>;
  findings?: string[];
  measurementTrust?: {
    status?: CheckStatus;
    flags?: Record<string, unknown>;
    summary?: string;
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

type CullingProofSummary = {
  createdAt?: string;
  sourceGitSha?: string;
  status?: CheckStatus;
  files?: {
    summary?: string;
    screenshot?: string;
    sceneAttribution?: string;
    rendererInfo?: string;
    cpuProfile?: string | null;
  };
  rendererInfo?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
    programs?: number;
    webglRenderer?: string | null;
  } | null;
  categoryCoverage?: Array<{
    category?: string;
    present?: boolean;
    visibleTriangles?: number;
    drawCallLike?: number;
  }>;
  measurementTrust?: {
    status?: CheckStatus;
    flags?: Record<string, unknown>;
    summary?: string;
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

function checkCullingAttribution(summaryPaths: string[], cullingProofPath: string | null): ProofCheck {
  if (summaryPaths.length < 2) {
    return {
      id: 'culling_scene_attribution',
      status: 'fail',
      summary: 'Open Frontier and A Shau scene-attribution captures are both required.',
      evidence: { summaryPaths: summaryPaths.map(rel), cullingProofPath: rel(cullingProofPath) },
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
    const missingCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => !byCategory.has(category));
    const zeroVisibleCategories = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.filter((category) => {
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
      categories: PROJEKT_143_REQUIRED_SCENE_CATEGORIES.map((category) => {
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
  const cullingProof = cullingProofPath ? readJson<CullingProofSummary>(cullingProofPath) : null;
  const proofCoverage = PROJEKT_143_REQUIRED_SCENE_CATEGORIES.map((category) => {
    const entry = cullingProof?.categoryCoverage?.find((candidate) => candidate.category === category);
    return {
      category,
      present: Boolean(entry?.present),
      visibleTriangles: Number(entry?.visibleTriangles ?? 0),
      drawCallLike: Number(entry?.drawCallLike ?? 0),
    };
  });
  const proofCoversRequiredCategories = proofCoverage.every((entry) => entry.present && entry.visibleTriangles > 0);
  const proofTrusted = cullingProof?.status === 'pass' && cullingProof.measurementTrust?.status === 'pass';
  const proofCertifiesMissingRuntimeViews = proofTrusted && proofCoversRequiredCategories;
  const runtimeViewGaps = missing.length > 0 || zeroVisible.length > 0;
  const status: CheckStatus = overUnattributedBudget.length > 0
    ? 'fail'
    : runtimeViewGaps
      ? proofCertifiesMissingRuntimeViews
        ? 'pass'
        : missing.length > 0
          ? 'fail'
          : 'warn'
      : 'pass';

  return {
    id: 'culling_scene_attribution',
    status,
    summary: status === 'pass'
      ? runtimeViewGaps
        ? 'Representative captures stay under the unattributed triangle budget, and the dedicated low-overhead proof covers required renderer categories.'
        : 'Representative captures identify required renderer categories with unattributed visible triangles under 10%.'
      : status === 'warn'
        ? 'Scene attribution is under the unattributed triangle budget, but some required categories have zero visible triangles and need dedicated views before certification.'
        : 'Scene attribution exceeds the unattributed triangle budget, lacks trusted dedicated proof, or is missing required categories.',
    evidence: {
      captures,
      dedicatedProof: {
        summaryPath: rel(cullingProofPath),
        createdAt: cullingProof?.createdAt ?? null,
        sourceGitSha: cullingProof?.sourceGitSha ?? null,
        status: cullingProof?.status ?? null,
        measurementTrustStatus: cullingProof?.measurementTrust?.status ?? null,
        measurementTrustFlags: cullingProof?.measurementTrust?.flags ?? null,
        rendererInfo: cullingProof?.rendererInfo ?? null,
        files: cullingProof?.files ?? null,
        categoryCoverage: proofCoverage,
        proofCoversRequiredCategories,
        proofTrusted,
      },
    },
  };
}

function checkNpcMatchedProof(opticsPath: string | null, scaleProofPath: string | null): ProofCheck {
  const optics = opticsPath ? readJson<OpticsAudit>(opticsPath) : null;
  const scaleProof = scaleProofPath ? readJson<OpticsScaleProof>(scaleProofPath) : null;
  const trustedScaleProof = scaleProof?.status === 'pass' && scaleProof.measurementTrust?.status === 'pass';
  const comparisonCount = scaleProof?.npcComparisons?.length ?? 0;
  const completeCrops = (scaleProof?.npcComparisons ?? []).filter((comparison) =>
    comparison.files?.closeCrop
    && existsSync(comparison.files.closeCrop)
    && comparison.files?.imposterCrop
    && existsSync(comparison.files.imposterCrop)
  ).length;
  const hasAircraftScale = (scaleProof?.aircraftNativeScale?.length ?? 0) >= 6;
  const status: CheckStatus = trustedScaleProof && comparisonCount >= 4 && completeCrops >= 4 && hasAircraftScale
    ? 'pass'
    : scaleProofPath
      ? 'fail'
      : 'warn';

  return {
    id: 'npc_glb_imposter_matched_screenshots',
    status,
    summary: status === 'pass'
      ? 'Matched close-GLB/imposter crops and native aircraft scale evidence are captured for KB-OPTIK review.'
      : scaleProofPath
        ? 'A matched close-GLB/imposter proof exists, but it is incomplete or untrusted.'
        : 'Static optics evidence exists, but matched close-GLB/imposter screenshot crops are not certified yet.',
    evidence: {
      opticsAuditPath: rel(opticsPath),
      createdAt: optics?.createdAt ?? null,
      npcEntries: optics?.summary?.npcEntries ?? null,
      npcFlaggedEntries: optics?.summary?.npcFlaggedEntries ?? null,
      scaleProof: {
        summaryPath: rel(scaleProofPath),
        createdAt: scaleProof?.createdAt ?? null,
        sourceGitSha: scaleProof?.sourceGitSha ?? null,
        status: scaleProof?.status ?? null,
        measurementTrustStatus: scaleProof?.measurementTrust?.status ?? null,
        measurementTrustFlags: scaleProof?.measurementTrust?.flags ?? null,
        runtimeNpcVisualHeightMeters: scaleProof?.runtimeContracts?.npc?.visualHeightMeters ?? null,
        comparisonCount,
        completeCrops,
        aircraftScaleEntries: scaleProof?.aircraftNativeScale?.length ?? null,
        lineupScreenshot: scaleProof?.files?.lineupScreenshot ?? null,
        findings: scaleProof?.findings ?? [],
        npcDeltas: (scaleProof?.npcComparisons ?? []).map((comparison) => ({
          runtimeFaction: comparison.runtimeFaction ?? null,
          clip: comparison.clip ?? null,
          closeVisibleHeightPx: comparison.closeImageStats?.visibleBounds?.height ?? null,
          imposterVisibleHeightPx: comparison.imposterImageStats?.visibleBounds?.height ?? null,
          renderedVisibleHeightRatio: comparison.deltas?.renderedVisibleHeightRatio ?? null,
          renderedVisibleHeightDeltaPercent: comparison.deltas?.renderedVisibleHeightDeltaPercent ?? null,
          meanOpaqueLumaDelta: comparison.deltas?.meanOpaqueLumaDelta ?? null,
          meanOpaqueChromaDelta: comparison.deltas?.meanOpaqueChromaDelta ?? null,
          flags: comparison.flags ?? [],
          files: comparison.files ?? null,
        })),
        aircraftNativeScale: (scaleProof?.aircraftNativeScale ?? []).map((entry) => ({
          key: entry.key ?? null,
          nativeBoundsMeters: entry.nativeBoundsMeters ?? null,
          nativeLongestAxisToNpcVisualHeight: entry.nativeLongestAxisToNpcVisualHeight ?? null,
        })),
      },
      requiredNextEvidence: [
        'use the matched crops to decide whether current NPC scale is acceptable',
        'use the aircraft native bounds to decide whether vehicle GLB unit scale needs normalization',
        'do not ship a scale, shader, or atlas remediation without before/after matched proof',
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
  const cullingProof = argValue('--culling-proof')
    ?? latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('projekt-143-culling-proof', 'summary.json')));
  const opticsScaleProof = argValue('--optics-scale-proof')
    ?? latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('projekt-143-optics-scale-proof', 'summary.json')));

  const checks: ProofCheck[] = [
    checkRuntimeHorizon(runtimeSummary),
    checkStaticHorizon(horizonAudit),
    checkCullingAttribution([openFrontierSummary, aShauSummary].filter((path): path is string => Boolean(path)), cullingProof),
    checkNpcMatchedProof(opticsAudit, opticsScaleProof),
  ];
  const cullingCheck = checks.find((check) => check.id === 'culling_scene_attribution');
  const npcMatchedCheck = checks.find((check) => check.id === 'npc_glb_imposter_matched_screenshots');
  const openItems = [
    ...(npcMatchedCheck?.status === 'pass'
      ? []
      : ['Add dedicated matched close-GLB/imposter screenshot crops for NPC LOD switch distances.']),
    ...(cullingCheck?.status === 'pass'
      ? []
      : ['Add dedicated close-NPC and NPC-imposter culling views where those categories are visibly populated.']),
    'Do not accept shader, atlas, culling, or far-canopy remediation until this suite is PASS or a documented exception exists.',
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
      cullingProof: rel(cullingProof),
      opticsAudit: rel(opticsAudit),
      opticsScaleProof: rel(opticsScaleProof),
      horizonAudit: rel(horizonAudit),
    },
    checks,
    openItems,
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
