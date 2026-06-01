/**
 * SCOPING SPIKE ONLY — NOT production code. See CombatantComponents.ts header.
 *
 * Deterministic seed generator shared by the parity test and the benchmark.
 *
 * DETERMINISM CONTRACT: entities are seeded from a fixed integer sequence — a
 * tiny integer LCG fed by a caller-supplied integer `seed`. NO Math.random, NO
 * Date.now / performance.now, nothing environment-dependent. Same `seed` + same
 * `count` => byte-identical field values on every machine and every run. This
 * is what lets the parity assertion be "bit-identical", not "approximately
 * equal". (The benchmark is free to use wall-clock timing for *measurement*;
 * only the seed data must be deterministic.)
 */

import {
  CombatantFactionId,
  CombatantStateId,
} from './CombatantComponents';
import type { CombatantSeed } from './CombatantEcsWorld';

/**
 * Minimal integer LCG (Numerical Recipes constants). Returns a value in
 * [0, 2^32). Pure integer math => identical across platforms. We intentionally
 * do NOT reuse src/core/SeededRandom here: this module must stay free of any
 * production import so the "src/ecs/ is never reached from prod" fence is
 * trivially true in both directions.
 */
function makeLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

export interface SpikeSeedResult {
  seeds: CombatantSeed[];
  visualRange: number[];
}

/**
 * Generate `count` deterministic combatant seeds spread across a 400m box,
 * roughly half BLUFOR / half OPFOR, a deterministic ~6% marked DEAD, and
 * per-entity visual range in [40, 120]m. The mix guarantees the targeting scan
 * exercises every branch (enemy in range, ally skipped, dead skipped,
 * out-of-range skipped).
 */
export function generateSpikeSeeds(count: number, seed: number): SpikeSeedResult {
  const rng = makeLcg(seed);
  // Draw a float in [0, 1) from the integer stream.
  const next01 = () => rng() / 4294967296;

  const seeds: CombatantSeed[] = new Array(count);
  const visualRange: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const factionId = (i % 2 === 0) ? CombatantFactionId.US : CombatantFactionId.NVA;
    // Deterministic ~6% dead (every 17th entity), so the DEAD-skip path is hit.
    const stateId = (i % 17 === 0) ? CombatantStateId.DEAD : CombatantStateId.ALIVE;

    seeds[i] = {
      x: (next01() - 0.5) * 400,
      y: (next01() - 0.5) * 20,
      z: (next01() - 0.5) * 400,
      vx: (next01() - 0.5) * 6,
      vy: 0,
      vz: (next01() - 0.5) * 6,
      health: 50 + next01() * 50,
      stateId,
      factionId,
      squadId: 1 + (i % 12),
    };
    visualRange[i] = 40 + next01() * 80;
  }

  return { seeds, visualRange };
}
