import * as THREE from 'three';
import { Combatant, CombatantState, Faction, isOpfor, isAlly } from './types';
import { spatialGridManager } from './SpatialGridManager';
import { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';
import { AudioManager } from '../audio/AudioManager';

/**
 * Handles suppression effects from near misses.
 * Tracks suppression levels, panic, and triggers cover-seeking behavior.
 */
export class CombatantSuppression {
  private playerSuppressionSystem?: PlayerSuppressionSystem;
  private audioManager?: AudioManager;
  private queryProvider: ((center: THREE.Vector3, radius: number) => string[]) | null = null;

  // Module-level scratch vectors (do not share with other modules)
  private readonly SUPPRESSION_RADIUS = 5.0;
  private readonly SUPPRESSION_RADIUS_SQ = 5.0 * 5.0;

  setPlayerSuppressionSystem(system: PlayerSuppressionSystem): void {
    this.playerSuppressionSystem = system;
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
  }

  setQueryProvider(provider: (center: THREE.Vector3, radius: number) => string[]): void {
    this.queryProvider = provider;
  }

  /**
   * Track near misses and apply suppression effects to nearby combatants.
   * Uses spatial queries for efficient O(log n) lookups instead of O(n) scans.
   */
  trackNearMisses(
    shotRay: THREE.Ray,
    hitPoint: THREE.Vector3,
    shooterFaction: Faction,
    allCombatants: Map<string, Combatant>,
    playerPosition?: THREE.Vector3
  ): void {
    // Check player for suppression (if OPFOR is shooting)
    if (playerPosition && isOpfor(shooterFaction) && this.playerSuppressionSystem) {
      const distanceToPlayerSq = hitPoint.distanceToSquared(playerPosition);

      if (distanceToPlayerSq < this.SUPPRESSION_RADIUS_SQ) {
        const distanceToPlayer = Math.sqrt(distanceToPlayerSq);
        this.playerSuppressionSystem.registerNearMiss(hitPoint, playerPosition);

        // Play bullet whiz sound for very close misses
        if (this.audioManager && distanceToPlayer < 3) {
          this.audioManager.playBulletWhizSound(hitPoint, playerPosition);
        }
      }
    }

    // Use spatial query to find only nearby combatants instead of O(n) scan
    if (!this.queryProvider && !spatialGridManager.getIsInitialized()) {
      // Fallback to old behavior if spatial grid not initialized (shouldn't happen)
      allCombatants.forEach(combatant => {
        if (combatant.faction === shooterFaction) return;
        if (combatant.state === CombatantState.DEAD) return;

        const distanceToHitSq = combatant.position.distanceToSquared(hitPoint);

        if (distanceToHitSq < this.SUPPRESSION_RADIUS_SQ) {
          const distanceToHit = Math.sqrt(distanceToHitSq);
          this.applySuppression(combatant, distanceToHit);
        }
      });
      return;
    }

    // Spatial query: only check combatants within SUPPRESSION_RADIUS
    const nearbyCombatantIds = this.queryProvider
      ? this.queryProvider(hitPoint, this.SUPPRESSION_RADIUS)
      : spatialGridManager.queryRadius(hitPoint, this.SUPPRESSION_RADIUS);

    for (const id of nearbyCombatantIds) {
      const combatant = allCombatants.get(id);
      if (!combatant) continue;
      if (combatant.faction === shooterFaction) continue;
      if (combatant.state === CombatantState.DEAD) continue;

      // Use squared distance for comparison (faster)
      const distanceToHitSq = combatant.position.distanceToSquared(hitPoint);

      if (distanceToHitSq < this.SUPPRESSION_RADIUS_SQ) {
        const distanceToHit = Math.sqrt(distanceToHitSq);
        this.applySuppression(combatant, distanceToHit);
      }
    }
  }

  /**
   * Apply suppression effects to a combatant based on proximity to near miss.
   */
  private applySuppression(combatant: Combatant, distanceToHit: number): void {
    // Track near miss
    combatant.nearMissCount = (combatant.nearMissCount || 0) + 1;
    combatant.lastSuppressedTime = Date.now();

    // Increase panic based on proximity
    const proximityFactor = 1.0 - (distanceToHit / this.SUPPRESSION_RADIUS);
    combatant.panicLevel = Math.min(1.0, combatant.panicLevel + 0.2 * proximityFactor);
    combatant.suppressionLevel = Math.min(1.0, combatant.suppressionLevel + 0.25 * proximityFactor);

    // If heavily suppressed, seek cover
    if (combatant.nearMissCount >= 3 && combatant.panicLevel > 0.6) {
      if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.ADVANCING) {
        combatant.state = CombatantState.SEEKING_COVER;
      }
    }
  }
}
