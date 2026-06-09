// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { PlayerState } from '../../types';
import { Logger } from '../../utils/Logger';
import type { IVehicle, SeatRole } from './IVehicle';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitResult,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';

/** The player's occupant id on every IVehicle seat. */
const PLAYER_OCCUPANT_ID = 'player';

/**
 * Resolves an `IVehicle` (the seat-truth source) by its id. `VehicleManager`
 * satisfies this directly. Injected so the session controller can be the
 * single chokepoint that locks/releases the occupied seat — every player
 * enter/exit path (F, Escape, requestVehicleExit, heli/fixed-wing) flows
 * through `enterVehicle` / `exitVehicle` here, so binding the seat here means
 * no path can leave a seat ghost.
 */
export interface VehicleSeatBinder {
  getVehicle(vehicleId: string): IVehicle | null;
}

type VehicleSessionState =
  | { status: 'infantry' }
  | { status: 'in_vehicle'; vehicleType: string; vehicleId: string; adapter: PlayerVehicleAdapter };

type VehicleOccupancyChangeCallback = (inVehicle: boolean, state: Readonly<VehicleSessionState>) => void;

export class VehicleSessionController {
  private state: VehicleSessionState = { status: 'infantry' };
  private readonly adapters = new Map<string, PlayerVehicleAdapter>();
  private onOccupancyChange?: VehicleOccupancyChangeCallback;
  private seatBinder?: VehicleSeatBinder;

  registerAdapter(adapter: PlayerVehicleAdapter): void {
    this.adapters.set(adapter.vehicleType, adapter);
  }

  setOccupancyChangeCallback(callback: VehicleOccupancyChangeCallback | undefined): void {
    this.onOccupancyChange = callback;
  }

  /**
   * Inject the seat-truth resolver. Optional: when unset (some unit tests),
   * seat lock/release is skipped and the session-level state is the only
   * record of occupancy. In production the boarding factory wires this so
   * every exit path releases the occupied seat exactly once.
   */
  setSeatBinder(binder: VehicleSeatBinder | undefined): void {
    this.seatBinder = binder;
  }

  getState(): Readonly<VehicleSessionState> {
    return this.state;
  }

  isInVehicle(): boolean {
    return this.state.status === 'in_vehicle';
  }

  getActiveAdapter(): PlayerVehicleAdapter | null {
    return this.state.status === 'in_vehicle' ? this.state.adapter : null;
  }

  getVehicleType(): string | null {
    return this.state.status === 'in_vehicle' ? this.state.vehicleType : null;
  }

  getVehicleId(): string | null {
    return this.state.status === 'in_vehicle' ? this.state.vehicleId : null;
  }

  enterVehicle(vehicleType: string, vehicleId: string, ctx: VehicleTransitionContext): boolean {
    const adapter = this.adapters.get(vehicleType);
    if (!adapter) {
      Logger.warn('VehicleSessionController', `No adapter registered for vehicle type: ${vehicleType}`);
      return false;
    }

    if (this.state.status === 'in_vehicle') {
      const result = this.exitVehicle(ctx, { force: true, reason: 'vehicle-switch' });
      if (!result.exited) {
        return false;
      }
    }

    this.state = { status: 'in_vehicle', vehicleType, vehicleId, adapter };
    this.lockSeat(vehicleType, vehicleId);
    this.clearTransitionInput(ctx);
    adapter.onEnter({ ...ctx, vehicleId });
    this.syncPlayerState(ctx.playerState);
    this.notifyOccupancyChange();

    Logger.info('VehicleSessionController', `Entered ${vehicleType}: ${vehicleId}`);
    return true;
  }

  exitVehicle(ctx: VehicleTransitionContext, options: VehicleExitOptions = {}): VehicleExitResult {
    if (this.state.status !== 'in_vehicle') {
      return { exited: false, reason: 'not_in_vehicle' };
    }

    const { adapter, vehicleType, vehicleId } = this.state;
    const transitionCtx = { ...ctx, vehicleId };
    const plan = options.force
      ? { canExit: true, mode: 'force_cleanup' as const, position: ctx.position }
      : adapter.getExitPlan?.(transitionCtx, options) ?? {
          canExit: true,
          mode: 'normal' as const,
          position: ctx.position,
        };

    if (!plan.canExit) {
      const message = plan.message ?? 'Cannot exit vehicle yet.';
      ctx.hudSystem?.showMessage?.(message, 2000);
      return { exited: false, reason: 'blocked', message };
    }

    const exitPosition = plan.position ?? ctx.position;
    const exitMode = plan.mode ?? 'normal';
    adapter.onExit({ ...transitionCtx, position: exitPosition, exitMode });
    adapter.resetControlState();
    this.clearTransitionInput(ctx);

    // Release the IVehicle seat BEFORE flipping to infantry so the resolver
    // still has the vehicle id. Every exit path (F, Escape, requestVehicleExit,
    // heli/fixed-wing) funnels through here, so this is the one place that has
    // to free the seat — no path can leave a ghost.
    this.releaseSeat(vehicleId);

    this.state = { status: 'infantry' };
    this.syncPlayerState(ctx.playerState);
    this.notifyOccupancyChange();

    if (plan.message) {
      ctx.hudSystem?.showMessage?.(plan.message, 2000);
    }

    Logger.info('VehicleSessionController', `Exited ${vehicleType}: ${vehicleId} (${exitMode})`);
    return { exited: true, vehicleType, vehicleId, mode: exitMode, position: exitPosition };
  }

  update(ctx: VehicleUpdateContext): void {
    if (this.state.status !== 'in_vehicle') {
      return;
    }
    this.state.adapter.update(ctx);
  }

  /**
   * Lock the player into a seat on the resolved IVehicle. Idempotent: if the
   * player already occupies a seat on this vehicle (the ground/water/emplacement
   * boarding factory pre-locks to compute the seat world pose, and the heli
   * interaction locks the pilot seat), this is a no-op so we never lock a
   * second seat. The preferred role mirrors the boarding factory's choice
   * (gunner for emplacements, pilot for everything else).
   */
  private lockSeat(vehicleType: string, vehicleId: string): void {
    const vehicle = this.seatBinder?.getVehicle(vehicleId);
    if (!vehicle) return;
    if (this.playerSeatedOn(vehicle)) return;
    const preferredRole: SeatRole = vehicleType === 'emplacement' ? 'gunner' : 'pilot';
    vehicle.enterVehicle(PLAYER_OCCUPANT_ID, preferredRole);
  }

  /**
   * Release the player's seat on the resolved IVehicle. Idempotent: a no-op
   * when the player is not an occupant (e.g. the seat was already released by
   * a force-cleanup, or the binder was unset). `IVehicle.exitVehicle` itself
   * returns null for a non-occupant, so a redundant call is harmless.
   */
  private releaseSeat(vehicleId: string): void {
    const vehicle = this.seatBinder?.getVehicle(vehicleId);
    if (!vehicle) return;
    vehicle.exitVehicle(PLAYER_OCCUPANT_ID);
  }

  private playerSeatedOn(vehicle: IVehicle): boolean {
    return vehicle.getSeats().some(seat => seat.occupantId === PLAYER_OCCUPANT_ID);
  }

  private syncPlayerState(playerState: PlayerState): void {
    if (this.state.status === 'in_vehicle') {
      playerState.isInHelicopter = this.state.vehicleType === 'helicopter';
      playerState.helicopterId = playerState.isInHelicopter ? this.state.vehicleId : null;
      playerState.isInFixedWing = this.state.vehicleType === 'fixed_wing';
      playerState.fixedWingId = playerState.isInFixedWing ? this.state.vehicleId : null;
    } else {
      playerState.isInHelicopter = false;
      playerState.helicopterId = null;
      playerState.isInFixedWing = false;
      playerState.fixedWingId = null;
    }
  }

  private clearTransitionInput(ctx: VehicleTransitionContext): void {
    if (typeof ctx.input.clearTransientInputState === 'function') {
      ctx.input.clearTransientInputState();
    }
  }

  private notifyOccupancyChange(): void {
    this.onOccupancyChange?.(this.isInVehicle(), this.state);
  }
}
