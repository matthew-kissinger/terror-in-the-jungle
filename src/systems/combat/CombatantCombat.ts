import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad, isPlayerTarget } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantHitDetection } from './CombatantHitDetection';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { CombatantRenderer } from './CombatantRenderer';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { Logger } from '../../utils/Logger';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { tryConsumeCombatFireRaycast } from './ai/CombatFireRaycastBudget';
// Extracted modules
import { CombatantBallistics } from './CombatantBallistics';
import { CombatantDamage } from './CombatantDamage';
import { CombatantSuppression } from './CombatantSuppression';
import { CombatantCombatEffects } from './CombatantCombatEffects';
import { GameEventBus } from '../../core/GameEventBus';
import {
  copyNpcCenterMassPosition,
  copyNpcMuzzlePosition,
  copyPlayerCenterMassPosition,
} from './CombatantBodyMetrics';
import { isWorldBuilderFlagActive } from '../../dev/worldBuilder/WorldBuilderConsole';

export interface CombatHitResult {
  hit: boolean;
  point: THREE.Vector3;
  killed?: boolean;
  headshot?: boolean;
  damage?: number;
}

export class CombatantCombat {
  private readonly MAX_ENGAGEMENT_RANGE = 280;
  private readonly TERRAIN_SAMPLE_STEP = 2.0;
  private readonly TERRAIN_OCCLUSION_EPSILON = 0.15;
  private readonly CLOSE_RANGE_OCCLUSION_BYPASS = 200;

  private impactEffectsPool: ImpactEffectsPool;
  public hitDetection: CombatantHitDetection;
  private playerHealthSystem?: PlayerHealthSystem;
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;
  private hudSystem?: IHUDSystem;
  private terrainSystem?: ITerrainRuntime;
  private combatantRenderer?: CombatantRenderer;
  private sandbagSystem?: SandbagSystem;
  private playerSuppressionSystem?: PlayerSuppressionSystem;
  private cameraShakeSystem?: CameraShakeSystem;
  private camera?: THREE.Camera;
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  // Extracted modules
  private ballistics: CombatantBallistics;
  private damage: CombatantDamage;
  private suppression: CombatantSuppression;
  private effects: CombatantCombatEffects;

  // Pre-allocated scratch vectors to avoid per-frame allocations in hot paths
  private readonly scratchEndPoint = new THREE.Vector3();
  private readonly scratchSamplePoint = new THREE.Vector3();
  // Module-level scratch vectors for fire loop (replaces pool allocations)
  private readonly _muzzlePos = new THREE.Vector3();
  private readonly _targetFirePos = new THREE.Vector3();
  private readonly _fireDirection = new THREE.Vector3();

  // Player-as-attacker proxy. Mirrors the `_playerTarget` pattern in
  // AITargetAcquisition: the player is not a Combatant, but downstream damage
  // code (death direction, assist tracking, kill-feed attribution) needs a
  // stable reference with id/faction/position. Mutations back to this proxy
  // (e.g. attacker.kills++) are guarded via isPlayerTarget() in CombatantDamage.
  private readonly _playerAttackerProxy: Combatant = {
    id: 'PLAYER',
    kind: 'player',
    faction: Faction.US,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.ENGAGING,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant;

  constructor(
    scene: THREE.Scene,
    tracerPool: TracerPool,
    muzzleFlashSystem: MuzzleFlashSystem,
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
      muzzleFlashSystem,
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
    // Stop combat if game is not active
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      return;
    }

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
      return;
    }

    // Fire shot
    combatant.gunCore.registerShot();
    combatant.currentBurst++;
    combatant.lastShotTime = performance.now();

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
    const targetPos = isPlayerTarget(combatant.target) ? playerPosition : combatant.target?.position;
    if (targetPos) {
      const distance = combatant.position.distanceTo(targetPos);

      // Exponential accuracy falloff over distance
      if (distance > 30) {
        const distancePenalty = Math.pow(1.5, (distance - 30) / 20); // Exponential growth
        accuracyMultiplier *= Math.min(distancePenalty, 8.0); // Cap at 8x inaccuracy
      }

      // Check terrain obstruction before firing - only for high/medium LOD combatants
      if (this.terrainSystem && combatant.lodLevel &&
          (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {
        // Budget expensive terrain confirmation checks to avoid burst-frame spikes.
        if (!tryConsumeCombatFireRaycast()) {
          combatant.currentBurst--; // Undo burst increment
          return;
        }

        // Use module-level scratch vectors instead of pool allocation
        copyNpcMuzzlePosition(this._muzzlePos, combatant.position);

        if (isPlayerTarget(combatant.target)) {
          copyPlayerCenterMassPosition(this._targetFirePos, targetPos);
        } else {
          copyNpcCenterMassPosition(this._targetFirePos, targetPos);
        }

        this._fireDirection.subVectors(this._targetFirePos, this._muzzlePos).normalize();

        const terrainHit = this.terrainSystem.raycastTerrain(this._muzzlePos, this._fireDirection, distance);

        if (terrainHit.hit && terrainHit.distance! < distance - 0.5) {
          // Terrain blocks shot, don't fire
          combatant.currentBurst--; // Undo burst increment
          return;
        }
      }
    }

    const shotRay = this.ballistics.calculateAIShot(combatant, playerPosition, accuracyMultiplier);

    // Check hit results
    let hit: { combatant: Combatant; distance: number; point: THREE.Vector3; headshot: boolean } | { point: THREE.Vector3; distance: number; headshot: boolean } | null = null;
    if (isPlayerTarget(combatant.target)) {
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

    if (combatant.currentBurst >= combatant.skillProfile.burstLength) {
      combatant.currentBurst = 0;
      combatant.burstCooldown = combatant.skillProfile.burstPauseMs / 1000;
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

    const hit = this.hitDetection.raycastCombatants(ray, Faction.US, allCombatants, { positionMode: 'visual' });
    const terrainHit = this.terrainSystem
      ? this.terrainSystem.raycastTerrain(ray.origin, ray.direction, this.MAX_ENGAGEMENT_RANGE)
      : { hit: false as const };

    if (hit && terrainHit.hit && terrainHit.distance !== undefined && terrainHit.distance < hit.distance - 0.5) {
      if (terrainHit.point) {
        this.impactEffectsPool.spawn(terrainHit.point, ray.direction);
        return { hit: false, point: terrainHit.point };
      }
      this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, terrainHit.distance);
      this.impactEffectsPool.spawn(this.scratchEndPoint, ray.direction);
      return { hit: false, point: this.scratchEndPoint };
    }

    if (hit && this.isBlockedByHeightProfile(ray, hit.distance)) {
      const blockDistance = this.findHeightProfileBlockDistance(ray, hit.distance);
      this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, blockDistance);
      this.impactEffectsPool.spawn(this.scratchEndPoint, ray.direction);
      return { hit: false, point: this.scratchEndPoint };
    }

    if (hit) {
      const baseDamage = damageCalculator(hit.distance, hit.headshot);
      const damage = import.meta.env.DEV && isWorldBuilderFlagActive('oneShotKills')
        ? Math.max(baseDamage, hit.combatant.health)
        : baseDamage;
      const targetHealth = hit.combatant.health;
      // Keep proxy position current so deathDirection / AI threat bearing are
      // oriented from where the player actually stood when the shot resolved.
      this._playerAttackerProxy.position.copy(this.playerPosition);
      this.damage.applyDamage(hit.combatant, damage, this._playerAttackerProxy, undefined, hit.headshot);

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

      if (killed) {
        GameEventBus.emit('player_kill', {
          victimId: hit.combatant.id,
          victimFaction: hit.combatant.faction,
          isHeadshot: hit.headshot,
          weaponType,
        });
      }

      return { hit: true, point: hit.point, killed, headshot: hit.headshot, damage };
    }

    if (terrainHit.hit) {
      if (terrainHit.point) {
        this.impactEffectsPool.spawn(terrainHit.point, ray.direction);
        return { hit: false, point: terrainHit.point };
      }
      if (terrainHit.distance !== undefined) {
        this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, terrainHit.distance);
        this.impactEffectsPool.spawn(this.scratchEndPoint, ray.direction);
        return { hit: false, point: this.scratchEndPoint };
      }
    }

    this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, this.MAX_ENGAGEMENT_RANGE);
    return { hit: false, point: this.scratchEndPoint };
  }

  previewPlayerShot(
    ray: THREE.Ray,
    allCombatants: Map<string, Combatant>,
  ): CombatHitResult {
    if (this.sandbagSystem) {
      const hitSandbag = this.sandbagSystem.checkRayIntersection(ray);
      if (hitSandbag) {
        const intersectionPoint = this.sandbagSystem.getRayIntersectionPoint(ray);
        if (intersectionPoint) {
          return { hit: false, point: intersectionPoint };
        }
      }
    }

    const hit = this.hitDetection.raycastCombatants(ray, Faction.US, allCombatants, { positionMode: 'visual' });
    const terrainHit = this.terrainSystem
      ? this.terrainSystem.raycastTerrain(ray.origin, ray.direction, this.MAX_ENGAGEMENT_RANGE)
      : { hit: false as const };

    if (hit && terrainHit.hit && terrainHit.distance !== undefined && terrainHit.distance < hit.distance - 0.5) {
      if (terrainHit.point) {
        return { hit: false, point: terrainHit.point };
      }
      this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, terrainHit.distance);
      return { hit: false, point: this.scratchEndPoint };
    }

    if (hit && this.isBlockedByHeightProfile(ray, hit.distance)) {
      const blockDistance = this.findHeightProfileBlockDistance(ray, hit.distance);
      this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, blockDistance);
      return { hit: false, point: this.scratchEndPoint };
    }

    if (hit) {
      return { hit: true, point: hit.point, headshot: hit.headshot };
    }

    if (terrainHit.hit) {
      if (terrainHit.point) {
        return { hit: false, point: terrainHit.point };
      }
      if (terrainHit.distance !== undefined) {
        this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, terrainHit.distance);
        return { hit: false, point: this.scratchEndPoint };
      }
    }

    this.scratchEndPoint.copy(ray.origin).addScaledVector(ray.direction, this.MAX_ENGAGEMENT_RANGE);
    return { hit: false, point: this.scratchEndPoint };
  }

  private isBlockedByHeightProfile(ray: THREE.Ray, maxDistance: number): boolean {
    if (!this.terrainSystem) {
      return false;
    }

    // Heightfield prefilter is too coarse for close combat on steep terrain.
    if (maxDistance <= this.CLOSE_RANGE_OCCLUSION_BYPASS) {
      return false;
    }

    const end = Math.min(maxDistance, this.MAX_ENGAGEMENT_RANGE);
    if (!Number.isFinite(end) || end <= this.TERRAIN_SAMPLE_STEP) return false;

    for (let d = this.TERRAIN_SAMPLE_STEP; d < end; d += this.TERRAIN_SAMPLE_STEP) {
      this.scratchSamplePoint.copy(ray.origin).addScaledVector(ray.direction, d);
      const terrainY = this.terrainSystem.getEffectiveHeightAt(this.scratchSamplePoint.x, this.scratchSamplePoint.z);
      if (terrainY + this.TERRAIN_OCCLUSION_EPSILON >= this.scratchSamplePoint.y) {
        return true;
      }
    }

    return false;
  }

  private findHeightProfileBlockDistance(ray: THREE.Ray, maxDistance: number): number {
    if (!this.terrainSystem) {
      return Math.min(maxDistance, this.MAX_ENGAGEMENT_RANGE);
    }

    if (maxDistance <= this.CLOSE_RANGE_OCCLUSION_BYPASS) {
      return Math.min(maxDistance, this.MAX_ENGAGEMENT_RANGE);
    }

    const end = Math.min(maxDistance, this.MAX_ENGAGEMENT_RANGE);
    if (!Number.isFinite(end) || end <= this.TERRAIN_SAMPLE_STEP) return end;

    for (let d = this.TERRAIN_SAMPLE_STEP; d < end; d += this.TERRAIN_SAMPLE_STEP) {
      this.scratchSamplePoint.copy(ray.origin).addScaledVector(ray.direction, d);
      const terrainY = this.terrainSystem.getEffectiveHeightAt(this.scratchSamplePoint.x, this.scratchSamplePoint.z);
      if (terrainY + this.TERRAIN_OCCLUSION_EPSILON >= this.scratchSamplePoint.y) {
        return d;
      }
    }

    return end;
  }

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

  setHUDSystem(system: import('../../types/SystemInterfaces').IHUDSystem): void {
    this.hudSystem = system;
    this.damage.setHUDSystem(system);
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
    this.damage.setAudioManager(manager);
    this.suppression.setAudioManager(manager);
    this.effects.setAudioManager(manager);
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
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

  setCombatantRenderer(renderer: CombatantRenderer): void {
    this.combatantRenderer = renderer;
    this.damage.setCombatantRenderer(renderer);
  }

  setSpatialQueryProvider(provider: (center: THREE.Vector3, radius: number) => string[]): void {
    this.hitDetection.setQueryProvider(provider);
    this.suppression.setQueryProvider(provider);
  }
}
