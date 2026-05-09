#!/usr/bin/env tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface MovementTrackPoint {
  x?: number;
  z?: number;
  tMs?: number;
  intent?: string;
}

interface MovementTrack {
  id?: string;
  subject?: string;
  lodLevel?: string;
  points?: MovementTrackPoint[];
}

interface MovementArtifacts {
  tracks?: MovementTrack[];
}

export interface NpcSpeedSegment {
  id: string;
  lodLevel: string | null;
  segmentIndex: number;
  firstTrackedSegment: boolean;
  fromTMs: number;
  toTMs: number;
  dtSeconds: number;
  distanceMeters: number;
  speedMps: number;
  intent: string | null;
}

interface NpcSpeedDiagnosticReport {
  createdAt: string;
  mode: 'projekt-143-npc-speed-diagnostic';
  sourceArtifactDir: string;
  sourceMovementArtifacts: string;
  status: 'pass' | 'warn' | 'fail';
  thresholds: {
    reviewSpeedMps: number;
    hardSpeedMps: number;
    minSegmentSeconds: number;
  };
  summary: {
    npcTrackCount: number;
    npcSegmentCount: number;
    analyzedNonInitialSegmentCount: number;
    ignoredFirstSegmentCount: number;
    ignoredShortDtSegmentCount: number;
    initialReviewSpikeCount: number;
    initialHardSpikeCount: number;
    nonInitialReviewSpikeCount: number;
    nonInitialHardSpikeCount: number;
    maxInitialSpeedMps: number | null;
    maxNonInitialSpeedMps: number | null;
  };
  topInitialSegments: NpcSpeedSegment[];
  topNonInitialSegments: NpcSpeedSegment[];
  findings: string[];
  nextProbeQuestions: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const DEFAULT_REVIEW_SPEED_MPS = 12;
const DEFAULT_HARD_SPEED_MPS = 20;
const DEFAULT_MIN_SEGMENT_SECONDS = 0.25;
const MAX_SEGMENTS_IN_REPORT = 12;

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function parseNumberArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function walkFiles(root: string, predicate: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, out);
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

function latestMovementArtifacts(root: string = ARTIFACT_ROOT): string | null {
  const files = walkFiles(root, (path) => basename(path) === 'movement-artifacts.json');
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

export function movementArtifactsPath(artifactArg: string | null): string {
  if (artifactArg) {
    const resolved = resolve(artifactArg);
    const candidate = basename(resolved) === 'movement-artifacts.json'
      ? resolved
      : join(resolved, 'movement-artifacts.json');
    if (existsSync(candidate)) return candidate;
    throw new Error(`movement-artifacts.json not found for ${artifactArg}`);
  }
  const latest = latestMovementArtifacts();
  if (!latest) throw new Error(`No movement-artifacts.json found under ${ARTIFACT_ROOT}`);
  return latest;
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function segmentFromPoints(track: MovementTrack, previous: MovementTrackPoint, current: MovementTrackPoint, index: number): NpcSpeedSegment | null {
  const ax = finiteNumber(previous.x);
  const az = finiteNumber(previous.z);
  const bx = finiteNumber(current.x);
  const bz = finiteNumber(current.z);
  const fromTMs = finiteNumber(previous.tMs);
  const toTMs = finiteNumber(current.tMs);
  if (ax === null || az === null || bx === null || bz === null || fromTMs === null || toTMs === null) return null;
  const dtSeconds = (toTMs - fromTMs) / 1000;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return null;
  const distanceMeters = Math.hypot(bx - ax, bz - az);
  const speedMps = distanceMeters / dtSeconds;
  return {
    id: String(track.id ?? 'unknown'),
    lodLevel: track.lodLevel ? String(track.lodLevel) : null,
    segmentIndex: index,
    firstTrackedSegment: index === 1,
    fromTMs: Math.round(fromTMs),
    toTMs: Math.round(toTMs),
    dtSeconds: round(dtSeconds),
    distanceMeters: round(distanceMeters),
    speedMps: round(speedMps),
    intent: current.intent ?? previous.intent ?? null,
  };
}

export function computeNpcSpeedSegments(artifacts: MovementArtifacts): NpcSpeedSegment[] {
  const out: NpcSpeedSegment[] = [];
  for (const track of artifacts.tracks ?? []) {
    if (track.subject !== 'npc') continue;
    const points = track.points ?? [];
    for (let i = 1; i < points.length; i++) {
      const segment = segmentFromPoints(track, points[i - 1], points[i], i);
      if (segment) out.push(segment);
    }
  }
  return out;
}

function topSegments(segments: NpcSpeedSegment[]): NpcSpeedSegment[] {
  return segments
    .slice()
    .sort((a, b) => b.speedMps - a.speedMps)
    .slice(0, MAX_SEGMENTS_IN_REPORT);
}

function maxSpeed(segments: NpcSpeedSegment[]): number | null {
  let max: number | null = null;
  for (const segment of segments) {
    if (max === null || segment.speedMps > max) max = segment.speedMps;
  }
  return max;
}

export function buildReport(
  movementPath: string,
  options: {
    reviewSpeedMps?: number;
    hardSpeedMps?: number;
    minSegmentSeconds?: number;
  } = {},
): NpcSpeedDiagnosticReport {
  const artifacts = readJson<MovementArtifacts>(movementPath);
  const reviewSpeedMps = options.reviewSpeedMps ?? DEFAULT_REVIEW_SPEED_MPS;
  const hardSpeedMps = options.hardSpeedMps ?? DEFAULT_HARD_SPEED_MPS;
  const minSegmentSeconds = options.minSegmentSeconds ?? DEFAULT_MIN_SEGMENT_SECONDS;
  const npcTracks = (artifacts.tracks ?? []).filter((track) => track.subject === 'npc');
  const segments = computeNpcSpeedSegments(artifacts);
  const firstSegments = segments.filter((segment) => segment.firstTrackedSegment);
  const shortDtSegments = segments.filter((segment) => !segment.firstTrackedSegment && segment.dtSeconds < minSegmentSeconds);
  const nonInitialAnalyzed = segments.filter((segment) => !segment.firstTrackedSegment && segment.dtSeconds >= minSegmentSeconds);
  const initialReviewSpikes = firstSegments.filter((segment) => segment.speedMps > reviewSpeedMps);
  const initialHardSpikes = firstSegments.filter((segment) => segment.speedMps > hardSpeedMps);
  const nonInitialReviewSpikes = nonInitialAnalyzed.filter((segment) => segment.speedMps > reviewSpeedMps);
  const nonInitialHardSpikes = nonInitialAnalyzed.filter((segment) => segment.speedMps > hardSpeedMps);

  const findings: string[] = [];
  if (npcTracks.length === 0) {
    findings.push('No NPC movement artifact tracks are present.');
  }
  if (nonInitialHardSpikes.length > 0) {
    findings.push(`Detected ${nonInitialHardSpikes.length} non-initial NPC movement segments above hard speed envelope ${hardSpeedMps}m/s.`);
  } else if (nonInitialReviewSpikes.length > 0) {
    findings.push(`Detected ${nonInitialReviewSpikes.length} non-initial NPC movement segments above review speed envelope ${reviewSpeedMps}m/s.`);
  }
  if (initialHardSpikes.length > 0 && nonInitialHardSpikes.length === 0) {
    findings.push(`Ignored ${initialHardSpikes.length} first tracked NPC segments above ${hardSpeedMps}m/s as likely harness relocation/compression setup noise.`);
  }

  const status: NpcSpeedDiagnosticReport['status'] = npcTracks.length === 0
    ? 'fail'
    : nonInitialHardSpikes.length > 0
      ? 'fail'
      : nonInitialReviewSpikes.length > 0
        ? 'warn'
        : 'pass';

  return {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-npc-speed-diagnostic',
    sourceArtifactDir: rel(dirname(movementPath)),
    sourceMovementArtifacts: rel(movementPath),
    status,
    thresholds: {
      reviewSpeedMps,
      hardSpeedMps,
      minSegmentSeconds,
    },
    summary: {
      npcTrackCount: npcTracks.length,
      npcSegmentCount: segments.length,
      analyzedNonInitialSegmentCount: nonInitialAnalyzed.length,
      ignoredFirstSegmentCount: firstSegments.length,
      ignoredShortDtSegmentCount: shortDtSegments.length,
      initialReviewSpikeCount: initialReviewSpikes.length,
      initialHardSpikeCount: initialHardSpikes.length,
      nonInitialReviewSpikeCount: nonInitialReviewSpikes.length,
      nonInitialHardSpikeCount: nonInitialHardSpikes.length,
      maxInitialSpeedMps: maxSpeed(firstSegments),
      maxNonInitialSpeedMps: maxSpeed(nonInitialAnalyzed),
    },
    topInitialSegments: topSegments(firstSegments),
    topNonInitialSegments: topSegments(nonInitialAnalyzed),
    findings,
    nextProbeQuestions: [
      nonInitialHardSpikes.length > 0 || nonInitialReviewSpikes.length > 0
        ? 'Are route-follow speed spikes caused by navmesh recovery snaps, low-frequency track sampling, or real CombatantMovement velocity overshoot?'
        : '',
      initialHardSpikes.length > 0
        ? 'Should future captures tag harness relocation/compression segments explicitly so speed diagnostics can exclude them without relying on first-segment heuristics?'
        : '',
    ].filter(Boolean),
  };
}

export function main(): void {
  const movementPath = movementArtifactsPath(parseArg('artifact'));
  const report = buildReport(movementPath, {
    reviewSpeedMps: parseNumberArg('review-speed-mps', DEFAULT_REVIEW_SPEED_MPS),
    hardSpeedMps: parseNumberArg('hard-speed-mps', DEFAULT_HARD_SPEED_MPS),
    minSegmentSeconds: parseNumberArg('min-segment-seconds', DEFAULT_MIN_SEGMENT_SECONDS),
  });
  const outDir = join(dirname(movementPath), 'projekt-143-npc-speed-diagnostic');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'npc-speed-diagnostic.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`NPC speed diagnostic ${report.status.toUpperCase()}: ${rel(outPath)}`);
  for (const finding of report.findings) {
    console.log(`- ${finding}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
