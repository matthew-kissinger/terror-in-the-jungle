// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { EffectPool } from './EffectPool';

interface ImpactEffect {
  particles: THREE.Points;
  sparks: THREE.Points;
  decal: THREE.Sprite;
  particlePositions: THREE.BufferAttribute;
  sparkPositions: THREE.BufferAttribute;
  particleArray: WritableNumberArray;
  sparkArray: WritableNumberArray;
  particleCount: number;
  sparkCount: number;
  aliveUntil: number;
  startTime: number;
  velocity: THREE.Vector3[];
}

type WritableNumberArray = ArrayLike<number> & { [index: number]: number };

function markAttributeRangeDirty(attribute: THREE.BufferAttribute, start = 0, count = attribute.count * attribute.itemSize): void {
  if (typeof attribute.addUpdateRange === 'function') {
    attribute.addUpdateRange(start, count);
  }
  attribute.needsUpdate = true;
}

function writePosition(array: WritableNumberArray, index: number, x: number, y: number, z: number): void {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

/**
 * Pooled impact effects system with particles, sparks, and decals
 */
export class ImpactEffectsPool extends EffectPool<ImpactEffect> {
  private particleMaterial: THREE.PointsMaterial;
  private sparkMaterial: THREE.PointsMaterial;
  private decalMaterial: THREE.SpriteMaterial;
  private decalTexture: THREE.Texture;

  private readonly gravityY = -9.8;

  constructor(scene: THREE.Scene, maxEffects = 32) {
    super(scene, maxEffects);

    // Create materials - red blood particles
    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xcc0000,  // Dark red blood color
      size: 0.08,  // Bigger blood droplets
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xff0000,  // Bright red blood spray
      size: 0.05,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    });

    // Create decal texture
    this.decalTexture = this.createDecalTexture();
    this.decalMaterial = new THREE.SpriteMaterial({
      map: this.decalTexture,
      color: 0x333333,
      blending: THREE.NormalBlending,
      opacity: 0.5,
      transparent: true
    });

    // Pre-allocate pool and add to scene once (toggle visible, never add/remove)
    for (let i = 0; i < maxEffects; i++) {
      const effect = this.createEffect();
      this.scene.add(effect.particles);
      this.scene.add(effect.sparks);
      this.scene.add(effect.decal);
      this.pool.push(effect);
    }
  }

  protected createEffect(): ImpactEffect {
    // Create particle cloud (blood droplets)
    const particleCount = 20;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particlePositions = new THREE.BufferAttribute(positions, 3);
    particleGeometry.setAttribute('position', particlePositions);
    const particles = new THREE.Points(particleGeometry, this.particleMaterial);
    particles.visible = false;
    particles.matrixAutoUpdate = true;

    // Create sparks (blood spray)
    const sparkCount = 15;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkPositionAttribute = new THREE.BufferAttribute(sparkPositions, 3);
    sparkGeometry.setAttribute('position', sparkPositionAttribute);
    const sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    sparks.visible = false;
    sparks.matrixAutoUpdate = true;

    // Create decal sprite (shared material)
    const decal = new THREE.Sprite(this.decalMaterial);
    decal.scale.set(0.2, 0.2, 1);
    decal.visible = false;
    decal.matrixAutoUpdate = true;

    // Create velocity array for particles
    const velocity: THREE.Vector3[] = [];
    for (let i = 0; i < particleCount + sparkCount; i++) {
      velocity.push(new THREE.Vector3());
    }

    return {
      particles,
      sparks,
      decal,
      particlePositions,
      sparkPositions: sparkPositionAttribute,
      particleArray: particlePositions.array as WritableNumberArray,
      sparkArray: sparkPositionAttribute.array as WritableNumberArray,
      particleCount,
      sparkCount,
      aliveUntil: 0,
      startTime: 0,
      velocity,
    };
  }

  protected isExpired(effect: ImpactEffect, now: number): boolean {
    return effect.aliveUntil <= now;
  }

  protected deactivateEffect(effect: ImpactEffect): void {
    effect.particles.visible = false;
    effect.sparks.visible = false;
    effect.decal.visible = false;
  }

  protected disposeEffect(effect: ImpactEffect): void {
    this.scene.remove(effect.particles);
    this.scene.remove(effect.sparks);
    this.scene.remove(effect.decal);
    effect.particles.geometry.dispose();
    effect.sparks.geometry.dispose();
  }

  private createDecalTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 15 + Math.random() * 10;
      ctx.beginPath();
      ctx.arc(
        32 + Math.cos(angle) * r,
        32 + Math.sin(angle) * r,
        3 + Math.random() * 3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  spawn(position: THREE.Vector3, normal: THREE.Vector3): void {
    const effect = this.acquire();
    if (!effect) return;

    // Position decal at impact point
    effect.decal.position.copy(position);
    effect.decal.position.addScaledVector(normal, 0.01);
    effect.decal.visible = true;

    // Initialize particle positions and velocities
    const particlePositions = effect.particlePositions;
    const sparkPositions = effect.sparkPositions;
    const particleArray = effect.particleArray;
    const sparkArray = effect.sparkArray;

    for (let i = 0; i < effect.particleCount; i++) {
      writePosition(particleArray, i, position.x, position.y, position.z);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const speed = 3 + Math.random() * 4;

      effect.velocity[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 2,
        Math.sin(phi) * Math.sin(theta) * speed
      );
      effect.velocity[i].addScaledVector(normal, speed * 0.5);
    }
    markAttributeRangeDirty(particlePositions);

    for (let i = 0; i < effect.sparkCount; i++) {
      writePosition(sparkArray, i, position.x, position.y, position.z);

      const speed = 6 + Math.random() * 6;
      const spread = 0.4;

      const velocityIndex = effect.particleCount + i;
      effect.velocity[velocityIndex].copy(normal);
      effect.velocity[velocityIndex].multiplyScalar(speed);
      effect.velocity[velocityIndex].x += (Math.random() - 0.5) * spread * speed;
      effect.velocity[velocityIndex].y += (Math.random() - 0.5) * spread * speed;
      effect.velocity[velocityIndex].z += (Math.random() - 0.5) * spread * speed;
    }
    markAttributeRangeDirty(sparkPositions);

    effect.particles.visible = true;
    effect.sparks.visible = true;

    const now = performance.now();
    effect.startTime = now;
    effect.aliveUntil = now + 500;

    this.pushActive(effect);
  }

  update(deltaTime: number): void {
    if (this.active.length === 0) return;

    const now = performance.now();

    // Update physics on active effects before sweeping
    for (const effect of this.active) {
      if (effect.aliveUntil <= now) continue;

      const elapsed = now - effect.startTime;
      const particlePositions = effect.particlePositions;
      const sparkPositions = effect.sparkPositions;
      const particleArray = effect.particleArray;
      const sparkArray = effect.sparkArray;

      for (let j = 0; j < effect.particleCount; j++) {
        const velocity = effect.velocity[j];
        velocity.y += this.gravityY * deltaTime;
        const offset = j * 3;
        particleArray[offset] += velocity.x * deltaTime;
        particleArray[offset + 1] += velocity.y * deltaTime;
        particleArray[offset + 2] += velocity.z * deltaTime;
      }
      markAttributeRangeDirty(particlePositions);

      for (let j = 0; j < effect.sparkCount; j++) {
        const idx = effect.particleCount + j;
        effect.velocity[idx].multiplyScalar(0.95);
        const offset = j * 3;
        sparkArray[offset] += effect.velocity[idx].x * deltaTime;
        sparkArray[offset + 1] += effect.velocity[idx].y * deltaTime;
        sparkArray[offset + 2] += effect.velocity[idx].z * deltaTime;
      }
      markAttributeRangeDirty(sparkPositions);

      const fadeStart = 300;
      if (elapsed > fadeStart) {
        const fadeProgress = (elapsed - fadeStart) / (500 - fadeStart);
        (effect.particles.material as THREE.PointsMaterial).opacity = 0.8 * (1 - fadeProgress);
        (effect.sparks.material as THREE.PointsMaterial).opacity = 1 * (1 - fadeProgress);
      }

      if (elapsed > 400) {
        effect.decal.visible = false;
      }
    }

    this.sweep(now);
  }

  dispose(): void {
    super.dispose();
    this.particleMaterial.dispose();
    this.sparkMaterial.dispose();
    this.decalMaterial.dispose();
    this.decalTexture.dispose();
  }
}
