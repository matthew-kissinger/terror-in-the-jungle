/**
 * Airframe — unified fixed-wing simulation types (B1 rebuild, from E6 spike).
 *
 * One intent type, one command type, one config type, one state type. No
 * hidden modes; `tier: 'raw' | 'assist'` is explicit on the intent.
 *
 * See docs/rearch/E6-vehicle-physics-design.md.
 */

import * as THREE from 'three';

export type AirframeTier = 'raw' | 'assist';

export type AirframePhase =
  | 'parked'
  | 'taxi'
  | 'takeoff_roll'
  | 'rotation'
  | 'climb'
  | 'cruise'
  | 'stall'
  | 'approach'
  | 'rollout';

/**
 * Unitless player input. Produced by one input builder (keyboard, touch,
 * gamepad, AI). This is the only place input diversity exists.
 */
export interface AirframeIntent {
  /** -1..1 stick pitch (nose up positive). */
  pitch: number;
  /** -1..1 stick roll (right bank positive). */
  roll: number;
  /** -1..1 rudder. */
  yaw: number;
  /** 0..1 throttle target. Persistent; key handler mutates this over time. */
  throttle: number;
  /** 0..1 brake. Ignored when airborne. */
  brake: number;
  /** Which control-law tier the player wants. */
  tier: AirframeTier;
  /** Orbit hold is an alternate input source, not a tier. */
  orbit?: {
    centerX: number;
    centerZ: number;
    radiusM: number;
    bankDeg: number;
    direction: -1 | 1;
  };
}

/**
 * What the sim acts on this tick. Opaque to input diversity (one command
 * path; no branching on input source inside the sim).
 */
export interface AirframeCommand {
  elevator: number; // -1..1 target elevator deflection
  aileron: number; // -1..1 target aileron deflection
  rudder: number; // -1..1 target rudder deflection
  throttle: number; // 0..1
  brake: number; // 0..1
  /** Whether assist-mode stability augmentations should blend in the airborne step. */
  assist: boolean;
}

export interface AirframeTerrainSample {
  height: number;
  normal?: THREE.Vector3;
}

/**
 * Swept collision query — one primitive the sim can ask of the world.
 * Production port: implemented against ITerrainRuntime.raycastTerrain.
 */
export interface AirframeTerrainProbe {
  /** Point-sample height+normal at (x, z). */
  sample(x: number, z: number): AirframeTerrainSample;
  /**
   * Swept test along a segment. Returns the first terrain intersection or null.
   * Used by the sim to clamp a movement step when a climbing aircraft would
   * otherwise pass through rising terrain.
   */
  sweep(
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null;
}

export interface AirframeConfig {
  readonly id: string;
  readonly mass: {
    kg: number;
    wingAreaM2: number;
  };
  readonly engine: {
    maxThrustN: number;
    throttleResponsePerSec: number;
    /** Thrust at zero forward speed as fraction of max (prevents rocket launch). */
    staticThrustFloor: number;
  };
  readonly aero: {
    stallSpeedMs: number;
    vrSpeedMs: number;
    v2SpeedMs: number;
    maxSpeedMs: number;
    cl0: number;
    clAlpha: number;
    clMax: number;
    alphaStallDeg: number;
    alphaMaxDeg: number;
    cd0: number;
    inducedDragK: number;
    sideForceCoefficient: number;
    trimAlphaDeg: number;
    /** Lift boost (0..1) when within ground-effect height. */
    groundEffectStrength: number;
  };
  readonly authority: {
    elevator: number;
    aileron: number;
    rudder: number;
    maxPitchRate: number;
    maxRollRate: number;
    maxYawRate: number;
    controlResponsePerSec: number;
  };
  readonly stability: {
    pitch: number;
    rollLevel: number;
    yaw: number;
    pitchDamp: number;
    rollDamp: number;
    yawDamp: number;
  };
  readonly ground: {
    gearClearanceM: number;
    liftoffClearanceM: number;
    steeringRadPerSec: number;
    lateralFriction: number;
    rollingResistance: number;
    brakeDecelMs2: number;
    /** Max pitch while on the ground; arcade feel (immediate nose lift hint). */
    maxGroundPitchDeg: number;
    /** Pitch limit while rotating above Vr (degrees). */
    rotationPitchLimitDeg: number;
  };
  readonly feel: {
    /** Scales raw stick → control authority. */
    rawPitchScale: number;
    rawRollScale: number;
    rawYawScale: number;
    /** PD gains when in assist mode. */
    assistPitchP: number;
    assistPitchD: number;
    assistRollP: number;
    assistRollD: number;
    /** Bank/pitch targets for stick commands. */
    assistMaxBankDeg: number;
    assistMaxPitchDeg: number;
    /** Turn coordination — yaw added proportional to bank. */
    coordYawScale: number;
    /** Autolevel strength when stick is centered in assist mode. */
    autoLevelStrength: number;
  };
}

export interface AirframeState {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly velocity: THREE.Vector3;
  /** Smoothed effector positions (lerped from last command). */
  readonly effectors: {
    throttle: number;
    elevator: number;
    aileron: number;
    rudder: number;
    brake: number;
  };
  readonly phase: AirframePhase;
  readonly weightOnWheels: boolean;
  readonly airspeedMs: number;
  /** Forward-axis airspeed (body-Z), always >= 0. */
  readonly forwardAirspeedMs: number;
  readonly altitude: number;
  readonly altitudeAGL: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly headingDeg: number;
  readonly verticalSpeedMs: number;
  readonly aoaDeg: number;
  readonly sideslipDeg: number;
  readonly pitchRateDeg: number;
  readonly rollRateDeg: number;
  readonly yawRateDeg: number;
  readonly isStalled: boolean;
}
