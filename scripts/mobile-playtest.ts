#!/usr/bin/env tsx

/**
 * Mobile Playtest Harness
 *
 * Automated playtesting on a physical Android device connected via USB ADB.
 * Uses CDP multi-touch injection for trusted PointerEvents + ADB for
 * orientation control and device screenshots.
 *
 * Prerequisites:
 *   - Phone connected via USB with ADB debugging authorized
 *   - Chrome open on the phone
 *   - Dev server accessible from phone (--host flag)
 *
 * Usage:
 *   npm run playtest:mobile                   # full matrix
 *   npm run playtest:mobile -- --landscape-only
 *   npm run playtest:mobile -- --flow-only
 *   npm run playtest:mobile -- --mode open_frontier
 */

import { execSync, spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { ADBController } from './mobile-playtest/adb-controller';
import { CDPBridge } from './mobile-playtest/cdp-bridge';
import { TouchInjector } from './mobile-playtest/touch-injector';
import { ScreenNavigator } from './mobile-playtest/screen-navigator';
import { GameplayScenarios, type ScenarioResult } from './mobile-playtest/gameplay-scenarios';
import {
  createResultsDir,
  writeConsoleLog,
  writeErrorLog,
  writeReport,
  type PlaytestReport,
} from './mobile-playtest/report-writer';

// ---- Config ----

const CDP_PORT = 9222;
const DEV_PORT = 9200;
const PC_IP = '192.168.1.100';
const DEFAULT_MODE = 'zone_control';

type ViewportConfig = {
  id: string;
  label: string;
  orientation: 'portrait' | 'landscape';
  fullscreen: boolean;
};

const FULL_MATRIX: ViewportConfig[] = [
  { id: 'portrait', label: 'Portrait (no fullscreen)', orientation: 'portrait', fullscreen: false },
  { id: 'portrait-fs', label: 'Portrait (fullscreen)', orientation: 'portrait', fullscreen: true },
  { id: 'landscape', label: 'Landscape (no fullscreen)', orientation: 'landscape', fullscreen: false },
  { id: 'landscape-fs', label: 'Landscape (fullscreen)', orientation: 'landscape', fullscreen: true },
];

const LANDSCAPE_ONLY: ViewportConfig[] = [
  { id: 'landscape-fs', label: 'Landscape (fullscreen)', orientation: 'landscape', fullscreen: true },
];

// ---- CLI Args ----

const args = process.argv.slice(2);
const landscapeOnly = args.includes('--landscape-only');
const flowOnly = args.includes('--flow-only');
const modeArg = args.find((_, i, a) => a[i - 1] === '--mode');
const gameMode = modeArg || DEFAULT_MODE;
const configs = landscapeOnly ? LANDSCAPE_ONLY : FULL_MATRIX;

// ---- Dev Server ----

async function startDevServer(): Promise<ChildProcess> {
  console.log(`Starting dev server on port ${DEV_PORT}...`);
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dev server start timeout')), 30_000);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('Local:') || text.includes('localhost')) {
        clearTimeout(timeout);
        child.stdout?.off('data', onData);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('error')) console.error('  dev-server stderr:', text.trim());
    });
    child.on('error', (err) => { clearTimeout(timeout); reject(err); });
    child.on('exit', (code) => {
      if (code) { clearTimeout(timeout); reject(new Error(`Dev server exited with code ${code}`)); }
    });
  });

  console.log(`Dev server ready at http://${PC_IP}:${DEV_PORT}`);
  return child;
}

// ---- Main ----

async function main(): Promise<void> {
  const startTime = Date.now();
  const resultsDir = createResultsDir();
  console.log(`Results: ${resultsDir}`);

  // 1. Setup ADB
  const adb = new ADBController();
  adb.keepAwake();
  adb.wake();

  // 2. Forward CDP
  adb.launchChrome();
  await sleep(1000);
  adb.forwardCDP(CDP_PORT);

  // 3. Start dev server
  let devServer: ChildProcess | null = null;
  try {
    devServer = await startDevServer();
  } catch (e) {
    console.error('Failed to start dev server:', e);
    process.exit(1);
  }

  const reports: PlaytestReport[] = [];

  try {
    for (const config of configs) {
      console.log(`\n=== ${config.label} ===`);
      const configStart = Date.now();
      const screenshotDir = join(resultsDir, 'screenshots');
      let stepNum = 0;

      // Set orientation
      if (config.orientation === 'portrait') {
        adb.setPortrait();
      } else {
        adb.setLandscape();
      }
      await sleep(1000);

      // Connect CDP
      const bridge = new CDPBridge();
      await bridge.connect(CDP_PORT);
      const touch = new TouchInjector(bridge.cdp);
      const nav = new ScreenNavigator(bridge, touch, adb);
      const scenarios = new GameplayScenarios(bridge, touch, nav, adb);

      // Screenshot helper: captures both CDP and ADB screenshots
      const snap = async (label: string): Promise<void> => {
        stepNum++;
        const prefix = String(stepNum).padStart(2, '0');
        const baseName = `${config.id}-${prefix}-${label}`;
        try {
          await bridge.screenshot(join(screenshotDir, `${baseName}-cdp.png`));
        } catch (e) {
          console.warn(`  CDP screenshot failed: ${e}`);
        }
        try {
          adb.screencap(join(screenshotDir, `${baseName}-adb.png`));
        } catch (e) {
          console.warn(`  ADB screencap failed: ${e}`);
        }
      };

      // Navigate to game (perf=1 exposes __engine/__renderer globals for state queries)
      await bridge.navigate(`http://${PC_IP}:${DEV_PORT}?perf=1`);
      await sleep(2000);

      // Run screen flow
      let flowPassed = true;
      try {
        await nav.runFullFlow(gameMode, snap);
        if (config.fullscreen) {
          await nav.requestFullscreen();
          await sleep(1000);
          await snap('fullscreen-active');
        }
      } catch (e) {
        console.error(`  Screen flow failed: ${e}`);
        flowPassed = false;
        await snap('flow-error');
      }

      // Run gameplay scenarios (only if flow succeeded and not flow-only mode)
      let scenarioResults: ScenarioResult[] = [];
      if (flowPassed && !flowOnly) {
        console.log('  Running gameplay scenarios...');
        try {
          scenarioResults = await scenarios.runAll(snap);
          for (const r of scenarioResults) {
            console.log(`    ${r.passed ? 'PASS' : 'FAIL'}: ${r.name} - ${r.details.slice(0, 60)}`);
          }
        } catch (e) {
          console.error(`  Gameplay scenarios crashed: ${e}`);
          await snap('scenarios-error');
        }
      }

      const configDuration = ((Date.now() - configStart) / 1000).toFixed(1);
      reports.push({
        timestamp: new Date().toISOString(),
        device: 'Samsung Galaxy S24 Ultra (SM-S926U)',
        config: config.label,
        duration: `${configDuration}s`,
        screenFlowPassed: flowPassed,
        scenarioResults,
        consoleErrorCount: bridge.getErrors().length,
        pageErrorCount: bridge.getErrors().filter(e => e.type === 'pageerror').length,
      });

      // Write per-config console logs
      writeConsoleLog(resultsDir, bridge.getConsoleLog());
      writeErrorLog(resultsDir, bridge.getErrors());

      await bridge.disconnect();
    }
  } finally {
    // Cleanup
    adb.resetOrientation();
    if (devServer) {
      devServer.kill();
      // Force-kill on Windows
      try {
        execSync(`powershell -Command "Get-Process -Id ${devServer.pid} -ErrorAction SilentlyContinue | Stop-Process -Force"`, { stdio: 'ignore' });
      } catch { /* ok */ }
    }
  }

  // Write final report
  writeReport(resultsDir, reports);

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Playtest complete (${totalDuration}s) ===`);
  console.log(`Results: ${resultsDir}`);

  // Summary
  const totalScenarios = reports.reduce((sum, r) => sum + r.scenarioResults.length, 0);
  const passedScenarios = reports.reduce((sum, r) => sum + r.scenarioResults.filter(s => s.passed).length, 0);
  const totalErrors = reports.reduce((sum, r) => sum + r.consoleErrorCount, 0);
  console.log(`Flow: ${reports.filter(r => r.screenFlowPassed).length}/${reports.length} configs passed`);
  if (totalScenarios > 0) {
    console.log(`Scenarios: ${passedScenarios}/${totalScenarios} passed`);
  }
  if (totalErrors > 0) {
    console.log(`Console errors: ${totalErrors} (see errors.log)`);
  }

  // Exit with failure if anything failed
  const allPassed = reports.every(r => r.screenFlowPassed) &&
    reports.every(r => r.scenarioResults.every(s => s.passed));
  process.exit(allPassed ? 0 : 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Playtest harness crashed:', err);
  process.exit(1);
});
