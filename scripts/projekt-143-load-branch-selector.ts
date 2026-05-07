#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type SelectorStatus = 'candidate_startup_proof_ready' | 'ready_for_quiet_machine_proof' | 'blocked';
type CandidateDecision = 'selected' | 'deferred' | 'rejected';

interface TextureAuditScenarioEstimate {
  estimatedMipmappedMiB?: number;
  estimatedSavingsMiB?: number;
  notes?: string[];
}

interface TextureAuditEntry {
  name?: string;
  file?: string;
  kind?: string;
  estimatedMipmappedMiB?: number;
  remediationCandidate?: {
    action?: string;
    targetWidth?: number;
    targetHeight?: number;
    targetTileSize?: number | null;
    targetEstimatedMipmappedMiB?: number;
    estimatedMipmappedMiBSaved?: number;
    notes?: string[];
  } | null;
  flags?: string[];
}

interface TextureAudit {
  createdAt?: string;
  summary?: {
    totalEstimatedMipmappedMiB?: number;
    totalEstimatedCandidateMipmappedMiB?: number;
    totalEstimatedCandidateSavingsMiB?: number;
    scenarioEstimates?: Record<string, TextureAuditScenarioEstimate>;
    byKind?: Record<string, {
      count?: number;
      estimatedMipmappedMiB?: number;
      estimatedCandidateMipmappedMiB?: number;
      estimatedCandidateSavingsMiB?: number;
    }>;
  };
  entries?: TextureAuditEntry[];
}

interface StartupLargestUpload {
  sourceUrl?: string;
  totalDurationMs?: number;
  maxDurationMs?: number;
  averageDurationMs?: number;
}

interface StartupSummary {
  candidateFlags?: {
    useVegetationCandidates?: boolean;
    vegetationCandidateReplacementCount?: number;
  };
  webglUploadSummary?: {
    averageTotalDurationMs?: number;
    averageMaxDurationMs?: number;
    averageCount?: number;
    largestUploads?: StartupLargestUpload[];
  };
  summary?: Record<string, { average?: number; median?: number; p95?: number }>;
}

interface VegetationNormalProof {
  status?: string;
  files?: {
    contactSheet?: string;
  };
}

interface BranchCandidate {
  id: string;
  decision: CandidateDecision;
  rationale: string[];
  estimatedSavingsMiB: number | null;
  validationRequired: string[];
  nonClaims: string[];
}

interface LoadBranchSelectorReport {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  source: 'projekt-143-load-branch-selector';
  status: SelectorStatus;
  selectedBranch: string;
  selectedBranchSummary: string;
  inputs: {
    textureAudit: string | null;
    startupOpenFrontier: string | null;
    startupZoneControl: string | null;
    candidateStartupOpenFrontier: string | null;
    candidateStartupZoneControl: string | null;
    vegetationNormalProof: string | null;
  };
  inspectedEvidence: {
    textureAuditCreatedAt: string | null;
    currentEstimatedMipmappedMiB: number | null;
    fullCandidateEstimatedMipmappedMiB: number | null;
    fullCandidateSavingsMiB: number | null;
    vegetationCandidatesOnly: TextureAuditScenarioEstimate | null;
    npcCandidatesOnly: TextureAuditScenarioEstimate | null;
    noVegetationNormals: TextureAuditScenarioEstimate | null;
    openFrontierLargestUploads: StartupLargestUpload[];
    zoneControlLargestUploads: StartupLargestUpload[];
    vegetationCandidateStartupProof: {
      status: 'pass' | 'missing' | 'warn';
      openFrontierPath: string | null;
      zoneControlPath: string | null;
      openFrontierModeClickDeltaMs: number | null;
      zoneControlModeClickDeltaMs: number | null;
      openFrontierDeployClickDeltaMs: number | null;
      zoneControlDeployClickDeltaMs: number | null;
      openFrontierUploadTotalDeltaMs: number | null;
      zoneControlUploadTotalDeltaMs: number | null;
      candidateReplacementCount: number | null;
    };
    topVegetationUploadSpecies: string[];
    activeVegetationAtlasCandidates: Array<{
      species: string;
      files: string[];
      currentEstimatedMipmappedMiB: number;
      candidateEstimatedMipmappedMiB: number;
      estimatedSavingsMiB: number;
    }>;
    vegetationNormalProofStatus: string | null;
    vegetationNormalProofContactSheet: string | null;
  };
  candidates: BranchCandidate[];
  nextProofCommands: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-load-branch-selector';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function isWorkingTreeDirty(): boolean {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim().length > 0;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const pending = [root];
  const files: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        pending.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matching = files.filter(predicate);
  matching.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matching[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function latestStartupSummary(files: string[], mode: 'open-frontier' | 'zone-control'): string | null {
  return latestFile(files, (path) => path.endsWith(join(`startup-ui-${mode}`, 'summary.json')));
}

function latestCandidateStartupSummary(files: string[], mode: 'open-frontier' | 'zone-control'): string | null {
  return latestFile(files, (path) => path.endsWith(join(`startup-ui-${mode}-vegetation-candidates`, 'summary.json')));
}

function roundMetric(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function speciesFromPixelForgePath(path: string | undefined): string | null {
  if (!path) return null;
  const normalized = path.replaceAll('\\', '/');
  const match = normalized.match(/pixel-forge\/vegetation\/([^/]+)\//);
  return match?.[1] ?? null;
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function startupLargestUploads(summary: StartupSummary | null): StartupLargestUpload[] {
  return (summary?.webglUploadSummary?.largestUploads ?? []).map((entry) => ({
    sourceUrl: entry.sourceUrl,
    totalDurationMs: entry.totalDurationMs,
    maxDurationMs: entry.maxDurationMs,
    averageDurationMs: entry.averageDurationMs,
  }));
}

function startupAverageMs(summary: StartupSummary | null, key: 'modeClickToPlayable' | 'deployClickToPlayable'): number | null {
  if (!summary) return null;
  const metricKey = key === 'modeClickToPlayable' ? 'modeClickToPlayableMs' : 'deployClickToPlayableMs';
  return summary.summary?.[metricKey]?.average ?? null;
}

function startupUploadAverage(summary: StartupSummary | null, key: 'webglTextureUploadTotalDurationMs' | 'webglTextureUploadMaxDurationMs'): number | null {
  if (!summary) return null;
  const metric = summary.summary?.[key]?.average;
  if (typeof metric === 'number') return metric;
  return key === 'webglTextureUploadTotalDurationMs'
    ? summary.webglUploadSummary?.averageTotalDurationMs ?? null
    : summary.webglUploadSummary?.averageMaxDurationMs ?? null;
}

function metricDelta(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return roundMetric(after - before, 3);
}

function scenario(texture: TextureAudit | null, id: string): TextureAuditScenarioEstimate | null {
  return texture?.summary?.scenarioEstimates?.[id] ?? null;
}

function buildActiveVegetationAtlasCandidates(texture: TextureAudit | null): LoadBranchSelectorReport['inspectedEvidence']['activeVegetationAtlasCandidates'] {
  const entries = texture?.entries ?? [];
  const bySpecies = new Map<string, TextureAuditEntry[]>();
  for (const entry of entries) {
    if (!entry.remediationCandidate || !entry.kind?.startsWith('vegetation-')) continue;
    const species = speciesFromPixelForgePath(entry.file);
    if (!species) continue;
    const list = bySpecies.get(species) ?? [];
    list.push(entry);
    bySpecies.set(species, list);
  }

  return [...bySpecies.entries()].map(([species, speciesEntries]) => {
    let currentEstimatedMipmappedMiB = 0;
    let candidateEstimatedMipmappedMiB = 0;
    let estimatedSavingsMiB = 0;
    const files: string[] = [];
    for (const entry of speciesEntries) {
      if (entry.file) files.push(entry.file);
      currentEstimatedMipmappedMiB += entry.estimatedMipmappedMiB ?? 0;
      candidateEstimatedMipmappedMiB += entry.remediationCandidate?.targetEstimatedMipmappedMiB ?? entry.estimatedMipmappedMiB ?? 0;
      estimatedSavingsMiB += entry.remediationCandidate?.estimatedMipmappedMiBSaved ?? 0;
    }
    return {
      species,
      files: files.sort(),
      currentEstimatedMipmappedMiB: roundMetric(currentEstimatedMipmappedMiB),
      candidateEstimatedMipmappedMiB: roundMetric(candidateEstimatedMipmappedMiB),
      estimatedSavingsMiB: roundMetric(estimatedSavingsMiB),
    };
  }).sort((a, b) => b.estimatedSavingsMiB - a.estimatedSavingsMiB || a.species.localeCompare(b.species));
}

function buildReport(): LoadBranchSelectorReport {
  const files = walkFiles(ARTIFACT_ROOT);
  const texturePath = latestFile(files, (path) => path.endsWith(join('pixel-forge-texture-audit', 'texture-audit.json')));
  const startupOpenPath = latestStartupSummary(files, 'open-frontier');
  const startupZonePath = latestStartupSummary(files, 'zone-control');
  const candidateStartupOpenPath = latestCandidateStartupSummary(files, 'open-frontier');
  const candidateStartupZonePath = latestCandidateStartupSummary(files, 'zone-control');
  const normalProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-normal-proof', 'summary.json')));

  const texture = readJson<TextureAudit>(texturePath);
  const startupOpen = readJson<StartupSummary>(startupOpenPath);
  const startupZone = readJson<StartupSummary>(startupZonePath);
  const candidateStartupOpen = readJson<StartupSummary>(candidateStartupOpenPath);
  const candidateStartupZone = readJson<StartupSummary>(candidateStartupZonePath);
  const normalProof = readJson<VegetationNormalProof>(normalProofPath);
  const openUploads = startupLargestUploads(startupOpen);
  const zoneUploads = startupLargestUploads(startupZone);
  const candidateReplacementCount = candidateStartupOpen?.candidateFlags?.vegetationCandidateReplacementCount
    ?? candidateStartupZone?.candidateFlags?.vegetationCandidateReplacementCount
    ?? null;
  const openModeClickDelta = metricDelta(
    startupAverageMs(candidateStartupOpen, 'modeClickToPlayable'),
    startupAverageMs(startupOpen, 'modeClickToPlayable'),
  );
  const zoneModeClickDelta = metricDelta(
    startupAverageMs(candidateStartupZone, 'modeClickToPlayable'),
    startupAverageMs(startupZone, 'modeClickToPlayable'),
  );
  const openDeployClickDelta = metricDelta(
    startupAverageMs(candidateStartupOpen, 'deployClickToPlayable'),
    startupAverageMs(startupOpen, 'deployClickToPlayable'),
  );
  const zoneDeployClickDelta = metricDelta(
    startupAverageMs(candidateStartupZone, 'deployClickToPlayable'),
    startupAverageMs(startupZone, 'deployClickToPlayable'),
  );
  const openUploadTotalDelta = metricDelta(
    startupUploadAverage(candidateStartupOpen, 'webglTextureUploadTotalDurationMs'),
    startupUploadAverage(startupOpen, 'webglTextureUploadTotalDurationMs'),
  );
  const zoneUploadTotalDelta = metricDelta(
    startupUploadAverage(candidateStartupZone, 'webglTextureUploadTotalDurationMs'),
    startupUploadAverage(startupZone, 'webglTextureUploadTotalDurationMs'),
  );
  const candidateStartupProofStatus =
    candidateStartupOpen?.candidateFlags?.useVegetationCandidates
    && candidateStartupZone?.candidateFlags?.useVegetationCandidates
    && (openModeClickDelta ?? 0) < 0
    && (zoneModeClickDelta ?? 0) < 0
    && (openUploadTotalDelta ?? 0) < 0
    && (zoneUploadTotalDelta ?? 0) < 0
      ? 'pass'
      : candidateStartupOpenPath || candidateStartupZonePath
        ? 'warn'
        : 'missing';
  const topVegetationUploadSpecies = uniqueSorted([
    ...openUploads.map((entry) => speciesFromPixelForgePath(entry.sourceUrl)),
    ...zoneUploads.map((entry) => speciesFromPixelForgePath(entry.sourceUrl)),
  ]);
  const vegetationCandidates = buildActiveVegetationAtlasCandidates(texture);
  const vegetationCandidateScenario = scenario(texture, 'vegetationCandidatesOnly');
  const npcCandidateScenario = scenario(texture, 'npcCandidatesOnly');
  const noNormalsScenario = scenario(texture, 'noVegetationNormals');

  const candidates: BranchCandidate[] = [
    {
      id: 'vegetation-atlas-regeneration-retain-normals',
      decision: 'selected',
      rationale: [
        'Targets the current top repeated vegetation upload classes while preserving the accepted normal-lit vegetation policy.',
        'Keeps the good KB-OPTIK NPC state untouched and avoids reopening NPC atlas/crop/luma risk before a clean proof window.',
        'Matches the existing texture-audit candidate path: regenerate flagged vegetation color and normal atlases to smaller tile sizes, not runtime downscale.',
      ],
      estimatedSavingsMiB: vegetationCandidateScenario?.estimatedSavingsMiB ?? null,
      validationRequired: [
        'Generate candidate vegetation atlases through Pixel Forge or an equivalent source pipeline, preserving color/normal pairs.',
        'Run side-by-side vegetation visual proof against default atlases before import.',
        'Run matched Open Frontier and Zone Control startup UI tables on a quiet machine before accepting a startup win.',
        'Run Open Frontier and A Shau terrain/vegetation screenshots before accepting art direction.',
      ],
      nonClaims: [
        'This selector does not regenerate or import any atlas.',
        'This selector does not prove startup improvement.',
      ],
    },
    {
      id: 'npc-albedo-atlas-regeneration',
      decision: 'deferred',
      rationale: [
        'Estimated residency savings are larger, but the owner accepted the current NPC imposter state with caution.',
        'Regenerating NPC atlases would reopen KB-OPTIK crop, luma, silhouette, pose, weapon, and animation proof gates.',
      ],
      estimatedSavingsMiB: npcCandidateScenario?.estimatedSavingsMiB ?? null,
      validationRequired: [
        'Only run after an explicit NPC atlas regeneration branch is approved.',
        'Repeat the runtime-equivalent OPTIK review and selected/expanded luma proof.',
      ],
      nonClaims: [
        'Do not treat estimated NPC atlas savings as accepted while OPTIK is stable.',
      ],
    },
    {
      id: 'vegetation-normal-map-removal',
      decision: normalProof?.status === 'warn' ? 'rejected' : 'deferred',
      rationale: [
        normalProof?.status === 'warn'
          ? 'Latest vegetation-normal A/B proof is WARN, so no-normal removal is rejected for default policy.'
          : 'No accepted owner proof exists for changing default vegetation normal-map policy.',
      ],
      estimatedSavingsMiB: noNormalsScenario?.estimatedSavingsMiB ?? null,
      validationRequired: [
        'Requires a future PASS or owner-accepted contact sheet before reconsideration.',
      ],
      nonClaims: [
        'Default vegetation normal maps remain active.',
      ],
    },
    {
      id: 'single-texture-upload-warmup-or-fanpalm-preload',
      decision: 'rejected',
      rationale: [
        'Prior broadened warmup evidence is retained as noisy/outlier evidence, not a durable policy.',
        'Preloading can move upload cost without reducing resident texture size or art budget.',
      ],
      estimatedSavingsMiB: 0,
      validationRequired: [
        'Would need fresh matched startup proof and a residency reason to reopen.',
      ],
      nonClaims: [
        'Do not re-add Pixel Forge startup texture warmup from this selector.',
      ],
    },
    {
      id: 'upload-scheduling-only',
      decision: 'deferred',
      rationale: [
        'Scheduling may protect the first playable frame but does not solve texture residency or largest-atlas budget by itself.',
        'Keep as a follow-up if regenerated assets still show upload spikes.',
      ],
      estimatedSavingsMiB: 0,
      validationRequired: [
        'Needs matched startup tables with long-task and upload attribution.',
      ],
      nonClaims: [
        'Scheduling-only is not a texture budget closeout.',
      ],
    },
  ];

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    source: 'projekt-143-load-branch-selector',
    status: texturePath && startupOpenPath && startupZonePath
      ? candidateStartupProofStatus === 'pass'
        ? 'candidate_startup_proof_ready'
        : 'ready_for_quiet_machine_proof'
      : 'blocked',
    selectedBranch: 'vegetation-atlas-regeneration-retain-normals',
    selectedBranchSummary: 'Regenerate active Pixel Forge vegetation color/normal atlas pairs to the texture-audit candidate dimensions; do not remove normal maps, do not re-open NPC atlas regeneration, and do not accept until quiet-machine startup plus visual proof pass.',
    inputs: {
      textureAudit: rel(texturePath),
      startupOpenFrontier: rel(startupOpenPath),
      startupZoneControl: rel(startupZonePath),
      candidateStartupOpenFrontier: rel(candidateStartupOpenPath),
      candidateStartupZoneControl: rel(candidateStartupZonePath),
      vegetationNormalProof: rel(normalProofPath),
    },
    inspectedEvidence: {
      textureAuditCreatedAt: texture?.createdAt ?? null,
      currentEstimatedMipmappedMiB: texture?.summary?.totalEstimatedMipmappedMiB ?? null,
      fullCandidateEstimatedMipmappedMiB: texture?.summary?.totalEstimatedCandidateMipmappedMiB ?? null,
      fullCandidateSavingsMiB: texture?.summary?.totalEstimatedCandidateSavingsMiB ?? null,
      vegetationCandidatesOnly: vegetationCandidateScenario,
      npcCandidatesOnly: npcCandidateScenario,
      noVegetationNormals: noNormalsScenario,
      openFrontierLargestUploads: openUploads,
      zoneControlLargestUploads: zoneUploads,
      vegetationCandidateStartupProof: {
        status: candidateStartupProofStatus,
        openFrontierPath: rel(candidateStartupOpenPath),
        zoneControlPath: rel(candidateStartupZonePath),
        openFrontierModeClickDeltaMs: openModeClickDelta,
        zoneControlModeClickDeltaMs: zoneModeClickDelta,
        openFrontierDeployClickDeltaMs: openDeployClickDelta,
        zoneControlDeployClickDeltaMs: zoneDeployClickDelta,
        openFrontierUploadTotalDeltaMs: openUploadTotalDelta,
        zoneControlUploadTotalDeltaMs: zoneUploadTotalDelta,
        candidateReplacementCount,
      },
      topVegetationUploadSpecies,
      activeVegetationAtlasCandidates: vegetationCandidates,
      vegetationNormalProofStatus: normalProof?.status ?? null,
      vegetationNormalProofContactSheet: normalProof?.files?.contactSheet ?? null,
    },
    candidates,
    nextProofCommands: [
      'npm run check:pixel-forge-textures',
      'npm run check:projekt-143-vegetation-normal-proof',
      'npx tsx scripts/perf-startup-ui.ts --mode open_frontier --runs 3',
      'npx tsx scripts/perf-startup-ui.ts --mode zone_control --runs 3',
      'npx tsx scripts/perf-startup-ui.ts --mode open_frontier --runs 3 --use-vegetation-candidates --vegetation-candidate-import-plan <import-plan.json>',
      'npx tsx scripts/perf-startup-ui.ts --mode zone_control --runs 3 --use-vegetation-candidates --vegetation-candidate-import-plan <import-plan.json>',
      'npm run check:projekt-143-cycle3-kickoff',
      'npm run check:projekt-143-completion-audit',
    ],
    nonClaims: [
      'This report chooses the next KB-LOAD branch; it does not implement or accept the branch.',
      'This report does not claim visual parity, startup improvement, production parity, or Projekt completion.',
      'This report intentionally rejects default vegetation normal-map removal while the latest visual proof remains WARN.',
    ],
  };
}

function main(): void {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport();
  const outputPath = join(outputDir, 'load-branch-selector.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Projekt 143 KB-LOAD branch selector ${report.status.toUpperCase()}: ${rel(outputPath)}`);
  console.log(`- selectedBranch=${report.selectedBranch}`);
  console.log(`- vegetationCandidateSavingsMiB=${report.inspectedEvidence.vegetationCandidatesOnly?.estimatedSavingsMiB ?? 'unknown'}`);
  console.log(`- topVegetationUploadSpecies=${report.inspectedEvidence.topVegetationUploadSpecies.join(', ') || 'none'}`);
}

main();
