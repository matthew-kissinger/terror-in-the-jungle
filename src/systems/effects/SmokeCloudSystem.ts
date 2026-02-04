import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { createSmokeTexture } from './ExplosionTextures';

interface SmokeCloud {
  group: THREE.Group;
  sprites: THREE.Sprite[];
  offsets: Float32Array;
  radii: Float32Array;
  baseScales: Float32Array;
  maxRadius: number;
  expandDuration: number;
  lingerDuration: number;
  dissipateDuration: number;
  age: number;
}

// Module-level scratch vectors for LOS calculations
const _closestPoint = new THREE.Vector3();
const _lineDir = new THREE.Vector3();
const _toPoint = new THREE.Vector3();

let smokeCloudSystem: SmokeCloudSystem | undefined;

export function setSmokeCloudSystem(system?: SmokeCloudSystem): void {
  smokeCloudSystem = system;
}

export function spawnSmokeCloud(position: THREE.Vector3): void {
  smokeCloudSystem?.spawn(position);
}

export class SmokeCloudSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private overlay?: HTMLDivElement;

  private texture!: THREE.Texture;
  private clouds: SmokeCloud[] = [];
  private pool: SmokeCloud[] = [];

  private readonly MAX_CLOUDS = 10;
  private readonly SPRITES_PER_CLOUD = 24;
  private readonly BASE_OPACITY = 0.85;
  private readonly OVERLAY_MAX_OPACITY = 0.7;
  private overlayOpacity = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  async init(): Promise<void> {
    Logger.info('effects', 'Initializing Smoke Cloud System...');
    this.texture = createSmokeTexture();
    this.createOverlay();

    for (let i = 0; i < this.MAX_CLOUDS; i++) {
      this.pool.push(this.createCloud());
    }

    Logger.info('effects', `Smoke Cloud System initialized (pool: ${this.MAX_CLOUDS})`);
  }

  update(deltaTime: number): void {
    if (this.clouds.length === 0) {
      this.updateOverlayOpacity(deltaTime, 0);
      return;
    }

    const cameraPos = this.camera.position;
    let maxInfluence = 0;

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      cloud.age += deltaTime;

      const expandEnd = cloud.expandDuration;
      const dissipateStart = expandEnd + cloud.lingerDuration;
      const dissipateEnd = dissipateStart + cloud.dissipateDuration;

      if (cloud.age >= dissipateEnd) {
        this.deactivateCloud(i);
        continue;
      }

      let radius = cloud.maxRadius;
      let opacityPhase = 1;

      if (cloud.age < expandEnd) {
        const t = cloud.age / expandEnd;
        const eased = t * t * (3 - 2 * t);
        radius = cloud.maxRadius * eased;
        opacityPhase = 0.55 + 0.45 * eased;
      } else if (cloud.age >= dissipateStart) {
        const t = (cloud.age - dissipateStart) / cloud.dissipateDuration;
        opacityPhase = 1 - t;
        radius = cloud.maxRadius * (1 + 0.2 * t);
      }

      const spriteCount = cloud.sprites.length;
      for (let s = 0; s < spriteCount; s++) {
        const idx = s * 3;
        const x = cloud.offsets[idx] * radius;
        const y = cloud.offsets[idx + 1] * radius * 0.6;
        const z = cloud.offsets[idx + 2] * radius;
        const sprite = cloud.sprites[s];
        const edgeFade = 1 - 0.6 * cloud.radii[s];
        const opacity = this.BASE_OPACITY * opacityPhase * edgeFade;
        const scale = cloud.baseScales[s] * (0.7 + 0.3 * opacityPhase) + radius * 0.08;

        sprite.position.set(x, y, z);
        sprite.scale.set(scale, scale, 1);
        (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      }

      const dx = cameraPos.x - cloud.group.position.x;
      const dy = cameraPos.y - cloud.group.position.y;
      const dz = cameraPos.z - cloud.group.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const radiusSq = radius * radius;
      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq);
        const influence = 1 - dist / radius;
        if (influence > maxInfluence) {
          maxInfluence = influence;
        }
      }
    }

    this.updateOverlayOpacity(deltaTime, maxInfluence * this.OVERLAY_MAX_OPACITY);
  }

  dispose(): void {
    for (const cloud of this.clouds) {
      this.disposeCloud(cloud);
    }
    for (const cloud of this.pool) {
      this.disposeCloud(cloud);
    }

    this.clouds.length = 0;
    this.pool.length = 0;

    this.texture.dispose();

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = undefined;
    }

    Logger.info('effects', 'Smoke Cloud System disposed');
  }

  spawn(position: THREE.Vector3): void {
    const cloud = this.pool.pop() || this.clouds.pop();
    if (!cloud) return;

    cloud.age = 0;
    cloud.maxRadius = 8 + Math.random() * 2;
    cloud.expandDuration = 1 + Math.random();
    cloud.lingerDuration = 8 + Math.random() * 2;
    cloud.dissipateDuration = 3;

    cloud.group.position.copy(position);
    cloud.group.position.y += 0.5;
    cloud.group.visible = true;

    const spriteCount = cloud.sprites.length;
    for (let i = 0; i < spriteCount; i++) {
      const randX = Math.random() * 2 - 1;
      const randY = Math.random() * 0.8 + 0.1;
      const randZ = Math.random() * 2 - 1;
      const length = Math.sqrt(randX * randX + randY * randY + randZ * randZ) || 1;
      const spread = Math.pow(Math.random(), 0.6);

      const nx = (randX / length) * spread;
      const ny = (randY / length) * spread;
      const nz = (randZ / length) * spread;

      const idx = i * 3;
      cloud.offsets[idx] = nx;
      cloud.offsets[idx + 1] = ny;
      cloud.offsets[idx + 2] = nz;
      cloud.radii[i] = Math.min(1, Math.sqrt(nx * nx + ny * ny + nz * nz));
      cloud.baseScales[i] = 2.2 + Math.random() * 2.2;

      const sprite = cloud.sprites[i];
      sprite.position.set(0, 0, 0);
      sprite.scale.set(1, 1, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = 0;
    }

    this.clouds.push(cloud);
  }

  /**
   * Check if a line segment passes through any active smoke cloud
   * Returns true if the line is blocked by smoke
   */
  isLineBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (this.clouds.length === 0) return false;

    _lineDir.subVectors(to, from);
    const lineLength = _lineDir.length();
    if (lineLength === 0) return false;

    _lineDir.divideScalar(lineLength);

    for (const cloud of this.clouds) {
      // Calculate effective radius based on cloud lifecycle
      const expandEnd = cloud.expandDuration;
      const dissipateStart = expandEnd + cloud.lingerDuration;

      let effectiveRadius: number;
      if (cloud.age < expandEnd) {
        // During expansion
        const t = cloud.age / expandEnd;
        const eased = t * t * (3 - 2 * t);
        effectiveRadius = cloud.maxRadius * eased;
      } else if (cloud.age >= dissipateStart) {
        // During dissipation
        const t = (cloud.age - dissipateStart) / cloud.dissipateDuration;
        effectiveRadius = cloud.maxRadius * (1 + 0.2 * t);
      } else {
        // During linger
        effectiveRadius = cloud.maxRadius;
      }

      // Find closest point on line segment to cloud center
      _toPoint.subVectors(cloud.group.position, from);
      const dot = _toPoint.dot(_lineDir);
      const clampedT = Math.max(0, Math.min(lineLength, dot));

      _closestPoint.copy(from).addScaledVector(_lineDir, clampedT);

      // Check if closest point is within cloud radius
      const distSq = _closestPoint.distanceToSquared(cloud.group.position);
      const radiusSq = effectiveRadius * effectiveRadius;

      if (distSq < radiusSq) {
        return true;
      }
    }

    return false;
  }

  private createCloud(): SmokeCloud {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);

    const sprites: THREE.Sprite[] = [];
    const offsets = new Float32Array(this.SPRITES_PER_CLOUD * 3);
    const radii = new Float32Array(this.SPRITES_PER_CLOUD);
    const baseScales = new Float32Array(this.SPRITES_PER_CLOUD);

    for (let i = 0; i < this.SPRITES_PER_CLOUD; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        color: 0xd8d8d8,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 2;
      group.add(sprite);
      sprites.push(sprite);
    }

    return {
      group,
      sprites,
      offsets,
      radii,
      baseScales,
      maxRadius: 9,
      expandDuration: 1.5,
      lingerDuration: 9,
      dissipateDuration: 3,
      age: 0
    };
  }

  private deactivateCloud(index: number): void {
    const cloud = this.clouds[index];
    cloud.group.visible = false;

    const spriteCount = cloud.sprites.length;
    for (let i = 0; i < spriteCount; i++) {
      (cloud.sprites[i].material as THREE.SpriteMaterial).opacity = 0;
    }

    const last = this.clouds.length - 1;
    if (index !== last) {
      this.clouds[index] = this.clouds[last];
    }
    this.clouds.pop();
    this.pool.push(cloud);
  }

  private disposeCloud(cloud: SmokeCloud): void {
    this.scene.remove(cloud.group);
    for (const sprite of cloud.sprites) {
      sprite.material.dispose();
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'smoke-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 80;
      opacity: 0;
      background: rgba(200, 200, 200, 1);
      transition: none;
      backdrop-filter: blur(2px);
    `;
    document.body.appendChild(this.overlay);
  }

  private updateOverlayOpacity(deltaTime: number, targetOpacity: number): void {
    if (!this.overlay) return;

    const blend = Math.min(1, deltaTime * 6);
    this.overlayOpacity += (targetOpacity - this.overlayOpacity) * blend;

    if (this.overlayOpacity < 0.01) {
      this.overlayOpacity = 0;
    }

    this.overlay.style.opacity = this.overlayOpacity.toString();
  }
}
