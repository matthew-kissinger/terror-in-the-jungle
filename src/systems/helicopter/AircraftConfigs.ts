// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Per-aircraft configuration data.
 * Physics values determine how each helicopter type handles.
 * Role/seats are metadata for future weapon and transport systems.
 */

export interface AircraftPhysicsConfig {
  mass: number;              // kg
  maxLiftForce: number;      // N
  maxCyclicForce: number;    // N (horizontal agility)
  maxYawRate: number;        // rad/s
  maxHorizontalSpeed: number; // m/s cap (chunk churn limit)
  velocityDamping: number;   // 0-1 per-frame multiplier
  angularDamping: number;    // 0-1 per-frame multiplier
  autoLevelStrength: number;
  groundEffectHeight: number; // meters
  groundEffectStrength: number;
  engineSpoolRate: number;
  inputSmoothRate: number;
}

export type AircraftRole = 'transport' | 'attack' | 'gunship';

export interface AircraftWeaponMount {
  name: string;
  type: 'nose_turret' | 'side_mount' | 'rocket_pod';
  firingMode: 'pilot' | 'crew';
  ammoCapacity: number;
  /**
   * Mount offset in the weapon-system frame (+Z forward, +X right, +Y up),
   * applied with the airframe quaternion, so the tracer/muzzle origin sits on
   * the airframe rather than floating inside the hull. Source dims (model axes
   * [w, h, length], `warAssetCatalog`):
   *
   *  - UH-1C gunship door gun: the UH-1C now ships Kiln art, corrected to true
   *    scale (~13.85 m long) at the importer. The cabin half-width is comparable
   *    to the legacy hull, so the door-gun lateral (~1.8 m) still reads at the
   *    cabin door rather than the (wide) rotor-span bbox edge.
   *  - AH-1 Cobra is repointed to the Kiln art (kiln-war-2026-06) and its
   *    minigun/rocket mounts are re-banded to the Kiln dims [2.84, 2.95, 13.45]
   *    (narrower + slightly shorter than the legacy [3.74, 3.82, 14.34]). The
   *    `?aircraftArt=legacy` escape hatch reuses these Kiln-tuned mounts as a
   *    best-effort approximation on the legacy GLB (the two hulls are close
   *    enough that the muzzle still reads on-airframe).
   */
  localPosition: [number, number, number];
  fireRate: number;          // rounds per second
  damage: number;            // per-hit (hitscan) or max (explosive)
  damageRadius?: number;     // explosion radius (rockets)
  projectileSpeed?: number;  // m/s; 0 or undefined = hitscan
  spreadDeg?: number;        // cone spread degrees
  tracerInterval?: number;   // emit tracer every N rounds
}

interface AircraftConfig {
  physics: AircraftPhysicsConfig;
  seats: number;
  role: AircraftRole;
  weapons: AircraftWeaponMount[];
}

// --- Base configs ---

const HUEY_PHYSICS: AircraftPhysicsConfig = {
  mass: 2200,
  maxLiftForce: 36000,
  maxCyclicForce: 10000,
  maxYawRate: 1.8,
  maxHorizontalSpeed: 60,
  velocityDamping: 0.96,
  angularDamping: 0.85,
  autoLevelStrength: 3.0,
  groundEffectHeight: 8.0,
  groundEffectStrength: 0.25,
  engineSpoolRate: 1.8,
  inputSmoothRate: 8.0,
};

export const AIRCRAFT_CONFIGS: Record<string, AircraftConfig> = {
  // UH-1 Huey: workhorse transport. Stable, forgiving, seats 4.
  UH1_HUEY: {
    physics: HUEY_PHYSICS,
    seats: 4,
    role: 'transport',
    weapons: [],
  },

  // UH-1C Gunship: heavier armed variant. Sluggish but tough.
  UH1C_GUNSHIP: {
    physics: {
      ...HUEY_PHYSICS,
      mass: 2400,
      maxLiftForce: 38000,
      maxCyclicForce: 8500,
      maxYawRate: 1.6,
      maxHorizontalSpeed: 55,
      velocityDamping: 0.94,
      engineSpoolRate: 1.6,
    },
    seats: 2,
    role: 'gunship',
    weapons: [
      // M60 on the left cabin side. Lateral pushed to the new ~3.7m-wide
      // cabin edge (half-width ~1.85m) so the gunner/muzzle sits at the door,
      // not inside the hull; slightly aft of the cabin midpoint.
      { name: 'M60 Door Gun', type: 'side_mount', firingMode: 'crew', ammoCapacity: 500, localPosition: [-1.8, 0.3, -0.6], fireRate: 9, damage: 20, spreadDeg: 3 },
    ],
  },

  // AH-1 Cobra: light attack heli. Fast, agile, twitchy.
  AH1_COBRA: {
    physics: {
      mass: 1400,
      maxLiftForce: 28000,
      maxCyclicForce: 12500,
      maxYawRate: 2.4,
      maxHorizontalSpeed: 75,
      velocityDamping: 0.93,
      angularDamping: 0.80,
      autoLevelStrength: 2.5,
      groundEffectHeight: 6.0,
      groundEffectStrength: 0.20,
      engineSpoolRate: 2.5,
      inputSmoothRate: 10.0,
    },
    seats: 1,
    role: 'attack',
    weapons: [
      // Chin-turret minigun under the nose. Forward offset reaches the Kiln
      // ~13.45m fuselage's nose (Joint_Turret region); dropped slightly so the
      // muzzle reads under the gunner station.
      { name: 'M134 Minigun', type: 'nose_turret', firingMode: 'pilot', ammoCapacity: 4000, localPosition: [0, -0.45, 3.1], fireRate: 50, damage: 15, spreadDeg: 2.5, tracerInterval: 3 },
      // Stub-wing rocket pods. fireProjectile() alternates the ±side offset, so
      // localPosition carries the height/forward seat; pods sit just ahead of
      // CG on the stub wings of the ~2.84m-wide Kiln airframe (half-width ~1.42).
      { name: 'Rocket Pod', type: 'rocket_pod', firingMode: 'pilot', ammoCapacity: 14, localPosition: [-1.05, -0.25, 1.1], fireRate: 3.3, damage: 150, damageRadius: 8, projectileSpeed: 150 },
    ],
  },
};

export function getAircraftConfig(aircraftKey: string): AircraftConfig {
  return AIRCRAFT_CONFIGS[aircraftKey] ?? AIRCRAFT_CONFIGS.UH1_HUEY;
}
