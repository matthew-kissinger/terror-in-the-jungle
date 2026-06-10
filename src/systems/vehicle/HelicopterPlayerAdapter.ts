// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { HelicopterControls } from '../helicopter/HelicopterPhysics';
import type { IHelicopterModel, IHUDSystem } from '../../types/SystemInterfaces';
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
import type { IGameRenderer } from '../../types/SystemInterfaces';
import type { HeliReticleWeapon, TraverseStopDir } from '../../ui/hud/CrosshairSystem';
import { heliHudVariantDescriptor } from '../../ui/hud/HelicopterHUD';
import { computeRocketCueDrop } from '../helicopter/HelicopterWeaponSystem';
import {
  getFlightMouseControlEnabled,
  getTouchFlightCyclicInput,
  isTouchFlightMode,
  pushTraverseStop,
  relockPointer,
  seatPlayer,
  setCrosshairMode,
  setFlightVehicleInputState,
  setInputContext,
} from './VehicleAdapterShared';

// ── Helicopter control tuning ──
const HELI_AUTOHOVER_TARGET = 0.4;
const HELI_TOUCH_JOYSTICK_DEADZONE = 0.1;
const HELI_TOUCH_CYCLIC_DEADZONE = 0.05;
const HELI_MOUSE_SENSITIVITY_DEFAULT = 0.5;

// ── Door-gun seat tuning (door-gun-seat) ──
// The door gun sits in the left door. Aim is expressed as a yaw (fore/aft sweep
// around the left-door base) and a pitch (elevation), both clamped to hard
// mechanical stops at the mount. Yaw 0 = straight out the left door (-X local);
// positive yaw sweeps toward the nose, negative toward the tail.
const DOOR_GUN_MOUSE_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const DOOR_GUN_YAW_MIN = -1.2;  // rad, ~69° toward the tail
const DOOR_GUN_YAW_MAX = 1.2;   // rad, ~69° toward the nose
const DOOR_GUN_PITCH_MIN = -0.9; // rad, ~52° depression (firing down at the ground)
const DOOR_GUN_PITCH_MAX = 0.45; // rad, ~26° elevation
const DOOR_GUN_STOP_EPS = 0.02;  // rad slack before a limit reads as "pinned"

// ── Attack-sight rocket cue (gunship-reticle-upgrade) ──
// The rocket pod on the AH-1 Cobra (the only `attack`-role airframe). Its name
// matches `AircraftConfigs.AH1_COBRA` so the adapter can tell the active pilot
// weapon apart from the gun via the fenced `getWeaponStatus().name`, and the
// muzzle speed is the SAME value that config's rocket fire path launches at —
// the cue only reads it, it does not re-define ballistics.
const ROCKET_POD_NAME = 'Rocket Pod';
const ROCKET_POD_MUZZLE_SPEED = 150; // m/s; matches AircraftConfigs.AH1_COBRA rocket pod
// Vertical screen scale: pixels of cue drop per radian of below-bore rocket
// fall, capped so the cue stays inside the pipper group's footprint.
const ROCKET_CUE_PIXELS_PER_RAD = 90;
const ROCKET_CUE_MAX_OFFSET_PX = 60;

// Scratch vectors for the door-gun aim solve (module-level: no per-frame alloc).
const _heliPos = new THREE.Vector3();
const _heliQuat = new THREE.Quaternion();
const _gunAim = new THREE.Vector3();
const _gunEuler = new THREE.Euler();
const _attitudeEuler = new THREE.Euler();

/**
 * Concrete crosshair-cue sink on `GameRenderer`. `setCrosshairHelicopterWeapon`
 * + `setCrosshairRocketCueOffset` are NOT on the fenced `IGameRenderer` (they
 * are crosshair-internal), so the adapter widens the structural type here to
 * push the attack-sight state without a fence change — exactly the fixed-wing
 * `updateFixedWingAmmo` precedent.
 */
type CrosshairCueRenderer = IGameRenderer & {
  setCrosshairHelicopterWeapon?(weapon: HeliReticleWeapon): void;
  setCrosshairRocketCueOffset?(offsetPx: number): void;
};

/**
 * Map a rocket-fall lead angle (radians, ≥ 0) to the on-screen pixel drop of
 * the CCIP cue below the boresight pipper. Deterministic + bounded.
 */
function rocketCueAngleToPixels(angleRad: number): number {
  const px = Math.tan(Math.max(0, angleRad)) * ROCKET_CUE_PIXELS_PER_RAD;
  return Math.min(ROCKET_CUE_MAX_OFFSET_PX, Math.max(0, px));
}

function createHelicopterUIContext(role: 'transport' | 'attack' | 'gunship'): VehicleUIContext {
  const armed = role === 'attack' || role === 'gunship';
  const descriptor = heliHudVariantDescriptor(role);
  return {
    kind: 'helicopter',
    role,
    hudVariant: 'flight',
    weaponCount: armed ? 2 : 0,
    // Per-variant HUD panel descriptor carried on the context so the HUD mounts
    // exactly the right panels for this airframe variant (transport: none;
    // gunship: door-gun crew panel; attack: pilot weapon panel).
    heliPanels: {
      weaponPanel: descriptor.showWeaponPanel,
      crewPanel: descriptor.showCrewPanel,
    },
    capabilities: {
      canExit: true,
      canFirePrimary: armed,
      canCycleWeapons: armed,
      canFreeLook: true,
      canStabilize: true,
      canDeploySquad: role === 'transport',
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

/**
 * Helicopter player vehicle adapter.
 * Owns all helicopter-specific control state and orchestrates
 * the enter/exit/update lifecycle for helicopter flight.
 */
export class HelicopterPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'helicopter';
  readonly inputContext: InputContext = 'helicopter';

  // Helicopter control state (moved from PlayerMovement)
  private helicopterControls: HelicopterControls = {
    collective: 0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: true,
  };
  private altitudeLock = false;
  private lockedCollective = HELI_AUTOHOVER_TARGET;

  private helicopterModel: IHelicopterModel;
  private activeHelicopterId: string | null = null;

  // ── Door-gun seat (door-gun-seat) ──
  // The player can swap between the pilot seat and the left-door gun station
  // mid-flight (F key, routed through `toggleDoorGunSeat`). While crewing the
  // door gun the airframe holds an auto-hover and the mouse drives the gun's
  // arc-clamped aim instead of the cyclic. The role + crosshair restore to the
  // pilot station on swap-back or full dismount.
  private inDoorGunSeat = false;
  private doorGunYaw = 0;   // rad, fore/aft sweep around the left-door base
  private doorGunPitch = 0; // rad, elevation around the left-door base
  // Captured on enter so swap-seat / update (no transition ctx) can still drive
  // the crosshair and read the door-gun base role.
  private gameRenderer: IGameRenderer | undefined;
  private aircraftRole: 'transport' | 'attack' | 'gunship' = 'transport';

  constructor(helicopterModel: IHelicopterModel) {
    this.helicopterModel = helicopterModel;
  }

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.activeHelicopterId = ctx.vehicleId;
    this.gameRenderer = ctx.gameRenderer;
    // Always board into the pilot seat; door-gun crewing is an explicit swap.
    this.inDoorGunSeat = false;
    this.doorGunYaw = 0;
    this.doorGunPitch = 0;

    seatPlayer(ctx, 'helicopter.enter');

    setFlightVehicleInputState(ctx.input, 'helicopter');
    setInputContext(ctx.input, 'helicopter');
    ctx.cameraController.saveInfantryAngles();
    ctx.cameraController.setFlightMouseControlEnabled(true);

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.showHelicopterMouseIndicator();
    hudSystem?.updateHelicopterMouseMode(getFlightMouseControlEnabled(ctx.cameraController));
    hudSystem?.showHelicopterInstruments();

    const role = this.helicopterModel.getAircraftRole(ctx.vehicleId);
    this.aircraftRole = role;
    hudSystem?.setVehicleContext?.(createHelicopterUIContext(role));
    hudSystem?.setHelicopterAircraftRole(role);

    // Re-acquire pointer lock for mouse flight controls
    relockPointer(ctx.input);

    if (ctx.gameRenderer) {
      const crosshairMode = role === 'attack'
        ? 'helicopter_attack'
        : role === 'gunship'
          ? 'helicopter_gunship'
          : 'helicopter_transport';
      ctx.gameRenderer.setCrosshairMode(crosshairMode);
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'helicopter.exit');
    setFlightVehicleInputState(ctx.input, 'none');
    setInputContext(ctx.input, 'gameplay');
    ctx.cameraController?.restoreInfantryAngles();

    // Release the door gun if the player dismounts straight from the gun seat.
    if (this.inDoorGunSeat && this.activeHelicopterId) {
      this.setDoorGunCrewing(this.activeHelicopterId, false);
    }
    this.inDoorGunSeat = false;

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.hideHelicopterMouseIndicator();
    hudSystem?.hideHelicopterInstruments();
    hudSystem?.setVehicleContext?.(null);

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }
    // Clear any lit arc-stop tick so a mid-gunner dismount leaves none behind.
    pushTraverseStop(ctx.gameRenderer, null);

    this.gameRenderer = undefined;
    this.activeHelicopterId = null;
    this.resetControlState();
  }

  getExitPlan(ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    const planner = this.helicopterModel as IHelicopterModel & {
      getPlayerExitPlan?: (helicopterId: string) => VehicleExitPlan | null;
    };
    return planner.getPlayerExitPlan?.(ctx.vehicleId) ?? {
      canExit: true,
      mode: 'normal',
      position: ctx.position,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeHelicopterId) return;

    // Door-gun station: the mouse drives the gun's arc-clamped aim, not the
    // cyclic. The airframe holds an auto-hover (no pilot stick input this
    // frame) so the gunner can walk fire onto a target without flying.
    if (this.inDoorGunSeat) {
      this.updateDoorGun(ctx);
      return;
    }

    // Pilot seat: make sure the door-gun gunner POV is released (a swap back to
    // the pilot seat restores the chase cam on the next frame).
    ctx.cameraController.setDoorGunView?.(false);

    let mouseMovement: { x: number; y: number } | undefined;
    const touchFlight = isTouchFlightMode(ctx.input);
    if (
      !touchFlight
      && getFlightMouseControlEnabled(ctx.cameraController)
      && ctx.input.getIsPointerLocked()
    ) {
      mouseMovement = ctx.input.getMouseMovement();
    }

    this.updateHelicopterControls(ctx.deltaTime, ctx.input, ctx.hudSystem as IHUDSystem | undefined, mouseMovement);

    if (mouseMovement) {
      ctx.input.clearMouseMovement();
    }

    // Attack-sight cue: pick the prominent reticle (gun pipper vs rocket cue)
    // for the selected pilot weapon and, with rockets up, drop the CCIP cue by
    // the live rocket-fall lead. Only the AH-1 (attack role) carries this sight.
    if (this.aircraftRole === 'attack') {
      this.updateAttackSight();
    }
  }

  resetControlState(): void {
    this.helicopterControls = {
      collective: 0,
      cyclicPitch: 0,
      cyclicRoll: 0,
      yaw: 0,
      engineBoost: false,
      autoHover: true,
    };
    this.altitudeLock = false;
    this.lockedCollective = HELI_AUTOHOVER_TARGET;
  }

  // ── Door-gun seat (door-gun-seat) ──────────────────────────────────────────

  /**
   * Toggle the player between the pilot seat and the left-door gun station on
   * the active helicopter. A no-op (returns the current seat) when the aircraft
   * has no door gun or the player is not aboard. Returns `'door_gun'` or
   * `'pilot'` for the seat the player ends up in.
   *
   * Entering the gun seat marks the player as crewing the door gun (which
   * suspends the AI auto-fire so they never double-fire), engages an auto-hover
   * so the airframe holds while aiming, and swaps the crosshair to `door_gun`.
   * Leaving restores the pilot crosshair and releases the gun back to the AI
   * crew. Mirrors the M48 `swapSeat` shape (no enter/exit churn — one session).
   */
  toggleDoorGunSeat(): 'pilot' | 'door_gun' {
    const heliId = this.activeHelicopterId;
    if (!heliId) return 'pilot';

    const model = this.helicopterModel as IHelicopterModel & {
      hasDoorGun?: (heliId: string) => boolean;
    };
    if (!this.inDoorGunSeat && model.hasDoorGun?.(heliId) !== true) {
      return 'pilot';
    }

    this.inDoorGunSeat = !this.inDoorGunSeat;

    if (this.inDoorGunSeat) {
      // Centre the gun straight out the door and hold the airframe.
      this.doorGunYaw = 0;
      this.doorGunPitch = 0;
      this.helicopterControls.autoHover = true;
      this.altitudeLock = true;
      this.lockedCollective = this.helicopterControls.collective || HELI_AUTOHOVER_TARGET;
      this.setDoorGunCrewing(heliId, true);
      setCrosshairMode(this.gameRenderer, 'door_gun');
      return 'door_gun';
    }

    this.setDoorGunCrewing(heliId, false);
    setCrosshairMode(this.gameRenderer, this.pilotCrosshairMode());
    // Clear any lit arc-stop tick so it never lingers under the pilot reticle.
    pushTraverseStop(this.gameRenderer, null);
    return 'pilot';
  }

  /** The seat the player currently crews while aboard. */
  getCrewSeat(): 'pilot' | 'door_gun' {
    return this.inDoorGunSeat ? 'door_gun' : 'pilot';
  }

  /** Current door-gun aim relative to the airframe (radians). Exposed for tests. */
  getDoorGunAim(): { yaw: number; pitch: number } {
    return { yaw: this.doorGunYaw, pitch: this.doorGunPitch };
  }

  /**
   * Which arc limit (if any) the door gun is currently pinned against — the
   * door-mount analogue of the M2HB traverse stop. `null` when the gun has
   * travel in every direction. Exposed so the gunner-feel cue (and tests) can
   * read the hard stop; the open-cross reticle's arc-stop ticks are driven from
   * this value once a fence-clean HUD seam lands (sibling heli-hud-consolidation).
   */
  getDoorGunTraverseStop(): TraverseStopDir {
    if (this.doorGunYaw <= DOOR_GUN_YAW_MIN + DOOR_GUN_STOP_EPS) return 'right';
    if (this.doorGunYaw >= DOOR_GUN_YAW_MAX - DOOR_GUN_STOP_EPS) return 'left';
    if (this.doorGunPitch <= DOOR_GUN_PITCH_MIN + DOOR_GUN_STOP_EPS) return 'down';
    if (this.doorGunPitch >= DOOR_GUN_PITCH_MAX - DOOR_GUN_STOP_EPS) return 'up';
    return null;
  }

  private setDoorGunCrewing(heliId: string, crewing: boolean): void {
    const model = this.helicopterModel as IHelicopterModel & {
      setPlayerDoorGunCrewing?: (heliId: string, crewing: boolean) => void;
    };
    model.setPlayerDoorGunCrewing?.(heliId, crewing);
  }

  private pilotCrosshairMode(): 'helicopter_attack' | 'helicopter_gunship' | 'helicopter_transport' {
    return this.aircraftRole === 'attack'
      ? 'helicopter_attack'
      : this.aircraftRole === 'gunship'
        ? 'helicopter_gunship'
        : 'helicopter_transport';
  }

  /**
   * Drive the door gun for one frame: read the mouse to slew the gun within its
   * arc (hard stops at the mount limits), solve the world-space aim direction
   * from the live airframe pose, fire through the existing door-gun hitscan
   * path on LMB, and push the arc-stop + ammo readouts to the HUD.
   */
  private updateDoorGun(ctx: VehicleUpdateContext): void {
    const heliId = this.activeHelicopterId;
    if (!heliId) return;
    const input = ctx.input;
    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;

    // Slew from mouse movement (clamped to the mount arc).
    if (input.getIsPointerLocked?.()) {
      const m = input.getMouseMovement?.();
      if (m && (m.x !== 0 || m.y !== 0)) {
        this.doorGunYaw = THREE.MathUtils.clamp(
          this.doorGunYaw - m.x * DOOR_GUN_MOUSE_SENSITIVITY,
          DOOR_GUN_YAW_MIN, DOOR_GUN_YAW_MAX,
        );
        this.doorGunPitch = THREE.MathUtils.clamp(
          this.doorGunPitch - m.y * DOOR_GUN_MOUSE_SENSITIVITY,
          DOOR_GUN_PITCH_MIN, DOOR_GUN_PITCH_MAX,
        );
        input.clearMouseMovement?.();
      }
    }

    // Keep the airframe in a hold while the player is off the cyclic.
    this.helicopterControls.collective = this.lockedCollective;
    this.helicopterControls.cyclicPitch = 0;
    this.helicopterControls.cyclicRoll = 0;
    this.helicopterControls.yaw = 0;
    this.helicopterModel.setHelicopterControls(heliId, this.helicopterControls);

    // Solve the world aim direction from the live airframe pose + gun angles.
    const hasPose = this.helicopterModel.getHelicopterPositionTo(heliId, _heliPos)
      && this.helicopterModel.getHelicopterQuaternionTo(heliId, _heliQuat);
    if (!hasPose) return;
    this.solveDoorGunAim(_heliQuat, _gunAim);

    // Swing the camera to the door-side gunner POV looking along the clamped
    // aim. Pushed every frame while crewing; the pilot-seat branch in `update`
    // clears it on swap-back and the camera force-restores on dismount.
    ctx.cameraController.setDoorGunView?.(true, _gunAim);

    // Light the door-gun reticle's arc-stop edge tick from the live aim (the
    // open-cross door_gun mode shares the emplacement traverse-stop signal).
    pushTraverseStop(this.gameRenderer, this.getDoorGunTraverseStop());

    // Fire through the existing door-gun hitscan path (no new ballistics).
    const fire = input.isMouseButtonPressed?.(0) ?? false;
    const model = this.helicopterModel as IHelicopterModel & {
      firePlayerDoorGun?: (
        heliId: string, position: THREE.Vector3, quaternion: THREE.Quaternion,
        aimDir: THREE.Vector3, fire: boolean, dt: number,
      ) => void;
      getPlayerDoorGunStatus?: (heliId: string) => { name: string; ammo: number; maxAmmo: number } | null;
    };
    model.firePlayerDoorGun?.(heliId, _heliPos, _heliQuat, _gunAim, fire, ctx.deltaTime);

    // Surface the door-gun belt count through the existing heli weapon-status
    // HUD slot (no new ammo economy — this is the same belt the AI crew shares).
    const status = model.getPlayerDoorGunStatus?.(heliId);
    if (status && hudSystem) {
      hudSystem.setHelicopterWeaponStatus?.(status.name, status.ammo);
    }
  }

  /**
   * Build the world-space aim direction for the door gun. The base direction is
   * straight out the left door (local -X); door-gun yaw sweeps it fore/aft about
   * the airframe up-axis and pitch tilts it about the door-line, then the whole
   * solution is rotated into world space by the airframe orientation.
   */
  private solveDoorGunAim(heliQuat: THREE.Quaternion, out: THREE.Vector3): void {
    // Local aim: -X (out the left door), yawed about +Y, pitched about +Z-ish.
    // Compose with an Euler so a single rotation maps the door axis cleanly.
    _gunEuler.set(this.doorGunPitch, this.doorGunYaw, 0, 'YXZ');
    out.set(-1, 0, 0).applyEuler(_gunEuler).applyQuaternion(heliQuat).normalize();
  }

  // ── Attack-sight cue (gunship-reticle-upgrade) ──────────────────────────────

  /**
   * Refresh the AH-1 attack sight for one frame from existing flight + weapon
   * state (all read through the fenced model surface — no new ballistics):
   *   - read the selected pilot weapon (`getWeaponStatus().name`) to pick the
   *     prominent reticle (gun pipper vs rocket cue);
   *   - with rockets selected, solve the CCIP-lite rocket-fall lead from the
   *     airframe airspeed + nose pitch + the rocket muzzle speed, and drop the
   *     cue below the boresight by the converted pixel offset.
   * The crosshair state is pushed through the concrete (non-fenced) GameRenderer
   * cue seam — the fixed-wing ammo precedent — so the fence is untouched.
   */
  private updateAttackSight(): void {
    const heliId = this.activeHelicopterId;
    if (!heliId) return;
    const renderer = this.gameRenderer as CrosshairCueRenderer | undefined;
    if (!renderer?.setCrosshairHelicopterWeapon) return;

    const status = this.helicopterModel.getWeaponStatus(heliId);
    const rocketsSelected = status?.name === ROCKET_POD_NAME;
    const weapon: HeliReticleWeapon = rocketsSelected ? 'rockets' : 'gun';
    renderer.setCrosshairHelicopterWeapon(weapon);

    if (!rocketsSelected) {
      renderer.setCrosshairRocketCueOffset?.(0);
      return;
    }

    // Airspeed + nose pitch drive the fall lead. Pitch comes from the live
    // airframe pose (negative = nose-down dive → the cue converges to the pipper).
    const airspeed = this.helicopterModel.getFlightData(heliId)?.airspeed ?? 0;
    let pitch = 0;
    if (this.helicopterModel.getHelicopterQuaternionTo(heliId, _heliQuat)) {
      _attitudeEuler.setFromQuaternion(_heliQuat, 'YXZ');
      pitch = _attitudeEuler.x;
    }

    const dropAngle = computeRocketCueDrop({
      muzzleSpeed: ROCKET_POD_MUZZLE_SPEED,
      airspeed,
      pitch,
    });
    renderer.setCrosshairRocketCueOffset?.(rocketCueAngleToPixels(dropAngle));
  }

  // ── Public control accessors ──

  getHelicopterControls(): Readonly<HelicopterControls> {
    return this.helicopterControls;
  }

  setEngineBoost(boost: boolean): void {
    this.helicopterControls.engineBoost = boost;
  }

  toggleAutoHover(): void {
    this.helicopterControls.autoHover = !this.helicopterControls.autoHover;
  }

  toggleAltitudeLock(): void {
    this.altitudeLock = !this.altitudeLock;
    if (this.altitudeLock) {
      this.lockedCollective = this.helicopterControls.collective;
    }
  }

  // ── Private control update ──

  private updateHelicopterControls(
    deltaTime: number,
    input: PlayerInput,
    hudSystem?: IHUDSystem,
    mouseMovement?: { x: number; y: number },
  ): void {
    const hasTouchHeliMode = isTouchFlightMode(input);

    // --- Collective (vertical thrust) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      const collectiveInput = -touchMove.z;
      if (Math.abs(collectiveInput) > HELI_TOUCH_JOYSTICK_DEADZONE) {
        this.helicopterControls.collective = (collectiveInput + 1) / 2;
        this.altitudeLock = false;
      } else {
        this.helicopterControls.collective = this.getIdleCollective();
      }
    } else if (input.isKeyPressed('keyw')) {
      this.helicopterControls.collective = 1.0;
      this.altitudeLock = false;
    } else if (input.isKeyPressed('keys')) {
      this.helicopterControls.collective = 0.0;
      this.altitudeLock = false;
    } else {
      this.helicopterControls.collective = this.getIdleCollective();
    }

    // --- Yaw (tail rotor, turning) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      this.helicopterControls.yaw = Math.abs(touchMove.x) > HELI_TOUCH_JOYSTICK_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      this.helicopterControls.yaw = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      this.helicopterControls.yaw = -1.0;
    } else {
      this.helicopterControls.yaw = 0;
    }

    // --- Cyclic Pitch/Roll ---
    const touchCyclic = getTouchFlightCyclicInput(input);
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > HELI_TOUCH_CYCLIC_DEADZONE || Math.abs(touchCyclic.roll) > HELI_TOUCH_CYCLIC_DEADZONE;

    if (hasTouchCyclic) {
      this.helicopterControls.cyclicPitch = touchCyclic.pitch;
      this.helicopterControls.cyclicRoll = touchCyclic.roll;
    } else {
      this.helicopterControls.cyclicPitch = input.isKeyPressed('arrowup') ? 1.0
        : input.isKeyPressed('arrowdown') ? -1.0 : 0;
      this.helicopterControls.cyclicRoll = input.isKeyPressed('arrowright') ? 1.0
        : input.isKeyPressed('arrowleft') ? -1.0 : 0;
    }

    if (mouseMovement) {
      this.addMouseControl(mouseMovement);
    }

    // Send controls to helicopter model
    if (this.activeHelicopterId) {
      this.helicopterModel.setHelicopterControls(this.activeHelicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD
    if (hudSystem && this.activeHelicopterId) {
      let rpm = this.helicopterControls.collective * 0.8 + 0.2;
      const state = this.helicopterModel.getHelicopterState(this.activeHelicopterId);
      if (state) rpm = state.engineRPM;

      const flightData = this.helicopterModel.getFlightData(this.activeHelicopterId);
      if (flightData) {
        hudSystem.updateHelicopterFlightData(flightData.airspeed, flightData.heading, flightData.verticalSpeed);
      }

      hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        rpm,
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost,
      );
    }
  }

  private getIdleCollective(): number {
    if (this.altitudeLock) return this.lockedCollective;
    if (this.helicopterControls.autoHover) return HELI_AUTOHOVER_TARGET;
    return 0;
  }

  private addMouseControl(mouseMovement: { x: number; y: number }, sensitivity: number = HELI_MOUSE_SENSITIVITY_DEFAULT): void {
    this.helicopterControls.cyclicRoll = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicRoll + mouseMovement.x * sensitivity,
      -1.0, 1.0,
    );
    this.helicopterControls.cyclicPitch = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicPitch - mouseMovement.y * sensitivity,
      -1.0, 1.0,
    );
  }
}
