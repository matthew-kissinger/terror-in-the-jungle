#!/usr/bin/env tsx
/**
 * Capture Playwright smoke screenshots for cycle
 * `cycle-motor-pool-reflow-and-tank-dedup` task
 * `motor-pool-and-tank-dedup-playtest-evidence` (R2).
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md), owner
 * walk-through is deferred to docs/PLAYTEST_PENDING.md. This script
 * captures the substitute Playwright evidence for the two R1 landings
 * that closed in-cycle:
 *
 *   1. `motor-pool-heavy-reflow` (PR #290) — split shared
 *      `motor_pool_heavy` into `motor_pool_heavy_of` +
 *      `motor_pool_heavy_ashau` because the M48 bay sat outside A Shau's
 *      34 m footprint. The OF variant gives each vehicle >= 1.5 m
 *      clearance, >= 60 deg yaw spread, and pushes the crate row off
 *      the parking strip. Dressing M48 entry removed from OF prefab.
 *   2. `of-tank-relocate-to-motor-pool` (PR #287) — real M48 Tank
 *      IVehicle moved from `(-995, 0, -760)` near the West FOB to
 *      `(183, 0, -1173)` in the motor pool bay (anchor
 *      `(155, 0, -1195)` + `(28, 0, 22)` slot, yaw `Math.PI * 0.55`).
 *      A Shau M48 scenario spawn unchanged.
 *
 * Capture matrix per the cycle brief:
 *   - Pre / post pair for OF motor pool wide shot (2 shots).
 *   - Pre / post pair for A Shau motor pool no-regression (2 shots).
 *   - OF FOB area confirming no dressing M48 there now (1 shot).
 *   - Optional proximity-prompt check at the relocated OF M48 (1 shot;
 *     depends on cycle #1 `cycle-vekhikl-player-boarding-wire` being
 *     in the build for the prompt to render).
 *
 * The pre / post pairing is driven by the caller: run this script on
 * a master baseline (e.g. `master@67969e60` pre-cycle-#3) with
 * `--pair-tag=pre`, then again on the post-merge tip with
 * `--pair-tag=post`; the writer uses the tag as the filename suffix
 * for the OF + A Shau motor-pool shots. The `of-fob-no-tank` and the
 * optional `of-motor-pool-tank-prompt` shots are single-state (post),
 * so they ignore the pair-tag.
 *
 * Usage:
 *   npx tsx scripts/capture-motor-pool-shots.ts                   # 3 post-state shots (OF MP, A Shau MP, OF FOB)
 *   npx tsx scripts/capture-motor-pool-shots.ts --pair-tag=pre    # produce 'pre' shots from a baseline checkout (OF MP + A Shau MP only)
 *   npx tsx scripts/capture-motor-pool-shots.ts --include-prompt  # ALSO try the F-prompt close-up (needs cycle #1 boarding wire)
 *   npx tsx scripts/capture-motor-pool-shots.ts --skip-of         # skip OF motor pool wide shot
 *   npx tsx scripts/capture-motor-pool-shots.ts --skip-ashau      # skip A Shau motor pool wide shot
 *   npx tsx scripts/capture-motor-pool-shots.ts --skip-fob        # skip OF FOB no-tank shot
 *
 * Notes:
 *   - Captures are best-effort. If a mode fails to load or a pose reads
 *     wrong (terrain not settled, hydrology cold), the script logs the
 *     failure and continues to the next shot rather than throwing —
 *     autonomous-loop posture treats this as evidence-capture, not a
 *     merge gate.
 *   - Artifacts are written under
 *     `artifacts/cycle-motor-pool-reflow-and-tank-dedup/playtest-evidence/`
 *     (gitignored by default; commit via `git add -f`).
 *   - If Playwright is not installed (`npx playwright install` not
 *     yet run on this worktree) the script will fail early — the
 *     owner can re-run it during the walk-through with a warm
 *     Playwright cache.
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
  'cycle-motor-pool-reflow-and-tank-dedup',
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
  pairTag: PairTag | 'single';
  pose: Pose;
  pngBytes: number;
  notes: string;
}

interface SuiteSummary {
  createdAt: string;
  pairTag: PairTag;
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

      // Stop the engine RAF so per-frame systems don't overwrite our pose.
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
 * Pose: OF airfield Main Motor Pool wide shot.
 *
 * Anchor `(155, 0, -1195)`, footprint radius 36 m. Frame from the
 * south-west looking north-east so all four bays + the crate flank
 * read in one shot. Camera held ~35 m up and ~45 m back so the M48
 * bay at `(183, 0, -1173)` and the M35 / M151 / M113 bays on the
 * west side both fit in frame.
 */
const POSE_OF_MOTOR_POOL: Pose = {
  position: [110, 35, -1240],
  yawDeg: 35,      // looking north-east into the lot
  pitchDeg: -25,
};

/**
 * Pose: A Shau Valley Main Motor Pool wide shot. Sourced from
 * `AShauValleyConfig.ts` (the prefab is now `motor_pool_heavy_ashau`
 * post-split). Held similarly to OF: ~35 m up, ~45 m back from the
 * anchor, looking into the lot so any regression vs the pre-split
 * shared prefab reads on inspection. The exact anchor coord is
 * resolved at script start by probing the world-feature registry
 * (so this script tolerates A Shau motor-pool reposition without
 * needing a code edit).
 */
async function resolveAShauMotorPoolAnchor(
  page: Page
): Promise<{ x: number; z: number } | null> {
  try {
    const anchor = await page.evaluate(() => {
      const engine = (window as unknown as {
        __engine?: {
          systemManager?: {
            worldFeatureSystem?: {
              getFeatures?: () => Array<{
                id?: string;
                name?: string;
                position?: { x?: number; z?: number };
              }>;
            };
          };
        };
      }).__engine;
      const features = engine?.systemManager?.worldFeatureSystem?.getFeatures?.();
      if (!features) return null;
      // Match the A Shau Main Motor Pool by id substring (the canonical
      // id in AShauValleyConfig.ts contains "motor_pool"). Fall back to
      // name match if the id schema drifts.
      const match = features.find(
        (f) =>
          (typeof f?.id === 'string' && f.id.toLowerCase().includes('motor_pool')) ||
          (typeof f?.name === 'string' && f.name.toLowerCase().includes('motor pool'))
      );
      if (!match?.position) return null;
      const x = typeof match.position.x === 'number' ? match.position.x : null;
      const z = typeof match.position.z === 'number' ? match.position.z : null;
      if (x === null || z === null) return null;
      return { x, z };
    });
    return anchor;
  } catch {
    return null;
  }
}

/**
 * Pose: OF West FOB area, confirming no dressing M48 prop here now.
 * West FOB compound anchor `(-1025, 0, -760)` per OpenFrontierConfig.
 * Pre-cycle-#3 the real Tank IVehicle spawned ~30 m east of this
 * anchor; post-relocation it sits at the motor pool instead, so this
 * frame should show only the FOB compound (and any standard FOB
 * dressing) with no tank silhouette.
 */
const POSE_OF_FOB_NO_TANK: Pose = {
  position: [-1075, 30, -820],
  yawDeg: 45,      // looking north-east toward the FOB centre
  pitchDeg: -20,
};

/**
 * Pose: close-up on the relocated OF M48 at `(183, 0, -1173)` —
 * intended to capture the "Press F to board M48 Patton" HUD prompt
 * if cycle #1 (`cycle-vekhikl-player-boarding-wire`) is in the
 * build. Frame from ~5 m off the tank's left flank at player-eye
 * height (~1.7 m) so the prompt panel reads clearly.
 *
 * If cycle #1 hasn't landed yet, the prompt will not render — the
 * shot is still captured but the memo records the dependency.
 */
const POSE_OF_M48_PROMPT: Pose = {
  position: [177, 4, -1168],
  yawDeg: 80,      // looking east toward the tank
  pitchDeg: -5,
};

// ----- Captures -----

async function captureShot(
  page: Page,
  name: string,
  pose: Pose,
  pairTag: PairTag | 'single',
  records: CaptureRecord[]
): Promise<void> {
  const suffix = pairTag === 'single' ? '' : `-${pairTag}`;
  const filename = join(OUT_DIR, `${name}${suffix}.png`);
  let notes = '';
  let pngBytes = 0;
  try {
    await hideUiChrome(page);
    await poseAndRender(page, pose);
    // One more settle tick so terrain LODs + analytic dome catch the
    // new pose before snap.
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
  // A Shau is the largest map (21 km DEM + hydrology); OF is smaller
  // but still needs a settle for terrain streamer + prefab placement.
  // Use 8 s for A Shau, 4 s otherwise.
  const settleMs = modeKey === 'a_shau_valley' ? 8000 : 4000;
  await page.waitForTimeout(settleMs);
}

// ----- Main -----

async function main(): Promise<void> {
  const pairTagFlag = readFlagValue('pair-tag') as PairTag | null;
  const pairTag: PairTag = pairTagFlag ?? 'post';
  if (pairTag !== 'pre' && pairTag !== 'post') {
    throw new Error(`Unknown --pair-tag=${pairTag} (expected pre|post)`);
  }
  const skipOf = hasFlag('skip-of');
  const skipAshau = hasFlag('skip-ashau');
  const skipFob = hasFlag('skip-fob');
  const includePrompt = hasFlag('include-prompt');

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

    // ----- OF: motor pool wide + FOB no-tank + (optional) prompt close-up -----
    if (!skipOf || !skipFob || includePrompt) {
      await navigateAndStart(page, baseUrl, 'open_frontier');

      if (!skipOf) {
        await captureShot(page, 'of-motor-pool', POSE_OF_MOTOR_POOL, pairTag, records);
      } else {
        notes.push('OF motor pool wide skipped via --skip-of');
      }

      // FOB no-tank shot is single-state; only meaningful on post.
      if (!skipFob && pairTag === 'post') {
        await captureShot(page, 'of-fob-no-tank', POSE_OF_FOB_NO_TANK, 'single', records);
      } else if (skipFob) {
        notes.push('OF FOB no-tank skipped via --skip-fob');
      } else {
        notes.push('OF FOB no-tank skipped (single-state, only emitted on --pair-tag=post)');
      }

      // Optional F-prompt close-up; depends on cycle #1 boarding wire.
      if (includePrompt && pairTag === 'post') {
        await captureShot(
          page,
          'of-motor-pool-tank-prompt',
          POSE_OF_M48_PROMPT,
          'single',
          records
        );
        notes.push(
          'Prompt close-up captured; HUD "Press F to board" text only renders if cycle-vekhikl-player-boarding-wire is in the build.'
        );
      } else if (includePrompt) {
        notes.push('Prompt close-up skipped (single-state, only emitted on --pair-tag=post)');
      }
    }

    // ----- A Shau: motor pool no-regression wide -----
    if (!skipAshau) {
      await navigateAndStart(page, baseUrl, 'a_shau_valley');
      const ashauAnchor = await resolveAShauMotorPoolAnchor(page);
      if (ashauAnchor) {
        const ashauPose: Pose = {
          position: [ashauAnchor.x - 45, 35, ashauAnchor.z - 45],
          yawDeg: 35,
          pitchDeg: -25,
        };
        await captureShot(page, 'ashau-motor-pool', ashauPose, pairTag, records);
      } else {
        notes.push(
          'A Shau motor pool anchor not resolvable from worldFeatureSystem; skipping ashau-motor-pool shot.'
        );
      }
    } else {
      notes.push('A Shau motor pool skipped via --skip-ashau');
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const summary: SuiteSummary = {
    createdAt: new Date().toISOString(),
    pairTag,
    outDir: OUT_DIR,
    records,
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
  console.error('capture-motor-pool-shots failed:', err);
  process.exit(1);
});
