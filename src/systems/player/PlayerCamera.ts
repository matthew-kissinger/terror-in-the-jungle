import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { MathUtils } from '../../utils/Math';
import { PlayerState } from '../../types';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { PlayerInput } from './PlayerInput';
import { IHelicopterModel } from '../../types/SystemInterfaces';
import type { FixedWingModel } from '../vehicle/FixedWingModel';

const _helicopterPosition = new THREE.Vector3();
const _helicopterQuaternion = new THREE.Quaternion();
const _cameraPosition = new THREE.Vector3();
const _helicopterForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _fwPosition = new THREE.Vector3();
const _fwQuaternion = new THREE.Quaternion();
const _fwForward = new THREE.Vector3();

const FIXED_WING_CAMERA_FOLLOW_RATE = 9.5;
const FIXED_WING_CAMERA_LOOK_RATE = 12;
const FIXED_WING_FOV_RATE = 6;

export class PlayerCamera {
  private camera: THREE.PerspectiveCamera;
  private playerState: PlayerState;
  private cameraShakeSystem?: CameraShakeSystem;
  private helicopterModel?: IHelicopterModel;
  private fixedWingModel?: FixedWingModel;

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

  // Saved infantry angles for helicopter enter/exit transitions
  private savedInfantryYaw = Math.PI;
  private savedInfantryPitch = 0;

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
    } else {
      this.resetFixedWingCameraState();
      this.updateFirstPersonCamera(input);
    }
  }

  private updateFirstPersonCamera(input: PlayerInput): void {
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

    // Per-aircraft camera tuning
    const display = this.fixedWingModel.getDisplayInfo(aircraftId);
    const distanceBack = display?.cameraDistance ?? 30;
    const heightAbove = display?.cameraHeight ?? 8;

    if (!this.flightMouseControlEnabled && input.getIsPointerLocked()) {
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

      _lookTarget.copy(_fwPosition);
      _lookTarget.y += 2;

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
    if (display?.fovWidenEnabled) {
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
