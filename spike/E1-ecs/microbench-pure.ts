/**
 * E1 spike — "pure motion" microbench, as a sanity check.
 *
 * Strips the branch/call overhead (no ground collision, no function call) so
 * the inner loop is pure: v += a*dt; p += v*dt. This is the theoretical best
 * case for SoA: three tight typed-array updates per entity.
 *
 * If bitECS doesn't win here, it never will. If it wins here but not in the
 * full physics bench, the difference is explained by branch/call overhead
 * dominating the data-access cost.
 */
import * as THREE from 'three';
import { createWorld, addEntity, query, addComponent } from 'bitecs';

const MAX_ENTITIES = 16_384;

interface PurePure {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}
function stepOop(list: PurePure[], dt: number) {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.velocity.y += -52 * dt;
    p.velocity.multiplyScalar(0.995);
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    p.position.z += p.velocity.z * dt;
  }
}

function makeEcs() {
  const ctx = {
    components: {
      Position: {
        x: new Float32Array(MAX_ENTITIES),
        y: new Float32Array(MAX_ENTITIES),
        z: new Float32Array(MAX_ENTITIES),
      },
      Velocity: {
        x: new Float32Array(MAX_ENTITIES),
        y: new Float32Array(MAX_ENTITIES),
        z: new Float32Array(MAX_ENTITIES),
      },
    },
  };
  return createWorld(ctx);
}

function stepEcs(world: ReturnType<typeof makeEcs>, dt: number) {
  const { Position, Velocity } = world.components;
  const px = Position.x, py = Position.y, pz = Position.z;
  const vx = Velocity.x, vy = Velocity.y, vz = Velocity.z;
  const ents = query(world, [Position, Velocity]);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];
    vy[eid] += -52 * dt;
    vx[eid] *= 0.995;
    vy[eid] *= 0.995;
    vz[eid] *= 0.995;
    px[eid] += vx[eid] * dt;
    py[eid] += vy[eid] * dt;
    pz[eid] += vz[eid] * dt;
  }
}

function bench(kind: 'oop' | 'ecs', N: number, ticks: number, warmup: number): { mean: number; p99: number } {
  if (kind === 'oop') {
    const list: PurePure[] = [];
    for (let i = 0; i < N; i++) {
      list.push({ position: new THREE.Vector3(0, 5, 0), velocity: new THREE.Vector3(1, 10, 1) });
    }
    for (let i = 0; i < warmup; i++) stepOop(list, 1 / 60);
    const s: number[] = [];
    for (let i = 0; i < ticks; i++) {
      const a = performance.now();
      stepOop(list, 1 / 60);
      s.push(performance.now() - a);
    }
    s.sort((x, y) => x - y);
    return { mean: s.reduce((a, b) => a + b, 0) / s.length, p99: s[Math.floor(0.99 * s.length)] };
  } else {
    const world = makeEcs();
    const { Position, Velocity } = world.components;
    for (let i = 0; i < N; i++) {
      const eid = addEntity(world);
      addComponent(world, eid, Position);
      addComponent(world, eid, Velocity);
      Position.x[eid] = 0;
      Position.y[eid] = 5;
      Position.z[eid] = 0;
      Velocity.x[eid] = 1;
      Velocity.y[eid] = 10;
      Velocity.z[eid] = 1;
    }
    for (let i = 0; i < warmup; i++) stepEcs(world, 1 / 60);
    const s: number[] = [];
    for (let i = 0; i < ticks; i++) {
      const a = performance.now();
      stepEcs(world, 1 / 60);
      s.push(performance.now() - a);
    }
    s.sort((x, y) => x - y);
    return { mean: s.reduce((a, b) => a + b, 0) / s.length, p99: s[Math.floor(0.99 * s.length)] };
  }
}

async function main() {
  const ticks = 2000;
  const warmup = 500;
  const sizes = [120, 500, 1000, 2000, 3000, 5000, 10000];
  console.log('Pure-motion sanity bench (no branch, no call, no collision)');
  console.log('N'.padStart(5), 'oop mean'.padStart(10), 'ecs mean'.padStart(10), 'x'.padStart(6));
  for (const N of sizes) {
    const oop = bench('oop', N, ticks, warmup);
    const ecs = bench('ecs', N, ticks, warmup);
    console.log(
      String(N).padStart(5),
      oop.mean.toFixed(4).padStart(10),
      ecs.mean.toFixed(4).padStart(10),
      (oop.mean / ecs.mean).toFixed(2).padStart(6) + 'x',
    );
  }
}
main();
