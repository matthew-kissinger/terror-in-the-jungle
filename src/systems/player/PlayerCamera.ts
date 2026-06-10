// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { MathUtils } from '../../utils/Math';
import { PlayerState } from '../../types';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { PlayerInput } from './PlayerInput';
import { IHelicopterModel } from '../../types/SystemInterfaces';
import type { FixedWingModel } from '../vehicle/FixedWingModel';
import {
  computeFixedWingConvergencePoint,
  getFixedWingCameraFit,
  getFixedWingWeaponConfig,
} from '../vehicle/FixedWingArmament';
import type { FixedWingCameraFit } from '../vehicle/FixedWingArmament';

const _helicopterPosition = new THREE.Vector3();
const _helicopterQuaternion = new THREE.Quaternion();
const _cameraPosition = new THREE.Vector3();
const _helicopterForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _fwPosition = new THREE.Vector3();
const _fwQuaternion = new THREE.Quaternion();
const _fwForward = new THREE.Vector3();
const _fwRight = new THREE.Vector3();
const _fwConvergence = new THREE.Vector3();
const _followPosition = new THREE.Vector3();
const _followLookTarget = new THREE.Vector3();
// Out-param scratch for the optional weapon-sight FOV (degrees; 0 = unset).
const _sightFovOut = { value: 0 };
// Door-gun POV scratch: the gunner viewpoint (offset out the left door) and the
// look target along the clamped gun aim. Module-level so the per-frame camera
// solve never allocates.
const _doorGunEye = new THREE.Vector3();
const _doorGunLook = new THREE.Vector3();
const _doorGunSide = new THREE.Vector3();

// Door-gun gunner viewpoint, expressed in the airframe's local frame: the M60
// sits in the left door, so the eye is offset out the left side (local -X),
// slightly down (the gunner leans out over the skid). Tuning constants — the
// view feel, not a contract.
const DOOR_GUN_EYE_SIDE_M = 2.2;   // out the left door (local -X)
const DOOR_GUN_EYE_DOWN_M = 0.4;   // gunner crouches below the rotor hub line
const DOOR_GUN_LOOK_RANGE_M = 60;  // how far down the aim ray the camera looks

/**
 * Minimal contract a ground/tank/surface adapter implements so the camera
 * can drive a third-person follow pose for it without knowing the vehicle's
 * concrete type. The adapter registers itself via
 * `PlayerCamera.setVehicleFollowCamera` on enter and clears it on exit.
 *
 * Returns true and writes the desired camera position + look target into the
 * provided vectors; returns false when the vehicle pose is unavailable, in
 * which case the camera falls back to first-person for that frame.
 */
export interface VehicleFollowCamera {
  computeThirdPersonCamera(outPosition: THREE.Vector3, outLookTarget: THREE.Vector3): boolean;
  /**
   * Optional first-person weapon-sight pose (tank gunner station, emplacement
   * barrel cam). When present AND it returns true, the camera uses this pose
   * INSTEAD of the third-person follow pose for the frame, applying `outFov`
   * (vertical degrees) when the provider writes one — that is how sight
   * magnification reaches the projection (tank-sight-prod-wiring). Returning
   * false falls back to the third-person pose (e.g. player in the driver
   * seat), so seat swaps switch cameras with no re-registration.
   */
  computeGunnerSightCamera?(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
    outFov?: { value: number },
  ): boolean;
}

const FIXED_WING_CAMERA_FOLLOW_RATE = 9.5;
const FIXED_WING_CAMERA_LOOK_RATE = 12;
const FIXED_WING_FOV_RATE = 6;

export class PlayerCamera {
  private camera: THREE.PerspectiveCamera;
  private playerState: PlayerState;
  private cameraShakeSystem?: CameraShakeSystem;
  private helicopterModel?: IHelicopterModel;
  private fixedWingModel?: FixedWingModel;
  // Active ground/tank/surface follow-cam provider, set by the vehicle
  // adapter on enter and cleared on exit. Null means infantry (first-person).
  private vehicleFollowCamera: VehicleFollowCamera | null = null;

  // Camera settings
  private pitch = 0;
  private yaw = Math.PI; // Default forward view for first live-entry update.
  private maxPitch = Math.PI / 2 - 0.1;

  // Helicopter camera settings
  private helicopterCameraDistance = 25;
  private helicopterCameraHeight = 8;
  private flightMouseControlEnabled = true;

  // Fixed-wing camera smoothing
  private baseFOV = 75;
  private fixedWingLookTarget = new THREE.Vector3();
  private hasFixedWingCameraState = false;
  private activeFixedWingCameraId: string | null = null;
  // AC-47 broadside gunner view: when on, the fixed-wing camera looks down the
  // left-side fire axis to aim the broadside battery (the chase cam cannot).
  // Set by the fixed-wing adapter; ignored by airframes without a broadside.
  private fixedWingBroadsideView = false;

  // Door-gun gunner POV: while the player crews the UH-1 left-door gun, the
  // camera leaves the chase pose and sits at the door-side gunner viewpoint,
  // looking along the clamped gun aim the adapter pushes each frame. The aim is
  // a world-space unit direction; the flag is force-reset on exit so the POV can
  // never leak into the pilot view or the next aircraft.
  private doorGunView = false;
  private doorGunAim = new THREE.Vector3(-1, 0, 0);

  // Saved infantry angles for helicopter enter/exit transitions
  private savedInfantryYaw = Math.PI;
  private savedInfantryPitch = 0;

  // True while a vehicle weapon-sight owns the projection FOV, so the base
  // FOV is restored exactly once on leaving the sight.
  private vehicleSightFovApplied = false;

  constructor(camera: THREE.PerspectiveCamera, playerState: PlayerState) {
    this.camera = camera;
    this.playerState = playerState;
  }

  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void {
    this.cameraShakeSystem = cameraShakeSystem;
  }

  setHelicopterModel(helicopterModel: IHelicopterModel): void {
    this.helicopterModel = helicopterModel;
  }

  setFixedWingModel(fixedWingModel: FixedWingModel): void {
    this.fixedWingModel = fixedWingModel;
  }

  /**
   * Enable (or disable) the AC-47 broadside gunner view. The fixed-wing adapter
   * toggles this; airframes without a broadside battery (A-1, F-4) ignore it and
   * stay on the chase cam. Force-resetting to false on exit guarantees the view
   * never leaks back into the next aircraft or infantry.
   */
  setFixedWingBroadsideView(enabled: boolean): void {
    if (this.fixedWingBroadsideView !== enabled) {
      this.fixedWingBroadsideView = enabled;
      // A view switch re-seeds the follow smoothing so it snaps to the new pose
      // instead of lerping across the cut.
      this.resetFixedWingCameraState();
    }
  }

  isFixedWingBroadsideView(): boolean {
    return this.fixedWingBroadsideView;
  }

  /**
   * Enable (or disable) the helicopter door-gun gunner POV. The heli adapter
   * pushes this each frame while the player crews the left-door gun, passing the
   * clamped world-space gun aim so the camera looks where the gun points;
   * disabling on swap-back to the pilot seat restores the chase cam on the next
   * frame. `restoreInfantryAngles` force-resets the flag on dismount, so the POV
   * can never leak into infantry or the next aircraft (mirrors the broadside
   * view's leak guard).
   */
  setDoorGunView(active: boolean, aimDir?: THREE.Vector3): void {
    this.doorGunView = active;
    if (active && aimDir) {
      this.doorGunAim.copy(aimDir).normalize();
    }
  }

  isDoorGunView(): boolean {
    return this.doorGunView;
  }

  /**
   * Register (or clear with `null`) the ground/tank follow-cam provider.
   * While set, `updateCamera` drives a third-person follow pose instead of
   * the infantry first-person camera. Adapters call this in `onEnter` and
   * clear it in `onExit` so exit re-attaches first-person automatically.
   */
  setVehicleFollowCamera(provider: VehicleFollowCamera | null): void {
    this.vehicleFollowCamera = provider;
  }

  setFlightMouseControlEnabled(enabled: boolean): void {
    this.flightMouseControlEnabled = enabled;
  }

  getFlightMouseControlEnabled(): boolean {
    return this.flightMouseControlEnabled;
  }

  toggleFlightMouseControl(): boolean {
    this.flightMouseControlEnabled = !this.flightMouseControlEnabled;
    Logger.info('player', ` Mouse flight ${this.flightMouseControlEnabled ? 'enabled (affects aircraft controls)' : 'disabled (free orbital look)'}`);
    return this.flightMouseControlEnabled;
  }

  setHelicopterMouseControlEnabled(enabled: boolean): void {
    this.setFlightMouseControlEnabled(enabled);
  }

  getHelicopterMouseControlEnabled(): boolean {
    return this.getFlightMouseControlEnabled();
  }

  toggleHelicopterMouseControl(): boolean {
    return this.toggleFlightMouseControl();
  }

  updateCamera(input: PlayerInput, deltaTime = 1 / 60): void {
    if (this.playerState.isInHelicopter) {
      this.resetFixedWingCameraState();
      this.updateHelicopterCamera(input);
    } else if (this.playerState.isInFixedWing) {
      this.updateFixedWingCamera(input, deltaTime);
    } else if (this.vehicleFollowCamera) {
      this.resetFixedWingCameraState();
      this.updateVehicleFollowCamera(input);
    } else {
      this.resetFixedWingCameraState();
      this.updateFirstPersonCamera(input);
    }
  }

  /**
   * Third-person follow camera for ground vehicles and tanks. Pose math
   * lives on the adapter (`computeThirdPersonCamera`) so each vehicle type
   * tunes its own distance/height; the camera just applies the result. If
   * the adapter cannot resolve the chassis pose this frame (e.g. mid-spawn),
   * fall back to first-person so the view never freezes under the chassis.
   */
  private updateVehicleFollowCamera(input: PlayerInput): void {
    const provider = this.vehicleFollowCamera;

    // Weapon-sight pose wins when the provider crews a sight this frame
    // (tank gunner station): first-person down-the-barrel + sight FOV.
    // Returning false (driver seat, mid-spawn) falls through to the
    // third-person follow pose below.
    if (provider?.computeGunnerSightCamera) {
      _sightFovOut.value = 0;
      if (provider.computeGunnerSightCamera(_followPosition, _followLookTarget, _sightFovOut)) {
        if (input.getIsPointerLocked()) {
          input.clearMouseMovement();
        }
        this.applyVehicleSightFov(_sightFovOut.value > 0 ? _sightFovOut.value : null);
        this.camera.position.copy(_followPosition);
        this.camera.lookAt(_followLookTarget);
        return;
      }
    }
    // Not in a sight this frame — restore the base FOV if a sight set one.
    this.applyVehicleSightFov(null);

    if (!provider || !provider.computeThirdPersonCamera(_followPosition, _followLookTarget)) {
      this.updateFirstPersonCamera(input);
      return;
    }

    // Consume any pending mouse movement so it doesn't accumulate and snap
    // the view the instant the player exits back to infantry control.
    if (input.getIsPointerLocked()) {
      input.clearMouseMovement();
    }

    this.camera.position.copy(_followPosition);
    this.camera.lookAt(_followLookTarget);
  }

  /**
   * Apply (or clear with `null`) the vehicle weapon-sight FOV. Tracks
   * whether the sight owns the projection so the base FOV is restored
   * exactly once on leaving the sight — never fighting the fixed-wing FOV
   * smoothing, which manages the projection on its own path.
   */
  private applyVehicleSightFov(fovDeg: number | null): void {
    if (fovDeg !== null) {
      if (this.camera.fov !== fovDeg) {
        this.camera.fov = fovDeg;
        this.camera.updateProjectionMatrix();
      }
      this.vehicleSightFovApplied = true;
      return;
    }
    if (this.vehicleSightFovApplied) {
      this.vehicleSightFovApplied = false;
      if (this.camera.fov !== this.baseFOV) {
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  private updateFirstPersonCamera(input: PlayerInput): void {
    // A dismount mid-sight skips the follow-cam path entirely (provider
    // cleared) — make sure the sight FOV never sticks into infantry view.
    this.applyVehicleSightFov(null);

    // Update camera rotation from mouse/touch movement
    // On touch devices getIsPointerLocked() returns true when game is started
    if (input.getIsPointerLocked()) {
      const mouseMovement = input.getMouseMovement();
      this.yaw -= mouseMovement.x;
      this.pitch -= mouseMovement.y;
      this.pitch = MathUtils.clamp(this.pitch, -this.maxPitch, this.maxPitch);

      // Clear mouse movement
      input.clearMouseMovement();
    }

    // Get shake offset from shake system
    let shakeOffsetPitch = 0;
    let shakeOffsetYaw = 0;
    if (this.cameraShakeSystem) {
      const shake = this.cameraShakeSystem.getCurrentShakeOffset();
      shakeOffsetPitch = shake.pitch;
      shakeOffsetYaw = shake.yaw;
    }

    // Apply rotation to camera with shake offsets
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + shakeOffsetYaw;
    this.camera.rotation.x = this.pitch + shakeOffsetPitch;

    // Update camera position
    this.camera.position.copy(this.playerState.position);
  }

  private updateHelicopterCamera(input: PlayerInput): void {
    // Get helicopter position and rotation
    const helicopterId = this.playerState.helicopterId;
    if (!helicopterId || !this.helicopterModel) {
      // Fallback to first-person if helicopter not found
      this.updateFirstPersonCamera(input);
      return;
    }

    const hasHelicopterPosition = this.helicopterModel.getHelicopterPositionTo(helicopterId, _helicopterPosition);
    const hasHelicopterQuaternion = this.helicopterModel.getHelicopterQuaternionTo(helicopterId, _helicopterQuaternion);
    if (!hasHelicopterPosition || !hasHelicopterQuaternion) {
      // Fallback to first-person if helicopter data not found
      this.updateFirstPersonCamera(input);
      return;
    }

    // Door-gun gunner POV wins over the chase/orbital pose while the player
    // crews the left-door gun. The eye sits out the left door (a touch low) and
    // looks along the clamped gun aim, so the gunner sees what the gun points
    // at. Consuming any pending mouse movement keeps the aim slew from snapping
    // the chase view the instant the player swaps back to the pilot seat.
    if (this.doorGunView) {
      this.updateDoorGunPovCamera(input);
      return;
    }

    const distanceBack = this.helicopterCameraDistance;
    const heightAbove = this.helicopterCameraHeight;

    if (!this.flightMouseControlEnabled && input.getIsPointerLocked()) {
      // Free orbital look mode - mouse controls camera orbital position around helicopter
      const mouseSensitivity = 0.01;
      const mouseMovement = input.getMouseMovement();

      this.yaw -= mouseMovement.x * mouseSensitivity;
      this.pitch -= mouseMovement.y * mouseSensitivity;

      // Allow full 360-degree horizontal rotation
      // Clamp vertical rotation to prevent flipping
      this.pitch = MathUtils.clamp(this.pitch, -Math.PI * 0.4, Math.PI * 0.4);

      // Clear mouse movement
      input.clearMouseMovement();

      // Spherical coordinate orbital camera positioning
      const radius = distanceBack;
      const x = radius * Math.cos(this.pitch) * Math.sin(this.yaw);
      const y = radius * Math.sin(this.pitch) + heightAbove;
      const z = radius * Math.cos(this.pitch) * Math.cos(this.yaw);

      // Position camera in orbit around helicopter
      _cameraPosition.set(x, y, z);
      _cameraPosition.add(_helicopterPosition);
      this.camera.position.copy(_cameraPosition);

      // Always look at helicopter center
      _lookTarget.copy(_helicopterPosition);
      _lookTarget.y += 2;
      this.camera.lookAt(_lookTarget);
    } else {
      // Following mode - camera follows behind helicopter based on its rotation
      _helicopterForward.set(-1, 0, 0);
      _helicopterForward.applyQuaternion(_helicopterQuaternion);

      // Camera position: behind helicopter
      _cameraPosition.copy(_helicopterPosition);
      _cameraPosition.addScaledVector(_helicopterForward, -distanceBack);
      _cameraPosition.y += heightAbove;
      this.camera.position.copy(_cameraPosition);

      // Look at helicopter center
      _lookTarget.copy(_helicopterPosition);
      _lookTarget.y += 2;
      this.camera.lookAt(_lookTarget);
    }
  }

  /**
   * Door-gun gunner POV: position the eye out the left door of the airframe (a
   * touch low) and look along the clamped gun aim, so the player sees down the
   * gun line while crewing it. `_helicopterPosition` / `_helicopterQuaternion`
   * already hold the live airframe pose from `updateHelicopterCamera`. The aim
   * is the world-space direction the adapter pushed via `setDoorGunView`. Any
   * pending mouse movement is consumed here so the aim slew never bleeds into
   * the chase view on swap-back.
   */
  private updateDoorGunPovCamera(input: PlayerInput): void {
    if (input.getIsPointerLocked()) {
      input.clearMouseMovement();
    }

    // Door-side eye offset in the airframe's local frame: out the left door
    // (local -X), dropped slightly so the gunner is below the rotor-hub line.
    _doorGunSide.set(-DOOR_GUN_EYE_SIDE_M, -DOOR_GUN_EYE_DOWN_M, 0)
      .applyQuaternion(_helicopterQuaternion);
    _doorGunEye.copy(_helicopterPosition).add(_doorGunSide);

    // Look along the clamped world-space gun aim the adapter solved this frame.
    _doorGunLook.copy(_doorGunEye).addScaledVector(this.doorGunAim, DOOR_GUN_LOOK_RANGE_M);

    this.camera.position.copy(_doorGunEye);
    this.camera.lookAt(_doorGunLook);
  }

  private updateFixedWingCamera(input: PlayerInput, deltaTime: number): void {
    const aircraftId = this.playerState.fixedWingId;
    if (!aircraftId || !this.fixedWingModel) {
      this.resetFixedWingCameraState();
      this.updateFirstPersonCamera(input);
      return;
    }

    const hasPos = this.fixedWingModel.getAircraftPositionTo(aircraftId, _fwPosition);
    const hasQuat = this.fixedWingModel.getAircraftQuaternionTo(aircraftId, _fwQuaternion);
    if (!hasPos || !hasQuat) {
      this.resetFixedWingCameraState();
      this.updateFirstPersonCamera(input);
      return;
    }

    // Per-airframe camera tuning comes from the data-driven camera-fit table
    // (FixedWingArmament), not hardcoded here. The reticle (screen centre) is
    // boresighted to the gun convergence point so it predicts where the guns
    // hit — forward for A-1/F-4, broadside-left for the AC-47.
    const configKey = this.fixedWingModel.getConfigKey(aircraftId);
    const fit = getFixedWingCameraFit(configKey);
    const weapon = getFixedWingWeaponConfig(configKey);
    const distanceBack = fit.chaseDistance;
    const heightAbove = fit.chaseHeight;

    // Convergence point the reticle sits on (chase + broadside both aim here).
    computeFixedWingConvergencePoint(
      weapon,
      _fwPosition,
      _fwQuaternion,
      fit.sightConvergenceRange,
      _fwConvergence,
    );

    // AC-47 broadside gunner view: only when the airframe has a broadside battery
    // AND the gunner view is toggled on. The chase cam owns every other case.
    const broadsideActive = this.fixedWingBroadsideView && fit.broadside !== undefined;

    if (broadsideActive) {
      this.applyBroadsideView(aircraftId, fit, deltaTime);
    } else if (!this.flightMouseControlEnabled && input.getIsPointerLocked()) {
      // Free orbital look mode
      const mouseSensitivity = 0.01;
      const mouseMovement = input.getMouseMovement();
      this.yaw -= mouseMovement.x * mouseSensitivity;
      this.pitch -= mouseMovement.y * mouseSensitivity;
      this.pitch = MathUtils.clamp(this.pitch, -Math.PI * 0.4, Math.PI * 0.4);
      input.clearMouseMovement();

      const radius = distanceBack;
      const x = radius * Math.cos(this.pitch) * Math.sin(this.yaw);
      const y = radius * Math.sin(this.pitch) + heightAbove;
      const z = radius * Math.cos(this.pitch) * Math.cos(this.yaw);

      _cameraPosition.set(x, y, z).add(_fwPosition);
      this.camera.position.copy(_cameraPosition);
      this.hasFixedWingCameraState = false;

      _lookTarget.copy(_fwPosition);
      _lookTarget.y += 2;
      this.camera.lookAt(_lookTarget);
    } else {
      // Following mode - camera behind aircraft with lerp smoothing
      // Airframe forward is (0,0,-1), match it for camera positioning
      _fwForward.set(0, 0, -1).applyQuaternion(_fwQuaternion);
      _cameraPosition.copy(_fwPosition);
      _cameraPosition.addScaledVector(_fwForward, -distanceBack);
      _cameraPosition.y += heightAbove;

      // Look at the forward gun convergence so the boresighted reticle predicts
      // where the guns hit at the reference range.
      _lookTarget.copy(_fwConvergence);

      if (!this.hasFixedWingCameraState || this.activeFixedWingCameraId !== aircraftId) {
        this.camera.position.copy(_cameraPosition);
        this.fixedWingLookTarget.copy(_lookTarget);
        this.hasFixedWingCameraState = true;
        this.activeFixedWingCameraId = aircraftId;
      } else {
        const followAlpha = 1 - Math.exp(-FIXED_WING_CAMERA_FOLLOW_RATE * Math.max(deltaTime, 0));
        const lookAlpha = 1 - Math.exp(-FIXED_WING_CAMERA_LOOK_RATE * Math.max(deltaTime, 0));
        this.camera.position.lerp(_cameraPosition, followAlpha);
        this.fixedWingLookTarget.lerp(_lookTarget, lookAlpha);
      }

      this.camera.lookAt(this.fixedWingLookTarget);
    }

    let targetFOV = this.baseFOV;
    // The broadside gunner view holds the base FOV (no speed widen); only the
    // chase cam widens with speed on airframes that opt in.
    if (!broadsideActive && fit.fovWidenEnabled) {
      const fd = this.fixedWingModel.getFlightData(aircraftId);
      if (fd) {
        const maxSpeed = 200; // F-4 max speed
        const speedFraction = Math.min(fd.airspeed / maxSpeed, 1.0);
        const maxFOVBoost = 15;
        targetFOV = this.baseFOV + speedFraction * maxFOVBoost;
      }
    }
    const fovAlpha = 1 - Math.exp(-FIXED_WING_FOV_RATE * Math.max(deltaTime, 0));
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, fovAlpha);
    this.camera.updateProjectionMatrix();
  }

  /**
   * AC-47 broadside gunner view. The battery fires 90° to the aircraft's left,
   * so the camera sits OPPOSITE the fire axis (off the right side, slightly aft
   * and above) and looks across the airframe at the broadside convergence point
   * — the reticle centres on it, predicting where the orbit fire lands. The same
   * follow-smoothing state is reused so the cut into and out of this view snaps
   * cleanly (the view toggle re-seeds it). Flight CONTROLS are unaffected: this
   * only repositions the camera.
   */
  private applyBroadsideView(aircraftId: string, fit: FixedWingCameraFit, deltaTime: number): void {
    const broadside = fit.broadside;
    if (!broadside) return;

    // Airframe right = +X (opposite the left fire axis); aft = +Z.
    _fwRight.set(1, 0, 0).applyQuaternion(_fwQuaternion);
    _fwForward.set(0, 0, -1).applyQuaternion(_fwQuaternion);

    _cameraPosition.copy(_fwPosition);
    _cameraPosition.addScaledVector(_fwRight, broadside.lateralOffset);
    _cameraPosition.addScaledVector(_fwForward, -broadside.aftOffset);
    _cameraPosition.y += broadside.heightOffset;

    if (!this.hasFixedWingCameraState || this.activeFixedWingCameraId !== aircraftId) {
      this.camera.position.copy(_cameraPosition);
      this.fixedWingLookTarget.copy(_fwConvergence);
      this.hasFixedWingCameraState = true;
      this.activeFixedWingCameraId = aircraftId;
    } else {
      const followAlpha = 1 - Math.exp(-FIXED_WING_CAMERA_FOLLOW_RATE * Math.max(deltaTime, 0));
      const lookAlpha = 1 - Math.exp(-FIXED_WING_CAMERA_LOOK_RATE * Math.max(deltaTime, 0));
      this.camera.position.lerp(_cameraPosition, followAlpha);
      this.fixedWingLookTarget.lerp(_fwConvergence, lookAlpha);
    }

    this.camera.lookAt(this.fixedWingLookTarget);
  }

  private resetFixedWingCameraState(): void {
    this.hasFixedWingCameraState = false;
    this.activeFixedWingCameraId = null;
  }

  /** Save current infantry yaw/pitch before entering helicopter. */
  saveInfantryAngles(): void {
    this.savedInfantryYaw = this.yaw;
    this.savedInfantryPitch = this.pitch;
  }

  /** Restore saved infantry yaw/pitch after exiting helicopter/aircraft. */
  restoreInfantryAngles(): void {
    this.yaw = this.savedInfantryYaw;
    this.pitch = this.savedInfantryPitch;
    // Reset FOV in case it was widened by fixed-wing speed
    this.camera.fov = this.baseFOV;
    this.camera.updateProjectionMatrix();
    // Clear the AC-47 broadside view so it can never leak into infantry or the
    // next aircraft after a dismount.
    this.fixedWingBroadsideView = false;
    // Same guarantee for the helicopter door-gun POV: a mid-gunner dismount must
    // not leave the camera stuck at the door-side viewpoint.
    this.doorGunView = false;
  }

  setInfantryViewAngles(yaw: number, pitch = 0): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, -this.maxPitch, this.maxPitch);
    if (this.playerState.isInHelicopter || this.playerState.isInFixedWing) {
      return;
    }
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.position.copy(this.playerState.position);
  }

  // Apply recoil to camera
  applyRecoil(pitchDeltaRad: number, yawDeltaRad: number): void {
    this.pitch = MathUtils.clamp(this.pitch + pitchDeltaRad, -this.maxPitch, this.maxPitch);
    this.yaw += yawDeltaRad;
  }

  // Reset camera position for respawn
  resetCameraPosition(position: THREE.Vector3): void {
    this.camera.position.copy(position);
  }
}
