import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EmplacementPlayerAdapter } from './EmplacementPlayerAdapter';
import { Emplacement } from './Emplacement';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * Construct a real Emplacement at the given world position. We use a
 * THREE.Object3D as the tripod node so getPosition() reports back the
 * placement directly — the adapter relies on getPosition() for both
 * mounting snap and barrel-camera math.
 */
function makeEmplacement(
  vehicleId = 'm2hb_emp_1',
  mountAt: THREE.Vector3 = new THREE.Vector3(20, 1.2, 30),
): Emplacement {
  const scene = new THREE.Scene();
  const tripod = new THREE.Object3D();
  tripod.position.copy(mountAt);
  scene.add(tripod);
  return new Emplacement(vehicleId, tripod, Faction.US);
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
  let model: Emplacement;

  beforeEach(() => {
    model = makeEmplacement();
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
      expect(snappedPos.y).toBeCloseTo(1.2, 4); // mount Y (tripod world Y)
      expect(snapArgs[1]).toBe('emplacement.enter');
      // Camera saves infantry angles so dismount restores cleanly.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Leftover flight bookkeeping cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we are on a turret.
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'turret', role: 'gunner', hudVariant: 'turret' }),
      );
    });

    it('records the active emplacement id (from the bound model) for the session', () => {
      model = makeEmplacement('m2hb_bunker');
      adapter = new EmplacementPlayerAdapter(model);
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm2hb_bunker');
      adapter.onEnter(ctx);
      expect(adapter.getActiveEmplacementId()).toBe('m2hb_bunker');
    });
  });

  describe('dismounting (onExit)', () => {
    it('puts the player back on their feet (restores camera, clears HUD)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(adapter.getActiveEmplacementId()).toBeNull();
    });

    it('returns an exit plan beside the mount using the gunner seat offset', () => {
      // Default gunner seat exitOffset is (0, 0, -1.8); placing the
      // tripod at (50, 1, 60) should eject the gunner to (50, 1, 58.2).
      model = makeEmplacement('emp_exit', new THREE.Vector3(50, 1, 60));
      adapter = new EmplacementPlayerAdapter(model);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'emp_exit');
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      expect(plan.mode).toBe('normal');
      expect(plan.position!.x).toBeCloseTo(50, 4);
      expect(plan.position!.y).toBeCloseTo(1, 4);
      expect(plan.position!.z).toBeCloseTo(58.2, 4); // 60 + (-1.8)
    });
  });

  describe('per-frame aim input forwarding', () => {
    it('does nothing when no emplacement is mounted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      // No aim set means the model's target aim is unchanged from default (0, 0).
      const aim = model.getTargetAim();
      expect(aim.yaw).toBe(0);
      expect(aim.pitch).toBe(0);
    });

    it('forwards mouse-x as yaw delta and mouse-y as pitch delta (pointer locked)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 12, y: -8 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      const aim = model.getTargetAim();
      // Right-drag (positive x) turns barrel right (negative yaw in our convention).
      expect(aim.yaw).toBeLessThan(0);
      // Up-drag (negative y) raises barrel (positive pitch).
      expect(aim.pitch).toBeGreaterThan(0);
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

      const aim = model.getTargetAim();
      expect(aim.yaw).toBe(0);
      expect(aim.pitch).toBe(0);
    });

    it('relies on the model to clamp aim (adapter does not pre-clamp deltas)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      // Huge mouse swing — adapter forwards the full delta; Emplacement
      // clamps to the M2HB pitch envelope (-10° to +60°) automatically.
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 5000, y: -5000 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      const limits = model.getPitchLimits();
      const aim = model.getTargetAim();
      // Pitch should be clamped to the upper limit (we tried to elevate massively).
      expect(aim.pitch).toBeCloseTo(limits.max, 4);
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

      // Slew barrel toward the right (negative yaw in our convention) and
      // let it fully settle so getYaw() reflects the requested target.
      model.setAim(-Math.PI / 4, 0);
      model.update(10); // overshoot dt so the slew has converged

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeBarrelCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // Forward should now have a +X component (looking right-and-forward).
      expect(lookAt.x).toBeGreaterThan(camPos.x);
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
