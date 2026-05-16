#!/usr/bin/env tsx
/**
 * Capture noon sky shots in three renderer modes for the
 * sky-hdr-bake-restore task. Drives the perf-harness bundle
 * (`dist-perf/`, exposes `window.__engine`) and writes a PNG per mode
 * under `artifacts/cycle-sky-visual-restore/playtest-evidence/`.
 *
 * Modes: default (`webgpu`), `?renderer=strict`, `?renderer=webgl`.
 *
 * If WebGPU is unavailable in headless Chromium the run records the
 * resolved backend in the per-mode console log; the screenshot still
 * captures whatever the page renders. Failures do not throw — autonomous
 * loop posture treats this smoke as best-effort.
 */

import { chromium, type Page, type ConsoleMessage } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9173;
const VIEWPORT = { width: 1280, height: 720 };
const STARTUP_TIMEOUT_MS = 90_000;
const SETTLE_MS = 6000;

const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'cycle-sky-visual-restore',
  'playtest-evidence'
);

interface ModePlan {
  label: 'webgpu' | 'strict' | 'webgl';
  query: string;
}

const MODES: ModePlan[] = [
  { label: 'webgpu', query: '?perf=1&uiTransitions=0' },
  { label: 'strict', query: '?perf=1&uiTransitions=0&renderer=strict' },
  { label: 'webgl', query: '?perf=1&uiTransitions=0&renderer=webgl' },
];

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startNoonScenario(page: Page): Promise<void> {
  // Use ai_sandbox (combat120) for a stable, scenario-light noon shot
  // with the dome in clean view. Matches the framing convention in
  // capture-hosek-wilkie-shots.ts so visual diffs line up.
  await page.evaluate(async () => {
    const engine = (window as Window & { __engine?: { startGameWithMode?: (m: string) => Promise<void> } }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode('ai_sandbox');
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as Window & { __engine?: { gameStarted?: boolean } }).__engine;
      return { gameStarted: Boolean(e?.gameStarted) };
    });
    if (state.gameStarted) return;
    await page.waitForTimeout(250);
  }
  throw new Error('ai_sandbox did not enter live phase');
}

async function dismissBriefingIfPresent(page: Page): Promise<void> {
  const beginBtn = page.locator('[data-ref="beginBtn"]');
  try {
    if (await beginBtn.isVisible({ timeout: 1500 })) {
      await beginBtn.click();
      logStep('Dismissed mission briefing');
      await page.waitForTimeout(500);
    }
  } catch {
    /* not present, fine */
  }
}

async function poseTowardSun(page: Page, viewport: { width: number; height: number }): Promise<void> {
  // Aim above the horizon so the dome dominates the frame. Have to stop
  // the engine RAF first; otherwise the player-controlled camera will
  // overwrite our pose every tick (same pattern as
  // capture-hosek-wilkie-shots.ts).
  await page.evaluate(({ vp }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const engine: any = (window as any).__engine;
    if (!engine) return;
    engine.isLoopRunning = false;
    if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
      cancelAnimationFrame(engine.animationFrameId);
      engine.animationFrameId = null;
    }

    const renderer = engine.renderer;
    const camera = renderer?.camera;
    const threeRenderer = renderer?.renderer;
    const scene = renderer?.scene;
    const pp = renderer?.postProcessing;
    if (!camera || !threeRenderer || !scene) return;

    threeRenderer.setSize(vp.width, vp.height, true);
    if (pp && typeof pp.setSize === 'function') pp.setSize(vp.width, vp.height);
    if (typeof camera.aspect === 'number') {
      camera.aspect = vp.width / vp.height;
      camera.updateProjectionMatrix?.();
    }

    camera.position.set(0, 200, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set((45 * Math.PI) / 180, (45 * Math.PI) / 180, 0);
    camera.updateMatrixWorld(true);

    const atm = engine.systemManager?.atmosphereSystem;
    if (atm && typeof atm.syncDomePosition === 'function') {
      atm.syncDomePosition(camera.position);
    }

    if (pp && typeof pp.beginFrame === 'function') pp.beginFrame();
    threeRenderer.render(scene, camera);
    if (pp && typeof pp.endFrame === 'function') pp.endFrame();
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, { vp: viewport });
}

async function captureMode(page: Page, mode: ModePlan, baseUrl: string): Promise<{ ok: boolean; warnings: string[]; backend: string }> {
  const warnings: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      warnings.push(`[${msg.type()}] ${msg.text()}`);
    }
  };
  page.on('console', onConsole);

  const url = `${baseUrl}${mode.query}`;
  logStep(`[${mode.label}] navigate -> ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
  await waitForEngine(page);
  await startNoonScenario(page);
  await dismissBriefingIfPresent(page);
  await page.waitForTimeout(SETTLE_MS);
  await poseTowardSun(page, VIEWPORT);
  await page.waitForTimeout(500);

  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });

  const backend = await page.evaluate(() => {
    const r = (window as Window & { __renderer?: { capabilities?: { resolvedBackend?: string }; getRendererCapabilities?: () => { resolvedBackend?: string } } }).__renderer;
    const caps = r?.capabilities ?? r?.getRendererCapabilities?.();
    return caps?.resolvedBackend ?? 'unknown';
  });

  const outFile = join(OUT_DIR, `sky-hdr-bake-restore-${mode.label}.png`);
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`[${mode.label}] wrote ${outFile} (${buffer.byteLength} bytes, backend=${backend})`);

  page.off('console', onConsole);
  return { ok: true, warnings, backend };
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    logStep(`Created ${OUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  const summary: Array<{ label: string; backend: string; warnings: string[] }> = [];
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      log: logStep,
    });

    const browser = await chromium.launch({ headless: true });

    for (const mode of MODES) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      try {
        const result = await captureMode(page, mode, `http://127.0.0.1:${PORT}/`);
        summary.push({ label: mode.label, backend: result.backend, warnings: result.warnings });
      } catch (err) {
        logStep(`[${mode.label}] FAILED: ${(err as Error).message}`);
        summary.push({ label: mode.label, backend: 'failed', warnings: [(err as Error).message] });
      } finally {
        await context.close();
      }
    }

    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  logStep('Summary:');
  for (const row of summary) {
    logStep(`  ${row.label}: backend=${row.backend}, warnings=${row.warnings.length}`);
    for (const w of row.warnings.slice(0, 5)) {
      logStep(`    ${w}`);
    }
  }
}

main().catch((err) => {
  console.error('capture-sky-hdr-bake-shots failed:', err);
  process.exit(1);
});
