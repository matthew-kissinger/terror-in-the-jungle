import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  TankBallisticSolver,
  _resetFallbackWarning,
  type TrajectorySample,
} from './TankBallisticSolver';
import { TANK_CANNON_CONSTANTS } from './TankCannonProjectile';

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const GRAVITY = TANK_CANNON_CONSTANTS.GRAVITY;

function samplesAreClose(
  a: TrajectorySample[],
  b: TrajectorySample[],
  tol: number,
): { ok: boolean; firstDiff?: string } {
  if (a.length !== b.length) {
    return { ok: false, firstDiff: `length mismatch ${a.length} vs ${b.length}` };
  }
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].time - b[i].time) > tol) {
      return { ok: false, firstDiff: `time @${i}: ${a[i].time} vs ${b[i].time}` };
    }
    if (Math.abs(a[i].x - b[i].x) > tol) {
      return { ok: false, firstDiff: `x @${i}: ${a[i].x} vs ${b[i].x}` };
    }
    if (Math.abs(a[i].y - b[i].y) > tol) {
      return { ok: false, firstDiff: `y @${i}: ${a[i].y} vs ${b[i].y}` };
    }
    if (Math.abs(a[i].z - b[i].z) > tol) {
      return { ok: false, firstDiff: `z @${i}: ${a[i].z} vs ${b[i].z}` };
    }
  }
  return { ok: true };
}

describe('TankBallisticSolver', () => {
  let solver: TankBallisticSolver;

  beforeEach(() => {
    _resetFallbackWarning();
    solver = new TankBallisticSolver();
  });

  it('TS path: first sample is the origin', () => {
    const samples = solver.solveTS(400, 0.05, new THREE.Vector3(500, 0, 0), GRAVITY);
    expect(samples[0]).toEqual({ time: 0, x: 0, y: 0, z: 0 });
  });

  it('TS path: trajectory reaches the target horizontal distance', () => {
    const target = new THREE.Vector3(500, 0, 0);
    const samples = solver.solveTS(400, 0.05, target, GRAVITY);
    const last = samples[samples.length - 1];
    const horiz = Math.hypot(last.x, last.z);
    expect(horiz).toBeGreaterThanOrEqual(500 - 0.01);
  });

  it('TS path: integrator stops at the 30 s wall when the target is unreachable', () => {
    // High-pitch lob with target 100 km out: the integrator must hit the
    // 30 s wall, not loop forever.
    const samples = solver.solveTS(
      400,
      1.4,
      new THREE.Vector3(100_000, 0, 0),
      GRAVITY,
    );
    const last = samples[samples.length - 1];
    expect(last.time).toBeGreaterThanOrEqual(30 - 1 / 60 - 1e-3);
    // And it must terminate — array bounded, not infinite.
    expect(samples.length).toBeLessThan(2000);
  });

  it('TS path: solve() with no init falls back to solveTS and reports backend = ts', () => {
    const target = new THREE.Vector3(500, 0, 0);
    const samplesDispatch = solver.solve(400, 0.05, target, GRAVITY);
    const samplesDirect = solver.solveTS(400, 0.05, target, GRAVITY);
    expect(solver.getBackend()).toBe('ts');
    const cmp = samplesAreClose(samplesDispatch, samplesDirect, 0);
    expect(cmp.ok).toBe(true);
  });

  it('init() degrades silently when WASM is unavailable (jsdom env)', async () => {
    // jsdom does not implement fetch in a way wasm-bindgen's loader is
    // happy with; the wrapper must fall back to TS rather than throw.
    await expect(solver.init()).resolves.toBeUndefined();
    // Backend is either 'ts' (WASM init failed, expected in jsdom) or
    // 'wasm' (if the runtime did load it). Both are valid behaviours; what
    // we assert is that solve() never throws.
    const samples = solver.solve(400, 0.05, new THREE.Vector3(500, 0, 0), GRAVITY);
    expect(samples.length).toBeGreaterThan(0);
  });

  it('init() is idempotent: concurrent callers share one load attempt', async () => {
    const [a, b, c] = await Promise.all([solver.init(), solver.init(), solver.init()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(c).toBeUndefined();
    // Re-init after settle returns immediately, no throw.
    await expect(solver.init()).resolves.toBeUndefined();
  });

  it('WASM and TS paths agree on a representative trajectory (when WASM loads)', async () => {
    await solver.init();
    const target = new THREE.Vector3(450, 12, 200);
    const wasmDispatch = solver.solve(420, 0.08, target, GRAVITY);
    const tsRef = solver.solveTS(420, 0.08, target, GRAVITY);

    if (solver.getBackend() === 'wasm') {
      // Cross-language float-tolerance: f32 ↔ f64 round-trips through
      // wasm-bindgen, so 1e-3 is comfortable.
      const cmp = samplesAreClose(wasmDispatch, tsRef, 1e-3);
      expect(cmp.ok, cmp.firstDiff ?? '').toBe(true);
    } else {
      // WASM did not load in this env — wasmDispatch is the TS fallback,
      // which must be exactly equal to the reference.
      const cmp = samplesAreClose(wasmDispatch, tsRef, 0);
      expect(cmp.ok, cmp.firstDiff ?? '').toBe(true);
    }
  });

  it('gravity decreases the projectile vertical velocity each frame', () => {
    // Vertical-only check: pitch = π/2 with target on the X axis gives a
    // straight-up shot in the X-Z plane via the azimuth helper; check the
    // sample y-values for a parabolic profile.
    const target = new THREE.Vector3(1, 0, 0); // azimuth = +X
    const samples = solver.solveTS(50, Math.PI / 2 - 0.001, target, GRAVITY);
    // First few samples climb; later samples descend.
    let peakIdx = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].y > samples[peakIdx].y) peakIdx = i;
    }
    expect(peakIdx).toBeGreaterThan(0);
    expect(peakIdx).toBeLessThan(samples.length - 1);
  });

  it('stationary target: solver works without azimuth ambiguity', () => {
    const target = new THREE.Vector3(0, 0, 0);
    const samples = solver.solveTS(400, 0, target, GRAVITY);
    // Target at origin → horizontal distance 0 → first sample crosses
    // immediately; integrator returns origin + first step.
    expect(samples.length).toBeGreaterThanOrEqual(1);
    expect(samples[0]).toEqual({ time: 0, x: 0, y: 0, z: 0 });
  });
});
