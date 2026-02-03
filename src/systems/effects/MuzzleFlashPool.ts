import * as THREE from 'three';

interface MuzzleFlash {
  sprite: THREE.Sprite;
  light: THREE.PointLight;
  aliveUntil: number;
  startTime: number;
}

/**
 * Pooled muzzle flash system with sprites and dynamic lighting
 * Based on modern FPS implementations with GPU-optimized effects
 */
export class MuzzleFlashPool {
  private scene: THREE.Scene;
  private pool: MuzzleFlash[] = [];
  private active: MuzzleFlash[] = [];
  private maxFlashes: number;
  private flashTextures: THREE.Texture[] = [];
  private currentTextureIndex = 0;

  constructor(scene: THREE.Scene, maxFlashes = 32) {
    this.scene = scene;
    this.maxFlashes = maxFlashes;

    // Create multiple flash textures for variety
    this.createFlashTextures();

    // Pre-allocate pool
    for (let i = 0; i < maxFlashes; i++) {
      const flash = this.createMuzzleFlash();
      flash.sprite.visible = false;
      flash.light.visible = false;
      this.pool.push(flash);
      this.scene.add(flash.sprite);
      this.scene.add(flash.light);
    }
  }

  private createFlashTextures(): void {
    // Create procedural flash textures
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      // Create radial gradient flash pattern
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);

      // Vary colors slightly for each texture
      const hue = 30 + Math.random() * 20; // Orange to yellow range
      gradient.addColorStop(0, `hsla(${hue}, 100%, 95%, 1)`);
      gradient.addColorStop(0.2, `hsla(${hue}, 100%, 80%, 0.9)`);
      gradient.addColorStop(0.4, `hsla(${hue - 10}, 90%, 60%, 0.6)`);
      gradient.addColorStop(0.7, `hsla(${hue - 20}, 80%, 40%, 0.3)`);
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

      // Add some noise/spikes for realism
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);

      // Add star-like spikes
      ctx.save();
      ctx.translate(64, 64);
      ctx.strokeStyle = `hsla(${hue}, 100%, 90%, 0.6)`;
      ctx.lineWidth = 2;

      for (let j = 0; j < 6; j++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -50 - Math.random() * 14);
        ctx.stroke();
      }
      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      this.flashTextures.push(texture);
    }
  }

  private createMuzzleFlash(): MuzzleFlash {
    // Sprite for visual effect
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.flashTextures[0],
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 1
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.5, 0.5, 1);

    // Dynamic light for environmental lighting - enhanced for night visibility
    const light = new THREE.PointLight(0xffaa33, 8, 25); // Increased intensity and range for night
    light.decay = 2;

    return {
      sprite,
      light,
      aliveUntil: 0,
      startTime: 0
    };
  }

  spawn(position: THREE.Vector3, direction: THREE.Vector3, scale = 1): void {
    const flash = this.pool.pop() || this.active.shift();
    if (!flash) return;

    // Position flash
    flash.sprite.position.copy(position);
    flash.light.position.copy(position);

    // Offset slightly forward in the direction of fire
    flash.sprite.position.addScaledVector(direction, 0.1);

    // Random rotation for variety
    flash.sprite.material.rotation = Math.random() * Math.PI * 2;

    // Use different texture for variety
    this.currentTextureIndex = (this.currentTextureIndex + 1) % this.flashTextures.length;
    flash.sprite.material.map = this.flashTextures[this.currentTextureIndex];

    // Random scale variation
    const scaleVariation = 0.8 + Math.random() * 0.4;
    flash.sprite.scale.set(scale * scaleVariation, scale * scaleVariation, 1);

    // Set timing
    const now = performance.now();
    flash.startTime = now;
    flash.aliveUntil = now + 60; // 60ms duration

    // Make visible
    flash.sprite.visible = true;
    flash.light.visible = true;
    flash.sprite.material.opacity = 1;

    this.active.push(flash);
  }

  update(): void {
    const now = performance.now();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const flash = this.active[i];
      const elapsed = now - flash.startTime;
      const remaining = flash.aliveUntil - now;

      if (remaining <= 0) {
        // Hide and return to pool
        flash.sprite.visible = false;
        flash.light.visible = false;
        const last = this.active[this.active.length - 1];
        this.active[i] = last;
        this.active.pop();
        if (this.pool.length < this.maxFlashes) {
          this.pool.push(flash);
        }
      } else {
        // Animate flash
        const progress = elapsed / 60; // 0 to 1 over lifetime

        // Quick expansion then fade
        if (progress < 0.3) {
          // Expand phase
          const expandProgress = progress / 0.3;
          const scale = 0.5 + expandProgress * 0.5;
          flash.sprite.scale.set(scale, scale, 1);
          flash.sprite.material.opacity = 1;
          flash.light.intensity = 3 * (1 - expandProgress * 0.5);
        } else {
          // Fade phase
          const fadeProgress = (progress - 0.3) / 0.7;
          flash.sprite.material.opacity = 1 - fadeProgress;
          flash.light.intensity = 1.5 * (1 - fadeProgress);

          // Slight continued expansion
          const scale = 1 + fadeProgress * 0.2;
          flash.sprite.scale.set(scale, scale, 1);
        }
      }
    }
  }

  dispose(): void {
    this.active.forEach(f => {
      this.scene.remove(f.sprite);
      this.scene.remove(f.light);
      f.sprite.material.dispose();
    });

    this.pool.forEach(f => {
      this.scene.remove(f.sprite);
      this.scene.remove(f.light);
      f.sprite.material.dispose();
    });

    this.flashTextures.forEach(t => t.dispose());

    this.active.length = 0;
    this.pool.length = 0;
    this.flashTextures.length = 0;
  }
}
