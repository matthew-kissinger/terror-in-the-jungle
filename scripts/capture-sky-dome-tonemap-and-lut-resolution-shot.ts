#!/usr/bin/env tsx
/**
 * Capture a single Open Frontier noon screenshot for
 * `cycle-sky-visual-restore` / task `sky-dome-tonemap-and-lut-resolution`.
 *
 * Per the autonomous-loop posture in `.claude/agents/orchestrator.md`:
 * the executor ships a Playwright dev-preview smoke capture; the owner
 * walk-through is deferred.
 *
 * Output:
 *   artifacts/cycle-sky-visual-restore/playtest-evidence/
 *     sky-dome-tonemap-and-lut-resolution-noon.png
 *
 * Also prints the `HosekWilkieSkyBackend.getRefreshStatsForDebug()`
 * payload after a measurement window so the PR description can quote
 * the LUT-bake EMA at the new 256x128 resolution.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9133;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const MODE = 'open_frontier';
const POSE = {
  position: [0, 120, 0] as [number, number, number],
  yawDeg: 45,
  pitchDeg: 25,
};
const SETTLE_SEC = 6;
const REFRESH_SAMPLE_SEC = 8; // long enough to cover several 2.0s bakes

const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-sky-visual-restore',
  'playtest-evidence'
);
const OUT_FILE = join(OUT_DIR, 'sky-dome-tonemap-and-lut-resolution-noon.png');

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__engine), undefined, {
    timeout: STARTUP_TIMEOUT_MS,
  });
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as any).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
  }, mode);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as any).__engine;
      return {
        gameStarted: Boolean(e?.gameStarted),
        phase: String(e?.startupFlow?.getState?.()?.phase ?? ''),
      };
    });
    if (state.gameStarted || state.phase === 'live') return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Mode ${mode} did not enter live phase`);
}

async function dismissBriefingIfPresent(page: Page): Promise<void> {
  const beginBtn = page.locator('[data-ref="beginBtn"]');
  try {
    if (await beginBtn.isVisible({ timeout: 1500 })) {
      await beginBtn.click();
      logStep('Dismissed mission briefing');
      await page.waitForTimeout(500);
    }
  } catch {
    // not present, fine
  }
}

async function readSkyRefreshStats(
  page: Page
): Promise<{ fireCount: number; totalMs: number; lastMs: number; avgMs: number } | null> {
  return page.evaluate(() => {
    const engine = (window as any).__engine;
    const atm = engine?.systemManager?.atmosphereSystem;
    const backend = atm?.hosekBackend ?? atm?.skyBackend ?? atm?.backend;
    if (backend && typeof backend.getRefreshStatsForDebug === 'function') {
      return backend.getRefreshStatsForDebug();
    }
    return null;
  });
}

async function resetSkyRefreshStats(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    const atm = engine?.systemManager?.atmosphereSystem;
    const backend = atm?.hosekBackend ?? atm?.skyBackend ?? atm?.backend;
    if (backend && typeof backend.resetRefreshStatsForDebug === 'function') {
      backend.resetRefreshStatsForDebug();
    }
  });
}

async function poseAndRender(
  page: Page,
  pose: typeof POSE,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.evaluate(
    ({ p, vp }: { p: typeof POSE; vp: { width: number; height: number } }) => {
      const engine = (window as any).__engine;
      const renderer = engine?.renderer;
      const camera = renderer?.camera;
      const threeRenderer = renderer?.renderer;
      const scene = renderer?.scene;
      const pp = renderer?.postProcessing;
      if (!engine || !camera || !threeRenderer || !scene) {
        throw new Error('engine/camera/renderer/scene unavailable');
      }

      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      threeRenderer.setSize(vp.width, vp.height, true);
      if (pp && typeof pp.setSize === 'function') pp.setSize(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
      }

      camera.position.set(p.position[0], p.position[1], p.position[2]);
      const yawRad = (p.yawDeg * Math.PI) / 180;
      const pitchRad = (p.pitchDeg * Math.PI) / 180;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitchRad, yawRad, 0);
      camera.updateMatrixWorld(true);

      const skybox = engine.systemManager?.skybox;
      if (skybox && typeof skybox.updatePosition === 'function') {
        skybox.updatePosition(camera.position);
      }
      const atm = engine.systemManager?.atmosphereSystem;
      if (atm && typeof atm.syncDomePosition === 'function') {
        atm.syncDomePosition(camera.position);
      }

      if (pp && typeof pp.beginFrame === 'function') pp.beginFrame();
      threeRenderer.render(scene, camera);
      if (pp && typeof pp.endFrame === 'function') pp.endFrame();
    },
    { p: pose, vp: viewport }
  );
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    logStep(`Created ${OUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      log: logStep,
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[browser] ${msg.text()}`);
      }
    });

    const url = `http://127.0.0.1:${PORT}/?perf=1&uiTransitions=0`;
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);

    await startMode(page, MODE);
    await dismissBriefingIfPresent(page);

    logStep(`Settling ${SETTLE_SEC}s for ${MODE}`);
    await page.waitForTimeout(SETTLE_SEC * 1000);

    // Measure LUT bake EMA over a sample window before posing the camera
    // and stopping the loop. Reset first so the window is clean.
    await resetSkyRefreshStats(page);
    logStep(`Sampling sky-refresh stats for ${REFRESH_SAMPLE_SEC}s`);
    await page.waitForTimeout(REFRESH_SAMPLE_SEC * 1000);
    const stats = await readSkyRefreshStats(page);
    if (stats) {
      logStep(
        `Sky refresh stats: fireCount=${stats.fireCount} avgMs=${stats.avgMs.toFixed(2)} lastMs=${stats.lastMs.toFixed(2)} totalMs=${stats.totalMs.toFixed(2)}`
      );
    } else {
      logStep('Sky refresh stats unavailable (backend not exposed on AtmosphereSystem)');
    }

    await page.addStyleTag({
      content: `
        body > *:not(canvas) { display: none !important; }
        canvas { position: fixed !important; inset: 0 !important; }
      `,
    });

    await poseAndRender(page, POSE, VIEWPORT);

    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    writeFileSync(OUT_FILE, buffer);
    logStep(`Wrote ${OUT_FILE} (${buffer.byteLength} bytes)`);

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-sky-dome-tonemap-and-lut-resolution-shot failed:', err);
  process.exit(1);
});
