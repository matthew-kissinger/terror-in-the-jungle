import type { PlayerState } from '../../types';
import type { PlayerVehicleAdapter, VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import { Logger } from '../../utils/Logger';

export type VehicleSessionState =
  | { status: 'infantry' }
  | { status: 'in_vehicle'; vehicleType: string; vehicleId: string; adapter: PlayerVehicleAdapter };

/**
 * Single source of truth for the player's vehicle state.
 * Owns the transition lifecycle with guaranteed cleanup.
 *
 * Keeps PlayerState.isInHelicopter / isInFixedWing / helicopterId / fixedWingId
 * synchronized as a derived cache so existing code continues to work.
 */
export class VehicleStateManager {
  private state: VehicleSessionState = { status: 'infantry' };
  private readonly adapters = new Map<string, PlayerVehicleAdapter>();

  registerAdapter(adapter: PlayerVehicleAdapter): void {
    this.adapters.set(adapter.vehicleType, adapter);
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

  /**
   * Enter a vehicle.
   *
   * 1. If already in a vehicle, exit it first (guaranteed cleanup).
   * 2. Look up adapter by vehicleType.
   * 3. Set state to in_vehicle.
   * 4. Call adapter.onEnter().
   * 5. Sync PlayerState flags.
   */
  enterVehicle(vehicleType: string, vehicleId: string, ctx: VehicleTransitionContext): boolean {
    const adapter = this.adapters.get(vehicleType);
    if (!adapter) {
      Logger.warn('VehicleStateManager', `No adapter registered for vehicle type: ${vehicleType}`);
      return false;
    }

    // Exit current vehicle first if needed
    if (this.state.status === 'in_vehicle') {
      this.exitVehicle(ctx);
    }

    this.state = { status: 'in_vehicle', vehicleType, vehicleId, adapter };
    adapter.onEnter({ ...ctx, vehicleId });
    this.syncPlayerState(ctx.playerState);

    Logger.info('VehicleStateManager', `Entered ${vehicleType}: ${vehicleId}`);
    return true;
  }

  /**
   * Exit the current vehicle.
   *
   * 1. Call adapter.onExit().
   * 2. Call adapter.resetControlState() (belt-and-suspenders).
   * 3. Set state to infantry.
   * 4. Sync PlayerState flags.
   */
  exitVehicle(ctx: VehicleTransitionContext): void {
    if (this.state.status !== 'in_vehicle') {
      return;
    }

    const { adapter, vehicleType, vehicleId } = this.state;
    adapter.onExit({ ...ctx, vehicleId });
    adapter.resetControlState();

    this.state = { status: 'infantry' };
    this.syncPlayerState(ctx.playerState);

    Logger.info('VehicleStateManager', `Exited ${vehicleType}: ${vehicleId}`);
  }

  /**
   * Update the active vehicle adapter. No-op if infantry.
   */
  update(ctx: VehicleUpdateContext): void {
    if (this.state.status !== 'in_vehicle') {
      return;
    }
    this.state.adapter.update(ctx);
  }

  /**
   * Keep PlayerState flags in sync for backward compatibility.
   * These become derived state - VehicleStateManager is the authority.
   */
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
}
