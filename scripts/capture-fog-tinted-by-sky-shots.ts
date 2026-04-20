#!/usr/bin/env tsx
/**
 * Capture the 5 screenshot-gate PNGs for the `atmosphere-fog-tinted-by-sky`
 * PR. See `docs/tasks/atmosphere-fog-tinted-by-sky.md` ("Screenshot
 * evidence (required for merge)") for the required shots and the
 * orchestrator's visual review contract.
 *
 * Usage:
 *   npx tsx scripts/capture-fog-tinted-by-sky-shots.ts
 *
 * Reuses the preview-server + engine-pose infrastructure pioneered by
 * `scripts/capture-hosek-wilkie-shots.ts`; camera framings for the
 * seam-diff shots (`combat120-noon`, `ashau-dawn`, `tdm-dusk`) are
 * identical to the Hosek-Wilkie shots so the reviewer can diff "seam
 * present" vs "seam gone" side-by-side.
 *
 * Required outputs:
 *   - combat120-noon.png         (ai_sandbox, clear)
 *   - ashau-dawn.png             (a_shau_valley, clear)
 *   - tdm-dusk.png               (tdm, clear)
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
  /**
   * Optional per-shot override applied right before the snap. `storm`
   * forces `WeatherState.STORM` via `weatherSystem.setWeatherState`;
   * `underwater` forces the underwater override via
   * `weatherSystem.setUnderwater(true)`. The shots without overrides
   * just re-shoot the hosek-wilkie framings so the horizon seam diff is
   * obvious.
   */
  override?: 'storm' | 'underwater';
};

const PORT = 9103;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUTPUT_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-20-atmosphere-foundation',
  'screenshots',
  'atmosphere-fog-tinted-by-sky'
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
 * The three seam-diff shots reuse camera framings from
 * `capture-hosek-wilkie-shots.ts` byte-for-byte — same position, same
 * pitch, same azimuth-derived yaw — so the reviewer diffs "hard seam"
 * (pre-task) vs "seam gone" (post-task) directly.
 *
 * The storm + underwater shots use combat120's camera framing so the
 * weather / override effects land in the same frame coordinates.
 */
function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'combat120-noon',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 noon — seam-gone diff against hosek-wilkie/combat120-noon',
      settleSec: 6,
    },
    {
      filename: 'ashau-dawn',
      mode: 'a_shau_valley',
      pose: poseTowardSun(Math.PI * 0.15, [0, 300, 0], 5),
      description: 'A Shau Valley dawn — warm horizon should bleed into fog seamlessly',
      settleSec: 8,
    },
    {
      filename: 'tdm-dusk',
      mode: 'tdm',
      pose: poseTowardSun(Math.PI * 1.1, [0, 80, 0], 8),
      description: 'TDM dusk — hardest color match (orange sun, heavy haze)',
      settleSec: 6,
    },
    {
      filename: 'combat120-storm',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 with storm forced on — fog visibly darker than clear',
      settleSec: 6,
      override: 'storm',
    },
    {
      filename: 'combat120-underwater',
      mode: 'ai_sandbox',
      pose: poseTowardSun(Math.PI * 0.25, [0, 80, 0], 20),
      description: 'combat120 with underwater override — fog snaps to teal (0x003344)',
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
      // STORM state, instant (skip transition) — atmosphere darkens fog
      // via the `FogTintIntentReceiver` wired in GameplayRuntimeComposer.
      // `WeatherState` is a string enum (see `src/config/gameModeTypes.ts`),
      // so the raw string matches the runtime value byte-for-byte.
      weather.setWeatherState('storm', true);
    } else if (kind === 'underwater') {
      // Underwater override: atmosphere snaps fog.color to 0x003344
      // regardless of the live sky sample.
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
      // the fog-color path has a chance to run against the (possibly
      // overridden) weather state before we freeze the RAF.
      try {
        engine.systemManager?.atmosphereSystem?.update?.(0);
      } catch {
        // non-fatal; the RAF above would have run it anyway
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
  logStep('Capturing fog-tinted-by-sky screenshots');

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
  console.error('capture-fog-tinted-by-sky-shots failed:', err);
  process.exit(1);
});
