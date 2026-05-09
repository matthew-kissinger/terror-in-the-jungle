#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Page } from 'playwright';
import { isPortOpen, startServer, stopServer } from './preview-server';

type CheckStatus = 'PASS' | 'WARN' | 'FAIL';
type ProofStatus = 'pass' | 'warn' | 'fail';

interface ProofOptions {
  mode: string;
  port: number;
  headed: boolean;
  forceBuild: boolean;
}

interface ProofCheck {
  id: string;
  status: CheckStatus;
  summary: string;
  evidence: string;
}

interface BrowserIssueLog {
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
}

interface CommandProofState {
  gameMode: string | null;
  gameStarted: boolean;
  hasSquad: boolean;
  currentCommand: string | null;
  commandPoint: { x: number; y: number; z: number } | null;
  commandPosition: { x: number; y: number; z: number } | null;
  markerPresent: boolean;
  markerVisible: boolean;
  markerWorldPosition: { x: number; y: number; z: number } | null;
  markerChildren: number;
  markerPerfCategory: string | null;
  minimapCommandPosition: { x: number; y: number; z: number } | null;
}

interface OverlayProofState {
  overlayVisible: boolean;
  overlayText: string;
  waypointText: string | null;
  tacticalMapVisible: boolean;
  tacticalMapArmed: string | null;
  canvas: {
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
    nonTransparentPixels: number;
    greenMarkerPixels: number;
  } | null;
  latestSquadState: {
    currentCommand: string | null;
    commandPosition: { x: number; y: number; z: number } | null;
  } | null;
}

interface ProofReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-svyaz-ping-command-browser-proof';
  directive: 'SVYAZ-2';
  status: ProofStatus;
  options: ProofOptions;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    browserErrorCount: number;
    gameStarted: boolean;
    hasSquad: boolean;
    commandIssued: boolean;
    inWorldMarkerVisible: boolean;
    tacticalMapMarkerVisible: boolean;
    screenshotsCaptured: boolean;
  };
  checks: ProofCheck[];
  browserIssues: BrowserIssueLog;
  runtime: {
    command: CommandProofState;
    overlay: OverlayProofState;
  };
  currentContract: string[];
  nonClaims: string[];
  files: {
    summary: string;
    screenshots: string[];
  };
}

interface HarnessWindow extends Window {
  __engine?: any;
  advanceTime?: (ms: number) => Promise<void> | void;
}

const OUTPUT_NAME = 'projekt-143-svyaz-ping-command-browser-proof';
const SUMMARY_NAME = 'ping-command-browser-proof.json';
const DEFAULT_MODE = 'open_frontier';
const DEFAULT_PORT = 9143;
const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 180_000;

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
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

function readArg(argv: string[], name: string): string | null {
  const eqArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1] ?? null;
  return null;
}

function parseOptions(argv: string[]): ProofOptions {
  const parsedPort = Number(readArg(argv, '--port') ?? DEFAULT_PORT);
  return {
    mode: readArg(argv, '--mode') ?? DEFAULT_MODE,
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT,
    headed: argv.includes('--headed'),
    forceBuild: !argv.includes('--no-build'),
  };
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (!(await isPortOpen(port, HOST))) {
      return port;
    }
  }
  throw new Error(`No open local port found in range ${preferredPort}-${preferredPort + 19}.`);
}

function addCheck(checks: ProofCheck[], id: string, status: CheckStatus, summary: string, evidence: string): void {
  checks.push({ id, status, summary, evidence });
}

function statusForCounts(fail: number, warn: number): ProofStatus {
  if (fail > 0) return 'fail';
  if (warn > 0) return 'warn';
  return 'pass';
}

async function openHarnessPage(page: Page, port: number): Promise<void> {
  await page.goto(`http://${HOST}:${port}/?perf=1&diag=1&capture=1&uiTransitions=0&logLevel=warn`, {
    waitUntil: 'domcontentloaded',
    timeout: START_TIMEOUT_MS,
  });
  await page.waitForFunction(() => {
    const win = window as HarnessWindow;
    return Boolean(win.__engine?.startGameWithMode && win.__engine?.systemManager);
  }, undefined, { timeout: START_TIMEOUT_MS });
}

async function startMode(page: Page, mode: string): Promise<void> {
  await page.evaluate(async (requestedMode) => {
    const win = window as HarnessWindow;
    if (!win.__engine?.startGameWithMode) {
      throw new Error('window.__engine.startGameWithMode missing');
    }
    await win.__engine.startGameWithMode(requestedMode);
  }, mode);
  await page.waitForFunction(() => {
    const win = window as HarnessWindow;
    return win.__engine?.gameStarted === true
      && win.__engine?.systemManager?.playerSquadController?.getCommandState?.().hasSquad === true;
  }, undefined, { timeout: START_TIMEOUT_MS });
}

async function issueAttackHereCommand(page: Page): Promise<CommandProofState> {
  return page.evaluate(async () => {
    const toVec3 = Function('value', `
      if (!value) return null;
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (![x, y, z].every(Number.isFinite)) return null;
      return {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
      };
    `) as (value: any) => { x: number; y: number; z: number } | null;
    const win = window as HarnessWindow;
    const engine = win.__engine;
    const systems = engine?.systemManager;
    if (!engine || !systems) throw new Error('engine systems missing');

    const controller = systems.playerSquadController;
    const playerController = systems.playerController;
    const camera = playerController?.getCamera?.();
    const playerPosition = playerController?.getPosition?.();
    if (!controller?.issueCommandAtPosition || !camera || !playerPosition?.clone) {
      throw new Error('squad command or player camera path missing');
    }

    const forward = playerPosition.clone();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(0, 0, -1);
    }
    forward.normalize();
    const right = playerPosition.clone();
    right.set(forward.z, 0, -forward.x);
    if (right.lengthSq() < 0.001) {
      right.set(1, 0, 0);
    }
    right.normalize();

    const commandPoint = playerPosition.clone()
      .addScaledVector(forward, 24)
      .addScaledVector(right, 8);
    const terrainY = systems.terrainSystem?.getHeightAt?.(commandPoint.x, commandPoint.z);
    if (Number.isFinite(terrainY)) {
      commandPoint.y = terrainY;
    }

    controller.issueCommandAtPosition('attack_here', commandPoint);

    const renderer = engine.renderer;
    if (renderer?.camera?.clone && renderer?.setOverrideCamera) {
      const proofCamera = renderer.camera.clone();
      proofCamera.position.set(
        commandPoint.x - forward.x * 6,
        commandPoint.y + 12,
        commandPoint.z - forward.z * 6,
      );
      proofCamera.lookAt(commandPoint.x, commandPoint.y + 1.2, commandPoint.z);
      proofCamera.near = 0.1;
      proofCamera.far = Math.max(proofCamera.far ?? 1000, 1200);
      proofCamera.updateProjectionMatrix?.();
      renderer.setOverrideCamera(proofCamera);
    }

    await win.advanceTime?.(1200);
    await new Promise((resolve) => window.setTimeout(resolve, 200));

    const state = controller.getCommandState?.() ?? {};
    const marker = engine.renderer?.scene?.getObjectByName?.('SquadCommandWorldMarker') ?? null;
    const markerWorld = marker?.getWorldPosition && commandPoint.clone
      ? marker.getWorldPosition(commandPoint.clone())
      : null;
    const minimapCommandPosition = systems.minimapSystem?.commandPosition ?? null;

    return {
      gameMode: systems.gameModeManager?.getCurrentMode?.() ?? null,
      gameStarted: engine.gameStarted === true,
      hasSquad: state.hasSquad === true,
      currentCommand: state.currentCommand ?? null,
      commandPoint: toVec3(commandPoint),
      commandPosition: toVec3(state.commandPosition),
      markerPresent: Boolean(marker),
      markerVisible: marker?.visible === true,
      markerWorldPosition: toVec3(markerWorld),
      markerChildren: marker?.children?.length ?? 0,
      markerPerfCategory: marker?.userData?.perfCategory ?? null,
      minimapCommandPosition: toVec3(minimapCommandPosition),
    };
  });
}

async function openCommandOverlay(page: Page): Promise<OverlayProofState> {
  await page.evaluate(async () => {
    const win = window as HarnessWindow;
    const systems = win.__engine?.systemManager;
    if (!systems?.commandInputManager?.toggleCommandMode) {
      throw new Error('commandInputManager.toggleCommandMode missing');
    }
    systems.commandInputManager.toggleCommandMode();
    await win.advanceTime?.(500);
  });
  await page.waitForFunction(() => {
    const overlay = document.querySelector<HTMLElement>('.command-mode-overlay');
    return overlay?.dataset.visible === 'true';
  }, undefined, { timeout: 30_000 });

  return page.evaluate(() => {
    const toVec3 = Function('value', `
      if (!value) return null;
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (![x, y, z].every(Number.isFinite)) return null;
      return {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
      };
    `) as (value: any) => { x: number; y: number; z: number } | null;
    const win = window as HarnessWindow;
    const systems = win.__engine?.systemManager;
    const overlay = document.querySelector<HTMLElement>('.command-mode-overlay');
    const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
    const tacticalMap = document.querySelector<HTMLElement>('.command-tactical-map');
    const tacticalMapStyle = tacticalMap ? window.getComputedStyle(tacticalMap) : null;
    const canvas = document.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    let canvasProof: OverlayProofState['canvas'] = null;

    if (canvas) {
      const context = canvas.getContext('2d');
      const image = context?.getImageData(0, 0, canvas.width, canvas.height);
      let nonTransparentPixels = 0;
      let greenMarkerPixels = 0;
      if (image) {
        for (let index = 0; index < image.data.length; index += 4) {
          const red = image.data[index];
          const green = image.data[index + 1];
          const blue = image.data[index + 2];
          const alpha = image.data[index + 3];
          if (alpha > 0) nonTransparentPixels += 1;
          if (alpha > 80 && green > 110 && red >= 45 && red <= 130 && blue >= 45 && blue <= 130) {
            greenMarkerPixels += 1;
          }
        }
      }
      canvasProof = {
        width: canvas.width,
        height: canvas.height,
        cssWidth: Math.round(canvasRect?.width ?? 0),
        cssHeight: Math.round(canvasRect?.height ?? 0),
        nonTransparentPixels,
        greenMarkerPixels,
      };
    }

    const latestSquadState = systems?.commandInputManager?.latestSquadState ?? null;

    return {
      overlayVisible: Boolean(overlay)
        && overlay?.dataset.visible === 'true'
        && overlayStyle?.display !== 'none'
        && overlayStyle?.visibility !== 'hidden',
      overlayText: overlay?.innerText ?? overlay?.textContent ?? '',
      waypointText: Array.from(document.querySelectorAll<HTMLElement>('.command-mode-overlay__summary-item'))
        .find((element) => /COMMAND POINT|WAYPOINT/i.test(element.innerText))?.innerText ?? null,
      tacticalMapVisible: Boolean(tacticalMap)
        && tacticalMapStyle?.display !== 'none'
        && tacticalMapStyle?.visibility !== 'hidden'
        && Number(canvasRect?.width ?? 0) > 0
        && Number(canvasRect?.height ?? 0) > 0,
      tacticalMapArmed: tacticalMap?.dataset.armed ?? null,
      canvas: canvasProof,
      latestSquadState: latestSquadState
        ? {
          currentCommand: latestSquadState.currentCommand ?? null,
          commandPosition: toVec3(latestSquadState.commandPosition),
        }
        : null,
    };
  });
}

async function runProof(page: Page, port: number, mode: string, outDir: string): Promise<{
  command: CommandProofState;
  overlay: OverlayProofState;
  screenshots: string[];
}> {
  await openHarnessPage(page, port);
  await startMode(page, mode);
  const command = await issueAttackHereCommand(page);

  const inWorldScreenshot = join(outDir, 'svyaz-2-in-world-marker.png');
  await page.screenshot({ path: inWorldScreenshot, fullPage: false, animations: 'disabled', timeout: 90_000 });

  const overlay = await openCommandOverlay(page);
  const overlayScreenshot = join(outDir, 'svyaz-2-command-map-marker.png');
  await page.screenshot({ path: overlayScreenshot, fullPage: false, animations: 'disabled', timeout: 90_000 });

  return {
    command,
    overlay,
    screenshots: [rel(inWorldScreenshot), rel(overlayScreenshot)],
  };
}

function buildChecks(
  command: CommandProofState,
  overlay: OverlayProofState,
  browserIssues: BrowserIssueLog,
  screenshots: string[],
): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const browserErrorCount = browserIssues.consoleErrors.length
    + browserIssues.pageErrors.length
    + browserIssues.requestErrors.length;

  addCheck(
    checks,
    'browser-errors',
    browserErrorCount === 0 ? 'PASS' : 'FAIL',
    browserErrorCount === 0
      ? 'Chromium proof emitted no console, page, or request errors.'
      : 'Chromium proof emitted browser errors.',
    `${browserErrorCount} browser error(s) recorded`,
  );
  addCheck(
    checks,
    'mode-started-with-squad',
    command.gameStarted && command.hasSquad ? 'PASS' : 'FAIL',
    'Open Frontier starts through the harness and assigns a player squad.',
    `gameStarted=${command.gameStarted} hasSquad=${command.hasSquad} mode=${command.gameMode ?? 'missing'}`,
  );
  addCheck(
    checks,
    'attack-here-command-issued',
    command.currentCommand === 'attack_here' && Boolean(command.commandPosition) ? 'PASS' : 'FAIL',
    'The live squad controller retains an attack-here command position.',
    `currentCommand=${command.currentCommand ?? 'missing'} commandPosition=${JSON.stringify(command.commandPosition)}`,
  );
  addCheck(
    checks,
    'in-world-marker-visible',
    command.markerPresent && command.markerVisible && command.markerChildren >= 4 ? 'PASS' : 'FAIL',
    'The live scene contains a visible SquadCommandWorldMarker group for the placed command.',
    `present=${command.markerPresent} visible=${command.markerVisible} children=${command.markerChildren} perfCategory=${command.markerPerfCategory ?? 'missing'}`,
  );
  addCheck(
    checks,
    'in-world-marker-position',
    command.commandPosition && command.markerWorldPosition
      && Math.hypot(
        command.commandPosition.x - command.markerWorldPosition.x,
        command.commandPosition.z - command.markerWorldPosition.z,
      ) < 0.5
      ? 'PASS'
      : 'FAIL',
    'The in-world marker is colocated with the live command position on the X/Z plane.',
    `command=${JSON.stringify(command.commandPosition)} marker=${JSON.stringify(command.markerWorldPosition)}`,
  );
  addCheck(
    checks,
    'minimap-command-position',
    Boolean(command.minimapCommandPosition) ? 'PASS' : 'FAIL',
    'The runtime minimap system received the live command position.',
    JSON.stringify(command.minimapCommandPosition),
  );
  addCheck(
    checks,
    'command-overlay-visible',
    overlay.overlayVisible ? 'PASS' : 'FAIL',
    'The command overlay opens over the running match.',
    `visible=${overlay.overlayVisible} textLength=${overlay.overlayText.length}`,
  );
  addCheck(
    checks,
    'tactical-map-visible',
    overlay.tacticalMapVisible && Boolean(overlay.canvas?.width && overlay.canvas.height) ? 'PASS' : 'FAIL',
    'The tactical command map is visible and backed by a nonzero canvas.',
    JSON.stringify(overlay.canvas),
  );
  addCheck(
    checks,
    'tactical-map-command-marker-pixels',
    (overlay.canvas?.greenMarkerPixels ?? 0) > 0 ? 'PASS' : 'FAIL',
    'The command-map canvas contains green command-marker pixels after the placed order.',
    `greenMarkerPixels=${overlay.canvas?.greenMarkerPixels ?? 0} nonTransparentPixels=${overlay.canvas?.nonTransparentPixels ?? 0}`,
  );
  addCheck(
    checks,
    'overlay-command-state',
    overlay.latestSquadState?.currentCommand === 'attack_here' && Boolean(overlay.latestSquadState.commandPosition)
      ? 'PASS'
      : 'FAIL',
    'The command overlay state exposes the attack-here command and waypoint.',
    `${overlay.waypointText ?? 'missing waypoint'} state=${JSON.stringify(overlay.latestSquadState)}`,
  );
  addCheck(
    checks,
    'screenshots-written',
    screenshots.length === 2 && screenshots.every((path) => existsSync(join(process.cwd(), path))) ? 'PASS' : 'FAIL',
    'In-world and command-map screenshots were written beside the proof JSON.',
    screenshots.join(', '),
  );

  return checks;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const port = await findAvailablePort(options.port);
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const server = await startServer({
    mode: 'perf',
    port,
    forceBuild: options.forceBuild,
    buildIfMissing: true,
    stdio: 'ignore',
    log: (message) => console.log(`[server] ${message}`),
  });

  const browserIssues: BrowserIssueLog = {
    consoleErrors: [],
    pageErrors: [],
    requestErrors: [],
  };

  const browser = await chromium.launch({
    headless: !options.headed,
    args: [
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--disable-dev-shm-usage',
      '--window-size=1280,720',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('KHR_parallel_shader_compile')) {
        browserIssues.consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      browserIssues.pageErrors.push(error.stack ?? error.message);
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        browserIssues.requestErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const proof = await runProof(page, port, options.mode, outDir);
    await context.close().catch(() => {});
    const checks = buildChecks(proof.command, proof.overlay, browserIssues, proof.screenshots);
    const pass = checks.filter((check) => check.status === 'PASS').length;
    const warn = checks.filter((check) => check.status === 'WARN').length;
    const fail = checks.filter((check) => check.status === 'FAIL').length;
    const summaryPath = join(outDir, SUMMARY_NAME);
    const browserErrorCount = browserIssues.consoleErrors.length
      + browserIssues.pageErrors.length
      + browserIssues.requestErrors.length;

    const report: ProofReport = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: OUTPUT_NAME,
      directive: 'SVYAZ-2',
      status: statusForCounts(fail, warn),
      options: {
        ...options,
        port,
      },
      summary: {
        pass,
        warn,
        fail,
        browserErrorCount,
        gameStarted: proof.command.gameStarted,
        hasSquad: proof.command.hasSquad,
        commandIssued: proof.command.currentCommand === 'attack_here' && Boolean(proof.command.commandPosition),
        inWorldMarkerVisible: proof.command.markerPresent && proof.command.markerVisible,
        tacticalMapMarkerVisible: proof.overlay.tacticalMapVisible && (proof.overlay.canvas?.greenMarkerPixels ?? 0) > 0,
        screenshotsCaptured: proof.screenshots.length === 2,
      },
      checks,
      browserIssues,
      runtime: {
        command: proof.command,
        overlay: proof.overlay,
      },
      currentContract: [
        'Perf-harness Chromium starts Open Frontier through window.__engine.',
        'A live attack-here squad command produces a retained command position.',
        'The scene exposes a visible terrain-height-aware SquadCommandWorldMarker at that position.',
        'The command overlay tactical map renders command-marker pixels and records the same command state.',
        'Screenshots are stored beside this JSON packet for KB-DIZAYN and KB-SVYAZ review.',
      ],
      nonClaims: [
        'This proof does not provide KB-DIZAYN art-direction signoff.',
        'This proof does not prove mobile command ergonomics.',
        'This proof does not prove live production deployment parity.',
        'This proof does not implement or accept SVYAZ-3 air-support radio.',
      ],
      files: {
        summary: rel(summaryPath),
        screenshots: proof.screenshots,
      },
    };

    writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`Projekt 143 SVYAZ-2 ping-command browser proof ${report.status.toUpperCase()}: ${report.files.summary}`);
    console.log(`- checks: ${pass} pass, ${warn} warn, ${fail} fail`);
    console.log(`- screenshots: ${report.files.screenshots.join(', ')}`);
    if (report.status !== 'pass') process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

void main().catch((error) => {
  console.error('projekt-143-svyaz-ping-command-browser-proof failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
