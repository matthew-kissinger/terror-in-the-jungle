import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Emplacement } from '../../systems/vehicle/Emplacement';
import { EmplacementPlayerAdapter } from '../../systems/vehicle/EmplacementPlayerAdapter';
import { M2HB_SCENARIO_SPAWNS } from '../../systems/combat/weapons/M2HBEmplacementSpawn';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * L3 integration test for the M2HB emplacement boarding wire
 * (cycle-vekhikl-player-boarding-wire, task
 * vekhikl-board-watercraft-and-emplacement-wire).
 *
 * Scope (per brief): prove the mount path. Slew + fire were wired in
 * cycle-vekhikl-2 (M2HBEmplacementSystem); this cycle only needs to
 * demonstrate that the F-press boarding flow seats the player as the
 * gunner via EmplacementPlayerAdapter.
 *
 * Sibling factory + F-key router PRs are not yet on master, so the
 * boarding round-trip uses an inline harness mirroring m48-board.test.ts.
 */

function createPlayerState(at = new THREE.Vector3(0, 1, 0)): PlayerState {
  return {
    position: at.clone(),
    velocity: new THREE.Vector3(3, 4, 2),
    speed: 5, runSpeed: 10, isRunning: true, isGrounded: true, isJumping: false,
    jumpForce: 12, gravity: -25, isCrouching: false,
    isInHelicopter: false, helicopterId: null,
    isInFixedWing: false, fixedWingId: null,
  };
}

function makeInput(keyMap: Record<string, boolean> = {}) {
  return {
    setInHelicopter: vi.fn(), setFlightVehicleMode: vi.fn(), setInputContext: vi.fn(),
    isKeyPressed: vi.fn((k: string) => !!keyMap[k.toLowerCase()]),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
    relockPointer: vi.fn(),
    isMouseButtonPressed: vi.fn(() => false),
  };
}

function makeCtx(playerState: PlayerState, mountPosition: THREE.Vector3, vehicleId: string) {
  const input = makeInput();
  const camera = { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() };
  const hud = { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() };
  const renderer = { setCrosshairMode: vi.fn() };
  const setPosition = vi.fn((next: THREE.Vector3) => { playerState.position.copy(next); });
  return {
    ctx: {
      playerState,
      vehicleId,
      position: mountPosition.clone(),
      setPosition,
      input: input as any,
      cameraController: camera as any,
      hudSystem: hud as any,
      gameRenderer: renderer as any,
    } as VehicleTransitionContext,
    input, camera, hud, setPosition,
  };
}

function makeUpdateCtx(input: ReturnType<typeof makeInput>): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: input as any,
    cameraController: { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() } as any,
    hudSystem: { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() } as any,
  };
}

/** Spawn a real Emplacement at the OF FOB scenario position. */
function spawnScenarioM2HB(): Emplacement {
  const spawn = M2HB_SCENARIO_SPAWNS.open_frontier;
  const scene = new THREE.Scene();
  const tripod = new THREE.Object3D();
  tripod.position.copy(spawn.position);
  tripod.rotation.y = spawn.initialYaw;
  scene.add(tripod);
  scene.updateMatrixWorld(true);
  return new Emplacement(spawn.vehicleId, tripod, spawn.faction);
}

describe('M2HB emplacement player boarding end-to-end (gunner seat, OF FOB scenario)', () => {
  let emplacement: Emplacement;
  let adapter: EmplacementPlayerAdapter;

  beforeEach(() => {
    emplacement = spawnScenarioM2HB();
    adapter = new EmplacementPlayerAdapter(emplacement);
  });

  it('F-press mounts the player at the gunner seat', () => {
    const player = createPlayerState(new THREE.Vector3(-1020, 1, -740));
    const { ctx, camera, hud, setPosition } = makeCtx(
      player, emplacement.getPosition(), emplacement.vehicleId,
    );

    expect(adapter.getActiveEmplacementId()).toBeNull();
    adapter.onEnter(ctx);

    expect(adapter.getActiveEmplacementId()).toBe(emplacement.vehicleId);
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.y).toBe(0);
    expect(player.velocity.z).toBe(0);
    expect(player.isRunning).toBe(false);
    expect(setPosition).toHaveBeenCalledWith(expect.anything(), 'emplacement.enter');
    expect(hud.setVehicleContext).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'gunner', kind: 'turret' }),
    );
    expect(camera.saveInfantryAngles).toHaveBeenCalled();
  });

  it('the barrel camera frames the mount once the player is seated', () => {
    const player = createPlayerState(new THREE.Vector3(-1020, 1, -740));
    const { ctx } = makeCtx(player, emplacement.getPosition(), emplacement.vehicleId);

    // Before mount: no camera frame available.
    expect(adapter.computeBarrelCamera(new THREE.Vector3(), new THREE.Vector3())).toBe(false);

    adapter.onEnter(ctx);

    const camPos = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    expect(adapter.computeBarrelCamera(camPos, lookAt)).toBe(true);
    // Eye near the mount, look target distinct from the eye.
    expect(camPos.distanceTo(emplacement.getPosition())).toBeLessThan(2.0);
    expect(camPos.distanceTo(lookAt)).toBeGreaterThan(0.5);
  });

  it('left-click is surfaced as a fire request the existing M2HB system can consume', () => {
    // Slew + fire are owned by M2HBEmplacementSystem (cycle-vekhikl-2);
    // this test only proves the boarding adapter exposes the fire intent.
    const player = createPlayerState(new THREE.Vector3(-1020, 1, -740));
    const { ctx } = makeCtx(player, emplacement.getPosition(), emplacement.vehicleId);
    adapter.onEnter(ctx);

    expect(adapter.consumeFireRequest()).toBe(false);

    const fireInput = makeInput();
    fireInput.isMouseButtonPressed = vi.fn((button: number) => button === 0);
    adapter.update(makeUpdateCtx(fireInput));

    expect(adapter.consumeFireRequest()).toBe(true);
    // Latched once per press — a subsequent read without re-pressing returns false.
    expect(adapter.consumeFireRequest()).toBe(false);
  });

  it('F-press while mounted dismounts the player beside the tripod and tears the adapter down', () => {
    const player = createPlayerState(new THREE.Vector3(-1020, 1, -740));
    const { ctx, camera, hud } = makeCtx(
      player, emplacement.getPosition(), emplacement.vehicleId,
    );
    adapter.onEnter(ctx);

    const plan = adapter.getExitPlan!(ctx, {});
    expect(plan.canExit).toBe(true);
    expect(plan.position).toBeDefined();

    // Exit clears the tripod base on the horizontal plane (gunner seat
    // exitOffset). We don't pin a specific magnitude — the invariant is
    // "off the tripod", not the specific offset constant.
    const mountPos = emplacement.getPosition();
    const offset = Math.hypot(plan.position!.x - mountPos.x, plan.position!.z - mountPos.z);
    expect(offset).toBeGreaterThan(0.5);

    adapter.onExit(ctx);

    expect(adapter.getActiveEmplacementId()).toBeNull();
    // Fire intent cleared so the unattended emplacement doesn't fire next frame.
    expect(adapter.consumeFireRequest()).toBe(false);
    expect(camera.restoreInfantryAngles).toHaveBeenCalled();
    expect(hud.setVehicleContext).toHaveBeenLastCalledWith(null);
  });
});
