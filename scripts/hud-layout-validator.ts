#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ElementInfo {
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
}

interface Overlap {
  a: string;
  b: string;
  overlapArea: number;
}

interface ClippedElement {
  selector: string;
  clippedBy: string;
}

interface ViewportResult {
  width: number;
  height: number;
  elements: ElementInfo[];
  overlaps: Overlap[];
  clipped: ClippedElement[];
  screenshotPath: string;
}

interface HudLayoutReport {
  timestamp: string;
  viewports: ViewportResult[];
  overall: 'pass' | 'warn' | 'fail';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEV_SERVER_PORT = 9100;
const STEP_TIMEOUT_MS = 90_000;
const GAMEPLAY_TIMEOUT_MS = 60_000;

const HUD_SELECTORS = [
  '.hud-slot',
  '[data-hud]',
  '.kill-feed',
  '.hud-ammo',
  '.hud-tickets',
  '.hud-timer',
  '.minimap-container',
  '.joystick-container',
  '.touch-fire-btn',
  '.touch-action-btn',
  '.weapon-pill',
  '.vehicle-action-bar',
].join(', ');

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 414, height: 896 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const OVERLAP_THRESHOLD = 4; // px in both dimensions

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberFlag(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  const val = Number(process.argv[idx + 1]);
  return Number.isFinite(val) ? val : fallback;
}

// ---------------------------------------------------------------------------
// Dev server helpers (matching perf-capture.ts patterns)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const onDone = (open: boolean) => {
      try { socket.destroy(); } catch { /* noop */ }
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.once('timeout', () => onDone(false));
    socket.connect(port, host);
  });
}

async function startDevServer(port: number): Promise<ChildProcess> {
  console.log(`Starting dev server on port ${port}`);
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  });

  return new Promise((resolve, reject) => {
    let output = '';
    let resolved = false;
    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error('Dev server startup timeout'));
    }, STEP_TIMEOUT_MS);

    server.stdout?.on('data', (data) => {
      output += data.toString();
      if (!resolved && (output.includes('Local:') || output.includes('localhost'))) {
        resolved = true;
        clearTimeout(timeout);
        console.log('Dev server ready');
        resolve(server);
      }
    });

    server.stderr?.on('data', (data) => {
      console.error('[dev-server]', data.toString().trim());
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function killDevServer(server: ChildProcess): Promise<void> {
  console.log('Stopping dev server');
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 5000);
    server.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// HUD element query (runs inside the browser)
// ---------------------------------------------------------------------------

async function queryHudElements(page: Page, selectors: string): Promise<ElementInfo[]> {
  return page.evaluate((sel) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
    return els
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden';
        // Build a readable selector: prefer class list, fall back to tag+id
        let selector = el.tagName.toLowerCase();
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.classList.length > 0) {
          selector = `.${Array.from(el.classList).join('.')}`;
        }
        const dataRegion = el.getAttribute('data-region');
        if (dataRegion) selector += `[data-region="${dataRegion}"]`;
        const dataHud = el.getAttribute('data-hud');
        if (dataHud) selector += `[data-hud="${dataHud}"]`;
        return {
          selector,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          visible,
        };
      })
      .filter((info) => info.visible);
  }, selectors);
}

// ---------------------------------------------------------------------------
// Overlap / clipping detection
// ---------------------------------------------------------------------------

function computeOverlaps(elements: ElementInfo[]): Overlap[] {
  const overlaps: Overlap[] = [];
  for (let i = 0; i < elements.length; i++) {
    const a = elements[i];
    for (let j = i + 1; j < elements.length; j++) {
      const b = elements[j];
      const overlapX = Math.max(0, Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x));
      const overlapY = Math.max(0, Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y));
      if (overlapX > OVERLAP_THRESHOLD && overlapY > OVERLAP_THRESHOLD) {
        overlaps.push({
          a: a.selector,
          b: b.selector,
          overlapArea: Math.round(overlapX * overlapY),
        });
      }
    }
  }
  return overlaps;
}

function computeClipped(elements: ElementInfo[], vpWidth: number, vpHeight: number): ClippedElement[] {
  const clipped: ClippedElement[] = [];
  for (const el of elements) {
    const reasons: string[] = [];
    if (el.rect.x < 0) reasons.push('left');
    if (el.rect.y < 0) reasons.push('top');
    if (el.rect.x + el.rect.width > vpWidth) reasons.push('right');
    if (el.rect.y + el.rect.height > vpHeight) reasons.push('bottom');
    if (reasons.length > 0) {
      clipped.push({ selector: el.selector, clippedBy: reasons.join('+') });
    }
  }
  return clipped;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const headed = hasFlag('headed');
  const port = parseNumberFlag('port', DEV_SERVER_PORT);

  const outDir = join(process.cwd(), 'artifacts', 'hud');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Start or reuse dev server
  let server: ChildProcess | null = null;
  if (await isPortOpen(port)) {
    console.log(`Reusing existing dev server on port ${port}`);
  } else {
    server = await startDevServer(port);
    await sleep(2000);
  }

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });

  const report: HudLayoutReport = {
    timestamp: new Date().toISOString(),
    viewports: [],
    overall: 'pass',
  };

  try {
    // Load game and enter gameplay once at a comfortable resolution
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    const url = `http://localhost:${port}/terror-in-the-jungle/?perf=1`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'commit', timeout: STEP_TIMEOUT_MS });

    // Wait for engine, start TDM programmatically
    console.log('Waiting for engine');
    await page.waitForFunction(() => !!(window as any).__engine, undefined, { timeout: STEP_TIMEOUT_MS });
    console.log('Starting TDM mode');
    await page.evaluate(() => { (window as any).__engine.startGameWithMode('tdm'); });
    await page.waitForFunction(() => (window as any).__engine?.gameStarted, undefined, { timeout: GAMEPLAY_TIMEOUT_MS });

    // Wait for HUD to appear
    await page.waitForSelector('#game-hud-root', { timeout: GAMEPLAY_TIMEOUT_MS }).catch(() => {});
    await sleep(2000); // let HUD settle

    // Iterate viewports
    for (const vp of VIEWPORTS) {
      const label = `${vp.width}x${vp.height}`;
      console.log(`Testing viewport ${label}`);

      await page.setViewportSize(vp);
      await sleep(500); // layout reflow

      const elements = await queryHudElements(page, HUD_SELECTORS);
      const overlaps = computeOverlaps(elements);
      const clipped = computeClipped(elements, vp.width, vp.height);

      const screenshotPath = join(outDir, `hud-${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      report.viewports.push({
        width: vp.width,
        height: vp.height,
        elements,
        overlaps,
        clipped,
        screenshotPath,
      });

      // Update overall status
      if (overlaps.length > 0) {
        report.overall = 'fail';
      }
      if (clipped.length > 0 && report.overall !== 'fail') {
        report.overall = 'warn';
      }
    }

    await context.close();
  } finally {
    await browser.close();
    if (server) {
      await killDevServer(server);
    }
  }

  // Write JSON report
  const reportPath = join(outDir, 'hud-layout-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport written to ${reportPath}`);

  // Console summary table
  console.log('\n=== HUD Layout Validation Summary ===\n');
  console.log(
    'Viewport'.padEnd(14) +
    'Elements'.padEnd(10) +
    'Overlaps'.padEnd(10) +
    'Clipped'.padEnd(10)
  );
  console.log('-'.repeat(44));

  for (const vp of report.viewports) {
    const label = `${vp.width}x${vp.height}`;
    console.log(
      label.padEnd(14) +
      String(vp.elements.length).padEnd(10) +
      String(vp.overlaps.length).padEnd(10) +
      String(vp.clipped.length).padEnd(10)
    );

    for (const overlap of vp.overlaps) {
      console.log(`  OVERLAP: ${overlap.a} <-> ${overlap.b} (${overlap.overlapArea}px2)`);
    }
    for (const clip of vp.clipped) {
      console.log(`  CLIPPED: ${clip.selector} (${clip.clippedBy})`);
    }
  }

  console.log(`\nOverall: ${report.overall.toUpperCase()}`);

  if (report.overall === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('HUD layout validation failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
