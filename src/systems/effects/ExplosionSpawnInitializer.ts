import * as THREE from 'three';
import { ExplosionEffect } from './ExplosionEffectFactory';

/**
 * Initializes smoke particle positions and velocities
 */
export function initializeSmokeParticles(
  effect: ExplosionEffect,
  position: THREE.Vector3
): void {
  const smokePositions = effect.smokeParticles.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < smokePositions.count; i++) {
    smokePositions.setXYZ(i, position.x, position.y, position.z);

    // Smoke rises and spreads outward
    const angle = Math.random() * Math.PI * 2;
    const horizontalSpeed = 2 + Math.random() * 4;
    const verticalSpeed = 1 + Math.random() * 3;

    effect.smokeVelocities[i].set(
      Math.cos(angle) * horizontalSpeed,
      verticalSpeed,
      Math.sin(angle) * horizontalSpeed
    );
  }
  smokePositions.needsUpdate = true;
  effect.smokeParticles.visible = true;
  (effect.smokeParticles.material as THREE.PointsMaterial).opacity = 0.7;
}

/**
 * Initializes fire particle positions and velocities
 */
export function initializeFireParticles(
  effect: ExplosionEffect,
  position: THREE.Vector3
): void {
  const firePositions = effect.fireParticles.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < firePositions.count; i++) {
    firePositions.setXYZ(i, position.x, position.y, position.z);

    // Fire shoots out in all directions
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 8 + Math.random() * 8;

    effect.fireVelocities[i].set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.cos(phi) * speed + 3,
      Math.sin(phi) * Math.sin(theta) * speed
    );
  }
  firePositions.needsUpdate = true;
  effect.fireParticles.visible = true;
  (effect.fireParticles.material as THREE.PointsMaterial).opacity = 1;
}

/**
 * Initializes debris particle positions and velocities
 */
export function initializeDebrisParticles(
  effect: ExplosionEffect,
  position: THREE.Vector3
): void {
  const debrisPositions = effect.debrisParticles.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < debrisPositions.count; i++) {
    debrisPositions.setXYZ(i, position.x, position.y, position.z);

    // Debris flies out in all directions with parabolic trajectory
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5; // Favor upward/outward
    const speed = 10 + Math.random() * 15;

    effect.debrisVelocities[i].set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.cos(phi) * speed + 5, // Initial upward velocity
      Math.sin(phi) * Math.sin(theta) * speed
    );
  }
  debrisPositions.needsUpdate = true;
  effect.debrisParticles.visible = true;
  (effect.debrisParticles.material as THREE.PointsMaterial).opacity = 1;
}
