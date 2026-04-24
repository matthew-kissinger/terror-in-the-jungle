import type { PlayerState } from '../../types';
import { Logger } from '../../utils/Logger';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitResult,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';

type VehicleSessionState =
  | { status: 'infantry' }
  | { status: 'in_vehicle'; vehicleType: string; vehicleId: string; adapter: PlayerVehicleAdapter };

export class VehicleSessionController {
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
    this.clearTransitionInput(ctx);
    adapter.onEnter({ ...ctx, vehicleId });
    this.syncPlayerState(ctx.playerState);

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

    this.state = { status: 'infantry' };
    this.syncPlayerState(ctx.playerState);

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
}
