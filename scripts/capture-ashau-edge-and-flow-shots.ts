#!/usr/bin/env tsx
/**
 * Capture Playwright smoke screenshots for cycle
 * `cycle-ashau-edge-and-flow-tuning` task
 * `ashau-edge-and-flow-playtest-evidence` (R2).
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md), owner
 * walk-through is deferred to docs/PLAYTEST_PENDING.md. This script
 * captures the substitute Playwright evidence for the three R1
 * landings that closed in-cycle:
 *
 *   1. `dem-edge-taper` (PR #275 + worker parity PR via DEMSampling.ts)
 *      — Stage D3 of cycle-2026-05-09-cdlod-edge-morph. Closes
 *      `KB-DEM-EDGE-TAPER`.
 *   2. `route-stamp-slope-guard` (PR #282) — slope-aware route
 *      flatten with 15 deg guard, 5 deg softness, 0.0 blend.
 *   3. `ashau-water-enable` (PR #277 at d0adbd9c) — hydrology river
 *      surface flipped on for A Shau; sampan spawn relocated from
 *      (60, 0, 80) to (-6895, 0, 4835) on a confirmed wet channel.
 *
 * Capture matrix per the cycle brief:
 *   - Pre on master baseline `be953420` + post on cycle close (the
 *     pre / post pairing is driven by the caller: run this script
 *     on master@be953420 with --pair-tag=pre, then again on the
 *     post-merge tip with --pair-tag=post; the writer uses the tag
 *     as the filename suffix).
 *   - 3 shots per pair: north-edge flyover, valley-road wide shot,
 *     sampan spawn close-up. Default `--pair-tag=post` so a single
 *     post-merge run from a clean tip produces the three "post"
 *     PNGs without a second flag.
 *   - Mobile-emulation probe on A Shau (Pixel 5 + iPhone 12) —
 *     confirms bake-budget headroom holds against cycle #12
 *     baselines (Pixel 5 29.02 / iPhone 12 28.88 avgFps; +/- 10%
 *     gate).
 *
 * Usage:
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts                  # 3 visual shots (post), skip mobile
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --pair-tag=pre   # produce 3 'pre' shots from a baseline checkout
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --include-mobile # ALSO run Pixel 5 + iPhone 12 emulation probes
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --skip-edge      # skip north-edge flyover (filename suffix)
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --skip-route     # skip valley-road wide shot
 *   npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --skip-sampan    # skip sampan close-up
 *
 * Notes:
 *   - Captures are best-effort. If A Shau fails to load (e.g. the
 *     perf-harness bundle is stale or hydrology cache is cold),
 *     the script logs the failure and continues to the next shot
 *     rather than throwing — autonomous-loop posture treats this
 *     as evidence-capture, not a merge gate.
 *   - Artifacts are written under
 *     `artifacts/cycle-ashau-edge-and-flow-tuning/playtest-evidence/`
 *     (gitignored by default; commit via `git add -f`).
 *   - The mobile probe drives the existing harness in
 *     `scripts/perf-startup-mobile.ts`, not a bespoke per-device
 *     run inside this script.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9183;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-ashau-edge-and-flow-tuning',
  'playtest-evidence'
);

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

type PairTag = 'pre' | 'post';

interface CaptureRecord {
  name: string;
  filename: string;
  pairTag: PairTag;
  pose: Pose;
  pngBytes: number;
  notes: string;
}

interface MobileProbeRecord {
  device: 'pixel5' | 'iphone12';
  ranSuccessfully: boolean;
  exitCode: number | null;
  artifactDir: string | null;
  stdoutTail: string;
  stderrTail: string;
}

interface SuiteSummary {
  createdAt: string;
  pairTag: PairTag;
  outDir: string;
  records: CaptureRecord[];
  mobileProbes: MobileProbeRecord[];
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
      // the sky doesn't read wrong at long-distance flyover poses.
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

// ----- Pose presets -----

/**
 * Pose 1: north-edge flyover at altitude 1500 m, heading north toward
 * the DEM boundary. Pre-D3 this frame shows the tall vertical "fins"
 * at the heightmap boundary; post-D3 the taper ramps down smoothly to
 * `DEM_EDGE_BASELINE_M = 0 m` over `DEM_EDGE_TAPER_RADIUS_M = 1500 m`.
 *
 * A Shau Valley DEM is 2304 x 2304 px at 9 m/px = 20736 m square,
 * centered at (0, 0). The north edge sits at z = +10368 m. We pose
 * just inside the boundary so the in-DEM ridge + the outside-DEM
 * taper both appear in frame.
 */
const POSE_NORTH_EDGE_FLYOVER: Pose = {
  position: [0, 1500, 9200],
  yawDeg: 180,    // facing -Z, looking north toward the DEM boundary
  pitchDeg: -10,  // gentle downward tilt so the boundary + terrain dominate
};

/**
 * Pose 2: valley-road wide shot. The slope-guard route stamp affects
 * routes that climb the valley walls. We frame a side-of-valley
 * hillside where a US-base-to-objective route runs across a slope; the
 * pre-guard build cuts a visible trench, the post-guard build drapes
 * the route to follow the terrain.
 *
 * Camera at moderate altitude, looking down the valley slope at a
 * route corridor. The exact route locations depend on the A Shau
 * route-stamp bake; a representative valley hillside is roughly:
 *   - position ~(-2500, 700, 1200): mid-valley elevated overlook
 *   - looking ~south-east at a route descending to the valley floor
 *
 * Refine pose if the captured frame reads "wrong" against the actual
 * route corridor; the route layout is deterministic so the pose stays
 * stable across runs.
 */
const POSE_VALLEY_ROAD_WIDE: Pose = {
  position: [-2500, 700, 1200],
  yawDeg: 135,
  pitchDeg: -20,
};

/**
 * Pose 3: sampan spawn close-up at A Shau coords
 * `(-6895, 0, 4835)` — the post-fix relocation. The pre-fix coords
 * were `(60, 0, 80)`, which sat ~1.8 km from the nearest wet
 * hydrology channel. Frame from behind the boat looking forward
 * along the channel.
 */
const POSE_SAMPAN_CLOSEUP: Pose = {
  position: [-6890, 5, 4845],
  yawDeg: -135, // look back toward the boat from a slight overhead angle
  pitchDeg: -15,
};

// ----- Captures -----

async function captureShot(
  page: Page,
  name: string,
  pose: Pose,
  pairTag: PairTag,
  records: CaptureRecord[]
): Promise<void> {
  const filename = join(OUT_DIR, `${name}-${pairTag}.png`);
  let notes = '';
  let pngBytes = 0;
  try {
    await hideUiChrome(page);
    await poseAndRender(page, pose);
    // Give one more settle tick so the analytic dome + terrain LODs
    // catch the new pose before snap.
    await page.waitForTimeout(500);
    const buf = await snap(page, filename);
    pngBytes = buf?.byteLength ?? 0;
    if (!buf) notes = 'snap failed';
  } catch (err) {
    notes = `error: ${(err as Error).message}`;
    logStep(`captureShot ${name} FAILED: ${notes}`);
  }
  records.push({ name, filename, pairTag, pose, pngBytes, notes });
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
  // A Shau is the largest map in the repo (21 km DEM + hydrology). Give
  // the terrain streamer + hydrology mesh plenty of time to settle
  // before any pose change.
  await page.waitForTimeout(8000);
}

// ----- Mobile probes -----

function runMobileProbe(device: 'pixel5' | 'iphone12'): MobileProbeRecord {
  // Re-uses the existing `scripts/perf-startup-mobile.ts` harness so
  // we don't reinvent the device emulation profile here. The script
  // writes its own artifact directory under
  // `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/<timestamp>/`
  // (preserved by perf-startup-mobile's writer); we just log + record
  // exit code and a stdout tail.
  logStep(`Mobile probe: ${device}`);
  const proc = spawnSync(
    'npx',
    ['tsx', 'scripts/perf-startup-mobile.ts', `--device=${device}`, '--mode=a_shau_valley'],
    {
      shell: true,
      encoding: 'utf-8',
      timeout: 12 * 60 * 1000, // 12 min ceiling (mobile probes are slow)
      env: {
        ...process.env,
        // perf-startup-mobile uses its own server lifecycle; no flag clash.
      },
    }
  );
  const exitCode = proc.status;
  const ranSuccessfully = exitCode === 0;
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  const stdoutTail = stdout.split('\n').slice(-10).join('\n');
  const stderrTail = stderr.split('\n').slice(-10).join('\n');
  // The perf-startup-mobile harness logs the artifact dir to stdout in
  // a line of the form `Artifacts written to <path>`; if that
  // convention drifts, the post-run reader uses the timestamp + device
  // tag in the canonical output tree.
  const artifactMatch = stdout.match(/[Aa]rtifacts? (?:written to|saved to|->)\s+(.+)/);
  const artifactDir = artifactMatch?.[1]?.trim() ?? null;
  if (!ranSuccessfully) {
    logStep(`Mobile probe ${device} FAILED exit=${exitCode}: ${stderrTail}`);
  } else {
    logStep(`Mobile probe ${device} OK (exit ${exitCode})`);
  }
  return {
    device,
    ranSuccessfully,
    exitCode,
    artifactDir,
    stdoutTail,
    stderrTail,
  };
}

// ----- Main -----

async function main(): Promise<void> {
  const pairTagFlag = readFlagValue('pair-tag') as PairTag | null;
  const pairTag: PairTag = pairTagFlag ?? 'post';
  if (pairTag !== 'pre' && pairTag !== 'post') {
    throw new Error(`Unknown --pair-tag=${pairTag} (expected pre|post)`);
  }
  const skipEdge = hasFlag('skip-edge');
  const skipRoute = hasFlag('skip-route');
  const skipSampan = hasFlag('skip-sampan');
  const includeMobile = hasFlag('include-mobile');

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
    await navigateAndStart(page, baseUrl, 'a_shau_valley');

    if (!skipEdge) {
      await captureShot(page, 'ashau-north-edge-flyover', POSE_NORTH_EDGE_FLYOVER, pairTag, records);
    } else {
      notes.push('north-edge flyover skipped via --skip-edge');
    }

    if (!skipRoute) {
      await captureShot(page, 'ashau-valley-road-wide', POSE_VALLEY_ROAD_WIDE, pairTag, records);
    } else {
      notes.push('valley-road wide skipped via --skip-route');
    }

    if (!skipSampan) {
      await captureShot(page, 'ashau-sampan-spawn-closeup', POSE_SAMPAN_CLOSEUP, pairTag, records);
    } else {
      notes.push('sampan close-up skipped via --skip-sampan');
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  // Optional mobile probes — run AFTER the chromium browser closes so
  // the perf-startup-mobile harness can spin up its own preview server.
  const mobileProbes: MobileProbeRecord[] = [];
  if (includeMobile) {
    mobileProbes.push(runMobileProbe('pixel5'));
    mobileProbes.push(runMobileProbe('iphone12'));
  } else {
    notes.push('Mobile probes skipped (pass --include-mobile to run).');
  }

  const summary: SuiteSummary = {
    createdAt: new Date().toISOString(),
    pairTag,
    outDir: OUT_DIR,
    records,
    mobileProbes,
    notes,
  };

  const summaryPath = join(OUT_DIR, `summary-${pairTag}.json`);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  logStep(`Wrote summary -> ${summaryPath}`);

  const successes = records.filter((r) => r.pngBytes > 0).length;
  const failures = records.filter((r) => r.pngBytes === 0).length;
  logStep(`Capture summary (pair=${pairTag}): ${successes} succeeded, ${failures} failed`);
}

main().catch((err) => {
  console.error('capture-ashau-edge-and-flow-shots failed:', err);
  process.exit(1);
});
