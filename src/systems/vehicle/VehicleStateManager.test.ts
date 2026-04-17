import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { VehicleStateManager } from './VehicleStateManager';
import type { PlayerVehicleAdapter, VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function createMockAdapter(vehicleType: string): PlayerVehicleAdapter & {
  onEnter: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  resetControlState: ReturnType<typeof vi.fn>;
} {
  return {
    vehicleType,
    inputContext: vehicleType === 'helicopter' ? 'helicopter' : 'fixed_wing',
    onEnter: vi.fn(),
    onExit: vi.fn(),
    update: vi.fn(),
    resetControlState: vi.fn(),
  };
}

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 10,
    runSpeed: 20,
    isRunning: false,
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

function createTransitionContext(playerState: PlayerState, vehicleId = 'test-vehicle'): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(10, 20, 30),
    setPosition: vi.fn(),
    input: { setInHelicopter: vi.fn(), setFlightVehicleMode: vi.fn() } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
      getFlightMouseControlEnabled: vi.fn(() => false),
      getHelicopterMouseControlEnabled: vi.fn(() => false),
    } as any,
  };
}

function createUpdateContext(): VehicleUpdateContext {
  return {
    deltaTime: 0.016,
    input: {} as any,
    cameraController: {} as any,
  };
}

describe('VehicleStateManager', () => {
  let manager: VehicleStateManager;
  let heliAdapter: ReturnType<typeof createMockAdapter>;
  let fwAdapter: ReturnType<typeof createMockAdapter>;
  let playerState: PlayerState;

  beforeEach(() => {
    manager = new VehicleStateManager();
    heliAdapter = createMockAdapter('helicopter');
    fwAdapter = createMockAdapter('fixed_wing');
    playerState = createPlayerState();
    manager.registerAdapter(heliAdapter);
    manager.registerAdapter(fwAdapter);
  });

  it('starts outside any vehicle', () => {
    expect(manager.isInVehicle()).toBe(false);
    expect(manager.getVehicleType()).toBeNull();
    expect(manager.getVehicleId()).toBeNull();
    expect(manager.getActiveAdapter()).toBeNull();
  });

  describe('entering a vehicle', () => {
    it('activates the matching adapter and marks the player as riding the helicopter', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      const result = manager.enterVehicle('helicopter', 'heli_1', ctx);

      expect(result).toBe(true);
      expect(manager.isInVehicle()).toBe(true);
      expect(manager.getVehicleType()).toBe('helicopter');
      expect(manager.getVehicleId()).toBe('heli_1');
      expect(manager.getActiveAdapter()).toBe(heliAdapter);
      expect(heliAdapter.onEnter).toHaveBeenCalledOnce();

      // PlayerState flags reflect helicopter membership, not fixed-wing.
      expect(playerState.isInHelicopter).toBe(true);
      expect(playerState.helicopterId).toBe('heli_1');
      expect(playerState.isInFixedWing).toBe(false);
      expect(playerState.fixedWingId).toBeNull();
    });

    it('marks the player as riding a fixed-wing when entering that vehicle type', () => {
      const ctx = createTransitionContext(playerState, 'fw_1');
      manager.enterVehicle('fixed_wing', 'fw_1', ctx);

      expect(playerState.isInFixedWing).toBe(true);
      expect(playerState.fixedWingId).toBe('fw_1');
      expect(playerState.isInHelicopter).toBe(false);
      expect(playerState.helicopterId).toBeNull();
    });

    it('refuses to enter an unknown vehicle type', () => {
      const ctx = createTransitionContext(playerState);
      const result = manager.enterVehicle('boat', 'boat_1', ctx);
      expect(result).toBe(false);
      expect(manager.isInVehicle()).toBe(false);
    });

    it('swaps cleanly between vehicles (helicopter -> fixed_wing)', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);

      const ctx2 = createTransitionContext(playerState, 'fw_1');
      manager.enterVehicle('fixed_wing', 'fw_1', ctx2);

      expect(heliAdapter.onExit).toHaveBeenCalledOnce();
      expect(heliAdapter.resetControlState).toHaveBeenCalled();
      expect(fwAdapter.onEnter).toHaveBeenCalledOnce();
      expect(manager.getVehicleType()).toBe('fixed_wing');
      expect(playerState.isInHelicopter).toBe(false);
      expect(playerState.isInFixedWing).toBe(true);
    });
  });

  describe('exiting a vehicle', () => {
    it('returns the player to infantry, notifies the adapter, and clears PlayerState flags', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);
      manager.exitVehicle(ctx);

      expect(manager.isInVehicle()).toBe(false);
      expect(heliAdapter.onExit).toHaveBeenCalledOnce();
      expect(heliAdapter.resetControlState).toHaveBeenCalled();
      expect(playerState.isInHelicopter).toBe(false);
      expect(playerState.helicopterId).toBeNull();
      expect(playerState.isInFixedWing).toBe(false);
      expect(playerState.fixedWingId).toBeNull();
    });

    it('is a no-op when the player is already on foot', () => {
      const ctx = createTransitionContext(playerState);
      manager.exitVehicle(ctx);
      expect(heliAdapter.onExit).not.toHaveBeenCalled();
      expect(fwAdapter.onExit).not.toHaveBeenCalled();
    });
  });

  describe('per-frame update', () => {
    it('drives the active adapter while riding a vehicle', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);

      const updateCtx = createUpdateContext();
      manager.update(updateCtx);

      expect(heliAdapter.update).toHaveBeenCalledWith(updateCtx);
    });

    it('does nothing while the player is on foot', () => {
      const updateCtx = createUpdateContext();
      manager.update(updateCtx);
      expect(heliAdapter.update).not.toHaveBeenCalled();
      expect(fwAdapter.update).not.toHaveBeenCalled();
    });
  });
});
