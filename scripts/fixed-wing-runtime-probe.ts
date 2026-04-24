#!/usr/bin/env tsx

import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  cleanupPortListeners,
  isPortOpen,
  parseServerModeArg,
  startServer,
  stopServer,
  type ServerHandle,
  type ServerMode,
} from './preview-server';
import { FIXED_WING_CONFIGS } from '../src/systems/vehicle/FixedWingConfigs';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const STARTUP_TIMEOUT_MS = 120_000;
const CHUNK_MS = 500;

type ScenarioResult = {
  configKey: string;
  aircraftId: string;
  entered: boolean;
  touchMode: boolean | null;
  inputMode: string | null;
  finalState: unknown;
  liftoffAtMs: number | null;
  climbAtMs: number | null;
  orbitState: unknown;
  orbitValid: boolean | null;
  approachState: unknown;
  approachValid: boolean;
  bailoutState: unknown;
  bailoutValid: boolean;
  handoffState: unknown;
  handoffValid: boolean;
  samples: unknown[];
  renderState: string | null;
  success: boolean;
  screenshotPath: string | null;
  error?: string;
};

type ProbeStatus = 'partial' | 'passed' | 'failed';

function parseNumberArg(name: string, fallback: number): number {
  const key = `--${name}`;
  const eqArg = process.argv.find((arg) => arg.startsWith(`${key}=`));
  if (eqArg) {
    const parsed = Number(eqArg.split('=')[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  const index = process.argv.indexOf(key);
  if (index >= 0 && index + 1 < process.argv.length) {
    const parsed = Number(process.argv[index + 1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseBooleanArg(name: string, fallback: boolean): boolean {
  const key = `--${name}`;
  const eqArg = process.argv.find((arg) => arg.startsWith(`${key}=`));
  if (eqArg) {
    const value = eqArg.split('=')[1];
    return value !== '0' && value !== 'false';
  }
  const index = process.argv.indexOf(key);
  if (index >= 0 && index + 1 < process.argv.length) {
    const value = process.argv[index + 1];
    return value !== '0' && value !== 'false';
  }
  return fallback;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function createContext(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    } catch {
      // ignore
    }
    try {
      Object.defineProperty(window, 'ontouchstart', { value: undefined, configurable: true, writable: true });
    } catch {
      // ignore
    }
  });
  return context;
}

async function bootOpenFrontier(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  await page.waitForFunction(() => Boolean((window as any).__engine), undefined, { timeout: STARTUP_TIMEOUT_MS });
  await page.evaluate(() => {
    (window as any).__engine.startGameWithMode('open_frontier');
  });
  await page.waitForFunction(() => Boolean((window as any).__engine?.gameStarted), undefined, { timeout: STARTUP_TIMEOUT_MS });
  await page.waitForFunction(
    () => ((window as any).__engine.systemManager.fixedWingModel?.getAircraftIds?.().length ?? 0) > 0,
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function runScenario(page: Page, configKey: string): Promise<Omit<ScenarioResult, 'screenshotPath' | 'success'>> {
  const config = FIXED_WING_CONFIGS[configKey];
  if (!config) {
    throw new Error(`Unknown fixed-wing config: ${configKey}`);
  }
  await page.waitForFunction((targetKey) => {
    const model = (window as any).__engine?.systemManager?.fixedWingModel;
    return Boolean(
      model?.getAircraftIds?.().some((candidate: string) => model.getConfigKey(candidate) === targetKey),
    );
  }, configKey, { timeout: STARTUP_TIMEOUT_MS });
  const payload = JSON.stringify({
    targetKey: configKey,
    chunkMs: CHUNK_MS,
    vrSpeed: config.physics.vrSpeed,
    climbTargetAGL: configKey === 'F4_PHANTOM' ? 32 : 28,
    orbitMinAltitude: config.operation.orbitMinAltitude ?? null,
    playerFlow: config.operation.playerFlow,
  });
  return page.evaluate(`
    (async () => {
      const { targetKey, chunkMs, vrSpeed, climbTargetAGL, orbitMinAltitude, playerFlow } = ${payload};
      const engine = window.__engine;
      const model = engine.systemManager.fixedWingModel;
      const player = engine.systemManager.playerController;
      const input = player.input;
      const waitDeadline = performance.now() + 10_000;
      while (
        !model.getAircraftIds().some((candidate) => model.getConfigKey(candidate) === targetKey)
        && performance.now() < waitDeadline
      ) {
        await window.advanceTime(500);
      }
      const id = model.getAircraftIds().find((candidate) => model.getConfigKey(candidate) === targetKey);
      if (!id) {
        throw new Error('Missing fixed-wing aircraft for ' + targetKey);
      }

      const dispatchKey = (type, code, key) => {
        document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
      };

      model.positionAircraftAtRunwayStart(id);
      const group = model.groups.get(id);
      const Vector3Ctor = player.getPosition().constructor;
      player.enterFixedWing(id, new Vector3Ctor(group.position.x, group.position.y, group.position.z));
      const enteredAfterPlayerEntry = player.isInFixedWing?.() ?? false;
      const fixedWingIdAfterPlayerEntry = player.getFixedWingId?.() ?? null;

      const totalChunks = targetKey === 'F4_PHANTOM' ? 72 : 60;
      const samples = [];

      let rotateHeld = false;
      let liftoffAtMs = null;
      let climbAtMs = null;
      dispatchKey('keydown', 'KeyW', 'w');

      for (let chunk = 0; chunk < totalChunks; chunk++) {
        await window.advanceTime(chunkMs);
        const fd = model.getFlightData(id);
        if (!rotateHeld && fd.airspeed >= vrSpeed * 0.92) {
          dispatchKey('keydown', 'ArrowUp', 'ArrowUp');
          rotateHeld = true;
        }
        if (rotateHeld && fd.altitudeAGL >= climbTargetAGL) {
          dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
          rotateHeld = false;
        }
        if (liftoffAtMs === null && !fd.weightOnWheels) {
          liftoffAtMs = (chunk + 1) * chunkMs;
        }
        if (climbAtMs === null && fd.altitudeAGL >= climbTargetAGL) {
          climbAtMs = (chunk + 1) * chunkMs;
        }
        samples.push({
          simTimeMs: (chunk + 1) * chunkMs,
          airspeed: Number(fd.airspeed.toFixed(2)),
          altitudeAGL: Number(fd.altitudeAGL.toFixed(2)),
          phase: fd.phase,
          operationState: fd.operationState,
          throttle: Number(fd.throttle.toFixed(3)),
          heading: Number(fd.heading.toFixed(1)),
          stalled: fd.isStalled,
        });

        if (climbAtMs !== null) {
          break;
        }
      }

      if (rotateHeld) {
        dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
      }

      let orbitState = null;
      let orbitValid = null;
      if (playerFlow === 'gunship_orbit' && orbitMinAltitude !== null) {
        const orbitTargetAGL = orbitMinAltitude + 6;
        let orbitClimbAtMs = null;
        let orbitRotateHeld = false;

        for (let chunk = 0; chunk < 120; chunk++) {
          await window.advanceTime(chunkMs);
          const fd = model.getFlightData(id);
          if (!orbitRotateHeld && fd.altitudeAGL < orbitTargetAGL && fd.airspeed >= vrSpeed * 1.05) {
            dispatchKey('keydown', 'ArrowUp', 'ArrowUp');
            orbitRotateHeld = true;
          }
          if (orbitRotateHeld && (fd.altitudeAGL >= orbitTargetAGL || fd.isStalled)) {
            dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
            orbitRotateHeld = false;
          }
          samples.push({
            simTimeMs: (totalChunks + chunk + 1) * chunkMs,
            stage: 'orbit_climb',
            airspeed: Number(fd.airspeed.toFixed(2)),
            altitudeAGL: Number(fd.altitudeAGL.toFixed(2)),
            phase: fd.phase,
            operationState: fd.operationState,
            throttle: Number(fd.throttle.toFixed(3)),
            heading: Number(fd.heading.toFixed(1)),
            stalled: fd.isStalled,
          });
          if (fd.altitudeAGL >= orbitTargetAGL && !fd.isStalled) {
            orbitClimbAtMs = (totalChunks + chunk + 1) * chunkMs;
            break;
          }
        }

        if (orbitRotateHeld) {
          dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
        }

        dispatchKey('keydown', 'Space', ' ');
        await window.advanceTime(chunkMs);
        dispatchKey('keyup', 'Space', ' ');

        const orbitSamples = [];
        for (let chunk = 0; chunk < 12; chunk++) {
          await window.advanceTime(chunkMs);
          const fd = model.getFlightData(id);
          orbitSamples.push({
            simTimeMs: (totalChunks + 121 + chunk) * chunkMs,
            airspeed: Number(fd.airspeed.toFixed(2)),
            altitudeAGL: Number(fd.altitudeAGL.toFixed(2)),
            operationState: fd.operationState,
            orbitHoldEnabled: fd.orbitHoldEnabled,
            heading: Number(fd.heading.toFixed(1)),
            roll: Number(fd.roll.toFixed(2)),
            stalled: fd.isStalled,
          });
        }

        const orbitFlightData = model.getFlightData(id);
        orbitState = orbitFlightData
          ? {
              orbitClimbAtMs,
              controlPhase: orbitFlightData.controlPhase,
              operationState: orbitFlightData.operationState,
              orbitHoldEnabled: orbitFlightData.orbitHoldEnabled,
              altitudeAGL: Number(orbitFlightData.altitudeAGL.toFixed(2)),
              airspeed: Number(orbitFlightData.airspeed.toFixed(2)),
              heading: Number(orbitFlightData.heading.toFixed(1)),
              roll: Number(orbitFlightData.roll.toFixed(2)),
              weightOnWheels: orbitFlightData.weightOnWheels,
              stalled: orbitFlightData.isStalled,
              samples: orbitSamples,
            }
          : { orbitClimbAtMs };
        orbitValid = Boolean(
          orbitFlightData
          && orbitClimbAtMs !== null
          && orbitFlightData.weightOnWheels === false
          && orbitFlightData.isStalled === false
          && orbitFlightData.orbitHoldEnabled === true
          && orbitFlightData.operationState === 'orbit_hold'
        );
      }

      dispatchKey('keyup', 'KeyW', 'w');

      const finalState = model.getFlightData(id);
      const approachPositioned = model.positionAircraftOnApproach(id);
      const approachFlightData = model.getFlightData(id);
      await window.advanceTime(500);
      const approachPostStep = model.getFlightData(id);
      const approachState = approachFlightData
        ? {
            positioned: approachPositioned,
            controlPhase: approachFlightData.controlPhase,
            operationState: approachFlightData.operationState,
            phase: approachFlightData.phase,
            altitudeAGL: Number(approachFlightData.altitudeAGL.toFixed(2)),
            airspeed: Number(approachFlightData.airspeed.toFixed(2)),
            verticalSpeed: Number(approachFlightData.verticalSpeed.toFixed(2)),
            weightOnWheels: approachFlightData.weightOnWheels,
            stalled: approachFlightData.isStalled,
            postStepControlPhase: approachPostStep?.controlPhase ?? null,
            postStepOperationState: approachPostStep?.operationState ?? null,
          }
        : { positioned: approachPositioned };
      const approachValid = Boolean(
        approachPositioned
        && approachFlightData
        && approachFlightData.weightOnWheels === false
        && approachFlightData.isStalled === false
        && approachFlightData.controlPhase === 'approach'
        && approachFlightData.operationState === 'approach'
      );

      const bailoutPlayerBeforeExit = {
        inFixedWing: player.isInFixedWing?.() ?? null,
        fixedWingId: player.getFixedWingId?.() ?? null,
      };
      const bailoutFlightDataBeforeExit = model.getFlightData(id);
      dispatchKey('keydown', 'KeyE', 'e');
      await window.advanceTime(chunkMs);
      const bailoutImmediatePosition = player.getPosition();
      const bailoutPlayerImmediatelyAfterExit = {
        inFixedWing: player.isInFixedWing?.() ?? null,
        fixedWingId: player.getFixedWingId?.() ?? null,
        position: bailoutImmediatePosition
          ? {
              x: Number(bailoutImmediatePosition.x.toFixed(2)),
              y: Number(bailoutImmediatePosition.y.toFixed(2)),
              z: Number(bailoutImmediatePosition.z.toFixed(2)),
            }
          : null,
      };
      dispatchKey('keyup', 'KeyE', 'e');
      await window.advanceTime(1000);
      const bailoutFlightDataAfterExit = model.getFlightData(id);
      const bailoutPlayerPosition = player.getPosition();
      const bailoutPlayerAfterExit = {
        inFixedWing: player.isInFixedWing?.() ?? null,
        fixedWingId: player.getFixedWingId?.() ?? null,
        position: bailoutPlayerPosition
          ? {
              x: Number(bailoutPlayerPosition.x.toFixed(2)),
              y: Number(bailoutPlayerPosition.y.toFixed(2)),
              z: Number(bailoutPlayerPosition.z.toFixed(2)),
            }
          : null,
      };
      const bailoutState = {
        exitPath: 'keyboard',
        playerBeforeExit: bailoutPlayerBeforeExit,
        playerImmediatelyAfterExit: bailoutPlayerImmediatelyAfterExit,
        playerAfterExit: bailoutPlayerAfterExit,
        flightDataBeforeExit: bailoutFlightDataBeforeExit
          ? {
              operationState: bailoutFlightDataBeforeExit.operationState,
              controlPhase: bailoutFlightDataBeforeExit.controlPhase,
              airspeed: Number(bailoutFlightDataBeforeExit.airspeed.toFixed(2)),
              altitude: Number(bailoutFlightDataBeforeExit.altitude.toFixed(2)),
              altitudeAGL: Number(bailoutFlightDataBeforeExit.altitudeAGL.toFixed(2)),
              weightOnWheels: bailoutFlightDataBeforeExit.weightOnWheels,
              stalled: bailoutFlightDataBeforeExit.isStalled,
            }
          : null,
        flightDataAfterExit: bailoutFlightDataAfterExit
          ? {
              operationState: bailoutFlightDataAfterExit.operationState,
              controlPhase: bailoutFlightDataAfterExit.controlPhase,
              airspeed: Number(bailoutFlightDataAfterExit.airspeed.toFixed(2)),
              altitudeAGL: Number(bailoutFlightDataAfterExit.altitudeAGL.toFixed(2)),
              weightOnWheels: bailoutFlightDataAfterExit.weightOnWheels,
              stalled: bailoutFlightDataAfterExit.isStalled,
            }
          : null,
      };
      const bailoutValid = Boolean(
        bailoutFlightDataBeforeExit
        && bailoutPlayerBeforeExit.inFixedWing === true
        && bailoutPlayerBeforeExit.fixedWingId === id
        && bailoutFlightDataBeforeExit.weightOnWheels === false
        && bailoutFlightDataBeforeExit.altitudeAGL > 5
        && bailoutPlayerImmediatelyAfterExit.inFixedWing === false
        && bailoutPlayerImmediatelyAfterExit.fixedWingId === null
        && bailoutPlayerImmediatelyAfterExit.position !== null
        && bailoutPlayerImmediatelyAfterExit.position.y >= bailoutFlightDataBeforeExit.altitude - 20
        && bailoutFlightDataAfterExit
      );

      const handoffLineupPositioned = model.positionAircraftAtRunwayStart(id);
      const handoffGroup = model.groups.get(id);
      if (handoffGroup) {
        player.enterFixedWing(id, new Vector3Ctor(handoffGroup.position.x, handoffGroup.position.y, handoffGroup.position.z));
      }
      model.detachNPCPilot?.(id);
      const metadata = model.getSpawnMetadata?.(id);
      const runwayStart = metadata?.runwayStart ?? null;
      const homePosition = runwayStart?.position?.clone?.()
        ?? handoffGroup?.position?.clone?.()
        ?? new Vector3Ctor(0, 0, 0);
      const targetPosition = homePosition.clone().add(new Vector3Ctor(600, 0, -600));
      const handoffAttached = Boolean(model.attachNPCPilot?.(id, {
        kind: 'orbit',
        waypoints: [],
        target: {
          position: targetPosition,
          minAttackAltM: 80,
        },
        bingo: {
          fuelFraction: 0.05,
          ammoFraction: 0.0,
        },
        homeAirfield: {
          runwayStart: homePosition.clone(),
          runwayHeading: runwayStart?.heading ?? 0,
        },
        orbitDurationSec: 20,
        orbitRadiusM: 300,
      }));
      const handoffPilotWhilePlayer = model.getNPCPilot?.(id) ?? null;
      const handoffWhilePlayerState = handoffPilotWhilePlayer?.getState?.() ?? null;
      const handoffPlayerBeforeExit = {
        inFixedWing: player.isInFixedWing?.() ?? null,
        fixedWingId: player.getFixedWingId?.() ?? null,
      };
      dispatchKey('keydown', 'KeyE', 'e');
      await window.advanceTime(chunkMs);
      dispatchKey('keyup', 'KeyE', 'e');
      await window.advanceTime(1500);
      const handoffPilotAfterExit = model.getNPCPilot?.(id) ?? null;
      const handoffAfterExitState = handoffPilotAfterExit?.getState?.() ?? null;
      const handoffFlightData = model.getFlightData(id);
      const handoffPlayerAfterExit = {
        inFixedWing: player.isInFixedWing?.() ?? null,
        fixedWingId: player.getFixedWingId?.() ?? null,
      };
      const handoffState = {
        lineupPositioned: handoffLineupPositioned,
        npcAttached: handoffAttached,
        playerBeforeExit: handoffPlayerBeforeExit,
        exitPath: 'keyboard',
        npcStateWhilePlayer: handoffWhilePlayerState,
        playerAfterExit: handoffPlayerAfterExit,
        npcStateAfterExit: handoffAfterExitState,
        npcTransitionLog: handoffPilotAfterExit?.getTransitionLog?.() ?? [],
        flightDataAfterExit: handoffFlightData
          ? {
              operationState: handoffFlightData.operationState,
              controlPhase: handoffFlightData.controlPhase,
              airspeed: Number(handoffFlightData.airspeed.toFixed(2)),
              altitudeAGL: Number(handoffFlightData.altitudeAGL.toFixed(2)),
              throttle: Number(handoffFlightData.throttle.toFixed(3)),
              brake: Number(handoffFlightData.brake.toFixed(3)),
              weightOnWheels: handoffFlightData.weightOnWheels,
              stalled: handoffFlightData.isStalled,
            }
          : null,
      };
      const handoffValid = Boolean(
        handoffLineupPositioned
        && handoffAttached
        && fixedWingIdAfterPlayerEntry === id
        && handoffPlayerBeforeExit.inFixedWing === true
        && handoffPlayerBeforeExit.fixedWingId === id
        && handoffWhilePlayerState === 'COLD'
        && handoffPlayerAfterExit.inFixedWing === false
        && handoffPlayerAfterExit.fixedWingId === null
        && handoffAfterExitState !== null
        && handoffAfterExitState !== 'COLD'
        && handoffFlightData
      );

      return {
        configKey: targetKey,
        aircraftId: id,
        entered: enteredAfterPlayerEntry,
        touchMode: input?.getIsTouchMode?.() ?? null,
        inputMode: input?.getLastInputMode?.() ?? null,
        finalState,
        liftoffAtMs,
        climbAtMs,
        orbitState,
        orbitValid,
        approachState,
        approachValid,
        bailoutState,
        bailoutValid,
        handoffState,
        handoffValid,
        samples,
        renderState: typeof window.render_game_to_text === 'function'
          ? window.render_game_to_text()
          : null,
      };
    })()
  `);
}

function printSummaryTable(results: ScenarioResult[]): void {
  const rows = results.map((r) => {
    const finalState = r.finalState as {
      altitudeAGL?: number;
      airspeed?: number;
      phase?: string;
      isStalled?: boolean;
    } | null;
    return {
      aircraft: r.configKey,
      success: r.success ? 'yes' : 'no',
      liftoffSec: r.liftoffAtMs !== null && r.liftoffAtMs !== undefined
        ? (r.liftoffAtMs / 1000).toFixed(2)
        : '—',
      climbSec: r.climbAtMs !== null && r.climbAtMs !== undefined
        ? (r.climbAtMs / 1000).toFixed(2)
        : '—',
      finalAltM: finalState?.altitudeAGL !== undefined
        ? finalState.altitudeAGL.toFixed(1)
        : '—',
      finalSpeedMs: finalState?.airspeed !== undefined
        ? finalState.airspeed.toFixed(1)
        : '—',
      phase: finalState?.phase ?? '—',
      stalled: finalState?.isStalled === true ? 'yes' : 'no',
      orbit: r.orbitValid === null ? 'n/a' : r.orbitValid ? 'yes' : 'no',
      approach: r.approachValid ? 'yes' : 'no',
      bailout: r.bailoutValid ? 'yes' : 'no',
      handoff: r.handoffValid ? 'yes' : 'no',
    };
  });

  const headers: Array<keyof typeof rows[number]> = [
    'aircraft', 'success', 'liftoffSec', 'climbSec', 'finalAltM', 'finalSpeedMs', 'phase', 'stalled', 'orbit', 'approach', 'bailout', 'handoff',
  ];
  const widths = headers.map((h) => Math.max(
    String(h).length,
    ...rows.map((r) => String(r[h]).length),
  ));

  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('');
  console.log('Fixed-wing runtime probe summary:');
  console.log(fmt(headers.map(String)));
  console.log(fmt(widths.map((w) => '-'.repeat(w))));
  for (const row of rows) {
    console.log(fmt(headers.map((h) => String(row[h]))));
  }
  console.log('');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function makeFailureResult(
  configKey: string,
  error: unknown,
  screenshotPath: string | null,
): ScenarioResult {
  return {
    configKey,
    aircraftId: '',
    entered: false,
    touchMode: null,
    inputMode: null,
    finalState: null,
    liftoffAtMs: null,
    climbAtMs: null,
    orbitState: null,
    orbitValid: null,
    approachState: null,
    approachValid: false,
    bailoutState: null,
    bailoutValid: false,
    handoffState: null,
    handoffValid: false,
    samples: [],
    renderState: null,
    success: false,
    screenshotPath,
    error: formatError(error),
  };
}

function writeProbeSummary(
  artifactDir: string,
  port: number,
  results: ScenarioResult[],
  status: ProbeStatus,
  error?: unknown,
): void {
  const summary = {
    timestamp: new Date().toISOString(),
    port,
    status,
    error: error === undefined ? undefined : formatError(error),
    results,
  };
  writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const port = parseNumberArg('port', DEFAULT_PORT);
  const headed = parseBooleanArg('headed', false);
  // Default OFF: fresh spawn + explicit teardown per run.
  const reuseServer = parseBooleanArg('reuse-server', parseBooleanArg('reuse-dev-server', false));
  // Default 'perf': preview the perf-harness bundle (prod-shape with
  // diagnostic hooks compiled in via VITE_PERF_HARNESS=1). See
  // scripts/preview-server.ts and docs/PERFORMANCE.md for the full story.
  const serverMode: ServerMode = parseServerModeArg(process.argv, 'perf');
  const artifactDir = join(process.cwd(), 'artifacts', 'fixed-wing-runtime-probe');
  ensureDir(artifactDir);

  let server: ServerHandle | null = null;
  try {
    if (reuseServer && (await isPortOpen(port, HOST))) {
      console.log(`[probe] reusing existing ${serverMode} server on :${port}`);
    } else {
      cleanupPortListeners(port, (msg) => console.log(`[probe] ${msg}`));
      server = await startServer({
        mode: serverMode,
        host: HOST,
        port,
        startupTimeoutMs: STARTUP_TIMEOUT_MS,
        forceBuild: serverMode !== 'dev',
        stdio: 'ignore',
        log: (msg) => console.log(`[probe] ${msg}`),
      });
    }

    const browser = await chromium.launch({
      headless: !headed,
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const results: ScenarioResult[] = [];
    const url = `http://${HOST}:${port}/?perf=1`;
    for (const configKey of ['A1_SKYRAIDER', 'F4_PHANTOM', 'AC47_SPOOKY']) {
      let context: BrowserContext | null = null;
      let page: Page | null = null;
      try {
        context = await createContext(browser);
        page = await context.newPage();
        await bootOpenFrontier(page, url);
        const scenario = await runScenario(page, configKey);
        const screenshotPath = join(artifactDir, `${configKey.toLowerCase()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 0 });
        const finalState = scenario.finalState as {
          altitudeAGL?: number;
          phase?: string;
          isStalled?: boolean;
        } | null;
        const success = Boolean(
          scenario.entered
          && scenario.touchMode === false
          && finalState
          && finalState.isStalled === false
          && scenario.liftoffAtMs !== null
          && scenario.climbAtMs !== null
          && scenario.orbitValid !== false
          && (finalState.phase === 'airborne' || (finalState.altitudeAGL ?? 0) > 0.2)
          && scenario.approachValid
          && scenario.bailoutValid
          && scenario.handoffValid
        );
        results.push({
          ...scenario,
          success,
          screenshotPath,
        });
        writeProbeSummary(artifactDir, port, results, 'partial');
      } catch (error) {
        let failureScreenshotPath: string | null = null;
        if (page && !page.isClosed()) {
          failureScreenshotPath = join(artifactDir, `${configKey.toLowerCase()}-failure.png`);
          try {
            await page.screenshot({ path: failureScreenshotPath, fullPage: false, timeout: 0 });
          } catch {
            failureScreenshotPath = null;
          }
        }
        results.push(makeFailureResult(configKey, error, failureScreenshotPath));
        writeProbeSummary(artifactDir, port, results, 'failed', error);
        throw error;
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }

    writeProbeSummary(artifactDir, port, results, 'passed');
    printSummaryTable(results);
    await browser.close();

    const failures = results.filter((result) => !result.success).map((result) => result.configKey);
    if (failures.length > 0) {
      throw new Error(`Fixed-wing runtime probe failed for: ${failures.join(', ')}`);
    }
  } finally {
    if (server) {
      await stopServer(server);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
