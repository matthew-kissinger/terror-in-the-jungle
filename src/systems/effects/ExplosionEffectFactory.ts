// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Over-bright multipliers applied to the additively-blended explosion flash +
 * fire colours so they clear the P6 post-stack bloom threshold
 * (`BloomPass.BLOOM_THRESHOLD` = 1.0) and bloom, while ordinary lit surfaces do
 * not. Additive blending already reads > 1.0 colours; the boosted colours
 * guarantee the hot core blooms. Harmless when post is off (additive blend just
 * saturates as before).
 */
const EXPLOSION_FLASH_BLOOM_GAIN = 2.0;
const EXPLOSION_FIRE_BLOOM_GAIN = 1.8;

export const EXPLOSION_EFFECT_REPRESENTATION = {
  flashPrimitive: 'pooled_unlit_billboard_flash',
  smokePrimitive: 'pooled_points',
  firePrimitive: 'pooled_points',
  debrisPrimitive: 'pooled_points',
  shockwavePrimitive: 'pooled_mesh_ring',
  dynamicLights: false,
  legacyFallback: false,
} as const;

export interface ExplosionEffect {
  flashSprite: THREE.Sprite;
  smokeParticles: THREE.Points;
  fireParticles: THREE.Points;
  debrisParticles: THREE.Points;
  shockwaveRing: THREE.Mesh;
  smokePositionAttribute: THREE.BufferAttribute;
  firePositionAttribute: THREE.BufferAttribute;
  debrisPositionAttribute: THREE.BufferAttribute;
  smokePositionArray: Float32Array;
  firePositionArray: Float32Array;
  debrisPositionArray: Float32Array;
  smokeVelocities: THREE.Vector3[];
  fireVelocities: THREE.Vector3[];
  debrisVelocities: THREE.Vector3[];
  aliveUntil: number;
  startTime: number;
}

/**
 * Creates a complete explosion effect with all visual components
 */
export function createExplosionEffect(
  smokeTexture: THREE.Texture,
  flashTexture: THREE.Texture,
  debrisTexture: THREE.Texture,
  fireTexture?: THREE.Texture
): ExplosionEffect {
  void smokeTexture;
  void debrisTexture;
  // Flash sprite for visual burst - larger initial size
  const flashSpriteMaterial = new THREE.SpriteMaterial({
    map: flashTexture,
    // Over-bright so the flash core clears the post-stack bloom threshold.
    color: new THREE.Color(EXPLOSION_FLASH_BLOOM_GAIN, EXPLOSION_FLASH_BLOOM_GAIN, EXPLOSION_FLASH_BLOOM_GAIN),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 1
  });
  const flashSprite = new THREE.Sprite(flashSpriteMaterial);
  flashSprite.name = 'ExplosionFlashBillboard';
  flashSprite.userData.perfCategory = 'explosion_fx';
  flashSprite.userData.representation = EXPLOSION_EFFECT_REPRESENTATION.flashPrimitive;
  flashSprite.userData.legacyFallback = EXPLOSION_EFFECT_REPRESENTATION.legacyFallback;
  flashSprite.scale.set(12, 12, 1);
  flashSprite.visible = false;
  flashSprite.matrixAutoUpdate = true;

  // Smoke particles (80 particles for denser cloud)
  const smokeCount = 80;
  const smokeGeometry = new THREE.BufferGeometry();
  const smokePositions = new Float32Array(smokeCount * 3);
  const smokePositionAttribute = new THREE.BufferAttribute(smokePositions, 3);
  smokeGeometry.setAttribute('position', smokePositionAttribute);

  const smokeMaterial = new THREE.PointsMaterial({
    color: 0x8b8b80,
    size: 4,
    transparent: true,
    opacity: 0.8,
    blending: THREE.NormalBlending,
    depthWrite: false
  });
  const smokeParticles = new THREE.Points(smokeGeometry, smokeMaterial);
  smokeParticles.name = 'ExplosionSmokePoints';
  smokeParticles.userData.perfCategory = 'explosion_fx';
  smokeParticles.userData.representation = EXPLOSION_EFFECT_REPRESENTATION.smokePrimitive;
  smokeParticles.visible = false;
  smokeParticles.matrixAutoUpdate = true;

  // Fire particles (60 bright particles for more intensity)
  const fireCount = 60;
  const fireGeometry = new THREE.BufferGeometry();
  const firePositions = new Float32Array(fireCount * 3);
  const firePositionAttribute = new THREE.BufferAttribute(firePositions, 3);
  fireGeometry.setAttribute('position', firePositionAttribute);

  const fireMaterial = new THREE.PointsMaterial({
    // Over-bright orange so the fire core clears the post-stack bloom threshold.
    color: new THREE.Color(0xff6600).multiplyScalar(EXPLOSION_FIRE_BLOOM_GAIN),
    // A soft flame texture (when supplied) turns each point from a hard square
    // into a flame blob (#8); the modest size bump keeps it readable. Falls back
    // to the legacy untextured dot when no texture is passed.
    map: fireTexture,
    size: fireTexture ? 2.4 : 1.2,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const fireParticles = new THREE.Points(fireGeometry, fireMaterial);
  fireParticles.name = 'ExplosionFirePoints';
  fireParticles.userData.perfCategory = 'explosion_fx';
  fireParticles.userData.representation = EXPLOSION_EFFECT_REPRESENTATION.firePrimitive;
  fireParticles.visible = false;
  fireParticles.matrixAutoUpdate = true;

  // Debris particles (50 dark particles flying outward)
  const debrisCount = 50;
  const debrisGeometry = new THREE.BufferGeometry();
  const debrisPositions = new Float32Array(debrisCount * 3);
  const debrisPositionAttribute = new THREE.BufferAttribute(debrisPositions, 3);
  debrisGeometry.setAttribute('position', debrisPositionAttribute);

  const debrisMaterial = new THREE.PointsMaterial({
    color: 0x4a4032,
    size: 0.5,
    transparent: true,
    opacity: 1,
    blending: THREE.NormalBlending,
    depthWrite: false
  });
  const debrisParticles = new THREE.Points(debrisGeometry, debrisMaterial);
  debrisParticles.name = 'ExplosionDebrisPoints';
  debrisParticles.userData.perfCategory = 'explosion_fx';
  debrisParticles.userData.representation = EXPLOSION_EFFECT_REPRESENTATION.debrisPrimitive;
  debrisParticles.visible = false;
  debrisParticles.matrixAutoUpdate = true;

  // Shockwave ring on ground
  const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockwaveRing = new THREE.Mesh(ringGeometry, ringMaterial);
  shockwaveRing.name = 'ExplosionShockwaveRing';
  shockwaveRing.userData.perfCategory = 'explosion_fx';
  shockwaveRing.userData.representation = EXPLOSION_EFFECT_REPRESENTATION.shockwavePrimitive;
  shockwaveRing.rotation.x = -Math.PI / 2;
  shockwaveRing.visible = false;
  shockwaveRing.matrixAutoUpdate = true;

  // Velocity arrays
  const smokeVelocities: THREE.Vector3[] = [];
  const fireVelocities: THREE.Vector3[] = [];
  const debrisVelocities: THREE.Vector3[] = [];

  for (let i = 0; i < smokeCount; i++) {
    smokeVelocities.push(new THREE.Vector3());
  }
  for (let i = 0; i < fireCount; i++) {
    fireVelocities.push(new THREE.Vector3());
  }
  for (let i = 0; i < debrisCount; i++) {
    debrisVelocities.push(new THREE.Vector3());
  }

  return {
    flashSprite,
    smokeParticles,
    fireParticles,
    debrisParticles,
    shockwaveRing,
    smokePositionAttribute,
    firePositionAttribute,
    debrisPositionAttribute,
    smokePositionArray: smokePositions,
    firePositionArray: firePositions,
    debrisPositionArray: debrisPositions,
    smokeVelocities,
    fireVelocities,
    debrisVelocities,
    aliveUntil: 0,
    startTime: 0
  };
}
