#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Vegetation LOD review screenshot walk.
 *
 * Drives the dev-only `?mode=vegetation-lod-review` route and captures each
 * selected vegetation asset under lighting/fog presets that stress the known
 * failure modes: daylight haze, low warm sun, and dense humid fog. This is a
 * proof generator, not an automated visual-acceptance oracle; it fails only
 * when the route cannot load/render the expected source + far-representation
 * columns or browser runtime errors appear.
 *
 * Usage:
 *   npm run check:vegetation-lod-review
 *   npm run check:vegetation-lod-review -- --only jungle-tree,fan-palm --stages daylight,humid-fog
 *   npm run check:vegetation-lod-review -- --headed
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type ConsoleMessage, type Page } from 'playwright';
import {
  buildVegetationLodReviewEntries,
  type VegetationLodReviewEntry,
} from '../src/dev/vegetationLodReview/vegetationLodReviewCatalog';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type ReviewStage = 'daylight' | 'low-sun' | 'humid-fog';

interface ReviewState {
  mode: 'vegetation-lod-review';
  slug: string | null;
  kind: string | null;
  stage: ReviewStage;
  loadStatus: string;
  rendererBackend: string;
  sourceMeshCount: number;
  previewMeshCount: number;
  columns: string[];
  totalAssets: number;
}

interface ReviewResult {
  slug: string;
  kind: string;
  stage: ReviewStage;
  status: 'PASS' | 'FAIL';
  rendererBackend: string;
  sourceMeshCount: number;
  previewMeshCount: number;
  columns: string[];
  screenshot: string;
  reason: string;
  consoleErrors: string[];
}

const VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_PORT = 9232;
const STARTUP_TIMEOUT_MS = 120_000;
const SELECT_TIMEOUT_MS = 70_000;
const SETTLE_MS = 900;
const STAGES: readonly ReviewStage[] = ['daylight', 'low-sun', 'humid-fog'];

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [vegetation-lod-review] ${msg}`);
}

function parseCsvArg(name: string): string[] | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  const values = process.argv[idx + 1].split(',').map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

function selectedEntries(): VegetationLodReviewEntry[] {
  const only = parseCsvArg('--only');
  const wanted = only ? new Set(only) : null;
  const entries = buildVegetationLodReviewEntries().filter((entry) => !wanted || wanted.has(entry.slug));
  if (entries.length === 0) {
    throw new Error(`no vegetation LOD review entries matched --only=${only?.join(',') ?? ''}`);
  }
  return entries;
}

function selectedStages(): ReviewStage[] {
  const requested = parseCsvArg('--stages');
  if (!requested) return [...STAGES];
  const allowed = new Set<string>(STAGES);
  const stages = requested.map((stage) => {
    if (!allowed.has(stage)) {
      throw new Error(`invalid --stages value "${stage}"; expected ${STAGES.join(',')}`);
    }
    return stage as ReviewStage;
  });
  return stages;
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

function reviewApiReady(): boolean {
  return Boolean((window as unknown as { __vegetationLodReview?: unknown }).__vegetationLodReview);
}

async function openReview(page: Page, baseUrl: string): Promise<void> {
  const url = `${baseUrl}/?mode=vegetation-lod-review&renderer=webgpu&stage=daylight`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  try {
    await page.waitForFunction(reviewApiReady, undefined, { timeout: 45_000 });
    return;
  } catch {
    log('review API not ready on first load — reloading once (dev cold-compile)');
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  await page.waitForFunction(reviewApiReady, undefined, { timeout: STARTUP_TIMEOUT_MS });
}

async function readState(page: Page): Promise<ReviewState> {
  const text = await page.evaluate(() => {
    const fn = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
    return fn ? fn() : '{}';
  });
  return JSON.parse(text) as ReviewState;
}

async function selectReviewPose(page: Page, slug: string, stage: ReviewStage): Promise<ReviewState> {
  await page.evaluate(
    async ([assetSlug, lightingStage]) => {
      const api = (window as unknown as {
        __vegetationLodReview?: {
          setStage(stage: string): void;
          selectAsset(slug: string): Promise<void>;
        };
      }).__vegetationLodReview;
      if (!api) return;
      api.setStage(String(lightingStage));
      await api.selectAsset(String(assetSlug));
    },
    [slug, stage] as [string, ReviewStage],
  );
  await page.waitForFunction(
    () => {
      const fn = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
      if (!fn) return false;
      try {
        const state = JSON.parse(fn()) as ReviewState;
        return state.loadStatus === 'loaded' || state.loadStatus === 'error';
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: SELECT_TIMEOUT_MS },
  );
  await page.waitForTimeout(SETTLE_MS);
  return readState(page);
}

async function captureReview(
  page: Page,
  entry: VegetationLodReviewEntry,
  stage: ReviewStage,
  outDir: string,
  drainErrors: () => string[],
): Promise<ReviewResult> {
  drainErrors();
  const state = await selectReviewPose(page, entry.slug, stage);
  const stageDir = join(outDir, stage);
  mkdirSync(stageDir, { recursive: true });
  const screenshot = join(stageDir, `${entry.slug}.png`);
  writeFileSync(screenshot, await page.screenshot({ type: 'png', fullPage: false }));

  const consoleErrors = drainErrors();
  const reasons: string[] = [];
  if (consoleErrors.length > 0) reasons.push(`console errors: ${consoleErrors.join(' | ')}`);
  if (state.loadStatus !== 'loaded') reasons.push(`loadStatus=${state.loadStatus}`);
  if (state.slug !== entry.slug) reasons.push(`selected slug mismatch: ${state.slug}`);
  if (state.sourceMeshCount <= 0) reasons.push('source GLB rendered no meshes');
  if (state.previewMeshCount <= 0) reasons.push('far representation rendered no meshes');

  const expectedColumns = entry.kind === 'octaImpostor'
    ? ['source', 'surface-normal', 'foliage-card', 'foliage-card-soft-fog']
    : ['source', 'ground-card'];
  for (const expected of expectedColumns) {
    if (!state.columns.includes(expected)) reasons.push(`missing column ${expected}`);
  }

  return {
    slug: entry.slug,
    kind: entry.kind,
    stage,
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    rendererBackend: state.rendererBackend,
    sourceMeshCount: state.sourceMeshCount,
    previewMeshCount: state.previewMeshCount,
    columns: state.columns,
    screenshot,
    reason: reasons.join('; ') || 'ok',
    consoleErrors,
  };
}

async function main(): Promise<void> {
  const entries = selectedEntries();
  const stages = selectedStages();
  const headed = process.argv.includes('--headed');
  const outDir = join(process.cwd(), 'artifacts', 'vegetation-lod-review', ts());
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    server = await startServer({
      mode: 'dev',
      port: DEFAULT_PORT,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      log,
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    const errorBuffer: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errorBuffer.push(msg.text());
    });
    page.on('pageerror', (error) => errorBuffer.push(error.message));
    const drainErrors = (): string[] => errorBuffer.splice(0, errorBuffer.length);

    log(`opening review route at ${baseUrl}/?mode=vegetation-lod-review`);
    await openReview(page, baseUrl);

    const results: ReviewResult[] = [];
    for (const entry of entries) {
      for (const stage of stages) {
        const result = await captureReview(page, entry, stage, outDir, drainErrors);
        results.push(result);
        log(`  ${entry.slug} / ${stage}: ${result.status} — ${result.reason}`);
      }
    }

    await ctx.close();

    const failed = results.filter((result) => result.status === 'FAIL');
    writeFileSync(
      join(outDir, 'summary.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        sourceGitSha: gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown'),
        sourceGitStatus: gitStatus(),
        stages,
        total: results.length,
        results,
      }, null, 2),
    );
    log(`done — ${results.length - failed.length} pass, ${failed.length} fail`);
    log(`  artifacts: ${outDir}`);
    if (failed.length > 0) process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    if (server) {
      await stopServer(server).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error('[vegetation-lod-review] fatal:', error);
  process.exit(2);
});
