import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import { TANK_CANNON_CONSTANTS } from './TankCannonProjectile';

/**
 * TS-side wrapper for the Rust->WASM ballistic-solver pilot
 * (`rust/tank-ballistic-solver`). The pilot's job, per
 * `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` §3.5 and
 * `docs/tasks/cycle-vekhikl-4-tank-turret-and-cannon.md`
 * §"tank-ballistic-solver-wasm-pilot (R2)", is data-gathering for
 * future Rust->WASM adoption — not a default for the codebase.
 *
 * Public surface:
 * - `init()`     — load the WASM module. Idempotent. Falls back silently
 *                  in non-browser env or on load failure.
 * - `solve()`    — dispatch to WASM when initialized; fall back to TS.
 * - `solveTS()`  — reference TS implementation, exposed for benchmarking
 *                  + as the explicit fallback target.
 *
 * Both code paths produce numerically equivalent trajectory samples
 * within float tolerance (asserted by the sibling test). The trajectory
 * origin is always `(0, 0, 0)` — callers translate into world space.
 */

export interface TrajectorySample {
  time: number;
  x: number;
  y: number;
  z: number;
}

export type SolverBackend = 'ts' | 'wasm';

/** Integration step (seconds). Mirrors the Rust crate. */
const STEP_SECONDS = 1 / 60;
/** Max integration time (seconds). Hard cap to prevent runaway loops. */
const MAX_FLIGHT_SECONDS = 30;
/** Default gravity (m/s^2). Matches `TANK_CANNON_CONSTANTS.GRAVITY`. */
const DEFAULT_GRAVITY = TANK_CANNON_CONSTANTS.GRAVITY;

// WASM module type — narrow shape we actually consume. We do not import
// the generated .d.ts directly because the WASM directory may be absent
// during early dev / fresh-clone scenarios; the loader uses `await
// import()` so the module is optional at parse time.
interface WasmModule {
  default: (input?: unknown) => Promise<unknown>;
  solveTrajectoryFlat: (
    v: number,
    angle: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    gravity: number,
  ) => Float32Array;
}

let warnedFallback = false;

/**
 * Single hand-rolled ballistic integrator wrapping the WASM crate.
 *
 * Instantiate once per game; call `init()` before the first shot. The
 * `solve()` dispatcher routes to WASM when available and to the TS
 * reference otherwise.
 */
export class TankBallisticSolver {
  private wasm: WasmModule | null = null;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;
  private backend: SolverBackend = 'ts';

  /**
   * Load the WASM module. Idempotent — concurrent callers share the
   * same in-flight promise. Resolves either way; the wrapper degrades
   * to TS on failure rather than throwing.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.initFailed) return Promise.resolve();
    this.initPromise = this.loadWasm();
    return this.initPromise;
  }

  /** Which backend is currently active. Useful for benchmarks + tests. */
  getBackend(): SolverBackend {
    return this.backend;
  }

  /**
   * Solve a gravity-only trajectory. Dispatches to WASM when initialized,
   * else falls back to the TS reference. Both paths produce equivalent
   * sample arrays within float tolerance.
   */
  solve(
    v: number,
    angle: number,
    target: THREE.Vector3,
    gravity: number = DEFAULT_GRAVITY,
  ): TrajectorySample[] {
    if (this.wasm) {
      const flat = this.wasm.solveTrajectoryFlat(v, angle, target.x, target.y, target.z, gravity);
      return hydrateSamples(flat);
    }
    return this.solveTS(v, angle, target, gravity);
  }

  /**
   * Reference TS implementation. The Rust crate is a direct port of this
   * function; both must agree within float tolerance. Used as the
   * benchmark baseline and as the silent fallback when WASM init fails.
   */
  solveTS(
    v: number,
    angle: number,
    target: THREE.Vector3,
    gravity: number = DEFAULT_GRAVITY,
  ): TrajectorySample[] {
    const horizLen = Math.hypot(target.x, target.z);
    let cosAz = 0;
    let sinAz = 1;
    if (horizLen >= 1e-6) {
      cosAz = target.x / horizLen;
      sinAz = target.z / horizLen;
    }

    const cosPitch = Math.cos(angle);
    const sinPitch = Math.sin(angle);

    const vx = v * cosPitch * cosAz;
    let vy = v * sinPitch;
    const vz = v * cosPitch * sinAz;

    let x = 0;
    let y = 0;
    let z = 0;
    let t = 0;

    const samples: TrajectorySample[] = [];
    samples.push({ time: t, x, y, z });

    const targetHoriz = horizLen;

    while (t < MAX_FLIGHT_SECONDS) {
      vy += gravity * STEP_SECONDS;

      x += vx * STEP_SECONDS;
      y += vy * STEP_SECONDS;
      z += vz * STEP_SECONDS;
      t += STEP_SECONDS;

      samples.push({ time: t, x, y, z });

      const horizNow = Math.hypot(x, z);
      if (horizNow >= targetHoriz) break;
    }

    return samples;
  }

  private async loadWasm(): Promise<void> {
    if (typeof WebAssembly === 'undefined' || typeof fetch === 'undefined') {
      this.markFallback('non-browser environment');
      return;
    }
    try {
      // Vite resolves the relative URL + bundles the .wasm asset alongside.
      // `await import()` makes the module optional at parse time; jsdom
      // test envs without fetch fall through cleanly.
      const mod = (await import(
        './wasm/tank-ballistic-solver/tank_ballistic_solver.js'
      )) as unknown as WasmModule;
      await mod.default();
      this.wasm = mod;
      this.backend = 'wasm';
    } catch (err) {
      this.markFallback(err);
    }
  }

  private markFallback(reason: unknown): void {
    this.initFailed = true;
    this.backend = 'ts';
    if (!warnedFallback) {
      warnedFallback = true;
      Logger.warn(
        'combat',
        `TankBallisticSolver WASM init failed; falling back to TS reference: ${String(reason)}`,
      );
    }
  }
}

/**
 * Rehydrate the flat `[time, x, y, z, ...]` Float32Array into the
 * `TrajectorySample` object shape the TS reference returns. Allocates
 * one object per sample; trajectory arrays are short (~30-300 entries),
 * so the cost is bounded.
 */
function hydrateSamples(flat: Float32Array): TrajectorySample[] {
  const count = flat.length >>> 2;
  const out: TrajectorySample[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i << 2;
    out[i] = {
      time: flat[base],
      x: flat[base + 1],
      y: flat[base + 2],
      z: flat[base + 3],
    };
  }
  return out;
}

/**
 * Reset the once-only fallback warning. Tests that exercise the fallback
 * path more than once per process call this so each test emits its own
 * log entry — not strictly required, just nicer for debugging.
 *
 * @internal — tests only.
 */
export function _resetFallbackWarning(): void {
  warnedFallback = false;
}
