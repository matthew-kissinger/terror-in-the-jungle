// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * SCOPING SPIKE ONLY — NOT production code.
 *
 * Structure-of-Arrays component definitions for the long-deferred ECS question
 * (see docs/REARCHITECTURE.md Phase E + the E1 memo that recommends DEFER).
 *
 * Production combatants live in a plain `Map<string, Combatant>` at
 * src/systems/combat/CombatantSystem.ts. This file is a self-contained mirror
 * of the *hot fields* of `Combatant` (see src/systems/combat/types.ts) laid out
 * as typed-array columns, the layout bitECS expects for cache-friendly
 * iteration.
 *
 * IMPORTANT: nothing under src/ecs/ may be imported by production modules
 * (src/main.ts, src/core/bootstrap.ts, any src/systems/** runtime path). It is
 * imported ONLY by src/ecs/EcsParity.test.ts and scripts/ecs-spike-bench.ts.
 *
 * bitECS v0.4 functional API: a "component" is just a plain object whose values
 * are parallel arrays indexed by entity id (eid). `addComponent(world, eid, C)`
 * tags the entity; we write the columns directly (`Position.x[eid] = ...`).
 * `query(world, [C])` then returns the eids that carry C, in creation order.
 */

/** Max entities the spike pre-allocates columns for. Benchmark tops out at 2000. */
export const ECS_SPIKE_MAX_ENTITIES = 4096;

function f32(): Float32Array {
  return new Float32Array(ECS_SPIKE_MAX_ENTITIES);
}

function i32(): Int32Array {
  return new Int32Array(ECS_SPIKE_MAX_ENTITIES);
}

/**
 * Position column set. Mirrors `Combatant.position` (THREE.Vector3) as three
 * Float32 columns. Float32 (not Float64) is the deliberate ECS choice — it is
 * what bitECS SoA stores and what a GPU upload path would use — so the parity
 * harness must round its OOP reference through Float32 too (see EcsParity.test).
 */
export const Position = {
  x: f32(),
  y: f32(),
  z: f32(),
};

/** Velocity column set. Mirrors `Combatant.velocity` (THREE.Vector3). */
export const Velocity = {
  x: f32(),
  y: f32(),
  z: f32(),
};

/** Scalar health. Mirrors `Combatant.health`. */
export const Health = {
  value: f32(),
};

/**
 * Discrete combatant fields packed as integers:
 * - `stateId`   — CombatantState enum ordinal (see CombatantStateId).
 * - `factionId` — Faction enum ordinal (see CombatantFactionId).
 * - `targetEid` — entity id of the current target, or NO_TARGET.
 * - `squadId`   — integer squad handle (0 = unsquadded).
 *
 * Faction is split out (rather than folded into stateId) because the targeting
 * hot loop filters on faction/alliance every iteration; keeping it its own
 * column matches how a real ECS port would shape the data.
 */
export const StateId = { value: i32() };
export const FactionId = { value: i32() };
export const TargetEid = { value: i32() };
export const SquadId = { value: i32() };

/** Sentinel for "no current target" stored in TargetEid.value. */
export const NO_TARGET = -1;

/**
 * Faction ordinals. Order matches src/systems/combat/types.ts `enum Faction`
 * (US, ARVN, NVA, VC). Only the BLUFOR/OPFOR split matters for the targeting
 * scan, but we keep all four so the mapping is faithful.
 */
export const CombatantFactionId = {
  US: 0,
  ARVN: 1,
  NVA: 2,
  VC: 3,
} as const;

/** BLUFOR = {US, ARVN}; OPFOR = {NVA, VC}. Mirrors FACTION_ALLIANCE. */
export function isBluforId(factionId: number): boolean {
  return factionId === CombatantFactionId.US || factionId === CombatantFactionId.ARVN;
}

/** True when two faction ordinals are on the same alliance. Mirrors `isAlly`. */
export function isAllyId(a: number, b: number): boolean {
  return isBluforId(a) === isBluforId(b);
}

/**
 * State ordinals for the subset the hot loop cares about. The targeting scan
 * only needs to recognise DEAD (skipped as a target); other states are folded
 * into ALIVE for the spike. Production has 13 states (types.ts) — we are not
 * reproducing all of them, only the distinction the mirrored loop reads.
 */
export const CombatantStateId = {
  ALIVE: 0,
  DEAD: 1,
} as const;
