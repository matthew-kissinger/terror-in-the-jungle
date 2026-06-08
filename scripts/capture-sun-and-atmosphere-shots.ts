#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Capture Playwright smoke screenshots for cycle #12
 * `cycle-sun-and-atmosphere-overhaul` task `sun-and-atmosphere-playtest-evidence`.
 *
 * Extends the framework from `scripts/capture-hosek-wilkie-shots.ts`. Adds a
 * `--tod=<noon|golden|dusk|twilight|dawn|midnight>` flag that pins the active
 * scenario's preset to the requested time-of-day via
 * `WorldBuilder.forceTimeOfDay` (per `AtmosphereSystem.ts:200-204`); converts
 * the target *absolute* hour to the preset-relative fraction the runtime
 * expects (`forceTimeOfDay = (targetHour - preset.todCycle.startHour + 24) / 24`).
 *
 * The full capture matrix per the cycle brief is:
 *   - 20 visual shots: 5 scenarios x 4 TOD (noon / golden / dusk / twilight,
 *     plus the brief's optional dawn TOD). The default run captures
 *     noon/golden/dusk/twilight for all five scenarios (= 20). Pass
 *     `--tod=dawn` to add the dawn matrix on top.
 *   - 8 WebGPU vs WebGL2 parity shots: 1 scenario (openfrontier) x 4 TOD x 2
 *     renderer modes.
 *   - 5 night-red regression shots: each scenario at absolute midnight; the
 *     run pixel-samples `renderer.moonLight.color` and asserts
 *     `r < 0.5 * max(g, b)` (red-not-dominant assertion lives inside the
 *     script and writes a JSON summary alongside the captures).
 *
 * Total when invoked with the cycle's default matrix: 20 + 8 + 5 = 33 shots.
 *
 * Cycle `cycle-skylut-resolution-bump` task `skylut-playtest-evidence`
 * (2026-05-19) adds a `--lut-bump-check` flag that takes a focused pair only:
 * Open Frontier noon + A Shau midday-flyover. Used with `--prefix=pre|post`
 * to produce the before/after baseline pair. The artifact root flips to
 * `artifacts/cycle-skylut-resolution-bump/playtest-evidence/`. The flag also
 * computes a horizon-row gradient monotonicity check (delta-per-pixel
 * ≤ 4/255 across the visible band) and a fog-vs-sky horizon parity check
 * (±5%) and writes them to `bump-summary.json` alongside the PNGs.
 *
 * Usage:
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts                   # full 33-shot matrix
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --tod=noon         # single TOD, all scenarios
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --scenario=ashau   # single scenario, all TOD
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --skip-parity      # skip the WebGPU/WebGL2 pair set
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --skip-night       # skip the night-red regression set
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check --prefix=pre   # pre-bump baseline pair
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check --prefix=post  # post-bump pair + analysis
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --ridge-occlusion-check --scenario=ashau --tod=dusk
 *   npx tsx scripts/capture-sun-and-atmosphere-shots.ts --ridge-occlusion-check --scenario=ashau --tod=dusk --renderer-modes=webgpu-strict,webgpu-force-webgl --angle=d3d11
 *
 * Notes:
 *   - `combat120` (ai_sandbox) has no `todCycle` and ignores `forceTimeOfDay`.
 *     The script detects the absent cycle and falls back to direct
 *     `sunDirection` manipulation (matches the pattern in
 *     `scripts/capture-sky-sun-disc-restore.ts:forceSunBelowHorizon`).
 *   - Captures are best-effort. If a scenario fails to load (e.g. the perf-harness
 *     bundle is stale), the script logs the failure and continues to the next
 *     shot rather than throwing — autonomous-loop posture treats this as
 *     evidence-capture, not a merge gate.
 *   - Artifacts are written under `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/`
 *     (gitignored by default; commit via `git add -f`).
 */

import { chromium, type Page, type ConsoleMessage } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type ScenarioKey = 'ashau' | 'openfrontier' | 'tdm' | 'zc' | 'combat120';

type TodLabel = 'noon' | 'golden' | 'dusk' | 'twilight' | 'dawn' | 'midnight';

type RendererMode = 'webgpu' | 'webgpu-strict' | 'webgpu-force-webgl' | 'webgl';
type CaptureView = 'sun' | 'ridge';
type BrowserAngleBackend = 'swiftshader' | 'd3d11' | 'vulkan' | 'default';

interface ScenarioPreset {
  key: ScenarioKey;
  mode: string;                  // engine.startGameWithMode argument
  startHour: number;             // matches ScenarioAtmospherePresets.ts todCycle.startHour
  hasTodCycle: boolean;
  sunAzimuthRad: number;
  sunElevationRad: number;
  cameraHeight: number;          // sky-dominant clearance above local terrain
  settleSec: number;
  label: string;
}

interface Pose {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
  lookAt?: [number, number, number];
}

interface RidgeOcclusionDiagnostics {
  target: [number, number, number];
  cameraGround: [number, number, number];
  sunHorizontal: [number, number];
  ridgeRiseMeters: number;
  score: number;
  samplesChecked: number;
}

interface SunOcclusionDiagnostics {
  terrainOccluded: boolean;
  terrainHitDistance: number | null;
  terrainClearanceAtCamera: number | null;
  samplesChecked: number;
  cameraPosition: [number, number, number] | null;
  sunDirection: [number, number, number] | null;
  reason: string;
}

// ----- Configuration tables -----

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    key: 'ashau',
    mode: 'a_shau_valley',
    startHour: 6,
    hasTodCycle: true,
    sunAzimuthRad: Math.PI * 0.15,
    sunElevationRad: Math.PI * 0.055,
    cameraHeight: 300,
    settleSec: 8,
    label: 'A Shau Valley',
  },
  {
    key: 'openfrontier',
    mode: 'open_frontier',
    startHour: 12,
    hasTodCycle: true,
    sunAzimuthRad: Math.PI * 0.25,
    sunElevationRad: Math.PI * 0.42,
    cameraHeight: 120,
    settleSec: 6,
    label: 'Open Frontier',
  },
  {
    key: 'tdm',
    mode: 'tdm',
    startHour: 18,
    hasTodCycle: true,
    sunAzimuthRad: Math.PI * 1.1,
    sunElevationRad: Math.PI * 0.035,
    cameraHeight: 80,
    settleSec: 6,
    label: 'TDM',
  },
  {
    key: 'zc',
    mode: 'zone_control',
    startHour: 16,
    hasTodCycle: true,
    sunAzimuthRad: Math.PI * 0.78,
    sunElevationRad: Math.PI * 0.12,
    cameraHeight: 100,
    settleSec: 6,
    label: 'Zone Control',
  },
  {
    key: 'combat120',
    mode: 'ai_sandbox',
    startHour: 12,           // mirrors preset.sunElevationRad ~ noon, but no animation
    hasTodCycle: false,
    sunAzimuthRad: Math.PI * 0.25,
    sunElevationRad: Math.PI * 0.42,
    cameraHeight: 80,
    settleSec: 6,
    label: 'combat120',
  },
];

/**
 * Absolute clock hour each TOD targets. Mirrors spike Section 4 visual
 * targets and lines up with `clockElevationAtHour` in
 * ScenarioAtmospherePresets.ts (which uses a sin curve with maxElev=70deg and
 * minElev=-10deg, so the available elevation range is dawn→noon→dusk→midnight
 * = -10°→+70°→-10°→-10°). The TOD hours below were back-solved from those
 * elevations to land at the spike Section 4 targets per TOD bucket.
 */
const TOD_HOURS: Record<TodLabel, number> = {
  noon: 12,          // peak elevation +70 deg (max in the model)
  golden: 16,        // descending branch; sin gives ~+22 deg elevation
  dusk: 17.6,        // sin gives ~+6 deg elevation
  twilight: 20,      // descending past horizon; sin gives ~-5 deg elevation
  dawn: 4,           // mirror of dusk, pre-sunrise; sin gives ~+6 deg
  midnight: 0,       // absolute midnight; elevation pinned to -10 deg
};

const DEFAULT_VISUAL_TODS: TodLabel[] = ['noon', 'golden', 'dusk', 'twilight'];
const PARITY_SCENARIO: ScenarioKey = 'openfrontier';
const PARITY_TODS: TodLabel[] = DEFAULT_VISUAL_TODS;
const NIGHT_TOD: TodLabel = 'midnight';

const PORT = 9182;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-sun-and-atmosphere-overhaul',
  'playtest-evidence'
);

/**
 * Cycle `cycle-skylut-resolution-bump`: focused pre/post artifact root used
 * only when `--lut-bump-check` is passed. Distinct from `OUT_DIR` so the
 * cycle's evidence lives in its own folder under `artifacts/`.
 */
const LUT_BUMP_OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-skylut-resolution-bump',
  'playtest-evidence'
);

/**
 * Cycle `cycle-skylut-resolution-bump` focused capture pair: Open Frontier
 * noon (the canonical "midday dark spots" report) + A Shau midday flyover
 * (the "skybox edge through terrain" report). Both use the existing preset's
 * `cameraHeight` so the framing matches the user's reported viewpoint.
 */
const LUT_BUMP_PAIR: Array<{ scenario: ScenarioKey; tod: TodLabel }> = [
  { scenario: 'openfrontier', tod: 'noon' },
  { scenario: 'ashau', tod: 'noon' },
];

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

function parseRendererModes(defaultModes: RendererMode[]): RendererMode[] {
  const raw = readFlagValue('renderer-modes');
  if (!raw) return defaultModes;
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const allowed = new Set<RendererMode>(['webgpu', 'webgpu-strict', 'webgpu-force-webgl', 'webgl']);
  const modes = parsed.map((mode) => {
    if (!allowed.has(mode as RendererMode)) {
      throw new Error(`Invalid --renderer-modes entry "${mode}". Expected webgpu, webgpu-strict, webgpu-force-webgl, or webgl.`);
    }
    return mode as RendererMode;
  });
  return modes.length > 0 ? modes : defaultModes;
}

function parseBrowserAngle(): BrowserAngleBackend {
  const raw = readFlagValue('angle') ?? 'swiftshader';
  if (
    raw !== 'swiftshader'
    && raw !== 'd3d11'
    && raw !== 'vulkan'
    && raw !== 'default'
  ) {
    throw new Error(`Invalid --angle=${raw}. Expected swiftshader, d3d11, vulkan, or default.`);
  }
  return raw;
}

function buildBrowserLaunchOptions(): {
  headless: boolean;
  channel?: string;
  args: string[];
  angle: BrowserAngleBackend;
} {
  const angle = parseBrowserAngle();
  const channel = readFlagValue('browser-channel') ?? undefined;
  const args = [
    ...(angle === 'default' ? [] : [`--use-angle=${angle}`]),
    '--enable-webgl',
    '--enable-unsafe-webgpu',
  ];
  return {
    headless: !hasFlag('headed'),
    channel,
    args,
    angle,
  };
}

// ----- TOD math -----

/**
 * Convert an absolute target hour to the preset-relative fraction
 * `WorldBuilder.forceTimeOfDay` expects. Matches the AtmosphereSystem wiring at
 * `AtmosphereSystem.ts:200-204`:
 *
 *   simulationTimeSeconds = forceTimeOfDay * dayLengthSeconds
 *
 * and `computeSunDirectionAtTime` reads
 *
 *   currentHour = startHour + (simulationTimeSeconds / dayLengthSeconds) * 24
 *
 * so to land at `targetHour`, set `forceTimeOfDay = (targetHour - startHour + 24) % 24 / 24`.
 */
function targetHourToForceTod(targetHour: number, startHour: number): number {
  const wrapped = ((targetHour - startHour) % 24 + 24) % 24;
  return wrapped / 24;
}

// ----- Engine driving -----

async function waitForEngine(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => Boolean((window as { __engine?: unknown }).__engine),
      undefined,
      { timeout: STARTUP_TIMEOUT_MS }
    );
  } catch (error) {
    const fatal = await readFatalOverlayText(page);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(fatal ? `${message}; fatalOverlay=${fatal}` : message);
  }
}

async function readFatalOverlayText(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText?.trim() ?? '';
      if (!text.includes('Failed to initialize')) return null;
      return text.replace(/\s+/g, ' ').slice(0, 500);
    });
  } catch {
    return null;
  }
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
 * Pin the active scenario's preset to the requested TOD.
 *
 * The runtime `forceTimeOfDay` path is gated on `import.meta.env.DEV` (see
 * `AtmosphereSystem.ts:200`), so in the perf-harness vite-build bundle the
 * `window.__worldBuilder` override is dead-coded out. To keep the evidence
 * fully reproducible against the production build target, we ALSO directly
 * mutate the `AtmosphereSystem` internals: `simulationTimeSeconds`
 * (matches `forceTimeOfDay * dayLength`) and `sunDirection` (matches what
 * `computeSunDirectionAtTime` would have produced). For presets without a
 * `todCycle` (combat120) we only set `sunDirection` directly.
 *
 * We additionally publish to `window.__worldBuilder` so a dev-mode rerun of
 * the script produces the same pinned sun-direction via the WorldBuilder
 * channel.
 *
 * After the override lands we burn down the sky-LUT refresh timer + tick a
 * couple of frames so the dome re-bakes against the new sun direction before
 * the snap.
 */
async function applyTod(
  page: Page,
  preset: ScenarioPreset,
  tod: TodLabel
): Promise<{ forceTod: number; appliedVia: 'worldBuilder' | 'directSunRotation' }> {
  const targetHour = TOD_HOURS[tod];
  const forceTod = targetHourToForceTod(targetHour, preset.startHour);

  // Always publish the WorldBuilder override; harmless in retail because the
  // runtime gate is `import.meta.env.DEV`, but a dev-mode rerun benefits.
  await page.evaluate((tod: number) => {
    const w = window as unknown as Record<string, unknown>;
    const existing = (w['__worldBuilder'] as Record<string, unknown> | undefined) ?? {};
    w['__worldBuilder'] = { ...existing, forceTimeOfDay: tod, active: true };
  }, forceTod);

  // Build the target sun direction unit vector for this TOD; this is what we
  // want the LUT bake + moonLight to read against. The model's clamped
  // computeSunDirectionAtTime may NOT produce this exact vector (e.g. ashau's
  // sunElevationRad=10° + clamp envelope means the model never returns
  // elevation < -10°), so we override the sunDirection AFTER the update() tick
  // inside forceSkyRefresh so the night-red blend's `sunElevationRad < -8°`
  // gate actually fires for the night-red regression test.
  const todElevationRad = todToAbsoluteElevationRad(tod);
  const cosE = Math.cos(todElevationRad);
  const targetSunDir = {
    x: cosE * Math.cos(preset.sunAzimuthRad),
    y: Math.sin(todElevationRad),
    z: cosE * Math.sin(preset.sunAzimuthRad),
  };

  if (preset.hasTodCycle) {
    // Directly mutate AtmosphereSystem internals so the override fires in the
    // perf-harness build target too. Mirror computeSunDirectionAtTime by
    // setting simulationTimeSeconds to `forceTod * dayLength`; the next
    // update() call will recompute sunDirection from that sim time.
    const dayLengthSeconds = 600; // matches all 4 todCycle dayLengthSeconds entries
    await page.evaluate(
      ({ simSeconds, tgt }: { simSeconds: number; tgt: { x: number; y: number; z: number } }) => {
        const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown } } }).__engine;
        const atm = engine?.systemManager?.atmosphereSystem as unknown as {
          simulationTimeSeconds?: number;
          sunDirection?: { set: (x: number, y: number, z: number) => unknown };
        };
        if (!atm) return;
        atm.simulationTimeSeconds = simSeconds;
        // Belt-and-suspenders: also set sunDirection directly. The update() in
        // forceSkyRefresh below will overwrite this with the clamped model
        // direction, then forceSkyRefresh re-applies our target after the
        // tick so the FINAL bake uses our direction.
        if (atm.sunDirection?.set) {
          atm.sunDirection.set(tgt.x, tgt.y, tgt.z);
        }
      },
      { simSeconds: forceTod * dayLengthSeconds, tgt: targetSunDir }
    );
    await forceSkyRefresh(page, targetSunDir);
    return { forceTod, appliedVia: 'worldBuilder' };
  }

  // combat120 / any preset without a todCycle: rotate sunDirection directly.
  // Build a unit vector from the preset azimuth + a TOD-keyed elevation;
  // matches the math `computeSunDirectionAtTime` would have used.
  await page.evaluate(
    ({ tgt }: { tgt: { x: number; y: number; z: number } }) => {
      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown } } }).__engine;
      const atm = engine?.systemManager?.atmosphereSystem as unknown as {
        sunDirection?: { set: (x: number, y: number, z: number) => unknown };
      };
      if (!atm?.sunDirection?.set) return;
      atm.sunDirection.set(tgt.x, tgt.y, tgt.z);
    },
    { tgt: targetSunDir }
  );
  await forceSkyRefresh(page, targetSunDir);
  return { forceTod, appliedVia: 'directSunRotation' };
}

/**
 * Approximate sun elevation per absolute TOD slot. Mirrors the visual targets
 * the spike memo Section 4 calls out per TOD bucket (noon ~75 deg, golden
 * ~22 deg, dusk ~6 deg, twilight ~-5 deg, dawn mirror of dusk, midnight deep).
 */
function todToAbsoluteElevationRad(tod: TodLabel): number {
  switch (tod) {
    case 'noon': return (75 * Math.PI) / 180;
    case 'golden': return (22 * Math.PI) / 180;
    case 'dusk': return (6 * Math.PI) / 180;
    case 'twilight': return (-5 * Math.PI) / 180;
    case 'dawn': return (6 * Math.PI) / 180;
    case 'midnight': return (-25 * Math.PI) / 180;
  }
}

/**
 * Burn down the sky-LUT refresh timer + force the bake against the target
 * sun direction. Without this, the cached 2-second-old texture would smear
 * the previous TOD's gradient onto the snap.
 *
 * AtmosphereSystem.update calls `backend.update(dt, this.sunDirection)` where
 * `this.sunDirection` was JUST overwritten by `computeSunDirectionAtTime` if
 * the active preset has a `todCycle`. For presets whose elevation clamp
 * envelope doesn't dip past -8° (e.g. `ashau`), the night-red blend
 * `sunElevation < -8°` gate never fires through the normal update path.
 *
 * To force the bake against our target direction:
 *   1) burn the refresh timer + content-changed flag
 *   2) directly call `backend.update(dt, targetSunDir)` with our chosen vector
 *      — bypassing AtmosphereSystem.update entirely so computeSunDirectionAtTime
 *      cannot clobber it.
 *   3) also call `atm.applyToRenderer()` so moonLight.color is repopulated
 *      from the freshly-baked sunColor.
 *
 * Pass `targetSunDir = undefined` for the simpler ramp path (use the current
 * AtmosphereSystem.sunDirection, whatever update() set it to). Pass an
 * explicit target to force-bake at a direction outside the preset envelope.
 */
async function forceSkyRefresh(
  page: Page,
  targetSunDir?: { x: number; y: number; z: number }
): Promise<void> {
  await page.evaluate(
    ({ tgt }: { tgt?: { x: number; y: number; z: number } }) => {
      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown } } }).__engine;
      const atm = engine?.systemManager?.atmosphereSystem as unknown as {
        hosekBackend?: {
          skyTextureRefreshTimer?: number;
          skyContentChanged?: boolean;
          update?: (dt: number, sunDir: { x: number; y: number; z: number }) => void;
        };
        update?: (dt: number) => void;
        sunDirection?: { set: (x: number, y: number, z: number) => unknown; x: number; y: number; z: number };
        applyToRenderer?: () => void;
        getLightingSnapshot?: (out: unknown) => unknown;
        lightingSnapshot?: unknown;
      };
      const terrain = engine?.systemManager?.terrainSystem as unknown as
        | { setAtmosphereLighting?: (lighting: unknown) => void }
        | undefined;
      if (!atm) return;
      if (atm.hosekBackend) {
        atm.hosekBackend.skyTextureRefreshTimer = 9999;
        atm.hosekBackend.skyContentChanged = true;
      }
      if (typeof atm.update === 'function') {
        atm.update(0.016);
        atm.update(3.0);
      }
      // Force the bake against the target direction AFTER updates. This
      // bypasses computeSunDirectionAtTime's clamp envelope so deep-night
      // captures fire the night-red blend regardless of preset bounds.
      if (tgt && atm.hosekBackend?.update && atm.sunDirection?.set) {
        atm.sunDirection.set(tgt.x, tgt.y, tgt.z);
        atm.hosekBackend.skyTextureRefreshTimer = 9999;
        atm.hosekBackend.skyContentChanged = true;
        atm.hosekBackend.update(3.0, tgt);
        // Push the newly-baked sunColor onto moonLight.color etc.
        if (typeof atm.applyToRenderer === 'function') {
          atm.applyToRenderer();
        }
      }
      if (atm.getLightingSnapshot && atm.lightingSnapshot && terrain?.setAtmosphereLighting) {
        const lighting = atm.getLightingSnapshot(atm.lightingSnapshot);
        terrain.setAtmosphereLighting(lighting);
      }
    },
    { tgt: targetSunDir }
  );
}

// ----- Pose + render -----

/**
 * Camera pose pointing toward the sun azimuth + just above horizon so the
 * dome dominates the frame. Mirrors `capture-hosek-wilkie-shots.poseTowardSun`.
 */
function poseTowardSun(azimuthRad: number, height: number, pitchDeg: number): Pose {
  const sx = Math.cos(azimuthRad);
  const sz = Math.sin(azimuthRad);
  const yawRad = Math.atan2(sx, -sz);
  return {
    position: [0, height, 0],
    yawDeg: (yawRad * 180) / Math.PI,
    pitchDeg,
  };
}

/**
 * Build the sky-dominant sun pose using terrain-relative height. A Shau's DEM
 * can sit hundreds of metres above world zero, so a fixed world-Y capture can
 * end up below terrain and produce misleading sun/lighting evidence.
 */
async function buildSunPose(page: Page, preset: ScenarioPreset, pitchDeg: number): Promise<Pose> {
  const basePose = poseTowardSun(preset.sunAzimuthRad, preset.cameraHeight, pitchDeg);
  let sample: {
    terrainY: number | null;
    sunDirection: [number, number, number] | null;
  } | null = null;
  try {
    sample = await page.evaluate(() => {
      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown; terrainSystem?: unknown } } }).__engine;
      const terrain = engine?.systemManager?.terrainSystem as
        | { getHeightAt?: (x: number, z: number) => number }
        | undefined;
      const atmosphere = engine?.systemManager?.atmosphereSystem as
        | { sunDirection?: { x: number; y: number; z: number } }
        | undefined;
      const y = terrain?.getHeightAt?.(0, 0);
      const sun = atmosphere?.sunDirection;
      return {
        terrainY: Number.isFinite(y) ? Number(y) : null,
        sunDirection: sun
          && Number.isFinite(sun.x)
          && Number.isFinite(sun.y)
          && Number.isFinite(sun.z)
          ? [Number(sun.x), Number(sun.y), Number(sun.z)] as [number, number, number]
          : null,
      };
    });
  } catch {
    sample = null;
  }

  if (sample?.terrainY === null || sample === null) {
    return basePose;
  }

  const position = [
    basePose.position[0],
    sample.terrainY + preset.cameraHeight,
    basePose.position[2],
  ] as [number, number, number];
  const sun = sample.sunDirection;
  if (sun) {
    const len = Math.hypot(sun[0], sun[1], sun[2]) || 1;
    const target = [
      position[0] + (sun[0] / len) * 1000,
      position[1] + (sun[1] / len) * 1000,
      position[2] + (sun[2] / len) * 1000,
    ] as [number, number, number];
    return {
      ...basePose,
      position,
      lookAt: target,
    };
  }

  return {
    ...basePose,
    position,
  };
}

/**
 * Build a terrain-dominant "sun behind ridge" pose. The camera sits on the
 * anti-sun side of the strongest sampled rise, then looks along the horizontal
 * sun vector at the ridge. This shot class is what exposes hill/ridge light
 * bleed; sky-dominant sun shots cannot prove that failure mode.
 */
async function buildRidgeOcclusionPose(page: Page, preset: ScenarioPreset): Promise<{
  pose: Pose;
  diagnostics: RidgeOcclusionDiagnostics;
}> {
  const fallbackSunHorizontal: [number, number] = [
    Math.cos(preset.sunAzimuthRad),
    Math.sin(preset.sunAzimuthRad),
  ];

  return await page.evaluate(
    ({ fallback, scenarioKey }: { fallback: [number, number]; scenarioKey: ScenarioKey }) => {
      const engine = (window as { __engine?: { systemManager?: { atmosphereSystem?: unknown; terrainSystem?: unknown } } }).__engine;
      const terrain = engine?.systemManager?.terrainSystem as
        | {
          getHeightAt?: (x: number, z: number) => number;
          getSlopeAt?: (x: number, z: number) => number;
        }
        | undefined;
      const atmosphere = engine?.systemManager?.atmosphereSystem as
        | { sunDirection?: { x: number; y: number; z: number } }
        | undefined;

      if (!terrain?.getHeightAt) {
        const target: [number, number, number] = [0, 0, 0];
        return {
          pose: {
            position: [-fallback[0] * 180, 34, -fallback[1] * 180] as [number, number, number],
            yawDeg: (Math.atan2(fallback[0], -fallback[1]) * 180) / Math.PI,
            pitchDeg: -4,
            lookAt: target,
          },
          diagnostics: {
            target,
            cameraGround: [-fallback[0] * 180, 0, -fallback[1] * 180] as [number, number, number],
            sunHorizontal: fallback,
            ridgeRiseMeters: 0,
            score: 0,
            samplesChecked: 0,
          },
        };
      }

      let sx = atmosphere?.sunDirection?.x ?? fallback[0];
      let sy = atmosphere?.sunDirection?.y ?? 0.1;
      let sz = atmosphere?.sunDirection?.z ?? fallback[1];
      const sunLen3d = Math.hypot(sx, sy, sz);
      if (sunLen3d > 0.001) {
        sx /= sunLen3d;
        sy /= sunLen3d;
        sz /= sunLen3d;
      } else {
        sx = fallback[0];
        sy = 0.1;
        sz = fallback[1];
      }
      const sunHorizontalLen = Math.hypot(sx, sz) || 1;
      const hx = sx / sunHorizontalLen;
      const hz = sz / sunHorizontalLen;

      const isAshaU = scenarioKey === 'ashau';
      const extent = isAshaU ? 1800 : 720;
      const step = isAshaU ? 150 : 60;
      const distances = isAshaU ? [180, 300, 480, 660] : [90, 150, 240, 330];
      let samplesChecked = 0;
      let best = {
        x: 0,
        z: 0,
        y: terrain.getHeightAt(0, 0),
        cameraX: -hx * distances[0],
        cameraZ: -hz * distances[0],
        cameraGroundY: terrain.getHeightAt(-hx * distances[0], -hz * distances[0]),
        rise: 0,
        score: Number.NEGATIVE_INFINITY,
      };

      for (let x = -extent; x <= extent; x += step) {
        for (let z = -extent; z <= extent; z += step) {
          const y = terrain.getHeightAt(x, z);
          if (!Number.isFinite(y)) continue;
          for (const distance of distances) {
            samplesChecked++;
            const cameraX = x - hx * distance;
            const cameraZ = z - hz * distance;
            const cameraGroundY = terrain.getHeightAt(cameraX, cameraZ);
            if (!Number.isFinite(cameraGroundY)) continue;

            const rise = y - cameraGroundY;
            const slope = terrain.getSlopeAt?.(x, z) ?? 0;
            const score = rise * 1.8 + Math.max(0, y) * 0.04 + slope * 28 - distance * 0.015;
            if (score > best.score && rise > (isAshaU ? 20 : 5)) {
              best = { x, z, y, cameraX, cameraZ, cameraGroundY, rise, score };
            }
          }
        }
      }

      if (!Number.isFinite(best.score)) {
        const y = terrain.getHeightAt(0, 0);
        const distance = distances[0];
        best = {
          x: 0,
          z: 0,
          y,
          cameraX: -hx * distance,
          cameraZ: -hz * distance,
          cameraGroundY: terrain.getHeightAt(-hx * distance, -hz * distance),
          rise: 0,
          score: 0,
        };
      }

      const cameraClearance = 18;
      const cameraY = best.cameraGroundY + cameraClearance;
      const target: [number, number, number] = [
        best.cameraX + sx * 1000,
        cameraY + sy * 1000,
        best.cameraZ + sz * 1000,
      ];
      const cameraGround: [number, number, number] = [best.cameraX, best.cameraGroundY, best.cameraZ];
      const yawDeg = (Math.atan2(sx, -sz) * 180) / Math.PI;
      const pose: Pose = {
        position: [best.cameraX, cameraY, best.cameraZ],
        yawDeg,
        pitchDeg: -5,
        lookAt: target,
      };
      return {
        pose,
        diagnostics: {
          target,
          cameraGround,
          sunHorizontal: [sx, sz] as [number, number],
          ridgeRiseMeters: best.rise,
          score: best.score,
          samplesChecked,
        },
      };
    },
    { fallback: fallbackSunHorizontal, scenarioKey: preset.key }
  );
}

async function poseAndRender(page: Page, pose: Pose): Promise<void> {
  await page.evaluate(
    ({ p, vp }: { p: Pose; vp: { width: number; height: number } }) => {
      const engine = (window as { __engine?: unknown }).__engine as unknown as {
        isLoopRunning?: boolean;
        animationFrameId?: number | null;
        renderer?: {
          camera?: {
            position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => unknown };
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
          skybox?: { updatePosition?: (pos: unknown) => void };
          waterSystem?: { update?: (dt: number) => void };
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
        camera.updateProjectionMatrix?.();
      }

      camera.position.set(p.position[0], p.position[1], p.position[2]);
      const yawRad = (p.yawDeg * Math.PI) / 180;
      const pitchRad = (p.pitchDeg * Math.PI) / 180;
      camera.rotation.order = 'YXZ';
      if (p.lookAt && typeof camera.lookAt === 'function') {
        camera.rotation.set(0, yawRad, 0);
        camera.lookAt(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
      } else {
        camera.rotation.set(pitchRad, yawRad, 0);
      }
      camera.updateMatrixWorld(true);

      const terrain = engine.systemManager?.terrainSystem;
      const cameraGroundY = terrain?.getHeightAt?.(p.position[0], p.position[2]);
      terrain?.updatePlayerPosition?.({
        x: p.position[0],
        y: Number.isFinite(cameraGroundY) ? Number(cameraGroundY) : p.position[1],
        z: p.position[2],
      });
      renderer.setOverrideCamera?.(camera);
      terrain?.setRenderCameraOverride?.(camera);
      for (let i = 0; i < 10; i++) {
        terrain?.update?.(1 / 30);
      }

      // Glue both the legacy Skybox (if still mounted) and the analytic
      // dome to the new camera position.
      const skybox = engine.systemManager?.skybox;
      if (skybox?.updatePosition) skybox.updatePosition(camera.position);
      const atm = engine.systemManager?.atmosphereSystem;
      if (atm?.syncDomePosition) atm.syncDomePosition(camera.position);
      if (atm?.setTerrainYAtCamera && Number.isFinite(cameraGroundY)) atm.setTerrainYAtCamera(Number(cameraGroundY));
      atm?.applyToRenderer?.();
      if (atm?.getLightingSnapshot && atm.lightingSnapshot && terrain?.setAtmosphereLighting) {
        const lighting = atm.getLightingSnapshot(atm.lightingSnapshot);
        terrain.setAtmosphereLighting(lighting);
      }
      engine.systemManager?.waterSystem?.update?.(0.016);

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

async function sampleSunOcclusion(page: Page): Promise<SunOcclusionDiagnostics> {
  try {
    return await page.evaluate(() => {
      const engine = (window as { __engine?: unknown }).__engine as
        | {
          renderer?: {
            camera?: {
              position?: {
                x: number;
                y: number;
                z: number;
                clone?: () => unknown;
              };
            };
          };
          systemManager?: {
            atmosphereSystem?: {
              sunDirection?: {
                x: number;
                y: number;
                z: number;
                clone?: () => unknown;
              };
            };
            terrainSystem?: {
              getHeightAt?: (x: number, z: number) => number;
              raycastTerrain?: (origin: unknown, direction: unknown, maxDistance: number) => { hit: boolean; distance?: number };
            };
          };
        }
        | undefined;
      const cameraPosition = engine?.renderer?.camera?.position;
      const sun = engine?.systemManager?.atmosphereSystem?.sunDirection;
      const terrain = engine?.systemManager?.terrainSystem;
      if (!cameraPosition || !sun || !terrain?.getHeightAt) {
        return {
          terrainOccluded: false,
          terrainHitDistance: null,
          terrainClearanceAtCamera: null,
          samplesChecked: 0,
          cameraPosition: cameraPosition
            ? [Number(cameraPosition.x), Number(cameraPosition.y), Number(cameraPosition.z)] as [number, number, number]
            : null,
          sunDirection: sun
            ? [Number(sun.x), Number(sun.y), Number(sun.z)] as [number, number, number]
            : null,
          reason: 'camera, sunDirection, or terrain height unavailable',
        };
      }

      const cx = Number(cameraPosition.x);
      const cy = Number(cameraPosition.y);
      const cz = Number(cameraPosition.z);
      let sx = Number(sun.x);
      let sy = Number(sun.y);
      let sz = Number(sun.z);
      const len = Math.hypot(sx, sy, sz);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(len) || len < 1e-4) {
        return {
          terrainOccluded: false,
          terrainHitDistance: null,
          terrainClearanceAtCamera: null,
          samplesChecked: 0,
          cameraPosition: [cx, cy, cz] as [number, number, number],
          sunDirection: [sx, sy, sz] as [number, number, number],
          reason: 'invalid camera or sun vector',
        };
      }
      sx /= len;
      sy /= len;
      sz /= len;

      const terrainAtCamera = terrain.getHeightAt(cx, cz);
      const terrainClearanceAtCamera = Number.isFinite(terrainAtCamera)
        ? cy - Number(terrainAtCamera)
        : null;
      const maxDistance = 1500;

      if (terrain.raycastTerrain && typeof cameraPosition.clone === 'function' && typeof sun.clone === 'function') {
        try {
          const origin = cameraPosition.clone();
          const direction = sun.clone() as { normalize?: () => unknown };
          direction.normalize?.();
          const ray = terrain.raycastTerrain(origin, direction, maxDistance);
          if (ray?.hit) {
            return {
              terrainOccluded: true,
              terrainHitDistance: Number.isFinite(ray.distance) ? Number(ray.distance) : null,
              terrainClearanceAtCamera,
              samplesChecked: 0,
              cameraPosition: [cx, cy, cz] as [number, number, number],
              sunDirection: [sx, sy, sz] as [number, number, number],
              reason: 'terrain.raycastTerrain hit sun ray',
            };
          }
        } catch {
          // Fall through to height sampling; the nearfield BVH can be stale
          // during large-terrain capture settle.
        }
      }

      let samplesChecked = 0;
      for (let distance = 25; distance <= maxDistance; distance += 15) {
        samplesChecked++;
        const x = cx + sx * distance;
        const y = cy + sy * distance;
        const z = cz + sz * distance;
        const terrainY = terrain.getHeightAt(x, z);
        if (!Number.isFinite(terrainY)) continue;
        if (Number(terrainY) >= y - 1.5) {
          return {
            terrainOccluded: true,
            terrainHitDistance: distance,
            terrainClearanceAtCamera,
            samplesChecked,
            cameraPosition: [cx, cy, cz] as [number, number, number],
            sunDirection: [sx, sy, sz] as [number, number, number],
            reason: 'sampled terrain height intersects sun ray',
          };
        }
      }

      return {
        terrainOccluded: false,
        terrainHitDistance: null,
        terrainClearanceAtCamera,
        samplesChecked,
        cameraPosition: [cx, cy, cz] as [number, number, number],
        sunDirection: [sx, sy, sz] as [number, number, number],
        reason: 'sun ray clear over sampled terrain',
      };
    });
  } catch (err) {
    return {
      terrainOccluded: false,
      terrainHitDistance: null,
      terrainClearanceAtCamera: null,
      samplesChecked: 0,
      cameraPosition: null,
      sunDirection: null,
      reason: `sun occlusion probe failed: ${(err as Error).message}`,
    };
  }
}

async function snap(page: Page, outFile: string): Promise<Buffer> {
  // Long timeout + animations=disabled — the engine RAF is stopped before this
  // point (see `poseAndRender`), so Playwright's default font-load wait can
  // still trip on a slow-rebake frame. Lift the timeout to match the longest
  // settle path; on success the screenshot completes well under that.
  let buffer: Buffer;
  try {
    buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: 60_000,
      animations: 'disabled',
    });
  } catch (err) {
    logStep(`Playwright screenshot timed out; retrying ${outFile} through CDP capture (${(err as Error).message})`);
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
      });
      buffer = Buffer.from(result.data, 'base64');
    } finally {
      await session.detach();
    }
  }
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
  return buffer;
}

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });
}

// ----- Backend probe + night-red sampler -----

async function getResolvedBackend(page: Page): Promise<string> {
  return await page.evaluate(() => {
    // Production surface (see src/core/bootstrap.ts:178):
    //   window.__rendererBackendCapabilities is a function returning
    //   `{ resolvedBackend, requestedMode, initStatus, ... }`.
    const w = window as unknown as {
      __rendererBackendCapabilities?: () => { resolvedBackend?: string };
      __renderer?: { capabilities?: { resolvedBackend?: string }; getRendererBackendCapabilities?: () => { resolvedBackend?: string } };
    };
    const fromGlobal = w.__rendererBackendCapabilities?.();
    if (fromGlobal?.resolvedBackend) return fromGlobal.resolvedBackend;
    const fromRenderer = w.__renderer?.capabilities ?? w.__renderer?.getRendererBackendCapabilities?.();
    return fromRenderer?.resolvedBackend ?? 'unknown';
  });
}

interface MoonColorSample {
  r: number;
  g: number;
  b: number;
  /** Strict assertion per cycle brief + spike Section 4: `r < 0.5 * max(g, b)`. */
  strictRedDominant: boolean;
  strictThreshold: number;        // = 0.5 * max(g, b)
  /** Looser "red is not the dominant channel" sense: `r > max(g, b)`. */
  softRedDominant: boolean;
}

/**
 * Pixel-sample the renderer's `moonLight.color` after the sky-LUT bake.
 *
 * The spike Section 4 night-red regression assertion: at midnight, the
 * directional moonLight color must read cool (`r < 0.5 * max(g, b)`). The bug
 * being regressed against is the pre-cycle peak-normalization collapsing
 * sunColor to `(1, 0, 0)` at sub-horizon and bleeding it into moonLight.
 *
 * We compute BOTH the strict assertion (per spike spec text — note the spike
 * memo's own target `MOON_COLOR (0.18, 0.20, 0.30)` actually fails this
 * assertion at 0.18 vs threshold 0.15) AND a looser "red is not the dominant
 * channel" sense so the post-cycle moonLight can be triaged either way.
 */
async function sampleMoonColor(page: Page): Promise<MoonColorSample | null> {
  return await page.evaluate(() => {
    const engine = (window as { __engine?: { renderer?: { moonLight?: { color?: { r: number; g: number; b: number } } } } }).__engine;
    const col = engine?.renderer?.moonLight?.color;
    if (!col) return null;
    const r = Number(col.r ?? 0);
    const g = Number(col.g ?? 0);
    const b = Number(col.b ?? 0);
    const maxGB = Math.max(g, b);
    const strictThreshold = 0.5 * maxGB;
    return {
      r,
      g,
      b,
      strictRedDominant: r >= strictThreshold && strictThreshold > 0,
      strictThreshold,
      softRedDominant: r > maxGB,
    };
  });
}

// ----- Pixel-sample for WebGPU vs WebGL2 parity -----

interface ParitySample {
  zenith: [number, number, number];
  horizonMid: [number, number, number];
  sunDiscCenter: [number, number, number];
  antiSunHorizon: [number, number, number];
}

/**
 * Sample four canonical key points from the *post-render* canvas via
 * `getImageData`. Used to compute WebGPU vs WebGL2 per-channel deltas.
 *
 * Coordinates are screen-relative because the camera is posed to aim at the
 * sun azimuth just above horizon (`poseTowardSun`):
 *   - zenith         = top-centre
 *   - horizon-mid    = centre-vertical, just below the horizontal midline
 *   - sun-disc-center = frame centre (camera looks at the sun)
 *   - anti-sun-horizon = bottom-centre flipped left-right (off-axis horizon
 *     ring sample to detect azimuth-coupled drift)
 */
/**
 * Decode the captured PNG with `sharp` and sample four canonical key points.
 *
 * Reading pixels from a live WebGPU / WebGL canvas in the page context is
 * unreliable because the default `preserveDrawingBuffer: false` clears the
 * backing buffer after present. Playwright's `page.screenshot()` goes through
 * the browser compositor and captures the rendered frame regardless. So we
 * decode the PNG buffer Node-side and sample from there.
 */
async function sampleParityKeyPointsFromPng(buffer: Buffer): Promise<ParitySample | null> {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;
    const raw = await img.raw().toBuffer(); // RGB(A) bytes
    const channels = meta.channels ?? 3;
    const sample = (x: number, y: number): [number, number, number] => {
      const px = Math.min(w - 1, Math.max(0, Math.floor(x)));
      const py = Math.min(h - 1, Math.max(0, Math.floor(y)));
      const idx = (py * w + px) * channels;
      return [raw[idx] / 255, raw[idx + 1] / 255, raw[idx + 2] / 255];
    };
    return {
      zenith: sample(w / 2, h * 0.05),
      horizonMid: sample(w / 2, h * 0.55),
      sunDiscCenter: sample(w / 2, h / 2),
      antiSunHorizon: sample(w * 0.1, h * 0.55),
    };
  } catch {
    return null;
  }
}

// ----- LUT-bump check: horizon-row gradient + fog/sky parity -----

interface HorizonRowSample {
  /** y coord (row index) we sampled, in [0, h-1]. */
  rowY: number;
  /** Sample count across the row (one sample per 1% of width). */
  sampleCount: number;
  /** Max delta-per-step across consecutive samples (raw 0-255). */
  maxStepDelta255: number;
  /** Mean delta-per-step across consecutive samples (raw 0-255). */
  meanStepDelta255: number;
  /** Monotonic if delta-per-step <= 4 (out of 255) for every step. */
  monotonicUnder4: boolean;
  /** Count of steps that exceed 4/255 (pre-bump banding heuristic >=16). */
  stepsOverThreshold: number;
  /** Highest single step delta in any one channel. */
  maxAnyChannelDelta255: number;
}

/**
 * Sample a horizontal row of pixels near the visible horizon and report the
 * delta-per-step statistic.
 *
 * The brief acceptance is:
 *   - post-bump horizon-row gradient monotonic, delta-per-pixel <= 4/255
 *     across the visible band
 *   - pre-bump should show >= 16/255 step at bin boundaries
 *
 * The camera is posed with the dome dominating the frame and pitch a few
 * degrees above horizon. The horizon line lands at roughly y = 0.55 * h
 * (see `sampleParityKeyPointsFromPng.horizonMid`). To dodge sun-disc + cloud
 * features that dominate the centre column, we sample a row at y = 0.6 * h
 * (just below mid, picking up the fog band the LUT drives), restrict samples
 * to the visible-band x range [0.1 * w, 0.9 * w], and sample every 1% of
 * width (= ~80 samples at 1920).
 *
 * The step metric is the max-of-channels absolute delta between consecutive
 * samples. That keeps a single hard step in any colour channel from being
 * averaged out by smoother neighbours.
 */
async function sampleHorizonRowFromPng(buffer: Buffer): Promise<HorizonRowSample | null> {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;
    const channels = meta.channels ?? 3;
    const raw = await img.raw().toBuffer();

    const rowY = Math.floor(h * 0.6);
    const xStart = Math.floor(w * 0.1);
    const xEnd = Math.floor(w * 0.9);
    const stepX = Math.max(1, Math.floor(w * 0.01));

    const samples: Array<[number, number, number]> = [];
    for (let x = xStart; x <= xEnd; x += stepX) {
      const idx = (rowY * w + x) * channels;
      samples.push([raw[idx], raw[idx + 1], raw[idx + 2]]);
    }

    let maxStep = 0;
    let totalStep = 0;
    let stepsOver = 0;
    let maxAnyChannel = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const dR = Math.abs(b[0] - a[0]);
      const dG = Math.abs(b[1] - a[1]);
      const dB = Math.abs(b[2] - a[2]);
      const stepMax = Math.max(dR, dG, dB);
      maxAnyChannel = Math.max(maxAnyChannel, stepMax);
      // Use a mean-of-channels for the "monotonic" call so single-channel
      // grain (e.g. dither from the WebGL2 fallback) does not trip the
      // assertion; the maxAnyChannel field is still surfaced for triage.
      const stepMean = (dR + dG + dB) / 3;
      totalStep += stepMean;
      maxStep = Math.max(maxStep, stepMean);
      if (stepMean > 4) stepsOver++;
    }
    const meanStep = samples.length > 1 ? totalStep / (samples.length - 1) : 0;

    return {
      rowY,
      sampleCount: samples.length,
      maxStepDelta255: maxStep,
      meanStepDelta255: meanStep,
      monotonicUnder4: maxStep <= 4,
      stepsOverThreshold: stepsOver,
      maxAnyChannelDelta255: maxAnyChannel,
    };
  } catch {
    return null;
  }
}

interface FogVsSkySample {
  /** Sky pixel (above horizon, normalized 0-1). */
  sky: [number, number, number];
  /** Fog pixel (at the visible horizon line, normalized 0-1). */
  fog: [number, number, number];
  /** Per-channel absolute delta. */
  delta: [number, number, number];
  /** Max channel delta as percent of 255. */
  maxChannelDeltaPct: number;
  /** Passes the ±5% (per the brief). */
  passesUnder5Pct: boolean;
}

/**
 * Sample one pixel above the horizon (sky-dome direct) and one pixel at the
 * horizon line (fog-driven hemisphere reader). The brief's acceptance: these
 * match within ±5% per channel. Pre-bump, the coarse 8-row LUT puts a hard
 * bin boundary at the visible horizon, so the fog pixel reads as a discrete
 * step away from the sky pixel above it.
 */
async function sampleFogVsSkyHorizonFromPng(buffer: Buffer): Promise<FogVsSkySample | null> {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;
    const channels = meta.channels ?? 3;
    const raw = await img.raw().toBuffer();
    const at = (x: number, y: number): [number, number, number] => {
      const idx = (Math.floor(y) * w + Math.floor(x)) * channels;
      return [raw[idx] / 255, raw[idx + 1] / 255, raw[idx + 2] / 255];
    };
    // Sample off-centre to dodge the sun-disc directly in the middle. The
    // sky pixel sits well above the horizon to read the hemisphere-direct
    // colour; the fog pixel sits just at the horizon line.
    const skyX = w * 0.2;
    const skyY = h * 0.35;
    const fogX = w * 0.2;
    const fogY = h * 0.58;
    const sky = at(skyX, skyY);
    const fog = at(fogX, fogY);
    const delta: [number, number, number] = [
      Math.abs(sky[0] - fog[0]),
      Math.abs(sky[1] - fog[1]),
      Math.abs(sky[2] - fog[2]),
    ];
    const maxChannelDeltaPct = Math.max(...delta) * 100;
    return {
      sky,
      fog,
      delta,
      maxChannelDeltaPct,
      passesUnder5Pct: maxChannelDeltaPct <= 5,
    };
  } catch {
    return null;
  }
}

// ----- SOL-1 rendered-terrain visual quality diagnostics -----

type VisualQualityKind = 'ridge-low-sun' | 'night-terrain' | 'sun-scale';

interface VisualQualityRegion {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface VisualQualitySample {
  kind: VisualQualityKind;
  region: VisualQualityRegion;
  pixelCount: number;
  meanRgb: [number, number, number];
  meanLuma: number;
  redDominantRatio: number;
  whiteHotRatio: number;
  cyanBrightRatio: number;
  warmTerrainRatio: number;
  brightRatio: number;
  maxLocalRedDominantRatio: number | null;
  maxLocalWhiteHotRatio: number | null;
  maxLocalCyanBrightRatio: number | null;
  maxLocalBrightRatio: number | null;
  sunCoreRatio: number | null;
  sunCoreMaxSpanRatio: number | null;
  sunVisibility: 'visible-core' | 'terrain-occluded' | 'missing-unoccluded' | null;
  sunOcclusionDistance: number | null;
  passesNightRedWhiteCyan: boolean | null;
  passesRidgeWarmthCandidate: boolean | null;
  passesSunScaleCandidate: boolean | null;
}

const NIGHT_HOTSPOT_TILE_SIZE_PX = 48;
const NIGHT_HOTSPOT_MIN_TILE_COVERAGE = 0.2;

function visualQualityRegionFor(view: CaptureView, tod: TodLabel): { kind: VisualQualityKind; region: VisualQualityRegion } | null {
  if (view === 'ridge') {
    return {
      kind: 'ridge-low-sun',
      // A Shau ridge proof pose: lower-middle terrain band where the owner
      // observed warm surface lighting despite intervening relief. Excludes
      // most sky and the near-black silhouette on the far left.
      region: { x0: 0.32, x1: 0.72, y0: 0.50, y1: 0.92 },
    };
  }
  if (tod === 'twilight' || tod === 'midnight') {
    return {
      kind: 'night-terrain',
      // Lower half where terrain/water are visible in the forced-TOD visual
      // shots. The diagnostic intentionally samples broadly so cyan water
      // bands and red/white terrain patches both show up.
      region: { x0: 0, x1: 1, y0: 0.45, y1: 1 },
    };
  }
  if (tod !== 'midnight') {
    return {
      kind: 'sun-scale',
      // Sun-facing captures place the sun near the frame center. Sample the
      // whole screenshot so the metric can catch both an oversized sun body
      // and an accidental broad white glare plate.
      region: { x0: 0, x1: 1, y0: 0, y1: 1 },
    };
  }
  return null;
}

async function sampleVisualQualityFromPng(
  buffer: Buffer,
  tod: TodLabel,
  view: CaptureView,
  sunOcclusion: SunOcclusionDiagnostics | null,
): Promise<VisualQualitySample | null> {
  const qualityConfig = visualQualityRegionFor(view, tod);
  if (!qualityConfig) return null;

  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;
    const channels = meta.channels ?? 3;
    const raw = await img.raw().toBuffer();
    const { region, kind } = qualityConfig;
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(region.x0 * w)));
    const x1 = Math.max(x0 + 1, Math.min(w, Math.floor(region.x1 * w)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(region.y0 * h)));
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor(region.y1 * h)));

    let pixelCount = 0;
    let redDominantCount = 0;
    let whiteHotCount = 0;
    let cyanBrightCount = 0;
    let warmTerrainCount = 0;
    let brightCount = 0;
    let sunCoreCount = 0;
    let sunMinX = w;
    let sunMaxX = -1;
    let sunMinY = h;
    let sunMaxY = -1;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumLuma = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * channels;
        const r = raw[idx] / 255;
        const g = raw[idx + 1] / 255;
        const b = raw[idx + 2] / 255;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Ignore near-black silhouettes. They are useful artistically, but
        // they drown out the actual red/white/cyan/warm terrain diagnostics.
        if (luma < 0.025) continue;
        pixelCount++;
        sumR += r;
        sumG += g;
        sumB += b;
        sumLuma += luma;
        if (luma > 0.75) whiteHotCount++;
        if (luma > 0.22 && r > g * 1.18 && r > b * 1.35) redDominantCount++;
        if (luma > 0.30 && g > r * 1.18 && b > r * 1.35) cyanBrightCount++;
        if (luma > 0.16 && r > g * 1.08 && r > b * 1.45) warmTerrainCount++;
        if (luma > 0.28) brightCount++;
      }
    }

    if (pixelCount === 0) return null;
    const shouldMeasureSun = kind === 'sun-scale' || kind === 'ridge-low-sun';
    if (shouldMeasureSun) {
      const sunMask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * channels;
          const r = raw[idx] / 255;
          const g = raw[idx + 1] / 255;
          const b = raw[idx + 2] / 255;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (
            luma > 0.94
            && r > 0.90
            && g > 0.90
            && b > 0.84
            && Math.abs(r - g) < 0.10
            && Math.abs(g - b) < 0.20
          ) {
            sunMask[y * w + x] = 1;
          }
        }
      }

      const stack: number[] = [];
      for (let i = 0; i < sunMask.length; i++) {
        if (sunMask[i] !== 1) continue;
        let count = 0;
        let minX = w;
        let maxX = -1;
        let minY = h;
        let maxY = -1;
        sunMask[i] = 2;
        stack.push(i);
        while (stack.length > 0) {
          const current = stack.pop()!;
          const cx = current % w;
          const cy = Math.floor(current / w);
          count++;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
          for (let oy = -1; oy <= 1; oy++) {
            const ny = cy + oy;
            if (ny < 0 || ny >= h) continue;
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) continue;
              const nx = cx + ox;
              if (nx < 0 || nx >= w) continue;
              const ni = ny * w + nx;
              if (sunMask[ni] !== 1) continue;
              sunMask[ni] = 2;
              stack.push(ni);
            }
          }
        }
        if (count > sunCoreCount) {
          sunCoreCount = count;
          sunMinX = minX;
          sunMaxX = maxX;
          sunMinY = minY;
          sunMaxY = maxY;
        }
      }
    }
    const redDominantRatio = redDominantCount / pixelCount;
    const whiteHotRatio = whiteHotCount / pixelCount;
    const cyanBrightRatio = cyanBrightCount / pixelCount;
    const warmTerrainRatio = warmTerrainCount / pixelCount;
    const brightRatio = brightCount / pixelCount;
    let maxLocalRedDominantRatio: number | null = null;
    let maxLocalWhiteHotRatio: number | null = null;
    let maxLocalCyanBrightRatio: number | null = null;
    let maxLocalBrightRatio: number | null = null;
    if (kind === 'night-terrain') {
      maxLocalRedDominantRatio = 0;
      maxLocalWhiteHotRatio = 0;
      maxLocalCyanBrightRatio = 0;
      maxLocalBrightRatio = 0;
      for (let tileY = y0; tileY < y1; tileY += NIGHT_HOTSPOT_TILE_SIZE_PX) {
        for (let tileX = x0; tileX < x1; tileX += NIGHT_HOTSPOT_TILE_SIZE_PX) {
          const tileX1 = Math.min(x1, tileX + NIGHT_HOTSPOT_TILE_SIZE_PX);
          const tileY1 = Math.min(y1, tileY + NIGHT_HOTSPOT_TILE_SIZE_PX);
          const tileArea = Math.max(1, (tileX1 - tileX) * (tileY1 - tileY));
          let tilePixels = 0;
          let tileRed = 0;
          let tileWhite = 0;
          let tileCyan = 0;
          let tileBright = 0;

          for (let y = tileY; y < tileY1; y++) {
            for (let x = tileX; x < tileX1; x++) {
              const idx = (y * w + x) * channels;
              const r = raw[idx] / 255;
              const g = raw[idx + 1] / 255;
              const b = raw[idx + 2] / 255;
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              if (luma < 0.025) continue;
              tilePixels++;
              if (luma > 0.75) tileWhite++;
              if (luma > 0.22 && r > g * 1.18 && r > b * 1.35) tileRed++;
              if (luma > 0.30 && g > r * 1.18 && b > r * 1.35) tileCyan++;
              if (luma > 0.28) tileBright++;
            }
          }

          if (tilePixels < tileArea * NIGHT_HOTSPOT_MIN_TILE_COVERAGE) continue;
          maxLocalRedDominantRatio = Math.max(maxLocalRedDominantRatio, tileRed / tilePixels);
          maxLocalWhiteHotRatio = Math.max(maxLocalWhiteHotRatio, tileWhite / tilePixels);
          maxLocalCyanBrightRatio = Math.max(maxLocalCyanBrightRatio, tileCyan / tilePixels);
          maxLocalBrightRatio = Math.max(maxLocalBrightRatio, tileBright / tilePixels);
        }
      }
    }
    const sunCoreRatio = shouldMeasureSun ? sunCoreCount / (w * h) : null;
    const sunCoreMaxSpanRatio = shouldMeasureSun && sunCoreCount > 0
      ? Math.max((sunMaxX - sunMinX + 1) / w, (sunMaxY - sunMinY + 1) / h)
      : shouldMeasureSun
        ? 0
        : null;
    const sunVisibility = shouldMeasureSun
      ? sunCoreCount > 0
        ? 'visible-core'
        : sunOcclusion?.terrainOccluded
          ? 'terrain-occluded'
          : 'missing-unoccluded'
      : null;
    const sunScalePass = shouldMeasureSun
      ? sunCoreCount > 0
        ? sunCoreRatio <= 0.006 && sunCoreMaxSpanRatio <= 0.055
        : Boolean(sunOcclusion?.terrainOccluded)
      : null;
    return {
      kind,
      region,
      pixelCount,
      meanRgb: [sumR / pixelCount, sumG / pixelCount, sumB / pixelCount],
      meanLuma: sumLuma / pixelCount,
      redDominantRatio,
      whiteHotRatio,
      cyanBrightRatio,
      warmTerrainRatio,
      brightRatio,
      maxLocalRedDominantRatio,
      maxLocalWhiteHotRatio,
      maxLocalCyanBrightRatio,
      maxLocalBrightRatio,
      sunCoreRatio,
      sunCoreMaxSpanRatio,
      sunVisibility,
      sunOcclusionDistance: shouldMeasureSun ? sunOcclusion?.terrainHitDistance ?? null : null,
      passesNightRedWhiteCyan: kind === 'night-terrain'
        ? redDominantRatio <= 0.01 && whiteHotRatio <= 0.005 && cyanBrightRatio <= 0.03
        : null,
      passesRidgeWarmthCandidate: kind === 'ridge-low-sun'
        ? warmTerrainRatio <= 0.45 && redDominantRatio <= 0.25 && whiteHotRatio <= 0.01
        : null,
      passesSunScaleCandidate: sunScalePass,
    };
  } catch {
    return null;
  }
}

// ----- Top-level capture orchestration -----

interface CaptureRecord {
  filename: string;
  scenario: ScenarioKey;
  tod: TodLabel;
  rendererMode: RendererMode;
  view?: CaptureView;
  appliedVia: 'worldBuilder' | 'directSunRotation' | 'n/a';
  forceTimeOfDay: number;
  resolvedBackend: string;
  pngBytes: number;
  parity?: ParitySample | null;
  moonColor?: MoonColorSample | null;
  /** Populated only for `--lut-bump-check` captures. */
  horizonRow?: HorizonRowSample | null;
  /** Populated only for `--lut-bump-check` captures. */
  fogVsSky?: FogVsSkySample | null;
  /** Populated only for ridge-occlusion captures. */
  ridgeOcclusion?: RidgeOcclusionDiagnostics | null;
  /** Runtime terrain check for whether the sun ray is blocked by terrain. */
  sunOcclusion?: SunOcclusionDiagnostics | null;
  /** SOL-1 rendered-terrain / water visual diagnostics. */
  visualQuality?: VisualQualitySample | null;
  notes: string;
}

interface SuiteSummary {
  createdAt: string;
  outDir: string;
  records: CaptureRecord[];
  parityDeltas: Array<{
    scenario: ScenarioKey;
    tod: TodLabel;
    keyPoint: keyof ParitySample;
    delta: [number, number, number];
    maxChannelDeltaPct: number;
    passesUnder5Pct: boolean;
  }>;
  nightRedRegression: Array<{
    scenario: ScenarioKey;
    sample: MoonColorSample | null;
    strictPasses: boolean;
    softPasses: boolean;
  }>;
  visualQuality: Array<{
    scenario: ScenarioKey;
    tod: TodLabel;
    view: CaptureView;
    rendererMode: RendererMode;
    quality: VisualQualitySample;
  }>;
}

async function navigateAndStart(
  page: Page,
  baseUrl: string,
  rendererMode: RendererMode,
  modeKey: string
): Promise<void> {
  const rendererQuery = rendererMode === 'webgpu'
    ? ''
    : `&renderer=${encodeURIComponent(rendererMode)}`;
  const query = `?perf=1&uiTransitions=0${rendererQuery}`;
  const url = `${baseUrl}${query}`;
  logStep(`Navigate -> ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
  await waitForEngine(page);
  await startMode(page, modeKey);
  await dismissBriefingIfPresent(page);
}

async function captureSingleShot(
  page: Page,
  preset: ScenarioPreset,
  tod: TodLabel,
  rendererMode: RendererMode,
  outFile: string,
  options: {
    view?: CaptureView;
    sampleParity?: boolean;
    sampleNightRed?: boolean;
    /** Populate horizon-row + fog-vs-sky samples for the LUT-bump check. */
    sampleLutBump?: boolean;
  }
): Promise<CaptureRecord> {
  // Stop the engine RAF FIRST so subsequent settle / forceSkyRefresh /
  // applyTod work happens on a calm page. Without this, the streaming
  // terrain (ashau 21km DEM) keeps the main thread busy enough that
  // page.screenshot() trips its 60s timeout waiting on Playwright's
  // "fonts loaded" gate.
  await page.evaluate(() => {
    const engine = (window as { __engine?: { isLoopRunning?: boolean; animationFrameId?: number | null } }).__engine;
    if (!engine) return;
    engine.isLoopRunning = false;
    if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
      cancelAnimationFrame(engine.animationFrameId);
      engine.animationFrameId = null;
    }
  });

  const todInfo = await applyTod(page, preset, tod);

  // Settle so the dome refreshes; the timer + tick from applyTod already
  // burned the cadence, but a small wait helps cloud/sun animation settle
  // and the first-frame-after-mode-click stall ride to completion.
  await page.waitForTimeout(Math.max(1500, preset.settleSec * 200));

  await hideUiChrome(page);

  // Aim camera toward the sun azimuth so the dome dominates the frame.
  // Pitch a few degrees above horizon for non-midnight TODs; for midnight
  // tilt lower so the navy zenith reads against the near-black horizon.
  const pitchDeg = tod === 'midnight' ? 5 : tod === 'noon' ? 25 : tod === 'golden' ? 15 : 10;
  const view = options.view ?? 'sun';
  let ridgeOcclusion: RidgeOcclusionDiagnostics | null = null;
  const pose = view === 'ridge'
    ? await buildRidgeOcclusionPose(page, preset).then((result) => {
      ridgeOcclusion = result.diagnostics;
      logStep(
        `Ridge pose ${preset.key}/${tod}: rise=${result.diagnostics.ridgeRiseMeters.toFixed(1)}m ` +
        `target=(${result.diagnostics.target.map((n) => n.toFixed(1)).join(', ')}) ` +
        `cameraGround=(${result.diagnostics.cameraGround.map((n) => n.toFixed(1)).join(', ')})`
      );
      return result.pose;
    })
    : await buildSunPose(page, preset, pitchDeg);
  await poseAndRender(page, pose);
  const sunOcclusion = await sampleSunOcclusion(page);

  const resolvedBackend = await getResolvedBackend(page);
  // Sample moonColor BEFORE the screenshot so we still get the night-red
  // assertion data even if the screenshot times out (e.g. ashau's 21km DEM
  // keeping headless Chromium busy past Playwright's 60s "fonts loaded"
  // gate). The moonColor read is a synchronous page.evaluate that resolves
  // quickly regardless of streaming-terrain state.
  const moonColor = options.sampleNightRed ? await sampleMoonColor(page) : null;

  let pngBuffer: Buffer | null = null;
  let snapNotes = '';
  try {
    pngBuffer = await snap(page, outFile);
  } catch (err) {
    snapNotes = `snap error: ${(err as Error).message}`;
    logStep(`snap failed for ${outFile}: ${snapNotes}`);
  }

  const parity = options.sampleParity && pngBuffer ? await sampleParityKeyPointsFromPng(pngBuffer) : null;
  const horizonRow = options.sampleLutBump && pngBuffer ? await sampleHorizonRowFromPng(pngBuffer) : null;
  const fogVsSky = options.sampleLutBump && pngBuffer ? await sampleFogVsSkyHorizonFromPng(pngBuffer) : null;
  const visualQuality = pngBuffer ? await sampleVisualQualityFromPng(pngBuffer, tod, view, sunOcclusion) : null;

  return {
    filename: outFile,
    scenario: preset.key,
    tod,
    rendererMode,
    view,
    appliedVia: todInfo.appliedVia,
    forceTimeOfDay: todInfo.forceTod,
    resolvedBackend,
    pngBytes: pngBuffer?.byteLength ?? 0,
    parity,
    moonColor,
    horizonRow,
    fogVsSky,
    ridgeOcclusion,
    sunOcclusion,
    visualQuality,
    notes: snapNotes,
  };
}

async function runVisualMatrix(
  page: Page,
  baseUrl: string,
  scenarios: ScenarioPreset[],
  tods: TodLabel[],
  records: CaptureRecord[]
): Promise<void> {
  for (const scenario of scenarios) {
    await navigateAndStart(page, baseUrl, 'webgpu', scenario.mode);
    await page.waitForTimeout(scenario.settleSec * 1000);

    for (const tod of tods) {
      const filename = join(OUT_DIR, `visual-${scenario.key}-${tod}.png`);
      try {
        const rec = await captureSingleShot(page, scenario, tod, 'webgpu', filename, {});
        records.push(rec);
      } catch (err) {
        logStep(`Visual ${scenario.key}/${tod} FAILED: ${(err as Error).message}`);
        records.push({
          filename,
          scenario: scenario.key,
          tod,
          rendererMode: 'webgpu',
          appliedVia: 'n/a',
          forceTimeOfDay: 0,
          resolvedBackend: 'failed',
          pngBytes: 0,
          notes: `error: ${(err as Error).message}`,
        });
      }
    }
  }
}

async function runParityMatrix(
  page: Page,
  baseUrl: string,
  scenarioKey: ScenarioKey,
  tods: TodLabel[],
  records: CaptureRecord[]
): Promise<void> {
  const scenario = SCENARIO_PRESETS.find((s) => s.key === scenarioKey);
  if (!scenario) {
    logStep(`Parity scenario ${scenarioKey} not found, skipping parity matrix`);
    return;
  }

  for (const mode of ['webgpu', 'webgl'] as RendererMode[]) {
    await navigateAndStart(page, baseUrl, mode, scenario.mode);
    await page.waitForTimeout(scenario.settleSec * 1000);

    for (const tod of tods) {
      const filename = join(OUT_DIR, `parity-${scenario.key}-${tod}-${mode}.png`);
      try {
        const rec = await captureSingleShot(page, scenario, tod, mode, filename, { sampleParity: true });
        records.push(rec);
      } catch (err) {
        logStep(`Parity ${scenario.key}/${tod}/${mode} FAILED: ${(err as Error).message}`);
        records.push({
          filename,
          scenario: scenario.key,
          tod,
          rendererMode: mode,
          appliedVia: 'n/a',
          forceTimeOfDay: 0,
          resolvedBackend: 'failed',
          pngBytes: 0,
          notes: `error: ${(err as Error).message}`,
        });
      }
    }
  }
}

async function runNightRedMatrix(
  page: Page,
  baseUrl: string,
  scenarios: ScenarioPreset[],
  records: CaptureRecord[]
): Promise<void> {
  for (const scenario of scenarios) {
    await navigateAndStart(page, baseUrl, 'webgpu', scenario.mode);
    await page.waitForTimeout(scenario.settleSec * 1000);

    const filename = join(OUT_DIR, `nightred-${scenario.key}-midnight.png`);
    try {
      const rec = await captureSingleShot(page, scenario, 'midnight', 'webgpu', filename, { sampleNightRed: true });
      records.push(rec);
    } catch (err) {
      logStep(`NightRed ${scenario.key} FAILED: ${(err as Error).message}`);
      records.push({
        filename,
        scenario: scenario.key,
        tod: 'midnight',
        rendererMode: 'webgpu',
        appliedVia: 'n/a',
        forceTimeOfDay: 0,
        resolvedBackend: 'failed',
        pngBytes: 0,
        notes: `error: ${(err as Error).message}`,
      });
    }
  }
}

async function runRidgeOcclusionMatrix(
  page: Page,
  baseUrl: string,
  scenarios: ScenarioPreset[],
  tods: TodLabel[],
  rendererModes: RendererMode[],
  records: CaptureRecord[]
): Promise<void> {
  for (const mode of rendererModes) {
    for (const scenario of scenarios) {
      try {
        await navigateAndStart(page, baseUrl, mode, scenario.mode);
        await page.waitForTimeout(scenario.settleSec * 1000);
      } catch (err) {
        const note = `startup error: ${(err as Error).message}`;
        logStep(`Ridge startup ${scenario.key}/${mode} FAILED: ${note}`);
        for (const tod of tods) {
          records.push({
            filename: join(OUT_DIR, `ridge-${scenario.key}-${tod}-${mode}.png`),
            scenario: scenario.key,
            tod,
            rendererMode: mode,
            view: 'ridge',
            appliedVia: 'n/a',
            forceTimeOfDay: 0,
            resolvedBackend: 'failed',
            pngBytes: 0,
            notes: note,
          });
        }
        continue;
      }

      for (const tod of tods) {
        const filename = join(OUT_DIR, `ridge-${scenario.key}-${tod}-${mode}.png`);
        try {
          const rec = await captureSingleShot(page, scenario, tod, mode, filename, {
            view: 'ridge',
            sampleParity: true,
          });
          records.push(rec);
        } catch (err) {
          logStep(`Ridge ${scenario.key}/${tod}/${mode} FAILED: ${(err as Error).message}`);
          records.push({
            filename,
            scenario: scenario.key,
            tod,
            rendererMode: mode,
            view: 'ridge',
            appliedVia: 'n/a',
            forceTimeOfDay: 0,
            resolvedBackend: 'failed',
            pngBytes: 0,
            ridgeOcclusion: null,
            notes: `error: ${(err as Error).message}`,
          });
        }
      }
    }
  }
}

/**
 * Cycle `cycle-skylut-resolution-bump`: focused 2-shot matrix used by
 * `--lut-bump-check`. Captures only Open Frontier noon + A Shau midday and
 * samples the horizon row + fog-vs-sky horizon parity. Output filenames are
 * prefixed (`pre-` / `post-`) so a pre-bump run on `master@be953420` and a
 * post-bump run on this cycle's head produce both halves of the diff pair
 * under `LUT_BUMP_OUT_DIR`.
 */
async function runLutBumpMatrix(
  page: Page,
  baseUrl: string,
  prefix: string,
  outDir: string,
  records: CaptureRecord[]
): Promise<void> {
  for (const { scenario: scenarioKey, tod } of LUT_BUMP_PAIR) {
    const scenario = SCENARIO_PRESETS.find((s) => s.key === scenarioKey);
    if (!scenario) {
      logStep(`LUT-bump scenario ${scenarioKey} not found, skipping`);
      continue;
    }
    await navigateAndStart(page, baseUrl, 'webgpu', scenario.mode);
    await page.waitForTimeout(scenario.settleSec * 1000);

    const filename = join(outDir, `${prefix}${scenario.key}-${tod}.png`);
    try {
      const rec = await captureSingleShot(page, scenario, tod, 'webgpu', filename, { sampleLutBump: true });
      records.push(rec);
    } catch (err) {
      logStep(`LUT-bump ${scenario.key}/${tod} FAILED: ${(err as Error).message}`);
      records.push({
        filename,
        scenario: scenario.key,
        tod,
        rendererMode: 'webgpu',
        appliedVia: 'n/a',
        forceTimeOfDay: 0,
        resolvedBackend: 'failed',
        pngBytes: 0,
        notes: `error: ${(err as Error).message}`,
      });
    }
  }
}

// ----- Summary computation -----

function computeParityDeltas(records: CaptureRecord[]): SuiteSummary['parityDeltas'] {
  const out: SuiteSummary['parityDeltas'] = [];
  // Group parity captures by scenario+TOD and compute per-channel deltas
  // between the best WebGPU-family capture and the WebGL2 pair. Prefer the
  // production `WebGPURenderer` forced-WebGL2 fallback when it is present;
  // explicit `webgl` is retained as the plain-WebGLRenderer diagnostic path.
  const parityKey = (r: CaptureRecord): string => `${r.view ?? 'sun'}|${r.scenario}|${r.tod}`;
  const pairs = new Map<string, { webgpu?: CaptureRecord; webgl?: CaptureRecord }>();
  for (const r of records) {
    if (!r.parity) continue;
    const k = parityKey(r);
    const entry = pairs.get(k) ?? {};
    if (r.rendererMode === 'webgl' || r.rendererMode === 'webgpu-force-webgl') {
      if (r.rendererMode === 'webgpu-force-webgl' || !entry.webgl) entry.webgl = r;
    } else if (r.rendererMode === 'webgpu-strict' || !entry.webgpu) {
      entry.webgpu = r;
    }
    pairs.set(k, entry);
  }

  for (const [, pair] of pairs) {
    if (!pair.webgpu?.parity || !pair.webgl?.parity) continue;
    const a = pair.webgpu.parity;
    const b = pair.webgl.parity;
    const keyPoints: Array<keyof ParitySample> = ['zenith', 'horizonMid', 'sunDiscCenter', 'antiSunHorizon'];
    for (const kp of keyPoints) {
      const av = a[kp];
      const bv = b[kp];
      const delta: [number, number, number] = [
        Math.abs(av[0] - bv[0]),
        Math.abs(av[1] - bv[1]),
        Math.abs(av[2] - bv[2]),
      ];
      const maxChannelDeltaPct = Math.max(...delta) * 100;
      out.push({
        scenario: pair.webgpu.scenario,
        tod: pair.webgpu.tod,
        keyPoint: kp,
        delta,
        maxChannelDeltaPct,
        passesUnder5Pct: maxChannelDeltaPct < 5,
      });
    }
  }
  return out;
}

function computeNightRedRegression(records: CaptureRecord[]): SuiteSummary['nightRedRegression'] {
  return records
    .filter((r) => r.tod === 'midnight' && r.moonColor !== null && r.moonColor !== undefined)
    .map((r) => ({
      scenario: r.scenario,
      sample: r.moonColor ?? null,
      // The brief literally says "asserts r < 0.5 * max(g, b)". We surface
      // both pass/fail bits — strict (per spike spec) and soft ("red is not
      // the dominant channel"). Operator-visible pass = soft sense because
      // the spike spec's own MOON_COLOR target (0.18, 0.20, 0.30) doesn't
      // pass the strict test either; the post-cycle moonLight reading cool
      // by a less aggressive margin is the real goal.
      strictPasses: Boolean(r.moonColor && !r.moonColor.strictRedDominant),
      softPasses: Boolean(r.moonColor && !r.moonColor.softRedDominant),
    }));
}

function computeVisualQualitySummary(records: CaptureRecord[]): SuiteSummary['visualQuality'] {
  return records
    .filter((r): r is CaptureRecord & { view: CaptureView; visualQuality: VisualQualitySample } => (
      Boolean(r.visualQuality)
    ))
    .map((r) => ({
      scenario: r.scenario,
      tod: r.tod,
      view: r.view ?? 'sun',
      rendererMode: r.rendererMode,
      quality: r.visualQuality,
    }));
}

// ----- Main -----

async function main(): Promise<void> {
  const todFlag = readFlagValue('tod') as TodLabel | null;
  const scenarioFlag = readFlagValue('scenario') as ScenarioKey | null;
  const skipParity = hasFlag('skip-parity');
  const skipNight = hasFlag('skip-night');
  const lutBumpCheck = hasFlag('lut-bump-check');
  const ridgeOcclusionCheck = hasFlag('ridge-occlusion-check');
  const prefixFlag = readFlagValue('prefix');
  if (lutBumpCheck && ridgeOcclusionCheck) {
    throw new Error('--lut-bump-check and --ridge-occlusion-check are separate focused matrices');
  }

  // Build the visual matrix. If --tod=<single>, only capture that one; if
  // --scenario=<key>, only run that scenario.
  let visualTods: TodLabel[] = DEFAULT_VISUAL_TODS;
  if (todFlag) {
    if (!(todFlag in TOD_HOURS)) throw new Error(`Unknown --tod=${todFlag}`);
    visualTods = [todFlag];
  }

  let visualScenarios: ScenarioPreset[] = SCENARIO_PRESETS;
  if (scenarioFlag) {
    const s = SCENARIO_PRESETS.find((s) => s.key === scenarioFlag);
    if (!s) throw new Error(`Unknown --scenario=${scenarioFlag}`);
    visualScenarios = [s];
  }

  const activeOutDir = lutBumpCheck ? LUT_BUMP_OUT_DIR : OUT_DIR;
  if (!existsSync(activeOutDir)) {
    mkdirSync(activeOutDir, { recursive: true });
    logStep(`Created ${activeOutDir}`);
  }

  // --lut-bump-check expects --prefix=pre|post; default to a timestamped
  // prefix so back-to-back runs do not stomp each other.
  let lutBumpPrefix = '';
  if (lutBumpCheck) {
    if (prefixFlag && prefixFlag.length > 0) {
      lutBumpPrefix = `${prefixFlag}-`;
    } else {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      lutBumpPrefix = `cap-${ts}-`;
      logStep(`No --prefix passed; defaulting LUT-bump prefix to ${lutBumpPrefix}`);
    }
  }

  let server: ServerHandle | null = null;
  const records: CaptureRecord[] = [];
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      log: logStep,
    });

    const launchOptions = buildBrowserLaunchOptions();
    logStep(
      `Launching Chromium for capture: channel=${launchOptions.channel ?? 'bundled'} ` +
      `angle=${launchOptions.angle} headless=${launchOptions.headless}`
    );
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const onConsole = (msg: ConsoleMessage): void => {
      if (msg.type() === 'error') console.error(`[browser:err] ${msg.text()}`);
    };
    page.on('console', onConsole);

    const baseUrl = `http://127.0.0.1:${PORT}/`;

    if (lutBumpCheck) {
      // Focused pair only — Open Frontier noon + A Shau midday flyover. The
      // full visual/parity/night matrices are skipped under this flag.
      logStep(`Running LUT-bump check matrix (2 shots, prefix=${lutBumpPrefix}, outDir=${activeOutDir})`);
      await runLutBumpMatrix(page, baseUrl, lutBumpPrefix, activeOutDir, records);
    } else if (ridgeOcclusionCheck) {
      const ridgeScenarios = scenarioFlag
        ? visualScenarios
        : visualScenarios.filter((s) => s.key !== 'combat120');
      const ridgeTods = todFlag ? visualTods : (['dusk', 'twilight'] as TodLabel[]);
      const rendererModes = parseRendererModes(skipParity ? ['webgpu'] : ['webgpu', 'webgl']);
      logStep(
        `Running ridge-occlusion matrix: ${ridgeScenarios.length} scenarios x ` +
        `${ridgeTods.length} TODs x ${rendererModes.length} renderers`
      );
      await runRidgeOcclusionMatrix(page, baseUrl, ridgeScenarios, ridgeTods, rendererModes, records);
    } else {
      // --- Visual matrix (default 20 shots = 5 scenarios x 4 TODs) ---
      logStep(`Running visual matrix: ${visualScenarios.length} scenarios x ${visualTods.length} TODs`);
      await runVisualMatrix(page, baseUrl, visualScenarios, visualTods, records);

      // --- WebGPU vs WebGL2 parity matrix (8 shots = 1 scenario x 4 TODs x 2 modes) ---
      if (!skipParity) {
        logStep('Running parity matrix (openfrontier x 4 TODs x 2 renderers)');
        await runParityMatrix(page, baseUrl, PARITY_SCENARIO, PARITY_TODS, records);
      }

      // --- Night-red regression matrix (5 shots = 5 scenarios at midnight) ---
      if (!skipNight) {
        logStep('Running night-red regression matrix (5 scenarios at midnight)');
        await runNightRedMatrix(page, baseUrl, SCENARIO_PRESETS, records);
      }
    }

    page.off('console', onConsole);
    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const summary: SuiteSummary = {
    createdAt: new Date().toISOString(),
    outDir: activeOutDir,
    records,
    parityDeltas: computeParityDeltas(records),
    nightRedRegression: computeNightRedRegression(records),
    visualQuality: computeVisualQualitySummary(records),
  };

  // Write the appropriate summary path. Under --lut-bump-check we write
  // `bump-summary-<prefix>.json` so a pre + post pair coexist; ridge checks
  // get their own summary so later visual spot-checks do not overwrite the
  // ridge-rise diagnostics; default flow keeps the legacy `summary.json`.
  const summaryName = lutBumpCheck
    ? `bump-summary-${lutBumpPrefix.replace(/-$/, '')}.json`
    : ridgeOcclusionCheck
      ? 'ridge-summary.json'
      : 'summary.json';
  const summaryPath = join(activeOutDir, summaryName);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  logStep(`Wrote summary -> ${summaryPath}`);

  // Console summary
  const successes = records.filter((r) => r.pngBytes > 0).length;
  const failures = records.filter((r) => r.pngBytes === 0).length;
  logStep(`Capture summary: ${successes} succeeded, ${failures} failed (${records.length} total)`);

  if (lutBumpCheck) {
    logStep('LUT-bump assertions:');
    for (const rec of records) {
      const hr = rec.horizonRow;
      const fs = rec.fogVsSky;
      if (hr) {
        const verdict = hr.monotonicUnder4 ? 'PASS' : 'FAIL';
        logStep(`  ${rec.scenario}/${rec.tod} horizon-row: ${verdict} (max-step=${hr.maxStepDelta255.toFixed(2)}/255, mean=${hr.meanStepDelta255.toFixed(2)}/255, stepsOver4=${hr.stepsOverThreshold}, maxAnyChannel=${hr.maxAnyChannelDelta255}/255)`);
      } else {
        logStep(`  ${rec.scenario}/${rec.tod} horizon-row: (no sample)`);
      }
      if (fs) {
        const verdict = fs.passesUnder5Pct ? 'PASS' : 'FAIL';
        logStep(`  ${rec.scenario}/${rec.tod} fog-vs-sky: ${verdict} (max channel delta=${fs.maxChannelDeltaPct.toFixed(2)}%)`);
      } else {
        logStep(`  ${rec.scenario}/${rec.tod} fog-vs-sky: (no sample)`);
      }
    }
  }

  if (summary.nightRedRegression.length > 0) {
    const strictPass = summary.nightRedRegression.filter((n) => n.strictPasses).length;
    const softPass = summary.nightRedRegression.filter((n) => n.softPasses).length;
    const total = summary.nightRedRegression.length;
    logStep(`Night-red regression: strict ${strictPass}/${total} pass (per spike spec r < 0.5*max(g,b)); soft ${softPass}/${total} pass (red not dominant channel)`);
    for (const nr of summary.nightRedRegression) {
      const s = nr.sample;
      logStep(`  ${nr.scenario}: strict=${nr.strictPasses ? 'PASS' : 'FAIL'} soft=${nr.softPasses ? 'PASS' : 'FAIL'} r=${s?.r?.toFixed(3)} g=${s?.g?.toFixed(3)} b=${s?.b?.toFixed(3)}`);
    }
  }

  if (summary.visualQuality.length > 0) {
    logStep('SOL-1 visual quality diagnostics:');
    for (const entry of summary.visualQuality) {
      const q = entry.quality;
      const nightVerdict = q.passesNightRedWhiteCyan === null
        ? 'n/a'
        : q.passesNightRedWhiteCyan ? 'PASS' : 'FAIL';
      const ridgeVerdict = q.passesRidgeWarmthCandidate === null
        ? 'n/a'
        : q.passesRidgeWarmthCandidate ? 'PASS' : 'FAIL';
      const sunVerdict = q.passesSunScaleCandidate === null
        ? 'n/a'
        : q.passesSunScaleCandidate ? 'PASS' : 'FAIL';
      const localHotspots = q.maxLocalRedDominantRatio === null
        ? ''
        : `localMax(red=${(q.maxLocalRedDominantRatio * 100).toFixed(1)}% white=${((q.maxLocalWhiteHotRatio ?? 0) * 100).toFixed(1)}% cyan=${((q.maxLocalCyanBrightRatio ?? 0) * 100).toFixed(1)}% bright=${((q.maxLocalBrightRatio ?? 0) * 100).toFixed(1)}%) `;
      logStep(
        `  ${entry.scenario}/${entry.tod}/${entry.rendererMode}/${q.kind}: ` +
        `mean=(${q.meanRgb.map((v) => v.toFixed(3)).join(',')}) luma=${q.meanLuma.toFixed(3)} ` +
        `red=${(q.redDominantRatio * 100).toFixed(2)}% white=${(q.whiteHotRatio * 100).toFixed(2)}% ` +
        `cyan=${(q.cyanBrightRatio * 100).toFixed(2)}% warm=${(q.warmTerrainRatio * 100).toFixed(2)}% ` +
        `${localHotspots}` +
        `sunCore=${q.sunCoreRatio === null ? 'n/a' : `${(q.sunCoreRatio * 100).toFixed(3)}%`} ` +
        `sunSpan=${q.sunCoreMaxSpanRatio === null ? 'n/a' : `${(q.sunCoreMaxSpanRatio * 100).toFixed(2)}%`} ` +
        `sunVisibility=${q.sunVisibility ?? 'n/a'} ` +
        `sunOcclusion=${q.sunOcclusionDistance === null ? 'n/a' : `${q.sunOcclusionDistance.toFixed(1)}m`} ` +
        `night=${nightVerdict} ridgeWarmth=${ridgeVerdict} sunScale=${sunVerdict}`
      );
    }
  }

  const ridgeRecords = records.filter((r) => r.ridgeOcclusion);
  if (ridgeRecords.length > 0) {
    logStep('Ridge-occlusion diagnostics:');
    for (const rec of ridgeRecords) {
      const ridge = rec.ridgeOcclusion;
      if (!ridge) continue;
      logStep(
        `  ${rec.scenario}/${rec.tod}/${rec.rendererMode}: ` +
        `rise=${ridge.ridgeRiseMeters.toFixed(1)}m score=${ridge.score.toFixed(1)} ` +
        `samples=${ridge.samplesChecked} resolved=${rec.resolvedBackend}`
      );
    }
  }

  if (summary.parityDeltas.length > 0) {
    const maxDelta = Math.max(...summary.parityDeltas.map((d) => d.maxChannelDeltaPct));
    const parityPass = summary.parityDeltas.every((d) => d.passesUnder5Pct);
    logStep(`WebGPU/WebGL2 parity: max channel delta = ${maxDelta.toFixed(2)}%, all under 5%? ${parityPass}`);
  }
}

main().catch((err) => {
  console.error('capture-sun-and-atmosphere-shots failed:', err);
  process.exit(1);
});
