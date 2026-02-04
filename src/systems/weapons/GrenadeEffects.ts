import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GrenadeType } from '../combat/types';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import { AudioManager } from '../audio/AudioManager';
import { Grenade } from './GrenadePhysics';
import { FlashbangScreenEffect } from '../player/FlashbangScreenEffect';

// Module-level scratch vector for direction calculations
const _lookDirection = new THREE.Vector3();

/**
 * Handles different grenade type explosion effects
 */
export class GrenadeEffects {
  private readonly DAMAGE_RADIUS = 15;
  private readonly MAX_DAMAGE = 150;
  private flashbangEffect?: FlashbangScreenEffect;

  explodeGrenade(
    grenade: Grenade,
    impactEffectsPool: ImpactEffectsPool | undefined,
    explosionEffectsPool: ExplosionEffectsPool | undefined,
    audioManager: AudioManager | undefined,
    combatantSystem: CombatantSystem | undefined,
    playerController: any
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
    playerController: any
  ): void {
    // Main explosion effect - big flash, smoke, fire, shockwave
    if (explosionEffectsPool) {
      explosionEffectsPool.spawn(grenade.position);
    }

    // Additional debris/impact effects for more detail
    if (impactEffectsPool) {
      for (let i = 0; i < 15; i++) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 3
        );
        const effectPos = grenade.position.clone().add(offset);
        impactEffectsPool.spawn(effectPos, new THREE.Vector3(0, 1, 0));
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
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 3,
          (Math.random() - 0.5) * 5
        );
        const effectPos = grenade.position.clone().add(offset);
        impactEffectsPool.spawn(effectPos, new THREE.Vector3(0, 0.5, 0));
      }
    }

    // No damage for smoke grenades
    Logger.info('weapons', 'Smoke grenade deployed - no damage');
  }

  private explodeFlashbang(
    grenade: Grenade,
    explosionEffectsPool: ExplosionEffectsPool | undefined,
    audioManager: AudioManager | undefined,
    combatantSystem: CombatantSystem | undefined,
    playerController: any
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

    Logger.info('weapons', 'Flashbang deployed - minimal damage, disorientation effect');
  }

  /**
   * Set the flashbang screen effect system
   */
  setFlashbangEffect(effect: FlashbangScreenEffect): void {
    this.flashbangEffect = effect;
  }
}
