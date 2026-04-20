#!/usr/bin/env tsx
/**
 * Capture before/after screenshots for the atmosphere-hosek-wilkie-sky task.
 *
 * Usage:
 *   npx tsx scripts/capture-hosek-wilkie-shots.ts --label master
 *   npx tsx scripts/capture-hosek-wilkie-shots.ts --label post
 *
 * Boots `vite preview --outDir dist-perf` (perf-harness bundle, exposes
 * `window.__engine`), launches Playwright (Chromium, 1920x1080), starts
 * each scenario with `engine.startGameWithMode(...)`, then re-positions
 * the primary camera so the framing is dominated by the sky dome.
 *
 * Required outputs (per docs/tasks/atmosphere-hosek-wilkie-sky.md):
 *   - combat120-noon.png       (ai_sandbox)
 *   - ashau-dawn.png           (a_shau_valley)
 *   - openfrontier-noon.png    (open_frontier)
 *   - tdm-dusk.png             (tdm)
 *   - zc-golden-hour.png       (zone_control)
 *
 * With `--label master` the same shots are captured into the cycle's
 * `_master/` directory with a `-master` suffix so executors landing
 * downstream tasks (`atmosphere-fog-tinted-by-sky`,
 * `atmosphere-sun-hemisphere-coupling`) have pre-change baselines for
 * the four scenarios that have no historical perf-harness reference.
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
  settleSec: number;
};

const PORT = 9102;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const POST_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-20-atmosphere-foundation',
  'screenshots',
  'atmosphere-hosek-wilkie-sky'
);
const MASTER_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-20-atmosphere-foundation',
  'screenshots',
  '_master'
);

function parseLabel(): 'master' | 'post' {
  const flagged = process.argv.find((a) => a.startsWith('--label='));
  const explicit = flagged
    ? flagged.split('=')[1]
    : process.argv[process.argv.indexOf('--label') + 1];
  if (explicit === 'master' || explicit === 'post') return explicit;
  return 'post';
}

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Camera framings. Each pose aims AT the sun direction the matching
 * preset chose (yaw computed from the preset azimuth + Three.js YXZ
 * camera convention: camera forward at yaw=0 is -Z, so yaw to face a
 * world-space direction (sx, _, sz) is `atan2(sx, -sz)`). Pitch is set
 * just above horizon so the warm horizon halo + the zenith gradient
 * both land in frame.
 */
function poseTowardSun(azimuthRad: number, position: [number, number, number], pitchDeg: number): Pose {
  const sx = Math.cos(azimuthRad);
  const sz = Math.sin(azimuthRad);
  const yawRad = Math.atan2(sx, -sz);
  return { position, yawDeg: (yawRad * 180) / Math.PI, pitchDeg };
}

function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'combat120-noon',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'AI sandbox / combat120 — noon, perf-neutral preset',
      settleSec: 6,
    },
    {
      filename: 'ashau-dawn',
      mode: 'a_shau_valley',
      pose: poseTowardSun(Math.PI * 0.15, [0, 300, 0], 5),
      description: 'A Shau Valley — dawn patrol, low warm sun',
      settleSec: 8,
    },
    {
      filename: 'openfrontier-noon',
      mode: 'open_frontier',
      pose: poseTowardSun(Math.PI * 0.25, [0, 120, 0], 25),
      description: 'Open Frontier — high noon, deep zenith blue',
      settleSec: 6,
    },
    {
      filename: 'tdm-dusk',
      mode: 'tdm',
      pose: poseTowardSun(Math.PI * 1.1, [0, 80, 0], 8),
      description: 'TDM — dusk, low orange sun + heavy haze',
      settleSec: 6,
    },
    {
      filename: 'zc-golden-hour',
      mode: 'zone_control',
      pose: poseTowardSun(Math.PI * 0.78, [0, 100, 0], 12),
      description: 'Zone Control — golden hour, oblique warm light',
      settleSec: 6,
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

      // Stop the engine RAF so per-frame systems do not overwrite our pose.
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

      // Glue both the legacy Skybox (if still mounted) and the analytic
      // dome to the new camera position.
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

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

async function captureScenario(page: Page, plan: ShotPlan, label: 'master' | 'post'): Promise<void> {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);

  logStep(`Settling ${plan.settleSec}s for ${plan.mode}`);
  await page.waitForTimeout(plan.settleSec * 1000);

  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });

  await poseAndRender(page, plan.pose, VIEWPORT);

  const outDir = label === 'master' ? MASTER_DIR : POST_DIR;
  const suffix = label === 'master' ? '-master' : '';
  const outFile = join(outDir, `${plan.filename}${suffix}.png`);
  await snap(page, outFile);

  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && typeof engine.start === 'function') engine.start();
  });
}

async function main(): Promise<void> {
  const label = parseLabel();
  logStep(`Capturing screenshots with label='${label}'`);

  const outDir = label === 'master' ? MASTER_DIR : POST_DIR;
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
    logStep(`Created ${outDir}`);
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

    // For master baselines, only capture the four scenarios that have
    // no historical perf-harness reference. combat120 already has
    // `_master/combat120-2026-04-19.png` from the perf harness; skip it
    // unless the executor explicitly wants a refreshed framing.
    const plans = shotPlans().filter((plan) =>
      label === 'post' ? true : plan.filename !== 'combat120-noon'
    );

    for (const plan of plans) {
      try {
        await captureScenario(page, plan, label);
      } catch (err) {
        console.error(`Failed scenario ${plan.mode}:`, err);
      }
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-hosek-wilkie-shots failed:', err);
  process.exit(1);
});
