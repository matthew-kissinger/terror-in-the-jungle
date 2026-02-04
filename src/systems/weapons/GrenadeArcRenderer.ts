import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { objectPool } from '../../utils/ObjectPoolManager';
import { ProgrammaticExplosivesFactory } from './ProgrammaticExplosivesFactory';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { AudioManager } from '../audio/AudioManager';
import type { IPlayerController } from '../../types/SystemInterfaces';

type GroundHeightFn = (x: number, z: number) => number;

export class GrenadeArcRenderer {
  private scene: THREE.Scene;
  private maxArcPoints: number;
  private damageRadius: number;

  private arcPositions: Float32Array;
  private arcVisualization?: THREE.Line;
  private landingIndicator?: THREE.Mesh;

  constructor(scene: THREE.Scene, maxArcPoints: number, damageRadius: number) {
    this.scene = scene;
    this.maxArcPoints = maxArcPoints;
    this.damageRadius = damageRadius;

    this.arcPositions = new Float32Array(this.maxArcPoints * 3);

    this.createArcVisualization();
  }

  updateArc(
    camera: THREE.Camera,
    throwPower: number,
    gravity: number,
    minThrowForce: number,
    maxThrowForce: number,
    getGroundHeight: GroundHeightFn
  ): number {
    if (!this.arcVisualization) return 0;

    const startPos = objectPool.getVector3().copy(camera.position);
    const direction = objectPool.getVector3();
    camera.getWorldDirection(direction);

    // Variable throw force based on power buildup
    const throwForce = minThrowForce + (maxThrowForce - minThrowForce) * throwPower;

    // Angle the throw upward for a proper arc (like a real grenade throw)
    // Use a flatter angle for more forward carry, less affected by looking angle
    const baseThrowAngle = 0.25 + (0.15 * throwPower); // 0.25 to 0.4 radians (14 to 23 degrees)

    // Maintain more forward momentum regardless of vertical look angle
    const forwardDir = objectPool.getVector3().copy(direction);
    forwardDir.y = 0; // Remove vertical component
    forwardDir.normalize();

    // Combine forward direction with upward angle
    const finalDirection = objectPool.getVector3();
    finalDirection.x = forwardDir.x * Math.cos(baseThrowAngle);
    finalDirection.z = forwardDir.z * Math.cos(baseThrowAngle);
    finalDirection.y = Math.sin(baseThrowAngle);

    const throwVelocity = objectPool.getVector3().copy(finalDirection).multiplyScalar(throwForce);

    // Add moderate upward boost based on look angle (but not too much)
    const lookUpBoost = Math.max(0, direction.y * 3); // Only boost if looking up
    throwVelocity.y += lookUpBoost * throwPower;

    const steps = 30;
    const timeStep = 0.1;

    const pos = objectPool.getVector3().copy(startPos);
    const vel = objectPool.getVector3().copy(throwVelocity);
    const landingPos = objectPool.getVector3().copy(pos);
    const velDelta = objectPool.getVector3();

    let pointCount = 0;
    for (let i = 0; i < steps; i++) {
      // Write to Float32Array
      if (pointCount < this.maxArcPoints) {
        this.arcPositions[pointCount * 3] = pos.x;
        this.arcPositions[pointCount * 3 + 1] = pos.y;
        this.arcPositions[pointCount * 3 + 2] = pos.z;
        pointCount++;
      }

      vel.y += gravity * timeStep;

      velDelta.copy(vel).multiplyScalar(timeStep);
      pos.add(velDelta);

      const groundHeight = getGroundHeight(pos.x, pos.z);
      if (pos.y <= groundHeight) {
        pos.y = groundHeight;
        landingPos.copy(pos);

        // Add final point
        if (pointCount < this.maxArcPoints) {
          this.arcPositions[pointCount * 3] = pos.x;
          this.arcPositions[pointCount * 3 + 1] = pos.y;
          this.arcPositions[pointCount * 3 + 2] = pos.z;
          pointCount++;
        }
        break;
      }
    }

    this.arcVisualization.geometry.attributes.position.needsUpdate = true;
    this.arcVisualization.geometry.setDrawRange(0, pointCount);
    this.arcVisualization.computeLineDistances();

    // Update landing indicator position
    if (this.landingIndicator) {
      this.landingIndicator.position.copy(landingPos);
      this.landingIndicator.position.y += 0.1; // Slightly above ground to prevent z-fighting
    }

    // Calculate distance from start to landing position
    const distance = startPos.distanceTo(landingPos);

    // Release all borrowed vectors
    objectPool.releaseVector3(startPos);
    objectPool.releaseVector3(direction);
    objectPool.releaseVector3(forwardDir);
    objectPool.releaseVector3(finalDirection);
    objectPool.releaseVector3(throwVelocity);
    objectPool.releaseVector3(pos);
    objectPool.releaseVector3(vel);
    objectPool.releaseVector3(landingPos);
    objectPool.releaseVector3(velDelta);

    return distance;
  }

  showArc(show: boolean): void {
    if (this.arcVisualization) {
      this.arcVisualization.visible = show;
    }

    if (this.landingIndicator) {
      this.landingIndicator.visible = show;
    }
  }

  getLandingIndicator(): THREE.Mesh | undefined {
    return this.landingIndicator;
  }

  dispose(): void {
    if (this.arcVisualization) {
      this.scene.remove(this.arcVisualization);
      this.arcVisualization.geometry.dispose();
      if (this.arcVisualization.material instanceof THREE.Material) {
        this.arcVisualization.material.dispose();
      }
    }

    if (this.landingIndicator) {
      this.scene.remove(this.landingIndicator);
      this.landingIndicator.geometry.dispose();
      if (this.landingIndicator.material instanceof THREE.Material) {
        this.landingIndicator.material.dispose();
      }
    }
  }

  private createArcVisualization(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3));

    const material = new THREE.LineDashedMaterial({
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      dashSize: 0.5,
      gapSize: 0.3
    });

    this.arcVisualization = new THREE.Line(geometry, material);
    this.arcVisualization.visible = false;
    this.arcVisualization.frustumCulled = false; // Ensure it's always rendered if visible
    this.scene.add(this.arcVisualization);

    // Create landing indicator - a ring showing impact point and radius
    // Make it larger and more visible with pulsing animation
    const ringGeometry = new THREE.RingGeometry(this.damageRadius - 1.0, this.damageRadius + 1.0, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Bright green for better visibility
      transparent: true,
      opacity: 0.7, // More opaque
      side: THREE.DoubleSide,
      depthTest: false
    });

    this.landingIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
    this.landingIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
    this.landingIndicator.visible = false;
    this.scene.add(this.landingIndicator);
  }
}

export class GrenadeHandView {
  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.OrthographicCamera;
  private grenadeInHand?: THREE.Group;

  constructor() {
    this.weaponScene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    this.weaponCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.weaponCamera.position.z = 1;

    this.createGrenadeView();
  }

  dispose(): void {
    if (this.grenadeInHand) {
      this.weaponScene.remove(this.grenadeInHand);
      this.grenadeInHand.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
  }

  showGrenadeInHand(show: boolean): void {
    if (this.grenadeInHand) {
      this.grenadeInHand.visible = show;
    }
  }

  updateHandAnimation(isAiming: boolean, throwPower: number, idleTime: number): void {
    if (!this.grenadeInHand || !this.grenadeInHand.visible) return;

    if (isAiming) {
      // Pull back animation based on power
      const pullback = -0.1 * throwPower;
      this.grenadeInHand.position.y = -0.5 + pullback + Math.sin(idleTime * 3) * 0.01;
      this.grenadeInHand.position.z = -0.5 + pullback;
      this.grenadeInHand.rotation.x = 0.1 - throwPower * 0.3;
    } else {
      this.grenadeInHand.position.y = -0.6 + Math.sin(idleTime * 2) * 0.03;
      this.grenadeInHand.rotation.x = 0.2 + Math.sin(idleTime * 2) * 0.05;
    }
  }

  getOverlayScene(): THREE.Scene {
    return this.weaponScene;
  }

  getOverlayCamera(): THREE.Camera {
    return this.weaponCamera;
  }

  private createGrenadeView(): void {
    this.grenadeInHand = ProgrammaticExplosivesFactory.createGrenade();
    this.grenadeInHand.position.set(0.4, -0.6, -0.5);
    this.grenadeInHand.rotation.set(0.2, 0.3, 0.1);
    this.grenadeInHand.scale.setScalar(0.4);
    this.grenadeInHand.visible = false;
    this.weaponScene.add(this.grenadeInHand);
  }
}

export class GrenadeCooking {
  private fuseTime: number;
  private isCooking = false;
  private cookingTime = 0;
  private lastBeepTime = 0;

  constructor(fuseTime: number) {
    this.fuseTime = fuseTime;
  }

  startCooking(): void {
    if (this.isCooking) return;

    Logger.info('weapons', 'Started cooking grenade!');
    this.isCooking = true;
    this.cookingTime = 0;
    this.lastBeepTime = 0;
  }

  stopCooking(): void {
    this.isCooking = false;
    this.cookingTime = 0;
    this.lastBeepTime = 0;
  }

  isCurrentlyCooking(): boolean {
    return this.isCooking;
  }

  getCookingTime(): number {
    return this.cookingTime;
  }

  getRemainingFuseTime(): number {
    return this.isCooking ? Math.max(0.1, this.fuseTime - this.cookingTime) : this.fuseTime;
  }

  update(
    deltaTime: number,
    camera: THREE.Camera,
    explosionEffectsPool?: ExplosionEffectsPool,
    audioManager?: AudioManager,
    playerController?: IPlayerController
  ): boolean {
    if (!this.isCooking) return false;

    this.cookingTime += deltaTime;

    const timeLeft = this.fuseTime - this.cookingTime;
    if (timeLeft <= 2.0 && this.cookingTime - this.lastBeepTime >= 1.0) {
      this.playBeep(audioManager);
      this.lastBeepTime = this.cookingTime;
    } else if (timeLeft <= 1.0 && this.cookingTime - this.lastBeepTime >= 0.5) {
      this.playBeep(audioManager);
      this.lastBeepTime = this.cookingTime;
    }

    if (this.cookingTime >= this.fuseTime) {
      this.explodeInHand(camera, explosionEffectsPool, audioManager, playerController);
      this.stopCooking();
      return true;
    }

    return false;
  }

  private playBeep(audioManager?: AudioManager): void {
    // Simple beep using Web Audio API
    if (audioManager) {
      // Use existing audio context from AudioManager
      const audioContext = audioManager.getListener().context;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // High-pitched beep
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    }
  }

  private explodeInHand(
    camera: THREE.Camera,
    explosionEffectsPool?: ExplosionEffectsPool,
    audioManager?: AudioManager,
    playerController?: IPlayerController
  ): void {
    Logger.info('weapons', 'Grenade exploded in hand!');

    // Apply damage to player (suicide)
    const explosionPos = camera.position.clone();

    // Trigger explosion effect at player position
    if (explosionEffectsPool) {
      explosionEffectsPool.spawn(explosionPos);
    }

    if (audioManager) {
      audioManager.playExplosionAt(explosionPos);
    }

    // Apply massive screen shake
    if (playerController) {
      playerController.applyExplosionShake(explosionPos, 1.0);
    }

    // Damage player (simulate suicide) - this would need PlayerHealthSystem
    // For now, just log it
    Logger.info('weapons', ' Player killed by own grenade!');
  }
}
