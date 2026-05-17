import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TankPlayerAdapter, type ITankModel } from './TankPlayerAdapter';
import { TrackedVehiclePhysics } from './TrackedVehiclePhysics';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

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

interface MockTankModel extends ITankModel {
  setEngineActive: ReturnType<typeof vi.fn>;
  getPlayerExitPlan: ReturnType<typeof vi.fn>;
  __physics: TrackedVehiclePhysics;
}

function createMockTankModel(
  vehicleId = 'm48_1',
  physicsAt: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): MockTankModel {
  const physics = new TrackedVehiclePhysics(physicsAt);
  return {
    vehicleId,
    __physics: physics,
    getVehiclePositionTo: vi.fn((_id: string, target: THREE.Vector3) => {
      target.copy(physicsAt);
      return true;
    }),
    getVehicleQuaternionTo: vi.fn((_id: string, target: THREE.Quaternion) => {
      target.identity();
      return true;
    }),
    getPhysics: vi.fn((_id: string) => physics),
    getPlayerExitPlan: vi.fn(),
    setEngineActive: vi.fn(),
  };
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
  let model: MockTankModel;

  beforeEach(() => {
    model = createMockTankModel();
    adapter = new TankPlayerAdapter(model);
  });

  it('identifies itself as a tank adapter on the gameplay input context with pilot seat', () => {
    expect(adapter.vehicleType).toBe('tank');
    expect(adapter.inputContext).toBe('gameplay');
    expect(adapter.playerSeat).toBe('pilot');
  });

  describe('entering the tank (F enter)', () => {
    it('takes the player off their feet and into the driver hatch, spools the engine', () => {
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
      // Engine spooled up.
      expect(model.setEngineActive).toHaveBeenCalledWith('m48_1', true);
    });

    it('records the active vehicle id and physics handle for the session', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm48_alpha');
      adapter.onEnter(ctx);

      expect(adapter.getActiveVehicleId()).toBe('m48_alpha');
      expect(adapter.getActivePhysics()).toBe(model.__physics);
    });
  });

  describe('exiting the tank (F exit)', () => {
    it('puts the player back on their feet (restores camera, clears HUD, kills engine)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(model.setEngineActive).toHaveBeenLastCalledWith('m48_1', false);
      expect(adapter.getActiveVehicleId()).toBeNull();
      expect(adapter.getActivePhysics()).toBeNull();
    });

    it('delegates exit planning to the model when it provides a plan', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm48_xyz');
      const plannedExit = new THREE.Vector3(11, 2, 22);
      (model.getPlayerExitPlan as ReturnType<typeof vi.fn>).mockReturnValue({
        canExit: true,
        mode: 'normal',
        position: plannedExit,
      });

      const result = adapter.getExitPlan(ctx, { reason: 'input' });

      expect(model.getPlayerExitPlan).toHaveBeenCalledWith('m48_xyz');
      expect(result.canExit).toBe(true);
      expect(result.position).toBe(plannedExit);
    });

    it('falls back to ejecting on the positive-X side of the chassis when no model plan exists', () => {
      const physicsAt = new THREE.Vector3(100, 3, 200);
      model = createMockTankModel('m48_drop', physicsAt);
      (model.getPlayerExitPlan as ReturnType<typeof vi.fn>).mockReturnValue(null);
      adapter = new TankPlayerAdapter(model);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // Identity quaternion + 3.0 m side step => x = 103.
      expect(plan.position!.x).toBeCloseTo(103, 4);
      expect(plan.position!.z).toBeCloseTo(200, 4);
    });
  });

  describe('skid-steer input forwarding', () => {
    it('does nothing when no vehicle is active', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

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
      expect(lookAt.y).toBeCloseTo(adapter.cameraLookHeight + 1, 4); // physicsAt.y = 1
    });

    it('orbits with the chassis: rotating the tank 90° CCW about Y moves the camera to its world-+X side', () => {
      // Rebuild the model so getVehicleQuaternionTo returns a non-identity
      // pose — the adapter's camera math must respect it.
      const physicsAt = new THREE.Vector3(0, 1, 0);
      const yaw90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      model = {
        ...createMockTankModel('m48_yaw', physicsAt),
        getVehicleQuaternionTo: vi.fn((_id: string, target: THREE.Quaternion) => {
          target.copy(yaw90);
          return true;
        }),
      };
      adapter = new TankPlayerAdapter(model);

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
    it('steps the tracked-physics with the provided dt + terrain', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const stepSpy = vi.spyOn(model.__physics, 'update');
      adapter.stepPhysics(1 / 60, null);

      expect(stepSpy).toHaveBeenCalledWith(1 / 60, null);
    });

    it('is a no-op when no physics instance is attached', () => {
      const stepSpy = vi.spyOn(model.__physics, 'update');
      adapter.stepPhysics(1 / 60, null);
      expect(stepSpy).not.toHaveBeenCalled();
    });
  });
});
