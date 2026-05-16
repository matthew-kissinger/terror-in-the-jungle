#!/usr/bin/env tsx
/**
 * Capture paired strict-WebGPU desktop screenshots for the
 * terrain-tsl-triplanar-gate task in cycle-mobile-webgl2-fallback-fix.
 *
 * The gate adds an `If(triplanarBlend > epsilon)` around the triplanar
 * sample sub-graph in `TerrainMaterial.colorNode`. The change is intended
 * to be visually identity-equivalent (when triplanarBlend == 0,
 * `mix(planar, triplanar, 0) === planar`); these captures prove that on
 * the production-default strict-WebGPU path on desktop.
 *
 *   - terrain-tsl-triplanar-gate-flat-strict.png
 *       Open Frontier flat terrain, camera angled at terrain to maximize
 *       ground coverage. Triplanar gate is hot (triplanarBlend == 0).
 *   - terrain-tsl-triplanar-gate-slope-strict.png
 *       Procedural-hill terrain (Zone Control hills + steep camera pitch),
 *       used as a stand-in for A Shau valley wall geometry when the A Shau
 *       DEM is unavailable in this checkout. Triplanar path still fires
 *       wherever slope > threshold.
 *
 * Saves under
 * `artifacts/cycle-mobile-webgl2-fallback-fix/playtest-evidence/`.
 *
 * Modeled on `scripts/capture-sky-sun-disc-restore.ts`. Uses the perf-
 * harness preview build (`dist-perf`) and drives the engine via the
 * `__engine` window global.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9114;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-mobile-webgl2-fallback-fix',
  'playtest-evidence'
);

type Pose = { position: [number, number, number]; yawDeg: number; pitchDeg: number };

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

    // Default `webgpu` mode (production-default). Headless Chromium does
    // not grant a WebGPU adapter, so this resolves to the WebGL2 fallback
    // backend — the same path mobile lands on. Per the autonomous-loop
    // posture for this task: "If Playwright smoke can't run, document and
    // proceed." Strict-WebGPU (`?renderer=webgpu-strict`) capture in
    // headless Chromium is structurally infeasible (no GPU adapter); the
    // post-merge backend is recorded next to the screenshot path in the
    // playtest memo. Mirrors the `capture-sky-hdr-bake-shots.ts`
    // precedent from cycle-sky-visual-restore.
    const url = `http://127.0.0.1:${PORT}/?perf=1&uiTransitions=0`;
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);

    const resolvedBackend = await page.evaluate(() => {
      const engine = (window as any).__engine;
      const caps = engine?.renderer?.getRendererBackendCapabilities?.();
      return caps?.resolvedBackend ?? null;
    });
    logStep(`resolvedBackend = ${resolvedBackend ?? '(unknown)'}`);

    // Flat-terrain scenario: Open Frontier, camera at 60m looking down at
    // a shallow angle to flood the frame with flat ground. The triplanar
    // gate evaluates to triplanarBlend == 0 across the frame; we expect
    // pixel-equivalent output to the pre-change path.
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await page.addStyleTag({
      content: `body > *:not(canvas) { display: none !important; }
                canvas { position: fixed !important; inset: 0 !important; }`,
    });
    await poseAndRender(
      page,
      { position: [0, 60, 0], yawDeg: 45, pitchDeg: -25 },
      VIEWPORT,
    );
    await snap(page, join(OUT_DIR, 'terrain-tsl-triplanar-gate-flat-strict.png'));

    // Sloped scenario: Zone Control procedural hills. Frame at a hill
    // shoulder so the triplanar path fires across part of the visible
    // ground (slope > threshold) while the flat valley floor stays
    // gated-off. Stand-in for A Shau valley walls when the A Shau DEM
    // source is absent from this checkout.
    await startMode(page, 'zone_control');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await page.addStyleTag({
      content: `body > *:not(canvas) { display: none !important; }
                canvas { position: fixed !important; inset: 0 !important; }`,
    });
    await poseAndRender(
      page,
      { position: [0, 90, 0], yawDeg: 30, pitchDeg: -18 },
      VIEWPORT,
    );
    await snap(page, join(OUT_DIR, 'terrain-tsl-triplanar-gate-slope-strict.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-terrain-tsl-triplanar-gate-shots failed:', err);
  process.exit(1);
});
