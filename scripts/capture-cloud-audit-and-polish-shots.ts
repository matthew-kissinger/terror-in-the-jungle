#!/usr/bin/env tsx
/**
 * Capture per-mode cloud screenshots for the `cloud-audit-and-polish`
 * task. See `docs/tasks/cloud-audit-and-polish.md` for the audit
 * motivation (clouds invisible in 4 of 5 modes under the pre-audit
 * 3-octave threshold).
 *
 * Usage:
 *   npx tsx scripts/capture-cloud-audit-and-polish-shots.ts --label before
 *   npx tsx scripts/capture-cloud-audit-and-polish-shots.ts --label after
 *
 * Framings are sky-biased: camera is placed a few hundred meters below
 * the cloud plane (which sits at terrain-relative +1200m) and pitched
 * upward so the cloud field fills the upper half of the frame. All five
 * scenario presets are captured under their default (no-weather) state.
 *
 * Output: docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/cloud-audit-and-polish/{before,after}-<mode>.png
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

const PORT = 9211;
const VIEWPORT = { width: 1600, height: 900 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUTPUT_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-22-heap-and-polish',
  'evidence',
  'cloud-audit-and-polish'
);

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Build a pose that looks 90 degrees *away* from the sun azimuth so the
 * lit side of the cloud field is in frame without the sun disc blowing
 * out exposure. Pitch is modest (20 degrees) so we look out across the
 * cloud layer rather than straight up at the plane's 4km edge.
 */
function poseAwayFromSun(azimuthRad: number, position: [number, number, number], pitchDeg: number): Pose {
  const viewAz = azimuthRad + Math.PI / 2;
  const sx = Math.cos(viewAz);
  const sz = Math.sin(viewAz);
  const yawRad = Math.atan2(sx, -sz);
  return { position, yawDeg: (yawRad * 180) / Math.PI, pitchDeg };
}

/**
 * Sky-biased framings. Each shot sits a few hundred meters above local
 * ground and pitches 20 degrees up so the upper two-thirds of the frame
 * is sky. Yaw sits 90 degrees off the sun azimuth so the sun disc stays
 * off-frame (prevents the bloom that washed out zc-golden-hour at higher
 * pitches) while the sun-lit side of the cloud field stays visible.
 */
function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'ashau',
      mode: 'a_shau_valley',
      pose: poseAwayFromSun(Math.PI * 0.15, [0, 400, 0], 20),
      description: 'A Shau — morning overcast over jungle valley',
      settleSec: 8,
    },
    {
      filename: 'openfrontier',
      mode: 'open_frontier',
      pose: poseAwayFromSun(Math.PI * 0.25, [0, 200, 0], 20),
      description: 'Open Frontier — scattered fair-weather cumulus at noon',
      settleSec: 6,
    },
    {
      filename: 'tdm',
      mode: 'tdm',
      pose: poseAwayFromSun(Math.PI * 1.1, [0, 200, 0], 20),
      description: 'TDM — overcast dusk broken layers',
      settleSec: 6,
    },
    {
      filename: 'zc',
      mode: 'zone_control',
      pose: poseAwayFromSun(Math.PI * 0.78, [0, 200, 0], 20),
      description: 'Zone Control — golden hour broken clouds',
      settleSec: 6,
    },
    {
      filename: 'combat120',
      mode: 'ai_sandbox',
      pose: poseAwayFromSun(Math.PI * 0.25, [0, 200, 0], 20),
      description: 'combat120 — noon perf baseline',
      settleSec: 6,
    },
  ];
}

function parseLabel(): 'before' | 'after' {
  const idx = process.argv.indexOf('--label');
  if (idx < 0) return 'after';
  const v = process.argv[idx + 1];
  if (v === 'before' || v === 'after') return v;
  throw new Error(`invalid --label '${v}'; must be 'before' or 'after'`);
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

      // Reapply cloud/sky state so the frame we snap reflects the current
      // preset rather than whatever transient the startup pipeline left.
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
      // Advance the atmosphere a little so time-driven effects (like the
      // cloud drift) don't freeze at t=0 in the snap.
      if (atm && typeof atm.update === 'function') {
        try {
          atm.update(0.5);
        } catch {
          // non-fatal
        }
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

async function captureScenario(page: Page, plan: ShotPlan, label: 'before' | 'after'): Promise<void> {
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

  const outFile = join(OUTPUT_DIR, `${label}-${plan.filename}.png`);
  await snap(page, outFile);

  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && typeof engine.start === 'function') engine.start();
  });
}

async function main(): Promise<void> {
  const label = parseLabel();
  logStep(`Capturing cloud-audit screenshots with label='${label}'`);

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
        await captureScenario(page, plan, label);
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
  console.error('capture-cloud-audit-and-polish-shots failed:', err);
  process.exit(1);
});
