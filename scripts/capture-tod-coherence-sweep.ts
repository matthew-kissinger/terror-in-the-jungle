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
 * --- Region fixture ---
 * The fixed camera looks down-valley at a shallow pitch so terrain fills the
 * lower band and the densely-vegetated mid-ground fills the foliage band. The
 * four family regions are documented fixed fractional boxes
 * (`FAMILY_FALLBACK_REGIONS`). When the engine exposes a live world anchor for
 * a family (nearest NPC via `combatantSystem.getAllCombatants()`, nearest
 * GLB via `vehicleManager.getAllVehicles()`), that anchor is projected to
 * screen and a box of half-extent `ANCHOR_BOX_HALF_FRAC` is centred on it,
 * overriding the fallback so the sample tracks the actual entity. Terrain and
 * foliage always use the fixed bands (terrain is always ground; A Shau is
 * uniformly vegetated through the mid-ground).
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
 * fixture. Terrain owns the lowest ground band; foliage owns the vegetated
 * mid-ground band; NPC + GLB own placeholder boxes that are overridden at
 * runtime by projecting their live world anchors (see ANCHOR_BOX_HALF_FRAC).
 * These fallbacks are used when no live anchor is found.
 */
const FAMILY_FALLBACK_REGIONS: Record<FamilyKey, Region> = {
  terrain: { x0: 0.30, x1: 0.70, y0: 0.82, y1: 0.98 },
  foliage: { x0: 0.30, x1: 0.70, y0: 0.55, y1: 0.72 },
  npc: { x0: 0.42, x1: 0.58, y0: 0.62, y1: 0.80 },
  glb: { x0: 0.10, x1: 0.30, y0: 0.62, y1: 0.82 },
};

/** Half-extent (fraction of width / height) of the box centred on a projected anchor. */
const ANCHOR_BOX_HALF_FRAC = 0.05;

/** Families whose region is refined by projecting a live world anchor. */
type AnchoredFamily = 'npc' | 'glb';
const ANCHORED_FAMILIES: AnchoredFamily[] = ['npc', 'glb'];

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
 * Project the nearest live NPC and GLB-vehicle world anchors to screen-space
 * fractional points. Terrain + foliage use their fixed fallback bands, so this
 * only resolves the two anchored families. Returns null entries for families
 * with no live anchor.
 */
async function resolveAnchorRegions(page: Page, pose: Pose): Promise<Partial<Record<FamilyKey, Region>>> {
  const projected = await page.evaluate(
    ({ camPos }: { camPos: [number, number, number] }) => {
      const engine = (window as { __engine?: { renderer?: { camera?: unknown }; systemManager?: { combatantSystem?: unknown; vehicleManager?: unknown } } }).__engine;
      const camera = engine?.renderer?.camera as unknown as {
        position: { x: number; y: number; z: number };
        projectionMatrix?: { elements: number[] };
        matrixWorldInverse?: { elements: number[] };
        updateMatrixWorld?: (force: boolean) => void;
      } | undefined;
      if (!camera?.projectionMatrix || !camera.matrixWorldInverse) return { npc: null, glb: null };

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

      const nearest = (entries: Array<{ x: number; y: number; z: number }>): { x: number; y: number } | null => {
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

      const sm = engine?.systemManager;
      const combatantSystem = sm?.combatantSystem as { getAllCombatants?: () => Array<{ position?: { x: number; y: number; z: number }; isAlive?: boolean }> } | undefined;
      const vehicleManager = sm?.vehicleManager as { getAllVehicles?: () => Array<{ getPosition?: () => { x: number; y: number; z: number } | undefined; position?: { x: number; y: number; z: number } }> } | undefined;

      const npcPoints: Array<{ x: number; y: number; z: number }> = [];
      for (const c of combatantSystem?.getAllCombatants?.() ?? []) {
        const p = c.position;
        if (p && Number.isFinite(p.x)) npcPoints.push({ x: p.x, y: (p.y ?? 0) + 1.0, z: p.z });
      }
      const glbPoints: Array<{ x: number; y: number; z: number }> = [];
      for (const v of vehicleManager?.getAllVehicles?.() ?? []) {
        const p = v.getPosition?.() ?? v.position;
        if (p && Number.isFinite(p.x)) glbPoints.push({ x: p.x, y: (p.y ?? 0) + 1.0, z: p.z });
      }

      return { npc: nearest(npcPoints), glb: nearest(glbPoints) };
    },
    { camPos: pose.position }
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
    foliage: FAMILY_FALLBACK_REGIONS.foliage,
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
