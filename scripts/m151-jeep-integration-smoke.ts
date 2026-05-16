#!/usr/bin/env tsx
/**
 * Cycle-specific smoke for `cycle-vekhikl-1-jeep-drivable` task
 * `m151-jeep-integration`.
 *
 * Boots Open Frontier and A Shau Valley in the perf-harness preview, starts
 * the engine, waits for world features to finish spawning, then asserts that
 * at least one IVehicle of category 'ground' is registered with the
 * VehicleManager. Saves a screenshot per mode to
 *   artifacts/cycle-vekhikl-1-jeep-drivable/integration-smoke/<mode>.png
 *
 * Exit codes: 0 = both modes saw a registered M151; non-zero on failure.
 */

import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9227;
const VIEWPORT = { width: 1280, height: 720 };
const STARTUP_TIMEOUT_MS = 180_000;
const POST_START_SETTLE_SEC = 30;
// Poll for the motor-pool M151 spawn for up to this long after live phase.
const MAX_M151_WAIT_SEC = 240;

interface ModeResult {
  mode: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  groundVehicleCount: number;
  m151Position?: { x: number; y: number; z: number };
  reason: string;
}

const MODES = [
  { key: 'open-frontier', mode: 'open_frontier' },
  { key: 'a-shau', mode: 'a_shau_valley' },
];

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [jeep-smoke] ${msg}`);
}

async function probeMode(page: Page, baseUrl: string, key: string, mode: string, outDir: string): Promise<ModeResult> {
  const url = `${baseUrl}/?mode=${mode}&perf=1`;
  log(`open ${key} -> ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });

    // Wait for the engine to be exposed on window.
    await page.waitForFunction(
      () => Boolean((window as unknown as { __engine?: unknown }).__engine),
      { timeout: STARTUP_TIMEOUT_MS },
    );

    // Drive the game into the live phase for the requested mode via the
    // perf-harness's engine.startGameWithMode hook. We then poll for the
    // gameModeManager to confirm the mode actually entered live, then give
    // world features additional settle time to spawn placements.
    await page.evaluate(async (m: string) => {
      const engine = (window as unknown as { __engine?: any }).__engine;
      if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
      await engine.startGameWithMode(m);
    }, mode);

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const engine = (window as unknown as { __engine?: any }).__engine;
        return {
          gameStarted: Boolean(engine?.gameStarted),
          phase: String(engine?.startupFlow?.getState?.()?.phase ?? ''),
          mode: String(engine?.systemManager?.gameModeManager?.getCurrentMode?.() ?? ''),
        };
      });
      if ((state.gameStarted || state.phase === 'live') && state.mode === mode) break;
      await page.waitForTimeout(250);
    }
    log(`  ${key}: live phase reached`);
    await page.waitForTimeout(POST_START_SETTLE_SEC * 1000);

    // Poll for a ground vehicle to appear (motor pool placements spawn after
    // larger features like airfields complete their async model loads).
    const waitDeadline = Date.now() + MAX_M151_WAIT_SEC * 1000;
    while (Date.now() < waitDeadline) {
      const groundCount = await page.evaluate(() => {
        const engine = (window as unknown as { __engine?: any }).__engine;
        const vm = engine?.systemManager?.vehicleManager;
        if (!vm || typeof vm.getAllVehicles !== 'function') return 0;
        return vm.getAllVehicles().filter((v: any) => v.category === 'ground').length;
      });
      if (groundCount > 0) {
        log(`  ${key}: ground vehicle detected (count=${groundCount})`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    // Probe VehicleManager via the engine global. We tolerate missing accessors
    // and capture as much state as we can.
    const probe = await page.evaluate(() => {
      const w = window as unknown as { __engine?: Record<string, unknown> };
      const engine = w.__engine as any;
      if (!engine) return { groundVehicleCount: 0, m151Position: null, error: 'no engine' };

      const sm = engine.systemManager;
      const vm = sm?.vehicleManager;
      if (!vm || typeof vm.getAllVehicles !== 'function') {
        return { groundVehicleCount: 0, m151Position: null, error: 'no vehicleManager.getAllVehicles' };
      }
      const all = vm.getAllVehicles();
      const ground = all.filter((v: any) => v.category === 'ground');
      const first = ground[0];
      let pos: { x: number; y: number; z: number } | null = null;
      if (first && typeof first.getPosition === 'function') {
        const p = first.getPosition();
        pos = { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)), z: Number(p.z.toFixed(2)) };
      }
      const terrainReady = Boolean(sm?.terrainSystem?.isTerrainReady?.());
      const wfs = sm?.worldFeatureSystem as any;
      const featureSystemHas = wfs?.spawnedObjects?.length ?? null;
      const buildInFlight = wfs?.buildInFlight ?? null;
      const builtModeId = wfs?.builtModeId ?? null;
      const currentMode = sm?.gameModeManager?.getCurrentMode?.() ?? null;
      // Sample a few spawned object ids so we can confirm the motor pool reached us
      const spawnedIds = Array.isArray(wfs?.spawnedObjects)
        ? wfs.spawnedObjects.slice(0, 20).map((o: any) => o.id)
        : null;
      return {
        groundVehicleCount: ground.length,
        totalVehicleCount: all.length,
        m151Position: pos,
        terrainReady,
        featureSpawnedCount: featureSystemHas,
        buildInFlight,
        builtModeId,
        currentMode,
        spawnedIds,
        error: null,
      };
    });

    const png = await page.screenshot({ type: 'png', fullPage: false });
    const screenshotPath = join(outDir, `${key}.png`);
    writeFileSync(screenshotPath, png);

    const pass = probe.groundVehicleCount > 0;
    return {
      mode,
      status: pass ? 'PASS' : 'FAIL',
      groundVehicleCount: probe.groundVehicleCount,
      m151Position: probe.m151Position ?? undefined,
      reason: pass
        ? `OK (ground vehicles=${probe.groundVehicleCount}, total=${(probe as any).totalVehicleCount}, first M151 pos=${JSON.stringify(probe.m151Position)})`
        : `no ground vehicles found (probe=${JSON.stringify(probe)})`,
    };
  } catch (err) {
    return { mode, status: 'ERROR', groundVehicleCount: 0, reason: (err as Error).message };
  }
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'artifacts', 'cycle-vekhikl-1-jeep-drivable', 'integration-smoke');
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  try {
    log(`starting perf server on port ${PORT}`);
    server = await startServer({
      mode: 'perf',
      port: PORT,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      log: (msg) => log(msg),
    });

    const baseUrl = `http://127.0.0.1:${server.port}`;
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    const results: ModeResult[] = [];
    for (const { key, mode } of MODES) {
      const r = await probeMode(page, baseUrl, key, mode, outDir);
      results.push(r);
      log(`  ${key}: ${r.status} - ${r.reason}`);
    }

    await ctx.close();
    await browser.close();

    const summary = {
      generatedAt: new Date().toISOString(),
      results,
      cycle: 'cycle-vekhikl-1-jeep-drivable',
      task: 'm151-jeep-integration',
    };
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    const allOK = results.every((r) => r.status === 'PASS');
    log(allOK ? 'OK: all modes registered a ground vehicle' : 'FAIL: see summary.json');
    process.exit(allOK ? 0 : 1);
  } finally {
    if (server) await stopServer(server).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
