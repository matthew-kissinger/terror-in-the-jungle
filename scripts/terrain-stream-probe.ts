#!/usr/bin/env tsx

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { Socket } from 'net';

type TerrainStreamSample = {
  atMs: number;
  frameCount: number;
  terrainStreams: Array<{
    name: string;
    budgetMs: number;
    timeMs: number;
    pendingUnits: number;
  }>;
};

type ProbeResult = {
  capturedAt: string;
  mode: string;
  port: number;
  moveStep: number;
  samples: TerrainStreamSample[];
};

type StartupProbe = {
  frameCount: number;
  hasEngine: boolean;
  hasMetrics: boolean;
  gameStarted: boolean;
  gameStartPending: boolean;
  errorPanelVisible: boolean;
};

function getPositionals(): string[] {
  return process.argv.slice(2).filter(arg => !arg.startsWith('--'));
}

function parseStringArg(name: string, fallback: string): string {
  const key = `--${name}`;
  const eqArg = process.argv.find(a => a.startsWith(`${key}=`));
  if (eqArg) return eqArg.split('=')[1] ?? fallback;
  const index = process.argv.indexOf(key);
  return index >= 0 && index + 1 < process.argv.length
    ? String(process.argv[index + 1])
    : fallback;
}

function parseNumberArg(name: string, fallback: number, positionalIndex?: number): number {
  const raw = parseStringArg(name, String(fallback));
  if (raw !== String(fallback)) {
    const parsedNamed = Number(raw);
    if (Number.isFinite(parsedNamed)) {
      return parsedNamed;
    }
  }

  if (typeof positionalIndex === 'number') {
    const positional = getPositionals()[positionalIndex];
    const parsedPositional = Number(positional);
    if (Number.isFinite(parsedPositional)) {
      return parsedPositional;
    }
  }

  return fallback;
}

function parseBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new Socket();
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

function startDevServer(host: string, port: number): ChildProcess {
  return spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
    stdio: 'ignore',
    shell: true,
  });
}

async function stopDevServer(proc: ChildProcess): Promise<void> {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  await sleep(1000);
  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
}

async function main(): Promise<void> {
  const host = '127.0.0.1';
  const port = parseNumberArg('port', 9101, 4);
  const mode = parseStringArg('mode', 'a_shau_valley');
  const samples = parseNumberArg('samples', 8, 1);
  const intervalMs = parseNumberArg('interval-ms', 1000, 2);
  const settleMs = parseNumberArg('settle-ms', 12000, 3);
  const startupTimeoutMs = parseNumberArg('startup-timeout-ms', 120000);
  const moveStep = parseNumberArg('move-step', 0);
  const headed = parseBooleanFlag('headed');
  // Terrain probes want sandbox diagnostics and input behavior, but must not
  // auto-start AI sandbox before we request the target mode.
  const appUrl = `http://${host}:${port}/terror-in-the-jungle/?perf=1&sandbox=1&autostart=0&logLevel=warn&losHeightPrefilter=0`;

  let server: ChildProcess | null = null;
  const portAlreadyOpen = await isPortOpen(host, port);
  if (!portAlreadyOpen) {
    server = startDevServer(host, port);
    await waitForPort(host, port, 30000);
  }

  const browser = await chromium.launch({ headless: !headed });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(appUrl, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => {
      const engine = (window as any).__engine;
      return !!engine && typeof engine.startGameWithMode === 'function' && !!(window as any).__metrics;
    }, undefined, { timeout: 120000 });

    await page.evaluate((requestedMode: string) => {
      const engine = (window as any).__engine;
      if (!engine || typeof engine.startGameWithMode !== 'function') {
        throw new Error('Engine unavailable for terrain probe startup');
      }
      void Promise.resolve(engine.startGameWithMode(requestedMode)).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[terrain-stream-probe] startGameWithMode failed: ${message}`);
      });
    }, mode);
    await waitForRendering(page, startupTimeoutMs);

    await page.waitForTimeout(settleMs);

    const result: ProbeResult = {
      capturedAt: new Date().toISOString(),
      mode,
      port,
      moveStep,
      samples: [],
    };

    for (let i = 0; i < samples; i++) {
      if (moveStep > 0) {
        await page.evaluate(({ step, index }: { step: number; index: number }) => {
          const engine = (window as any).__engine;
          const player = engine?.systemManager?.playerController;
          const terrain = engine?.systemManager?.terrainSystem;
          if (!player || typeof player.getPosition !== 'function' || typeof player.setPosition !== 'function') {
            return;
          }
          const current = player.getPosition();
          const dx = step;
          const dz = index % 2 === 0 ? step * 0.5 : step;
          const x = current.x + dx;
          const z = current.z + dz;
          const y = typeof terrain?.getEffectiveHeightAt === 'function'
            ? Number(terrain.getEffectiveHeightAt(x, z)) + 2
            : current.y;
          player.setPosition({ x, y, z }, 'terrain-stream-probe');
        }, { step: moveStep, index: i + 1 });
      }

      const sample = await page.evaluate((atMs: number) => ({
        atMs,
        frameCount: Number((window as any).__metrics?.getSnapshot?.()?.frameCount ?? 0),
        terrainStreams: ((window as any).__engine?.systemManager?.terrainSystem?.getStreamingMetrics?.() ?? []).map((stream: any) => ({
          name: String(stream?.name ?? 'unknown'),
          budgetMs: Number(stream?.budgetMs ?? 0),
          timeMs: Number(stream?.timeMs ?? 0),
          pendingUnits: Number(stream?.pendingUnits ?? 0),
        })),
      }), i * intervalMs);
      result.samples.push(sample);
      await page.waitForTimeout(intervalMs);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const artifactDir = join(process.cwd(), 'artifacts', 'perf');
    if (!existsSync(artifactDir)) {
      mkdirSync(artifactDir, { recursive: true });
    }
    const outPath = join(artifactDir, `terrain-stream-probe-${mode}-${stamp}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`Terrain stream probe written: ${outPath}`);
  } finally {
    await browser.close();
    if (server) {
      await stopDevServer(server);
    }
  }
}

async function waitForRendering(
  page: import('playwright').Page,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastFrameCount = 0;

  while (Date.now() < deadline) {
    const probe = await page.evaluate((): StartupProbe => ({
      frameCount: Number((window as any).__metrics?.getSnapshot?.()?.frameCount ?? 0),
      hasEngine: Boolean((window as any).__engine),
      hasMetrics: Boolean((window as any).__metrics),
      gameStarted: Boolean((window as any).__engine?.gameStarted),
      gameStartPending: Boolean((window as any).__engine?.gameStartPending),
      errorPanelVisible: Boolean(document.querySelector('.error-panel')),
    }));

    if (probe.errorPanelVisible) {
      throw new Error('Startup failed: error panel became visible');
    }

    if (probe.gameStarted && probe.frameCount >= 10 && probe.frameCount > lastFrameCount) {
      return;
    }

    lastFrameCount = Math.max(lastFrameCount, probe.frameCount);
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for rendering startup (lastFrameCount=${lastFrameCount})`);
}

main().catch((error) => {
  console.error('Terrain stream probe failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
