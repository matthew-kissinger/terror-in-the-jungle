// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GrenadeType, Faction } from '../combat/types';
import { GameEventBus } from '../../core/GameEventBus';
import type { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { InventoryManager } from '../player/InventoryManager';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { PlayerStatsTracker } from '../player/PlayerStatsTracker';
import { Grenade, GrenadePhysics, GrenadeSpawner } from './GrenadePhysics';
import { GrenadeArcRenderer, GrenadeHandView, GrenadeCooking } from './GrenadeArcRenderer';
import { GrenadeEffects } from './GrenadeEffects';
import type { IFlashbangScreenEffect, IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';

const _throwStartPos = new THREE.Vector3();
const _throwDirection = new THREE.Vector3();
const _throwForwardDir = new THREE.Vector3();
const _throwVelocity = new THREE.Vector3();
const _inHandPos = new THREE.Vector3();

// An in-hand frag detonation is unsurvivable — the charge goes off against the
// player's own body, so we bypass the danger-close 0.75x self-scale falloff
// (owner decision F2, campaign manifest greenlight-followthrough) and apply a
// guaranteed-lethal hit directly. Spawn protection still spares the player
// (takeDamage returns false while invulnerable), which is the honest edge.
const IN_HAND_LETHAL_DAMAGE = 9999;

export class GrenadeSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private terrainSystem?: ITerrainRuntime;
  private combatantSystem?: CombatantSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private explosionEffectsPool?: ExplosionEffectsPool;
  private inventoryManager?: InventoryManager;
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;
  private playerController?: IPlayerController;
  private playerHealthSystem?: PlayerHealthSystem;
  private statsTracker?: PlayerStatsTracker;

  private grenades: Grenade[] = [];
  private nextGrenadeId = 0;
  private spawner: GrenadeSpawner;
  private currentGrenadeType: GrenadeType = GrenadeType.FRAG;
  private effects: GrenadeEffects;

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
  private readonly MAX_THROW_FORCE = 70; // Increased for longer throws (~40m at full power)
  private readonly MAX_ARC_POINTS = 100;

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
    terrainSystem?: ITerrainRuntime
  ) {
    this.scene = scene;
    this.camera = camera;
    this.terrainSystem = terrainSystem;

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
    this.effects = new GrenadeEffects();
  }

  async init(): Promise<void> {
    Logger.info('weapons', 'Initializing Grenade System...');
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

    // Update cooking timer. A `true` return means the fuse ran out with the
    // grenade still in hand: GrenadeCooking has already fired the cosmetic
    // blast (effect, audio, shake), so here we apply the real lethal
    // self-damage + the NPC-facing explosion and end the aim.
    if (this.cooking.update(
      deltaTime,
      this.camera,
      this.explosionEffectsPool,
      this.audioManager,
      this.playerController
    )) {
      this.explodeInHand();
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
        this.detonateAndRemove(i);
        continue;
      }

      this.physics.updateGrenade(grenade, deltaTime, (x, z) => this.getGroundHeight(x, z));

      // Impact ordnance (rockets, dropped bombs) detonates on first ground
      // contact instead of bouncing/rolling out the fuse. The long fuse stays a
      // backstop; thrown/cooked grenades and the M79 leave detonateOnImpact
      // unset and keep the legacy bounce-and-roll fuse behaviour.
      if (grenade.detonateOnImpact && grenade.hasImpacted) {
        this.detonateAndRemove(i);
      }
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
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) return;
    // Check if we have grenades first
    if (this.inventoryManager && !this.inventoryManager.canUseGrenade()) {
      Logger.info('weapons', ' No grenades remaining!');
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

    if (this.audioManager) {
      this.audioManager.play('grenadePinPull');
    }
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
      (x, z) => this.getGroundHeight(x, z),
      this.AIR_RESISTANCE,
      this.BOUNCE_DAMPING,
      this.FRICTION_MUD
    );
  }

  throwGrenade(): boolean {
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      this.cancelThrow();
      return false;
    }
    if (!this.isAiming) return false;

    // Check inventory and use grenade
    if (this.inventoryManager) {
      if (!this.inventoryManager.useGrenade()) {
        Logger.info('weapons', ' Failed to use grenade - no inventory!');
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

    _throwStartPos.copy(this.camera.position);
    // Offset slightly forward and down from camera
    this.camera.getWorldDirection(_throwDirection);
    _throwStartPos.addScaledVector(_throwDirection, 0.5);
    _throwStartPos.y -= 0.3;

    const direction = _throwDirection;

    // Variable throw force based on power buildup
    const throwForce = this.MIN_THROW_FORCE + (this.MAX_THROW_FORCE - this.MIN_THROW_FORCE) * this.throwPower;

    // Angle the throw upward for a proper arc (like a real grenade throw)
    // Use a flatter angle for more forward carry, less affected by looking angle
    const baseThrowAngle = 0.25 + (0.15 * this.throwPower); // 0.25 to 0.4 radians (14 to 23 degrees)

    // Maintain more forward momentum regardless of vertical look angle
    _throwForwardDir.copy(direction);
    _throwForwardDir.y = 0; // Remove vertical component
    _throwForwardDir.normalize();

    // Combine forward direction with upward angle
    _throwVelocity.set(
      _throwForwardDir.x * Math.cos(baseThrowAngle),
      Math.sin(baseThrowAngle),
      _throwForwardDir.z * Math.cos(baseThrowAngle)
    );

    _throwVelocity.multiplyScalar(throwForce);

    // Add moderate upward boost based on look angle (but not too much)
    const lookUpBoost = Math.max(0, direction.y * 3); // Only boost if looking up
    _throwVelocity.y += lookUpBoost * this.throwPower;

    const grenade = this.spawner.spawnGrenade(_throwStartPos, _throwVelocity, remainingFuseTime, this.nextGrenadeId++, this.currentGrenadeType);
    this.grenades.push(grenade);

    if (this.audioManager) {
      this.audioManager.play('grenadeThrow');
    }

    // Track grenade throw in stats
    if (this.statsTracker) {
      this.statsTracker.addGrenadeThrow();
    }

    const powerPercent = Math.round(this.throwPower * 100);
    const cookedTime = remainingFuseTime < this.FUSE_TIME ? ` (cooked ${(this.FUSE_TIME - remainingFuseTime).toFixed(1)}s)` : '';
    Logger.info('weapons', `Grenade thrown at ${powerPercent}% power${cookedTime}`);
    return true;
  }

  cancelThrow(): void {
    this.isAiming = false;
    this.powerBuildupTime = 0;
    this.throwPower = 0.3;

    this.arcRenderer.showArc(false);
  }

  /** Explode the grenade at index `i` and swap-and-pop it from the active list. */
  private detonateAndRemove(i: number): void {
    const grenade = this.grenades[i];
    this.explodeGrenade(grenade);
    this.spawner.removeGrenade(grenade);

    const last = this.grenades.length - 1;
    if (i !== last) {
      this.grenades[i] = this.grenades[last];
    }
    this.grenades.pop();
  }

  private explodeGrenade(grenade: Grenade): void {
    this.effects.explodeGrenade(
      grenade,
      this.impactEffectsPool,
      this.explosionEffectsPool,
      this.audioManager,
      this.combatantSystem,
      this.playerController
    );
  }

  /**
   * Real lethal payload for a grenade whose fuse ran out in hand (owner
   * decision F2). GrenadeCooking already played the cosmetic blast; here we:
   *   1. kill the player directly (unsurvivable, no self-scale falloff), and
   *   2. run the standard player-attributed explosion at the player's position
   *      so nearby NPCs take blast damage exactly like a thrown frag.
   * The direct kill runs first so the player is already dead when the standard
   * explosion's own-ordnance self-hit branch fires — that branch short-circuits
   * on a dead player and never emits a second `player_killed`.
   */
  private explodeInHand(): void {
    const explosionPos = _inHandPos.copy(this.camera.position);

    if (this.playerHealthSystem) {
      const died = this.playerHealthSystem.takeDamage(
        IN_HAND_LETHAL_DAMAGE,
        explosionPos,
        explosionPos
      );
      if (died) {
        GameEventBus.emit('player_killed', {
          killerId: 'own_grenade_cooked',
          killerFaction: Faction.US,
          position: explosionPos.clone(),
        });
        Logger.info('weapons', 'Player killed by cooked grenade in hand');
      }
    }

    // Blast the surroundings like a normal player frag (attackerId 'PLAYER',
    // no shooterFaction so nearby combatants of any side are hit — a frag has
    // no IFF). The internal self-hit re-entry is a no-op now the player is dead.
    if (this.combatantSystem) {
      this.combatantSystem.applyExplosionDamage(
        explosionPos,
        this.DAMAGE_RADIUS,
        this.MAX_DAMAGE,
        'PLAYER',
        'grenade'
      );
    }
  }

  private getGroundHeight(x: number, z: number): number {
    if (this.terrainSystem) {
      return this.terrainSystem.getEffectiveHeightAt(x, z);
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

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker;
  }

  setHUDSystem(_hudSystem: IHUDSystem): void {
    // Store HUD system reference for power meter updates
    // Type is 'any' to avoid circular dependency with HUDSystem
  }

  setPlayerController(playerController: IPlayerController): void {
    this.playerController = playerController;
  }

  setPlayerHealthSystem(playerHealthSystem: PlayerHealthSystem): void {
    this.playerHealthSystem = playerHealthSystem;
  }

  setFlashbangEffect(flashbangEffect: IFlashbangScreenEffect): void {
    this.effects.setFlashbangEffect(flashbangEffect);
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

  canRenderOverlay(): boolean {
    return this.handView.hasVisibleContent();
  }

  getGrenadeOverlayScene(): THREE.Scene {
    return this.handView.getOverlayScene();
  }

  getGrenadeOverlayCamera(): THREE.Camera {
    return this.handView.getOverlayCamera();
  }

  setGrenadeType(type: GrenadeType): void {
    this.currentGrenadeType = type;
    Logger.info('weapons', `Grenade type set to: ${type.toUpperCase()}`);
  }

  getGrenadeType(): GrenadeType {
    return this.currentGrenadeType;
  }

  /**
   * Spawn a grenade projectile with a given position and velocity.
   * Used by the M79 grenade launcher, air-support rocket runs, and dropped
   * bombs - no cooking/aiming flow, just physics + fuse. `ownerFaction`, when
   * supplied, makes the impact respect IFF (friendlies in the blast are
   * spared); omitting it keeps the legacy damage-everyone behaviour for player
   * ordnance. The `options` bag adds impact ordnance behaviour without changing
   * the existing thrown-grenade / M79 call sites:
   *   - `detonateOnImpact` explodes on first ground contact (long fuse backstop);
   *   - `blastRadius` / `blastDamage` override the legacy 15 m / 150 frag blast.
   */
  spawnProjectile(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    fuseTime: number,
    killFeedWeaponType?: string,
    ownerFaction?: Faction,
    options?: { detonateOnImpact?: boolean; blastRadius?: number; blastDamage?: number },
  ): void {
    const grenade = this.spawner.spawnGrenade(position, velocity, fuseTime, this.nextGrenadeId++, GrenadeType.FRAG);
    if (killFeedWeaponType) grenade.killFeedWeaponType = killFeedWeaponType;
    if (ownerFaction !== undefined) grenade.ownerFaction = ownerFaction;
    if (options?.detonateOnImpact) grenade.detonateOnImpact = true;
    if (options?.blastRadius !== undefined) grenade.blastRadius = options.blastRadius;
    if (options?.blastDamage !== undefined) grenade.blastDamage = options.blastDamage;
    this.grenades.push(grenade);

    if (this.audioManager) {
      this.audioManager.play('grenadeThrow');
    }

    if (this.statsTracker) {
      this.statsTracker.addGrenadeThrow();
    }

    Logger.info('weapons', `${killFeedWeaponType ?? 'M79'} projectile launched (fuse ${fuseTime.toFixed(1)}s)`);
  }

}
