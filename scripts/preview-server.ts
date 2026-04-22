/**
 * Shared helper for spawning a Vite server to back the perf/probe harnesses.
 *
 * Three modes are supported (see docs/PERFORMANCE.md "Build targets"):
 *   - 'perf'   (default): Runs `vite preview --outDir dist-perf` against the
 *     perf-harness bundle built via `npm run build:perf`
 *     (VITE_PERF_HARNESS=1). Prod-shape — minified, chunked, tree-shaken —
 *     but includes the diagnostic window globals the harness drives
 *     (`__engine`, `advanceTime`, `__metrics`, etc.). This is the
 *     representative target for perf measurement.
 *   - 'retail': Runs `vite preview` against `dist/`, i.e. the retail build
 *     shipping to Cloudflare Pages. No harness surface — useful for bundle
 *     inspection, but the capture driver will time out waiting for
 *     `window.__engine`.
 *   - 'dev': Runs `vite` (dev mode) with HMR. Useful for debugging against
 *     source maps but NOT representative of production. The dev HMR
 *     websocket is also known to rot under repeated headless captures
 *     ("send was called before connect").
 *
 * `'preview'` is accepted as an alias for `'retail'` for back-compat with the
 * original C1 scope.
 */

import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

export type ServerMode = 'perf' | 'retail' | 'dev';

export interface ServerHandle {
  proc: ChildProcess;
  port: number;
  mode: ServerMode;
}

interface StartServerOptions {
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
   * Only meaningful in preview modes ('perf' / 'retail'). If true (default),
   * a missing build output directory will trigger the matching build
   * (`npm run build:perf` or `npm run build`) before launching preview. If
   * false, a missing output dir will throw.
   */
  buildIfMissing?: boolean;
  /**
   * Only meaningful in preview modes. If true, rebuild the selected output
   * directory even when it already exists. Use this for validation probes that
   * must never run against stale `dist/` or `dist-perf/` contents.
   */
  forceBuild?: boolean;
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
const RETAIL_DIST_INDEX = join(process.cwd(), 'dist', 'index.html');
const PERF_DIST_INDEX = join(process.cwd(), 'dist-perf', 'index.html');

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

async function waitForPort(
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
 * Parse a `--server-mode=<value>` / `--server-mode <value>` arg out of argv
 * and map it to a ServerMode. Any unrecognised value falls back to the
 * provided fallback (default 'perf') so typos resolve to the safe
 * harness-capable path. `'preview'` is accepted as an alias for `'retail'`.
 */
export function parseServerModeArg(argv: string[], fallback: ServerMode = 'perf'): ServerMode {
  const normalise = (raw: string | undefined): ServerMode | null => {
    if (!raw) return null;
    if (raw === 'dev') return 'dev';
    if (raw === 'retail' || raw === 'preview') return 'retail';
    if (raw === 'perf') return 'perf';
    return null;
  };

  const eqArg = argv.find((arg) => arg.startsWith('--mode=') || arg.startsWith('--server-mode='));
  if (eqArg) {
    return normalise(eqArg.split('=')[1]) ?? fallback;
  }
  const flagIndex = argv.findIndex((arg) => arg === '--server-mode');
  if (flagIndex >= 0 && flagIndex + 1 < argv.length) {
    return normalise(argv[flagIndex + 1]) ?? fallback;
  }
  return fallback;
}

function runBuildSync(mode: 'retail' | 'perf', log: (msg: string) => void): void {
  const script = mode === 'perf' ? 'build:perf' : 'build';
  log(`Building ${mode} bundle (npm run ${script}) before preview...`);
  execSync(`npm run ${script}`, { stdio: 'inherit', cwd: process.cwd() });
}

function spawnServerProcess(
  mode: ServerMode,
  host: string,
  port: number,
  stdio: 'pipe' | 'ignore'
): ChildProcess {
  const npmScript = mode === 'perf' ? 'preview:perf' : mode === 'retail' ? 'preview' : 'dev';
  const args = ['run', npmScript, '--', '--host', host, '--port', String(port), '--strictPort'];
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
  const mode: ServerMode = opts.mode ?? 'perf';
  const host = opts.host ?? DEFAULT_HOST;
  const timeout = opts.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const buildIfMissing = opts.buildIfMissing ?? true;
  const log = opts.log ?? ((msg) => console.log(msg));
  const stdio: 'pipe' | 'ignore' = opts.stdio ?? 'pipe';

  if (mode === 'perf' || mode === 'retail') {
    const indexPath = mode === 'perf' ? PERF_DIST_INDEX : RETAIL_DIST_INDEX;
    const outDirLabel = mode === 'perf' ? 'dist-perf' : 'dist';
    const buildScript = mode === 'perf' ? 'npm run build:perf' : 'npm run build';
    if (opts.forceBuild) {
      runBuildSync(mode, log);
    } else if (!existsSync(indexPath)) {
      if (!buildIfMissing) {
        throw new Error(`${outDirLabel}/index.html not found. Run \`${buildScript}\` before starting preview.`);
      }
      runBuildSync(mode, log);
      if (!existsSync(indexPath)) {
        throw new Error(`Build completed but ${outDirLabel}/index.html is still missing.`);
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
