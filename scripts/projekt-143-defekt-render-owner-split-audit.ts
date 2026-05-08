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
  status?: Status;
  sourceGitSha?: string;
  sourceSummary?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    runtimeSamples?: number;
    runtimeRenderSubmissionSamples?: number;
  };
  peakSample?: {
    rendererRenderUserTimingMaxMs?: number | null;
  } | null;
  frameSelection?: {
    exactPeakFrame?: boolean;
    frameCount?: number | null;
    totalDrawSubmissions?: number;
    totalTriangles?: number;
    totalInstances?: number;
    categories?: CategorySummary[];
    topByDrawSubmissions?: CategorySummary | null;
    topByTriangles?: CategorySummary | null;
    unattributedDrawShare?: number | null;
  };
  rendererReconciliation?: {
    drawSubmissionsToRendererDrawCalls?: number | null;
    selectedFrameTrianglesToRendererTriangles?: number | null;
    reconciliationStatus?: string;
  };
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
}

interface SparseOwnerAudit {
  status?: Status;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
  facts?: {
    targetMeasurementTrust?: string | null;
    targetValidation?: string | null;
    rawProbeP95Ms?: number | null;
    rawProbeOver75Rate?: number | null;
    rawProbeOver150Rate?: number | null;
    renderSubmissionSamples?: number | null;
    renderSubmissionBytes?: number | null;
    groundMarkerDrawShareAfter?: number | null;
    groundMarkerDrawSubmissionsAfter?: number | null;
    topTriangleCategoryAfter?: string | null;
  };
}

interface OwnerFacts {
  totalDrawSubmissions: number | null;
  totalTriangles: number | null;
  exactPeakFrame: boolean;
  rendererRenderUserTimingMaxMs: number | null;
  topDrawCategory: string | null;
  topDrawShare: number | null;
  topTriangleCategory: string | null;
  topTriangleShare: number | null;
  drawReconciliation: number | null;
  triangleReconciliation: number | null;
  categories: {
    npcCloseGlb: CategoryFacts;
    npcGroundMarkers: CategoryFacts;
    npcImposters: CategoryFacts;
    terrain: CategoryFacts;
    unattributed: CategoryFacts;
  };
}

interface CategoryFacts {
  drawSubmissions: number;
  drawShare: number | null;
  triangles: number;
  triangleShare: number | null;
  instances: number;
}

interface Check {
  id: string;
  status: Status;
  value: string | number | boolean | null;
  threshold: string;
  message: string;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-defekt-render-owner-split-audit';
  status: Status;
  inputs: {
    acceptedOwnerReference: string;
    postTagSubmissionPacket: string;
    sparseOwnerAcceptance: string;
  };
  classification: {
    owner:
      | 'post_tag_renderer_owner_split_divergent'
      | 'post_tag_renderer_owner_split_blocked';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only' | 'blocked';
  };
  checks: Check[];
  reference: OwnerFacts;
  postTag: OwnerFacts;
  deltas: {
    npcCloseGlbDrawShare: number | null;
    npcCloseGlbDrawSubmissions: number | null;
    unattributedDrawShare: number | null;
    terrainTriangleShare: number | null;
    groundMarkerDrawShare: number | null;
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-defekt-render-owner-split-audit';
const DEFAULT_REFERENCE = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T16-23-11-889Z',
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);
const DEFAULT_POST_TAG = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T17-28-02-506Z',
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);
const DEFAULT_SPARSE_ACCEPTANCE = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T22-29-58-460Z',
  'projekt-143-sparse-owner-acceptance-audit',
  'sparse-owner-acceptance-audit.json',
);

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function outputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return resolve(raw);
  return join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function resolveExisting(raw: string, label: string): string {
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing ${label}: ${raw}`);
  return resolved;
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

function category(packet: RenderSubmissionPacket, name: string): CategoryFacts {
  const found = packet.frameSelection?.categories?.find((entry) => entry.category === name);
  return {
    drawSubmissions: num(found?.drawSubmissions),
    drawShare: round(found?.drawShare),
    triangles: num(found?.triangles),
    triangleShare: round(found?.triangleShare),
    instances: num(found?.instances),
  };
}

function ownerFacts(packet: RenderSubmissionPacket): OwnerFacts {
  return {
    totalDrawSubmissions: round(packet.frameSelection?.totalDrawSubmissions, 0),
    totalTriangles: round(packet.frameSelection?.totalTriangles, 0),
    exactPeakFrame: packet.frameSelection?.exactPeakFrame === true,
    rendererRenderUserTimingMaxMs: round(packet.peakSample?.rendererRenderUserTimingMaxMs, 2),
    topDrawCategory: packet.frameSelection?.topByDrawSubmissions?.category ?? null,
    topDrawShare: round(packet.frameSelection?.topByDrawSubmissions?.drawShare),
    topTriangleCategory: packet.frameSelection?.topByTriangles?.category ?? null,
    topTriangleShare: round(packet.frameSelection?.topByTriangles?.triangleShare),
    drawReconciliation: round(packet.rendererReconciliation?.drawSubmissionsToRendererDrawCalls),
    triangleReconciliation: round(packet.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles),
    categories: {
      npcCloseGlb: category(packet, 'npc_close_glb'),
      npcGroundMarkers: category(packet, 'npc_ground_markers'),
      npcImposters: category(packet, 'npc_imposters'),
      terrain: category(packet, 'terrain'),
      unattributed: category(packet, 'unattributed'),
    },
  };
}

function delta(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return round(after - before);
}

function check(
  id: string,
  passed: boolean,
  value: string | number | boolean | null,
  threshold: string,
  message: string,
  warn = false,
): Check {
  return { id, status: passed ? 'pass' : warn ? 'warn' : 'fail', value, threshold, message };
}

function makeMarkdown(report: AuditReport): string {
  const lines = [
    '# DEFEKT-3 Render Owner Split Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification.owner}`,
    '',
    '## Evidence',
    '',
    `Accepted reference: ${report.inputs.acceptedOwnerReference}`,
    `Post-tag packet: ${report.inputs.postTagSubmissionPacket}`,
    `Sparse-owner acceptance: ${report.inputs.sparseOwnerAcceptance}`,
    '',
    '## Split',
    '',
    `Reference top draw: ${report.reference.topDrawCategory} (${report.reference.topDrawShare})`,
    `Reference top triangles: ${report.reference.topTriangleCategory} (${report.reference.topTriangleShare})`,
    `Post-tag top draw: ${report.postTag.topDrawCategory} (${report.postTag.topDrawShare})`,
    `Post-tag top triangles: ${report.postTag.topTriangleCategory} (${report.postTag.topTriangleShare})`,
    `Post-tag npc_close_glb draw share: ${report.postTag.categories.npcCloseGlb.drawShare}`,
    `Post-tag npc_ground_markers draw share: ${report.postTag.categories.npcGroundMarkers.drawShare}`,
    `Post-tag terrain triangle share: ${report.postTag.categories.terrain.triangleShare}`,
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
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const referencePath = resolveExisting(argValue('--reference') ?? DEFAULT_REFERENCE, 'accepted owner reference');
  const postTagPath = resolveExisting(argValue('--post-tag') ?? DEFAULT_POST_TAG, 'post-tag submission packet');
  const sparsePath = resolveExisting(argValue('--sparse-owner') ?? DEFAULT_SPARSE_ACCEPTANCE, 'sparse owner acceptance');
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const referencePacket = readJson<RenderSubmissionPacket>(referencePath);
  const postTagPacket = readJson<RenderSubmissionPacket>(postTagPath);
  const sparsePacket = readJson<SparseOwnerAudit>(sparsePath);
  const reference = ownerFacts(referencePacket);
  const postTag = ownerFacts(postTagPacket);
  const deltas = {
    npcCloseGlbDrawShare: delta(postTag.categories.npcCloseGlb.drawShare, reference.categories.npcCloseGlb.drawShare),
    npcCloseGlbDrawSubmissions: delta(postTag.categories.npcCloseGlb.drawSubmissions, reference.categories.npcCloseGlb.drawSubmissions),
    unattributedDrawShare: delta(postTag.categories.unattributed.drawShare, reference.categories.unattributed.drawShare),
    terrainTriangleShare: delta(postTag.categories.terrain.triangleShare, reference.categories.terrain.triangleShare),
    groundMarkerDrawShare: delta(postTag.categories.npcGroundMarkers.drawShare, reference.categories.npcGroundMarkers.drawShare),
  };

  const checks: Check[] = [
    check(
      'reference_measurement_trust',
      referencePacket.sourceSummary?.measurementTrust === 'pass',
      referencePacket.sourceSummary?.measurementTrust ?? null,
      'accepted owner reference measurementTrust=pass',
      'The controlling production-shaped owner packet must remain measurement trusted.',
    ),
    check(
      'sparse_owner_accepted',
      sparsePacket.status === 'pass' && sparsePacket.classification?.acceptance === 'owner_review_only',
      `${sparsePacket.status ?? 'unknown'}/${sparsePacket.classification?.acceptance ?? 'unknown'}`,
      'sparse-owner audit pass and owner_review_only',
      'The post-tag packet must be accepted by the sparse owner-review rule before the split is used.',
    ),
    check(
      'post_tag_exact_peak',
      postTag.exactPeakFrame,
      postTag.exactPeakFrame,
      'post-tag submission frame exactPeakFrame=true',
      'The owner split must be based on the exact peak frame, not a nearby frame.',
    ),
    check(
      'ground_marker_explicit',
      postTag.categories.npcGroundMarkers.drawSubmissions > 0 && postTag.categories.npcGroundMarkers.drawShare !== null,
      postTag.categories.npcGroundMarkers.drawSubmissions,
      'npc_ground_markers draw submissions present',
      'The former unattributed ground-marker class must be visible as its own category.',
    ),
    check(
      'unattributed_reduced',
      (postTag.categories.unattributed.drawShare ?? 1) <= 0.05,
      postTag.categories.unattributed.drawShare,
      'post-tag unattributed draw share <= 0.05',
      'The old attribution gap must stay small after tagging.',
    ),
    check(
      'npc_close_glb_reduced',
      (deltas.npcCloseGlbDrawShare ?? 1) < 0 && postTag.categories.npcCloseGlb.drawSubmissions < reference.categories.npcCloseGlb.drawSubmissions,
      `${reference.categories.npcCloseGlb.drawSubmissions}->${postTag.categories.npcCloseGlb.drawSubmissions}`,
      'npc_close_glb draw submissions and draw share below reference',
      'The split must distinguish residual close-GLB pressure from the pre-tag close-actor packet.',
    ),
    check(
      'terrain_triangle_dominance',
      postTag.topTriangleCategory === 'terrain' && (postTag.categories.terrain.triangleShare ?? 0) >= 0.5,
      postTag.categories.terrain.triangleShare,
      'terrain is top triangle category with share >= 0.5',
      'The packet must preserve terrain triangle dominance as a separate owner axis.',
    ),
    check(
      'draw_triangle_divergence',
      postTag.topDrawCategory !== null
        && postTag.topTriangleCategory !== null
        && postTag.topDrawCategory !== postTag.topTriangleCategory,
      `${postTag.topDrawCategory ?? 'n/a'} vs ${postTag.topTriangleCategory ?? 'n/a'}`,
      'top draw category differs from top triangle category',
      'DEFEKT-3 must stay split when draw-submission and triangle owners diverge.',
    ),
    check(
      'partial_renderer_reconciliation',
      (postTag.drawReconciliation ?? 1) < 0.8 || (postTag.triangleReconciliation ?? 1) < 0.8,
      `draw=${postTag.drawReconciliation ?? 'n/a'} triangles=${postTag.triangleReconciliation ?? 'n/a'}`,
      'draw or triangle reconciliation < 0.8',
      'Partial reconciliation must block single-category runtime-fix claims.',
      true,
    ),
  ];

  const failed = checks.some((entry) => entry.status === 'fail');
  const reportPath = join(outDir, 'render-owner-split-audit.json');
  const markdownPath = join(outDir, 'render-owner-split-audit.md');
  const report: AuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: failed ? 'fail' : 'warn',
    inputs: {
      acceptedOwnerReference: rel(referencePath),
      postTagSubmissionPacket: rel(postTagPath),
      sparseOwnerAcceptance: rel(sparsePath),
    },
    classification: {
      owner: failed ? 'post_tag_renderer_owner_split_blocked' : 'post_tag_renderer_owner_split_divergent',
      confidence: failed ? 'low' : 'high',
      acceptance: failed ? 'blocked' : 'owner_review_only',
    },
    checks,
    reference,
    postTag,
    deltas,
    findings: [
      `Reference exact-frame packet records ${reference.totalDrawSubmissions} draw submissions, top draw ${reference.topDrawCategory} at ${reference.topDrawShare}, and top triangles ${reference.topTriangleCategory} at ${reference.topTriangleShare}.`,
      `Post-tag exact-frame packet records ${postTag.totalDrawSubmissions} draw submissions, top draw ${postTag.topDrawCategory} at ${postTag.topDrawShare}, and top triangles ${postTag.topTriangleCategory} at ${postTag.topTriangleShare}.`,
      `npc_close_glb draw submissions move ${reference.categories.npcCloseGlb.drawSubmissions}->${postTag.categories.npcCloseGlb.drawSubmissions}; npc_ground_markers is now explicit at ${postTag.categories.npcGroundMarkers.drawSubmissions} submissions and ${postTag.categories.npcGroundMarkers.drawShare} draw share.`,
      `Terrain remains the triangle candidate at ${postTag.categories.terrain.triangleShare} share, while renderer reconciliation remains partial at draw=${postTag.drawReconciliation} and triangles=${postTag.triangleReconciliation}.`,
      'The post-tag owner path is split, not singular: draw-submission pressure, terrain triangle dominance, and partial reconciliation must be handled as separate evidence questions.',
    ],
    nextActions: [
      'Do not spend the next DEFEKT-3 packet on ground-marker attribution; that movement is accepted for owner review.',
      'Choose one explicit next isolation axis: reduce or batch ground-marker/imposter draw submissions, test terrain triangle/render-cost contribution, or improve renderer-submission reconciliation.',
      'Keep the 16:23 measurement-PASS packet as the controlling production-shaped reference until a new measurement-trusted standard capture supersedes it.',
      'Keep STABILIZAT-1 baseline refresh blocked until standard or separately accepted captures clear compare gates.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not assign the full renderer.render stall to one owner.',
      'This packet does not certify combat or visual feel.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not replace live production verification.',
    ],
    files: {
      summary: rel(reportPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 DEFEKT-3 render owner split ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`postTagDraw=${postTag.topDrawCategory}@${postTag.topDrawShare} postTagTriangles=${postTag.topTriangleCategory}@${postTag.topTriangleShare}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
