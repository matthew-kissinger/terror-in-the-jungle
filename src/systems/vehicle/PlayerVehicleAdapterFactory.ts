import type * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { IGameRenderer, IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { PlayerInput } from '../player/PlayerInput';
import { Emplacement } from './Emplacement';
import { EmplacementPlayerAdapter } from './EmplacementPlayerAdapter';
import {
  GroundVehiclePlayerAdapter,
  type IGroundVehicleModel,
} from './GroundVehiclePlayerAdapter';
import { GroundVehicleProximityChecker } from './GroundVehicleProximityChecker';
import type { IVehicle } from './IVehicle';
import {
  WatercraftPlayerAdapter,
  type WatercraftIVehicle,
} from './WatercraftPlayerAdapter';
import type {
  PlayerVehicleAdapter,
  VehicleTransitionContext,
} from './PlayerVehicleAdapter';
import { Tank } from './Tank';
import { TankPlayerAdapter } from './TankPlayerAdapter';
import type { VehicleManager } from './VehicleManager';
import { VehicleSessionController } from './VehicleSessionController';

/**
 * Dependencies the boarding factory needs from its host (composer in split B).
 * Kept narrow so the factory stays unit-testable: no `THREE.Scene`, no
 * `GameEngine`, just the surfaces the adapters and session controller call.
 *
 * `hudSystem` and `gameRenderer` are optional because each adapter's
 * `onEnter` / `onExit` already guards against their absence — tests can
 * omit them, the composer wire (split B) supplies them.
 */
export interface PlayerVehicleAdapterFactoryDeps {
  vehicleManager: VehicleManager;
  vehicleSessionController: VehicleSessionController;
  proximityChecker: GroundVehicleProximityChecker;
  playerState: PlayerState;
  input: PlayerInput;
  cameraController: PlayerCamera;
  hudSystem?: IHUDSystem;
  gameRenderer?: IGameRenderer;
  /**
   * Optional: write back to the player's transform via the controller's
   * canonical "I just teleported the player" path. If omitted, the factory
   * falls back to mutating `playerState.position` directly — fine for tests,
   * not fine for production where the streaming hooks rely on the explicit
   * setter. Split B wires this.
   */
  setPosition?: (position: THREE.Vector3, reason: string) => void;
}

/**
 * Build the per-vehicle `IGroundVehicleModel` bridge the
 * `GroundVehiclePlayerAdapter` expects. M151 jeeps satisfy this surface
 * directly through their `IVehicle` methods plus the wheeled-physics getter,
 * but we keep the bridge here so the factory does not require a tighter
 * upstream contract on `IVehicle`.
 */
function bridgeGroundModel(vehicle: IVehicle): IGroundVehicleModel | null {
  const anyVehicle = vehicle as IVehicle & {
    getPhysics?: () => ReturnType<IGroundVehicleModel['getPhysics']>;
    setEngineActive?: (active: boolean) => void;
  };
  if (typeof anyVehicle.getPhysics !== 'function') return null;
  return {
    getVehiclePositionTo(_id, target) {
      target.copy(vehicle.getPosition());
      return true;
    },
    getVehicleQuaternionTo(_id, target) {
      target.copy(vehicle.getQuaternion());
      return true;
    },
    getPhysics(_id) {
      return anyVehicle.getPhysics?.() ?? null;
    },
    setEngineActive(_id, active) {
      anyVehicle.setEngineActive?.(active);
    },
  };
}

/**
 * Bridge an IVehicle of category `'watercraft'` into the shape
 * `WatercraftPlayerAdapter` expects. Sampan exposes the
 * `id`/`position`/`quaternion`/`isGrounded` surface natively as getters,
 * but PBR only exposes the IVehicle methods (`getPosition`,
 * `getQuaternion`, `vehicleId`) and lacks `isGrounded` outright. The
 * bridge papers over both shapes so the factory does not need to know
 * which concrete hull is on the other end.
 */
function bridgeWatercraftModel(vehicle: IVehicle): WatercraftIVehicle | null {
  const anyVehicle = vehicle as IVehicle & Partial<WatercraftIVehicle> & {
    setControls?: (throttle: number, rudder: number) => void;
    getForwardSpeed?: () => number;
    setTerrain?: (terrain: any) => void;
    isGrounded?: () => boolean;
  };
  if (
    typeof anyVehicle.setControls !== 'function' ||
    typeof anyVehicle.getForwardSpeed !== 'function' ||
    typeof anyVehicle.setTerrain !== 'function'
  ) {
    return null;
  }
  // Cache positions/quaternions to avoid allocating per access — the
  // adapter reads these many times per frame for its camera pose.
  return {
    get id() {
      return vehicle.vehicleId;
    },
    get position() {
      return vehicle.getPosition();
    },
    get quaternion() {
      return vehicle.getQuaternion();
    },
    setControls(throttle: number, rudder: number) {
      anyVehicle.setControls!(throttle, rudder);
    },
    getForwardSpeed(): number {
      return anyVehicle.getForwardSpeed!();
    },
    update(dt: number) {
      vehicle.update(dt);
    },
    setTerrain(terrain) {
      anyVehicle.setTerrain!(terrain);
    },
    isGrounded(): boolean {
      // PBR omits the grounded check (deep-river craft); the adapter's
      // exit-plan fallback handles `false` as "deep water dismount", which
      // is the correct PBR default.
      return typeof anyVehicle.isGrounded === 'function' ? anyVehicle.isGrounded!() : false;
    },
  };
}

/**
 * Resolve which player-adapter family fits a given drivable vehicle. The
 * factory dispatches on category first, then disambiguates inside `'ground'`
 * (M151 wheeled vs M48 tracked) using the canonical id naming the seed-rotation
 * registry hands out (`motor_pool_small_m151`, `m48_tank_of_us_fob`, etc).
 *
 * Pure function — exported for unit tests and for the composer to assert it
 * recognises a vehicle before opening the boarding flow.
 */
export type ResolvedAdapterFamily = 'ground' | 'tank' | 'watercraft' | 'emplacement';

export function resolveAdapterFamily(vehicle: IVehicle): ResolvedAdapterFamily | null {
  switch (vehicle.category) {
    case 'emplacement':
      return 'emplacement';
    case 'watercraft':
      return 'watercraft';
    case 'ground': {
      const id = vehicle.vehicleId;
      // Tanks live in the `'ground'` category alongside wheeled jeeps. The
      // M48 id pattern (`m48_*` or `*_m48_*`) is the same one the proximity
      // prompt copy uses to switch labels.
      if (id.startsWith('m48_') || id.includes('_m48_') || vehicle instanceof Tank) {
        return 'tank';
      }
      return 'ground';
    }
    case 'helicopter':
    case 'fixed_wing':
    default:
      return null;
  }
}

/**
 * Factory + dispatcher for the player-side vehicle adapters.
 *
 * Split A of `vekhikl-board-controller-factory` (the original task was cut
 * in half after an executor died at 200k tokens). Split B wires this into
 * `PlayerController` + the startup composer; this module is intentionally
 * standalone so it can be unit-tested in isolation against fakes for the
 * vehicle manager, session controller, and proximity checker.
 *
 * Lifecycle on `tryBoardNearest()`:
 *
 *   1. Read the currently-prompted vehicle id from the proximity checker.
 *   2. Resolve the `IVehicle` instance through `VehicleManager.getVehicle`.
 *   3. Dispatch on category (+ id pattern for the tank/jeep split) to pick
 *      a `PlayerVehicleAdapter` subclass and construct it against the live
 *      vehicle instance.
 *   4. Lock a seat on the vehicle (`vehicle.enterVehicle('player', role)`).
 *   5. Register the adapter on the session controller and call
 *      `session.enterVehicle(vehicleType, vehicleId, ctx)`.
 *
 * Lifecycle on `tryExit()`:
 *
 *   1. If `session.isInVehicle()` is false → no-op, returns `false`.
 *   2. Build a `VehicleTransitionContext` and call `session.exitVehicle(ctx)`.
 *   3. Release the seat on the underlying vehicle so NPCs can re-occupy it.
 *
 * Both helicopter and fixed-wing aircraft are intentionally out of scope —
 * they have their own boarding paths (`HelicopterInteraction`,
 * `FixedWingInteraction`) that long predate the unified session controller.
 */
export class PlayerVehicleAdapterFactory {
  private readonly deps: PlayerVehicleAdapterFactoryDeps;

  /**
   * Adapter cache keyed by `IVehicle.vehicleId`. We rebuild the adapter on
   * first board per vehicle (model wiring is per-instance), but keep the
   * built adapter around so a board → exit → re-board on the same jeep
   * does not allocate a fresh `GroundVehiclePlayerAdapter` each time.
   *
   * The session controller stores adapters by `vehicleType` string, so a
   * re-register on board is needed regardless — the cache only saves the
   * allocation.
   */
  private readonly adapterCache = new Map<string, PlayerVehicleAdapter>();

  constructor(deps: PlayerVehicleAdapterFactoryDeps) {
    this.deps = deps;
  }

  /**
   * Resolve the nearest drivable vehicle from the proximity-prompt cache,
   * dispatch by category, register the matching adapter on the session
   * controller, and enter the vehicle. Returns `true` if the boarding
   * round-trip completed end-to-end, `false` otherwise.
   *
   * Reasons this may return `false`:
   *   - No proximity prompt is currently up (player is not in range).
   *   - The prompted vehicle id no longer resolves through `VehicleManager`
   *     (it was unregistered between the prompt and the F-press).
   *   - The vehicle has no free pilot seat (NPC boarded ahead of the player).
   *   - The session controller refused the entry (e.g. an in-flight aircraft
   *     refused the swap).
   */
  tryBoardNearest(): boolean {
    const vehicleId = this.deps.proximityChecker.getLastShownVehicleId();
    if (!vehicleId) return false;

    const vehicle = this.deps.vehicleManager.getVehicle(vehicleId);
    if (!vehicle) return false;
    if (vehicle.isDestroyed()) return false;

    const family = resolveAdapterFamily(vehicle);
    if (!family) return false;

    const preferredRole = family === 'emplacement' ? 'gunner' : 'pilot';
    const seatIndex = vehicle.enterVehicle('player', preferredRole);
    if (seatIndex === null) return false;

    const adapter = this.getOrBuildAdapter(vehicle, family);
    if (!adapter) {
      // Failed to bridge the vehicle into the adapter's model surface — back
      // the seat lock out so an NPC can mount it instead.
      vehicle.exitVehicle('player');
      return false;
    }

    this.deps.vehicleSessionController.registerAdapter(adapter);
    const ctx = this.buildTransitionContext(vehicle.getPosition().clone(), vehicle.vehicleId);
    const entered = this.deps.vehicleSessionController.enterVehicle(
      adapter.vehicleType,
      vehicle.vehicleId,
      ctx,
    );
    if (!entered) {
      vehicle.exitVehicle('player');
      return false;
    }
    return true;
  }

  /**
   * Voluntary exit; mirrors the helicopter handler shape. Returns `true`
   * when the player was seated and the exit completed (which includes the
   * session controller running the adapter's `onExit` hook). Returns
   * `false` when the player was not in a vehicle, or when the adapter's
   * exit plan blocked the dismount.
   */
  tryExit(): boolean {
    if (!this.deps.vehicleSessionController.isInVehicle()) return false;

    const vehicleId = this.deps.vehicleSessionController.getVehicleId();
    const vehicle = vehicleId
      ? this.deps.vehicleManager.getVehicle(vehicleId)
      : null;

    const ctx = this.buildTransitionContext(
      this.deps.playerState.position.clone(),
      vehicleId ?? undefined,
    );
    const result = this.deps.vehicleSessionController.exitVehicle(ctx, {
      reason: 'input',
    });

    if (result.exited && vehicle) {
      vehicle.exitVehicle('player');
    }
    return result.exited;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private getOrBuildAdapter(
    vehicle: IVehicle,
    family: ResolvedAdapterFamily,
  ): PlayerVehicleAdapter | null {
    const cached = this.adapterCache.get(vehicle.vehicleId);
    if (cached) return cached;

    const built = this.buildAdapter(vehicle, family);
    if (built) {
      this.adapterCache.set(vehicle.vehicleId, built);
    }
    return built;
  }

  private buildAdapter(
    vehicle: IVehicle,
    family: ResolvedAdapterFamily,
  ): PlayerVehicleAdapter | null {
    switch (family) {
      case 'ground': {
        const model = bridgeGroundModel(vehicle);
        if (!model) return null;
        return new GroundVehiclePlayerAdapter(model);
      }
      case 'tank': {
        if (!(vehicle instanceof Tank)) return null;
        return new TankPlayerAdapter(vehicle);
      }
      case 'watercraft': {
        const model = bridgeWatercraftModel(vehicle);
        if (!model) return null;
        return new WatercraftPlayerAdapter(model);
      }
      case 'emplacement': {
        if (!(vehicle instanceof Emplacement)) return null;
        return new EmplacementPlayerAdapter(vehicle);
      }
      default:
        return null;
    }
  }

  private buildTransitionContext(
    position: THREE.Vector3,
    vehicleId?: string,
  ): VehicleTransitionContext {
    const explicitSetter = this.deps.setPosition;
    const setPosition = explicitSetter
      ? explicitSetter
      : (p: THREE.Vector3, _reason: string): void => {
          this.deps.playerState.position.copy(p);
        };
    // Resolve the vehicle id from the caller (the vehicle being boarded /
    // exited) and fall back to the session's current id. The old code only
    // read the session id, which is null on the *first* board (the session
    // has not entered yet), so the adapter's `onEnter` ctx carried an empty
    // `vehicleId`. The session controller re-spread the real id over the ctx
    // on enter/exit, which papered over the bug — but adapters that read the
    // ctx id directly (gunner-station snap reasons, future weapon wiring)
    // would see ''. Threading the resolved id through fixes it at the source.
    const resolvedId =
      vehicleId ?? this.deps.vehicleSessionController.getVehicleId() ?? '';
    return {
      playerState: this.deps.playerState,
      vehicleId: resolvedId,
      position,
      setPosition,
      input: this.deps.input,
      cameraController: this.deps.cameraController,
      gameRenderer: this.deps.gameRenderer,
      hudSystem: this.deps.hudSystem,
    };
  }
}
