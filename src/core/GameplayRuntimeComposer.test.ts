import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createGameplayRuntimeGroups,
  wireGameplayRuntime,
} from './GameplayRuntimeComposer';

function createRefs() {
  let restartCallback: (() => void) | undefined;
  let spatialQueryProvider:
    | ((center: THREE.Vector3, radius: number) => unknown[])
    | undefined;
  const impactEffectsPool = { id: 'impact-pool' };
  const explosionEffectsPool = { id: 'explosion-pool' };
  const renderer = { renderer: {}, fog: { density: 0.1 } } as any;

  const refs = {
    ammoSupplySystem: {
      setFirstPersonWeapon: vi.fn(),
      setInventoryManager: vi.fn(),
      setZoneManager: vi.fn(),
    },
    atmosphereSystem: {
      setRenderer: vi.fn(),
      setShadowFollowTarget: vi.fn(),
    },
    audioManager: {},
    combatantSystem: {
      combatantAI: {
        setSandbagSystem: vi.fn(),
        setSmokeCloudSystem: vi.fn(),
        setZoneManager: vi.fn(),
      },
      combatantCombat: {
        hitDetection: {},
        setSandbagSystem: vi.fn(),
      },
      impactEffectsPool,
      explosionEffectsPool,
      querySpatialRadius: vi.fn(() => ['nearby']),
      sandbagSystem: undefined,
      squadManager: {
        setInfluenceMap: vi.fn(),
      },
      setAudioManager: vi.fn(),
      setCamera: vi.fn(),
      setGameModeManager: vi.fn(),
      setHUDSystem: vi.fn(),
      setPlayerHealthSystem: vi.fn(),
      setPlayerSuppressionSystem: vi.fn(),
      setTerrainSystem: vi.fn(),
      setTicketSystem: vi.fn(),
      setWaterSampler: vi.fn(),
      setZoneManager: vi.fn(),
      influenceMap: undefined,
    },
    firstPersonWeapon: {
      enable: vi.fn(),
    },
    flashbangScreenEffect: {
      setPlayerController: vi.fn(),
    },
    fullMapSystem: {},
    gameModeManager: {
      connectSystems: vi.fn(),
      setHUDSystem: vi.fn(),
      setInfluenceMapSystem: vi.fn(),
      setPlayerController: vi.fn(),
      setPlayerRespawnManager: vi.fn(),
    },
    grenadeSystem: {
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setExplosionEffectsPool: vi.fn(),
      setFlashbangEffect: vi.fn(),
      setImpactEffectsPool: vi.fn(),
      setInventoryManager: vi.fn(),
      setPlayerController: vi.fn(),
      setTicketSystem: vi.fn(),
    },
    hudSystem: {},
    influenceMapSystem: {},
    inventoryManager: {},
    minimapSystem: {},
    mortarSystem: {
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setExplosionEffectsPool: vi.fn(),
      setImpactEffectsPool: vi.fn(),
      setInventoryManager: vi.fn(),
      setTicketSystem: vi.fn(),
    },
    playerController: {},
    playerHealthSystem: {
      resetForNewMatch: vi.fn(),
    },
    playerRespawnManager: {
      cancelPendingRespawn: vi.fn(),
      respawnAtBase: vi.fn(),
    },
    playerSuppressionSystem: {},
    sandbagSystem: {
      setInventoryManager: vi.fn(),
      setTicketSystem: vi.fn(),
    },
    smokeCloudSystem: { id: 'smoke' },
    spatialGridManager: {},
    terrainSystem: {},
    ticketSystem: {
      setMatchRestartCallback: vi.fn((callback: typeof restartCallback) => {
        restartCallback = callback;
      }),
      setZoneManager: vi.fn(),
    },
    weatherSystem: {
      setAudioManager: vi.fn(),
      setRenderer: vi.fn(),
      setFogTintIntentReceiver: vi.fn(),
    },
    waterSystem: {
      sampleWaterInteraction: vi.fn(() => ({ immersion01: 0 })),
      setAtmosphereSystem: vi.fn(),
      setWeatherSystem: vi.fn(),
    },
    zoneManager: {
      setCamera: vi.fn(),
      setCombatantSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setSpatialGridManager: vi.fn(),
      setSpatialQueryProvider: vi.fn((provider: typeof spatialQueryProvider) => {
        spatialQueryProvider = provider;
      }),
      setTerrainSystem: vi.fn(),
    },
  } as any;

  return {
    refs,
    renderer,
    getRestartCallback: () => restartCallback,
    getSpatialQueryProvider: () => spatialQueryProvider,
    impactEffectsPool,
    explosionEffectsPool,
  };
}

describe('GameplayRuntimeComposer', () => {
  it('wires combat, zones, weapons, and game-mode dependencies', () => {
    const {
      refs,
      renderer,
      getRestartCallback,
      getSpatialQueryProvider,
      impactEffectsPool,
      explosionEffectsPool,
    } = createRefs();
    const camera = new THREE.PerspectiveCamera();

    wireGameplayRuntime(createGameplayRuntimeGroups(refs), { camera, renderer });

    expect(refs.combatantSystem.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.combatantSystem.setCamera).toHaveBeenCalledWith(camera);
    expect(refs.combatantSystem.setTicketSystem).toHaveBeenCalledWith(refs.ticketSystem);
    expect(refs.combatantSystem.setPlayerHealthSystem).toHaveBeenCalledWith(refs.playerHealthSystem);
    expect(refs.combatantSystem.setZoneManager).toHaveBeenCalledWith(refs.zoneManager);
    expect(refs.combatantSystem.setGameModeManager).toHaveBeenCalledWith(refs.gameModeManager);
    expect(refs.combatantSystem.setHUDSystem).toHaveBeenCalledWith(refs.hudSystem);
    expect(refs.combatantSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.combatantSystem.setPlayerSuppressionSystem).toHaveBeenCalledWith(refs.playerSuppressionSystem);
    expect(refs.combatantSystem.combatantCombat.setSandbagSystem).toHaveBeenCalledWith(refs.sandbagSystem);
    expect(refs.combatantSystem.combatantAI.setSandbagSystem).toHaveBeenCalledWith(refs.sandbagSystem);
    expect(refs.combatantSystem.combatantAI.setZoneManager).toHaveBeenCalledWith(refs.zoneManager);
    expect(refs.combatantSystem.combatantAI.setSmokeCloudSystem).toHaveBeenCalledWith(refs.smokeCloudSystem);
    expect(refs.combatantSystem.squadManager.setInfluenceMap).toHaveBeenCalledWith(refs.influenceMapSystem);
    expect(refs.flashbangScreenEffect.setPlayerController).toHaveBeenCalledWith(refs.playerController);

    expect(refs.ticketSystem.setZoneManager).toHaveBeenCalledWith(refs.zoneManager);
    expect(refs.zoneManager.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.zoneManager.setCamera).toHaveBeenCalledWith(camera);
    expect(refs.zoneManager.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.zoneManager.setSpatialGridManager).toHaveBeenCalledWith(refs.spatialGridManager);
    expect(refs.zoneManager.setHUDSystem).toHaveBeenCalledWith(refs.hudSystem);
    expect(getSpatialQueryProvider()?.(new THREE.Vector3(), 50)).toEqual(['nearby']);

    expect(refs.grenadeSystem.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.grenadeSystem.setInventoryManager).toHaveBeenCalledWith(refs.inventoryManager);
    expect(refs.grenadeSystem.setTicketSystem).toHaveBeenCalledWith(refs.ticketSystem);
    expect(refs.grenadeSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.grenadeSystem.setPlayerController).toHaveBeenCalledWith(refs.playerController);
    expect(refs.grenadeSystem.setFlashbangEffect).toHaveBeenCalledWith(refs.flashbangScreenEffect);
    expect(refs.grenadeSystem.setImpactEffectsPool).toHaveBeenCalledWith(impactEffectsPool);
    expect(refs.grenadeSystem.setExplosionEffectsPool).toHaveBeenCalledWith(explosionEffectsPool);
    expect(refs.mortarSystem.setCombatantSystem).toHaveBeenCalledWith(refs.combatantSystem);
    expect(refs.mortarSystem.setInventoryManager).toHaveBeenCalledWith(refs.inventoryManager);
    expect(refs.mortarSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.mortarSystem.setTicketSystem).toHaveBeenCalledWith(refs.ticketSystem);
    expect(refs.mortarSystem.setImpactEffectsPool).toHaveBeenCalledWith(impactEffectsPool);
    expect(refs.mortarSystem.setExplosionEffectsPool).toHaveBeenCalledWith(explosionEffectsPool);
    expect(refs.sandbagSystem.setInventoryManager).toHaveBeenCalledWith(refs.inventoryManager);
    expect(refs.sandbagSystem.setTicketSystem).toHaveBeenCalledWith(refs.ticketSystem);

    expect(refs.gameModeManager.connectSystems).toHaveBeenCalledWith(
      refs.zoneManager,
      refs.combatantSystem,
      refs.ticketSystem,
      refs.terrainSystem,
      refs.minimapSystem,
      refs.fullMapSystem
    );
    expect(refs.gameModeManager.setInfluenceMapSystem).toHaveBeenCalledWith(refs.influenceMapSystem);
    expect(refs.gameModeManager.setHUDSystem).toHaveBeenCalledWith(refs.hudSystem);
    expect(refs.gameModeManager.setPlayerController).toHaveBeenCalledWith(refs.playerController);
    expect(refs.gameModeManager.setPlayerRespawnManager).toHaveBeenCalledWith(refs.playerRespawnManager);
    expect(refs.ammoSupplySystem.setZoneManager).toHaveBeenCalledWith(refs.zoneManager);
    expect(refs.ammoSupplySystem.setInventoryManager).toHaveBeenCalledWith(refs.inventoryManager);
    expect(refs.ammoSupplySystem.setFirstPersonWeapon).toHaveBeenCalledWith(refs.firstPersonWeapon);

    getRestartCallback()?.();
    expect(refs.playerRespawnManager.cancelPendingRespawn).toHaveBeenCalledTimes(1);
    expect(refs.playerHealthSystem.resetForNewMatch).toHaveBeenCalledTimes(1);
    expect(refs.firstPersonWeapon.enable).toHaveBeenCalledTimes(1);
    expect(refs.playerRespawnManager.respawnAtBase).toHaveBeenCalledTimes(1);
  });

  it('wires environment runtime with renderer-aware weather setup', () => {
    const { refs, renderer } = createRefs();

    wireGameplayRuntime(createGameplayRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
      renderer,
    });

    expect(refs.weatherSystem.setAudioManager).toHaveBeenCalledWith(refs.audioManager);
    expect(refs.weatherSystem.setRenderer).toHaveBeenCalledWith(renderer);
    expect(refs.waterSystem.setWeatherSystem).toHaveBeenCalledWith(refs.weatherSystem);
  });

  it('binds the atmosphere system to renderer, camera, and water reflection sun', () => {
    const { refs, renderer } = createRefs();
    const camera = new THREE.PerspectiveCamera();

    wireGameplayRuntime(createGameplayRuntimeGroups(refs), { camera, renderer });

    expect(refs.atmosphereSystem.setRenderer).toHaveBeenCalledWith(renderer);
    expect(refs.atmosphereSystem.setShadowFollowTarget).toHaveBeenCalledWith(camera);
    expect(refs.waterSystem.setAtmosphereSystem).toHaveBeenCalledWith(refs.atmosphereSystem);
  });

  it('wires an NPC water-sampler adapter so wade behavior reaches CombatantSystem at runtime', () => {
    const { refs, renderer } = createRefs();
    refs.waterSystem.sampleWaterInteraction = vi.fn(() => ({ immersion01: 0.75 }));

    wireGameplayRuntime(createGameplayRuntimeGroups(refs), {
      camera: new THREE.PerspectiveCamera(),
      renderer,
    });

    expect(refs.combatantSystem.setWaterSampler).toHaveBeenCalledTimes(1);
    const sampler = refs.combatantSystem.setWaterSampler.mock.calls[0][0];
    expect(typeof sampler.sampleImmersion01).toBe('function');

    // The adapter must read from the WaterSystem on each call so any change
    // (hydrology bake landing, global plane toggle) is observed without
    // re-wiring.
    const immersion = sampler.sampleImmersion01(10, 20, 5);
    expect(immersion).toBe(0.75);
    expect(refs.waterSystem.sampleWaterInteraction).toHaveBeenCalledTimes(1);
  });
});
