import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TankGunnerAdapter } from './TankGunnerAdapter';
import { Tank } from './Tank';
import { TankTurret } from './TankTurret';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * Drives a real `TankTurret` to its requested yaw / pitch targets without
 * slew lag. The turret integrates with `update(dt)` capped by its configured
 * slew rate; a large dt collapses any angular gap in a single call (see
 * `approachAngular`'s shortest-path step). Used by tests that want to set
 * up a specific barrel pose without simulating frames.
 */
function snapTurretToTarget(turret: TankTurret): void {
  turret.update(10);
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
  // Add to a scene so updateMatrixWorld propagates from the root.
  const scene = new THREE.Scene();
  scene.add(object);
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
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
    } as any,
    hudSystem,
  };
}

describe('TankGunnerAdapter', () => {
  let adapter: TankGunnerAdapter;
  let tank: Tank;
  let turret: TankTurret;

  beforeEach(() => {
    tank = createTank();
    turret = tank.getTurret();
    adapter = new TankGunnerAdapter(tank, turret);
  });

  it('identifies itself as a tank-gunner adapter on the gameplay input context with gunner seat', () => {
    expect(adapter.vehicleType).toBe('tank_gunner');
    expect(adapter.inputContext).toBe('gameplay');
    expect(adapter.playerSeat).toBe('gunner');
  });

  describe('mounting the gunner seat', () => {
    it('takes the player off their feet and snaps them onto the turret station', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer sprinting around.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped to the requested position with a gunner-tagged reason so
      // call sites can distinguish the gunner entry from a pilot entry.
      expect(ctx.setPosition).toHaveBeenCalled();
      const snapArgs = (ctx.setPosition as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(snapArgs[1]).toBe('tank.gunner.enter');
      // Camera saves infantry angles so dismount restores cleanly.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Leftover flight bookkeeping cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we are on a tank gunner station (reuses the turret bucket).
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'turret', role: 'gunner', hudVariant: 'turret' }),
      );
    });

    it('records the active vehicle id for the session', () => {
      tank = createTank('m48_alpha');
      turret = tank.getTurret();
      adapter = new TankGunnerAdapter(tank, turret);
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'm48_alpha');
      adapter.onEnter(ctx);
      expect(adapter.getActiveVehicleId()).toBe('m48_alpha');
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
      expect(adapter.getActiveVehicleId()).toBeNull();
    });

    it('ejects on the +X side of the chassis, rotated by the tank yaw', () => {
      const physicsAt = new THREE.Vector3(100, 3, 200);
      tank = createTank('m48_drop', physicsAt);
      turret = tank.getTurret();
      adapter = new TankGunnerAdapter(tank, turret);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // Identity quaternion + ~3 m side step => x = 103.
      expect(plan.position!.x).toBeCloseTo(103, 4);
      expect(plan.position!.z).toBeCloseTo(200, 4);
    });

    it('rotates the exit offset with the tank yaw so the gunner doesnt land in the engine deck', () => {
      tank = createTank('m48_yaw', new THREE.Vector3(0, 1, 0));
      // Rotate the chassis 90 degrees CCW about Y so chassis-+X points to world-(-Z).
      tank.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      turret = tank.getTurret();
      adapter = new TankGunnerAdapter(tank, turret);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      // The key invariant: exit offset follows the chassis, not world axes.
      expect(Math.abs(plan.position!.z)).toBeCloseTo(3, 4);
      expect(Math.abs(plan.position!.x)).toBeLessThan(1e-3);
    });
  });

  describe('mouse drives turret yaw and pitch (within cap)', () => {
    it('does nothing when no gunner seat is mounted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const yawBefore = turret.getTargetYaw();
      const pitchBefore = turret.getTargetPitch();
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(turret.getTargetYaw()).toBe(yawBefore);
      expect(turret.getTargetPitch()).toBe(pitchBefore);
    });

    it('forwards mouse-x as a yaw delta to the turret (pointer locked)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 25, y: 0 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      // Right-drag (positive mouse-x) turns the turret right (negative yaw
      // in the convention shared with EmplacementPlayerAdapter).
      expect(turret.getTargetYaw()).toBeLessThan(0);
      // Mouse movement was consumed so the next frame starts fresh.
      expect(ctx.input.clearMouseMovement).toHaveBeenCalled();
    });

    it('forwards mouse-y as a pitch delta to the turret (pointer locked)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      // Up-drag (negative mouse-y) raises barrel.
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 0, y: -25 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(turret.getTargetPitch()).toBeGreaterThan(0);
    });

    it('ignores mouse aim while pointer is unlocked', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 50, y: 50 });

      const yawBefore = turret.getTargetYaw();
      const pitchBefore = turret.getTargetPitch();
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(turret.getTargetYaw()).toBe(yawBefore);
      expect(turret.getTargetPitch()).toBe(pitchBefore);
    });

    it('accumulates against the turret current aim — leaves clamping to the turret model', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      // Seed the turret with a non-zero starting aim and let it slew to
      // that target. The adapter must add its delta to the turret's
      // current achieved aim, not overwrite it (otherwise consecutive
      // inputs would walk the turret to mouse-delta only, losing the
      // absolute aim).
      turret.setTargetYaw(0.5);
      turret.setTargetPitch(0.1);
      snapTurretToTarget(turret);
      expect(turret.getYaw()).toBeCloseTo(0.5, 5);
      expect(turret.getPitch()).toBeCloseTo(0.1, 5);

      adapter.onEnter(ctx);

      (ctx.input.getIsPointerLocked as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.input.getMouseMovement as ReturnType<typeof vi.fn>).mockReturnValue({ x: 10, y: -10 });

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      const newYaw = turret.getTargetYaw();
      const newPitch = turret.getTargetPitch();
      // Both should differ from the raw mouse delta alone — they should be
      // the starting aim plus the input delta.
      expect(newYaw).not.toBeCloseTo(-10 * 0.0022, 6);
      expect(newPitch).not.toBeCloseTo(10 * 0.0022, 6);
      // And they should land in the neighborhood of starting + delta.
      expect(newYaw).toBeLessThan(0.5); // right drag pushed yaw down
      expect(newPitch).toBeGreaterThan(0.1); // up drag lifted pitch
    });

    it('uses touch cyclic input when a touch controller is present (no mouse path)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getTouchControls as ReturnType<typeof vi.fn>).mockReturnValue({});
      (ctx.input.getTouchFlightCyclicInput as ReturnType<typeof vi.fn>).mockReturnValue({
        pitch: 0.8, // up on right stick → barrel up
        roll: 0.6,  // right on right stick → turret right
      });

      const yawBefore = turret.getTargetYaw();
      const pitchBefore = turret.getTargetPitch();
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(turret.getTargetYaw()).not.toBe(yawBefore);
      expect(turret.getTargetPitch()).not.toBe(pitchBefore);
      // Mouse path should not have been read.
      expect(ctx.input.getMouseMovement).not.toHaveBeenCalled();
    });
  });

  describe('fire request (LMB latching contract — matches M2HB for R2 wiring)', () => {
    it('latches a fire request when Space is held and consumes it once per frame', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'space',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(adapter.consumeFireRequest()).toBe(true);
      // Second consume in the same frame should be false (latched once).
      expect(adapter.consumeFireRequest()).toBe(false);
    });

    it('latches a fire request when left mouse button is pressed', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
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

    it('re-latches on a second held frame (so held-fire works once cannon is wired)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'space',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.consumeFireRequest()).toBe(true);

      // Frame 2 — still held. Adapter should re-latch.
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.consumeFireRequest()).toBe(true);
    });
  });

  describe('pilot ↔ gunner seat-swap via enterVehicle(_, role)', () => {
    it('publishes its desired seat role so the session controller can call enterVehicle(_, this.playerSeat)', () => {
      // The contract: an integration layer planning a seat-swap reads
      // `adapter.playerSeat` and forwards it as the `preferredRole`
      // argument to the IVehicle. Same pattern works for the pilot
      // adapter ('pilot') so the two adapters are interchangeable from
      // the session-controller perspective.
      expect(adapter.playerSeat).toBe('gunner');
    });

    it('lands the player on the gunner seat (index 1 in DEFAULT_M48_SEATS) when enterVehicle(_, gunner) is called', () => {
      // This is the IVehicle contract that the adapter's playerSeat field
      // funnels into. We verify here that the Tank does in fact accept
      // 'gunner' and routes the player to the gunner-station seat.
      const seatIndex = tank.enterVehicle('player', adapter.playerSeat);
      expect(seatIndex).not.toBeNull();
      const seats = tank.getSeats();
      expect(seats[seatIndex!].role).toBe('gunner');
      expect(seats[seatIndex!].occupantId).toBe('player');
    });

    it('supports the pilot→gunner swap path on the same Tank instance', () => {
      // Owner mounts as pilot first (e.g. via the chassis adapter on
      // cycle #8), then triggers a seat swap. The IVehicle surface
      // releases the pilot, accepts the gunner role, and the gunner
      // adapter takes over — the Tank instance is shared.
      const pilotIndex = tank.enterVehicle('player', 'pilot');
      expect(pilotIndex).not.toBeNull();
      expect(tank.getPilotId()).toBe('player');

      tank.exitVehicle('player');
      expect(tank.getPilotId()).toBeNull();

      const gunnerIndex = tank.enterVehicle('player', adapter.playerSeat);
      expect(gunnerIndex).not.toBeNull();
      expect(tank.getSeats()[gunnerIndex!].role).toBe('gunner');
    });
  });

  describe('gunner-sight first-person camera (down-barrel POV)', () => {
    it('places the eye just behind the muzzle and looks along the barrel direction', () => {
      // Default turret with yaw=0, pitch=0: barrel points along chassis-(-Z).
      // With chassis at (0, 1, 0) and identity quaternion, world barrel
      // direction is world-(-Z) and the world barrel tip sits at the
      // sum of the default offsets along -Z.
      adapter = new TankGunnerAdapter(tank, turret);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const tipProbe = new THREE.Vector3();
      turret.getBarrelTipWorldPosition(tipProbe);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeGunnerSightCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // Eye sits a hair ahead of the muzzle along the barrel direction
      // (forward = -Z), so camPos.z < tipProbe.z.
      expect(camPos.z).toBeLessThan(tipProbe.z);
      // Look-target is further along the barrel.
      expect(lookAt.z).toBeLessThan(camPos.z);
    });

    it('tracks the turret pose: rotating the turret rotates the look-target', () => {
      // Slew the turret 90° so the barrel points along world-+X. The
      // mouse-x → yaw convention is "right drag turns turret right"
      // (negative yaw), so commanding -π/2 puts the barrel along +X
      // for an identity-orientation chassis.
      turret.setTargetYaw(-Math.PI / 2);
      snapTurretToTarget(turret);

      adapter = new TankGunnerAdapter(tank, turret);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeGunnerSightCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // Look-target should be down-X of the camera (barrel points +X).
      expect(lookAt.x).toBeGreaterThan(camPos.x);
      // Z stays put.
      expect(Math.abs(lookAt.z - camPos.z)).toBeLessThan(1e-4);
    });

    it('returns false when no gunner seat is mounted', () => {
      const ok = adapter.computeGunnerSightCamera(new THREE.Vector3(), new THREE.Vector3());
      expect(ok).toBe(false);
    });
  });

  describe('control state reset', () => {
    it('clears any latched fire request on reset', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'space',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      adapter.resetControlState();
      expect(adapter.consumeFireRequest()).toBe(false);
    });

    it('exiting the seat implicitly clears a pending fire request', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'space',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      adapter.onExit(ctx);
      expect(adapter.consumeFireRequest()).toBe(false);
    });
  });
});
