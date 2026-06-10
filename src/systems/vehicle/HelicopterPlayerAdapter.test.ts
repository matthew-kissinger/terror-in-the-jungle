// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterPlayerAdapter } from './HelicopterPlayerAdapter';
import type { VehicleTransitionContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: () => false,
}));

function createMockHelicopterModel(opts: { hasDoorGun?: boolean; role?: 'transport' | 'gunship' | 'attack' } = {}) {
  const hasDoorGun = opts.hasDoorGun ?? false;
  return {
    setHelicopterControls: vi.fn(),
    getHelicopterState: vi.fn(() => ({ engineRPM: 0.5 })),
    getFlightData: vi.fn(() => ({ airspeed: 30, heading: 90, verticalSpeed: 2 })),
    getAircraftRole: vi.fn(() => (opts.role ?? 'transport') as 'transport' | 'gunship' | 'attack'),
    exitHelicopter: vi.fn(),
    tryEnterHelicopter: vi.fn(),
    startFiring: vi.fn(),
    stopFiring: vi.fn(),
    switchHelicopterWeapon: vi.fn(),
    getWeaponStatus: vi.fn(),
    // Pose: identity quaternion so the door-gun aim math is easy to reason about.
    getHelicopterPositionTo: vi.fn((_id: string, out: THREE.Vector3) => { out.set(0, 50, 0); return true; }),
    getHelicopterQuaternionTo: vi.fn((_id: string, out: THREE.Quaternion) => { out.identity(); return true; }),
    // Door-gun seat surface (door-gun-seat).
    hasDoorGun: vi.fn(() => hasDoorGun),
    setPlayerDoorGunCrewing: vi.fn(),
    firePlayerDoorGun: vi.fn(),
    getPlayerDoorGunStatus: vi.fn(() => (hasDoorGun ? { name: 'M60 Door Gun', ammo: 500, maxAmmo: 500 } : null)),
    getPlayerExitPlan: vi.fn((_helicopterId: string) => ({
      canExit: true,
      mode: 'normal' as const,
      position: new THREE.Vector3(110, 52, 210),
    })),
    setTerrainManager: vi.fn(),
    setHelipadSystem: vi.fn(),
    setPlayerController: vi.fn(),
    setHUDSystem: vi.fn(),
    setAudioListener: vi.fn(),
    setCombatantSystem: vi.fn(),
    setGrenadeSystem: vi.fn(),
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
    showHelicopterMouseIndicator: vi.fn(),
    updateHelicopterMouseMode: vi.fn(),
    showHelicopterInstruments: vi.fn(),
    hideHelicopterMouseIndicator: vi.fn(),
    hideHelicopterInstruments: vi.fn(),
    setVehicleContext: vi.fn(),
    setHelicopterAircraftRole: vi.fn(),
    updateHelicopterFlightData: vi.fn(),
    updateHelicopterInstruments: vi.fn(),
    updateElevation: vi.fn(),
  };
}

function createTransitionContext(playerState: PlayerState, vehicleId = 'heli_1'): VehicleTransitionContext {
  let flightMouseControlEnabled = false;
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(100, 50, 200),
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
      getTouchCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      getGamepadManager: vi.fn(() => null),
    } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
      setFlightMouseControlEnabled: vi.fn((enabled: boolean) => {
        flightMouseControlEnabled = enabled;
      }),
      getFlightMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
      getHelicopterMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
    } as any,
    hudSystem: createMockHudSystem() as any,
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

/** Build a VehicleUpdateContext whose input lets a test drive the door gun. */
function createUpdateContext(opts: {
  mouse?: { x: number; y: number };
  fire?: boolean;
} = {}) {
  const setCrosshairMode = vi.fn();
  const setHelicopterWeaponStatus = vi.fn();
  return {
    ctx: {
      deltaTime: 1 / 60,
      input: {
        getIsPointerLocked: vi.fn(() => true),
        getMouseMovement: vi.fn(() => opts.mouse ?? { x: 0, y: 0 }),
        clearMouseMovement: vi.fn(),
        isMouseButtonPressed: vi.fn((b: number) => (b === 0 ? (opts.fire ?? false) : false)),
      } as any,
      cameraController: {} as any,
      hudSystem: { setHelicopterWeaponStatus } as any,
    },
    setCrosshairMode,
    setHelicopterWeaponStatus,
  };
}

describe('HelicopterPlayerAdapter', () => {
  let adapter: HelicopterPlayerAdapter;
  let heliModel: ReturnType<typeof createMockHelicopterModel>;

  beforeEach(() => {
    heliModel = createMockHelicopterModel();
    adapter = new HelicopterPlayerAdapter(heliModel as any);
  });

  it('identifies itself as a helicopter adapter with helicopter input context', () => {
    expect(adapter.vehicleType).toBe('helicopter');
    expect(adapter.inputContext).toBe('helicopter');
  });

  describe('entering the helicopter', () => {
    it('takes the player off their feet and into the cockpit', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer running around on foot.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped to the helicopter.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'helicopter.enter');
      // Input is in helicopter mode.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('helicopter');
      // Camera remembers the infantry angles so we can restore them on exit.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Flight mouse control starts from direct-control mode on every entry.
      expect(ctx.cameraController.setFlightMouseControlEnabled).toHaveBeenCalledWith(true);
      expect(ctx.hudSystem!.updateHelicopterMouseMode).toHaveBeenCalledWith(true);
    });

    it('adjusts the crosshair for the helicopter role on entry', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenCalledWith('helicopter_transport');
    });
  });

  describe('exiting the helicopter', () => {
    it('puts the player back on their feet (restores camera, infantry crosshair, clears flight mode)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenCalledWith('infantry');
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
    });

    it('delegates exit planning to the helicopter model when available', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'heli_abc');
      const result = adapter.getExitPlan(ctx, { allowEject: true, reason: 'input' });

      expect(heliModel.getPlayerExitPlan).toHaveBeenCalledWith('heli_abc');
      expect(result).toEqual({
        canExit: true,
        mode: 'normal',
        position: new THREE.Vector3(110, 52, 210),
      });
    });

    it('falls back to the current transition position for legacy helicopter models', () => {
      delete (heliModel as any).getPlayerExitPlan;
      adapter = new HelicopterPlayerAdapter(heliModel as any);
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'legacy_heli');

      const result = adapter.getExitPlan(ctx, { allowEject: false, reason: 'model' });

      expect(result).toEqual({
        canExit: true,
        mode: 'normal',
        position: ctx.position,
      });
    });
  });

  describe('control state', () => {
    it('resetControlState zeroes stick inputs and keeps autoHover enabled by default', () => {
      adapter.setEngineBoost(true);
      adapter.toggleAutoHover();
      adapter.toggleAltitudeLock();

      adapter.resetControlState();

      const controls = adapter.getHelicopterControls();
      expect(controls.collective).toBe(0);
      expect(controls.cyclicPitch).toBe(0);
      expect(controls.cyclicRoll).toBe(0);
      expect(controls.yaw).toBe(0);
      expect(controls.engineBoost).toBe(false);
      expect(controls.autoHover).toBe(true);
    });

    it('toggleAutoHover flips the assist state', () => {
      expect(adapter.getHelicopterControls().autoHover).toBe(true);
      adapter.toggleAutoHover();
      expect(adapter.getHelicopterControls().autoHover).toBe(false);
      adapter.toggleAutoHover();
      expect(adapter.getHelicopterControls().autoHover).toBe(true);
    });
  });

  describe('door-gun seat (door-gun-seat)', () => {
    function boardGunship(): {
      gunModel: ReturnType<typeof createMockHelicopterModel>;
      ctx: ReturnType<typeof createTransitionContext>;
    } {
      const gunModel = createMockHelicopterModel({ hasDoorGun: true, role: 'gunship' });
      adapter = new HelicopterPlayerAdapter(gunModel as any);
      const ctx = createTransitionContext(createPlayerState(), 'heli_gun');
      adapter.onEnter(ctx);
      return { gunModel, ctx };
    }

    it('boards into the pilot seat — the door gun is an explicit swap', () => {
      boardGunship();
      expect(adapter.getCrewSeat()).toBe('pilot');
    });

    it('swaps the player into the door-gun seat and back to the pilot seat', () => {
      const { gunModel, ctx } = boardGunship();
      const renderer = ctx.gameRenderer as any;

      expect(adapter.toggleDoorGunSeat()).toBe('door_gun');
      expect(adapter.getCrewSeat()).toBe('door_gun');
      // Player is now crewing the door gun, and the reticle is the door-gun cross.
      expect(gunModel.setPlayerDoorGunCrewing).toHaveBeenLastCalledWith('heli_gun', true);
      expect(renderer.setCrosshairMode).toHaveBeenLastCalledWith('door_gun');

      expect(adapter.toggleDoorGunSeat()).toBe('pilot');
      expect(adapter.getCrewSeat()).toBe('pilot');
      // Gun released back to the AI crew; pilot reticle restored (gunship variant).
      expect(gunModel.setPlayerDoorGunCrewing).toHaveBeenLastCalledWith('heli_gun', false);
      expect(renderer.setCrosshairMode).toHaveBeenLastCalledWith('helicopter_gunship');
    });

    it('is a no-op on an aircraft with no door gun', () => {
      const noGunModel = createMockHelicopterModel({ hasDoorGun: false, role: 'transport' });
      adapter = new HelicopterPlayerAdapter(noGunModel as any);
      adapter.onEnter(createTransitionContext(createPlayerState(), 'heli_unarmed'));

      expect(adapter.toggleDoorGunSeat()).toBe('pilot');
      expect(adapter.getCrewSeat()).toBe('pilot');
      expect(noGunModel.setPlayerDoorGunCrewing).not.toHaveBeenCalled();
    });

    it('clamps the door-gun aim to its mechanical arc stops', () => {
      const { gunModel } = boardGunship();
      adapter.toggleDoorGunSeat();

      // A huge sustained right-drag must pin the gun at its yaw limit, not run away.
      for (let i = 0; i < 50; i++) {
        adapter.update(createUpdateContext({ mouse: { x: 400, y: -400 } }).ctx);
      }
      const aim = adapter.getDoorGunAim();
      // Pinned against a yaw stop and an elevation stop (a real limit, not NaN/runaway).
      expect(Math.abs(aim.yaw)).toBeLessThanOrEqual(1.21);
      expect(Math.abs(aim.pitch)).toBeLessThanOrEqual(0.91);
      expect(adapter.getDoorGunTraverseStop()).not.toBeNull();
      expect(gunModel.firePlayerDoorGun).toHaveBeenCalled();
    });

    it('routes the held trigger to the existing door-gun fire path with the clamped aim', () => {
      const { gunModel } = boardGunship();
      adapter.toggleDoorGunSeat();

      adapter.update(createUpdateContext({ fire: true }).ctx);

      expect(gunModel.firePlayerDoorGun).toHaveBeenCalled();
      const call = gunModel.firePlayerDoorGun.mock.calls.at(-1)!;
      // (heliId, position, quaternion, aimDir, fire, dt)
      expect(call[0]).toBe('heli_gun');
      expect(call[4]).toBe(true); // trigger held
      const aimDir = call[3] as THREE.Vector3;
      // Centered aim points straight out the left door (local -X, identity pose).
      expect(aimDir.x).toBeLessThan(-0.9);
      expect(aimDir.length()).toBeCloseTo(1, 5);
    });

    it('surfaces the door-gun belt count to the HUD weapon-status slot while crewing', () => {
      boardGunship();
      adapter.toggleDoorGunSeat();
      const built = createUpdateContext();
      adapter.update(built.ctx);
      expect(built.setHelicopterWeaponStatus).toHaveBeenCalledWith('M60 Door Gun', 500);
    });

    it('releases the door gun when the player dismounts straight from the gun seat', () => {
      const { gunModel, ctx } = boardGunship();
      adapter.toggleDoorGunSeat();
      expect(adapter.getCrewSeat()).toBe('door_gun');

      adapter.onExit(ctx);

      expect(gunModel.setPlayerDoorGunCrewing).toHaveBeenLastCalledWith('heli_gun', false);
      expect((ctx.gameRenderer as any).setCrosshairMode).toHaveBeenLastCalledWith('infantry');
      expect(adapter.getCrewSeat()).toBe('pilot');
    });
  });
});
