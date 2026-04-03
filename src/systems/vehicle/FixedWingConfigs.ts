/**
 * Per-aircraft configuration for fixed-wing flight physics.
 */

export interface FixedWingPhysicsConfig {
  mass: number; // kg
  wingArea: number; // m^2
  liftCoefficient: number; // dimensionless
  dragCoefficient: number; // dimensionless
  maxThrust: number; // N
  stallSpeed: number; // m/s
  maxSpeed: number; // m/s
  rollRate: number; // rad/s
  pitchRate: number; // rad/s
  yawRate: number; // rad/s (rudder authority)
  inputSmoothRate: number;
}

interface FixedWingConfig {
  physics: FixedWingPhysicsConfig;
  role: 'transport' | 'fighter' | 'attack';
}

export interface FixedWingDisplayInfo {
  displayName: string;
  hasPropellers: boolean;
  propellerNodes: string[];
  autoLevelDefault: boolean;
  cameraDistance: number;
  cameraHeight: number;
  fovWidenEnabled: boolean;
  seats: number;
}

export const FIXED_WING_DISPLAY: Record<string, FixedWingDisplayInfo> = {
  A1_SKYRAIDER: { displayName: 'A-1 Skyraider', hasPropellers: true, propellerNodes: ['propeller'], autoLevelDefault: true, cameraDistance: 30, cameraHeight: 8, fovWidenEnabled: false, seats: 1 },
  AC47_SPOOKY: { displayName: 'AC-47 Spooky', hasPropellers: true, propellerNodes: ['propLeft', 'propRight'], autoLevelDefault: true, cameraDistance: 40, cameraHeight: 12, fovWidenEnabled: false, seats: 2 },
  F4_PHANTOM: { displayName: 'F-4 Phantom', hasPropellers: false, propellerNodes: [], autoLevelDefault: false, cameraDistance: 35, cameraHeight: 8, fovWidenEnabled: true, seats: 1 },
};

export function getFixedWingConfig(key: string): FixedWingConfig | null {
  return FIXED_WING_CONFIGS[key] ?? null;
}

export function getFixedWingDisplayInfo(key: string): FixedWingDisplayInfo | null {
  return FIXED_WING_DISPLAY[key] ?? null;
}

export const FIXED_WING_CONFIGS: Record<string, FixedWingConfig> = {
  // AC-47 Spooky: slow transport/gunship, high lift, low roll rate
  // Cl tuned so lift = weight at stall speed (game-balanced, not real-world)
  AC47_SPOOKY: {
    physics: {
      mass: 12000,
      wingArea: 91.7,
      liftCoefficient: 1.72,
      dragCoefficient: 0.04,
      maxThrust: 24000,
      stallSpeed: 35,
      maxSpeed: 80,
      rollRate: 0.8,
      pitchRate: 0.6,
      yawRate: 0.4,
      inputSmoothRate: 5.0,
    },
    role: 'transport',
  },

  // F-4 Phantom: fast jet, high roll rate
  // Cl tuned so lift = weight at stall speed (game-balanced, not real-world)
  F4_PHANTOM: {
    physics: {
      mass: 18000,
      wingArea: 49.2,
      liftCoefficient: 1.63,
      dragCoefficient: 0.025,
      maxThrust: 100000,
      stallSpeed: 60,
      maxSpeed: 200,
      rollRate: 3.0,
      pitchRate: 1.5,
      yawRate: 0.8,
      inputSmoothRate: 10.0,
    },
    role: 'fighter',
  },

  // A-1 Skyraider: attack prop, moderate all
  // Cl tuned so lift = weight at stall speed (game-balanced, not real-world)
  A1_SKYRAIDER: {
    physics: {
      mass: 8200,
      wingArea: 37.2,
      liftCoefficient: 2.21,
      dragCoefficient: 0.035,
      maxThrust: 18000,
      stallSpeed: 40,
      maxSpeed: 120,
      rollRate: 1.5,
      pitchRate: 1.0,
      yawRate: 0.6,
      inputSmoothRate: 7.0,
    },
    role: 'attack',
  },
};
