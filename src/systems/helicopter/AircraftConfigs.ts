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
  localPosition: [number, number, number];
  fireRate: number;          // rounds per second
  damage: number;            // per-hit (hitscan) or max (explosive)
  damageRadius?: number;     // explosion radius (rockets)
  projectileSpeed?: number;  // m/s; 0 or undefined = hitscan
  spreadDeg?: number;        // cone spread degrees
  tracerInterval?: number;   // emit tracer every N rounds
}

export interface AircraftConfig {
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
      { name: 'M60 Door Gun', type: 'side_mount', firingMode: 'crew', ammoCapacity: 500, localPosition: [-1.5, 0.3, -0.5], fireRate: 9, damage: 20, spreadDeg: 3 },
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
      { name: 'M134 Minigun', type: 'nose_turret', firingMode: 'pilot', ammoCapacity: 4000, localPosition: [0, -0.3, 2.5], fireRate: 50, damage: 15, spreadDeg: 2.5, tracerInterval: 3 },
      { name: 'Rocket Pod', type: 'rocket_pod', firingMode: 'pilot', ammoCapacity: 14, localPosition: [-1.2, -0.2, 1.0], fireRate: 3.3, damage: 150, damageRadius: 8, projectileSpeed: 150 },
    ],
  },
};

export function getAircraftConfig(aircraftKey: string): AircraftConfig {
  return AIRCRAFT_CONFIGS[aircraftKey] ?? AIRCRAFT_CONFIGS.UH1_HUEY;
}
