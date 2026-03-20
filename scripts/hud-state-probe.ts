#!/usr/bin/env tsx

import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { Socket } from 'net';

const DEV_SERVER_PORT = 9100;
const STEP_TIMEOUT_MS = 90_000;
const ACTION_TIMEOUT_MS = 30_000;

type DeviceProfile = {
  id: string;
  label: string;
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
};

type AssertionResult = {
  label: string;
  status: 'pass' | 'fail';
  details?: string;
};

type HudSnapshot = {
  phase: string | null;
  actorMode: string | null;
  overlay: string | null;
  interaction: string | null;
  scoreboardVisible: string | null;
  inputMode: string | null;
  visibleSelectors: string[];
  pointerEvents: Record<string, string | null>;
};

type CaptureResult = {
  deviceId: string;
  deviceLabel: string;
  step: string;
  screenshotPath: string;
  assertions: AssertionResult[];
  snapshot: HudSnapshot;
};

type ProbeReport = {
  timestamp: string;
  captures: CaptureResult[];
  failedAssertions: number;
  overall: 'pass' | 'fail';
};

const DEVICES: DeviceProfile[] = [
  { id: 'desktop-1920x1080', label: 'Desktop 1920x1080', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { id: 'phone-390x844', label: 'Phone 390x844', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { id: 'phone-844x390', label: 'Phone 844x390', width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
];

const WATCH_SELECTORS = {
  touchInteraction: '#touch-interaction-btn',
  vehicleActionBar: '#vehicle-action-bar',
  touchActionButtons: '#touch-action-buttons',
  touchMenu: '#touch-menu-btn',
  fullMap: '.full-map-container.visible',
  commandOverlay: '.command-mode-overlay',
  settingsModal: '[data-ref="settings-modal"]',
  helicopterWeaponRow: '[data-ref="weaponRow"]',
  helicopterDamage: '[data-ref="damageBar"]',
};

function parseBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberArg(name: string, fallback: number): number {
  const key = `--${name}`;
  const eqArg = process.argv.find(arg => arg.startsWith(`${key}=`));
  if (eqArg) {
    const parsed = Number(eqArg.split('=')[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  const index = process.argv.indexOf(key);
  if (index >= 0 && index + 1 < process.argv.length) {
    const parsed = Number(process.argv[index + 1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => resolve(false));
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

function startDevServer(host: string, port: number): ChildProcess {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --host ${host} --port ${port}`], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: false,
    });
  }
  return spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: false,
  });
}

async function stopDevServer(proc: ChildProcess): Promise<void> {
  if (proc.killed) return;
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  proc.kill('SIGTERM');
  await sleep(1000);
  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
}

function ensureArtifactDir(): string {
  const dir = join(process.cwd(), 'artifacts', 'hud-states');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildContextOptions(device: DeviceProfile): BrowserContextOptions {
  return {
    viewport: { width: device.width, height: device.height },
    isMobile: device.isMobile ?? false,
    hasTouch: device.hasTouch ?? false,
    deviceScaleFactor: device.deviceScaleFactor ?? 1,
  };
}

async function waitForGameplayReady(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__engine), undefined, { timeout: STEP_TIMEOUT_MS });
  await page.evaluate(() => {
    (window as any).__engine.startGameWithMode('open_frontier');
  });
  await page.waitForFunction(() => Boolean((window as any).__engine?.gameStarted), undefined, { timeout: STEP_TIMEOUT_MS });
  await page.waitForSelector('#game-hud-root', { timeout: STEP_TIMEOUT_MS });
  await page.waitForTimeout(3000);
}

async function ensureHelicopters(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const systems = (window as any).__engine?.systemManager;
    return Boolean(systems?.helipadSystem && systems?.helicopterModel && systems?.playerController);
  }, undefined, { timeout: STEP_TIMEOUT_MS });

  await page.evaluate(async () => {
    const systems = (window as any).__engine.systemManager as any;
    await systems.helipadSystem.createAllHelipads?.();
    await systems.helicopterModel.createHelicoptersForHelipads?.();
  });

  await page.waitForFunction(() => {
    const systems = (window as any).__engine?.systemManager as any;
    return (systems?.helicopterModel?.getAllHelicopters?.().length ?? 0) > 0;
  }, undefined, { timeout: STEP_TIMEOUT_MS });
}

async function movePlayerNearHelicopter(page: Page): Promise<void> {
  await ensureHelicopters(page);
  await page.evaluate(() => {
    const systems = (window as any).__engine.systemManager as any;
    const helicopters = systems.helicopterModel.getAllHelicopters();
    const first = helicopters[0];
    if (!first) {
      throw new Error('No helicopters available for HUD state probe.');
    }
    systems.playerController.teleport({
      x: first.position.x + 2,
      y: first.position.y + 1.5,
      z: first.position.z,
    });
    systems.helicopterModel.interaction?.checkPlayerProximity?.();
  });

  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    return root?.dataset.interaction === 'vehicle-enter';
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function openVehicleMap(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLElement>('#vehicle-action-bar > *'))
        .find(el => el.textContent?.trim() === 'MAP');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.keyboard.down('m');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    return root?.dataset.overlay === 'map' && !!document.querySelector('.full-map-container.visible');
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function closeVehicleMap(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      (window as any).__engine.systemManager.fullMapSystem.toggleVisibility();
    });
  } else {
    await page.keyboard.up('m');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    return root?.dataset.overlay === 'none' && !document.querySelector('.full-map-container.visible');
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function openVehicleCommand(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLElement>('#vehicle-action-bar > *'))
        .find(el => el.textContent?.trim() === 'CMD');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.keyboard.press('z');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    const overlay = document.querySelector<HTMLElement>('.command-mode-overlay');
    if (!overlay) return false;
    const style = window.getComputedStyle(overlay);
    const rect = overlay.getBoundingClientRect();
    const visible = overlay.dataset.visible === 'true'
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.95
      && rect.width > 1
      && rect.height > 1;
    return root?.dataset.overlay === 'command' && visible;
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function closeVehicleCommand(page: Page): Promise<void> {
  const closeButton = page.locator('.command-mode-overlay__close');
  if (await closeButton.count() > 0) {
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('.command-mode-overlay__close');
      button?.click();
    });
  } else {
    await page.evaluate(() => {
      const systems = (window as any).__engine.systemManager as any;
      if (systems.commandInputManager.handleCancel?.()) {
        return;
      }
      systems.commandInputManager.closeOverlay?.();
      if (document.getElementById('game-hud-root')?.dataset.overlay === 'command') {
        systems.commandInputManager.toggleCommandMode();
      }
    });
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    const overlay = document.querySelector<HTMLElement>('.command-mode-overlay');
    if (!overlay) return root?.dataset.overlay === 'none';
    const style = window.getComputedStyle(overlay);
    const hidden = overlay.dataset.visible === 'false'
      && (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) < 0.05
      );
    return root?.dataset.overlay === 'none' && hidden;
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function openGameplaySettings(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>('#touch-menu-btn');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    const modal = document.querySelector<HTMLElement>('[data-ref="settings-modal"]');
    if (!modal) return false;
    const style = window.getComputedStyle(modal);
    return root?.dataset.overlay === 'settings' && style.display !== 'none' && style.visibility !== 'hidden';
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function resumeGameplaySettings(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-ref="resume"]');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.locator('[data-ref="resume"]').click();
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    const modal = document.querySelector<HTMLElement>('[data-ref="settings-modal"]');
    const hidden = !modal || window.getComputedStyle(modal).display === 'none' || window.getComputedStyle(modal).visibility === 'hidden';
    return root?.dataset.overlay === 'none' && hidden;
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function enterVehicle(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>('#touch-interaction-btn');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.keyboard.press('KeyE');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    return root?.dataset.actorMode === 'helicopter' && root?.dataset.interaction === 'none';
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function exitVehicle(page: Page, device: DeviceProfile): Promise<void> {
  if (device.hasTouch) {
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLElement>('#vehicle-action-bar > *'))
        .find(el => el.textContent?.trim() === 'EXIT');
      button?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    });
  } else {
    await page.keyboard.press('KeyE');
  }
  await page.waitForFunction(() => {
    const root = document.getElementById('game-hud-root');
    return root?.dataset.actorMode === 'infantry' && root?.dataset.overlay === 'none';
  }, undefined, { timeout: ACTION_TIMEOUT_MS });
}

async function collectSnapshot(page: Page): Promise<HudSnapshot> {
  return page.evaluate((selectors) => {
    const root = document.getElementById('game-hud-root');
    const visibleSelectors: string[] = [];
    const pointerEvents: Record<string, string | null> = {};

    for (const [key, selector] of Object.entries(selectors)) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        pointerEvents[key] = null;
        continue;
      }

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      pointerEvents[key] = style.pointerEvents;

      if (
        style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 1
        && rect.height > 1
      ) {
        visibleSelectors.push(key);
      }
    }

    return {
      phase: root?.dataset.phase ?? null,
      actorMode: root?.dataset.actorMode ?? null,
      overlay: root?.dataset.overlay ?? null,
      interaction: root?.dataset.interaction ?? null,
      scoreboardVisible: root?.dataset.scoreboardVisible ?? null,
      inputMode: root?.dataset.inputMode ?? null,
      visibleSelectors,
      pointerEvents,
    };
  }, WATCH_SELECTORS);
}

function expectEqual(actual: string | null, expected: string, label: string): AssertionResult {
  if (actual === expected) {
    return { label, status: 'pass' };
  }
  return {
    label,
    status: 'fail',
    details: `Expected ${expected}, received ${actual ?? 'null'}`,
  };
}

function expectVisible(snapshot: HudSnapshot, key: string): AssertionResult {
  return snapshot.visibleSelectors.includes(key)
    ? { label: `${key} visible`, status: 'pass' }
    : { label: `${key} visible`, status: 'fail', details: `${key} not visible` };
}

function expectHidden(snapshot: HudSnapshot, key: string): AssertionResult {
  return !snapshot.visibleSelectors.includes(key)
    ? { label: `${key} hidden`, status: 'pass' }
    : { label: `${key} hidden`, status: 'fail', details: `${key} unexpectedly visible` };
}

function expectTouchControlsSuppressed(snapshot: HudSnapshot): AssertionResult {
  const visibleTouchSelectors = ['touchInteraction', 'vehicleActionBar', 'touchActionButtons', 'touchMenu']
    .filter(key => snapshot.visibleSelectors.includes(key));
  const unsuppressed = visibleTouchSelectors.filter(key => snapshot.pointerEvents[key] !== 'none');
  if (unsuppressed.length === 0) {
    return { label: 'touch controls suppressed', status: 'pass' };
  }
  return {
    label: 'touch controls suppressed',
    status: 'fail',
    details: `Unsuppressed while overlay active: ${unsuppressed.join(', ')}`,
  };
}

function expectTouchControlsActive(snapshot: HudSnapshot, key: string): AssertionResult {
  const pe = snapshot.pointerEvents[key];
  if (pe === null || pe === 'none') {
    return {
      label: `${key} accepts pointer input`,
      status: 'fail',
      details: `pointer-events=${pe ?? 'null'}`,
    };
  }
  return { label: `${key} accepts pointer input`, status: 'pass' };
}

async function captureState(
  page: Page,
  artifactDir: string,
  device: DeviceProfile,
  step: string,
  snapshot: HudSnapshot,
  assertions: AssertionResult[],
): Promise<CaptureResult> {
  const screenshotPath = join(artifactDir, `${device.id}-${step}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return {
    deviceId: device.id,
    deviceLabel: device.label,
    step,
    screenshotPath,
    assertions,
    snapshot,
  };
}

async function runDeviceSequence(page: Page, artifactDir: string, device: DeviceProfile): Promise<CaptureResult[]> {
  const captures: CaptureResult[] = [];

  await waitForGameplayReady(page);
  await ensureHelicopters(page);

  let snapshot = await collectSnapshot(page);
  captures.push(await captureState(page, artifactDir, device, '01-infantry', snapshot, [
    expectEqual(snapshot.phase, 'playing', 'phase playing'),
    expectEqual(snapshot.actorMode, 'infantry', 'actorMode infantry'),
    expectEqual(snapshot.overlay, 'none', 'overlay none'),
    device.hasTouch ? expectVisible(snapshot, 'touchActionButtons') : expectHidden(snapshot, 'touchActionButtons'),
    device.hasTouch ? expectVisible(snapshot, 'touchMenu') : expectHidden(snapshot, 'touchMenu'),
  ]));

  await movePlayerNearHelicopter(page);
  snapshot = await collectSnapshot(page);
  captures.push(await captureState(page, artifactDir, device, '02-near-helicopter', snapshot, [
    expectEqual(snapshot.actorMode, 'infantry', 'actorMode infantry near helicopter'),
    expectEqual(snapshot.interaction, 'vehicle-enter', 'interaction prompt active'),
    device.hasTouch ? expectVisible(snapshot, 'touchInteraction') : expectHidden(snapshot, 'touchInteraction'),
  ]));

  await enterVehicle(page, device);
  snapshot = await collectSnapshot(page);
  captures.push(await captureState(page, artifactDir, device, '03-vehicle-entered', snapshot, [
    expectEqual(snapshot.actorMode, 'helicopter', 'actorMode helicopter'),
    expectEqual(snapshot.overlay, 'none', 'overlay none in helicopter'),
    expectEqual(snapshot.interaction, 'none', 'interaction cleared in helicopter'),
    expectVisible(snapshot, 'helicopterDamage'),
    device.hasTouch ? expectVisible(snapshot, 'vehicleActionBar') : expectHidden(snapshot, 'vehicleActionBar'),
    device.hasTouch ? expectHidden(snapshot, 'touchActionButtons') : expectHidden(snapshot, 'touchActionButtons'),
  ]));

  await openVehicleMap(page, device);
  snapshot = await collectSnapshot(page);
  captures.push(await captureState(page, artifactDir, device, '04-map-overlay', snapshot, [
    expectEqual(snapshot.actorMode, 'helicopter', 'actorMode preserved in map'),
    expectEqual(snapshot.overlay, 'map', 'overlay map'),
    expectVisible(snapshot, 'fullMap'),
    ...(device.hasTouch ? [expectTouchControlsSuppressed(snapshot)] : []),
  ]));

  await closeVehicleMap(page, device);

  await openVehicleCommand(page, device);
  snapshot = await collectSnapshot(page);
  captures.push(await captureState(page, artifactDir, device, '05-command-overlay', snapshot, [
    expectEqual(snapshot.actorMode, 'helicopter', 'actorMode preserved in command overlay'),
    expectEqual(snapshot.overlay, 'command', 'overlay command'),
    expectVisible(snapshot, 'commandOverlay'),
    ...(device.hasTouch ? [expectTouchControlsSuppressed(snapshot)] : []),
  ]));

  await closeVehicleCommand(page);

  if (device.hasTouch) {
    await openGameplaySettings(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '06-settings-overlay', snapshot, [
      expectEqual(snapshot.phase, 'paused', 'phase paused'),
      expectEqual(snapshot.overlay, 'settings', 'overlay settings'),
      expectVisible(snapshot, 'settingsModal'),
      expectHidden(snapshot, 'fullMap'),
      expectHidden(snapshot, 'commandOverlay'),
      expectTouchControlsSuppressed(snapshot),
    ]));

    await resumeGameplaySettings(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '07-settings-closed', snapshot, [
      expectEqual(snapshot.phase, 'playing', 'phase restored to playing'),
      expectEqual(snapshot.actorMode, 'helicopter', 'actorMode preserved after resume'),
      expectEqual(snapshot.overlay, 'none', 'overlay cleared after resume'),
      expectTouchControlsActive(snapshot, 'touchMenu'),
    ]));

    await exitVehicle(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '08-vehicle-exited', snapshot, [
      expectEqual(snapshot.actorMode, 'infantry', 'actorMode infantry after exit'),
      expectEqual(snapshot.overlay, 'none', 'overlay none after exit'),
      expectHidden(snapshot, 'vehicleActionBar'),
      expectHidden(snapshot, 'touchInteraction'),
      expectVisible(snapshot, 'touchActionButtons'),
    ]));
  } else {
    await exitVehicle(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '06-vehicle-exited', snapshot, [
      expectEqual(snapshot.actorMode, 'infantry', 'actorMode infantry after exit'),
      expectEqual(snapshot.overlay, 'none', 'overlay none after exit'),
      expectHidden(snapshot, 'vehicleActionBar'),
      expectHidden(snapshot, 'touchInteraction'),
      expectHidden(snapshot, 'touchActionButtons'),
    ]));

    await openGameplaySettings(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '07-settings-overlay', snapshot, [
      expectEqual(snapshot.phase, 'paused', 'phase paused'),
      expectEqual(snapshot.overlay, 'settings', 'overlay settings'),
      expectVisible(snapshot, 'settingsModal'),
      expectHidden(snapshot, 'fullMap'),
      expectHidden(snapshot, 'commandOverlay'),
    ]));

    await resumeGameplaySettings(page, device);
    snapshot = await collectSnapshot(page);
    captures.push(await captureState(page, artifactDir, device, '08-settings-closed', snapshot, [
      expectEqual(snapshot.phase, 'playing', 'phase restored to playing'),
      expectEqual(snapshot.actorMode, 'infantry', 'actorMode preserved after resume'),
      expectEqual(snapshot.overlay, 'none', 'overlay cleared after resume'),
    ]));
  }

  return captures;
}

async function main(): Promise<void> {
  const host = '127.0.0.1';
  const port = parseNumberArg('port', DEV_SERVER_PORT);
  const headed = parseBooleanFlag('headed');
  const artifactDir = ensureArtifactDir();
  const appUrl = `http://${host}:${port}/terror-in-the-jungle/?perf=1`;

  let server: ChildProcess | null = null;
  if (!(await isPortOpen(host, port))) {
    console.log(`Starting dev server on ${host}:${port}...`);
    server = startDevServer(host, port);
    await waitForPort(host, port, 30_000);
    console.log('Dev server ready.');
  } else {
    console.log(`Dev server already running on ${host}:${port}.`);
  }

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });

  const captures: CaptureResult[] = [];

  try {
    for (const device of DEVICES) {
      const context = await browser.newContext(buildContextOptions(device));
      const page = await context.newPage();
      console.log(`Running HUD state probe for ${device.label}`);
      await page.goto(appUrl, { waitUntil: 'commit', timeout: STEP_TIMEOUT_MS });
      captures.push(...await runDeviceSequence(page, artifactDir, device));
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) {
      await stopDevServer(server);
    }
  }

  const failedAssertions = captures.reduce(
    (sum, capture) => sum + capture.assertions.filter(assertion => assertion.status === 'fail').length,
    0,
  );
  const report: ProbeReport = {
    timestamp: new Date().toISOString(),
    captures,
    failedAssertions,
    overall: failedAssertions > 0 ? 'fail' : 'pass',
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(artifactDir, `hud-state-probe-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\nHUD state probe report written to ${reportPath}\n`);
  for (const capture of captures) {
    const failed = capture.assertions.filter(assertion => assertion.status === 'fail');
    console.log(`${capture.deviceLabel} :: ${capture.step} :: ${failed.length === 0 ? 'PASS' : 'FAIL'}`);
    for (const assertion of failed) {
      console.log(`  - ${assertion.label}: ${assertion.details ?? 'failed'}`);
    }
  }

  if (failedAssertions > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('HUD state probe failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
