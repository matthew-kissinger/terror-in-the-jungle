/* tslint:disable */
/* eslint-disable */

/**
 * Solve a gravity-only ballistic trajectory; return packed `[time, x, y, z]`
 * quads. The TS-side wrapper rehydrates these into the same
 * `TrajectorySample` object shape the TS reference produces.
 *
 * * `v` — muzzle speed (m/s).
 * * `angle` — launch pitch in radians (positive = above horizontal). Launch
 *   azimuth is the +XZ direction from the origin to (targetX, _, targetZ).
 * * `target_x`, `target_y`, `target_z` — world-space target position. The
 *   integrator terminates the moment the projectile crosses the target's
 *   XZ plane (horizontal travel >= target horizontal distance) or after
 *   `MAX_FLIGHT_SECONDS`, whichever fires first.
 * * `gravity` — vertical acceleration (m/s^2). Pass `-9.8` for the
 *   project's canonical value.
 *
 * Returns a Vec of f32 of length `4 * sample_count`. The trajectory
 * origin is always `(0, 0, 0)` — callers translate into world space as
 * needed.
 */
export function solveTrajectoryFlat(v: number, angle: number, target_x: number, target_y: number, target_z: number, gravity: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly solveTrajectoryFlat: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
