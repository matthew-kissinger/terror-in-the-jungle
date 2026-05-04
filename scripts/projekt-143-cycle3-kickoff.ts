#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type TargetStatus = 'evidence_complete' | 'ready_for_branch' | 'needs_decision' | 'needs_baseline' | 'blocked';

type Cycle3Target = {
  id: string;
  bureau: 'KB-LOAD' | 'KB-OPTIK' | 'KB-CULL' | 'KB-TERRAIN' | 'KB-EFFECTS';
  status: TargetStatus;
  priority: number;
  summary: string;
  evidence: Record<string, unknown>;
  requiredBefore: string[];
  acceptance: string[];
  nonClaims: string[];
};

type KickoffReport = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-cycle3-kickoff';
  status: CheckStatus;
  inputs: Record<string, string | null>;
  targets: Cycle3Target[];
  recommendedOrder: string[];
  openDecisions: string[];
};

type Cycle2Proof = {
  status?: CheckStatus;
  sourceGitSha?: string;
  checks?: Array<{
    id?: string;
    status?: CheckStatus;
    evidence?: Record<string, unknown>;
  }>;
};

type OpticsScaleProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus; flags?: Record<string, unknown> };
  runtimeContracts?: {
    npc?: {
      visualHeightMeters?: number;
      spriteHeightMeters?: number;
      closeModelTargetHeightMeters?: number;
    };
  };
  npcComparisons?: Array<{
    runtimeFaction?: string;
    deltas?: {
      renderedVisibleHeightRatio?: number | null;
      meanOpaqueLumaDelta?: number | null;
      meanOpaqueLumaDeltaPercent?: number | null;
    };
    flags?: string[];
  }>;
  aircraftNativeScale?: Array<{
    key?: string;
    nativeBoundsMeters?: { longestAxis?: number };
    nativeLongestAxisToNpcVisualHeight?: number;
  }>;
};

type OptikDecisionPacket = {
  status?: CheckStatus;
  recommendedSequence?: string[];
  openOwnerDecision?: string;
};

type OptikExpandedProof = {
  status?: CheckStatus;
  coverage?: { cameraProfileSet?: string };
  measurementTrust?: { status?: CheckStatus };
  aggregate?: {
    sampleCount?: number;
    flaggedSamples?: number;
    minVisibleHeightRatio?: number | null;
    maxVisibleHeightRatio?: number | null;
    minLumaDeltaPercent?: number | null;
    maxLumaDeltaPercent?: number | null;
    maxAbsLumaDeltaPercent?: number | null;
    flaggedProfiles?: string[];
  };
};

type TextureAudit = {
  summary?: {
    totalEstimatedMipmappedRgbaMiB?: number;
    totalEstimatedMipmappedMiB?: number;
    flaggedTextures?: number;
    hardFailures?: number;
    candidateEstimatedMipmappedRgbaMiB?: number;
    totalEstimatedCandidateMipmappedMiB?: number;
    candidateSavingsMiB?: number;
    totalEstimatedCandidateSavingsMiB?: number;
  };
};

type StartupSummary = {
  runs?: Array<unknown> | number;
  averagesMs?: {
    modeClickToPlayable?: number;
    deployClickToPlayable?: number;
  };
  perRun?: Array<{
    browserStalls?: {
      webglTextureUploadCount?: number;
      webglTextureUploadTotalDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
    };
  }>;
  summary?: {
    modeClickToPlayableMs?: { average?: number; median?: number; p95?: number };
    deployClickToPlayableMs?: { average?: number; median?: number; p95?: number };
    webglTextureUploadTotalDurationMs?: { average?: number; median?: number; p95?: number };
    webglTextureUploadMaxDurationMs?: { average?: number; median?: number; p95?: number };
  };
  webglUploadSummary?: {
    totalDurationMs?: number;
    maxDurationMs?: number;
    count?: number;
    largestUploads?: unknown[];
  };
};

type PerfSummary = {
  scenario?: {
    mode?: string;
  };
};

type GrenadeSummary = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus };
  baseline?: unknown;
  detonation?: {
    frame?: {
      p95FrameMs?: number;
      maxFrameMs?: number;
    };
    renderAttribution?: {
      totals?: {
        maxDurationMs?: number;
      };
      topNearTriggerCalls?: unknown[];
    };
    browserStalls?: {
      longTaskCount?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameMaxDurationMs?: number;
    };
    userTiming?: Record<string, { totalDurationMs?: number; maxDurationMs?: number }>;
  };
  deltas?: {
    maxFrameMs?: number;
    p99FrameMs?: number;
    hitch50Count?: number;
  };
  windows?: unknown;
};

type HorizonAudit = {
  summary?: {
    flaggedModes?: number;
    largestBareTerrainBandMeters?: number;
    largestBareTerrainBandMode?: string | null;
  };
};

type TerrainHorizonBaseline = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus };
  scenarios?: Array<{
    shots?: Array<unknown>;
  }>;
  performanceBaselines?: {
    openFrontier?: {
      status?: CheckStatus;
      peakP95FrameMs?: number | null;
      p95AfterCeilingPlus1p5Ms?: number | null;
      maxDrawCalls?: number | null;
      drawCallAfterCeiling10Percent?: number | null;
    };
    aShau?: {
      status?: CheckStatus;
      peakP95FrameMs?: number | null;
      p95AfterCeilingPlus1p5Ms?: number | null;
      maxDrawCalls?: number | null;
      drawCallAfterCeiling10Percent?: number | null;
    };
  };
};

type CullingProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus };
  rendererInfo?: {
    drawCalls?: number;
    triangles?: number;
  };
};

type CullingOwnerBaseline = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus };
  selectedOwnerPath?: {
    id?: string;
    status?: 'ready_for_branch' | 'diagnostic_only' | 'blocked';
    ownerCategories?: string[];
    evidence?: Record<string, unknown>;
  } | null;
  performanceBaselines?: {
    openFrontier?: {
      visibleUnattributedPercent?: number | null;
      maxRendererDrawCalls?: number | null;
    };
    aShau?: {
      visibleUnattributedPercent?: number | null;
      maxRendererDrawCalls?: number | null;
    };
  };
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-cycle3-kickoff';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
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

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matches = files.filter(predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function expandedCameraProfileSet(path: string): string {
  return readJson<OptikExpandedProof>(path)?.coverage?.cameraProfileSet ?? 'expanded-stress';
}

function latestExpandedProofPath(files: string[], cameraProfileSet: string): string | null {
  return latestFile(files, (path) =>
    path.endsWith(join('projekt-143-optik-expanded-proof', 'summary.json'))
    && expandedCameraProfileSet(path) === cameraProfileSet
  );
}

function latestStartupSummary(files: string[], mode: 'open-frontier' | 'zone-control'): string | null {
  return latestFile(files, (path) =>
    path.endsWith(join(`startup-ui-${mode}`, 'summary.json'))
  );
}

function latestPerfSummaryForMode(files: string[], mode: string): string | null {
  return latestFile(files, (path) => {
    if (!path.endsWith('summary.json')) return false;
    try {
      return readJson<PerfSummary>(path)?.scenario?.mode === mode && existsSync(join(path, '..', 'scene-attribution.json'));
    } catch {
      return false;
    }
  });
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function average(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(3));
}

function min(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Number(Math.min(...finite).toFixed(3)) : null;
}

function max(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Number(Math.max(...finite).toFixed(3)) : null;
}

function startupAverageMs(summary: StartupSummary | null, key: 'modeClickToPlayable' | 'deployClickToPlayable'): number | null {
  if (!summary) return null;
  if (key === 'modeClickToPlayable') {
    return summary.summary?.modeClickToPlayableMs?.average ?? summary.averagesMs?.modeClickToPlayable ?? null;
  }
  return summary.summary?.deployClickToPlayableMs?.average ?? summary.averagesMs?.deployClickToPlayable ?? null;
}

function startupUploadAverage(
  summary: StartupSummary | null,
  key: 'webglTextureUploadCount' | 'webglTextureUploadTotalDurationMs' | 'webglTextureUploadMaxDurationMs'
): number | null {
  if (!summary) return null;
  if (key === 'webglTextureUploadTotalDurationMs') {
    return summary.summary?.webglTextureUploadTotalDurationMs?.average
      ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadTotalDurationMs ?? NaN));
  }
  if (key === 'webglTextureUploadMaxDurationMs') {
    return summary.summary?.webglTextureUploadMaxDurationMs?.average
      ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadMaxDurationMs ?? NaN));
  }
  return summary.webglUploadSummary?.count
    ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadCount ?? NaN));
}

function statusFromTargets(targets: Cycle3Target[], cycle2: Cycle2Proof | null): CheckStatus {
  if (!cycle2 || cycle2.status !== 'pass') return 'fail';
  if (targets.some((target) => target.status === 'blocked')) return 'warn';
  if (targets.some((target) => target.status === 'needs_baseline' || target.status === 'needs_decision')) return 'warn';
  return 'pass';
}

function buildOptikTarget(
  opticsPath: string | null,
  proof: OpticsScaleProof | null,
  decisionPath: string | null,
  decision: OptikDecisionPacket | null,
  expandedPath: string | null,
  expanded: OptikExpandedProof | null,
  runtimeLodExpandedPath: string | null,
  runtimeLodExpanded: OptikExpandedProof | null
): Cycle3Target {
  const ratios = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.renderedVisibleHeightRatio)
    .filter((value): value is number => value !== null && value !== undefined);
  const lumaDeltas = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.meanOpaqueLumaDelta)
    .filter((value): value is number => value !== null && value !== undefined);
  const lumaDeltaPercents = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.meanOpaqueLumaDeltaPercent)
    .filter((value): value is number => value !== null && value !== undefined);
  const aircraftRatios = (proof?.aircraftNativeScale ?? [])
    .map((entry) => entry.nativeLongestAxisToNpcVisualHeight)
    .filter((value): value is number => value !== null && value !== undefined);
  const trusted = proof?.status === 'pass' && proof.measurementTrust?.status === 'pass';
  const visibleHeightWithinBand = ratios.length > 0 && ratios.every((ratio) => ratio >= 0.85 && ratio <= 1.15);
  const lumaStillFlagged = (proof?.npcComparisons ?? [])
    .some((entry) => entry.flags?.some((flag) => flag.startsWith('rendered-luma-delta-')));
  const expandedTrusted = expanded?.measurementTrust?.status === 'pass';
  const expandedFlaggedSamples = expanded?.aggregate?.flaggedSamples ?? null;
  const expandedHasFlags = expandedTrusted && expandedFlaggedSamples !== null && expandedFlaggedSamples > 0;
  const expandedPasses = expandedTrusted && expanded?.status === 'pass';
  const expandedMaxAbsLumaDeltaPercent = expanded?.aggregate?.maxAbsLumaDeltaPercent ?? null;
  const expandedLumaInProofBand = expandedTrusted
    && expandedMaxAbsLumaDeltaPercent !== null
    && expandedMaxAbsLumaDeltaPercent <= 12;
  const expandedVisibleHeightInProofBand = expandedTrusted
    && (expanded?.aggregate?.minVisibleHeightRatio ?? 0) >= 0.85
    && (expanded?.aggregate?.maxVisibleHeightRatio ?? 2) <= 1.15;
  const expandedOnlyVisibleHeightFlags = expandedHasFlags
    && expandedLumaInProofBand
    && !expandedVisibleHeightInProofBand;
  const runtimeLodExpandedPasses =
    runtimeLodExpanded?.measurementTrust?.status === 'pass'
    && runtimeLodExpanded?.status === 'pass';

  return {
    id: 'npc-imposter-scale-luma-contract',
    bureau: 'KB-OPTIK',
    status: trusted
      ? visibleHeightWithinBand
        ? expandedHasFlags
          ? 'needs_decision'
          : 'ready_for_branch'
        : 'needs_decision'
      : 'blocked',
    priority: 1,
    summary: trusted
      ? visibleHeightWithinBand
        ? lumaStillFlagged
          ? 'First scale/crop remediation has matched evidence inside the +/-15% height band; remaining KB-OPTIK work is shader/luma parity or an explicit visual exception.'
          : expandedPasses
            ? 'Scale/crop and expanded lighting/gameplay-camera luma parity are inside matched proof bands; remaining KB-OPTIK work is human review or explicit closeout.'
            : expandedOnlyVisibleHeightFlags
              ? runtimeLodExpandedPasses
                ? 'Scale/crop and expanded lighting luma are inside proof bands; the 8.5m near-stress camera flags, but runtime LOD-edge proof passes, so KB-OPTIK needs a visual-exception or human-review decision.'
                : 'Scale/crop and expanded lighting luma are inside proof bands, but gameplay-camera visible-height samples still need a KB-OPTIK shape/crop decision.'
            : expandedHasFlags
              ? 'Scale/crop and selected-lighting luma parity are inside matched proof bands, but expanded lighting/gameplay-camera proof found visual flags that need targeted KB-OPTIK decision.'
              : 'Scale/crop and selected-lighting luma parity are inside matched proof bands; remaining KB-OPTIK work is expanded lighting snapshots, human review, or explicit closeout.'
        : decisionPath
          ? 'Matched evidence and KB-OPTIK decision packet exist; imposter crop/regeneration remains the recommended first runtime branch.'
          : 'Matched evidence exists; decide whether to change NPC runtime visual height, regenerate imposter bakes, align shader/luma, or combine those changes in separate measured slices.'
      : 'Matched close-GLB/imposter evidence is missing or untrusted.',
    evidence: {
      opticsScaleProofPath: rel(opticsPath),
      optikDecisionPacketPath: rel(decisionPath),
      optikExpandedProofPath: rel(expandedPath),
      runtimeLodExpandedProofPath: rel(runtimeLodExpandedPath),
      optikDecisionPacketStatus: decision?.status ?? null,
      optikExpandedProofStatus: expanded?.status ?? null,
      runtimeLodExpandedProofStatus: runtimeLodExpanded?.status ?? null,
      recommendedFirstRuntimeBranch: decision?.recommendedSequence?.[1] ?? null,
      openOwnerDecision: decision?.openOwnerDecision ?? null,
      runtimeNpcVisualHeightMeters: proof?.runtimeContracts?.npc?.visualHeightMeters ?? null,
      visibleHeightWithinBand,
      lumaStillFlagged,
      renderedVisibleHeightRatio: {
        min: min(ratios),
        average: average(ratios),
        max: max(ratios),
      },
      meanOpaqueLumaDelta: {
        min: min(lumaDeltas),
        average: average(lumaDeltas),
        max: max(lumaDeltas),
      },
      meanOpaqueLumaDeltaPercent: {
        min: min(lumaDeltaPercents),
        average: average(lumaDeltaPercents),
        max: max(lumaDeltaPercents),
      },
      aircraftLongestAxisToNpcHeight: {
        min: min(aircraftRatios),
        average: average(aircraftRatios),
        max: max(aircraftRatios),
      },
      expandedProof: {
        cameraProfileSet: expanded?.coverage?.cameraProfileSet ?? null,
        sampleCount: expanded?.aggregate?.sampleCount ?? null,
        flaggedSamples: expandedFlaggedSamples,
        minVisibleHeightRatio: expanded?.aggregate?.minVisibleHeightRatio ?? null,
        maxVisibleHeightRatio: expanded?.aggregate?.maxVisibleHeightRatio ?? null,
        minLumaDeltaPercent: expanded?.aggregate?.minLumaDeltaPercent ?? null,
        maxLumaDeltaPercent: expanded?.aggregate?.maxLumaDeltaPercent ?? null,
        maxAbsLumaDeltaPercent: expanded?.aggregate?.maxAbsLumaDeltaPercent ?? null,
        flaggedProfiles: expanded?.aggregate?.flaggedProfiles ?? null,
      },
      runtimeLodExpandedProof: {
        cameraProfileSet: runtimeLodExpanded?.coverage?.cameraProfileSet ?? null,
        sampleCount: runtimeLodExpanded?.aggregate?.sampleCount ?? null,
        flaggedSamples: runtimeLodExpanded?.aggregate?.flaggedSamples ?? null,
        minVisibleHeightRatio: runtimeLodExpanded?.aggregate?.minVisibleHeightRatio ?? null,
        maxVisibleHeightRatio: runtimeLodExpanded?.aggregate?.maxVisibleHeightRatio ?? null,
        minLumaDeltaPercent: runtimeLodExpanded?.aggregate?.minLumaDeltaPercent ?? null,
        maxLumaDeltaPercent: runtimeLodExpanded?.aggregate?.maxLumaDeltaPercent ?? null,
        maxAbsLumaDeltaPercent: runtimeLodExpanded?.aggregate?.maxAbsLumaDeltaPercent ?? null,
        flaggedProfiles: runtimeLodExpanded?.aggregate?.flaggedProfiles ?? null,
      },
    },
    requiredBefore: [
      'Use the latest matched scale/crop proof as the after artifact for the first remediation.',
      lumaStillFlagged
        ? 'If continuing KB-OPTIK, isolate shader/luma parity from target height and crop metadata changes.'
        : expandedTrusted
          ? expandedOnlyVisibleHeightFlags
            ? runtimeLodExpandedPasses
              ? 'If continuing KB-OPTIK, document the near-stress camera exception or run human visual review before changing crop/scale again.'
              : 'If continuing KB-OPTIK, inspect the flagged gameplay-camera silhouette samples before changing shader constants again.'
            : expandedHasFlags
            ? 'If continuing KB-OPTIK, inspect the flagged expanded lighting/gameplay-camera samples before changing shader constants again.'
            : 'If continuing KB-OPTIK, use the expanded lighting/gameplay-camera proof for human visual review or explicit closeout.'
          : 'If continuing KB-OPTIK, expand proof coverage to dawn, dusk, haze, and combat camera screenshots without changing target height or crop metadata.',
      'If changing the 2.95m target again, update close GLB, imposter, hit/aiming, and player-relative scale tests together.',
    ],
    acceptance: [
      'Matched close/imposter visible height delta within +/-15% for the first remediation, or explicit visual exception.',
      'Mean opaque luma delta within +/-12% under selected and expanded lighting snapshots.',
      'No performance or upload regression accepted without paired artifacts.',
    ],
    nonClaims: [
      lumaStillFlagged
        ? 'Do not claim full NPC visual parity while luma remains flagged.'
        : expandedPasses
          ? 'Do not claim human visual signoff from mechanical proof alone.'
          : expandedOnlyVisibleHeightFlags
            ? runtimeLodExpandedPasses
              ? 'Do not claim final NPC visual parity until the near-stress exception is documented or human-reviewed.'
              : 'Do not claim final NPC visual parity while gameplay-camera silhouette samples remain flagged.'
            : 'Do not claim final NPC visual parity until expanded lighting screenshots and human review exist.',
      'Do not accept aircraft scale changes from this target without a separate vehicle-scale proof.',
    ],
  };
}

function buildLoadTarget(
  texturePath: string | null,
  startupOpenPath: string | null,
  startupOpen: StartupSummary | null,
  startupZonePath: string | null,
  startupZone: StartupSummary | null,
  texture: TextureAudit | null
): Cycle3Target {
  const hasStartup = Boolean(startupOpenPath && startupZonePath);
  const hasTextureAudit = Boolean(texturePath);
  return {
    id: 'pixel-forge-texture-upload-residency',
    bureau: 'KB-LOAD',
    status: hasStartup && hasTextureAudit ? 'ready_for_branch' : 'needs_baseline',
    priority: 2,
    summary: 'KB-LOAD has a first giantPalm upload warmup; the next WebGL branch should target remaining upload/residency only if it preserves visual parity and records before/after startup upload tables.',
    evidence: {
      textureAuditPath: rel(texturePath),
      startupOpenFrontierPath: rel(startupOpenPath),
      startupZoneControlPath: rel(startupZonePath),
      totalEstimatedMipmappedRgbaMiB: texture?.summary?.totalEstimatedMipmappedRgbaMiB ?? texture?.summary?.totalEstimatedMipmappedMiB ?? null,
      flaggedTextures: texture?.summary?.flaggedTextures ?? null,
      hardFailures: texture?.summary?.hardFailures ?? null,
      candidateEstimatedMipmappedRgbaMiB: texture?.summary?.candidateEstimatedMipmappedRgbaMiB ?? texture?.summary?.totalEstimatedCandidateMipmappedMiB ?? null,
      candidateSavingsMiB: texture?.summary?.candidateSavingsMiB ?? texture?.summary?.totalEstimatedCandidateSavingsMiB ?? null,
      openFrontierModeClickToPlayableAverageMs: startupAverageMs(startupOpen, 'modeClickToPlayable'),
      openFrontierDeployClickToPlayableAverageMs: startupAverageMs(startupOpen, 'deployClickToPlayable'),
      openFrontierWebglUploadTotalAverageMs: startupUploadAverage(startupOpen, 'webglTextureUploadTotalDurationMs'),
      openFrontierWebglUploadMaxAverageMs: startupUploadAverage(startupOpen, 'webglTextureUploadMaxDurationMs'),
      openFrontierUploadCount: startupUploadAverage(startupOpen, 'webglTextureUploadCount'),
      openFrontierLargestUploads: startupOpen?.webglUploadSummary?.largestUploads ?? null,
      zoneControlModeClickToPlayableAverageMs: startupAverageMs(startupZone, 'modeClickToPlayable'),
      zoneControlDeployClickToPlayableAverageMs: startupAverageMs(startupZone, 'deployClickToPlayable'),
      zoneControlWebglUploadTotalAverageMs: startupUploadAverage(startupZone, 'webglTextureUploadTotalDurationMs'),
      zoneControlWebglUploadMaxAverageMs: startupUploadAverage(startupZone, 'webglTextureUploadMaxDurationMs'),
      zoneControlUploadCount: startupUploadAverage(startupZone, 'webglTextureUploadCount'),
      zoneControlLargestUploads: startupZone?.webglUploadSummary?.largestUploads ?? null,
    },
    requiredBefore: [
      'Run fresh Open Frontier and Zone Control startup UI artifacts immediately before the branch if the latest startup artifacts predate the target assets.',
      'Do not broaden startup texture warmup from the rejected fanPalm artifact without a new paired proof.',
      'Choose one remaining texture class first: fanPalm with a latency guard, NPC albedo atlases, approved asset regeneration, or preload/deferred upload policy.',
      'Pair all texture candidates with KB-OPTIK visual proof before shipping.',
    ],
    acceptance: [
      'Open Frontier and Zone Control mode-click-to-playable median and p95 do not regress against the before artifact.',
      'WebGL upload total and largest-upload table improve, or the branch is recorded as rejected evidence rather than landed remediation.',
      'No texture downscale/compression is accepted without visual screenshots.',
    ],
    nonClaims: [
      'Texture candidate savings are planning estimates, not accepted art changes.',
      'Do not claim a startup-latency win from WebGL upload totals alone.',
      'Do not compare diagnostic wrapped-upload timing directly against clean runtime captures.',
    ],
  };
}

function buildEffectsTarget(grenadePath: string | null, grenade: GrenadeSummary | null): Cycle3Target {
  const trusted = grenade?.measurementTrust?.status === 'pass' || Boolean(grenadePath);
  const hasRenderAttribution = Boolean(grenade?.detonation?.renderAttribution);
  const renderMaxMs = grenade?.detonation?.renderAttribution?.totals?.maxDurationMs ?? null;
  const frameMaxMs = grenade?.detonation?.frame?.maxFrameMs ?? null;
  const stalls = grenade?.detonation?.browserStalls ?? null;
  const fragTiming = grenade?.detonation?.userTiming?.['kb-effects.grenade.frag.total'] ?? null;
  const trustFlags = grenade?.measurementTrust?.flags ?? {};
  const triggerOrPostLoafCount = Number(trustFlags.triggerOrPostTriggerLongAnimationFrameCount ?? Number.POSITIVE_INFINITY);
  const nearTriggerMainRenderMs = Number(trustFlags.maxNearTriggerMainSceneRenderMs ?? renderMaxMs ?? Number.POSITIVE_INFINITY);
  const lowLoadEvidenceComplete = Boolean(
    hasRenderAttribution
    && grenade?.measurementTrust?.status === 'pass'
    && (stalls?.longTaskCount ?? Number.POSITIVE_INFINITY) === 0
    && triggerOrPostLoafCount === 0
    && nearTriggerMainRenderMs < 50
    && frameMaxMs !== null
    && frameMaxMs < 50
  );
  return {
    id: 'grenade-first-use-stall',
    bureau: 'KB-EFFECTS',
    status: lowLoadEvidenceComplete
      ? 'evidence_complete'
      : (hasRenderAttribution ? 'needs_decision' : (trusted ? 'ready_for_branch' : 'needs_baseline')),
    priority: 3,
    summary: lowLoadEvidenceComplete
      ? 'KB-EFFECTS low-load grenade first-use closeout is evidence-complete for the unlit pooled explosion path; no trigger/post-trigger browser stall remains in the trusted probe.'
      : hasRenderAttribution
      ? 'KB-EFFECTS has first unlit-explosion architecture evidence: trigger-adjacent render calls are no longer the 300ms+ stall, but the probe still needs clean browser-stall/frame-metric closeout.'
      : 'Grenade remediation is blocked on render-frame attribution; matched visible warmup attempts still reproduced the low-load two-grenade first-use stall.',
    evidence: {
      grenadeArtifactPath: rel(grenadePath),
      status: grenade?.status ?? null,
      measurementTrustStatus: grenade?.measurementTrust?.status ?? null,
      hasBaselineWindow: Boolean(grenade?.baseline),
      hasDetonationWindow: Boolean(grenade?.detonation),
      hasRenderAttribution,
      detonationFrameMaxMs: frameMaxMs,
      detonationLongTaskCount: stalls?.longTaskCount ?? null,
      detonationLongTaskMaxMs: stalls?.longTaskMaxDurationMs ?? null,
      detonationLongAnimationFrameCount: stalls?.longAnimationFrameCount ?? null,
      detonationLongAnimationFrameMaxMs: stalls?.longAnimationFrameMaxDurationMs ?? null,
      renderAttributionMaxMs: renderMaxMs,
      maxNearTriggerMainSceneRenderMs: trustFlags.maxNearTriggerMainSceneRenderMs ?? null,
      preTriggerLongAnimationFrameCount: trustFlags.preTriggerLongAnimationFrameCount ?? null,
      preTriggerLoafOverlapsFirstTrigger: trustFlags.preTriggerLoafOverlapsFirstTrigger ?? null,
      triggerOrPostTriggerLongAnimationFrameCount: trustFlags.triggerOrPostTriggerLongAnimationFrameCount ?? null,
      postTriggerLongAnimationFrameCount: trustFlags.postTriggerLongAnimationFrameCount ?? null,
      classifiedPreTriggerFrameMax: trustFlags.classifiedPreTriggerFrameMax ?? null,
      lowLoadEvidenceComplete,
      fragTotalDurationMs: fragTiming?.totalDurationMs ?? null,
      fragMaxDurationMs: fragTiming?.maxDurationMs ?? null,
      maxFrameDeltaMs: grenade?.deltas?.maxFrameMs ?? null,
      hitch50Delta: grenade?.deltas?.hitch50Count ?? null,
      windows: grenade?.windows ?? null,
    },
    requiredBefore: [
      lowLoadEvidenceComplete
        ? 'Keep the unlit pooled explosion architecture; do not reintroduce dynamic explosion lights for visual polish.'
        : hasRenderAttribution
        ? 'Classify or remove the remaining pre-trigger LoAF/frame-metric contamination before declaring KB-EFFECTS closed.'
        : 'Refresh low-load two-grenade probe if the latest artifact is stale or missing CPU profile/long-task windows.',
      lowLoadEvidenceComplete
        ? 'Treat any future grenade visual changes as new evidence work with matched render attribution.'
        : 'Do not reintroduce dynamic explosion PointLights; grenade visuals should stay unlit, pooled, and shader-stable.',
      'Keep grenade JS, audio, particle, renderer, and shader/program changes separate unless evidence forces coupling.',
    ],
    acceptance: [
      'No long task above 50ms within +/-250ms of either warmed trigger.',
      'First/second detonation p95 delta below 3ms.',
      'Render attribution shows no trigger-adjacent main-scene render call above 50ms.',
      'Any remaining LoAF/frame max is classified as trigger-caused or pre-trigger harness contamination.',
    ],
    nonClaims: [
      'Do not close KB-EFFECTS from frag JS timings alone.',
      'Do not use saturated combat120 grenade artifacts for first-use attribution.',
      lowLoadEvidenceComplete
        ? 'Do not claim combat120 or stress-scene grenade closeout from the low-load probe.'
        : 'Do not claim full KB-EFFECTS closeout while the low-load probe still records a 100ms max frame or unclassified LoAF.',
    ],
  };
}

function buildTerrainTarget(
  horizonPath: string | null,
  horizon: HorizonAudit | null,
  openFrontierSummaryPath: string | null,
  aShauSummaryPath: string | null,
  terrainBaselinePath: string | null,
  terrainBaseline: TerrainHorizonBaseline | null
): Cycle3Target {
  const hasHorizon = Boolean(horizonPath);
  const screenshotBaselineTrusted = terrainBaseline?.status === 'pass'
    && terrainBaseline.measurementTrust?.status === 'pass'
    && (terrainBaseline.scenarios ?? []).reduce((sum, scenario) => sum + (scenario.shots?.length ?? 0), 0) >= 4;
  const matchedPerfTrusted = terrainBaseline?.performanceBaselines?.openFrontier?.status === 'pass'
    && terrainBaseline.performanceBaselines.aShau?.status === 'pass';
  const baselineReady = hasHorizon && screenshotBaselineTrusted && matchedPerfTrusted;
  return {
    id: 'large-mode-vegetation-horizon',
    bureau: 'KB-TERRAIN',
    status: baselineReady ? 'ready_for_branch' : (hasHorizon ? 'needs_baseline' : 'blocked'),
    priority: 4,
    summary: baselineReady
      ? 'Elevated Open Frontier/A Shau screenshot and perf-before baselines are ready; outer-canopy work still needs matched after evidence.'
      : 'Outer-canopy work needs matched elevated runtime screenshots and perf deltas before any far layer is accepted.',
    evidence: {
      horizonAuditPath: rel(horizonPath),
      terrainHorizonBaselinePath: rel(terrainBaselinePath),
      openFrontierPerfSummaryPath: rel(openFrontierSummaryPath),
      aShauPerfSummaryPath: rel(aShauSummaryPath),
      terrainBaselineStatus: terrainBaseline?.status ?? null,
      terrainBaselineMeasurementTrustStatus: terrainBaseline?.measurementTrust?.status ?? null,
      screenshotCount: (terrainBaseline?.scenarios ?? []).reduce((sum, scenario) => sum + (scenario.shots?.length ?? 0), 0),
      openFrontierP95AfterCeilingPlus1p5Ms: terrainBaseline?.performanceBaselines?.openFrontier?.p95AfterCeilingPlus1p5Ms ?? null,
      openFrontierDrawCallAfterCeiling10Percent: terrainBaseline?.performanceBaselines?.openFrontier?.drawCallAfterCeiling10Percent ?? null,
      aShauP95AfterCeilingPlus1p5Ms: terrainBaseline?.performanceBaselines?.aShau?.p95AfterCeilingPlus1p5Ms ?? null,
      aShauDrawCallAfterCeiling10Percent: terrainBaseline?.performanceBaselines?.aShau?.drawCallAfterCeiling10Percent ?? null,
      flaggedModes: horizon?.summary?.flaggedModes ?? null,
      largestBareTerrainBandMeters: horizon?.summary?.largestBareTerrainBandMeters ?? null,
      largestBareTerrainBandMode: horizon?.summary?.largestBareTerrainBandMode ?? null,
    },
    requiredBefore: [
      baselineReady
        ? 'Choose the first far-horizon owner path: visual-only proof, far-canopy cards, or vegetation distance policy.'
        : 'Use current elevated Open Frontier and A Shau screenshots as before evidence.',
      baselineReady
        ? 'Fresh-build the terrain horizon baseline before the after comparison if the current proof reused an existing perf build.'
        : 'Define whether the first branch is visual-only proof, far-canopy cards, or vegetation distance policy.',
      'Capture matched perf before and after in Open Frontier and A Shau.',
    ],
    acceptance: [
      'Elevated Open Frontier and A Shau screenshots show improved horizon coverage.',
      'Outer canopy adds no more than 1.5ms p95 frame time and no more than 10% draw-call growth.',
      'No near/mid vegetation regression in ground cameras.',
    ],
    nonClaims: [
      'Do not accept an outer canopy from static horizon audit alone.',
      'Do not start WebGPU to solve far canopy during Cycle 3.',
    ],
  };
}

function buildCullTarget(
  cullingPath: string | null,
  culling: CullingProof | null,
  cullingBaselinePath: string | null,
  cullingBaseline: CullingOwnerBaseline | null,
  openFrontierSummaryPath: string | null,
  aShauSummaryPath: string | null,
  combat120SummaryPath: string | null
): Cycle3Target {
  const trusted = culling?.status === 'pass' && culling.measurementTrust?.status === 'pass';
  const ownerBaselineReady = cullingBaseline?.status === 'pass'
    && cullingBaseline.measurementTrust?.status === 'pass'
    && cullingBaseline.selectedOwnerPath?.status === 'ready_for_branch';
  return {
    id: 'static-feature-and-vehicle-culling-hlod',
    bureau: 'KB-CULL',
    status: ownerBaselineReady ? 'ready_for_branch' : (trusted ? 'needs_baseline' : 'blocked'),
    priority: 5,
    summary: ownerBaselineReady
      ? 'KB-CULL has a selected owner-path before baseline for large-mode world static features and visible helicopters.'
      : 'Culling/HLOD remediation has category proof, but each actual change still needs representative before/after renderer telemetry.',
    evidence: {
      cullingProofPath: rel(cullingPath),
      cullingOwnerBaselinePath: rel(cullingBaselinePath),
      openFrontierPerfSummaryPath: rel(openFrontierSummaryPath),
      aShauPerfSummaryPath: rel(aShauSummaryPath),
      combat120PerfSummaryPath: rel(combat120SummaryPath),
      status: culling?.status ?? null,
      measurementTrustStatus: culling?.measurementTrust?.status ?? null,
      drawCalls: culling?.rendererInfo?.drawCalls ?? null,
      triangles: culling?.rendererInfo?.triangles ?? null,
      ownerBaselineStatus: cullingBaseline?.status ?? null,
      ownerBaselineMeasurementTrustStatus: cullingBaseline?.measurementTrust?.status ?? null,
      selectedOwnerPathId: cullingBaseline?.selectedOwnerPath?.id ?? null,
      selectedOwnerCategories: cullingBaseline?.selectedOwnerPath?.ownerCategories ?? null,
      openFrontierVisibleUnattributedPercent: cullingBaseline?.performanceBaselines?.openFrontier?.visibleUnattributedPercent ?? null,
      aShauVisibleUnattributedPercent: cullingBaseline?.performanceBaselines?.aShau?.visibleUnattributedPercent ?? null,
      ownerEvidence: cullingBaseline?.selectedOwnerPath?.evidence ?? null,
    },
    requiredBefore: [
      ownerBaselineReady
        ? 'Start with the selected owner path or explicitly file a different owner decision before editing runtime culling code.'
        : 'Pick one owner path: static world features, parked aircraft visibility, close NPC pool residency, or vegetation imposters.',
      ownerBaselineReady
        ? 'Rerun the culling owner baseline after any candidate change and compare matched owner draw-call/triangle deltas.'
        : 'Capture representative before scene attribution and renderer stats for that path.',
      'Keep HLOD/culling registration visible in docs and artifacts.',
    ],
    acceptance: [
      'Visible unattributed triangles stay below 10%.',
      'Draw-call/triangle deltas improve in matched camera windows.',
      'No hidden gameplay interaction or vehicle entry regression.',
    ],
    nonClaims: [
      'Do not use the deterministic proof screenshot as gameplay scale evidence.',
      'Do not certify culling from static inventory alone.',
    ],
  };
}

function writeMarkdown(report: KickoffReport, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Cycle 3 Kickoff',
    '',
    `Generated: ${report.createdAt}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Status: ${report.status.toUpperCase()}`,
    '',
    '## Recommended Order',
    '',
    ...report.recommendedOrder.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Targets',
    '',
    '| Priority | Target | Bureau | Status | Summary |',
    '| ---: | --- | --- | --- | --- |',
    ...report.targets.map((target) =>
      `| ${target.priority} | ${target.id} | ${target.bureau} | ${target.status} | ${target.summary} |`
    ),
    '',
    '## Open Decisions',
    '',
    ...report.openDecisions.map((decision) => `- ${decision}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

function main(): void {
  const artifactFiles = walkFiles(ARTIFACT_ROOT, () => true);
  const cycle2Path = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-cycle2-proof-suite', 'cycle2-proof-summary.json')));
  const opticsScalePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-optics-scale-proof', 'summary.json')));
  const optikExpandedPath = latestExpandedProofPath(artifactFiles, 'expanded-stress');
  const runtimeLodExpandedPath = latestExpandedProofPath(artifactFiles, 'runtime-lod-edge');
  const optikDecisionPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-optik-decision-packet', 'decision-packet.json')));
  const texturePath = latestFile(artifactFiles, (path) => path.endsWith(join('pixel-forge-texture-audit', 'texture-audit.json')));
  const startupOpenPath = latestStartupSummary(artifactFiles, 'open-frontier');
  const startupZonePath = latestStartupSummary(artifactFiles, 'zone-control');
  const openFrontierPerfPath = latestPerfSummaryForMode(artifactFiles, 'open_frontier');
  const combat120PerfPath = latestPerfSummaryForMode(artifactFiles, 'ai_sandbox');
  const aShauPerfPath = latestPerfSummaryForMode(artifactFiles, 'a_shau_valley');
  const grenadePath = latestFile(artifactFiles, (path) => path.includes('grenade-spike-') && path.endsWith('summary.json'));
  const horizonPath = latestFile(artifactFiles, (path) => path.endsWith(join('vegetation-horizon-audit', 'horizon-audit.json')));
  const terrainBaselinePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-terrain-horizon-baseline', 'summary.json')));
  const cullingPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-culling-proof', 'summary.json')));
  const cullingBaselinePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-culling-owner-baseline', 'summary.json')));

  const cycle2 = readJson<Cycle2Proof>(cycle2Path);
  const opticsScale = readJson<OpticsScaleProof>(opticsScalePath);
  const optikExpanded = readJson<OptikExpandedProof>(optikExpandedPath);
  const runtimeLodExpanded = readJson<OptikExpandedProof>(runtimeLodExpandedPath);
  const optikDecision = readJson<OptikDecisionPacket>(optikDecisionPath);
  const texture = readJson<TextureAudit>(texturePath);
  const startupOpen = readJson<StartupSummary>(startupOpenPath);
  const startupZone = readJson<StartupSummary>(startupZonePath);
  const grenade = readJson<GrenadeSummary>(grenadePath);
  const horizon = readJson<HorizonAudit>(horizonPath);
  const terrainBaseline = readJson<TerrainHorizonBaseline>(terrainBaselinePath);
  const culling = readJson<CullingProof>(cullingPath);
  const cullingBaseline = readJson<CullingOwnerBaseline>(cullingBaselinePath);

  const targets = [
    buildOptikTarget(
      opticsScalePath,
      opticsScale,
      optikDecisionPath,
      optikDecision,
      optikExpandedPath,
      optikExpanded,
      runtimeLodExpandedPath,
      runtimeLodExpanded,
    ),
    buildLoadTarget(texturePath, startupOpenPath, startupOpen, startupZonePath, startupZone, texture),
    buildEffectsTarget(grenadePath, grenade),
    buildTerrainTarget(horizonPath, horizon, openFrontierPerfPath, aShauPerfPath, terrainBaselinePath, terrainBaseline),
    buildCullTarget(cullingPath, culling, cullingBaselinePath, cullingBaseline, openFrontierPerfPath, aShauPerfPath, combat120PerfPath),
  ].sort((a, b) => a.priority - b.priority);

  const report: KickoffReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-cycle3-kickoff',
    status: statusFromTargets(targets, cycle2),
    inputs: {
      cycle2Proof: rel(cycle2Path),
      opticsScaleProof: rel(opticsScalePath),
      optikExpandedProof: rel(optikExpandedPath),
      runtimeLodExpandedProof: rel(runtimeLodExpandedPath),
      optikDecisionPacket: rel(optikDecisionPath),
      textureAudit: rel(texturePath),
      startupOpenFrontier: rel(startupOpenPath),
      startupZoneControl: rel(startupZonePath),
      openFrontierPerfSummary: rel(openFrontierPerfPath),
      combat120PerfSummary: rel(combat120PerfPath),
      aShauPerfSummary: rel(aShauPerfPath),
      grenadeSpike: rel(grenadePath),
      horizonAudit: rel(horizonPath),
      terrainHorizonBaseline: rel(terrainBaselinePath),
      cullingProof: rel(cullingPath),
      cullingOwnerBaseline: rel(cullingBaselinePath),
    },
    targets,
    recommendedOrder: [
      'Treat the 2.95m NPC target drop, per-tile imposter crop, selected-lighting luma proof, and expanded-luma atmosphere pass as the current KB-OPTIK remediation slice.',
      'If KB-OPTIK continues immediately, use the runtime LOD-edge proof plus the near-stress artifact to decide visual exception/human review before changing crop or scale again.',
      'For KB-LOAD, treat the giantPalm warmup as partial upload mitigation only; the next branch must prove startup latency does not regress while reducing remaining uploads.',
      'For KB-EFFECTS, preserve the unlit pooled explosion architecture; do not reopen low-load grenade work unless visuals change, and do not infer combat120/stress closeout.',
      'For KB-TERRAIN, use the terrain horizon baseline proof as before evidence, then require matched after screenshots plus Open Frontier/A Shau perf deltas.',
      'For KB-CULL, use the owner-path baseline before evidence first; do not move close-NPC residency out of diagnostic-only status until combat stress measurement trust passes.',
      'Keep WebGPU out of Cycle 3 unless the owner explicitly approves reopening the point-of-no-return decision.',
    ],
    openDecisions: [
      'Should KB-OPTIK document the 8.5m near-stress silhouette exception after the runtime LOD-edge PASS, run human visual review, or should KB-LOAD/KB-TERRAIN/KB-CULL take the next remediation slot?',
      'Should the next KB-LOAD branch target fanPalm with a latency guard, NPC atlases, approved asset regeneration, or upload scheduling?',
      'Which large-mode p95/draw-call budget will be used for far-canopy acceptance in this cycle?',
    ],
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'cycle3-kickoff-summary.json');
  const markdownFile = join(outputDir, 'cycle3-kickoff-summary.md');
  writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeMarkdown(report, markdownFile);

  console.log(`Projekt 143 Cycle 3 kickoff ${report.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const target of report.targets) {
    console.log(`- ${target.status.toUpperCase()} ${target.id}: ${target.summary}`);
  }

  if (process.argv.includes('--strict') && report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
