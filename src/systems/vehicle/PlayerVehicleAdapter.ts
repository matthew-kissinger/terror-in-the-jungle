import type * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerInput } from '../player/PlayerInput';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { IGameRenderer, IHUDSystem } from '../../types/SystemInterfaces';
import type { InputContext } from '../input/InputContextManager';

export type VehicleExitMode = 'normal' | 'emergency_eject' | 'force_cleanup';

export interface VehicleExitOptions {
  allowEject?: boolean;
  force?: boolean;
  reason?: string;
}

export interface VehicleExitPlan {
  canExit: boolean;
  mode?: VehicleExitMode;
  position?: THREE.Vector3;
  message?: string;
}

export type VehicleExitResult =
  | { exited: true; vehicleType: string; vehicleId: string; mode: VehicleExitMode; position: THREE.Vector3 }
  | { exited: false; reason: 'not_in_vehicle' | 'blocked'; message?: string };

/**
 * Context provided during vehicle enter/exit transitions.
 * Owns all the cross-cutting references the adapter needs to set up or tear down.
 */
export interface VehicleTransitionContext {
  playerState: PlayerState;
  vehicleId: string;
  position: THREE.Vector3;
  setPosition: (position: THREE.Vector3, reason: string) => void;
  input: PlayerInput;
  cameraController: PlayerCamera;
  gameRenderer?: IGameRenderer;
  hudSystem?: IHUDSystem;
  exitMode?: VehicleExitMode;
}

/**
 * Context provided every frame while the player is in a vehicle.
 */
export interface VehicleUpdateContext {
  deltaTime: number;
  input: PlayerInput;
  cameraController: PlayerCamera;
  hudSystem?: IHUDSystem;
}

/**
 * Each vehicle type implements this interface.
 * The adapter encapsulates ALL per-vehicle logic: controls, HUD, physics binding, state.
 * VehicleStateManager guarantees onEnter/onExit are called symmetrically.
 */
export interface PlayerVehicleAdapter {
  /** Unique key for this adapter type (e.g. 'helicopter', 'fixed_wing') */
  readonly vehicleType: string;

  /** The input context to set when this vehicle is active */
  readonly inputContext: InputContext;

  /**
   * Called once when the player enters this vehicle.
   * Must set up HUD, input context, camera, and control state.
   */
  onEnter(ctx: VehicleTransitionContext): void;

  /**
   * Called once when the player exits this vehicle.
   * Must tear down HUD, restore camera, and reset all control state.
   * This is the ONLY exit path - guaranteed cleanup.
   */
  onExit(ctx: VehicleTransitionContext): void;

  /**
   * Optional exit policy and placement hook. VehicleSessionController owns the
   * final transition; adapters only describe whether and where the exit can occur.
   */
  getExitPlan?(ctx: VehicleTransitionContext, options: VehicleExitOptions): VehicleExitPlan;

  /**
   * Per-frame update while the player is in this vehicle.
   * Reads input, sends commands to physics, updates HUD.
   */
  update(ctx: VehicleUpdateContext): void;

  /**
   * Reset all control state owned by this adapter to defaults.
   * Called by onExit, but also available for forced cleanup.
   */
  resetControlState(): void;
}
