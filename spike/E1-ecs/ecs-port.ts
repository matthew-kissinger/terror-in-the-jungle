/**
 * E1 spike — native bitECS port.
 *
 * Components are plain SoA objects of TypedArrays indexed by eid. The physics
 * system is a single tight loop that reads/writes typed-array slots directly.
 * No wrappers. No classes. This is the native form.
 *
 * bitECS 0.4 uses world.components directly and query(world, [Component]) to
 * get a Uint32Array of entity ids.
 */
import { createWorld, addEntity, query, addComponent } from 'bitecs';

// --- Components ---
// Position and velocity are SoA: component = { x: Float32Array, y: Float32Array, z: Float32Array }
// Active is a single Uint8Array flag (1 = live, 0 = dead).
//
// Pre-allocating max size avoids TypedArray resizing during spawn.
// Set well above our 3000-agent vision anchor to stay clear of any
// sparse-set pathological behavior near capacity.
const MAX_ENTITIES = 16_384;

function makePosition() {
  return {
    x: new Float32Array(MAX_ENTITIES),
    y: new Float32Array(MAX_ENTITIES),
    z: new Float32Array(MAX_ENTITIES),
  };
}
function makeVelocity() {
  return {
    x: new Float32Array(MAX_ENTITIES),
    y: new Float32Array(MAX_ENTITIES),
    z: new Float32Array(MAX_ENTITIES),
  };
}
function makeActive() {
  return new Uint8Array(MAX_ENTITIES);
}

export interface EcsWorldContext {
  components: {
    Position: ReturnType<typeof makePosition>;
    Velocity: ReturnType<typeof makeVelocity>;
    Active: ReturnType<typeof makeActive>;
  };
  gravity: number;
  airResistance: number;
  bounceDamping: number;
  frictionMud: number;
  frictionWater: number;
  getGroundHeight: (x: number, z: number) => number;
}

export function createEcsWorld(getGroundHeight: (x: number, z: number) => number) {
  const ctx: EcsWorldContext = {
    components: {
      Position: makePosition(),
      Velocity: makeVelocity(),
      Active: makeActive(),
    },
    gravity: -52,
    airResistance: 0.995,
    bounceDamping: 0.4,
    frictionMud: 0.7,
    frictionWater: 1.0,
    getGroundHeight,
  };
  // bitECS createWorld attaches our context to the world handle.
  return createWorld(ctx);
}

export type EcsWorld = ReturnType<typeof createEcsWorld>;

export function spawnEcsProjectile(
  world: EcsWorld,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): number {
  const eid = addEntity(world);
  const { Position, Velocity, Active } = world.components;
  addComponent(world, eid, Position);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, Active);
  Position.x[eid] = x;
  Position.y[eid] = y;
  Position.z[eid] = z;
  Velocity.x[eid] = vx;
  Velocity.y[eid] = vy;
  Velocity.z[eid] = vz;
  Active[eid] = 1;
  return eid;
}

export function stepEcsPhysics(world: EcsWorld, dt: number): void {
  const { Position, Velocity, Active } = world.components;
  const gravity = world.gravity;
  const airResistance = world.airResistance;
  const bounceDamping = world.bounceDamping;
  const frictionMud = world.frictionMud;
  const frictionWater = world.frictionWater;
  const getGroundHeight = world.getGroundHeight;

  // Hoist TypedArray refs into locals so the JIT sees them as stable.
  const px = Position.x, py = Position.y, pz = Position.z;
  const vx = Velocity.x, vy = Velocity.y, vz = Velocity.z;
  const active = Active;

  const ents = query(world, [Position, Velocity, Active]);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];
    if (active[eid] === 0) continue;

    // Gravity
    vy[eid] += gravity * dt;

    // Air resistance
    vx[eid] *= airResistance;
    vy[eid] *= airResistance;
    vz[eid] *= airResistance;

    // Integrate
    px[eid] += vx[eid] * dt;
    py[eid] += vy[eid] * dt;
    pz[eid] += vz[eid] * dt;

    // Ground collision
    const groundHeight = getGroundHeight(px[eid], pz[eid]) + 0.3;
    if (py[eid] <= groundHeight) {
      py[eid] = groundHeight;
      const surfaceFriction = groundHeight < 1.0 ? frictionWater : frictionMud;
      const vyi = vy[eid];
      if (Math.abs(vyi) > 2.0) {
        vy[eid] = -vyi * bounceDamping;
        vx[eid] *= 1.0 - surfaceFriction * 0.3;
        vz[eid] *= 1.0 - surfaceFriction * 0.3;
      } else {
        vy[eid] = 0;
        vx[eid] *= 1.0 - surfaceFriction;
        vz[eid] *= 1.0 - surfaceFriction;
      }
    }
  }
}
