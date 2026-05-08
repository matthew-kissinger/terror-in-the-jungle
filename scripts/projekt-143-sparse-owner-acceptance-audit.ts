#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface MeasurementInspection {
  target?: {
    artifactDir?: string;
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    runtimeSamples?: number;
    renderSubmissionSamples?: number;
    renderSubmissionBytes?: number;
    avgFrameMs?: number | null;
    p99FrameMs?: number | null;
    maxFrameMs?: number | null;
    probe?: {
      rawPresent?: boolean;
      count?: number;
      p95Ms?: number | null;
      maxMs?: number | null;
      avgMs?: number | null;
      over75Count?: number | null;
      over150Count?: number | null;
      avgWithoutMaxMs?: number | null;
    };
  };
  references?: Array<{
    artifactDir?: string;
    measurementTrust?: string | null;
    probe?: {
      p95Ms?: number | null;
      avgWithoutMaxMs?: number | null;
    };
  }>;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
}

interface GroundMarkerProof {
  after?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    exactPeakFrame?: boolean;
    peakFrameCount?: number | null;
    selectedFrameCount?: number | null;
    topDrawCategory?: string | null;
    topDrawShare?: number | null;
    topTriangleCategory?: string | null;
    topTriangleShare?: number | null;
    rendererRenderUserTimingMaxMs?: number | null;
    drawReconciliation?: number | null;
    triangleReconciliation?: number | null;
    packetClassification?: string | null;
    packetConfidence?: string | null;
  };
  movement?: {
    unattributedDrawShareBefore?: number | null;
    unattributedDrawShareAfter?: number | null;
    unattributedDrawShareDelta?: number | null;
    groundMarkerDrawShareAfter?: number | null;
    groundMarkerDrawSubmissionsAfter?: number;
    groundMarkerInstancesAfter?: number;
    groundMarkerTrianglesAfter?: number;
  };
  sourceAnchors?: Array<{
    path?: string;
    anchors?: Array<{ line?: number | null; text?: string | null }>;
  }>;
  classification?: {
    owner?: string;
    confidence?: string;
    acceptance?: string;
  };
}

interface AcceptanceCriterion {
  id: string;
  status: Status;
  value: string | number | boolean | null;
  threshold: string;
  message: string;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-sparse-owner-acceptance-audit';
  status: Status;
  inputs: {
    measurementInspection: string;
    groundMarkerProof: string;
    acceptedOwnerReference: string;
  };
  rule: {
    name: 'sparse_owner_review_only_acceptance_v1';
    scope: 'owner_review_only';
    criteria: AcceptanceCriterion[];
  };
  classification: {
    owner:
      | 'sparse_owner_review_accepted'
      | 'sparse_owner_review_rejected'
      | 'sparse_owner_review_insufficient_inputs';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'owner_review_only' | 'blocked';
  };
  facts: {
    targetArtifact: string | null;
    targetMeasurementTrust: string | null;
    targetValidation: string | null;
    rawProbeCount: number | null;
    rawProbeP95Ms: number | null;
    rawProbeMaxMs: number | null;
    rawProbeOver75Rate: number | null;
    rawProbeOver150Rate: number | null;
    rawProbeAvgWithoutMaxDeltaVsReferenceMs: number | null;
    renderSubmissionSamples: number | null;
    renderSubmissionBytes: number | null;
    unattributedDrawShareDelta: number | null;
    groundMarkerDrawShareAfter: number | null;
    groundMarkerDrawSubmissionsAfter: number | null;
    topDrawCategoryAfter: string | null;
    topTriangleCategoryAfter: string | null;
    acceptedReferenceMeasurementTrust: string | null;
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-sparse-owner-acceptance-audit';
const DEFAULT_MEASUREMENT = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T17-28-02-506Z',
  'projekt-143-measurement-path-inspection',
  'measurement-path-inspection.json',
);
const DEFAULT_GROUND_MARKER = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T17-28-02-506Z',
  'projekt-143-ground-marker-tagging-proof',
  'ground-marker-tagging-proof.json',
);
const DEFAULT_ACCEPTED_REFERENCE = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T16-23-11-889Z',
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);

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

function resolveExisting(raw: string, label: string): string {
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing ${label}: ${raw}`);
  return resolved;
}

function outputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return resolve(raw);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(process.cwd(), 'artifacts', 'perf', stamp, OUTPUT_NAME);
}

function rate(count: number | null | undefined, total: number | null | undefined): number | null {
  if (typeof count !== 'number' || typeof total !== 'number' || total <= 0) return null;
  return round(count / total, 4);
}

function criterion(
  id: string,
  passed: boolean,
  value: string | number | boolean | null,
  threshold: string,
  message: string,
): AcceptanceCriterion {
  return { id, status: passed ? 'pass' : 'fail', value, threshold, message };
}

function allLinesAnchored(proof: GroundMarkerProof): boolean {
  const anchors = proof.sourceAnchors?.flatMap((entry) => entry.anchors ?? []) ?? [];
  return anchors.length > 0 && anchors.every((anchor) => typeof anchor.line === 'number' && Boolean(anchor.text));
}

function acceptedReferenceTrust(measurement: MeasurementInspection): string | null {
  return measurement.references?.[0]?.measurementTrust ?? null;
}

function buildCriteria(measurement: MeasurementInspection, proof: GroundMarkerProof): AcceptanceCriterion[] {
  const target = measurement.target;
  const probe = target?.probe;
  const reference = measurement.references?.[0];
  const rawCount = probe?.count ?? null;
  const over75Rate = rate(probe?.over75Count, rawCount);
  const over150Rate = rate(probe?.over150Count, rawCount);
  const avgWithoutMaxDelta = typeof probe?.avgWithoutMaxMs === 'number'
    && typeof reference?.probe?.avgWithoutMaxMs === 'number'
    ? round(probe.avgWithoutMaxMs - reference.probe.avgWithoutMaxMs)
    : null;
  const p95Delta = typeof probe?.p95Ms === 'number' && typeof reference?.probe?.p95Ms === 'number'
    ? round(probe.p95Ms - reference.probe.p95Ms)
    : null;

  return [
    criterion(
      'accepted_reference_exists',
      acceptedReferenceTrust(measurement) === 'pass',
      acceptedReferenceTrust(measurement),
      'accepted owner reference measurementTrust=pass',
      'Sparse owner evidence requires a measurement-PASS reference packet to remain the controlling production-shaped owner evidence.',
    ),
    criterion(
      'target_capture_usable',
      target?.captureStatus === 'ok' && target?.validation !== 'fail' && target?.measurementTrust !== 'fail',
      `${target?.captureStatus ?? 'unknown'}/${target?.validation ?? 'unknown'}/${target?.measurementTrust ?? 'unknown'}`,
      'capture ok, validation not fail, measurement trust not fail',
      'Sparse owner review may tolerate formal measurement WARN only when the capture remains otherwise usable.',
    ),
    criterion(
      'raw_probe_series_present',
      probe?.rawPresent === true && num(rawCount) >= 50,
      rawCount ?? null,
      'raw probe samples present and count >= 50',
      'Sparse owner review requires raw probe persistence; aggregate-only measurement trust is insufficient.',
    ),
    criterion(
      'raw_probe_tail_bounded',
      typeof probe?.p95Ms === 'number'
        && probe.p95Ms <= 75
        && typeof over75Rate === 'number'
        && over75Rate <= 0.05
        && typeof over150Rate === 'number'
        && over150Rate <= 0.05,
      `p95=${probe?.p95Ms ?? 'n/a'} over75=${over75Rate ?? 'n/a'} over150=${over150Rate ?? 'n/a'}`,
      'p95 <= 75ms, over75 <= 5%, over150 <= 5%',
      'Sparse owner review rejects packets where probe outliers are broad enough to contaminate ownership interpretation.',
    ),
    criterion(
      'raw_probe_near_reference',
      typeof avgWithoutMaxDelta === 'number'
        && avgWithoutMaxDelta <= 5
        && typeof p95Delta === 'number'
        && p95Delta <= 5,
      `avgWithoutMaxDelta=${avgWithoutMaxDelta ?? 'n/a'} p95Delta=${p95Delta ?? 'n/a'}`,
      'avg-without-max delta <= 5ms and p95 delta <= 5ms versus accepted reference',
      'Sparse owner review requires the non-outlier probe body to stay near the accepted reference path.',
    ),
    criterion(
      'sparse_render_submission_drain',
      num(target?.renderSubmissionSamples) <= 3 && num(target?.renderSubmissionBytes) <= 5_000_000,
      `${target?.renderSubmissionSamples ?? 'n/a'} samples / ${target?.renderSubmissionBytes ?? 'n/a'} bytes`,
      'render-submission samples <= 3 and bytes <= 5,000,000',
      'Sparse owner review permits low-frequency submission drains only; per-sample drains remain rejected.',
    ),
    criterion(
      'ground_marker_movement_proven',
      typeof proof.movement?.unattributedDrawShareDelta === 'number'
        && proof.movement.unattributedDrawShareDelta <= -0.2
        && num(proof.movement?.groundMarkerDrawShareAfter) >= 0.2
        && num(proof.movement?.groundMarkerDrawSubmissionsAfter) > 0,
      `delta=${proof.movement?.unattributedDrawShareDelta ?? 'n/a'} ground=${proof.movement?.groundMarkerDrawShareAfter ?? 'n/a'}`,
      'unattributed draw share delta <= -0.2 and ground-marker draw share >= 0.2',
      'Sparse owner review requires a material attribution movement, not a cosmetic category label.',
    ),
    criterion(
      'exact_peak_source_anchored',
      proof.after?.exactPeakFrame === true && allLinesAnchored(proof),
      `exact=${proof.after?.exactPeakFrame === true} anchored=${allLinesAnchored(proof)}`,
      'exact peak frame and source anchors present',
      'Sparse owner review requires both runtime frame alignment and source anchors for the category tag.',
    ),
  ];
}

function buildReport(
  measurementPath: string,
  groundMarkerPath: string,
  acceptedReferencePath: string,
  outputPath: string,
): AuditReport {
  const measurement = readJson<MeasurementInspection>(measurementPath);
  const proof = readJson<GroundMarkerProof>(groundMarkerPath);
  const criteria = buildCriteria(measurement, proof);
  const failed = criteria.filter((entry) => entry.status === 'fail');
  const accepted = failed.length === 0;
  const target = measurement.target;
  const probe = target?.probe;
  const reference = measurement.references?.[0];
  const avgWithoutMaxDelta = typeof probe?.avgWithoutMaxMs === 'number'
    && typeof reference?.probe?.avgWithoutMaxMs === 'number'
    ? round(probe.avgWithoutMaxMs - reference.probe.avgWithoutMaxMs)
    : null;
  const outputJson = join(outputPath, 'sparse-owner-acceptance-audit.json');
  const outputMd = join(outputPath, 'sparse-owner-acceptance-audit.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: accepted ? 'pass' : 'fail',
    inputs: {
      measurementInspection: rel(measurementPath),
      groundMarkerProof: rel(groundMarkerPath),
      acceptedOwnerReference: rel(acceptedReferencePath),
    },
    rule: {
      name: 'sparse_owner_review_only_acceptance_v1',
      scope: 'owner_review_only',
      criteria,
    },
    classification: {
      owner: accepted ? 'sparse_owner_review_accepted' : failed.length > 0 ? 'sparse_owner_review_rejected' : 'sparse_owner_review_insufficient_inputs',
      confidence: accepted ? 'medium' : failed.length > 2 ? 'low' : 'medium',
      acceptance: accepted ? 'owner_review_only' : 'blocked',
    },
    facts: {
      targetArtifact: target?.artifactDir ?? null,
      targetMeasurementTrust: target?.measurementTrust ?? null,
      targetValidation: target?.validation ?? null,
      rawProbeCount: probe?.count ?? null,
      rawProbeP95Ms: probe?.p95Ms ?? null,
      rawProbeMaxMs: probe?.maxMs ?? null,
      rawProbeOver75Rate: rate(probe?.over75Count, probe?.count),
      rawProbeOver150Rate: rate(probe?.over150Count, probe?.count),
      rawProbeAvgWithoutMaxDeltaVsReferenceMs: avgWithoutMaxDelta,
      renderSubmissionSamples: target?.renderSubmissionSamples ?? null,
      renderSubmissionBytes: target?.renderSubmissionBytes ?? null,
      unattributedDrawShareDelta: proof.movement?.unattributedDrawShareDelta ?? null,
      groundMarkerDrawShareAfter: proof.movement?.groundMarkerDrawShareAfter ?? null,
      groundMarkerDrawSubmissionsAfter: proof.movement?.groundMarkerDrawSubmissionsAfter ?? null,
      topDrawCategoryAfter: proof.after?.topDrawCategory ?? null,
      topTriangleCategoryAfter: proof.after?.topTriangleCategory ?? null,
      acceptedReferenceMeasurementTrust: acceptedReferenceTrust(measurement),
    },
    findings: [
      `Rule sparse_owner_review_only_acceptance_v1 evaluates ${criteria.length} criteria with ${failed.length} failure(s).`,
      `Target ${target?.artifactDir ?? 'unknown'} records validation ${target?.validation ?? 'unknown'} and measurement trust ${target?.measurementTrust ?? 'unknown'}.`,
      `Raw probe body records count ${probe?.count ?? 'n/a'}, p95 ${probe?.p95Ms ?? 'n/a'}ms, max ${probe?.maxMs ?? 'n/a'}ms, over75 rate ${rate(probe?.over75Count, probe?.count) ?? 'n/a'}, and avg-without-max delta ${avgWithoutMaxDelta ?? 'n/a'}ms versus the accepted reference.`,
      `Sparse drain records ${target?.renderSubmissionSamples ?? 'n/a'} render-submission samples and ${target?.renderSubmissionBytes ?? 'n/a'} bytes.`,
      `Ground-marker proof moves unattributed draw share by ${proof.movement?.unattributedDrawShareDelta ?? 'n/a'} and records ${proof.movement?.groundMarkerDrawShareAfter ?? 'n/a'} ground-marker draw share after tagging.`,
      accepted
        ? 'The packet is accepted as owner-review evidence only; it remains barred from baseline refresh and runtime-fix claims.'
        : `The packet is rejected for owner-review promotion by criteria: ${failed.map((entry) => entry.id).join(', ')}.`,
    ],
    nextActions: accepted
      ? [
        'Treat the 17:28 post-tag packet as accepted sparse owner-review evidence for ground-marker attribution movement.',
        'Keep the 16:23 measurement-PASS render-submission packet as the controlling production-shaped owner reference.',
        'Continue DEFEKT-3 on the remaining owner split: npc_close_glb draw submissions, npc_ground_markers draw submissions, and terrain triangle dominance.',
        'Keep STABILIZAT-1 baseline refresh blocked until a standard or separately accepted performance capture clears compare gates.',
      ]
      : [
        'Do not promote the sparse post-tag packet.',
        'Remove the failed sparse-owner criteria or rerun a cleaner capture before the next DEFEKT-3 owner decision.',
        'Keep STABILIZAT-1 baseline refresh blocked.',
      ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime performance fix.',
      'This packet does not certify combat feel.',
      'This packet does not authorize a perf baseline refresh.',
      'This packet does not replace a standard measurement-trust PASS capture for regression comparison.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: AuditReport): string {
  const criteriaRows = report.rule.criteria.map((entry) =>
    `| ${entry.id} | ${entry.status} | ${entry.value ?? 'n/a'} | ${entry.threshold} |`);
  return [
    '# Projekt 143 Sparse Owner Acceptance Audit',
    '',
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    `- Acceptance: ${report.classification.acceptance}`,
    '',
    '## Criteria',
    '',
    '| Criterion | Status | Value | Threshold |',
    '|---|---|---|---|',
    ...criteriaRows,
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

function main(): void {
  const measurementPath = resolveExisting(argValue('--measurement') ?? DEFAULT_MEASUREMENT, 'measurement inspection');
  const groundMarkerPath = resolveExisting(argValue('--ground-marker') ?? DEFAULT_GROUND_MARKER, 'ground-marker proof');
  const acceptedReferencePath = resolveExisting(argValue('--accepted-reference') ?? DEFAULT_ACCEPTED_REFERENCE, 'accepted owner reference');
  const out = outputDir();
  mkdirSync(out, { recursive: true });
  const report = buildReport(measurementPath, groundMarkerPath, acceptedReferencePath, out);
  writeFileSync(join(out, 'sparse-owner-acceptance-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(out, 'sparse-owner-acceptance-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 sparse owner acceptance audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`criteria=${report.rule.criteria.filter((entry) => entry.status === 'pass').length} pass/${report.rule.criteria.length}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-sparse-owner-acceptance-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
