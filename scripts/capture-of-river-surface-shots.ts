#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Capture Playwright pre/post screenshots for cycle
 * `cycle-of-river-surface-enable` task `of-water-capture-pair` (R1).
 *
 * Sibling R1 tasks in the cycle:
 *   - `of-water-config-flip` — adds `waterEnabled: true` to
 *     `src/config/OpenFrontierConfig.ts` so the WaterSystem dispatches
 *     hydrology river surfaces without the legacy global sea-level plane.
 *   - `of-water-spawn-snap-resolver` — extends
 *     `OperationalRuntimeComposer` so the OF Sampan + PBR spawn snap to
 *     the actual water-surface Y (via `WaterSurfaceSampler`) rather than
 *     the raw terrain.
 *
 * This script captures the pre/post evidence pair proving the OF river
 * surface renders and that both boats sit on water:
 *
 *   - of-sampan-spawn-{pre,post}.png   — close-up of the Sampan spawn at
 *                                        OF coord (-324, 0, 384), framed
 *                                        from a behind/overhead angle so
 *                                        the water-line under the hull
 *                                        reads clearly.
 *   - of-pbr-spawn-{pre,post}.png      — close-up of the PBR spawn at
 *                                        OF coord (396, 0, 876), same
 *                                        framing convention.
 *   - of-river-segment-{pre,post}.png  — wide shot of a river channel
 *                                        segment between the two boats,
 *                                        so the post-shot demonstrates a
 *                                        visible river ribbon + no
 *                                        z-fight at the shoreline.
 *
 * Usage:
 *   # Pre-bump capture (on master tip 67969e60 — pre-cycle baseline):
 *   npx tsx scripts/capture-of-river-surface-shots.ts --pair-tag=pre
 *
 *   # Post-bump capture (on cycle head, after sibling PRs land):
 *   npx tsx scripts/capture-of-river-surface-shots.ts --pair-tag=post
 *
 *   # Either flag also supports the per-shot skip switches:
 *   --skip-sampan      # skip Sampan spawn shot
 *   --skip-pbr         # skip PBR spawn shot
 *   --skip-river       # skip river segment shot
 *   --scenario=openfrontier   # explicit scenario flag (default openfrontier)
 *
 * Notes:
 *   - Captures are best-effort. If OF fails to load (e.g. perf-harness
 *     bundle stale or hydrology cache cold), the script logs the failure
 *     and continues — autonomous-loop posture treats this as
 *     evidence-capture, not a merge gate.
 *   - Artifacts are written under
 *     `artifacts/cycle-of-river-surface-enable/playtest-evidence/`
 *     (gitignored by default; commit via `git add -f`).
 *   - `summary-of-water.json` records capture metadata, including a
 *     `riverSurface.visible` boolean per shot derived from a runtime
 *     probe of `WaterSystem.getWaterSurfaceY(spawnCoord)`. The probe is
 *     advisory — owner walk-through is the load-bearing check — but
 *     gives a deterministic signal that pre captures see no river
 *     surface while post captures resolve a surface Y under each boat.
 *   - Modeled on `scripts/capture-ashau-edge-and-flow-shots.ts` and
 *     `scripts/capture-voda-3-watercraft-shots.ts`.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9187;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-of-river-surface-enable',
  'playtest-evidence'
);

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

type PairTag = 'pre' | 'post';

interface RiverSurfaceProbe {
  /** World-space query coord (typically the spawn position). */
  query: [number, number, number];
  /** Resolved water-surface Y, or null when dry. */
  surfaceY: number | null;
  /** True iff `surfaceY` is not null (water surface available). */
  visible: boolean;
  /** Diagnostic source: 'hydrology' | 'global' | 'none' if exposed. */
  source: string | null;
}

interface CaptureRecord {
  name: string;
  filename: string;
  pairTag: PairTag;
  pose: Pose;
  pngBytes: number;
  riverSurface: RiverSurfaceProbe | null;
  notes: string;
}

interface SuiteSummary {
  createdAt: string;
  pairTag: PairTag;
  scenario: string;
  outDir: string;
  records: CaptureRecord[];
  notes: string[];
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

      // Glue the analytic dome + legacy skybox to the camera position so
      // the sky doesn't read wrong at long-distance poses.
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

/**
 * Probe the live WaterSystem at the supplied query coord. Returns
 * `{ surfaceY, visible }` where `visible` reflects whether a water
 * surface (river OR global plane) renders at that XZ. Used to give
 * the post capture a deterministic signal — pre-flip OF should report
 * `visible: false` under both boats; post-flip should report `true`
 * (and the surfaceY should be at or near WATER_LEVEL ~= 0).
 *
 * Surface source ('hydrology' | 'global' | 'none') is best-effort — we
 * inspect `sampleWaterInteraction` when available, else fall back to
 * `getWaterSurfaceY` only.
 */
async function probeRiverSurfaceAt(
  page: Page,
  query: [number, number, number]
): Promise<RiverSurfaceProbe> {
  try {
    const probe = await page.evaluate((q: [number, number, number]) => {
      type EngineLike = {
        systemManager?: {
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
      const water = engine?.systemManager?.waterSystem;
      if (!water) {
        return { surfaceY: null, source: null };
      }
      const pos = { x: q[0], y: q[1], z: q[2] };
      let source: string | null = null;
      let surfaceY: number | null = null;
      try {
        if (typeof water.sampleWaterInteraction === 'function') {
          const sample = water.sampleWaterInteraction(pos);
          surfaceY = sample.surfaceY ?? null;
          source = sample.source ?? null;
        } else if (typeof water.getWaterSurfaceY === 'function') {
          surfaceY = water.getWaterSurfaceY(pos);
        }
      } catch {
        // sampler may throw if bindings not yet wired; treat as dry.
        surfaceY = null;
      }
      return { surfaceY, source };
    }, query);
    return {
      query,
      surfaceY: probe.surfaceY,
      visible: probe.surfaceY !== null,
      source: probe.source,
    };
  } catch (err) {
    logStep(`probeRiverSurfaceAt(${query.join(',')}) FAILED: ${(err as Error).message}`);
    return { query, surfaceY: null, visible: false, source: null };
  }
}

// ----- Pose presets -----

/**
 * OF Sampan spawn coord: (-324, 0, 384) (see
 * `src/systems/vehicle/SampanSpawn.ts:111-116`). Camera placed slightly
 * behind + above the boat looking along the channel forward direction,
 * so the post-shot frames the hull on the river ribbon with shoreline
 * visible to either side. The boat yaw is `π/2` so the forward axis
 * points along +X; the camera sits at -X relative to the boat.
 */
const POSE_SAMPAN_SPAWN: Pose = {
  position: [-344, 8, 384],
  yawDeg: 90,   // look toward +X (boat forward)
  pitchDeg: -12,
};
const QUERY_SAMPAN: [number, number, number] = [-324, 0, 384];

/**
 * OF PBR spawn coord: (396, 0, 876) (see
 * `src/systems/vehicle/PBRSpawn.ts:167-172`). PBR yaw is `π/2`
 * (forward = +X). Camera offset back along -X + a few meters of
 * altitude so the boat reads in frame with channel context.
 */
const POSE_PBR_SPAWN: Pose = {
  position: [376, 10, 876],
  yawDeg: 90,   // look toward +X (boat forward)
  pitchDeg: -12,
};
const QUERY_PBR: [number, number, number] = [396, 0, 876];

/**
 * OF river-segment overlook framing a stretch of the procedural-river
 * channel between the two boat spawns. The midpoint between Sampan
 * (-324, 384) and PBR (396, 876) is roughly (36, 630). We sit above
 * the hydrology ribbon so the channel dominates the frame and the
 * shoreline seam is visible.
 */
const POSE_RIVER_SEGMENT: Pose = {
  position: [36, 120, 400],
  yawDeg: 0,
  pitchDeg: -30,
};
const QUERY_RIVER_SEGMENT: [number, number, number] = [36, 0, 630];

// ----- Captures -----

async function captureShot(
  page: Page,
  name: string,
  pose: Pose,
  probeQuery: [number, number, number],
  pairTag: PairTag,
  records: CaptureRecord[]
): Promise<void> {
  const filename = join(OUT_DIR, `${name}-${pairTag}.png`);
  let notes = '';
  let pngBytes = 0;
  let riverSurface: RiverSurfaceProbe | null = null;
  try {
    await hideUiChrome(page);
    await poseAndRender(page, pose);
    // Probe BEFORE snap so the probe + the rendered frame both reflect
    // the same world state.
    riverSurface = await probeRiverSurfaceAt(page, probeQuery);
    // Settle tick for terrain LODs / sky dome at the new pose.
    await page.waitForTimeout(500);
    const buf = await snap(page, filename);
    pngBytes = buf?.byteLength ?? 0;
    if (!buf) notes = 'snap failed';
  } catch (err) {
    notes = `error: ${(err as Error).message}`;
    logStep(`captureShot ${name} FAILED: ${notes}`);
  }
  records.push({ name, filename, pairTag, pose, pngBytes, riverSurface, notes });
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

/**
 * Maps the `--scenario=` CLI value to the engine mode key. Defaults to
 * `open_frontier` which is the only valid value for this script (the
 * cycle's scope is OF-only). Other values throw so a typo doesn't
 * silently capture against the wrong scenario.
 */
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
  const pairTag: PairTag = pairTagFlag ?? 'post';
  if (pairTag !== 'pre' && pairTag !== 'post') {
    throw new Error(`Unknown --pair-tag=${pairTag} (expected pre|post)`);
  }
  const scenarioFlag = readFlagValue('scenario');
  const { modeKey, label: scenarioLabel } = resolveScenarioModeKey(scenarioFlag);

  const skipSampan = hasFlag('skip-sampan');
  const skipPbr = hasFlag('skip-pbr');
  const skipRiver = hasFlag('skip-river');

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    logStep(`Created ${OUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  const records: CaptureRecord[] = [];
  const notes: string[] = [];
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

    if (!skipSampan) {
      await captureShot(page, 'of-sampan-spawn', POSE_SAMPAN_SPAWN, QUERY_SAMPAN, pairTag, records);
    } else {
      notes.push('Sampan spawn skipped via --skip-sampan');
    }

    if (!skipPbr) {
      await captureShot(page, 'of-pbr-spawn', POSE_PBR_SPAWN, QUERY_PBR, pairTag, records);
    } else {
      notes.push('PBR spawn skipped via --skip-pbr');
    }

    if (!skipRiver) {
      await captureShot(page, 'of-river-segment', POSE_RIVER_SEGMENT, QUERY_RIVER_SEGMENT, pairTag, records);
    } else {
      notes.push('River segment skipped via --skip-river');
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const summary: SuiteSummary = {
    createdAt: new Date().toISOString(),
    pairTag,
    scenario: scenarioLabel,
    outDir: OUT_DIR,
    records,
    notes,
  };

  // Per the cycle brief, the summary filename is `summary-of-water.json`.
  // We re-write the same path on both pre + post runs; the per-record
  // `pairTag` field discriminates. To preserve both halves of the pair,
  // a pre run is also mirrored to `summary-of-water-pre.json` and the
  // post run to `summary-of-water-post.json`.
  const summaryPath = join(OUT_DIR, 'summary-of-water.json');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const pairedPath = join(OUT_DIR, `summary-of-water-${pairTag}.json`);
  writeFileSync(pairedPath, `${JSON.stringify(summary, null, 2)}\n`);
  logStep(`Wrote summary -> ${summaryPath}`);
  logStep(`Wrote paired summary -> ${pairedPath}`);

  const successes = records.filter((r) => r.pngBytes > 0).length;
  const failures = records.filter((r) => r.pngBytes === 0).length;
  const visibleCount = records.filter((r) => r.riverSurface?.visible).length;
  logStep(
    `Capture summary (pair=${pairTag}, scenario=${scenarioLabel}): ` +
      `${successes} succeeded, ${failures} failed, ` +
      `${visibleCount}/${records.length} probes report riverSurface.visible`
  );
}

main().catch((err) => {
  console.error('capture-of-river-surface-shots failed:', err);
  process.exit(1);
});
