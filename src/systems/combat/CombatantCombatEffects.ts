// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Combatant, Squad } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { AudioManager } from '../audio/AudioManager';
import { CombatantDamage } from './CombatantDamage';
import { CombatantSuppression } from './CombatantSuppression';

const LOCAL_COMBAT_EFFECT_DISTANCE = 200;
const LOCAL_COMBAT_EFFECT_DISTANCE_SQ = LOCAL_COMBAT_EFFECT_DISTANCE * LOCAL_COMBAT_EFFECT_DISTANCE;

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
  private muzzleFlashSystem: MuzzleFlashSystem;
  private impactEffectsPool: ImpactEffectsPool;
  private audioManager?: AudioManager;
  private damage: CombatantDamage;
  private suppression: CombatantSuppression;

  // Pre-allocated scratch vectors for suppressive fire effects
  private readonly scratchEndPoint = new THREE.Vector3();
  private readonly scratchMuzzlePos = new THREE.Vector3();
  private readonly scratchMuzzleFlashPos = new THREE.Vector3();
  private readonly scratchSplatterDir = new THREE.Vector3();
  private readonly scratchHitPoint = new THREE.Vector3();
  private readonly scratchTracerStart = new THREE.Vector3();
  private readonly scratchMuzzleOffset = new THREE.Vector3();
  private readonly scratchNegatedDirection = new THREE.Vector3();

  constructor(
    tracerPool: TracerPool,
    muzzleFlashSystem: MuzzleFlashSystem,
    impactEffectsPool: ImpactEffectsPool,
    damage: CombatantDamage,
    suppression: CombatantSuppression
  ) {
    this.tracerPool = tracerPool;
    this.muzzleFlashSystem = muzzleFlashSystem;
    this.impactEffectsPool = impactEffectsPool;
    this.damage = damage;
    this.suppression = suppression;
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
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
    const distanceSq = combatant.position.distanceToSquared(playerPosition);
    if (distanceSq < LOCAL_COMBAT_EFFECT_DISTANCE_SQ) {
      if (hit) {
        this.scratchHitPoint.copy(hit.point);
      } else {
        this.scratchHitPoint.copy(shotRay.origin).addScaledVector(shotRay.direction, 80 + Math.random() * 40);
      }

      this.scratchTracerStart.copy(shotRay.origin);
      this.tracerPool.spawn(this.scratchTracerStart, this.scratchHitPoint, 300);

      this.scratchMuzzlePos.copy(shotRay.origin);
      this.scratchMuzzleOffset.copy(shotRay.direction).multiplyScalar(2);
      this.scratchMuzzlePos.add(this.scratchMuzzleOffset);
      this.muzzleFlashSystem.spawnNPC(this.scratchMuzzlePos, shotRay.direction);

      if (this.audioManager) {
        this.audioManager.playGunshotAt(combatant.position);
      }

      if (hit) {
        this.scratchNegatedDirection.copy(shotRay.direction).negate();
        this.impactEffectsPool.spawn(hit.point, this.scratchNegatedDirection);

        // Only apply damage if hit has a combatant (not a player hit)
        if ('combatant' in hit) {
          const damage = combatant.gunCore.computeDamage(hit.distance, hit.headshot);
          this.damage.applyDamage(hit.combatant, damage, combatant, squads, hit.headshot, allCombatants);

          if (hit.headshot) {
            Logger.info('combat', ` Headshot! ${combatant.faction} -> ${hit.combatant.faction}`);
          }
        }
      } else {
        // Track near misses for suppression
        this.suppression.trackNearMisses(shotRay, this.scratchHitPoint, combatant.faction, allCombatants, playerPosition);
      }
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
    const distanceSq = combatant.position.distanceToSquared(playerPosition);
    if (distanceSq < LOCAL_COMBAT_EFFECT_DISTANCE_SQ) {
      // Use scratch vectors to avoid allocations
      this.scratchEndPoint.copy(shotRay.origin)
        .addScaledVector(shotRay.direction, 60 + Math.random() * 40);

      this.scratchMuzzlePos.copy(shotRay.origin);
      this.tracerPool.spawn(this.scratchMuzzlePos, this.scratchEndPoint, 300);

      this.scratchMuzzleFlashPos.copy(this.scratchMuzzlePos);
      this.scratchMuzzleFlashPos.addScaledVector(shotRay.direction, 2);
      this.muzzleFlashSystem.spawnNPC(this.scratchMuzzleFlashPos, shotRay.direction);

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
