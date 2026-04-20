#!/usr/bin/env tsx
/**
 * Capture the 5 screenshot-gate PNGs for the `fog-density-rebalance` PR.
 * See `docs/tasks/fog-density-rebalance.md` ("Screenshot evidence") for
 * the required shots and the orchestrator's visual review contract.
 *
 * Usage:
 *   npx tsx scripts/capture-fog-density-rebalance-shots.ts
 *
 * Reuses the preview-server + engine-pose infrastructure pioneered by
 * `scripts/capture-hosek-wilkie-shots.ts` and
 * `scripts/capture-fog-tinted-by-sky-shots.ts`. The clear-weather framings
 * diff directly against the post-tone-mapping-aces baseline captured in
 * `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/post-tone-mapping-aces/`.
 *
 * Required outputs (written to this task's screenshot dir):
 *   - combat120-noon.png         (ai_sandbox, clear)
 *   - ashau-dawn.png             (a_shau_valley, clear)
 *   - openfrontier-noon.png      (open_frontier, clear)
 *   - combat120-storm.png        (ai_sandbox, STORM forced on)
 *   - combat120-underwater.png   (ai_sandbox, underwater override)
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
  override?: 'storm' | 'underwater';
};

const PORT = 9104;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUTPUT_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-21-atmosphere-polish-and-fixes',
  'screenshots',
  'fog-density-rebalance'
);

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function poseTowardSun(azimuthRad: number, position: [number, number, number], pitchDeg: number): Pose {
  const sx = Math.cos(azimuthRad);
  const sz = Math.sin(azimuthRad);
  const yawRad = Math.atan2(sx, -sz);
  return { position, yawDeg: (yawRad * 180) / Math.PI, pitchDeg };
}

/**
 * Camera framings match `capture-hosek-wilkie-shots.ts` byte-for-byte for
 * the three clear-weather shots so the reviewer can diff
 * `post-tone-mapping-aces/<shot>.png` against `fog-density-rebalance/<shot>.png`
 * at identical framings. The storm + underwater shots reuse combat120's
 * framing so weather-multiplier + underwater-override effects land in the
 * same frame coordinates.
 */
function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'combat120-noon',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 noon — distant terrain reads as terrain in fog, not flat white',
      settleSec: 6,
    },
    {
      filename: 'ashau-dawn',
      mode: 'a_shau_valley',
      pose: poseTowardSun(Math.PI * 0.15, [0, 300, 0], 5),
      description: 'A Shau dawn — ridgelines visible through thin warm haze',
      settleSec: 8,
    },
    {
      filename: 'openfrontier-noon',
      mode: 'open_frontier',
      pose: poseTowardSun(Math.PI * 0.25, [0, 120, 0], 25),
      description: 'Open Frontier noon — distant terrain visible, sky gradient clean',
      settleSec: 6,
    },
    {
      filename: 'combat120-storm',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 with storm forced on — fog visibly thicker than clear (x3.5 multiplier)',
      settleSec: 6,
      override: 'storm',
    },
    {
      filename: 'combat120-underwater',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 underwater — fog snaps to teal (0x003344, density 0.04)',
      settleSec: 6,
      override: 'underwater',
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

async function applyOverride(page: Page, override: 'storm' | 'underwater' | undefined): Promise<void> {
  if (!override) return;
  await page.evaluate((kind: 'storm' | 'underwater') => {
    const engine = (window as any).__engine;
    const weather = engine?.systemManager?.weatherSystem;
    if (!weather) throw new Error('weatherSystem unavailable');

    if (kind === 'storm') {
      // The ai_sandbox mode does not enable weather config, so we have to
      // prime the weather system with a minimal enabled config before
      // calling setWeatherState; otherwise `update()` returns early and
      // the storm darken factor never propagates to the atmosphere system.
      weather.setWeatherConfig({
        enabled: true,
        initialState: 'clear',
        transitionChance: 0,
        cycleDuration: { min: 999, max: 999 },
      });
      weather.setWeatherState('storm', true);
    } else if (kind === 'underwater') {
      weather.setUnderwater(true);
    }
  }, override);
  // Let a few frames pass so the weather/atmosphere state settles.
  await page.waitForTimeout(500);
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

      // Tick the atmosphere one more time with the current renderer so
      // the fog-color path runs against the (possibly overridden) weather
      // state before we freeze the RAF for the snap.
      try {
        engine.systemManager?.atmosphereSystem?.update?.(0);
      } catch {
        // non-fatal
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

async function captureScenario(page: Page, plan: ShotPlan): Promise<void> {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);

  logStep(`Settling ${plan.settleSec}s for ${plan.mode}`);
  await page.waitForTimeout(plan.settleSec * 1000);

  await applyOverride(page, plan.override);

  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });

  await poseAndRender(page, plan.pose, VIEWPORT);

  const outFile = join(OUTPUT_DIR, `${plan.filename}.png`);
  await snap(page, outFile);

  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && typeof engine.start === 'function') engine.start();
  });
}

async function main(): Promise<void> {
  logStep('Capturing fog-density-rebalance screenshots');

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
        await captureScenario(page, plan);
      } catch (err) {
        console.error(`Failed scenario ${plan.filename}:`, err);
      }
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-fog-density-rebalance-shots failed:', err);
  process.exit(1);
});
