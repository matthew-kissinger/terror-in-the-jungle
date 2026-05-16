import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GroundVehiclePlayerAdapter, type IGroundVehicleModel } from './GroundVehiclePlayerAdapter';
import { GroundVehiclePhysics } from './GroundVehiclePhysics';
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

interface MockGroundModel extends IGroundVehicleModel {
  setEngineActive: ReturnType<typeof vi.fn>;
  getPlayerExitPlan: ReturnType<typeof vi.fn>;
  __physics: GroundVehiclePhysics;
}

function createMockGroundVehicleModel(
  physicsAt: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): MockGroundModel {
  const physics = new GroundVehiclePhysics(physicsAt);
  return {
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
  vehicleId = 'jeep_1',
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

describe('GroundVehiclePlayerAdapter', () => {
  let adapter: GroundVehiclePlayerAdapter;
  let model: MockGroundModel;

  beforeEach(() => {
    model = createMockGroundVehicleModel();
    adapter = new GroundVehiclePlayerAdapter(model);
  });

  it('identifies itself as a ground vehicle adapter with gameplay input context', () => {
    expect(adapter.vehicleType).toBe('ground');
    expect(adapter.inputContext).toBe('gameplay');
  });

  describe('entering the vehicle', () => {
    it('takes the player off their feet and into the driver seat', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer sprinting around on foot.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped to the vehicle.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'ground-vehicle.enter');
      // Camera remembers infantry angles for clean restore on exit.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Any leftover flight bookkeeping is cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we are in a ground vehicle.
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'car', role: 'driver' }),
      );
      // Engine is told to spool up.
      expect(model.setEngineActive).toHaveBeenCalledWith('jeep_1', true);
    });

    it('tracks the active vehicle id and physics for the session', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'jeep_alpha');
      adapter.onEnter(ctx);

      expect(adapter.getActiveVehicleId()).toBe('jeep_alpha');
      expect(adapter.getActivePhysics()).toBe(model.__physics);
    });
  });

  describe('exiting the vehicle', () => {
    it('puts the player back on their feet (restores camera, clears vehicle HUD, shuts off engine)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(model.setEngineActive).toHaveBeenLastCalledWith('jeep_1', false);
      expect(adapter.getActiveVehicleId()).toBeNull();
      expect(adapter.getActivePhysics()).toBeNull();
    });

    it('delegates exit planning to the model when it provides a plan', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'jeep_xyz');
      const plannedExit = new THREE.Vector3(11, 2, 22);
      (model.getPlayerExitPlan as ReturnType<typeof vi.fn>).mockReturnValue({
        canExit: true,
        mode: 'normal',
        position: plannedExit,
      });

      const result = adapter.getExitPlan(ctx, { reason: 'input' });

      expect(model.getPlayerExitPlan).toHaveBeenCalledWith('jeep_xyz');
      expect(result.canExit).toBe(true);
      expect(result.position).toBe(plannedExit);
    });

    it('falls back to ejecting on the positive-X side of the chassis when no model plan exists', () => {
      const physicsAt = new THREE.Vector3(100, 3, 200);
      model = createMockGroundVehicleModel(physicsAt);
      (model.getPlayerExitPlan as ReturnType<typeof vi.fn>).mockReturnValue(null);
      adapter = new GroundVehiclePlayerAdapter(model);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // With identity quaternion, +X side offset of 2.0 lands at x = 102.
      expect(plan.position!.x).toBeCloseTo(102, 4);
      expect(plan.position!.z).toBeCloseTo(200, 4);
    });
  });

  describe('per-frame input forwarding', () => {
    it('does nothing when no vehicle is active', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).not.toHaveBeenCalled();
    });

    it('forwards W as positive throttle into physics controls', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'keyw');
      const setControlsSpy = vi.spyOn(model.__physics, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalled();
      // After clamp by physics, throttle should be at full forward.
      expect(model.__physics.getControls().throttle).toBe(1);
    });

    it('forwards S as negative throttle (reverse)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'keys');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(model.__physics.getControls().throttle).toBe(-1);
    });

    it('forwards A and D as steering at the configured max angle', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'keyd');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      // GroundVehiclePhysics clamps to its configured maxSteer (default 0.6 rad).
      expect(model.__physics.getControls().steerAngle).toBeGreaterThan(0);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'keya');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(model.__physics.getControls().steerAngle).toBeLessThan(0);
    });

    it('forwards Space as full brake', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'space');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(model.__physics.getControls().brake).toBe(1);
    });
  });

  describe('control state reset', () => {
    it('clears throttle/steer/brake/handbrake on resetControlState', () => {
      adapter.getControls(); // ensure accessor doesn't blow up at idle
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'keyw');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.getControls().throttle).toBe(1);

      adapter.resetControlState();
      const c = adapter.getControls();
      expect(c.throttle).toBe(0);
      expect(c.steerAngle).toBe(0);
      expect(c.brake).toBe(0);
      expect(c.handbrake).toBe(false);
    });
  });

  describe('third-person follow camera pose', () => {
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
      expect(lookAt.x).toBe(0);
      expect(lookAt.z).toBe(0);
    });

    it('returns false when no vehicle is active', () => {
      const ok = adapter.computeThirdPersonCamera(new THREE.Vector3(), new THREE.Vector3());
      expect(ok).toBe(false);
    });
  });

  describe('physics step delegation', () => {
    it('steps physics with the provided dt + terrain', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const stepSpy = vi.spyOn(model.__physics, 'update');
      adapter.stepPhysics(1 / 60, null);

      expect(stepSpy).toHaveBeenCalledWith(1 / 60, null);
    });

    it('is a no-op when no physics instance is attached', () => {
      // Fresh adapter, no onEnter call.
      const stepSpy = vi.spyOn(model.__physics, 'update');
      adapter.stepPhysics(1 / 60, null);
      expect(stepSpy).not.toHaveBeenCalled();
    });
  });
});
