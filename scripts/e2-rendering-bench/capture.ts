#!/usr/bin/env tsx
/**
 * Headless capture driver for the E2 rendering bench.
 *
 * Spawns `vite` on the bench folder, opens the page in Chromium, runs the
 * full sweep, and writes results to `artifacts/e2-rendering-bench/<ts>.csv`.
 *
 * Usage:
 *   npx tsx scripts/e2-rendering-bench/capture.ts
 *
 * Flags:
 *   --headed  show the browser (offscreen headless still uses SwiftShader by default)
 */

import { spawn, type ChildProcess } from 'child_process';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCH_DIR = __dirname;
const REPO_ROOT = resolve(BENCH_DIR, '..', '..');

const args = process.argv.slice(2);
const headed = args.includes('--headed');

async function main() {
  const outDir = join(REPO_ROOT, 'artifacts', 'e2-rendering-bench');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const vite = startVite();
  try {
    await waitForUrl('http://localhost:5180/', 30000);
    const browser = await chromium.launch({
      headless: !headed,
      args: ['--enable-gpu', '--ignore-gpu-blocklist'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('console', msg => {
      const t = msg.type();
      if (t === 'warning' || t === 'error' || t === 'log') {
        console.log(`[page ${t}]`, msg.text());
      }
    });
    await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });

    await page.waitForFunction(() => typeof (window as unknown as { __e2RunSweep?: () => Promise<void> }).__e2RunSweep === 'function', { timeout: 15000 });

    console.log('[capture] running sweep (A/B/C x 500/1000/2000/3000)...');
    const t0 = Date.now();
    await page.evaluate(async () => {
      await (window as unknown as { __e2RunSweep: () => Promise<void> }).__e2RunSweep();
    });
    console.log(`[capture] sweep done in ${(Date.now() - t0) / 1000}s`);

    const samples = (await page.evaluate(() => (window as unknown as { __e2Samples: unknown[] }).__e2Samples)) as Array<Record<string, unknown>>;
    const csv = await page.evaluate(() => {
      const fn = (window as unknown as { __e2Csv: () => string }).__e2Csv;
      return fn();
    });
    const ua = await page.evaluate(() => navigator.userAgent);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = join(outDir, `bench-${stamp}.csv`);
    const jsonPath = join(outDir, `bench-${stamp}.json`);
    writeFileSync(csvPath, csv);
    writeFileSync(jsonPath, JSON.stringify({ samples, ua }, null, 2));

    console.log(`[capture] wrote ${csvPath}`);
    console.log(`[capture] wrote ${jsonPath}`);
    console.log('\n' + csv);

    await browser.close();
  } finally {
    vite.kill('SIGTERM');
  }
}

function startVite(): ChildProcess {
  const isWin = process.platform === 'win32';
  const child = spawn('npx', ['vite', '--config', join(BENCH_DIR, 'vite.config.ts'), '--port', '5180'], {
    cwd: BENCH_DIR,
    stdio: 'pipe',
    shell: isWin, // Windows requires shell to resolve npx.cmd
  });
  child.stdout?.on('data', d => process.stdout.write(`[vite] ${d}`));
  child.stderr?.on('data', d => process.stderr.write(`[vite!] ${d}`));
  return child;
}

async function waitForUrl(url: string, timeoutMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* keep waiting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

main().catch(e => { console.error(e); process.exit(1); });
