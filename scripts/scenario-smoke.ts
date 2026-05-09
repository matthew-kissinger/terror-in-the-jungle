#!/usr/bin/env tsx
/**
 * Scenario smoke screenshot gate.
 *
 * Phase 0 (2026-05-09 realignment): catch "you can't see the ground"
 * class regressions before they reach prod. The 2026-05-08 hotfix shipped
 * a Z-coordinate sign flip in `CDLODRenderer.ts:25` that backface-culled
 * the entire terrain on every map past green CI and reviewer approval.
 * Automated luma + black-pixel thresholds would have caught it.
 *
 * For each scenario in the smoke set:
 *   1. Open the live mode in a headless browser via the existing preview
 *      server harness (perf bundle by default).
 *   2. Wait for `window.__engine` and a configurable settle interval.
 *   3. Capture one PNG frame.
 *   4. Compute mean luma and black-pixel ratio (Sharp).
 *   5. Assert: mean luma in (30, 230) and < 70% identical pixels.
 *
 * Output:
 *   - Screenshots: `artifacts/scenario-smoke/<timestamp>/<mode>.png`
 *   - JSON summary: `artifacts/scenario-smoke/<timestamp>/summary.json`
 *
 * Exit codes:
 *   0  all scenarios pass
 *   1  one or more failed
 *   2  invocation / harness error
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  parseServerModeArg,
  startServer,
  stopServer,
  type ServerHandle,
} from './preview-server';

interface ScenarioPlan {
  key: string;
  mode: string;
  settleSec: number;
}

interface ScenarioResult {
  key: string;
  mode: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  reason: string;
  metrics?: {
    width: number;
    height: number;
    lumaMean: number;
    lumaP10: number;
    lumaP90: number;
    blackPixelRatio: number;
    identicalPixelRatio: number;
  };
  screenshotPath?: string;
}

const SCENARIOS: ScenarioPlan[] = [
  { key: 'ai-sandbox', mode: 'ai_sandbox', settleSec: 6 },
  { key: 'open-frontier', mode: 'open_frontier', settleSec: 8 },
  { key: 'a-shau', mode: 'a_shau_valley', settleSec: 10 },
  { key: 'team-deathmatch', mode: 'team_deathmatch', settleSec: 6 },
  { key: 'zone-control', mode: 'zone_control', settleSec: 6 },
];

// Thresholds calibrated to catch fully-black / fully-white frames and
// huge solid-color renderer failures. They're loose on purpose; tighten
// only after a baseline run on the live build proves the headroom.
const LUMA_MIN = 30;
const LUMA_MAX = 230;
const IDENTICAL_PIXEL_MAX_RATIO = 0.7;
const BLACK_PIXEL_MAX_RATIO = 0.7;

const VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_PORT = 9226;
const STARTUP_TIMEOUT_MS = 120_000;

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] [scenario-smoke] ${msg}`);
}

async function waitForEngine(page: Page, mode: string, settleSec: number): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __engine?: unknown }).__engine),
    { timeout: STARTUP_TIMEOUT_MS },
  );
  // Some modes need explicit start via the URL; engine wires that up.
  await page.waitForTimeout(Math.max(settleSec, 1) * 1000);
}

async function computeMetrics(buffer: Buffer): Promise<ScenarioResult['metrics']> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const raw = await img.removeAlpha().raw().toBuffer();

  let sum = 0;
  let blackCount = 0;
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = (raw.length / 3) | 0;
  for (let i = 0; i < raw.length; i += 3) {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    // Rec. 601 luma
    const y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    sum += y;
    if (y < 4) blackCount += 1;
    histogram[y]++;
  }
  const mean = sum / totalPixels;
  const sortedBins: number[] = [];
  for (let v = 0; v < 256; v++) sortedBins.push(histogram[v]);

  // Approximate p10 / p90 via cumulative scan
  let cumulative = 0;
  let p10 = 0;
  let p90 = 0;
  const p10Target = totalPixels * 0.1;
  const p90Target = totalPixels * 0.9;
  let foundP10 = false;
  for (let v = 0; v < 256; v++) {
    cumulative += sortedBins[v];
    if (!foundP10 && cumulative >= p10Target) {
      p10 = v;
      foundP10 = true;
    }
    if (cumulative >= p90Target) {
      p90 = v;
      break;
    }
  }

  // Most common bin frequency = identical-pixel ratio (proxy for solid-color frames)
  let topBin = 0;
  for (let v = 0; v < 256; v++) if (sortedBins[v] > topBin) topBin = sortedBins[v];

  return {
    width,
    height,
    lumaMean: Number(mean.toFixed(2)),
    lumaP10: p10,
    lumaP90: p90,
    blackPixelRatio: Number((blackCount / totalPixels).toFixed(4)),
    identicalPixelRatio: Number((topBin / totalPixels).toFixed(4)),
  };
}

function evaluate(metrics: NonNullable<ScenarioResult['metrics']>): { ok: boolean; reason: string } {
  if (metrics.lumaMean < LUMA_MIN) {
    return {
      ok: false,
      reason: `lumaMean ${metrics.lumaMean} < ${LUMA_MIN} — scene likely black/missing terrain.`,
    };
  }
  if (metrics.lumaMean > LUMA_MAX) {
    return {
      ok: false,
      reason: `lumaMean ${metrics.lumaMean} > ${LUMA_MAX} — scene likely overexposed/white-out.`,
    };
  }
  if (metrics.blackPixelRatio > BLACK_PIXEL_MAX_RATIO) {
    return {
      ok: false,
      reason: `blackPixelRatio ${metrics.blackPixelRatio} > ${BLACK_PIXEL_MAX_RATIO} — scene mostly black.`,
    };
  }
  if (metrics.identicalPixelRatio > IDENTICAL_PIXEL_MAX_RATIO) {
    return {
      ok: false,
      reason: `identicalPixelRatio ${metrics.identicalPixelRatio} > ${IDENTICAL_PIXEL_MAX_RATIO} — scene flat-color (likely render failure).`,
    };
  }
  return { ok: true, reason: 'within thresholds' };
}

async function runOne(
  page: Page,
  scenario: ScenarioPlan,
  baseUrl: string,
  outDir: string,
): Promise<ScenarioResult> {
  const url = `${baseUrl}/?mode=${scenario.mode}&perf=1`;
  logStep(`open ${scenario.key} → ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page, scenario.mode, scenario.settleSec);

    const png = await page.screenshot({ type: 'png', fullPage: false });
    const screenshotPath = join(outDir, `${scenario.key}.png`);
    writeFileSync(screenshotPath, png);

    const metrics = await computeMetrics(png);
    if (!metrics) {
      return {
        key: scenario.key,
        mode: scenario.mode,
        status: 'ERROR',
        reason: 'metrics computation failed',
        screenshotPath,
      };
    }

    const verdict = evaluate(metrics);
    return {
      key: scenario.key,
      mode: scenario.mode,
      status: verdict.ok ? 'PASS' : 'FAIL',
      reason: verdict.reason,
      metrics,
      screenshotPath,
    };
  } catch (err) {
    return {
      key: scenario.key,
      mode: scenario.mode,
      status: 'ERROR',
      reason: (err as Error).message,
    };
  }
}

async function main(): Promise<void> {
  const onlyArgIdx = process.argv.indexOf('--only');
  const onlyKey = onlyArgIdx >= 0 ? process.argv[onlyArgIdx + 1] : undefined;
  const failOnError = !process.argv.includes('--no-fail-on-error');

  const serverMode = parseServerModeArg(process.argv) ?? 'perf';

  const outRoot = join(process.cwd(), 'artifacts', 'scenario-smoke');
  const outDir = join(outRoot, ts());
  if (!existsSync(outRoot)) mkdirSync(outRoot, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  try {
    logStep(`starting server (mode=${serverMode}) on port ${DEFAULT_PORT}`);
    server = await startServer({
      mode: serverMode,
      port: DEFAULT_PORT,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      log: (msg) => logStep(msg),
    });

    const baseUrl = `http://127.0.0.1:${server.port}`;
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    const targets = onlyKey ? SCENARIOS.filter((s) => s.key === onlyKey) : SCENARIOS;
    if (targets.length === 0) {
      logStep(`no scenarios matched --only=${onlyKey ?? '(none)'}`);
      process.exit(2);
    }

    const results: ScenarioResult[] = [];
    for (const sc of targets) {
      const r = await runOne(page, sc, baseUrl, outDir);
      results.push(r);
      logStep(`  ${sc.key}: ${r.status} — ${r.reason}`);
    }

    await ctx.close();
    await browser.close();

    const summary = {
      generatedAt: new Date().toISOString(),
      serverMode,
      thresholds: {
        lumaMin: LUMA_MIN,
        lumaMax: LUMA_MAX,
        blackPixelMaxRatio: BLACK_PIXEL_MAX_RATIO,
        identicalPixelMaxRatio: IDENTICAL_PIXEL_MAX_RATIO,
      },
      results,
    };
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    const failed = results.filter((r) => r.status === 'FAIL');
    const errored = results.filter((r) => r.status === 'ERROR');
    const passed = results.filter((r) => r.status === 'PASS');
    logStep(`done — ${passed.length} pass, ${failed.length} fail, ${errored.length} error`);
    logStep(`  artifacts: ${outDir}`);

    if (failed.length > 0) process.exit(1);
    if (errored.length > 0 && failOnError) process.exit(1);
  } finally {
    if (server) {
      try {
        await stopServer(server);
      } catch {
        /* best-effort */
      }
    }
  }
}

main().catch((err) => {
  console.error('[scenario-smoke] fatal:', err);
  process.exit(2);
});
