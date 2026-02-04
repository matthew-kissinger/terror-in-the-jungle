import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { MathUtils } from '../../utils/Math';
import { PlayerState } from '../../types';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { PlayerInput } from './PlayerInput';

const _helicopterPosition = new THREE.Vector3();
const _helicopterQuaternion = new THREE.Quaternion();
const _cameraPosition = new THREE.Vector3();
const _helicopterForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class PlayerCamera {
  private camera: THREE.PerspectiveCamera;
  private playerState: PlayerState;
  private cameraShakeSystem?: CameraShakeSystem;
  private helicopterModel?: any;

  // Camera settings
  private pitch = 0;
  private yaw = Math.PI; // Face toward negative X
  private maxPitch = Math.PI / 2 - 0.1;

  // Helicopter camera settings
  private helicopterCameraDistance = 25;
  private helicopterCameraHeight = 8;
  private helicopterMouseControlEnabled = true;

  constructor(camera: THREE.PerspectiveCamera, playerState: PlayerState) {
    this.camera = camera;
    this.playerState = playerState;
  }

  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void {
    this.cameraShakeSystem = cameraShakeSystem;
  }

  setHelicopterModel(helicopterModel: any): void {
    this.helicopterModel = helicopterModel;
  }

  setHelicopterMouseControlEnabled(enabled: boolean): void {
    this.helicopterMouseControlEnabled = enabled;
  }

  getHelicopterMouseControlEnabled(): boolean {
    return this.helicopterMouseControlEnabled;
  }

  toggleHelicopterMouseControl(): boolean {
    this.helicopterMouseControlEnabled = !this.helicopterMouseControlEnabled;
    Logger.info('player', ` Mouse control ${this.helicopterMouseControlEnabled ? 'enabled (affects controls)' : 'disabled (free orbital look)'}`);
    return this.helicopterMouseControlEnabled;
  }

  updateCamera(input: PlayerInput): void {
    if (this.playerState.isInHelicopter) {
      this.updateHelicopterCamera(input);
    } else {
      this.updateFirstPersonCamera(input);
    }
  }

  private updateFirstPersonCamera(input: PlayerInput): void {
    // Update camera rotation from mouse movement
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

    if (!this.helicopterMouseControlEnabled && input.getIsPointerLocked()) {
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
