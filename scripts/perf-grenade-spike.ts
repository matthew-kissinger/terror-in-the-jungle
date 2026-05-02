#!/usr/bin/env tsx

import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  cleanupPortListeners,
  parseServerModeArg,
  startServer,
  stopServer,
  type ServerHandle,
  type ServerMode,
} from './preview-server';

type ConsoleEntry = {
  type: string;
  text: string;
};

type FrameSnapshot = {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch33Count: number;
  hitch50Count: number;
  hitch100Count: number;
};

type ProbeSnapshot = {
  label: string;
  atMs: number;
  frame: FrameSnapshot;
  renderer: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  } | null;
  systemTop: Array<{ name: string; emaMs: number; peakMs: number }>;
  browserStalls: unknown;
};

type TriggerResult = {
  ok: boolean;
  reason?: string;
  atMs?: number;
  frameCount?: number;
  position?: { x: number; y: number; z: number };
};

type ParsedArgs = {
  mode: string;
  npcs: number;
  seed: number;
  port: number;
  headed: boolean;
  forceBuild: boolean;
  serverMode: ServerMode;
  warmupMs: number;
  baselineMs: number;
  postMs: number;
  baselineFrames: number;
  postFrames: number;
  grenadeCount: number;
  grenadeIntervalMs: number;
};

const HOST = '127.0.0.1';
const DEFAULT_PORT = 9182;
const DEFAULT_MODE = 'ai_sandbox';
const DEFAULT_NPCS = 120;
const DEFAULT_SEED = 2718;
const DEFAULT_WARMUP_MS = 10000;
const DEFAULT_BASELINE_MS = 2000;
const DEFAULT_POST_MS = 3000;
const DEFAULT_BASELINE_FRAMES = 90;
const DEFAULT_POST_FRAMES = 90;
const DEFAULT_GRENADE_COUNT = 1;
const DEFAULT_GRENADE_INTERVAL_MS = 1000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OBSERVER_SCRIPT_PATH = join(process.cwd(), 'scripts', 'perf-browser-observers.js');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readStringFlag(args: string[], name: string, fallback: string): string {
  const eqArg = args.find((arg) => arg.startsWith(`--${name}=`));
  if (eqArg) {
    return eqArg.slice(name.length + 3);
  }
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return fallback;
}

function readNumberFlag(args: string[], name: string, fallback: number): number {
  const value = Number(readStringFlag(args, name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  return {
    mode: readStringFlag(args, 'mode', DEFAULT_MODE),
    npcs: readNumberFlag(args, 'npcs', DEFAULT_NPCS),
    seed: readNumberFlag(args, 'seed', DEFAULT_SEED),
    port: readNumberFlag(args, 'port', DEFAULT_PORT),
    headed: args.includes('--headed'),
    forceBuild: args.includes('--force-build'),
    serverMode: parseServerModeArg(args, 'perf'),
    warmupMs: readNumberFlag(args, 'warmup-ms', DEFAULT_WARMUP_MS),
    baselineMs: readNumberFlag(args, 'baseline-ms', DEFAULT_BASELINE_MS),
    postMs: readNumberFlag(args, 'post-ms', DEFAULT_POST_MS),
    baselineFrames: readNumberFlag(args, 'baseline-frames', DEFAULT_BASELINE_FRAMES),
    postFrames: readNumberFlag(args, 'post-frames', DEFAULT_POST_FRAMES),
    grenadeCount: readNumberFlag(args, 'grenades', DEFAULT_GRENADE_COUNT),
    grenadeIntervalMs: readNumberFlag(args, 'grenade-interval-ms', DEFAULT_GRENADE_INTERVAL_MS),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLiveRuntime(page: Page): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const w = window as any;
      const beginButton = document.querySelector('[data-ref="beginBtn"]') as HTMLButtonElement | null;
      if (beginButton) {
        beginButton.click();
      }
      const metrics = w.__metrics?.getSnapshot?.();
      return {
        hasEngine: Boolean(w.__engine),
        gameStarted: Boolean(w.__engine?.gameStarted),
        frameCount: Number(metrics?.frameCount ?? 0),
        hudPhase: String(document.querySelector('#game-hud-root')?.getAttribute('data-phase') ?? ''),
        errorPanelVisible: Boolean(document.querySelector('.error-panel')),
      };
    });

    if (state.errorPanelVisible) {
      throw new Error('Game error panel became visible while waiting for live runtime');
    }
    if (state.hasEngine && state.gameStarted && state.frameCount >= 30) {
      return;
    }
    await sleep(250);
  }
  throw new Error('Timed out waiting for live runtime');
}

async function resetProbeState(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const w = window;
    w.__metrics?.reset?.();
    w.perf?.reset?.();
    w.__perfHarnessObservers?.reset?.();
    performance.clearMarks?.();
    performance.clearMeasures?.();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    w.__perfHarnessObservers?.drain?.();
    w.__metrics?.reset?.();
    w.perf?.reset?.();
    w.__perfHarnessObservers?.reset?.();
    performance.clearMarks?.();
    performance.clearMeasures?.();
  })()`);
}

async function waitForFrameWindow(
  page: Page,
  minFrames: number,
  minMs: number,
  timeoutMs: number,
): Promise<{ frameCount: number; elapsedMs: number }> {
  const startedAt = Date.now();
  let lastFrameCount = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const frameCount = await page.evaluate(() => {
      const metrics = (window as any).__metrics?.getSnapshot?.();
      return Number(metrics?.frameCount ?? 0);
    });
    lastFrameCount = frameCount;
    const elapsedMs = Date.now() - startedAt;
    if (frameCount >= minFrames && elapsedMs >= minMs) {
      return { frameCount, elapsedMs };
    }
    await sleep(250);
  }

  return {
    frameCount: lastFrameCount,
    elapsedMs: Date.now() - startedAt,
  };
}

async function takeSnapshot(page: Page, label: string): Promise<ProbeSnapshot> {
  return page.evaluate((snapshotLabel: string) => {
    const w = window as any;
    const metrics = w.__metrics?.getSnapshot?.();
    const rendererStats = w.__renderer?.getPerformanceStats?.();
    const report = w.perf?.report?.();
    const browserStalls = w.__perfHarnessObservers?.drain?.() ?? null;
    return {
      label: snapshotLabel,
      atMs: performance.now(),
      frame: {
        frameCount: Number(metrics?.frameCount ?? 0),
        avgFrameMs: Number(metrics?.avgFrameMs ?? 0),
        p95FrameMs: Number(metrics?.p95FrameMs ?? 0),
        p99FrameMs: Number(metrics?.p99FrameMs ?? 0),
        maxFrameMs: Number(metrics?.maxFrameMs ?? 0),
        hitch33Count: Number(metrics?.hitch33Count ?? 0),
        hitch50Count: Number(metrics?.hitch50Count ?? 0),
        hitch100Count: Number(metrics?.hitch100Count ?? 0),
      },
      renderer: rendererStats ? {
        drawCalls: Number(rendererStats.drawCalls ?? 0),
        triangles: Number(rendererStats.triangles ?? 0),
        geometries: Number(rendererStats.geometries ?? 0),
        textures: Number(rendererStats.textures ?? 0),
        programs: Number(rendererStats.programs ?? 0),
      } : null,
      systemTop: Array.isArray(report?.systemBreakdown)
        ? report.systemBreakdown.slice(0, 5).map((entry: any) => ({
            name: String(entry?.name ?? 'unknown'),
            emaMs: Number(entry?.emaMs ?? 0),
            peakMs: Number(entry?.peakMs ?? 0),
          }))
        : [],
      browserStalls,
    };
  }, label);
}

async function triggerGrenade(page: Page): Promise<TriggerResult> {
  return page.evaluate(() => {
    const w = window as any;
    const engine = w.__engine;
    const grenadeSystem = engine?.systemManager?.grenadeSystem;
    const playerController = engine?.systemManager?.playerController;
    if (!grenadeSystem || typeof grenadeSystem.spawnProjectile !== 'function') {
      return { ok: false, reason: 'grenadeSystem.spawnProjectile unavailable' };
    }
    if (!playerController || typeof playerController.getPosition !== 'function') {
      return { ok: false, reason: 'playerController.getPosition unavailable' };
    }

    const position = playerController.getPosition().clone();
    position.y += 2;
    const velocity = position.clone();
    velocity.set(0, -12, 0);

    performance.mark('kb-effects.grenade.spawnProjectile.begin');
    grenadeSystem.spawnProjectile(position, velocity, 0.001, 'kb-effects-probe');
    performance.mark('kb-effects.grenade.spawnProjectile.end');
    performance.measure(
      'kb-effects.grenade.spawnProjectile',
      'kb-effects.grenade.spawnProjectile.begin',
      'kb-effects.grenade.spawnProjectile.end',
    );
    performance.clearMarks('kb-effects.grenade.spawnProjectile.begin');
    performance.clearMarks('kb-effects.grenade.spawnProjectile.end');
    const metrics = w.__metrics?.getSnapshot?.();

    return {
      ok: true,
      atMs: performance.now(),
      frameCount: Number(metrics?.frameCount ?? 0),
      position: {
        x: Number(position.x),
        y: Number(position.y),
        z: Number(position.z),
      },
    };
  });
}

function getUserTiming(snapshot: ProbeSnapshot): Record<string, { count: number; totalDurationMs: number; maxDurationMs: number }> {
  const stalls = snapshot.browserStalls as {
    recent?: {
      userTimingByName?: Record<string, { count?: number; totalDurationMs?: number; maxDurationMs?: number }>;
    };
    totals?: {
      userTimingByName?: Record<string, { count?: number; totalDurationMs?: number; maxDurationMs?: number }>;
    };
  } | null;
  const source = stalls?.recent?.userTimingByName ?? stalls?.totals?.userTimingByName ?? {};
  return Object.fromEntries(
    Object.entries(source).map(([name, value]) => [
      name,
      {
        count: Number(value?.count ?? 0),
        totalDurationMs: Number(value?.totalDurationMs ?? 0),
        maxDurationMs: Number(value?.maxDurationMs ?? 0),
      },
    ]),
  );
}

async function stopProfiler(cdp: CDPSession): Promise<unknown> {
  try {
    const result = await cdp.send('Profiler.stop');
    return result?.profile ?? null;
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  const options = parseArgs();
  cleanupPortListeners(options.port);

  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];

  const artifactDir = join(
    ARTIFACT_ROOT,
    timestampSlug(),
    `grenade-spike-${options.mode.replaceAll('_', '-')}`,
  );
  mkdirSync(artifactDir, { recursive: true });

  try {
    server = await startServer({
      mode: options.serverMode,
      port: options.port,
      forceBuild: options.forceBuild,
      log: (message) => console.log(message),
    });

    browser = await chromium.launch({
      headless: !options.headed,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-frame-rate-limit',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');

    page.on('console', (message) => {
      consoleEntries.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.stack ?? error));
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        requestErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.addInitScript({ content: 'window.__perfHarnessDisableWebglTextureUploadObserver = true;' });
    await page.addInitScript({ content: readFileSync(OBSERVER_SCRIPT_PATH, 'utf-8') });
    const url = `http://${HOST}:${options.port}/?sandbox=true&perf=1&uiTransitions=0&npcs=${options.npcs}&autostart=true&duration=600&combat=true&logLevel=warn&seed=${options.seed}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 180_000 });
    await waitForLiveRuntime(page);

    await sleep(options.warmupMs);
    await resetProbeState(page);
    const baselineWindow = await waitForFrameWindow(
      page,
      options.baselineFrames,
      options.baselineMs,
      Math.max(options.baselineMs + 20_000, 30_000),
    );
    const baseline = await takeSnapshot(page, 'baseline');

    await resetProbeState(page);
    await cdp.send('Profiler.start');
    const triggers: TriggerResult[] = [];
    for (let i = 0; i < options.grenadeCount; i++) {
      const trigger = await triggerGrenade(page);
      triggers.push(trigger);
      if (!trigger.ok) {
        throw new Error(trigger.reason ?? 'Grenade trigger failed');
      }
      if (i + 1 < options.grenadeCount) {
        await sleep(options.grenadeIntervalMs);
      }
    }
    const detonationWindow = await waitForFrameWindow(
      page,
      options.postFrames,
      options.postMs,
      Math.max(options.postMs + 20_000, 30_000),
    );
    const detonation = await takeSnapshot(page, 'detonation');
    const cpuProfile = await stopProfiler(cdp);

    const userTiming = getUserTiming(detonation);
    const summary = {
      createdAt: new Date().toISOString(),
      artifactDir,
      url,
      options,
      measurementCaveat: 'WebGL/browser observers are diagnostic instrumentation. Use this artifact for attribution, not uncontaminated baseline gating.',
      triggers,
      windows: {
        baseline: baselineWindow,
        detonation: detonationWindow,
      },
      baseline: {
        frame: baseline.frame,
        renderer: baseline.renderer,
        systemTop: baseline.systemTop,
      },
      detonation: {
        frame: detonation.frame,
        renderer: detonation.renderer,
        systemTop: detonation.systemTop,
        userTiming,
      },
      deltas: {
        maxFrameMs: detonation.frame.maxFrameMs - baseline.frame.maxFrameMs,
        p99FrameMs: detonation.frame.p99FrameMs - baseline.frame.p99FrameMs,
        hitch33Count: detonation.frame.hitch33Count - baseline.frame.hitch33Count,
        hitch50Count: detonation.frame.hitch50Count - baseline.frame.hitch50Count,
        hitch100Count: detonation.frame.hitch100Count - baseline.frame.hitch100Count,
      },
      errorCounts: {
        console: consoleEntries.length,
        pageErrors: pageErrors.length,
        requestErrors: requestErrors.length,
      },
    };

    writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    writeFileSync(join(artifactDir, 'baseline-snapshot.json'), JSON.stringify(baseline, null, 2), 'utf-8');
    writeFileSync(join(artifactDir, 'detonation-snapshot.json'), JSON.stringify(detonation, null, 2), 'utf-8');
    writeFileSync(join(artifactDir, 'console.json'), JSON.stringify({ consoleEntries, pageErrors, requestErrors }, null, 2), 'utf-8');
    if (cpuProfile) {
      writeFileSync(join(artifactDir, 'cpu-profile.cpuprofile'), JSON.stringify(cpuProfile), 'utf-8');
    }

    console.log(`Grenade spike probe complete: ${artifactDir}`);
    console.log(JSON.stringify({
      baselineMaxFrameMs: summary.baseline.frame.maxFrameMs,
      detonationMaxFrameMs: summary.detonation.frame.maxFrameMs,
      maxFrameMsDelta: summary.deltas.maxFrameMs,
      userTiming: summary.detonation.userTiming,
    }, null, 2));

    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await stopServer(server);
    }
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
