/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { PlayerVehicleController } from './PlayerVehicleController';
import type { PlayerMovement } from './PlayerMovement';
import type { PlayerInput } from './PlayerInput';
import type { PlayerCamera } from './PlayerCamera';

describe('PlayerVehicleController', () => {
  it('skips addMouseControlToHelicopter when touch helicopter mode is active', () => {
    const vehicle = new PlayerVehicleController();
    const addMouse = vi.fn();
    const updateHeli = vi.fn();
    const movement = { updateHelicopterControls: updateHeli, addMouseControlToHelicopter: addMouse } as unknown as PlayerMovement;
    const input = {
      getTouchControls: () => ({ isInHelicopterMode: () => true }),
      getIsPointerLocked: () => true,
      getMouseMovement: () => ({ x: 0.5, y: 0.25 }),
      clearMouseMovement: vi.fn(),
    } as unknown as PlayerInput;
    const camera = { getHelicopterMouseControlEnabled: () => true } as unknown as PlayerCamera;

    vehicle.updateHelicopterMode(0.016, movement, input, camera);

    expect(updateHeli).toHaveBeenCalled();
    expect(addMouse).not.toHaveBeenCalled();
  });

  it('applies addMouseControlToHelicopter when not in touch helicopter mode', () => {
    const vehicle = new PlayerVehicleController();
    const addMouse = vi.fn();
    const updateHeli = vi.fn();
    const clearMouseMovement = vi.fn();
    const movement = {
      updateHelicopterControls: updateHeli,
      addMouseControlToHelicopter: addMouse,
    } as unknown as PlayerMovement;
    const input = {
      getTouchControls: () => ({ isInHelicopterMode: () => false }),
      getIsPointerLocked: () => true,
      getMouseMovement: () => ({ x: 0.1, y: -0.2 }),
      clearMouseMovement,
    } as unknown as PlayerInput;
    const camera = { getHelicopterMouseControlEnabled: () => true } as unknown as PlayerCamera;

    vehicle.updateHelicopterMode(0.016, movement, input, camera);

    expect(updateHeli).toHaveBeenCalledWith(
      0.016,
      input,
      undefined,
      { x: 0.1, y: -0.2 },
    );
    expect(addMouse).not.toHaveBeenCalled();
    expect(clearMouseMovement).toHaveBeenCalled();
  });

  it('skips addMouseControlToHelicopter when helicopter mouse mode disabled', () => {
    const vehicle = new PlayerVehicleController();
    const addMouse = vi.fn();
    const movement = { updateHelicopterControls: vi.fn(), addMouseControlToHelicopter: addMouse } as unknown as PlayerMovement;
    const input = {
      getTouchControls: () => null,
      getIsPointerLocked: () => true,
      getMouseMovement: () => ({ x: 1, y: 1 }),
      clearMouseMovement: vi.fn(),
    } as unknown as PlayerInput;
    const camera = { getHelicopterMouseControlEnabled: () => false } as unknown as PlayerCamera;

    vehicle.updateHelicopterMode(0.016, movement, input, camera);

    expect(addMouse).not.toHaveBeenCalled();
  });
});
