import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { InventoryManager } from '../player/InventoryManager';
import { AudioManager } from '../audio/AudioManager';
import { PlayerStatsTracker } from '../player/PlayerStatsTracker';
import { Grenade, GrenadePhysics, GrenadeSpawner } from './GrenadePhysics';
import { GrenadeArcRenderer, GrenadeHandView, GrenadeCooking } from './GrenadeArcRenderer';

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
  private statsTracker?: PlayerStatsTracker;

  private grenades: Grenade[] = [];
  private nextGrenadeId = 0;
  private spawner: GrenadeSpawner;

  private handView: GrenadeHandView;

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
  private readonly MAX_ARC_POINTS = 50;

  private physics: GrenadePhysics;
  private arcRenderer: GrenadeArcRenderer;
  private isAiming = false;
  private throwPower = 1.0;
  private idleTime = 0;
  private aimStartTime = 0;
  private powerBuildupTime = 0;
  private cooking: GrenadeCooking;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;

    this.physics = new GrenadePhysics(
      this.GRAVITY,
      this.AIR_RESISTANCE,
      this.BOUNCE_DAMPING,
      this.FRICTION_MUD,
      this.FRICTION_WATER
    );
    this.arcRenderer = new GrenadeArcRenderer(this.scene, this.MAX_ARC_POINTS, this.DAMAGE_RADIUS);
    this.handView = new GrenadeHandView();
    this.cooking = new GrenadeCooking(this.FUSE_TIME);
    this.spawner = new GrenadeSpawner(this.scene);
  }

  async init(): Promise<void> {
    Logger.info('weapons', '💣 Initializing Grenade System...');
  }

  update(deltaTime: number): void {
    this.idleTime += deltaTime;
    this.handView.updateHandAnimation(this.isAiming, this.throwPower, this.idleTime);

    // Update throw power while aiming (builds up over time)
    if (this.isAiming) {
      this.powerBuildupTime += deltaTime;
      // Power builds up over 2 seconds to max
      this.throwPower = Math.min(0.3 + (this.powerBuildupTime / 2.0) * 0.7, 1.0);
      this.updateArc();
      
      // Pulse landing indicator for visibility
      const landingIndicator = this.arcRenderer.getLandingIndicator();
      if (landingIndicator && landingIndicator.visible) {
        const pulse = 0.6 + Math.sin(this.idleTime * 4) * 0.2; // Pulse between 0.4 and 0.8
        if (landingIndicator.material instanceof THREE.MeshBasicMaterial) {
          landingIndicator.material.opacity = pulse;
        }
      }
    }

    // Update cooking timer
    if (this.cooking.update(
      deltaTime,
      this.camera,
      this.explosionEffectsPool,
      this.audioManager,
      this.playerController
    )) {
      this.cancelThrow();
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
        this.spawner.removeGrenade(grenade);
        
        const last = this.grenades.length - 1;
        if (i !== last) {
          this.grenades[i] = this.grenades[last];
        }
        this.grenades.pop();
        continue;
      }

      this.physics.updateGrenade(grenade, deltaTime, (x, z) => this.getGroundHeight(x, z));
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

    this.arcRenderer.dispose();

    this.handView.dispose();
  }

  startAiming(): void {
    // Check if we have grenades first
    if (this.inventoryManager && !this.inventoryManager.canUseGrenade()) {
      Logger.info('weapons', '⚠️ No grenades remaining!');
      return;
    }

    this.isAiming = true;
    this.aimStartTime = Date.now();
    this.throwPower = 0.3; // Start with minimum power
    this.powerBuildupTime = 0;

    this.arcRenderer.showArc(true);
  }

  startCooking(): void {
    if (!this.isAiming || this.cooking.isCurrentlyCooking()) return;

    this.cooking.startCooking();
  }

  adjustPower(delta: number): void {
    if (!this.isAiming) return;

    this.throwPower = THREE.MathUtils.clamp(this.throwPower + delta, 0.3, 2.0);
  }

  updateArc(): number {
    if (!this.isAiming) return 0;

    return this.arcRenderer.updateArc(
      this.camera,
      this.throwPower,
      this.GRAVITY,
      this.MIN_THROW_FORCE,
      this.MAX_THROW_FORCE,
      (x, z) => this.getGroundHeight(x, z)
    );
  }

  throwGrenade(): boolean {
    if (!this.isAiming) return false;

    // Check inventory and use grenade
    if (this.inventoryManager) {
      if (!this.inventoryManager.useGrenade()) {
        Logger.info('weapons', '⚠️ Failed to use grenade - no inventory!');
        this.cancelThrow();
        return false;
      }
    }

    this.isAiming = false;
    this.powerBuildupTime = 0;

    // Store cooking time for spawning grenade with reduced fuse
    const remainingFuseTime = this.cooking.getRemainingFuseTime();
    this.cooking.stopCooking();

    this.arcRenderer.showArc(false);

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

    this.grenades.push(
      this.spawner.spawnGrenade(startPos, throwVelocity, remainingFuseTime, this.nextGrenadeId++)
    );

    // Track grenade throw in stats
    if (this.statsTracker) {
      this.statsTracker.addGrenadeThrow();
    }

    const powerPercent = Math.round(this.throwPower * 100);
    const cookedTime = remainingFuseTime < this.FUSE_TIME ? ` (cooked ${(this.FUSE_TIME - remainingFuseTime).toFixed(1)}s)` : '';
    Logger.info('weapons', `💣 Grenade thrown at ${powerPercent}% power${cookedTime}`);
    return true;
  }

  cancelThrow(): void {
    this.isAiming = false;
    this.powerBuildupTime = 0;
    this.throwPower = 0.3;

    this.arcRenderer.showArc(false);
  }

  private explodeGrenade(grenade: Grenade): void {
    Logger.info('weapons', `💥 Grenade exploded at (${grenade.position.x.toFixed(1)}, ${grenade.position.y.toFixed(1)}, ${grenade.position.z.toFixed(1)})`);

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
        this.MAX_DAMAGE,
        'PLAYER'
      );
    }

    // Apply enhanced camera shake from explosion
    if (this.playerController) {
      this.playerController.applyExplosionShake(grenade.position, this.DAMAGE_RADIUS);
    }
  }

  private getGroundHeight(x: number, z: number): number {
    if (this.chunkManager) {
      return this.chunkManager.getEffectiveHeightAt(x, z);
    }
    return 0;
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

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker;
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
      cookingTime: this.cooking.getCookingTime()
    };
  }

  showGrenadeInHand(show: boolean): void {
    this.handView.showGrenadeInHand(show);
  }

  getGrenadeOverlayScene(): THREE.Scene {
    return this.handView.getOverlayScene();
  }

  getGrenadeOverlayCamera(): THREE.Camera {
    return this.handView.getOverlayCamera();
  }
}
