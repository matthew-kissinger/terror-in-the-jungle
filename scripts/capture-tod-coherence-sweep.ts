#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Time-of-day cross-material coherence sweep.
 *
 * Cycle `cycle-2026-06-09-lighting-rig-spike` task `tod-capture-harness`. This
 * is the measurement instrument the whole lighting-rig campaign is judged with
 * (see `docs/CAMPAIGN_2026-06-09-lighting-rig.md` Phase 0). It pins one fixed
 * camera fixture over A Shau, sweeps a fixed set of absolute clock hours, and
 * for each hour computes the mean relative luminance of four material families
 * sampled from known screen regions in a single frame:
 *
 *   - terrain ground   (MeshStandardNodeMaterial PBR)
 *   - billboard foliage (MeshBasicNodeMaterial, hemisphere blend clamped [0.40, 0.78])
 *   - NPC impostor     (MeshBasicNodeMaterial, second scene-scan authority)
 *   - GLB prop/vehicle (standard PBR)
 *
 * From the per-family luminance-vs-TOD curves it computes each family's range
 * (max - min), the range ratio vs terrain, and the Pearson correlation of the
 * family curve against the terrain curve. The known defect this instrument was
 * built to detect: foliage's range ratio sits far below terrain's, because the
 * billboard hemisphere blend is clamped to [0.40, 0.78] while PBR terrain swings
 * the full day/night range. There is NO pass/fail gate here — this is evidence
 * capture, not CI. The gate lands later (Phase 4 `tod-coherence-gate`).
 *
 * --- Framework reuse ---
 * Extends `scripts/capture-sun-and-atmosphere-shots.ts`: same `preview-server`
 * harness, same `WorldBuilder.forceTimeOfDay` mechanism, same
 * absolute-hour -> preset-relative-fraction conversion, same engine-RAF-stop +
 * forced sky rebake + sharp PNG pixel sampling. The TOD math header from that
 * script applies verbatim:
 *
 *   forceTimeOfDay = ((targetHour - preset.startHour) % 24 + 24) % 24 / 24
 *
 * because `AtmosphereSystem` reads
 *   currentHour = startHour + (simulationTimeSeconds / dayLengthSeconds) * 24
 * and `simulationTimeSeconds = forceTimeOfDay * dayLengthSeconds`.
 *
 * --- Region fixture (INSTRUMENT FIX, npc-impostor-and-effects-rig scope 0) ---
 * The fixed camera looks down-valley at a shallow pitch so terrain fills the
 * lower band. Terrain always uses its fixed ground band (`FAMILY_FALLBACK_REGIONS`).
 *
 * The `foliage` and `npc` families are ANCHORED ON ACTUAL PIXELS by scanning the
 * live scene for the billboard / impostor instances that actually render, not by
 * a fixed fallback box. The prior harness sampled `foliage` from a fixed
 * mid-ground band and `npc` from a box around the nearest combatant's *feet* —
 * both landed on bare down-valley terrain in the A Shau fixture, so the
 * `corrVsTerrain` / `rangeRatio` rows for those families were terrain-vs-terrain
 * and no shader change could move them (the billboard-rig-migration structural
 * finding, PR #376). The fix:
 *   - foliage: scan the scene for the billboard `MeshBasicNodeMaterial`
 *     (`vegetationExposure` uniform), read its `instancePosition` buffer, and
 *     anchor on the densest on-screen cluster of cards near the camera.
 *   - npc: scan the scene for the impostor `MeshBasicNodeMaterial`
 *     (`npcExposure` uniform), read its per-instance matrices, and anchor on the
 *     nearest on-screen sprite *centre* (the sprite plane, not feet).
 * A tight box (`ANCHOR_BOX_HALF_FRAC`) is centred on the projected anchor so the
 * sample lands on the subject. The fixed fallback boxes are kept only for the
 * degenerate case where no live instance projects on-screen (logged in `notes`).
 *
 * --- Headless posture ---
 * Best-effort per shot, matching the existing capture scripts: a scenario load
 * failure logs-and-continues rather than throwing, so a partial sweep still
 * produces a curves.json with whatever TODs succeeded.
 *
 * Usage:
 *   npm run capture:tod-sweep                     # 8-TOD baseline sweep
 *   npx tsx scripts/capture-tod-coherence-sweep.ts --label=rig-on
 *   npx tsx scripts/capture-tod-coherence-sweep.ts --label=rig-off --headed
 *
 * Artifacts (gitignored; commit with `git add -f` if evidence must be retained):
 *   artifacts/lighting-rig/tod-sweep/<label>/tod-<hh>h.png   (one PNG per TOD)
 *   artifacts/lighting-rig/tod-sweep/<label>/curves.json     (the curves + summary)
 */

import { chromium, type Page, type ConsoleMessage } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { startServer, stopServer, type ServerHandle } from './preview-server';

// ----- Scenario fixture -----

/**
 * Single scenario fixture: default A Shau. `startHour` mirrors the
 * `ashau` row in `capture-sun-and-atmosphere-shots.ts` (and
 * ScenarioAtmospherePresets.ts todCycle.startHour). `dayLengthSeconds = 600`
 * matches all four todCycle entries.
 */
const SCENARIO = {
  mode: 'a_shau_valley',
  startHour: 6,
  dayLengthSeconds: 600,
  /** Sun azimuth used to orient the down-valley pose. Mirrors the ashau preset. */
  sunAzimuthRad: Math.PI * 0.15,
  /** Camera clearance above local terrain at the fixture point. */
  cameraHeight: 95,
  /** Down-valley pitch: shallow so terrain fills the lower band and the
   *  vegetated mid-ground fills the foliage band. */
  pitchDeg: -16,
  settleSec: 8,
} as const;

/** Absolute clock hours swept (midnight -> pre-dawn -> dawn -> ... -> night). */
const TOD_HOURS: number[] = [0, 4, 6, 8, 12, 17, 19, 21];

// ----- Material-family region fixture (documented constants) -----

type FamilyKey = 'terrain' | 'foliage' | 'npc' | 'glb';

interface Region {
  /** Fractional screen box, all in [0, 1]; x grows right, y grows down. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Fixed fractional region boxes per material family for the documented camera
 * fixture. Terrain owns the lowest ground band and is never anchored. The
 * foliage / npc / glb boxes are FALLBACKS only — used when no live instance of
 * that family projects on-screen — because each is anchored on its actual
 * rendered pixels at runtime (see `resolveAnchorRegions` + ANCHOR_BOX_HALF_FRAC).
 */
const FAMILY_FALLBACK_REGIONS: Record<FamilyKey, Region> = {
  terrain: { x0: 0.30, x1: 0.70, y0: 0.82, y1: 0.98 },
  foliage: { x0: 0.30, x1: 0.70, y0: 0.55, y1: 0.72 },
  npc: { x0: 0.42, x1: 0.58, y0: 0.62, y1: 0.80 },
  glb: { x0: 0.10, x1: 0.30, y0: 0.62, y1: 0.82 },
};

/**
 * Half-extent (fraction of width / height) of the box centred on a projected
 * anchor. Kept tight so the sample lands on the subject card/sprite rather than
 * the terrain around it — the whole point of the instrument fix. The luminance
 * sampler already skips near-black silhouette pixels, so a tight box that frames
 * the lit subject reads the family, not the background.
 */
const ANCHOR_BOX_HALF_FRAC = 0.035;

/** Families whose region is refined by projecting a live on-screen anchor. */
type AnchoredFamily = 'foliage' | 'npc' | 'glb';
const ANCHORED_FAMILIES: AnchoredFamily[] = ['foliage', 'npc', 'glb'];

/**
 * Per-mesh instance cap when scanning for anchor candidates. A Shau places tens
 * of thousands of billboard cards; we only need the nearest on-screen one, and
 * scanning every instance in a `page.evaluate` is wasteful. The mesh instance
 * buffers are roughly camera-sorted by streaming order, so a generous cap still
 * finds a near, on-screen subject. Matches the crop-probe's bounded scan.
 */
const ANCHOR_INSTANCE_SCAN_CAP = 4096;

const PORT = 9184;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUT_ROOT = join(process.cwd(), 'artifacts', 'lighting-rig', 'tod-sweep');

// ----- CLI -----

function readFlagValue(name: string): string | null {
  const flagged = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (flagged) return flagged.split('=')[1] ?? null;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ----- TOD math (verbatim from capture-sun-and-atmosphere-shots.ts) -----

function targetHourToForceTod(targetHour: number, startHour: number): number {
  return ((targetHour - startHour) % 24 + 24) % 24 / 24;
}

/**
 * Approximate absolute sun elevation per clock hour. Mirrors the sin model in
 * ScenarioAtmospherePresets.clockElevationAtHour (max ~+70 deg at noon, floor
 * ~-10 deg overnight). Used to force the sky bake at the requested hour even
 * where the active preset's clamp envelope would not dip that low.
 */
function absoluteSunElevationRad(hour: number): number {
  // Daylight arc peaks at noon (hour 12); sunrise ~6h, sunset ~18h.
  const t = (hour - 6) / 12; // 0 at 6h, 1 at 18h
  const maxElevDeg = 70;
  const minElevDeg = -10;
  if (t <= 0 || t >= 1) return (minElevDeg * Math.PI) / 180;
  const elevDeg = minElevDeg + (maxElevDeg - minElevDeg) * Math.sin(t * Math.PI);
  return (elevDeg * Math.PI) / 180;
}

// ----- Engine driving (mirrors capture-sun-and-atmosphere-shots.ts) -----

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as { __engine?: { startGameWithMode?: (mode: string) => Promise<void> } }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
  }, mode);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as { __engine?: { gameStarted?: boolean; startupFlow?: { getState?: () => { phase?: string } } } }).__engine;
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
    /* not present */
  }
}

/**
 * Pin the active preset to the requested absolute hour and force the sky bake.
 * Same belt-and-suspenders approach as `capture-sun-and-atmosphere-shots.ts`:
 * publish the WorldBuilder override (dev-mode path), mutate
 * `simulationTimeSeconds` (perf-build path), and force-bake the sky LUT against
 * the explicit target sun direction so the bake fires regardless of the
 * preset's elevation-clamp envelope.
 */
async function applyHour(page: Page, hour: number): Promise<number> {
  const forceTod = targetHourToForceTod(hour, SCENARIO.startHour);
  const elevRad = absoluteSunElevationRad(hour);
  const cosE = Math.cos(elevRad);
  const targetSunDir = {
    x: cosE * Math.cos(SCENARIO.sunAzimuthRad),
    y: Math.sin(elevRad),
    z: cosE * Math.sin(SCENARIO.sunAzimuthRad),
  };

  await page.evaluate(
    ({ tod, simSeconds, tgt }: { tod: number; simSeconds: number; tgt: { x: number; y: number; z: number } }) => {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w['__worldBuilder'] as Record<string, unknown> | undefined) ?? {};
      w['__worldBuilder'] = { ...existing, forceTimeOfDay: tod, active: true };

      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown } } }).__engine;
      const atm = engine?.systemManager?.atmosphereSystem as unknown as {
        simulationTimeSeconds?: number;
        sunDirection?: { set: (x: number, y: number, z: number) => unknown };
      };
      if (!atm) return;
      atm.simulationTimeSeconds = simSeconds;
      atm.sunDirection?.set?.(tgt.x, tgt.y, tgt.z);
    },
    { tod: forceTod, simSeconds: forceTod * SCENARIO.dayLengthSeconds, tgt: targetSunDir }
  );

  await forceSkyRefresh(page, targetSunDir);
  return forceTod;
}

/**
 * Burn the sky-LUT refresh timer and force the bake against the target sun
 * direction so the snapshot reflects the requested hour, not a 2-second-stale
 * cached dome. Mirrors `capture-sun-and-atmosphere-shots.forceSkyRefresh`.
 */
async function forceSkyRefresh(page: Page, targetSunDir: { x: number; y: number; z: number }): Promise<void> {
  await page.evaluate(
    ({ tgt }: { tgt: { x: number; y: number; z: number } }) => {
      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown; terrainSystem?: unknown } } }).__engine;
      const atm = engine?.systemManager?.atmosphereSystem as unknown as {
        hosekBackend?: {
          skyTextureRefreshTimer?: number;
          skyContentChanged?: boolean;
          update?: (dt: number, sunDir: { x: number; y: number; z: number }) => void;
        };
        update?: (dt: number) => void;
        sunDirection?: { set: (x: number, y: number, z: number) => unknown };
        applyToRenderer?: () => void;
        getLightingSnapshot?: (out: unknown) => unknown;
        lightingSnapshot?: unknown;
      };
      const terrain = engine?.systemManager?.terrainSystem as
        | { setAtmosphereLighting?: (lighting: unknown) => void }
        | undefined;
      if (!atm) return;
      if (atm.hosekBackend) {
        atm.hosekBackend.skyTextureRefreshTimer = 9999;
        atm.hosekBackend.skyContentChanged = true;
      }
      atm.update?.(0.016);
      atm.update?.(3.0);
      if (atm.hosekBackend?.update && atm.sunDirection?.set) {
        atm.sunDirection.set(tgt.x, tgt.y, tgt.z);
        atm.hosekBackend.skyTextureRefreshTimer = 9999;
        atm.hosekBackend.skyContentChanged = true;
        atm.hosekBackend.update(3.0, tgt);
        atm.applyToRenderer?.();
      }
      if (atm.getLightingSnapshot && atm.lightingSnapshot && terrain?.setAtmosphereLighting) {
        terrain.setAtmosphereLighting(atm.getLightingSnapshot(atm.lightingSnapshot));
      }
    },
    { tgt: targetSunDir }
  );
}

// ----- Camera pose + render -----

interface Pose {
  position: [number, number, number];
  lookAt: [number, number, number];
}

/**
 * Build the fixed down-valley fixture pose: a fixed world XZ origin, camera
 * height clamped above local terrain, looking along the sun azimuth at a
 * shallow downward pitch. Deterministic so the four family regions land
 * consistently across the whole sweep.
 */
async function buildFixturePose(page: Page): Promise<Pose> {
  const terrainY = await page.evaluate(() => {
    const engine = (window as { __engine?: { systemManager?: { terrainSystem?: unknown } } }).__engine;
    const terrain = engine?.systemManager?.terrainSystem as { getHeightAt?: (x: number, z: number) => number } | undefined;
    const y = terrain?.getHeightAt?.(0, 0);
    return Number.isFinite(y) ? Number(y) : null;
  });
  const baseY = (terrainY ?? 0) + SCENARIO.cameraHeight;
  const position: [number, number, number] = [0, baseY, 0];
  const az = SCENARIO.sunAzimuthRad;
  const pitch = (SCENARIO.pitchDeg * Math.PI) / 180;
  const fx = Math.cos(pitch) * Math.cos(az);
  const fy = Math.sin(pitch);
  const fz = Math.cos(pitch) * Math.sin(az);
  return {
    position,
    lookAt: [position[0] + fx * 1000, position[1] + fy * 1000, position[2] + fz * 1000],
  };
}

async function poseAndRender(page: Page, pose: Pose): Promise<void> {
  await page.evaluate(
    ({ p, vp }: { p: Pose; vp: { width: number; height: number } }) => {
      const engine = (window as { __engine?: unknown }).__engine as unknown as {
        isLoopRunning?: boolean;
        animationFrameId?: number | null;
        renderer?: {
          camera?: {
            position: { set: (x: number, y: number, z: number) => unknown };
            rotation: { order: string; set: (x: number, y: number, z: number) => unknown };
            lookAt?: (x: number, y: number, z: number) => unknown;
            updateMatrixWorld: (force: boolean) => void;
            aspect?: number;
            updateProjectionMatrix?: () => void;
          };
          renderer?: {
            setSize: (w: number, h: number, updateStyle?: boolean) => void;
            render: (scene: unknown, camera: unknown) => void;
            shadowMap?: { needsUpdate?: boolean };
          };
          scene?: unknown;
          setOverrideCamera?: (camera: unknown | null) => void;
          postProcessing?: { setSize?: (w: number, h: number) => void; beginFrame?: () => void; endFrame?: () => void };
        };
        systemManager?: {
          atmosphereSystem?: {
            syncDomePosition?: (pos: unknown) => void;
            setTerrainYAtCamera?: (height: number) => void;
            applyToRenderer?: () => void;
            getLightingSnapshot?: (out: unknown) => unknown;
            lightingSnapshot?: unknown;
          };
          terrainSystem?: {
            getHeightAt?: (x: number, z: number) => number;
            updatePlayerPosition?: (position: { x: number; y: number; z: number }) => void;
            update?: (dt: number) => void;
            setAtmosphereLighting?: (lighting: unknown) => void;
            setRenderCameraOverride?: (camera: unknown | null) => void;
          };
        };
      };
      const renderer = engine?.renderer;
      const camera = renderer?.camera;
      const threeRenderer = renderer?.renderer;
      const scene = renderer?.scene;
      const pp = renderer?.postProcessing;
      if (!engine || !camera || !threeRenderer || !scene) throw new Error('engine/camera/renderer/scene unavailable');

      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      threeRenderer.setSize(vp.width, vp.height, true);
      pp?.setSize?.(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        camera.updateProjectionMatrix?.();
      }

      camera.position.set(p.position[0], p.position[1], p.position[2]);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(0, 0, 0);
      camera.lookAt?.(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
      camera.updateMatrixWorld(true);

      const terrain = engine.systemManager?.terrainSystem;
      const groundY = terrain?.getHeightAt?.(p.position[0], p.position[2]);
      terrain?.updatePlayerPosition?.({ x: p.position[0], y: Number.isFinite(groundY) ? Number(groundY) : p.position[1], z: p.position[2] });
      renderer.setOverrideCamera?.(camera);
      terrain?.setRenderCameraOverride?.(camera);
      for (let i = 0; i < 10; i++) terrain?.update?.(1 / 30);

      const atm = engine.systemManager?.atmosphereSystem;
      atm?.syncDomePosition?.(camera.position);
      if (atm?.setTerrainYAtCamera && Number.isFinite(groundY)) atm.setTerrainYAtCamera(Number(groundY));
      atm?.applyToRenderer?.();
      if (atm?.getLightingSnapshot && atm.lightingSnapshot && terrain?.setAtmosphereLighting) {
        terrain.setAtmosphereLighting(atm.getLightingSnapshot(atm.lightingSnapshot));
      }

      if (threeRenderer.shadowMap) threeRenderer.shadowMap.needsUpdate = true;
      for (let i = 0; i < 2; i++) {
        pp?.beginFrame?.();
        threeRenderer.render(scene, camera);
        pp?.endFrame?.();
      }
    },
    { p: pose, vp: VIEWPORT }
  );
}

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });
}

async function snap(page: Page, outFile: string): Promise<Buffer | null> {
  let buffer: Buffer | null = null;
  try {
    buffer = await page.screenshot({ type: 'png', fullPage: false, timeout: 60_000, animations: 'disabled' });
  } catch (err) {
    // The ashau 21km DEM can keep headless Chromium busy past Playwright's
    // "fonts loaded" gate; fall back to a raw CDP surface capture, matching
    // `capture-sun-and-atmosphere-shots.snap`.
    logStep(`Playwright screenshot timed out; retrying ${outFile} via CDP (${(err as Error).message})`);
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      buffer = Buffer.from(result.data, 'base64');
    } catch (cdpErr) {
      logStep(`snap failed for ${outFile}: ${(cdpErr as Error).message}`);
      buffer = null;
    } finally {
      await session.detach();
    }
  }
  if (!buffer) return null;
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
  return buffer;
}

// ----- World anchors -> screen regions -----

/**
 * Anchor the foliage / npc / glb families on the screen position of the actual
 * instances that render, by scanning the live scene (INSTRUMENT FIX, scope 0).
 *
 * The scene scan mirrors `scripts/konveyer-asset-crop-probe.ts`: a billboard
 * card carries a `vegetationExposure` uniform and stores world positions in an
 * `instancePosition` buffer attribute; an NPC impostor carries an `npcExposure`
 * uniform and is a `THREE.InstancedMesh` with per-instance matrices. For each
 * anchored family we project every live instance to screen, keep the on-screen
 * ones, and centre the anchor on the nearest cluster to the camera (the largest
 * on-screen subject). GLB still anchors on the nearest vehicle's body centre.
 * Returns null for families with no on-screen instance (the caller falls back to
 * the fixed box and records `fallback` in the sample notes).
 */
async function resolveAnchorRegions(page: Page, pose: Pose): Promise<Partial<Record<FamilyKey, Region>>> {
  const projected = await page.evaluate(
    ({ camPos, instCap }: { camPos: [number, number, number]; instCap: number }) => {
      const w = window as unknown as { __engine?: { renderer?: { camera?: unknown; scene?: unknown }; systemManager?: { vehicleManager?: unknown } } };
      const engine = w.__engine;
      const camera = engine?.renderer?.camera as unknown as {
        position: { x: number; y: number; z: number };
        projectionMatrix?: { elements: number[] };
        matrixWorldInverse?: { elements: number[] };
      } | undefined;
      const scene = engine?.renderer?.scene as unknown as { traverse?: (cb: (o: unknown) => void) => void } | undefined;
      if (!camera?.projectionMatrix || !camera.matrixWorldInverse) return { foliage: null, npc: null, glb: null };

      // Multiply a world point by viewProjection (column-major 4x4 in `elements`)
      // to NDC, then map to screen fractions. y is flipped (NDC up -> screen up).
      const proj = camera.projectionMatrix.elements;
      const view = camera.matrixWorldInverse.elements;
      const mul = (m: number[], v: number[]): number[] => [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
      ];
      const toScreen = (wx: number, wy: number, wz: number): { x: number; y: number } | null => {
        const eye = mul(view, [wx, wy, wz, 1]);
        const clip = mul(proj, eye);
        if (clip[3] <= 0) return null; // behind camera
        const ndcX = clip[0] / clip[3];
        const ndcY = clip[1] / clip[3];
        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return null;
        return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2 };
      };

      // Nearest on-screen world point to the camera -> its screen fraction. A
      // tight box around this lands on the closest (largest) subject instance.
      const nearestOnScreen = (entries: Array<{ x: number; y: number; z: number }>): { x: number; y: number } | null => {
        let best: { x: number; y: number } | null = null;
        let bestDist = Infinity;
        for (const e of entries) {
          const dx = e.x - camPos[0];
          const dz = e.z - camPos[2];
          const dist = dx * dx + dz * dz;
          if (dist >= bestDist) continue;
          const s = toScreen(e.x, e.y, e.z);
          if (!s) continue;
          best = s;
          bestDist = dist;
        }
        return best;
      };

      const hasUniform = (material: unknown, key: string): boolean => {
        const uniforms = (material as { uniforms?: Record<string, unknown> } | undefined)?.uniforms;
        return Boolean(uniforms && Object.prototype.hasOwnProperty.call(uniforms, key));
      };
      const materialArray = (material: unknown): unknown[] => (Array.isArray(material) ? material : material ? [material] : []);

      // Scan the live scene for foliage cards + NPC impostor sprites and collect
      // their world anchor points. Foliage: world positions live in the
      // `instancePosition` buffer (camera-facing card centre is position + a
      // half-height lift). NPC: per-instance matrices on a THREE.InstancedMesh
      // (sprite centre is the matrix translation; the geometry is already
      // centred on the sprite plane via NPC_SPRITE_RENDER_Y_OFFSET).
      const foliagePoints: Array<{ x: number; y: number; z: number }> = [];
      const npcPoints: Array<{ x: number; y: number; z: number }> = [];
      scene?.traverse?.((object: unknown) => {
        const obj = object as {
          isMesh?: boolean;
          isInstancedMesh?: boolean;
          visible?: boolean;
          count?: number;
          material?: unknown;
          matrixWorld?: { elements: number[] };
          geometry?: { instanceCount?: number; attributes?: { instancePosition?: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number }; instanceScale?: { getY?: (i: number) => number } } };
          getMatrixAt?: (i: number, m: { elements: number[] }) => void;
        };
        if (!obj?.isMesh || obj.visible === false) return;
        for (const material of materialArray(obj.material)) {
          const isFoliage = hasUniform(material, 'vegetationExposure');
          const isNpc = hasUniform(material, 'npcExposure');
          if (!isFoliage && !isNpc) continue;
          if (isNpc && obj.isInstancedMesh && typeof obj.getMatrixAt === 'function') {
            const count = Math.min(Number(obj.count ?? 0), instCap);
            const m = { elements: new Array(16).fill(0) };
            const owMatrix = obj.matrixWorld?.elements;
            for (let i = 0; i < count; i++) {
              obj.getMatrixAt(i, m);
              // Translation column of the local instance matrix.
              let tx = m.elements[12];
              let ty = m.elements[13];
              let tz = m.elements[14];
              // Premultiply by mesh world matrix (translation part is enough for
              // an axis-aligned instanced mesh; the meshes use identity world).
              if (owMatrix) {
                tx += owMatrix[12];
                ty += owMatrix[13];
                tz += owMatrix[14];
              }
              if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tz)) {
                npcPoints.push({ x: tx, y: ty, z: tz });
              }
            }
          } else {
            const ip = obj.geometry?.attributes?.instancePosition;
            const sc = obj.geometry?.attributes?.instanceScale;
            if (isFoliage && ip) {
              const count = Math.min(Number(obj.geometry?.instanceCount ?? ip.count ?? 0), instCap);
              for (let i = 0; i < count; i++) {
                const x = Number(ip.getX(i));
                const y = Number(ip.getY(i));
                const z = Number(ip.getZ(i));
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
                // `instancePosition` is the centred card's vertical centre
                // (PlaneGeometry origin; terrainHeight + yOffset*scale). Lift a
                // modest quarter-height so the anchor sits on the lit card body
                // above terrain rather than the base buried in the ground.
                const lift = Math.min(3, Math.max(0.5, Number(sc?.getY?.(i) ?? 4) * 0.25));
                foliagePoints.push({ x, y: y + lift, z });
              }
            }
          }
        }
      });

      const sm = engine?.systemManager as { vehicleManager?: unknown; combatantSystem?: unknown } | undefined;
      const vehicleManager = sm?.vehicleManager as { getAllVehicles?: () => Array<{ getPosition?: () => { x: number; y: number; z: number } | undefined; position?: { x: number; y: number; z: number } }> } | undefined;
      const glbPoints: Array<{ x: number; y: number; z: number }> = [];
      for (const v of vehicleManager?.getAllVehicles?.() ?? []) {
        const p = v.getPosition?.() ?? v.position;
        if (p && Number.isFinite(p.x)) glbPoints.push({ x: p.x, y: (p.y ?? 0) + 1.0, z: p.z });
      }

      // Secondary NPC anchor source: project live combatant positions (lifted to
      // the sprite's vertical centre). The impostor InstancedMesh scan above
      // misses NPCs rendered as close-GLB models or when a bucket's `count` is
      // stale; the authoritative combatant list catches any on-screen subject so
      // the npc row anchors on a real sprite whenever one is in frame.
      const NPC_SPRITE_CENTRE_LIFT = 1.6;
      const combatantSystem = sm?.combatantSystem as { getAllCombatants?: () => Array<{ position?: { x: number; y: number; z: number }; isAlive?: boolean; health?: number }> } | undefined;
      for (const c of combatantSystem?.getAllCombatants?.() ?? []) {
        const p = c.position;
        const alive = c.isAlive !== false && (c.health === undefined || c.health > 0);
        if (alive && p && Number.isFinite(p.x)) npcPoints.push({ x: p.x, y: (p.y ?? 0) + NPC_SPRITE_CENTRE_LIFT, z: p.z });
      }

      return {
        foliage: nearestOnScreen(foliagePoints),
        npc: nearestOnScreen(npcPoints),
        glb: nearestOnScreen(glbPoints),
      };
    },
    { camPos: pose.position, instCap: ANCHOR_INSTANCE_SCAN_CAP }
  );

  const out: Partial<Record<FamilyKey, Region>> = {};
  for (const fam of ANCHORED_FAMILIES) {
    const pt = projected[fam];
    if (!pt) continue;
    out[fam] = {
      x0: Math.max(0, pt.x - ANCHOR_BOX_HALF_FRAC),
      x1: Math.min(1, pt.x + ANCHOR_BOX_HALF_FRAC),
      y0: Math.max(0, pt.y - ANCHOR_BOX_HALF_FRAC),
      y1: Math.min(1, pt.y + ANCHOR_BOX_HALF_FRAC),
    };
  }
  return out;
}

// ----- Pixel sampling -----

/**
 * Mean relative luminance (Rec. 709) of a fractional region, sampled from the
 * decoded PNG with sharp. Near-black silhouette pixels (luma < 0.012) are
 * skipped so a dark NPC cutout edge does not pull the family mean toward zero;
 * matches the luma-floor idiom in `capture-sun-and-atmosphere-shots.ts`.
 */
async function meanLuminanceInRegion(buffer: Buffer, region: Region): Promise<number | null> {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;
    const channels = meta.channels ?? 3;
    const raw = await img.raw().toBuffer();
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(region.x0 * w)));
    const x1 = Math.max(x0 + 1, Math.min(w, Math.floor(region.x1 * w)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(region.y0 * h)));
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor(region.y1 * h)));
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * channels;
        const r = raw[idx] / 255;
        const g = raw[idx + 1] / 255;
        const b = raw[idx + 2] / 255;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < 0.012) continue;
        sum += luma;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  } catch {
    return null;
  }
}

// ----- Curve math -----

/** Pearson correlation between two equal-length series; null if degenerate. */
function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

// ----- Result types -----

interface TodSample {
  hour: number;
  forceTimeOfDay: number;
  pngBytes: number;
  regions: Record<FamilyKey, Region>;
  /** Mean relative luminance per family; null where the region had no valid pixels. */
  luminance: Record<FamilyKey, number | null>;
  notes: string;
}

interface FamilyCurve {
  family: FamilyKey;
  /** Luminance per swept hour (aligned to TOD_HOURS that produced a sample). */
  values: number[];
  hours: number[];
  min: number | null;
  max: number | null;
  range: number | null;
  /** range / terrain.range. Foliage << 1 is the known clamp-band defect signature. */
  rangeRatioVsTerrain: number | null;
  /** Pearson correlation of this family's curve against terrain's. */
  correlationVsTerrain: number | null;
}

interface CurvesFile {
  createdAt: string;
  label: string;
  scenario: string;
  todHours: number[];
  samples: TodSample[];
  curves: FamilyCurve[];
}

// ----- Sweep -----

async function captureTod(page: Page, hour: number, outDir: string): Promise<TodSample> {
  // Stop the engine RAF first so the streaming terrain does not keep the main
  // thread busy past Playwright's screenshot timeout (ashau 21km DEM).
  await page.evaluate(() => {
    const engine = (window as { __engine?: { isLoopRunning?: boolean; animationFrameId?: number | null } }).__engine;
    if (!engine) return;
    engine.isLoopRunning = false;
    if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
      cancelAnimationFrame(engine.animationFrameId);
      engine.animationFrameId = null;
    }
  });

  const forceTimeOfDay = await applyHour(page, hour);
  await page.waitForTimeout(Math.max(1500, SCENARIO.settleSec * 200));
  await hideUiChrome(page);

  const pose = await buildFixturePose(page);
  await poseAndRender(page, pose);

  const anchorRegions = await resolveAnchorRegions(page, pose);
  const regions: Record<FamilyKey, Region> = {
    terrain: FAMILY_FALLBACK_REGIONS.terrain,
    foliage: anchorRegions.foliage ?? FAMILY_FALLBACK_REGIONS.foliage,
    npc: anchorRegions.npc ?? FAMILY_FALLBACK_REGIONS.npc,
    glb: anchorRegions.glb ?? FAMILY_FALLBACK_REGIONS.glb,
  };

  const hh = String(hour).padStart(2, '0');
  const outFile = join(outDir, `tod-${hh}h.png`);
  const buffer = await snap(page, outFile);

  const luminance: Record<FamilyKey, number | null> = { terrain: null, foliage: null, npc: null, glb: null };
  if (buffer) {
    for (const fam of Object.keys(regions) as FamilyKey[]) {
      luminance[fam] = await meanLuminanceInRegion(buffer, regions[fam]);
    }
  }

  const anchoredNote = ANCHORED_FAMILIES
    .map((f) => `${f}=${anchorRegions[f] ? 'anchored' : 'fallback'}`)
    .join(' ');
  return {
    hour,
    forceTimeOfDay,
    pngBytes: buffer?.byteLength ?? 0,
    regions,
    luminance,
    notes: buffer ? anchoredNote : 'snap failed',
  };
}

function buildCurves(samples: TodSample[]): FamilyCurve[] {
  const families: FamilyKey[] = ['terrain', 'foliage', 'npc', 'glb'];
  // Aligned terrain curve: only hours where terrain produced a value.
  const terrainPairs = samples
    .map((s) => ({ hour: s.hour, v: s.luminance.terrain }))
    .filter((p): p is { hour: number; v: number } => p.v !== null);
  const terrainRange = terrainPairs.length > 1
    ? Math.max(...terrainPairs.map((p) => p.v)) - Math.min(...terrainPairs.map((p) => p.v))
    : null;

  return families.map((family) => {
    const pairs = samples
      .map((s) => ({ hour: s.hour, v: s.luminance[family] }))
      .filter((p): p is { hour: number; v: number } => p.v !== null);
    const values = pairs.map((p) => p.v);
    const hours = pairs.map((p) => p.hour);
    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;
    const range = min !== null && max !== null ? max - min : null;
    const rangeRatioVsTerrain = range !== null && terrainRange && terrainRange > 0 ? range / terrainRange : null;

    // Correlation: align this family's hours with terrain's on the shared hours.
    const terrainByHour = new Map(terrainPairs.map((p) => [p.hour, p.v]));
    const sharedFamily: number[] = [];
    const sharedTerrain: number[] = [];
    for (const p of pairs) {
      const t = terrainByHour.get(p.hour);
      if (t === undefined) continue;
      sharedFamily.push(p.v);
      sharedTerrain.push(t);
    }
    const correlationVsTerrain = family === 'terrain' ? 1 : pearson(sharedFamily, sharedTerrain);

    return { family, values, hours, min, max, range, rangeRatioVsTerrain, correlationVsTerrain };
  });
}

function printSummary(label: string, curves: FamilyCurve[]): void {
  const fmt = (v: number | null, d = 4): string => (v === null ? '   n/a' : v.toFixed(d));
  logStep(`Coherence summary (label=${label}):`);
  logStep('  family    | min     | max     | range   | rangeRatioVsTerrain | corrVsTerrain');
  logStep('  ----------|---------|---------|---------|---------------------|--------------');
  for (const c of curves) {
    logStep(
      `  ${c.family.padEnd(9)} | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.range)} | ` +
      `${fmt(c.rangeRatioVsTerrain, 3).padStart(19)} | ${fmt(c.correlationVsTerrain, 3).padStart(13)}`
    );
  }
  const foliage = curves.find((c) => c.family === 'foliage');
  if (foliage?.rangeRatioVsTerrain !== null && foliage?.rangeRatioVsTerrain !== undefined) {
    logStep(
      `  Defect signature: foliage rangeRatioVsTerrain=${foliage.rangeRatioVsTerrain.toFixed(3)} ` +
      `(< 1 means foliage swings less than terrain — the [0.40, 0.78] clamp band).`
    );
  }
}

// ----- Main -----

async function main(): Promise<void> {
  const label = readFlagValue('label') ?? 'baseline';
  const outDir = join(OUT_ROOT, label);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
    logStep(`Created ${outDir}`);
  }

  const headless = !hasFlag('headed');
  let server: ServerHandle | null = null;
  const samples: TodSample[] = [];
  try {
    server = await startServer({ mode: 'perf', port: PORT, buildIfMissing: false, log: logStep });

    const browser = await chromium.launch({
      headless,
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    // tsx compiles this script with esbuild `keepNames:true`, which rewrites
    // named inner functions inside our `page.evaluate` bodies to
    // `__name(fn, "name")`. That helper exists in the Node module scope but NOT
    // in the browser, so any evaluate with a named inner function throws
    // `ReferenceError: __name is not defined`. Define an identity shim on the
    // page before navigation so the helper resolves in every evaluated frame.
    await context.addInitScript(() => {
      (window as unknown as { __name?: (fn: unknown) => unknown }).__name = (fn: unknown): unknown => fn;
    });
    const onConsole = (msg: ConsoleMessage): void => {
      if (msg.type() === 'error') console.error(`[browser:err] ${msg.text()}`);
    };
    page.on('console', onConsole);

    const baseUrl = `http://127.0.0.1:${PORT}/?perf=1&uiTransitions=0`;
    let scenarioReady = false;
    try {
      logStep(`Navigate -> ${baseUrl}`);
      await page.goto(baseUrl, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
      await waitForEngine(page);
      await startMode(page, SCENARIO.mode);
      await dismissBriefingIfPresent(page);
      // rig-prototype A/B: flip the Phase 0 unified lighting-rig flag ON when
      // `--rig-on` is passed. The flag object is published on `window.__lightingRig`
      // by AtmosphereSystem; the shared binding picks the value up next frame.
      if (hasFlag('rig-on')) {
        await page.evaluate(() => {
          const rig = (window as unknown as { __lightingRig?: { enabled: boolean } }).__lightingRig;
          if (rig) rig.enabled = true;
        });
        logStep('Lighting rig flag ON (window.__lightingRig.enabled = true)');
      }
      await page.waitForTimeout(SCENARIO.settleSec * 1000);
      scenarioReady = true;
    } catch (err) {
      // Headless-safe: log-and-continue. We still write an (empty) curves.json
      // so downstream tooling has a stable artifact shape.
      logStep(`Scenario load FAILED, skipping sweep: ${(err as Error).message}`);
    }

    if (scenarioReady) {
      for (const hour of TOD_HOURS) {
        try {
          const sample = await captureTod(page, hour, outDir);
          samples.push(sample);
          const lum = (Object.keys(sample.luminance) as FamilyKey[])
            .map((f) => `${f}=${sample.luminance[f] === null ? 'n/a' : sample.luminance[f]!.toFixed(3)}`)
            .join(' ');
          logStep(`TOD ${hour}h: ${lum} (${sample.notes})`);
        } catch (err) {
          logStep(`TOD ${hour}h FAILED: ${(err as Error).message}`);
        }
      }
    }

    page.off('console', onConsole);
    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const curves = buildCurves(samples);
  const out: CurvesFile = {
    createdAt: new Date().toISOString(),
    label,
    scenario: SCENARIO.mode,
    todHours: TOD_HOURS,
    samples,
    curves,
  };
  const curvesPath = join(outDir, 'curves.json');
  writeFileSync(curvesPath, `${JSON.stringify(out, null, 2)}\n`);
  logStep(`Wrote ${curvesPath}`);

  const ok = samples.filter((s) => s.pngBytes > 0).length;
  logStep(`Sweep complete: ${ok}/${TOD_HOURS.length} TODs captured.`);
  printSummary(label, curves);
}

main().catch((err) => {
  console.error('capture-tod-coherence-sweep failed:', err);
  process.exit(1);
});
