#!/usr/bin/env tsx
/**
 * Capture playtest-evidence screenshots for the
 * vehicle-wayfinding-playtest-evidence task in
 * cycle-vehicle-wayfinding-and-prompts.
 *
 * Under the campaign's autonomous-loop posture
 * (docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md), owner walk-through is
 * deferred to docs/PLAYTEST_PENDING.md. This script captures the substitute
 * Playwright evidence — proof that the four R1 wayfinding landings cooperate
 * for each of the five drivable vehicle types:
 *   - "Press F to board" HUD prompt (`vehicle-proximity-prompt`, PR #279)
 *   - Minimap vehicle markers      (`minimap-vehicle-markers`,  PR #280)
 *   - Full-map vehicle markers     (`fullmap-vehicle-markers`,  PR #281)
 *   - Compass bearing chevrons     (`compass-vehicle-markers`,  PR #278;
 *                                   runtime wiring landed in commit 1 of
 *                                   this branch — without that fix the
 *                                   chevrons stay dark)
 *
 * Capture matrix (22 PNGs):
 *   - 5 vehicle types × 4 surfaces = 20 captures
 *     {m151, m48, sampan, pbr, m2hb} × {hud, minimap, fullmap, compass}
 *   - 2 negative cases
 *     - far-no-prompt.png  — player 12 m from nearest vehicle → prompt hidden
 *     - in-vehicle-no-prompt.png — player inside vehicle → prompt hidden
 *
 * Output directory:
 *   `artifacts/cycle-vehicle-wayfinding-and-prompts/playtest-evidence/`
 *
 * For each vehicle type the script:
 *   1. Switches to the scenario that spawns the vehicle (Open Frontier or
 *      A Shau Valley).
 *   2. Teleports the player to within ~3 m of a live vehicle of that type
 *      (so the proximity prompt fires).
 *   3. Lets the SystemUpdater run a few ticks at the proximity checker's
 *      10 Hz cadence so the prompt + markers settle.
 *   4. Captures HUD (prompt + minimap + compass all visible), then opens
 *      the full map via `fullMapSystem.toggleVisibility()` and captures
 *      that view.
 *
 * Best-effort tolerance: every dev-surface probe is guarded. When a
 * surface is absent the script logs the gap, takes the framing it
 * can, and writes the PNG. The owner walk-through remains the load-bearing
 * acceptance gate; this script just produces enough evidence to merge under
 * autonomous-loop posture.
 *
 * Modeled on `scripts/capture-vekhikl-2-emplacement-shots.ts` and
 * `scripts/capture-m151-jeep-playtest-shots.ts`. Uses the perf-harness
 * preview build (`dist-perf`) and drives the engine via the `__engine`
 * window global.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9128;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-vehicle-wayfinding-and-prompts',
  'playtest-evidence',
);

type VehicleSlug = 'm151' | 'm48' | 'sampan' | 'pbr' | 'm2hb';
type Category = 'ground' | 'watercraft' | 'emplacement';
type Mode = 'open_frontier' | 'a_shau_valley';

interface VehicleTarget {
  slug: VehicleSlug;
  category: Category;
  /** Substring expected in the vehicle id for the proximity-checker prompt resolver. */
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

type CaptureSummaryRow = {
  slug: VehicleSlug;
  mode: Mode | null;
  matchedVehicleId: string | null;
  surfaces: Record<'hud' | 'minimap' | 'fullmap' | 'compass', { wrote: boolean; note: string }>;
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

/**
 * Pull a snapshot of registered vehicles so the script can pick a real
 * target position before teleporting the player. Returns [] if the
 * vehicle manager has not registered any vehicles yet (e.g. spawn
 * deferral racing the mode-change callback).
 */
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

/**
 * Teleport the player to a position near (within ~3 m of) the given world
 * point. Returns true if the teleport call resolved, false if the dev
 * surface is unavailable.
 */
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
    const py = ty + 1.6; // approximate eye height above the vehicle base
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
  // Let the running animation loop drive the proximity checker + the
  // minimap / compass refresh ticks. 600 ms is enough for 6 proximity
  // ticks at 10 Hz.
  await page.waitForTimeout(Math.max(200, Math.round(seconds * 1000)));
}

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

async function setFullMapOpen(page: Page, open: boolean): Promise<boolean> {
  return await page.evaluate((shouldOpen) => {
    type FM = {
      getIsVisible?: () => boolean;
      toggleVisibility?: () => void;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { fullMapSystem?: FM } };
    }).__engine;
    const fm = engine?.systemManager?.fullMapSystem;
    if (!fm) return false;
    const current = typeof fm.getIsVisible === 'function' ? fm.getIsVisible() : false;
    if (current !== shouldOpen && typeof fm.toggleVisibility === 'function') {
      fm.toggleVisibility();
    }
    return true;
  }, open);
}

/**
 * Pull whatever the proximity checker last asked the HUD to show. Used to
 * record per-vehicle prompt copy in summary.json (in case the script can't
 * later inspect the rendered text because the HUD is canvas-painted).
 */
async function readActivePromptText(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // The InteractionPromptPanel root is the only element with a visible
    // class containing 'visible' under the HUD layout slot. Probe by class.
    const nodes = document.querySelectorAll('[class*="visible"]');
    for (const n of Array.from(nodes)) {
      const text = (n.textContent ?? '').trim();
      if (text.startsWith('Press F')) return text;
    }
    return null;
  });
}

async function tryEnterNearestVehicle(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    type VM = {
      // Optional dev convenience exposed by some vehicle integration
      // PRs; we probe and fall back to a synthesized F key press when
      // absent.
      spawnPlayerInNearestVehicle?: () => boolean;
    };
    const engine = (window as unknown as {
      __engine?: { systemManager?: { vehicleManager?: VM } };
    }).__engine;
    const vm = engine?.systemManager?.vehicleManager;
    if (vm && typeof vm.spawnPlayerInNearestVehicle === 'function') {
      try { vm.spawnPlayerInNearestVehicle(); return true; } catch { /* ignore */ }
    }
    return false;
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
    surfaces: {
      hud: { wrote: false, note: '' },
      minimap: { wrote: false, note: '' },
      fullmap: { wrote: false, note: '' },
      compass: { wrote: false, note: '' },
    },
  };

  // Ensure full map is closed before we start so the HUD captures show
  // the in-world layout, not the modal map overlay.
  await setFullMapOpen(page, false);

  const vehicles = await snapshotVehicles(page);
  const match = vehicles.find(v =>
    v.id.toLowerCase().includes(target.idMatch)
    && v.category === target.category,
  );

  if (!match) {
    const note = `no live vehicle matching id-substring "${target.idMatch}" and category "${target.category}" in mode ${scenarioInUse}; spawning may have raced, or the integration PR is not in this build.`;
    logStep(`[${target.slug}] ${note}`);
    row.surfaces.hud.note = note;
    row.surfaces.minimap.note = note;
    row.surfaces.fullmap.note = note;
    row.surfaces.compass.note = note;
    // Still write empty-canvas captures so the playtest memo has slots.
    const stamp = `${target.slug}-${scenarioInUse}`;
    await snap(page, join(OUT_DIR, `${stamp}-hud.png`)); row.surfaces.hud.wrote = true;
    await snap(page, join(OUT_DIR, `${stamp}-minimap.png`)); row.surfaces.minimap.wrote = true;
    await setFullMapOpen(page, true);
    await tickSimSeconds(page, 0.3);
    await snap(page, join(OUT_DIR, `${stamp}-fullmap.png`)); row.surfaces.fullmap.wrote = true;
    await setFullMapOpen(page, false);
    await tickSimSeconds(page, 0.2);
    await snap(page, join(OUT_DIR, `${stamp}-compass.png`)); row.surfaces.compass.wrote = true;
    return row;
  }

  row.matchedVehicleId = match.id;
  logStep(`[${target.slug}] teleporting near ${match.id} @ (${match.position.join(', ')})`);
  const teleported = await teleportPlayerNear(page, match.position);
  if (!teleported) {
    const note = 'playerController.teleport / setPosition surface unavailable; framings will be best-effort';
    row.surfaces.hud.note = note;
  }
  await tickSimSeconds(page, 0.6);

  const stamp = `${target.slug}-${scenarioInUse}`;

  // HUD capture: prompt + minimap + compass visible in the natural HUD
  // layout. We do NOT hide the body chrome here because we WANT the HUD
  // visible — that's the whole point of this evidence run.
  const promptText = await readActivePromptText(page);
  if (promptText) {
    row.surfaces.hud.note = `prompt text: ${promptText}`;
  } else if (!row.surfaces.hud.note) {
    row.surfaces.hud.note = 'no active "Press F" prompt detected in DOM; proximity checker may not have ticked yet, or HUD path differs from probe';
  }
  await snap(page, join(OUT_DIR, `${stamp}-hud.png`));
  row.surfaces.hud.wrote = true;

  // Minimap capture: cropped via screenshot of the full HUD; the minimap
  // is a fixed HUD slot so it sits in the same screen region in every
  // capture. The HUD shot above already includes the minimap; this
  // dedicated shot is for memo-side comparison.
  await snap(page, join(OUT_DIR, `${stamp}-minimap.png`));
  row.surfaces.minimap.wrote = true;

  // Compass capture: same HUD frame, taken separately so the memo can
  // reference a stable filename for the compass chevron evidence.
  await snap(page, join(OUT_DIR, `${stamp}-compass.png`));
  row.surfaces.compass.wrote = true;
  row.surfaces.compass.note = row.surfaces.compass.note
    || 'compass chevrons require the compass-vehicle-marker runtime wiring (commit 1 of this branch)';

  // Full-map capture: open M-key map, wait one tick for render, screenshot.
  const opened = await setFullMapOpen(page, true);
  if (!opened) {
    row.surfaces.fullmap.note = 'fullMapSystem.toggleVisibility surface unavailable; capture falls back to HUD framing';
  }
  await tickSimSeconds(page, 0.4);
  await snap(page, join(OUT_DIR, `${stamp}-fullmap.png`));
  row.surfaces.fullmap.wrote = true;
  await setFullMapOpen(page, false);
  await tickSimSeconds(page, 0.2);

  return row;
}

async function captureNegativeCases(
  page: Page,
  vehicles: VehicleSnapshot[],
): Promise<{ farNoPrompt: { wrote: boolean; note: string }; inVehicleNoPrompt: { wrote: boolean; note: string } }> {
  const farNoPrompt = { wrote: false, note: '' };
  const inVehicleNoPrompt = { wrote: false, note: '' };

  // Negative case 1: stand 12 m from the nearest vehicle (outside the 6 m
  // prompt radius). Pick any live target, then translate +12 m on Z.
  const any = vehicles[0];
  if (any) {
    const farPos: [number, number, number] = [any.position[0], any.position[1], any.position[2] + 12];
    const teleported = await teleportPlayerNear(page, farPos);
    if (!teleported) {
      farNoPrompt.note = 'teleport unavailable; capture is best-effort';
    }
    await tickSimSeconds(page, 0.6);
    const promptText = await readActivePromptText(page);
    farNoPrompt.note = promptText
      ? `unexpected prompt detected at far range: ${promptText}`
      : farNoPrompt.note || 'no prompt at 12 m (as expected)';
    await snap(page, join(OUT_DIR, 'negative-far-no-prompt.png'));
    farNoPrompt.wrote = true;
  } else {
    farNoPrompt.note = 'no vehicles in scene for negative far case';
  }

  // Negative case 2: enter a vehicle (best-effort), then capture the HUD.
  // The proximity prompt should hide on entry.
  const entered = await tryEnterNearestVehicle(page);
  if (!entered) {
    inVehicleNoPrompt.note = 'no spawnPlayerInNearestVehicle dev surface; entry-state capture is best-effort';
  }
  await tickSimSeconds(page, 0.6);
  const promptText = await readActivePromptText(page);
  inVehicleNoPrompt.note = promptText
    ? `unexpected prompt while in-vehicle: ${promptText}`
    : inVehicleNoPrompt.note || 'no prompt while in-vehicle (as expected)';
  await snap(page, join(OUT_DIR, 'negative-in-vehicle-no-prompt.png'));
  inVehicleNoPrompt.wrote = true;

  return { farNoPrompt, inVehicleNoPrompt };
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const summary = {
    capturedAt: new Date().toISOString(),
    cycle: 'cycle-vehicle-wayfinding-and-prompts',
    task: 'vehicle-wayfinding-playtest-evidence',
    posture: 'autonomous-loop',
    resolvedBackend: null as string | null,
    targets: [] as CaptureSummaryRow[],
    negatives: {
      farNoPrompt: { wrote: false, note: '' },
      inVehicleNoPrompt: { wrote: false, note: '' },
    },
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
            surfaces: {
              hud: { wrote: false, note: `error: ${(err as Error).message}` },
              minimap: { wrote: false, note: '' },
              fullmap: { wrote: false, note: '' },
              compass: { wrote: false, note: '' },
            },
          });
        }
      }
    }

    // Negative cases: ride the last loaded scenario. Pick whatever
    // vehicles are still live.
    const vehicles = await snapshotVehicles(page);
    const negatives = await captureNegativeCases(page, vehicles);
    summary.negatives = negatives;

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
  console.error('capture-vehicle-wayfinding-shots failed:', err);
  process.exit(1);
});
