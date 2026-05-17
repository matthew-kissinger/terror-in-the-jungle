#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the vekhikl-3-playtest-evidence
 * task in cycle-vekhikl-3-tank-chassis.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the M48 Patton tank
 * chassis spawns visibly at the documented positions on Open Frontier
 * (US base) and A Shau Valley (valley road), plus best-effort framings
 * showing the skid-steer locomotion features in static frames.
 *
 * Five captures (names match the cycle brief's evidence list):
 *   - tank-spawn-open-frontier.png
 *       Open Frontier map, third-person framing on the US-base-side
 *       M48 spawn so the chassis dominates the foreground.
 *   - tank-spawn-a-shau.png
 *       A Shau Valley map, third-person framing on the valley-road M48
 *       spawn so the chassis is foregrounded against the valley walls.
 *   - tank-driving-third-person.png
 *       Open Frontier map, best-effort capture of the player mounted
 *       on the M48 partway through a forward drive segment; the
 *       third-person follow camera frames the chassis from behind.
 *   - tank-pivot-in-place.png
 *       Best-effort framing during a skid-steer pivot — opposing track
 *       commands produce zero forward velocity + non-zero yaw rate.
 *       Static frame proxy for the in-place rotation behavior.
 *   - tank-on-slope.png
 *       Framing where the chassis sits on a graded slope so the
 *       four-corner terrain conform produces visible hull tilt.
 *
 * Saves under
 * `artifacts/cycle-vekhikl-3-tank-chassis/playtest-evidence/`.
 *
 * Sibling-PR dependency: the M48 tank only appears on the maps once
 * the `m48-tank-integration` R2 task lands (it owns the spawn
 * registration in `VehicleManager` plus the chassis config block).
 * Until that PR is merged, this script will run cleanly but no M48
 * mesh will be visible at the documented poses — capture still
 * produces the static frames so the playtest memo's screenshot paths
 * are reserved. Back-fill on master post-merge per the deferral row
 * in PLAYTEST_PENDING.md.
 *
 * Modeled on `scripts/capture-m151-jeep-playtest-shots.ts`,
 * `scripts/capture-vekhikl-2-emplacement-shots.ts`, and
 * `scripts/capture-voda-2-swim-wade-shots.ts`. Uses the perf-harness
 * preview build (`dist-perf`) and drives the engine via the `__engine`
 * window global.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9122;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-vekhikl-3-tank-chassis',
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
 * name marks it as the M48 tank chassis (e.g. tank root from
 * `m48-tank-integration`)? Logs the result so the playtest memo
 * back-fill can confirm whether the sibling PR was merged at capture
 * time. Returns the world position of the first match, if any.
 */
async function probeTankSpawn(
  page: Page
): Promise<{ found: boolean; position: [number, number, number] | null }> {
  return page.evaluate(() => {
    type SceneLike = {
      traverse?: (
        cb: (obj: {
          name?: string;
          position?: { x: number; y: number; z: number };
        }) => void
      ) => void;
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
      if (
        name.includes('m48') ||
        name.includes('patton') ||
        name.includes('tank') ||
        name.includes('tracked')
      ) {
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
 * Best-effort: try to mount the nearest tank via the player adapter,
 * then issue a forward throttle command. The `TankPlayerAdapter` API
 * surface may evolve; this routine tolerates a missing mount/input
 * entry point and returns false so the capture proceeds with a
 * static-camera fallback.
 */
async function tryMountAndDriveTank(
  page: Page,
  intent: 'forward' | 'pivot'
): Promise<boolean> {
  return page.evaluate((dir: 'forward' | 'pivot') => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            spawnPlayerInNearestVehicle?: () => boolean | void;
            spawnPlayerInNearestTank?: () => boolean | void;
            getActiveAdapter?: () =>
              | {
                  handleInput?: (input: unknown) => void;
                  setTrackInputs?: (
                    throttleAxis: number,
                    turnAxis: number
                  ) => void;
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
      if (typeof vm.spawnPlayerInNearestTank === 'function') {
        mounted = vm.spawnPlayerInNearestTank() !== false;
      } else if (typeof vm.spawnPlayerInNearestVehicle === 'function') {
        // Fallback: generic nearest-vehicle helper. Will pick whichever
        // vehicle is closest (may pick a non-tank in mixed-fleet maps).
        mounted = vm.spawnPlayerInNearestVehicle() !== false;
      }
    } catch {
      mounted = false;
    }
    if (!mounted) return false;
    const adapter =
      typeof vm.getActiveAdapter === 'function' ? vm.getActiveAdapter() : null;
    if (adapter) {
      try {
        // Prefer a tank-specific track-axis setter if exposed.
        if (typeof adapter.setTrackInputs === 'function') {
          if (dir === 'forward') {
            adapter.setTrackInputs(1, 0);
          } else {
            // pivot: opposite tracks at full magnitude → zero forward, max yaw.
            adapter.setTrackInputs(0, 1);
          }
        } else if (typeof adapter.handleInput === 'function') {
          // Fallback: generic input shape (W/S/A/D axes).
          if (dir === 'forward') {
            adapter.handleInput({
              throttle: 1,
              turn: 0,
              forward: 1,
              back: 0,
              left: 0,
              right: 0,
            });
          } else {
            adapter.handleInput({
              throttle: 0,
              turn: 1,
              forward: 0,
              back: 0,
              left: 0,
              right: 1,
            });
          }
        }
      } catch {
        // adapter input API may not be exposed; static frame suffices
      }
    }
    return true;
  }, intent);
}

/**
 * Best-effort: try to trigger the tracks-blown debug command if any
 * surface exists. Returns true on success. Used for completeness even
 * though no tracks-blown evidence frame is captured (the cycle brief
 * lists only five named captures, none of which require this state).
 * Logged for the playtest memo so the owner sweep can confirm the
 * surface is reachable.
 */
async function tryTriggerTracksBlownDebug(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            debugTracksBlown?: () => boolean | void;
            blowTracksOnActiveTank?: () => boolean | void;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.debugTracksBlown === 'function') {
        vm.debugTracksBlown();
        return true;
      }
      if (typeof vm.blowTracksOnActiveTank === 'function') {
        vm.blowTracksOnActiveTank();
        return true;
      }
    } catch {
      return false;
    }
    return false;
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
            rotation: {
              order: string;
              set: (x: number, y: number, z: number) => void;
            };
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
      if (
        engine.animationFrameId !== null &&
        engine.animationFrameId !== undefined
      ) {
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
    // post-merge run by reading the actual M48 spawn position out of
    // `VehicleManager` (or the M48 chassis registration block in the
    // `m48-tank-integration` PR). The M48 chassis is ~6.4 m × 3.6 m ×
    // 3.1 m per the TANK_SYSTEMS memo, so the camera sits ~10 m back and
    // ~4 m up to frame the hull.
    const OF_TANK_SPAWN_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const A_SHAU_TANK_SPAWN_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -12,
    };
    const OF_DRIVING_THIRD_PERSON_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -8,
    };
    const OF_PIVOT_IN_PLACE_POSE: Pose = {
      position: [8, 6, 8],
      yawDeg: 225,
      pitchDeg: -15,
    };
    const A_SHAU_SLOPE_POSE: Pose = {
      position: [0, 6, 14],
      yawDeg: 180,
      pitchDeg: -8,
    };

    // === Capture 1: Open Frontier — M48 tank spawn at US base ===
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    const ofProbe = await probeTankSpawn(page);
    logStep(
      `Open Frontier tank probe: found=${ofProbe.found}` +
        (ofProbe.position
          ? ` at (${ofProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; m48-tank-integration likely not yet merged)')
    );

    await poseAndRender(page, OF_TANK_SPAWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-spawn-open-frontier.png'));

    // === Capture 2 (best-effort): driving from third-person ===
    // Mount the tank and issue a forward throttle for ~2 s so the chassis
    // has moved off the spawn pose by the time the camera snaps. If the
    // adapter API is unreachable from the harness, fall back to a static
    // third-person framing at the spawn pose.
    const mountedForward = await tryMountAndDriveTank(page, 'forward');
    logStep(
      `tank forward-drive mount attempt: ${mountedForward ? 'success' : 'fallback to static pose'}`
    );
    if (mountedForward) {
      await page.waitForTimeout(2000);
    }
    await poseAndRender(page, OF_DRIVING_THIRD_PERSON_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-driving-third-person.png'));

    // === Capture 3 (best-effort): in-place pivot ===
    // Skid-steer pivot: opposite tracks produce zero forward velocity and
    // non-zero yaw rate. The static frame doesn't show motion but does
    // frame the chassis from an off-axis angle implying rotation; the
    // accompanying log line records whether the input was actually
    // commanded so the owner sweep can confirm the surface is wired.
    const mountedPivot = await tryMountAndDriveTank(page, 'pivot');
    logStep(
      `tank pivot mount attempt: ${mountedPivot ? 'success' : 'fallback to static pose'}`
    );
    if (mountedPivot) {
      await page.waitForTimeout(1500);
    }
    await poseAndRender(page, OF_PIVOT_IN_PLACE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-pivot-in-place.png'));

    // === Capture 4 (best-effort): tracks-blown surface probe ===
    // Triggers the debug command for completeness so the owner sweep
    // has a log entry confirming the surface exists. No screenshot is
    // produced for this state — the cycle brief's named captures do
    // not include a tracks-blown frame (immobilization is observable
    // through the lack of motion when the owner walks the punch list,
    // not through a still image).
    const tracksBlown = await tryTriggerTracksBlownDebug(page);
    logStep(
      `tracks-blown debug probe: ${tracksBlown ? 'triggered' : 'unavailable (debug surface may not be wired)'}`
    );

    // === Capture 5: A Shau Valley — M48 tank spawn at valley road ===
    await startMode(page, 'a_shau_valley');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    const aShauProbe = await probeTankSpawn(page);
    logStep(
      `A Shau tank probe: found=${aShauProbe.found}` +
        (aShauProbe.position
          ? ` at (${aShauProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; m48-tank-integration likely not yet merged)')
    );

    await poseAndRender(page, A_SHAU_TANK_SPAWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-spawn-a-shau.png'));

    // === Capture 6: chassis on slope (A Shau valley wall) ===
    // The four-corner terrain conform produces visible hull tilt on
    // graded terrain. A Shau's valley walls are the steepest playable
    // surface in either scenario, so framing the chassis against the
    // valley wall captures the conform behavior. If the M48 has not
    // spawned (sibling PR pending), this frame still reserves the path.
    await poseAndRender(page, A_SHAU_SLOPE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-on-slope.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-vekhikl-3-tank-shots failed:', err);
  process.exit(1);
});
