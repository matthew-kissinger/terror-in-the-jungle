import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Combatant } from '../combat/types';

export interface KillerInfo {
  name: string;
  position: THREE.Vector3;
  weaponName: string;
  faction: string;
  distance: number;
  wasHeadshot?: boolean;
}

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

  // UI overlay
  private overlayElement?: HTMLDivElement;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  async init(): Promise<void> {
    console.log('💀 DeathCamSystem initialized');
    this.createOverlay();
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
    if (this.overlayElement?.parentElement) {
      this.overlayElement.parentElement.removeChild(this.overlayElement);
      this.overlayElement = undefined;
    }
  }

  // Start death cam sequence
  startDeathCam(deathPosition: THREE.Vector3, killerInfo?: KillerInfo): void {
    console.log('💀 Starting death cam sequence');

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

  private createOverlay(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'death-cam-overlay';
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9000;
      display: none;
      font-family: 'Courier New', monospace;
    `;

    // Vignette effect
    const vignette = document.createElement('div');
    vignette.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, transparent 30%, rgba(0,0,0,0.7) 100%);
      pointer-events: none;
    `;
    this.overlayElement.appendChild(vignette);

    // Death info panel (top center)
    const infoPanel = document.createElement('div');
    infoPanel.id = 'death-info-panel';
    infoPanel.style.cssText = `
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid #ff0000;
      border-radius: 4px;
      padding: 20px 40px;
      text-align: center;
      animation: fadeSlideIn 0.5s ease-out;
    `;

    // Killer name
    const killerText = document.createElement('div');
    killerText.id = 'killer-name';
    killerText.style.cssText = `
      color: #ff0000;
      font-size: 32px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 10px;
      text-shadow: 0 0 10px rgba(255,0,0,0.5);
    `;
    infoPanel.appendChild(killerText);

    // Weapon and distance info
    const detailsText = document.createElement('div');
    detailsText.id = 'kill-details';
    detailsText.style.cssText = `
      color: #ffffff;
      font-size: 16px;
      margin-top: 10px;
    `;
    infoPanel.appendChild(detailsText);

    // Headshot indicator
    const headshotText = document.createElement('div');
    headshotText.id = 'headshot-indicator';
    headshotText.style.cssText = `
      color: #ffaa00;
      font-size: 18px;
      font-weight: bold;
      margin-top: 10px;
      text-transform: uppercase;
      display: none;
    `;
    headshotText.textContent = '💀 HEADSHOT 💀';
    infoPanel.appendChild(headshotText);

    this.overlayElement.appendChild(infoPanel);

    // Respawn timer (bottom center)
    const timerText = document.createElement('div');
    timerText.id = 'death-respawn-timer';
    timerText.style.cssText = `
      position: absolute;
      bottom: 30%;
      left: 50%;
      transform: translateX(-50%);
      color: #888888;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    this.overlayElement.appendChild(timerText);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      #death-respawn-timer {
        animation: pulse 2s infinite;
      }
    `;
    this.overlayElement.appendChild(style);

    document.body.appendChild(this.overlayElement);
  }

  private showOverlay(): void {
    if (!this.overlayElement) return;

    this.overlayElement.style.display = 'block';

    // Update killer info
    const killerNameEl = document.getElementById('killer-name');
    const killDetailsEl = document.getElementById('kill-details');
    const headshotEl = document.getElementById('headshot-indicator');

    if (this.killerInfo) {
      if (killerNameEl) {
        killerNameEl.textContent = `KILLED BY ${this.killerInfo.name}`;
      }

      if (killDetailsEl) {
        killDetailsEl.innerHTML = `
          <div style="margin-bottom: 5px;">Weapon: ${this.killerInfo.weaponName}</div>
          <div>Distance: ${Math.round(this.killerInfo.distance)}m</div>
        `;
      }

      if (headshotEl && this.killerInfo.wasHeadshot) {
        headshotEl.style.display = 'block';
      }
    } else {
      if (killerNameEl) {
        killerNameEl.textContent = 'K.I.A.';
      }
      if (killDetailsEl) {
        killDetailsEl.textContent = 'Killed in Action';
      }
    }

    // Update respawn timer
    const timerEl = document.getElementById('death-respawn-timer');
    if (timerEl) {
      timerEl.textContent = 'Preparing respawn...';
    }
  }

  private hideOverlay(): void {
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  // Update respawn countdown (called externally)
  updateRespawnTimer(secondsRemaining: number): void {
    if (!this.isActive) return;

    const timerEl = document.getElementById('death-respawn-timer');
    if (timerEl) {
      if (secondsRemaining > 0) {
        timerEl.textContent = `Respawn available in ${Math.ceil(secondsRemaining)}s`;
      } else {
        timerEl.textContent = 'Press to respawn';
      }
    }
  }
}
