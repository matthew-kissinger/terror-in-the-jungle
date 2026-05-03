#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type DecisionState = 'complete' | 'recommended_first_branch' | 'defer' | 'reject_first_branch' | 'needs_owner_decision';

type NpcRuntimeContracts = {
  baseVisualHeightMeters?: number;
  visualScaleMultiplier?: number;
  visualHeightMeters?: number;
  closeModelTargetHeightMeters?: number;
};

type NpcComparison = {
  runtimeFaction?: string;
  closeModel?: {
    sourceHeightMeters?: number;
    visualScale?: number;
    runtimeHeightMeters?: number;
  };
  deltas?: {
    renderedVisibleHeightRatio?: number | null;
    meanOpaqueLumaDelta?: number | null;
  };
  flags?: string[];
};

type AircraftNativeScale = {
  key?: string;
  nativeBoundsMeters?: {
    widthX?: number;
    heightY?: number;
    depthZ?: number;
    longestAxis?: number;
  };
  nativeLongestAxisToNpcVisualHeight?: number;
};

type OpticsScaleProof = {
  createdAt?: string;
  sourceGitSha?: string;
  status?: CheckStatus;
  runtimeContracts?: {
    npc?: NpcRuntimeContracts;
  };
  npcComparisons?: NpcComparison[];
  aircraftNativeScale?: AircraftNativeScale[];
  measurementTrust?: {
    status?: CheckStatus;
  };
};

type DecisionOption = {
  id: string;
  state: DecisionState;
  summary: string;
  why: string[];
  branchShape: string[];
  acceptance: string[];
  nonClaims: string[];
};

type DecisionPacket = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-kb-optik-decision-packet';
  status: CheckStatus;
  inputs: Record<string, string | null>;
  rootCause: {
    currentNpcTargetMeters: number | null;
    baseNpcTargetMeters: number | null;
    currentMultiplier: number | null;
    closeModelSourceHeightMeters: { min: number | null; average: number | null; max: number | null };
    closeModelRuntimeScale: { min: number | null; average: number | null; max: number | null };
    imposterVisibleHeightRatio: { min: number | null; average: number | null; max: number | null };
    imposterMeanOpaqueLumaDelta: { min: number | null; average: number | null; max: number | null };
    aircraftLongestAxisMeters: { min: number | null; average: number | null; max: number | null };
    aircraftLongestAxisToCurrentNpc: { min: number | null; average: number | null; max: number | null };
    aircraftLongestAxisToBaseNpc: { min: number | null; average: number | null; max: number | null };
    aircraftLongestAxisToHumanScaleNpc: { min: number | null; average: number | null; max: number | null };
  };
  decisionOptions: DecisionOption[];
  recommendedSequence: string[];
  openOwnerDecision: string;
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-optik-decision-packet';
const HUMAN_SCALE_REFERENCE_METERS = 1.8;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
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
  const matches = walkFiles(root, predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function finite(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function range(values: Array<number | null | undefined>): { min: number | null; average: number | null; max: number | null } {
  const nums = finite(values);
  if (nums.length === 0) return { min: null, average: null, max: null };
  const average = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  return {
    min: round(Math.min(...nums)),
    average: round(average),
    max: round(Math.max(...nums)),
  };
}

function ratios(longestAxes: number[], denominator: number | null): Array<number | null> {
  if (!denominator || denominator <= 0) return [];
  return longestAxes.map((value) => value / denominator);
}

function buildDecisionOptions(
  baseTarget: number | null,
  currentTarget: number | null,
  visibleHeightRatioAverage: number | null
): DecisionOption[] {
  const baseTargetText = baseTarget ? `${baseTarget.toFixed(2)}m` : 'the Pixel Forge base target';
  const firstTargetDropped = baseTarget !== null
    && currentTarget !== null
    && Math.abs(currentTarget - baseTarget) < 0.01;
  const cropInProofBand = visibleHeightRatioAverage !== null
    && visibleHeightRatioAverage >= 0.85
    && visibleHeightRatioAverage <= 1.15;
  return [
    {
      id: 'lower-npc-target-before-vehicle-scale',
      state: firstTargetDropped ? 'complete' : 'needs_owner_decision',
      summary: firstTargetDropped
        ? `The first absolute NPC target drop is landed at ${baseTargetText}; do not resize aircraft as a substitute.`
        : `Use ${baseTargetText} as the first lower-risk absolute NPC target candidate before touching aircraft scale.`,
      why: [
        firstTargetDropped
          ? 'The runtime target now uses the Pixel Forge base height directly instead of the prior readability multiplier.'
          : 'The prior 4.425m NPC target came from a 1.50 readability multiplier, not from source GLB human height.',
        'Imported aircraft already load at native GLB scale; scaling vehicles first would hide the NPC contract issue and still leave the close/imposter mismatch.',
        'Dropping the multiplier is a smaller first move than jumping all the way to a 1.8m human-scale target.',
      ],
      branchShape: [
        firstTargetDropped
          ? 'Keep any future absolute target move in a separate measured branch.'
          : 'Change only the NPC absolute target contract in a measured branch.',
        firstTargetDropped
          ? 'Use the refreshed KB-OPTIK scale proof as the after artifact for this first move.'
          : 'Regenerate the KB-OPTIK scale proof and player-relative screenshots before claiming acceptance.',
        'Do not claim final human-scale art direction without human playtest and broader gameplay evidence.',
      ],
      acceptance: [
        'NPC target, hit proxy, muzzle/aim, close GLB, and imposter geometry all report the same selected target.',
        'Vehicle-relative screenshots improve without vehicle rescaling.',
        'Combat120 and Open Frontier before/after artifacts show no unacceptable frame-time or aiming regression.',
      ],
      nonClaims: [
        'This does not by itself fix the imposter alpha crop height ratio.',
        'This does not accept final human-scale art direction without playtest.',
      ],
    },
    {
      id: 'repack-or-regenerate-npc-imposter-crops',
      state: cropInProofBand ? 'complete' : 'recommended_first_branch',
      summary: cropInProofBand
        ? 'The first per-tile imposter crop remediation is inside the matched-height proof band.'
        : 'Fix the visible-height mismatch by making the imposter alpha silhouette occupy the same target height as the close GLB.',
      why: [
        cropInProofBand
          ? 'The refreshed proof shows the close/imposter visible-height ratio inside the +/-15% first-remediation band.'
          : 'The close GLB and imposter geometry already project to the same height, but the imposter visible alpha silhouette is only about half as tall.',
        'This is the direct LOD-pop cause measured by the matched crops.',
        'It is independent from whether the final absolute NPC target is 2.95m or another explicitly approved future value.',
      ],
      branchShape: [
        cropInProofBand
          ? 'Keep the generated crop map check in the validation path when NPC atlases change.'
          : 'Prototype crop/UV metadata or atlas regeneration on one faction/clip first.',
        cropInProofBand
          ? 'Use the refreshed matched close/imposter crops for all factions as the after artifact.'
          : 'Rerun matched close/imposter crops for all factions before accepting the runtime path.',
        'Keep shader/luma changes out of the same first patch unless crop evidence proves they are coupled.',
      ],
      acceptance: [
        'Matched close/imposter visible height ratio lands within +/-15% for the first remediation.',
        'Effective visible actor pixels-per-meter is recorded after the crop change.',
        'Open Frontier/combat120 before/after artifacts show no upload or frame-time regression from regenerated textures.',
      ],
      nonClaims: [
        'This does not settle absolute NPC height versus vehicles.',
        'This does not solve darker imposter luma by itself.',
      ],
    },
    {
      id: 'shader-luma-parity-after-scale-crop',
      state: cropInProofBand && firstTargetDropped ? 'recommended_first_branch' : 'defer',
      summary: cropInProofBand && firstTargetDropped
        ? 'Shader/luma parity is now the next KB-OPTIK visual branch if optics work continues.'
        : 'Defer luma/material work until visible height and absolute target are explicitly chosen.',
      why: [
        'The measured luma delta is real, but luma work can mask silhouette and scale defects if done first.',
        'NPC imposters and close GLBs currently use different lighting/material paths.',
      ],
      branchShape: [
        'After crop/target decisions, align one lighting setup first.',
        'Expand to dawn, dusk, haze, and storm after the first matched proof passes.',
      ],
      acceptance: [
        'Mean opaque luma delta within +/-12% under the selected setup.',
        'No readability regression in combat camera screenshots.',
      ],
      nonClaims: [
        'Do not call luma parity a scale fix.',
      ],
    },
    {
      id: 'resize-aircraft-first',
      state: 'reject_first_branch',
      summary: 'Do not resize aircraft as the first response to the NPC/vehicle scale concern.',
      why: [
        'The aircraft GLBs are already native-scale runtime assets.',
        'The current visual mismatch is dominated by NPC target inflation and imposter alpha crop, not by a measured aircraft normalization failure.',
        'Vehicle scale changes require separate aircraft feel, camera, collision, culling, and player-entry validation.',
      ],
      branchShape: [
        'Only reopen vehicle scale after NPC target/crop evidence and a dedicated vehicle-scale proof.',
      ],
      acceptance: [
        'Dedicated vehicle-scale proof with cockpit/player-relative screenshots and aircraft operation probes.',
      ],
      nonClaims: [
        'Do not use NPC imposter mismatch as evidence that aircraft GLBs are too small.',
      ],
    },
  ];
}

function writeMarkdown(packet: DecisionPacket, file: string): void {
  const lines = [
    '# Projekt Objekt-143 KB-OPTIK Decision Packet',
    '',
    `Generated: ${packet.createdAt}`,
    `Source SHA: ${packet.sourceGitSha}`,
    `Status: ${packet.status.toUpperCase()}`,
    '',
    '## Root Cause',
    '',
    `- Current NPC target: ${packet.rootCause.currentNpcTargetMeters ?? 'unknown'}m`,
    `- Base NPC target: ${packet.rootCause.baseNpcTargetMeters ?? 'unknown'}m`,
    `- Current multiplier: ${packet.rootCause.currentMultiplier ?? 'unknown'}`,
    `- Imposter visible height ratio: ${JSON.stringify(packet.rootCause.imposterVisibleHeightRatio)}`,
    `- Imposter luma delta: ${JSON.stringify(packet.rootCause.imposterMeanOpaqueLumaDelta)}`,
    `- Aircraft longest axis / current NPC: ${JSON.stringify(packet.rootCause.aircraftLongestAxisToCurrentNpc)}`,
    `- Aircraft longest axis / base NPC: ${JSON.stringify(packet.rootCause.aircraftLongestAxisToBaseNpc)}`,
    '',
    '## Decision Options',
    '',
    '| Option | State | Summary |',
    '| --- | --- | --- |',
    ...packet.decisionOptions.map((option) => `| ${option.id} | ${option.state} | ${option.summary} |`),
    '',
    '## Recommended Sequence',
    '',
    ...packet.recommendedSequence.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Open Owner Decision',
    '',
    packet.openOwnerDecision,
    '',
  ];
  writeFileSync(file, lines.join('\n'), 'utf-8');
}

function main(): void {
  const opticsScalePath = latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('projekt-143-optics-scale-proof', 'summary.json')));
  const proof = readJson<OpticsScaleProof>(opticsScalePath);
  const trusted = proof?.status === 'pass' && proof.measurementTrust?.status === 'pass';
  const npc = proof?.runtimeContracts?.npc ?? {};
  const comparisons = proof?.npcComparisons ?? [];
  const aircraft = proof?.aircraftNativeScale ?? [];
  const currentTarget = npc.closeModelTargetHeightMeters ?? npc.visualHeightMeters ?? null;
  const baseTarget = npc.baseVisualHeightMeters ?? null;
  const longestAxes = finite(aircraft.map((entry) => entry.nativeBoundsMeters?.longestAxis));
  const imposterVisibleHeightRatio = range(comparisons.map((entry) => entry.deltas?.renderedVisibleHeightRatio));
  const imposterMeanOpaqueLumaDelta = range(comparisons.map((entry) => entry.deltas?.meanOpaqueLumaDelta));
  const firstTargetDropped = baseTarget !== null
    && currentTarget !== null
    && Math.abs(currentTarget - baseTarget) < 0.01;
  const cropInProofBand = imposterVisibleHeightRatio.average !== null
    && imposterVisibleHeightRatio.average >= 0.85
    && imposterVisibleHeightRatio.average <= 1.15;

  const packet: DecisionPacket = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-kb-optik-decision-packet',
    status: trusted ? 'warn' : 'fail',
    inputs: {
      opticsScaleProof: rel(opticsScalePath),
    },
    rootCause: {
      currentNpcTargetMeters: currentTarget !== null ? round(currentTarget) : null,
      baseNpcTargetMeters: baseTarget !== null ? round(baseTarget) : null,
      currentMultiplier: npc.visualScaleMultiplier !== undefined ? round(npc.visualScaleMultiplier) : null,
      closeModelSourceHeightMeters: range(comparisons.map((entry) => entry.closeModel?.sourceHeightMeters)),
      closeModelRuntimeScale: range(comparisons.map((entry) => entry.closeModel?.visualScale)),
      imposterVisibleHeightRatio,
      imposterMeanOpaqueLumaDelta,
      aircraftLongestAxisMeters: range(longestAxes),
      aircraftLongestAxisToCurrentNpc: range(ratios(longestAxes, currentTarget)),
      aircraftLongestAxisToBaseNpc: range(ratios(longestAxes, baseTarget)),
      aircraftLongestAxisToHumanScaleNpc: range(ratios(longestAxes, HUMAN_SCALE_REFERENCE_METERS)),
    },
    decisionOptions: buildDecisionOptions(baseTarget, currentTarget, imposterVisibleHeightRatio.average),
    recommendedSequence: firstTargetDropped && cropInProofBand
      ? [
          'Do not resize aircraft first. Treat the current evidence as an NPC visual-contract problem unless a dedicated vehicle-scale proof says otherwise.',
          'Treat the 2.95m target drop and per-tile crop map as the first landed KB-OPTIK remediation; use the latest matched proof as the after artifact.',
          'If KB-OPTIK continues immediately, handle shader/luma parity with matched lighting screenshots and no further target-height changes.',
          'Only reopen aircraft scale after the NPC target/crop evidence and fixed-wing/helicopter playtest probes are in scope.',
        ]
      : [
          'Do not resize aircraft first. Treat the current evidence as an NPC visual-contract and imposter-crop problem until a dedicated vehicle-scale proof says otherwise.',
          'Prototype the imposter crop/regeneration fix because it directly attacks the measured visible-height ratio.',
          'Ask the owner to approve whether the absolute NPC target uses the 2.95m base target before any broader human-scale move.',
          'After crop and target decisions, handle shader/luma parity with matched lighting screenshots.',
          'Only reopen aircraft scale after the NPC target/crop evidence lands and fixed-wing/helicopter playtest probes are in scope.',
        ],
    openOwnerDecision: firstTargetDropped && cropInProofBand
      ? 'No open owner decision remains for the first 2.95m target/crop remediation. Next decision: take KB-OPTIK luma/material parity now, or switch the next remediation slot to KB-LOAD/KB-EFFECTS.'
      : 'Approve the first absolute NPC target candidate: keep the readability multiplier, drop to the 2.95m Pixel Forge base target, or authorize a larger human-scale redesign with gameplay/playtest scope.',
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'decision-packet.json');
  const markdownFile = join(outputDir, 'decision-packet.md');
  writeFileSync(jsonFile, `${JSON.stringify(packet, null, 2)}\n`, 'utf-8');
  writeMarkdown(packet, markdownFile);

  console.log(`KB-OPTIK decision packet ${packet.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  console.log(`- current NPC target: ${packet.rootCause.currentNpcTargetMeters ?? 'unknown'}m`);
  console.log(`- imposter visible-height ratio avg: ${packet.rootCause.imposterVisibleHeightRatio.average ?? 'unknown'}`);
  console.log(`- aircraft longest-axis/current-NPC avg: ${packet.rootCause.aircraftLongestAxisToCurrentNpc.average ?? 'unknown'}`);
  console.log(`- recommended next runtime branch: ${firstTargetDropped && cropInProofBand ? 'shader-luma-parity-after-scale-crop' : 'repack-or-regenerate-npc-imposter-crops'}`);

  if (process.argv.includes('--strict') && packet.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
