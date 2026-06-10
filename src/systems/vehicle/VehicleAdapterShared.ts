// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { PlayerInput } from '../player/PlayerInput';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { IGameRenderer } from '../../types/SystemInterfaces';
import type { CrosshairMode } from '../../ui/hud/CrosshairSystem';
import type { VehicleTransitionContext } from './PlayerVehicleAdapter';

/**
 * Shared enter/exit/input plumbing for the player vehicle adapters.
 *
 * Every `*PlayerAdapter` under `src/systems/vehicle/` repeated the same
 * cross-cutting bookkeeping verbatim: clearing leftover flight-mode flags,
 * setting the input context, saving/restoring the infantry look angles,
 * tearing down the HUD vehicle context, re-acquiring pointer lock, and the
 * W/S + A/D axis reads with the same touch deadzone. This module is the
 * single home for those byte-identical fragments so the per-vehicle adapters
 * only carry their genuinely vehicle-specific logic.
 *
 * Every helper preserves the exact defensive shape the adapters used
 * (duck-typed `typeof fn === 'function'` guards, the `'setInputContext' in
 * input` + cast, optional chaining on the camera controller) so that partial
 * test doubles keep working unchanged — this is a deletion refactor, not a
 * behaviour change.
 */

const TOUCH_DEADZONE = 0.1;

/** The flight-mode flag the input layer tracks for the current vehicle. */
export type FlightVehicleMode = 'none' | 'helicopter' | 'plane';

/**
 * Set the input layer's flight-vehicle mode, falling back to the legacy
 * `setInHelicopter` boolean on inputs that predate the tri-state flag.
 * Mirrors the private helper the flight adapters carried.
 */
export function setFlightVehicleInputState(input: PlayerInput, mode: FlightVehicleMode): void {
  if (typeof input.setFlightVehicleMode === 'function') {
    input.setFlightVehicleMode(mode);
    return;
  }
  input.setInHelicopter(mode !== 'none');
}

/**
 * Set the input context when the input implementation supports it. The
 * production `PlayerInput` exposes `setInputContext`, but the contract is not
 * on the fenced interface, so adapters duck-type it; test doubles routinely
 * omit it.
 */
export function setInputContext(input: PlayerInput, context: string): void {
  if ('setInputContext' in input) {
    (input as unknown as { setInputContext(ctx: string): void }).setInputContext(context);
  }
}

/**
 * Clear any leftover flight bookkeeping so a ground/water/emplacement
 * vehicle does not inherit stale heli/plane flags, then pin the input
 * context to `gameplay`. The defensive pattern every ground-mode adapter
 * repeated in both `onEnter` and `onExit`.
 */
export function clearFlightBookkeeping(input: PlayerInput): void {
  setFlightVehicleInputState(input, 'none');
  setInputContext(input, 'gameplay');
}

/**
 * Take the player out of infantry motion and snap them onto the seat. The
 * `reason` string is per-vehicle (it labels the teleport in the streaming
 * hooks), so it stays a caller argument.
 */
export function seatPlayer(ctx: VehicleTransitionContext, reason: string): void {
  ctx.playerState.velocity.set(0, 0, 0);
  ctx.playerState.isRunning = false;
  ctx.setPosition(ctx.position, reason);
}

/**
 * Re-acquire pointer lock so mouse-look / turret aim keeps working after a
 * transition. Guarded because not every input double implements it.
 */
export function relockPointer(input: PlayerInput): void {
  if (typeof input.relockPointer === 'function') {
    input.relockPointer();
  }
}

/**
 * Set the HUD crosshair mode for the seated craft. Guarded because the game
 * renderer is optional (test doubles routinely omit it). Each ground-gunnery
 * adapter sets its own reticle mode on enter and restores `'infantry'` on
 * exit via `setInfantryCrosshair`.
 */
export function setCrosshairMode(gameRenderer: IGameRenderer | undefined, mode: CrosshairMode): void {
  if (gameRenderer) {
    gameRenderer.setCrosshairMode(mode);
  }
}

/**
 * Restore the infantry crosshair. The ground-mode adapters set this on exit;
 * guarded because the game renderer is optional.
 */
export function setInfantryCrosshair(gameRenderer: IGameRenderer | undefined): void {
  setCrosshairMode(gameRenderer, 'infantry');
}

/**
 * Resolve whether flight mouse-control is enabled, falling back to the legacy
 * helicopter-specific accessor. Shared by the heli + fixed-wing adapters.
 */
export function getFlightMouseControlEnabled(cameraController: PlayerCamera): boolean {
  if (typeof cameraController.getFlightMouseControlEnabled === 'function') {
    return cameraController.getFlightMouseControlEnabled();
  }
  return cameraController.getHelicopterMouseControlEnabled();
}

/**
 * Whether the touch layer is in flight mode, falling back to the legacy
 * helicopter-only predicate. Shared by the heli + fixed-wing adapters.
 */
export function isTouchFlightMode(input: PlayerInput): boolean {
  const touchControls = input.getTouchControls?.();
  if (!touchControls) return false;
  if (typeof touchControls.isInFlightMode === 'function') {
    return touchControls.isInFlightMode();
  }
  return touchControls.isInHelicopterMode();
}

/**
 * Read the touch cyclic (pitch/roll) input, falling back to the legacy
 * helicopter-only accessor. Shared by the heli + fixed-wing adapters.
 */
export function getTouchFlightCyclicInput(input: PlayerInput): { pitch: number; roll: number } {
  if (typeof input.getTouchFlightCyclicInput === 'function') {
    return input.getTouchFlightCyclicInput();
  }
  return input.getTouchCyclicInput();
}

/**
 * Read the forward/back drive axis: touch joystick (-z forward, clamped with
 * the standard deadzone) else W = +1 / S = -1. Returns 0 when idle. Shared by
 * the ground, tank, and watercraft driver inputs.
 */
export function readThrottleAxis(input: PlayerInput): number {
  const touch = input.getTouchControls?.();
  if (touch) {
    const move = input.getTouchMovementVector();
    if (Math.abs(move.z) > TOUCH_DEADZONE) {
      // Touch joystick: -z is forward (matches every drivable's convention).
      return THREE.MathUtils.clamp(-move.z, -1, 1);
    }
    return 0;
  }
  if (input.isKeyPressed('keyw')) return 1;
  if (input.isKeyPressed('keys')) return -1;
  return 0;
}

/**
 * Read the lateral steer/turn/rudder axis: touch joystick x (clamped with the
 * standard deadzone) else D = +1 / A = -1. Returns 0 when idle. Shared by the
 * ground, tank, and watercraft driver inputs (each scales/interprets the
 * normalized result for its own physics layer).
 */
export function readLateralAxis(input: PlayerInput): number {
  const touch = input.getTouchControls?.();
  if (touch) {
    const move = input.getTouchMovementVector();
    if (Math.abs(move.x) > TOUCH_DEADZONE) {
      return THREE.MathUtils.clamp(move.x, -1, 1);
    }
    return 0;
  }
  if (input.isKeyPressed('keyd')) return 1;
  if (input.isKeyPressed('keya')) return -1;
  return 0;
}
