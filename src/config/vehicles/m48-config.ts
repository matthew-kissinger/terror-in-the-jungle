import type { TrackedVehiclePhysicsConfig } from '../../systems/vehicle/TrackedVehiclePhysics';

/**
 * M48 Patton chassis tuning — sourced from docs/rearch/TANK_SYSTEMS_2026-05-13.md
 * §"Locomotion: skid-steer" and the cycle brief §"m48-tank-integration (R2)".
 *
 * Historical envelope:
 *   - Hull length ~ 6.4 m, width ~ 3.6 m, height ~ 3.1 m.
 *   - Combat weight ~ 46 t (46000 kg).
 *   - Road speed ~ 45 km/h ≈ 12.5 m/s (per-track speed cap, before
 *     off-road slope-stall scaling).
 *   - Max climbable grade ~ 60% ≈ 31°, but tracked-vehicle ground
 *     pressure lets us push the engine envelope to ~35° before drive
 *     force fades to zero per the TANK_SYSTEMS memo.
 *
 * Only fields that differ from `TrackedVehiclePhysics` defaults are
 * named; the physics class merges over its own defaults so passing
 * `undefined` for an omitted field yields the same simulation.
 *
 * The 0.61 rad climb slope matches the `TrackedVehiclePhysics` default;
 * we restate it here so the config block stands as documentation for
 * the M48-specific tuning the cycle brief calls out.
 */
export const M48_PHYSICS_CONFIG: Partial<TrackedVehiclePhysicsConfig> = {
  mass: 46000,
  trackSeparation: 2.92,
  hullLength: 6.4,
  maxTrackSpeed: 12,
  maxClimbSlope: 0.61,
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
