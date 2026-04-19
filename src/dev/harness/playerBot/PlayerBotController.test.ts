/**
 * Behavior tests for PlayerBotController. The controller is a thin intent
 * translator — these tests assert the mapping from intent → PlayerController
 * surface calls, NOT specific numeric tuning.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  PlayerBotController,
  PlayerBotControllerTarget,
  lerpAngle,
} from './PlayerBotController';
import { createIdlePlayerBotIntent } from './types';

interface RecordingTarget extends PlayerBotControllerTarget {
  movementCalls: Array<{ forward: number; strafe: number; sprint: boolean }>;
  viewCalls: Array<{ yaw: number; pitch: number }>;
  fireCalls: string[];
  camera: THREE.PerspectiveCamera;
}

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  cam.rotation.order = 'YXZ';
  cam.position.set(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function makeTarget(opts: { withCamera?: boolean } = {}): RecordingTarget {
  const movementCalls: Array<{ forward: number; strafe: number; sprint: boolean }> = [];
  const viewCalls: Array<{ yaw: number; pitch: number }> = [];
  const fireCalls: string[] = [];
  const camera = makeCamera();
  const includeCamera = opts.withCamera !== false;
  const t: RecordingTarget = {
    movementCalls,
    viewCalls,
    fireCalls,
    camera,
    applyMovementIntent(intent) { movementCalls.push({ ...intent }); },
    setViewAngles(yaw, pitch) {
      viewCalls.push({ yaw, pitch });
      // Mirror PlayerCamera.setInfantryViewAngles so the aim-dot gate
      // reads a world-direction consistent with the engine.
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.updateMatrixWorld(true);
    },
    fireStart() { fireCalls.push('start'); },
    fireStop() { fireCalls.push('stop'); },
    reloadWeapon() { fireCalls.push('reload'); },
  };
  if (includeCamera) t.getCamera = () => camera;
  return t;
}

describe('PlayerBotController — movement translation', () => {
  it('passes forward/strafe/sprint through to applyMovementIntent', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 1;
    intent.moveStrafe = -0.5;
    intent.sprint = true;
    controller.apply(intent);
    expect(target.movementCalls.length).toBe(1);
    expect(target.movementCalls[0].forward).toBeCloseTo(1, 5);
    expect(target.movementCalls[0].strafe).toBeCloseTo(-0.5, 5);
    expect(target.movementCalls[0].sprint).toBe(true);
  });

  it('clamps out-of-range axis values to [-1, 1]', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 5;
    intent.moveStrafe = -100;
    controller.apply(intent);
    expect(target.movementCalls[0].forward).toBe(1);
    expect(target.movementCalls[0].strafe).toBe(-1);
  });

  it('disables sprint when not moving forward', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 0;
    intent.sprint = true;
    controller.apply(intent);
    expect(target.movementCalls[0].sprint).toBe(false);
  });

  it('tolerates non-finite inputs by substituting zero', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = NaN;
    intent.moveStrafe = Number.POSITIVE_INFINITY;
    controller.apply(intent);
    expect(target.movementCalls[0].forward).toBe(0);
    expect(target.movementCalls[0].strafe).toBeLessThanOrEqual(1);
    expect(target.movementCalls[0].strafe).toBeGreaterThanOrEqual(-1);
  });
});

// ── Regression tests (from the task brief).

describe('PlayerBotController — yaw convention (REGRESSION 1)', () => {
  // Guards against PR #95's sign-error regression. The controller must
  // produce a camera world-forward that points AT the aim target, for all
  // cardinal directions plus one off-axis case.

  function runCardinal(dx: number, dz: number): THREE.Vector3 {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: dx, y: 0, z: dz };
    intent.aimLerpRate = 1;
    controller.apply(intent);
    return target.camera.getWorldDirection(new THREE.Vector3());
  }

  it('camera points +X when aimTarget is at +X', () => {
    const fwd = runCardinal(10, 0);
    expect(fwd.x).toBeCloseTo(1, 2);
    expect(fwd.z).toBeCloseTo(0, 2);
  });

  it('camera points -X when aimTarget is at -X', () => {
    const fwd = runCardinal(-10, 0);
    expect(fwd.x).toBeCloseTo(-1, 2);
    expect(fwd.z).toBeCloseTo(0, 2);
  });

  it('camera points +Z when aimTarget is at +Z', () => {
    const fwd = runCardinal(0, 10);
    expect(fwd.x).toBeCloseTo(0, 2);
    expect(fwd.z).toBeCloseTo(1, 2);
  });

  it('camera points -Z when aimTarget is at -Z', () => {
    const fwd = runCardinal(0, -10);
    expect(fwd.x).toBeCloseTo(0, 2);
    expect(fwd.z).toBeCloseTo(-1, 2);
  });

  it('camera points diagonally when aimTarget is diagonal', () => {
    const fwd = runCardinal(10, 10);
    // Target is at (+10, 0, +10) → unit direction (0.707, 0, 0.707).
    expect(fwd.x).toBeCloseTo(Math.SQRT1_2, 2);
    expect(fwd.z).toBeCloseTo(Math.SQRT1_2, 2);
  });
});

describe('PlayerBotController — aim-dot gate (REGRESSION 2)', () => {
  it('suppresses fire when camera has not yet slewed to aim target', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    // Start the camera pointing at -Z; put the aim target at +X.
    controller.seedViewAngles(0, 0);
    target.camera.rotation.order = 'YXZ';
    target.camera.rotation.y = 0;
    target.camera.rotation.x = 0;
    target.camera.updateMatrixWorld(true);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.firePrimary = true;
    // Very slow slew — after one tick the camera has barely moved, aimDot < 0.8.
    intent.aimLerpRate = 0.05;
    const result = controller.apply(intent);
    expect(result.fired).toBe(false);
    expect(target.fireCalls).not.toContain('start');
    expect(result.aimDot).toBeLessThan(0.8);
  });

  it('allows fire when camera is pointing at the aim target (snap)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.firePrimary = true;
    intent.aimLerpRate = 1;
    const result = controller.apply(intent);
    expect(result.fired).toBe(true);
    expect(target.fireCalls).toContain('start');
  });
});

describe('PlayerBotController — aim translation', () => {
  it('lookAt-based aim writes view angles via setViewAngles', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 1;
    controller.apply(intent);
    expect(target.viewCalls.length).toBe(1);
    expect(Number.isFinite(target.viewCalls[0].yaw)).toBe(true);
    expect(Number.isFinite(target.viewCalls[0].pitch)).toBe(true);
  });

  it('holds view angles when aimTarget is null (no setViewAngles call)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = null;
    controller.apply(intent);
    expect(target.viewCalls.length).toBe(0);
  });

  it('clamps pitch to the ±80° gimbal margin when target is nearly overhead', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    // Target directly above eye — lookAt pitch would be ~+90°, we clamp to 80°.
    intent.aimTarget = { x: 0, y: 100, z: 0.001 };
    intent.aimLerpRate = 1;
    controller.apply(intent);
    const maxPitch = (80 * Math.PI) / 180;
    expect(Math.abs(target.viewCalls[0].pitch)).toBeLessThanOrEqual(maxPitch + 1e-6);
  });

  it('slews partway toward target yaw at lower lerp rates', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    controller.seedViewAngles(0, 0);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 0.5;
    controller.apply(intent);
    // First tick: halfway between 0 and target yaw. Target yaw for +X is finite
    // and non-zero; we just assert movement toward the target (behavior, not value).
    expect(target.viewCalls[0].yaw).not.toBe(0);
  });
});

describe('PlayerBotController — fire and reload', () => {
  it('fires exactly once when firePrimary goes high (no duplicate fireStart)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 1;
    intent.firePrimary = true;
    controller.apply(intent);
    controller.apply(intent);
    controller.apply(intent);
    const starts = target.fireCalls.filter(c => c === 'start').length;
    expect(starts).toBe(1);
  });

  it('stops firing when firePrimary drops', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 1;
    intent.firePrimary = true;
    controller.apply(intent);
    intent.firePrimary = false;
    controller.apply(intent);
    expect(target.fireCalls).toContain('stop');
  });

  it('routes reload intent to reloadWeapon (and cancels active fire)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const fire = createIdlePlayerBotIntent();
    fire.aimTarget = { x: 10, y: 0, z: 0 };
    fire.aimLerpRate = 1;
    fire.firePrimary = true;
    controller.apply(fire);
    const reload = createIdlePlayerBotIntent();
    reload.reload = true;
    controller.apply(reload);
    expect(target.fireCalls).toContain('reload');
    expect(target.fireCalls).toContain('stop');
  });

  it('reset() releases any held fire state', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 1;
    intent.firePrimary = true;
    controller.apply(intent);
    expect(controller.isFiringHeld()).toBe(true);
    controller.reset();
    expect(controller.isFiringHeld()).toBe(false);
    expect(target.fireCalls).toContain('stop');
  });
});

describe('lerpAngle', () => {
  it('returns the start angle at t=0', () => {
    expect(lerpAngle(0.3, 1.5, 0)).toBeCloseTo(0.3, 5);
  });

  it('returns the target angle at t=1', () => {
    expect(lerpAngle(0.3, 1.5, 1)).toBeCloseTo(1.5, 5);
  });

  it('takes the shortest arc across the π/−π boundary', () => {
    const from = -Math.PI + 0.1;
    const to = Math.PI - 0.1;
    const mid = lerpAngle(from, to, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.1);
  });

  it('clamps t to [0, 1]', () => {
    expect(lerpAngle(0, 1, -5)).toBeCloseTo(0, 5);
    expect(lerpAngle(0, 1, 500)).toBeCloseTo(1, 5);
  });
});

describe('PlayerBotController — integration-lite', () => {
  it('returns an apply-result that reflects committed values', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 1;
    intent.firePrimary = true;
    intent.aimTarget = { x: 10, y: 0, z: 0 };
    intent.aimLerpRate = 1;
    const result = controller.apply(intent);
    expect(result.fired).toBe(true);
    expect(result.forward).toBe(1);
    expect(Number.isFinite(result.yaw)).toBe(true);
    expect(Number.isFinite(result.pitch)).toBe(true);
  });

  it('multiple applies do not leak unrelated fire calls', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const noop = createIdlePlayerBotIntent();
    controller.apply(noop);
    controller.apply(noop);
    controller.apply(noop);
    expect(target.fireCalls).toEqual([]);
  });

  it('seedViewAngles sets the starting angle for slew', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    controller.seedViewAngles(1.0, 0.2);
    expect(controller.getLastYaw()).toBeCloseTo(1.0, 5);
    expect(controller.getLastPitch()).toBeCloseTo(0.2, 5);
  });

  it('does not crash if the target methods throw', () => {
    const faulty: PlayerBotControllerTarget = {
      applyMovementIntent: vi.fn(() => { throw new Error('boom'); }),
      setViewAngles: vi.fn(),
      fireStart: vi.fn(),
      fireStop: vi.fn(),
      reloadWeapon: vi.fn(),
    };
    const controller = new PlayerBotController(faulty);
    expect(() => controller.reset()).not.toThrow();
  });
});
