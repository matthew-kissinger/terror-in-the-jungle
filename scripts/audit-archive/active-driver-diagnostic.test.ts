import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReport,
  latestRuntimeSamples,
} from './active-driver-diagnostic';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tij-active-driver-diagnostic-'));
  tempRoots.push(root);
  return root;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

function makeCapture(root: string, name: string, samples: unknown[], mtimeMs: number): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const runtimePath = join(dir, 'runtime-samples.json');
  writeJson(runtimePath, samples);
  const mtime = new Date(mtimeMs);
  utimesSync(runtimePath, mtime, mtime);
  return runtimePath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('projekt-143 active-driver diagnostic', () => {
  it('prefers the newest telemetry-bearing runtime samples over newer legacy samples', () => {
    const root = makeTempRoot();
    const telemetryPath = makeCapture(root, 'with-telemetry', [
      {
        harnessDriver: {
          botState: 'ADVANCE',
          objectiveKind: 'opfor-front',
          nearestOpforDistance: 72,
          pathQueryStatus: 'ok',
        },
      },
    ], 1000);
    const legacyPath = makeCapture(root, 'legacy', [
      {
        harnessDriver: {
          botState: 'PATROL',
        },
      },
    ], 2000);

    expect(latestRuntimeSamples(root)).toBe(telemetryPath);
    expect(latestRuntimeSamples(root, { preferTelemetry: false })).toBe(legacyPath);
  });

  it('marks a telemetry-bearing capture with healthy routing and shots as pass', () => {
    const root = makeTempRoot();
    const runtimePath = makeCapture(root, 'healthy', [
      {
        frameCount: 1,
        harnessDriver: {
          botState: 'ADVANCE',
          objectiveKind: 'opfor-front',
          objectiveDistance: 35,
          nearestOpforDistance: 80,
          nearestPerceivedEnemyDistance: 55,
          currentTargetDistance: 55,
          pathQueryStatus: 'ok',
          pathTargetDistance: 12,
          perceptionRange: 150,
          engineShotsFired: 6,
          engineShotsHit: 2,
          kills: 1,
          maxStuckSeconds: 0,
          waypointReplanFailures: 0,
        },
      },
    ], 1000);
    writeJson(join(root, 'healthy', 'summary.json'), {
      status: 'pass',
      validation: { overall: 'pass' },
      measurementTrust: { status: 'pass' },
      harnessDriverFinal: {
        botState: 'ADVANCE',
        engineShotsFired: 6,
        engineShotsHit: 2,
        kills: 1,
      },
    });

    const report = buildReport(runtimePath);

    expect(report.status).toBe('pass');
    expect(report.summary.telemetryPresent).toBe(true);
    expect(report.summary.finalBotState).toBe('ADVANCE');
    expect(report.summary.finalObjectiveKind).toBe('opfor-front');
    expect(report.summary.finalPathQueryStatus).toBe('ok');
    expect(report.summary.finalCurrentTargetDistance).toBe(55);
    expect(report.summary.finalEngineShotsFired).toBe(6);
    expect(report.findings).toEqual([]);
  });

  it('fails legacy captures that lack objective and path telemetry', () => {
    const root = makeTempRoot();
    const runtimePath = makeCapture(root, 'legacy', [
      {
        shotsThisSession: 0,
        harnessDriver: {
          botState: 'PATROL',
          waypointReplanFailures: 2,
        },
      },
    ], 1000);

    const report = buildReport(runtimePath);

    expect(report.status).toBe('fail');
    expect(report.summary.telemetryPresent).toBe(false);
    expect(report.findings.some((finding) => finding.includes('telemetry is absent'))).toBe(true);
  });

  it('surfaces movement intent with no engine movement loop progress from final driver telemetry', () => {
    const root = makeTempRoot();
    const runtimePath = makeCapture(root, 'final-only', [], 1000);
    writeJson(join(root, 'final-only', 'summary.json'), {
      status: 'failed',
      validation: { overall: 'fail' },
      measurementTrust: { status: 'fail' },
      harnessDriverFinal: {
        botState: 'PATROL',
        objectiveKind: 'nearest_opfor',
        objectiveDistance: 1500,
        pathQueryStatus: 'ok',
        pathTargetDistance: 1500,
        movementIntentCalls: 120,
        nonZeroMovementIntentCalls: 120,
        playerDistanceMoved: 0,
        runtimeLiveness: {
          engineFrameCount: 0,
          harnessRafTicks: 0,
          playerMovementSamples: 0,
          documentHidden: false,
          visibilityState: 'visible',
        },
      },
    });

    const report = buildReport(runtimePath);

    expect(report.summary.telemetryPresent).toBe(true);
    expect(report.summary.finalNonZeroMovementIntentCalls).toBe(120);
    expect(report.summary.finalEngineFrameCount).toBe(0);
    expect(report.findings.some((finding) => finding.includes('nonzero movement intents'))).toBe(true);
  });

  it('surfaces route objective-progress recovery resets', () => {
    const root = makeTempRoot();
    const runtimePath = makeCapture(root, 'route-reset', [
      {
        frameCount: 1,
        harnessDriver: {
          botState: 'PATROL',
          objectiveKind: 'nearest_opfor',
          objectiveDistance: 900,
          routeProgressDistance: 910,
          routeProgressAgeMs: 7000,
          routeProgressTravelMeters: 85,
          routeTargetResets: 1,
          routeNoProgressResets: 2,
          pathQueryStatus: 'ok',
          engineShotsFired: 8,
          engineShotsHit: 2,
        },
      },
    ], 1000);

    const report = buildReport(runtimePath);

    expect(report.summary.finalRouteProgressDistance).toBe(910);
    expect(report.summary.maxRouteTargetResets).toBe(1);
    expect(report.summary.maxRouteNoProgressResets).toBe(2);
    expect(report.findings.some((finding) => finding.includes('objective-progress recovery reset'))).toBe(true);
  });

  it('surfaces player heading-reversal pacing from movement artifacts', () => {
    const root = makeTempRoot();
    const runtimePath = makeCapture(root, 'pacing', [
      {
        frameCount: 1,
        harnessDriver: {
          botState: 'ADVANCE',
          objectiveKind: 'nearest_opfor',
          objectiveDistance: 80,
          pathQueryStatus: 'ok',
          engineShotsFired: 8,
          engineShotsHit: 2,
          maxStuckSeconds: 0,
          waypointReplanFailures: 0,
        },
      },
    ], 1000);
    writeJson(join(root, 'pacing', 'movement-artifacts.json'), {
      tracks: [
        {
          id: 'player',
          subject: 'player',
          points: Array.from({ length: 24 }, (_, index) => ({
            x: index % 2 === 0 ? 0 : 2,
            z: 0,
            tMs: index * 250,
            requestedSpeed: index < 12 ? 3 : 0,
            actualSpeed: index < 12 ? 3 : 1,
          })),
        },
      ],
    });

    const report = buildReport(runtimePath);

    expect(report.status).toBe('warn');
    expect(report.summary.playerHeadingFlipCount120).toBeGreaterThan(20);
    expect(report.summary.playerPacingFlipCount).toBeGreaterThan(20);
    expect(report.summary.playerRequestedMovePacingFlipCount).toBeGreaterThan(5);
    expect(report.summary.playerActualOnlyPacingFlipCount).toBeGreaterThan(5);
    expect(report.findings.some((finding) => finding.includes('heading reversals'))).toBe(true);
  });
});
