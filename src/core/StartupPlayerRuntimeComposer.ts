// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { IGameRenderer } from '../types/SystemInterfaces';
import type { SystemKeyToType } from './SystemRegistry';
import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { PlayerVehicleAdapterFactory } from '../systems/vehicle/PlayerVehicleAdapterFactory';
import type { PlayerVehicleAdapter } from '../systems/vehicle/PlayerVehicleAdapter';
import { TankPlayerAdapter } from '../systems/vehicle/TankPlayerAdapter';
import { EmplacementPlayerAdapter } from '../systems/vehicle/EmplacementPlayerAdapter';
import { TankCannonProjectileSystem } from '../systems/combat/projectiles/TankCannonProjectile';
import { TankBallisticSolver } from '../systems/combat/projectiles/TankBallisticSolver';
import { TankAIGunnerRoute } from '../systems/combat/ai/TankAIGunnerRoute';
import type { TankGunnerContext } from '../systems/combat/CombatantAI';
import { Tank } from '../systems/vehicle/Tank';
import type { M2HBEmplacementSystem } from '../systems/combat/weapons/M2HBEmplacement';
import type { VehicleManager } from '../systems/vehicle/VehicleManager';
import type { Combatant } from '../systems/combat/types';
import type { CombatantSystem } from '../systems/combat/CombatantSystem';
import type { ITerrainRuntime } from '../types/SystemInterfaces';
import { Logger } from '../utils/Logger';
import type { GroundVehicleProximityChecker } from '../systems/vehicle/GroundVehicleProximityChecker';
import type {
  IVehicleMarkerQuery,
  VehicleMarkerCategory,
  VehicleMarkerEntry,
} from '../ui/compass/CompassVehicleMarkers';

type StartupPlayerRuntimeRefs = SystemKeyToType;

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
    | 'heldEquipmentViewmodelSystem'
    | 'helicopterModel'
    | 'hudSystem'
    | 'inventoryManager'
    | 'loadoutService'
    | 'm2hbEmplacementSystem'
    | 'mortarSystem'
    | 'playerController'
    | 'playerHealthSystem'
    | 'playerRespawnManager'
    | 'playerSquadController'
    | 'playerSuppressionSystem'
    | 'sandbagSystem'
    | 'smokeMarkerSystem'
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
  /**
   * Live scene. Needed so the boarding factory can construct the shared
   * `TankCannonProjectileSystem` (its pooled projectile meshes are added to
   * the scene). Optional so older composer-test doubles that omit it keep
   * working — the cannon wire is skipped when absent (same posture as the
   * other guarded wires here).
   */
  scene?: THREE.Scene;
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
      heldEquipmentViewmodelSystem: refs.heldEquipmentViewmodelSystem,
      helicopterModel: refs.helicopterModel,
      hudSystem: refs.hudSystem,
      inventoryManager: refs.inventoryManager,
      loadoutService: refs.loadoutService,
      m2hbEmplacementSystem: refs.m2hbEmplacementSystem,
      mortarSystem: refs.mortarSystem,
      playerController: refs.playerController,
      playerHealthSystem: refs.playerHealthSystem,
      playerRespawnManager: refs.playerRespawnManager,
      playerSquadController: refs.playerSquadController,
      playerSuppressionSystem: refs.playerSuppressionSystem,
      sandbagSystem: refs.sandbagSystem,
      smokeMarkerSystem: refs.smokeMarkerSystem,
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
    heldEquipmentViewmodelSystem,
    helicopterModel,
    hudSystem,
    inventoryManager,
    loadoutService,
    m2hbEmplacementSystem,
    mortarSystem,
    playerController,
    playerHealthSystem,
    playerRespawnManager,
    playerSquadController,
    playerSuppressionSystem,
    sandbagSystem,
    smokeMarkerSystem,
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
    smokeMarkerSystem,
    mortarSystem,
    sandbagSystem,
    cameraShakeSystem,
    footstepAudioSystem,
    fullMapSystem,
    playerSquadController,
    commandInputManager,
  });

  // Shared M48 cannon launcher (npc-tank-cannon-wiring): one pool, one damage
  // sink for the player gunner path AND the NPC route. Null on composer-test
  // doubles (no scene / combatantSystem) → both cannon wires skip.
  const sharedCannon =
    options.scene && combatantSystem
      ? new TankCannonProjectileSystem(options.scene, combatantSystem.explosionEffectsPool, combatantSystem)
      : null;
  // Single-owner stepping gate shared by the player session lifecycle and the
  // NPC frame stepper (see CannonStepGate doc above buildSeatedWeaponLifecycle).
  const cannonStepGate: CannonStepGate = { playerOwns: false };

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
      // tank-cannon-wiring (Phase 2): the boarding factory is the real
      // board-time hook, so the seated-weapon systems that live outside the
      // adapter's construction surface get wired here. Without these the
      // player tank cannon + M2HB emplacement never fire on LMB (zero prod
      // callers of setCannonSystem / attachPlayerAdapter before this).
      scene: options.scene,
      combatantSystem,
      terrainSystem,
      m2hbEmplacementSystem,
      cannon: sharedCannon,
      cannonStepGate,
    });
    if (factory) {
      playerController.setPlayerVehicleAdapterFactory(factory);
    }
  }

  // NPC tank-gunner wire (npc-tank-cannon-wiring): nothing bound a cannon +
  // solver to CombatantAI's existing route in prod, so NPC M48s never fired.
  if (sharedCannon && combatantSystem && vehicleManager) {
    wireNpcTankGunner({ combatantSystem, vehicleManager, terrainSystem, cannon: sharedCannon, cannonStepGate });
  }

  playerHealthSystem.setZoneManager(zoneManager);
  playerHealthSystem.setTicketSystem(ticketSystem);
  playerHealthSystem.setPlayerController(playerController);
  playerHealthSystem.setFirstPersonWeapon(firstPersonWeapon);
  playerHealthSystem.setCamera(options.camera);
  playerHealthSystem.setRespawnManager(playerRespawnManager);
  playerHealthSystem.setHUDSystem(hudSystem);

  // Helipad spawn labels only promise a helicopter when one is actually
  // boardable at the pad (helipad-spawn-truth). Guarded for test doubles.
  if (typeof playerRespawnManager.setBoardableHelicopterPresence === 'function'
    && typeof helicopterModel?.hasBoardableHelicopterForHelipad === 'function') {
    playerRespawnManager.setBoardableHelicopterPresence(helicopterModel);
  }

  playerSuppressionSystem.setCameraShakeSystem(cameraShakeSystem);
  playerSuppressionSystem.setPlayerController(playerController);

  firstPersonWeapon.setPlayerController(playerController);
  firstPersonWeapon.setCombatantSystem(combatantSystem);
  firstPersonWeapon.setTicketSystem(ticketSystem);
  firstPersonWeapon.setHUDSystem(hudSystem);
  firstPersonWeapon.setStatsTracker(hudSystem.getStatsTracker());
  firstPersonWeapon.setZoneManager(zoneManager);
  firstPersonWeapon.setInventoryManager(inventoryManager);
  firstPersonWeapon.setAudioManager(audioManager);
  firstPersonWeapon.setGrenadeSystem(grenadeSystem);
  smokeMarkerSystem?.setTerrainSystem(terrainSystem);
  commandInputManager.configureHeldEquipment?.({ firstPersonWeapon, heldEquipment: heldEquipmentViewmodelSystem, smokeMarkerSystem });

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
  getAllVehicles(): ReadonlyArray<CompassVehicleRecord>;
  forEachVehicle?(visitor: (vehicle: CompassVehicleRecord) => void): void;
}

interface CompassVehicleRecord {
  vehicleId: string;
  category: string;
  faction: import('../systems/combat/types').Faction;
  getPosition(): THREE.Vector3;
  isDestroyed(): boolean;
}

const COMPASS_DRIVABLE_CATEGORIES = new Set<string>(['ground', 'watercraft', 'emplacement']);

/**
 * Build an `IVehicleMarkerQuery` adapter over `VehicleManager`. The
 * compass calls `getVehicleMarkers()` at its existing 100 ms cadence;
 * the adapter does an O(N) scan that filters out destroyed vehicles
 * and non-drivable categories (aircraft have their own HUD).
 */
function createCompassVehicleQuery(source: CompassVehicleSource): IVehicleMarkerQuery {
  const markers: VehicleMarkerEntry[] = [];
  const markerByVehicleId = new Map<string, VehicleMarkerEntry>();
  const seenVehicleIds = new Set<string>();

  const visitVehicle = (vehicle: CompassVehicleRecord): void => {
    if (!COMPASS_DRIVABLE_CATEGORIES.has(vehicle.category)) return;
    if (vehicle.isDestroyed()) return;

    let marker = markerByVehicleId.get(vehicle.vehicleId);
    if (!marker) {
      marker = {
        vehicleId: vehicle.vehicleId,
        category: vehicle.category as VehicleMarkerCategory,
        faction: vehicle.faction,
        position: vehicle.getPosition(),
      };
      markerByVehicleId.set(vehicle.vehicleId, marker);
    } else {
      marker.category = vehicle.category as VehicleMarkerCategory;
      marker.faction = vehicle.faction;
      marker.position = vehicle.getPosition();
    }

    markers.push(marker);
    seenVehicleIds.add(vehicle.vehicleId);
  };

  return {
    getVehicleMarkers(): readonly VehicleMarkerEntry[] {
      markers.length = 0;
      seenVehicleIds.clear();

      if (source.forEachVehicle) {
        source.forEachVehicle(visitVehicle);
      } else {
        for (const vehicle of source.getAllVehicles()) {
          visitVehicle(vehicle);
        }
      }

      markerByVehicleId.forEach((_marker, vehicleId) => {
        if (!seenVehicleIds.has(vehicleId)) {
          markerByVehicleId.delete(vehicleId);
        }
      });

      return markers;
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
  scene?: THREE.Scene;
  combatantSystem?: CombatantSystem;
  terrainSystem?: ITerrainRuntime;
  m2hbEmplacementSystem?: M2HBEmplacementSystem;
  /** Shared cannon (npc-tank-cannon-wiring): the player path binds this so player + NPC share one pool. Null → lazy player-only build. */
  cannon?: TankCannonProjectileSystem | null;
  /** Single-owner stepping gate shared with `wireNpcTankGunner` (see CannonStepGate). */
  cannonStepGate?: CannonStepGate;
}): PlayerVehicleAdapterFactory | null {
  const internals = args.playerController.getBoardingFactoryInternals?.();
  if (!internals) return null;

  const { onSessionEnter, onSessionExit } = buildSeatedWeaponLifecycle(args);

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
    onSessionEnter,
    onSessionExit,
  });
}

/**
 * Build the board-time / dismount-time seated-weapon lifecycle hooks
 * (tank-cannon-wiring, Phase 2). On board:
 *   - a player M48 gunner gets the shared `TankCannonProjectileSystem` bound
 *     via `setCannonSystem`, plus a per-frame stepper so launched rounds arc
 *     and impact (the system needs `update(dt, terrainHeightAt)` ticked);
 *   - a player M2HB gunner gets the `EmplacementPlayerAdapter` registered on
 *     the M2HB system's binding via `attachPlayerAdapter`, so the already-
 *     ticked `M2HBEmplacementSystem.update` polls its fire requests.
 * On dismount both are detached so a stale binding can't keep firing.
 *
 * The injected `cannon` is the pool shared with the NPC tank-gunner route
 * (npc-tank-cannon-wiring). When absent (older composer-test doubles) it is
 * lazily built on first tank board from `scene` + `combatantSystem`; when
 * neither is available the cannon wire is a silent no-op (M2HB still works).
 */
/**
 * Single-owner gate for stepping the shared cannon pool (combat-reviewer fix,
 * npc-tank-cannon-wiring). The pool must advance exactly once per frame:
 * while a player tank session is active, `TankPlayerAdapter.update` owns the
 * step (scaled `ctx.deltaTime`, runs even when combat AI is disabled); the
 * NPC-side frame stepper yields. With no player seated, the NPC stepper owns
 * it (scaled `beginFrame` dt).
 */
export interface CannonStepGate {
  playerOwns: boolean;
}

function buildSeatedWeaponLifecycle(args: {
  scene?: THREE.Scene;
  combatantSystem?: CombatantSystem;
  terrainSystem?: ITerrainRuntime;
  m2hbEmplacementSystem?: M2HBEmplacementSystem;
  cannon?: TankCannonProjectileSystem | null;
  cannonStepGate?: CannonStepGate;
}): {
  onSessionEnter: (adapter: PlayerVehicleAdapter, vehicleId: string) => void;
  onSessionExit: (adapter: PlayerVehicleAdapter, vehicleId: string) => void;
} {
  const { scene, combatantSystem, terrainSystem, m2hbEmplacementSystem, cannonStepGate } = args;

  // Prefer the injected shared cannon (player + NPC share one pool); else lazy.
  let cannon: TankCannonProjectileSystem | null = args.cannon ?? null;
  const ensureCannon = (): TankCannonProjectileSystem | null => {
    if (cannon) return cannon;
    if (!scene || !combatantSystem) return null;
    cannon = new TankCannonProjectileSystem(
      scene,
      combatantSystem.explosionEffectsPool,
      combatantSystem,
    );
    Logger.info('vehicle', 'Player tank cannon system constructed (tank-cannon-wiring)');
    return cannon;
  };

  const onSessionEnter = (adapter: PlayerVehicleAdapter, vehicleId: string): void => {
    if (adapter instanceof TankPlayerAdapter) {
      const system = ensureCannon();
      if (!system) return;
      adapter.setCannonSystem(system);
      // Bake the terrain-height source into the stepper so the adapter can
      // advance in-flight rounds without owning a terrain reference. The
      // adapter becomes the pool's sole stepper for the session (the NPC
      // frame stepper yields via the gate — double-stepping made shells
      // integrate twice per frame and impact short).
      adapter.setCannonStepper((dt) => {
        system.update(dt, (x, z) => terrainSystem?.getEffectiveHeightAt(x, z) ?? 0);
      });
      if (cannonStepGate) cannonStepGate.playerOwns = true;
      // Gunner-panel host (tank-sight-prod-wiring; m2hb precedent): resolved
      // lazily from the live DOM; absent — headless / tests — the adapter
      // stays panel-less and safe.
      adapter.setHudPanelHost(
        typeof document !== 'undefined' ? document.getElementById('game-hud-root') : null,
      );
      return;
    }
    if (adapter instanceof EmplacementPlayerAdapter && m2hbEmplacementSystem) {
      m2hbEmplacementSystem.attachPlayerAdapter(vehicleId, adapter);
      // Mount the FJ belt/traverse panel (m2hb-gun-experience): inject the HUD
      // root + the read-only weapon binding so the panel can show the live
      // belt count. The host is resolved lazily from the live DOM here (the
      // HUD root is present once the in-game HUD has mounted); when it is
      // absent — headless / tests — the adapter stays panel-less and safe.
      const host = typeof document !== 'undefined'
        ? document.getElementById('game-hud-root')
        : null;
      adapter.setHudPanelHost(host, m2hbEmplacementSystem.getWeapon(vehicleId));
    }
  };

  const onSessionExit = (adapter: PlayerVehicleAdapter, vehicleId: string): void => {
    if (adapter instanceof TankPlayerAdapter) {
      adapter.setCannonSystem(null);
      adapter.setCannonStepper(null);
      adapter.setHudPanelHost(null);
      if (cannonStepGate) cannonStepGate.playerOwns = false;
      return;
    }
    if (adapter instanceof EmplacementPlayerAdapter && m2hbEmplacementSystem) {
      m2hbEmplacementSystem.detachPlayerAdapter(vehicleId, adapter);
      // Drop the panel host + weapon ref so the panel tears down on dismount
      // (the adapter's onExit unmounts it; clearing the host keeps a re-board
      // from re-mounting into a stale host).
      adapter.setHudPanelHost(null, null);
    }
  };

  return { onSessionEnter, onSessionExit };
}

// Per-frame cannon step bound so a stalled frame can't tunnel a shell.
const NPC_CANNON_MAX_STEP_S = 1 / 30;

/**
 * Wire the NPC tank-gunner firing route (npc-tank-cannon-wiring). CombatantAI's
 * route + delegation already exist; this binds the prod deps it lacked — a
 * shared solver + route (`setTankGunnerRoute`, with a resolver that maps an
 * IN_VEHICLE combatant to its tank/turret + shared cannon only in the gunner
 * seat) and a per-frame cannon-flight stepper. Damage routes through the
 * cannon's existing `applyExplosionDamage` path — no new code.
 */
export function wireNpcTankGunner(args: {
  combatantSystem: CombatantSystem;
  vehicleManager: VehicleManager;
  terrainSystem?: ITerrainRuntime;
  cannon: TankCannonProjectileSystem;
  cannonStepGate?: CannonStepGate;
}): void {
  const { combatantSystem, vehicleManager, terrainSystem, cannon, cannonStepGate } = args;

  const solver = new TankBallisticSolver();
  void solver.init(); // optional WASM load; route uses the TS fallback meanwhile
  const route = new TankAIGunnerRoute();

  const contextProvider = (combatant: Combatant): TankGunnerContext | null => {
    const tank = vehicleManager.getTankByOccupant(combatant.id);
    if (!(tank instanceof Tank)) return null;
    // Only the gunner crews the cannon; drivers / loaders / commanders ride.
    const inGunnerSeat = tank.getSeats().some((s) => s.role === 'gunner' && s.occupantId === combatant.id);
    if (!inGunnerSeat) return null;
    return { tank, turret: tank.getTurret(), cannon, solver };
  };

  combatantSystem.combatantAI.setTankGunnerRoute(route, contextProvider);

  // Advance cannon flight with the scaled frame dt handed through
  // `beginFrame(deltaTime)` — TimeScale-respecting (dt=0 on pause freezes
  // shells). Yields while a player tank session owns the step (gate), so the
  // shared pool advances exactly once per frame.
  combatantSystem.combatantAI.setFrameStepper((deltaTime) => {
    if (cannonStepGate?.playerOwns) return;
    if (deltaTime <= 0) return;
    const dt = Math.min(deltaTime, NPC_CANNON_MAX_STEP_S);
    cannon.update(dt, (x, z) => terrainSystem?.getEffectiveHeightAt(x, z) ?? 0);
  });

  Logger.info('vehicle', 'NPC tank-gunner route wired to shared cannon (npc-tank-cannon-wiring)');
}
