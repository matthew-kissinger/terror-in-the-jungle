// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HelicopterInteraction } from './HelicopterInteraction';
import { HelicopterVehicleAdapter } from '../vehicle/HelicopterVehicleAdapter';
import { VehicleManager } from '../vehicle/VehicleManager';
import { Faction } from '../combat/types';

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: () => true,
}));

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Stub HelicopterModel surface the HelicopterVehicleAdapter reads. The seat
 * model itself lives on the adapter (pure occupancy bookkeeping), so the
 * model only needs to answer the pose / health probes the adapter forwards.
 */
function makeHeliModelStub(position: THREE.Vector3) {
  return {
    getHelicopterPositionTo: (_id: string, target: THREE.Vector3) => {
      target.copy(position);
      return true;
    },
    getHelicopterQuaternionTo: (_id: string, target: THREE.Quaternion) => {
      target.identity();
      return true;
    },
    getFlightData: () => null,
    isHelicopterDestroyed: () => false,
    getHealthPercent: () => 1,
  } as any;
}

describe('HelicopterInteraction', () => {
  it('uses effective terrain height when exiting a helicopter', () => {
    const helicopter = new THREE.Group();
    helicopter.position.set(10, 5, 20);
    const interaction = new HelicopterInteraction(
      new Map([['heli_test', helicopter]]),
      6
    );

    const playerController = {
      isInHelicopter: vi.fn(() => true),
      getHelicopterId: vi.fn(() => 'heli_test'),
      exitHelicopter: vi.fn(),
    };
    const terrainManager = {
      getHeightAt: vi.fn(() => 4),
      getEffectiveHeightAt: vi.fn(() => 12),
    };

    interaction.setPlayerController(playerController as any);
    interaction.setTerrainManager(terrainManager as any);

    interaction.exitHelicopter();

    expect(terrainManager.getEffectiveHeightAt).toHaveBeenCalledWith(13, 20);
    expect(terrainManager.getHeightAt).not.toHaveBeenCalled();
    expect(playerController.exitHelicopter).toHaveBeenCalledWith(
      expect.objectContaining({ x: 13, y: 13.5, z: 20 })
    );
  });

  it('suppresses re-entry prompts briefly after exiting a helicopter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));

    try {
      const helicopter = new THREE.Group();
      helicopter.position.set(10, 5, 20);
      const interaction = new HelicopterInteraction(
        new Map([['heli_test', helicopter]]),
        6,
      );

      let inHelicopter = true;
      const playerPosition = new THREE.Vector3(13, 5, 20);
      const playerController = {
        isInHelicopter: vi.fn(() => inHelicopter),
        isInFixedWing: vi.fn(() => false),
        getHelicopterId: vi.fn(() => 'heli_test'),
        getPosition: vi.fn(() => playerPosition),
        exitHelicopter: vi.fn(() => {
          inHelicopter = false;
        }),
        enterHelicopter: vi.fn(),
      };
      const hudSystem = {
        setInteractionContext: vi.fn(),
      };
      const terrainManager = {
        getEffectiveHeightAt: vi.fn(() => 4),
      };

      interaction.setPlayerController(playerController as any);
      interaction.setHUDSystem(hudSystem as any);
      interaction.setTerrainManager(terrainManager as any);

      interaction.exitHelicopter();
      interaction.checkPlayerProximity();

      expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(null);
      expect(playerController.enterHelicopter).not.toHaveBeenCalled();

      interaction.tryEnterHelicopter();
      expect(playerController.enterHelicopter).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1001);
      interaction.checkPlayerProximity();

      expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'vehicle-enter',
          targetId: 'heli_test',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not offer helicopter entry while the player is already in a fixed-wing aircraft', () => {
    const helicopter = new THREE.Group();
    helicopter.position.set(0, 0, 0);
    const interaction = new HelicopterInteraction(
      new Map([['heli_test', helicopter]]),
      6,
    );

    const playerController = {
      isInHelicopter: vi.fn(() => false),
      isInFixedWing: vi.fn(() => true),
      getPosition: vi.fn(() => new THREE.Vector3(1, 0, 0)),
      enterHelicopter: vi.fn(),
    };
    const hudSystem = {
      setInteractionContext: vi.fn(),
    };

    interaction.setPlayerController(playerController as any);
    interaction.setHUDSystem(hudSystem as any);

    interaction.checkPlayerProximity();
    interaction.tryEnterHelicopter();

    expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(null);
    expect(playerController.enterHelicopter).not.toHaveBeenCalled();
  });

  it('keeps a render-culled helicopter enterable when the player is on foot', () => {
    const helicopter = new THREE.Group();
    helicopter.position.set(0, 0, 0);
    helicopter.visible = false;
    const interaction = new HelicopterInteraction(
      new Map([['heli_test', helicopter]]),
      6,
    );

    const playerController = {
      isInHelicopter: vi.fn(() => false),
      isInFixedWing: vi.fn(() => false),
      getPosition: vi.fn(() => new THREE.Vector3(1, 0, 0)),
      enterHelicopter: vi.fn(),
    };
    const hudSystem = {
      setInteractionContext: vi.fn(),
    };

    interaction.setPlayerController(playerController as any);
    interaction.setHUDSystem(hudSystem as any);

    interaction.checkPlayerProximity();

    expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'vehicle-enter',
        targetId: 'heli_test',
      }),
    );

    interaction.tryEnterHelicopter();

    expect(playerController.enterHelicopter).toHaveBeenCalledWith('heli_test', expect.any(THREE.Vector3));
  });
});

describe('HelicopterInteraction seat truth (vehicle-seat-lifecycle)', () => {
  function buildHeliHarness() {
    const heliPos = new THREE.Vector3(10, 5, 20);
    const group = new THREE.Group();
    group.position.copy(heliPos);

    const vehicleManager = new VehicleManager();
    const adapter = new HelicopterVehicleAdapter(
      'heli_test',
      'UH1_HUEY',
      Faction.US,
      makeHeliModelStub(heliPos),
    );
    vehicleManager.register(adapter);

    const interaction = new HelicopterInteraction(new Map([['heli_test', group]]), 6);
    interaction.setSeatBinder(vehicleManager);

    const playerController = {
      isInHelicopter: vi.fn(() => false),
      isInFixedWing: vi.fn(() => false),
      getPosition: vi.fn(() => new THREE.Vector3(11, 5, 20)),
      enterHelicopter: vi.fn(),
      exitHelicopter: vi.fn(),
      getHelicopterId: vi.fn(() => 'heli_test'),
    };
    const hudSystem = { setInteractionContext: vi.fn() };
    interaction.setPlayerController(playerController as any);
    interaction.setHUDSystem(hudSystem as any);

    return { interaction, adapter, playerController };
  }

  it('locks the pilot seat on the IVehicle adapter when boarding via interaction', () => {
    const { interaction, adapter, playerController } = buildHeliHarness();

    // Repro: before boarding the pilot seat is free (no ghost).
    expect(adapter.getPilotId()).toBeNull();

    interaction.tryEnterHelicopter();

    // The player controller starts the flight session AND the IVehicle seat
    // reflects the player as pilot — no getPilotId() === null desync while
    // flying.
    expect(playerController.enterHelicopter).toHaveBeenCalledWith('heli_test', expect.any(THREE.Vector3));
    expect(adapter.getPilotId()).toBe('player');
  });

  it('does not double-occupy when boarding is attempted twice', () => {
    const { interaction, adapter } = buildHeliHarness();

    interaction.tryEnterHelicopter();
    // Simulate a stray second board attempt (idempotency guard): the player
    // must not end up locked into a second seat.
    interaction.tryEnterHelicopter();

    const playerSeats = adapter.getSeats().filter((s) => s.occupantId === 'player');
    expect(playerSeats).toHaveLength(1);
    expect(adapter.getPilotId()).toBe('player');
  });
});
