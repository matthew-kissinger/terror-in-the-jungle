import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Combatant, Squad } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { AudioManager } from '../audio/AudioManager';
import { CombatantDamage } from './CombatantDamage';
import { CombatantSuppression } from './CombatantSuppression';
import { VoiceCalloutSystem, CalloutType } from '../audio/VoiceCalloutSystem';
import { objectPool } from '../../utils/ObjectPoolManager';

/**
 * CombatantCombatEffects - Handles all visual and audio effect spawning for combat actions
 *
 * Responsibilities:
 * - Tracer effect spawning
 * - Muzzle flash spawning
 * - Impact effect spawning
 * - Audio effect triggering (gunshots)
 * - Suppression near-miss tracking
 */
export class CombatantCombatEffects {
  private tracerPool: TracerPool;
  private muzzleFlashPool: MuzzleFlashPool;
  private impactEffectsPool: ImpactEffectsPool;
  private audioManager?: AudioManager;
  private voiceCalloutSystem?: VoiceCalloutSystem;
  private damage: CombatantDamage;
  private suppression: CombatantSuppression;

  // Pre-allocated scratch vectors for suppressive fire effects
  private readonly scratchEndPoint = new THREE.Vector3();
  private readonly scratchMuzzlePos = new THREE.Vector3();
  private readonly scratchMuzzleFlashPos = new THREE.Vector3();
  private readonly scratchSplatterDir = new THREE.Vector3();

  constructor(
    tracerPool: TracerPool,
    muzzleFlashPool: MuzzleFlashPool,
    impactEffectsPool: ImpactEffectsPool,
    damage: CombatantDamage,
    suppression: CombatantSuppression
  ) {
    this.tracerPool = tracerPool;
    this.muzzleFlashPool = muzzleFlashPool;
    this.impactEffectsPool = impactEffectsPool;
    this.damage = damage;
    this.suppression = suppression;
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
  }

  setVoiceCalloutSystem(system: VoiceCalloutSystem): void {
    this.voiceCalloutSystem = system;
  }

  /**
   * Spawn all combat effects for a shot (tracer, muzzle flash, impact, audio)
   */
  spawnCombatEffects(
    combatant: Combatant,
    shotRay: THREE.Ray,
    hit: { combatant: Combatant; distance: number; point: THREE.Vector3; headshot: boolean } | { point: THREE.Vector3; distance: number; headshot: boolean } | null,
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

        // Only apply damage if hit has a combatant (not a player hit)
        if ('combatant' in hit) {
          const damage = combatant.gunCore.computeDamage(hit.distance, hit.headshot);
          const wasAlive = hit.combatant.health > 0;
          this.damage.applyDamage(hit.combatant, damage, combatant, squads, hit.headshot, allCombatants);

          // Voice callout: Target down (if kill confirmed)
          if (wasAlive && hit.combatant.health <= 0 && this.voiceCalloutSystem && Math.random() < 0.4) {
            this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.TARGET_DOWN, combatant.position);
          }

          if (hit.headshot) {
            Logger.info('combat', ` Headshot! ${combatant.faction} -> ${hit.combatant.faction}`);
          }
        }
      } else {
        // Track near misses for suppression
        this.suppression.trackNearMisses(shotRay, hitPoint, combatant.faction, allCombatants, playerPosition);
      }

      objectPool.releaseVector3(hitPoint);
    } else if (hit && 'combatant' in hit) {
      const damage = combatant.gunCore.computeDamage(hit.distance, hit.headshot);
      this.damage.applyDamage(hit.combatant, damage, combatant, squads, hit.headshot, allCombatants);
    }
  }

  /**
   * Spawn suppressive fire effects (tracer, muzzle flash, audio, random impacts)
   */
  spawnSuppressiveFireEffects(
    combatant: Combatant,
    shotRay: THREE.Ray,
    playerPosition: THREE.Vector3
  ): void {
    const distance = combatant.position.distanceTo(playerPosition);
    if (distance < 200) {
      // Use scratch vectors to avoid allocations
      this.scratchEndPoint.copy(shotRay.origin)
        .addScaledVector(shotRay.direction, 60 + Math.random() * 40);

      this.scratchMuzzlePos.copy(combatant.position);
      this.scratchMuzzlePos.y += 1.5;
      this.tracerPool.spawn(this.scratchMuzzlePos, this.scratchEndPoint, 0.3);

      this.scratchMuzzleFlashPos.copy(this.scratchMuzzlePos);
      this.scratchMuzzleFlashPos.addScaledVector(shotRay.direction, 2);
      this.muzzleFlashPool.spawn(this.scratchMuzzleFlashPos, shotRay.direction, 1.2);

      if (this.audioManager) {
        this.audioManager.playGunshotAt(combatant.position);
      }

      if (Math.random() < 0.3) {
        this.scratchSplatterDir.copy(shotRay.direction).negate();
        this.impactEffectsPool.spawn(this.scratchEndPoint, this.scratchSplatterDir);
      }
    }
  }
}
