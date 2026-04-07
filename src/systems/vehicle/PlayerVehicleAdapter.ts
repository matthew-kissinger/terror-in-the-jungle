import type * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerInput } from '../player/PlayerInput';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { IGameRenderer, IHUDSystem } from '../../types/SystemInterfaces';
import type { InputContext } from '../input/InputContextManager';

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
