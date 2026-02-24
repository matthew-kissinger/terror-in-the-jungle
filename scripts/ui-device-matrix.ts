import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContextOptions, type Page, type ViewportSize } from 'playwright';

type Scenario = 'menu' | 'gameplay';

interface DeviceProfile {
  id: string;
  label: string;
  viewport: ViewportSize;
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScenarioMetrics {
  source: 'hud' | 'menu' | 'unknown';
  visibleRegions: number;
  overlapCount: number;
  offscreenCount: number;
  hudCoverageRatio: number;
  crowdingWarnings: string[];
}

interface SnapshotResult {
  device: DeviceProfile;
  scenario: Scenario;
  screenshotPath: string;
  metrics: ScenarioMetrics;
}

const BASE_URL = process.env.MATRIX_BASE_URL ?? 'http://localhost:5173/terror-in-the-jungle/';
const TS = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.resolve('artifacts', 'ui-matrix', TS);
const REPORT_PATH = path.join(OUT_DIR, 'report.md');

const DEVICES: DeviceProfile[] = [
  { id: 'desktop-1080', label: 'Desktop 1080p', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { id: 'desktop-1366', label: 'Desktop 1366x768', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  { id: 'tablet-landscape', label: 'Tablet Landscape', viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { id: 'phone-portrait', label: 'Phone Portrait', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { id: 'phone-landscape', label: 'Phone Landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
];

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function parseScenarioUrl(base: string, scenario: Scenario): string {
  if (scenario === 'menu') return base;
  const url = new URL(base);
  url.searchParams.set('sandbox', '1');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('combat', '1');
  url.searchParams.set('npcs', '30');
  return url.toString();
}

async function waitForScenarioReady(scenario: Scenario, page: Page): Promise<void> {
  if (scenario === 'menu') {
    await page.waitForSelector('[data-ref="play"]', { timeout: 30000 }).catch(async () => {
      await page.waitForTimeout(1000);
    });
    await page.waitForTimeout(1200);
    return;
  }
  await page.waitForSelector('#game-hud-root', { timeout: 60000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#game-hud-root');
    if (!root) return false;
    const slots = Array.from(root.querySelectorAll<HTMLElement>('.hud-slot[data-region]'));
    return slots.some((slot) => {
      const style = window.getComputedStyle(slot);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      return Array.from(slot.children).some((child) => {
        const cs = window.getComputedStyle(child as Element);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
      });
    });
  }, { timeout: 60000 }).catch(async () => {
    // Fallback: allow capture even if HUD remains hidden; report will flag it.
    await page.waitForTimeout(2000);
  });
}

async function captureMetrics(page: Page): Promise<ScenarioMetrics> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportArea = Math.max(1, viewportWidth * viewportHeight);
    const root = document.querySelector('#game-hud-root');
    if (!root) {
      const menuEls = Array.from(document.querySelectorAll<HTMLElement>('[data-ref], button, [role="button"]'))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        });

      let overlapCount = 0;
      let offscreenCount = 0;
      let areaSum = 0;
      for (let i = 0; i < menuEls.length; i++) {
        const a = menuEls[i].rect;
        areaSum += Math.max(0, a.width * a.height);
        if (a.x < -1 || a.y < -1 || a.x + a.width > viewportWidth + 1 || a.y + a.height > viewportHeight + 1) {
          offscreenCount += 1;
        }
        for (let j = i + 1; j < menuEls.length; j++) {
          const b = menuEls[j].rect;
          const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          if (intersection > 8) overlapCount += 1;
        }
      }
      const hudCoverageRatio = Math.min(1, areaSum / viewportArea);
      const warnings: string[] = [];
      if (menuEls.length === 0) warnings.push('No visible menu elements detected');
      if (offscreenCount > 0) warnings.push(`Offscreen elements: ${offscreenCount}`);
      return {
        source: menuEls.length > 0 ? 'menu' : 'unknown',
        visibleRegions: menuEls.length,
        overlapCount,
        offscreenCount,
        hudCoverageRatio,
        crowdingWarnings: warnings,
      };
    }

    const regions = Array.from(root.querySelectorAll<HTMLElement>('.hud-slot[data-region]'));
    const boxes = regions
      .map((slot) => {
        const style = window.getComputedStyle(slot);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
        const rect = slot.getBoundingClientRect();
        const hasVisibleChildren = Array.from(slot.children).some((child) => {
          const cs = window.getComputedStyle(child as Element);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
        });
        return {
          region: slot.dataset.region ?? 'unknown',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hasVisibleChildren,
        };
      })
      .filter((v): v is { region: string; rect: Rect; hasVisibleChildren: boolean } => v !== null && v.hasVisibleChildren);

    let overlapCount = 0;
    let offscreenCount = 0;
    let areaSum = 0;
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i].rect;
      areaSum += Math.max(0, a.width * a.height);
      if (a.x < -1 || a.y < -1 || a.x + a.width > viewportWidth + 1 || a.y + a.height > viewportHeight + 1) {
        offscreenCount += 1;
      }
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j].rect;
        const intersection = Math.max(
          0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        ) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        if (intersection > 4) overlapCount += 1;
      }
    }

    const hudCoverageRatio = Math.min(1, areaSum / viewportArea);
    const crowdingWarnings: string[] = [];
    if (hudCoverageRatio > 0.55) {
      crowdingWarnings.push(`High HUD coverage ${(hudCoverageRatio * 100).toFixed(1)}%`);
    } else if (hudCoverageRatio > 0.42) {
      crowdingWarnings.push(`Moderate HUD coverage ${(hudCoverageRatio * 100).toFixed(1)}%`);
    }
    if (boxes.length === 0) {
      crowdingWarnings.push('HUD slots visible but empty');
    }
    if (overlapCount > 0) {
      crowdingWarnings.push(`Slot overlap pairs: ${overlapCount}`);
    }
    if (offscreenCount > 0) {
      crowdingWarnings.push(`Offscreen slot count: ${offscreenCount}`);
    }

    return {
      source: 'hud',
      visibleRegions: boxes.length,
      overlapCount,
      offscreenCount,
      hudCoverageRatio,
      crowdingWarnings,
    };
  });
}

async function captureMetricsWithRetry(page: Page): Promise<ScenarioMetrics> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded');
      return await captureMetrics(page);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(800);
    }
  }
  throw lastError;
}

function buildContextOptions(device: DeviceProfile): BrowserContextOptions {
  return {
    viewport: device.viewport,
    isMobile: device.isMobile ?? false,
    hasTouch: device.hasTouch ?? false,
    deviceScaleFactor: device.deviceScaleFactor ?? 1,
  };
}

function toRow(result: SnapshotResult): string {
  const m = result.metrics;
  const warnings = m.crowdingWarnings.length > 0 ? m.crowdingWarnings.join('; ') : 'none';
  return `| ${result.device.label} | ${result.scenario} | ${m.source} | ${m.visibleRegions} | ${m.overlapCount} | ${m.offscreenCount} | ${(m.hudCoverageRatio * 100).toFixed(1)}% | ${warnings} | ${result.screenshotPath.replaceAll('\\', '/')} |`;
}

async function main(): Promise<void> {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const results: SnapshotResult[] = [];

  try {
    for (const device of DEVICES) {
      const context = await browser.newContext(buildContextOptions(device));
      const page = await context.newPage();

      for (const scenario of ['menu', 'gameplay'] as const) {
        const target = parseScenarioUrl(BASE_URL, scenario);
        await page.goto(target, { waitUntil: 'networkidle', timeout: 90000 });
        await waitForScenarioReady(scenario, page);
        await page.waitForLoadState('networkidle');
        const metrics = await captureMetricsWithRetry(page);
        const screenshotPath = path.join(OUT_DIR, `${device.id}-${scenario}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 0 });
        results.push({ device, scenario, metrics, screenshotPath });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const lines: string[] = [];
  lines.push('# UI Device Matrix Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Base URL: ${BASE_URL}`);
  lines.push('');
  lines.push('| Device | Scenario | Source | Visible Regions | Overlaps | Offscreen | Coverage | Warnings | Screenshot |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---|');
  for (const result of results) {
    lines.push(toRow(result));
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Overlap/offscreen checks are based on visible HUD slot bounds.');
  lines.push('- High HUD coverage on phones indicates likely crowding and should be treated as a design risk.');
  lines.push('- Review screenshots for visual hierarchy, spacing, and control readability.');
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');

  console.log(`UI device matrix complete: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error('UI device matrix failed');
  console.error(error);
  process.exitCode = 1;
});

