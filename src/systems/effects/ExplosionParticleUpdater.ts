// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { ExplosionEffect } from './ExplosionEffectFactory';

const GRAVITY_Y = -3;

function markAttributeRangeDirty(attribute: THREE.BufferAttribute, start = 0, count = attribute.count * attribute.itemSize): void {
  if (typeof attribute.addUpdateRange === 'function') {
    attribute.addUpdateRange(start, count);
  }
  attribute.needsUpdate = true;
}

/**
 * Updates flash effect (first 200ms)
 */
export function updateFlash(effect: ExplosionEffect, elapsed: number): void {
  if (elapsed < 200) {
    const flashProgress = elapsed / 200;
    effect.flashSprite.material.opacity = 1 - flashProgress;
    // Flash expands rapidly
    const scale = 15 + flashProgress * 8;
    effect.flashSprite.scale.set(scale, scale, 1);
  } else {
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
    const firePositions = effect.firePositionAttribute;
    const fireArray = effect.firePositionArray;
    for (let j = 0; j < firePositions.count; j++) {
      // Apply gravity
      const velocity = effect.fireVelocities[j];
      velocity.y += GRAVITY_Y * deltaTime * 2;

      // Update position
      const offset = j * 3;
      fireArray[offset] += velocity.x * deltaTime;
      fireArray[offset + 1] += velocity.y * deltaTime;
      fireArray[offset + 2] += velocity.z * deltaTime;
    }
    markAttributeRangeDirty(firePositions);

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
    const debrisPositions = effect.debrisPositionAttribute;
    const debrisArray = effect.debrisPositionArray;
    for (let j = 0; j < debrisPositions.count; j++) {
      // Apply strong gravity to debris
      const velocity = effect.debrisVelocities[j];
      velocity.y += GRAVITY_Y * deltaTime * 3;

      // Update position
      const offset = j * 3;
      debrisArray[offset] += velocity.x * deltaTime;
      debrisArray[offset + 1] += velocity.y * deltaTime;
      debrisArray[offset + 2] += velocity.z * deltaTime;
    }
    markAttributeRangeDirty(debrisPositions);

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
  const smokePositions = effect.smokePositionAttribute;
  const smokeArray = effect.smokePositionArray;
  for (let j = 0; j < smokePositions.count; j++) {
    // Smoke slows down over time
    const velocity = effect.smokeVelocities[j];
    velocity.x *= 0.98;
    velocity.y *= 0.98;
    velocity.z *= 0.98;

    // Add slight upward drift
    velocity.y += 0.5 * deltaTime;

    // Update position
    const offset = j * 3;
    smokeArray[offset] += velocity.x * deltaTime;
    smokeArray[offset + 1] += velocity.y * deltaTime;
    smokeArray[offset + 2] += velocity.z * deltaTime;
  }
  markAttributeRangeDirty(smokePositions);

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
