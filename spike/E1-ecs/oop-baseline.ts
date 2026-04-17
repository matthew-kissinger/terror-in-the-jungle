/**
 * E1 spike — OOP baseline.
 *
 * Mirrors the current `GrenadePhysics.updateGrenade` loop from
 * `src/systems/weapons/GrenadePhysics.ts`, stripped of:
 *   - THREE.Mesh updates (rendering is not what we're measuring here)
 *   - ObjectPool Vector3 borrow/release (we measure the OOP data model, not the pool)
 *   - Rotation (irrelevant to the tight physics loop)
 *
 * Kept:
 *   - THREE.Vector3 field layout (property access, scattered heap)
 *   - Gravity, air resistance, bounce, friction, ground height check
 *   - Active/dead entities stored in an array, scanned each tick
 *
 * This is the fair "representative current-shape" baseline. If we want to port
 * combatants later, combatants are shaped similarly (objects in a Map with
 * Vector3 fields), so the cache-miss story is the same.
 */
import * as THREE from 'three';

export interface OopProjectile {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  active: boolean;
}

export interface OopWorld {
  projectiles: OopProjectile[];
  gravity: number;
  airResistance: number;
  bounceDamping: number;
  frictionMud: number;
  frictionWater: number;
  getGroundHeight: (x: number, z: number) => number;
}

export function createOopWorld(getGroundHeight: (x: number, z: number) => number): OopWorld {
  return {
    projectiles: [],
    gravity: -52,
    airResistance: 0.995,
    bounceDamping: 0.4,
    frictionMud: 0.7,
    frictionWater: 1.0,
    getGroundHeight,
  };
}

export function spawnOopProjectile(
  world: OopWorld,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): OopProjectile {
  const p: OopProjectile = {
    id: world.projectiles.length,
    position: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(vx, vy, vz),
    active: true,
  };
  world.projectiles.push(p);
  return p;
}

export function stepOopPhysics(world: OopWorld, dt: number): void {
  const projectiles = world.projectiles;
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;

    // Gravity
    p.velocity.y += world.gravity * dt;

    // Air resistance (multiplies all three components — matches GrenadePhysics)
    p.velocity.multiplyScalar(world.airResistance);

    // Integrate position
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    p.position.z += p.velocity.z * dt;

    // Ground collision
    const groundHeight = world.getGroundHeight(p.position.x, p.position.z) + 0.3;
    if (p.position.y <= groundHeight) {
      p.position.y = groundHeight;
      const surfaceFriction = groundHeight < 1.0 ? world.frictionWater : world.frictionMud;
      if (Math.abs(p.velocity.y) > 2.0) {
        p.velocity.y = -p.velocity.y * world.bounceDamping;
        p.velocity.x *= 1.0 - surfaceFriction * 0.3;
        p.velocity.z *= 1.0 - surfaceFriction * 0.3;
      } else {
        p.velocity.y = 0;
        p.velocity.x *= 1.0 - surfaceFriction;
        p.velocity.z *= 1.0 - surfaceFriction;
      }
    }
  }
}
