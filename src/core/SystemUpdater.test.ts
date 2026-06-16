// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SystemUpdater } from './SystemUpdater';
import { SYSTEM_UPDATE_SCHEDULE, TRACKED_SYSTEM_KEYS } from './SystemUpdateSchedule';
import type { SystemKeyToType } from './SystemRegistry';
import { GroundVehicleProximityChecker } from '../systems/vehicle/GroundVehicleProximityChecker';
import type { AtmosphereLightingSnapshot } from '../systems/environment/AtmosphereSystem';

function createRefs(overrides: Partial<SystemKeyToType> = {}): SystemKeyToType {
  return {
    spatialGridManager: {
      resetFrameTelemetry: vi.fn(),
    },
    minimapSystem: {
      setCommandPosition: vi.fn(),
      update: vi.fn(),
    },
    fullMapSystem: {
      setCommandPosition: vi.fn(),
      getIsVisible: vi.fn(() => false),
      update: vi.fn(),
    },
    compassSystem: {
      update: vi.fn(),
    },
    hudSystem: {
      update: vi.fn(),
      showMessage: vi.fn(),
    },
    zoneManager: {
      update: vi.fn(),
    },
    ticketSystem: {
      update: vi.fn(),
    },
    weatherSystem: {
      update: vi.fn(),
    },
    playerController: {
      getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
      setPosition: vi.fn(),
      update: vi.fn(),
    },
    combatantSystem: {
      getAllCombatants: vi.fn(() => []),
      update: vi.fn(),
    },
    gameModeManager: {
      getRespawnPolicy: vi.fn(() => ({ contactAssistStyle: 'none' })),
      updateRuntime: vi.fn(),
    },
    playerRespawnManager: {
      getPolicyDrivenInsertionSuggestion: vi.fn(() => new THREE.Vector3(50, 2, 50)),
    },
    playerHealthSystem: {
      applySpawnProtection: vi.fn(),
    },
    strategicFeedback: {
      setPlayerPosition: vi.fn(),
    },
    ...overrides,
  } as unknown as SystemKeyToType;
}

describe('SystemUpdater', () => {
  it('declares manually scheduled systems as fallback-tracked', () => {
    const scheduledKeys = new Set(
      SYSTEM_UPDATE_SCHEDULE.flatMap(group => group.systems.map(system => system.key)),
    );

    expect(scheduledKeys.has('navmeshSystem')).toBe(true);
    expect(scheduledKeys.has('npcVehicleController')).toBe(true);
    expect(scheduledKeys.has('gameModeManager')).toBe(true);
    expect(new Set(TRACKED_SYSTEM_KEYS)).toEqual(scheduledKeys);
  });

  it('schedules world-state updates on a lower cadence with accumulated delta', () => {
    const updater = new SystemUpdater();
    const refs = createRefs();

    updater.updateSystems(refs, [], undefined, 0.02, true);
    updater.updateSystems(refs, [], undefined, 0.02, true);
    expect(refs.zoneManager.update).not.toHaveBeenCalled();

    updater.updateSystems(refs, [], undefined, 0.03, true);

    expect(refs.zoneManager.update).toHaveBeenCalledTimes(1);
    expect(refs.zoneManager.update).toHaveBeenCalledWith(0.07);
    expect(refs.ticketSystem.update).toHaveBeenCalledWith(0.07);
    expect(refs.weatherSystem.update).toHaveBeenCalledWith(0.07);
  });

  it('does not contain A Shau contact-assist logic (removed from core)', () => {
    const updater = new SystemUpdater();
    const refs = createRefs();

    // Run many frames - should never trigger any player teleport or HUD message
    for (let i = 0; i < 61; i++) {
      updater.updateSystems(refs, [], undefined, 1, true);
    }

    expect(refs.hudSystem.showMessage).not.toHaveBeenCalled();
    expect(refs.playerController.setPosition).not.toHaveBeenCalled();
  });

  it('does not fallback-update manually scheduled systems when they are present in the generic system list', () => {
    const updater = new SystemUpdater();
    const navmeshSystem = {
      update: vi.fn(),
    };
    const npcVehicleController = {
      update: vi.fn(),
    };
    const gameModeManager = {
      getRespawnPolicy: vi.fn(() => ({ contactAssistStyle: 'none' })),
      update: vi.fn(),
      updateRuntime: vi.fn(),
    };
    const refs = createRefs({
      navmeshSystem,
      npcVehicleController,
      gameModeManager,
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(
      refs,
      [
        navmeshSystem,
        npcVehicleController,
        gameModeManager,
      ] as unknown as Parameters<SystemUpdater['updateSystems']>[1],
      undefined,
      0.016,
      true,
    );

    expect(navmeshSystem.update).toHaveBeenCalledTimes(1);
    expect(npcVehicleController.update).toHaveBeenCalledTimes(1);
    expect(gameModeManager.updateRuntime).not.toHaveBeenCalled();
    expect(gameModeManager.update).not.toHaveBeenCalled();
  });

  it('injects the ground-vehicle proximity checker into the player controller once vehicleManager + hudSystem are present', () => {
    const updater = new SystemUpdater();
    const setBoardingProximityChecker = vi.fn();
    const vehicleManager = {
      update: vi.fn(),
      getAllVehicles: vi.fn(() => []),
    };
    const refs = createRefs({
      vehicleManager,
      playerController: {
        getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
        setPosition: vi.fn(),
        update: vi.fn(),
        isInHelicopter: vi.fn(() => false),
        isInFixedWing: vi.fn(() => false),
        isInAnyVehicle: vi.fn(() => false),
        setBoardingProximityChecker,
      },
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(refs, [], undefined, 0.016, true);

    expect(setBoardingProximityChecker).toHaveBeenCalledTimes(1);
    expect(setBoardingProximityChecker).toHaveBeenCalledWith(expect.any(GroundVehicleProximityChecker));

    // Subsequent ticks must not re-inject (the checker is lazily built once).
    updater.updateSystems(refs, [], undefined, 0.016, true);
    expect(setBoardingProximityChecker).toHaveBeenCalledTimes(1);
  });

  it('forwards the effective atmosphere lighting snapshot to billboard vegetation', () => {
    const updater = new SystemUpdater();
    const globalBillboardSystem = {
      update: vi.fn(),
    };
    const terrainSystem = {
      update: vi.fn(),
      setAtmosphereLighting: vi.fn(),
    };
    const getSunColor = vi.fn((out: THREE.Color) => out.setRGB(1, 0.2, 0.1));
    const atmosphereSystem = {
      getSunColor,
      getLightingSnapshot: vi.fn((out: AtmosphereLightingSnapshot) => {
        out.directLightColor.setRGB(0.18, 0.2, 0.3);
        out.skyColor.setRGB(0.08, 0.1, 0.16);
        out.groundColor.setRGB(0.02, 0.025, 0.04);
        out.ambientColor.setRGB(0.055, 0.07, 0.105);
        out.fogColor.setRGB(0.04, 0.05, 0.08);
        out.daylightFactor = 0;
        out.nightBlend = 1;
        out.sunAboveHorizon = false;
        return out;
      }),
      update: vi.fn(),
    };
    const refs = createRefs({
      globalBillboardSystem,
      terrainSystem,
      atmosphereSystem,
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(refs, [], new THREE.Scene(), 0.016, true);

    expect(getSunColor).not.toHaveBeenCalled();
    const lighting = globalBillboardSystem.update.mock.calls[0]?.[2];
    expect(lighting.sunColor.r).toBeCloseTo(0.18);
    expect(lighting.sunColor.b).toBeCloseTo(0.3);
    expect(lighting.skyColor.b).toBeCloseTo(0.16);
    expect(lighting.groundColor.b).toBeCloseTo(0.04);
    expect(terrainSystem.setAtmosphereLighting).toHaveBeenCalledTimes(1);
    const terrainLighting = terrainSystem.setAtmosphereLighting.mock.calls[0]?.[0];
    expect(terrainLighting.nightBlend).toBe(1);
    expect(terrainLighting.ambientColor.b).toBeCloseTo(0.105);
  });

  it('fallback-updates systems that are not declared in the explicit schedule', () => {
    const updater = new SystemUpdater();
    const genericSystem = {
      update: vi.fn(),
    };
    const refs = createRefs();

    updater.updateSystems(
      refs,
      [genericSystem] as unknown as Parameters<SystemUpdater['updateSystems']>[1],
      undefined,
      0.016,
      true,
    );

    expect(genericSystem.update).toHaveBeenCalledTimes(1);
    expect(genericSystem.update).toHaveBeenCalledWith(0.016);
  });

  it('updates Vehicles before Player so chase cameras read the post-physics pose (no heli model jitter)', () => {
    // Regression guard: piloted-vehicle physics publish an interpolated visual
    // pose during the Vehicles block, and PlayerCamera hard-copies that pose
    // during the Player block. If Player runs first, the camera samples last
    // frame's pose while the model renders at this frame's -> one-frame desync
    // that makes the helicopter visibly shake on high-refresh displays.
    const updater = new SystemUpdater();
    const order: string[] = [];
    const refs = createRefs({
      helicopterModel: { update: vi.fn(() => { order.push('vehicles'); }) },
      fixedWingModel: { update: vi.fn(() => { order.push('vehicles:fixedWing'); }) },
      vehicleManager: {
        update: vi.fn(() => { order.push('vehicles:manager'); }),
        getAllVehicles: vi.fn(() => []),
      },
      firstPersonWeapon: { update: vi.fn(() => { order.push('player:weapon'); }) },
      playerController: {
        getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
        setPosition: vi.fn(),
        update: vi.fn(() => { order.push('player:controller'); }),
      },
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(refs, [], undefined, 0.016, true);

    const vehiclesIdx = order.indexOf('vehicles');
    const playerIdx = order.indexOf('player:controller');
    expect(vehiclesIdx).toBeGreaterThanOrEqual(0);
    expect(playerIdx).toBeGreaterThanOrEqual(0);
    expect(vehiclesIdx).toBeLessThan(playerIdx);
  });

  it('records child timings for player controller and weapon attribution', () => {
    const updater = new SystemUpdater();
    const refs = createRefs({
      firstPersonWeapon: { update: vi.fn() },
      playerController: {
        getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
        setPosition: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(refs, [], undefined, 0.016, true);

    const timingNames = updater.getSystemTimings().map((timing) => timing.name);
    expect(timingNames).toContain('Player');
    expect(timingNames).toContain('Player.Controller');
    expect(timingNames).toContain('Player.Weapon');
    const playerTiming = updater.getSystemTimings().find((timing) => timing.name === 'Player');
    expect(playerTiming).toMatchObject({
      lastMs: expect.any(Number),
      emaMs: expect.any(Number),
      timeMs: expect.any(Number),
    });
    expect(playerTiming?.timeMs).toBe(playerTiming?.emaMs);
  });

  it('returns bounded top system timings by last frame without full-array materialization', () => {
    const updater = new SystemUpdater();
    const seededUpdater = updater as unknown as {
      systemTimings: Map<string, { name: string; budgetMs: number; lastMs: number; emaMs: number }>;
    };
    seededUpdater.systemTimings = new Map();
    for (let index = 0; index < 20; index++) {
      seededUpdater.systemTimings.set(`System.${index}`, {
        name: `System.${index}`,
        budgetMs: index > 17 ? 1 : 0,
        lastMs: index,
        emaMs: index / 2,
      });
    }
    seededUpdater.systemTimings.set('System.invalid', {
      name: 'System.invalid',
      budgetMs: 0,
      lastMs: -1,
      emaMs: 0,
    });

    const arrayFromSpy = vi.spyOn(Array, 'from');
    const sortSpy = vi.spyOn(Array.prototype, 'sort');

    const top = updater.getTopSystemTimingsByLast(5);
    const arrayFromCalls = arrayFromSpy.mock.calls.length;
    const sortCalls = sortSpy.mock.calls.length;

    arrayFromSpy.mockRestore();
    sortSpy.mockRestore();

    expect(arrayFromCalls).toBe(0);
    expect(sortCalls).toBe(0);
    expect(top.map((timing) => timing.name)).toEqual([
      'System.19',
      'System.18',
      'System.17',
      'System.16',
      'System.15',
    ]);
    expect(top.some((timing) => timing.name === 'System.invalid')).toBe(false);
    expect(top[0]).toMatchObject({
      name: 'System.19',
      lastMs: 19,
      emaMs: 9.5,
      timeMs: 9.5,
      budgetMs: 1,
    });
  });
});
