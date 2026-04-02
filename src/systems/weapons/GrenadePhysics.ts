import * as THREE from 'three';
import { objectPool } from '../../utils/ObjectPoolManager';
import { GrenadeType } from '../combat/types';

export interface Grenade {
  id: string;
  type: GrenadeType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  mesh: THREE.Mesh;
  fuseTime: number;
  isActive: boolean;
  /** Kill feed weapon type override (default: 'grenade'). */
  killFeedWeaponType?: string;
}

type GroundHeightFn = (x: number, z: number) => number;

export class GrenadePhysics {
  private gravity: number;
  private airResistance: number;
  private bounceDamping: number;
  private frictionMud: number;
  private frictionWater: number;

  constructor(
    gravity: number,
    airResistance: number,
    bounceDamping: number,
    frictionMud: number,
    frictionWater: number
  ) {
    this.gravity = gravity;
    this.airResistance = airResistance;
    this.bounceDamping = bounceDamping;
    this.frictionMud = frictionMud;
    this.frictionWater = frictionWater;
  }

  updateGrenade(grenade: Grenade, deltaTime: number, getGroundHeight: GroundHeightFn): void {
    // Apply gravity
    grenade.velocity.y += this.gravity * deltaTime;

    // Apply air resistance to all components
    grenade.velocity.multiplyScalar(this.airResistance);

    const nextPosition = objectPool.getVector3().copy(grenade.position);
    const velocityDelta = objectPool.getVector3().copy(grenade.velocity).multiplyScalar(deltaTime);
    nextPosition.add(velocityDelta);

    const groundHeight = getGroundHeight(nextPosition.x, nextPosition.z) + 0.3;

    if (nextPosition.y <= groundHeight) {
      nextPosition.y = groundHeight;

      // Determine surface type based on height (simple heuristic)
      // Water level is around 0-1m, rocks might be on slopes
      const surfaceFriction = groundHeight < 1.0 ? this.frictionWater : this.frictionMud;

      // Only bounce if falling fast enough
      if (Math.abs(grenade.velocity.y) > 2.0) {
        grenade.velocity.y = -grenade.velocity.y * this.bounceDamping;
        // Reduce horizontal velocity on bounce
        grenade.velocity.x *= (1.0 - surfaceFriction * 0.3);
        grenade.velocity.z *= (1.0 - surfaceFriction * 0.3);
        // Reduce rotation on bounce
        grenade.rotationVelocity.multiplyScalar(0.8);
      } else {
        // Stop bouncing, just roll
        grenade.velocity.y = 0;
        grenade.velocity.x *= (1.0 - surfaceFriction);
        grenade.velocity.z *= (1.0 - surfaceFriction);
        // Slow rotation when rolling
        grenade.rotationVelocity.multiplyScalar(0.9);
      }
    }

    grenade.position.copy(nextPosition);
    objectPool.releaseVector3(nextPosition);
    objectPool.releaseVector3(velocityDelta);

    const rotDelta = objectPool.getVector3().copy(grenade.rotationVelocity).multiplyScalar(deltaTime);
    grenade.rotation.add(rotDelta);
    objectPool.releaseVector3(rotDelta);

    grenade.mesh.position.copy(grenade.position);
    grenade.mesh.rotation.set(grenade.rotation.x, grenade.rotation.y, grenade.rotation.z);
  }
}

export class GrenadeSpawner {
  private scene: THREE.Scene;
  private sharedGeometry: THREE.SphereGeometry;
  private materials: Record<string, THREE.MeshStandardMaterial>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    this.materials = {
      [GrenadeType.FRAG]: new THREE.MeshStandardMaterial({ color: 0x2a4a2a, metalness: 0.6, roughness: 0.4 }),
      [GrenadeType.SMOKE]: new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.6, roughness: 0.4 }),
      [GrenadeType.FLASHBANG]: new THREE.MeshStandardMaterial({ color: 0xFFFFAA, metalness: 0.6, roughness: 0.4 }),
    };
  }

  spawnGrenade(position: THREE.Vector3, velocity: THREE.Vector3, fuseTime: number, id: number, type: GrenadeType): Grenade {
    const mesh = new THREE.Mesh(this.sharedGeometry, this.materials[type] ?? this.materials[GrenadeType.FRAG]);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = true;
    this.scene.add(mesh);

    return {
      id: `grenade_${id}`,
      type,
      position: position.clone(),
      velocity: velocity.clone(),
      rotation: new THREE.Vector3(0, 0, 0),
      rotationVelocity: new THREE.Vector3(
        Math.random() * 5 - 2.5,
        Math.random() * 5 - 2.5,
        Math.random() * 5 - 2.5
      ),
      mesh,
      fuseTime: fuseTime,
      isActive: true
    };
  }

  removeGrenade(grenade: Grenade): void {
    if (grenade.mesh) {
      this.scene.remove(grenade.mesh);
      // Geometry and materials are shared, don't dispose per-grenade
    }
  }

  dispose(): void {
    this.sharedGeometry.dispose();
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
