/**
 * SCOPING SPIKE ONLY — NOT production code. See CombatantComponents.ts header.
 *
 * Plain Array-of-Structs reference implementation of the SAME nearest-enemy
 * targeting scan that CombatantEcsWorld.ecsAssignNearestEnemy performs, shaped
 * like the live production data: an array of objects each holding a
 * `position`/`velocity` vector and scalar fields — the in-memory shape of the
 * `Map<string, Combatant>` values in CombatantSystem.
 *
 * This is the OOP baseline the SoA/ECS path is compared against (parity) and
 * benchmarked against (speed). It deliberately mirrors the production selection
 * loop in AITargetAcquisition.findNearestEnemy: squared-distance compare,
 * strict `<` so the first-seen nearest wins ties.
 *
 * Float32 fidelity: the ECS columns are Float32Array, so reads there are
 * single-precision. To make the parity comparison meaningful (bit-identical,
 * not "close"), this reference stores positions/velocities in Float32Array-
 * backed vectors too. If it used plain JS doubles, the two paths could disagree
 * in the last ULP for some seeds and the parity test would be testing precision
 * drift rather than algorithm equivalence.
 */

import { NO_TARGET, CombatantStateId, isAllyId } from './CombatantComponents';
import type { CombatantSeed } from './CombatantEcsWorld';

/** Float32-precision 3-vector so OOP reads match the ECS Float32 columns. */
export class Vec3F32 {
  private readonly buf = new Float32Array(3);
  constructor(x: number, y: number, z: number) {
    this.buf[0] = x;
    this.buf[1] = y;
    this.buf[2] = z;
  }
  get x(): number { return this.buf[0]; }
  get y(): number { return this.buf[1]; }
  get z(): number { return this.buf[2]; }
}

/** AoS combatant record mirroring the hot fields of the production `Combatant`. */
export interface OopCombatant {
  position: Vec3F32;
  velocity: Vec3F32;
  health: number;
  stateId: number;
  factionId: number;
  targetIndex: number;
  squadId: number;
  visualRange: number;
}

/** Build the AoS array from the same deterministic seeds the ECS world uses. */
export function buildOopCombatants(
  seeds: readonly CombatantSeed[],
  visualRangePerEntity: readonly number[],
): OopCombatant[] {
  const out: OopCombatant[] = new Array(seeds.length);
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    out[i] = {
      position: new Vec3F32(s.x, s.y, s.z),
      velocity: new Vec3F32(s.vx, s.vy, s.vz),
      // Health is also Float32 in the ECS path; round here for symmetry.
      health: Math.fround(s.health),
      stateId: s.stateId,
      factionId: s.factionId,
      targetIndex: NO_TARGET,
      squadId: s.squadId,
      visualRange: visualRangePerEntity[i],
    };
  }
  return out;
}

/**
 * OOP nearest-enemy scan. Returns, per combatant index, the index of the
 * selected target (or NO_TARGET). Because entity order in the ECS world equals
 * array order here, the two result arrays are directly comparable element-wise.
 */
export function oopAssignNearestEnemy(combatants: readonly OopCombatant[]): number[] {
  const n = combatants.length;
  const result = new Array<number>(n).fill(NO_TARGET);

  for (let i = 0; i < n; i++) {
    const self = combatants[i];
    if (self.stateId === CombatantStateId.DEAD) continue;

    const range = self.visualRange;
    const rangeSq = range * range;
    const sx = self.position.x;
    const sy = self.position.y;
    const sz = self.position.z;
    const selfFaction = self.factionId;

    let nearestIndex = NO_TARGET;
    let minDistSq = Infinity;

    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const other = combatants[j];
      if (other.stateId === CombatantStateId.DEAD) continue;
      if (isAllyId(other.factionId, selfFaction)) continue;

      const dx = sx - other.position.x;
      const dy = sy - other.position.y;
      const dz = sz - other.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < rangeSq && distSq < minDistSq) {
        minDistSq = distSq;
        nearestIndex = j;
      }
    }

    result[i] = nearestIndex;
  }

  return result;
}
