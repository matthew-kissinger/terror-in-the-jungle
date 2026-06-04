// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Tank } from '../../systems/vehicle/Tank';
import { TankPlayerAdapter } from '../../systems/vehicle/TankPlayerAdapter';
import { Faction } from '../../systems/combat/types';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * L3 integration test for the M48 Patton player-boarding wire.
 *
 * Sibling task. The factory + F-key router PRs from sibling R1 cycles
 * (`vekhikl-board-controller-factory`, `vekhikl-board-input-router`) are
 * not yet on master at the time this test was authored, so the boarding
 * round-trip is exercised through an inline harness that mirrors what
 * the production factory will do:
 *
 *   onEnter(ctx)  // factory builds adapter + calls VehicleSessionController.enterVehicle(...)
 *   ... drive ... // adapter.update + adapter.stepPhysics (terrain-aware skid-steer)
 *   onExit(ctx)   // factory tears the adapter down on F-press while seated
 *
 * Once the factory PR lands, this test stays valid because it exercises
 * the same adapter surface the factory will call. The factory test is
 * the L2 unit; this L3 proves the real Tank + adapter combo actually
 * seats the player, drives 5 m under skid-steer input, and ejects the
 * player to the side of the hull on exit.
 *
 * NEXT (out of scope this cycle, captured in playtest memo):
 *   - Pilot ↔ gunner seat swap on the M48. The seat plumbing is already
 *     in `Tank.occupy('gunner', …)`; the swap glue lands in
 *     `cycle-vekhikl-seat-swaps`.
 */

function makeFlatTerrain(height = 0): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

function createPlayerState(at = new THREE.Vector3(0, 1, 0)): PlayerState {
  return {
    position: at.clone(),
    velocity: new THREE.Vector3(3, 4, 2),
    speed: 5,
    runSpeed: 10,
    isRunning: true,
    isGrounded: true,
    isJumping: false,
    jumpForce: 12,
    gravity: -25,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
  };
}

/**
 * Stand-in for `PlayerInput`. Only the methods the tank adapter pokes
 * are wired; the rest are spies so an unexpected interaction surfaces.
 *
 * `keyMap` lets each scenario flip just the keys it cares about (W to
 * throttle, A/D to turn, Space to brake) without rebuilding the whole
 * input object.
 */
function makeInput(keyMap: Record<string, boolean> = {}) {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn((k: string) => !!keyMap[k.toLowerCase()]),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
  };
}

function makeCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
  };
}

function makeHudSystem() {
  return {
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  };
}

function makeGameRenderer() {
  return { setCrosshairMode: vi.fn() };
}

function makeTransitionContext(
  playerState: PlayerState,
  vehiclePosition: THREE.Vector3,
  vehicleId = 'm48_patton_alpha',
): VehicleTransitionContext & {
  // Hand back the spy bag so the test can inspect post-call state.
  _input: ReturnType<typeof makeInput>;
  _camera: ReturnType<typeof makeCameraController>;
  _hud: ReturnType<typeof makeHudSystem>;
  _renderer: ReturnType<typeof makeGameRenderer>;
  _setPosition: ReturnType<typeof vi.fn>;
} {
  const input = makeInput();
  const camera = makeCameraController();
  const hud = makeHudSystem();
  const renderer = makeGameRenderer();
  const setPosition = vi.fn((next: THREE.Vector3) => {
    playerState.position.copy(next);
  });
  return {
    playerState,
    vehicleId,
    position: vehiclePosition.clone(),
    setPosition,
    input: input as any,
    cameraController: camera as any,
    hudSystem: hud as any,
    gameRenderer: renderer as any,
    _input: input,
    _camera: camera,
    _hud: hud,
    _renderer: renderer,
    _setPosition: setPosition,
  };
}

function makeUpdateContext(
  input: ReturnType<typeof makeInput>,
  hud: ReturnType<typeof makeHudSystem>,
): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: input as any,
    cameraController: makeCameraController() as any,
    hudSystem: hud as any,
  };
}

/**
 * Spawn a real M48 chassis at a world position. Wraps the construction
 * dance: Object3D with seeded transform, Tank constructor with the
 * default M48 seat table + damage config.
 */
function spawnTank(id: string, at: THREE.Vector3): Tank {
  const object = new THREE.Object3D();
  object.position.copy(at);
  return new Tank(id, object, Faction.US);
}

describe('M48 Patton player boarding end-to-end (pilot seat)', () => {
  let tank: Tank;
  let adapter: TankPlayerAdapter;
  let terrain: ITerrainRuntime;

  beforeEach(() => {
    tank = spawnTank('m48_patton_alpha', new THREE.Vector3(100, 1, 200));
    adapter = new TankPlayerAdapter(tank);
    terrain = makeFlatTerrain(0);
  });

  it('F-press seats the player at the pilot seat (lifts them off their feet, snaps them onto the chassis)', () => {
    const player = createPlayerState(new THREE.Vector3(98, 1, 200));
    const ctx = makeTransitionContext(player, tank.position, tank.id);

    // Adapter starts idle: no vehicle bound yet.
    expect(adapter.getActiveVehicleId()).toBeNull();

    // This is what the factory will do on F-press when proximity resolves
    // to this tank: hand the prebuilt VehicleTransitionContext to the
    // adapter and let it seat the player.
    adapter.onEnter(ctx);

    // Player is now in the M48.
    expect(adapter.getActiveVehicleId()).toBe('m48_patton_alpha');

    // Snapped onto the chassis (not still walking).
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.y).toBe(0);
    expect(player.velocity.z).toBe(0);
    expect(player.isRunning).toBe(false);
    expect(ctx._setPosition).toHaveBeenCalledWith(ctx.position, 'tank.enter');

    // Confirmed at the pilot seat per the adapter contract (gunner swap
    // is a separate cycle).
    expect(adapter.playerSeat).toBe('pilot');
  });

  it('drives 5 m forward under skid-steer input (W throttle) with terrain wired', () => {
    const player = createPlayerState(new THREE.Vector3(98, 1, 200));
    const ctx = makeTransitionContext(player, tank.position, tank.id);
    adapter.onEnter(ctx);

    // Capture the chassis pose at boarding time so we can measure travel
    // against a true baseline (Tank.position is a live reference).
    const startPos = tank.position.clone();

    // Drive forward at full throttle. The adapter's update() reads W
    // from PlayerInput each frame and forwards it as setControls(+1, 0, false).
    // stepPhysics(dt, terrain) integrates the tracked-vehicle sim.
    const inputForward = makeInput({ keyw: true });
    const hud = makeHudSystem();

    // 5 s at 60 fps = 300 steps. The M48's per-track top speed is ~12 m/s,
    // but the tank needs time to accelerate from rest, so we cap the run
    // by distance rather than fixed frame count to avoid flake.
    let frames = 0;
    const MAX_FRAMES = 600; // 10 s upper bound — generous headroom for ramp-up.
    const updateCtx: VehicleUpdateContext = {
      deltaTime: 1 / 60,
      input: inputForward as any,
      cameraController: makeCameraController() as any,
      hudSystem: hud as any,
    };
    while (frames < MAX_FRAMES) {
      adapter.update(updateCtx);
      adapter.stepPhysics(1 / 60, terrain);
      frames += 1;
      if (tank.position.distanceTo(startPos) >= 5) break;
    }

    // Travelled at least 5 m forward from the start position.
    const travelled = tank.position.distanceTo(startPos);
    expect(travelled).toBeGreaterThanOrEqual(5);

    // Forward speed is positive (the chassis is actually moving forward,
    // not just being teleported).
    expect(tank.getForwardSpeed()).toBeGreaterThan(0);
  });

  it('A/D turn inputs forward as skid-steer pivots (not Ackermann steer angles)', () => {
    const player = createPlayerState(new THREE.Vector3(98, 1, 200));
    const ctx = makeTransitionContext(player, tank.position, tank.id);
    adapter.onEnter(ctx);

    // Pure right pivot: D held with no throttle. The adapter forwards
    // setControls(0, +1, false); the physics layer composes
    //   leftCmd  = clamp(0 - 1, -1, +1) = -1  (track reverse)
    //   rightCmd = clamp(0 + 1, -1, +1) = +1  (track forward)
    // which yaws the chassis right around its center (in-place turn).
    const turnRightInput = makeInput({ keyd: true });
    const hud = makeHudSystem();
    const turnRightCtx = makeUpdateContext(turnRightInput, hud);

    const initialQuat = tank.quaternion.clone();
    for (let i = 0; i < 60; i++) {
      adapter.update(turnRightCtx);
      adapter.stepPhysics(1 / 60, terrain);
    }

    // Chassis yaw should have changed (in-place pivot is the load-bearing
    // skid-steer behavior — different from Ackermann's no-yaw-at-rest).
    const yawDelta = tank.quaternion.angleTo(initialQuat);
    expect(yawDelta).toBeGreaterThan(0.01); // > ~0.6° of rotation
  });

  it('F-press while seated exits the player to the side of the hull (not under it)', () => {
    const player = createPlayerState(new THREE.Vector3(98, 1, 200));
    const ctx = makeTransitionContext(player, tank.position, tank.id);
    adapter.onEnter(ctx);

    // Drive a bit so the chassis pose is non-trivial; exit must still
    // land beside the hull, not at the tank's pre-drive position.
    const driveInput = makeInput({ keyw: true });
    const driveCtx = makeUpdateContext(driveInput, makeHudSystem());
    for (let i = 0; i < 120; i++) {
      adapter.update(driveCtx);
      adapter.stepPhysics(1 / 60, terrain);
    }

    // Ask the adapter for an exit plan — this is what the factory's
    // exit path will do before calling VehicleSessionController.exitVehicle.
    const plan = adapter.getExitPlan!(ctx, {});
    expect(plan.canExit).toBe(true);
    expect(plan.position).toBeDefined();

    // The exit position lives on the +X side of the chassis (driver
    // hatch side, rotated by the current chassis yaw). The key invariant
    // is "outside the hull" — at least the configured side-offset away
    // from the chassis center on the horizontal plane.
    const chassisPos = tank.position.clone();
    const exitPos = plan.position!.clone();
    const horizontalOffset = new THREE.Vector2(
      exitPos.x - chassisPos.x,
      exitPos.z - chassisPos.z,
    ).length();
    expect(horizontalOffset).toBeGreaterThanOrEqual(2.5); // M48 hull half-width ~1.8 m; eject lands clear of the skirt

    // Now run the full exit lifecycle. After onExit the adapter must
    // forget the vehicle binding and zero its control state so the
    // unattended chassis doesn't carry the player's last throttle.
    const setControlsSpy = vi.spyOn(tank, 'setControls');
    adapter.onExit(ctx);

    expect(adapter.getActiveVehicleId()).toBeNull();
    expect(adapter.getControls().throttleAxis).toBe(0);
    expect(adapter.getControls().turnAxis).toBe(0);
    expect(adapter.getControls().brake).toBe(false);
    // Adapter braked the chassis on exit so it coasts to a stop under
    // physics drag rather than continuing under the last driver input.
    expect(setControlsSpy).toHaveBeenCalledWith(0, 0, true);

    // Camera + HUD teardown: the adapter restored the infantry angles
    // and cleared the vehicle-HUD bucket, mirroring the helicopter exit
    // shape.
    expect(ctx._camera.restoreInfantryAngles).toHaveBeenCalled();
    expect(ctx._hud.setVehicleContext).toHaveBeenLastCalledWith(null);
  });

  it('a full board → drive → exit round-trip leaves the adapter ready to re-board cleanly', () => {
    const player = createPlayerState(new THREE.Vector3(98, 1, 200));
    const ctx1 = makeTransitionContext(player, tank.position, tank.id);

    // Round 1: board, drive, exit.
    adapter.onEnter(ctx1);
    const driveInput = makeInput({ keyw: true });
    const driveCtx = makeUpdateContext(driveInput, makeHudSystem());
    for (let i = 0; i < 60; i++) {
      adapter.update(driveCtx);
      adapter.stepPhysics(1 / 60, terrain);
    }
    adapter.onExit(ctx1);
    expect(adapter.getActiveVehicleId()).toBeNull();

    // Round 2: board again. The adapter must accept a second boarding
    // without leftover state (control axes still zero, vehicle id
    // re-bound).
    const ctx2 = makeTransitionContext(player, tank.position, tank.id);
    adapter.onEnter(ctx2);
    expect(adapter.getActiveVehicleId()).toBe('m48_patton_alpha');
    expect(adapter.getControls().throttleAxis).toBe(0);
    expect(adapter.getControls().turnAxis).toBe(0);
    expect(adapter.getControls().brake).toBe(false);

    // And a second drive segment still moves the chassis forward.
    const startPos = tank.position.clone();
    for (let i = 0; i < 120; i++) {
      adapter.update(driveCtx);
      adapter.stepPhysics(1 / 60, terrain);
    }
    expect(tank.position.distanceTo(startPos)).toBeGreaterThan(0.5);
  });
});
