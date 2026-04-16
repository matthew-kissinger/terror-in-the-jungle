#!/usr/bin/env tsx

import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { Socket } from 'net';

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
  samples: unknown[];
  renderState: string | null;
  success: boolean;
  screenshotPath: string;
};

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => resolve(false));
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

function cleanupPortListeners(port: number): void {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf-8' });
      const pids = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts.length >= 5 && parts[3] === 'LISTENING')
        .map((parts) => Number(parts[4]))
        .filter((pid) => Number.isFinite(pid) && pid > 0);
      for (const pid of new Set(pids)) {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
        console.log(`[probe] cleared stale listener on :${port} (pid=${pid})`);
      }
    } catch {
      // best effort
    }
    return;
  }

  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf-8' });
    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((pid) => Number(pid))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
    for (const pid of new Set(pids)) {
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`[probe] cleared stale listener on :${port} (pid=${pid})`);
      } catch {
        // already gone
      }
    }
  } catch {
    try {
      execSync(`fuser -k ${port}/tcp`, { encoding: 'utf-8', stdio: 'ignore' });
    } catch {
      // best effort
    }
  }
}

function startDevServer(host: string, port: number): ChildProcess {
  let proc: ChildProcess;
  if (process.platform === 'win32') {
    proc = spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --host ${host} --port ${port}`], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: false,
    });
  } else {
    proc = spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: false,
    });
  }
  console.log(`[probe] dev-server spawned pid=${proc.pid ?? 'unknown'} on ${host}:${port}`);
  return proc;
}

async function stopDevServer(proc: ChildProcess): Promise<void> {
  const pid = proc.pid;
  if (proc.killed || !pid) {
    console.log(`[probe] dev-server already exited (pid=${pid ?? 'unknown'})`);
    return;
  }
  console.log(`[probe] stopping dev-server pid=${pid}`);
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    // Brief grace window for the child exit event.
    await sleep(500);
    console.log(`[probe] dev-server stopped pid=${pid} (killed=${proc.killed})`);
    return;
  }
  let exited = false;
  proc.once('exit', () => { exited = true; });
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    proc.kill('SIGTERM');
  }
  await sleep(1000);
  if (!exited) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
    }
    await sleep(500);
  }
  console.log(`[probe] dev-server stopped pid=${pid} (exited=${exited})`);
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
  const payload = JSON.stringify({ targetKey: configKey, chunkMs: CHUNK_MS });
  return page.evaluate(`
    (async () => {
      const { targetKey, chunkMs } = ${payload};
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

      const vrSpeed = model.getPhysics(id).cfg.vrSpeed;
      const totalChunks = targetKey === 'F4_PHANTOM' ? 40 : 34;
      const releaseAltitude = targetKey === 'F4_PHANTOM' ? 10 : 8;
      const samples = [];

      let rotateHeld = false;
      let liftoffAtMs = null;
      dispatchKey('keydown', 'KeyW', 'w');

      for (let chunk = 0; chunk < totalChunks; chunk++) {
        await window.advanceTime(chunkMs);
        const fd = model.getFlightData(id);
        if (!rotateHeld && fd.airspeed >= vrSpeed * 0.92) {
          dispatchKey('keydown', 'ArrowUp', 'ArrowUp');
          rotateHeld = true;
        }
        if (rotateHeld && fd.altitudeAGL >= releaseAltitude) {
          dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
          rotateHeld = false;
        }
        if (liftoffAtMs === null && !fd.weightOnWheels) {
          liftoffAtMs = (chunk + 1) * chunkMs;
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

        if (fd.altitudeAGL >= 12) {
          break;
        }
      }

      if (rotateHeld) {
        dispatchKey('keyup', 'ArrowUp', 'ArrowUp');
      }
      dispatchKey('keyup', 'KeyW', 'w');

      return {
        configKey: targetKey,
        aircraftId: id,
        entered: player.isInFixedWing?.() ?? false,
        touchMode: input?.getIsTouchMode?.() ?? null,
        inputMode: input?.getLastInputMode?.() ?? null,
        finalState: model.getFlightData(id),
        liftoffAtMs,
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
      finalAltM: finalState?.altitudeAGL !== undefined
        ? finalState.altitudeAGL.toFixed(1)
        : '—',
      finalSpeedMs: finalState?.airspeed !== undefined
        ? finalState.airspeed.toFixed(1)
        : '—',
      phase: finalState?.phase ?? '—',
      stalled: finalState?.isStalled === true ? 'yes' : 'no',
    };
  });

  const headers: Array<keyof typeof rows[number]> = [
    'aircraft', 'success', 'liftoffSec', 'finalAltM', 'finalSpeedMs', 'phase', 'stalled',
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

async function main(): Promise<void> {
  const port = parseNumberArg('port', DEFAULT_PORT);
  const headed = parseBooleanArg('headed', false);
  // Default OFF: fresh spawn + explicit teardown per run. Pass --reuse-dev-server=1
  // when iterating locally and a clean dev server is already running.
  const reuseDevServer = parseBooleanArg('reuse-dev-server', false);
  const artifactDir = join(process.cwd(), 'artifacts', 'fixed-wing-runtime-probe');
  ensureDir(artifactDir);

  let server: ChildProcess | null = null;
  let startedServer = false;
  try {
    if (reuseDevServer && (await isPortOpen(HOST, port))) {
      console.log(`[probe] reusing existing dev server on :${port}`);
    } else {
      cleanupPortListeners(port);
      server = startDevServer(HOST, port);
      startedServer = true;
      await waitForPort(HOST, port, STARTUP_TIMEOUT_MS);
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
      const context = await createContext(browser);
      const page = await context.newPage();
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
        && (finalState.phase === 'airborne' || (finalState.altitudeAGL ?? 0) > 0.2)
      );
      results.push({
        ...scenario,
        success,
        screenshotPath,
      });
      await context.close();
    }

    const summary = {
      timestamp: new Date().toISOString(),
      port,
      results,
    };
    writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    printSummaryTable(results);
    await browser.close();
  } finally {
    if (server && startedServer) {
      await stopDevServer(server);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
