/**
 * Controller that translates `PlayerBotIntent` into the existing
 * PlayerController surface — movement intent, view angles, fire trigger,
 * reload. The bot never touches the engine directly; the controller is
 * the one and only translation boundary.
 *
 * Keeping this as a separate class (rather than folding it into the bot)
 * mirrors the NPCFixedWingPilot / FixedWing controller separation: the
 * bot is a pure function of its observations; the controller is the
 * thin engine adapter.
 */

import type { PlayerBotIntent } from './types';

/**
 * Minimal interface the controller needs from the live PlayerController.
 * Kept narrow on purpose — do not couple this to the full PlayerController
 * shape. PlayerController already exposes these methods on master.
 */
export interface PlayerBotControllerTarget {
  applyMovementIntent(intent: { forward: number; strafe: number; sprint: boolean }): void;
  setViewAngles(yaw: number, pitch: number): void;
  fireStart(): void;
  fireStop(): void;
  reloadWeapon(): void;
  /** Optional — if present, controller routes crouch through player state. */
  readonly playerController?: unknown;
}

/**
 * Apply-result telemetry. The driver can use this to surface what keys
 * the bot actually triggered without having to instrument the controller.
 */
export interface PlayerBotControllerApplyResult {
  readonly fired: boolean;
  readonly reloaded: boolean;
  readonly forward: number;
  readonly strafe: number;
  readonly sprint: boolean;
  readonly yaw: number;
  readonly pitch: number;
}

/** Absolute pitch clamp — ±80° matches the live camera gimbal budget. */
const PITCH_LIMIT_RAD = (80 * Math.PI) / 180;

function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(-PITCH_LIMIT_RAD, Math.min(PITCH_LIMIT_RAD, pitch));
}

/** Normalize any real yaw into (−π, π]. */
function wrapYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  let y = yaw;
  while (y > Math.PI) y -= Math.PI * 2;
  while (y < -Math.PI) y += Math.PI * 2;
  return y;
}

/** Lerp two angles (radians) along the shortest arc. `t` in [0,1]. */
export function lerpAngle(from: number, to: number, t: number): number {
  let delta = wrapYaw(to - from);
  const clamped = Math.max(0, Math.min(1, t));
  return wrapYaw(from + delta * clamped);
}

export class PlayerBotController {
  private firingHeld = false;
  private lastYaw = 0;
  private lastPitch = 0;

  constructor(private readonly target: PlayerBotControllerTarget) {}

  /** Reset internal state. Call when the bot is respawned or stopped. */
  reset(): void {
    if (this.firingHeld) {
      try { this.target.fireStop(); } catch { /* ignore */ }
    }
    this.firingHeld = false;
    this.lastYaw = 0;
    this.lastPitch = 0;
    try { this.target.applyMovementIntent({ forward: 0, strafe: 0, sprint: false }); } catch { /* ignore */ }
  }

  /** Apply an intent. Returns what was actually committed. */
  apply(intent: PlayerBotIntent): PlayerBotControllerApplyResult {
    // Movement — straight passthrough, sprint driven by intent flag.
    const forward = clampAxis(intent.moveForward);
    const strafe = clampAxis(intent.moveStrafe);
    const sprint = !!intent.sprint && forward > 0.1; // sprint only when moving forward
    this.target.applyMovementIntent({ forward, strafe, sprint });

    // Aim — lerp toward the intent's target yaw/pitch. When aimLerpRate is
    // 1 (default for the harness) this is an effective snap, matching the
    // aggressive-mode behavior of the old killbot driver.
    const yawNext = lerpAngle(this.lastYaw, intent.aimYaw, intent.aimLerpRate);
    const pitchRaw = this.lastPitch + (clampPitch(intent.aimPitch) - this.lastPitch) * clamp01(intent.aimLerpRate);
    const pitchNext = clampPitch(pitchRaw);
    this.target.setViewAngles(yawNext, pitchNext);
    this.lastYaw = yawNext;
    this.lastPitch = pitchNext;

    // Fire — debounce. reload trumps fire (mirrors the live player's input).
    let fired = false;
    let reloaded = false;
    if (intent.reload) {
      if (this.firingHeld) {
        this.target.fireStop();
        this.firingHeld = false;
      }
      this.target.reloadWeapon();
      reloaded = true;
    } else if (intent.firePrimary) {
      if (!this.firingHeld) {
        this.target.fireStart();
        this.firingHeld = true;
      }
      fired = true;
    } else if (this.firingHeld) {
      this.target.fireStop();
      this.firingHeld = false;
    }

    return {
      fired,
      reloaded,
      forward,
      strafe,
      sprint,
      yaw: yawNext,
      pitch: pitchNext,
    };
  }

  /** Test access — the last committed yaw/pitch. */
  getLastYaw(): number { return this.lastYaw; }
  getLastPitch(): number { return this.lastPitch; }
  isFiringHeld(): boolean { return this.firingHeld; }

  /** Seed the internal yaw/pitch so the first frame doesn't snap from 0. */
  seedViewAngles(yaw: number, pitch: number): void {
    this.lastYaw = wrapYaw(yaw);
    this.lastPitch = clampPitch(pitch);
  }
}

function clampAxis(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
