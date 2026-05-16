#!/usr/bin/env tsx
/**
 * Capture noon + sub-horizon screenshots for cycle-sky-visual-restore /
 * sky-sun-disc-restore. Saves under
 * `artifacts/cycle-sky-visual-restore/playtest-evidence/`.
 *
 * Uses the same vite preview / engine probe pattern as
 * scripts/capture-hosek-wilkie-shots.ts. Intentionally narrow — we only
 * need the openfrontier-noon framing (visible pearl) and a forced
 * nadir scenario (sprite hidden).
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9112;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-sky-visual-restore',
  'playtest-evidence'
);

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as any).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
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
      await page.waitForTimeout(500);
    }
  } catch {
    // not present
  }
}

type Pose = { position: [number, number, number]; yawDeg: number; pitchDeg: number };

async function poseAndRender(page: Page, pose: Pose, viewport: { width: number; height: number }): Promise<void> {
  await page.evaluate(
    ({ p, vp }: { p: Pose; vp: { width: number; height: number } }) => {
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

      const atm = engine.systemManager?.atmosphereSystem;
      if (atm && typeof atm.syncDomePosition === 'function') {
        atm.syncDomePosition(camera.position);
      }
      // Force a tick so the sun-disc updates against the new pose.
      if (atm && typeof atm.update === 'function') atm.update(0.016);

      if (pp && typeof pp.beginFrame === 'function') pp.beginFrame();
      threeRenderer.render(scene, camera);
      if (pp && typeof pp.endFrame === 'function') pp.endFrame();
    },
    { p: pose, vp: viewport }
  );
}

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

async function forceSunBelowHorizon(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    const atm = engine?.systemManager?.atmosphereSystem;
    if (!atm) return;
    // Hack the internal sun-direction so the disc hides itself. We also
    // wipe the preset reference and burn down the sky-texture refresh
    // timer so the dome re-bakes the pearl at the new (sub-horizon)
    // position too — otherwise the cached 2 s-old texture keeps painting
    // the disc and the visual diff is ambiguous.
    (atm as any).currentScenario = undefined;
    (atm as any).sunDirection.set(0.7, -0.5, 0.5).normalize();
    const hosek = (atm as any).hosekBackend;
    if (hosek) {
      hosek.skyTextureRefreshTimer = 9999;
      hosek.skyContentChanged = true;
      // Two updates: first to mark dirty + rebake LUT, second to actually
      // push the bake through the 2 s timer gate.
      if (typeof atm.update === 'function') {
        atm.update(0.016);
        atm.update(3.0);
      }
    } else if (typeof atm.update === 'function') {
      atm.update(0.016);
    }
  });
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
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
      if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`);
    });

    const url = `http://127.0.0.1:${PORT}/?perf=1&uiTransitions=0`;
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);

    // Noon framing — match the cycle's owner reference shot at
    // openfrontier-noon (sun azimuth = pi/4, sun high).
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await page.addStyleTag({
      content: `body > *:not(canvas) { display: none !important; }
                canvas { position: fixed !important; inset: 0 !important; }`,
    });
    // Aim the camera directly at the sun so the pearl lands centre-frame.
    // sun.y at openfrontier noon is sin(76deg) ~ 0.97, so pitch must be near
    // vertical — atan2 of vertical-vs-horizontal sun components.
    const noonAz = Math.PI * 0.25;
    const sunElevRad = Math.PI * 0.42; // matches openfrontier preset
    const sx = Math.cos(sunElevRad) * Math.cos(noonAz);
    const sy = Math.sin(sunElevRad);
    const sz = Math.cos(sunElevRad) * Math.sin(noonAz);
    const yawDeg = (Math.atan2(sx, -sz) * 180) / Math.PI;
    const horizDist = Math.hypot(sx, sz);
    const pitchDeg = (Math.atan2(sy, horizDist) * 180) / Math.PI;
    await poseAndRender(page, { position: [0, 120, 0], yawDeg, pitchDeg }, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sky-sun-disc-restore-noon.png'));

    // Sub-horizon scenario: force the sun direction below the horizon
    // and re-render. The disc must hide itself; this is the visual
    // companion to the unit test.
    await forceSunBelowHorizon(page);
    await poseAndRender(page, { position: [0, 120, 0], yawDeg, pitchDeg }, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sky-sun-disc-restore-nadir.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-sky-sun-disc-restore failed:', err);
  process.exit(1);
});
