import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { DeathCamOverlay, type KillerInfo } from './DeathCamOverlay';

export class DeathCamSystem implements GameSystem {
  private static readonly UP_AXIS = new THREE.Vector3(0, 1, 0);
  private camera: THREE.PerspectiveCamera;
  private isActive = false;
  private deathPosition?: THREE.Vector3;
  private killerInfo?: KillerInfo;

  private readonly _scratchOffset = new THREE.Vector3();
  private readonly _scratchDir = new THREE.Vector3();
  private readonly _scratchLookTarget = new THREE.Vector3();
  private readonly _scratchCurrentLookAt = new THREE.Vector3();

  // Camera animation state
  private cameraPhase: 'freeze' | 'transition' | 'orbit' | 'done' = 'freeze';
  private phaseTimer = 0;
  private readonly FREEZE_DURATION = 0.5; // seconds
  private readonly TRANSITION_DURATION = 1.0; // seconds
  private readonly ORBIT_DURATION = 3.0; // seconds

  // Camera positions
  private originalPosition?: THREE.Vector3;
  private originalQuaternion?: THREE.Quaternion;
  private targetPosition?: THREE.Vector3;
  private targetLookAt?: THREE.Vector3;

  // Orbit parameters
  private orbitAngle = 0;
  private readonly ORBIT_RADIUS = 8;
  private readonly ORBIT_HEIGHT = 4;
  private readonly ORBIT_SPEED = 0.3; // radians per second

  private readonly overlay: DeathCamOverlay;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.overlay = new DeathCamOverlay();
  }

  async init(): Promise<void> {
    Logger.info('player', '💀 DeathCamSystem initialized');
    this.overlay.createOverlay();
  }

  update(deltaTime: number): void {
    if (!this.isActive || !this.deathPosition) return;

    this.phaseTimer += deltaTime;

    switch (this.cameraPhase) {
      case 'freeze':
        // Just hold the current camera position
        if (this.phaseTimer >= this.FREEZE_DURATION) {
          this.startTransition();
        }
        break;

      case 'transition':
        this.updateTransition();
        if (this.phaseTimer >= this.FREEZE_DURATION + this.TRANSITION_DURATION) {
          this.startOrbit();
        }
        break;

      case 'orbit':
        this.updateOrbit(deltaTime);
        if (this.phaseTimer >= this.FREEZE_DURATION + this.TRANSITION_DURATION + this.ORBIT_DURATION) {
          this.cameraPhase = 'done';
        }
        break;

      case 'done':
        // Hold final position until respawn
        break;
    }
  }

  dispose(): void {
    this.hideOverlay();
    this.overlay.dispose();
  }

  // Start death cam sequence
  startDeathCam(deathPosition: THREE.Vector3, killerInfo?: KillerInfo): void {
    Logger.info('player', '💀 Starting death cam sequence');

    this.isActive = true;
    this.deathPosition = deathPosition.clone();
    this.killerInfo = killerInfo;
    this.phaseTimer = 0;
    this.cameraPhase = 'freeze';

    // Store original camera state
    this.originalPosition = this.camera.position.clone();
    this.originalQuaternion = this.camera.quaternion.clone();

    // Show overlay with killer info
    this.showOverlay();
  }

  // End death cam sequence (when respawning)
  endDeathCam(): void {
    this.isActive = false;
    this.hideOverlay();
    this.deathPosition = undefined;
    this.killerInfo = undefined;
    this.cameraPhase = 'freeze';
    this.phaseTimer = 0;
  }

  isDeathCamActive(): boolean {
    return this.isActive;
  }

  private startTransition(): void {
    if (!this.deathPosition) return;

    this.cameraPhase = 'transition';

    // Calculate third-person death cam position
    // Position camera behind and above the death location
    const offset = this._scratchOffset.set(0, this.ORBIT_HEIGHT, this.ORBIT_RADIUS);

    // If we have killer info, position camera to look toward killer
    if (this.killerInfo) {
      const directionToKiller = this._scratchDir
        .subVectors(this.killerInfo.position, this.deathPosition)
        .normalize();

      // Position camera opposite of killer direction (behind death position, looking toward killer)
      const angle = Math.atan2(directionToKiller.x, directionToKiller.z);
      offset.applyAxisAngle(DeathCamSystem.UP_AXIS, angle + Math.PI);
    }

    this.targetPosition = this.deathPosition.clone().add(offset);
    this.targetLookAt = this.deathPosition.clone();
    this.targetLookAt.y += 1; // Look at chest height
  }

  private updateTransition(): void {
    if (!this.originalPosition || !this.targetPosition || !this.targetLookAt) return;

    // Smooth lerp from original to target position
    const transitionProgress = Math.min(
      (this.phaseTimer - this.FREEZE_DURATION) / this.TRANSITION_DURATION,
      1.0
    );

    // Ease-out cubic for smooth deceleration
    const t = 1 - Math.pow(1 - transitionProgress, 3);

    this.camera.position.lerpVectors(this.originalPosition, this.targetPosition, t);

    // Smoothly look at death position
    const currentLookAt = this._scratchCurrentLookAt;
    this.camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(this.originalPosition);

    const lerpedLookAt = this._scratchLookTarget.lerpVectors(currentLookAt, this.targetLookAt, t);
    this.camera.lookAt(lerpedLookAt);
  }

  private startOrbit(): void {
    this.cameraPhase = 'orbit';

    // Initialize orbit angle based on current camera position
    if (this.deathPosition) {
      const offset = this._scratchOffset.subVectors(this.camera.position, this.deathPosition);
      this.orbitAngle = Math.atan2(offset.x, offset.z);
    }
  }

  private updateOrbit(deltaTime: number): void {
    if (!this.deathPosition) return;

    // Slowly orbit around the death position
    this.orbitAngle += this.ORBIT_SPEED * deltaTime;

    const x = Math.sin(this.orbitAngle) * this.ORBIT_RADIUS;
    const z = Math.cos(this.orbitAngle) * this.ORBIT_RADIUS;

    this.camera.position.set(
      this.deathPosition.x + x,
      this.deathPosition.y + this.ORBIT_HEIGHT,
      this.deathPosition.z + z
    );

    // Look at death position (with slight look-toward-killer if available)
    const lookTarget = this._scratchLookTarget.copy(this.deathPosition);
    lookTarget.y += 1;

    if (this.killerInfo) {
      // Blend look direction slightly toward killer
      const toKiller = this._scratchDir
        .subVectors(this.killerInfo.position, this.deathPosition)
        .normalize()
        .multiplyScalar(2);
      lookTarget.add(toKiller);
    }

    this.camera.lookAt(lookTarget);
  }

  private showOverlay(): void {
    this.overlay.showOverlay(this.killerInfo);
  }

  private hideOverlay(): void {
    this.overlay.hideOverlay();
  }

  // Update respawn countdown (called externally)
  updateRespawnTimer(secondsRemaining: number): void {
    if (!this.isActive) return;
    this.overlay.updateRespawnTimer(secondsRemaining);
  }
}
