/**
 * SCOPING SPIKE ONLY — NOT production code. See CombatantComponents.ts header.
 *
 * Parity gate for the ECS scoping spike: proves the SoA/bitECS nearest-enemy
 * targeting scan produces BIT-IDENTICAL target assignments to the plain-OOP
 * reference over the same deterministically-seeded entity set.
 *
 * Why this matters for the promote/defer decision: a SoA rewrite is only worth
 * considering if it is provably behaviour-preserving. If the two paths diverge
 * on any seed, the ECS port would silently change combat outcomes and the
 * answer is DEFER regardless of any speedup. This test is the correctness half
 * of the spike; scripts/ecs-spike-bench.ts is the speed half.
 *
 * Determinism: seeds come from CombatantSpikeSeed (fixed integer LCG) — no RNG,
 * no clock. Float32 fidelity is matched on both sides (see Vec3F32), so
 * "identical" means element-for-element equal target indices.
 */

import { describe, it, expect } from 'vitest';
import { generateSpikeSeeds } from './CombatantSpikeSeed';
import {
  buildEcsSpikeWorld,
  ecsAssignNearestEnemy,
} from './CombatantEcsWorld';
import {
  buildOopCombatants,
  oopAssignNearestEnemy,
} from './CombatantOopReference';
import { NO_TARGET } from './CombatantComponents';

/**
 * Run both paths over the same seeds and return the two target-assignment
 * arrays in the SAME index space (seed index -> target seed index, or
 * NO_TARGET). The ECS path returns eids; we translate them back to seed indices
 * via the creation-order `entities` array so the comparison is apples-to-apples.
 */
function runBothPaths(count: number, seed: number): {
  ecsByIndex: number[];
  oopByIndex: number[];
} {
  const { seeds, visualRange } = generateSpikeSeeds(count, seed);

  const spike = buildEcsSpikeWorld(seeds, visualRange);
  const eidToIndex = new Map<number, number>();
  for (let i = 0; i < spike.entities.length; i++) {
    eidToIndex.set(spike.entities[i], i);
  }
  const ecsRawByIndex = ecsAssignNearestEnemy(spike); // values are eids
  const ecsByIndex = ecsRawByIndex.map((targetEid) =>
    targetEid === NO_TARGET ? NO_TARGET : eidToIndex.get(targetEid)!,
  );

  const oop = buildOopCombatants(seeds, visualRange);
  const oopByIndex = oopAssignNearestEnemy(oop); // values are indices

  return { ecsByIndex, oopByIndex };
}

describe('ECS spike — nearest-enemy targeting parity (SoA/bitECS vs OOP)', () => {
  // Includes the benchmark sizes (120/500/1000/2000) plus small odd sizes that
  // stress edge branches (tiny populations, single-faction-after-dead, etc.).
  const counts = [1, 2, 7, 33, 120, 500, 1000, 2000];

  for (const count of counts) {
    it(`assigns identical targets for ${count} entities (seed 2718)`, () => {
      const { ecsByIndex, oopByIndex } = runBothPaths(count, 2718);
      expect(ecsByIndex).toEqual(oopByIndex);
    });
  }

  it('is stable across several distinct fixed seeds at N=1000', () => {
    for (const seed of [1, 12345, 99991, 1664525, 2026]) {
      const { ecsByIndex, oopByIndex } = runBothPaths(1000, seed);
      expect(ecsByIndex, `seed ${seed}`).toEqual(oopByIndex);
    }
  });

  it('actually exercises the targeting branches (sanity, not a no-op)', () => {
    // Guard against a false-positive parity where both paths return all
    // NO_TARGET. Assert at least some real targets were assigned, and that the
    // dead entities (every 17th) never selected a target.
    const count = 500;
    const { seeds, visualRange } = generateSpikeSeeds(count, 2718);
    const spike = buildEcsSpikeWorld(seeds, visualRange);
    const eidToIndex = new Map<number, number>();
    for (let i = 0; i < spike.entities.length; i++) eidToIndex.set(spike.entities[i], i);
    const ecsByIndex = ecsAssignNearestEnemy(spike).map((t) =>
      t === NO_TARGET ? NO_TARGET : eidToIndex.get(t)!,
    );

    const assigned = ecsByIndex.filter((t) => t !== NO_TARGET).length;
    expect(assigned).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      if (i % 17 === 0) {
        expect(ecsByIndex[i], `dead entity ${i} must hold no target`).toBe(NO_TARGET);
      }
    }
  });
});
