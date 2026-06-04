// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * WatercraftPlayerAdapter behavior tests.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md (R2 —
 * sampan-integration). The adapter is generic: it ships in this
 * task and the parallel `pbr-integration` task reuses it for its
 * driver seat. These tests bind it to a Sampan instance because
 * that's the first concrete craft this cycle ships; the assertions
 * exercise the generic surface (throttle/rudder forwarding, enter /
 * exit, camera, exit-plan) so they remain valid when PBR plugs in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { WatercraftPlayerAdapter } from './WatercraftPlayerAdapter';
import { Sampan } from './Sampan';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createSampan(
  id = 'sampan_1',
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
): Sampan {
  const object = new THREE.Object3D();
  object.position.copy(position);
  return new Sampan(id, object, Faction.NVA);
}

function createTransitionContext(
  playerState: PlayerState,
  vehicleId = 'sampan_1',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WatercraftPlayerAdapter', () => {
  let adapter: WatercraftPlayerAdapter;
  let sampan: Sampan;

  beforeEach(() => {
    sampan = createSampan();
    adapter = new WatercraftPlayerAdapter(sampan);
  });

  it('identifies itself as a watercraft adapter on the gameplay input context with pilot seat', () => {
    expect(adapter.vehicleType).toBe('watercraft');
    expect(adapter.inputContext).toBe('gameplay');
    expect(adapter.playerSeat).toBe('pilot');
  });

  // ------------------------------ Enter -----------------------------------

  describe('entering the watercraft (F enter)', () => {
    it('takes the player off their feet and into the pilot seat', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer sprinting around.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped onto the hull.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'watercraft.enter');
      // Camera remembers infantry angles for clean restore on exit.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Any leftover flight bookkeeping cleared.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
      // HUD knows we're in a vehicle (watercraft reuses the ground bucket for now).
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenCalledWith(
        expect.objectContaining({ hudVariant: 'groundVehicle', role: 'pilot' }),
      );
    });

    it('records the active vehicle id for the session', () => {
      sampan = createSampan('sampan_alpha');
      adapter = new WatercraftPlayerAdapter(sampan);
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'sampan_alpha');
      adapter.onEnter(ctx);

      expect(adapter.getActiveVehicleId()).toBe('sampan_alpha');
    });
  });

  // ------------------------------- Exit -----------------------------------

  describe('exiting the watercraft (F exit)', () => {
    it('puts the player back on their feet (restores camera, clears HUD, clears active id)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.hudSystem!.setVehicleContext).toHaveBeenLastCalledWith(null);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(adapter.getActiveVehicleId()).toBeNull();
    });

    it('parks the hull on exit so the watercraft coasts to a stop instead of carrying last throttle', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Hold W so the hull is under positive throttle at exit time.
      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.onExit(ctx);

      // Exit issues a zeroed command so the unattended hull doesn't
      // carry the player's last throttle.
      expect(setControlsSpy).toHaveBeenCalledWith(0, 0);
    });

    it('falls back to ejecting on the +X side of the hull when the craft is afloat', () => {
      const physicsAt = new THREE.Vector3(100, 0, 200);
      sampan = createSampan('sampan_drop', physicsAt);
      adapter = new WatercraftPlayerAdapter(sampan);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      // Identity quaternion + default 1.5 m side step => x = 101.5.
      expect(plan.position!.x).toBeCloseTo(101.5, 4);
      expect(plan.position!.z).toBeCloseTo(200, 4);
      // Not grounded -> player drops in the water beside the hull.
      expect(plan.message).toBe('in-water');
    });

    it('flags grounded exits with "on-bank" so the session controller can surface a bank-step prompt', () => {
      sampan = createSampan('sampan_grounded');
      adapter = new WatercraftPlayerAdapter(sampan);
      // Force grounded state via the WatercraftPhysics terrain probe:
      // a terrain that pokes well above the hull samples grounds them.
      sampan.setTerrain(makeFlatTerrain(5));
      // One step advances the grounded flag inside the physics layer.
      sampan.update(1 / 60);
      expect(sampan.isGrounded()).toBe(true);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      expect(plan.canExit).toBe(true);
      expect(plan.message).toBe('on-bank');
    });

    it('rotates the exit offset with the hull yaw (player does not land in the wake after a turn)', () => {
      const physicsAt = new THREE.Vector3(0, 0, 0);
      sampan = createSampan('sampan_yaw', physicsAt);
      // Rotate the hull 90° CCW about Y so hull-+X points to world-(-Z).
      sampan.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      adapter = new WatercraftPlayerAdapter(sampan);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      const plan = adapter.getExitPlan(ctx, {});

      // After 90° yaw about +Y, hull-+X (the +1.5 side step) ends up
      // along world-(-Z). Invariant: the eject is no longer along
      // world-+X — it follows the hull.
      expect(Math.abs(plan.position!.z)).toBeCloseTo(1.5, 4);
      expect(Math.abs(plan.position!.x)).toBeLessThan(1e-3);
    });
  });

  // ----------------------- Throttle / rudder input ------------------------

  describe('control forwarding', () => {
    it('does nothing when no vehicle is active', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).not.toHaveBeenCalled();
    });

    it('W=1 pushes the hull forward via setControls(+1, 0)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(1, 0);
      expect(adapter.getControls().throttle).toBe(1);
      expect(adapter.getControls().rudder).toBe(0);
    });

    it('S=1 reverses the hull via setControls(-1, 0)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keys',
      );
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(-1, 0);
    });

    it('D=1 swings the rudder to the right via setControls(0, +1)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyd',
      );
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(0, 1);
    });

    it('A=1 swings the rudder to the left via setControls(0, -1)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keya',
      );
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(0, -1);
    });

    it('W+D combined sends forward throttle with rudder bias for a forward-right arc', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw' || k === 'keyd',
      );
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      expect(setControlsSpy).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('touch input forwarding', () => {
    it('forwards joystick magnitudes as (throttle, rudder) with deadzone applied', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.getTouchControls as ReturnType<typeof vi.fn>).mockReturnValue({});
      (ctx.input.getTouchMovementVector as ReturnType<typeof vi.fn>).mockReturnValue({
        x: 0.7, // right swing -> rudder right
        z: -0.8, // forward (negative z = forward)
      });
      const setControlsSpy = vi.spyOn(sampan, 'setControls');

      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));

      const call = setControlsSpy.mock.calls[0];
      expect(call[0]).toBeCloseTo(0.8, 4);
      expect(call[1]).toBeCloseTo(0.7, 4);
    });
  });

  // -------------------------- Control state reset -------------------------

  describe('control state reset', () => {
    it('clears throttle/rudder on resetControlState', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw' || k === 'keyd',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.getControls().throttle).toBe(1);
      expect(adapter.getControls().rudder).toBe(1);

      adapter.resetControlState();
      expect(adapter.getControls().throttle).toBe(0);
      expect(adapter.getControls().rudder).toBe(0);
    });

    it('exiting the vehicle implicitly resets controls', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      (ctx.input.isKeyPressed as ReturnType<typeof vi.fn>).mockImplementation(
        (k: string) => k === 'keyw',
      );
      adapter.update(createUpdateContext(ctx.input, ctx.hudSystem));
      expect(adapter.getControls().throttle).toBe(1);

      adapter.onExit(ctx);
      expect(adapter.getControls().throttle).toBe(0);
    });
  });

  // ----------------- Camera frames hull (third-person) --------------------

  describe('third-person follow camera', () => {
    it('computes a camera position behind and above the hull with a look-target on the hull', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeThirdPersonCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // With identity quaternion the hull 'back' direction is world +Z.
      expect(camPos.z).toBeGreaterThan(0);
      expect(camPos.y).toBeGreaterThan(0); // lifted above the hull
      // Look-target sits on the hull center, lifted by cameraLookHeight.
      expect(lookAt.x).toBe(0);
      expect(lookAt.z).toBe(0);
      expect(lookAt.y).toBeCloseTo(adapter.cameraLookHeight, 4);
    });

    it('orbits with the hull: rotating the boat 90° CCW about Y moves the camera to its world-+X side', () => {
      sampan = createSampan('sampan_yaw', new THREE.Vector3(0, 0, 0));
      sampan.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      adapter = new WatercraftPlayerAdapter(sampan);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'sampan_yaw');
      adapter.onEnter(ctx);

      const camPos = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      const ok = adapter.computeThirdPersonCamera(camPos, lookAt);

      expect(ok).toBe(true);
      // After 90° CCW yaw, hull-back (+Z) rotates to world +X.
      expect(camPos.x).toBeGreaterThan(0);
      expect(Math.abs(camPos.z)).toBeLessThan(1e-3);
    });

    it('returns false when no vehicle is active', () => {
      const ok = adapter.computeThirdPersonCamera(new THREE.Vector3(), new THREE.Vector3());
      expect(ok).toBe(false);
    });
  });

  // -------------------------- Physics delegation --------------------------

  describe('physics step delegation', () => {
    it('steps the watercraft with the provided dt + terrain when mounted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const setTerrainSpy = vi.spyOn(sampan, 'setTerrain');
      const updateSpy = vi.spyOn(sampan, 'update');
      const terrain = makeFlatTerrain(0);

      adapter.stepPhysics(1 / 60, terrain);

      expect(setTerrainSpy).toHaveBeenCalledWith(terrain);
      expect(updateSpy).toHaveBeenCalledWith(1 / 60);
    });

    it('is a no-op when no vehicle is active (player not mounted)', () => {
      const updateSpy = vi.spyOn(sampan, 'update');
      adapter.stepPhysics(1 / 60, null);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // ----------------------- Per-craft tuning options -----------------------

  describe('constructor options (per-craft tuning for sibling pbr-integration)', () => {
    it('accepts overrides for cameraDistance / cameraHeight / cameraLookHeight / exitSideOffset', () => {
      sampan = createSampan('sampan_tuned');
      adapter = new WatercraftPlayerAdapter(sampan, {
        cameraDistance: 15,
        cameraHeight: 6,
        cameraLookHeight: 2,
        exitSideOffset: 4,
      });
      expect(adapter.cameraDistance).toBe(15);
      expect(adapter.cameraHeight).toBe(6);
      expect(adapter.cameraLookHeight).toBe(2);
      expect(adapter.exitSideOffset).toBe(4);
    });
  });
});
