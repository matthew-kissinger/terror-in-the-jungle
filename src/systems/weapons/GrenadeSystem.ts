import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ProgrammaticExplosivesFactory } from './ProgrammaticExplosivesFactory';
import { InventoryManager } from '../player/InventoryManager';
import { AudioManager } from '../audio/AudioManager';

interface Grenade {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  mesh: THREE.Mesh;
  fuseTime: number;
  isActive: boolean;
}

export class GrenadeSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private chunkManager?: ImprovedChunkManager;
  private combatantSystem?: CombatantSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private explosionEffectsPool?: ExplosionEffectsPool;
  private inventoryManager?: InventoryManager;
  private audioManager?: AudioManager;
  private playerController?: any;

  private grenades: Grenade[] = [];
  private nextGrenadeId = 0;

  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.OrthographicCamera;
  private grenadeInHand?: THREE.Group;

  private readonly GRAVITY = -52; // Snappier, more realistic arcs
  private readonly FUSE_TIME = 3.5; // Fuse time for cooking mechanic
  private readonly DAMAGE_RADIUS = 15;
  private readonly MAX_DAMAGE = 150;

  // Surface-specific friction coefficients
  private readonly FRICTION_MUD = 0.7; // High friction for soft terrain
  private readonly FRICTION_ROCK = 0.3; // Low friction for hard surfaces (more bounce)
  private readonly FRICTION_WATER = 1.0; // Immediate stop in water

  private readonly BOUNCE_DAMPING = 0.4; // Tighter bounce control
  private readonly AIR_RESISTANCE = 0.995; // Reduced air resistance for snappier throws
  private readonly MIN_THROW_FORCE = 18;
  private readonly MAX_THROW_FORCE = 50;

  private arcVisualization?: THREE.Line;
  private landingIndicator?: THREE.Mesh;
  private isAiming = false;
  private throwPower = 1.0;
  private idleTime = 0;
  private aimStartTime = 0;
  private powerBuildupTime = 0;

  // Cooking mechanic
  private isCooking = false;
  private cookingTime = 0;
  private lastBeepTime = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;

    this.weaponScene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    this.weaponCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.weaponCamera.position.z = 1;

    this.createArcVisualization();
    this.createGrenadeView();
  }

  async init(): Promise<void> {
    console.log('💣 Initializing Grenade System...');
  }

  update(deltaTime: number): void {
    this.idleTime += deltaTime;
    this.updateHandAnimation(deltaTime);

    // Update throw power while aiming (builds up over time)
    if (this.isAiming) {
      this.powerBuildupTime += deltaTime;
      // Power builds up over 2 seconds to max
      this.throwPower = Math.min(0.3 + (this.powerBuildupTime / 2.0) * 0.7, 1.0);
      this.updateArc();
      
      // Pulse landing indicator for visibility
      if (this.landingIndicator && this.landingIndicator.visible) {
        const pulse = 0.6 + Math.sin(this.idleTime * 4) * 0.2; // Pulse between 0.4 and 0.8
        if (this.landingIndicator.material instanceof THREE.MeshBasicMaterial) {
          this.landingIndicator.material.opacity = pulse;
        }
      }
    }

    // Update cooking timer
    if (this.isCooking) {
      this.cookingTime += deltaTime;

      // Audio beeps at critical times
      const timeLeft = this.FUSE_TIME - this.cookingTime;
      if (timeLeft <= 2.0 && this.cookingTime - this.lastBeepTime >= 1.0) {
        this.playBeep();
        this.lastBeepTime = this.cookingTime;
      } else if (timeLeft <= 1.0 && this.cookingTime - this.lastBeepTime >= 0.5) {
        this.playBeep();
        this.lastBeepTime = this.cookingTime;
      }

      // Explode in hand if cooked too long
      if (this.cookingTime >= this.FUSE_TIME) {
        this.explodeInHand();
      }
    }

    // Update explosion effects
    if (this.explosionEffectsPool) {
      this.explosionEffectsPool.update(deltaTime);
    }

    // Update active grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const grenade = this.grenades[i];

      if (!grenade.isActive) continue;

      grenade.fuseTime -= deltaTime;

      if (grenade.fuseTime <= 0) {
        this.explodeGrenade(grenade);
        this.removeGrenade(i);
        continue;
      }

      // Apply gravity
      grenade.velocity.y += this.GRAVITY * deltaTime;

      // Apply air resistance to all components
      grenade.velocity.multiplyScalar(this.AIR_RESISTANCE);

      const nextPosition = grenade.position.clone().add(
        grenade.velocity.clone().multiplyScalar(deltaTime)
      );

      const groundHeight = this.getGroundHeight(nextPosition.x, nextPosition.z) + 0.3;

      if (nextPosition.y <= groundHeight) {
        nextPosition.y = groundHeight;

        // Determine surface type based on height (simple heuristic)
        // Water level is around 0-1m, rocks might be on slopes
        const surfaceFriction = groundHeight < 1.0 ? this.FRICTION_WATER : this.FRICTION_MUD;

        // Only bounce if falling fast enough
        if (Math.abs(grenade.velocity.y) > 2.0) {
          grenade.velocity.y = -grenade.velocity.y * this.BOUNCE_DAMPING;
          // Reduce horizontal velocity on bounce
          grenade.velocity.x *= (1.0 - surfaceFriction * 0.3);
          grenade.velocity.z *= (1.0 - surfaceFriction * 0.3);
          // Reduce rotation on bounce
          grenade.rotationVelocity.multiplyScalar(0.8);
        } else {
          // Stop bouncing, just roll
          grenade.velocity.y = 0;
          grenade.velocity.x *= (1.0 - surfaceFriction);
          grenade.velocity.z *= (1.0 - surfaceFriction);
          // Slow rotation when rolling
          grenade.rotationVelocity.multiplyScalar(0.9);
        }
      }

      grenade.position.copy(nextPosition);

      grenade.rotation.add(grenade.rotationVelocity.clone().multiplyScalar(deltaTime));

      grenade.mesh.position.copy(grenade.position);
      grenade.mesh.rotation.set(grenade.rotation.x, grenade.rotation.y, grenade.rotation.z);
    }
  }

  dispose(): void {
    this.grenades.forEach(grenade => {
      if (grenade.mesh) {
        this.scene.remove(grenade.mesh);
        grenade.mesh.geometry.dispose();
        if (grenade.mesh.material instanceof THREE.Material) {
          grenade.mesh.material.dispose();
        }
      }
    });
    this.grenades = [];

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

  startAiming(): void {
    // Check if we have grenades first
    if (this.inventoryManager && !this.inventoryManager.canUseGrenade()) {
      console.log('⚠️ No grenades remaining!');
      return;
    }

    this.isAiming = true;
    this.aimStartTime = Date.now();
    this.throwPower = 0.3; // Start with minimum power
    this.powerBuildupTime = 0;

    if (this.arcVisualization) {
      this.arcVisualization.visible = true;
    }

    if (this.landingIndicator) {
      this.landingIndicator.visible = true;
    }
  }

  startCooking(): void {
    if (!this.isAiming || this.isCooking) return;

    console.log('💣 Started cooking grenade!');
    this.isCooking = true;
    this.cookingTime = 0;
    this.lastBeepTime = 0;
  }

  private playBeep(): void {
    // Simple beep using Web Audio API
    if (this.audioManager) {
      // Use existing audio context from AudioManager
      const audioContext = this.audioManager.getListener().context;
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

  private explodeInHand(): void {
    console.log('💥 Grenade exploded in hand!');

    // Apply damage to player (suicide)
    const explosionPos = this.camera.position.clone();

    // Trigger explosion effect at player position
    if (this.explosionEffectsPool) {
      this.explosionEffectsPool.spawn(explosionPos);
    }

    if (this.audioManager) {
      this.audioManager.playExplosionAt(explosionPos);
    }

    // Apply massive screen shake
    if (this.playerController) {
      this.playerController.applyExplosionShake(explosionPos, 1.0);
    }

    // Damage player (simulate suicide) - this would need PlayerHealthSystem
    // For now, just log it
    console.log('💀 Player killed by own grenade!');

    // Reset cooking state
    this.isCooking = false;
    this.cookingTime = 0;
    this.cancelThrow();
  }

  adjustPower(delta: number): void {
    if (!this.isAiming) return;

    this.throwPower = THREE.MathUtils.clamp(this.throwPower + delta, 0.3, 2.0);
  }

  updateArc(): number {
    if (!this.isAiming || !this.arcVisualization) return 0;

    const startPos = this.camera.position.clone();
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    // Variable throw force based on power buildup
    const throwForce = this.MIN_THROW_FORCE + (this.MAX_THROW_FORCE - this.MIN_THROW_FORCE) * this.throwPower;

    // Angle the throw upward for a proper arc (like a real grenade throw)
    // Use a flatter angle for more forward carry, less affected by looking angle
    const baseThrowAngle = 0.25 + (0.15 * this.throwPower); // 0.25 to 0.4 radians (14 to 23 degrees)

    // Maintain more forward momentum regardless of vertical look angle
    const forwardDir = direction.clone();
    forwardDir.y = 0; // Remove vertical component
    forwardDir.normalize();

    // Combine forward direction with upward angle
    const finalDirection = new THREE.Vector3();
    finalDirection.x = forwardDir.x * Math.cos(baseThrowAngle);
    finalDirection.z = forwardDir.z * Math.cos(baseThrowAngle);
    finalDirection.y = Math.sin(baseThrowAngle);

    const throwVelocity = finalDirection.multiplyScalar(throwForce);

    // Add moderate upward boost based on look angle (but not too much)
    const lookUpBoost = Math.max(0, direction.y * 3); // Only boost if looking up
    throwVelocity.y += lookUpBoost * this.throwPower;

    const points: THREE.Vector3[] = [];
    const steps = 30;
    const timeStep = 0.1;

    let pos = startPos.clone();
    let vel = throwVelocity.clone();
    let landingPos = pos.clone();

    for (let i = 0; i < steps; i++) {
      points.push(pos.clone());

      vel.y += this.GRAVITY * timeStep;
      pos.add(vel.clone().multiplyScalar(timeStep));

      const groundHeight = this.getGroundHeight(pos.x, pos.z);
      if (pos.y <= groundHeight) {
        pos.y = groundHeight;
        landingPos = pos.clone();
        break;
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.arcVisualization.geometry.dispose();
    this.arcVisualization.geometry = geometry;
    this.arcVisualization.computeLineDistances(); // Required for dashed lines

    // Update landing indicator position
    if (this.landingIndicator) {
      this.landingIndicator.position.copy(landingPos);
      this.landingIndicator.position.y += 0.1; // Slightly above ground to prevent z-fighting
    }

    // Calculate distance from start to landing position
    const distance = startPos.distanceTo(landingPos);
    return distance;
  }

  throwGrenade(): boolean {
    if (!this.isAiming) return false;

    // Check inventory and use grenade
    if (this.inventoryManager) {
      if (!this.inventoryManager.useGrenade()) {
        console.log('⚠️ Failed to use grenade - no inventory!');
        this.cancelThrow();
        return false;
      }
    }

    this.isAiming = false;
    this.powerBuildupTime = 0;

    // Store cooking time for spawning grenade with reduced fuse
    const remainingFuseTime = this.isCooking ? Math.max(0.1, this.FUSE_TIME - this.cookingTime) : this.FUSE_TIME;
    this.isCooking = false;
    this.cookingTime = 0;

    if (this.arcVisualization) {
      this.arcVisualization.visible = false;
    }

    if (this.landingIndicator) {
      this.landingIndicator.visible = false;
    }

    const startPos = this.camera.position.clone();
    // Offset slightly forward and down from camera
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    startPos.add(forward.clone().multiplyScalar(0.5));
    startPos.y -= 0.3;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    // Variable throw force based on power buildup
    const throwForce = this.MIN_THROW_FORCE + (this.MAX_THROW_FORCE - this.MIN_THROW_FORCE) * this.throwPower;

    // Angle the throw upward for a proper arc (like a real grenade throw)
    // Use a flatter angle for more forward carry, less affected by looking angle
    const baseThrowAngle = 0.25 + (0.15 * this.throwPower); // 0.25 to 0.4 radians (14 to 23 degrees)

    // Maintain more forward momentum regardless of vertical look angle
    const forwardDir = direction.clone();
    forwardDir.y = 0; // Remove vertical component
    forwardDir.normalize();

    // Combine forward direction with upward angle
    const finalDirection = new THREE.Vector3();
    finalDirection.x = forwardDir.x * Math.cos(baseThrowAngle);
    finalDirection.z = forwardDir.z * Math.cos(baseThrowAngle);
    finalDirection.y = Math.sin(baseThrowAngle);

    const throwVelocity = finalDirection.multiplyScalar(throwForce);

    // Add moderate upward boost based on look angle (but not too much)
    const lookUpBoost = Math.max(0, direction.y * 3); // Only boost if looking up
    throwVelocity.y += lookUpBoost * this.throwPower;

    this.spawnGrenade(startPos, throwVelocity, remainingFuseTime);

    const powerPercent = Math.round(this.throwPower * 100);
    const cookedTime = remainingFuseTime < this.FUSE_TIME ? ` (cooked ${(this.FUSE_TIME - remainingFuseTime).toFixed(1)}s)` : '';
    console.log(`💣 Grenade thrown at ${powerPercent}% power${cookedTime}`);
    return true;
  }

  cancelThrow(): void {
    this.isAiming = false;
    this.powerBuildupTime = 0;
    this.throwPower = 0.3;

    if (this.arcVisualization) {
      this.arcVisualization.visible = false;
    }

    if (this.landingIndicator) {
      this.landingIndicator.visible = false;
    }
  }

  private spawnGrenade(position: THREE.Vector3, velocity: THREE.Vector3, fuseTime: number = this.FUSE_TIME): void {
    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a4a2a,
      metalness: 0.6,
      roughness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const grenade: Grenade = {
      id: `grenade_${this.nextGrenadeId++}`,
      position: position.clone(),
      velocity: velocity.clone(),
      rotation: new THREE.Vector3(0, 0, 0),
      rotationVelocity: new THREE.Vector3(
        Math.random() * 5 - 2.5,
        Math.random() * 5 - 2.5,
        Math.random() * 5 - 2.5
      ),
      mesh,
      fuseTime: fuseTime, // Use provided fuse time (may be reduced from cooking)
      isActive: true
    };

    this.grenades.push(grenade);
  }

  private explodeGrenade(grenade: Grenade): void {
    console.log(`💥 Grenade exploded at (${grenade.position.x.toFixed(1)}, ${grenade.position.y.toFixed(1)}, ${grenade.position.z.toFixed(1)})`);

    // Main explosion effect - big flash, smoke, fire, shockwave
    if (this.explosionEffectsPool) {
      this.explosionEffectsPool.spawn(grenade.position);
    }

    // Additional debris/impact effects for more detail
    if (this.impactEffectsPool) {
      for (let i = 0; i < 15; i++) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 3
        );
        const effectPos = grenade.position.clone().add(offset);
        this.impactEffectsPool.spawn(effectPos, new THREE.Vector3(0, 1, 0));
      }
    }

    if (this.audioManager) {
      this.audioManager.playExplosionAt(grenade.position);
    }

    if (this.combatantSystem) {
      this.combatantSystem.applyExplosionDamage(
        grenade.position,
        this.DAMAGE_RADIUS,
        this.MAX_DAMAGE
      );
    }

    // Apply enhanced camera shake from explosion
    if (this.playerController) {
      this.playerController.applyExplosionShake(grenade.position, this.DAMAGE_RADIUS);
    }
  }

  private removeGrenade(index: number): void {
    const grenade = this.grenades[index];

    if (grenade.mesh) {
      this.scene.remove(grenade.mesh);
      grenade.mesh.geometry.dispose();
      if (grenade.mesh.material instanceof THREE.Material) {
        grenade.mesh.material.dispose();
      }
    }

    this.grenades.splice(index, 1);
  }

  private getGroundHeight(x: number, z: number): number {
    if (this.chunkManager) {
      return this.chunkManager.getEffectiveHeightAt(x, z);
    }
    return 0;
  }

  private createArcVisualization(): void {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.7,
      depthTest: false, // Always visible through objects
      dashSize: 0.5,
      gapSize: 0.3
    });

    this.arcVisualization = new THREE.Line(geometry, material);
    this.arcVisualization.visible = false;
    this.scene.add(this.arcVisualization);

    // Create landing indicator - a ring showing impact point and radius
    // Make it larger and more visible with pulsing animation
    const ringGeometry = new THREE.RingGeometry(this.DAMAGE_RADIUS - 1.0, this.DAMAGE_RADIUS + 1.0, 32);
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

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setImpactEffectsPool(pool: ImpactEffectsPool): void {
    this.impactEffectsPool = pool;
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }

  setHUDSystem(hudSystem: any): void {
    // Store HUD system reference for power meter updates
    // Type is 'any' to avoid circular dependency with HUDSystem
  }

  setPlayerController(playerController: any): void {
    this.playerController = playerController;
  }

  isCurrentlyAiming(): boolean {
    return this.isAiming;
  }

  getAimingState(): { isAiming: boolean; power: number; estimatedDistance: number; cookingTime: number } {
    // Calculate current estimated distance if aiming
    const estimatedDistance = this.isAiming ? this.updateArc() : 0;

    return {
      isAiming: this.isAiming,
      power: this.throwPower,
      estimatedDistance,
      cookingTime: this.cookingTime
    };
  }

  private createGrenadeView(): void {
    this.grenadeInHand = ProgrammaticExplosivesFactory.createGrenade();
    this.grenadeInHand.position.set(0.4, -0.6, -0.5);
    this.grenadeInHand.rotation.set(0.2, 0.3, 0.1);
    this.grenadeInHand.scale.setScalar(0.4);
    this.grenadeInHand.visible = false;
    this.weaponScene.add(this.grenadeInHand);
  }

  showGrenadeInHand(show: boolean): void {
    if (this.grenadeInHand) {
      this.grenadeInHand.visible = show;
    }
  }

  updateHandAnimation(deltaTime: number): void {
    if (!this.grenadeInHand || !this.grenadeInHand.visible) return;

    if (this.isAiming) {
      // Pull back animation based on power
      const pullback = -0.1 * this.throwPower;
      this.grenadeInHand.position.y = -0.5 + pullback + Math.sin(this.idleTime * 3) * 0.01;
      this.grenadeInHand.position.z = -0.5 + pullback;
      this.grenadeInHand.rotation.x = 0.1 - this.throwPower * 0.3;
    } else {
      this.grenadeInHand.position.y = -0.6 + Math.sin(this.idleTime * 2) * 0.03;
      this.grenadeInHand.rotation.x = 0.2 + Math.sin(this.idleTime * 2) * 0.05;
    }
  }

  getGrenadeOverlayScene(): THREE.Scene {
    return this.weaponScene;
  }

  getGrenadeOverlayCamera(): THREE.Camera {
    return this.weaponCamera;
  }
}