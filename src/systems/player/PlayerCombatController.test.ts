// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PlayerCombatController } from './PlayerCombatController';
import { WeaponSlot } from './InventoryManager';
import type { PlayerState } from '../../types';

function makePlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
    position: new THREE.Vector3(),
    ...overrides,
  } as unknown as PlayerState;
}

describe('PlayerCombatController — flight-vehicle fire routing', () => {
  let controller: PlayerCombatController;
  let helicopterModel: { startFiring: ReturnType<typeof vi.fn>; stopFiring: ReturnType<typeof vi.fn> };
  let fixedWingModel: { startFiring: ReturnType<typeof vi.fn>; stopFiring: ReturnType<typeof vi.fn> };
  let weaponInput: { triggerFireStart: ReturnType<typeof vi.fn>; triggerFireStop: ReturnType<typeof vi.fn> };
  const camera = new THREE.PerspectiveCamera();

  beforeEach(() => {
    controller = new PlayerCombatController();
    helicopterModel = { startFiring: vi.fn(), stopFiring: vi.fn() };
    fixedWingModel = { startFiring: vi.fn(), stopFiring: vi.fn() };
    weaponInput = { triggerFireStart: vi.fn(), triggerFireStop: vi.fn() };
    controller.configure({
      helicopterModel: helicopterModel as any,
      fixedWingModel: fixedWingModel as any,
      firstPersonWeapon: { getWeaponInput: () => weaponInput } as any,
    });
  });

  it('routes beginFire to the fixed-wing cannon when seated in a fixed-wing aircraft', () => {
    const state = makePlayerState({ isInFixedWing: true, fixedWingId: 'fw-1' });

    controller.beginFire(state, WeaponSlot.PRIMARY, camera);

    expect(fixedWingModel.startFiring).toHaveBeenCalledWith('fw-1');
    expect(weaponInput.triggerFireStart).not.toHaveBeenCalled();
    expect(helicopterModel.startFiring).not.toHaveBeenCalled();
  });

  it('routes endFire to the fixed-wing cannon when seated in a fixed-wing aircraft', () => {
    const state = makePlayerState({ isInFixedWing: true, fixedWingId: 'fw-1' });

    controller.endFire(state, WeaponSlot.PRIMARY);

    expect(fixedWingModel.stopFiring).toHaveBeenCalledWith('fw-1');
    expect(weaponInput.triggerFireStop).not.toHaveBeenCalled();
  });

  it('does not fire the fixed-wing cannon when on foot — falls through to the held weapon', () => {
    const state = makePlayerState();

    controller.beginFire(state, WeaponSlot.PRIMARY, camera);

    expect(fixedWingModel.startFiring).not.toHaveBeenCalled();
    expect(weaponInput.triggerFireStart).toHaveBeenCalledTimes(1);
  });

  it('does not fire the fixed-wing cannon when the aircraft id is missing', () => {
    const state = makePlayerState({ isInFixedWing: true, fixedWingId: null });

    controller.beginFire(state, WeaponSlot.PRIMARY, camera);

    expect(fixedWingModel.startFiring).not.toHaveBeenCalled();
    expect(weaponInput.triggerFireStart).toHaveBeenCalledTimes(1);
  });
});
