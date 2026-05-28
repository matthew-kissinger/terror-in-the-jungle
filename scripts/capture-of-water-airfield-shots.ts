#!/usr/bin/env tsx
/**
 * Capture Playwright pre/post screenshots + deterministic probe assertions
 * for cycle `cycle-terrain-compositor` task
 * `compositor-of-acceptance-captures` (R3.1).
 *
 * Design memo:
 *   docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 *
 * What this script proves
 * -----------------------
 * The cycle's two user-observable acceptance lines are:
 *
 *   1. OF rivers sit on actual ground at airfield + motor-pool overlaps
 *      (no water-on-walls).
 *   2. OF Main Airfield reads as flat with smooth padding (no
 *      "random-mountain" peak inside the envelope, no padding-gap at the
 *      grade ramp).
 *
 * Owner walk-through is the load-bearing check (R3.2 ships the
 * PLAYTEST_PENDING row). This script is the post-merge automated gate:
 * it captures screenshots + writes a deterministic JSON summary that
 * asserts:
 *
 *   - At every probed water-on-walls coord, the river surface Y is
 *     within 0.5 m of `terrain.getHeightAt(x, z) + 0.85`. (The +0.85
 *     offset matches the OperationalRuntimeComposer watercraft surface
 *     snap convention — see cycle brief Acceptance #1.)
 *   - On a 20m half-extent grid centered on the airfield interior,
 *     `max(getHeightAt) - min(getHeightAt) <= 0.5 m`. (Regression test
 *     for the random-mountain bug.)
 *
 * Capture matrix
 * --------------
 *   - of-main-airfield-interior-{pre,post}.png — third-person overhead at
 *     ~80 m altitude over `(365, 0, -1335)`. Pre shows random-mountain /
 *     padding-gap; post shows flat interior + smooth grade ramp.
 *   - of-main-airfield-south-envelope-edge-{pre,post}.png — ground-level
 *     framing at `(365, 0, -1100)` looking toward the runway, framing the
 *     grade ramp where the padding gap was previously visible.
 *   - of-water-on-walls-{pre,post}.png — known hydrology ∩ airfield
 *     overlap point. Default OF coord `(280, 0, -1280)` (inside the
 *     Main Airfield 270 m envelope, north of the motor pool). The script
 *     also logs additional candidate overlap coords sampled at runtime,
 *     and falls back to the default if the runtime probe finds no
 *     hovering water.
 *
 * Usage
 * -----
 *   # Pre-bump capture (on master tip before R2.x lands):
 *   npx tsx scripts/capture-of-water-airfield-shots.ts --pair-tag=pre
 *
 *   # Post-bump capture (on cycle head, after R2.x merges):
 *   npx tsx scripts/capture-of-water-airfield-shots.ts --pair-tag=post
 *
 *   # Either flag also supports per-shot skip switches:
 *   --skip-airfield-interior
 *   --skip-airfield-south-edge
 *   --skip-water-on-walls
 *   --skip-pre               # convenience: behaves like --pair-tag=post
 *   --scenario=openfrontier  # explicit scenario flag (default openfrontier)
 *
 * Notes
 * -----
 *   - Captures are best-effort. If OF fails to load (e.g. perf-harness
 *     bundle stale or hydrology cache cold), the script logs the
 *     failure and continues. Owner walk-through is the load-bearing
 *     check; this script gates the post-merge automated check.
 *   - Artifacts are written under
 *     `artifacts/cycle-terrain-compositor/playtest-evidence/`
 *     (gitignored by default; the JSON summary is small enough to
 *     `git add -f` on the post-merge run).
 *   - Modeled on `scripts/capture-of-river-surface-shots.ts` and
 *     `scripts/capture-ashau-edge-and-flow-shots.ts` for arg shape +
 *     artifact path convention.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9189;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-terrain-compositor',
  'playtest-evidence'
);

/** Watercraft surface offset used by OperationalRuntimeComposer's spawn snap. */
const WATERCRAFT_HOVER_OFFSET_M = 0.85;

/** Tolerance for water-on-walls assertion (cycle brief Acceptance #1). */
const HOVER_TOLERANCE_M = 0.5;

/** Half-extent (m) of the airfield-flatness probe grid. */
const AIRFIELD_FLATNESS_HALF_EXTENT_M = 20;

/** Grid step (m) within the flatness probe. 5 m gives a 9x9 = 81 sample grid. */
const AIRFIELD_FLATNESS_GRID_STEP_M = 5;

/** Tolerance for airfield flatness assertion (no random-mountain). */
const AIRFIELD_FLATNESS_TOLERANCE_M = 0.5;

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

type PairTag = 'pre' | 'post';

interface WaterOnWallsProbe {
  /** World-space query coord. */
  query: [number, number, number];
  /** Resolved water-surface Y, or null when dry. */
  waterSurfaceY: number | null;
  /** Terrain ground Y at the query XZ. */
  terrainY: number;
  /** `terrainY + WATERCRAFT_HOVER_OFFSET_M` — the expected hover surface. */
  expectedSurfaceY: number;
  /** |waterSurfaceY - expectedSurfaceY|, or null when waterSurfaceY null. */
  hoverAboveTerrainMeters: number | null;
  /** True iff hoverAboveTerrainMeters > HOVER_TOLERANCE_M. */
  violation: boolean;
  /** Diagnostic source from sampleWaterInteraction (`'hydrology' | 'global' | null`). */
  source: string | null;
}

interface AirfieldFlatnessProbe {
  /** Center of the probed grid. */
  center: [number, number, number];
  /** Half-extent (m) of the grid (axis-aligned square). */
  halfExtentMeters: number;
  /** Grid step (m). */
  stepMeters: number;
  /** Number of valid samples. */
  sampleCount: number;
  /** Min terrain Y across the grid. */
  minY: number;
  /** Max terrain Y across the grid. */
  maxY: number;
  /** `maxY - minY`. */
  rangeMeters: number;
  /** True iff rangeMeters > AIRFIELD_FLATNESS_TOLERANCE_M. */
  violation: boolean;
}

interface CaptureRecord {
  name: string;
  filename: string;
  pairTag: PairTag;
  pose: Pose;
  pngBytes: number;
  waterOnWalls: WaterOnWallsProbe | null;
  airfieldFlatness: AirfieldFlatnessProbe | null;
  notes: string;
}

interface SuiteSummary {
  createdAt: string;
  pairTag: PairTag;
  scenario: string;
  outDir: string;
  hoverToleranceMeters: number;
  airfieldFlatnessToleranceMeters: number;
  watercraftHoverOffsetMeters: number;
  records: CaptureRecord[];
  /** Additional water-on-walls candidate coords sampled at runtime (advisory). */
  waterOnWallsCandidates: WaterOnWallsProbe[];
  /** Conflict log read from getLastTerrainCompositorOutput() if available. */
  compositorConflicts: CompositorConflictSummary[] | null;
  /** Aggregate counts for the merge gate. */
  totals: {
    waterOnWallsViolations: number;
    airfieldFlatnessViolations: number;
    capturesSucceeded: number;
    capturesFailed: number;
  };
  notes: string[];
}

interface CompositorConflictSummary {
  stampA: number;
  stampB: number;
  kindA: string;
  kindB: string;
  overlap: { minX: number; minZ: number; maxX: number; maxZ: number };
  severity: string;
}

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

// ----- Engine driving -----

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
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

// ----- Pose + render -----

async function poseAndRender(page: Page, pose: Pose): Promise<void> {
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
          skybox?: { updatePosition?: (pos: unknown) => void };
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

      // Stop the engine RAF so per-frame systems do not overwrite our pose.
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

      // Glue the analytic dome + legacy skybox to the camera position.
      const skybox = engine.systemManager?.skybox;
      if (skybox?.updatePosition) skybox.updatePosition(camera.position);
      const atm = engine.systemManager?.atmosphereSystem;
      if (atm?.syncDomePosition) atm.syncDomePosition(camera.position);
      if (atm && typeof atm.update === 'function') atm.update(0.016);

      pp?.beginFrame?.();
      threeRenderer.render(scene, camera);
      pp?.endFrame?.();
    },
    { p: pose, vp: VIEWPORT }
  );
}

async function snap(page: Page, outFile: string): Promise<Buffer | null> {
  try {
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: 60_000,
      animations: 'disabled',
    });
    writeFileSync(outFile, buffer);
    logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
    return buffer;
  } catch (err) {
    logStep(`snap failed for ${outFile}: ${(err as Error).message}`);
    return null;
  }
}

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });
}

// ----- Probes -----

/**
 * Probe the live WaterSystem + TerrainSystem at the supplied XZ to
 * detect a water-on-walls violation. The acceptance contract per the
 * cycle brief is: a watercraft surface sits at `terrain.getHeightAt(x,z)
 * + 0.85` (the OperationalRuntimeComposer hover offset); if the water
 * surface diverges from that target by more than HOVER_TOLERANCE_M, the
 * river is rendering on a wall.
 */
async function probeWaterOnWallsAt(
  page: Page,
  query: [number, number, number]
): Promise<WaterOnWallsProbe> {
  try {
    const probe = await page.evaluate(
      (input: { q: [number, number, number]; hoverOffset: number }) => {
        type EngineLike = {
          systemManager?: {
            terrainSystem?: {
              getHeightAt?: (x: number, z: number) => number;
            };
            waterSystem?: {
              getWaterSurfaceY?: (pos: { x: number; y: number; z: number }) => number | null;
              sampleWaterInteraction?: (pos: {
                x: number;
                y: number;
                z: number;
              }) => { surfaceY: number | null; source?: string };
            };
          };
        };
        const engine = (window as unknown as { __engine?: EngineLike }).__engine;
        const terrain = engine?.systemManager?.terrainSystem;
        const water = engine?.systemManager?.waterSystem;
        const [x, , z] = input.q;
        const terrainY = typeof terrain?.getHeightAt === 'function'
          ? Number(terrain.getHeightAt(x, z))
          : NaN;
        let waterSurfaceY: number | null = null;
        let source: string | null = null;
        if (water) {
          try {
            if (typeof water.sampleWaterInteraction === 'function') {
              const sample = water.sampleWaterInteraction({ x, y: 0, z });
              waterSurfaceY = sample.surfaceY ?? null;
              source = sample.source ?? null;
            } else if (typeof water.getWaterSurfaceY === 'function') {
              waterSurfaceY = water.getWaterSurfaceY({ x, y: 0, z });
            }
          } catch {
            // sampler may throw if bindings not yet wired; treat as dry.
            waterSurfaceY = null;
          }
        }
        return { terrainY, waterSurfaceY, source };
      },
      { q: query, hoverOffset: WATERCRAFT_HOVER_OFFSET_M }
    );
    const terrainY = Number.isFinite(probe.terrainY) ? probe.terrainY : 0;
    const expectedSurfaceY = terrainY + WATERCRAFT_HOVER_OFFSET_M;
    const hoverAboveTerrainMeters =
      probe.waterSurfaceY === null
        ? null
        : Math.abs(probe.waterSurfaceY - expectedSurfaceY);
    const violation =
      hoverAboveTerrainMeters !== null &&
      hoverAboveTerrainMeters > HOVER_TOLERANCE_M;
    return {
      query,
      waterSurfaceY: probe.waterSurfaceY,
      terrainY,
      expectedSurfaceY,
      hoverAboveTerrainMeters,
      violation,
      source: probe.source,
    };
  } catch (err) {
    logStep(`probeWaterOnWallsAt(${query.join(',')}) FAILED: ${(err as Error).message}`);
    return {
      query,
      waterSurfaceY: null,
      terrainY: NaN,
      expectedSurfaceY: NaN,
      hoverAboveTerrainMeters: null,
      violation: false,
      source: null,
    };
  }
}

/**
 * Sample TerrainSystem.getHeightAt on a regular grid centered on the
 * airfield interior and return min/max/range. Tolerance violation =
 * regression signal for the random-mountain bug.
 */
async function probeAirfieldFlatness(
  page: Page,
  center: [number, number, number]
): Promise<AirfieldFlatnessProbe> {
  try {
    const probe = await page.evaluate(
      (input: {
        c: [number, number, number];
        half: number;
        step: number;
      }) => {
        type EngineLike = {
          systemManager?: {
            terrainSystem?: { getHeightAt?: (x: number, z: number) => number };
          };
        };
        const engine = (window as unknown as { __engine?: EngineLike }).__engine;
        const terrain = engine?.systemManager?.terrainSystem;
        if (!terrain?.getHeightAt) {
          return { minY: NaN, maxY: NaN, sampleCount: 0 };
        }
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let sampleCount = 0;
        const [cx, , cz] = input.c;
        for (let dx = -input.half; dx <= input.half; dx += input.step) {
          for (let dz = -input.half; dz <= input.half; dz += input.step) {
            const y = Number(terrain.getHeightAt(cx + dx, cz + dz));
            if (!Number.isFinite(y)) continue;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            sampleCount += 1;
          }
        }
        return { minY, maxY, sampleCount };
      },
      {
        c: center,
        half: AIRFIELD_FLATNESS_HALF_EXTENT_M,
        step: AIRFIELD_FLATNESS_GRID_STEP_M,
      }
    );
    const minY = Number.isFinite(probe.minY) ? probe.minY : NaN;
    const maxY = Number.isFinite(probe.maxY) ? probe.maxY : NaN;
    const rangeMeters =
      Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : NaN;
    const violation =
      Number.isFinite(rangeMeters) && rangeMeters > AIRFIELD_FLATNESS_TOLERANCE_M;
    return {
      center,
      halfExtentMeters: AIRFIELD_FLATNESS_HALF_EXTENT_M,
      stepMeters: AIRFIELD_FLATNESS_GRID_STEP_M,
      sampleCount: probe.sampleCount,
      minY,
      maxY,
      rangeMeters,
      violation,
    };
  } catch (err) {
    logStep(`probeAirfieldFlatness(${center.join(',')}) FAILED: ${(err as Error).message}`);
    return {
      center,
      halfExtentMeters: AIRFIELD_FLATNESS_HALF_EXTENT_M,
      stepMeters: AIRFIELD_FLATNESS_GRID_STEP_M,
      sampleCount: 0,
      minY: NaN,
      maxY: NaN,
      rangeMeters: NaN,
      violation: false,
    };
  }
}

/**
 * Try to read the most recent TerrainCompositor output via the
 * `LastCompositorOutput` cache. Returns null if the cache slot is
 * unavailable — perf-harness builds set `import.meta.env.DEV = false`
 * and `ModeStartupPreparer` only writes the cache in DEV. The brief
 * accepts a default water-on-walls coord when this read fails.
 */
async function readCompositorConflicts(
  page: Page
): Promise<CompositorConflictSummary[] | null> {
  try {
    return await page.evaluate(() => {
      // Best-effort: the compositor cache is module-private. Some
      // builds expose it on a window global; if neither is available,
      // return null.
      const w = window as unknown as {
        __terrainCompositorOutput?: {
          conflicts?: Array<{
            stampA: number;
            stampB: number;
            kindA: string;
            kindB: string;
            overlapAABB: { minX: number; minZ: number; maxX: number; maxZ: number };
            severity: string;
          }>;
          stamps?: Array<{ kind: string; centerX?: number; centerZ?: number }>;
        };
      };
      const cached = w.__terrainCompositorOutput;
      if (!cached?.conflicts) return null;
      return cached.conflicts.map((c) => ({
        stampA: c.stampA,
        stampB: c.stampB,
        kindA: c.kindA,
        kindB: c.kindB,
        overlap: c.overlapAABB,
        severity: c.severity,
      }));
    });
  } catch (err) {
    logStep(`readCompositorConflicts failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Sweep a small set of candidate coords around the airfield ∩ hydrology
 * region to find runtime water-on-walls candidates. Advisory: helps
 * surface a real overlap location when the compositor cache is not
 * available (e.g. perf-harness build). The cycle brief allows
 * defaulting to `(280, 0, -1280)` when no candidate is detected.
 */
async function sweepWaterOnWallsCandidates(
  page: Page
): Promise<WaterOnWallsProbe[]> {
  // Sample a ring of points around the Main Airfield envelope inner +
  // outer edges, plus the motor-pool overlap. Coords picked to hit the
  // airfield (365, -1335, r=270) and motor-pool (155, -1195, r=36)
  // overlap zones with hydrology channels.
  const candidates: [number, number, number][] = [
    [280, 0, -1280],   // brief's default fallback
    [200, 0, -1230],   // motor-pool / airfield gap
    [155, 0, -1195],   // motor-pool center
    [350, 0, -1100],   // airfield south envelope edge
    [365, 0, -1100],   // airfield south envelope edge (matches pose)
    [450, 0, -1335],   // airfield east interior
    [280, 0, -1335],   // airfield west interior
  ];
  const probes: WaterOnWallsProbe[] = [];
  for (const c of candidates) {
    probes.push(await probeWaterOnWallsAt(page, c));
  }
  return probes;
}

// ----- Pose presets -----

/**
 * Pose 1: OF Main Airfield interior overhead. The airfield is centered
 * at `(365, 0, -1335)` (OpenFrontierConfig.ts:190) with circular
 * footprint radius 270 m. Camera sits 80 m above the center looking
 * straight down so the full envelope + any random-mountain inside the
 * footprint reads in frame. yaw=0 keeps the runway oriented predictably.
 */
const POSE_AIRFIELD_INTERIOR: Pose = {
  position: [365, 80, -1335],
  yawDeg: 0,
  pitchDeg: -88, // nearly straight-down; -90 risks gimbal lock in YXZ
};
const PROBE_AIRFIELD_INTERIOR: [number, number, number] = [365, 0, -1335];

/**
 * Pose 2: OF Main Airfield south envelope edge — ground-level pose at
 * `(365, 0, -1100)` (235 m south of center, inside the 270 m envelope).
 * Camera placed a few meters above the ground looking north toward the
 * runway so the grade ramp + the airfield interior both read in frame.
 * Padding-gap regression — if the post-compositor build still has a
 * jagged grade ramp here, the frame reveals it directly.
 */
const POSE_AIRFIELD_SOUTH_EDGE: Pose = {
  position: [365, 5, -1100],
  yawDeg: 180, // look toward -Z (north, toward airfield center)
  pitchDeg: -5,
};
const PROBE_AIRFIELD_SOUTH_EDGE: [number, number, number] = [365, 0, -1100];

/**
 * Pose 3: OF water-on-walls overlook. Default frames the
 * airfield-hydrology overlap region from ~40 m up so any hovering river
 * ribbon over the flattened airfield ground reads in frame. Probe coord
 * is the brief's default `(280, 0, -1280)` unless `sweepWaterOnWallsCandidates`
 * surfaces a stronger candidate at runtime.
 */
const POSE_WATER_ON_WALLS_DEFAULT: Pose = {
  position: [280, 40, -1200],
  yawDeg: 180, // look toward -Z, into the airfield + hydrology overlap
  pitchDeg: -25,
};
const PROBE_WATER_ON_WALLS_DEFAULT: [number, number, number] = [280, 0, -1280];

// ----- Captures -----

async function captureAirfieldInterior(
  page: Page,
  pairTag: PairTag,
  records: CaptureRecord[]
): Promise<void> {
  const name = 'of-main-airfield-interior';
  const filename = join(OUT_DIR, `${name}-${pairTag}.png`);
  let notes = '';
  let pngBytes = 0;
  let airfieldFlatness: AirfieldFlatnessProbe | null = null;
  try {
    await hideUiChrome(page);
    await poseAndRender(page, POSE_AIRFIELD_INTERIOR);
    airfieldFlatness = await probeAirfieldFlatness(page, PROBE_AIRFIELD_INTERIOR);
    await page.waitForTimeout(500);
    const buf = await snap(page, filename);
    pngBytes = buf?.byteLength ?? 0;
    if (!buf) notes = 'snap failed';
  } catch (err) {
    notes = `error: ${(err as Error).message}`;
    logStep(`captureAirfieldInterior FAILED: ${notes}`);
  }
  records.push({
    name,
    filename,
    pairTag,
    pose: POSE_AIRFIELD_INTERIOR,
    pngBytes,
    waterOnWalls: null,
    airfieldFlatness,
    notes,
  });
}

async function captureAirfieldSouthEdge(
  page: Page,
  pairTag: PairTag,
  records: CaptureRecord[]
): Promise<void> {
  const name = 'of-main-airfield-south-envelope-edge';
  const filename = join(OUT_DIR, `${name}-${pairTag}.png`);
  let notes = '';
  let pngBytes = 0;
  let waterOnWalls: WaterOnWallsProbe | null = null;
  try {
    await hideUiChrome(page);
    await poseAndRender(page, POSE_AIRFIELD_SOUTH_EDGE);
    // South-edge is on the airfield envelope — sampling water here also
    // proves any hydrology channel doesn't hover at the grade ramp.
    waterOnWalls = await probeWaterOnWallsAt(page, PROBE_AIRFIELD_SOUTH_EDGE);
    await page.waitForTimeout(500);
    const buf = await snap(page, filename);
    pngBytes = buf?.byteLength ?? 0;
    if (!buf) notes = 'snap failed';
  } catch (err) {
    notes = `error: ${(err as Error).message}`;
    logStep(`captureAirfieldSouthEdge FAILED: ${notes}`);
  }
  records.push({
    name,
    filename,
    pairTag,
    pose: POSE_AIRFIELD_SOUTH_EDGE,
    pngBytes,
    waterOnWalls,
    airfieldFlatness: null,
    notes,
  });
}

async function captureWaterOnWalls(
  page: Page,
  pairTag: PairTag,
  records: CaptureRecord[],
  candidates: WaterOnWallsProbe[]
): Promise<WaterOnWallsProbe> {
  const name = 'of-water-on-walls';
  const filename = join(OUT_DIR, `${name}-${pairTag}.png`);
  let notes = '';
  let pngBytes = 0;
  // Prefer a candidate that resolves a water surface (source = hydrology)
  // — that's where the visual symptom would render. If none, fall back to
  // the documented default.
  const wettest = candidates.find((c) => c.waterSurfaceY !== null && c.source === 'hydrology')
    ?? candidates.find((c) => c.waterSurfaceY !== null)
    ?? null;
  const probeQuery: [number, number, number] = wettest?.query ?? PROBE_WATER_ON_WALLS_DEFAULT;
  // Pose camera ~40 m up, looking toward the probe point.
  const pose: Pose = wettest
    ? {
        position: [probeQuery[0], 40, probeQuery[2] + 80],
        yawDeg: 180,
        pitchDeg: -25,
      }
    : POSE_WATER_ON_WALLS_DEFAULT;
  let probe: WaterOnWallsProbe = wettest
    ?? {
      query: PROBE_WATER_ON_WALLS_DEFAULT,
      waterSurfaceY: null,
      terrainY: NaN,
      expectedSurfaceY: NaN,
      hoverAboveTerrainMeters: null,
      violation: false,
      source: null,
    };
  try {
    await hideUiChrome(page);
    await poseAndRender(page, pose);
    // Re-probe AT the chosen query so the JSON reflects the same world
    // tick as the rendered frame.
    probe = await probeWaterOnWallsAt(page, probeQuery);
    await page.waitForTimeout(500);
    const buf = await snap(page, filename);
    pngBytes = buf?.byteLength ?? 0;
    if (!buf) notes = 'snap failed';
  } catch (err) {
    notes = `error: ${(err as Error).message}`;
    logStep(`captureWaterOnWalls FAILED: ${notes}`);
  }
  records.push({
    name,
    filename,
    pairTag,
    pose,
    pngBytes,
    waterOnWalls: probe,
    airfieldFlatness: null,
    notes,
  });
  return probe;
}

async function navigateAndStart(
  page: Page,
  baseUrl: string,
  modeKey: string
): Promise<void> {
  const url = `${baseUrl}?perf=1&uiTransitions=0`;
  logStep(`Navigate -> ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
  await waitForEngine(page);
  await startMode(page, modeKey);
  await dismissBriefingIfPresent(page);
  // OF is a 4 km procedural map with a hydrology bake at seed 42. Give
  // the terrain streamer + hydrology mesh time to settle before the
  // first pose change.
  await page.waitForTimeout(6000);
}

// ----- Scenario routing -----

function resolveScenarioModeKey(scenarioFlag: string | null): {
  modeKey: string;
  label: string;
} {
  const raw = (scenarioFlag ?? 'openfrontier').toLowerCase();
  if (raw === 'openfrontier' || raw === 'open_frontier' || raw === 'of') {
    return { modeKey: 'open_frontier', label: 'openfrontier' };
  }
  throw new Error(
    `Unknown --scenario=${raw} (expected 'openfrontier'); cycle scope is OF-only`
  );
}

// ----- Main -----

async function main(): Promise<void> {
  const pairTagFlag = readFlagValue('pair-tag') as PairTag | null;
  const pairTag: PairTag = pairTagFlag ?? (hasFlag('skip-pre') ? 'post' : 'post');
  if (pairTag !== 'pre' && pairTag !== 'post') {
    throw new Error(`Unknown --pair-tag=${pairTag} (expected pre|post)`);
  }
  const scenarioFlag = readFlagValue('scenario');
  const { modeKey, label: scenarioLabel } = resolveScenarioModeKey(scenarioFlag);

  const skipAirfieldInterior = hasFlag('skip-airfield-interior');
  const skipAirfieldSouthEdge = hasFlag('skip-airfield-south-edge');
  const skipWaterOnWalls = hasFlag('skip-water-on-walls');

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    logStep(`Created ${OUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  const records: CaptureRecord[] = [];
  const notes: string[] = [];
  let waterOnWallsCandidates: WaterOnWallsProbe[] = [];
  let compositorConflicts: CompositorConflictSummary[] | null = null;
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      log: logStep,
    });

    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[browser:err] ${msg.text()}`);
    });

    const baseUrl = `http://127.0.0.1:${PORT}/`;
    await navigateAndStart(page, baseUrl, modeKey);

    // Best-effort: try to read compositor conflicts (DEV-only cache).
    compositorConflicts = await readCompositorConflicts(page);
    if (compositorConflicts) {
      logStep(`Read ${compositorConflicts.length} compositor conflicts from cache`);
    } else {
      notes.push('Compositor conflict cache unavailable (perf build, DEV-only).');
    }

    // Sweep candidate water-on-walls coords so the JSON summary records
    // all probed XZs alongside the chosen capture coord.
    waterOnWallsCandidates = await sweepWaterOnWallsCandidates(page);
    const hits = waterOnWallsCandidates.filter((c) => c.waterSurfaceY !== null);
    logStep(`Water-on-walls sweep: ${hits.length}/${waterOnWallsCandidates.length} coords resolved a water surface`);

    if (!skipAirfieldInterior) {
      await captureAirfieldInterior(page, pairTag, records);
    } else {
      notes.push('Airfield interior skipped via --skip-airfield-interior');
    }

    if (!skipAirfieldSouthEdge) {
      await captureAirfieldSouthEdge(page, pairTag, records);
    } else {
      notes.push('Airfield south edge skipped via --skip-airfield-south-edge');
    }

    if (!skipWaterOnWalls) {
      await captureWaterOnWalls(page, pairTag, records, waterOnWallsCandidates);
    } else {
      notes.push('Water-on-walls skipped via --skip-water-on-walls');
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const waterOnWallsViolations =
    records.filter((r) => r.waterOnWalls?.violation).length +
    waterOnWallsCandidates.filter((c) => c.violation).length;
  const airfieldFlatnessViolations =
    records.filter((r) => r.airfieldFlatness?.violation).length;
  const capturesSucceeded = records.filter((r) => r.pngBytes > 0).length;
  const capturesFailed = records.filter((r) => r.pngBytes === 0).length;

  const summary: SuiteSummary = {
    createdAt: new Date().toISOString(),
    pairTag,
    scenario: scenarioLabel,
    outDir: OUT_DIR,
    hoverToleranceMeters: HOVER_TOLERANCE_M,
    airfieldFlatnessToleranceMeters: AIRFIELD_FLATNESS_TOLERANCE_M,
    watercraftHoverOffsetMeters: WATERCRAFT_HOVER_OFFSET_M,
    records,
    waterOnWallsCandidates,
    compositorConflicts,
    totals: {
      waterOnWallsViolations,
      airfieldFlatnessViolations,
      capturesSucceeded,
      capturesFailed,
    },
    notes,
  };

  const summaryPath = join(OUT_DIR, 'summary-of-water-airfield.json');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const pairedPath = join(OUT_DIR, `summary-of-water-airfield-${pairTag}.json`);
  writeFileSync(pairedPath, `${JSON.stringify(summary, null, 2)}\n`);
  logStep(`Wrote summary -> ${summaryPath}`);
  logStep(`Wrote paired summary -> ${pairedPath}`);

  logStep(
    `Capture summary (pair=${pairTag}, scenario=${scenarioLabel}): ` +
      `${capturesSucceeded} succeeded, ${capturesFailed} failed, ` +
      `water-on-walls violations=${waterOnWallsViolations}, ` +
      `airfield-flatness violations=${airfieldFlatnessViolations}`
  );
}

main().catch((err) => {
  console.error('capture-of-water-airfield-shots failed:', err);
  process.exit(1);
});
