#!/usr/bin/env tsx

import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import type { AddressInfo } from 'net';
import { createServer as createViteServer, type ViteDevServer } from 'vite';

const HOST = '127.0.0.1';
const OUTPUT_NAME = 'projekt-143-ux-respawn-multispawn-proof';
const START_TIMEOUT_MS = 60_000;

type CaseId = 'desktop-1440x900' | 'mobile-390x844';
type CheckStatus = 'PASS' | 'WARN' | 'FAIL';
type ProofStatus = 'pass' | 'warn' | 'fail';
type RequiredKind = 'home_base' | 'zone' | 'helipad' | 'insertion';

type DeviceCase = {
  id: CaseId;
  label: string;
  contextOptions: BrowserContextOptions;
};

type SpawnOption = {
  id: string | null;
  kind: string | null;
  selectionClass: string | null;
  label: string;
  meta: string;
  ariaPressed: string | null;
  rect: {
    width: number;
    height: number;
  };
};

type SpawnGroup = {
  title: string;
  optionCount: number;
};

type DeviceProof = {
  id: CaseId;
  label: string;
  url: string;
  screenshot: string;
  mapScreenshot: string;
  spawnOptionsScreenshot: string;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
  visible: boolean;
  text: string;
  allianceVisible: boolean;
  selectedSpawn: string;
  selectedSpawnId: string | null;
  selectedKind: string | null;
  decisionMetric: string;
  deployButtonEnabled: boolean;
  spawnOptions: SpawnOption[];
  spawnGroups: SpawnGroup[];
  minimumSpawnOptionHeightPx: number | null;
  mapCanvas: {
    width: number;
    height: number;
  };
};

type ProofCheck = {
  id: string;
  status: CheckStatus;
  summary: string;
  evidence: string;
};

type ProofReport = {
  createdAt: string;
  sourceGitSha: string;
  mode: typeof OUTPUT_NAME;
  directive: 'UX-1';
  status: ProofStatus;
  summary: {
    cases: number;
    pass: number;
    warn: number;
    fail: number;
    desktopVisible: boolean;
    mobileVisible: boolean;
    requiredKindsVisibleBoth: boolean;
    requiredGroupsVisibleBoth: boolean;
    browserErrorCount: number;
  };
  requiredSpawnKinds: RequiredKind[];
  checks: ProofCheck[];
  devices: DeviceProof[];
  currentContract: string[];
  nonClaims: string[];
  files: {
    summary: string;
    harnessHtml: string;
    harnessModule: string;
    screenshots: string[];
  };
};

const REQUIRED_KINDS: RequiredKind[] = ['home_base', 'zone', 'helipad', 'insertion'];

const REQUIRED_GROUP_TITLES = [
  'ALLIANCE BASES',
  'CONTROLLED ZONES',
  'HELIPADS',
  'INSERTION POINTS',
];

const DEVICE_CASES: DeviceCase[] = [
  {
    id: 'desktop-1440x900',
    label: 'Desktop Chromium 1440x900',
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    id: 'mobile-390x844',
    label: 'Mobile Chromium 390x844',
    contextOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36',
    },
  },
];

function rel(path: string): string {
  return path.replace(process.cwd(), '').replace(/^[\\/]/, '').replaceAll('\\', '/');
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function outputDir(): string {
  return join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function addCheck(checks: ProofCheck[], id: string, status: CheckStatus, summary: string, evidence: string): void {
  checks.push({ id, status, summary, evidence });
}

function statusForCounts(fail: number, warn: number): ProofStatus {
  if (fail > 0) return 'fail';
  if (warn > 0) return 'warn';
  return 'pass';
}

function proofUrl(server: ViteDevServer, harnessHtmlPath: string): string {
  const address = server.httpServer?.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve UX-1 multi-spawn proof server port.');
  }

  return `http://${HOST}:${address.port}/${rel(harnessHtmlPath)}`;
}

function writeHarness(outDir: string): { htmlPath: string; modulePath: string } {
  const htmlPath = join(outDir, 'harness.html');
  const modulePath = join(outDir, 'harness.ts');
  const moduleRel = `/${rel(modulePath)}`;

  writeFileSync(htmlPath, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Projekt 143 UX Respawn Multi-Spawn Proof</title>
  </head>
  <body>
    <script type="module" src="${moduleRel}"></script>
  </body>
</html>
`, 'utf-8');

  writeFileSync(modulePath, `import '@fontsource/teko/latin-400.css';
import '@fontsource/teko/latin-500.css';
import '@fontsource/teko/latin-700.css';
import '@fontsource/rajdhani/latin-400.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '/src/ui/engine/theme.css';
import * as THREE from 'three';
import { DeployScreen } from '/src/ui/screens/DeployScreen.ts';
import { OpenFrontierRespawnMapRenderer } from '/src/ui/map/OpenFrontierRespawnMapRenderer.ts';
import { MAP_SIZE, setMapWorldSize } from '/src/ui/map/OpenFrontierRespawnMapUtils.ts';
import { GameMode } from '/src/config/gameModeTypes.ts';
import { Faction } from '/src/systems/combat/types.ts';
import { ZoneState } from '/src/systems/world/ZoneManager.ts';

document.documentElement.style.margin = '0';
document.documentElement.style.height = '100%';
document.body.style.margin = '0';
document.body.style.minHeight = '100%';

setMapWorldSize(3200);

const screen = new DeployScreen();
const spawnPoints = [
  {
    id: 'us_base',
    name: 'US BASE',
    position: new THREE.Vector3(-780, 0, 720),
    safe: true,
    kind: 'home_base',
    selectionClass: 'home_base',
    sourceZoneId: 'us_base',
    priority: 0,
  },
  {
    id: 'hill_48',
    name: 'HILL 48',
    position: new THREE.Vector3(120, 0, -120),
    safe: true,
    kind: 'zone',
    selectionClass: 'nearest_controlled_zone',
    sourceZoneId: 'hill_48',
    priority: 1,
  },
  {
    id: 'evans_helipad',
    name: 'EVANS HELIPAD',
    position: new THREE.Vector3(-460, 0, -560),
    safe: true,
    kind: 'helipad',
    selectionClass: 'helipad',
    sourceZoneId: 'evans_helipad',
    priority: 2,
  },
  {
    id: 'lz_red',
    name: 'LZ RED',
    position: new THREE.Vector3(700, 0, 520),
    safe: false,
    kind: 'insertion',
    selectionClass: 'direct_insertion',
    sourceZoneId: 'lz_red',
    priority: 3,
  },
];

const zones = [
  makeZone('us_base', 'US Base', spawnPoints[0].position, 150, Faction.US, ZoneState.BLUFOR_CONTROLLED, true, 0),
  makeZone('hill_48', 'Hill 48', spawnPoints[1].position, 130, Faction.US, ZoneState.BLUFOR_CONTROLLED, false, 2),
  makeZone('evans_helipad', 'Evans Helipad', spawnPoints[2].position, 90, Faction.US, ZoneState.BLUFOR_CONTROLLED, false, 0),
  makeZone('lz_red', 'LZ Red', spawnPoints[3].position, 80, null, ZoneState.CONTESTED, false, 0),
  makeZone('opfor_cache', 'Trail Cache', new THREE.Vector3(880, 0, -740), 115, Faction.NVA, ZoneState.OPFOR_CONTROLLED, false, 1),
];

const zoneManager = {
  getAllZones: () => zones,
};

const canvas = document.createElement('canvas');
canvas.id = 'ux-proof-respawn-map-canvas';
canvas.width = MAP_SIZE;
canvas.height = MAP_SIZE;
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.maxWidth = '800px';
canvas.style.maxHeight = '800px';
canvas.style.display = 'block';
canvas.style.objectFit = 'contain';
canvas.style.margin = '0 auto';

let selectedSpawnPointId = 'us_base';

screen.configureSession({
  kind: 'respawn',
  mode: GameMode.OPEN_FRONTIER,
  modeName: 'Open Frontier',
  modeDescription: 'Frontier operations with controlled footholds, helipads, and insertion points.',
  flow: 'frontier',
  mapVariant: 'frontier',
  flowLabel: 'Frontier redeployment',
  headline: 'FRONTIER REDEPLOYMENT',
  subheadline: 'Choose a main base, controlled zone, helipad, or direct insertion point before rejoining the fight.',
  mapTitle: 'FRONTIER MAP - SELECT REDEPLOYMENT',
  selectedSpawnTitle: 'SELECTED REDEPLOYMENT POINT',
  emptySelectionText: 'Select a redeployment point on the map',
  readySelectionText: 'Redeployment route confirmed',
  countdownLabel: 'Redeployment available in',
  readyLabel: 'Ready for redeployment',
  actionLabel: 'DEPLOY',
  secondaryActionLabel: null,
  allowSpawnSelection: true,
  allowLoadoutEditing: true,
  sequenceTitle: 'Redeploy Checklist',
  sequenceSteps: [
    'Choose a base, zone, helipad, or insertion point.',
    'Confirm loadout before returning to the front.',
    'Deploy as soon as the timer clears.',
  ],
});
screen.updateAlliance('BLUFOR', 'US');
screen.updateSpawnOptions(spawnPoints, selectedSpawnPointId);
screen.updateSelectedSpawn('US BASE');
screen.updateTimerDisplay(0, true);
screen.setDecisionTimerStarted(1000);
screen.recordDecisionTime(3100);
screen.setSpawnOptionClickCallback((spawnPointId, spawnPointName) => {
  selectedSpawnPointId = spawnPointId;
  screen.updateSpawnOptions(spawnPoints, selectedSpawnPointId);
  screen.updateSelectedSpawn(spawnPointName);
  renderMap();
});
screen.show();
screen.setDecisionTimerStarted(1000);
screen.recordDecisionTime(3100);

const mapContainer = screen.getMapContainer();
if (mapContainer) {
  mapContainer.innerHTML = '';
  mapContainer.appendChild(canvas);
}
renderMap();

window.__uxProof = {
  ready: true,
  spawnKinds: spawnPoints.map((spawnPoint) => spawnPoint.kind),
  selectedSpawnPointId,
};

function makeZone(id, name, position, radius, owner, state, isHomeBase, ticketBleedRate) {
  return {
    id,
    name,
    position,
    radius,
    height: 0,
    owner,
    state,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase,
    ticketBleedRate,
  };
}

function renderMap() {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  OpenFrontierRespawnMapRenderer.render(ctx, {
    zoomLevel: 1,
    panOffset: { x: 0, y: 0 },
    selectedSpawnPointId,
  }, zoneManager, spawnPoints);
  if (window.__uxProof) {
    window.__uxProof.selectedSpawnPointId = selectedSpawnPointId;
  }
}
`, 'utf-8');

  return { htmlPath, modulePath };
}

async function captureDevice(device: DeviceCase, url: string, outDir: string): Promise<DeviceProof> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });

  try {
    const context = await browser.newContext(device.contextOptions);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('KHR_parallel_shader_compile')) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.stack ?? error));
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        requestErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: START_TIMEOUT_MS });
    await page.waitForFunction(() => Boolean((window as unknown as { __uxProof?: { ready?: boolean } }).__uxProof?.ready), undefined, { timeout: START_TIMEOUT_MS });
    await resetScroll(page);
    await page.waitForTimeout(200);

    const screenshotPath = join(outDir, `${device.id}.png`);
    const mapScreenshotPath = join(outDir, `${device.id}-map.png`);
    const spawnOptionsBasePath = join(outDir, `${device.id}-spawn-options-selected-base.png`);
    const spawnOptionsScreenshotPath = join(outDir, `${device.id}-spawn-options-selected-helipad.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.locator('#respawn-map').screenshot({ path: mapScreenshotPath });
    await page.locator('#respawn-spawn-options-panel').screenshot({ path: spawnOptionsBasePath });
    await page.locator('button[data-spawn-id="evans_helipad"]').click();
    await page.waitForTimeout(150);
    await scrollSpawnOptionsToLowerRows(page);
    await page.waitForTimeout(100);
    await page.locator('#respawn-side-scroll').screenshot({ path: spawnOptionsScreenshotPath });

    const dom = await page.evaluate(() => {
      const root = document.getElementById('respawn-ui');
      const rootStyle = root ? window.getComputedStyle(root) : null;
      const rootRect = root?.getBoundingClientRect();
      const visible = Boolean(root)
        && rootStyle?.display !== 'none'
        && rootStyle?.visibility !== 'hidden'
        && Number(rootRect?.width ?? 0) > 0
        && Number(rootRect?.height ?? 0) > 0;
      const spawnOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('#respawn-spawn-options button[data-spawn-id]'))
        .map((button) => {
          const rect = button.getBoundingClientRect();
          const label = button.querySelector('div:first-child')?.textContent?.trim() ?? '';
          const meta = button.querySelector('div:nth-child(2)')?.textContent?.trim() ?? '';
          return {
            id: button.dataset.spawnId ?? null,
            kind: button.dataset.spawnKind ?? null,
            selectionClass: button.dataset.selectionClass ?? null,
            label,
            meta,
            ariaPressed: button.getAttribute('aria-pressed'),
            rect: {
              width: rect.width,
              height: rect.height,
            },
          };
        });
      const spawnGroups = Array.from(document.querySelectorAll<HTMLDivElement>('#respawn-spawn-options > div'))
        .map((group) => ({
          title: group.firstElementChild?.textContent?.trim() ?? '',
          optionCount: group.querySelectorAll('button[data-spawn-id]').length,
        }));
      const selectedOption = spawnOptions.find((option) => option.ariaPressed === 'true') ?? null;
      const canvas = document.getElementById('ux-proof-respawn-map-canvas') as HTMLCanvasElement | null;
      const text = root?.innerText ?? root?.textContent ?? '';

      return {
        visible,
        text,
        allianceVisible: /Alliance/i.test(text) && /\b(BLUFOR|US)\b/i.test(text),
        selectedSpawn: document.getElementById('selected-spawn-name')?.textContent?.trim() ?? '',
        selectedSpawnId: selectedOption?.id ?? null,
        selectedKind: selectedOption?.kind ?? null,
        decisionMetric: document.getElementById('respawn-decision-time')?.textContent?.trim() ?? '',
        deployButtonEnabled: !(document.getElementById('respawn-button') as HTMLButtonElement | null)?.disabled,
        spawnOptions,
        spawnGroups,
        minimumSpawnOptionHeightPx: spawnOptions.length > 0
          ? Math.min(...spawnOptions.map((option) => option.rect.height))
          : null,
        mapCanvas: {
          width: canvas?.width ?? 0,
          height: canvas?.height ?? 0,
        },
      };
    });

    await context.close();

    return {
      id: device.id,
      label: device.label,
      url: page.url(),
      screenshot: rel(screenshotPath),
      mapScreenshot: rel(mapScreenshotPath),
      spawnOptionsScreenshot: rel(spawnOptionsScreenshotPath),
      screenshots: [
        rel(screenshotPath),
        rel(mapScreenshotPath),
        rel(spawnOptionsBasePath),
        rel(spawnOptionsScreenshotPath),
      ],
      consoleErrors,
      pageErrors,
      requestErrors,
      ...dom,
    };
  } finally {
    await browser.close();
  }
}

async function scrollSpawnOptionsToLowerRows(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sideScroll = document.getElementById('respawn-side-scroll');
    const helipad = document.querySelector<HTMLButtonElement>('button[data-spawn-id="evans_helipad"]');
    if (!(sideScroll instanceof HTMLElement) || !(helipad instanceof HTMLElement)) return;
    sideScroll.scrollTop = Math.max(0, helipad.offsetTop + 12);
  });
}

async function resetScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stage = document.getElementById('respawn-stage');
    if (stage instanceof HTMLElement) stage.scrollTop = 0;
    const sideScroll = document.getElementById('respawn-side-scroll');
    if (sideScroll instanceof HTMLElement) sideScroll.scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

async function main(): Promise<void> {
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const harness = writeHarness(outDir);
  const server = await createViteServer({
    root: process.cwd(),
    logLevel: 'error',
    server: {
      host: HOST,
      port: 0,
      strictPort: false,
    },
    appType: 'mpa',
  });

  await server.listen();

  try {
    const url = proofUrl(server, harness.htmlPath);
    const devices: DeviceProof[] = [];
    for (const deviceCase of DEVICE_CASES) {
      devices.push(await captureDevice(deviceCase, url, outDir));
    }

    const desktop = devices.find((device) => device.id === 'desktop-1440x900');
    const mobile = devices.find((device) => device.id === 'mobile-390x844');
    const browserErrorCount = devices.reduce(
      (total, device) => total + device.consoleErrors.length + device.pageErrors.length + device.requestErrors.length,
      0,
    );
    const requiredKindsVisibleBoth = devices.every((device) => {
      const kinds = new Set(device.spawnOptions.map((option) => option.kind));
      return REQUIRED_KINDS.every((kind) => kinds.has(kind));
    });
    const requiredGroupsVisibleBoth = devices.every((device) => {
      const groupTitles = new Set(device.spawnGroups.map((group) => group.title));
      return REQUIRED_GROUP_TITLES.every((title) => groupTitles.has(title));
    });
    const helipadSelectedBoth = devices.every((device) => device.selectedSpawnId === 'evans_helipad' && device.selectedKind === 'helipad');
    const mapCanvasPresentBoth = devices.every((device) => device.mapCanvas.width === 800 && device.mapCanvas.height === 800);
    const allianceVisibleBoth = devices.every((device) => device.allianceVisible);
    const decisionMetricVisibleBoth = devices.every((device) => /Decision time/i.test(device.decisionMetric));
    const mobileTouchHeightPass = (mobile?.minimumSpawnOptionHeightPx ?? 0) >= 44;

    const checks: ProofCheck[] = [];
    addCheck(
      checks,
      'browser-errors',
      browserErrorCount === 0 ? 'PASS' : 'FAIL',
      browserErrorCount === 0 ? 'No browser console, page, or request errors surfaced during multi-spawn proof.' : 'Browser errors surfaced during multi-spawn proof.',
      `${browserErrorCount} browser errors recorded`,
    );
    addCheck(
      checks,
      'desktop-visible',
      desktop?.visible ? 'PASS' : 'FAIL',
      'Desktop viewport renders the production DeployScreen harness.',
      desktop?.screenshot ?? 'missing desktop screenshot',
    );
    addCheck(
      checks,
      'mobile-visible',
      mobile?.visible ? 'PASS' : 'FAIL',
      'Mobile viewport renders the production DeployScreen harness.',
      mobile?.screenshot ?? 'missing mobile screenshot',
    );
    addCheck(
      checks,
      'required-spawn-kinds',
      requiredKindsVisibleBoth ? 'PASS' : 'FAIL',
      'Base, controlled-zone, helipad, and insertion spawn classes appear on both viewports.',
      devices.map((device) => `${device.id}: ${device.spawnOptions.map((option) => `${option.id}:${option.kind}`).join(', ')}`).join('; '),
    );
    addCheck(
      checks,
      'required-spawn-groups',
      requiredGroupsVisibleBoth ? 'PASS' : 'FAIL',
      'Spawn classes are grouped under textual headings on both viewports.',
      devices.map((device) => `${device.id}: ${device.spawnGroups.map((group) => `${group.title}=${group.optionCount}`).join(', ')}`).join('; '),
    );
    addCheck(
      checks,
      'helipad-selection-state',
      helipadSelectedBoth ? 'PASS' : 'FAIL',
      'Selecting a helipad updates the selected state and aria-pressed state on both viewports.',
      devices.map((device) => `${device.id}: selected=${device.selectedSpawnId}/${device.selectedKind}/${device.selectedSpawn}`).join('; '),
    );
    addCheck(
      checks,
      'alliance-visible',
      allianceVisibleBoth ? 'PASS' : 'FAIL',
      'Alliance appears in the decision header on both viewports.',
      devices.map((device) => `${device.id}: ${device.allianceVisible ? 'alliance visible' : 'missing alliance'}`).join('; '),
    );
    addCheck(
      checks,
      'decision-metric-visible',
      decisionMetricVisibleBoth ? 'PASS' : 'FAIL',
      'Decision-time metric appears on both viewports.',
      devices.map((device) => `${device.id}: ${device.decisionMetric || '(missing)'}`).join('; '),
    );
    addCheck(
      checks,
      'mobile-touch-height',
      mobileTouchHeightPass ? 'PASS' : 'WARN',
      'Mobile spawn-option target height meets the 44px evidence threshold.',
      `minimum mobile spawn option height=${mobile?.minimumSpawnOptionHeightPx ?? 'missing'}px`,
    );
    addCheck(
      checks,
      'map-canvas-proof',
      mapCanvasPresentBoth ? 'PASS' : 'FAIL',
      'Respawn map canvas screenshots were captured with the production map renderer on both viewports.',
      devices.map((device) => `${device.id}: canvas=${device.mapCanvas.width}x${device.mapCanvas.height}, screenshot=${device.mapScreenshot}`).join('; '),
    );

    const fail = checks.filter((check) => check.status === 'FAIL').length;
    const warn = checks.filter((check) => check.status === 'WARN').length;
    const pass = checks.filter((check) => check.status === 'PASS').length;
    const summaryPath = join(outDir, 'ux-respawn-multispawn-proof.json');
    const report: ProofReport = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: OUTPUT_NAME,
      directive: 'UX-1',
      status: statusForCounts(fail, warn),
      summary: {
        cases: devices.length,
        pass,
        warn,
        fail,
        desktopVisible: Boolean(desktop?.visible),
        mobileVisible: Boolean(mobile?.visible),
        requiredKindsVisibleBoth,
        requiredGroupsVisibleBoth,
        browserErrorCount,
      },
      requiredSpawnKinds: REQUIRED_KINDS,
      checks,
      devices,
      currentContract: [
        'The proof uses the production DeployScreen and OpenFrontierRespawnMapRenderer modules through Vite source serving.',
        'The proof forces a UX-1 spawn spread: home base, controlled zone, helipad, and direct insertion.',
        'Screenshots capture the full deploy surface, the respawn map, and the grouped spawn-option panel on desktop and mobile.',
      ],
      nonClaims: [
        'This proof does not prove live Cloudflare Pages production parity.',
        'This proof does not certify human playtest acceptance.',
        'This proof does not close UX-2, UX-3, or UX-4.',
      ],
      files: {
        summary: rel(summaryPath),
        harnessHtml: rel(harness.htmlPath),
        harnessModule: rel(harness.modulePath),
        screenshots: devices.flatMap((device) => device.screenshots),
      },
    };

    writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`Projekt 143 UX respawn multi-spawn proof ${report.status.toUpperCase()}: ${report.files.summary}`);
    console.log(`checks=${pass} pass, ${warn} warn, ${fail} fail screenshots=${report.files.screenshots.join(', ')}`);
    if (report.status === 'fail') process.exit(1);
  } finally {
    await server.close();
  }
}

void main().catch((error) => {
  console.error('projekt-143-ux-respawn-multispawn-proof failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
