/**
 * E1 spike — microbench harness.
 *
 * Spawn N projectiles and step physics M times. Report mean ms/tick,
 * p50, p95, p99 per bucket. Run both OOP and ECS ports, print comparison table.
 *
 * Reproduce:
 *   npx tsx spike/E1-ecs/microbench.ts
 *
 * Flags:
 *   --ticks <n>      (default 1000)
 *   --warmup <n>     (default 200)
 *   --sizes <csv>    (default 120,500,1000,2000,3000)
 *   --seed <n>       (default 42)
 *   --json           emit JSON result to stdout
 */
import {
  createOopWorld,
  spawnOopProjectile,
  stepOopPhysics,
} from './oop-baseline';
import {
  createEcsWorld,
  spawnEcsProjectile,
  stepEcsPhysics,
} from './ecs-port';

interface Args {
  ticks: number;
  warmup: number;
  sizes: number[];
  seed: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    if (i < 0 || i === argv.length - 1) return def;
    return argv[i + 1];
  };
  return {
    ticks: Number(get('--ticks', '1000')),
    warmup: Number(get('--warmup', '200')),
    sizes: get('--sizes', '120,500,1000,2000,3000').split(',').map(Number),
    seed: Number(get('--seed', '42')),
    json: argv.includes('--json'),
  };
}

// --- deterministic PRNG (mulberry32) ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ground height function — cheap deterministic terrain analog.
// Uses trig so the JIT can't constant-fold. Represents a rolling hill.
function makeGround() {
  return (x: number, z: number) =>
    2 +
    Math.sin(x * 0.017) * 1.5 +
    Math.cos(z * 0.021) * 1.2 +
    Math.sin((x + z) * 0.009) * 0.8;
}

interface BucketResult {
  kind: 'oop' | 'ecs';
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  totalSec: number;
  entityTicksPerSec: number;
}

function summarize(samples: number[]): { mean: number; p50: number; p95: number; p99: number; min: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))];
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  return {
    mean,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    min: sorted[0],
    max: sorted[n - 1],
  };
}

function respawn(rng: () => number): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  // Random launch within a 100m box, tossed upward with spread.
  return {
    x: (rng() - 0.5) * 200,
    y: 5 + rng() * 10,
    z: (rng() - 0.5) * 200,
    vx: (rng() - 0.5) * 30,
    vy: 10 + rng() * 20,
    vz: (rng() - 0.5) * 30,
  };
}

function runOop(count: number, args: Args): BucketResult {
  const rng = mulberry32(args.seed);
  const ground = makeGround();
  const world = createOopWorld(ground);
  for (let i = 0; i < count; i++) {
    const s = respawn(rng);
    spawnOopProjectile(world, s.x, s.y, s.z, s.vx, s.vy, s.vz);
  }
  const dt = 1 / 60;

  // Warmup
  for (let i = 0; i < args.warmup; i++) {
    stepOopPhysics(world, dt);
    // Respawn any that settled on the ground to keep workload live
    for (const p of world.projectiles) {
      if (p.velocity.lengthSq() < 0.01) {
        const s = respawn(rng);
        p.position.set(s.x, s.y, s.z);
        p.velocity.set(s.vx, s.vy, s.vz);
      }
    }
  }

  // Measure
  const samples: number[] = new Array(args.ticks);
  const t0 = performance.now();
  for (let i = 0; i < args.ticks; i++) {
    const a = performance.now();
    stepOopPhysics(world, dt);
    const b = performance.now();
    samples[i] = b - a;
    for (const p of world.projectiles) {
      if (p.velocity.lengthSq() < 0.01) {
        const s = respawn(rng);
        p.position.set(s.x, s.y, s.z);
        p.velocity.set(s.vx, s.vy, s.vz);
      }
    }
  }
  const totalSec = (performance.now() - t0) / 1000;
  const s = summarize(samples);
  return {
    kind: 'oop',
    count,
    meanMs: s.mean,
    p50Ms: s.p50,
    p95Ms: s.p95,
    p99Ms: s.p99,
    minMs: s.min,
    maxMs: s.max,
    totalSec,
    entityTicksPerSec: (count * args.ticks) / totalSec,
  };
}

function runEcs(count: number, args: Args): BucketResult {
  const rng = mulberry32(args.seed);
  const ground = makeGround();
  const world = createEcsWorld(ground);
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = respawn(rng);
    ids.push(spawnEcsProjectile(world, s.x, s.y, s.z, s.vx, s.vy, s.vz));
  }
  const dt = 1 / 60;

  const { Position, Velocity } = world.components;

  const respawnAny = () => {
    for (const eid of ids) {
      const vx = Velocity.x[eid], vy = Velocity.y[eid], vz = Velocity.z[eid];
      if (vx * vx + vy * vy + vz * vz < 0.01) {
        const s = respawn(rng);
        Position.x[eid] = s.x;
        Position.y[eid] = s.y;
        Position.z[eid] = s.z;
        Velocity.x[eid] = s.vx;
        Velocity.y[eid] = s.vy;
        Velocity.z[eid] = s.vz;
      }
    }
  };

  // Warmup
  for (let i = 0; i < args.warmup; i++) {
    stepEcsPhysics(world, dt);
    respawnAny();
  }

  // Measure
  const samples: number[] = new Array(args.ticks);
  const t0 = performance.now();
  for (let i = 0; i < args.ticks; i++) {
    const a = performance.now();
    stepEcsPhysics(world, dt);
    const b = performance.now();
    samples[i] = b - a;
    respawnAny();
  }
  const totalSec = (performance.now() - t0) / 1000;
  const s = summarize(samples);
  return {
    kind: 'ecs',
    count,
    meanMs: s.mean,
    p50Ms: s.p50,
    p95Ms: s.p95,
    p99Ms: s.p99,
    minMs: s.min,
    maxMs: s.max,
    totalSec,
    entityTicksPerSec: (count * args.ticks) / totalSec,
  };
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

function printTable(results: BucketResult[]): void {
  const header = [
    'N',
    'impl',
    'mean ms',
    'p50 ms',
    'p95 ms',
    'p99 ms',
    'max ms',
    'ent*tick/s',
  ];
  const rows: string[][] = [header];
  for (const r of results) {
    rows.push([
      String(r.count),
      r.kind,
      fmt(r.meanMs, 4),
      fmt(r.p50Ms, 4),
      fmt(r.p95Ms, 4),
      fmt(r.p99Ms, 4),
      fmt(r.maxMs, 4),
      (r.entityTicksPerSec / 1e6).toFixed(2) + 'M',
    ]);
  }
  const widths = header.map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  for (const row of rows) {
    console.log(row.map((c, i) => c.padStart(widths[i])).join('  '));
  }
}

function printSpeedups(results: BucketResult[]): void {
  const bySize: Record<number, { oop?: BucketResult; ecs?: BucketResult }> = {};
  for (const r of results) {
    bySize[r.count] ??= {};
    bySize[r.count][r.kind] = r;
  }
  console.log('\nSpeedup (ecs vs oop), higher is better:');
  console.log('N'.padStart(6), '  mean x', '  p99 x');
  for (const n of Object.keys(bySize).map(Number).sort((a, b) => a - b)) {
    const pair = bySize[n];
    if (!pair.oop || !pair.ecs) continue;
    const meanX = pair.oop.meanMs / pair.ecs.meanMs;
    const p99X = pair.oop.p99Ms / pair.ecs.p99Ms;
    console.log(
      String(n).padStart(6),
      '  ' + fmt(meanX, 2) + 'x',
      '  ' + fmt(p99X, 2) + 'x',
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('E1 spike microbench — bitECS vs current OOP-style physics loop');
  console.log('Node:', process.versions.node, 'V8:', process.versions.v8);
  console.log(
    `ticks=${args.ticks} warmup=${args.warmup} seed=${args.seed} sizes=${args.sizes.join(',')}`,
  );
  console.log();

  const results: BucketResult[] = [];
  for (const n of args.sizes) {
    // Run OOP first, then ECS, to avoid one warming the shared JIT for the other.
    // Interleaving buckets would be ideal but this is good enough.
    const oop = runOop(n, args);
    results.push(oop);
    console.log(`oop  N=${n}  mean=${fmt(oop.meanMs, 4)}ms  p99=${fmt(oop.p99Ms, 4)}ms`);
    const ecs = runEcs(n, args);
    results.push(ecs);
    console.log(`ecs  N=${n}  mean=${fmt(ecs.meanMs, 4)}ms  p99=${fmt(ecs.p99Ms, 4)}ms`);
  }

  console.log();
  printTable(results);
  printSpeedups(results);

  if (args.json) {
    console.log('\n--JSON--');
    console.log(JSON.stringify(results, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
