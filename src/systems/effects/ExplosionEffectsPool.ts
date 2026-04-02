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
import { EffectPool } from './EffectPool';

/**
 * Pooled explosion effects system with flash, smoke, fire, and shockwave
 */
export class ExplosionEffectsPool extends EffectPool<ExplosionEffect> {
  private smokeTexture: THREE.Texture;
  private flashTexture: THREE.Texture;
  private debrisTexture: THREE.Texture;

  constructor(scene: THREE.Scene, maxEffects = 16) {
    super(scene, maxEffects);

    // Create textures
    this.smokeTexture = createSmokeTexture();
    this.flashTexture = createFlashTexture();
    this.debrisTexture = createDebrisTexture();

    // Pre-allocate pool and add to scene once (toggle visible, never add/remove)
    for (let i = 0; i < maxEffects; i++) {
      const effect = this.createEffect();
      this.scene.add(effect.flash);
      this.scene.add(effect.flashSprite);
      this.scene.add(effect.smokeParticles);
      this.scene.add(effect.fireParticles);
      this.scene.add(effect.debrisParticles);
      this.scene.add(effect.shockwaveRing);
      this.pool.push(effect);
    }
  }

  protected createEffect(): ExplosionEffect {
    return createExplosionEffect(this.scene, this.smokeTexture, this.flashTexture, this.debrisTexture);
  }

  protected isExpired(effect: ExplosionEffect, now: number): boolean {
    return effect.aliveUntil <= now;
  }

  protected deactivateEffect(effect: ExplosionEffect): void {
    effect.flash.visible = false;
    effect.flashSprite.visible = false;
    effect.smokeParticles.visible = false;
    effect.fireParticles.visible = false;
    effect.debrisParticles.visible = false;
    effect.shockwaveRing.visible = false;
  }

  protected disposeEffect(effect: ExplosionEffect): void {
    this.scene.remove(effect.flash);
    this.scene.remove(effect.flashSprite);
    this.scene.remove(effect.smokeParticles);
    this.scene.remove(effect.fireParticles);
    this.scene.remove(effect.debrisParticles);
    this.scene.remove(effect.shockwaveRing);
    effect.smokeParticles.geometry.dispose();
    effect.fireParticles.geometry.dispose();
    effect.debrisParticles.geometry.dispose();
    effect.shockwaveRing.geometry.dispose();
    (effect.flashSprite.material as THREE.SpriteMaterial).dispose();
    (effect.smokeParticles.material as THREE.PointsMaterial).dispose();
    (effect.fireParticles.material as THREE.PointsMaterial).dispose();
    (effect.debrisParticles.material as THREE.PointsMaterial).dispose();
    (effect.shockwaveRing.material as THREE.MeshBasicMaterial).dispose();
  }

  /**
   * Force GPU shader compilation for all effect materials.
   * Call once after construction to avoid first-explosion stall.
   */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const effect = this.pool[0];
    if (!effect) return;
    effect.flashSprite.visible = true;
    effect.smokeParticles.visible = true;
    effect.fireParticles.visible = true;
    effect.debrisParticles.visible = true;
    effect.shockwaveRing.visible = true;
    renderer.compile(this.scene, camera);
    effect.flashSprite.visible = false;
    effect.smokeParticles.visible = false;
    effect.fireParticles.visible = false;
    effect.debrisParticles.visible = false;
    effect.shockwaveRing.visible = false;
  }

  spawn(position: THREE.Vector3): void {
    const effect = this.acquire();
    if (!effect) return;

    const now = performance.now();

    // Position flash
    effect.flash.position.copy(position);
    effect.flash.intensity = 8;
    effect.flash.visible = true;

    // Position flash sprite
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
    effect.shockwaveRing.position.y += 0.1;
    effect.shockwaveRing.scale.set(0.1, 0.1, 1);
    (effect.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.6;
    effect.shockwaveRing.visible = true;

    // Set timing - explosion lasts 3 seconds
    effect.startTime = now;
    effect.aliveUntil = now + 3000;

    this.pushActive(effect);
  }

  update(deltaTime: number): void {
    const now = performance.now();

    // Update active effects before sweeping
    for (const effect of this.active) {
      if (effect.aliveUntil > now) {
        const elapsed = now - effect.startTime;
        const progress = elapsed / 3000;
        updateFlash(effect, elapsed);
        updateFireParticles(effect, elapsed, deltaTime);
        updateDebrisParticles(effect, elapsed, deltaTime);
        updateSmokeParticles(effect, elapsed, deltaTime, progress);
        updateShockwave(effect, elapsed);
      }
    }

    this.sweep(now);
  }

  dispose(): void {
    super.dispose();
    this.smokeTexture.dispose();
    this.flashTexture.dispose();
    this.debrisTexture.dispose();
  }
}
