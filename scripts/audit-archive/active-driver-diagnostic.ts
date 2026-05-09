#!/usr/bin/env tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DriverState = 'PATROL' | 'ALERT' | 'ENGAGE' | 'ADVANCE' | 'RESPAWN_WAIT' | 'MATCH_ENDED' | string;

interface RuntimeSample {
  ts?: string;
  frameCount?: number;
  shotsThisSession?: number;
  hitsThisSession?: number;
  harnessDriver?: {
    botState?: DriverState;
    movementState?: DriverState;
    targetVisible?: boolean;
    waypointReplanFailures?: number;
    waypointsFollowedCount?: number;
    waypointCount?: number;
    waypointIdx?: number;
    routeTargetResets?: number;
    routeNoProgressResets?: number;
    maxStuckSeconds?: number;
    objectiveKind?: string | null;
    objectiveDistance?: number | null;
    objectiveZoneId?: string | null;
    nearestOpforDistance?: number | null;
    nearestPerceivedEnemyDistance?: number | null;
    currentTargetDistance?: number | null;
    pathTargetKind?: string | null;
    pathTargetDistance?: number | null;
    pathQueryStatus?: string | null;
    pathLength?: number | null;
    pathFailureReason?: string | null;
    pathQueryDistance?: number | null;
    pathStartSnapped?: boolean | null;
    pathEndSnapped?: boolean | null;
    pathStartSnapDistance?: number | null;
    pathEndSnapDistance?: number | null;
    routeProgressDistance?: number | null;
    routeProgressAgeMs?: number | null;
    routeProgressTravelMeters?: number | null;
    firstObjectiveDistance?: number | null;
    minObjectiveDistance?: number | null;
    objectiveDistanceClosed?: number | null;
    playerDistanceMoved?: number | null;
    movementIntentCalls?: number | null;
    nonZeroMovementIntentCalls?: number | null;
    runtimeLiveness?: {
      engineFrameCount?: number;
      harnessRafTicks?: number;
      documentHidden?: boolean | null;
      visibilityState?: string | null;
      gameStarted?: boolean;
      playerInVehicle?: boolean;
      playerSpectating?: boolean;
      terrainHeightAtPlayer?: number | null;
      effectiveHeightAtPlayer?: number | null;
      collisionHeightDeltaAtPlayer?: number | null;
      collisionContributorsAtPlayer?: Array<Record<string, unknown>>;
      playerMovementDebug?: Record<string, unknown> | null;
      playerMovementSamples?: number;
      playerAvgRequestedSpeed?: number;
      playerAvgActualSpeed?: number;
      playerBlockedByTerrain?: number;
    } | null;
    perceptionRange?: number | null;
    stateHistogramMs?: Record<string, number>;
    engineShotsFired?: number;
    engineShotsHit?: number;
    damageDealt?: number;
    kills?: number;
  };
}

interface CaptureSummary {
  status?: string;
  failureReason?: string;
  validation?: { overall?: string };
  measurementTrust?: { status?: string; summary?: string };
  harnessDriverFinal?: RuntimeSample['harnessDriver'];
}

interface MovementTrackPoint {
  x?: number;
  z?: number;
  tMs?: number;
  requestedSpeed?: number;
  actualSpeed?: number;
  wantsMovement?: boolean;
  blockedByTerrain?: boolean;
}

interface MovementTrack {
  id?: string;
  subject?: string;
  points?: MovementTrackPoint[];
}

interface MovementArtifacts {
  tracks?: MovementTrack[];
}

interface PlayerHeadingSummary {
  pointCount: number;
  headingFlipCount120: number;
  headingTurnCount80: number;
  pacingFlipCount: number;
  requestedMovePacingFlipCount: number | null;
  actualOnlyPacingFlipCount: number | null;
  blockedTerrainPacingFlipCount: number | null;
}

interface DiagnosticReport {
  createdAt: string;
  mode: 'projekt-143-active-driver-diagnostic';
  sourceArtifactDir: string;
  sourceSummary: string | null;
  sourceRuntimeSamples: string;
  status: 'pass' | 'warn' | 'fail';
  summary: {
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    runtimeSampleCount: number;
    driverSampleCount: number;
    telemetryPresent: boolean;
    finalBotState: string | null;
    finalObjectiveKind: string | null;
    finalObjectiveDistance: number | null;
    finalPathQueryStatus: string | null;
    finalPathFailureReason: string | null;
    finalPathQueryDistance: number | null;
    finalPathTargetDistance: number | null;
    finalRouteProgressDistance: number | null;
    finalRouteProgressAgeMs: number | null;
    finalRouteProgressTravelMeters: number | null;
    finalPathStartSnapDistance: number | null;
    finalPathEndSnapDistance: number | null;
    finalFirstObjectiveDistance: number | null;
    finalMinObjectiveDistance: number | null;
    finalObjectiveDistanceClosed: number | null;
    finalPlayerDistanceMoved: number | null;
    finalMovementIntentCalls: number | null;
    finalNonZeroMovementIntentCalls: number | null;
    finalEngineFrameCount: number | null;
    finalHarnessRafTicks: number | null;
    finalPlayerMovementSamples: number | null;
    finalPlayerAvgRequestedSpeed: number | null;
    finalPlayerAvgActualSpeed: number | null;
    finalPlayerBlockedByTerrain: number | null;
    finalTerrainHeightAtPlayer: number | null;
    finalEffectiveHeightAtPlayer: number | null;
    finalCollisionHeightDeltaAtPlayer: number | null;
    finalCollisionContributorsAtPlayer: Array<Record<string, unknown>>;
    finalPlayerMovementBlockReason: string | null;
    finalPlayerMovementDebug: Record<string, unknown> | null;
    finalPlayerInVehicle: boolean | null;
    finalPlayerSpectating: boolean | null;
    finalDocumentHidden: boolean | null;
    finalVisibilityState: string | null;
    finalNearestOpforDistance: number | null;
    finalNearestPerceivedEnemyDistance: number | null;
    finalCurrentTargetDistance: number | null;
    finalPerceptionRange: number | null;
    finalEngineShotsFired: number;
    finalEngineShotsHit: number;
    finalKills: number;
    maxStuckSeconds: number;
    maxWaypointReplanFailures: number;
    maxRouteTargetResets: number;
    maxRouteNoProgressResets: number;
    playerMovementPointCount: number | null;
    playerHeadingFlipCount120: number | null;
    playerHeadingTurnCount80: number | null;
    playerPacingFlipCount: number | null;
    playerRequestedMovePacingFlipCount: number | null;
    playerActualOnlyPacingFlipCount: number | null;
    playerBlockedTerrainPacingFlipCount: number | null;
  };
  histograms: {
    botStateSamples: Record<string, number>;
    objectiveKindSamples: Record<string, number>;
    pathQueryStatusSamples: Record<string, number>;
    pathFailureReasonSamples: Record<string, number>;
  };
  findings: string[];
  nextProbeQuestions: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
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

function driverHasTelemetry(driver: RuntimeSample['harnessDriver'] | null | undefined): boolean {
  return Boolean(driver && (
    driver.objectiveKind
    || finiteNumber(driver.objectiveDistance) !== null
    || finiteNumber(driver.nearestOpforDistance) !== null
    || finiteNumber(driver.nearestPerceivedEnemyDistance) !== null
    || driver.pathQueryStatus
    || driver.pathFailureReason
    || finiteNumber(driver.routeNoProgressResets) !== null
  ));
}

function runtimeSamplesHaveTelemetry(path: string): boolean {
  try {
    const samples = readJson<RuntimeSample[]>(path);
    return Array.isArray(samples) && samples.some((sample) => driverHasTelemetry(sample.harnessDriver));
  } catch {
    return false;
  }
}

export function latestRuntimeSamples(
  root: string = ARTIFACT_ROOT,
  options: { preferTelemetry?: boolean } = {},
): string | null {
  const files = walkFiles(root, (path) => basename(path) === 'runtime-samples.json');
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (options.preferTelemetry !== false) {
    const telemetryPath = files.find((path) => runtimeSamplesHaveTelemetry(path));
    if (telemetryPath) return telemetryPath;
  }
  return files[0] ?? null;
}

export function artifactRuntimeSamplesPath(artifactArg: string | null): string {
  if (artifactArg) {
    const artifactPath = resolve(artifactArg);
    const runtimePath = statSync(artifactPath).isDirectory()
      ? join(artifactPath, 'runtime-samples.json')
      : artifactPath;
    if (!existsSync(runtimePath)) {
      throw new Error(`runtime-samples.json not found at ${runtimePath}`);
    }
    return runtimePath;
  }
  const latest = latestRuntimeSamples();
  if (!latest) throw new Error(`No runtime-samples.json found under ${ARTIFACT_ROOT}`);
  return latest;
}

function count(map: Record<string, number>, key: string | null | undefined): void {
  const safe = key && key.length > 0 ? key : 'none';
  map[safe] = (map[safe] ?? 0) + 1;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function maxFinite(values: Array<number | null>): number {
  return values.reduce((max, value) => (value !== null && value > max ? value : max), 0);
}

function last<T>(items: T[]): T | null {
  return items.length > 0 ? items[items.length - 1] : null;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function firstFinite(...values: Array<unknown>): number | null {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function firstBoolean(...values: Array<unknown>): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function analyzePlayerHeading(runtimePath: string): PlayerHeadingSummary | null {
  const movementPath = join(dirname(runtimePath), 'movement-artifacts.json');
  if (!existsSync(movementPath)) return null;
  const artifacts = readJson<MovementArtifacts>(movementPath);
  const tracks = Array.isArray(artifacts.tracks) ? artifacts.tracks : [];
  const playerTrack = tracks.find((track) => track.id === 'player')
    ?? tracks.find((track) => track.subject === 'player');
  const points = Array.isArray(playerTrack?.points) ? playerTrack.points : [];
  if (points.length < 2) {
    return {
      pointCount: points.length,
      headingFlipCount120: 0,
      headingTurnCount80: 0,
      pacingFlipCount: 0,
      requestedMovePacingFlipCount: null,
      actualOnlyPacingFlipCount: null,
      blockedTerrainPacingFlipCount: null,
    };
  }

  let previousAngle: number | null = null;
  let headingFlipCount120 = 0;
  let headingTurnCount80 = 0;
  let pacingFlipCount = 0;
  let telemetryAnnotated = false;
  let requestedMovePacingFlipCount = 0;
  let actualOnlyPacingFlipCount = 0;
  let blockedTerrainPacingFlipCount = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ax = finiteNumber(a?.x);
    const az = finiteNumber(a?.z);
    const bx = finiteNumber(b?.x);
    const bz = finiteNumber(b?.z);
    if (ax === null || az === null || bx === null || bz === null) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.2) continue;
    const angle = Math.atan2(dz, dx);
    if (previousAngle !== null) {
      let delta = angle - previousAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const turnDeg = Math.abs((delta * 180) / Math.PI);
      if (turnDeg > 80) headingTurnCount80++;
      if (turnDeg > 120) {
        headingFlipCount120++;
        const dt = (finiteNumber(b?.tMs) ?? 0) - (finiteNumber(a?.tMs) ?? 0);
        if (dist <= 3.5 && dt > 0 && dt <= 1500) {
          pacingFlipCount++;
          const requestedSpeed = finiteNumber(b?.requestedSpeed);
          const actualSpeed = finiteNumber(b?.actualSpeed);
          if (requestedSpeed !== null || actualSpeed !== null || typeof b?.wantsMovement === 'boolean') {
            telemetryAnnotated = true;
          }
          if (requestedSpeed !== null && requestedSpeed > 0.1) {
            requestedMovePacingFlipCount++;
          } else if (actualSpeed !== null && actualSpeed > 0.15) {
            actualOnlyPacingFlipCount++;
          }
          if (b?.blockedByTerrain === true) {
            blockedTerrainPacingFlipCount++;
          }
        }
      }
    }
    previousAngle = angle;
  }

  return {
    pointCount: points.length,
    headingFlipCount120,
    headingTurnCount80,
    pacingFlipCount,
    requestedMovePacingFlipCount: telemetryAnnotated ? requestedMovePacingFlipCount : null,
    actualOnlyPacingFlipCount: telemetryAnnotated ? actualOnlyPacingFlipCount : null,
    blockedTerrainPacingFlipCount: telemetryAnnotated ? blockedTerrainPacingFlipCount : null,
  };
}

export function buildReport(runtimePath: string): DiagnosticReport {
  const sourceArtifactDir = dirname(runtimePath);
  const summaryPath = join(sourceArtifactDir, 'summary.json');
  const samples = readJson<RuntimeSample[]>(runtimePath);
  const summary = existsSync(summaryPath) ? readJson<CaptureSummary>(summaryPath) : null;
  const driverSamples = samples.filter((sample) => sample.harnessDriver);
  const summaryFinalDriver = summary?.harnessDriverFinal ?? null;
  const sampleFinalDriver = last(driverSamples)?.harnessDriver ?? null;
  const finalDriver = summaryFinalDriver ?? sampleFinalDriver;
  const telemetryPresent = driverHasTelemetry(summaryFinalDriver)
    || driverSamples.some((sample) => driverHasTelemetry(sample.harnessDriver));

  const botStateSamples: Record<string, number> = {};
  const objectiveKindSamples: Record<string, number> = {};
  const pathQueryStatusSamples: Record<string, number> = {};
  const pathFailureReasonSamples: Record<string, number> = {};
  for (const sample of driverSamples) {
    const driver = sample.harnessDriver;
    count(botStateSamples, driver?.botState ?? driver?.movementState);
    count(objectiveKindSamples, driver?.objectiveKind);
    count(pathQueryStatusSamples, driver?.pathQueryStatus);
    count(pathFailureReasonSamples, driver?.pathFailureReason);
  }

  const finalObjectiveKind = firstString(summaryFinalDriver?.objectiveKind, sampleFinalDriver?.objectiveKind);
  const finalObjectiveDistance = firstFinite(summaryFinalDriver?.objectiveDistance, sampleFinalDriver?.objectiveDistance);
  const finalPathQueryStatus = firstString(summaryFinalDriver?.pathQueryStatus, sampleFinalDriver?.pathQueryStatus);
  const finalPathFailureReason = firstString(summaryFinalDriver?.pathFailureReason, sampleFinalDriver?.pathFailureReason);
  const finalPathQueryDistance = firstFinite(summaryFinalDriver?.pathQueryDistance, sampleFinalDriver?.pathQueryDistance);
  const finalPathTargetDistance = firstFinite(summaryFinalDriver?.pathTargetDistance, sampleFinalDriver?.pathTargetDistance);
  const finalRouteProgressDistance = firstFinite(summaryFinalDriver?.routeProgressDistance, sampleFinalDriver?.routeProgressDistance);
  const finalRouteProgressAgeMs = firstFinite(summaryFinalDriver?.routeProgressAgeMs, sampleFinalDriver?.routeProgressAgeMs);
  const finalRouteProgressTravelMeters = firstFinite(summaryFinalDriver?.routeProgressTravelMeters, sampleFinalDriver?.routeProgressTravelMeters);
  const finalPathStartSnapDistance = firstFinite(summaryFinalDriver?.pathStartSnapDistance, sampleFinalDriver?.pathStartSnapDistance);
  const finalPathEndSnapDistance = firstFinite(summaryFinalDriver?.pathEndSnapDistance, sampleFinalDriver?.pathEndSnapDistance);
  const finalFirstObjectiveDistance = firstFinite(summaryFinalDriver?.firstObjectiveDistance, sampleFinalDriver?.firstObjectiveDistance);
  const finalMinObjectiveDistance = firstFinite(summaryFinalDriver?.minObjectiveDistance, sampleFinalDriver?.minObjectiveDistance);
  const finalObjectiveDistanceClosed = firstFinite(summaryFinalDriver?.objectiveDistanceClosed, sampleFinalDriver?.objectiveDistanceClosed);
  const finalPlayerDistanceMoved = firstFinite(summaryFinalDriver?.playerDistanceMoved, sampleFinalDriver?.playerDistanceMoved);
  const finalMovementIntentCalls = firstFinite(summaryFinalDriver?.movementIntentCalls, sampleFinalDriver?.movementIntentCalls);
  const finalNonZeroMovementIntentCalls = firstFinite(summaryFinalDriver?.nonZeroMovementIntentCalls, sampleFinalDriver?.nonZeroMovementIntentCalls);
  const finalRuntimeLiveness = summaryFinalDriver?.runtimeLiveness ?? sampleFinalDriver?.runtimeLiveness ?? null;
  const finalEngineFrameCount = firstFinite(finalRuntimeLiveness?.engineFrameCount);
  const finalHarnessRafTicks = firstFinite(finalRuntimeLiveness?.harnessRafTicks);
  const finalPlayerMovementSamples = firstFinite(finalRuntimeLiveness?.playerMovementSamples);
  const finalPlayerAvgRequestedSpeed = firstFinite(finalRuntimeLiveness?.playerAvgRequestedSpeed);
  const finalPlayerAvgActualSpeed = firstFinite(finalRuntimeLiveness?.playerAvgActualSpeed);
  const finalPlayerBlockedByTerrain = firstFinite(finalRuntimeLiveness?.playerBlockedByTerrain);
  const finalTerrainHeightAtPlayer = firstFinite(finalRuntimeLiveness?.terrainHeightAtPlayer);
  const finalEffectiveHeightAtPlayer = firstFinite(finalRuntimeLiveness?.effectiveHeightAtPlayer);
  const finalCollisionHeightDeltaAtPlayer = firstFinite(finalRuntimeLiveness?.collisionHeightDeltaAtPlayer);
  const finalCollisionContributorsAtPlayer = Array.isArray(finalRuntimeLiveness?.collisionContributorsAtPlayer)
    ? finalRuntimeLiveness.collisionContributorsAtPlayer
    : [];
  const finalPlayerMovementDebug = finalRuntimeLiveness?.playerMovementDebug && typeof finalRuntimeLiveness.playerMovementDebug === 'object'
    ? finalRuntimeLiveness.playerMovementDebug
    : null;
  const finalPlayerMovementBlockReason = firstString(finalPlayerMovementDebug?.blockReason);
  const finalPlayerInVehicle = firstBoolean(finalRuntimeLiveness?.playerInVehicle);
  const finalPlayerSpectating = firstBoolean(finalRuntimeLiveness?.playerSpectating);
  const finalDocumentHidden = firstBoolean(finalRuntimeLiveness?.documentHidden);
  const finalVisibilityState = firstString(finalRuntimeLiveness?.visibilityState);
  const finalNearestOpforDistance = firstFinite(summaryFinalDriver?.nearestOpforDistance, sampleFinalDriver?.nearestOpforDistance);
  const finalNearestPerceivedEnemyDistance = firstFinite(
    summaryFinalDriver?.nearestPerceivedEnemyDistance,
    sampleFinalDriver?.nearestPerceivedEnemyDistance,
  );
  const finalCurrentTargetDistance = firstFinite(summaryFinalDriver?.currentTargetDistance, sampleFinalDriver?.currentTargetDistance);
  const finalPerceptionRange = firstFinite(summaryFinalDriver?.perceptionRange, sampleFinalDriver?.perceptionRange);
  const finalTelemetryShotsFired = firstFinite(last(samples)?.shotsThisSession) ?? 0;
  const finalTelemetryShotsHit = firstFinite(last(samples)?.hitsThisSession) ?? 0;
  const finalEngineShotsFired = Math.max(firstFinite(finalDriver?.engineShotsFired) ?? 0, finalTelemetryShotsFired);
  const finalEngineShotsHit = Math.max(firstFinite(finalDriver?.engineShotsHit) ?? 0, finalTelemetryShotsHit);
  const finalKills = firstFinite(finalDriver?.kills) ?? 0;
  const maxStuckSeconds = maxFinite(driverSamples.map((sample) => finiteNumber(sample.harnessDriver?.maxStuckSeconds)));
  const maxWaypointReplanFailures = maxFinite(driverSamples.map((sample) => finiteNumber(sample.harnessDriver?.waypointReplanFailures)));
  const maxRouteTargetResets = maxFinite(driverSamples.map((sample) => finiteNumber(sample.harnessDriver?.routeTargetResets)));
  const maxRouteNoProgressResets = maxFinite(driverSamples.map((sample) => finiteNumber(sample.harnessDriver?.routeNoProgressResets)));
  const playerHeading = analyzePlayerHeading(runtimePath);

  const findings: string[] = [];
  if (!telemetryPresent) {
    findings.push('Active-driver objective/path telemetry is absent; rerun with the current perf-active-driver/perf-capture code before diagnosing routing.');
  }
  if ((summary?.validation?.overall ?? null) === 'fail') {
    findings.push('Capture validation failed; use as diagnostic evidence only.');
  }
  if ((summary?.measurementTrust?.status ?? null) === 'fail') {
    findings.push('Measurement trust failed; do not use frame-time values for acceptance.');
  }
  if (finalEngineShotsFired <= 0) {
    findings.push('No player shot telemetry was recorded by the final sample.');
  }
  if (finalNearestOpforDistance !== null && finalPerceptionRange !== null && finalNearestOpforDistance > finalPerceptionRange) {
    findings.push('Nearest live OPFOR remained outside the harness perception range at final sample.');
  }
  if (finalNearestPerceivedEnemyDistance !== null && finalNearestPerceivedEnemyDistance > 0.1 && finalPerceptionRange !== null && finalNearestPerceivedEnemyDistance <= finalPerceptionRange && finalEngineShotsFired <= 0) {
    findings.push('A perceived enemy was inside harness perception range, but no player shot telemetry was recorded.');
  }
  if (finalPathTargetDistance !== null && finalPathTargetDistance > 25 && finalPathQueryStatus === 'failed') {
    findings.push('Final path target was still distant and the last path query failed.');
  }
  if (finalPathFailureReason) {
    const detail = [
      finalPathQueryDistance !== null ? `query=${finalPathQueryDistance.toFixed(1)}m` : null,
      finalPathStartSnapDistance !== null ? `startSnap=${finalPathStartSnapDistance.toFixed(1)}m` : null,
      finalPathEndSnapDistance !== null ? `endSnap=${finalPathEndSnapDistance.toFixed(1)}m` : null,
    ].filter(Boolean).join(', ');
    findings.push(`Final path failure reason: ${finalPathFailureReason}${detail ? ` (${detail})` : ''}.`);
  }
  if (finalPlayerDistanceMoved !== null && finalPlayerDistanceMoved < 10) {
    findings.push(`Harness player moved only ${finalPlayerDistanceMoved.toFixed(1)}m by final sample.`);
  }
  if ((finalNonZeroMovementIntentCalls ?? 0) > 0 && (finalPlayerDistanceMoved ?? 0) < 10) {
    if ((finalEngineFrameCount ?? 0) <= 0 || (finalPlayerMovementSamples ?? 0) <= 0) {
      findings.push(`Driver issued ${finalNonZeroMovementIntentCalls} nonzero movement intents, but engine/player movement samples did not advance.`);
    } else if ((finalPlayerAvgRequestedSpeed ?? 0) > 0.1 && (finalPlayerAvgActualSpeed ?? 0) <= 0.1) {
      findings.push(`PlayerMovement saw requested speed ${finalPlayerAvgRequestedSpeed?.toFixed(2)} but actual speed stayed ${finalPlayerAvgActualSpeed?.toFixed(2)}.`);
    }
  }
  if (finalCollisionHeightDeltaAtPlayer !== null && finalCollisionHeightDeltaAtPlayer > 0.5) {
    const contributors = finalCollisionContributorsAtPlayer
      .map((entry) => typeof entry.id === 'string' ? entry.id : null)
      .filter(Boolean)
      .join(', ');
    findings.push(`Effective collision height exceeded terrain by ${finalCollisionHeightDeltaAtPlayer.toFixed(2)}m at the player${contributors ? ` (${contributors})` : ''}.`);
  }
  if (finalPlayerMovementBlockReason && finalPlayerMovementBlockReason !== 'none') {
    findings.push(`Final PlayerMovement block reason: ${finalPlayerMovementBlockReason}.`);
  }
  if (finalPlayerInVehicle) {
    findings.push('Player controller reported vehicle state during the active-driver sample.');
  }
  if (finalPlayerSpectating) {
    findings.push('Player controller reported spectator state during the active-driver sample.');
  }
  if (finalDocumentHidden) {
    findings.push(`Capture document was hidden (${finalVisibilityState ?? 'unknown'}), so browser scheduling may have invalidated the run.`);
  }
  if (finalObjectiveDistanceClosed !== null && finalObjectiveDistanceClosed < 25) {
    findings.push(`Objective distance closed only ${finalObjectiveDistanceClosed.toFixed(1)}m by final sample.`);
  }
  if (maxStuckSeconds >= 4) {
    findings.push(`Harness stuck time reached ${maxStuckSeconds.toFixed(1)}s.`);
  }
  if (maxWaypointReplanFailures > 0) {
    findings.push(`Waypoint replans failed ${maxWaypointReplanFailures} times.`);
  }
  if (maxRouteNoProgressResets > 0) {
    findings.push(`Route objective-progress recovery reset the path ${maxRouteNoProgressResets} times.`);
  }
  if (playerHeading && playerHeading.headingFlipCount120 > 20) {
    findings.push(`Player movement track recorded ${playerHeading.headingFlipCount120} heading reversals over 120 degrees (${playerHeading.pacingFlipCount} short-hop pacing reversals).`);
  }

  const nextProbeQuestions = [
    telemetryPresent ? '' : 'Does the next capture include objective/path telemetry?',
    finalNearestOpforDistance !== null && finalPerceptionRange !== null
      ? 'Does nearest OPFOR enter perception range before path failures or timeout?'
      : 'What is the nearest live OPFOR distance versus perception range?',
    finalDriver?.pathQueryStatus
      ? 'Does path query status stay ok while the objective distance closes?'
      : 'Does the path overlay produce a query status?',
    finalEngineShotsFired > 0
      ? 'Do shots/hits remain healthy once measurement trust passes?'
      : 'Why does the bot not transition into ALERT/ENGAGE and fire?',
    (finalNonZeroMovementIntentCalls ?? 0) > 0 && (finalPlayerDistanceMoved ?? 0) < 10
      ? 'Does PlayerMovement consume the active-driver movement intent on engine frames?'
      : '',
    playerHeading && playerHeading.headingFlipCount120 > 20
      ? 'Are remaining heading reversals tied to close-range target path endpoints or terrain recovery?'
      : '',
  ].filter(Boolean);

  const status: DiagnosticReport['status'] = telemetryPresent
    ? findings.length > 0 || findings.some((finding) => finding.includes('failed') || finding.includes('No player shot telemetry'))
      ? 'warn'
      : 'pass'
    : 'fail';

  return {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-active-driver-diagnostic',
    sourceArtifactDir: rel(sourceArtifactDir) ?? sourceArtifactDir,
    sourceSummary: existsSync(summaryPath) ? rel(summaryPath) : null,
    sourceRuntimeSamples: rel(runtimePath) ?? runtimePath,
    status,
    summary: {
      captureStatus: summary?.status ?? null,
      validation: summary?.validation?.overall ?? null,
      measurementTrust: summary?.measurementTrust?.status ?? null,
      runtimeSampleCount: samples.length,
      driverSampleCount: driverSamples.length,
      telemetryPresent,
      finalBotState: firstString(summaryFinalDriver?.botState, summaryFinalDriver?.movementState, sampleFinalDriver?.botState, sampleFinalDriver?.movementState),
      finalObjectiveKind,
      finalObjectiveDistance,
      finalPathQueryStatus,
      finalPathFailureReason,
      finalPathQueryDistance,
      finalPathTargetDistance,
      finalRouteProgressDistance,
      finalRouteProgressAgeMs,
      finalRouteProgressTravelMeters,
      finalPathStartSnapDistance,
      finalPathEndSnapDistance,
      finalFirstObjectiveDistance,
      finalMinObjectiveDistance,
      finalObjectiveDistanceClosed,
      finalPlayerDistanceMoved,
      finalMovementIntentCalls,
      finalNonZeroMovementIntentCalls,
      finalEngineFrameCount,
      finalHarnessRafTicks,
      finalPlayerMovementSamples,
      finalPlayerAvgRequestedSpeed,
      finalPlayerAvgActualSpeed,
      finalPlayerBlockedByTerrain,
      finalTerrainHeightAtPlayer,
      finalEffectiveHeightAtPlayer,
      finalCollisionHeightDeltaAtPlayer,
      finalCollisionContributorsAtPlayer,
      finalPlayerMovementBlockReason,
      finalPlayerMovementDebug,
      finalPlayerInVehicle,
      finalPlayerSpectating,
      finalDocumentHidden,
      finalVisibilityState,
      finalNearestOpforDistance,
      finalNearestPerceivedEnemyDistance,
      finalCurrentTargetDistance,
      finalPerceptionRange,
      finalEngineShotsFired,
      finalEngineShotsHit,
      finalKills,
      maxStuckSeconds,
      maxWaypointReplanFailures,
      maxRouteTargetResets,
      maxRouteNoProgressResets,
      playerMovementPointCount: playerHeading?.pointCount ?? null,
      playerHeadingFlipCount120: playerHeading?.headingFlipCount120 ?? null,
      playerHeadingTurnCount80: playerHeading?.headingTurnCount80 ?? null,
      playerPacingFlipCount: playerHeading?.pacingFlipCount ?? null,
      playerRequestedMovePacingFlipCount: playerHeading?.requestedMovePacingFlipCount ?? null,
      playerActualOnlyPacingFlipCount: playerHeading?.actualOnlyPacingFlipCount ?? null,
      playerBlockedTerrainPacingFlipCount: playerHeading?.blockedTerrainPacingFlipCount ?? null,
    },
    histograms: {
      botStateSamples,
      objectiveKindSamples,
      pathQueryStatusSamples,
      pathFailureReasonSamples,
    },
    findings,
    nextProbeQuestions,
  };
}

export function main(): void {
  const runtimePath = artifactRuntimeSamplesPath(parseArg('artifact'));
  const report = buildReport(runtimePath);
  const outDir = join(dirname(runtimePath), 'projekt-143-active-driver-diagnostic');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'active-driver-diagnostic.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Active-driver diagnostic ${report.status.toUpperCase()}: ${rel(outPath)}`);
  for (const finding of report.findings) {
    console.log(`- ${finding}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
