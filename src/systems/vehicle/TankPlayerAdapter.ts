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
import type { Tank } from './Tank';
import type { Faction } from '../combat/types';
import {
  clearFlightBookkeeping,
  readLateralAxis,
  readThrottleAxis,
  relockPointer,
  seatPlayer,
  setCrosshairMode,
  setInfantryCrosshair,
} from './VehicleAdapterShared';
import { TankSightSurface, SIGHT_MAG_1X, SIGHT_MAG_ZOOM } from './TankSightSurface';
import type { IGameRenderer } from '../../types/SystemInterfaces';

// ── Tank chassis control tuning ──
const DEFAULT_EXIT_SIDE_OFFSET_M = 3.0; // metres to the +X side of chassis on dismount fallback

// ── Turret aim tuning (gunner seat) ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.2; // radians/sec at full deflection (big gun, slow)

// Sight magnification constants live in TankSightSurface (shared with the
// standalone gunner station so both crews get one sight feel).

// ── Cannon fire tuning ──
const DEFAULT_MUZZLE_SPEED = 400; // m/s; matches TankCannonProjectileSystem v1 default
const DEFAULT_RELOAD_SECONDS = 3.5; // M48 90mm crew-served reload, playable abstraction
const DEFAULT_AMMO_TYPE = 'AP' as const;

/** The driver hatch (no weapon) and the gunner station (cannon) crew roles. */
type CrewSeat = Extract<SeatRole, 'pilot' | 'gunner'>;

/**
 * Minimal structural surface the adapter needs to fire the main cannon.
 * Matches `TankCannonProjectileSystem.launch()` so the production wiring is
 * a single line-up, and test fakes are a one-method stub. Mirrors the
 * `ITankCannonSystem` contract the NPC gunner route (`TankAIGunnerRoute`)
 * fires through, so player + AI converge on one projectile primitive
 * instead of reinventing a shot path.
 */
export interface ITankCannonLauncher {
  launch(args: {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    muzzleSpeed: number;
    ammoType: 'AP' | 'HEAT' | 'HE';
    shooterId: string;
    shooterFaction: Faction;
  }): string;
}

function createPilotUIContext(): VehicleUIContext {
  // Driver hatch: locomotion only, no weapon. Reuses the 'car' /
  // 'groundVehicle' HUD bucket — VehicleKind has no dedicated 'tank'
  // variant, and the driver station has no turret HUD.
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

function createGunnerUIContext(zoomed: boolean): VehicleUIContext {
  // Gunner station: 90mm main cannon. Reuses the 'turret' HUD bucket the
  // M2HB emplacement gunner uses; the craft-specific gunner panel
  // (TankGunnerPanel) is adapter-owned. The additive `sightMagnification`
  // field lets a HUD consumer reflect the zoom step without reading
  // adapter internals (tank-sight-prod-wiring).
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
 * Tank player adapter — full M48 Patton crew (driver + gunner).
 *
 * The chassis slice (cycle-vekhikl-3) shipped driver-only locomotion with
 * an inert turret. This adapter makes the M48 operable end-to-end:
 *
 *   1. Driver seat: skid-steer locomotion (W/S throttle, A/D track-
 *      differential turn, Space brake) — unchanged from the chassis slice.
 *   2. Gunner seat: mouse drives turret yaw + barrel pitch; LMB / Space
 *      fires the 90mm main cannon through the shared
 *      `TankCannonProjectileSystem` projectile primitive (the same launch
 *      surface the NPC gunner route uses) with a reload gate.
 *   3. Seat swap: `swapSeat()` toggles the player between driver and
 *      gunner on the same Tank instance — releasing one seat and occupying
 *      the other, switching the control target + HUD context. The session
 *      controller keeps seeing one `vehicleType = 'tank'`, so the swap is
 *      internal to the adapter (no enter/exit churn).
 *
 * Input mapping:
 *   Driver:  W/S throttle, A/D turn, Space brake.
 *   Gunner:  Mouse XY -> turret yaw/pitch slew (turret clamps), LMB/Space fire.
 *   F (session controller) -> enter / exit.
 *
 * The cannon launcher is injected post-construction via `setCannonSystem`
 * because the boarding factory builds the adapter from the Tank alone; the
 * composer wires the real `TankCannonProjectileSystem` once it owns the
 * scene + combatant system. With no launcher bound the gunner aims but the
 * cannon is silent (no shot) — fire input is still latched so a late wire
 * picks it up the next frame.
 *
 * Camera: third-person orbit-tank while driving; first-person down-barrel
 * gunner sight while crewing the gun. The integration layer (owned by the
 * camera keystone) reads `computeThirdPersonCamera` / `computeGunnerSightCamera`.
 */
export class TankPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'tank';
  // Tanks share the gameplay input context (movement + weapon-fire
  // suppression handled by the session controller via VehicleUIContext).
  readonly inputContext: InputContext = 'gameplay';

  // Default mount seat for the boarding flow. Kept public so the session
  // controller / integration layer can read it when planning seat
  // assignments. Mutated by `swapSeat()` so a re-board after a swap returns
  // the player to the station they were last crewing.
  playerSeat: CrewSeat = 'pilot';

  // Third-person follow tuning — wider/higher than the jeep to clear the
  // turret silhouette.
  cameraDistance = 11.0;
  cameraHeight = 11.0;
  cameraLookHeight = 2.4;

  // Gunner aim sensitivity + sight offsets (mutable so settings can retune).
  mouseSensitivity = MOUSE_AIM_SENSITIVITY;
  sightForwardOffset = 0.25;
  sightUpOffset = 0.0;

  // Cannon tuning (mutable for retune / tests).
  muzzleSpeed = DEFAULT_MUZZLE_SPEED;
  reloadSeconds = DEFAULT_RELOAD_SECONDS;
  ammoType: 'AP' | 'HEAT' | 'HE' = DEFAULT_AMMO_TYPE;

  // Smoothed driver control axes, forwarded each frame into the tank via
  // Tank.setControls(throttle, turn, brake).
  private controls = {
    throttleAxis: 0,
    turnAxis: 0,
    brake: false,
  };

  private readonly model: Tank;
  private mounted = false;
  private crewSeat: CrewSeat = 'pilot';
  private fireRequested = false;

  // Cannon wiring (injected). `clock` is injected so the reload gate is
  // deterministic in tests (no Date.now() dependency).
  private cannon: ITankCannonLauncher | null = null;
  private clock: () => number = () => performance.now();
  private lastShotMs = Number.NEGATIVE_INFINITY;
  // Per-frame projectile stepper. The shared `TankCannonProjectileSystem`
  // needs `update(dt, terrainHeightAt)` ticked so launched rounds arc + impact.
  // The composer binds a closure with the terrain-height source baked in so
  // the adapter advances in-flight shells each frame the player is crewing the
  // tank (the normal fire → flight → impact window). Null = no stepper bound.
  private cannonStep: ((deltaTime: number) => void) | null = null;

  // Sight magnification + FJ gunner panel (tank-sight-prod-wiring): owned by
  // the shared sight surface; the adapter feeds it live gun/turret reads.
  private readonly sight = new TankSightSurface({
    getTurretYaw: () => this.model.getTurret().getYaw(),
    getReloadProgress01: () => this.getReloadProgress01(),
  });

  // Renderer captured on enter so `swapSeat` (update-context only) can
  // switch the crosshair mode between seats.
  private gameRenderer: IGameRenderer | undefined;

  constructor(model: Tank) {
    this.model = model;
  }

  /**
   * Inject the DOM host the gunner panel mounts into (the in-game HUD root).
   * The composer wires this at board-time (m2hb-gun-experience precedent);
   * tests omit it to stay headless. The session-enter hook fires AFTER the
   * adapter's `onEnter`, so a board straight into the gunner seat mounts
   * late here (the surface mounts on host arrival while active).
   */
  setHudPanelHost(host: HTMLElement | null): void {
    this.sight.setHost(host);
  }

  // ── Cannon wiring ────────────────────────────────────────────────────────

  /**
   * Bind the projectile system the gunner fires through. Optional `clock`
   * supplies the reload-gate time source (defaults to `performance.now`);
   * tests inject a deterministic clock. Pass `null` to detach.
   */
  setCannonSystem(cannon: ITankCannonLauncher | null, clock?: () => number): void {
    this.cannon = cannon;
    if (clock) this.clock = clock;
  }

  /**
   * Bind the per-frame stepper that advances the shared cannon system's
   * in-flight projectiles (gravity arc + ground-impact detection). The
   * composer wires a closure that calls `TankCannonProjectileSystem.update`
   * with the live terrain-height source; the adapter calls it once per frame
   * while mounted. Pass `null` to detach on dismount.
   */
  setCannonStepper(step: ((deltaTime: number) => void) | null): void {
    this.cannonStep = step;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;
    this.crewSeat = this.playerSeat;
    this.lastShotMs = Number.NEGATIVE_INFINITY;
    this.gameRenderer = ctx.gameRenderer;

    // Player out of infantry motion, snapped onto the crew station.
    seatPlayer(ctx, this.enterReason());

    // Tanks are ground vehicles — clear any leftover flight bookkeeping
    // (same defensive pattern the jeep adapter uses).
    clearFlightBookkeeping(ctx.input);

    // Save infantry look angles so the camera restores cleanly on exit.
    ctx.cameraController.saveInfantryAngles();

    // Drive the orbit-tank follow-cam from this frame onward (camera
    // keystone re-points it to the gunner sight on a swap via the HUD ctx).
    ctx.cameraController.setVehicleFollowCamera?.(this);

    this.applyHudContext(ctx.hudSystem);

    // Seat-conditional surface: stadia sight + gunner panel in the gunner
    // station, plain infantry crosshair at the driver hatch.
    this.applySeatSurface(ctx.gameRenderer);

    // Re-acquire pointer lock so mouse-look / turret aim keeps working.
    relockPointer(ctx.input);
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, this.exitReason());

    clearFlightBookkeeping(ctx.input);
    // Re-attach first-person before restoring infantry angles so the next
    // updateCamera frame uses the infantry path, not the stale follow-cam.
    ctx.cameraController?.setVehicleFollowCamera?.(null);
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(null);

    setInfantryCrosshair(ctx.gameRenderer);

    // Tear down the gunner panel so it doesn't linger over the infantry HUD.
    this.sight.deactivate();
    this.gameRenderer = undefined;

    // Park the chassis: zero the driver inputs so the tank coasts to a
    // stop under the physics layer's drag rather than carrying the
    // player's last throttle into the unattended state.
    this.model.setControls(0, 0, true);

    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Default: eject on the +X side of the chassis (driver hatch clear of
    // the engine deck). Direction respects the tank's current yaw so the
    // player doesn't land in the engine deck after a turn.
    _scratchSide.set(DEFAULT_EXIT_SIDE_OFFSET_M, 0, 0).applyQuaternion(this.model.quaternion);
    const exitPos = this.model.position.clone().add(_scratchSide);
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.mounted) return;

    // Advance any in-flight cannon rounds first so a shell fired last frame
    // arcs + impacts regardless of which station the player is crewing this
    // frame (a gunner can swap to the driver hatch with a round still in
    // flight).
    this.cannonStep?.(ctx.deltaTime);

    if (this.crewSeat === 'gunner') {
      this.updateGunner(ctx);
      return;
    }

    this.updateDriver(ctx);
  }

  /**
   * Step the tank's physics with terrain. Called by the integration layer
   * once per frame (or by tests). Mirrors Tank.update(dt) but with explicit
   * terrain wiring. Runs regardless of which seat the player crews — the
   * chassis still simulates while the player is up in the turret.
   */
  stepPhysics(deltaTime: number, terrain: ITerrainRuntime | null): void {
    if (!this.mounted) return;
    this.model.setTerrain(terrain);
    this.model.update(deltaTime);
  }

  /**
   * Write the chassis world position into `out`. The session controller calls
   * this each frame to keep `playerState.position` glued to the driven tank so
   * terrain streaming, AI targeting, zone presence, and the minimap track the
   * chassis rather than the boarding spot — true whether the player is crewing
   * the driver hatch or up in the gunner station.
   */
  getChassisPosition(out: THREE.Vector3): boolean {
    if (!this.mounted) return false;
    out.copy(this.model.position);
    return true;
  }

  resetControlState(): void {
    this.controls.throttleAxis = 0;
    this.controls.turnAxis = 0;
    this.controls.brake = false;
    this.fireRequested = false;
  }

  // ── Seat swap ──────────────────────────────────────────────────────────────

  /** Current crew seat the player occupies while mounted. */
  getCrewSeat(): CrewSeat {
    return this.crewSeat;
  }

  /**
   * Toggle the player between the driver hatch and the gunner station on
   * the same Tank instance. Releases the seat the player is leaving and
   * occupies the seat they are entering on the underlying `IVehicle`, then
   * switches the control target + HUD context. Returns the new crew seat,
   * or the current seat unchanged when the player is not mounted (no-op).
   *
   * The chassis coasts to a stop when the player leaves the driver hatch
   * (no hand on the throttle), mirroring the unattended-chassis behaviour
   * on a full dismount.
   */
  swapSeat(ctx: VehicleUpdateContext): CrewSeat {
    if (!this.mounted) return this.crewSeat;

    const target: CrewSeat = this.crewSeat === 'pilot' ? 'gunner' : 'pilot';

    // Move the player on the underlying vehicle: free the old station, lock
    // the new one. Tank.release/occupy are role-keyed and idempotent.
    this.model.release(this.crewSeat);
    this.model.occupy(target, 'player');

    // Leaving the driver hatch parks the chassis so it doesn't carry the
    // last throttle while the player is up in the turret.
    if (this.crewSeat === 'pilot') {
      this.model.setControls(0, 0, true);
    }

    this.crewSeat = target;
    this.playerSeat = target;
    this.resetControlState();
    // Deliberately do NOT reset `lastShotMs` here: the reload gate models the
    // physical cannon's reload, which is a property of the gun and persists
    // across seat swaps on the same chassis. Re-arming on a driver<->gunner
    // toggle would let a player defeat the rate limit by swapping out-and-back
    // between shots.

    this.applyHudContext(ctx.hudSystem);
    this.applySeatSurface(this.gameRenderer);
    return this.crewSeat;
  }

  // ── Accessors (for integration + tests) ────────────────────────────────────

  getControls(): Readonly<{ throttleAxis: number; turnAxis: number; brake: boolean }> {
    return this.controls;
  }

  /** Returns the bound tank's vehicleId while mounted, else null. */
  getActiveVehicleId(): string | null {
    return this.mounted ? this.model.id : null;
  }

  /**
   * Consumes a pending fire request, returning true exactly once per frame
   * that fire input was held in the gunner seat. The internal cannon path
   * polls this; it is also exposed so an integration layer can route the
   * fire intent elsewhere (mirrors the M2HB / gunner-adapter contract).
   */
  consumeFireRequest(): boolean {
    const v = this.fireRequested;
    this.fireRequested = false;
    return v;
  }

  /**
   * Compute a third-person orbit-tank camera pose for the active chassis.
   * Writes into the provided vectors and returns true on success. Used while
   * the player crews the driver hatch.
   */
  computeThirdPersonCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;

    // TrackedVehiclePhysics uses local -Z as forward; +Z is behind the chassis.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion);
    outPosition.copy(this.model.position).addScaledVector(back, this.cameraDistance);
    outPosition.y += this.cameraHeight;
    outLookTarget.copy(this.model.position);
    outLookTarget.y += this.cameraLookHeight;
    return true;
  }

  /**
   * Compute a first-person gunner-sight camera pose (eye just behind the
   * muzzle, looking down the barrel). Writes into the provided vectors and
   * returns true on success when the player crews the gunner station. The
   * pose is sourced from the turret's world-space barrel transform so the
   * camera tracks the rendered turret exactly.
   */
  computeGunnerSightCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
    outFov?: { value: number },
  ): boolean {
    if (!this.mounted || this.crewSeat !== 'gunner') return false;

    const turret = this.model.getTurret();
    turret.getBarrelTipWorldPosition(_scratchTip);
    turret.getBarrelDirectionWorld(_scratchDir);

    outPosition.copy(_scratchTip);
    outPosition.addScaledVector(_scratchDir, this.sightForwardOffset);
    outPosition.y += this.sightUpOffset;

    outLookTarget.copy(outPosition).addScaledVector(_scratchDir, 1);
    // Same call drives the zoom: the camera keystone applies this FOV while
    // the sight is active (magnification is a FOV change only; the DOM
    // reticle overlay scales naturally with the zoomed view).
    if (outFov) outFov.value = this.sight.getSightFov();
    return true;
  }

  /** Desired gunner-sight vertical FOV (degrees) for the current zoom step. */
  getSightFov(): number {
    return this.sight.getSightFov();
  }

  /** Whether the sight is currently in the zoomed step. */
  isZoomed(): boolean {
    return this.sight.isZoomed();
  }

  /**
   * Main-gun fire-gate state for the HUD, derived from the SAME reload gate
   * `tryFireCannon` enforces — display and gate cannot drift.
   */
  getMainGunState(): 'ready' | 'reloading' {
    return this.sight.getMainGunState();
  }

  /** Reload completion 0..1 (1 = loaded / READY). Drives the panel's bar. */
  getReloadProgress01(): number {
    const elapsedMs = this.clock() - this.lastShotMs;
    const reloadMs = this.reloadSeconds * 1000;
    if (reloadMs <= 0) return 1;
    const p = elapsedMs / reloadMs;
    return p >= 1 ? 1 : p < 0 ? 0 : p;
  }

  // ── Driver seat ──────────────────────────────────────────────────────────

  private updateDriver(ctx: VehicleUpdateContext): void {
    this.readDriverInputs(ctx.input);

    // Forward intent through the Tank, which delegates straight through to
    // the TrackedVehiclePhysics layer. Signature is positional:
    // setControls(throttleAxis, turnAxis, brake).
    this.model.setControls(
      this.controls.throttleAxis,
      this.controls.turnAxis,
      this.controls.brake,
    );

    // Update HUD widgets for ground vehicles (forward speed readout). Reuse
    // the elevation slot as a generic m/s readout.
    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.updateElevation?.(this.model.getForwardSpeed());
  }

  private readDriverInputs(input: PlayerInput): void {
    // --- Throttle axis (W = +1, S = -1; touch -z forward) ---
    this.controls.throttleAxis = readThrottleAxis(input);

    // --- Turn axis (D = +1, A = -1) — track-differential, NOT a steer angle ---
    // TrackedVehiclePhysics composes left/right track commands as:
    //   leftCmd  = clamp(throttle - turn, -1, +1)
    //   rightCmd = clamp(throttle + turn, -1, +1)
    this.controls.turnAxis = readLateralAxis(input);

    // --- Brake (Space, held) ---
    this.controls.brake = input.isKeyPressed('space');
  }

  // ── Gunner seat ────────────────────────────────────────────────────────────

  private updateGunner(ctx: VehicleUpdateContext): void {
    this.readAimInput(ctx.input, ctx.deltaTime);
    this.readFireInput(ctx.input);
    this.tryFireCannon();
    // RMB zoom toggle (rising edge): push the new magnification through the
    // HUD context so consumers see it without reading adapter internals.
    if (this.sight.readZoomToggle(ctx.input)) {
      this.applyHudContext(ctx.hudSystem);
    }
    this.sight.refreshPanel();
  }

  private readAimInput(input: PlayerInput, deltaTime: number): void {
    const turret = this.model.getTurret();
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
    } else if (input.getIsPointerLocked?.()) {
      const m = input.getMouseMovement?.();
      if (m && (m.x !== 0 || m.y !== 0)) {
        // Right-drag (positive mouse-x) turns the turret right (negative
        // yaw, matching the EmplacementPlayerAdapter convention).
        dYaw += -m.x * this.mouseSensitivity;
        // Up-drag (negative mouse-y) raises the barrel (+pitch).
        dPitch += -m.y * this.mouseSensitivity;
        input.clearMouseMovement?.();
      }
    }

    if (dYaw !== 0 || dPitch !== 0) {
      // Accumulate against the turret's current achieved aim and let the
      // turret model enforce its own yaw / pitch envelope + slew cap.
      turret.setTargetYaw(turret.getYaw() + dYaw);
      turret.setTargetPitch(turret.getPitch() + dPitch);
    }
  }

  private readFireInput(input: PlayerInput): void {
    // Left mouse button (held) fires the cannon; Space is the keyboard
    // fallback. PlayerInput tracks real held-button state, so this latches
    // a fire request for any frame the trigger is down.
    const fire = input.isMouseButtonPressed(0) || input.isKeyPressed('space');
    if (fire) this.fireRequested = true;
  }

  /**
   * Fire the main cannon if a round was requested this frame, a cannon
   * launcher is bound, the chassis is alive, the turret isn't jammed, and
   * the reload gate has elapsed. Routes the shot through the shared
   * projectile primitive using the turret's live barrel transform, so the
   * round spawns exactly where the gunner is pointing.
   *
   * Returns the projectile id on a successful launch, or null otherwise.
   */
  private tryFireCannon(): string | null {
    const wantsFire = this.consumeFireRequest();
    if (!wantsFire) return null;
    if (!this.cannon) return null;
    if (this.model.isDestroyed()) return null;
    if (this.model.getSubstates().turretJammed) return null;

    const now = this.clock();
    if (now - this.lastShotMs < this.reloadSeconds * 1000) return null;

    const turret = this.model.getTurret();
    turret.getBarrelTipWorldPosition(_scratchTip);
    turret.getBarrelDirectionWorld(_scratchDir);

    const id = this.cannon.launch({
      origin: _scratchTip.clone(),
      direction: _scratchDir.clone(),
      muzzleSpeed: this.muzzleSpeed,
      ammoType: this.ammoType,
      shooterId: 'player',
      shooterFaction: this.model.faction,
    });
    this.lastShotMs = now;
    return id;
  }

  // ── Gunner sight surface (tank-sight-prod-wiring) ─────────────────────────

  /**
   * Seat-conditional crosshair + panel: the gunner station gets the stadia
   * `tank_gunner` reticle and the FJ gunner panel; the driver hatch gets the
   * plain infantry crosshair and no panel. Called on enter and on seat swap.
   */
  private applySeatSurface(gameRenderer: IGameRenderer | undefined): void {
    if (this.crewSeat === 'gunner') {
      setCrosshairMode(gameRenderer, 'tank_gunner');
      this.sight.activate();
    } else {
      setCrosshairMode(gameRenderer, 'infantry');
      this.sight.deactivate();
    }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private applyHudContext(hudSystem: VehicleUpdateContext['hudSystem'] | VehicleTransitionContext['hudSystem']): void {
    const hud = hudSystem as IHUDSystem | undefined;
    const uiCtx = this.crewSeat === 'gunner' ? createGunnerUIContext(this.sight.isZoomed()) : createPilotUIContext();
    hud?.setVehicleContext?.(uiCtx);
  }

  private enterReason(): string {
    return this.crewSeat === 'gunner' ? 'tank.gunner.enter' : 'tank.enter';
  }

  private exitReason(): string {
    return this.crewSeat === 'gunner' ? 'tank.gunner.exit' : 'tank.exit';
  }
}
