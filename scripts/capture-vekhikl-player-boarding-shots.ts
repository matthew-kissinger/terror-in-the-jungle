#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the
 * vekhikl-board-integration-test-and-playtest-evidence task in
 * cycle-vekhikl-player-boarding-wire.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md), owner walk-through
 * is deferred to docs/PLAYTEST_PENDING.md. This script captures the substitute
 * Playwright evidence — proof that the F-key boarding wire (PRs #293/#297/#298
 * + SystemUpdater proximity-checker activation) seats the player at each of
 * the five drivable vehicle types and that the matching exit transition is
 * sane.
 *
 * Capture matrix (15 PNGs):
 *   - 5 vehicle types × 3 frames = 15 captures
 *     {m151, m48, sampan, pbr, m2hb} × {pre-press, post-press, post-exit}
 *
 * Output directory:
 *   `artifacts/cycle-vekhikl-player-boarding-wire/playtest-evidence/`
 *
 * For each vehicle type the script:
 *   1. Switches to the scenario that spawns the vehicle (Open Frontier or
 *      A Shau Valley).
 *   2. Teleports the player to within ~3 m of a live vehicle of that type
 *      (well inside the proximity checker's 6 m PROMPT_RADIUS_M so the
 *      HUD "Press F to board" prompt fires).
 *   3. Captures the pre-press frame.
 *   4. Triggers the F-key boarding round-trip via the
 *      PlayerVehicleAdapterFactory's `tryBoardNearest` surface (exposed
 *      through `__engine.systemManager.playerController` per the split B
 *      composer wire in PR #298). If the surface is absent in this build
 *      the script logs the gap and the post-press frame is the same scene
 *      as pre-press.
 *   5. Captures the post-press frame.
 *   6. Triggers the matching exit via `tryExit()` (same surface).
 *   7. Captures the post-exit frame.
 *
 * Best-effort tolerance: every dev-surface probe is guarded. When a
 * surface is absent the script logs the gap, takes the framing it can,
 * and writes the PNG. The owner walk-through (load each scenario, walk
 * near each vehicle, press F, drive 10 s, exit) remains the load-bearing
 * acceptance gate; this script just produces enough evidence to merge
 * under autonomous-loop posture.
 *
 * Modeled on `scripts/capture-vehicle-wayfinding-shots.ts` (cycle
 * 2026-05-19) with the per-vehicle pre/post/exit triple-shot pattern.
 * Uses the perf-harness preview build (`dist-perf`) and drives the
 * engine via the `__engine` window global.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9131;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-vekhikl-player-boarding-wire',
  'playtest-evidence',
);

type VehicleSlug = 'm151' | 'm48' | 'sampan' | 'pbr' | 'm2hb';
type Category = 'ground' | 'watercraft' | 'emplacement';
type Mode = 'open_frontier' | 'a_shau_valley';

interface VehicleTarget {
  slug: VehicleSlug;
  category: Category;
  /** Substring expected in the vehicle id for the boarding-factory dispatch. */
  idMatch: string;
  /** Default scenario for the capture (script falls through to the other if no live match). */
  preferredMode: Mode;
  /** Friendly human label that ends up in the playtest memo + filename. */
  label: string;
}

const TARGETS: VehicleTarget[] = [
  { slug: 'm151', category: 'ground', idMatch: 'm151', preferredMode: 'open_frontier', label: 'M151 Jeep' },
  { slug: 'm48', category: 'ground', idMatch: 'm48', preferredMode: 'open_frontier', label: 'M48 Patton' },
  { slug: 'sampan', category: 'watercraft', idMatch: 'sampan', preferredMode: 'a_shau_valley', label: 'Sampan' },
  { slug: 'pbr', category: 'watercraft', idMatch: 'pbr', preferredMode: 'a_shau_valley', label: 'PBR' },
  { slug: 'm2hb', category: 'emplacement', idMatch: 'm2hb', preferredMode: 'open_frontier', label: 'M2HB emplacement' },
];

type FrameTag = 'pre-press' | 'post-press' | 'post-exit';

type CaptureSummaryRow = {
  slug: VehicleSlug;
  mode: Mode | null;
  matchedVehicleId: string | null;
  frames: Record<FrameTag, { wrote: boolean; note: string }>;
  boardCallResult: 'true' | 'false' | 'absent' | 'error' | null;
  exitCallResult: 'true' | 'false' | 'absent' | 'error' | null;
};

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function startMode(page: Page, mode: Mode): Promise<void> {
  await page.evaluate(async (m: string) => {
    const engine = (window as unknown as {
      __engine?: { startGameWithMode?: (mode: string) => Promise<void> };
    }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
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

interface VehicleSnapshot {
  id: string;
  category: string;
  position: [number, number, number];
}

async function snapshotVehicles(page: Page): Promise<VehicleSnapshot[]> {
  return await page.evaluate(() => {
    type Vehicle = {
      vehicleId: string;
      category: string;
      isDestroyed?: () => boolean;
      getPosition?: () => { x: number; y: number; z: number };
    };
    const engine = (window as unknown as {
      __engine?: {
        systemManager?: {
          vehicleManager?: { getAllVehicles?: () => Vehicle[] };
        };
      };
    }).__engine;
    const all = engine?.systemManager?.vehicleManager?.getAllVehicles?.() ?? [];
    return all
      .filter(v => !(typeof v.isDestroyed === 'function' && v.isDestroyed()))
      .map(v => {
        const p = v.getPosition?.();
        return {
          id: v.vehicleId,
          category: v.category,
          position: p ? [p.x, p.y, p.z] as [number, number, number] : [0, 0, 0] as [number, number, number],
        };
      });
  });
}

async function teleportPlayerNear(page: Page, target: [number, number, number]): Promise<boolean> {
  return await page.evaluate(({ tx, ty, tz }) => {
    type PC = {
      teleport?: (p: { x: number; y: number; z: number }) => void;
      setPosition?: (p: { x: number; y: number; z: number }, reason?: string) => void;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { playerController?: PC } };
    }).__engine;
    const pc = engine?.systemManager?.playerController;
    if (!pc) return false;
    // Place the player ~3 m north of the target so the vehicle is in
    // frame in front of the camera; well inside the 6 m prompt radius.
    const px = tx;
    const py = ty + 1.6;
    const pz = tz + 3;
    try {
      if (typeof pc.teleport === 'function') {
        pc.teleport({ x: px, y: py, z: pz });
        return true;
      }
      if (typeof pc.setPosition === 'function') {
        pc.setPosition({ x: px, y: py, z: pz }, 'teleport');
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }, { tx: target[0], ty: target[1], tz: target[2] });
}

async function tickSimSeconds(page: Page, seconds: number): Promise<void> {
  await page.waitForTimeout(Math.max(200, Math.round(seconds * 1000)));
}

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

/**
 * Drive the F-key boarding round-trip from script context. The split B
 * composer wire (PR #298) hangs the factory on the player controller as
 * a `boardingFactory` field; we probe both that surface and the older
 * `tryBoardNearestVehicle` PlayerController callback to keep the script
 * runnable across the dispatch window.
 *
 * Returns:
 *   'true'   — the factory boarded a vehicle
 *   'false'  — the factory ran and refused (no proximity / no free seat)
 *   'absent' — the dev surface is not yet wired in this build
 *   'error'  — the call threw (e.g. seat lock mid-mount)
 */
async function tryBoardNearest(page: Page): Promise<'true' | 'false' | 'absent' | 'error'> {
  return await page.evaluate(() => {
    type Factory = {
      tryBoardNearest?: () => boolean;
    };
    type PC = {
      boardingFactory?: Factory;
      tryBoardNearestVehicle?: () => boolean;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { playerController?: PC } };
    }).__engine;
    const pc = engine?.systemManager?.playerController;
    if (!pc) return 'absent' as const;
    try {
      if (pc.boardingFactory && typeof pc.boardingFactory.tryBoardNearest === 'function') {
        return pc.boardingFactory.tryBoardNearest() ? 'true' as const : 'false' as const;
      }
      if (typeof pc.tryBoardNearestVehicle === 'function') {
        return pc.tryBoardNearestVehicle() ? 'true' as const : 'false' as const;
      }
      return 'absent' as const;
    } catch {
      return 'error' as const;
    }
  });
}

async function tryExit(page: Page): Promise<'true' | 'false' | 'absent' | 'error'> {
  return await page.evaluate(() => {
    type Factory = {
      tryExit?: () => boolean;
    };
    type PC = {
      boardingFactory?: Factory;
      tryExitVehicle?: () => boolean;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { playerController?: PC } };
    }).__engine;
    const pc = engine?.systemManager?.playerController;
    if (!pc) return 'absent' as const;
    try {
      if (pc.boardingFactory && typeof pc.boardingFactory.tryExit === 'function') {
        return pc.boardingFactory.tryExit() ? 'true' as const : 'false' as const;
      }
      if (typeof pc.tryExitVehicle === 'function') {
        return pc.tryExitVehicle() ? 'true' as const : 'false' as const;
      }
      return 'absent' as const;
    } catch {
      return 'error' as const;
    }
  });
}

async function captureForTarget(
  page: Page,
  target: VehicleTarget,
  scenarioInUse: Mode,
): Promise<CaptureSummaryRow> {
  const row: CaptureSummaryRow = {
    slug: target.slug,
    mode: scenarioInUse,
    matchedVehicleId: null,
    frames: {
      'pre-press': { wrote: false, note: '' },
      'post-press': { wrote: false, note: '' },
      'post-exit': { wrote: false, note: '' },
    },
    boardCallResult: null,
    exitCallResult: null,
  };

  const stamp = `${target.slug}-${scenarioInUse}`;

  const vehicles = await snapshotVehicles(page);
  const match = vehicles.find(v =>
    v.id.toLowerCase().includes(target.idMatch)
    && v.category === target.category,
  );

  if (!match) {
    const note = `no live vehicle matching id-substring "${target.idMatch}" and category "${target.category}" in mode ${scenarioInUse}; spawning may have raced, or the integration PR is not in this build.`;
    logStep(`[${target.slug}] ${note}`);
    for (const tag of ['pre-press', 'post-press', 'post-exit'] as FrameTag[]) {
      row.frames[tag].note = note;
      await snap(page, join(OUT_DIR, `${stamp}-${tag}.png`));
      row.frames[tag].wrote = true;
    }
    return row;
  }

  row.matchedVehicleId = match.id;
  logStep(`[${target.slug}] teleporting near ${match.id} @ (${match.position.join(', ')})`);
  const teleported = await teleportPlayerNear(page, match.position);
  if (!teleported) {
    const note = 'playerController.teleport / setPosition surface unavailable; framings will be best-effort';
    row.frames['pre-press'].note = note;
  }
  // Let the SystemUpdater drive the proximity checker for a few ticks
  // (10 Hz cadence) so the HUD "Press F to board" prompt latches before
  // the pre-press frame.
  await tickSimSeconds(page, 0.8);

  // ── Frame 1: pre-press (HUD shows "Press F to board <vehicle>") ──
  await snap(page, join(OUT_DIR, `${stamp}-pre-press.png`));
  row.frames['pre-press'].wrote = true;

  // ── Trigger F-key boarding ──
  const boardResult = await tryBoardNearest(page);
  row.boardCallResult = boardResult;
  logStep(`[${target.slug}] tryBoardNearest → ${boardResult}`);
  await tickSimSeconds(page, 0.6);

  // ── Frame 2: post-press (player seated in vehicle; HUD prompt gone) ──
  row.frames['post-press'].note = `boardCall=${boardResult}`;
  await snap(page, join(OUT_DIR, `${stamp}-post-press.png`));
  row.frames['post-press'].wrote = true;

  // ── Trigger F-key exit (same surface, mirrors helicopter pattern) ──
  const exitResult = await tryExit(page);
  row.exitCallResult = exitResult;
  logStep(`[${target.slug}] tryExit → ${exitResult}`);
  await tickSimSeconds(page, 0.6);

  // ── Frame 3: post-exit (player back on foot near vehicle; prompt returns) ──
  row.frames['post-exit'].note = `exitCall=${exitResult}`;
  await snap(page, join(OUT_DIR, `${stamp}-post-exit.png`));
  row.frames['post-exit'].wrote = true;

  return row;
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const summary = {
    capturedAt: new Date().toISOString(),
    cycle: 'cycle-vekhikl-player-boarding-wire',
    task: 'vekhikl-board-integration-test-and-playtest-evidence',
    posture: 'autonomous-loop',
    resolvedBackend: null as string | null,
    targets: [] as CaptureSummaryRow[],
  };

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

    summary.resolvedBackend = await page.evaluate(() => {
      const engine = (window as unknown as {
        __engine?: { renderer?: { getRendererBackendCapabilities?: () => { resolvedBackend?: string } } };
      }).__engine;
      const caps = engine?.renderer?.getRendererBackendCapabilities?.();
      return caps?.resolvedBackend ?? null;
    });
    logStep(`resolvedBackend = ${summary.resolvedBackend ?? '(unknown)'}`);

    // Group targets by mode so we change scenarios only once.
    const groups = new Map<Mode, VehicleTarget[]>();
    for (const t of TARGETS) {
      const list = groups.get(t.preferredMode) ?? [];
      list.push(t);
      groups.set(t.preferredMode, list);
    }

    for (const [mode, targets] of groups) {
      logStep(`-- Switching to scenario ${mode} (${targets.map(t => t.slug).join(', ')}) --`);
      await startMode(page, mode);
      await dismissBriefingIfPresent(page);
      // Vehicles spawn via the setTimeout(0) deferral in
      // OperationalRuntimeComposer + per-system spawn callbacks; 6 s is
      // generous for the chain to settle on the slower scenarios.
      await page.waitForTimeout(6000);

      for (const target of targets) {
        try {
          const row = await captureForTarget(page, target, mode);
          summary.targets.push(row);
        } catch (err) {
          logStep(`[${target.slug}] capture failed: ${(err as Error).message}`);
          summary.targets.push({
            slug: target.slug,
            mode,
            matchedVehicleId: null,
            frames: {
              'pre-press': { wrote: false, note: `error: ${(err as Error).message}` },
              'post-press': { wrote: false, note: '' },
              'post-exit': { wrote: false, note: '' },
            },
            boardCallResult: 'error',
            exitCallResult: null,
          });
        }
      }
    }

    writeFileSync(
      join(OUT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2),
    );
    logStep(`Wrote ${join(OUT_DIR, 'summary.json')}`);

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-vekhikl-player-boarding-shots failed:', err);
  process.exit(1);
});
