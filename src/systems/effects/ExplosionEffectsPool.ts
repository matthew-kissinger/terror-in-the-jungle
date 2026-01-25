import * as THREE from 'three';

interface ExplosionEffect {
  flash: THREE.PointLight;
  flashSprite: THREE.Sprite;
  smokeParticles: THREE.Points;
  fireParticles: THREE.Points;
  shockwaveRing: THREE.Mesh;
  smokeVelocities: THREE.Vector3[];
  fireVelocities: THREE.Vector3[];
  aliveUntil: number;
  startTime: number;
}

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

  constructor(scene: THREE.Scene, maxEffects = 16) {
    this.scene = scene;
    this.maxEffects = maxEffects;

    // Create textures
    this.smokeTexture = this.createSmokeTexture();
    this.flashTexture = this.createFlashTexture();

    // Pre-allocate pool
    for (let i = 0; i < maxEffects; i++) {
      const effect = this.createExplosionEffect();
      this.pool.push(effect);
    }
  }

  private createSmokeTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Create soft smoke particle
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(100, 100, 100, 0.8)');
    gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.4)');
    gradient.addColorStop(1, 'rgba(60, 60, 60, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createFlashTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Create bright flash
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 180, 100, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 120, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(200, 60, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createExplosionEffect(): ExplosionEffect {
    // Bright flash light
    const flash = new THREE.PointLight(0xff8800, 0, 50);
    flash.visible = false;
    this.scene.add(flash);

    // Flash sprite for visual burst
    const flashSpriteMaterial = new THREE.SpriteMaterial({
      map: this.flashTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 1
    });
    const flashSprite = new THREE.Sprite(flashSpriteMaterial);
    flashSprite.scale.set(8, 8, 1);
    flashSprite.visible = false;
    this.scene.add(flashSprite);

    // Smoke particles (40 particles that linger)
    const smokeCount = 40;
    const smokeGeometry = new THREE.BufferGeometry();
    const smokePositions = new Float32Array(smokeCount * 3);
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));

    const smokeMaterial = new THREE.PointsMaterial({
      map: this.smokeTexture,
      size: 3,
      transparent: true,
      opacity: 0.7,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    const smokeParticles = new THREE.Points(smokeGeometry, smokeMaterial);
    smokeParticles.visible = false;
    this.scene.add(smokeParticles);

    // Fire particles (30 bright particles, short-lived)
    const fireCount = 30;
    const fireGeometry = new THREE.BufferGeometry();
    const firePositions = new Float32Array(fireCount * 3);
    fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));

    const fireMaterial = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.8,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const fireParticles = new THREE.Points(fireGeometry, fireMaterial);
    fireParticles.visible = false;
    this.scene.add(fireParticles);

    // Shockwave ring on ground
    const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const shockwaveRing = new THREE.Mesh(ringGeometry, ringMaterial);
    shockwaveRing.rotation.x = -Math.PI / 2;
    shockwaveRing.visible = false;
    this.scene.add(shockwaveRing);

    // Velocity arrays
    const smokeVelocities: THREE.Vector3[] = [];
    const fireVelocities: THREE.Vector3[] = [];

    for (let i = 0; i < smokeCount; i++) {
      smokeVelocities.push(new THREE.Vector3());
    }
    for (let i = 0; i < fireCount; i++) {
      fireVelocities.push(new THREE.Vector3());
    }

    return {
      flash,
      flashSprite,
      smokeParticles,
      fireParticles,
      shockwaveRing,
      smokeVelocities,
      fireVelocities,
      aliveUntil: 0,
      startTime: 0
    };
  }

  spawn(position: THREE.Vector3): void {
    const effect = this.pool.pop() || this.active.shift();
    if (!effect) return;

    const now = performance.now();

    // Position flash
    effect.flash.position.copy(position);
    effect.flash.intensity = 3;
    effect.flash.visible = true;

    // Position flash sprite
    effect.flashSprite.position.copy(position);
    effect.flashSprite.scale.set(8, 8, 1);
    effect.flashSprite.material.opacity = 1;
    effect.flashSprite.visible = true;

    // Initialize smoke particles
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

    // Initialize fire particles
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
    const gravity = new THREE.Vector3(0, -3, 0);

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
        effect.shockwaveRing.visible = false;
        this.active.splice(i, 1);
        if (this.pool.length < this.maxEffects) {
          this.pool.push(effect);
        }
      } else {
        const progress = elapsed / 3000;

        // Flash fades very quickly (first 300ms)
        if (elapsed < 300) {
          const flashProgress = elapsed / 300;
          effect.flash.intensity = 3 * (1 - flashProgress);
          effect.flashSprite.material.opacity = 1 - flashProgress;
          // Flash expands rapidly
          const scale = 8 + flashProgress * 4;
          effect.flashSprite.scale.set(scale, scale, 1);
        } else {
          effect.flash.visible = false;
          effect.flashSprite.visible = false;
        }

        // Fire particles fade out after 800ms
        if (elapsed < 800) {
          const firePositions = effect.fireParticles.geometry.attributes.position as THREE.BufferAttribute;
          for (let j = 0; j < firePositions.count; j++) {
            // Apply gravity
            effect.fireVelocities[j].addScaledVector(gravity, deltaTime * 2);

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

        // Smoke lingers for full duration
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

        // Smoke expands and fades
        const smokeSize = 3 + progress * 5; // Grow to 8 units
        (effect.smokeParticles.material as THREE.PointsMaterial).size = smokeSize;

        // Fade smoke in last 1 second
        if (elapsed > 2000) {
          const smokeFade = (elapsed - 2000) / 1000;
          (effect.smokeParticles.material as THREE.PointsMaterial).opacity = 0.7 * (1 - smokeFade);
        }

        // Shockwave expands rapidly (first 500ms)
        if (elapsed < 500) {
          const shockProgress = elapsed / 500;
          const scale = 0.1 + shockProgress * 15; // Expand to radius 15
          effect.shockwaveRing.scale.set(scale, scale, 1);
          (effect.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - shockProgress);
        } else {
          effect.shockwaveRing.visible = false;
        }
      }
    }
  }

  dispose(): void {
    this.active.forEach(e => {
      this.scene.remove(e.flash);
      this.scene.remove(e.flashSprite);
      this.scene.remove(e.smokeParticles);
      this.scene.remove(e.fireParticles);
      this.scene.remove(e.shockwaveRing);
      e.smokeParticles.geometry.dispose();
      e.fireParticles.geometry.dispose();
      e.shockwaveRing.geometry.dispose();
      (e.flashSprite.material as THREE.SpriteMaterial).dispose();
      (e.smokeParticles.material as THREE.PointsMaterial).dispose();
      (e.fireParticles.material as THREE.PointsMaterial).dispose();
      (e.shockwaveRing.material as THREE.MeshBasicMaterial).dispose();
    });

    this.pool.forEach(e => {
      this.scene.remove(e.flash);
      this.scene.remove(e.flashSprite);
      this.scene.remove(e.smokeParticles);
      this.scene.remove(e.fireParticles);
      this.scene.remove(e.shockwaveRing);
      e.smokeParticles.geometry.dispose();
      e.fireParticles.geometry.dispose();
      e.shockwaveRing.geometry.dispose();
      (e.flashSprite.material as THREE.SpriteMaterial).dispose();
      (e.smokeParticles.material as THREE.PointsMaterial).dispose();
      (e.fireParticles.material as THREE.PointsMaterial).dispose();
      (e.shockwaveRing.material as THREE.MeshBasicMaterial).dispose();
    });

    this.smokeTexture.dispose();
    this.flashTexture.dispose();

    this.active.length = 0;
    this.pool.length = 0;
  }
}
