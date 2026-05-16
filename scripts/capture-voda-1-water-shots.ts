#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the voda-1-playtest-evidence
 * task in cycle-voda-1-water-shader-and-acceptance.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the production water
 * surface shader (R1 composed surface + foam edge, R2 hydrology flow)
 * reads cleanly on both maps and that the terrain-water boundary +
 * underwater POV behave.
 *
 * Six captures (names match the cycle brief's evidence list):
 *   - water-noon-open-frontier.png
 *       Open Frontier shoreline overlook at the default OF preset
 *       (~noon). Frames water plane + sun reflection + depth fade.
 *   - water-sunset-open-frontier.png
 *       Same pose, sunset preset substituted on AtmosphereSystem if
 *       the runtime exposes a preset override; otherwise default
 *       preset is used and the gap is recorded in the playtest memo.
 *   - water-dawn-open-frontier.png
 *       Same pose, dawn preset substituted if available.
 *   - river-flow-a-shau.png
 *       A Shau Valley river bank framing the hydrology channel. The
 *       visible flow visual depends on sibling R2
 *       `hydrology-river-flow-visuals` landing first.
 *   - underwater-pov-a-shau.png
 *       Camera placed just below the river surface so the underwater
 *       overlay engages.
 *   - shoreline-foam-open-frontier.png
 *       Tight pose on the terrain-water boundary so the R1 foam line +
 *       soft depth blend read clearly.
 *
 * Saves under
 * `artifacts/cycle-voda-1-water-shader-and-acceptance/playtest-evidence/`.
 *
 * Modeled on `scripts/capture-m151-jeep-playtest-shots.ts`. Uses the
 * perf-harness preview build (`dist-perf`) and drives the engine via
 * the `__engine` window global.
 *
 * NOTE on time-of-day: the codebase exposes sun direction via
 * per-scenario `SCENARIO_ATMOSPHERE_PRESETS` (noon/sunset/dawn live as
 * separate presets), not a runtime hour setter. The script attempts a
 * best-effort preset override; if the runtime does not expose one the
 * default preset is used and the owner sweep covers the time-of-day
 * matrix manually per the playtest memo.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9119;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-voda-1-water-shader-and-acceptance',
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

async function tryApplyAtmospherePreset(
  page: Page,
  preset: 'noon' | 'sunset' | 'dawn'
): Promise<boolean> {
  // Best-effort: the engine may not expose a runtime preset override.
  // If it does not, capture proceeds with the default per-mode preset
  // and the gap is recorded in the playtest memo.
  return page.evaluate((p: string) => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          atmosphereSystem?: {
            applyPreset?: (name: string) => void;
            setPreset?: (name: string) => void;
            setScenarioPreset?: (name: string) => void;
          };
        };
      };
    }).__engine;
    const atm = engine?.systemManager?.atmosphereSystem;
    if (!atm) return false;
    if (typeof atm.applyPreset === 'function') {
      atm.applyPreset(p);
      return true;
    }
    if (typeof atm.setPreset === 'function') {
      atm.setPreset(p);
      return true;
    }
    if (typeof atm.setScenarioPreset === 'function') {
      atm.setScenarioPreset(p);
      return true;
    }
    return false;
  }, preset);
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

    // Common shoreline overlook pose on Open Frontier — refine after
    // the first post-merge run by reading actual water/terrain
    // coordinates out of the running scene.
    const OF_SHORELINE_POSE: Pose = {
      position: [80, 12, 80],
      yawDeg: 200,
      pitchDeg: -8,
    };
    const OF_FOAM_POSE: Pose = {
      position: [60, 3, 60],
      yawDeg: 200,
      pitchDeg: -25,
    };

    // === Open Frontier captures ===
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    // Noon — default OF preset (which is authored at high sun).
    await tryApplyAtmospherePreset(page, 'noon');
    await poseAndRender(page, OF_SHORELINE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'water-noon-open-frontier.png'));

    // Sunset — best-effort override.
    const sunsetApplied = await tryApplyAtmospherePreset(page, 'sunset');
    logStep(`sunset preset override applied: ${sunsetApplied}`);
    await poseAndRender(page, OF_SHORELINE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'water-sunset-open-frontier.png'));

    // Dawn — best-effort override.
    const dawnApplied = await tryApplyAtmospherePreset(page, 'dawn');
    logStep(`dawn preset override applied: ${dawnApplied}`);
    await poseAndRender(page, OF_SHORELINE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'water-dawn-open-frontier.png'));

    // Foam line — tight pose at terrain-water boundary. Reset to default
    // preset first so the foam read isn't muddled by low-angle sun.
    await tryApplyAtmospherePreset(page, 'noon');
    await poseAndRender(page, OF_FOAM_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'shoreline-foam-open-frontier.png'));

    // === A Shau Valley captures ===
    await startMode(page, 'a_shau_valley');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    // River-bank flow — pose framed across a hydrology channel. Coords
    // are placeholders; refine after first post-merge run.
    const A_SHAU_RIVER_POSE: Pose = {
      position: [0, 6, 0],
      yawDeg: 90,
      pitchDeg: -15,
    };
    await poseAndRender(page, A_SHAU_RIVER_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'river-flow-a-shau.png'));

    // Underwater POV — drop camera just below water level so the
    // underwater fog overlay engages. WATER_LEVEL = 0 in WaterSystem,
    // so y < 0 is below surface.
    const A_SHAU_UNDERWATER_POSE: Pose = {
      position: [0, -1.5, 0],
      yawDeg: 90,
      pitchDeg: 10,
    };
    await poseAndRender(page, A_SHAU_UNDERWATER_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'underwater-pov-a-shau.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-voda-1-water-shots failed:', err);
  process.exit(1);
});
