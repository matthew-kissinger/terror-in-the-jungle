#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * War-asset gallery screenshot walk — the cycle's visual-evidence generator.
 *
 * Drives the dev-only `?mode=asset-gallery` review surface in a headless (or
 * `--headed`) browser, selects every entry in the generated `warAssetCatalog`,
 * and writes one PNG per asset to
 * `artifacts/asset-gallery/<run-ts>/<class>/<slug>.png`.
 *
 * The gallery runs from the Vite dev server (the route is DCE'd out of retail
 * builds), so this walk uses `--server-mode dev` and needs no `dist` build.
 *
 * Fails (exit 1) when:
 *   - any browser console error / pageerror fires during a select, or
 *   - a loadable (non-REJECT) asset reports loadStatus !== 'loaded' or zero
 *     meshes (a missing-mesh regression).
 *
 * REJECT assets are screenshotted as the flag card (no GLB load expected).
 *
 * Usage:
 *   npm run check:asset-gallery
 *   npm run check:asset-gallery -- --headed
 *   npm run check:asset-gallery -- --only uh1-huey,m48-patton
 */

import { chromium, type Page, type ConsoleMessage } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warAssetCatalog, type WarAssetEntry } from '../src/config/generated/warAssetCatalog';
import { startServer, stopServer, type ServerHandle } from './preview-server';

interface AssetResult {
  slug: string;
  class: string;
  status: 'PASS' | 'FAIL';
  loadStatus: string;
  meshCount: number;
  reason: string;
  screenshot: string;
  consoleErrors: string[];
}

interface GalleryState {
  slug: string | null;
  class: string | null;
  forward: string | null;
  budgetStatus: string | null;
  loadStatus: string;
  meshCount: number;
  jointSpin: boolean;
  spinningJoints: string[];
  totalAssets: number;
}

const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_PORT = 9231;
const STARTUP_TIMEOUT_MS = 120_000;
const SELECT_SETTLE_MS = 700;

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [asset-gallery] ${msg}`);
}

function gitOutputOrFallback(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function gitStatus(): string[] {
  return gitOutputOrFallback(['status', '--short'], '')
    .split(/\r?\n/)
    .filter(Boolean);
}

function parseOnly(): Set<string> | null {
  const idx = process.argv.indexOf('--only');
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return new Set(process.argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean));
}

function galleryApiReady(): boolean {
  return Boolean((window as unknown as { __assetGallery?: unknown }).__assetGallery);
}

/**
 * Navigate to the gallery and wait for its `window.__assetGallery` API. The
 * Vite dev server's port opens before the module graph is compiled, so the
 * first request can race the bundle; reload once if the API has not appeared.
 */
async function openGallery(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  try {
    await page.waitForFunction(galleryApiReady, undefined, { timeout: 45_000 });
    return;
  } catch {
    log('gallery API not ready on first load — reloading once (dev cold-compile)');
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  await page.waitForFunction(galleryApiReady, undefined, { timeout: STARTUP_TIMEOUT_MS });
}

async function readState(page: Page): Promise<GalleryState> {
  // Wait until the gallery reports a concrete load status for the active slug.
  // Polling absorbs the one-frame race between selectAsset() resolving and the
  // window state being readable (an empty `{}` would otherwise false-fail).
  await page
    .waitForFunction(
      () => {
        const fn = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
        if (!fn) return false;
        try {
          return typeof (JSON.parse(fn()) as { loadStatus?: unknown }).loadStatus === 'string';
        } catch {
          return false;
        }
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  const text = await page.evaluate(() => {
    const fn = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
    return fn ? fn() : '{}';
  });
  return JSON.parse(text) as GalleryState;
}

async function captureAsset(
  page: Page,
  entry: WarAssetEntry,
  outDir: string,
  drainErrors: () => string[],
): Promise<AssetResult> {
  drainErrors();
  // Spin grafted joints when the asset has them, so the screenshot shows the
  // pivots displaced (verifies the graft) rather than a frozen neutral pose.
  const spin = (entry.joints?.length ?? 0) > 0;
  await page.evaluate(
    ([slug, doSpin]) => {
      const api = (window as unknown as {
        __assetGallery?: { selectAsset: (s: string) => Promise<void>; setJointSpin: (v: boolean) => void };
      }).__assetGallery;
      if (!api) return;
      api.setJointSpin(Boolean(doSpin));
      return api.selectAsset(String(slug));
    },
    [entry.slug, spin] as [string, boolean],
  );
  await page.waitForTimeout(SELECT_SETTLE_MS);

  const state = await readState(page);
  const classDir = join(outDir, entry.class);
  mkdirSync(classDir, { recursive: true });
  const screenshot = join(classDir, `${entry.slug}.png`);
  writeFileSync(screenshot, await page.screenshot({ type: 'png', fullPage: false }));

  const consoleErrors = drainErrors();
  const reasons: string[] = [];
  if (consoleErrors.length > 0) reasons.push(`console errors: ${consoleErrors.join(' | ')}`);

  const loadable = entry.budgetStatus !== 'REJECT';
  if (loadable) {
    if (state.loadStatus !== 'loaded') reasons.push(`loadStatus=${state.loadStatus}`);
    if (state.meshCount <= 0) reasons.push('no meshes rendered');
  } else if (state.loadStatus !== 'rejected') {
    reasons.push(`REJECT asset should report rejected, got ${state.loadStatus}`);
  }

  return {
    slug: entry.slug,
    class: entry.class,
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    loadStatus: state.loadStatus,
    meshCount: state.meshCount,
    reason: reasons.join('; ') || 'ok',
    screenshot,
    consoleErrors,
  };
}

async function main(): Promise<void> {
  const only = parseOnly();
  const headed = process.argv.includes('--headed');
  const entries = Object.values(warAssetCatalog)
    .filter((e) => !only || only.has(e.slug))
    .sort((a, b) => a.class.localeCompare(b.class) || a.slug.localeCompare(b.slug));

  if (entries.length === 0) {
    log('no assets matched --only filter');
    process.exit(2);
  }

  const outRoot = join(process.cwd(), 'artifacts', 'asset-gallery');
  const outDir = join(outRoot, ts());
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  try {
    server = await startServer({
      mode: 'dev',
      port: DEFAULT_PORT,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      log,
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    const errorBuffer: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errorBuffer.push(msg.text());
    });
    page.on('pageerror', (err) => errorBuffer.push(err.message));
    const drainErrors = (): string[] => errorBuffer.splice(0, errorBuffer.length);

    log(`opening gallery at ${baseUrl}/?mode=asset-gallery`);
    await openGallery(page, `${baseUrl}/?mode=asset-gallery`);

    const results: AssetResult[] = [];
    for (const entry of entries) {
      const result = await captureAsset(page, entry, outDir, drainErrors);
      results.push(result);
      log(`  ${result.slug} (${result.class}): ${result.status} — ${result.reason}`);
    }

    await ctx.close();
    await browser.close();

    const passed = results.filter((r) => r.status === 'PASS');
    const failed = results.filter((r) => r.status === 'FAIL');
    writeFileSync(
      join(outDir, 'summary.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
        sourceGitStatus: gitStatus(),
        total: results.length,
        results,
      }, null, 2),
    );
    log(`done — ${passed.length} pass, ${failed.length} fail`);
    log(`  artifacts: ${outDir}`);
    if (failed.length > 0) process.exit(1);
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
  console.error('[asset-gallery] fatal:', err);
  process.exit(2);
});
