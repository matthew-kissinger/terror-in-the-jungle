import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TankPlayerAdapter } from './TankPlayerAdapter';
import { Tank } from './Tank';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

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

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(5, 10, 15),
    speed: 10,
    runSpeed: 20,
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

function createMockHudSystem() {
  return {
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  };
}

function createTank(
  id = 'm48_1',
  position: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): Tank {
  const object = new THREE.Object3D();
  object.position.copy(position);
  return new Tank(id, object, Faction.US);
}

function createTransitionContext(
  playerState: PlayerState,
  vehicleId = 'm48_1',
): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(40, 5, 60),
    setPosition: vi.fn(),
    input: {
      setInHelicopter: vi.fn(),
      setFlightVehicleMode: vi.fn(),
      setInputContext: vi.fn(),
      isKeyPressed: vi.fn(() => false),
      getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
      clearMouseMovement: vi.fn(),
      getIsPointerLocked: vi.fn(() => false),
      getTouchControls: vi.fn(() => null),
      getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
      relockPointer: vi.fn(),
    } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
    } as any,
    hudSystem: createMockHudSystem() as any,
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

function createUpdateContext(
  input: VehicleTransitionContext['input'],
  hudSystem: VehicleTransitionContext['hudSystem'],
): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
    } as any,
    hudSystem,
  };
}

describe('TankPlayerAdapter', () => {
  let adapter: TankPlayerAdapter;
  let tank: Tank;

  beforeEach(() => {
    tank = createTank();
    adapter = new TankPlayerAdapter(tank);
  });

  it('identifies itself as a tank adapter on the gameplay input context with pilot seat', () => {
    expect(adapter.vehicleType).toBe('tank');
    expect(adapter.inputContext).toBe('gameplay');
    expect(adapter.playerSeat).toBe('pilot');
  });

  describe('entering the tank (F enter)', () => {
    it('takes the player off their feet and into the driver hatch', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer sprinting around.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped onto the chassis.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'tank.enter');
      // Camera remembers infantry angles for clean restore on exit.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Any leftover flight bookkeeping cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we are in a ground vehicle (tank reuses the bucket for now).
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ hudVariant: 'groundVehicle', role: 'pilot' }),
      );
    });

    it('records the active vehicle id for the session', () => {
      tank = createTank('m48_alpha');
      adapter = new TankPlayerAdapter(tank);
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm48_alpha');
      adapter.onEnter(ctx);

      expect(adapter.getActiveVehicleId()).toBe('m48_alpha');
    });
  });

  describe('exiting the tank (F exit)', () => {
    it('puts the player back on their feet (restores camera, clears HUD)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(adapter.getActiveVehicleId()).toBeNull();
    });

    it('parks the chassis on exit so the tank coasts to a stop instead of carrying last throttle', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Hold W so the tank is under positive throttle at exit time.
      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.onExit(ctx);

      // Exit issues a zeroed, braked command so the unattended chassis
      // doesn't carry the player's last throttle.
      expect(setControlsSpy).toHaveBeenCalledWith(0, 0, true);
    });

    it('falls back to ejecting on the positive-X side of the chassis (yaw-rotated)', () => {
      const physicsAt = new THREE.Vector3(100, 3, 200);
      tank = createTank('m48_drop', physicsAt);
      adapter = new TankPlayerAdapter(tank);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // Identity quaternion + 3.0 m side step => x = 103.
      expect(plan.position!.x).toBeCloseTo(103, 4);
      expect(plan.position!.z).toBeCloseTo(200, 4);
    });

    it('rotates the exit offset with the tank yaw (player does not land in engine deck after turn)', () => {
      const physicsAt = new THREE.Vector3(0, 1, 0);
      tank = createTank('m48_yaw', physicsAt);
      // Rotate the chassis 90 degrees CCW about Y so chassis-+X points to world-+Z.
      tank.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      adapter = new TankPlayerAdapter(tank);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      // After 90° yaw about +Y, chassis-+X rotates from world-+X to
      // world-(-Z) (right-hand rule). The key invariant is that the
      // exit offset is no longer along world-+X — it follows the chassis.
      expect(Math.abs(plan.position!.z)).toBeCloseTo(3, 4);
      expect(Math.abs(plan.position!.x)).toBeLessThan(1e-3);
    });
  });

  describe('skid-steer input forwarding', () => {
    it('does nothing when no vehicle is active', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).not.toHaveBeenCalled();
    });

    it('W=1 pushes the chassis forward via setControls(+1, 0, false)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(1, 0, false);
      expect(adapter.getControls().throttleAxis).toBe(1);
      expect(adapter.getControls().turnAxis).toBe(0);
    });

    it('S=1 drives the chassis in reverse via setControls(-1, 0, false)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keys',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(-1, 0, false);
    });

    it('D=1 issues a pure right turn via setControls(0, +1, false) — track-differential pivot, not a steer angle', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyd',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      // Crucially: turn=+1 with throttle=0 (in-place pivot). NOT a steer
      // angle scaled by some max-radian value — this is the key distinction
      // from the wheeled chassis adapter.
      expect(setControlsSpy).toHaveBeenCalledWith(0, 1, false);
    });

    it('A=1 issues a pure left turn via setControls(0, -1, false)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keya',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(0, -1, false);
    });

    it('W+D combined produces a forward-right arc (throttle=+1, turn=+1) — saturates one track, idles the other', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw' || k === 'keyd',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      // Both axes forwarded at +1; the physics layer composes
      //   leftCmd  = clamp(+1 - +1, -1, +1) = 0  (track idle)
      //   rightCmd = clamp(+1 + +1, -1, +1) = +1 (track saturated forward)
      // which is the differential-drive turn-while-driving signature.
      expect(setControlsSpy).toHaveBeenCalledWith(1, 1, false);
    });

    it('Space (held) latches brake into setControls(_, _, true)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'space',
      );
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(0, 0, true);
      expect(adapter.getControls().brake).toBe(true);
    });
  });

  describe('touch input forwarding', () => {
    it('forwards joystick magnitudes as (throttle, turn) with deadzone applied', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getTouchControls as ReturnType<typeof vi.fn>).mockReturnValue({});
      (ctx.input.getTouchMovementVector as ReturnType<typeof vi.fn>).mockReturnValue({
        x: 0.7, // right swing → turn right
        z: -0.8, // forward (negative z = forward in touch convention)
      });
      const setControlsSpy = vi.spyOn(tank, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      const call = setControlsSpy.mock.calls[0];
      expect(call[0]).toBeCloseTo(0.8, 4); // throttle = -z
      expect(call[1]).toBeCloseTo(0.7, 4); // turn = x
      expect(call[2]).toBe(false);
    });
  });

  describe('control state reset', () => {
    it('clears throttle/turn/brake on resetControlState', () => {
      adapter.getControls(); // accessor must not blow up at idle
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw' || k === 'keyd' || k === 'space',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.getControls().throttleAxis).toBe(1);
      expect(adapter.getControls().turnAxis).toBe(1);
      expect(adapter.getControls().brake).toBe(true);

      adapter.resetControlState();
      const c = adapter.getControls();
      expect(c.throttleAxis).toBe(0);
      expect(c.turnAxis).toBe(0);
      expect(c.brake).toBe(false);
    });

    it('exiting the vehicle implicitly resets controls', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.getControls().throttleAxis).toBe(1);

      adapter.onExit(ctx);
      expect(adapter.getControls().throttleAxis).toBe(0);
    });
  });

  describe('third-person orbit-tank camera', () => {
    it('computes a camera position behind and above the chassis with a look-target on the chassis', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeThirdPersonCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // With identity quaternion the chassis 'back' direction is world +Z.
      expect(camPos.z).toBeGreaterThan(0);
      expect(camPos.y).toBeGreaterThan(0); // lifted above the chassis
      // Look-target sits on the chassis center, lifted by cameraLookHeight.
      expect(lookAt.x).toBe(0);
      expect(lookAt.z).toBe(0);
      expect(lookAt.y).toBeCloseTo(adapter.cameraLookHeight + 1, 4); // chassis y = 1
    });

    it('orbits with the chassis: rotating the tank 90° CCW about Y moves the camera to its world-+X side', () => {
      tank = createTank('m48_yaw', new THREE.Vector3(0, 1, 0));
      tank.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      adapter = new TankPlayerAdapter(tank);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm48_yaw');
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeThirdPersonCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // After 90° CCW yaw, chassis-back rotates from world +Z to world +X.
      expect(camPos.x).toBeGreaterThan(0);
      expect(Math.abs(camPos.z)).toBeLessThan(1e-3);
    });

    it('returns false when no vehicle is active', () => {
      const ok = adapter.computeThirdPersonCamera(new THREE.Vector3(), new THREE.Vector3());
      expect(ok).toBe(false);
    });
  });

  describe('physics step delegation', () => {
    it('steps the tank with the provided dt + terrain when mounted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const setTerrainSpy = vi.spyOn(tank, 'setTerrain');
      const updateSpy = vi.spyOn(tank, 'update');
      const terrain = makeFlatTerrain(0);

      adapter.stepPhysics(1 / 60, terrain);

      expect(setTerrainSpy).toHaveBeenCalledWith(terrain);
      expect(updateSpy).toHaveBeenCalledWith(1 / 60);
    });

    it('is a no-op when no vehicle is active (player not mounted)', () => {
      const updateSpy = vi.spyOn(tank, 'update');
      adapter.stepPhysics(1 / 60, null);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
