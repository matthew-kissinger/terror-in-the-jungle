/**
 * @vitest-environment jsdom
 *
 * Vehicle control update tests moved to:
 * - HelicopterPlayerAdapter.test.ts
 * - FixedWingPlayerAdapter.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { PlayerVehicleController } from './PlayerVehicleController';
import type { PlayerState } from '../../types';
import * as THREE from 'three';

function createPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
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
    ...overrides,
  };
}

describe('PlayerVehicleController', () => {
  it('handleEnterExitVehicle exits helicopter when in helicopter', () => {
    const vehicle = new PlayerVehicleController();
    const exitHelicopter = vi.fn();
    vehicle.configure({ helicopterModel: { exitHelicopter } as any });

    const ps = createPlayerState({ isInHelicopter: true, helicopterId: 'heli_1' });
    vehicle.handleEnterExitVehicle(ps);

    expect(exitHelicopter).toHaveBeenCalled();
  });

  it('handleEnterExitVehicle exits fixed-wing when in fixed-wing', () => {
    const vehicle = new PlayerVehicleController();
    const exitAircraft = vi.fn();
    vehicle.configure({ fixedWingModel: { exitAircraft } as any });

    const ps = createPlayerState({ isInFixedWing: true, fixedWingId: 'fw_1' });
    vehicle.handleEnterExitVehicle(ps);

    expect(exitAircraft).toHaveBeenCalled();
  });

  it('handleEnterExitVehicle tries fixed-wing first when on foot', () => {
    const vehicle = new PlayerVehicleController();
    const tryEnterAircraft = vi.fn(() => true);
    vehicle.configure({ fixedWingModel: { tryEnterAircraft } as any });

    const ps = createPlayerState();
    vehicle.handleEnterExitVehicle(ps);

    expect(tryEnterAircraft).toHaveBeenCalled();
  });
});
