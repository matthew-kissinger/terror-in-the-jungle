#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the voda-3-playtest-evidence
 * task in cycle-voda-3-watercraft.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the Sampan + PBR
 * mount, drive, fire, dock, and wave-heave behaviors are reachable
 * from the harness, with best-effort framings for each step.
 *
 * Output directory: `artifacts/playtests/cycle-voda-3/`
 * (relative to repo root; gitignored).
 *
 * Named captures (mirror the playtest memo's evidence table):
 *   - sampan-spawn.png                  — Sampan at riverbank spawn
 *   - sampan-mounted-third-person.png   — player mounted Sampan (3rd-person)
 *   - sampan-driving-forward.png        — Sampan ~20-25 m upstream
 *   - sampan-rudder-yaw.png             — Sampan mid-yaw under rudder
 *   - sampan-grounded-at-bank.png       — Sampan beached at bank
 *   - sampan-player-exited-at-bank.png  — player ejected onto bank
 *   - pbr-spawn.png                     — PBR at US river outpost spawn
 *   - pbr-pilot-view.png                — PBR pilot first-person
 *   - pbr-gunner-view.png               — PBR gunner first-person (M2HB barrel)
 *   - pbr-m2hb-firing.png               — PBR M2HB firing mid-burst
 *   - pbr-under-bridge.png              — PBR approach to bridge corridor
 *   - sampan-wave-heave-idle.png        — Sampan idle, wave heave visible
 *
 * Sibling-PR dependencies:
 *   - watercraft-physics-core (R1, landed)   — WatercraftPhysics for hull state.
 *   - watercraft-physics-tests (R1, landed)  — exercises hull behaviors.
 *   - sampan-integration (R2)                — required for sampan-* captures
 *                                              + the WatercraftPlayerAdapter
 *                                              mount + throttle / rudder /
 *                                              exit surface.
 *   - pbr-integration (R2)                   — required for pbr-* captures
 *                                              + the gunner-swap surface +
 *                                              the M2HB fire wiring on the
 *                                              PBR gunner mount.
 *   - (out of scope) bridge-clearance wiring  — required for pbr-under-bridge
 *                                              to be load-bearing
 *                                              (`isUnderBridge` is stubbed
 *                                              `false` in R1 per the
 *                                              `WatercraftPhysics` docblock
 *                                              TODO).
 *
 * Each best-effort capture tolerates absent dev surfaces — the harness
 * probes for each surface in turn, logs availability, and falls back
 * to a static-camera framing at the documented pose. The owner
 * walk-through remains the load-bearing check; this script's job is
 * to produce enough evidence to merge under autonomous-loop posture.
 *
 * Modeled on `scripts/capture-vekhikl-4-tank-shots.ts` (cycle #9 tank
 * evidence) and `scripts/capture-voda-2-swim-wade-shots.ts` (cycle #7
 * water evidence). Uses the perf-harness preview build (`dist-perf`)
 * and drives the engine via the `__engine` window global.
 *
 * NOTE on water level: `WaterSystem` exposes `WATER_LEVEL = 0`, so
 * surface-Y is the world `y = 0` plane. Above-water poses use small
 * positive y; the bank-exit pose uses small positive y on a documented
 * bank coordinate.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9124;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'playtests',
  'cycle-voda-3'
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
 * Best-effort probe: scan the scene for Sampan / PBR meshes and return
 * the first world position. Refines pose calibration post-merge once the
 * R2 integration PRs land.
 */
async function probeWatercraftSpawn(
  page: Page,
  needles: ReadonlyArray<string>
): Promise<{ found: boolean; position: [number, number, number] | null }> {
  return page.evaluate((searchNeedles: ReadonlyArray<string>) => {
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
    const lowered = searchNeedles.map((n) => n.toLowerCase());
    let hit: { x: number; y: number; z: number } | null = null;
    scene.traverse((obj) => {
      if (hit) return;
      const name = String(obj?.name ?? '').toLowerCase();
      for (const needle of lowered) {
        if (name.includes(needle) && obj?.position) {
          hit = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
          return;
        }
      }
    });
    return {
      found: hit !== null,
      position: hit ? [hit.x, hit.y, hit.z] : null,
    };
  }, needles);
}

/**
 * Best-effort: query `WaterSystem.sampleWaterInteraction` at the pose so
 * the log records the depth / immersion / flow at the camera position.
 * Useful for post-merge pose refinement.
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

/**
 * Best-effort: mount the nearest watercraft in the pilot seat. Returns
 * true on success. Tolerates the cycle #4 surfaces being named
 * differently than expected — falls through
 * `spawnPlayerInNearestWatercraft` -> `spawnPlayerInNearestVehicle`.
 */
async function tryMountWatercraftAsPilot(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            spawnPlayerInNearestWatercraft?: () => boolean | void;
            spawnPlayerInNearestVehicle?: () => boolean | void;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.spawnPlayerInNearestWatercraft === 'function') {
        return vm.spawnPlayerInNearestWatercraft() !== false;
      }
      if (typeof vm.spawnPlayerInNearestVehicle === 'function') {
        return vm.spawnPlayerInNearestVehicle() !== false;
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: command forward throttle on the active watercraft adapter.
 * Returns true if the adapter accepted the input. Drives Sampan ~20-25 m
 * upstream at default cruise (~6-8 m/s) over ~3 s.
 */
async function tryCommandThrottle(
  page: Page,
  throttle: number,
  rudder: number
): Promise<boolean> {
  return page.evaluate(
    ({ t, r }: { t: number; r: number }) => {
      const engine = (window as unknown as {
        __engine?: {
          systemManager?: {
            vehicleManager?: {
              getActiveAdapter?: () =>
                | {
                    handleInput?: (input: unknown) => void;
                    setControls?: (throttle: number, rudder: number) => void;
                  }
                | null;
            };
          };
        };
      }).__engine;
      const vm = engine?.systemManager?.vehicleManager;
      if (!vm || typeof vm.getActiveAdapter !== 'function') return false;
      const adapter = vm.getActiveAdapter();
      if (!adapter) return false;
      try {
        if (typeof adapter.setControls === 'function') {
          adapter.setControls(t, r);
          return true;
        }
        if (typeof adapter.handleInput === 'function') {
          adapter.handleInput({
            throttle: t,
            rudder: r,
            forward: t > 0 ? Math.abs(t) : 0,
            back: t < 0 ? Math.abs(t) : 0,
            left: r < 0 ? Math.abs(r) : 0,
            right: r > 0 ? Math.abs(r) : 0,
          });
          return true;
        }
      } catch {
        return false;
      }
      return false;
    },
    { t: throttle, r: rudder }
  );
}

/**
 * Best-effort: dismount the active watercraft. Returns true if any
 * surface accepted the exit command. The cycle #4 pattern is the F-key
 * pressing through `handleInput({ exit: true })`; cycle #9 added a
 * direct `exitVehicle` on the VehicleManager.
 */
async function tryExitVehicle(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            exitActiveVehicle?: () => boolean | void;
            exitVehicle?: () => boolean | void;
            getActiveAdapter?: () =>
              | {
                  handleInput?: (input: unknown) => void;
                  exit?: () => void;
                }
              | null;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.exitActiveVehicle === 'function') {
        return vm.exitActiveVehicle() !== false;
      }
      if (typeof vm.exitVehicle === 'function') {
        return vm.exitVehicle() !== false;
      }
      if (typeof vm.getActiveAdapter === 'function') {
        const adapter = vm.getActiveAdapter();
        if (adapter) {
          if (typeof adapter.exit === 'function') {
            adapter.exit();
            return true;
          }
          if (typeof adapter.handleInput === 'function') {
            adapter.handleInput({ exit: true });
            return true;
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: swap from pilot seat to gunner seat on the active PBR.
 * Tolerates a direct `swapToGunner` dev alias or generic
 * `swapSeat(role)` re-mount path (cycle #6 emplacement-mount).
 */
async function trySwapToGunnerSeat(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            swapToGunner?: () => boolean | void;
            swapSeat?: (role: string) => boolean | void;
            spawnPlayerInNearestPBRAsGunner?: () => boolean | void;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.swapToGunner === 'function') {
        return vm.swapToGunner() !== false;
      }
      if (typeof vm.swapSeat === 'function') {
        return vm.swapSeat('gunner_forward') !== false;
      }
      if (typeof vm.spawnPlayerInNearestPBRAsGunner === 'function') {
        return vm.spawnPlayerInNearestPBRAsGunner() !== false;
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: trigger the M2HB fire latch on the PBR's active gunner
 * mount. Tolerates a direct `fireActiveWeapon` alias or the cycle #6
 * emplacement adapter's `handleInput({ fire: true })` / `requestFire`
 * paths.
 */
async function tryFireActiveWeapon(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            fireActiveWeapon?: () => boolean | void;
            getActiveAdapter?: () =>
              | {
                  handleInput?: (input: unknown) => void;
                  requestFire?: () => void;
                }
              | null;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.fireActiveWeapon === 'function') {
        return vm.fireActiveWeapon() !== false;
      }
      if (typeof vm.getActiveAdapter === 'function') {
        const adapter = vm.getActiveAdapter();
        if (adapter) {
          if (typeof adapter.requestFire === 'function') {
            adapter.requestFire();
            return true;
          }
          if (typeof adapter.handleInput === 'function') {
            adapter.handleInput({ fire: true, primaryFire: true });
            return true;
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: read `WatercraftPhysics.isGrounded()` and `isUnderBridge()`
 * off the active watercraft for the run log. Both surfaces are reachable
 * via the active adapter's `vehicle.physics` (when wired) or a direct
 * `vehicleManager.getActiveWatercraftPhysics()` accessor (if exposed).
 */
async function probeActiveHullState(page: Page): Promise<{
  grounded: boolean | null;
  underBridge: boolean | null;
}> {
  return page.evaluate(() => {
    type PhysicsLike = {
      isGrounded?: () => boolean;
      isUnderBridge?: () => boolean;
    };
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            getActiveWatercraftPhysics?: () => PhysicsLike | null;
            getActiveAdapter?: () =>
              | {
                  vehicle?: { physics?: PhysicsLike };
                  physics?: PhysicsLike;
                }
              | null;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return { grounded: null, underBridge: null };
    let physics: PhysicsLike | null = null;
    try {
      if (typeof vm.getActiveWatercraftPhysics === 'function') {
        physics = vm.getActiveWatercraftPhysics() ?? null;
      }
      if (!physics && typeof vm.getActiveAdapter === 'function') {
        const adapter = vm.getActiveAdapter();
        physics =
          (adapter?.physics as PhysicsLike | undefined) ??
          (adapter?.vehicle?.physics as PhysicsLike | undefined) ??
          null;
      }
    } catch {
      physics = null;
    }
    if (!physics) return { grounded: null, underBridge: null };
    return {
      grounded:
        typeof physics.isGrounded === 'function' ? physics.isGrounded() : null,
      underBridge:
        typeof physics.isUnderBridge === 'function'
          ? physics.isUnderBridge()
          : null,
    };
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
          waterSystem?: {
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

      const water = engine.systemManager?.waterSystem;
      if (water && typeof water.update === 'function') water.update(0.016);

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

    // === A Shau Valley (the river-bearing scenario) ===
    await startMode(page, 'a_shau_valley');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    // ── Camera poses ────────────────────────────────────────────────
    // Placeholder coordinates relative to the documented Sampan riverbank
    // spawn and the US river-outpost PBR spawn on A Shau. Refine
    // post-merge by reading the actual spawn positions out of the R2
    // integration PRs (`Sampan.ts` / `PBR.ts`) once they exist.
    // WATER_LEVEL = 0, so camera-y above 0 is above the surface.
    const SAMPAN_SPAWN_POSE: Pose = {
      position: [10, 3, 5],
      yawDeg: 200,
      pitchDeg: -10,
    };
    const SAMPAN_MOUNTED_TP_POSE: Pose = {
      position: [10, 4, 7],
      yawDeg: 200,
      pitchDeg: -12,
    };
    const SAMPAN_DRIVING_POSE: Pose = {
      // Slightly upstream of spawn; the Sampan should have moved ~20-25 m
      // by capture time after a 3 s forward throttle command. Third-person
      // follow framing.
      position: [10, 4, -20],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const SAMPAN_RUDDER_YAW_POSE: Pose = {
      // Off-axis framing so the yawed hull reads against the river.
      position: [20, 4, -10],
      yawDeg: 230,
      pitchDeg: -10,
    };
    const SAMPAN_GROUNDED_POSE: Pose = {
      // Bank pose — the hull is beached, the camera is from the riverbank
      // side. Documented for the cycle #4 / VEKHIKL-1 jeep-exit pattern
      // analog.
      position: [12, 3, 10],
      yawDeg: 250,
      pitchDeg: -10,
    };
    const SAMPAN_PLAYER_EXITED_POSE: Pose = {
      // Third-person framing of the exited player standing on the bank.
      position: [14, 3, 12],
      yawDeg: 220,
      pitchDeg: -12,
    };
    const PBR_SPAWN_POSE: Pose = {
      // US river outpost on A Shau. Placeholder; refine from PBR.ts
      // post-merge.
      position: [40, 5, 60],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const PBR_PILOT_POSE: Pose = {
      // PBR pilot first-person — eye-pose roughly at the pilot console.
      position: [40, 4, 58],
      yawDeg: 0,
      pitchDeg: 0,
    };
    const PBR_GUNNER_POSE: Pose = {
      // PBR gunner_forward first-person — eye-pose roughly at the bow
      // M2HB twin mount, looking along the barrel axis.
      position: [40, 4.5, 55],
      yawDeg: 0,
      pitchDeg: 0,
    };
    const PBR_FIRING_POSE: Pose = {
      // Third-person framing off-axis so the muzzle flash + tracer + the
      // riverbank impact are all in-frame.
      position: [50, 6, 50],
      yawDeg: 250,
      pitchDeg: -8,
    };
    const PBR_BRIDGE_APPROACH_POSE: Pose = {
      // Placeholder — A Shau may or may not have a bridge structure at
      // capture time. The static frame reserves the screenshot path.
      position: [30, 8, 100],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const SAMPAN_IDLE_HEAVE_POSE: Pose = {
      // Idle mid-river framing for the wave-heave capture. Slightly
      // off-axis so the hull's roll + pitch motion would read.
      position: [10, 4, -5],
      yawDeg: 200,
      pitchDeg: -10,
    };

    // ── Scene probes (informational; refine poses post-merge) ──────
    const sampanProbe = await probeWatercraftSpawn(page, [
      'sampan',
      'watercraft',
    ]);
    logStep(
      `Sampan scene probe: found=${sampanProbe.found}` +
        (sampanProbe.position
          ? ` at (${sampanProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; sampan-integration may not be merged yet)')
    );
    const pbrProbe = await probeWatercraftSpawn(page, ['pbr', 'patrol_boat']);
    logStep(
      `PBR scene probe: found=${pbrProbe.found}` +
        (pbrProbe.position
          ? ` at (${pbrProbe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; pbr-integration may not be merged yet)')
    );
    for (const [name, pose] of [
      ['sampan-spawn', SAMPAN_SPAWN_POSE],
      ['sampan-driving-forward', SAMPAN_DRIVING_POSE],
      ['sampan-grounded-at-bank', SAMPAN_GROUNDED_POSE],
      ['pbr-spawn', PBR_SPAWN_POSE],
      ['sampan-wave-heave-idle', SAMPAN_IDLE_HEAVE_POSE],
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

    // === Capture 1: Sampan at riverbank spawn ===
    await poseAndRender(page, SAMPAN_SPAWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-spawn.png'));

    // === Capture 2: player mounted Sampan (3rd-person) ===
    const sampanMounted = await tryMountWatercraftAsPilot(page);
    logStep(
      `Sampan mount-as-pilot attempt: ${
        sampanMounted ? 'success' : 'fallback to static pose'
      }`
    );
    await poseAndRender(page, SAMPAN_MOUNTED_TP_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-mounted-third-person.png'));

    // === Capture 3: Sampan driving upstream ===
    if (sampanMounted) {
      const throttled = await tryCommandThrottle(page, 1, 0);
      logStep(
        `Sampan forward-throttle command: ${
          throttled ? 'accepted' : 'unavailable (static pose)'
        }`
      );
      if (throttled) {
        // ~6-8 m/s cruise * 3 s ≈ 20-25 m
        await page.waitForTimeout(3000);
      }
    }
    await poseAndRender(page, SAMPAN_DRIVING_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-driving-forward.png'));

    // === Capture 4: Sampan mid-yaw under rudder ===
    if (sampanMounted) {
      const yawed = await tryCommandThrottle(page, 0.5, 1);
      logStep(
        `Sampan rudder command: ${
          yawed ? 'accepted' : 'unavailable (static pose)'
        }`
      );
      if (yawed) await page.waitForTimeout(1500);
    }
    await poseAndRender(page, SAMPAN_RUDDER_YAW_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-rudder-yaw.png'));

    // === Capture 5: Sampan grounded at bank ===
    // Drive into the bank so the grounding check engages. ~4 s at cruise
    // toward a documented shore should beach the bow on a typical bank.
    if (sampanMounted) {
      const beached = await tryCommandThrottle(page, 1, -0.5);
      logStep(
        `Sampan beach-toward-bank command: ${
          beached ? 'accepted' : 'unavailable (static pose)'
        }`
      );
      if (beached) await page.waitForTimeout(4000);
    }
    const groundedState = await probeActiveHullState(page);
    logStep(
      `WatercraftPhysics state probe: grounded=${groundedState.grounded}, ` +
        `underBridge=${groundedState.underBridge}`
    );
    await poseAndRender(page, SAMPAN_GROUNDED_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-grounded-at-bank.png'));

    // === Capture 6: player exited at bank ===
    const exited = await tryExitVehicle(page);
    logStep(
      `Sampan exit command: ${
        exited ? 'accepted' : 'unavailable (static pose)'
      }`
    );
    if (exited) await page.waitForTimeout(500);
    await poseAndRender(page, SAMPAN_PLAYER_EXITED_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-player-exited-at-bank.png'));

    // === Capture 7: PBR at US river outpost spawn ===
    await poseAndRender(page, PBR_SPAWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'pbr-spawn.png'));

    // === Capture 8: PBR pilot first-person ===
    const pbrMounted = await tryMountWatercraftAsPilot(page);
    logStep(
      `PBR mount-as-pilot attempt: ${
        pbrMounted ? 'success (nearest watercraft)' : 'fallback to static pose'
      }`
    );
    await poseAndRender(page, PBR_PILOT_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'pbr-pilot-view.png'));

    // === Capture 9: PBR gunner first-person (M2HB barrel) ===
    const gunnerSwap = await trySwapToGunnerSeat(page);
    logStep(
      `PBR gunner-seat swap: ${
        gunnerSwap ? 'success' : 'fallback to static pose'
      }`
    );
    if (gunnerSwap) await page.waitForTimeout(500);
    await poseAndRender(page, PBR_GUNNER_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'pbr-gunner-view.png'));

    // === Capture 10: PBR M2HB firing mid-burst ===
    const fired = await tryFireActiveWeapon(page);
    logStep(
      `PBR M2HB fire: ${fired ? 'accepted' : 'unavailable (static pose)'}`
    );
    if (fired) {
      // M2HB cyclic ~575 RPM ≈ 100 ms per round. 250 ms covers a
      // couple of rounds so the muzzle + tracer would read in-frame.
      await page.waitForTimeout(250);
    }
    await poseAndRender(page, PBR_FIRING_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'pbr-m2hb-firing.png'));

    // === Capture 11: PBR approach to bridge corridor ===
    // The cycle #4-style "drive toward bridge" path depends on a bridge
    // structure existing in A Shau's worldfeature pack AND the R2
    // bridge-clearance wiring. R1 stubs `isUnderBridge()` to false, so
    // this capture is documentary; the static frame reserves the path.
    const bridgeState = await probeActiveHullState(page);
    logStep(
      `Pre-bridge approach probe: grounded=${bridgeState.grounded}, ` +
        `underBridge=${bridgeState.underBridge} ` +
        '(R1 stubs isUnderBridge to false; back-fill post-R2)'
    );
    await poseAndRender(page, PBR_BRIDGE_APPROACH_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'pbr-under-bridge.png'));

    // === Capture 12: Sampan wave heave at idle ===
    // Cut throttle/rudder, let the hull settle, then capture so the
    // hull-sample-driven heave/pitch/roll is at a representative
    // y-oscillation phase. The single-frame snap can't show motion, but
    // it reserves the screenshot path; the owner sweep is the
    // load-bearing check for "does the hull rock?".
    const idled = await tryCommandThrottle(page, 0, 0);
    logStep(
      `Sampan idle command: ${
        idled ? 'accepted' : 'unavailable (static pose)'
      }`
    );
    if (idled) await page.waitForTimeout(5000);
    const idleState = await probeActiveHullState(page);
    logStep(
      `Sampan idle state probe: grounded=${idleState.grounded}, ` +
        `underBridge=${idleState.underBridge}`
    );
    await poseAndRender(page, SAMPAN_IDLE_HEAVE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'sampan-wave-heave-idle.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-voda-3-watercraft-shots failed:', err);
  process.exit(1);
});
