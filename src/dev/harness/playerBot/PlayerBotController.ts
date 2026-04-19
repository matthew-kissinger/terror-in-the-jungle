/**
 * Controller that translates `PlayerBotIntent` into the existing
 * PlayerController surface — movement intent, view angles, fire trigger,
 * reload. The bot never touches the engine directly; the controller is
 * the one and only translation boundary.
 *
 * Aim path: intent carries a world-space `aimTarget` point. The
 * controller uses `camera.lookAt()` (the same primitive every other
 * camera consumer in the repo uses — PlayerCamera, DeathCamSystem,
 * MortarCamera, SpectatorCamera, and the old killbot driver) to compute
 * the target yaw/pitch. That keeps the rotation convention inside
 * Three.js, where it belongs, and prevents the sign-error regression
 * PR #95 shipped.
 *
 * Fire path: an aim-dot gate (cosine cone) runs before `fireStart()`.
 * It is the one-line defense against future rotation-convention
 * regressions — if the camera is NOT pointing at the aim target, we
 * suppress the trigger rather than sending 243 shots into empty air.
 *
 * Keeping this as a separate class (rather than folding it into the bot)
 * mirrors the NPCFixedWingPilot / FixedWing controller separation: the
 * bot is a pure function of its observations; the controller is the
 * thin engine adapter.
 */

import * as THREE from 'three';
import type { PlayerBotIntent } from './types';

/**
 * Minimal interface the controller needs from the live PlayerController.
 * Kept narrow on purpose — do not couple this to the full PlayerController
 * shape. `getCamera` is already exposed on `IPlayerController` (not a fence
 * change; see docs/INTERFACE_FENCE.md).
 */
export interface PlayerBotControllerTarget {
  applyMovementIntent(intent: { forward: number; strafe: number; sprint: boolean }): void;
  setViewAngles(yaw: number, pitch: number): void;
  fireStart(): void;
  fireStop(): void;
  reloadWeapon(): void;
  /** Optional — the camera the controller should point via lookAt.
   *  When absent (older tests), aim path is a no-op (angles held). */
  getCamera?(): THREE.PerspectiveCamera;
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
  /** aim-dot (−1..1) at the end of apply. Undefined when no aim was committed. */
  readonly aimDot?: number;
}

/** Absolute pitch clamp — ±80° matches the live camera gimbal budget. */
const PITCH_LIMIT_RAD = (80 * Math.PI) / 180;
/** Aim-dot threshold for the fire gate (cos ≈ 0.8 ≈ 37° cone). */
const FIRE_AIM_DOT_THRESHOLD = 0.8;

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
  const delta = wrapYaw(to - from);
  const clamped = Math.max(0, Math.min(1, t));
  return wrapYaw(from + delta * clamped);
}

function lerp(from: number, to: number, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return from + (to - from) * c;
}

// Scratch vectors — reused to avoid per-tick allocations.
const _tmpEye = new THREE.Vector3();
const _tmpForward = new THREE.Vector3();
const _tmpToTarget = new THREE.Vector3();

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

    // Aim — use camera.lookAt() to convert the intent's world-space point
    // into (yaw, pitch) in the Three.js convention, then lerp from our
    // last-committed angles toward that target. At aimLerpRate=1 this is
    // an effective snap-to-target (matching the harness default); at
    // lower rates it's a slew.
    let yawNext = this.lastYaw;
    let pitchNext = this.lastPitch;
    let aimDot: number | undefined;

    const camera = typeof this.target.getCamera === 'function' ? this.target.getCamera() : undefined;
    if (intent.aimTarget && camera) {
      // Stash the real rotation so lookAt's temporary write can be overwritten
      // by our lerped value via setViewAngles. This keeps the camera frame
      // coherent with PlayerCamera.setInfantryViewAngles.
      const prevOrder = camera.rotation.order;
      camera.rotation.order = 'YXZ';
      const savedY = camera.rotation.y;
      const savedX = camera.rotation.x;

      // Compute target yaw/pitch.
      camera.lookAt(intent.aimTarget.x, intent.aimTarget.y, intent.aimTarget.z);
      const targetYaw = wrapYaw(camera.rotation.y);
      const targetPitch = clampPitch(camera.rotation.x);

      // Restore and apply the lerped value via the engine surface.
      camera.rotation.y = savedY;
      camera.rotation.x = savedX;
      camera.rotation.order = prevOrder;

      yawNext = lerpAngle(this.lastYaw, targetYaw, intent.aimLerpRate);
      pitchNext = clampPitch(lerp(this.lastPitch, targetPitch, intent.aimLerpRate));
      this.target.setViewAngles(yawNext, pitchNext);
      this.lastYaw = yawNext;
      this.lastPitch = pitchNext;

      // After setViewAngles has applied the lerped angles, the camera
      // actually points at (yawNext, pitchNext). Re-read world direction
      // and compare to the eye→target vector for the aim-dot gate.
      aimDot = computeAimDot(camera, intent.aimTarget);
    }
    // else: aimTarget === null → hold current angles; no call to setViewAngles.

    // Fire path. Reload trumps fire (mirrors the live player's input).
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
      // Aim-dot gate — last-line defense. If we have an aim target + camera
      // but the camera is NOT pointing at it, SUPPRESS fire. This is the
      // one-line regression net that catches yaw-convention drift.
      const passesAimGate =
        intent.aimTarget && camera
          ? (typeof aimDot === 'number' && aimDot >= FIRE_AIM_DOT_THRESHOLD)
          : true; // no camera / no aim target → defer to bot's decision

      if (passesAimGate) {
        if (!this.firingHeld) {
          this.target.fireStart();
          this.firingHeld = true;
        }
        fired = true;
      } else if (this.firingHeld) {
        // We were firing, but we've drifted off-target — stop the stream.
        this.target.fireStop();
        this.firingHeld = false;
      }
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
      aimDot,
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

/** Cosine of the angle between camera forward and (eye→target). */
function computeAimDot(camera: THREE.PerspectiveCamera, aimTarget: { x: number; y: number; z: number }): number {
  camera.getWorldPosition(_tmpEye);
  camera.getWorldDirection(_tmpForward);
  _tmpToTarget.set(aimTarget.x - _tmpEye.x, aimTarget.y - _tmpEye.y, aimTarget.z - _tmpEye.z);
  const len = _tmpToTarget.length();
  if (!Number.isFinite(len) || len < 1e-6) return 1; // degenerate: treat as on-target
  _tmpToTarget.multiplyScalar(1 / len);
  return _tmpForward.dot(_tmpToTarget);
}

function clampAxis(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}
