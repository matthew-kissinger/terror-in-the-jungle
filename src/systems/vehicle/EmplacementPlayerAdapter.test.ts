import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EmplacementPlayerAdapter, type IEmplacementModel } from './EmplacementPlayerAdapter';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

interface MockEmplacementModel extends IEmplacementModel {
  setEngaging: ReturnType<typeof vi.fn>;
  getPlayerExitPlan: ReturnType<typeof vi.fn>;
  applyAimDelta: ReturnType<typeof vi.fn>;
  getMountPoint: ReturnType<typeof vi.fn>;
  getYawPitch: ReturnType<typeof vi.fn>;
  /** Current internal yaw/pitch — written by applyAimDelta in this mock. */
  __yaw: number;
  __pitch: number;
}

function createMockEmplacementModel(mountAt: THREE.Vector3 = new THREE.Vector3(20, 1.2, 30)): MockEmplacementModel {
  const state = { yaw: 0, pitch: 0 };
  const model: MockEmplacementModel = {
    __yaw: 0,
    __pitch: 0,
    getYawPitch: vi.fn((_id: string) => ({ yaw: state.yaw, pitch: state.pitch })),
    applyAimDelta: vi.fn((_id: string, dy: number, dp: number) => {
      state.yaw += dy;
      state.pitch += dp;
      model.__yaw = state.yaw;
      model.__pitch = state.pitch;
    }),
    getMountPoint: vi.fn((_id: string, target: THREE.Vector3) => {
      target.copy(mountAt);
      return true;
    }),
    getPlayerExitPlan: vi.fn(),
    setEngaging: vi.fn(),
  };
  return model;
}

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(3, 7, 11),
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

function createTransitionContext(
  playerState: PlayerState,
  vehicleId = 'm2hb_emp_1',
): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(20, 5, 30),
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
      getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
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
    cameraController: { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() } as any,
    hudSystem,
  };
}

describe('EmplacementPlayerAdapter', () => {
  let adapter: EmplacementPlayerAdapter;
  let model: MockEmplacementModel;

  beforeEach(() => {
    model = createMockEmplacementModel();
    adapter = new EmplacementPlayerAdapter(model);
  });

  it('identifies itself as an emplacement adapter on the gameplay input context', () => {
    expect(adapter.vehicleType).toBe('emplacement');
    expect(adapter.inputContext).toBe('gameplay');
  });

  describe('mounting (onEnter)', () => {
    it('takes the player off their feet and snaps them onto the gunner seat', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // No more sprinting around.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped to the mount point, not the original ctx.position.
      expect(ctx.setPosition).toHaveBeenCalled();
      const snapArgs = (ctx.setPosition as ReturnType<typeof vi.fn>).mock.calls[0];
      const snappedPos = snapArgs[0] as THREE.Vector3;
      expect(snappedPos.y).toBeCloseTo(1.2, 4); // mount Y
      expect(snapArgs[1]).toBe('emplacement.enter');
      // Camera saves infantry angles so dismount restores cleanly.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Leftover flight bookkeeping cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we are on a turret.
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'turret', role: 'gunner', hudVariant: 'turret' }),
      );
      // Model is told the player is now engaging.
      expect(model.setEngaging).toHaveBeenCalledWith('m2hb_emp_1', true);
    });

    it('records the active emplacement id for the session', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm2hb_bunker');
      adapter.onEnter(ctx);
      expect(adapter.getActiveEmplacementId()).toBe('m2hb_bunker');
    });
  });

  describe('dismounting (onExit)', () => {
    it('puts the player back on their feet (restores camera, clears HUD, marks idle)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(model.setEngaging).toHaveBeenLastCalledWith('m2hb_emp_1', false);
      expect(adapter.getActiveEmplacementId()).toBeNull();
    });

    it('delegates the exit plan to the model when one is provided', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'emp_x');
      const plannedExit = new THREE.Vector3(7, 1, 14);
      model.getPlayerExitPlan.mockReturnValue({ canExit: true, mode: 'normal', position: plannedExit });

      const result = adapter.getExitPlan(ctx, { reason: 'input' });

      expect(model.getPlayerExitPlan).toHaveBeenCalledWith('emp_x');
      expect(result.canExit).toBe(true);
      expect(result.position).toBe(plannedExit);
    });

    it('falls back to ejecting beside the mount when no model plan exists', () => {
      const mount = new THREE.Vector3(50, 1, 60);
      model = createMockEmplacementModel(mount);
      model.getPlayerExitPlan.mockReturnValue(null);
      adapter = new EmplacementPlayerAdapter(model);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // Offset 1.8m to the +X side of the mount.
      expect(plan.position!.x).toBeCloseTo(51.8, 4);
      expect(plan.position!.z).toBeCloseTo(60, 4);
    });
  });

  describe('per-frame aim input forwarding', () => {
    it('does nothing when no emplacement is mounted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(model.applyAimDelta).not.toHaveBeenCalled();
    });

    it('forwards mouse-x as yaw delta and mouse-y as pitch delta (pointer locked)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 12, y: -8 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(model.applyAimDelta).toHaveBeenCalledTimes(1);
      const [, dy, dp] = model.applyAimDelta.mock.calls[0];
      // Right-drag (positive x) turns barrel right (negative yaw in our convention).
      expect(dy).toBeLessThan(0);
      // Up-drag (negative y) raises barrel (positive pitch).
      expect(dp).toBeGreaterThan(0);
      // Mouse movement was consumed.
      expect(ctx.input.clearMouseMovement).toHaveBeenCalled();
    });

    it('ignores mouse aim while pointer is unlocked', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 50, y: 50 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(model.applyAimDelta).not.toHaveBeenCalled();
    });

    it('relies on the model to clamp slew rates (adapter does not pre-clamp)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      // Huge mouse swing — adapter should still forward; model owns the cap.
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 5000, y: 5000 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(model.applyAimDelta).toHaveBeenCalledTimes(1);
    });
  });

  describe('fire input surface', () => {
    it('latches a fire request when Space is held and consumes it once', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'space');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(adapter.consumeFireRequest()).toBe(true);
      // Second consume in the same frame should be false (latched once).
      expect(adapter.consumeFireRequest()).toBe(false);
    });

    it('latches a fire request when left mouse button is pressed', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      // Augment the input mock with a mouse-button surface.
      (ctx.input as any).isMouseButtonPressed = vi.fn((b: number) => b === 0);
      adapter.onEnter(ctx);

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.consumeFireRequest()).toBe(true);
    });

    it('does not latch fire when no input is held', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.consumeFireRequest()).toBe(false);
    });
  });

  describe('barrel-attached first-person camera', () => {
    it('places the eye at the mount and looks along the barrel forward direction', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // With yaw=0, pitch=0 the derived forward is world -Z.
      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeBarrelCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // Eye is at the mount (with small up + forward offset applied).
      expect(camPos.x).toBeCloseTo(20, 4);
      expect(camPos.y).toBeGreaterThan(1.2); // lifted by cameraUpOffset
      // Look-target is one metre further along forward (=-Z).
      expect(lookAt.z).toBeLessThan(camPos.z);
    });

    it('rotates the look-target with the barrel yaw', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Slew barrel ~45deg to the right (negative yaw in our convention).
      model.applyAimDelta('m2hb_emp_1', -Math.PI / 4, 0);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeBarrelCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // Forward should now have a +X component (looking right-and-forward).
      expect(lookAt.x).toBeGreaterThan(camPos.x);
    });

    it('prefers the model.getBarrelForward hook when supplied', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      // Override: model reports forward straight up (+Y).
      (model as any).getBarrelForward = vi.fn((_id: string, target: THREE.Vector3) => {
        target.set(0, 1, 0);
        return true;
      });
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      adapter.computeBarrelCamera(camPos, lookAt);

      // Look-target is above the eye.
      expect(lookAt.y).toBeGreaterThan(camPos.y);
      expect((model as any).getBarrelForward).toHaveBeenCalled();
    });

    it('returns false when no emplacement is mounted', () => {
      const ok = adapter.computeBarrelCamera(new THREE.Vector3(), new THREE.Vector3());
      expect(ok).toBe(false);
    });
  });

  describe('control state reset', () => {
    it('clears any latched fire request on reset', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation((k: string) => k === 'space');
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      adapter.resetControlState();
      expect(adapter.consumeFireRequest()).toBe(false);
    });
  });
});
