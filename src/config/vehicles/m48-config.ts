// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TrackedVehiclePhysicsConfig } from '../../systems/vehicle/TrackedVehiclePhysics';

/**
 * M48 Patton chassis tuning — sourced from docs/rearch/TANK_SYSTEMS_2026-05-13.md
 * §"Locomotion: skid-steer" and the cycle brief §"m48-tank-integration (R2)".
 *
 * Historical envelope:
 *   - Hull length ~ 6.4 m, width ~ 3.6 m, height ~ 3.1 m.
 *   - Combat weight ~ 46 t (46000 kg).
 *   - Road speed ~ 45 km/h ≈ 12.5 m/s (per-track speed cap, before
 *     off-road slope-stall scaling). We run the cap slightly low (11 m/s)
 *     so the chassis reads "slower but stronger" off-road.
 *   - Max climbable grade ~ 60% ≈ 31° historically, but tracked-vehicle
 *     ground pressure lets us push the engine envelope to ~0.96 rad
 *     (~55°) before drive force fades to zero. Sanity ceiling: stays below
 *     the near-vertical cliff walls the slope-stall path rejects, so the
 *     tank still cannot drive cliffs.
 *
 * IMPORTANT: `maxClimbSlope` is a true surface ANGLE in radians. The runtime
 * `ITerrainRuntime.getSlopeAt` returns a 0..1 deficit (`1 - normal.y`), and
 * `TrackedVehiclePhysics.integrateLocomotion` converts that deficit to an
 * angle (`acos(1 - deficit)`) before comparing against this ceiling.
 *
 * Climb-authority tuning (2026-06-28 owner playtest — tanks bogged down and
 * slid on jungle hills they should crest; 2026-07-02 retune raised the ceiling
 * to ~55° once the deficit→angle conversion made the old radian-vs-deficit
 * comparison honest). Restated here so the config block documents the
 * per-vehicle tuning and stays in lockstep with the T-54 (see `t54-config.ts`):
 *   - `maxClimbSlope` set so steep grades stay drivable but real cliffs reject.
 *   - `slopeDriveFloor` raised so the tank keeps usable uphill power
 *     instead of fading to a crawl before the ceiling.
 *   - `slopeGravityScale` lowered so a stalled chassis slides back less.
 *
 * Only fields that differ in intent from `TrackedVehiclePhysics` defaults
 * are named; the physics class merges over its own defaults so passing
 * `undefined` for an omitted field yields the same simulation.
 */
export const M48_PHYSICS_CONFIG: Partial<TrackedVehiclePhysicsConfig> = {
  mass: 46000,
  trackSeparation: 2.92,
  hullLength: 6.4,
  maxTrackSpeed: 11,
  maxClimbSlope: 0.96, // rad (~55 deg) — true surface angle, see header note
  slopeDriveFloor: 0.62,
  slopeGravityScale: 0.2,
};

/** Bounding-box dimensions (m) used by the procedural fallback mesh. */
export const M48_HULL_DIMENSIONS = {
  length: 6.4,
  width: 3.6,
  height: 3.1,
} as const;

/**
 * Default per-mode spawn anchors for the M48. Y is left at 0; the
 * scenario-spawn caller should snap to terrain through the runtime
 * terrain provider (`getHeightAt`) before constructing the Tank, the
 * same pattern `M2HBEmplacementSpawn` uses.
 */
export const M48_SPAWN_OFFSETS = {
  /**
   * Open Frontier: airfield Main Motor Pool bay — anchor `(155, 0, -1195)`
   * (`OpenFrontierConfig.ts` `airfield_motor_pool`) plus the M48 bay
   * slot `(28, 0, 22)` from the reflowed `motor_pool_heavy` prefab.
   * The dressing M48 prop is removed from the prefab in the sibling
   * `motor-pool-heavy-reflow` task, leaving this real Tank IVehicle as
   * the only M48 visible in OF.
   */
  open_frontier: { x: 183, z: -1173, yaw: Math.PI * 0.55 },
  /** A Shau Valley: valley-road anchor near the south road bend. */
  a_shau_valley: { x: 40, z: 60, yaw: Math.PI * 0.25 },
} as const;
