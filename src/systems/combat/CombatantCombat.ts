import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantHitDetection } from './CombatantHitDetection';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { CombatantRenderer } from './CombatantRenderer';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { VoiceCalloutSystem, CalloutType } from '../audio/VoiceCalloutSystem';
import { Logger } from '../../utils/Logger';
// Extracted modules
import { CombatantBallistics } from './CombatantBallistics';
import { CombatantDamage } from './CombatantDamage';
import { CombatantSuppression } from './CombatantSuppression';
import { CombatantCombatEffects } from './CombatantCombatEffects';

export interface CombatHitResult {
  hit: boolean;
  point: THREE.Vector3;
  killed?: boolean;
  headshot?: boolean;
  damage?: number;
}

export class CombatantCombat {
  private readonly MAX_ENGAGEMENT_RANGE = 150;

  private impactEffectsPool: ImpactEffectsPool;
  public hitDetection: CombatantHitDetection;
  private playerHealthSystem?: PlayerHealthSystem;
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;
  private hudSystem?: any;
  private chunkManager?: ImprovedChunkManager;
  private combatantRenderer?: CombatantRenderer;
  private sandbagSystem?: SandbagSystem;
  private playerSuppressionSystem?: PlayerSuppressionSystem;
  private cameraShakeSystem?: CameraShakeSystem;
  private camera?: THREE.Camera;
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private voiceCalloutSystem?: VoiceCalloutSystem;

  // Extracted modules
  private ballistics: CombatantBallistics;
  private damage: CombatantDamage;
  private suppression: CombatantSuppression;
  private effects: CombatantCombatEffects;

  // Pre-allocated scratch vectors to avoid per-frame allocations in hot paths
  private readonly scratchEndPoint = new THREE.Vector3();
  // Module-level scratch vectors for fire loop (replaces pool allocations)
  private readonly _muzzlePos = new THREE.Vector3();
  private readonly _targetFirePos = new THREE.Vector3();
  private readonly _fireDirection = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    tracerPool: TracerPool,
    muzzleFlashPool: MuzzleFlashPool,
    impactEffectsPool: ImpactEffectsPool,
    combatantRenderer?: CombatantRenderer
  ) {
    this.impactEffectsPool = impactEffectsPool;
    this.hitDetection = new CombatantHitDetection();
    this.combatantRenderer = combatantRenderer;

    // Initialize extracted modules
    this.ballistics = new CombatantBallistics();
    this.damage = new CombatantDamage();
    this.damage.setImpactEffectsPool(impactEffectsPool);
    this.suppression = new CombatantSuppression();
    this.effects = new CombatantCombatEffects(
      tracerPool,
      muzzleFlashPool,
      impactEffectsPool,
      this.damage,
      this.suppression
    );
  }

  // NOTE: Spatial grid is now managed by SpatialGridManager singleton
  // CombatantHitDetection uses it automatically

  updateCombat(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    squads: Map<string, Squad>
  ): void {
    // Track player position for death effects
    this.playerPosition.copy(playerPosition);
    this.damage.updatePlayerPosition(playerPosition);

    // Handle weapon cooldowns
    combatant.gunCore.cooldown(deltaTime);
    combatant.burstCooldown -= deltaTime;

    // Try to fire if engaged
    if (combatant.state === CombatantState.ENGAGING && combatant.target) {
      this.tryFireWeapon(combatant, playerPosition, allCombatants, squads);
    } else if (combatant.state === CombatantState.SUPPRESSING && combatant.lastKnownTargetPos) {
      this.trySuppressiveFire(combatant, playerPosition);
    }
  }

  private tryFireWeapon(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    squads: Map<string, Squad>
  ): void {
    if (!combatant.gunCore.canFire() || combatant.burstCooldown > 0) return;

    // Check burst control
    if (combatant.currentBurst >= combatant.skillProfile.burstLength) {
      combatant.currentBurst = 0;
      combatant.burstCooldown = combatant.skillProfile.burstPauseMs / 1000;
      if (this.voiceCalloutSystem && Math.random() < 0.15) {
        this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.RELOADING, combatant.position);
      }
      return;
    }

    // Fire shot
    combatant.gunCore.registerShot();
    combatant.currentBurst++;
    combatant.lastShotTime = performance.now();

    // Voice callout: First shot in burst - "Contact!" or "Engaging!"
    if (combatant.currentBurst === 1 && this.voiceCalloutSystem && Math.random() < 0.3) {
      this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.CONTACT, combatant.position);
    }

    // Calculate accuracy multiplier
    let accuracyMultiplier = 1.0;
    if (combatant.currentBurst === 1) {
      accuracyMultiplier = combatant.skillProfile.firstShotAccuracy || 0.4; // Reduced first shot bonus
    } else {
      const degradation = combatant.skillProfile.burstDegradation || 3.5; // Increased burst degradation
      accuracyMultiplier = 1.0 + (combatant.currentBurst - 1) * degradation / 2;
      accuracyMultiplier = Math.min(accuracyMultiplier, 8.0); // Increased max inaccuracy
    }

    if (combatant.isFullAuto) {
      accuracyMultiplier *= 2.0; // Increased full auto penalty
    }

    // Apply flashbang disorientation penalty
    if (combatant.flashDisorientedUntil && Date.now() < combatant.flashDisorientedUntil) {
      // Severe accuracy penalty while disoriented (4x inaccuracy)
      accuracyMultiplier *= 4.0;
    }

    // Add distance-based accuracy degradation
    const targetPos = combatant.target?.id === 'PLAYER' ? playerPosition : combatant.target?.position;
    if (targetPos) {
      const distance = combatant.position.distanceTo(targetPos);

      // Exponential accuracy falloff over distance
      if (distance > 30) {
        const distancePenalty = Math.pow(1.5, (distance - 30) / 20); // Exponential growth
        accuracyMultiplier *= Math.min(distancePenalty, 8.0); // Cap at 8x inaccuracy
      }

      // Check terrain obstruction before firing - only for high/medium LOD combatants
      if (this.chunkManager && combatant.lodLevel &&
          (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

        // Use module-level scratch vectors instead of pool allocation
        this._muzzlePos.copy(combatant.position);
        this._muzzlePos.y += 1.5; // Muzzle height

        this._targetFirePos.copy(targetPos);
        this._targetFirePos.y += 1.2; // Target center mass

        this._fireDirection.subVectors(this._targetFirePos, this._muzzlePos).normalize();

        const terrainHit = this.chunkManager.raycastTerrain(this._muzzlePos, this._fireDirection, distance);

        if (terrainHit.hit && terrainHit.distance! < distance - 0.5) {
          // Terrain blocks shot, don't fire
          combatant.currentBurst--; // Undo burst increment
          return;
        }
      }
    }

    const shotRay = this.ballistics.calculateAIShot(combatant, playerPosition, accuracyMultiplier);

    // Check hit results
    let hit: any = null;
    if (combatant.target && combatant.target.id === 'PLAYER') {
      const playerHit = this.hitDetection.checkPlayerHit(shotRay, playerPosition);
      if (playerHit.hit) {
        const damage = combatant.gunCore.computeDamage(
          combatant.position.distanceTo(playerPosition),
          playerHit.headshot
        );

        if (playerHit.headshot || damage > 30) {
          Logger.debug('Combat', `Player hit by ${combatant.faction} for ${damage} damage!${playerHit.headshot ? ' (HEADSHOT!)' : ''}`);
        }

        if (this.playerHealthSystem) {
          const playerDied = this.playerHealthSystem.takeDamage(
            damage,
            combatant.position,
            playerPosition
          );
          if (playerDied) {
            Logger.info('Combat', `Player eliminated by ${combatant.faction}!`);
          }
        }

        combatant.consecutiveMisses = 0;
        hit = {
          point: playerHit.point,
          distance: combatant.position.distanceTo(playerPosition),
          headshot: playerHit.headshot
        };
      } else {
        combatant.consecutiveMisses++;

        // Voice callout: Taking fire (near miss on player triggers callout)
        if (this.voiceCalloutSystem && Math.random() < 0.15) {
          this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.TAKING_FIRE, combatant.position);
        }
      }
    } else {
      hit = this.hitDetection.raycastCombatants(shotRay, combatant.faction, allCombatants);
    }

    // Spawn visual effects
    this.effects.spawnCombatEffects(combatant, shotRay, hit, playerPosition, allCombatants, squads);
  }

  private trySuppressiveFire(combatant: Combatant, playerPosition: THREE.Vector3): void {
    if (!combatant.gunCore.canFire() || combatant.burstCooldown > 0) return;

    // Use suppressionTarget if available, otherwise fall back to lastKnownTargetPos
    const targetPos = combatant.suppressionTarget || combatant.lastKnownTargetPos;
    if (!targetPos) return;

    combatant.gunCore.registerShot();
    combatant.currentBurst++;

    // Voice callout: Suppressing fire
    if (combatant.currentBurst === 1 && this.voiceCalloutSystem && Math.random() < 0.2) {
      this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.SUPPRESSING, combatant.position);
    }

    if (combatant.currentBurst >= combatant.skillProfile.burstLength) {
      combatant.currentBurst = 0;
      combatant.burstCooldown = combatant.skillProfile.burstPauseMs / 1000;
      if (this.voiceCalloutSystem && Math.random() < 0.15) {
        this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.RELOADING, combatant.position);
      }
    }

    // Higher spread for suppressive fire - fire at area not point
    const spread = combatant.skillProfile.aimJitterAmplitude * 3.5;
    const shotRay = this.ballistics.calculateSuppressiveShot(combatant, spread, targetPos);

    this.effects.spawnSuppressiveFireEffects(combatant, shotRay, playerPosition);
  }


  handlePlayerShot(
    ray: THREE.Ray,
    damageCalculator: (distance: number, isHeadshot: boolean) => number,
    allCombatants: Map<string, Combatant>,
    weaponType: string = 'rifle'
  ): CombatHitResult {
    if (this.sandbagSystem) {
      const hitSandbag = this.sandbagSystem.checkRayIntersection(ray);
      if (hitSandbag) {
        const intersectionPoint = this.sandbagSystem.getRayIntersectionPoint(ray);
        if (intersectionPoint) {
          this.impactEffectsPool.spawn(intersectionPoint, ray.direction);
          return { hit: true, point: intersectionPoint, killed: false };
        }
      }
    }

    const hit = this.hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

    if (hit) {
      const damage = damageCalculator(hit.distance, hit.headshot);
      const targetHealth = hit.combatant.health;
      this.damage.applyDamage(hit.combatant, damage, undefined, undefined, hit.headshot);

      const killed = targetHealth > 0 && hit.combatant.health <= 0;

      if (killed && this.hudSystem) {
        this.hudSystem.addKill(hit.headshot);

        // Add player kill to feed with weapon type
        const victimName = `${hit.combatant.faction}-${hit.combatant.id.slice(-4)}`;
        this.hudSystem.addKillToFeed(
          'PLAYER',
          Faction.US,
          victimName,
          hit.combatant.faction,
          hit.headshot,
          weaponType
        );
      }

      return { hit: true, point: hit.point, killed, headshot: hit.headshot, damage };
    }

    this.scratchEndPoint.copy(ray.origin)
      .addScaledVector(ray.direction, this.MAX_ENGAGEMENT_RANGE);
    return { hit: false, point: this.scratchEndPoint };
  }

  // Public API maintained for backward compatibility
  applyDamage(
    target: Combatant,
    damage: number,
    attacker?: Combatant,
    squads?: Map<string, Squad>,
    isHeadshot: boolean = false,
    allCombatants?: Map<string, Combatant>
  ): void {
    this.damage.applyDamage(target, damage, attacker, squads, isHeadshot, allCombatants);
  }

  checkPlayerHit(ray: THREE.Ray, playerPosition: THREE.Vector3): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    return this.hitDetection.checkPlayerHit(ray, playerPosition);
  }

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
    this.damage.setPlayerHealthSystem(system);
  }

  setTicketSystem(system: TicketSystem): void {
    this.ticketSystem = system;
    this.damage.setTicketSystem(system);
  }

  setHUDSystem(system: any): void {
    this.hudSystem = system;
    this.damage.setHUDSystem(system);
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
    this.damage.setAudioManager(manager);
    this.suppression.setAudioManager(manager);
    this.effects.setAudioManager(manager);
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  setPlayerSuppressionSystem(system: PlayerSuppressionSystem): void {
    this.playerSuppressionSystem = system;
    this.suppression.setPlayerSuppressionSystem(system);
  }

  setCameraShakeSystem(system: CameraShakeSystem): void {
    this.cameraShakeSystem = system;
    this.damage.setCameraShakeSystem(system);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setVoiceCalloutSystem(system: VoiceCalloutSystem): void {
    this.voiceCalloutSystem = system;
    this.damage.setVoiceCalloutSystem(system);
    this.effects.setVoiceCalloutSystem(system);
  }

  setCombatantRenderer(renderer: CombatantRenderer): void {
    this.combatantRenderer = renderer;
    this.damage.setCombatantRenderer(renderer);
  }
}
