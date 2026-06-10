// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { IHUDSystem } from '../../types/SystemInterfaces';
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
import type { Tank } from './Tank';
import { TankTurret } from './TankTurret';
import { TankGunnerPanel, type MainGunState } from '../../ui/hud/TankGunnerPanel';
import {
  clearFlightBookkeeping,
  relockPointer,
  seatPlayer,
  setCrosshairMode,
  setInfantryCrosshair,
} from './VehicleAdapterShared';

// ── Turret aim / camera tuning ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.2; // radians/sec at full deflection (slower than M2HB — bigger gun)
const DEFAULT_EXIT_SIDE_OFFSET_M = 3.0; // metres to the +X side of chassis on dismount fallback
const DEFAULT_SIGHT_FORWARD_OFFSET = 0.25; // metres ahead of barrel tip along sight line
const DEFAULT_SIGHT_UP_OFFSET = 0.0; // metres above barrel tip (gunner sight is barrel-axis)

// ── Cannon fire-gate tuning ──
// Mirrors TankPlayerAdapter's reload model so the player gunner path enforces
// the same crew-served reload regardless of which adapter crews the gun. There
// is no ammo economy here (the M48 model carries no stowage count): the gate is
// a rate limit, and the panel shows STATE ONLY (READY / RELOADING).
const DEFAULT_RELOAD_SECONDS = 3.5; // M48 90mm crew-served reload, playable abstraction

// ── Sight magnification (RMB toggle: 1x ↔ zoom) ──
const SIGHT_FOV_1X = 50; // degrees — unmagnified gunner sight
const SIGHT_FOV_ZOOM = 18; // degrees — one zoomed optical step
const SIGHT_MAG_1X = 1.0;
const SIGHT_MAG_ZOOM = SIGHT_FOV_1X / SIGHT_FOV_ZOOM; // ~2.8x effective magnification
const RMB_BUTTON = 2; // DOM MouseEvent.button code for the right mouse button

function createTankGunnerUIContext(zoomed: boolean): VehicleUIContext {
  // Gunner POV reuses the 'turret' HUD bucket (same as M2HB tripod). The
  // craft-specific gunner panel is owned by this adapter (TankGunnerPanel),
  // not by HUDVehicleHud; the additive `sightMagnification` field lets a HUD
  // consumer reflect the zoom step without reading adapter internals.
  return {
    kind: 'turret',
    role: 'gunner',
    hudVariant: 'turret',
    weaponCount: 1,
    sightMagnification: zoomed ? SIGHT_MAG_ZOOM : SIGHT_MAG_1X,
    capabilities: {
      canExit: true,
      canFirePrimary: true,
      canCycleWeapons: false,
      canFreeLook: false, // barrel-locked POV (gunner sight)
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchSide = new THREE.Vector3();
const _scratchTip = new THREE.Vector3();
const _scratchDir = new THREE.Vector3();

/**
 * Tank gunner player adapter — M48 90 mm cannon seat.
 *
 * Mirrors `EmplacementPlayerAdapter` (cycle #6) in lifecycle + input shape,
 * and `TankPlayerAdapter` (cycle #8) in chassis binding. Per the cycle brief:
 *
 *   1. Player seats via existing `IVehicle.enterVehicle(_, 'gunner')`.
 *   2. Mouse drives turret yaw + barrel pitch (within cap).
 *   3. LMB fires cannon — but R2 wires `tank-cannon-projectile`. The fire
 *      input is exposed via `consumeFireRequest(): boolean` (latched once
 *      per held frame, like `EmplacementPlayerAdapter`); R2 + the
 *      `tank-ai-gunner-route` task will poll this.
 *   4. Camera: gunner sight first-person (down barrel sights).
 *   5. Pilot ↔ gunner seat swap: existing `enterVehicle` accepts the role;
 *      this adapter advertises `playerSeat = 'gunner'` so the session
 *      controller can request the right seat on enter.
 *
 * Input mapping:
 *   Mouse XY            -> turret yaw / barrel pitch slew (turret clamps)
 *   Left-click / Space  -> fire (latched request; R2 cannon wiring reads it)
 *   F (handled by VehicleSessionController) -> mount / dismount
 *
 * Camera: first-person pinned along the barrel, sitting just behind the
 * muzzle tip and looking along the barrel direction. The integration layer
 * reads `computeGunnerSightCamera()` to drive `PlayerCamera`.
 *
 * The adapter binds to a concrete `Tank` instance plus an `ITankTurretModel`
 * at construction time. The turret-model stub lets this adapter ship in
 * parallel with `tank-turret-rig`; the orchestrator-driven swap step
 * replaces `ITankTurretModel` with the real `TankTurret` once both merge.
 */
export class TankGunnerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'tank_gunner';
  // Gunner shares the gameplay input context; weapon-fire suppression is
  // handled by the session controller via the VehicleUIContext.
  readonly inputContext: InputContext = 'gameplay';

  // Player seat for the gunner position. Kept public so the session
  // controller / integration layer can read it when planning seat
  // assignments (pilot ↔ gunner swap goes via `enterVehicle(_, this.playerSeat)`).
  readonly playerSeat: SeatRole = 'gunner';

  // Aim sensitivity (mutable so the integration layer / settings can retune).
  mouseSensitivity = MOUSE_AIM_SENSITIVITY;
  sightForwardOffset = DEFAULT_SIGHT_FORWARD_OFFSET;
  sightUpOffset = DEFAULT_SIGHT_UP_OFFSET;

  // Cannon reload-gate tuning (mutable for retune / tests). Injected `clock`
  // keeps the gate deterministic in tests (no Date.now / performance.now leak).
  reloadSeconds = DEFAULT_RELOAD_SECONDS;

  private readonly chassis: Tank;
  private readonly turret: TankTurret;
  private mounted = false;
  private fireRequested = false;

  // Cannon fire-gate state. `lastShotMs` is the wall-clock time of the last
  // fired round; the gate reopens `reloadSeconds` later. NEGATIVE_INFINITY
  // means "never fired" so the gun starts READY.
  private clock: () => number = () => performance.now();
  private lastShotMs = Number.NEGATIVE_INFINITY;

  // Sight magnification: 1x ↔ one zoomed step, toggled on RMB rising edge.
  private zoomed = false;
  private prevRmbDown = false;

  // Craft-specific gunner panel (FJ language). Owned + lifecycle-driven here:
  // mounted into `panelHost` on seat entry, unmounted on exit. `panelHost` is
  // the HUD root the composer injects via `setHudPanelHost`; when absent (test
  // doubles, headless) the panel is never constructed. The panel is created
  // lazily (not in a field initializer) so a headless adapter — e.g. the
  // node-env unit tests — never touches `document` via UIComponent.
  private panel: TankGunnerPanel | null = null;
  private panelHost: HTMLElement | null = null;

  constructor(chassis: Tank, turret: TankTurret) {
    this.chassis = chassis;
    this.turret = turret;
  }

  /**
   * Inject the DOM host the gunner panel mounts into (the in-game HUD root)
   * plus an optional deterministic clock for the reload gate. The composer
   * wires the host once; tests pass a fake host + clock. Both are optional so
   * the adapter stays headless-safe.
   */
  setHudPanelHost(host: HTMLElement | null, clock?: () => number): void {
    this.panelHost = host;
    if (clock) this.clock = clock;
  }

  /**
   * The gunner panel instance, lazily constructed on first access (so it is
   * created only in an environment with a DOM). Exposed for the composer +
   * tests.
   */
  getPanel(): TankGunnerPanel {
    if (!this.panel) this.panel = new TankGunnerPanel();
    return this.panel;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;
    // Gun starts loaded; sight starts unmagnified each time the seat is taken.
    this.lastShotMs = Number.NEGATIVE_INFINITY;
    this.zoomed = false;
    this.prevRmbDown = false;

    // Player out of infantry motion, snapped onto the gunner station.
    seatPlayer(ctx, 'tank.gunner.enter');

    // Tank is a ground vehicle — clear any leftover flight bookkeeping
    // (same defensive pattern the pilot adapter uses).
    clearFlightBookkeeping(ctx.input);

    // Save infantry look angles so the camera restores cleanly on dismount.
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createTankGunnerUIContext(this.zoomed));

    // Stadia gunner-sight reticle (aim cross + rangefinder + drop ticks).
    setCrosshairMode(ctx.gameRenderer, 'tank_gunner');

    // Mount the FJ gunner panel into the HUD root and seed its initial state.
    this.mountPanel();

    // Re-acquire pointer lock so mouse-look (turret aim) keeps working.
    relockPointer(ctx.input);
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'tank.gunner.exit');

    clearFlightBookkeeping(ctx.input);
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(null);

    setInfantryCrosshair(ctx.gameRenderer);

    // Tear down the gunner panel so it doesn't linger over the infantry HUD.
    this.unmountPanel();

    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Default: eject on the +X side of the chassis (matches pilot adapter's
    // default; the +X side clears the engine deck and the track skirt).
    // Direction respects the tank's current yaw so the player doesn't land
    // inside the chassis after a turn. The gunner-seat exitOffset declared
    // in `Tank.DEFAULT_M48_SEATS` is (+2.6, 0, 0), which collapses to this
    // same side-step for an identity quaternion — we use the chassis-yaw
    // composition explicitly so any future seat-offset edits propagate.
    _scratchSide.set(DEFAULT_EXIT_SIDE_OFFSET_M, 0, 0).applyQuaternion(this.chassis.quaternion);
    const exitPos = this.chassis.position.clone().add(_scratchSide);
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
    this.readZoomToggle(ctx.input, ctx.hudSystem);
    this.refreshPanel();
  }

  resetControlState(): void {
    this.fireRequested = false;
  }

  // ── Public accessors (for integration + tests) ─────────────────────────────

  /** Returns the bound tank's vehicleId while mounted, else null. */
  getActiveVehicleId(): string | null {
    return this.mounted ? this.chassis.id : null;
  }

  /**
   * Consumes a pending fire request, returning true exactly once per
   * frame that fire input was held. The R2 cannon-integration task
   * (`tank-cannon-projectile` wiring) polls this from its per-frame
   * update; the same surface is reused by `tank-ai-gunner-route` so
   * NPC and player fire paths converge on one contract.
   */
  consumeFireRequest(): boolean {
    const v = this.fireRequested;
    this.fireRequested = false;
    return v;
  }

  /**
   * Compute a first-person gunner-sight camera pose (eye sits just behind
   * the muzzle, looking down the barrel). Writes into the provided vectors
   * and returns true on success. The integration layer calls this once per
   * frame to drive `PlayerCamera`.
   *
   * Sourced from the turret model's `getBarrelTipWorldPosition` +
   * `getBarrelDirectionWorld` so the camera tracks the rendered turret
   * pose exactly — no double-derivation of yaw/pitch math here.
   *
   * Optional `outFov` receives the desired vertical FOV (degrees) for the
   * current magnification step, so the same call that drives the pose drives
   * the zoom. Magnification is a FOV change only; the DOM reticle overlay is
   * unaffected (it scales naturally with the zoomed view).
   */
  computeGunnerSightCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
    outFov?: { value: number },
  ): boolean {
    if (!this.mounted) return false;
    this.turret.getBarrelTipWorldPosition(_scratchTip);
    this.turret.getBarrelDirectionWorld(_scratchDir);

    // Eye sits a hair ahead of the muzzle along the barrel direction so the
    // player view is on-axis with the bore (gunner-sight POV), then lifted
    // by `sightUpOffset` if a future scope-rise is needed.
    outPosition.copy(_scratchTip);
    outPosition.addScaledVector(_scratchDir, this.sightForwardOffset);
    outPosition.y += this.sightUpOffset;

    // Look-target is one metre further along the barrel; this gives
    // `PlayerCamera.lookAt(outLookTarget)` a stable forward vector.
    outLookTarget.copy(outPosition).addScaledVector(_scratchDir, 1);

    if (outFov) outFov.value = this.getSightFov();
    return true;
  }

  /** Desired gunner-sight vertical FOV (degrees) for the current zoom step. */
  getSightFov(): number {
    return this.zoomed ? SIGHT_FOV_ZOOM : SIGHT_FOV_1X;
  }

  /** Current sight magnification factor (1 = 1x, >1 = zoomed). */
  getMagnification(): number {
    return this.zoomed ? SIGHT_MAG_ZOOM : SIGHT_MAG_1X;
  }

  /** Whether the sight is currently in the zoomed step. */
  isZoomed(): boolean {
    return this.zoomed;
  }

  /**
   * Main-gun fire-gate state for the HUD: `'reloading'` while the reload timer
   * is still cooling after a shot, else `'ready'`. There is no ammo economy —
   * this is purely the rate-limit gate, so the panel shows state, not a count.
   */
  getMainGunState(): MainGunState {
    return this.getReloadProgress01() >= 1 ? 'ready' : 'reloading';
  }

  /**
   * Reload completion 0..1 (1 = loaded / READY). Drives the panel's reload bar.
   * Before the first shot the gate is fully open (1).
   */
  getReloadProgress01(): number {
    if (this.lastShotMs === Number.NEGATIVE_INFINITY) return 1;
    const elapsedMs = this.clock() - this.lastShotMs;
    const reloadMs = this.reloadSeconds * 1000;
    if (reloadMs <= 0) return 1;
    const p = elapsedMs / reloadMs;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readAimInput(input: PlayerInput, deltaTime: number): void {
    if (!this.mounted) return;

    let dYaw = 0;
    let dPitch = 0;

    // Touch path: virtual right-stick steers the turret.
    const touch = input.getTouchControls?.();
    if (touch) {
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
        // Mouse-x → yaw (right swing = +yaw to the gunner's right, matching
        // the convention used by EmplacementPlayerAdapter — sign flipped so
        // right drag turns the turret right).
        dYaw += -m.x * this.mouseSensitivity;
        // Mouse-y → pitch (up drag = look up = +pitch).
        dPitch += -m.y * this.mouseSensitivity;
        input.clearMouseMovement();
      }
    }

    if (dYaw !== 0 || dPitch !== 0) {
      // Accumulate against the turret's current achieved aim and let the
      // turret model enforce its own yaw envelope (null = 360°) and pitch
      // envelope. The turret owns slew rate and clamping; the adapter just
      // forwards intent — same separation `EmplacementPlayerAdapter` keeps
      // for the M2HB Emplacement.
      this.turret.setTargetYaw(this.turret.getYaw() + dYaw);
      this.turret.setTargetPitch(this.turret.getPitch() + dPitch);
    }
  }

  private readFireInput(input: PlayerInput): void {
    // Left mouse button (held) fires the cannon; Space is the keyboard
    // fallback — same fire-poll contract as `EmplacementPlayerAdapter` so
    // the cannon wiring can share one path. PlayerInput tracks real held-
    // button state, so this latches a fire request for any frame the
    // trigger is down.
    const fire = input.isMouseButtonPressed(0) || input.isKeyPressed('space');
    if (!fire) return;

    this.fireRequested = true;

    // Stamp the reload gate the first frame the trigger is pulled while the
    // gun is loaded. The actual round launch is owned by the cannon
    // integration polling `consumeFireRequest`; this gate only models the
    // crew-served reload so the panel can show READY / RELOADING. A held
    // trigger does not re-stamp mid-reload (the gate is already closed), so
    // it can't be defeated by holding the button down.
    if (this.getReloadProgress01() >= 1) {
      this.lastShotMs = this.clock();
    }
  }

  /**
   * RMB toggles the sight between 1x and the zoomed step on a rising edge
   * (press, not hold). Real mouse-button input landed 2026-06-09; the toggle
   * pushes the new magnification through the HUD vehicle context so a consumer
   * can reflect it, and the next `computeGunnerSightCamera` call applies the
   * matching FOV.
   */
  private readZoomToggle(input: PlayerInput, hudSystem: VehicleUpdateContext['hudSystem']): void {
    const down = typeof input.isMouseButtonPressed === 'function'
      ? input.isMouseButtonPressed(RMB_BUTTON)
      : false;
    if (down && !this.prevRmbDown) {
      this.zoomed = !this.zoomed;
      const hud = hudSystem as IHUDSystem | undefined;
      hud?.setVehicleContext?.(createTankGunnerUIContext(this.zoomed));
    }
    this.prevRmbDown = down;
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

  /** Push the live weapon + turret + zoom state into the FJ gunner panel. */
  private refreshPanel(): void {
    if (!this.panel?.mounted) return;
    this.panel.setMainGunState(this.getMainGunState());
    this.panel.setReloadProgress(this.getReloadProgress01());
    this.panel.setTurretAzimuth(this.turret.getYaw());
    this.panel.setMagnification(this.getMagnification());
  }
}
