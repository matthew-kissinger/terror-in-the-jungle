// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TrackedVehiclePhysicsConfig } from '../../systems/vehicle/TrackedVehiclePhysics';

/**
 * T-54 main-battle chassis tuning — the NVA / Soviet armor counterpart to the
 * US M48 Patton (see `m48-config.ts`). Both share the `TrackedVehiclePhysics`
 * skid-steer model; only the historical envelope differs.
 *
 * Historical envelope (T-54A):
 *   - Hull length ~ 6.04 m, width ~ 3.27 m, height ~ 2.4 m.
 *   - Combat weight ~ 36 t (36000 kg) — lighter + lower than the M48.
 *   - Road speed ~ 50 km/h ≈ 14 m/s (per-track speed cap, before
 *     off-road slope-stall scaling) — a touch faster than the Patton.
 *   - Max climbable grade ~ 30° historically; the tracked-vehicle ground
 *     pressure lets us push the engine envelope to ~34° (0.6 rad) before
 *     drive force fades to zero, matching the M48 tuning rationale.
 *
 * Only fields that differ from `TrackedVehiclePhysics` defaults are named;
 * the physics class merges over its own defaults so passing `undefined` for
 * an omitted field yields the same simulation.
 */
export const T54_PHYSICS_CONFIG: Partial<TrackedVehiclePhysicsConfig> = {
  mass: 36000,
  trackSeparation: 2.64,
  hullLength: 6.04,
  maxTrackSpeed: 14,
  maxClimbSlope: 0.6,
};

/** Bounding-box dimensions (m) used by the procedural fallback mesh. */
export const T54_HULL_DIMENSIONS = {
  length: 6.04,
  width: 3.27,
  height: 2.4,
} as const;

/**
 * Default per-mode spawn anchors for the NVA T-54. Y is left at 0; the
 * scenario-spawn caller should snap to terrain through the runtime terrain
 * provider (`getHeightAt`) before constructing the Tank, the same pattern
 * `M48TankSpawn` / `M2HBEmplacementSpawn` use.
 *
 * These reuse the OPFOR anchors the M48 spawn table previously fielded NVA
 * Pattons at (NVA Main HQ on Open Frontier, Dong So NVA Trail Base on A
 * Shau): the T-54 is the period-correct enemy armor, so it inherits those
 * positions and the US keeps its own M48 anchors with no overlap.
 */
export const T54_SPAWN_OFFSETS = {
  /** Open Frontier: NVA Main HQ defender inside the authored OPFOR home base. */
  open_frontier: { x: 0, z: 1382, yaw: Math.PI },
  /** A Shau Valley: Dong So NVA Trail Base packed-earth yard. */
  a_shau_valley: { x: 7842.15, z: -4430.45, yaw: Math.PI * 0.9 },
} as const;
