import { chromium } from 'playwright';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Socket } from 'node:net';

type Snapshot = {
  label: string;
  capturedAtIso: string;
  diagnostics: any;
};

type CaptureResult = {
  startedAtIso: string;
  port: number;
  snapshots: Snapshot[];
  notes: string[];
};

const PORT = 4173;
const HOST = '127.0.0.1';
const APP_URL = `http://${HOST}:${PORT}/`;
const FIRST_CONTACT_TIMEOUT_MS = 180_000;
const SUSTAINED_MARK_MS = 300_000;
const POLL_MS = 1000;
const SUSTAINED_TIMEOUT_MS = 420_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = new Socket();
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('error', () => resolve(false));
      sock.connect(port, host);
    });
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

function startDevServer(): ChildProcessWithoutNullStreams {
  return spawn('npm', ['run', 'dev', '--', '--host', HOST, '--port', String(PORT)], {
    stdio: 'pipe',
    shell: true
  });
}

async function stopDevServer(proc: ChildProcessWithoutNullStreams): Promise<void> {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  const exited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 3000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!exited && !proc.killed) {
    proc.kill('SIGKILL');
  }
}

async function captureSnapshot(page: import('playwright').Page, label: string): Promise<Snapshot> {
  const diagnostics = await page.evaluate(() => {
    const fn = (window as any).__ashauDiagnostics;
    if (typeof fn !== 'function') return null;
    return fn();
  });
  if (!diagnostics) {
    throw new Error(`Diagnostics unavailable at snapshot "${label}"`);
  }
  return {
    label,
    capturedAtIso: new Date().toISOString(),
    diagnostics
  };
}

async function waitForFirstContactSnapshot(page: import('playwright').Page): Promise<Snapshot> {
  const start = Date.now();
  while (Date.now() - start < FIRST_CONTACT_TIMEOUT_MS) {
    const snap = await captureSnapshot(page, 'first_contact_poll');
    const firstContact = snap.diagnostics?.sessionTelemetry?.firstTacticalContactMs;
    const tactical = snap.diagnostics?.nearbyPlayerContacts?.tacticalOpfor;
    const hasBroadContact = Number(tactical?.r500 ?? 0) > 0 || Number(tactical?.r800 ?? 0) > 0;
    if (typeof firstContact === 'number') {
      return {
        ...snap,
        label: 'first_contact'
      };
    }
    if (hasBroadContact) {
      return {
        ...snap,
        label: 'first_contact_broad'
      };
    }
    await sleep(POLL_MS);
  }
  return captureSnapshot(page, 'first_contact_timeout');
}

async function runCapture(): Promise<CaptureResult> {
  const result: CaptureResult = {
    startedAtIso: new Date().toISOString(),
    port: PORT,
    snapshots: [],
    notes: []
  };

  const devServer = startDevServer();
  let browser: import('playwright').Browser | null = null;

  try {
    console.log('[ashau-capture] starting dev server...');
    await waitForPort(HOST, PORT, 30_000);
    console.log('[ashau-capture] dev server ready');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    await page.goto(APP_URL, { waitUntil: 'commit' });
    console.log('[ashau-capture] page loaded');

    await page.waitForFunction(() => {
      const engine = (window as any).__engine;
      return !!engine && typeof engine.startGameWithMode === 'function';
    }, { timeout: 120_000 });
    console.log('[ashau-capture] engine ready, starting A Shau...');

    await page.evaluate(async () => {
      const engine = (window as any).__engine;
      await engine.startGameWithMode('a_shau_valley');
    });

    await page.waitForFunction(() => typeof (window as any).__ashauDiagnostics === 'function', { timeout: 120_000 });
    console.log('[ashau-capture] diagnostics hook ready');

    // Let initial chunk/materialization settle.
    await sleep(8000);
    console.log('[ashau-capture] capturing mode_start');
    result.snapshots.push(await captureSnapshot(page, 'mode_start'));

    console.log('[ashau-capture] waiting for first_contact...');
    const firstContact = await waitForFirstContactSnapshot(page);
    result.snapshots.push(firstContact);
    console.log(`[ashau-capture] first_contact label=${firstContact.label}`);

    // Force a deterministic death/respawn cycle for the checkpoint.
    await page.evaluate(() => {
      const engine = (window as any).__engine;
      const pr = engine?.systemManager?.playerRespawnManager;
      if (pr?.onPlayerDeath) pr.onPlayerDeath();
      if (pr?.respawnAtBase) pr.respawnAtBase();
    });
    await sleep(3000);
    console.log('[ashau-capture] capturing post_respawn');
    result.snapshots.push(await captureSnapshot(page, 'post_respawn'));

    const startElapsed = Number(result.snapshots[0]?.diagnostics?.sessionTelemetry?.elapsedMs ?? 0);
    const sustainedStart = Date.now();
    console.log('[ashau-capture] waiting for sustained_5m...');
    while (true) {
      if (Date.now() - sustainedStart > SUSTAINED_TIMEOUT_MS) {
        throw new Error('Timed out waiting for sustained_5m checkpoint');
      }
      const snap = await captureSnapshot(page, 'sustained_poll');
      const elapsed = Number(snap.diagnostics?.sessionTelemetry?.elapsedMs ?? 0);
      if (!Number.isFinite(elapsed) || elapsed <= 0) {
        throw new Error(`Invalid elapsedMs during sustained poll: ${String(elapsed)}`);
      }
      if (elapsed >= Math.max(SUSTAINED_MARK_MS, startElapsed + SUSTAINED_MARK_MS)) {
        result.snapshots.push({ ...snap, label: 'sustained_5m' });
        console.log('[ashau-capture] captured sustained_5m');
        break;
      }
      await sleep(POLL_MS);
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
    await stopDevServer(devServer);
  }

  return result;
}

function formatSummaryMarkdown(capture: CaptureResult): string {
  const lines: string[] = [];
  lines.push('## A Shau Diagnostics Capture');
  lines.push('');
  lines.push(`- Captured at: ${capture.startedAtIso}`);
  lines.push(`- URL: ${APP_URL}`);
  lines.push('');

  for (const snap of capture.snapshots) {
    const diag = snap.diagnostics ?? {};
    const session = diag.sessionTelemetry ?? {};
    const tactical = diag.nearbyPlayerContacts?.tacticalOpfor ?? {};
    lines.push(`### ${snap.label}`);
    lines.push(`- timestamp: ${snap.capturedAtIso}`);
    lines.push(`- elapsedMs: ${session.elapsedMs ?? 'n/a'}`);
    lines.push(`- firstTacticalContactMs: ${session.firstTacticalContactMs ?? 'n/a'}`);
    lines.push(`- nearby tactical OPFOR: r250=${tactical.r250 ?? 'n/a'}, r500=${tactical.r500 ?? 'n/a'}, r800=${tactical.r800 ?? 'n/a'}`);
    lines.push(`- respawn stats: deaths=${session.respawn?.deaths ?? 'n/a'}, respawns=${session.respawn?.respawns ?? 'n/a'}`);
    lines.push(`- materialized agents: ${diag.strategic?.materializedAgents ?? 'n/a'}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const capture = await runCapture();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'artifacts', 'ashau-diagnostics', timestamp);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'capture.json'), JSON.stringify(capture, null, 2), 'utf-8');
  writeFileSync(join(outDir, 'summary.md'), formatSummaryMarkdown(capture), 'utf-8');
  console.log(`A Shau diagnostics captured: ${outDir}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to capture A Shau diagnostics:', error);
    process.exit(1);
  });
