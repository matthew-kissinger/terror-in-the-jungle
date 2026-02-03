import * as THREE from 'three';
import { objectPool } from '../../utils/ObjectPoolManager';

export interface Grenade {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  mesh: THREE.Mesh;
  fuseTime: number;
  isActive: boolean;
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
