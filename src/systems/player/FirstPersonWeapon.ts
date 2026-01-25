import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ProgrammaticGunFactory } from './ProgrammaticGunFactory';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { GunplayCore, WeaponSpec } from '../weapons/GunplayCore';
// import { EnemySystem } from './EnemySystem'; // Replaced with CombatantSystem
import { CombatantSystem } from '../combat/CombatantSystem';
import { AssetLoader } from '../assets/AssetLoader';
import { PlayerController } from './PlayerController';
import { AudioManager } from '../audio/AudioManager';
import { AmmoManager } from '../weapons/AmmoManager';
import { ZoneManager } from '../world/ZoneManager';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { PlayerStatsTracker } from './PlayerStatsTracker';

export class FirstPersonWeapon implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;
  private playerController?: PlayerController;
  private gameStarted: boolean = false;
  
  // Weapon sprite
  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.OrthographicCamera;
  private rifleRig?: THREE.Group; // rifle model
  private shotgunRig?: THREE.Group; // shotgun model
  private smgRig?: THREE.Group; // SMG model
  private weaponRig?: THREE.Group; // current active weapon rig root
  private muzzleRef?: THREE.Object3D;
  private magazineRef?: THREE.Object3D; // Magazine for reload animation
  private pumpGripRef?: THREE.Object3D; // Pump grip for shotgun animation
  
  // Animation state
  private isADS = false;
  private adsProgress = 0; // 0..1
  private readonly ADS_TIME = 0.18; // seconds
  private isFiring = false; // Track if mouse is held down

  // Recoil recovery with spring physics
  private weaponRecoilOffset = { x: 0, y: 0, z: 0, rotX: 0 };
  private weaponRecoilVelocity = { x: 0, y: 0, z: 0, rotX: 0 };
  private readonly RECOIL_SPRING_STIFFNESS = 120;
  private readonly RECOIL_SPRING_DAMPING = 15;
  
  // Idle motion
  private idleTime = 0;
  private bobOffset = { x: 0, y: 0 };
  private swayOffset = { x: 0, y: 0 };
  
  // Base position (relative to screen)
  private readonly basePosition = { x: 0.5, y: -0.45, z: -0.75 }; // More to the right
  // ADS position - centered and closer for sight alignment
  private readonly adsPosition = { x: 0.0, y: -0.18, z: -0.55 };

  private readonly baseRotation = 0.0;
  private readonly hipCantDeg = -12; // cant to the right at hip
  private baseFOV = 75; // Store base FOV for zoom effect

  // Gunplay
  private tracerPool: TracerPool;
  private muzzleFlashPool: MuzzleFlashPool;
  private impactEffectsPool: ImpactEffectsPool;
  private rifleCore: GunplayCore;
  private shotgunCore: GunplayCore;
  private smgCore: GunplayCore;
  private gunCore: GunplayCore; // Current active weapon core

  private rifleSpec: WeaponSpec = {
    name: 'Rifle', rpm: 700, adsTime: 0.18,
    baseSpreadDeg: 0.8, bloomPerShotDeg: 0.25,
    recoilPerShotDeg: 0.65, recoilHorizontalDeg: 0.35,
    damageNear: 34, damageFar: 24, falloffStart: 20, falloffEnd: 60,
    headshotMultiplier: 1.7, penetrationPower: 1
  };

  private shotgunSpec: WeaponSpec = {
    name: 'Shotgun', rpm: 75, adsTime: 0.22, // ~0.8s between shots
    baseSpreadDeg: 2.5, bloomPerShotDeg: 1.0,
    recoilPerShotDeg: 2.5, recoilHorizontalDeg: 0.8, // Heavy recoil
    damageNear: 15, damageFar: 4, falloffStart: 8, falloffEnd: 25, // Per pellet
    headshotMultiplier: 1.5, penetrationPower: 0.5,
    pelletCount: 10, pelletSpreadDeg: 8 // 10 pellets in 8-degree cone
  };

  private smgSpec: WeaponSpec = {
    name: 'SMG', rpm: 900, adsTime: 0.15, // High rate of fire, fast ADS
    baseSpreadDeg: 1.2, bloomPerShotDeg: 0.15, // Good hip-fire accuracy
    recoilPerShotDeg: 0.35, recoilHorizontalDeg: 0.25, // Low recoil
    damageNear: 22, damageFar: 12, falloffStart: 15, falloffEnd: 40, // Lower damage, shorter range
    headshotMultiplier: 1.4, penetrationPower: 0.8
  };
  // private enemySystem?: EnemySystem;
  private combatantSystem?: CombatantSystem;
  private hudSystem?: any; // HUD system for hit markers
  private audioManager?: AudioManager;
  private ammoManager: AmmoManager;
  private zoneManager?: ZoneManager;
  private inventoryManager?: InventoryManager;
  private statsTracker?: PlayerStatsTracker;

  // Reload animation state
  private reloadAnimationProgress = 0;
  private isReloadAnimating = false;
  private readonly RELOAD_ANIMATION_TIME = 2.5;
  private reloadRotation = { x: 0, y: 0, z: 0 };
  private reloadTranslation = { x: 0, y: 0, z: 0 };
  private magazineOffset = { x: 0, y: 0, z: 0 }; // Magazine animation offset
  private magazineRotation = { x: 0, y: 0, z: 0 }; // Magazine rotation during reload

  // Pump-action animation state (for shotgun)
  private pumpAnimationProgress = 0;
  private isPumpAnimating = false;
  private readonly PUMP_ANIMATION_TIME = 0.35; // Quick pump action
  private pumpOffset = { x: 0, y: 0, z: 0 };

  // Weapon switch animation state
  private isSwitchingWeapon = false;
  private switchAnimationProgress = 0;
  private readonly SWITCH_ANIMATION_TIME = 0.4; // 400ms total switch time
  private switchOffset = { y: 0, rotX: 0 };
  private pendingWeaponSwitch?: 'rifle' | 'shotgun' | 'smg';
  
  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    
    // Create separate scene for weapon overlay
    this.weaponScene = new THREE.Scene();
    
    // Create orthographic camera for weapon rendering
    const aspect = window.innerWidth / window.innerHeight;
    this.weaponCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.weaponCamera.position.z = 1;
    
    // Input
    window.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', this.onWindowResize.bind(this));
    window.addEventListener('keydown', this.onKeyDown.bind(this));

    this.tracerPool = new TracerPool(this.scene, 96);
    this.muzzleFlashPool = new MuzzleFlashPool(this.scene, 32);
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 32);

    // Initialize all weapon cores
    this.rifleCore = new GunplayCore(this.rifleSpec);
    this.shotgunCore = new GunplayCore(this.shotgunSpec);
    this.smgCore = new GunplayCore(this.smgSpec);
    this.gunCore = this.rifleCore; // Start with rifle

    // Initialize ammo manager
    this.ammoManager = new AmmoManager(30, 90); // 30 rounds per mag, 90 reserve
    this.ammoManager.setOnReloadComplete(() => this.onReloadComplete());
    this.ammoManager.setOnAmmoChange((state) => this.onAmmoChange(state));
  }

  async init(): Promise<void> {
    console.log('⚔️ Initializing First Person Weapon...');

    // Build programmatic rifle
    this.rifleRig = ProgrammaticGunFactory.createRifle();
    this.rifleRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z);
    this.weaponScene.add(this.rifleRig);

    // Build programmatic shotgun
    this.shotgunRig = ProgrammaticGunFactory.createShotgun();
    this.shotgunRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z);
    this.shotgunRig.visible = false; // Hidden initially
    this.weaponScene.add(this.shotgunRig);

    // Build programmatic SMG
    this.smgRig = ProgrammaticGunFactory.createSMG();
    this.smgRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z);
    this.smgRig.visible = false; // Hidden initially
    this.weaponScene.add(this.smgRig);

    // Start with rifle active
    this.weaponRig = this.rifleRig;
    this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined;
    this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined;
    this.pumpGripRef = undefined; // Only shotgun has pump grip

    // Store base FOV from camera
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.baseFOV = this.camera.fov;
    }

    console.log('✅ First Person Weapon initialized (rifle + shotgun + SMG)');

    // Trigger initial ammo display
    this.onAmmoChange(this.ammoManager.getState());
  }

  private isEnabled = true; // For death system

  update(deltaTime: number): void {
    if (!this.weaponRig || !this.isEnabled) return;

    // Update ammo manager with player position for zone resupply
    const playerPos = this.playerController?.getPosition();
    this.ammoManager.update(deltaTime, playerPos);
    
    // Update idle animation
    this.idleTime += deltaTime;
    
    // Get player movement state if available
    const isMoving = this.playerController?.isMoving() || false;
    
    // Calculate idle bobbing
    if (isMoving) {
      // Walking bob - bigger movements
      this.bobOffset.x = Math.sin(this.idleTime * 8) * 0.04;
      this.bobOffset.y = Math.abs(Math.sin(this.idleTime * 8)) * 0.06;
    } else {
      // Gentle breathing motion when standing
      this.bobOffset.x = Math.sin(this.idleTime * 2) * 0.01;
      this.bobOffset.y = Math.sin(this.idleTime * 2) * 0.02;
    }

    // Mouse-look sway (small)
    const lookVel = this.playerController ? this.playerController.getVelocity() : new THREE.Vector3();
    const speedFactor = Math.min(1, lookVel.length() / 10);
    this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, speedFactor * 0.02, 8 * deltaTime);
    this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, speedFactor * 0.02, 8 * deltaTime);
    
    // ADS transition
    const target = this.isADS ? 1 : 0;
    const k = this.ADS_TIME > 0 ? Math.min(1, deltaTime / this.ADS_TIME) : 1;
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, target, k);

    // Apply FOV zoom when ADS (reduced zoom for less disorientation)
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const targetFOV = THREE.MathUtils.lerp(this.baseFOV, this.baseFOV / 1.3, this.adsProgress);
      this.camera.fov = targetFOV;
      this.camera.updateProjectionMatrix();
    }

    // Apply recoil recovery spring physics
    this.updateRecoilRecovery(deltaTime);

    // Update reload animation
    if (this.isReloadAnimating) {
      this.updateReloadAnimation(deltaTime);
    }

    // Update pump animation (shotgun)
    if (this.isPumpAnimating) {
      this.updatePumpAnimation(deltaTime);
    }

    // Update weapon switch animation
    if (this.isSwitchingWeapon) {
      this.updateSwitchAnimation(deltaTime);
    }

    // Apply overlay transform
    this.updateWeaponTransform();

    // Gunplay cooldown
    this.gunCore.cooldown(deltaTime);

    // Auto-fire while mouse is held
    if (this.isFiring) {
      this.tryFire();
    }

    // Update all effects
    this.tracerPool.update();
    this.muzzleFlashPool.update();
    this.impactEffectsPool.update(deltaTime);
  }

  dispose(): void {
    window.removeEventListener('mousedown', this.onMouseDown.bind(this));
    window.removeEventListener('mouseup', this.onMouseUp.bind(this));
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    this.tracerPool.dispose();
    this.muzzleFlashPool.dispose();
    this.impactEffectsPool.dispose();
    
    console.log('🧹 First Person Weapon disposed');
  }
  
  private onWindowResize(): void {
    const aspect = window.innerWidth / window.innerHeight;
    this.weaponCamera.left = -aspect;
    this.weaponCamera.right = aspect;
    this.weaponCamera.updateProjectionMatrix();
  }

  setPlayerController(controller: PlayerController): void {
    this.playerController = controller;
  }

  // Deprecated: Use setCombatantSystem instead
  setEnemySystem(enemy: any): void {
    console.warn('setEnemySystem is deprecated, use setCombatantSystem');
  }

  setCombatantSystem(combatantSystem: CombatantSystem): void {
    this.combatantSystem = combatantSystem;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;

    // Listen for weapon slot changes
    inventoryManager.onSlotChange((slot) => {
      if (slot === WeaponSlot.PRIMARY) {
        this.switchToRifle();
      } else if (slot === WeaponSlot.SHOTGUN) {
        this.switchToShotgun();
      } else if (slot === WeaponSlot.SMG) {
        this.switchToSMG();
      }
    });
  }

  private switchToRifle(): void {
    this.startWeaponSwitch('rifle');
  }

  private switchToShotgun(): void {
    this.startWeaponSwitch('shotgun');
  }

  private switchToSMG(): void {
    this.startWeaponSwitch('smg');
  }

  
  private onMouseDown(event: MouseEvent): void {
    // Don't process input until game has started and weapon is visible
    if (!this.gameStarted || !this.isEnabled || !this.weaponRig) return;

    // Only handle gun input when PRIMARY, SHOTGUN, or SMG weapon is equipped
    const currentSlot = this.inventoryManager?.getCurrentSlot();
    if (this.inventoryManager && currentSlot !== WeaponSlot.PRIMARY && currentSlot !== WeaponSlot.SHOTGUN && currentSlot !== WeaponSlot.SMG) {
      return;
    }

    if (event.button === 2) {
      // Right mouse - ADS toggle hold (can't ADS while reloading)
      if (!this.isReloadAnimating) {
        this.isADS = true;
      }
      return;
    }
    if (event.button === 0) {
      // Left mouse - start firing (can't fire while reloading)
      if (!this.isReloadAnimating) {
        this.isFiring = true;
        this.tryFire();
      }
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 2) {
      this.isADS = false;
    }
    if (event.button === 0) {
      // Stop firing when left mouse is released
      this.isFiring = false;
    }
  }

  private updateWeaponTransform(): void {
    if (!this.weaponRig) return;
    const px = THREE.MathUtils.lerp(this.basePosition.x, this.adsPosition.x, this.adsProgress);
    const py = THREE.MathUtils.lerp(this.basePosition.y, this.adsPosition.y, this.adsProgress);
    const pz = THREE.MathUtils.lerp(this.basePosition.z, this.adsPosition.z, this.adsProgress);

    // Apply position with all offsets including recoil, reload animation, pump animation, and switch animation
    this.weaponRig.position.set(
      px + this.bobOffset.x + this.swayOffset.x + this.weaponRecoilOffset.x + this.reloadTranslation.x + this.pumpOffset.x,
      py + this.bobOffset.y + this.swayOffset.y + this.weaponRecoilOffset.y + this.reloadTranslation.y + this.pumpOffset.y + this.switchOffset.y,
      pz + this.weaponRecoilOffset.z + this.reloadTranslation.z + this.pumpOffset.z
    );

    // Set up base rotations to point barrel toward crosshair
    // Y rotation: turn gun to face forward and LEFT toward center
    const baseYRotation = Math.PI / 2 + THREE.MathUtils.degToRad(15); // ADD to rotate LEFT
    const adsYRotation = Math.PI / 2; // Straight forward for ADS
    this.weaponRig.rotation.y = THREE.MathUtils.lerp(baseYRotation, adsYRotation, this.adsProgress);

    // X rotation: tilt barrel UPWARD toward crosshair + reload animation + switch animation
    const baseXRotation = THREE.MathUtils.degToRad(18); // More upward tilt when not ADS
    const adsXRotation = 0; // Level for sight alignment
    this.weaponRig.rotation.x = THREE.MathUtils.lerp(baseXRotation, adsXRotation, this.adsProgress) + this.weaponRecoilOffset.rotX + this.reloadRotation.x + this.switchOffset.rotX;

    // Z rotation: cant the gun + reload tilt
    const baseCant = THREE.MathUtils.degToRad(-8); // Negative for proper cant
    const adsCant = 0; // No cant in ADS
    this.weaponRig.rotation.z = THREE.MathUtils.lerp(baseCant, adsCant, this.adsProgress) + this.reloadRotation.z;

    // Update magazine position if it exists
    if (this.magazineRef && this.isReloadAnimating) {
      this.magazineRef.position.x = 0.2 + this.magazineOffset.x;
      this.magazineRef.position.y = -0.25 + this.magazineOffset.y;
      this.magazineRef.position.z = 0 + this.magazineOffset.z;

      this.magazineRef.rotation.x = this.magazineRotation.x;
      this.magazineRef.rotation.y = this.magazineRotation.y;
      this.magazineRef.rotation.z = 0.1 + this.magazineRotation.z;
    }
  }

  private updateRecoilRecovery(deltaTime: number): void {
    // Spring physics for smooth recoil recovery
    const springForceX = -this.weaponRecoilOffset.x * this.RECOIL_SPRING_STIFFNESS;
    const springForceY = -this.weaponRecoilOffset.y * this.RECOIL_SPRING_STIFFNESS;
    const springForceZ = -this.weaponRecoilOffset.z * this.RECOIL_SPRING_STIFFNESS;
    const springForceRotX = -this.weaponRecoilOffset.rotX * this.RECOIL_SPRING_STIFFNESS;

    // Apply damping
    const dampingX = -this.weaponRecoilVelocity.x * this.RECOIL_SPRING_DAMPING;
    const dampingY = -this.weaponRecoilVelocity.y * this.RECOIL_SPRING_DAMPING;
    const dampingZ = -this.weaponRecoilVelocity.z * this.RECOIL_SPRING_DAMPING;
    const dampingRotX = -this.weaponRecoilVelocity.rotX * this.RECOIL_SPRING_DAMPING;

    // Update velocity
    this.weaponRecoilVelocity.x += (springForceX + dampingX) * deltaTime;
    this.weaponRecoilVelocity.y += (springForceY + dampingY) * deltaTime;
    this.weaponRecoilVelocity.z += (springForceZ + dampingZ) * deltaTime;
    this.weaponRecoilVelocity.rotX += (springForceRotX + dampingRotX) * deltaTime;

    // Update position
    this.weaponRecoilOffset.x += this.weaponRecoilVelocity.x * deltaTime;
    this.weaponRecoilOffset.y += this.weaponRecoilVelocity.y * deltaTime;
    this.weaponRecoilOffset.z += this.weaponRecoilVelocity.z * deltaTime;
    this.weaponRecoilOffset.rotX += this.weaponRecoilVelocity.rotX * deltaTime;
  }
  
  // Called by main game loop to render weapon overlay
  renderWeapon(renderer: THREE.WebGLRenderer): void {
    if (!this.weaponRig) return;
    
    // Save current renderer state
    const currentAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    
    // Clear depth buffer to render on top
    renderer.clearDepth();
    
    // Render weapon scene
    renderer.render(this.weaponScene, this.weaponCamera);
    
    // Restore renderer state
    renderer.autoClear = currentAutoClear;
  }

  // Easing functions for smooth animation
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  private tryFire(): void {
    if (!this.combatantSystem || !this.gunCore.canFire() || !this.isEnabled) return;

    // Check ammo
    if (!this.ammoManager.canFire()) {
      if (this.ammoManager.isEmpty()) {
        // Play empty click sound
        console.log('🔫 *click* - Empty magazine!');
        // Auto-reload if we have reserve ammo
        if (this.ammoManager.getState().reserveAmmo > 0) {
          this.startReload();
        }
      }
      return;
    }

    // Consume ammo
    if (!this.ammoManager.consumeRound()) return;
    this.gunCore.registerShot();

    // Register shot with stats tracker (will be marked as hit/miss after damage calculations)
    if (this.statsTracker) {
      this.statsTracker.registerShot(false); // Will be updated to true if hits
    }

    // Play weapon-specific sound based on current weapon type
    if (this.audioManager) {
      let weaponType: 'rifle' | 'shotgun' | 'smg' = 'rifle';
      if (this.gunCore === this.shotgunCore) {
        weaponType = 'shotgun';
      } else if (this.gunCore === this.smgCore) {
        weaponType = 'smg';
      }
      this.audioManager.playPlayerWeaponSound(weaponType);
    }

    // Check if shotgun - fire multiple pellets
    const isShotgun = this.gunCore.isShotgun();
    if (isShotgun) {
      this.fireShotgunPellets();
      // Start pump animation for shotgun
      this.startPumpAnimation();
    } else {
      this.fireSingleShot();
    }

    // Visual recoil: kick weapon and camera slightly, and persist kick via controller
    const kick = this.gunCore.getRecoilOffsetDeg();
    // Fixed: positive pitch makes the aim go UP (as it should with recoil)
    if (this.playerController) {
      this.playerController.applyRecoil(THREE.MathUtils.degToRad(kick.pitch), THREE.MathUtils.degToRad(kick.yaw));
      // Apply subtle recoil screen shake
      this.playerController.applyRecoilShake();
    }

    // Apply recoil impulse to weapon spring system
    if (this.weaponRig) {
      // Shotgun has heavier recoil
      const recoilMultiplier = this.gunCore.isShotgun() ? 1.8 : 1.0;
      this.weaponRecoilVelocity.z -= 2.2 * recoilMultiplier; // Backward kick
      this.weaponRecoilVelocity.y += 1.2 * recoilMultiplier; // Upward kick
      this.weaponRecoilVelocity.rotX += 0.12 * recoilMultiplier; // Rotation kick

      // Small random horizontal kick for variety
      this.weaponRecoilVelocity.x += (Math.random() - 0.5) * 0.4;
    }
    (this as any).lastShotVisualTime = performance.now();
  }

  private fireSingleShot(): void {
    if (!this.combatantSystem) return;

    // Spread and recoil
    const spread = this.gunCore.getSpreadDeg();
    const ray = this.gunCore.computeShotRay(this.camera, spread);

    // Hitscan damage application with enhanced result
    const result = this.combatantSystem.handlePlayerShot(ray, (d, head) => this.gunCore.computeDamage(d, head));

    // Spawn impact effect at hit point
    if (result.hit) {
      // Calculate impact normal (opposite of ray direction for now)
      const normal = ray.direction.clone().negate();
      this.impactEffectsPool.spawn(result.point, normal);

      // Track shot as a hit in stats
      if (this.statsTracker) {
        // Mark previous shot as a hit by registering a new hit
        const damageDealt = (result as any).damage || 0;
        const isHeadshot = (result as any).headshot || false;

        if (damageDealt > 0) {
          this.statsTracker.addDamage(damageDealt);
        }
        if (isHeadshot) {
          this.statsTracker.addHeadshot();
        }

        // Track longest kill distance if this was a kill
        if ((result as any).killed) {
          const shotOrigin = this.camera.position;
          const targetPos = result.point;
          const distance = shotOrigin.distanceTo(targetPos);
          this.statsTracker.updateLongestKill(distance);
        }
      }

      // Show hit marker and play hit sound
      if (this.hudSystem) {
        // Check if it's a kill or normal hit
        const hitType = (result as any).killed ? 'kill' : (result as any).headshot ? 'headshot' : 'hit';
        this.hudSystem.showHitMarker(hitType);

        // Play hit feedback sound
        if (this.audioManager) {
          this.audioManager.playHitFeedback(hitType as 'hit' | 'headshot' | 'kill');
        }

        // Spawn damage number
        const damageDealt = (result as any).damage || 0;
        const isHeadshot = (result as any).headshot || false;
        const isKill = (result as any).killed || false;
        if (damageDealt > 0) {
          this.hudSystem.spawnDamageNumber(result.point, damageDealt, isHeadshot, isKill);
        }
      }
    }

    this.spawnMuzzleFlash();
  }

  private fireShotgunPellets(): void {
    if (!this.combatantSystem) return;

    // Generate pellet rays
    const pelletRays = this.gunCore.computePelletRays(this.camera);

    let totalDamage = 0;
    let anyHit = false;
    let bestHit: any = null;
    let headshotHit = false;
    let killedByShot = false;

    // Fire each pellet
    for (const ray of pelletRays) {
      const result = this.combatantSystem.handlePlayerShot(ray, (d, head) => this.gunCore.computeDamage(d, head));

      if (result.hit) {
        anyHit = true;
        totalDamage += (result as any).damage || 0;

        // Track best hit for visual feedback
        if (!bestHit || (result as any).killed) {
          bestHit = result;
        }

        // Track if any pellet was a headshot
        if ((result as any).headshot) {
          headshotHit = true;
        }

        // Track if any pellet killed
        if ((result as any).killed) {
          killedByShot = true;
        }

        // Spawn impact effect for each pellet
        const normal = ray.direction.clone().negate();
        this.impactEffectsPool.spawn(result.point, normal);
      }
    }

    // Track stats for shotgun shot
    if (anyHit && this.statsTracker && bestHit) {
      if (totalDamage > 0) {
        this.statsTracker.addDamage(totalDamage);
      }
      if (headshotHit) {
        this.statsTracker.addHeadshot();
      }
      if (killedByShot) {
        const shotOrigin = this.camera.position;
        const targetPos = bestHit.point;
        const distance = shotOrigin.distanceTo(targetPos);
        this.statsTracker.updateLongestKill(distance);
      }
    }

    // Show consolidated feedback for the shot
    if (anyHit && this.hudSystem && bestHit) {
      const hitType: 'hit' | 'headshot' | 'kill' = (bestHit as any).killed ? 'kill' : (bestHit as any).headshot ? 'headshot' : 'hit';
      this.hudSystem.showHitMarker(hitType);

      // Play hit feedback sound
      if (this.audioManager) {
        this.audioManager.playHitFeedback(hitType);
      }

      // Show total damage dealt
      if (totalDamage > 0) {
        this.hudSystem.spawnDamageNumber(bestHit.point, totalDamage, (bestHit as any).headshot, (bestHit as any).killed);
      }
    }

    this.spawnMuzzleFlash();
  }

  private spawnMuzzleFlash(): void {
    const muzzlePos = new THREE.Vector3();
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    if (this.muzzleRef) {
      // Get muzzle world position for 3D scene flash
      this.muzzleRef.getWorldPosition(muzzlePos);
      // Offset forward from camera position
      muzzlePos.copy(cameraPos).addScaledVector(forward, 1.5);
    } else {
      muzzlePos.copy(cameraPos).addScaledVector(forward, 1);
    }

    // Shotgun has a bigger muzzle flash
    const flashSize = this.gunCore.isShotgun() ? 1.6 : 1.2;
    this.muzzleFlashPool.spawn(muzzlePos, forward, flashSize);
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
    this.ammoManager.setZoneManager(zoneManager);
  }

  // Disable weapon (for death)
  disable(): void {
    this.isEnabled = false;
    this.isADS = false;
    this.adsProgress = 0;
    if (this.weaponRig) {
      this.weaponRig.visible = false;
    }
  }

  // Enable weapon (for respawn)
  enable(): void {
    this.isEnabled = true;
    if (this.weaponRig) {
      this.weaponRig.visible = true;
    }
    // Reset ammo on respawn
    this.ammoManager.reset();
  }

  setWeaponVisibility(visible: boolean): void {
    if (this.weaponRig) {
      this.weaponRig.visible = visible;
    }
  }

  // Set game started state
  setGameStarted(started: boolean): void {
    this.gameStarted = started;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.gameStarted || !this.isEnabled) return;

    if (event.key.toLowerCase() === 'r') {
      this.startReload();
    }
  }

  private startReload(): void {
    // Can't reload while ADS
    if (this.isADS) {
      console.log('⚠️ Cannot reload while aiming');
      return;
    }

    if (this.ammoManager.startReload()) {
      this.isReloadAnimating = true;
      this.reloadAnimationProgress = 0;
      this.isFiring = false; // Stop firing during reload

      // Play reload sound if available
      if (this.audioManager) {
        this.audioManager.playReloadSound();
      }
    }
  }

  private updateReloadAnimation(deltaTime: number): void {
    if (!this.isReloadAnimating) return;

    // Update reload animation progress
    this.reloadAnimationProgress += deltaTime / this.RELOAD_ANIMATION_TIME;

    if (this.reloadAnimationProgress >= 1) {
      this.reloadAnimationProgress = 1;
      this.isReloadAnimating = false;
      // Reset animation values
      this.reloadRotation = { x: 0, y: 0, z: 0 };
      this.reloadTranslation = { x: 0, y: 0, z: 0 };
      this.magazineOffset = { x: 0, y: 0, z: 0 };
      this.magazineRotation = { x: 0, y: 0, z: 0 };

      // Reset magazine to default position
      if (this.magazineRef) {
        this.magazineRef.position.set(0.2, -0.25, 0);
        this.magazineRef.rotation.set(0, 0, 0.1);
      }
      return;
    }

    // Calculate reload animation based on progress
    this.calculateReloadAnimation(this.reloadAnimationProgress);
  }

  private calculateReloadAnimation(progress: number): void {
    // Multi-stage reload animation with magazine detachment
    // Stage 1 (0-20%): Tilt gun right to expose magazine
    // Stage 2 (20-40%): Pull magazine out downward
    // Stage 3 (40-50%): Magazine falls away, pause
    // Stage 4 (50-70%): Insert new magazine from below
    // Stage 5 (70-85%): Rotate gun back to center
    // Stage 6 (85-100%): Chamber round (slight pull back)

    if (progress < 0.2) {
      // Stage 1: Tilt gun right
      const t = progress / 0.2;
      const ease = this.easeInOutQuad(t);
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25) * ease; // Tilt right
      this.reloadRotation.y = THREE.MathUtils.degToRad(15) * ease; // Turn slightly
      this.reloadTranslation.x = 0.15 * ease; // Move right slightly
    } else if (progress < 0.4) {
      // Stage 2: Pull mag out downward
      const t = (progress - 0.2) / 0.2;
      const ease = this.easeOutCubic(t);
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25);
      this.reloadRotation.y = THREE.MathUtils.degToRad(15);
      this.reloadTranslation.x = 0.15;

      // Magazine detaches and drops
      this.magazineOffset.y = -0.4 * ease; // Drop down
      this.magazineOffset.x = -0.1 * ease; // Slight left movement
      this.magazineRotation.z = THREE.MathUtils.degToRad(-15) * ease; // Tilt as it drops
    } else if (progress < 0.5) {
      // Stage 3: Magazine fully detached, pause
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25);
      this.reloadRotation.y = THREE.MathUtils.degToRad(15);
      this.reloadTranslation.x = 0.15;

      // Magazine fully dropped
      this.magazineOffset.y = -0.6; // Off screen
      this.magazineOffset.x = -0.15;
      this.magazineRotation.z = THREE.MathUtils.degToRad(-20);
    } else if (progress < 0.7) {
      // Stage 4: Insert new mag from below
      const t = (progress - 0.5) / 0.2;
      const ease = this.easeInCubic(t);
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25);
      this.reloadRotation.y = THREE.MathUtils.degToRad(15);
      this.reloadTranslation.x = 0.15;

      // Magazine slides back up into place
      this.magazineOffset.y = -0.6 + (0.6 * ease); // Rise from below
      this.magazineOffset.x = -0.15 + (0.15 * ease); // Move back to center
      this.magazineRotation.z = THREE.MathUtils.degToRad(-20) * (1 - ease); // Straighten
    } else if (progress < 0.85) {
      // Stage 5: Rotate gun back to center
      const t = (progress - 0.7) / 0.15;
      const ease = this.easeInOutQuad(t);
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25) * (1 - ease);
      this.reloadRotation.y = THREE.MathUtils.degToRad(15) * (1 - ease);
      this.reloadTranslation.x = 0.15 * (1 - ease);

      // Magazine locked in place
      this.magazineOffset.y = 0;
      this.magazineOffset.x = 0;
      this.magazineRotation.z = 0;
    } else {
      // Stage 6: Chamber round (slight pull back)
      const t = (progress - 0.85) / 0.15;
      const ease = this.easeOutCubic(t);
      const pullBack = ease < 0.5 ? ease * 2 : (1 - ease) * 2;
      this.reloadTranslation.z = -0.05 * pullBack; // Pull back slightly
      this.reloadRotation.x = THREE.MathUtils.degToRad(-3) * pullBack; // Slight upward kick

      // Magazine stays in place
      this.magazineOffset.y = 0;
      this.magazineOffset.x = 0;
      this.magazineRotation.z = 0;
    }
  }

  private easeInCubic(t: number): number {
    return t * t * t;
  }

  private updatePumpAnimation(deltaTime: number): void {
    if (!this.isPumpAnimating) return;

    // Update pump animation progress
    this.pumpAnimationProgress += deltaTime / this.PUMP_ANIMATION_TIME;

    if (this.pumpAnimationProgress >= 1) {
      this.pumpAnimationProgress = 1;
      this.isPumpAnimating = false;
      // Reset animation values
      this.pumpOffset = { x: 0, y: 0, z: 0 };
      return;
    }

    // Calculate pump animation based on progress
    this.calculatePumpAnimation(this.pumpAnimationProgress);
  }

  private calculatePumpAnimation(progress: number): void {
    // Two-stage pump animation:
    // Stage 1 (0-50%): Pull pump grip backward
    // Stage 2 (50-100%): Push pump grip forward

    let pumpPosition = 0;

    if (progress < 0.5) {
      // Stage 1: Pull back
      const t = progress / 0.5;
      const ease = this.easeOutCubic(t);
      pumpPosition = -0.2 * ease; // Pull backward
    } else {
      // Stage 2: Push forward
      const t = (progress - 0.5) / 0.5;
      const ease = this.easeInOutQuad(t);
      pumpPosition = -0.2 * (1 - ease); // Return to normal
    }

    // Apply to pump grip if it exists
    if (this.pumpGripRef) {
      // Store original position if not already stored
      if (!this.pumpGripRef.userData.originalX) {
        this.pumpGripRef.userData.originalX = this.pumpGripRef.position.x;
      }
      // Move pump grip along X axis (barrel direction)
      this.pumpGripRef.position.x = this.pumpGripRef.userData.originalX + pumpPosition;
    }
  }

  private startPumpAnimation(): void {
    // Don't start a new pump animation if one is already playing
    if (this.isPumpAnimating) return;

    this.isPumpAnimating = true;
    this.pumpAnimationProgress = 0;
    console.log('🔫 Pump action!');
  }

  private onReloadComplete(): void {
    console.log('✅ Weapon reloaded!');
    // Reload animation will finish independently
  }

  private onAmmoChange(state: any): void {
    // Update HUD if available
    if (this.hudSystem) {
      this.hudSystem.updateAmmoDisplay(state.currentMagazine, state.reserveAmmo);
    }

    // Check for low ammo warning
    if (this.ammoManager.isLowAmmo()) {
      console.log('⚠️ Low ammo!');
    }
  }

  getAmmoState(): any {
    return this.ammoManager.getState();
  }

  private updateSwitchAnimation(deltaTime: number): void {
    if (!this.isSwitchingWeapon) return;

    // Update switch animation progress
    this.switchAnimationProgress += deltaTime / this.SWITCH_ANIMATION_TIME;

    if (this.switchAnimationProgress >= 1) {
      // Animation complete
      this.switchAnimationProgress = 1;
      this.isSwitchingWeapon = false;
      this.switchOffset = { y: 0, rotX: 0 };
      return;
    }

    // Calculate switch animation based on progress
    this.calculateSwitchAnimation(this.switchAnimationProgress);
  }

  private calculateSwitchAnimation(progress: number): void {
    // Two-stage switch animation:
    // Stage 1 (0-50%): Lower current weapon (move down and rotate forward)
    // Stage 2 (50-100%): Raise new weapon (move up from below)

    if (progress < 0.5) {
      // Stage 1: Lower weapon
      const t = progress / 0.5;
      const ease = this.easeInCubic(t);
      this.switchOffset.y = -0.8 * ease; // Move down
      this.switchOffset.rotX = THREE.MathUtils.degToRad(30) * ease; // Tilt forward

      // At midpoint, perform the actual weapon switch
      if (progress >= 0.49 && this.pendingWeaponSwitch) {
        this.performWeaponSwitch(this.pendingWeaponSwitch);
        this.pendingWeaponSwitch = undefined;
      }
    } else {
      // Stage 2: Raise new weapon
      const t = (progress - 0.5) / 0.5;
      const ease = this.easeOutCubic(t);
      this.switchOffset.y = -0.8 * (1 - ease); // Move up from below
      this.switchOffset.rotX = THREE.MathUtils.degToRad(30) * (1 - ease); // Straighten
    }
  }

  private performWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg'): void {
    // Actually switch the visible weapon models
    if (!this.rifleRig || !this.shotgunRig || !this.smgRig) return;

    switch (weaponType) {
      case 'rifle':
        this.rifleRig.visible = true;
        this.shotgunRig.visible = false;
        this.smgRig.visible = false;
        this.weaponRig = this.rifleRig;
        this.gunCore = this.rifleCore;
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined;
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined;
        this.pumpGripRef = undefined;
        break;
      case 'shotgun':
        this.rifleRig.visible = false;
        this.shotgunRig.visible = true;
        this.smgRig.visible = false;
        this.weaponRig = this.shotgunRig;
        this.gunCore = this.shotgunCore;
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined;
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined;
        this.pumpGripRef = this.weaponRig.getObjectByName('pumpGrip') || undefined;
        break;
      case 'smg':
        this.rifleRig.visible = false;
        this.shotgunRig.visible = false;
        this.smgRig.visible = true;
        this.weaponRig = this.smgRig;
        this.gunCore = this.smgCore;
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined;
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined;
        this.pumpGripRef = undefined;
        break;
    }

    // Notify HUD about weapon switch
    if (this.hudSystem && this.hudSystem.showWeaponSwitch) {
      const weaponNames = { rifle: 'RIFLE', shotgun: 'SHOTGUN', smg: 'SMG' };
      const weaponIcons = { rifle: '🔫', shotgun: '💥', smg: '⚡' };
      const ammoState = this.ammoManager.getState();
      this.hudSystem.showWeaponSwitch(
        weaponNames[weaponType],
        weaponIcons[weaponType],
        `${ammoState.currentMagazine} / ${ammoState.reserveAmmo}`
      );
    }

    // Play weapon switch sound
    if (this.audioManager && this.audioManager.playWeaponSwitchSound) {
      this.audioManager.playWeaponSwitchSound();
    }
  }

  private startWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg'): void {
    // Don't switch if already the current weapon
    if ((weaponType === 'rifle' && this.weaponRig === this.rifleRig) ||
        (weaponType === 'shotgun' && this.weaponRig === this.shotgunRig) ||
        (weaponType === 'smg' && this.weaponRig === this.smgRig)) {
      return;
    }

    // Can't switch while reloading or already switching
    if (this.isReloadAnimating || this.isSwitchingWeapon) {
      return;
    }

    console.log(`🔄 Switching to ${weaponType}`);
    this.isSwitchingWeapon = true;
    this.switchAnimationProgress = 0;
    this.pendingWeaponSwitch = weaponType;
    this.isFiring = false; // Stop firing during switch
    this.isADS = false; // Exit ADS during switch
  }

  // Helicopter integration methods
  hideWeapon(): void {
    if (this.weaponRig) {
      this.weaponRig.visible = false;
      console.log('🚁 🔫 Weapon hidden (in helicopter)');
    }
  }

  showWeapon(): void {
    if (this.weaponRig) {
      this.weaponRig.visible = true;
      console.log('🚁 🔫 Weapon shown (exited helicopter)');
    }
  }

  setFireingEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      // Stop any current firing
      this.isFiring = false;
      console.log('🚁 🔫 Firing disabled (in helicopter)');
    } else {
      console.log('🚁 🔫 Firing enabled (exited helicopter)');
    }
  }
}