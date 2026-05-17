import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createOperationalRuntimeGroups,
  wireOperationalRuntime,
} from './OperationalRuntimeComposer';

function createRefs() {
  let helipadCallback: ((helipads: Array<{ id: string; position: THREE.Vector3 }>) => void) | undefined;
  let combatantProvider: (() => unknown[]) | undefined;
  const modeChangedCallbacks: Array<(mode: string, config: unknown) => void> = [];
  const explosionEffectsPool = { id: 'explosion-pool' };
  const combatants = [{ id: 'c1' }, { id: 'c2' }];
  const listener = { id: 'listener' };

  const refs = {
    aaEmplacementSystem: {
      setAudioManager: vi.fn(),
      setExplosionEffectsPool: vi.fn(),
      setHelicopterModel: vi.fn(),
      setTerrainSystem: vi.fn(),
    },
    airSupportManager: {
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setExplosionEffectsPool: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setTerrainSystem: vi.fn(),
    },
    audioManager: {
      getListener: vi.fn(() => listener),
    },
    combatantSystem: {
      combatants,
      explosionEffectsPool,
    },
    fullMapSystem: {
      setHelipadMarkers: vi.fn(),
      setWarSimulator: vi.fn(),
    },
    gameModeManager: {
      setWarSimulator: vi.fn(),
      onModeChanged: vi.fn((callback: (mode: string, config: unknown) => void) => {
        modeChangedCallbacks.push(callback);
      }),
    },
    fixedWingModel: {
      setTerrainManager: vi.fn(),
      setPlayerController: vi.fn(),
      setHUDSystem: vi.fn(),
      setVehicleManager: vi.fn(),
    },
    globalBillboardSystem: {},
    grenadeSystem: {},
    helicopterModel: {
      setAudioListener: vi.fn(),
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHeightQueryCache: vi.fn(),
      setHUDSystem: vi.fn(),
      setHelipadSystem: vi.fn(),
      setPlayerController: vi.fn(),
      setSquadDeployTerrain: vi.fn(),
      setTerrainManager: vi.fn(),
      setVehicleManager: vi.fn(),
    },
    helipadSystem: {
      onHelipadsCreated: vi.fn((callback: typeof helipadCallback) => {
        helipadCallback = callback;
      }),
      setGameModeManager: vi.fn(),
      setTerrainManager: vi.fn(),
      setVegetationSystem: vi.fn(),
    },
    hudSystem: {},
    influenceMapSystem: {},
    m2hbEmplacementSystem: {
      setCombatantSystem: vi.fn(),
      setAudioManager: vi.fn(),
    },
    minimapSystem: {
      setHelipadMarkers: vi.fn(),
      setWarSimulator: vi.fn(),
    },
    npcVehicleController: {
      setCombatantProvider: vi.fn((provider: typeof combatantProvider) => {
        combatantProvider = provider;
      }),
      setVehicleManager: vi.fn(),
    },
    playerController: {
      configureVehicleController: vi.fn(),
      setFixedWingModel: vi.fn(),
    },
    radioTransmissionSystem: {
      setAudioListener: vi.fn(),
    },
    strategicFeedback: {
      setAudioManager: vi.fn(),
      setHUDSystem: vi.fn(),
      setWarSimulator: vi.fn(),
    },
    terrainSystem: {
      getHeightAt: vi.fn((_x: number, _z: number) => 12),
    },
    ticketSystem: {},
    vehicleManager: {
      spawnScenarioM2HBEmplacements: vi.fn(() => ['m2hb_scenario_id']),
      spawnScenarioM48Tanks: vi.fn(() => ['m48_scenario_id']),
    },
    warSimulator: {
      setCombatantSystem: vi.fn(),
      setInfluenceMap: vi.fn(),
      setTicketSystem: vi.fn(),
      setZoneManager: vi.fn(),
    },
    worldFeatureSystem: {
      setGameModeManager: vi.fn(),
      setTerrainManager: vi.fn(),
      setFixedWingModel: vi.fn(),
    },
    zoneManager: {},
  } as any;

  // Fan out a single mode-change invocation across every registered
  // listener so wiring functions registered later (e.g. the M48 tank
  // wire) still observe the event even though the mock's `onModeChanged`
  // collects all callbacks rather than only the last one.
  const fanout = (mode: string, config: unknown) => {
    for (const cb of modeChangedCallbacks) cb(mode, config);
  };

  return {
    refs,
    getHelipadCallback: () => helipadCallback,
    getCombatantProvider: () => combatantProvider,
    getModeChangedCallback: () => fanout,
    combatants,
    explosionEffectsPool,
    listener,
  };
}

describe('OperationalRuntimeComposer', () => {
  it('wires strategy runtime across war sim, feedback, and map systems', () => {
    const { refs } = createRefs();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { scene: new THREE.Scene() });

    expect(refs.warSimulator.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.warSimulator.setZoneManager).toHaveBeenCalledWith(refs.zoneManager);
    expect(refs.warSimulator.setTicketSystem).toHaveBeenCalledWith(refs.ticketSystem);
    expect(refs.warSimulator.setInfluenceMap).toHaveBeenCalledWith(refs.influenceMapSystem);
    expect(refs.strategicFeedback.setWarSimulator).toHaveBeenCalledWith(refs.warSimulator);
    expect(refs.strategicFeedback.setHUDSystem).toHaveBeenCalledWith(refs.hudSystem);
    expect(refs.strategicFeedback.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.gameModeManager.setWarSimulator).toHaveBeenCalledWith(refs.warSimulator);
    expect(refs.minimapSystem.setWarSimulator).toHaveBeenCalledWith(refs.warSimulator);
    expect(refs.fullMapSystem.setWarSimulator).toHaveBeenCalledWith(refs.warSimulator);
  });

  it('wires vehicle and air-support callbacks, providers, and effect pools', () => {
    const {
      refs,
      getHelipadCallback,
      getCombatantProvider,
      combatants,
      explosionEffectsPool,
      listener,
    } = createRefs();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { scene: new THREE.Scene() });

    expect(refs.helipadSystem.setTerrainManager).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.helipadSystem.setVegetationSystem).toHaveBeenCalledWith(refs.globalBillboardSystem);
    expect(refs.helipadSystem.setGameModeManager).toHaveBeenCalledWith(refs.gameModeManager);
    expect(refs.helicopterModel.setTerrainManager).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.helicopterModel.setHelipadSystem).toHaveBeenCalledWith(refs.helipadSystem);
    expect(refs.helicopterModel.setAudioListener).toHaveBeenCalledWith(listener);
    expect(refs.helicopterModel.setSquadDeployTerrain).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.helicopterModel.setHeightQueryCache).not.toHaveBeenCalled();
    expect(refs.helicopterModel.setVehicleManager).toHaveBeenCalledWith(refs.vehicleManager);
    expect(refs.worldFeatureSystem.setTerrainManager).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.worldFeatureSystem.setGameModeManager).toHaveBeenCalledWith(refs.gameModeManager);

    const helipadCallback = getHelipadCallback();
    expect(helipadCallback).toBeDefined();
    helipadCallback?.([
      { id: 'hp-alpha', position: new THREE.Vector3(10, 2, 20) },
    ]);
    expect(refs.minimapSystem.setHelipadMarkers).toHaveBeenCalledWith([
      { id: 'hp-alpha', position: new THREE.Vector3(10, 2, 20) },
    ]);
    expect(refs.fullMapSystem.setHelipadMarkers).toHaveBeenCalledWith([
      { id: 'hp-alpha', position: new THREE.Vector3(10, 2, 20) },
    ]);

    const combatantProvider = getCombatantProvider();
    expect(combatantProvider).toBeDefined();
    expect(combatantProvider?.()).toBe(combatants);

    expect(refs.airSupportManager.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.airSupportManager.setGrenadeSystem).toHaveBeenCalledWith(refs.grenadeSystem);
    expect(refs.airSupportManager.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.airSupportManager.setHUDSystem).toHaveBeenCalledWith(refs.hudSystem);
    expect(refs.airSupportManager.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.airSupportManager.setExplosionEffectsPool).toHaveBeenCalledWith(explosionEffectsPool);
    expect(refs.playerController.configureVehicleController).toHaveBeenCalledWith({
      airSupportManager: refs.airSupportManager,
    });
    expect(refs.aaEmplacementSystem.setHelicopterModel).toHaveBeenCalledWith(refs.helicopterModel);
    expect(refs.aaEmplacementSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.aaEmplacementSystem.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.aaEmplacementSystem.setExplosionEffectsPool).toHaveBeenCalledWith(explosionEffectsPool);
  });

  it('injects combat + audio dependencies into the M2HB emplacement system', () => {
    const { refs } = createRefs();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { scene: new THREE.Scene() });

    expect(refs.m2hbEmplacementSystem.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.m2hbEmplacementSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
  });

  it('spawns M2HB emplacements once per supported scenario when the game mode changes', async () => {
    const { refs, getModeChangedCallback } = createRefs();
    const scene = new THREE.Scene();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { scene });
    const onChange = getModeChangedCallback();
    expect(onChange).toBeDefined();

    onChange?.('open_frontier', {});
    onChange?.('a_shau_valley', {});
    // Unsupported modes never trigger a spawn.
    onChange?.('tdm', {});
    // Re-entering the same mode is idempotent - no second spawn.
    onChange?.('open_frontier', {});

    // The composer defers spawn via setTimeout(0); flush the macrotask queue.
    await new Promise(resolve => setTimeout(resolve, 0));

    const calls = refs.vehicleManager.spawnScenarioM2HBEmplacements.mock.calls as Array<[{ modes: string[] }]>;
    const modeArgs = calls.map(([arg]) => arg.modes[0]);
    expect(modeArgs.sort()).toEqual(['a_shau_valley', 'open_frontier']);
    // Both invocations route through the shared scene + m2hbSystem.
    for (const [arg] of calls) {
      expect((arg as { scene: THREE.Scene }).scene).toBe(scene);
      expect((arg as { m2hbSystem: unknown }).m2hbSystem).toBe(refs.m2hbEmplacementSystem);
    }
  });

  it('resolvePosition snaps spawn position to the terrain height query', async () => {
    const { refs, getModeChangedCallback } = createRefs();
    refs.terrainSystem.getHeightAt = vi.fn(() => 42);

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { scene: new THREE.Scene() });

    getModeChangedCallback()?.('open_frontier', {});
    await new Promise(resolve => setTimeout(resolve, 0));

    const [[arg]] = refs.vehicleManager.spawnScenarioM2HBEmplacements.mock.calls as Array<[{
      resolvePosition?: (m: string, base: THREE.Vector3) => THREE.Vector3;
    }]>;
    const base = new THREE.Vector3(10, 0, 20);
    const snapped = arg.resolvePosition?.('open_frontier', base);
    expect(snapped?.x).toBe(10);
    expect(snapped?.y).toBe(42);
    expect(snapped?.z).toBe(20);
  });
});
