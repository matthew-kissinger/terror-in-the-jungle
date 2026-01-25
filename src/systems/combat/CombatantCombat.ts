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
import { SpatialOctree } from './SpatialOctree';
import { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { objectPool } from '../../utils/ObjectPoolManager';

export interface CombatHitResult {
  hit: boolean;
  point: THREE.Vector3;
  killed?: boolean;
  headshot?: boolean;
  damage?: number;
}

export class CombatantCombat {
  private readonly MAX_ENGAGEMENT_RANGE = 150;

  private tracerPool: TracerPool;
  private muzzleFlashPool: MuzzleFlashPool;
  private impactEffectsPool: ImpactEffectsPool;
  private hitDetection: CombatantHitDetection;
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

  constructor(
    scene: THREE.Scene,
    tracerPool: TracerPool,
    muzzleFlashPool: MuzzleFlashPool,
    impactEffectsPool: ImpactEffectsPool,
    combatantRenderer?: CombatantRenderer
  ) {
    this.tracerPool = tracerPool;
    this.muzzleFlashPool = muzzleFlashPool;
    this.impactEffectsPool = impactEffectsPool;
    this.hitDetection = new CombatantHitDetection();
    this.combatantRenderer = combatantRenderer;
  }

  updateCombat(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    squads: Map<string, Squad>
  ): void {
    // Track player position for death effects
    this.playerPosition.copy(playerPosition);

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

        const muzzlePos = objectPool.getVector3();
        muzzlePos.copy(combatant.position);
        muzzlePos.y += 1.5; // Muzzle height

        const targetFirePos = objectPool.getVector3();
        targetFirePos.copy(targetPos);
        targetFirePos.y += 1.2; // Target center mass

        const fireDirection = objectPool.getVector3();
        fireDirection.subVectors(targetFirePos, muzzlePos).normalize();

        const terrainHit = this.chunkManager.raycastTerrain(muzzlePos, fireDirection, distance);

        objectPool.releaseVector3(fireDirection);
        objectPool.releaseVector3(targetFirePos);
        objectPool.releaseVector3(muzzlePos);

        if (terrainHit.hit && terrainHit.distance! < distance - 0.5) {
          // Terrain blocks shot, don't fire
          combatant.currentBurst--; // Undo burst increment
          return;
        }
      }
    }

    const shotRay = this.calculateAIShot(combatant, playerPosition, accuracyMultiplier);

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
          console.log(`⚠️ Player hit by ${combatant.faction} for ${damage} damage!${playerHit.headshot ? ' (HEADSHOT!)' : ''}`);
        }

        if (this.playerHealthSystem) {
          const playerDied = this.playerHealthSystem.takeDamage(
            damage,
            combatant.position,
            playerPosition
          );
          if (playerDied) {
            console.log(`💀 Player eliminated by ${combatant.faction}!`);
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
    this.spawnCombatEffects(combatant, shotRay, hit, playerPosition, allCombatants, squads);
  }

  private trySuppressiveFire(combatant: Combatant, playerPosition: THREE.Vector3): void {
    if (!combatant.gunCore.canFire() || combatant.burstCooldown > 0) return;

    // Use suppressionTarget if available, otherwise fall back to lastKnownTargetPos
    const targetPos = combatant.suppressionTarget || combatant.lastKnownTargetPos
    if (!targetPos) return;

    combatant.gunCore.registerShot();
    combatant.currentBurst++;

    if (combatant.currentBurst >= combatant.skillProfile.burstLength) {
      combatant.currentBurst = 0;
      combatant.burstCooldown = combatant.skillProfile.burstPauseMs / 1000;
    }

    // Higher spread for suppressive fire - fire at area not point
    const spread = combatant.skillProfile.aimJitterAmplitude * 3.5
    const shotRay = this.calculateSuppressiveShot(combatant, spread, targetPos);

    const distance = combatant.position.distanceTo(playerPosition);
    if (distance < 200) {
      const endPoint = new THREE.Vector3()
        .copy(shotRay.origin)
        .addScaledVector(shotRay.direction, 60 + Math.random() * 40);

      const muzzlePos = combatant.position.clone();
      muzzlePos.y += 1.5;
      this.tracerPool.spawn(muzzlePos, endPoint, 0.3);

      const muzzleFlashPos = muzzlePos.clone();
      muzzleFlashPos.add(shotRay.direction.clone().multiplyScalar(2));
      this.muzzleFlashPool.spawn(muzzleFlashPos, shotRay.direction, 1.2);

      if (this.audioManager) {
        this.audioManager.playGunshotAt(combatant.position);
      }

      if (Math.random() < 0.3) {
        this.impactEffectsPool.spawn(endPoint, shotRay.direction.clone().negate());
      }
    }
  }

  private spawnCombatEffects(
    combatant: Combatant,
    shotRay: THREE.Ray,
    hit: any,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    squads: Map<string, Squad>
  ): void {
    const distance = combatant.position.distanceTo(playerPosition);
    if (distance < 200) {
      const hitPoint = objectPool.getVector3();
      if (hit) {
        hitPoint.copy(hit.point);
      } else {
        hitPoint.copy(shotRay.origin).addScaledVector(shotRay.direction, 80 + Math.random() * 40);
      }

      const tracerStart = objectPool.getVector3();
      const tracerOffset = objectPool.getVector3();
      tracerOffset.set(0, 1.5, 0);
      tracerStart.copy(shotRay.origin).add(tracerOffset);
      this.tracerPool.spawn(tracerStart, hitPoint, 0.3);
      objectPool.releaseVector3(tracerOffset);
      objectPool.releaseVector3(tracerStart);

      const muzzlePos = objectPool.getVector3();
      muzzlePos.copy(combatant.position);
      muzzlePos.y += 1.5;
      const muzzleOffset = objectPool.getVector3();
      muzzleOffset.copy(shotRay.direction).multiplyScalar(2);
      muzzlePos.add(muzzleOffset);
      this.muzzleFlashPool.spawn(muzzlePos, shotRay.direction, 1.2);
      objectPool.releaseVector3(muzzleOffset);
      objectPool.releaseVector3(muzzlePos);

      if (this.audioManager) {
        this.audioManager.playGunshotAt(combatant.position);
      }

      if (hit) {
        const negatedDirection = objectPool.getVector3();
        negatedDirection.copy(shotRay.direction).negate();
        this.impactEffectsPool.spawn(hit.point, negatedDirection);
        objectPool.releaseVector3(negatedDirection);

        const damage = combatant.gunCore.computeDamage(hit.distance, hit.headshot);
        this.applyDamage(hit.combatant, damage, combatant, squads, hit.headshot);

        if (hit.headshot) {
          console.log(`🎯 Headshot! ${combatant.faction} -> ${hit.combatant.faction}`);
        }
      } else {
        // Track near misses for suppression
        this.trackNearMisses(shotRay, hitPoint, combatant.faction, allCombatants, playerPosition)
      }

      objectPool.releaseVector3(hitPoint);
    } else if (hit) {
      const damage = combatant.gunCore.computeDamage(hit.distance, hit.headshot);
      this.applyDamage(hit.combatant, damage, combatant, squads, hit.headshot);
    }
  }

  private trackNearMisses(
    shotRay: THREE.Ray,
    hitPoint: THREE.Vector3,
    shooterFaction: Faction,
    allCombatants: Map<string, Combatant>,
    playerPosition?: THREE.Vector3
  ): void {
    const SUPPRESSION_RADIUS = 5.0

    // Check player for suppression (if OPFOR is shooting)
    if (playerPosition && shooterFaction === Faction.OPFOR && this.playerSuppressionSystem) {
      const distanceToPlayer = hitPoint.distanceTo(playerPosition)

      if (distanceToPlayer < SUPPRESSION_RADIUS) {
        this.playerSuppressionSystem.registerNearMiss(hitPoint, playerPosition)

        // Play bullet whiz sound for very close misses
        if (this.audioManager && distanceToPlayer < 3) {
          this.audioManager.playBulletWhizSound(hitPoint, playerPosition)
        }
      }
    }

    // Check all enemy combatants for proximity to shot
    allCombatants.forEach(combatant => {
      if (combatant.faction === shooterFaction) return
      if (combatant.state === CombatantState.DEAD) return

      const distanceToHit = combatant.position.distanceTo(hitPoint)

      if (distanceToHit < SUPPRESSION_RADIUS) {
        // Track near miss
        combatant.nearMissCount = (combatant.nearMissCount || 0) + 1
        combatant.lastSuppressedTime = Date.now()

        // Increase panic based on proximity
        const proximityFactor = 1.0 - (distanceToHit / SUPPRESSION_RADIUS)
        combatant.panicLevel = Math.min(1.0, combatant.panicLevel + 0.2 * proximityFactor)
        combatant.suppressionLevel = Math.min(1.0, combatant.suppressionLevel + 0.25 * proximityFactor)

        // If heavily suppressed, seek cover
        if (combatant.nearMissCount >= 3 && combatant.panicLevel > 0.6) {
          if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.ADVANCING) {
            combatant.state = CombatantState.SEEKING_COVER
          }
        }
      }
    })
  }

  applyDamage(
    target: Combatant,
    damage: number,
    attacker?: Combatant,
    squads?: Map<string, Squad>,
    isHeadshot: boolean = false
  ): void {
    // Check if target is valid before accessing properties
    if (!target) {
      console.warn('⚠️ applyDamage called with undefined target');
      return;
    }

    if ((target as any).isPlayerProxy) {
      if (this.playerHealthSystem) {
        const killed = this.playerHealthSystem.takeDamage(
          damage,
          attacker?.position,
          target.position
        );
        if (killed && this.hudSystem) {
          this.hudSystem.addDeath();

          // Add player death to kill feed
          if (attacker) {
            const killerName = `${attacker.faction}-${attacker.id.slice(-4)}`;
            this.hudSystem.addKillToFeed(
              killerName,
              attacker.faction,
              'PLAYER',
              Faction.US,
              isHeadshot,
              'rifle' // AI combatants use rifles
            );
          }
        }
      }
      return;
    }

    target.health -= damage;
    target.lastHitTime = Date.now();
    target.suppressionLevel = Math.min(1.0, target.suppressionLevel + 0.3);

    // Trigger damage flash effect in shader
    if (this.combatantRenderer) {
      this.combatantRenderer.setDamageFlash(target.id, 1.0);
    }

    if (target.health <= 0) {
      target.state = CombatantState.DEAD;

      // Initialize death animation
      target.isDying = true;
      target.deathProgress = 0;
      target.deathStartTime = performance.now();

      // Calculate death direction (direction from attacker to target)
      if (attacker && attacker.position) {
        const deathDir = new THREE.Vector3()
          .subVectors(target.position, attacker.position)
          .normalize();
        deathDir.y = 0; // Keep horizontal
        target.deathDirection = deathDir;
      } else {
        // Default to falling backward
        const fallbackDir = new THREE.Vector3(
          Math.cos(target.rotation),
          0,
          Math.sin(target.rotation)
        ).multiplyScalar(-1);
        target.deathDirection = fallbackDir;
      }

      console.log(`💀 ${target.faction} soldier eliminated${attacker ? ` by ${attacker.faction}` : ''}`);

      // Death visual effects
      // 1. Blood splatter at death position
      const bloodPosition = target.position.clone();
      bloodPosition.y += 1.5; // Chest height
      const splatterDirection = target.deathDirection ? target.deathDirection.clone().negate() : new THREE.Vector3(0, 0, 1);
      this.impactEffectsPool.spawn(bloodPosition, splatterDirection);

      // 2. Camera shake for nearby deaths
      if (this.cameraShakeSystem) {
        this.cameraShakeSystem.shakeFromNearbyDeath(target.position, this.playerPosition);
      }

      if (this.audioManager) {
        const isAlly = target.faction === Faction.US;
        this.audioManager.playDeathSound(target.position, isAlly);
      }

      if (this.ticketSystem) {
        this.ticketSystem.onCombatantDeath(target.faction);
      }

      // Add to kill feed (AI-on-AI kills)
      if (this.hudSystem && attacker && !attacker.isPlayerProxy) {
        const killerName = `${attacker.faction}-${attacker.id.slice(-4)}`;
        const victimName = `${target.faction}-${target.id.slice(-4)}`;
        this.hudSystem.addKillToFeed(
          killerName,
          attacker.faction,
          victimName,
          target.faction,
          isHeadshot,
          'rifle' // AI combatants use rifles
        );
      }

      if (target.squadId && squads) {
        const squad = squads.get(target.squadId);
        if (squad) {
          const index = squad.members.indexOf(target.id);
          if (index > -1) {
            squad.members.splice(index, 1);
          }
        }
      }
    }
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
      this.applyDamage(hit.combatant, damage, undefined, undefined, hit.headshot);

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

    const endPoint = new THREE.Vector3()
      .copy(ray.origin)
      .addScaledVector(ray.direction, this.MAX_ENGAGEMENT_RANGE);
    return { hit: false, point: endPoint };
  }

  private calculateAIShot(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    accuracyMultiplier: number = 1.0
  ): THREE.Ray {
    if (!combatant.target) {
      const forward = new THREE.Vector3(
        Math.cos(combatant.rotation),
        0,
        Math.sin(combatant.rotation)
      );
      return new THREE.Ray(combatant.position.clone(), forward);
    }

    const targetPos = combatant.target.id === 'PLAYER'
      ? playerPosition.clone().add(new THREE.Vector3(0, -0.6, 0))
      : combatant.target.position;

    const toTarget = new THREE.Vector3()
      .subVectors(targetPos, combatant.position);

    if (combatant.target.id !== 'PLAYER' && combatant.target.velocity.length() > 0.1) {
      const timeToTarget = toTarget.length() / 800;
      const leadAmount = combatant.skillProfile.leadingErrorFactor;
      toTarget.addScaledVector(combatant.target.velocity, timeToTarget * leadAmount);
    }

    toTarget.normalize();

    const jitter = combatant.skillProfile.aimJitterAmplitude * accuracyMultiplier;
    const jitterRad = THREE.MathUtils.degToRad(jitter);

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(toTarget, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, toTarget).normalize();

    const jitterX = (Math.random() - 0.5) * jitterRad;
    const jitterY = (Math.random() - 0.5) * jitterRad;

    const finalDirection = toTarget.clone()
      .addScaledVector(right, Math.sin(jitterX))
      .addScaledVector(realUp, Math.sin(jitterY))
      .normalize();

    const origin = combatant.position.clone();
    origin.y += 1.5;

    return new THREE.Ray(origin, finalDirection);
  }

  private calculateSuppressiveShot(combatant: Combatant, spread: number, targetPos?: THREE.Vector3): THREE.Ray {
    const target = targetPos || combatant.lastKnownTargetPos
    if (!target) {
      const forward = new THREE.Vector3(
        Math.cos(combatant.rotation),
        0,
        Math.sin(combatant.rotation)
      );
      return new THREE.Ray(combatant.position.clone(), forward);
    }

    const toTarget = new THREE.Vector3()
      .subVectors(target, combatant.position)
      .normalize();

    const spreadRad = THREE.MathUtils.degToRad(spread);
    const theta = Math.random() * Math.PI * 2;
    const r = Math.random() * spreadRad;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(toTarget, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, toTarget).normalize();

    const finalDirection = toTarget.clone()
      .addScaledVector(right, Math.cos(theta) * r)
      .addScaledVector(realUp, Math.sin(theta) * r)
      .normalize();

    const origin = combatant.position.clone();
    origin.y += 1.5;

    return new THREE.Ray(origin, finalDirection);
  }

  checkPlayerHit(ray: THREE.Ray, playerPosition: THREE.Vector3): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    return this.hitDetection.checkPlayerHit(ray, playerPosition);
  }

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
  }

  setTicketSystem(system: TicketSystem): void {
    this.ticketSystem = system;
  }

  setHUDSystem(system: any): void {
    this.hudSystem = system;
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  setPlayerSuppressionSystem(system: PlayerSuppressionSystem): void {
    this.playerSuppressionSystem = system;
  }

  setCameraShakeSystem(system: CameraShakeSystem): void {
    this.cameraShakeSystem = system;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }
}