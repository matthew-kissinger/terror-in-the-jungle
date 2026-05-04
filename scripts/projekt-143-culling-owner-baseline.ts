#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type OwnerStatus = 'ready_for_branch' | 'diagnostic_only' | 'blocked';

type ValidationCheck = {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
};

type SceneAttributionEntry = {
  category?: string;
  objects?: number;
  visibleObjects?: number;
  meshes?: number;
  drawCallLike?: number;
  instances?: number;
  triangles?: number;
  visibleTriangles?: number;
  materials?: number;
};

type PerfSummary = {
  startedAt?: string;
  durationSeconds?: number;
  scenario?: { mode?: string };
  validation?: { overall?: CheckStatus };
  measurementTrust?: {
    status?: CheckStatus;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
    sampleCount?: number;
  };
  sceneAttribution?: SceneAttributionEntry[];
};

type RuntimeSample = {
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  renderer?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
    programs?: number;
  };
};

type CullingProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus; flags?: Record<string, unknown> };
  rendererInfo?: {
    drawCalls?: number;
    triangles?: number;
    geometries?: number;
    textures?: number;
    programs?: number;
  } | null;
  files?: {
    summary?: string;
    markdown?: string;
    screenshot?: string;
    sceneAttribution?: string;
    rendererInfo?: string;
    cpuProfile?: string | null;
  };
};

type CategoryDigest = {
  category: string;
  drawCallLike: number;
  objects: number;
  visibleObjects: number;
  meshes: number;
  instances: number;
  triangles: number;
  visibleTriangles: number;
  materials: number;
};

type PerfDigest = {
  path: string | null;
  sceneAttributionPath: string | null;
  runtimeSamplesPath: string | null;
  mode: string;
  trusted: boolean;
  startedAt: string | null;
  durationSeconds: number | null;
  validationOverall: CheckStatus | null;
  measurementTrustStatus: CheckStatus | null;
  probeRoundTripAvgMs: number | null;
  probeRoundTripP95Ms: number | null;
  missedSampleRate: number | null;
  sampleCount: number | null;
  maxRendererDrawCalls: number | null;
  maxRendererTriangles: number | null;
  maxP95FrameMs: number | null;
  maxP99FrameMs: number | null;
  maxFrameMs: number | null;
  categories: CategoryDigest[];
  visibleUnattributedPercent: number | null;
};

type OwnerCandidate = {
  id: string;
  status: OwnerStatus;
  summary: string;
  ownerCategories: string[];
  evidence: Record<string, unknown>;
  requiredBefore: string[];
  acceptance: string[];
  nonClaims: string[];
};

type CullingOwnerBaseline = {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  mode: 'projekt-143-culling-owner-baseline';
  status: CheckStatus;
  files: {
    summary: string;
    markdown: string;
  };
  inputs: {
    cullingProof: string | null;
    openFrontierPerfSummary: string | null;
    aShauPerfSummary: string | null;
    combatDiagnosticSummary: string | null;
  };
  cullingProof: {
    status: CheckStatus | null;
    measurementTrustStatus: CheckStatus | null;
    rendererDrawCalls: number | null;
    rendererTriangles: number | null;
    files: CullingProof['files'] | null;
  };
  performanceBaselines: {
    openFrontier: PerfDigest;
    aShau: PerfDigest;
    combatDiagnostic: PerfDigest;
  };
  selectedOwnerPath: OwnerCandidate | null;
  ownerCandidates: OwnerCandidate[];
  measurementTrust: {
    status: CheckStatus;
    flags: Record<string, unknown>;
    checks: ValidationCheck[];
    summary: string;
  };
  checks: ValidationCheck[];
  openItems: string[];
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-culling-owner-baseline';
const LARGE_MODE_OWNER_CATEGORIES = ['world_static_features', 'helicopters'];
const REQUIRED_VISIBLE_UNATTRIBUTED_MAX_PERCENT = 10;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function gitStatusShort(): string[] {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function relRequired(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
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

function latestFile(predicate: (path: string) => boolean): string | null {
  const files = walkFiles(ARTIFACT_ROOT, predicate);
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function latestPerfSummaryForMode(mode: string, trustedOnly: boolean): string | null {
  return latestFile((path) => {
    if (!path.endsWith('summary.json')) return false;
    try {
      const summary = readJson<PerfSummary>(path);
      if (summary.scenario?.mode !== mode) return false;
      if (!existsSync(join(path, '..', 'scene-attribution.json'))) return false;
      if (!existsSync(join(path, '..', 'runtime-samples.json'))) return false;
      return !trustedOnly || summary.measurementTrust?.status === 'pass';
    } catch {
      return false;
    }
  });
}

function latestCullingProof(): string | null {
  return latestFile((path) => path.endsWith(join('projekt-143-culling-proof', 'summary.json')));
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(3));
}

function numericMax(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Number(Math.max(...finite).toFixed(3)) : null;
}

function digestCategory(entry: SceneAttributionEntry | undefined, category: string): CategoryDigest {
  return {
    category,
    drawCallLike: num(entry?.drawCallLike),
    objects: num(entry?.objects),
    visibleObjects: num(entry?.visibleObjects),
    meshes: num(entry?.meshes),
    instances: num(entry?.instances),
    triangles: num(entry?.triangles),
    visibleTriangles: num(entry?.visibleTriangles),
    materials: num(entry?.materials),
  };
}

function category(digest: PerfDigest, id: string): CategoryDigest {
  return digest.categories.find((entry) => entry.category === id) ?? digestCategory(undefined, id);
}

function visibleUnattributedPercent(categories: CategoryDigest[]): number | null {
  const totalVisible = categories.reduce((sum, entry) => sum + entry.visibleTriangles, 0);
  const unattributed = categories.find((entry) => entry.category === 'unattributed')?.visibleTriangles ?? 0;
  return totalVisible > 0 ? Number(((unattributed / totalVisible) * 100).toFixed(3)) : null;
}

function perfDigest(path: string | null, mode: string): PerfDigest {
  if (!path) {
    return {
      path: null,
      sceneAttributionPath: null,
      runtimeSamplesPath: null,
      mode,
      trusted: false,
      startedAt: null,
      durationSeconds: null,
      validationOverall: null,
      measurementTrustStatus: null,
      probeRoundTripAvgMs: null,
      probeRoundTripP95Ms: null,
      missedSampleRate: null,
      sampleCount: null,
      maxRendererDrawCalls: null,
      maxRendererTriangles: null,
      maxP95FrameMs: null,
      maxP99FrameMs: null,
      maxFrameMs: null,
      categories: [],
      visibleUnattributedPercent: null,
    };
  }

  const summary = readJson<PerfSummary>(path);
  const sceneAttributionPath = join(path, '..', 'scene-attribution.json');
  const runtimeSamplesPath = join(path, '..', 'runtime-samples.json');
  const rawCategories = existsSync(sceneAttributionPath) ? readJson<SceneAttributionEntry[]>(sceneAttributionPath) : [];
  const samples = existsSync(runtimeSamplesPath) ? readJson<RuntimeSample[]>(runtimeSamplesPath) : [];
  const categoryIds = [
    'terrain',
    'vegetation_imposters',
    'world_static_features',
    'fixed_wing_aircraft',
    'helicopters',
    'npc_close_glb',
    'npc_imposters',
    'weapons',
    'unattributed',
  ];
  const categories = categoryIds.map((id) => digestCategory(rawCategories.find((entry) => entry.category === id), id));

  return {
    path: rel(path),
    sceneAttributionPath: existsSync(sceneAttributionPath) ? rel(sceneAttributionPath) : null,
    runtimeSamplesPath: existsSync(runtimeSamplesPath) ? rel(runtimeSamplesPath) : null,
    mode,
    trusted: summary.measurementTrust?.status === 'pass' && existsSync(sceneAttributionPath) && existsSync(runtimeSamplesPath),
    startedAt: summary.startedAt ?? null,
    durationSeconds: typeof summary.durationSeconds === 'number' ? summary.durationSeconds : null,
    validationOverall: summary.validation?.overall ?? null,
    measurementTrustStatus: summary.measurementTrust?.status ?? null,
    probeRoundTripAvgMs: typeof summary.measurementTrust?.probeRoundTripAvgMs === 'number'
      ? rounded(summary.measurementTrust.probeRoundTripAvgMs)
      : null,
    probeRoundTripP95Ms: typeof summary.measurementTrust?.probeRoundTripP95Ms === 'number'
      ? rounded(summary.measurementTrust.probeRoundTripP95Ms)
      : null,
    missedSampleRate: typeof summary.measurementTrust?.missedSampleRate === 'number'
      ? rounded(summary.measurementTrust.missedSampleRate)
      : null,
    sampleCount: typeof summary.measurementTrust?.sampleCount === 'number' ? summary.measurementTrust.sampleCount : null,
    maxRendererDrawCalls: numericMax(samples.map((sample) => sample.renderer?.drawCalls)),
    maxRendererTriangles: numericMax(samples.map((sample) => sample.renderer?.triangles)),
    maxP95FrameMs: numericMax(samples.map((sample) => sample.p95FrameMs)),
    maxP99FrameMs: numericMax(samples.map((sample) => sample.p99FrameMs)),
    maxFrameMs: numericMax(samples.map((sample) => sample.maxFrameMs)),
    categories,
    visibleUnattributedPercent: visibleUnattributedPercent(categories),
  };
}

function sumCategories(digest: PerfDigest, categories: string[], key: keyof CategoryDigest): number {
  return categories.reduce((sum, id) => sum + num(category(digest, id)[key]), 0);
}

function buildLargeModeOwner(openFrontier: PerfDigest, aShau: PerfDigest): OwnerCandidate {
  const openDrawCalls = sumCategories(openFrontier, LARGE_MODE_OWNER_CATEGORIES, 'drawCallLike');
  const aShauDrawCalls = sumCategories(aShau, LARGE_MODE_OWNER_CATEGORIES, 'drawCallLike');
  const openVisibleTriangles = sumCategories(openFrontier, LARGE_MODE_OWNER_CATEGORIES, 'visibleTriangles');
  const aShauVisibleTriangles = sumCategories(aShau, LARGE_MODE_OWNER_CATEGORIES, 'visibleTriangles');
  const ready = openFrontier.trusted
    && aShau.trusted
    && openDrawCalls > 0
    && aShauDrawCalls > 0
    && openVisibleTriangles > 0
    && aShauVisibleTriangles > 0;
  return {
    id: 'large-mode-world-static-and-visible-helicopters',
    status: ready ? 'ready_for_branch' : 'blocked',
    summary: ready
      ? 'Trusted Open Frontier and A Shau captures provide representative before telemetry for world static features and visible helicopters.'
      : 'Large-mode static/vehicle owner lacks trusted visible before telemetry.',
    ownerCategories: LARGE_MODE_OWNER_CATEGORIES,
    evidence: {
      openFrontier: {
        summaryPath: openFrontier.path,
        maxRendererDrawCalls: openFrontier.maxRendererDrawCalls,
        ownerDrawCallLike: openDrawCalls,
        ownerVisibleTriangles: openVisibleTriangles,
        visibleUnattributedPercent: openFrontier.visibleUnattributedPercent,
      },
      aShau: {
        summaryPath: aShau.path,
        maxRendererDrawCalls: aShau.maxRendererDrawCalls,
        ownerDrawCallLike: aShauDrawCalls,
        ownerVisibleTriangles: aShauVisibleTriangles,
        visibleUnattributedPercent: aShau.visibleUnattributedPercent,
      },
      afterGuardrails: {
        openFrontierOwnerDrawCallLikeMustImproveBelow: openDrawCalls,
        aShauOwnerDrawCallLikeMustImproveBelow: aShauDrawCalls,
        openFrontierTotalDrawCallsMustNotRegressAbove: openFrontier.maxRendererDrawCalls,
        aShauTotalDrawCallsMustNotRegressAbove: aShau.maxRendererDrawCalls,
      },
    },
    requiredBefore: [
      'Choose one implementation scope inside this owner path: static feature culling, static-feature HLOD, helicopter visibility distance, or vehicle-prop registration.',
      'Rerun Open Frontier and A Shau before captures immediately before the branch if assets or placement changed.',
      'Keep static features and vehicle visibility separated in code if the evidence shows only one category improving.',
    ],
    acceptance: [
      'Matched Open Frontier and A Shau after artifacts show lower owner draw-call-like counts or visible triangles for the chosen owner category.',
      `Visible unattributed triangles remain below ${REQUIRED_VISIBLE_UNATTRIBUTED_MAX_PERCENT}%.`,
      'Total renderer draw calls do not regress in the matched camera windows.',
      'No vehicle entry, collision, or airfield interaction regression is accepted without playtest/probe coverage.',
    ],
    nonClaims: [
      'Does not certify close-NPC pool residency.',
      'Does not certify fixed-wing visual scale or parked-aircraft gameplay behavior.',
      'Does not certify far-canopy or vegetation distance policy.',
    ],
  };
}

function buildCloseNpcResidencyCandidate(openFrontier: PerfDigest, aShau: PerfDigest, combatDiagnostic: PerfDigest): OwnerCandidate {
  const openHiddenMeshes = category(openFrontier, 'npc_close_glb').visibleTriangles === 0
    ? category(openFrontier, 'npc_close_glb').meshes + category(openFrontier, 'weapons').meshes
    : 0;
  const aShauHiddenMeshes = category(aShau, 'npc_close_glb').visibleTriangles === 0
    ? category(aShau, 'npc_close_glb').meshes + category(aShau, 'weapons').meshes
    : 0;
  const diagnosticVisibleNpc = category(combatDiagnostic, 'npc_close_glb').visibleTriangles;
  return {
    id: 'close-npc-and-weapon-pool-residency',
    status: combatDiagnostic.trusted ? 'ready_for_branch' : 'diagnostic_only',
    summary: combatDiagnostic.trusted
      ? 'Close-NPC residency has trusted visible stress telemetry.'
      : 'Close-NPC residency is a real hidden-resident signal, but visible stress telemetry is still diagnostic-only because the combat capture failed measurement trust.',
    ownerCategories: ['npc_close_glb', 'weapons'],
    evidence: {
      openFrontierHiddenResidentMeshes: openHiddenMeshes,
      aShauHiddenResidentMeshes: aShauHiddenMeshes,
      openFrontierHiddenNpcTriangles: category(openFrontier, 'npc_close_glb').triangles,
      openFrontierHiddenWeaponTriangles: category(openFrontier, 'weapons').triangles,
      aShauHiddenNpcTriangles: category(aShau, 'npc_close_glb').triangles,
      aShauHiddenWeaponTriangles: category(aShau, 'weapons').triangles,
      combatDiagnosticPath: combatDiagnostic.path,
      combatDiagnosticMeasurementTrustStatus: combatDiagnostic.measurementTrustStatus,
      combatDiagnosticNpcVisibleTriangles: diagnosticVisibleNpc,
      combatDiagnosticWeaponVisibleTriangles: category(combatDiagnostic, 'weapons').visibleTriangles,
    },
    requiredBefore: [
      'Obtain trusted visible close-NPC stress telemetry before changing pool residency or culling.',
      'Separate startup/residency work from visible combat rendering work.',
      'Keep KB-OPTIK screenshot parity in scope for any close/imposter threshold change.',
    ],
    acceptance: [
      'Hidden resident close-NPC and weapon meshes decrease without visible combat pop-in.',
      'Trusted combat stress capture remains within frame-time and measurement-trust budgets.',
      'NPC close/imposter visual parity remains inside the accepted KB-OPTIK bands or has a documented exception.',
    ],
    nonClaims: [
      'Current diagnostic combat capture is not certification evidence.',
      'Do not use large-mode hidden residency alone to change close/imposter thresholds.',
    ],
  };
}

function buildVegetationCandidate(openFrontier: PerfDigest, aShau: PerfDigest): OwnerCandidate {
  return {
    id: 'vegetation-imposter-culling-or-distance',
    status: 'blocked',
    summary: 'Vegetation imposter distance is currently owned by KB-TERRAIN/KB-LOAD, not the first KB-CULL branch.',
    ownerCategories: ['vegetation_imposters'],
    evidence: {
      openFrontierVegetationDrawCallLike: category(openFrontier, 'vegetation_imposters').drawCallLike,
      openFrontierVegetationVisibleTriangles: category(openFrontier, 'vegetation_imposters').visibleTriangles,
      aShauVegetationDrawCallLike: category(aShau, 'vegetation_imposters').drawCallLike,
      aShauVegetationVisibleTriangles: category(aShau, 'vegetation_imposters').visibleTriangles,
    },
    requiredBefore: [
      'Resolve the KB-TERRAIN far-horizon owner path before moving vegetation distance into KB-CULL.',
      'Pair any vegetation representation change with texture residency and visual horizon evidence.',
    ],
    acceptance: [
      'Vegetation changes must pass KB-TERRAIN screenshot/perf deltas and KB-LOAD texture/upload evidence.',
    ],
    nonClaims: [
      'This baseline does not authorize vegetation culling or distance changes.',
    ],
  };
}

function makeCheck(id: string, passed: boolean, value: unknown, message: string, warn = false): ValidationCheck {
  return {
    id,
    status: passed ? 'pass' : (warn ? 'warn' : 'fail'),
    value,
    message,
  };
}

function statusFromChecks(checks: ValidationCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function writeMarkdown(summary: CullingOwnerBaseline, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Culling Owner Baseline',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Source status entries: ${summary.sourceGitStatus.length}`,
    `Status: ${summary.status.toUpperCase()}`,
    '',
    '## Selected Owner Path',
    '',
    summary.selectedOwnerPath
      ? `- ${summary.selectedOwnerPath.status.toUpperCase()} ${summary.selectedOwnerPath.id}: ${summary.selectedOwnerPath.summary}`
      : '- none',
    '',
    '## Inputs',
    '',
    `- Culling proof: ${summary.inputs.cullingProof ?? 'missing'}`,
    `- Open Frontier perf: ${summary.inputs.openFrontierPerfSummary ?? 'missing'}`,
    `- A Shau perf: ${summary.inputs.aShauPerfSummary ?? 'missing'}`,
    `- Combat diagnostic: ${summary.inputs.combatDiagnosticSummary ?? 'missing'}`,
    '',
    '## Candidate Matrix',
    '',
    '| Candidate | Status | Categories | Summary |',
    '| --- | --- | --- | --- |',
    ...summary.ownerCandidates.map((candidate) =>
      `| ${candidate.id} | ${candidate.status} | ${candidate.ownerCategories.join(', ')} | ${candidate.summary} |`
    ),
    '',
    '## Checks',
    '',
    ...summary.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.message}`),
    '',
    '## Open Items',
    '',
    ...summary.openItems.map((item) => `- ${item}`),
    '',
    '## Non Claims',
    '',
    ...summary.nonClaims.map((item) => `- ${item}`),
    '',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function main(): void {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');

  const cullingProofPath = latestCullingProof();
  const openFrontierPath = latestPerfSummaryForMode('open_frontier', true);
  const aShauPath = latestPerfSummaryForMode('a_shau_valley', true);
  const combatDiagnosticPath = latestPerfSummaryForMode('ai_sandbox', false);

  const cullingProof = cullingProofPath ? readJson<CullingProof>(cullingProofPath) : null;
  const openFrontier = perfDigest(openFrontierPath, 'open_frontier');
  const aShau = perfDigest(aShauPath, 'a_shau_valley');
  const combatDiagnostic = perfDigest(combatDiagnosticPath, 'ai_sandbox');

  const ownerCandidates = [
    buildLargeModeOwner(openFrontier, aShau),
    buildCloseNpcResidencyCandidate(openFrontier, aShau, combatDiagnostic),
    buildVegetationCandidate(openFrontier, aShau),
  ];
  const selectedOwnerPath = ownerCandidates.find((candidate) => candidate.status === 'ready_for_branch') ?? null;

  const cullingProofTrusted = cullingProof?.status === 'pass' && cullingProof.measurementTrust?.status === 'pass';
  const openVisibleUnattributedOk = (openFrontier.visibleUnattributedPercent ?? Number.POSITIVE_INFINITY) < REQUIRED_VISIBLE_UNATTRIBUTED_MAX_PERCENT;
  const aShauVisibleUnattributedOk = (aShau.visibleUnattributedPercent ?? Number.POSITIVE_INFINITY) < REQUIRED_VISIBLE_UNATTRIBUTED_MAX_PERCENT;
  const checks: ValidationCheck[] = [
    makeCheck('culling_proof_trusted', cullingProofTrusted, rel(cullingProofPath), `Culling proof status=${cullingProof?.status ?? 'missing'} measurement=${cullingProof?.measurementTrust?.status ?? 'missing'}.`),
    makeCheck('open_frontier_runtime_trusted', openFrontier.trusted, openFrontier.path, `Open Frontier measurement=${openFrontier.measurementTrustStatus ?? 'missing'} scene=${openFrontier.sceneAttributionPath ?? 'missing'}.`),
    makeCheck('ashau_runtime_trusted', aShau.trusted, aShau.path, `A Shau measurement=${aShau.measurementTrustStatus ?? 'missing'} scene=${aShau.sceneAttributionPath ?? 'missing'}.`),
    makeCheck('owner_path_selected', Boolean(selectedOwnerPath), selectedOwnerPath?.id ?? null, selectedOwnerPath ? `Selected ${selectedOwnerPath.id}.` : 'No owner path has ready telemetry.'),
    makeCheck('open_frontier_visible_unattributed_under_10_percent', openVisibleUnattributedOk, openFrontier.visibleUnattributedPercent, `Open Frontier visible unattributed triangles are ${openFrontier.visibleUnattributedPercent ?? 'missing'}%.`),
    makeCheck('ashau_visible_unattributed_under_10_percent', aShauVisibleUnattributedOk, aShau.visibleUnattributedPercent, `A Shau visible unattributed triangles are ${aShau.visibleUnattributedPercent ?? 'missing'}%.`),
    makeCheck('combat_diagnostic_excluded_from_certification', combatDiagnostic.measurementTrustStatus !== 'pass', combatDiagnostic.measurementTrustStatus, 'Combat diagnostic remains excluded from certification until measurement trust passes.', true),
  ];
  const measurementTrustChecks = checks.slice(0, 6);
  const measurementTrustStatus = statusFromChecks(measurementTrustChecks);
  const status = statusFromChecks(checks);

  const summary: CullingOwnerBaseline = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    mode: OUTPUT_NAME,
    status,
    files: {
      summary: relRequired(summaryPath),
      markdown: relRequired(markdownPath),
    },
    inputs: {
      cullingProof: rel(cullingProofPath),
      openFrontierPerfSummary: rel(openFrontierPath),
      aShauPerfSummary: rel(aShauPath),
      combatDiagnosticSummary: rel(combatDiagnosticPath),
    },
    cullingProof: {
      status: cullingProof?.status ?? null,
      measurementTrustStatus: cullingProof?.measurementTrust?.status ?? null,
      rendererDrawCalls: cullingProof?.rendererInfo?.drawCalls ?? null,
      rendererTriangles: cullingProof?.rendererInfo?.triangles ?? null,
      files: cullingProof?.files ?? null,
    },
    performanceBaselines: {
      openFrontier,
      aShau,
      combatDiagnostic,
    },
    selectedOwnerPath,
    ownerCandidates,
    measurementTrust: {
      status: measurementTrustStatus,
      flags: {
        cullingProofTrusted,
        openFrontierTrusted: openFrontier.trusted,
        aShauTrusted: aShau.trusted,
        selectedOwnerPathId: selectedOwnerPath?.id ?? null,
        openFrontierVisibleUnattributedPercent: openFrontier.visibleUnattributedPercent,
        aShauVisibleUnattributedPercent: aShau.visibleUnattributedPercent,
        combatDiagnosticMeasurementTrustStatus: combatDiagnostic.measurementTrustStatus,
      },
      checks: measurementTrustChecks,
      summary: measurementTrustStatus === 'pass'
        ? 'KB-CULL owner baseline has trusted renderer telemetry for the selected large-mode owner path.'
        : 'KB-CULL owner baseline is incomplete; do not start culling remediation from this packet.',
    },
    checks,
    openItems: [
      'Start KB-CULL with the selected large-mode world-static/visible-helicopter owner path or explicitly file a different owner decision.',
      'Rerun this command after any candidate culling/HLOD change and compare owner draw-call/triangle deltas in matched Open Frontier and A Shau captures.',
      'Do not move close-NPC pool residency into remediation until a trusted visible combat stress capture replaces the diagnostic-only AI Sandbox artifact.',
    ],
    nonClaims: [
      'This packet does not implement or accept any culling, HLOD, visibility-distance, asset, or pool-residency change.',
      'This packet does not certify fixed-wing scale, NPC imposter visual parity, far-canopy coverage, startup latency, WebGPU, or production parity.',
      'The selected owner path is a branch-start recommendation, not proof of improvement.',
    ],
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  writeMarkdown(summary, markdownPath);

  console.log(`Projekt 143 culling owner baseline ${summary.status.toUpperCase()}: ${relRequired(summaryPath)}`);
  if (selectedOwnerPath) {
    console.log(`- SELECTED ${selectedOwnerPath.id}: ${selectedOwnerPath.summary}`);
  }
  for (const check of checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}: ${check.message}`);
  }

  if (process.argv.includes('--strict') && summary.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
