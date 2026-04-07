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

  describe('initial state', () => {
    it('starts as infantry', () => {
      expect(manager.isInVehicle()).toBe(false);
      expect(manager.getVehicleType()).toBeNull();
      expect(manager.getVehicleId()).toBeNull();
      expect(manager.getActiveAdapter()).toBeNull();
    });
  });

  describe('enterVehicle', () => {
    it('transitions to in_vehicle and calls adapter.onEnter', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      const result = manager.enterVehicle('helicopter', 'heli_1', ctx);

      expect(result).toBe(true);
      expect(manager.isInVehicle()).toBe(true);
      expect(manager.getVehicleType()).toBe('helicopter');
      expect(manager.getVehicleId()).toBe('heli_1');
      expect(manager.getActiveAdapter()).toBe(heliAdapter);
      expect(heliAdapter.onEnter).toHaveBeenCalledOnce();
    });

    it('syncs PlayerState flags for helicopter', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);

      expect(playerState.isInHelicopter).toBe(true);
      expect(playerState.helicopterId).toBe('heli_1');
      expect(playerState.isInFixedWing).toBe(false);
      expect(playerState.fixedWingId).toBeNull();
    });

    it('syncs PlayerState flags for fixed_wing', () => {
      const ctx = createTransitionContext(playerState, 'fw_1');
      manager.enterVehicle('fixed_wing', 'fw_1', ctx);

      expect(playerState.isInFixedWing).toBe(true);
      expect(playerState.fixedWingId).toBe('fw_1');
      expect(playerState.isInHelicopter).toBe(false);
      expect(playerState.helicopterId).toBeNull();
    });

    it('returns false for unregistered vehicle type', () => {
      const ctx = createTransitionContext(playerState);
      const result = manager.enterVehicle('boat', 'boat_1', ctx);

      expect(result).toBe(false);
      expect(manager.isInVehicle()).toBe(false);
    });

    it('exits current vehicle before entering new one (helicopter -> fixed_wing)', () => {
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

  describe('exitVehicle', () => {
    it('transitions to infantry and calls adapter.onExit + resetControlState', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);
      manager.exitVehicle(ctx);

      expect(manager.isInVehicle()).toBe(false);
      expect(heliAdapter.onExit).toHaveBeenCalledOnce();
      expect(heliAdapter.resetControlState).toHaveBeenCalled();
    });

    it('clears all PlayerState flags on exit', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);
      manager.exitVehicle(ctx);

      expect(playerState.isInHelicopter).toBe(false);
      expect(playerState.helicopterId).toBeNull();
      expect(playerState.isInFixedWing).toBe(false);
      expect(playerState.fixedWingId).toBeNull();
    });

    it('is a no-op when already infantry', () => {
      const ctx = createTransitionContext(playerState);
      manager.exitVehicle(ctx);

      expect(heliAdapter.onExit).not.toHaveBeenCalled();
      expect(fwAdapter.onExit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('delegates to active adapter', () => {
      const ctx = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx);

      const updateCtx = createUpdateContext();
      manager.update(updateCtx);

      expect(heliAdapter.update).toHaveBeenCalledWith(updateCtx);
    });

    it('is a no-op when infantry', () => {
      const updateCtx = createUpdateContext();
      manager.update(updateCtx);

      expect(heliAdapter.update).not.toHaveBeenCalled();
      expect(fwAdapter.update).not.toHaveBeenCalled();
    });
  });

  describe('full lifecycle: helicopter -> exit -> fixed_wing -> exit', () => {
    it('handles the full transition cleanly', () => {
      const ctx1 = createTransitionContext(playerState, 'heli_1');
      manager.enterVehicle('helicopter', 'heli_1', ctx1);
      expect(playerState.isInHelicopter).toBe(true);

      manager.exitVehicle(ctx1);
      expect(playerState.isInHelicopter).toBe(false);
      expect(manager.isInVehicle()).toBe(false);

      const ctx2 = createTransitionContext(playerState, 'fw_1');
      manager.enterVehicle('fixed_wing', 'fw_1', ctx2);
      expect(playerState.isInFixedWing).toBe(true);
      expect(playerState.isInHelicopter).toBe(false);

      manager.exitVehicle(ctx2);
      expect(playerState.isInFixedWing).toBe(false);
      expect(manager.isInVehicle()).toBe(false);

      // All adapters properly cleaned up
      expect(heliAdapter.onEnter).toHaveBeenCalledTimes(1);
      expect(heliAdapter.onExit).toHaveBeenCalledTimes(1);
      expect(fwAdapter.onEnter).toHaveBeenCalledTimes(1);
      expect(fwAdapter.onExit).toHaveBeenCalledTimes(1);
    });
  });
});
