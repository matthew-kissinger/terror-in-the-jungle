// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * SCOPING SPIKE ONLY — NOT production code. See CombatantComponents.ts header.
 *
 * Thin wrapper that builds a bitECS world, spawns N combatant entities from a
 * deterministic field source, and exposes the ECS implementation of ONE
 * representative read-heavy hot loop: nearest-enemy targeting.
 *
 * The mirrored loop is the brute-force (no-spatial-grid) branch of
 * `AITargetAcquisition.findNearestEnemy`
 * (src/systems/combat/ai/AITargetAcquisition.ts): for each live combatant,
 * scan every other live combatant, skip allies and the self, keep enemies
 * within visual range, and select the nearest by squared distance. This is the
 * combat hot path the 3,000-NPC vision stresses hardest (O(N^2) distance work),
 * and it is purely read-over-positions so it mirrors exactly.
 *
 * Simplifications vs production (documented so the parity claim is honest):
 * - The player-as-target branch is omitted (it adds one fixed candidate and is
 *   orthogonal to the SoA-vs-AoS question).
 * - Cluster-aware target distribution (clusterManager) is omitted; we always
 *   take the plain nearest. The brute-force nearest path is what we mirror.
 * - State is ALIVE/DEAD only (see CombatantStateId).
 * The OOP reference in CombatantOopReference.ts applies the EXACT same
 * simplifications so the two are bit-for-bit comparable.
 */

import {
  createWorld,
  addEntity,
  addComponent,
  query,
  type World,
} from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  StateId,
  FactionId,
  TargetEid,
  SquadId,
  NO_TARGET,
  CombatantStateId,
  isAllyId,
} from './CombatantComponents';

/**
 * Per-entity seed record. Produced deterministically by the caller (the parity
 * test and the benchmark both feed a fixed integer sequence — never RNG/clock).
 */
export interface CombatantSeed {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  health: number;
  stateId: number;
  factionId: number;
  squadId: number;
}

export interface EcsSpikeWorld {
  world: World;
  /** eids in creation order; also what `query(world, [Position])` returns. */
  entities: number[];
  /** Per-entity visual range (squared compare uses range*range). */
  visualRange: Float32Array;
}

/**
 * Build a fresh bitECS world and materialise `seeds.length` combatant entities.
 * Each entity gets every hot-field component; columns are written directly.
 */
export function buildEcsSpikeWorld(
  seeds: readonly CombatantSeed[],
  visualRangePerEntity: readonly number[],
): EcsSpikeWorld {
  const world = createWorld();
  const entities: number[] = [];
  const visualRange = new Float32Array(seeds.length);

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Velocity);
    addComponent(world, eid, Health);
    addComponent(world, eid, StateId);
    addComponent(world, eid, FactionId);
    addComponent(world, eid, TargetEid);
    addComponent(world, eid, SquadId);

    Position.x[eid] = s.x;
    Position.y[eid] = s.y;
    Position.z[eid] = s.z;
    Velocity.x[eid] = s.vx;
    Velocity.y[eid] = s.vy;
    Velocity.z[eid] = s.vz;
    Health.value[eid] = s.health;
    StateId.value[eid] = s.stateId;
    FactionId.value[eid] = s.factionId;
    TargetEid.value[eid] = NO_TARGET;
    SquadId.value[eid] = s.squadId;

    entities.push(eid);
    visualRange[i] = visualRangePerEntity[i];
  }

  return { world, entities, visualRange };
}

/**
 * ECS implementation of the nearest-enemy targeting scan.
 *
 * Writes the selected target eid into `TargetEid.value[self]` for every live
 * entity (NO_TARGET when none in range), and returns the same assignment as a
 * plain array indexed by the entity's position in `entities` so the parity
 * test can compare against the OOP reference without reading ECS internals.
 *
 * The squared-distance compare and the strict `<` tie-break (first-seen wins)
 * are identical to AITargetAcquisition.findNearestEnemy's final selection loop.
 */
export function ecsAssignNearestEnemy(spike: EcsSpikeWorld): number[] {
  const { world, entities, visualRange } = spike;
  const ents = query(world, [Position, FactionId, StateId, TargetEid]);

  // Map eid -> index into `entities` for range lookup + result placement.
  // Built once; in a real port visualRange would be its own column.
  const indexByEid = new Map<number, number>();
  for (let i = 0; i < entities.length; i++) indexByEid.set(entities[i], i);

  const result = new Array<number>(entities.length).fill(NO_TARGET);

  for (let i = 0; i < ents.length; i++) {
    const self = ents[i];
    if (StateId.value[self] === CombatantStateId.DEAD) continue;

    const selfIndex = indexByEid.get(self)!;
    const range = visualRange[selfIndex];
    const rangeSq = range * range;
    const sx = Position.x[self];
    const sy = Position.y[self];
    const sz = Position.z[self];
    const selfFaction = FactionId.value[self];

    let nearestEid = NO_TARGET;
    let minDistSq = Infinity;

    for (let j = 0; j < ents.length; j++) {
      const other = ents[j];
      if (other === self) continue;
      if (StateId.value[other] === CombatantStateId.DEAD) continue;
      if (isAllyId(FactionId.value[other], selfFaction)) continue;

      const dx = sx - Position.x[other];
      const dy = sy - Position.y[other];
      const dz = sz - Position.z[other];
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < rangeSq && distSq < minDistSq) {
        minDistSq = distSq;
        nearestEid = other;
      }
    }

    TargetEid.value[self] = nearestEid;
    result[selfIndex] = nearestEid;
  }

  return result;
}
