#!/usr/bin/env tsx
/**
 * Capture before/after screenshots for the post-bayer-dither task.
 *
 * Usage:
 *   npx tsx scripts/capture-bayer-dither-shots.ts --label master
 *   npx tsx scripts/capture-bayer-dither-shots.ts --label post-dither
 *
 * Boots `vite preview --outDir dist-perf` (perf-harness bundle, exposes
 * `window.__engine`), launches Playwright (Chromium, 1920x1080), starts each
 * scenario with `engine.startGameWithMode(...)`, then re-positions the
 * primary camera so the framing isolates the gradient we want reviewed:
 *
 *   1. combat120-sky-gradient: ai_sandbox, look up 60 deg toward zenith.
 *   2. ashau-distant-fog:      a_shau_valley, look horizontally so fog
 *                              falloff dominates the frame.
 *
 * Output PNGs land in
 *   docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/post-bayer-dither/
 *
 * The label suffix lets the same script capture master baselines (run once
 * before the dither change) and post-dither shots (run after) without
 * stomping the prior pair.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

type ShotPlan = {
  filename: string;
  mode: string;
  pose: Pose;
  description: string;
  // settle time after mode start before snapping (terrain stream, vegetation pop-in)
  settleSec: number;
};

const PORT = 9101;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUTPUT_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-20-atmosphere-foundation',
  'screenshots',
  'post-bayer-dither'
);

function parseLabel(): string {
  const arg = process.argv.find((a) => a.startsWith('--label='));
  if (arg) return arg.split('=')[1] ?? '';
  const idx = process.argv.indexOf('--label');
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return '';
}

function suffixFor(label: string): string {
  if (!label) return '';
  if (label === 'post-dither') return ''; // post-dither shots use the canonical names
  return `-${label}`;
}

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'combat120-sky-gradient',
      mode: 'ai_sandbox',
      // ai_sandbox spawns near terrain origin; lift camera well clear of
      // hills (Y=80) and tilt up 65 deg (rotation order YXZ, +X is pitch up)
      // so the shot is dominated by the sky-dome gradient (zenith through
      // mid-sky to horizon). The horizon line sits low in the frame so the
      // smooth zenith→horizon gradient — the most banding-prone surface in
      // the project — is the visual focus.
      pose: { position: [0, 80, 0], yawDeg: 0, pitchDeg: 65 },
      description: 'Looking up at sky dome from combat120 sandbox',
      settleSec: 6,
    },
    {
      filename: 'ashau-distant-fog',
      mode: 'a_shau_valley',
      // A Shau valley spawn varies; lift to a generous ridgeline elevation
      // (Y=300) and look ~horizontal toward a distant treeline so the fog
      // falloff (not the zenith gradient) is the dominant smooth gradient.
      // The horizon line sits roughly mid-frame.
      pose: { position: [0, 300, 0], yawDeg: 90, pitchDeg: -3 },
      description: 'Looking toward distant treeline, A Shau Valley',
      settleSec: 8,
    },
  ];
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as any).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as any).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
  }, mode);

  // Poll until gameStarted or 60s.
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

      // Stop the engine's RAF loop so per-frame systems do not overwrite our
      // pose. The harness leaves __engine intact; we just take the steering
      // wheel for the screenshot.
      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      // Force the WebGL renderer + post-process target to the full viewport
      // size so the screenshot lands at native resolution. We pass
      // updateStyle=true so the canvas's CSS box matches the buffer (the
      // page screenshot grabs CSS dimensions, not the internal renderbuffer).
      threeRenderer.setSize(vp.width, vp.height, true);
      if (pp && typeof pp.setSize === 'function') pp.setSize(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
      }

      camera.position.set(p.position[0], p.position[1], p.position[2]);
      const yawRad = (p.yawDeg * Math.PI) / 180;
      const pitchRad = (p.pitchDeg * Math.PI) / 180;
      // Match the engine's camera convention: yaw around Y, pitch around X.
      // Pitch +90° looks straight up; -90° looks straight down.
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitchRad, yawRad, 0);
      camera.updateMatrixWorld(true);

      // Keep the skybox glued to the new camera position so the gradient is
      // correctly sampled — same call the loop makes each frame.
      const skybox = engine.systemManager?.skybox;
      if (skybox && typeof skybox.updatePosition === 'function') {
        skybox.updatePosition(camera.position);
      }

      // Manual render through the same post-process pipeline the live loop uses.
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

async function captureScenario(page: Page, plan: ShotPlan, label: string): Promise<void> {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);

  // Let terrain / vegetation stream in while the live loop keeps running.
  logStep(`Settling ${plan.settleSec}s for ${plan.mode}`);
  await page.waitForTimeout(plan.settleSec * 1000);

  // Hide every DOM element except the WebGL canvas so the screenshot shows
  // only the post-processed game render (the brief asks for "no UI overlay
  // if avoidable"). The CSS-module class names are hashed, so we cannot
  // target the crosshair / HUD by class. Hiding non-canvas direct children
  // of body covers the HUD container, the crosshair overlay, the minimap,
  // and any other UI mounted at root.
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });

  // Stop the loop, pose the camera, render once through the post-process
  // pipeline, then screenshot. The single manual render is what we capture.
  await poseAndRender(page, plan.pose, VIEWPORT);
  const outFile = join(OUTPUT_DIR, `${plan.filename}${suffixFor(label)}.png`);
  await snap(page, outFile);

  // Restart the engine loop so the next mode can be initialised cleanly.
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && typeof engine.start === 'function') engine.start();
  });
}

async function main(): Promise<void> {
  const label = parseLabel();
  if (label && label !== 'master' && label !== 'post-dither') {
    throw new Error(`--label must be 'master' or 'post-dither' (got '${label}')`);
  }
  const effectiveLabel = label || 'post-dither';
  logStep(`Capturing screenshots with label='${effectiveLabel}'`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    logStep(`Created ${OUTPUT_DIR}`);
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

    for (const plan of shotPlans()) {
      try {
        await captureScenario(page, plan, effectiveLabel);
      } catch (err) {
        console.error(`Failed scenario ${plan.mode}:`, err);
        // continue to the next plan so partial captures still land
      }
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-bayer-dither-shots failed:', err);
  process.exit(1);
});
