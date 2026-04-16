/**
 * Shared helper for spawning a Vite server to back the perf/probe harnesses.
 *
 * Two modes are supported:
 *   - 'preview': Runs `vite preview` against `dist/`. Optionally builds first if
 *     `dist/index.html` is missing. This is the representative target —
 *     minified, chunked, tree-shaken code, i.e. what ships to users.
 *   - 'dev': Runs `vite` (dev mode) with HMR. Useful for debugging against
 *     source maps but NOT representative of production, and the dev server's
 *     HMR websocket is known to rot under repeated headless captures ("send
 *     was called before connect").
 *
 * **Current default (2026-04-16):** callers still default to 'dev' because the
 * perf capture driver and the fixed-wing runtime probe rely on
 * `window.__engine` and `window.advanceTime`, both of which are gated by
 * `import.meta.env.DEV` in `src/core/bootstrap.ts`. In a production build
 * those hooks are dead-code-eliminated, so the harness times out waiting for
 * `__engine`. The long-term goal (task C1) is to flip the default to
 * 'preview' once that gate is relaxed to honour `?perf=1` in prod builds.
 * Until then, `--server-mode preview` is available for callers who have
 * unlocked the diagnostics through other means.
 */

import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

export type ServerMode = 'preview' | 'dev';

export interface ServerHandle {
  proc: ChildProcess;
  port: number;
  mode: ServerMode;
}

export interface StartServerOptions {
  mode?: ServerMode;
  port: number;
  host?: string;
  /**
   * Maximum time to wait for the port to become reachable. Defaults to 120s
   * because `vite preview` on Windows can take ~20-40s to initialize against a
   * large `dist/` tree.
   */
  startupTimeoutMs?: number;
  /**
   * Only meaningful in preview mode. If true (default), a missing `dist/` will
   * trigger `npm run build` before launching preview. If false, a missing
   * `dist/` will throw.
   */
  buildIfMissing?: boolean;
  /**
   * Optional hook for logging lifecycle events. Defaults to console.log.
   */
  log?: (msg: string) => void;
  /**
   * Optional hook for streaming stderr from the server subprocess.
   */
  onStderr?: (chunk: string) => void;
  /**
   * stdio configuration for the subprocess. Defaults to 'pipe' so the helper
   * can watch stdout for the "Local:" ready marker. Pass 'ignore' if you only
   * care about the port probe.
   */
  stdio?: 'pipe' | 'ignore';
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const DIST_INDEX = join(process.cwd(), 'dist', 'index.html');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isPortOpen(port: number, host = DEFAULT_HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (open: boolean) => {
      try { socket.destroy(); } catch { /* noop */ }
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host);
  });
}

export async function waitForPort(
  port: number,
  host: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port, host)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

/**
 * Parse a `--mode=<value>` / `--mode <value>` arg out of argv and map it to a
 * ServerMode. Defaults to 'preview'. Any value other than 'dev' resolves to
 * 'preview' so typos fall back to the safe production-like path.
 */
export function parseServerModeArg(argv: string[], fallback: ServerMode = 'preview'): ServerMode {
  const eqArg = argv.find((arg) => arg.startsWith('--mode=') || arg.startsWith('--server-mode='));
  if (eqArg) {
    const value = eqArg.split('=')[1];
    return value === 'dev' ? 'dev' : 'preview';
  }
  const flagIndex = argv.findIndex((arg) => arg === '--server-mode');
  if (flagIndex >= 0 && flagIndex + 1 < argv.length) {
    return argv[flagIndex + 1] === 'dev' ? 'dev' : 'preview';
  }
  return fallback;
}

function runBuildSync(log: (msg: string) => void): void {
  log('Building production bundle (npm run build) before preview...');
  execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
}

function spawnServerProcess(
  mode: ServerMode,
  host: string,
  port: number,
  stdio: 'pipe' | 'ignore'
): ChildProcess {
  const command = mode === 'preview' ? 'preview' : 'dev';
  const args = ['run', command, '--', '--host', host, '--port', String(port), '--strictPort'];
  if (process.platform === 'win32') {
    // On Windows, spawn through cmd.exe so the npm shim resolves correctly without
    // leaving shell:true-style quoting surprises.
    return spawn('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], {
      cwd: process.cwd(),
      stdio,
      shell: false,
    });
  }
  return spawn('npm', args, {
    cwd: process.cwd(),
    stdio,
    shell: false,
  });
}

/**
 * Start a Vite server (preview or dev) and resolve once its port is reachable.
 *
 * Callers own the returned handle and must invoke `stopServer()` in a `finally`
 * block to avoid leaked subprocesses.
 */
export async function startServer(opts: StartServerOptions): Promise<ServerHandle> {
  const mode: ServerMode = opts.mode ?? 'preview';
  const host = opts.host ?? DEFAULT_HOST;
  const timeout = opts.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const buildIfMissing = opts.buildIfMissing ?? true;
  const log = opts.log ?? ((msg) => console.log(msg));
  const stdio: 'pipe' | 'ignore' = opts.stdio ?? 'pipe';

  if (mode === 'preview') {
    if (!existsSync(DIST_INDEX)) {
      if (!buildIfMissing) {
        throw new Error(`dist/index.html not found. Run \`npm run build\` before starting preview.`);
      }
      runBuildSync(log);
      if (!existsSync(DIST_INDEX)) {
        throw new Error('Build completed but dist/index.html is still missing.');
      }
    }
  }

  log(`Starting vite ${mode} on ${host}:${opts.port}`);
  const proc = spawnServerProcess(mode, host, opts.port, stdio);

  if (stdio === 'pipe') {
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      if (opts.onStderr) opts.onStderr(text);
    });
    // Consume stdout so the pipe never blocks. Ready detection is done via the
    // port probe below — reliable on both dev and preview, and avoids parsing
    // Vite's banner format across versions.
    proc.stdout?.on('data', () => {});
  }

  try {
    await waitForPort(opts.port, host, timeout);
  } catch (error) {
    await stopServer({ proc, port: opts.port, mode });
    throw error;
  }
  log(`vite ${mode} ready on ${host}:${opts.port}`);

  return { proc, port: opts.port, mode };
}

/**
 * Stop a server started via `startServer`. Safe to call multiple times and safe
 * to call on an already-exited process.
 */
export async function stopServer(handle: ServerHandle): Promise<void> {
  const { proc } = handle;
  if (!proc.pid || proc.killed) return;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
      setTimeout(resolve, 5000);
    });
    return;
  }

  proc.kill('SIGTERM');
  await sleep(1000);
  if (!proc.killed) proc.kill('SIGKILL');
}

/**
 * Best-effort cleanup of stale listeners on a port. Currently Windows-only —
 * on POSIX, simply pick a different port if something is squatting.
 */
export function cleanupPortListeners(port: number, log: (msg: string) => void = () => {}): void {
  if (process.platform !== 'win32') return;

  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf-8' });
    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 5 && parts[3] === 'LISTENING')
      .map((parts) => Number(parts[4]))
      .filter((pid) => Number.isFinite(pid) && pid > 0);

    for (const pid of new Set(pids)) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
      log(`Cleared stale listener on :${port} (pid=${pid})`);
    }
  } catch {
    // best effort; no active listener is the common case
  }
}
