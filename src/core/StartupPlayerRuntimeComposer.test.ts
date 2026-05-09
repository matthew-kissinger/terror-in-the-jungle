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
    },
    firstPersonWeapon: {
      setAudioManager: vi.fn(),
      setCombatantSystem: vi.fn(),
      setGrenadeSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setInventoryManager: vi.fn(),
      setPlayerController: vi.fn(),
      setPlayerFaction: vi.fn(),
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
    warSimulator: {},
    zoneManager: {
      setPlayerAlliance: vi.fn(),
    },
  } as any;

  return {
    refs,
    layout,
    getSpectatorProvider: () => spectatorProvider,
    setContext: (next: { alliance: Alliance; faction: Faction }) => {
      currentContext = next;
    },
    currentLoadout,
  };
}

describe('StartupPlayerRuntimeComposer', () => {
  it('wires startup/player/deploy dependencies and applies the active loadout', () => {
    const { refs, layout, currentLoadout } = createRefs();
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
    expect(refs.playerRespawnManager.setLoadoutService).toHaveBeenCalledWith(refs.loadoutService);
    expect(refs.playerRespawnManager.setTerrainSystem).toHaveBeenCalledWith(refs.terrainSystem);
    expect(refs.inventoryManager.setLoadout).toHaveBeenCalledWith(currentLoadout);
    expect(refs.playerController.setPlayerFaction).toHaveBeenCalledWith(Faction.US);
    expect(refs.zoneManager.setPlayerAlliance).toHaveBeenCalledWith(Alliance.BLUFOR);
    expect(refs.commandInputManager.mountTo).toHaveBeenCalledWith(layout);
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
