import * as THREE from 'three';
import { createSmokeTexture, createFlashTexture, createDebrisTexture } from './ExplosionTextures';
import { ExplosionEffect, createExplosionEffect } from './ExplosionEffectFactory';
import {
  updateFlash,
  updateFireParticles,
  updateDebrisParticles,
  updateSmokeParticles,
  updateShockwave
} from './ExplosionParticleUpdater';
import {
  initializeSmokeParticles,
  initializeFireParticles,
  initializeDebrisParticles
} from './ExplosionSpawnInitializer';

/**
 * Pooled explosion effects system with flash, smoke, fire, and shockwave
 */
export class ExplosionEffectsPool {
  private scene: THREE.Scene;
  private pool: ExplosionEffect[] = [];
  private active: ExplosionEffect[] = [];
  private maxEffects: number;

  private smokeTexture: THREE.Texture;
  private flashTexture: THREE.Texture;
  private debrisTexture: THREE.Texture;

  constructor(scene: THREE.Scene, maxEffects = 16) {
    this.scene = scene;
    this.maxEffects = maxEffects;

    // Create textures
    this.smokeTexture = createSmokeTexture();
    this.flashTexture = createFlashTexture();
    this.debrisTexture = createDebrisTexture();

    // Pre-allocate pool
    for (let i = 0; i < maxEffects; i++) {
      const effect = createExplosionEffect(this.scene, this.smokeTexture, this.flashTexture, this.debrisTexture);
      this.pool.push(effect);
    }
  }

  spawn(position: THREE.Vector3): void {
    const effect = this.pool.pop() || this.active.shift();
    if (!effect) return;

    const now = performance.now();

    // Position flash - much brighter and larger
    effect.flash.position.copy(position);
    effect.flash.intensity = 8;
    effect.flash.visible = true;

    // Position flash sprite - larger
    effect.flashSprite.position.copy(position);
    effect.flashSprite.scale.set(15, 15, 1);
    effect.flashSprite.material.opacity = 1;
    effect.flashSprite.visible = true;

    // Initialize particles
    initializeSmokeParticles(effect, position);
    initializeFireParticles(effect, position);
    initializeDebrisParticles(effect, position);

    // Initialize shockwave ring
    effect.shockwaveRing.position.copy(position);
    effect.shockwaveRing.position.y += 0.1; // Slightly above ground
    effect.shockwaveRing.scale.set(0.1, 0.1, 1);
    (effect.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.6;
    effect.shockwaveRing.visible = true;

    // Set timing - explosion lasts 3 seconds (smoke lingers)
    effect.startTime = now;
    effect.aliveUntil = now + 3000;

    this.active.push(effect);
  }

  update(deltaTime: number): void {
    const now = performance.now();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      const elapsed = now - effect.startTime;
      const remaining = effect.aliveUntil - now;

      if (remaining <= 0) {
        // Hide and return to pool
        effect.flash.visible = false;
        effect.flashSprite.visible = false;
        effect.smokeParticles.visible = false;
        effect.fireParticles.visible = false;
        effect.debrisParticles.visible = false;
        effect.shockwaveRing.visible = false;
        const last = this.active[this.active.length - 1];
        this.active[i] = last;
        this.active.pop();
        if (this.pool.length < this.maxEffects) {
          this.pool.push(effect);
        }
      } else {
        const progress = elapsed / 3000;

        // Update all particle systems
        updateFlash(effect, elapsed);
        updateFireParticles(effect, elapsed, deltaTime);
        updateDebrisParticles(effect, elapsed, deltaTime);
        updateSmokeParticles(effect, elapsed, deltaTime, progress);
        updateShockwave(effect, elapsed);
      }
    }
  }

  dispose(): void {
    this.active.forEach(e => {
      this.scene.remove(e.flash);
      this.scene.remove(e.flashSprite);
      this.scene.remove(e.smokeParticles);
      this.scene.remove(e.fireParticles);
      this.scene.remove(e.debrisParticles);
      this.scene.remove(e.shockwaveRing);
      e.smokeParticles.geometry.dispose();
      e.fireParticles.geometry.dispose();
      e.debrisParticles.geometry.dispose();
      e.shockwaveRing.geometry.dispose();
      (e.flashSprite.material as THREE.SpriteMaterial).dispose();
      (e.smokeParticles.material as THREE.PointsMaterial).dispose();
      (e.fireParticles.material as THREE.PointsMaterial).dispose();
      (e.debrisParticles.material as THREE.PointsMaterial).dispose();
      (e.shockwaveRing.material as THREE.MeshBasicMaterial).dispose();
    });

    this.pool.forEach(e => {
      this.scene.remove(e.flash);
      this.scene.remove(e.flashSprite);
      this.scene.remove(e.smokeParticles);
      this.scene.remove(e.fireParticles);
      this.scene.remove(e.debrisParticles);
      this.scene.remove(e.shockwaveRing);
      e.smokeParticles.geometry.dispose();
      e.fireParticles.geometry.dispose();
      e.debrisParticles.geometry.dispose();
      e.shockwaveRing.geometry.dispose();
      (e.flashSprite.material as THREE.SpriteMaterial).dispose();
      (e.smokeParticles.material as THREE.PointsMaterial).dispose();
      (e.fireParticles.material as THREE.PointsMaterial).dispose();
      (e.debrisParticles.material as THREE.PointsMaterial).dispose();
      (e.shockwaveRing.material as THREE.MeshBasicMaterial).dispose();
    });

    this.smokeTexture.dispose();
    this.flashTexture.dispose();
    this.debrisTexture.dispose();

    this.active.length = 0;
    this.pool.length = 0;
  }
}
