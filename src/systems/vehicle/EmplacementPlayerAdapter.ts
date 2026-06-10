// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { IGameRenderer, IHUDSystem } from '../../types/SystemInterfaces';
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
import type { Emplacement } from './Emplacement';
import type { M2HBWeapon } from '../combat/weapons/M2HBWeapon';
import { EmplacementGunPanel, type TraverseStop } from '../../ui/hud/EmplacementGunPanel';
import {
  clearFlightBookkeeping,
  pushTraverseStop,
  relockPointer,
  setCrosshairMode,
  setInfantryCrosshair,
} from './VehicleAdapterShared';

// ── Emplacement aim / camera tuning ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.6; // radians/sec at full deflection
const DEFAULT_EXIT_OFFSET_M = 1.8; // metres to the +X side of mount on dismount fallback
const DEFAULT_CAMERA_FORWARD_OFFSET = 0.15; // metres ahead of mount along barrel
const DEFAULT_CAMERA_UP_OFFSET = 0.05; // metres above mount (eye-line on sights)

// ── Fire-feel tuning ──
// Visual-only camera recoil: the eye pulls back along the barrel by a fraction
// of the weapon's live recoil offset, and the look-target lifts a touch, so a
// burst reads as muzzle climb without touching the aim solution (no gameplay
// punch). The weapon already decays its recoil; we just read it.
const CAMERA_RECOIL_PULLBACK = 0.6; // fraction of weapon recoilOffsetM pulled into the eye
const CAMERA_RECOIL_CLIMB = 0.5; // fraction of weapon recoilOffsetM lifted into the look-target

// A barrel within this many radians of a hard limit reads as "at the stop" for
// the traverse cue. Small enough that it only fires when the gunner is actually
// pinned against the mechanical envelope, not merely near it.
const TRAVERSE_STOP_EPSILON = 0.5 * (Math.PI / 180); // 0.5 degrees

function createEmplacementUIContext(): VehicleUIContext {
  return {
    kind: 'turret',
    role: 'gunner',
    hudVariant: 'turret',
    weaponCount: 1,
    capabilities: {
      canExit: true,
      canFirePrimary: true,
      canCycleWeapons: false,
      canFreeLook: false, // barrel-locked POV
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchMount = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchWorldQuat = new THREE.Quaternion();

/**
 * Emplacement (stationary heavy-weapon) player adapter — M2HB tripod MVP.
 *
 * Mirrors `GroundVehiclePlayerAdapter` and `HelicopterPlayerAdapter`:
 * owns control state, orchestrates enter/exit/update, and forwards aim
 * input into the bound `Emplacement` instance. Firing input is surfaced
 * via `consumeFireRequest()` for the R2 weapon integration to consume;
 * this adapter does not call any weapon API directly.
 *
 * Input mapping:
 *   Mouse XY            -> yaw / pitch slew (model clamps to its slew-rate caps)
 *   Left-click / Space  -> fire (latched request; R2 wiring reads it)
 *   F (handled by VehicleSessionController) -> mount / dismount
 *
 * The adapter holds a per-instance `Emplacement` (assigned at construction
 * time by the integration layer). Aim is forwarded by accumulating deltas
 * against the model's current target aim and calling `setAim()` — the
 * Emplacement owns slew rate caps and pitch/yaw envelope clamping.
 *
 * Camera: first-person, pinned to the emplacement mount point and
 * looking along the barrel. The integration layer reads
 * `computeBarrelCamera()` to drive `PlayerCamera`.
 */
export class EmplacementPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'emplacement';
  // Emplacements share the gameplay input context; weapon-fire suppression
  // is handled by the session controller via the VehicleUIContext.
  readonly inputContext: InputContext = 'gameplay';

  // Aim sensitivity (mutable so the integration layer / settings can retune).
  mouseSensitivity = MOUSE_AIM_SENSITIVITY;
  cameraForwardOffset = DEFAULT_CAMERA_FORWARD_OFFSET;
  cameraUpOffset = DEFAULT_CAMERA_UP_OFFSET;

  private readonly model: Emplacement;
  private mounted = false;
  private fireRequested = false;

  // Craft-specific FJ gunner panel (belt counter + traverse cue). Owned +
  // lifecycle-driven here: mounted into `panelHost` on seat entry, unmounted on
  // exit. `panelHost` is the HUD root the composer injects via
  // `setHudPanelHost`; when absent (test doubles, headless) the panel is never
  // constructed. Lazy (not a field initializer) so a headless adapter never
  // touches `document` via UIComponent. `weapon` is the read-only M2HB binding
  // the composer hands in so the panel can show the live belt — display only,
  // the adapter never mutates ammo.
  private panel: EmplacementGunPanel | null = null;
  private panelHost: HTMLElement | null = null;
  private weapon: M2HBWeapon | null = null;

  // Current traverse stop the barrel is pinned against (null = has travel).
  private traverseStop: TraverseStop | null = null;

  // Captured on enter so per-frame `update` (no transition ctx) can light the
  // emplacement_mg reticle's arc-stop edge tick via the crosshair cue seam.
  private gameRenderer: IGameRenderer | undefined;

  constructor(model: Emplacement) {
    this.model = model;
  }

  /**
   * Inject the DOM host the gunner panel mounts into (the in-game HUD root)
   * plus the read-only M2HB weapon binding that drives the belt readout. The
   * composer wires both on board; tests pass a fake host + weapon. Both are
   * optional so the adapter stays headless-safe — same shape as
   * `TankGunnerAdapter.setHudPanelHost`.
   */
  setHudPanelHost(host: HTMLElement | null, weapon?: M2HBWeapon | null): void {
    this.panelHost = host;
    if (weapon !== undefined) this.weapon = weapon;
  }

  /**
   * The gunner panel instance, lazily constructed on first access (so it is
   * created only in an environment with a DOM). Exposed for the composer +
   * tests.
   */
  getPanel(): EmplacementGunPanel {
    if (!this.panel) this.panel = new EmplacementGunPanel();
    return this.panel;
  }

  /** The traverse stop the barrel is currently pinned against (null = none). */
  getTraverseStop(): TraverseStop | null {
    return this.traverseStop;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;
    this.gameRenderer = ctx.gameRenderer;

    // Take the player off their feet and snap them onto the gunner seat.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    _scratchMount.copy(this.model.getPosition());
    ctx.setPosition(_scratchMount.clone(), 'emplacement.enter');

    // Emplacement is a ground-mounted system — clear any leftover flight
    // bookkeeping the same way the ground-vehicle adapter does.
    clearFlightBookkeeping(ctx.input);

    // Save infantry look angles so the camera restores cleanly on dismount.
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createEmplacementUIContext());

    // Open MG cross reticle (open-center cross + wide wings) for the M2HB.
    setCrosshairMode(ctx.gameRenderer, 'emplacement_mg');

    // Mount the FJ belt/traverse panel into the HUD root and seed it from the
    // live belt (clears any stale traverse cue from the prior session).
    this.traverseStop = null;
    this.mountPanel();

    relockPointer(ctx.input);
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'emplacement.exit');

    clearFlightBookkeeping(ctx.input);
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(null);

    setInfantryCrosshair(ctx.gameRenderer);
    // Clear any lit arc-stop tick so it never lingers under the infantry reticle.
    pushTraverseStop(ctx.gameRenderer, null);

    // Tear down the gunner panel so it doesn't linger over the infantry HUD.
    this.traverseStop = null;
    this.unmountPanel();

    this.gameRenderer = undefined;
    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Prefer the configured gunner-seat exit offset (Emplacement carries it
    // per-seat). Fall back to a sideways step from the mount when no
    // gunner seat exists (defensive — DEFAULT_SEATS always includes one).
    const gunnerSeat = this.model.getSeats().find(seat => seat.role === 'gunner');
    const mount = this.model.getPosition();
    const exitPos = mount.clone();
    if (gunnerSeat) {
      exitPos.add(gunnerSeat.exitOffset);
    } else {
      exitPos.x += DEFAULT_EXIT_OFFSET_M;
    }
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.mounted) return;

    this.readAimInput(ctx.input, ctx.deltaTime);
    this.readFireInput(ctx.input);
    this.refreshTraverseStop();
    this.refreshPanel();
    // Light the emplacement_mg reticle's arc-stop edge tick from the live stop.
    pushTraverseStop(this.gameRenderer, this.traverseStop);
  }

  /**
   * Write the emplacement mount world position into `out`. The session
   * controller calls this each frame to keep `playerState.position` glued to
   * the gun mount so AI targeting, zone presence, and the minimap see the
   * gunner where the weapon is. A ground tripod is static, but a
   * vehicle-mounted emplacement (PBR / vehicle M2HB) tracks the moving hull.
   */
  getChassisPosition(out: THREE.Vector3): boolean {
    if (!this.mounted) return false;
    out.copy(this.model.getPosition());
    return true;
  }

  resetControlState(): void {
    this.fireRequested = false;
  }

  // ── Public accessors (for integration + tests) ─────────────────────────────

  /** Returns the bound emplacement's vehicleId while mounted, else null. */
  getActiveEmplacementId(): string | null {
    return this.mounted ? this.model.vehicleId : null;
  }

  /**
   * Consumes a pending fire request, returning true exactly once per
   * frame that fire input was held. The R2 weapon-integration task
   * polls this from its per-frame update; once the M2HB weapon is
   * wired, this becomes the fire trigger.
   */
  consumeFireRequest(): boolean {
    const v = this.fireRequested;
    this.fireRequested = false;
    return v;
  }

  /**
   * Compute a first-person camera pose pinned to the mount point and
   * looking along the barrel. Writes into the provided vectors and
   * returns true on success. The integration layer calls this once per
   * frame to drive `PlayerCamera`.
   */
  computeBarrelCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;
    _scratchMount.copy(this.model.getPosition());

    // Derive forward from yaw + pitch. Y-up, yaw around Y, pitch around
    // local X. Forward when yaw=0, pitch=0 is local -Z (Three.js
    // convention). Compose with the emplacement's world quaternion so
    // the camera looks the right way when the tripod is parented under
    // a rotated hull (PBR mounts, vehicle-mounted M2HB) or spawned at
    // a non-zero initialYaw on the ground. For an identity world
    // quaternion the composition is a no-op.
    const yaw = this.model.getYaw();
    const pitch = this.model.getPitch();
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    _scratchForward.set(-sy * cp, sp, -cy * cp);
    _scratchWorldQuat.copy(this.model.getQuaternion());
    _scratchForward.applyQuaternion(_scratchWorldQuat);

    // Sit the eye at the mount, lifted slightly to the sights line, and
    // nudged a hair forward so the player's view doesn't clip the
    // breech model. Look-target is one metre out along the barrel.
    outPosition.copy(_scratchMount);
    outPosition.y += this.cameraUpOffset;
    outPosition.addScaledVector(_scratchForward, this.cameraForwardOffset);

    // Fire feel: a subtle, visual-only camera recoil. The weapon already
    // tracks a per-shot recoil offset that kicks on fire and decays; we read
    // it (never write) and pull the eye back along the barrel + lift the
    // look-target a touch so a burst reads as muzzle climb. This does NOT move
    // the aim solution — the barrel forward (and therefore where rounds go) is
    // unchanged; only the camera pose shifts.
    const recoil = this.weapon ? this.weapon.getRecoilOffsetM() : 0;
    if (recoil > 0) {
      outPosition.addScaledVector(_scratchForward, -recoil * CAMERA_RECOIL_PULLBACK);
    }

    outLookTarget.copy(outPosition).addScaledVector(_scratchForward, 1);
    if (recoil > 0) {
      outLookTarget.y += recoil * CAMERA_RECOIL_CLIMB;
    }
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readAimInput(input: PlayerInput, deltaTime: number): void {
    if (!this.mounted) return;

    let dYaw = 0;
    let dPitch = 0;

    // Touch path: virtual right-stick steers the barrel.
    const touch = input.getTouchControls?.();
    if (touch) {
      // Reuse the cyclic input convention the helicopter adapter does;
      // touch joystick magnitudes are already in [-1, 1].
      const cyc = typeof input.getTouchFlightCyclicInput === 'function'
        ? input.getTouchFlightCyclicInput()
        : (typeof (input as any).getTouchCyclicInput === 'function'
          ? (input as any).getTouchCyclicInput()
          : { pitch: 0, roll: 0 });
      if (Math.abs(cyc.roll) > TOUCH_AIM_DEADZONE) {
        dYaw += cyc.roll * TOUCH_AIM_SENSITIVITY * deltaTime;
      }
      if (Math.abs(cyc.pitch) > TOUCH_AIM_DEADZONE) {
        dPitch += cyc.pitch * TOUCH_AIM_SENSITIVITY * deltaTime;
      }
    } else if (input.getIsPointerLocked()) {
      const m = input.getMouseMovement();
      if (m && (m.x !== 0 || m.y !== 0)) {
        // Mouse-x → yaw (right swing = +yaw to the gunner's right,
        // matching our world convention of yaw increasing CCW around Y;
        // sign flipped so right drag turns the barrel right).
        dYaw += -m.x * this.mouseSensitivity;
        // Mouse-y → pitch (up drag = look up = +pitch).
        dPitch += -m.y * this.mouseSensitivity;
        input.clearMouseMovement();
      }
    }

    if (dYaw !== 0 || dPitch !== 0) {
      // Real Emplacement uses absolute setAim; accumulate against the
      // model's current target. Emplacement clamps to pitch/yaw envelope
      // and walks toward the target at its configured slew rate.
      const cur = this.model.getTargetAim();
      this.model.setAim(cur.yaw + dYaw, cur.pitch + dPitch);
    }
  }

  private readFireInput(input: PlayerInput): void {
    // Left mouse button (held) fires the M2HB; Space is the keyboard
    // fallback (mirrors the infantry weapon binding). PlayerInput tracks
    // real held-button state, so this latches a fire request for any frame
    // the trigger is down.
    const fire = input.isMouseButtonPressed(0) || input.isKeyPressed('space');
    if (fire) this.fireRequested = true;
  }

  // ── Traverse-stop feedback ───────────────────────────────────────────────────

  /**
   * Decide whether the barrel is pinned against a mechanical stop, and which
   * one, so the reticle + panel can cue it. The Emplacement clamps its target
   * aim to the pitch (and optional yaw) envelope, so a target that the gunner
   * is still pushing past the clamped value means "at the stop". We compare the
   * gunner's intent (the raw target the input layer set, recoverable from the
   * clamped target sitting on a limit) against the hard limits within a small
   * epsilon. Pitch limits always exist (M2HB elevation envelope); yaw limits
   * exist only for limited-arc sandbag emplacements (360° tripods never stop).
   */
  private refreshTraverseStop(): void {
    const target = this.model.getTargetAim();
    const pitchLimits = this.model.getPitchLimits();
    const yawLimits = this.model.getYawLimits();

    let stop: TraverseStop | null = null;

    // Pitch: barrel pinned at the elevation/depression stop.
    if (target.pitch >= pitchLimits.max - TRAVERSE_STOP_EPSILON) {
      stop = 'up';
    } else if (target.pitch <= pitchLimits.min + TRAVERSE_STOP_EPSILON) {
      stop = 'down';
    }

    // Yaw: only limited-arc emplacements stop. Pitch stops take precedence in
    // the single-edge cue (the gunner most often hits the elevation stop on a
    // .50 cal), so only consider yaw when pitch is mid-travel.
    if (!stop && yawLimits) {
      if (target.yaw >= yawLimits.max - TRAVERSE_STOP_EPSILON) {
        // +yaw is to the gunner's left in our convention (yaw CCW around Y).
        stop = 'left';
      } else if (target.yaw <= yawLimits.min + TRAVERSE_STOP_EPSILON) {
        stop = 'right';
      }
    }

    this.traverseStop = stop;
  }

  // ── Gunner panel plumbing ────────────────────────────────────────────────────

  private mountPanel(): void {
    if (!this.panelHost) return;
    const panel = this.getPanel();
    if (!panel.mounted) panel.mount(this.panelHost);
    this.refreshPanel();
  }

  private unmountPanel(): void {
    if (this.panel?.mounted) this.panel.unmount();
  }

  /** Push the live belt count + traverse cue into the FJ gunner panel. */
  private refreshPanel(): void {
    if (!this.panel?.mounted) return;
    if (this.weapon) {
      this.panel.setBelt(this.weapon.getAmmo(), this.weapon.ammoMax);
    }
    this.panel.setTraverseStop(this.traverseStop);
  }
}
