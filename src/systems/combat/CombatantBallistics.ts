import * as THREE from 'three';
import { Combatant } from './types';

/**
 * Handles ballistics calculations for AI combatants.
 * Pure calculation module - takes combatant state and returns Ray.
 */
export class CombatantBallistics {
  // Module-level scratch vectors (do not share with other modules)
  private readonly scratchForward = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();
  private readonly scratchTargetPos = new THREE.Vector3();
  private readonly scratchToTarget = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchRealUp = new THREE.Vector3();
  private readonly scratchFinalDir = new THREE.Vector3();
  private readonly scratchRay = new THREE.Ray();

  /**
   * Calculate shot ray for AI engaging a target.
   * Includes leading, jitter, and accuracy multipliers.
   */
  calculateAIShot(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    accuracyMultiplier: number = 1.0
  ): THREE.Ray {
    if (!combatant.target) {
      this.scratchForward.set(
        Math.cos(combatant.rotation),
        0,
        Math.sin(combatant.rotation)
      );
      this.scratchOrigin.copy(combatant.position);
      this.scratchRay.set(this.scratchOrigin, this.scratchForward);
      return this.scratchRay;
    }

    // Use scratch for target position
    if (combatant.target.id === 'PLAYER') {
      this.scratchTargetPos.copy(playerPosition);
      this.scratchTargetPos.y -= 0.6;
    } else {
      this.scratchTargetPos.copy(combatant.target.position);
    }

    this.scratchToTarget.subVectors(this.scratchTargetPos, combatant.position);

    if (combatant.target.id !== 'PLAYER' && combatant.target.velocity.length() > 0.1) {
      const timeToTarget = this.scratchToTarget.length() / 800;
      const leadAmount = combatant.skillProfile.leadingErrorFactor;
      this.scratchToTarget.addScaledVector(combatant.target.velocity, timeToTarget * leadAmount);
    }

    this.scratchToTarget.normalize();

    const jitter = combatant.skillProfile.aimJitterAmplitude * accuracyMultiplier;
    const jitterRad = THREE.MathUtils.degToRad(jitter);

    this.scratchUp.set(0, 1, 0);
    this.scratchRight.crossVectors(this.scratchToTarget, this.scratchUp).normalize();
    this.scratchRealUp.crossVectors(this.scratchRight, this.scratchToTarget).normalize();

    const jitterX = (Math.random() - 0.5) * jitterRad;
    const jitterY = (Math.random() - 0.5) * jitterRad;

    this.scratchFinalDir.copy(this.scratchToTarget)
      .addScaledVector(this.scratchRight, Math.sin(jitterX))
      .addScaledVector(this.scratchRealUp, Math.sin(jitterY))
      .normalize();

    this.scratchOrigin.copy(combatant.position);
    this.scratchOrigin.y += 1.5;

    this.scratchRay.set(this.scratchOrigin, this.scratchFinalDir);
    return this.scratchRay;
  }

  /**
   * Calculate shot ray for suppressive fire.
   * Higher spread, fires at area rather than precise point.
   */
  calculateSuppressiveShot(combatant: Combatant, spread: number, targetPos?: THREE.Vector3): THREE.Ray {
    const target = targetPos || combatant.lastKnownTargetPos;
    if (!target) {
      this.scratchForward.set(
        Math.cos(combatant.rotation),
        0,
        Math.sin(combatant.rotation)
      );
      this.scratchOrigin.copy(combatant.position);
      this.scratchRay.set(this.scratchOrigin, this.scratchForward);
      return this.scratchRay;
    }

    this.scratchToTarget.subVectors(target, combatant.position).normalize();

    const spreadRad = THREE.MathUtils.degToRad(spread);
    const theta = Math.random() * Math.PI * 2;
    const r = Math.random() * spreadRad;

    this.scratchUp.set(0, 1, 0);
    this.scratchRight.crossVectors(this.scratchToTarget, this.scratchUp).normalize();
    this.scratchRealUp.crossVectors(this.scratchRight, this.scratchToTarget).normalize();

    this.scratchFinalDir.copy(this.scratchToTarget)
      .addScaledVector(this.scratchRight, Math.cos(theta) * r)
      .addScaledVector(this.scratchRealUp, Math.sin(theta) * r)
      .normalize();

    this.scratchOrigin.copy(combatant.position);
    this.scratchOrigin.y += 1.5;

    this.scratchRay.set(this.scratchOrigin, this.scratchFinalDir);
    return this.scratchRay;
  }
}
