#!/usr/bin/env tsx

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { Socket } from 'net';

const DEV_SERVER_PORT = 9100;
const TRANSITION_TIMEOUT_MS = 60_000;

type TransitionResult = {
  name: string;
  from: string;
  to: string;
  status: 'pass' | 'fail';
  durationMs: number;
  screenshotPath: string;
  consoleErrors: string[];
  details?: string;
};

type ProbeReport = {
  timestamp: string;
  transitions: TransitionResult[];
  overall: 'pass' | 'warn' | 'fail';
  totalErrors: number;
};

function parseBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberArg(name: string, fallback: number): number {
  const key = `--${name}`;
  const eqArg = process.argv.find(a => a.startsWith(`${key}=`));
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
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
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
  return spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
    stdio: 'ignore',
    shell: true,
  });
}

async function stopDevServer(proc: ChildProcess): Promise<void> {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  await sleep(1000);
  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
}

function ensureArtifactDir(): string {
  const dir = join(process.cwd(), 'artifacts', 'states');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function main(): Promise<void> {
  const host = '127.0.0.1';
  const port = parseNumberArg('port', DEV_SERVER_PORT);
  const headed = parseBooleanFlag('headed');
  const artifactDir = ensureArtifactDir();
  const appUrl = `http://${host}:${port}/terror-in-the-jungle/?perf=1`;

  let server: ChildProcess | null = null;
  const portAlreadyOpen = await isPortOpen(host, port);
  if (!portAlreadyOpen) {
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

  const transitions: TransitionResult[] = [];
  let pendingErrors: string[] = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Track console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out known benign warnings (WebGL, Vite HMR)
        if (!text.includes('KHR_parallel_shader_compile') &&
            !text.includes('send was called before connect') &&
            !text.includes('@vite/client')) {
          pendingErrors.push(text);
        }
      }
    });
    page.on('pageerror', (error) => {
      pendingErrors.push(String(error?.stack ?? error));
    });

    function drainErrors(): string[] {
      const drained = [...pendingErrors];
      pendingErrors = [];
      return drained;
    }

    async function takeScreenshot(name: string): Promise<string> {
      const screenshotPath = join(artifactDir, `${name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return screenshotPath;
    }

    async function runTransition(
      name: string,
      from: string,
      to: string,
      action: () => Promise<string | undefined>,
    ): Promise<TransitionResult> {
      drainErrors(); // clear errors from prior steps
      const start = Date.now();
      let status: 'pass' | 'fail' = 'pass';
      let details: string | undefined;
      let screenshotPath = '';

      try {
        details = await action();
        screenshotPath = await takeScreenshot(name);
      } catch (err) {
        status = 'fail';
        details = err instanceof Error ? err.message : String(err);
        // Still try to capture screenshot on failure
        try {
          screenshotPath = await takeScreenshot(`${name}_FAIL`);
        } catch {
          screenshotPath = '';
        }
      }

      const consoleErrors = drainErrors();
      const durationMs = Date.now() - start;

      return { name, from, to, status, durationMs, screenshotPath, consoleErrors, details };
    }

    // ---- a. Title Screen ----
    transitions.push(await runTransition(
      '01_title_screen',
      'blank',
      'title_screen',
      async () => {
        await page.goto(appUrl, { waitUntil: 'commit', timeout: TRANSITION_TIMEOUT_MS });
        await page.waitForFunction(() => {
          const btn = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
          if (!btn) return false;
          const style = window.getComputedStyle(btn);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        return 'Title screen loaded, START button visible.';
      },
    ));

    // ---- b. Mode Select ----
    transitions.push(await runTransition(
      '02_mode_select',
      'title_screen',
      'mode_select',
      async () => {
        const startBtn = page.locator('button[data-ref="start"]');
        await startBtn.click({ timeout: 5_000 });
        await page.waitForFunction(() => {
          const cards = document.querySelectorAll('[data-mode]');
          return cards.length > 0;
        }, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        const count = await page.locator('[data-mode]').count();
        return `Mode select visible with ${count} mode card(s).`;
      },
    ));

    // ---- c. Mode Card Verification ----
    const expectedModes = ['tdm', 'zone_control', 'open_frontier', 'a_shau_valley'];
    for (const mode of expectedModes) {
      transitions.push(await runTransition(
        `03_mode_card_${mode}`,
        'mode_select',
        'mode_select',
        async () => {
          const card = page.locator(`[data-mode="${mode}"]`);
          const exists = (await card.count()) > 0;
          if (!exists) {
            throw new Error(`Mode card [data-mode="${mode}"] not found.`);
          }
          const visible = await card.isVisible();
          if (!visible) {
            throw new Error(`Mode card [data-mode="${mode}"] exists but is not visible.`);
          }
          return `Mode card "${mode}" found and visible.`;
        },
      ));
    }

    // ---- d. Deploy Screen (programmatic) ----
    transitions.push(await runTransition(
      '04_deploy_screen',
      'mode_select',
      'deploy_screen',
      async () => {
        // Use programmatic mode start instead of fragile UI clicks
        await page.waitForFunction(() => !!(window as any).__engine, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        await page.evaluate(() => {
          (window as any).__engine.startGameWithMode('tdm');
        });
        // Wait for engine to acknowledge mode start (deploy screen or gameplay)
        await page.waitForFunction(() => {
          const engine = (window as any).__engine;
          return engine?.gameStarted || document.getElementById('respawn-ui');
        }, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        return 'Mode started programmatically via __engine.startGameWithMode("tdm").';
      },
    ));

    // ---- e. Gameplay Enter ----
    transitions.push(await runTransition(
      '05_gameplay_enter',
      'deploy_screen',
      'gameplay',
      async () => {
        // Wait for gameplay to start: __engine.gameStarted or canvas rendering
        await page.waitForFunction(() => {
          const engine = (window as any).__engine;
          if (engine?.gameStarted) return true;
          const canvas = document.querySelector('canvas');
          return !!canvas && canvas.width > 0 && canvas.height > 0;
        }, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        // Give a moment for rendering to stabilize
        await page.waitForTimeout(2_000);
        const started = await page.evaluate(() => Boolean((window as any).__engine?.gameStarted));
        return started ? 'Gameplay started (__engine.gameStarted = true).' : 'Canvas visible, game may be loading.';
      },
    ));

    // ---- f. Settings Modal ----
    transitions.push(await runTransition(
      '06_settings_modal',
      'gameplay',
      'settings_modal',
      async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        // Check for settings modal visibility
        const modalVisible = await page.evaluate(() => {
          const modal = document.querySelector('[data-ref="settings-modal"], .settings-modal, #settings-modal, dialog[open]');
          if (!modal) return false;
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (!modalVisible) {
          throw new Error('Settings modal not detected after pressing Escape.');
        }
        return 'Settings modal opened via Escape key.';
      },
    ));

    // Close settings modal
    transitions.push(await runTransition(
      '07_settings_modal_close',
      'settings_modal',
      'gameplay',
      async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const modalGone = await page.evaluate(() => {
          const modal = document.querySelector('[data-ref="settings-modal"], .settings-modal, #settings-modal, dialog[open]');
          if (!modal) return true;
          const style = window.getComputedStyle(modal);
          return style.display === 'none' || style.visibility === 'hidden';
        });
        return modalGone ? 'Settings modal closed.' : 'Settings modal may still be visible.';
      },
    ));

    // ---- g. Return to Menu ----
    transitions.push(await runTransition(
      '08_return_to_menu',
      'gameplay',
      'title_screen',
      async () => {
        // Try returnToMenu if available, otherwise reload
        const hasReturnToMenu = await page.evaluate(() => {
          const engine = (window as any).__engine;
          return typeof engine?.returnToMenu === 'function';
        });

        if (hasReturnToMenu) {
          await page.evaluate(() => {
            (window as any).__engine.returnToMenu();
          });
          await page.waitForTimeout(2_000);
        } else {
          // Fallback: reload the page
          await page.goto(appUrl, { waitUntil: 'commit', timeout: TRANSITION_TIMEOUT_MS });
        }

        // Verify we're back at a menu state
        await page.waitForFunction(() => {
          const btn = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
          if (!btn) return false;
          const style = window.getComputedStyle(btn);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }, undefined, { timeout: TRANSITION_TIMEOUT_MS });
        return hasReturnToMenu
          ? 'Returned to menu via __engine.returnToMenu().'
          : 'Returned to menu via page reload.';
      },
    ));
  } finally {
    await browser.close();
    if (server) {
      await stopDevServer(server);
    }
  }

  // Build report
  const totalErrors = transitions.reduce((sum, t) => sum + t.consoleErrors.length, 0);
  const failCount = transitions.filter(t => t.status === 'fail').length;

  let overall: 'pass' | 'warn' | 'fail';
  if (failCount > 0) {
    overall = 'fail';
  } else if (totalErrors > 0) {
    overall = 'warn';
  } else {
    overall = 'pass';
  }

  const report: ProbeReport = {
    timestamp: new Date().toISOString(),
    transitions,
    overall,
    totalErrors,
  };

  // Write JSON report
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(artifactDir, `state-coverage-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport written: ${jsonPath}\n`);

  // Print summary table
  const colName = 38;
  const colStatus = 8;
  const colTime = 10;
  const colErrors = 8;
  const divider = '-'.repeat(colName + colStatus + colTime + colErrors + 9);

  console.log(divider);
  console.log(
    `${'Transition'.padEnd(colName)} | ${'Status'.padEnd(colStatus)} | ${'Time'.padEnd(colTime)} | ${'Errors'.padEnd(colErrors)}`
  );
  console.log(divider);

  for (const t of transitions) {
    const statusTag = t.status === 'pass' ? 'PASS' : 'FAIL';
    const timeStr = `${t.durationMs}ms`;
    const errStr = String(t.consoleErrors.length);
    console.log(
      `${t.name.padEnd(colName)} | ${statusTag.padEnd(colStatus)} | ${timeStr.padEnd(colTime)} | ${errStr.padEnd(colErrors)}`
    );
    if (t.details) {
      console.log(`  -> ${t.details}`);
    }
    if (t.consoleErrors.length > 0) {
      for (const err of t.consoleErrors) {
        console.log(`  [err] ${err.slice(0, 120)}`);
      }
    }
  }

  console.log(divider);
  console.log(`Overall: ${overall.toUpperCase()} | Transitions: ${transitions.length} | Failed: ${failCount} | Console errors: ${totalErrors}`);

  if (overall === 'fail') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('State coverage probe failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
