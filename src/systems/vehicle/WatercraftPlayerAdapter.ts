// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ITerrainRuntime, IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitPlan,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';
import type { InputContext } from '../input/InputContextManager';
import type { VehicleUIContext } from '../../ui/layout/types';
import type { SeatRole } from './IVehicle';
import {
  clearFlightBookkeeping,
  readLateralAxis,
  readThrottleAxis,
  relockPointer,
  seatPlayer,
  setInfantryCrosshair,
} from './VehicleAdapterShared';

// ── Watercraft control tuning ──
const DEFAULT_EXIT_SIDE_OFFSET_M = 1.5; // metres to the +X side of the hull on dismount fallback

function createWatercraftUIContext(): VehicleUIContext {
  // Reuse 'car' / 'groundVehicle' HUD bucket. VehicleKind doesn't have
  // a dedicated 'watercraft' yet; pulling the kind set onto VehicleKind
  // would be a fence-adjacent type change. The MVP gets the same
  // speedometer + exit prompt the ground HUD provides; a dedicated
  // 'watercraft' kind can land in a future cycle if the playtest asks
  // for one (depth gauge, current heading, etc).
  return {
    kind: 'car',
    role: 'pilot',
    hudVariant: 'groundVehicle',
    weaponCount: 0,
    capabilities: {
      canExit: true,
      canFirePrimary: false,
      canCycleWeapons: false,
      canFreeLook: true,
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchSide = new THREE.Vector3();

/**
 * Minimal structural contract the adapter needs from a watercraft
 * instance. Sampan (cycle #10 R2) and PBR (sibling task in the same
 * round) both satisfy it via a `position` getter, a `quaternion`
 * getter, and `setControls(throttle, rudder)`. Kept narrow so the
 * adapter stays generic across the two watercraft this cycle and the
 * Junk Force boats a future cycle may add.
 *
 * Coordination note for the sibling `pbr-integration` task: keep this
 * surface unchanged on your end. The PBR's driver seat reuses this
 * adapter with no per-craft subclass needed — pass any per-craft
 * tuning (camera distance, exit offset) through the constructor
 * options below, NOT by extending the interface.
 */
export interface WatercraftIVehicle {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** Driver throttle ∈ [-1,1] (positive = forward). Rudder ∈ [-1,1]. */
  setControls(throttle: number, rudder: number): void;
  /** Signed forward speed (m/s); negative when reversing. */
  getForwardSpeed(): number;
  /** Step the hull simulation; called by `stepPhysics` once per frame. */
  update(dt: number): void;
  /** Inject the terrain reference for grounding queries. */
  setTerrain(terrain: ITerrainRuntime | null): void;
  /** True when any hull sample touches terrain (beach / bank docking). */
  isGrounded(): boolean;
}

export interface WatercraftPlayerAdapterOptions {
  /** Distance behind the hull for the third-person camera (m). */
  cameraDistance?: number;
  /** Height above the hull origin for the third-person camera (m). */
  cameraHeight?: number;
  /** Look target height above the hull origin (m). */
  cameraLookHeight?: number;
  /** Side-step distance for the default exit plan (m). */
  exitSideOffset?: number;
}

/**
 * Generic watercraft player adapter. Shared by the Sampan (R2,
 * `sampan-integration`) and the PBR (R2, `pbr-integration`) — same
 * enter/exit/HUD/camera plumbing, different `WatercraftIVehicle`
 * binding. Mirrors `TankPlayerAdapter` in shape; lifecycle hooks fan
 * out to the bound watercraft instance.
 *
 * Input mapping (per cycle brief §"sampan-integration"):
 *   W / S      -> throttle  (+1 forward, -1 reverse)
 *   A / D      -> rudder    (D = +1, A = -1 — water-rudder convention)
 *   F (handled by VehicleSessionController) -> enter / exit
 *
 * Camera: third-person follow behind + above the stern. Mirrors the
 * jeep / tank follow-cam pose math.
 *
 * Exit: by default the player drops on the +X side of the hull
 * (`exitSideOffset` away), respecting hull yaw so the player does not
 * land in the wake. When the hull reports `isGrounded()` (a beach /
 * bank contact), the exit position is the same hull-side offset — the
 * grounded check is exposed in the plan via `message` so the session
 * controller can surface the "step onto the bank" prompt.
 */
export class WatercraftPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'watercraft';
  // Watercraft share the gameplay input context (movement keys + fire
  // suppression handled by the session controller via VehicleUIContext).
  readonly inputContext: InputContext = 'gameplay';

  /** Pilot is the watercraft driver seat (mirrors TankPlayerAdapter). */
  readonly playerSeat: SeatRole = 'pilot';

  // Third-person follow tuning. Defaults sized for a Sampan-ish hull;
  // the PBR sibling passes larger values through the constructor
  // options for its longer hull.
  cameraDistance: number;
  cameraHeight: number;
  cameraLookHeight: number;
  exitSideOffset: number;

  // Smoothed control axes, forwarded each frame into the watercraft
  // via setControls(throttle, rudder).
  private controls = {
    throttle: 0,
    rudder: 0,
  };

  private readonly model: WatercraftIVehicle;
  private mounted = false;

  constructor(model: WatercraftIVehicle, options: WatercraftPlayerAdapterOptions = {}) {
    this.model = model;
    this.cameraDistance = options.cameraDistance ?? 8;
    this.cameraHeight = options.cameraHeight ?? 3.0;
    this.cameraLookHeight = options.cameraLookHeight ?? 1.0;
    this.exitSideOffset = options.exitSideOffset ?? DEFAULT_EXIT_SIDE_OFFSET_M;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;

    // Player out of infantry motion, snapped onto the pilot deck.
    seatPlayer(ctx, 'watercraft.enter');

    // Watercraft are surface vehicles — clear any leftover flight
    // bookkeeping (defensive pattern from jeep / tank adapters).
    clearFlightBookkeeping(ctx.input);

    // Save infantry look angles so the camera restores cleanly on exit.
    ctx.cameraController.saveInfantryAngles();

    // Drive the third-person follow-cam from this frame onward (mirrors the
    // jeep / tank adapters). Cleared in onExit so the camera re-attaches to
    // the first-person infantry view. Without this the player keeps the
    // infantry camera while piloting and computeThirdPersonCamera is unreachable.
    ctx.cameraController.setVehicleFollowCamera?.(this);

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createWatercraftUIContext());

    setInfantryCrosshair(ctx.gameRenderer);

    // Re-acquire pointer lock so mouse-look (free orbital) keeps working.
    relockPointer(ctx.input);
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'watercraft.exit');

    clearFlightBookkeeping(ctx.input);
    // Re-attach first-person before restoring infantry angles so the next
    // updateCamera frame uses the infantry path, not the stale follow-cam.
    ctx.cameraController?.setVehicleFollowCamera?.(null);
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(null);

    setInfantryCrosshair(ctx.gameRenderer);

    // Park the hull: zero the driver inputs so the watercraft coasts
    // to a stop under water drag rather than carrying the player's
    // last throttle into the unattended state.
    this.model.setControls(0, 0);

    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Default: eject on the +X side of the hull (typically the dock
    // side for a sampan poled to a bank). When grounded the same
    // offset lands the player on the bank; when afloat it puts them
    // in the water beside the hull (the buoyancy/swim path then takes
    // over per VODA-2). Direction respects the hull's current yaw so
    // the player doesn't land in the wake after a turn.
    _scratchSide.set(this.exitSideOffset, 0, 0).applyQuaternion(this.model.quaternion);
    const exitPos = this.model.position.clone().add(_scratchSide);
    const grounded = this.model.isGrounded();
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
      // Surface the docking state so the session controller / HUD can
      // pick the right prompt ("step onto bank" vs "swim from hull").
      message: grounded ? 'on-bank' : 'in-water',
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.mounted) return;

    this.readInputs(ctx.input);

    // Forward intent through the watercraft, which delegates straight
    // through to the WatercraftPhysics layer. Signature is positional:
    // setControls(throttle, rudder).
    this.model.setControls(this.controls.throttle, this.controls.rudder);

    // Update HUD widgets for the watercraft (forward speed readout).
    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    if (hudSystem) {
      // Reuse the elevation slot as a generic readout — the helicopter
      // HUD uses it for AGL; here, m/s forward speed.
      hudSystem.updateElevation?.(this.model.getForwardSpeed());
    }
  }

  /**
   * Step the watercraft's physics with terrain. Called by the
   * integration layer once per frame (or by tests) so the adapter
   * never needs its own `ITerrainRuntime` reference. Mirrors
   * `TankPlayerAdapter.stepPhysics`.
   */
  stepPhysics(deltaTime: number, terrain: ITerrainRuntime | null): void {
    if (!this.mounted) return;
    this.model.setTerrain(terrain);
    this.model.update(deltaTime);
  }

  /**
   * Write the hull world position into `out`. The session controller calls
   * this each frame to keep `playerState.position` glued to the piloted hull so
   * terrain streaming, AI targeting, zone presence, and the minimap track the
   * watercraft rather than the boarding spot.
   */
  getChassisPosition(out: THREE.Vector3): boolean {
    if (!this.mounted) return false;
    out.copy(this.model.position);
    return true;
  }

  resetControlState(): void {
    this.controls.throttle = 0;
    this.controls.rudder = 0;
  }

  // ── Accessors (for integration + tests) ────────────────────────────────────

  getControls(): Readonly<{ throttle: number; rudder: number }> {
    return this.controls;
  }

  /** Returns the bound watercraft's id while mounted, else null. */
  getActiveVehicleId(): string | null {
    return this.mounted ? this.model.id : null;
  }

  /**
   * Compute a third-person follow camera pose for the active hull.
   * Writes into the provided vectors and returns true on success.
   * Camera sits `cameraDistance` behind the hull (along hull-local
   * +Z = world-back at identity quaternion) and `cameraHeight` above
   * its position, looking at the hull origin + `cameraLookHeight`.
   *
   * Mirrors `TankPlayerAdapter.computeThirdPersonCamera`. The PBR
   * gunner-seat first-person camera (sibling task) is a separate
   * helper, not a replacement.
   */
  computeThirdPersonCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;

    // Watercraft local -Z is hull-forward; +Z is behind the stern.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion);
    outPosition.copy(this.model.position).addScaledVector(back, this.cameraDistance);
    outPosition.y += this.cameraHeight;
    outLookTarget.copy(this.model.position);
    outLookTarget.y += this.cameraLookHeight;
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readInputs(input: PlayerInput): void {
    // --- Throttle (W = +1, S = -1; touch -z forward) ---
    this.controls.throttle = readThrottleAxis(input);

    // --- Rudder (D = +1, A = -1; touch x) ---
    // Water-rudder convention: positive rudder yaws the hull to the
    // right (handed by WatercraftPhysics). Same key mapping as the
    // tank's turn axis so the muscle memory transfers, but the
    // physics layer interprets it as continuous rudder authority,
    // not track differential.
    this.controls.rudder = readLateralAxis(input);
  }
}
