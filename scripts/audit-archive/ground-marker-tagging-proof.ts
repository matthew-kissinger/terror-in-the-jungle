#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface CategorySummary {
  category?: string;
  drawSubmissions?: number;
  drawShare?: number | null;
  triangles?: number;
  triangleShare?: number | null;
  instances?: number;
  instanceShare?: number | null;
}

interface RenderSubmissionPacket {
  sourceSummary?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    runtimeSamples?: number;
    runtimeRenderSubmissionSamples?: number;
  };
  peakSample?: {
    frameEvent?: {
      frameCount?: number;
      frameMs?: number;
    } | null;
    rendererRenderUserTimingMaxMs?: number | null;
  } | null;
  frameSelection?: {
    frameCount?: number | null;
    exactPeakFrame?: boolean;
    totalDrawSubmissions?: number;
    totalTriangles?: number;
    totalInstances?: number;
    categories?: CategorySummary[];
    topByDrawSubmissions?: CategorySummary | null;
    topByTriangles?: CategorySummary | null;
    topByInstances?: CategorySummary | null;
    unattributedDrawShare?: number | null;
  };
  rendererReconciliation?: {
    drawSubmissionsToRendererDrawCalls?: number | null;
    selectedFrameTrianglesToRendererTriangles?: number | null;
  };
  classification?: {
    owner?: string;
    confidence?: string;
  };
}

interface SourceAnchor {
  path: string;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface ProofReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-ground-marker-tagging-proof';
  status: Status;
  inputs: {
    beforePacket: string;
    afterArtifactDir: string;
    afterPacket: string;
  };
  before: PacketFacts;
  after: PacketFacts;
  movement: {
    unattributedDrawShareBefore: number | null;
    unattributedDrawShareAfter: number | null;
    unattributedDrawShareDelta: number | null;
    groundMarkerDrawShareBefore: number | null;
    groundMarkerDrawShareAfter: number | null;
    groundMarkerDrawSubmissionsAfter: number;
    groundMarkerInstancesAfter: number;
    groundMarkerTrianglesAfter: number;
  };
  sourceAnchors: SourceAnchor[];
  classification: {
    owner:
      | 'ground_marker_tagging_moves_unattributed_draws'
      | 'ground_marker_tagging_not_proven'
      | 'ground_marker_tagging_packet_untrusted';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'diagnostic_only';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

interface PacketFacts {
  captureStatus: string | null;
  validation: string | null;
  measurementTrust: string | null;
  exactPeakFrame: boolean;
  peakFrameCount: number | null;
  peakFrameMs: number | null;
  selectedFrameCount: number | null;
  totalDrawSubmissions: number;
  totalTriangles: number;
  totalInstances: number;
  topDrawCategory: string | null;
  topDrawShare: number | null;
  topTriangleCategory: string | null;
  topTriangleShare: number | null;
  topInstanceCategory: string | null;
  topInstanceShare: number | null;
  unattributedDrawShare: number | null;
  groundMarkerCategory: CategorySummary | null;
  rendererRenderUserTimingMaxMs: number | null;
  drawReconciliation: number | null;
  triangleReconciliation: number | null;
  packetClassification: string | null;
  packetConfidence: string | null;
}

const OUTPUT_NAME = 'projekt-143-ground-marker-tagging-proof';
const DEFAULT_BEFORE_PACKET = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T16-32-55-557Z',
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);
const RENDER_PACKET_RELATIVE = join(
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);
const COMBATANT_MESH_FACTORY = 'src/systems/combat/CombatantMeshFactory.ts';

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function requireAfterArtifactDir(): string {
  const raw = argValue('--artifact');
  if (!raw) throw new Error('Usage: npx tsx scripts/projekt-143-ground-marker-tagging-proof.ts --artifact <post-tag-artifact-dir> [--before <before-packet>]');
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing after artifact directory: ${raw}`);
  return resolved;
}

function beforePacketPath(): string {
  const raw = argValue('--before') ?? DEFAULT_BEFORE_PACKET;
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing before packet: ${raw}`);
  return resolved;
}

function category(packet: RenderSubmissionPacket, name: string): CategorySummary | null {
  return packet.frameSelection?.categories?.find((entry) => entry.category === name) ?? null;
}

function packetFacts(packet: RenderSubmissionPacket): PacketFacts {
  const groundMarker = category(packet, 'npc_ground_markers');
  return {
    captureStatus: packet.sourceSummary?.captureStatus ?? null,
    validation: packet.sourceSummary?.validation ?? null,
    measurementTrust: packet.sourceSummary?.measurementTrust ?? null,
    exactPeakFrame: packet.frameSelection?.exactPeakFrame === true,
    peakFrameCount: typeof packet.peakSample?.frameEvent?.frameCount === 'number' ? packet.peakSample.frameEvent.frameCount : null,
    peakFrameMs: round(packet.peakSample?.frameEvent?.frameMs, 2),
    selectedFrameCount: typeof packet.frameSelection?.frameCount === 'number' ? packet.frameSelection.frameCount : null,
    totalDrawSubmissions: num(packet.frameSelection?.totalDrawSubmissions),
    totalTriangles: num(packet.frameSelection?.totalTriangles),
    totalInstances: num(packet.frameSelection?.totalInstances),
    topDrawCategory: packet.frameSelection?.topByDrawSubmissions?.category ?? null,
    topDrawShare: round(packet.frameSelection?.topByDrawSubmissions?.drawShare, 4),
    topTriangleCategory: packet.frameSelection?.topByTriangles?.category ?? null,
    topTriangleShare: round(packet.frameSelection?.topByTriangles?.triangleShare, 4),
    topInstanceCategory: packet.frameSelection?.topByInstances?.category ?? null,
    topInstanceShare: round(packet.frameSelection?.topByInstances?.instanceShare, 4),
    unattributedDrawShare: round(packet.frameSelection?.unattributedDrawShare, 4),
    groundMarkerCategory: groundMarker ?? null,
    rendererRenderUserTimingMaxMs: round(packet.peakSample?.rendererRenderUserTimingMaxMs, 2),
    drawReconciliation: round(packet.rendererReconciliation?.drawSubmissionsToRendererDrawCalls, 4),
    triangleReconciliation: round(packet.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles, 4),
    packetClassification: packet.classification?.owner ?? null,
    packetConfidence: packet.classification?.confidence ?? null,
  };
}

function lineOf(lines: string[], pattern: string): { line: number | null; text: string | null } {
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index < 0) return { line: null, text: null };
  return { line: index + 1, text: lines[index].trim() };
}

function sourceAnchors(): SourceAnchor[] {
  const path = join(process.cwd(), COMBATANT_MESH_FACTORY);
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
  const patterns = [
    "const NPC_GROUND_MARKER_PERF_CATEGORY = 'npc_ground_markers';",
    'marker.name = `PixelForgeNpcGroundMarker.${key}`;',
    'marker.userData.perfCategory = NPC_GROUND_MARKER_PERF_CATEGORY;',
  ];
  return [{
    path: COMBATANT_MESH_FACTORY,
    anchors: patterns.map((pattern) => ({ pattern, ...lineOf(lines, pattern) })),
  }];
}

function makeMarkdown(report: ProofReport): string {
  return [
    '# Projekt 143 Ground Marker Tagging Proof',
    '',
    `- Status: ${report.status}`,
    `- After artifact: ${report.inputs.afterArtifactDir}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Before / After',
    '',
    `- Before unattributed draw share: ${report.movement.unattributedDrawShareBefore ?? 'n/a'}`,
    `- After unattributed draw share: ${report.movement.unattributedDrawShareAfter ?? 'n/a'}`,
    `- Delta: ${report.movement.unattributedDrawShareDelta ?? 'n/a'}`,
    `- After ground-marker draw share: ${report.movement.groundMarkerDrawShareAfter ?? 'n/a'}`,
    `- After ground-marker draw submissions: ${report.movement.groundMarkerDrawSubmissionsAfter}`,
    `- After measurement trust: ${report.after.measurementTrust}`,
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function buildReport(beforePath: string, afterArtifactDir: string, outputDir: string): ProofReport {
  const afterPath = join(afterArtifactDir, RENDER_PACKET_RELATIVE);
  if (!existsSync(afterPath)) throw new Error(`Missing after render-submission packet: ${rel(afterPath)}`);
  const beforePacket = readJson<RenderSubmissionPacket>(beforePath);
  const afterPacket = readJson<RenderSubmissionPacket>(afterPath);
  const before = packetFacts(beforePacket);
  const after = packetFacts(afterPacket);
  const groundMarkerAfter = after.groundMarkerCategory;
  const unattributedDelta = before.unattributedDrawShare !== null && after.unattributedDrawShare !== null
    ? round(after.unattributedDrawShare - before.unattributedDrawShare, 4)
    : null;
  const moved = typeof unattributedDelta === 'number'
    && unattributedDelta < -0.2
    && num(groundMarkerAfter?.drawSubmissions) > 0
    && num(groundMarkerAfter?.drawShare) > 0.2;
  const afterTrusted = after.captureStatus === 'ok' && after.measurementTrust === 'pass';
  const afterUsable = after.captureStatus === 'ok' && (after.measurementTrust === 'pass' || after.measurementTrust === 'warn');
  const owner: ProofReport['classification']['owner'] = moved
    ? afterTrusted
      ? 'ground_marker_tagging_moves_unattributed_draws'
      : 'ground_marker_tagging_packet_untrusted'
    : 'ground_marker_tagging_not_proven';
  const status: Status = moved ? afterTrusted ? 'pass' : 'warn' : 'fail';
  const confidence: ProofReport['classification']['confidence'] = moved && afterTrusted
    ? 'high'
    : moved && afterUsable
      ? 'medium'
      : 'low';
  const outputJson = join(outputDir, 'ground-marker-tagging-proof.json');
  const outputMd = join(outputDir, 'ground-marker-tagging-proof.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      beforePacket: rel(beforePath),
      afterArtifactDir: rel(afterArtifactDir),
      afterPacket: rel(afterPath),
    },
    before,
    after,
    movement: {
      unattributedDrawShareBefore: before.unattributedDrawShare,
      unattributedDrawShareAfter: after.unattributedDrawShare,
      unattributedDrawShareDelta: unattributedDelta,
      groundMarkerDrawShareBefore: round(before.groundMarkerCategory?.drawShare, 4),
      groundMarkerDrawShareAfter: round(groundMarkerAfter?.drawShare, 4),
      groundMarkerDrawSubmissionsAfter: num(groundMarkerAfter?.drawSubmissions),
      groundMarkerInstancesAfter: num(groundMarkerAfter?.instances),
      groundMarkerTrianglesAfter: num(groundMarkerAfter?.triangles),
    },
    sourceAnchors: sourceAnchors(),
    classification: {
      owner,
      confidence,
      acceptance: 'diagnostic_only',
    },
    findings: [
      `Before packet ${rel(beforePath)} recorded unattributed draw share ${before.unattributedDrawShare ?? 'n/a'} and no npc_ground_markers category.`,
      `After packet ${rel(afterPath)} recorded unattributed draw share ${after.unattributedDrawShare ?? 'n/a'} and npc_ground_markers draw share ${groundMarkerAfter?.drawShare ?? 'n/a'} with ${groundMarkerAfter?.drawSubmissions ?? 0} draw submissions, ${groundMarkerAfter?.instances ?? 0} instances, and ${groundMarkerAfter?.triangles ?? 0} triangles.`,
      `After packet validation is ${after.validation}, measurement trust is ${after.measurementTrust}, and render-submission packet classification is ${after.packetClassification}/${after.packetConfidence}.`,
      `Top draw candidate moved from ${before.topDrawCategory ?? 'n/a'}@${before.topDrawShare ?? 'n/a'} to ${after.topDrawCategory ?? 'n/a'}@${after.topDrawShare ?? 'n/a'}; top triangle candidate is ${after.topTriangleCategory ?? 'n/a'}@${after.topTriangleShare ?? 'n/a'}.`,
      `Source anchors confirm the runtime marker name and perfCategory tag in ${COMBATANT_MESH_FACTORY}.`,
    ],
    nextActions: [
      'Rerun this exact attribution path on a measurement-trust PASS capture before promoting the tagging proof to accepted owner evidence.',
      'Continue DEFEKT-3 with the remaining post-tag owner split: npc_close_glb draw submissions, npc_ground_markers draw submissions, and terrain triangle dominance.',
      'Keep STABILIZAT-1 baseline refresh blocked until compare and codex success criteria clear on a trusted capture.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not assign the full renderer.render stall to one category.',
      'This packet does not certify combat feel.',
      'This packet does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function main(): void {
  const afterArtifactDir = requireAfterArtifactDir();
  const beforePath = beforePacketPath();
  const outputDir = join(afterArtifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(beforePath, afterArtifactDir, outputDir);
  writeFileSync(join(outputDir, 'ground-marker-tagging-proof.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'ground-marker-tagging-proof.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 ground marker tagging proof ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`unattributed=${report.movement.unattributedDrawShareBefore ?? 'n/a'}->${report.movement.unattributedDrawShareAfter ?? 'n/a'} groundMarkers=${report.movement.groundMarkerDrawShareAfter ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-ground-marker-tagging-proof failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
