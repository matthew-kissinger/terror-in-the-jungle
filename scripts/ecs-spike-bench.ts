/**
 * SCOPING SPIKE ONLY — NOT production code.
 *
 * Benchmark entry for the ECS scoping spike. Times the SoA/bitECS nearest-enemy
 * targeting scan against the plain-OOP reference at 120 / 500 / 1000 / 2000
 * entities and prints a comparison table.
 *
 * This is the SPEED half of the spike; src/ecs/EcsParity.test.ts is the
 * correctness half (it must be green before any number here is trusted — a
 * faster path that computes the wrong answer is worthless).
 *
 * NOTE: DO NOT run this from inside the build agent. The next phase runs it:
 *     npx tsx scripts/ecs-spike-bench.ts
 * Optional flags:
 *     --iters <n>   measured iterations per case (default 200)
 *     --warmup <n>  warmup iterations per case   (default 50)
 *     --seed <n>    deterministic seed           (default 2718)
 *
 * Determinism vs timing: the entity *data* is deterministic (fixed integer LCG
 * in CombatantSpikeSeed — no RNG, no clock). Wall-clock timing via
 * performance.now() is used only for measurement, which is the sanctioned use
 * of the clock for this spike.
 *
 * Methodology: per case we rebuild the world/AoS once (build cost is excluded —
 * we are measuring steady-state per-frame scan cost, which is what dominates at
 * 3,000 NPCs), warm both paths to let the JIT settle, then time `iters` calls
 * each and report best + mean ms. Best-of is the most stable signal under a
 * noisy OS scheduler; mean is reported alongside for context.
 */

import { performance } from 'node:perf_hooks';
import { generateSpikeSeeds } from '../src/ecs/CombatantSpikeSeed';
import {
  buildEcsSpikeWorld,
  ecsAssignNearestEnemy,
} from '../src/ecs/CombatantEcsWorld';
import {
  buildOopCombatants,
  oopAssignNearestEnemy,
} from '../src/ecs/CombatantOopReference';

interface BenchArgs {
  iters: number;
  warmup: number;
  seed: number;
}

function parseArgs(argv: string[]): BenchArgs {
  const args: BenchArgs = { iters: 200, warmup: 50, seed: 2718 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--iters') args.iters = Number(argv[++i]);
    else if (a === '--warmup') args.warmup = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
  }
  return args;
}

interface Timing {
  bestMs: number;
  meanMs: number;
}

function timeLoop(fn: () => void, iters: number): Timing {
  let best = Infinity;
  let total = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    if (dt < best) best = dt;
    total += dt;
  }
  return { bestMs: best, meanMs: total / iters };
}

function fmt(ms: number): string {
  return ms.toFixed(4).padStart(10);
}

function main(): void {
  const { iters, warmup, seed } = parseArgs(process.argv.slice(2));
  const counts = [120, 500, 1000, 2000];

  // eslint-disable-next-line no-console
  console.log(
    `ECS spike benchmark — nearest-enemy targeting (SoA/bitECS vs OOP)\n` +
      `seed=${seed} warmup=${warmup} iters=${iters}\n`,
  );
  // eslint-disable-next-line no-console
  console.log(
    [
      'N'.padStart(6),
      'ECS best'.padStart(10),
      'OOP best'.padStart(10),
      'ECS mean'.padStart(10),
      'OOP mean'.padStart(10),
      'best ECS/OOP'.padStart(13),
    ].join('  '),
  );

  for (const count of counts) {
    const { seeds, visualRange } = generateSpikeSeeds(count, seed);

    const spike = buildEcsSpikeWorld(seeds, visualRange);
    const oop = buildOopCombatants(seeds, visualRange);

    // Warm both paths so the JIT optimises before measurement.
    for (let i = 0; i < warmup; i++) {
      ecsAssignNearestEnemy(spike);
      oopAssignNearestEnemy(oop);
    }

    const ecs = timeLoop(() => ecsAssignNearestEnemy(spike), iters);
    const oopT = timeLoop(() => oopAssignNearestEnemy(oop), iters);
    const ratio = ecs.bestMs / oopT.bestMs;

    // eslint-disable-next-line no-console
    console.log(
      [
        String(count).padStart(6),
        fmt(ecs.bestMs),
        fmt(oopT.bestMs),
        fmt(ecs.meanMs),
        fmt(oopT.meanMs),
        `${ratio.toFixed(2)}x`.padStart(13),
      ].join('  '),
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nReading: ratio < 1.0 => SoA/ECS faster; > 1.0 => OOP faster. ` +
      `This single read-heavy loop is one input to the promote/defer call, ` +
      `not the whole decision.`,
  );
}

main();
