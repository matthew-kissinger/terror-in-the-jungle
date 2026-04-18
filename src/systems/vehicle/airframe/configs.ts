/**
 * Per-aircraft airframe configs (B1 rebuild).
 *
 * One config per aircraft, grouped by concern. To retune a Skyraider you edit
 * one file. No parallel PILOT_TUNING table, no split between "physics" and
 * "operation" values that matter to the sim.
 *
 * Display metadata (camera distance, propeller node names, seats) stays in
 * FixedWingConfigs.ts — those are visual/gameplay concerns outside the sim.
 */

import type { AirframeConfig } from './types';

export const SKYRAIDER_AIRFRAME: AirframeConfig = {
  id: 'A1_SKYRAIDER',
  mass: { kg: 8200, wingAreaM2: 37.2 },
  // Throttle ramp bumped from 1.6 → 4.0/s so a Skyraider at full throttle
  // reaches its V1/Vr window in ~5s. Arcade-feel target from the E6 memo:
  // takeoff should feel like a game, not a certified procedure.
  engine: { maxThrustN: 95000, throttleResponsePerSec: 4.0, staticThrustFloor: 0.4 },
  aero: {
    stallSpeedMs: 34,
    vrSpeedMs: 38,
    v2SpeedMs: 46,
    maxSpeedMs: 120,
    // Arcade-lift wing: cl0 sized so level flight at cruise ≈ 1g with
    // wings level. Level cl = weight / (q * wingArea) ≈ 1.41 at 50 m/s;
    // cl0 matches to put the plane in passive trim at cruise.
    cl0: 1.42,
    clAlpha: 5.5,
    clMax: 2.6,
    alphaStallDeg: 16,
    alphaMaxDeg: 26,
    cd0: 0.032,
    // High induced drag so cruise thrust ≈ drag at 50 m/s mid-throttle.
    inducedDragK: 0.33,
    sideForceCoefficient: 1.2,
    trimAlphaDeg: 4.0,
    groundEffectStrength: 0.35,
  },
  authority: {
    elevator: 2.3,
    aileron: 3.2,
    rudder: 1.0,
    maxPitchRate: 1.15,
    maxRollRate: 1.7,
    maxYawRate: 0.8,
    controlResponsePerSec: 4.4,
  },
  stability: {
    pitch: 2.2,
    rollLevel: 0.9,
    yaw: 1.9,
    pitchDamp: 1.5,
    rollDamp: 2.5,
    yawDamp: 1.3,
  },
  ground: {
    gearClearanceM: 0.5,
    liftoffClearanceM: 0.2,
    steeringRadPerSec: 0.6,
    lateralFriction: 7.4,
    rollingResistance: 0.014,
    brakeDecelMs2: 14,
    maxGroundPitchDeg: 6,
    rotationPitchLimitDeg: 12,
  },
  feel: {
    rawPitchScale: 0.85,
    rawRollScale: 0.75,
    rawYawScale: 0.45,
    assistPitchP: 0.07,
    assistPitchD: 0.004,
    assistRollP: 0.04,
    assistRollD: 0.008,
    assistMaxBankDeg: 45,
    assistMaxPitchDeg: 25,
    coordYawScale: 0.15,
    autoLevelStrength: 0.8,
  },
};

export const PHANTOM_AIRFRAME: AirframeConfig = {
  id: 'F4_PHANTOM',
  mass: { kg: 18000, wingAreaM2: 49.2 },
  engine: { maxThrustN: 155000, throttleResponsePerSec: 2.4, staticThrustFloor: 0.3 },
  aero: {
    stallSpeedMs: 60,
    vrSpeedMs: 68,
    v2SpeedMs: 82,
    maxSpeedMs: 200,
    cl0: 0.12,
    clAlpha: 3.8,
    clMax: 1.35,
    alphaStallDeg: 16,
    alphaMaxDeg: 28,
    cd0: 0.024,
    inducedDragK: 0.052,
    sideForceCoefficient: 1.15,
    trimAlphaDeg: 3.5,
    groundEffectStrength: 0.14,
  },
  authority: {
    elevator: 2.8,
    aileron: 4.8,
    rudder: 1.4,
    maxPitchRate: 1.5,
    maxRollRate: 2.8,
    maxYawRate: 0.95,
    controlResponsePerSec: 5.8,
  },
  stability: {
    pitch: 1.9,
    rollLevel: 0.7,
    yaw: 1.7,
    pitchDamp: 1.5,
    rollDamp: 2.9,
    yawDamp: 1.5,
  },
  ground: {
    gearClearanceM: 0.5,
    liftoffClearanceM: 0.2,
    steeringRadPerSec: 0.42,
    lateralFriction: 8.8,
    rollingResistance: 0.015,
    brakeDecelMs2: 18,
    maxGroundPitchDeg: 5,
    rotationPitchLimitDeg: 10,
  },
  feel: {
    rawPitchScale: 0.9,
    rawRollScale: 0.85,
    rawYawScale: 0.45,
    assistPitchP: 0.08,
    assistPitchD: 0.005,
    assistRollP: 0.06,
    assistRollD: 0.009,
    assistMaxBankDeg: 60,
    assistMaxPitchDeg: 25,
    coordYawScale: 0.15,
    autoLevelStrength: 0.7,
  },
};

export const SPOOKY_AIRFRAME: AirframeConfig = {
  id: 'AC47_SPOOKY',
  mass: { kg: 12000, wingAreaM2: 91.7 },
  engine: { maxThrustN: 58000, throttleResponsePerSec: 1.2, staticThrustFloor: 0.3 },
  aero: {
    stallSpeedMs: 32,
    vrSpeedMs: 36,
    v2SpeedMs: 42,
    maxSpeedMs: 80,
    cl0: 0.34,
    clAlpha: 4.7,
    clMax: 1.85,
    alphaStallDeg: 14,
    alphaMaxDeg: 24,
    cd0: 0.042,
    inducedDragK: 0.065,
    sideForceCoefficient: 1.35,
    trimAlphaDeg: 4.5,
    groundEffectStrength: 0.22,
  },
  authority: {
    elevator: 1.6,
    aileron: 1.5,
    rudder: 1.0,
    maxPitchRate: 0.9,
    maxRollRate: 0.9,
    maxYawRate: 0.55,
    controlResponsePerSec: 3.2,
  },
  stability: {
    pitch: 2.6,
    rollLevel: 1.0,
    yaw: 2.1,
    pitchDamp: 1.8,
    rollDamp: 2.6,
    yawDamp: 1.7,
  },
  ground: {
    gearClearanceM: 0.5,
    liftoffClearanceM: 0.2,
    steeringRadPerSec: 0.5,
    lateralFriction: 8.0,
    rollingResistance: 0.017,
    brakeDecelMs2: 12,
    maxGroundPitchDeg: 6,
    rotationPitchLimitDeg: 11,
  },
  feel: {
    rawPitchScale: 0.8,
    rawRollScale: 0.7,
    rawYawScale: 0.4,
    assistPitchP: 0.06,
    assistPitchD: 0.004,
    assistRollP: 0.04,
    assistRollD: 0.008,
    assistMaxBankDeg: 30,
    assistMaxPitchDeg: 18,
    coordYawScale: 0.18,
    autoLevelStrength: 1.0,
  },
};

export const AIRFRAME_CONFIGS: Record<string, AirframeConfig> = {
  A1_SKYRAIDER: SKYRAIDER_AIRFRAME,
  F4_PHANTOM: PHANTOM_AIRFRAME,
  AC47_SPOOKY: SPOOKY_AIRFRAME,
};

export function getAirframeConfig(key: string): AirframeConfig | null {
  return AIRFRAME_CONFIGS[key] ?? null;
}
