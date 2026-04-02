import * as THREE from 'three';
import { EffectPool } from './EffectPool';

interface ImpactEffect {
  particles: THREE.Points;
  sparks: THREE.Points;
  decal: THREE.Sprite;
  aliveUntil: number;
  startTime: number;
  velocity: THREE.Vector3[];
}

/**
 * Pooled impact effects system with particles, sparks, and decals
 */
export class ImpactEffectsPool extends EffectPool<ImpactEffect> {
  private particleMaterial: THREE.PointsMaterial;
  private sparkMaterial: THREE.PointsMaterial;
  private decalMaterial: THREE.SpriteMaterial;
  private decalTexture: THREE.Texture;

  // Pre-allocated scratch vectors to avoid per-frame allocations
  private readonly gravity = new THREE.Vector3(0, -9.8, 0);

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
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, this.particleMaterial);
    particles.visible = false;
    particles.matrixAutoUpdate = true;

    // Create sparks (blood spray)
    const sparkCount = 15;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
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

    return { particles, sparks, decal, aliveUntil: 0, startTime: 0, velocity };
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
    const particlePositions = effect.particles.geometry.attributes.position as THREE.BufferAttribute;
    const sparkPositions = effect.sparks.geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < particlePositions.count; i++) {
      particlePositions.setXYZ(i, position.x, position.y, position.z);

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
    particlePositions.needsUpdate = true;

    for (let i = 0; i < sparkPositions.count; i++) {
      sparkPositions.setXYZ(i, position.x, position.y, position.z);

      const speed = 6 + Math.random() * 6;
      const spread = 0.4;

      effect.velocity[particlePositions.count + i].copy(normal);
      effect.velocity[particlePositions.count + i].multiplyScalar(speed);
      effect.velocity[particlePositions.count + i].x += (Math.random() - 0.5) * spread * speed;
      effect.velocity[particlePositions.count + i].y += (Math.random() - 0.5) * spread * speed;
      effect.velocity[particlePositions.count + i].z += (Math.random() - 0.5) * spread * speed;
    }
    sparkPositions.needsUpdate = true;

    effect.particles.visible = true;
    effect.sparks.visible = true;

    const now = performance.now();
    effect.startTime = now;
    effect.aliveUntil = now + 500;

    this.pushActive(effect);
  }

  update(deltaTime: number): void {
    const now = performance.now();

    // Update physics on active effects before sweeping
    for (const effect of this.active) {
      if (effect.aliveUntil <= now) continue;

      const elapsed = now - effect.startTime;
      const particlePositions = effect.particles.geometry.attributes.position as THREE.BufferAttribute;
      const sparkPositions = effect.sparks.geometry.attributes.position as THREE.BufferAttribute;

      for (let j = 0; j < particlePositions.count; j++) {
        effect.velocity[j].addScaledVector(this.gravity, deltaTime);
        const x = particlePositions.getX(j) + effect.velocity[j].x * deltaTime;
        const y = particlePositions.getY(j) + effect.velocity[j].y * deltaTime;
        const z = particlePositions.getZ(j) + effect.velocity[j].z * deltaTime;
        particlePositions.setXYZ(j, x, y, z);
      }
      particlePositions.needsUpdate = true;

      for (let j = 0; j < sparkPositions.count; j++) {
        const idx = particlePositions.count + j;
        effect.velocity[idx].multiplyScalar(0.95);
        const x = sparkPositions.getX(j) + effect.velocity[idx].x * deltaTime;
        const y = sparkPositions.getY(j) + effect.velocity[idx].y * deltaTime;
        const z = sparkPositions.getZ(j) + effect.velocity[idx].z * deltaTime;
        sparkPositions.setXYZ(j, x, y, z);
      }
      sparkPositions.needsUpdate = true;

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
