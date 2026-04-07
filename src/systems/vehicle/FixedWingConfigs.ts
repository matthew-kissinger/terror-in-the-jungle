/**
 * Per-aircraft configuration for the fixed-wing flight controller.
 *
 * The flight model is intentionally sim-lite: aircraft-specific values describe
 * the performance envelope, control authority, and ground handling rather than
 * a few overloaded lift/turn-rate constants.
 */

export interface FixedWingPhysicsConfig {
  mass: number; // kg
  wingArea: number; // m^2
  maxThrust: number; // N
  stallSpeed: number; // m/s
  vrSpeed: number; // m/s
  v2Speed: number; // m/s
  maxSpeed: number; // m/s
  throttleResponse: number; // 1/sec
  controlResponse: number; // 1/sec
  cl0: number;
  clAlpha: number; // 1/rad
  clMax: number;
  alphaStallDeg: number;
  alphaMaxDeg: number;
  trimAlphaDeg: number;
  cd0: number;
  inducedDragK: number;
  sideForceCoefficient: number;
  elevatorPower: number;
  aileronPower: number;
  rudderPower: number;
  pitchStability: number;
  rollLevelStrength: number;
  yawStability: number;
  pitchDamping: number;
  rollDamping: number;
  yawDamping: number;
  stabilityAssistPitch: number;
  stabilityAssistRoll: number;
  stabilityAssistYaw: number;
  maxPitchRate: number; // rad/s
  maxRollRate: number; // rad/s
  maxYawRate: number; // rad/s
  groundSteering: number; // rad/s
  groundLateralFriction: number;
  rollingResistance: number;
  brakeDeceleration: number; // m/s^2
  gearClearance: number; // m
  liftoffClearance: number; // m
  rotationPitchLimitDeg: number;
  groundEffectStrength: number;
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
  A1_SKYRAIDER: {
    displayName: 'A-1 Skyraider',
    hasPropellers: true,
    propellerNodes: ['propeller'],
    autoLevelDefault: true,
    cameraDistance: 30,
    cameraHeight: 8,
    fovWidenEnabled: false,
    seats: 1,
  },
  AC47_SPOOKY: {
    displayName: 'AC-47 Spooky',
    hasPropellers: true,
    propellerNodes: ['propLeft', 'propRight'],
    autoLevelDefault: true,
    cameraDistance: 40,
    cameraHeight: 12,
    fovWidenEnabled: false,
    seats: 2,
  },
  F4_PHANTOM: {
    displayName: 'F-4 Phantom',
    hasPropellers: false,
    propellerNodes: [],
    autoLevelDefault: false,
    cameraDistance: 35,
    cameraHeight: 8,
    fovWidenEnabled: true,
    seats: 1,
  },
};

export function getFixedWingConfig(key: string): FixedWingConfig | null {
  return FIXED_WING_CONFIGS[key] ?? null;
}

export function getFixedWingDisplayInfo(key: string): FixedWingDisplayInfo | null {
  return FIXED_WING_DISPLAY[key] ?? null;
}

export const FIXED_WING_CONFIGS: Record<string, FixedWingConfig> = {
  AC47_SPOOKY: {
    physics: {
      mass: 12000,
      wingArea: 91.7,
      maxThrust: 48000,
      stallSpeed: 35,
      vrSpeed: 40,
      v2Speed: 46,
      maxSpeed: 80,
      throttleResponse: 1.2,
      controlResponse: 3.2,
      cl0: 0.34,
      clAlpha: 4.7,
      clMax: 1.85,
      alphaStallDeg: 14,
      alphaMaxDeg: 24,
      trimAlphaDeg: 4.5,
      cd0: 0.042,
      inducedDragK: 0.065,
      sideForceCoefficient: 1.35,
      elevatorPower: 1.6,
      aileronPower: 1.5,
      rudderPower: 1.0,
      pitchStability: 2.6,
      rollLevelStrength: 1.0,
      yawStability: 2.1,
      pitchDamping: 1.8,
      rollDamping: 2.6,
      yawDamping: 1.7,
      stabilityAssistPitch: 1.4,
      stabilityAssistRoll: 2.6,
      stabilityAssistYaw: 1.8,
      maxPitchRate: 0.9,
      maxRollRate: 0.9,
      maxYawRate: 0.55,
      groundSteering: 0.5,
      groundLateralFriction: 8.0,
      rollingResistance: 0.017,
      brakeDeceleration: 12,
      gearClearance: 0.5,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 11,
      groundEffectStrength: 0.22,
    },
    role: 'transport',
  },

  F4_PHANTOM: {
    physics: {
      mass: 18000,
      wingArea: 49.2,
      maxThrust: 155000,
      stallSpeed: 60,
      vrSpeed: 68,
      v2Speed: 82,
      maxSpeed: 200,
      throttleResponse: 2.4,
      controlResponse: 5.8,
      cl0: 0.12,
      clAlpha: 3.8,
      clMax: 1.35,
      alphaStallDeg: 16,
      alphaMaxDeg: 28,
      trimAlphaDeg: 3.5,
      cd0: 0.024,
      inducedDragK: 0.052,
      sideForceCoefficient: 1.15,
      elevatorPower: 2.8,
      aileronPower: 4.8,
      rudderPower: 1.4,
      pitchStability: 1.9,
      rollLevelStrength: 0.7,
      yawStability: 1.7,
      pitchDamping: 1.5,
      rollDamping: 2.9,
      yawDamping: 1.5,
      stabilityAssistPitch: 1.0,
      stabilityAssistRoll: 1.9,
      stabilityAssistYaw: 1.4,
      maxPitchRate: 1.5,
      maxRollRate: 2.8,
      maxYawRate: 0.95,
      groundSteering: 0.42,
      groundLateralFriction: 8.8,
      rollingResistance: 0.015,
      brakeDeceleration: 18,
      gearClearance: 0.5,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 10,
      groundEffectStrength: 0.14,
    },
    role: 'fighter',
  },

  A1_SKYRAIDER: {
    physics: {
      mass: 8200,
      wingArea: 37.2,
      maxThrust: 40000,
      stallSpeed: 40,
      vrSpeed: 44,
      v2Speed: 52,
      maxSpeed: 120,
      throttleResponse: 1.6,
      controlResponse: 4.4,
      cl0: 0.28,
      clAlpha: 4.4,
      clMax: 1.6,
      alphaStallDeg: 15,
      alphaMaxDeg: 26,
      trimAlphaDeg: 4.0,
      cd0: 0.032,
      inducedDragK: 0.06,
      sideForceCoefficient: 1.2,
      elevatorPower: 2.3,
      aileronPower: 3.2,
      rudderPower: 1.0,
      pitchStability: 2.2,
      rollLevelStrength: 0.9,
      yawStability: 1.9,
      pitchDamping: 1.5,
      rollDamping: 2.5,
      yawDamping: 1.3,
      stabilityAssistPitch: 1.2,
      stabilityAssistRoll: 2.3,
      stabilityAssistYaw: 1.5,
      maxPitchRate: 1.15,
      maxRollRate: 1.7,
      maxYawRate: 0.8,
      groundSteering: 0.6,
      groundLateralFriction: 7.4,
      rollingResistance: 0.014,
      brakeDeceleration: 14,
      gearClearance: 0.5,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 12,
      groundEffectStrength: 0.2,
    },
    role: 'attack',
  },
};
