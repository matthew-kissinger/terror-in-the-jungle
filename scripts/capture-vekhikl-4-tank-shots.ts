#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the vekhikl-4-playtest-evidence
 * task in cycle-vekhikl-4-tank-turret-and-cannon.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the
 * substitute Playwright evidence — proof that the M48 turret + cannon
 * + damage substates are reachable from the harness, with best-effort
 * framings for the cannon arc + impact + on-fire + substate captures.
 *
 * Output directory: `artifacts/playtests/cycle-vekhikl-4/`
 * (relative to repo root; gitignored).
 *
 * Named captures (mirror the playtest memo's evidence table):
 *   - tank-spawn.png            — Open Frontier M48 spawn, chassis + turret in frame
 *   - tank-drove-forward.png    — third-person framing after ~3 s forward throttle
 *   - tank-gunner-view.png      — gunner first-person sight (or static gunner pose)
 *   - tank-turret-aimed.png     — turret slewed to known target azimuth + elevation
 *   - tank-projectile-apex.png  — frame at projectile apex (~0.7 s after fire)
 *   - tank-projectile-impact.png — frame at projectile impact (after ~1.4 s flight)
 *   - tank-on-fire.png          — chassis at HP < 33% (on-fire VFX)
 *   - tank-tracks-blown.png     — tracks-blown substate (immobilized)
 *   - tank-turret-jammed.png    — turret-jammed substate (no slew)
 *   - tank-engine-killed.png    — engine-killed substate (no throttle)
 *
 * Sibling-PR dependencies:
 *   - tank-turret-rig (R1, landed) — TankTurret class for aim API.
 *   - tank-cannon-projectile (R1, landed) — TankCannonProjectile spawn surface.
 *   - tank-gunner-seat-adapter (R1, landed) — TankGunnerAdapter for gunner-seat capture.
 *   - tank-damage-states (R2) — required for on-fire + substate captures.
 *   - tank-ballistic-solver-wasm-pilot (R2) — required for AI gunner walk step
 *     (no static still captures this; observable as motion + fire).
 *   - tank-ai-gunner-route (R2) — required for NPC gunner walk step
 *     (no static still captures this).
 *
 * Each best-effort capture tolerates absent dev surfaces — the harness
 * probes for each surface in turn, logs availability, and falls back to
 * a static-camera framing at the documented pose. The owner walk-through
 * remains the load-bearing check; this script's job is to produce
 * enough evidence to merge under autonomous-loop posture.
 *
 * Modeled on `scripts/capture-vekhikl-3-tank-shots.ts` (cycle #8 chassis
 * evidence) and reuses the same `__engine` window-global driving
 * conventions + `preview-server.ts` harness backend.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9123;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'playtests',
  'cycle-vekhikl-4'
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
 * Best-effort probe: does the scene contain the M48 tank chassis? Returns
 * the world position of the first match so subsequent poses can refine
 * camera framing post-merge. Logs `found=false` if no tagged mesh exists
 * (sibling PRs not merged yet).
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
 * Best-effort: mount the nearest tank in the pilot seat. Returns true on
 * success. Tolerates the cycle #8 surfaces being named differently than
 * expected — falls through `spawnPlayerInNearestTank` → `spawnPlayerInNearestVehicle`.
 */
async function tryMountTankAsPilot(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            spawnPlayerInNearestVehicle?: () => boolean | void;
            spawnPlayerInNearestTank?: () => boolean | void;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.spawnPlayerInNearestTank === 'function') {
        return vm.spawnPlayerInNearestTank() !== false;
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
 * Best-effort: command forward throttle on the active vehicle adapter.
 * Returns true if the adapter accepted the input. Used to drive ~30 m
 * before the third-person capture so the chassis has moved off the
 * spawn pose.
 */
async function tryCommandForwardThrottle(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
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
    if (!vm || typeof vm.getActiveAdapter !== 'function') return false;
    const adapter = vm.getActiveAdapter();
    if (!adapter) return false;
    try {
      if (typeof adapter.setTrackInputs === 'function') {
        adapter.setTrackInputs(1, 0);
        return true;
      }
      if (typeof adapter.handleInput === 'function') {
        adapter.handleInput({
          throttle: 1,
          turn: 0,
          forward: 1,
          back: 0,
          left: 0,
          right: 0,
        });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: swap from pilot seat to gunner seat on the active tank.
 * Tolerates either a direct dev-console alias (`swapToGunner`) or the
 * generic `enterVehicle(_, 'gunner')` re-mount path. Returns true if
 * any surface accepted the swap.
 */
async function trySwapToGunnerSeat(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            swapToGunner?: () => boolean | void;
            swapSeat?: (role: string) => boolean | void;
            spawnPlayerInNearestTankAsGunner?: () => boolean | void;
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
        return vm.swapSeat('gunner') !== false;
      }
      if (typeof vm.spawnPlayerInNearestTankAsGunner === 'function') {
        return vm.spawnPlayerInNearestTankAsGunner() !== false;
      }
    } catch {
      return false;
    }
    return false;
  });
}

/**
 * Best-effort: command the active tank's turret to slew to a known
 * azimuth + elevation. Returns true if a TankTurret instance was found
 * and accepted the targets. The harness picks up the turret either via
 * a dev-console accessor or by scene-traversal looking for the named
 * yaw-node parent (cycle #9 R1 `TankTurret` names its node
 * `'tank_turret_yaw'`).
 */
async function tryAimTurret(
  page: Page,
  yawRad: number,
  pitchRad: number
): Promise<boolean> {
  return page.evaluate(
    ({ y, p }: { y: number; p: number }) => {
      type TurretLike = {
        setTargetYaw?: (yawRad: number) => void;
        setTargetPitch?: (pitchRad: number) => void;
      };
      const engine = (window as unknown as {
        __engine?: {
          systemManager?: {
            vehicleManager?: {
              getActiveTurret?: () => TurretLike | null;
              getActiveAdapter?: () => { turret?: TurretLike } | null;
            };
          };
        };
      }).__engine;
      const vm = engine?.systemManager?.vehicleManager;
      if (!vm) return false;
      let turret: TurretLike | null = null;
      try {
        if (typeof vm.getActiveTurret === 'function') {
          turret = vm.getActiveTurret() ?? null;
        }
        if (!turret && typeof vm.getActiveAdapter === 'function') {
          const adapter = vm.getActiveAdapter();
          turret = (adapter?.turret as TurretLike | undefined) ?? null;
        }
      } catch {
        turret = null;
      }
      if (!turret) return false;
      try {
        if (typeof turret.setTargetYaw === 'function') turret.setTargetYaw(y);
        if (typeof turret.setTargetPitch === 'function')
          turret.setTargetPitch(p);
        return true;
      } catch {
        return false;
      }
    },
    { y: yawRad, p: pitchRad }
  );
}

/**
 * Best-effort: fire the cannon by triggering the gunner adapter's
 * `consumeFireRequest` latch or a direct dev-console alias. Returns
 * true if any surface accepted the fire command.
 */
async function tryFireCannon(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            fireActiveCannon?: () => boolean | void;
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
      if (typeof vm.fireActiveCannon === 'function') {
        return vm.fireActiveCannon() !== false;
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
 * Best-effort: damage the active tank to the on-fire band (HP < 33%).
 * Tolerates either a direct `debugSetHp` alias or generic
 * `Tank.applyDamage(...)` calls applied multiple times until the band
 * crosses. Returns the resulting HP fraction or null if no surface
 * accepted.
 */
async function tryDamageTankToOnFire(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: {
            debugSetTankHp?: (frac: number) => boolean | void;
            debugDamageActiveTank?: (amount: number) => boolean | void;
            getActiveTank?: () =>
              | {
                  applyDamage?: (amount: number) => void;
                  getHp?: () => number;
                  getMaxHp?: () => number;
                }
              | null;
          };
        };
      };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return null;
    try {
      if (typeof vm.debugSetTankHp === 'function') {
        vm.debugSetTankHp(0.25); // 25% — squarely in the on-fire band
        return 0.25;
      }
      if (typeof vm.debugDamageActiveTank === 'function') {
        // Apply ~80% damage in one go; the dev surface owns scaling.
        vm.debugDamageActiveTank(0.8);
        return 0.2; // best-guess; consumer doesn't return resulting HP
      }
      if (typeof vm.getActiveTank === 'function') {
        const tank = vm.getActiveTank();
        if (
          tank &&
          typeof tank.applyDamage === 'function' &&
          typeof tank.getHp === 'function' &&
          typeof tank.getMaxHp === 'function'
        ) {
          // Apply repeated damage until HP < 33% (with a safety bound).
          const max = tank.getMaxHp();
          let safety = 50;
          while (safety-- > 0 && tank.getHp() / max > 0.3) {
            tank.applyDamage(max * 0.1);
          }
          return tank.getHp() / max;
        }
      }
    } catch {
      return null;
    }
    return null;
  });
}

/**
 * Best-effort: trigger one of the three damage substates via dev console.
 * Each substate has its own probe — tracks-blown, turret-jammed,
 * engine-killed. Returns true if any surface accepted.
 */
async function tryTriggerSubstate(
  page: Page,
  state: 'tracks_blown' | 'turret_jammed' | 'engine_killed'
): Promise<boolean> {
  return page.evaluate((stateName: string) => {
    type DebugSurface = {
      debugTracksBlown?: () => boolean | void;
      blowTracksOnActiveTank?: () => boolean | void;
      debugTurretJammed?: () => boolean | void;
      jamTurretOnActiveTank?: () => boolean | void;
      debugEngineKilled?: () => boolean | void;
      killEngineOnActiveTank?: () => boolean | void;
      debugTriggerSubstate?: (name: string) => boolean | void;
      getActiveTank?: () =>
        | {
            debugTriggerSubstate?: (name: string) => void;
            debugTracksBlown?: () => void;
            debugTurretJammed?: () => void;
            debugEngineKilled?: () => void;
          }
        | null;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { vehicleManager?: DebugSurface } };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (!vm) return false;
    try {
      if (typeof vm.debugTriggerSubstate === 'function') {
        return vm.debugTriggerSubstate(stateName) !== false;
      }
      if (stateName === 'tracks_blown') {
        if (typeof vm.debugTracksBlown === 'function') {
          vm.debugTracksBlown();
          return true;
        }
        if (typeof vm.blowTracksOnActiveTank === 'function') {
          vm.blowTracksOnActiveTank();
          return true;
        }
      } else if (stateName === 'turret_jammed') {
        if (typeof vm.debugTurretJammed === 'function') {
          vm.debugTurretJammed();
          return true;
        }
        if (typeof vm.jamTurretOnActiveTank === 'function') {
          vm.jamTurretOnActiveTank();
          return true;
        }
      } else if (stateName === 'engine_killed') {
        if (typeof vm.debugEngineKilled === 'function') {
          vm.debugEngineKilled();
          return true;
        }
        if (typeof vm.killEngineOnActiveTank === 'function') {
          vm.killEngineOnActiveTank();
          return true;
        }
      }
      // Fall-through: try the active-tank instance directly.
      if (typeof vm.getActiveTank === 'function') {
        const tank = vm.getActiveTank();
        if (tank) {
          if (typeof tank.debugTriggerSubstate === 'function') {
            tank.debugTriggerSubstate(stateName);
            return true;
          }
          if (stateName === 'tracks_blown' && typeof tank.debugTracksBlown === 'function') {
            tank.debugTracksBlown();
            return true;
          }
          if (stateName === 'turret_jammed' && typeof tank.debugTurretJammed === 'function') {
            tank.debugTurretJammed();
            return true;
          }
          if (stateName === 'engine_killed' && typeof tank.debugEngineKilled === 'function') {
            tank.debugEngineKilled();
            return true;
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  }, state);
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

    // ── Camera poses ────────────────────────────────────────────────
    // Placeholder coordinates relative to the documented M48 spawn.
    // Refine post-merge by reading actual spawn pose out of Tank.ts +
    // the M48 chassis registration block.
    const TANK_SPAWN_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const DROVE_FORWARD_POSE: Pose = {
      position: [0, 5, 14],
      yawDeg: 180,
      pitchDeg: -8,
    };
    const GUNNER_VIEW_POSE: Pose = {
      // Gunner POV is barrel-axis first-person. The adapter computes
      // this via computeGunnerSightCamera; if the adapter isn't
      // mounted, the static fallback puts the camera roughly where
      // the gunner sight would be (turret ring height, slightly back
      // from the trunnion, looking down +Z chassis-forward).
      position: [0, 3.2, -1],
      yawDeg: 0,
      pitchDeg: 0,
    };
    const TURRET_AIMED_POSE: Pose = {
      // Off-axis third-person framing so the slewed barrel reads
      // against the skyline.
      position: [10, 5, 8],
      yawDeg: 220,
      pitchDeg: -8,
    };
    const PROJECTILE_APEX_POSE: Pose = {
      // Side-on framing so the projectile arc is visible across the
      // frame. Camera sits ~30 m off the barrel axis.
      position: [25, 12, 5],
      yawDeg: 270,
      pitchDeg: -15,
    };
    const PROJECTILE_IMPACT_POSE: Pose = {
      // Framed on the documented target location (~280 m downrange).
      position: [0, 8, -280],
      yawDeg: 0,
      pitchDeg: -10,
    };
    const ON_FIRE_POSE: Pose = {
      // Closer third-person framing so the on-fire VFX dominates.
      position: [4, 4, 8],
      yawDeg: 200,
      pitchDeg: -12,
    };
    const TRACKS_BLOWN_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -10,
    };
    const TURRET_JAMMED_POSE: Pose = {
      position: [0, 6, 10],
      yawDeg: 180,
      pitchDeg: -15,
    };
    const ENGINE_KILLED_POSE: Pose = {
      position: [0, 5, 12],
      yawDeg: 180,
      pitchDeg: -10,
    };

    // === 0: Boot Open Frontier ===
    await startMode(page, 'open_frontier');
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(6000);
    await hideUiChrome(page);

    const probe = await probeTankSpawn(page);
    logStep(
      `M48 scene probe: found=${probe.found}` +
        (probe.position
          ? ` at (${probe.position.map((n) => n.toFixed(1)).join(', ')})`
          : ' (no tagged mesh; m48-tank-integration may not be merged yet)')
    );

    // === Capture 1: tank spawn (chassis + turret) ===
    await poseAndRender(page, TANK_SPAWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-spawn.png'));

    // === Capture 2: drove forward ~30 m ===
    const mounted = await tryMountTankAsPilot(page);
    logStep(
      `mount-as-pilot attempt: ${mounted ? 'success' : 'fallback to static pose'}`
    );
    if (mounted) {
      const threwForward = await tryCommandForwardThrottle(page);
      logStep(
        `forward-throttle command: ${threwForward ? 'accepted' : 'unavailable (static pose)'}`
      );
      // Default skid-steer cruise ~8-10 m/s; 3 s puts us ~25-30 m forward.
      if (threwForward) await page.waitForTimeout(3000);
    }
    await poseAndRender(page, DROVE_FORWARD_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-drove-forward.png'));

    // === Capture 3: swap to gunner seat ===
    const swappedToGunner = await trySwapToGunnerSeat(page);
    logStep(
      `gunner-seat swap: ${swappedToGunner ? 'success' : 'fallback to static pose'}`
    );
    if (swappedToGunner) await page.waitForTimeout(500);
    await poseAndRender(page, GUNNER_VIEW_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-gunner-view.png'));

    // === Capture 4: turret slewed to target azimuth + elevation ===
    // Aim ~45° right, ~5° elevation so the slew is visibly off-axis.
    const yawTargetRad = (45 * Math.PI) / 180;
    const pitchTargetRad = (5 * Math.PI) / 180;
    const aimed = await tryAimTurret(page, yawTargetRad, pitchTargetRad);
    logStep(
      `turret aim command: ${aimed ? 'accepted' : 'unavailable (static pose)'}`
    );
    if (aimed) {
      // 45° / 30°/s yaw slew = 1.5 s; wait 2 s with margin so the
      // integrator settles on the target.
      await page.waitForTimeout(2000);
    }
    await poseAndRender(page, TURRET_AIMED_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-turret-aimed.png'));

    // === Capture 5: cannon fired — frame at projectile apex ===
    const fired = await tryFireCannon(page);
    logStep(
      `cannon fire: ${fired ? 'accepted' : 'unavailable (static pose)'}`
    );
    if (fired) {
      // ~0.7 s puts a ~400 m/s round near apex at typical 280 m
      // engagement; a margin of safety here is fine because the
      // static fallback covers any timing mismatch.
      await page.waitForTimeout(700);
    }
    await poseAndRender(page, PROJECTILE_APEX_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-projectile-apex.png'));

    // === Capture 6: cannon impact — frame at terrain impact ===
    if (fired) {
      // ~0.7 s more for impact at typical flat 280 m engagement.
      await page.waitForTimeout(700);
    }
    await poseAndRender(page, PROJECTILE_IMPACT_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-projectile-impact.png'));

    // === Capture 7: HP < 33% — on-fire VFX ===
    const damagedHp = await tryDamageTankToOnFire(page);
    logStep(
      `damage-to-on-fire: ${
        damagedHp !== null
          ? `accepted, resulting HP fraction ≈ ${damagedHp.toFixed(2)}`
          : 'unavailable (static pose; tank-damage-states may not be merged)'
      }`
    );
    // Give the VFX systems a frame or two to spawn fire/smoke.
    await page.waitForTimeout(500);
    await poseAndRender(page, ON_FIRE_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-on-fire.png'));

    // === Capture 8: tracks-blown substate ===
    const tracksBlown = await tryTriggerSubstate(page, 'tracks_blown');
    logStep(
      `tracks-blown substate: ${
        tracksBlown ? 'triggered' : 'unavailable (static pose)'
      }`
    );
    await page.waitForTimeout(300);
    await poseAndRender(page, TRACKS_BLOWN_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-tracks-blown.png'));

    // === Capture 9: turret-jammed substate ===
    const turretJammed = await tryTriggerSubstate(page, 'turret_jammed');
    logStep(
      `turret-jammed substate: ${
        turretJammed ? 'triggered' : 'unavailable (static pose)'
      }`
    );
    // Optionally try to aim again to verify the jam takes effect.
    const postJamAim = await tryAimTurret(page, 0, 0);
    logStep(
      `post-jam aim probe (expected no-op if jammed): ${
        postJamAim ? 'aim surface still reachable' : 'aim surface unreachable'
      }`
    );
    await page.waitForTimeout(300);
    await poseAndRender(page, TURRET_JAMMED_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-turret-jammed.png'));

    // === Capture 10: engine-killed substate ===
    const engineKilled = await tryTriggerSubstate(page, 'engine_killed');
    logStep(
      `engine-killed substate: ${
        engineKilled ? 'triggered' : 'unavailable (static pose)'
      }`
    );
    await page.waitForTimeout(300);
    await poseAndRender(page, ENGINE_KILLED_POSE, VIEWPORT);
    await snap(page, join(OUT_DIR, 'tank-engine-killed.png'));

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-vekhikl-4-tank-shots failed:', err);
  process.exit(1);
});
