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

export interface AircraftConfig {
  physics: AircraftPhysicsConfig;
  seats: number;
  role: AircraftRole;
}

// --- Base configs ---

const HUEY_PHYSICS: AircraftPhysicsConfig = {
  mass: 2200,
  maxLiftForce: 36000,
  maxCyclicForce: 8000,
  maxYawRate: 1.8,
  maxHorizontalSpeed: 55,
  velocityDamping: 0.95,
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
  },

  // UH-1C Gunship: heavier armed variant. Sluggish but tough.
  UH1C_GUNSHIP: {
    physics: {
      ...HUEY_PHYSICS,
      mass: 2400,
      maxLiftForce: 38000,
      maxCyclicForce: 7000,
      maxYawRate: 1.6,
      maxHorizontalSpeed: 50,
      velocityDamping: 0.93,
      engineSpoolRate: 1.6,
    },
    seats: 2,
    role: 'gunship',
  },

  // AH-1 Cobra: light attack heli. Fast, agile, twitchy.
  AH1_COBRA: {
    physics: {
      mass: 1400,
      maxLiftForce: 28000,
      maxCyclicForce: 10000,
      maxYawRate: 2.4,
      maxHorizontalSpeed: 70,
      velocityDamping: 0.92,
      angularDamping: 0.80,
      autoLevelStrength: 2.5,
      groundEffectHeight: 6.0,
      groundEffectStrength: 0.20,
      engineSpoolRate: 2.5,
      inputSmoothRate: 10.0,
    },
    seats: 1,
    role: 'attack',
  },
};

export function getAircraftConfig(aircraftKey: string): AircraftConfig {
  return AIRCRAFT_CONFIGS[aircraftKey] ?? AIRCRAFT_CONFIGS.UH1_HUEY;
}
