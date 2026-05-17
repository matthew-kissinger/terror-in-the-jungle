#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the vekhikl-2-playtest-evidence
 * task in cycle-vekhikl-2-stationary-weapons.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the M2HB emplacement
 * spawns visibly at the documented positions on Open Frontier (US base)
 * and A Shau Valley (NVA bunker overlook), plus a best-effort
 * third-person framing of the mounted player aiming down the barrel.
 *
 * Three captures (names match the playtest brief):
 *   - emplacement-spawn-open-frontier.png
 *       Open Frontier map, camera framed on the US-base-side M2HB
 *       spawn so the tripod + barrel rig dominate the foreground.
 *   - emplacement-spawn-a-shau.png
 *       A Shau Valley map, camera framed on the NVA bunker overlook
 *       M2HB spawn so the tripod is foregrounded against the valley
 *       terrain.
 *   - emplacement-third-person-aiming.png
 *       Open Frontier map, best-effort capture of the player mounted
 *       on the emplacement with the barrel slewed onto a target azimuth.
 *       Drives the `EmplacementPlayerAdapter` mount path if reachable
 *       from the harness; otherwise produces a static frame at the
 *       documented gunner-seat pose and the gap is recorded in the
 *       playtest memo.
 *
 * Saves under
 * `artifacts/cycle-vekhikl-2-stationary-weapons/playtest-evidence/`.
 *
 * Sibling-PR dependency: the M2HB emplacement only appears on the maps
 * once the `m2hb-weapon-integration` R2 task lands (it owns the spawn
 * registration in `VehicleManager`). Until that PR is merged, this
 * script will run cleanly but no emplacement mesh will be visible at
 * the documented poses — capture still produces the static frames so
 * the playtest memo's screenshot paths are reserved. Back-fill on
 * master post-merge per the deferral row in PLAYTEST_PENDING.md.
 *
 * Modeled on `scripts/capture-m151-jeep-playtest-shots.ts` and
 * `scripts/capture-voda-1-water-shots.ts`. Uses the perf-harness
 * preview build (`dist-perf`) and drives the engine via the `__engine`
 * window global.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9120;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-vekhikl-2-stationary-weapons',
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
 * Best-effort probe: does the running scene contain any object whose
 * name marks it as an emplacement (e.g. tripod root from
 * `m2hb-weapon-integration`)? Logs the result so the playtest memo
 * back-fill can confirm whether the sibling PR was merged at capture
 * time. Returns the world position of the first match, if any.
 */
async function probeEmplacementSpawn(
  page: Page
): Promise<{ found: boolean; position: [number, number, number] | null }> {
  return page.evaluate(() => {
    type SceneLike = {
      traverse?: (cb: (obj: { name?: string; getWorldPosition?: (v: unknown) => unknown; position?: { x: number; y: number; z: number } }) => void) => void;
    };
    const engine = (window as unknown as {
      __engine?: { renderer?: { scene?: SceneLike } };
    }).__engine;
    const scene = engine?.renderer?.scene;
    if (!scene || typeof scene.traverse !== 'function') {
      return { found: false, position: null };
    }
    let hit: { x: number; y: number; z: number } | null = null;
    scene.traverse((obj) => {
      if (hit) return;
      const name = String(obj?.name ?? '').toLowerCase();
      if (name.includes('emplacement') || name.includes('m2hb') || name.includes('tripod')) {
        if (obj?.position) {
          hit = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
        }
      }
    });
    return {
      found: hit !== null,
      position: hit ? [hit.x, hit.y, hit.z] : null,
    };
  });
}

/**
 * Best-effort: try to mount the nearest emplacement via the player
 * adapter, then slew the barrel onto a representative azimuth. The
 * `EmplacementPlayerAdapter` API surface may evolve; this routine
 * tolerates a missing mount/aim entry point and returns false so the
 * capture proceeds with a static-camera fallback.
 */
async function tryMountAndAimEmplacement(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            spawnPlayerInNearestVehicle?: () => boolean | void;
            spawnPlayerInNearestEmplacement?: () => boolean | void;
            getActiveAdapter?: () =>
              | {
                  handleInput?: (input: unknown) => void;
                  setAim?: (yawDeg: number, pitchDeg: number) => void;
                }
              | null;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    let mounted = false;
    try {
      if (typeof vm.spawnPlayerInNearestEmplacement === 'function') {
        mounted = vm.spawnPlayerInNearestEmplacement() !== false;
      } else if (typeof vm.spawnPlayerInNearestVehicle === 'function') {
        // Fallback: jeep-era helper. Will pick whichever vehicle is
        // closest; not emplacement-specific but better than nothing.
        mounted = vm.spawnPlayerInNearestVehicle() !== false;
      }
    } catch {
      mounted = false;
    }
    if (!mounted) return false;
    const adapter = typeof vm.getActiveAdapter === 'function' ? vm.getActiveAdapter() : null;
    if (adapter && typeof adapter.setAim === 'function') {
      try {
        adapter.setAim(45, 5);
      } catch {
        // adapter aim API may not be exposed; static frame suffices
      }
    }
    return true;
  });
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
          vehicleManager?: {
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

      const vm = engine.systemManager?.vehicleManager;
      if (vm && typeof vm.update === 'function') vm.update(0.016);

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

    // Camera poses for the documented spawn points. These are placeholder
    // coordinates — refine `position` / `yaw` / `pitch` after the first
    // post-merge run by reading the actual emplacement spawn position out
    // of `VehicleManager` (or the M2HB emplacement registration block in
    // the integration PR).
    const OF_EMPLACEMENT_POSE: Pose = {
      position: [0, 4, 8],
      yawDeg: 0,
      pitchDeg: -10,
    };
    const A_SHAU_EMPLACEMENT_POSE: Pose = {
      position: [0, 4, 8],
      yawDeg: 0,
      pitchDeg: -12,
    };
    const OF_THIRD_PERSON_POSE: Pose = {
      position: [2, 3, 4],
      yawDeg: 30,
      pitchDeg: -8,
    };

    // === Capture 1: Open Frontier — M2HB emplacement spawn ===
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    const ofProbe = await probeEmplacementSpawn(page);
    logStep(
      `Open Frontier emplacement probe: found=${ofProbe.found}` +
        (ofProbe.position
          ? ` at (${ofProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; m2hb-weapon-integration likely not yet merged)')
    );

    await poseAndRender(page, OF_EMPLACEMENT_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'emplacement-spawn-open-frontier.png'));

    // === Capture 2 (best-effort): third-person aiming ===
    // Try to mount and slew the barrel via the player adapter. If the API
    // is unreachable from the harness, fall back to a static framing pose.
    const mounted = await tryMountAndAimEmplacement(page);
    logStep(`third-person mount attempt: ${mounted ? 'success' : 'fallback to static pose'}`);
    if (mounted) {
      await page.waitForTimeout(1500);
    }
    await poseAndRender(page, OF_THIRD_PERSON_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'emplacement-third-person-aiming.png'));

    // === Capture 3: A Shau Valley — M2HB emplacement spawn ===
    await startMode(page, 'a_shau_valley');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    const aShauProbe = await probeEmplacementSpawn(page);
    logStep(
      `A Shau emplacement probe: found=${aShauProbe.found}` +
        (aShauProbe.position
          ? ` at (${aShauProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; m2hb-weapon-integration likely not yet merged)')
    );

    await poseAndRender(page, A_SHAU_EMPLACEMENT_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'emplacement-spawn-a-shau.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-vekhikl-2-emplacement-shots failed:', err);
  process.exit(1);
});
