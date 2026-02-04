import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GrenadeType, Combatant, CombatantState } from '../combat/types';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import { AudioManager } from '../audio/AudioManager';
import { Grenade } from './GrenadePhysics';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';
import { spatialGridManager } from '../combat/SpatialGridManager';
import type { IFlashbangScreenEffect, IPlayerController } from '../../types/SystemInterfaces';

// Module-level scratch vectors for direction calculations
const _lookDirection = new THREE.Vector3();
const _toCombatant = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _velocity = new THREE.Vector3();

/**
 * Handles different grenade type explosion effects
 */
export class GrenadeEffects {
  private readonly DAMAGE_RADIUS = 15;
  private readonly MAX_DAMAGE = 150;
  private flashbangEffect?: IFlashbangScreenEffect;

  explodeGrenade(
    grenade: Grenade,
    impactEffectsPool: ImpactEffectsPool | undefined,
    explosionEffectsPool: ExplosionEffectsPool | undefined,
    audioManager: AudioManager | undefined,
    combatantSystem: CombatantSystem | undefined,
    playerController: IPlayerController | undefined
  ): void {
    Logger.info('weapons', `${grenade.type.toUpperCase()} grenade exploded at (${grenade.position.x.toFixed(1)}, ${grenade.position.y.toFixed(1)}, ${grenade.position.z.toFixed(1)})`);

    switch (grenade.type) {
      case GrenadeType.FRAG:
        this.explodeFrag(grenade, impactEffectsPool, explosionEffectsPool, audioManager, combatantSystem, playerController);
        break;
      case GrenadeType.SMOKE:
        this.explodeSmoke(grenade, impactEffectsPool);
        break;
      case GrenadeType.FLASHBANG:
        this.explodeFlashbang(grenade, explosionEffectsPool, audioManager, combatantSystem, playerController);
        break;
    }
  }

  private explodeFrag(
    grenade: Grenade,
    impactEffectsPool: ImpactEffectsPool | undefined,
    explosionEffectsPool: ExplosionEffectsPool | undefined,
    audioManager: AudioManager | undefined,
    combatantSystem: CombatantSystem | undefined,
    playerController: IPlayerController | undefined
  ): void {
    // Main explosion effect - big flash, smoke, fire, shockwave
    if (explosionEffectsPool) {
      explosionEffectsPool.spawn(grenade.position);
    }

    // Additional debris/impact effects for more detail
    if (impactEffectsPool) {
      for (let i = 0; i < 15; i++) {
        _offset.set(
          (Math.random() - 0.5) * 3,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 3
        );
        _spawnPos.copy(grenade.position).add(_offset);
        _velocity.set(0, 1, 0);
        impactEffectsPool.spawn(_spawnPos, _velocity);
      }
    }

    if (audioManager) {
      audioManager.playExplosionAt(grenade.position);
    }

    if (combatantSystem) {
      combatantSystem.applyExplosionDamage(
        grenade.position,
        this.DAMAGE_RADIUS,
        this.MAX_DAMAGE,
        'PLAYER'
      );
    }

    // Apply enhanced camera shake from explosion
    if (playerController) {
      playerController.applyExplosionShake(grenade.position, this.DAMAGE_RADIUS);
    }
  }

  private explodeSmoke(
    grenade: Grenade,
    impactEffectsPool: ImpactEffectsPool | undefined
  ): void {
    // Smoke grenade - create smoke effect, no damage
    // Spawn multiple smoke particles for a smoke cloud
    if (impactEffectsPool) {
      for (let i = 0; i < 30; i++) {
        _offset.set(
          (Math.random() - 0.5) * 5,
          Math.random() * 3,
          (Math.random() - 0.5) * 5
        );
        _spawnPos.copy(grenade.position).add(_offset);
        _velocity.set(0, 0.5, 0);
        impactEffectsPool.spawn(_spawnPos, _velocity);
      }
    }

    spawnSmokeCloud(grenade.position);

    // No damage for smoke grenades
    Logger.info('weapons', 'Smoke grenade deployed - no damage');
  }

  private explodeFlashbang(
    grenade: Grenade,
    explosionEffectsPool: ExplosionEffectsPool | undefined,
    audioManager: AudioManager | undefined,
    combatantSystem: CombatantSystem | undefined,
    playerController: IPlayerController | undefined
  ): void {
    // Flashbang - bright flash effect and minimal damage
    if (explosionEffectsPool) {
      // Use explosion effect but interpret it as a bright flash
      explosionEffectsPool.spawn(grenade.position);
    }

    if (audioManager) {
      audioManager.playExplosionAt(grenade.position);
    }

    // Minimal damage (5) with larger radius (20) for disorientation
    if (combatantSystem) {
      combatantSystem.applyExplosionDamage(
        grenade.position,
        20, // Larger radius
        5,  // Minimal damage
        'PLAYER'
      );
    }

    // Light camera shake
    if (playerController) {
      playerController.applyExplosionShake(grenade.position, 10);
    }

    // Trigger screen whiteout effect for player
    if (this.flashbangEffect && playerController) {
      const playerPosition = playerController.getPosition();
      const camera = playerController.getCamera();

      // Get camera look direction
      camera.getWorldDirection(_lookDirection);
      this.flashbangEffect.triggerFlash(grenade.position, playerPosition, _lookDirection);
    }

    // Apply disorientation to nearby NPCs
    this.applyNPCDisorientation(grenade.position, combatantSystem);

    Logger.info('weapons', 'Flashbang deployed - minimal damage, disorientation effect');
  }

  /**
   * Apply disorientation effects to NPCs within range of flashbang.
   * Uses distance-based duration: <15m = 3s severe, 15-25m = 1.5s moderate.
   */
  private applyNPCDisorientation(
    flashPosition: THREE.Vector3,
    combatantSystem: CombatantSystem | undefined
  ): void {
    if (!combatantSystem) return;

    const FULL_DISORIENT_DISTANCE = 15;
    const PARTIAL_DISORIENT_DISTANCE = 25;
    const FULL_DISORIENT_DURATION_MS = 3000; // 3 seconds
    const PARTIAL_DISORIENT_DURATION_MS = 1500; // 1.5 seconds

    // Access combatants map directly
    const allCombatants = combatantSystem.combatants;

    let affectedCount = 0;

    if (spatialGridManager.getIsInitialized()) {
      // Efficient spatial query - only check NPCs within max range
      const nearbyCombatantIds = spatialGridManager.queryRadius(flashPosition, PARTIAL_DISORIENT_DISTANCE);

      for (const id of nearbyCombatantIds) {
        const combatant = allCombatants.get(id);
        if (!combatant) continue;
        if (combatant.state === CombatantState.DEAD) continue;

        _toCombatant.subVectors(combatant.position, flashPosition);
        const distance = _toCombatant.length();

        if (distance > PARTIAL_DISORIENT_DISTANCE) continue;

        // Determine duration based on distance
        let durationMs = 0;
        if (distance <= FULL_DISORIENT_DISTANCE) {
          durationMs = FULL_DISORIENT_DURATION_MS;
        } else {
          durationMs = PARTIAL_DISORIENT_DURATION_MS;
        }

        // Set disorientation timestamp
        const currentTime = Date.now();
        combatant.flashDisorientedUntil = currentTime + durationMs;
        affectedCount++;
      }
    } else {
      // Fallback: iterate all combatants (shouldn't happen, but safe)
      allCombatants.forEach(combatant => {
        if (combatant.state === CombatantState.DEAD) return;

        _toCombatant.subVectors(combatant.position, flashPosition);
        const distance = _toCombatant.length();

        if (distance > PARTIAL_DISORIENT_DISTANCE) return;

        // Determine duration based on distance
        let durationMs = 0;
        if (distance <= FULL_DISORIENT_DISTANCE) {
          durationMs = FULL_DISORIENT_DURATION_MS;
        } else {
          durationMs = PARTIAL_DISORIENT_DURATION_MS;
        }

        // Set disorientation timestamp
        const currentTime = Date.now();
        combatant.flashDisorientedUntil = currentTime + durationMs;
        affectedCount++;
      });
    }

    if (affectedCount > 0) {
      Logger.info('weapons', `Flashbang disoriented ${affectedCount} NPCs`);
    }
  }

  /**
   * Set the flashbang screen effect system
   */
  setFlashbangEffect(effect: IFlashbangScreenEffect): void {
    this.flashbangEffect = effect;
  }
}
