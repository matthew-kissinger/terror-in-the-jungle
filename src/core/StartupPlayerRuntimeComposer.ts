// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { IGameRenderer } from '../types/SystemInterfaces';
import type { SystemKeyToType } from './SystemRegistry';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { PlayerVehicleAdapterFactory } from '../systems/vehicle/PlayerVehicleAdapterFactory';
import type { GroundVehicleProximityChecker } from '../systems/vehicle/GroundVehicleProximityChecker';
import type {
  IVehicleMarkerQuery,
  VehicleMarkerCategory,
  VehicleMarkerEntry,
} from '../ui/compass/CompassVehicleMarkers';

type StartupPlayerRuntimeRefs = Pick<
  SystemKeyToType,
  | 'audioManager'
  | 'cameraShakeSystem'
  | 'combatantSystem'
  | 'commandInputManager'
  | 'compassSystem'
  | 'firstPersonWeapon'
  | 'footstepAudioSystem'
  | 'fullMapSystem'
  | 'gameModeManager'
  | 'grenadeSystem'
  | 'helicopterModel'
  | 'helipadSystem'
  | 'hudSystem'
  | 'inventoryManager'
  | 'loadoutService'
  | 'minimapSystem'
  | 'mortarSystem'
  | 'playerController'
  | 'playerHealthSystem'
  | 'playerRespawnManager'
  | 'playerSquadController'
  | 'playerSuppressionSystem'
  | 'sandbagSystem'
  | 'terrainSystem'
  | 'ticketSystem'
  | 'vehicleManager'
  | 'warSimulator'
  | 'zoneManager'
>;

interface StartupPlayerRuntimeGroups {
  playerRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'audioManager'
    | 'cameraShakeSystem'
    | 'combatantSystem'
    | 'commandInputManager'
    | 'firstPersonWeapon'
    | 'footstepAudioSystem'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'grenadeSystem'
    | 'helicopterModel'
    | 'hudSystem'
    | 'inventoryManager'
    | 'loadoutService'
    | 'mortarSystem'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'playerSquadController'
    | 'playerSuppressionSystem'
    | 'sandbagSystem'
    | 'terrainSystem'
    | 'ticketSystem'
    | 'vehicleManager'
    | 'zoneManager'
  >;
  hudRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'audioManager'
    | 'combatantSystem'
    | 'commandInputManager'
    | 'compassSystem'
    | 'fullMapSystem'
    | 'gameModeManager'
    | 'hudSystem'
    | 'minimapSystem'
    | 'playerHealthSystem'
    | 'playerController'
    | 'playerSquadController'
    | 'grenadeSystem'
    | 'mortarSystem'
    | 'ticketSystem'
    | 'vehicleManager'
    | 'zoneManager'
  >;
  deployRuntime: Pick<
    StartupPlayerRuntimeRefs,
    | 'firstPersonWeapon'
    | 'gameModeManager'
    | 'grenadeSystem'
    | 'helipadSystem'
    | 'inventoryManager'
    | 'loadoutService'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'terrainSystem'
    | 'warSimulator'
    | 'zoneManager'
  >;
}

interface StartupPlayerRuntimeOptions {
  camera: THREE.PerspectiveCamera;
  renderer?: IGameRenderer;
}

export function createStartupPlayerRuntimeGroups(
  refs: StartupPlayerRuntimeRefs
): StartupPlayerRuntimeGroups {
  return {
    playerRuntime: {
      audioManager: refs.audioManager,
      cameraShakeSystem: refs.cameraShakeSystem,
      combatantSystem: refs.combatantSystem,
      commandInputManager: refs.commandInputManager,
      firstPersonWeapon: refs.firstPersonWeapon,
      footstepAudioSystem: refs.footstepAudioSystem,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      grenadeSystem: refs.grenadeSystem,
      helicopterModel: refs.helicopterModel,
      hudSystem: refs.hudSystem,
      inventoryManager: refs.inventoryManager,
      loadoutService: refs.loadoutService,
      mortarSystem: refs.mortarSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      playerSquadController: refs.playerSquadController,
      playerSuppressionSystem: refs.playerSuppressionSystem,
      sandbagSystem: refs.sandbagSystem,
      terrainSystem: refs.terrainSystem,
      ticketSystem: refs.ticketSystem,
      vehicleManager: refs.vehicleManager,
      zoneManager: refs.zoneManager,
    },
    hudRuntime: {
      audioManager: refs.audioManager,
      combatantSystem: refs.combatantSystem,
      commandInputManager: refs.commandInputManager,
      compassSystem: refs.compassSystem,
      fullMapSystem: refs.fullMapSystem,
      gameModeManager: refs.gameModeManager,
      hudSystem: refs.hudSystem,
      minimapSystem: refs.minimapSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerSquadController: refs.playerSquadController,
      grenadeSystem: refs.grenadeSystem,
      mortarSystem: refs.mortarSystem,
      ticketSystem: refs.ticketSystem,
      vehicleManager: refs.vehicleManager,
      zoneManager: refs.zoneManager,
    },
    deployRuntime: {
      firstPersonWeapon: refs.firstPersonWeapon,
      gameModeManager: refs.gameModeManager,
      grenadeSystem: refs.grenadeSystem,
      helipadSystem: refs.helipadSystem,
      inventoryManager: refs.inventoryManager,
      loadoutService: refs.loadoutService,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      terrainSystem: refs.terrainSystem,
      warSimulator: refs.warSimulator,
      zoneManager: refs.zoneManager,
    },
  };
}

export function wireStartupPlayerRuntime(
  groups: StartupPlayerRuntimeGroups,
  options: StartupPlayerRuntimeOptions
): void {
  wirePlayerRuntime(groups.playerRuntime, options);
  wireHUDRuntime(groups.hudRuntime);
  wireDeployRuntime(groups.deployRuntime);
}

function wirePlayerRuntime(
  runtime: StartupPlayerRuntimeGroups['playerRuntime'],
  options: StartupPlayerRuntimeOptions
): void {
  const {
    audioManager,
    cameraShakeSystem,
    combatantSystem,
    commandInputManager,
    firstPersonWeapon,
    footstepAudioSystem,
    fullMapSystem,
    gameModeManager,
    grenadeSystem,
    helicopterModel,
    hudSystem,
    inventoryManager,
    loadoutService,
    mortarSystem,
    playerController,
    playerHealthSystem,
    playerRespawnManager,
    playerSquadController,
    playerSuppressionSystem,
    sandbagSystem,
    terrainSystem,
    ticketSystem,
    vehicleManager,
    zoneManager,
  } = runtime;

  playerController.configureDependencies({
    terrainSystem,
    gameModeManager,
    helicopterModel,
    firstPersonWeapon,
    hudSystem,
    ticketSystem,
    renderer: options.renderer,
    inventoryManager,
    grenadeSystem,
    mortarSystem,
    sandbagSystem,
    cameraShakeSystem,
    footstepAudioSystem,
    fullMapSystem,
    playerSquadController,
    commandInputManager,
  });

  // Boarding factory wire (VEKHIKL-UX-2, split B). Closes the
  // F-key gap shipped by the 2026-05-19 wayfinding cycle: the
  // "Press F to board" prompt rendered but no handler dispatched
  // the input to the per-category adapters. Guarded so test
  // doubles without the new setter / vehicleManager mock keep
  // working unchanged.
  if (
    typeof playerController.setPlayerVehicleAdapterFactory === 'function'
    && vehicleManager
  ) {
    const factory = createPlayerVehicleAdapterFactory({
      playerController,
      vehicleManager,
      hudSystem,
      gameRenderer: options.renderer,
    });
    if (factory) {
      playerController.setPlayerVehicleAdapterFactory(factory);
    }
  }

  playerHealthSystem.setZoneManager(zoneManager);
  playerHealthSystem.setTicketSystem(ticketSystem);
  playerHealthSystem.setPlayerController(playerController);
  playerHealthSystem.setFirstPersonWeapon(firstPersonWeapon);
  playerHealthSystem.setCamera(options.camera);
  playerHealthSystem.setRespawnManager(playerRespawnManager);
  playerHealthSystem.setHUDSystem(hudSystem);

  playerSuppressionSystem.setCameraShakeSystem(cameraShakeSystem);
  playerSuppressionSystem.setPlayerController(playerController);

  firstPersonWeapon.setPlayerController(playerController);
  firstPersonWeapon.setCombatantSystem(combatantSystem);
  firstPersonWeapon.setTicketSystem(ticketSystem);
  firstPersonWeapon.setHUDSystem(hudSystem);
  firstPersonWeapon.setZoneManager(zoneManager);
  firstPersonWeapon.setInventoryManager(inventoryManager);
  firstPersonWeapon.setAudioManager(audioManager);
  firstPersonWeapon.setGrenadeSystem(grenadeSystem);

  footstepAudioSystem.setTerrainSystem(terrainSystem);

  applyInitialLoadout(runtime);
  playerController.setSpectatorCandidateProvider(() => {
    const loadoutContext = loadoutService.getContext();
    return combatantSystem.getAllCombatants()
      .filter(c => c.faction === loadoutContext.faction && c.health > 0 && !c.isDying)
      .map(c => ({ id: c.id, position: c.position, faction: c.faction }));
  });
}

function applyInitialLoadout(runtime: StartupPlayerRuntimeGroups['playerRuntime']): void {
  const loadout = runtime.loadoutService.getCurrentLoadout();
  const loadoutContext = runtime.loadoutService.getContext();

  runtime.inventoryManager.setLoadout(loadout);
  runtime.playerController.setPlayerFaction(loadoutContext.faction);
  runtime.playerHealthSystem.setPlayerFaction(loadoutContext.faction);
  runtime.firstPersonWeapon.setPlayerFaction(loadoutContext.faction);
  runtime.combatantSystem.setPlayerFaction(loadoutContext.faction);
  runtime.zoneManager.setPlayerAlliance(loadoutContext.alliance);
}

function wireHUDRuntime(runtime: StartupPlayerRuntimeGroups['hudRuntime']): void {
  const {
    audioManager,
    combatantSystem,
    commandInputManager,
    compassSystem,
    fullMapSystem,
    gameModeManager,
    hudSystem,
    minimapSystem,
    playerController,
    playerHealthSystem,
    playerSquadController,
    grenadeSystem,
    mortarSystem,
    ticketSystem,
    vehicleManager,
    zoneManager,
  } = runtime;

  if (typeof hudSystem.configureDependencies === 'function') {
    hudSystem.configureDependencies({
      combatantSystem,
      zoneManager,
      ticketSystem,
      audioManager,
      grenadeSystem,
      mortarSystem,
    });
  } else {
    hudSystem.setCombatantSystem(combatantSystem);
    hudSystem.setZoneQuery(zoneManager);
    hudSystem.setTicketSystem(ticketSystem);
    hudSystem.setAudioManager(audioManager);
    hudSystem.setGrenadeSystem(grenadeSystem);
    hudSystem.setMortarSystem(mortarSystem);
  }

  const layout = hudSystem.getLayout();
  compassSystem.mountTo(layout.getSlot('compass'));
  minimapSystem.mountTo(layout.getSlot('minimap'));
  playerHealthSystem.mountUI(layout.getSlot('health'));
  // On touch, mount squad indicator under status-bar (timer/score) so it
  // flows tight beneath it. On desktop, it goes in the stats column.
  const isTouchMount = typeof window !== 'undefined' && shouldUseTouchControls();
  playerSquadController.mountIndicatorTo(
    layout.getSlot(isTouchMount ? 'status-bar' : 'stats')
  );
  commandInputManager.mountTo(layout);

  compassSystem.setZoneQuery(zoneManager);
  // Compass vehicle-marker layer landed in `compass-vehicle-markers`
  // (PR #278) but the runtime wiring was deferred. Without this adapter
  // the chevrons stay dark. Guarded so older test doubles without
  // `setVehicleQuery` keep working.
  if (typeof compassSystem.setVehicleQuery === 'function' && vehicleManager) {
    compassSystem.setVehicleQuery(createCompassVehicleQuery(vehicleManager));
  }
  minimapSystem.setZoneQuery(zoneManager);
  minimapSystem.setCombatantSystem(combatantSystem);
  fullMapSystem.setZoneQuery(zoneManager);
  fullMapSystem.setCombatantSystem(combatantSystem);
  fullMapSystem.setGameModeManager(gameModeManager);

  commandInputManager.setZoneQuery(zoneManager);
  commandInputManager.setCombatantSystem(combatantSystem);
  commandInputManager.setGameModeManager(gameModeManager);
  commandInputManager.setPlayerController(playerController);
}

function wireDeployRuntime(runtime: StartupPlayerRuntimeGroups['deployRuntime']): void {
  if (typeof runtime.playerRespawnManager.configureDependencies === 'function') {
    runtime.playerRespawnManager.configureDependencies({
      playerHealthSystem: runtime.playerHealthSystem,
      zoneManager: runtime.zoneManager,
      gameModeManager: runtime.gameModeManager,
      playerController: runtime.playerController,
      firstPersonWeapon: runtime.firstPersonWeapon,
      inventoryManager: runtime.inventoryManager,
      loadoutService: runtime.loadoutService,
      grenadeSystem: runtime.grenadeSystem,
      warSimulator: runtime.warSimulator,
      terrainSystem: runtime.terrainSystem,
      helipadSystem: runtime.helipadSystem,
    });
    return;
  }

  runtime.playerRespawnManager.setPlayerHealthSystem(runtime.playerHealthSystem);
  runtime.playerRespawnManager.setZoneManager(runtime.zoneManager);
  runtime.playerRespawnManager.setGameModeManager(runtime.gameModeManager);
  runtime.playerRespawnManager.setPlayerController(runtime.playerController);
  runtime.playerRespawnManager.setFirstPersonWeapon(runtime.firstPersonWeapon);
  runtime.playerRespawnManager.setInventoryManager(runtime.inventoryManager);
  runtime.playerRespawnManager.setLoadoutService(runtime.loadoutService);
  runtime.playerRespawnManager.setGrenadeSystem(runtime.grenadeSystem);
  runtime.playerRespawnManager.setWarSimulator(runtime.warSimulator);
  runtime.playerRespawnManager.setTerrainSystem(runtime.terrainSystem);
  runtime.playerRespawnManager.setHelipadSystem(runtime.helipadSystem);
}

/**
 * Minimal surface the compass-vehicle-marker adapter needs from the
 * vehicle manager. Structural typing keeps the composer test happy with
 * a plain mock and lets us avoid pulling the full `VehicleManager`
 * import path through the type-check seam.
 */
interface CompassVehicleSource {
  getAllVehicles(): ReadonlyArray<{
    vehicleId: string;
    category: string;
    faction: import('../systems/combat/types').Faction;
    getPosition(): THREE.Vector3;
    isDestroyed(): boolean;
  }>;
}

const COMPASS_DRIVABLE_CATEGORIES = new Set<string>(['ground', 'watercraft', 'emplacement']);

/**
 * Build an `IVehicleMarkerQuery` adapter over `VehicleManager`. The
 * compass calls `getVehicleMarkers()` at its existing 100 ms cadence;
 * the adapter does an O(N) scan that filters out destroyed vehicles
 * and non-drivable categories (aircraft have their own HUD).
 */
function createCompassVehicleQuery(source: CompassVehicleSource): IVehicleMarkerQuery {
  return {
    getVehicleMarkers(): readonly VehicleMarkerEntry[] {
      const out: VehicleMarkerEntry[] = [];
      for (const vehicle of source.getAllVehicles()) {
        if (!COMPASS_DRIVABLE_CATEGORIES.has(vehicle.category)) continue;
        if (vehicle.isDestroyed()) continue;
        out.push({
          vehicleId: vehicle.vehicleId,
          category: vehicle.category as VehicleMarkerCategory,
          faction: vehicle.faction,
          position: vehicle.getPosition(),
        });
      }
      return out;
    },
  };
}

/**
 * Minimal `PlayerController` surface the boarding-factory composer
 * needs. Structural typing so the composer test doesn't have to
 * stand up a real `PlayerController`; the production
 * `PlayerController` already implements all four methods.
 */
interface BoardingFactoryHost {
  setPlayerVehicleAdapterFactory?: (factory: PlayerVehicleAdapterFactory) => void;
  getBoardingProximityChecker?: () => unknown;
  getBoardingFactoryInternals?: () => {
    vehicleSessionController: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['vehicleSessionController'];
    playerState: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['playerState'];
    input: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['input'];
    cameraController: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['cameraController'];
    setPosition: (position: THREE.Vector3, reason: string) => void;
  };
}

/**
 * Build the per-category boarding factory and bind it to the
 * `PlayerController`. The factory captures live references to the
 * controller's session controller, player state, input, camera, and
 * canonical `setPosition()` — so streaming hooks fire when the
 * player teleports onto a vehicle's seat anchor.
 *
 * Returns `null` when the controller doesn't expose the wire seams
 * (legacy test double) — the caller drops the factory wire in that
 * case so the F-router falls back to mortar fire.
 *
 * The proximity checker is read lazily through
 * `playerController.getBoardingProximityChecker()`: the checker is
 * owned by `SystemUpdater`, which creates it on the first Vehicles
 * tick. Until the checker is pushed onto the controller, the
 * factory's `tryBoardNearest()` will see `null` and return `false`
 * — same outcome as no proximity prompt.
 */
function createPlayerVehicleAdapterFactory(args: {
  playerController: BoardingFactoryHost;
  vehicleManager: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['vehicleManager'];
  hudSystem?: ConstructorParameters<typeof PlayerVehicleAdapterFactory>[0]['hudSystem'];
  gameRenderer?: IGameRenderer;
}): PlayerVehicleAdapterFactory | null {
  const internals = args.playerController.getBoardingFactoryInternals?.();
  if (!internals) return null;

  // Lazy proximity-checker proxy: the real checker is created
  // inside SystemUpdater's Vehicles tick and pushed onto the
  // controller via `setBoardingProximityChecker()`. The factory
  // reads through this proxy each time `tryBoardNearest()` runs,
  // so the wire activates as soon as the checker lands without
  // requiring a re-construction of the factory. The factory's
  // deps type wants the concrete `GroundVehicleProximityChecker`,
  // but it only calls `getLastShownVehicleId()` — the structural
  // cast is sound and stays narrow.
  const proximityProxy = {
    getLastShownVehicleId(): string | null {
      const checker = args.playerController.getBoardingProximityChecker?.() as
        | { getLastShownVehicleId?: () => string | null }
        | undefined;
      return checker?.getLastShownVehicleId?.() ?? null;
    },
  } as unknown as GroundVehicleProximityChecker;

  return new PlayerVehicleAdapterFactory({
    vehicleManager: args.vehicleManager,
    vehicleSessionController: internals.vehicleSessionController,
    proximityChecker: proximityProxy,
    playerState: internals.playerState,
    input: internals.input,
    cameraController: internals.cameraController,
    hudSystem: args.hudSystem,
    gameRenderer: args.gameRenderer,
    setPosition: internals.setPosition,
  });
}
