// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import {
  createStartupPlayerRuntimeGroups,
  wireStartupPlayerRuntime,
} from './StartupPlayerRuntimeComposer';

function createRefs() {
  const layout = {
    getSlot: vi.fn((name: string) => ({ id: `${name}-slot` })),
  };

  let spectatorProvider: (() => Array<{ id: string; position: THREE.Vector3; faction: Faction }>) | undefined;
  let currentContext = {
    alliance: Alliance.BLUFOR,
    faction: Faction.US,
  };
  const currentLoadout = {
    primaryWeapon: 'm16',
    secondaryWeapon: 'm1911',
    equipment: 'frag_grenade',
  };
  const statsTracker = {};

  const refs = {
    audioManager: {},
    cameraShakeSystem: {},
    combatantSystem: {
      setPlayerFaction: vi.fn(),
      getAllCombatants: vi.fn(() => [
        { id: 'alpha', faction: Faction.US, health: 100, isDying: false, position: new THREE.Vector3(1, 0, 1) },
        { id: 'bravo', faction: Faction.US, health: 0, isDying: false, position: new THREE.Vector3(2, 0, 2) },
        { id: 'charlie', faction: Faction.NVA, health: 100, isDying: false, position: new THREE.Vector3(3, 0, 3) },
      ]),
    },
    commandInputManager: {
      mountTo: vi.fn(),
      setCombatantSystem: vi.fn(),
      setGameModeManager: vi.fn(),
      setPlayerController: vi.fn(),
      setZoneQuery: vi.fn(),
    },
    compassSystem: {
      mountTo: vi.fn(),
      setZoneQuery: vi.fn(),
      setVehicleQuery: vi.fn(),
    },
    firstPersonWeapon: {
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setInventoryManager: vi.fn(),
      setPlayerController: vi.fn(),
      setPlayerFaction: vi.fn(),
      setStatsTracker: vi.fn(),
      setTicketSystem: vi.fn(),
      setZoneManager: vi.fn(),
    },
    footstepAudioSystem: {
      setTerrainSystem: vi.fn(),
    },
    fullMapSystem: {
      setCombatantSystem: vi.fn(),
      setGameModeManager: vi.fn(),
      setZoneQuery: vi.fn(),
    },
    gameModeManager: {},
    grenadeSystem: {},
    helicopterModel: {},
    helipadSystem: {},
    hudSystem: {
      getStatsTracker: vi.fn(() => statsTracker),
      getLayout: vi.fn(() => layout),
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setMortarSystem: vi.fn(),
      setTicketSystem: vi.fn(),
      setZoneQuery: vi.fn(),
    },
    inventoryManager: {
      setLoadout: vi.fn(),
    },
    loadoutService: {
      getContext: vi.fn(() => ({ mode: 'zone_control', ...currentContext })),
      getCurrentLoadout: vi.fn(() => currentLoadout),
    },
    minimapSystem: {
      mountTo: vi.fn(),
      setCombatantSystem: vi.fn(),
      setZoneQuery: vi.fn(),
    },
    mortarSystem: {},
    playerController: {
      configureDependencies: vi.fn(),
      setCameraShakeSystem: vi.fn(),
      setCommandInputManager: vi.fn(),
      setFirstPersonWeapon: vi.fn(),
      setFootstepAudioSystem: vi.fn(),
      setGameModeManager: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setHelicopterModel: vi.fn(),
      setInventoryManager: vi.fn(),
      setMortarSystem: vi.fn(),
      setPlayerFaction: vi.fn(),
      setPlayerSquadController: vi.fn(),
      setRenderer: vi.fn(),
      setSandbagSystem: vi.fn(),
      setSpectatorCandidateProvider: vi.fn((provider: typeof spectatorProvider) => {
        spectatorProvider = provider;
      }),
      setTerrainSystem: vi.fn(),
      setTicketSystem: vi.fn(),
      // Boarding-factory wire (VEKHIKL-UX-2 split B). The composer
      // captures internals through `getBoardingFactoryInternals()` and
      // wires a factory back via `setPlayerVehicleAdapterFactory()`.
      getBoardingFactoryInternals: vi.fn(() => ({
        vehicleSessionController: { registerAdapter: vi.fn(), enterVehicle: vi.fn(), isInVehicle: vi.fn(() => false), getVehicleId: vi.fn(() => null) },
        playerState: { position: new THREE.Vector3() },
        input: {},
        cameraController: {},
        setPosition: vi.fn(),
      })),
      getBoardingProximityChecker: vi.fn(() => undefined),
      setPlayerVehicleAdapterFactory: vi.fn(),
    },
    playerHealthSystem: {
      mountUI: vi.fn(),
      setCamera: vi.fn(),
      setHUDSystem: vi.fn(),
      setPlayerController: vi.fn(),
      setPlayerFaction: vi.fn(),
      setRespawnManager: vi.fn(),
      setFirstPersonWeapon: vi.fn(),
      setTicketSystem: vi.fn(),
      setZoneManager: vi.fn(),
    },
    playerRespawnManager: {
      setFirstPersonWeapon: vi.fn(),
      setGameModeManager: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHelipadSystem: vi.fn(),
      setInventoryManager: vi.fn(),
      setLoadoutService: vi.fn(),
      setPlayerController: vi.fn(),
      setPlayerHealthSystem: vi.fn(),
      setTerrainSystem: vi.fn(),
      setWarSimulator: vi.fn(),
      setZoneManager: vi.fn(),
    },
    playerSquadController: {
      mountIndicatorTo: vi.fn(),
    },
    playerSuppressionSystem: {
      setCameraShakeSystem: vi.fn(),
      setPlayerController: vi.fn(),
    },
    sandbagSystem: {},
    terrainSystem: {},
    ticketSystem: {},
    vehicleManager: {
      getAllVehicles: vi.fn(() => []),
    },
    warSimulator: {},
    zoneManager: {
      setPlayerAlliance: vi.fn(),
    },
  } as any;

  return {
    refs,
    layout,
    statsTracker,
    getSpectatorProvider: () => spectatorProvider,
    setContext: (next: { alliance: Alliance; faction: Faction }) => {
      currentContext = next;
    },
    currentLoadout,
  };
}

describe('StartupPlayerRuntimeComposer', () => {
  it('wires startup/player/deploy dependencies and applies the active loadout', () => {
    const { refs, layout, currentLoadout, statsTracker } = createRefs();
    const camera = new THREE.PerspectiveCamera();
    const renderer = { renderer: {} } as any;

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), { camera, renderer });

    expect(refs.playerController.configureDependencies).toHaveBeenCalledWith(expect.objectContaining({
      terrainSystem: refs.terrainSystem,
      renderer,
      helicopterModel: refs.helicopterModel,
      firstPersonWeapon: refs.firstPersonWeapon,
      hudSystem: refs.hudSystem,
    }));
    expect(refs.playerHealthSystem.setRespawnManager).toHaveBeenCalledWith(refs.playerRespawnManager);
    expect(refs.hudSystem.setGrenadeSystem).toHaveBeenCalledWith(refs.grenadeSystem);
    expect(refs.hudSystem.setMortarSystem).toHaveBeenCalledWith(refs.mortarSystem);
    expect(refs.firstPersonWeapon.setStatsTracker).toHaveBeenCalledWith(statsTracker);
    expect(refs.playerRespawnManager.setLoadoutService).toHaveBeenCalledWith(refs.loadoutService);
    expect(refs.playerRespawnManager.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.inventoryManager.setLoadout).toHaveBeenCalledWith(currentLoadout);
    expect(refs.playerController.setPlayerFaction).toHaveBeenCalledWith(Faction.US);
    expect(refs.zoneManager.setPlayerAlliance).toHaveBeenCalledWith(Alliance.BLUFOR);
    expect(refs.commandInputManager.mountTo).toHaveBeenCalledWith(layout);
  });

  it('wires a compass vehicle query adapter that filters out destroyed vehicles and aircraft', () => {
    const { refs } = createRefs();
    const drivableJeep = {
      vehicleId: 'm151_a',
      category: 'ground',
      faction: Faction.US,
      getPosition: () => new THREE.Vector3(10, 0, 20),
      isDestroyed: () => false,
    };
    const destroyedTank = {
      vehicleId: 'm48_dead',
      category: 'ground',
      faction: Faction.US,
      getPosition: () => new THREE.Vector3(0, 0, 0),
      isDestroyed: () => true,
    };
    const heli = {
      vehicleId: 'huey_alpha',
      category: 'helicopter',
      faction: Faction.US,
      getPosition: () => new THREE.Vector3(100, 100, 0),
      isDestroyed: () => false,
    };
    refs.vehicleManager.getAllVehicles = vi.fn(() => [drivableJeep, destroyedTank, heli]);

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
    });

    expect(refs.compassSystem.setVehicleQuery).toHaveBeenCalledTimes(1);
    const query = refs.compassSystem.setVehicleQuery.mock.calls[0][0] as {
      getVehicleMarkers: () => Array<{ vehicleId: string; category: string }>;
    };
    expect(query).toBeDefined();
    const markers = query.getVehicleMarkers();
    // Aircraft + destroyed entries are dropped; only the live ground vehicle survives.
    expect(markers.map(m => m.vehicleId)).toEqual(['m151_a']);
    expect(markers[0].category).toBe('ground');
  });

  it('reuses compass vehicle marker records across refreshes and prunes stale vehicles', () => {
    const { refs } = createRefs();
    const drivableJeep = {
      vehicleId: 'm151_a',
      category: 'ground',
      faction: Faction.US,
      position: new THREE.Vector3(10, 0, 20),
      destroyed: false,
      getPosition() {
        return this.position;
      },
      isDestroyed() {
        return this.destroyed;
      },
    };
    refs.vehicleManager.getAllVehicles = vi.fn(() => [drivableJeep]);

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
    });

    const query = refs.compassSystem.setVehicleQuery.mock.calls[0][0] as {
      getVehicleMarkers: () => Array<{ vehicleId: string; position: THREE.Vector3 }>;
    };
    const firstMarkers = query.getVehicleMarkers();
    const firstEntry = firstMarkers[0];

    drivableJeep.position = new THREE.Vector3(12, 0, 25);
    const secondMarkers = query.getVehicleMarkers();

    expect(secondMarkers).toBe(firstMarkers);
    expect(secondMarkers[0]).toBe(firstEntry);
    expect(secondMarkers[0].position).toBe(drivableJeep.position);

    drivableJeep.destroyed = true;
    expect(query.getVehicleMarkers()).toHaveLength(0);

    drivableJeep.destroyed = false;
    const thirdMarkers = query.getVehicleMarkers();
    expect(thirdMarkers).toBe(firstMarkers);
    expect(thirdMarkers[0]).not.toBe(firstEntry);
    expect(thirdMarkers[0].vehicleId).toBe('m151_a');
  });

  it('uses the allocation-free compass vehicle iterator when the manager exposes one', () => {
    const { refs } = createRefs();
    const drivableJeep = {
      vehicleId: 'm151_a',
      category: 'ground',
      faction: Faction.US,
      getPosition: () => new THREE.Vector3(10, 0, 20),
      isDestroyed: () => false,
    };
    refs.vehicleManager.getAllVehicles = vi.fn(() => {
      throw new Error('getAllVehicles should not be used when forEachVehicle is available');
    });
    refs.vehicleManager.forEachVehicle = vi.fn((visitor: (vehicle: typeof drivableJeep) => void) => {
      visitor(drivableJeep);
    });

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
    });

    const query = refs.compassSystem.setVehicleQuery.mock.calls[0][0] as {
      getVehicleMarkers: () => Array<{ vehicleId: string; category: string }>;
    };
    expect(query.getVehicleMarkers()).toEqual([
      expect.objectContaining({ vehicleId: 'm151_a', category: 'ground' }),
    ]);
    expect(refs.vehicleManager.forEachVehicle).toHaveBeenCalledTimes(1);
    expect(refs.vehicleManager.getAllVehicles).not.toHaveBeenCalled();
  });

  it('wires the boarding-factory back into the player controller when the seam exists (VEKHIKL-UX-2)', () => {
    const { refs } = createRefs();

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
    });

    expect(refs.playerController.getBoardingFactoryInternals).toHaveBeenCalled();
    expect(refs.playerController.setPlayerVehicleAdapterFactory).toHaveBeenCalledTimes(1);
    const factory = refs.playerController.setPlayerVehicleAdapterFactory.mock.calls[0][0];
    expect(factory).toBeDefined();
    // Factory exposes the surface PlayerController will call through it.
    expect(typeof factory.tryBoardNearest).toBe('function');
    expect(typeof factory.tryExit).toBe('function');
  });

  it('skips the boarding-factory wire on legacy controllers that lack the seam', () => {
    const { refs } = createRefs();
    // Strip the boarding-factory seam to model a pre-split-B controller
    // (or a test double that doesn't know about it). The composer must
    // tolerate this without exploding.
    delete (refs.playerController as any).getBoardingFactoryInternals;
    delete (refs.playerController as any).setPlayerVehicleAdapterFactory;

    expect(() =>
      wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
        camera: new THREE.PerspectiveCamera(),
      }),
    ).not.toThrow();
  });

  it('builds spectator candidates from the live loadout context instead of a startup snapshot', () => {
    const { refs, getSpectatorProvider, setContext } = createRefs();

    wireStartupPlayerRuntime(createStartupPlayerRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
    });

    const provider = getSpectatorProvider();
    expect(provider).toBeDefined();

    expect(provider?.().map(candidate => candidate.id)).toEqual(['alpha']);

    setContext({
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    });

    expect(provider?.().map(candidate => candidate.id)).toEqual(['charlie']);
  });
});
