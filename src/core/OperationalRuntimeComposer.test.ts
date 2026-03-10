import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createOperationalRuntimeGroups,
  wireOperationalRuntime,
} from './OperationalRuntimeComposer';

function createRefs() {
  let helipadCallback: ((helipads: Array<{ id: string; position: THREE.Vector3 }>) => void) | undefined;
  let combatantProvider: (() => unknown[]) | undefined;
  const explosionEffectsPool = { id: 'explosion-pool' };
  const combatants = [{ id: 'c1' }, { id: 'c2' }];
  const listener = { id: 'listener' };
  const heightQueryCache = { id: 'height-cache' } as any;

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
    },
    radioTransmissionSystem: {
      setAudioListener: vi.fn(),
    },
    strategicFeedback: {
      setAudioManager: vi.fn(),
      setHUDSystem: vi.fn(),
      setWarSimulator: vi.fn(),
    },
    terrainSystem: {},
    ticketSystem: {},
    vehicleManager: {},
    warSimulator: {
      setCombatantSystem: vi.fn(),
      setInfluenceMap: vi.fn(),
      setTicketSystem: vi.fn(),
      setZoneManager: vi.fn(),
    },
    worldFeatureSystem: {
      setGameModeManager: vi.fn(),
      setTerrainManager: vi.fn(),
    },
    zoneManager: {},
  } as any;

  return {
    refs,
    heightQueryCache,
    getHelipadCallback: () => helipadCallback,
    getCombatantProvider: () => combatantProvider,
    combatants,
    explosionEffectsPool,
    listener,
  };
}

describe('OperationalRuntimeComposer', () => {
  it('wires strategy runtime across war sim, feedback, and map systems', () => {
    const { refs } = createRefs();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs));

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
      heightQueryCache,
      getHelipadCallback,
      getCombatantProvider,
      combatants,
      explosionEffectsPool,
      listener,
    } = createRefs();

    wireOperationalRuntime(createOperationalRuntimeGroups(refs), { heightQueryCache });

    expect(refs.helipadSystem.setTerrainManager).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.helipadSystem.setVegetationSystem).toHaveBeenCalledWith(refs.globalBillboardSystem);
    expect(refs.helipadSystem.setGameModeManager).toHaveBeenCalledWith(refs.gameModeManager);
    expect(refs.helicopterModel.setTerrainManager).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.helicopterModel.setHelipadSystem).toHaveBeenCalledWith(refs.helipadSystem);
    expect(refs.helicopterModel.setAudioListener).toHaveBeenCalledWith(listener);
    expect(refs.helicopterModel.setHeightQueryCache).toHaveBeenCalledWith(heightQueryCache);
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
});
