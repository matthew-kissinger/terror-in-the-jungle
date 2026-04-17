/**
 * E1 spike — "dense iterate" sanity bench.
 *
 * Skip bitECS query() entirely. Treat eids 1..N as live. Iterate the typed
 * arrays directly. This is the theoretical absolute-best SoA case — pure
 * sequential typed-array access with no query/sparse-set overhead.
 *
 * If SoA still doesn't win here, JIT optimization on OOP Vector3 access is
 * just that good at this workload size.
 */
import * as THREE from 'three';

function benchOop(N: number, ticks: number, warmup: number) {
  const list: { position: THREE.Vector3; velocity: THREE.Vector3 }[] = [];
  for (let i = 0; i < N; i++) {
    list.push({ position: new THREE.Vector3(0, 5, 0), velocity: new THREE.Vector3(1, 10, 1) });
  }
  const run = (dt: number) => {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.velocity.y += -52 * dt;
      p.velocity.multiplyScalar(0.995);
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;
    }
  };
  for (let i = 0; i < warmup; i++) run(1 / 60);
  const s: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const a = performance.now();
    run(1 / 60);
    s.push(performance.now() - a);
  }
  s.sort((x, y) => x - y);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function benchSoa(N: number, ticks: number, warmup: number) {
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const vz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    py[i] = 5;
    vx[i] = 1;
    vy[i] = 10;
    vz[i] = 1;
  }
  const run = (dt: number) => {
    for (let i = 0; i < N; i++) {
      vy[i] += -52 * dt;
      vx[i] *= 0.995;
      vy[i] *= 0.995;
      vz[i] *= 0.995;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
    }
  };
  for (let i = 0; i < warmup; i++) run(1 / 60);
  const s: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const a = performance.now();
    run(1 / 60);
    s.push(performance.now() - a);
  }
  s.sort((x, y) => x - y);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

async function main() {
  const ticks = 2000;
  const warmup = 500;
  const sizes = [120, 500, 1000, 2000, 3000, 5000, 10000];
  console.log('Dense-iterate bench: OOP Vector3[] vs raw SoA Float32Array (no bitECS query)');
  console.log('N'.padStart(5), 'oop mean'.padStart(10), 'soa mean'.padStart(10), 'x'.padStart(6));
  for (const N of sizes) {
    const oop = benchOop(N, ticks, warmup);
    const soa = benchSoa(N, ticks, warmup);
    console.log(
      String(N).padStart(5),
      oop.toFixed(4).padStart(10),
      soa.toFixed(4).padStart(10),
      (oop / soa).toFixed(2).padStart(6) + 'x',
    );
  }
}
main();
