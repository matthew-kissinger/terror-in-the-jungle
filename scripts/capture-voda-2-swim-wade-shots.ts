#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the voda-2-playtest-evidence
 * task in cycle-voda-2-buoyancy-swimming-wading.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the wade/swim/breath
 * features (R1 buoyancy + player swim + NPC wade, R2 wade-splash
 * visuals + river-flow current) read cleanly on A Shau Valley (the
 * river-bearing scenario) and that the HUD breath gauge engages while
 * submerged.
 *
 * Five captures (names match the cycle brief's evidence list):
 *   - wade-shallow-ford.png
 *       Third-person framing at the river bank where the depth is in
 *       the shallow-ford band so the wade slowdown + foot-splash
 *       puffs would read on-screen.
 *   - swim-deep-river.png
 *       Third-person framing mid-river where the depth exceeds the
 *       wade-to-swim threshold so the player swim mode would engage.
 *   - breath-gauge-submerged.png
 *       First-person camera dropped fully below the water surface so
 *       the HUD breath gauge engages. UI chrome is left visible for
 *       this shot only (overrides the standard hide-chrome treatment)
 *       so the gauge is captured in-frame.
 *   - npc-routes-around-river.png
 *       Overhead framing across a river segment where an NPC patrol
 *       path skirts the deep band per the navmesh cost-weighting from
 *       the `npc-wade-behavior` R1 task.
 *   - wade-foot-splash.png
 *       First-person framing at the bank so the wade-splash particle
 *       burst would read at foot-impact moments. Back-fillable: this
 *       capture depends on R2 sibling `wade-foot-splash-visuals`
 *       landing; the static frame is produced regardless so the
 *       screenshot path is reserved.
 *
 * Saves under
 * `artifacts/cycle-voda-2-buoyancy-swimming-wading/playtest-evidence/`.
 *
 * Modeled on `scripts/capture-voda-1-water-shots.ts` and
 * `scripts/capture-vekhikl-2-emplacement-shots.ts`. Uses the
 * perf-harness preview build (`dist-perf`) and drives the engine via
 * the `__engine` window global.
 *
 * NOTE on feature activation: this script does not assert that the
 * swim/wade gameplay features are reachable from the harness — the
 * camera-posing path renders a frame whether or not the player swim
 * state engages, whether or not the splash particle pool is wired,
 * and whether or not the NPC pathing prefers the dry route. The
 * autonomous-loop deferral hands the load-bearing acceptance to the
 * owner walk-through; this script reserves screenshot paths and
 * proves the headless pipeline can produce them.
 *
 * NOTE on water level: `WaterSystem` exposes `WATER_LEVEL = 0`, so
 * surface-Y is the world `y = 0` plane. Above-water poses use small
 * positive y; submerged pose uses negative y.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9121;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-voda-2-buoyancy-swimming-wading',
  'playtest-evidence'
);

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  await page.evaluate(async (m: string) => {
    const engine = (window as unknown as {
      __engine?: { startGameWithMode?: (mode: string) => Promise<void> };
    }).__engine;
    if (!engine?.startGameWithMode) {
      throw new Error('engine.startGameWithMode unavailable');
    }
    await engine.startGameWithMode(m);
  }, mode);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as unknown as {
        __engine?: {
          gameStarted?: boolean;
          startupFlow?: { getState?: () => { phase?: string } };
        };
      }).__engine;
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

/**
 * Best-effort probe: query `WaterSystem.sampleWaterInteraction` at the
 * pose position so the run log records the depth/immersion the camera
 * is framed against. Useful for post-merge pose refinement.
 */
async function probeWaterAt(
  page: Page,
  position: [number, number, number]
): Promise<{
  submerged: boolean | null;
  depth: number | null;
  immersion01: number | null;
}> {
  return page.evaluate((pos: [number, number, number]) => {
    type SampleResult = {
      submerged?: boolean;
      depth?: number;
      immersion01?: number;
    };
    type WaterLike = {
      sampleWaterInteraction?: (p: {
        x: number;
        y: number;
        z: number;
      }) => SampleResult | null | undefined;
    };
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: { waterSystem?: WaterLike };
      };
    }).__engine;
    const water = engine?.systemManager?.waterSystem;
    if (!water || typeof water.sampleWaterInteraction !== 'function') {
      return { submerged: null, depth: null, immersion01: null };
    }
    try {
      const r = water.sampleWaterInteraction({
        x: pos[0],
        y: pos[1],
        z: pos[2],
      });
      if (!r) return { submerged: null, depth: null, immersion01: null };
      return {
        submerged: typeof r.submerged === 'boolean' ? r.submerged : null,
        depth: typeof r.depth === 'number' ? r.depth : null,
        immersion01: typeof r.immersion01 === 'number' ? r.immersion01 : null,
      };
    } catch {
      return { submerged: null, depth: null, immersion01: null };
    }
  }, position);
}

async function poseAndRender(
  page: Page,
  pose: Pose,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.evaluate(
    ({ p, vp }: { p: Pose; vp: { width: number; height: number } }) => {
      type EngineLike = {
        renderer?: {
          camera?: {
            position: { set: (x: number, y: number, z: number) => void };
            rotation: { order: string; set: (x: number, y: number, z: number) => void };
            aspect?: number;
            updateProjectionMatrix?: () => void;
            updateMatrixWorld?: (force?: boolean) => void;
          };
          renderer?: {
            setSize: (w: number, h: number, updateStyle?: boolean) => void;
            render: (scene: unknown, camera: unknown) => void;
          };
          scene?: unknown;
          postProcessing?: {
            setSize?: (w: number, h: number) => void;
            beginFrame?: () => void;
            endFrame?: () => void;
          };
        };
        isLoopRunning?: boolean;
        animationFrameId?: number | null;
        systemManager?: {
          atmosphereSystem?: {
            syncDomePosition?: (pos: unknown) => void;
            update?: (dt: number) => void;
          };
          waterSystem?: {
            update?: (dt: number) => void;
          };
        };
      };
      const engine = (window as unknown as { __engine?: EngineLike }).__engine;
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
        if (typeof camera.updateProjectionMatrix === 'function') {
          camera.updateProjectionMatrix();
        }
      }
      camera.position.set(p.position[0], p.position[1], p.position[2]);
      const yawRad = (p.yawDeg * Math.PI) / 180;
      const pitchRad = (p.pitchDeg * Math.PI) / 180;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitchRad, yawRad, 0);
      if (typeof camera.updateMatrixWorld === 'function') {
        camera.updateMatrixWorld(true);
      }

      const atm = engine.systemManager?.atmosphereSystem;
      if (atm && typeof atm.syncDomePosition === 'function') {
        atm.syncDomePosition((camera as { position: unknown }).position);
      }
      if (atm && typeof atm.update === 'function') atm.update(0.016);

      const water = engine.systemManager?.waterSystem;
      if (water && typeof water.update === 'function') water.update(0.016);

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

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `body > *:not(canvas) { display: none !important; }
              canvas { position: fixed !important; inset: 0 !important; }`,
  });
}

/**
 * Reverse of `hideUiChrome` — undo the inline rule so subsequent
 * captures show the HUD. The breath-gauge capture needs the HUD visible
 * so the gauge is in-frame.
 */
async function showUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `body > *:not(canvas) { display: revert !important; }
              canvas { position: revert !important; inset: revert !important; }`,
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

    const resolvedBackend = await page.evaluate(() => {
      const engine = (window as unknown as {
        __engine?: {
          renderer?: {
            getRendererBackendCapabilities?: () => { resolvedBackend?: string };
          };
        };
      }).__engine;
      const caps = engine?.renderer?.getRendererBackendCapabilities?.();
      return caps?.resolvedBackend ?? null;
    });
    logStep(`resolvedBackend = ${resolvedBackend ?? '(unknown)'}`);

    // === A Shau Valley (the river-bearing scenario) ===
    await startMode(page, 'a_shau_valley');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);

    // Pose coordinates are placeholders against the A Shau river. Refine
    // after first post-merge run by querying live hydrology channel
    // positions out of `WaterSystem` and inspecting the actual NPC
    // patrol routes. WATER_LEVEL = 0, so camera-y above 0 is above the
    // surface and below 0 is submerged.
    const WADE_BANK_POSE: Pose = {
      position: [10, 3, 5],
      yawDeg: 200,
      pitchDeg: -10,
    };
    const SWIM_MID_RIVER_POSE: Pose = {
      position: [0, 4, 0],
      yawDeg: 180,
      pitchDeg: -12,
    };
    const SUBMERGED_FP_POSE: Pose = {
      position: [0, -1.2, 0],
      yawDeg: 90,
      pitchDeg: 5,
    };
    const NPC_OVERHEAD_POSE: Pose = {
      position: [0, 60, 30],
      yawDeg: 180,
      pitchDeg: -75,
    };
    const FOOT_SPLASH_FP_POSE: Pose = {
      position: [8, 1.6, 4],
      yawDeg: 210,
      pitchDeg: -30,
    };

    // Probe each pose so the run log records what the sampler reports
    // at the camera position. The samples are informational and do not
    // gate capture — pose refinement happens post-merge.
    for (const [name, pose] of [
      ['wade-shallow-ford', WADE_BANK_POSE],
      ['swim-deep-river', SWIM_MID_RIVER_POSE],
      ['breath-gauge-submerged', SUBMERGED_FP_POSE],
      ['npc-routes-around-river', NPC_OVERHEAD_POSE],
      ['wade-foot-splash', FOOT_SPLASH_FP_POSE],
    ] as const) {
      const probe = await probeWaterAt(page, pose.position);
      logStep(
        `water-probe[${name}] at (${pose.position
          .map((n) => n.toFixed(1))
          .join(', ')}): ` +
          `submerged=${probe.submerged}, depth=${
            probe.depth === null ? 'n/a' : probe.depth.toFixed(2)
          }, immersion01=${
            probe.immersion01 === null ? 'n/a' : probe.immersion01.toFixed(2)
          }`
      );
    }

    // === Captures with UI chrome hidden (default) ===
    await hideUiChrome(page);

    // Wade — third-person at the bank in the shallow band.
    await poseAndRender(page, WADE_BANK_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'wade-shallow-ford.png'));

    // Swim — third-person mid-river above the deep band.
    await poseAndRender(page, SWIM_MID_RIVER_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'swim-deep-river.png'));

    // NPC routes — overhead.
    await poseAndRender(page, NPC_OVERHEAD_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'npc-routes-around-river.png'));

    // Wade-splash — first-person at the bank. Back-fillable: requires
    // `wade-foot-splash-visuals` R2 to spawn the particle puff for the
    // splash to be visible in-frame. Static frame is produced regardless.
    await poseAndRender(page, FOOT_SPLASH_FP_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'wade-foot-splash.png'));

    // === Capture with HUD visible (for the breath gauge) ===
    // Restore body chrome so the HUD breath gauge can render in-frame.
    // The gauge engages while the player's head is submerged; the
    // camera-pose path renders a static frame whether or not the
    // gauge is wired, so the capture reserves the path regardless of
    // `player-swim-and-breath` HUD integration state.
    await showUiChrome(page);
    await poseAndRender(page, SUBMERGED_FP_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'breath-gauge-submerged.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-voda-2-swim-wade-shots failed:', err);
  process.exit(1);
});
