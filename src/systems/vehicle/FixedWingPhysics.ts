/**
 * FixedWingPhysics (B1 rebuild).
 *
 * Thin adapter over the unified `Airframe` sim. Preserves the public API
 * existing callers depend on (`FixedWingModel`, `NPCFlightController`,
 * `flightTestScene`, test suites) while delegating all physics work to the
 * rebuilt core. No dual code paths — every command routes through
 * Airframe.step(intent, probe, dt).
 *
 * Legacy shape preserved:
 *   - `FixedWingCommand` (throttleTarget + pitch/roll/yaw + brake + freeLook
 *     + stabilityAssist) → mapped to `AirframeIntent`.
 *   - `FixedWingFlightSnapshot` (pitch/roll deg, airspeed, altitude, ...) →
 *     mapped from `AirframeState`.
 *   - `FixedWingTerrainSample` → wrapped into an `AirframeTerrainProbe`.
 *
 * See docs/rearch/E6-vehicle-physics-design.md, docs/tasks/B1 brief.
 */

import * as THREE from 'three';
import type { FixedWingPhysicsConfig } from './FixedWingConfigs';
import { Airframe, AIRFRAME_FIXED_STEP } from './airframe/Airframe';
import type {
  AirframeConfig,
  AirframeIntent,
  AirframeState,
  AirframeTerrainProbe,
} from './airframe/types';
import { AIRFRAME_CONFIGS } from './airframe/configs';

export type FixedWingFlightPhase =
  | 'parked'
  | 'ground_roll'
  | 'rotation'
  | 'airborne'
  | 'stall'
  | 'landing_rollout';

type FixedWingState = 'grounded' | 'airborne' | 'stalled';

export interface FixedWingCommand {
  throttleTarget: number;
  pitchCommand: number;
  rollCommand: number;
  yawCommand: number;
  brake: number;
  freeLook: boolean;
  stabilityAssist: boolean;
}

export interface FixedWingTerrainSample {
  height: number;
  normal?: THREE.Vector3;
}

export interface FixedWingFlightSnapshot {
  phase: FixedWingFlightPhase;
  airspeed: number;
  forwardAirspeed: number;
  verticalSpeed: number;
  altitude: number;
  altitudeAGL: number;
  aoaDeg: number;
  sideslipDeg: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  pitchRateDeg: number;
  rollRateDeg: number;
  throttle: number;
  brake: number;
  weightOnWheels: boolean;
  isStalled: boolean;
}

interface LegacyControls {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
}

function airframeConfigForLegacy(legacy: FixedWingPhysicsConfig): AirframeConfig {
  // Legacy callers (FixedWingModel, NPCFlightController, flightTestScene,
  // the A1 integration test) pre-compute pitch/roll/yaw to surface-level
  // values before calling setCommand — they're not feeding stick input.
  // The Airframe command builder in 'raw' tier multiplies stick by
  // `rawPitchScale` etc., so we neutralize those scales in the legacy
  // adapter to let surface values flow through unmodified.
  //
  // FIXED_WING_CONFIGS (legacy) is the authoritative per-aircraft source
  // when called through this adapter — we always build the Airframe
  // config from it. AIRFRAME_CONFIGS exists for callers that want to
  // construct an Airframe directly without going through the legacy
  // shape.
  void AIRFRAME_CONFIGS; // referenced to keep the import alive
  return withLegacyFeelScales(buildAirframeConfigFromLegacy(legacy));
}

function withLegacyFeelScales(cfg: AirframeConfig): AirframeConfig {
  return {
    ...cfg,
    feel: {
      ...cfg.feel,
      rawPitchScale: 1.0,
      rawRollScale: 1.0,
      rawYawScale: 1.0,
    },
  };
}

function buildAirframeConfigFromLegacy(cfg: FixedWingPhysicsConfig): AirframeConfig {
  return {
    id: 'legacy',
    mass: { kg: cfg.mass, wingAreaM2: cfg.wingArea },
    engine: {
      maxThrustN: cfg.maxThrust,
      throttleResponsePerSec: cfg.throttleResponse,
      staticThrustFloor: 0.3,
    },
    aero: {
      stallSpeedMs: cfg.stallSpeed,
      vrSpeedMs: cfg.vrSpeed,
      v2SpeedMs: cfg.v2Speed,
      maxSpeedMs: cfg.maxSpeed,
      cl0: cfg.cl0,
      clAlpha: cfg.clAlpha,
      clMax: cfg.clMax,
      alphaStallDeg: cfg.alphaStallDeg,
      alphaMaxDeg: cfg.alphaMaxDeg,
      cd0: cfg.cd0,
      inducedDragK: cfg.inducedDragK,
      sideForceCoefficient: cfg.sideForceCoefficient,
      trimAlphaDeg: cfg.trimAlphaDeg,
      groundEffectStrength: cfg.groundEffectStrength,
    },
    authority: {
      elevator: cfg.elevatorPower,
      aileron: cfg.aileronPower,
      rudder: cfg.rudderPower,
      maxPitchRate: cfg.maxPitchRate,
      maxRollRate: cfg.maxRollRate,
      maxYawRate: cfg.maxYawRate,
      controlResponsePerSec: cfg.controlResponse,
    },
    stability: {
      pitch: cfg.pitchStability,
      rollLevel: cfg.rollLevelStrength,
      yaw: cfg.yawStability,
      pitchDamp: cfg.pitchDamping,
      rollDamp: cfg.rollDamping,
      yawDamp: cfg.yawDamping,
    },
    ground: {
      gearClearanceM: cfg.gearClearance,
      liftoffClearanceM: cfg.liftoffClearance,
      steeringRadPerSec: cfg.groundSteering,
      lateralFriction: cfg.groundLateralFriction,
      rollingResistance: cfg.rollingResistance,
      brakeDecelMs2: cfg.brakeDeceleration,
      maxGroundPitchDeg: 6,
      rotationPitchLimitDeg: cfg.rotationPitchLimitDeg,
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
}

function legacyPhaseFromAirframe(
  afPhase: AirframeState['phase'],
  weightOnWheels: boolean,
): FixedWingFlightPhase {
  if (afPhase === 'parked') return 'parked';
  if (afPhase === 'stall') return 'stall';
  if (afPhase === 'rotation') return 'rotation';
  if (afPhase === 'taxi' || afPhase === 'takeoff_roll') return 'ground_roll';
  if (afPhase === 'rollout') return 'landing_rollout';
  if (afPhase === 'approach') return 'airborne';
  // climb / cruise
  return weightOnWheels ? 'ground_roll' : 'airborne';
}

export class FixedWingPhysics {
  static readonly FIXED_STEP_SECONDS = AIRFRAME_FIXED_STEP;

  private readonly cfg: FixedWingPhysicsConfig;
  private readonly airframe: Airframe;
  private readonly command: FixedWingCommand = {
    throttleTarget: 0,
    pitchCommand: 0,
    rollCommand: 0,
    yawCommand: 0,
    brake: 0,
    freeLook: false,
    stabilityAssist: false,
  };
  private worldHalfExtent = 0;

  constructor(initialPosition: THREE.Vector3, config: FixedWingPhysicsConfig) {
    this.cfg = config;
    const airframeCfg = airframeConfigForLegacy(config);
    this.airframe = new Airframe(initialPosition, airframeCfg);
  }

  update(deltaTime: number, terrain: number | FixedWingTerrainSample): void {
    const sample = this.resolveTerrainSample(terrain);
    const probe = this.makeStaticProbe(sample);
    const intent = this.buildIntentFromCommand();
    this.airframe.step(intent, probe, deltaTime);
  }

  setCommand(command: Partial<FixedWingCommand>): void {
    if (command.throttleTarget !== undefined) {
      this.command.throttleTarget = THREE.MathUtils.clamp(command.throttleTarget, 0, 1);
    }
    if (command.pitchCommand !== undefined) {
      this.command.pitchCommand = THREE.MathUtils.clamp(command.pitchCommand, -1, 1);
    }
    if (command.rollCommand !== undefined) {
      this.command.rollCommand = THREE.MathUtils.clamp(command.rollCommand, -1, 1);
    }
    if (command.yawCommand !== undefined) {
      this.command.yawCommand = THREE.MathUtils.clamp(command.yawCommand, -1, 1);
    }
    if (command.brake !== undefined) {
      this.command.brake = THREE.MathUtils.clamp(command.brake, 0, 1);
    }
    if (command.freeLook !== undefined) {
      this.command.freeLook = command.freeLook;
    }
    if (command.stabilityAssist !== undefined) {
      this.command.stabilityAssist = command.stabilityAssist;
    }
  }

  setControls(controls: Partial<LegacyControls>): void {
    this.setCommand({
      throttleTarget: controls.throttle,
      pitchCommand: controls.pitch,
      rollCommand: controls.roll,
      yawCommand: controls.yaw,
    });
  }

  getCommand(): Readonly<FixedWingCommand> {
    return this.command;
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
    this.airframe.setWorldHalfExtent(halfExtent);
  }

  getPosition(): THREE.Vector3 {
    return this.airframe.getPosition();
  }

  getQuaternion(): THREE.Quaternion {
    return this.airframe.getQuaternion();
  }

  getVelocity(): THREE.Vector3 {
    return this.airframe.getVelocity();
  }

  getAirspeed(): number {
    return this.airframe.getState().airspeedMs;
  }

  getAltitude(): number {
    return this.airframe.getPosition().y;
  }

  getAltitudeAGL(): number {
    return this.airframe.getState().altitudeAGL;
  }

  getHeading(): number {
    return this.airframe.getState().headingDeg;
  }

  getVerticalSpeed(): number {
    return this.airframe.getVelocity().y;
  }

  getPhase(): FixedWingFlightPhase {
    const s = this.airframe.getState();
    return legacyPhaseFromAirframe(s.phase, s.weightOnWheels);
  }

  isStalled(): boolean {
    return this.airframe.getState().isStalled;
  }

  getFlightState(): FixedWingState {
    const s = this.airframe.getState();
    if (s.weightOnWheels) return 'grounded';
    return s.isStalled ? 'stalled' : 'airborne';
  }

  getFlightSnapshot(): FixedWingFlightSnapshot {
    const s = this.airframe.getState();
    return {
      phase: legacyPhaseFromAirframe(s.phase, s.weightOnWheels),
      airspeed: s.airspeedMs,
      forwardAirspeed: s.forwardAirspeedMs,
      verticalSpeed: s.verticalSpeedMs,
      altitude: s.altitude,
      altitudeAGL: s.altitudeAGL,
      aoaDeg: s.aoaDeg,
      sideslipDeg: s.sideslipDeg,
      headingDeg: s.headingDeg,
      pitchDeg: s.pitchDeg,
      rollDeg: s.rollDeg,
      pitchRateDeg: s.pitchRateDeg,
      rollRateDeg: s.rollRateDeg,
      throttle: s.effectors.throttle,
      brake: s.effectors.brake,
      weightOnWheels: s.weightOnWheels,
      isStalled: s.isStalled,
    };
  }

  getControls(): Readonly<LegacyControls> {
    const e = this.airframe.getState().effectors;
    return {
      throttle: e.throttle,
      pitch: e.elevator,
      roll: e.aileron,
      yaw: e.rudder,
    };
  }

  resetToGround(position: THREE.Vector3): void {
    this.airframe.resetToGround(position);
    this.clearCommand();
    if (this.worldHalfExtent > 0) {
      this.airframe.setWorldHalfExtent(this.worldHalfExtent);
    }
  }

  resetAirborne(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    forwardSpeed: number,
    verticalSpeed: number = 0,
    groundHeight?: number,
  ): void {
    this.airframe.resetAirborne(position, quaternion, forwardSpeed, verticalSpeed, groundHeight);
    if (this.worldHalfExtent > 0) {
      this.airframe.setWorldHalfExtent(this.worldHalfExtent);
    }
  }

  private clearCommand(): void {
    this.command.throttleTarget = 0;
    this.command.pitchCommand = 0;
    this.command.rollCommand = 0;
    this.command.yawCommand = 0;
    this.command.brake = 0;
    this.command.freeLook = false;
    this.command.stabilityAssist = false;
  }

  private resolveTerrainSample(terrain: number | FixedWingTerrainSample): FixedWingTerrainSample {
    if (typeof terrain === 'number') {
      return { height: terrain };
    }
    return terrain;
  }

  private buildIntentFromCommand(): AirframeIntent {
    // Legacy callers drive FixedWingPhysics with a command object that
    // already contains the final surface-like values. They expect 'raw'
    // behavior (direct stick-to-surface) when stabilityAssist is false, and
    // 'assist' behavior when it's true.
    return {
      pitch: this.command.pitchCommand,
      roll: this.command.rollCommand,
      yaw: this.command.yawCommand,
      throttle: this.command.throttleTarget,
      brake: this.command.brake,
      tier: this.command.stabilityAssist ? 'assist' : 'raw',
    };
  }

  private makeStaticProbe(sample: FixedWingTerrainSample): AirframeTerrainProbe {
    // The legacy update() contract is "same terrain sample for the whole
    // step". Build a minimal probe that returns that sample for every query
    // and reports a hit when the movement segment crosses below the sampled
    // ground height. This gives us swept collision relative to the supplied
    // flat slab — the caller that wants real swept terrain can upgrade to
    // AirframeTerrainProbe directly.
    const normal = sample.normal ?? new THREE.Vector3(0, 1, 0);
    const height = sample.height;
    return {
      sample() {
        return { height, normal };
      },
      sweep(from: THREE.Vector3, to: THREE.Vector3) {
        if (from.y >= height && to.y < height) {
          const t = (from.y - height) / Math.max(from.y - to.y, 0.0001);
          const point = new THREE.Vector3().lerpVectors(from, to, t);
          point.y = height;
          return { hit: true, point, normal };
        }
        return null;
      },
    };
  }
}
