import * as THREE from 'three';
import { ExplosionEffect } from './ExplosionEffectFactory';

const GRAVITY = new THREE.Vector3(0, -3, 0);

/**
 * Updates flash effect (first 200ms)
 */
export function updateFlash(effect: ExplosionEffect, elapsed: number): void {
  if (elapsed < 200) {
    const flashProgress = elapsed / 200;
    effect.flash.intensity = 8 * (1 - flashProgress);
    effect.flashSprite.material.opacity = 1 - flashProgress;
    // Flash expands rapidly
    const scale = 15 + flashProgress * 8;
    effect.flashSprite.scale.set(scale, scale, 1);
  } else {
    effect.flash.visible = false;
    effect.flashSprite.visible = false;
  }
}

/**
 * Updates fire particles (first 800ms)
 */
export function updateFireParticles(
  effect: ExplosionEffect,
  elapsed: number,
  deltaTime: number
): void {
  if (elapsed < 800) {
    const firePositions = effect.fireParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < firePositions.count; j++) {
      // Apply gravity
      effect.fireVelocities[j].addScaledVector(GRAVITY, deltaTime * 2);

      // Update position
      const x = firePositions.getX(j) + effect.fireVelocities[j].x * deltaTime;
      const y = firePositions.getY(j) + effect.fireVelocities[j].y * deltaTime;
      const z = firePositions.getZ(j) + effect.fireVelocities[j].z * deltaTime;

      firePositions.setXYZ(j, x, y, z);
    }
    firePositions.needsUpdate = true;

    // Fade fire
    const fireProgress = elapsed / 800;
    (effect.fireParticles.material as THREE.PointsMaterial).opacity = 1 - fireProgress;
  } else {
    effect.fireParticles.visible = false;
  }
}

/**
 * Updates debris particles (first 1500ms)
 */
export function updateDebrisParticles(
  effect: ExplosionEffect,
  elapsed: number,
  deltaTime: number
): void {
  if (elapsed < 1500) {
    const debrisPositions = effect.debrisParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < debrisPositions.count; j++) {
      // Apply strong gravity to debris
      effect.debrisVelocities[j].addScaledVector(GRAVITY, deltaTime * 3);

      // Update position
      const x = debrisPositions.getX(j) + effect.debrisVelocities[j].x * deltaTime;
      const y = debrisPositions.getY(j) + effect.debrisVelocities[j].y * deltaTime;
      const z = debrisPositions.getZ(j) + effect.debrisVelocities[j].z * deltaTime;

      debrisPositions.setXYZ(j, x, y, z);
    }
    debrisPositions.needsUpdate = true;

    // Fade debris in last 500ms
    if (elapsed > 1000) {
      const debrisFade = (elapsed - 1000) / 500;
      (effect.debrisParticles.material as THREE.PointsMaterial).opacity = 1 - debrisFade;
    }
  } else {
    effect.debrisParticles.visible = false;
  }
}

/**
 * Updates smoke particles (full duration)
 */
export function updateSmokeParticles(
  effect: ExplosionEffect,
  elapsed: number,
  deltaTime: number,
  progress: number
): void {
  const smokePositions = effect.smokeParticles.geometry.attributes.position as THREE.BufferAttribute;
  for (let j = 0; j < smokePositions.count; j++) {
    // Smoke slows down over time
    effect.smokeVelocities[j].multiplyScalar(0.98);

    // Add slight upward drift
    effect.smokeVelocities[j].y += 0.5 * deltaTime;

    // Update position
    const x = smokePositions.getX(j) + effect.smokeVelocities[j].x * deltaTime;
    const y = smokePositions.getY(j) + effect.smokeVelocities[j].y * deltaTime;
    const z = smokePositions.getZ(j) + effect.smokeVelocities[j].z * deltaTime;

    smokePositions.setXYZ(j, x, y, z);
  }
  smokePositions.needsUpdate = true;

  // Smoke expands and fades - larger growth
  const smokeSize = 4 + progress * 8; // Grow to 12 units
  (effect.smokeParticles.material as THREE.PointsMaterial).size = smokeSize;

  // Fade smoke in last 1 second
  if (elapsed > 2000) {
    const smokeFade = (elapsed - 2000) / 1000;
    (effect.smokeParticles.material as THREE.PointsMaterial).opacity = 0.8 * (1 - smokeFade);
  }
}

/**
 * Updates shockwave ring (first 500ms)
 */
export function updateShockwave(effect: ExplosionEffect, elapsed: number): void {
  if (elapsed < 500) {
    const shockProgress = elapsed / 500;
    const scale = 0.1 + shockProgress * 15; // Expand to radius 15
    effect.shockwaveRing.scale.set(scale, scale, 1);
    (effect.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - shockProgress);
  } else {
    effect.shockwaveRing.visible = false;
  }
}
