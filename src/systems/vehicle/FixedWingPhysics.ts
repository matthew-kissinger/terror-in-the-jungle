import * as THREE from 'three';
import type { FixedWingPhysicsConfig } from './FixedWingConfigs';
import { FixedStepRunner } from '../../utils/FixedStepRunner';

const _groundNormal = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _projectedForward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _velocityLocal = new THREE.Vector3();
const _velocityWorld = new THREE.Vector3();
const _inverseQuaternion = new THREE.Quaternion();
const _deltaQ = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _forceLocal = new THREE.Vector3();
const _forceWorld = new THREE.Vector3();
const _dragDirLocal = new THREE.Vector3();
const _windLocal = new THREE.Vector3();
const _liftDirLocal = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _groundForward = new THREE.Vector3();
const _groundRight = new THREE.Vector3();
const _groundMove = new THREE.Vector3();
const _euler = new THREE.Euler();

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const MIN_SPEED = 0.1;
const STALL_WARNING_FACTOR = 0.95;
const GROUND_TOUCHDOWN_BUFFER = 0.08;
const MAX_GROUND_ALIGN_PITCH = THREE.MathUtils.degToRad(18);
const GROUND_PITCH_RETURN_RATE = 3.6;
const GROUND_STEERING_FULL_SPEED = 24;
const GROUND_EFFECT_HEIGHT = 6.0;
const GROUND_IDLE_BRAKE_THRESHOLD = 0.2;
const LIFTOFF_WEIGHT_RATIO = 0.4;
const AIRBORNE_RECOVERY_ALTITUDE = 0.4;
const ROTATION_INPUT_THRESHOLD = 0.08;

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

interface LegacyControls {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
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

interface AerodynamicState {
  airspeed: number;
  forwardSpeed: number;
  alphaRad: number;
  betaRad: number;
  dynamicPressure: number;
  cl: number;
  lift: number;
  drag: number;
  sideForce: number;
  stalled: boolean;
  stallSeverity: number;
}

export class FixedWingPhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;

  private readonly cfg: FixedWingPhysicsConfig;
  private readonly stepper = new FixedStepRunner(FixedWingPhysics.FIXED_STEP_SECONDS);
  private readonly position: THREE.Vector3;
  private readonly velocity: THREE.Vector3 = new THREE.Vector3();
  private readonly quaternion: THREE.Quaternion = new THREE.Quaternion();
  private readonly terrainNormal: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private readonly command: FixedWingCommand = {
    throttleTarget: 0,
    pitchCommand: 0,
    rollCommand: 0,
    yawCommand: 0,
    brake: 0,
    freeLook: false,
    stabilityAssist: false,
  };

  private throttle = 0;
  private elevator = 0;
  private aileron = 0;
  private rudder = 0;
  private brake = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private yawRate = 0;
  private groundHeight = 0;
  private groundPitch = 0;
  private phase: FixedWingFlightPhase = 'parked';
  private weightOnWheels = true;
  private worldHalfExtent = 0;
  private groundStabilizationTicks = 3;
  private snapshot: FixedWingFlightSnapshot;

  constructor(initialPosition: THREE.Vector3, config: FixedWingPhysicsConfig) {
    this.cfg = config;
    this.position = initialPosition.clone();
    this.groundHeight = initialPosition.y - this.cfg.gearClearance;
    this.snapshot = this.buildSnapshot({
      airspeed: 0,
      forwardSpeed: 0,
      alphaRad: 0,
      betaRad: 0,
      dynamicPressure: 0,
      cl: 0,
      lift: 0,
      drag: 0,
      sideForce: 0,
      stalled: false,
      stallSeverity: 0,
    });
  }

  update(deltaTime: number, terrain: number | FixedWingTerrainSample): void {
    const sample = this.resolveTerrainSample(terrain);
    this.stepper.step(deltaTime, (fixedDeltaTime) => {
      this.simulateStep(fixedDeltaTime, sample);
    });
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
  }

  getPosition(): THREE.Vector3 {
    return this.position;
  }

  getQuaternion(): THREE.Quaternion {
    return this.quaternion;
  }

  getVelocity(): THREE.Vector3 {
    return this.velocity;
  }

  getAirspeed(): number {
    return this.snapshot.airspeed;
  }

  getAltitude(): number {
    return this.position.y;
  }

  getAltitudeAGL(): number {
    return this.snapshot.altitudeAGL;
  }

  getHeading(): number {
    return this.snapshot.headingDeg;
  }

  getVerticalSpeed(): number {
    return this.velocity.y;
  }

  getPhase(): FixedWingFlightPhase {
    return this.phase;
  }

  isStalled(): boolean {
    return this.snapshot.isStalled;
  }

  getFlightState(): FixedWingState {
    if (this.weightOnWheels) {
      return 'grounded';
    }
    return this.snapshot.isStalled ? 'stalled' : 'airborne';
  }

  getFlightSnapshot(): FixedWingFlightSnapshot {
    return this.snapshot;
  }

  getControls(): Readonly<LegacyControls> {
    return {
      throttle: this.throttle,
      pitch: this.elevator,
      roll: this.aileron,
      yaw: this.rudder,
    };
  }

  resetToGround(position: THREE.Vector3): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.quaternion.identity();
    this.terrainNormal.set(0, 1, 0);
    this.groundHeight = position.y - this.cfg.gearClearance;
    this.groundPitch = 0;
    this.phase = 'parked';
    this.groundStabilizationTicks = 3;
    this.weightOnWheels = true;
    this.throttle = 0;
    this.elevator = 0;
    this.aileron = 0;
    this.rudder = 0;
    this.brake = 0;
    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;
    this.command.throttleTarget = 0;
    this.command.pitchCommand = 0;
    this.command.rollCommand = 0;
    this.command.yawCommand = 0;
    this.command.brake = 0;
    this.command.freeLook = false;
    this.command.stabilityAssist = false;
    this.snapshot = this.buildSnapshot({
      airspeed: 0,
      forwardSpeed: 0,
      alphaRad: 0,
      betaRad: 0,
      dynamicPressure: 0,
      cl: 0,
      lift: 0,
      drag: 0,
      sideForce: 0,
      stalled: false,
      stallSeverity: 0,
    });
  }

  resetAirborne(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    forwardSpeed: number,
    verticalSpeed: number = 0,
    groundHeight?: number,
  ): void {
    this.position.copy(position);
    this.quaternion.copy(quaternion).normalize();
    _forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    this.velocity.copy(_forward).multiplyScalar(forwardSpeed);
    this.velocity.y = verticalSpeed;
    this.terrainNormal.set(0, 1, 0);
    if (groundHeight !== undefined) {
      this.groundHeight = groundHeight;
    }
    this.groundPitch = 0;
    this.phase = 'airborne';
    this.groundStabilizationTicks = 0;
    this.weightOnWheels = false;
    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;
    this.snapshot = this.buildSnapshot(this.computeAerodynamics());
  }

  private resolveTerrainSample(terrain: number | FixedWingTerrainSample): FixedWingTerrainSample {
    if (typeof terrain === 'number') {
      return { height: terrain };
    }
    return terrain;
  }

  private simulateStep(dt: number, terrain: FixedWingTerrainSample): void {
    this.groundHeight = terrain.height;
    this.terrainNormal.copy(terrain.normal ?? _groundNormal.set(0, 1, 0)).normalize();
    this.updateEffectorState(dt);

    const separation = this.position.y - (this.groundHeight + this.cfg.gearClearance);
    const airborneBySeparation = separation > (this.cfg.liftoffClearance + GROUND_TOUCHDOWN_BUFFER);

    // Ground stabilization: prevent false airborne transition from terrain height mismatch
    // during the first few ticks after creation or resetToGround().
    // Only applies when weight is on wheels and aircraft is near ground (< 2m separation).
    if (this.groundStabilizationTicks > 0 && this.weightOnWheels && separation < 2.0) {
      this.groundStabilizationTicks--;
      this.position.y = this.groundHeight + this.cfg.gearClearance;
    } else if (this.weightOnWheels && airborneBySeparation) {
      const speed = this.velocity.length();
      if (speed < this.cfg.stallSpeed && separation < 3) {
        // Too slow to sustain flight and still near ground - snap back
        this.position.y = this.groundHeight + this.cfg.gearClearance;
      } else {
        this.weightOnWheels = false;
        this.phase = 'airborne';
        this.groundStabilizationTicks = 0;
        // Match normal liftoff velocity boost
        this.velocity.addScaledVector(
          _up.set(0, 1, 0).applyQuaternion(this.quaternion),
          Math.max(1.5, speed * 0.04),
        );
      }
    }

    if (this.weightOnWheels) {
      this.stepGrounded(dt);
    } else {
      this.stepAirborne(dt);
    }

    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }
  }

  private updateEffectorState(dt: number): void {
    const throttleRate = Math.min(this.cfg.throttleResponse * dt, 1.0);
    const controlRate = Math.min(this.cfg.controlResponse * dt, 1.0);

    this.throttle = THREE.MathUtils.lerp(this.throttle, this.command.throttleTarget, throttleRate);
    this.elevator = THREE.MathUtils.lerp(this.elevator, this.command.pitchCommand, controlRate);
    this.aileron = THREE.MathUtils.lerp(this.aileron, this.command.rollCommand, controlRate);
    this.rudder = THREE.MathUtils.lerp(this.rudder, this.command.yawCommand, controlRate);
    this.brake = THREE.MathUtils.lerp(this.brake, this.command.brake, controlRate);
  }

  private stepGrounded(dt: number): void {
    const normal = this.terrainNormal;
    const forward = this.computeGroundForward(normal, _groundForward);
    const right = _groundRight.copy(forward).cross(normal).normalize();

    const currentForwardSpeed = this.velocity.dot(forward);
    const currentSideSpeed = this.velocity.dot(right);
    const airspeed = Math.max(0, currentForwardSpeed);
    const dynamicPressure = 0.5 * AIR_DENSITY * airspeed * airspeed;

    const throttleAcceleration = (this.throttle * this.cfg.maxThrust) / this.cfg.mass;
    const dragAcceleration = (dynamicPressure * this.cfg.wingArea * this.cfg.cd0) / this.cfg.mass;
    const brakeAcceleration = this.brake * this.cfg.brakeDeceleration;
    const rollingResistance = this.cfg.rollingResistance * GRAVITY;
    let forwardSpeed = currentForwardSpeed + (throttleAcceleration - dragAcceleration - rollingResistance - brakeAcceleration) * dt;
    forwardSpeed = Math.max(0, Math.min(forwardSpeed, this.cfg.maxSpeed));

    let sideSpeed = THREE.MathUtils.lerp(
      currentSideSpeed,
      0,
      Math.min(this.cfg.groundLateralFriction * dt, 1.0),
    );

    const steerAuthority = THREE.MathUtils.smoothstep(
      Math.abs(forwardSpeed),
      0.5,
      GROUND_STEERING_FULL_SPEED,
    );
    const steerDelta = this.rudder * this.cfg.groundSteering * steerAuthority * dt;
    if (Math.abs(steerDelta) > 0.0001) {
      forward.applyAxisAngle(normal, steerDelta).normalize();
      right.copy(forward).cross(normal).normalize();
    }

    const rotationReady = forwardSpeed >= this.cfg.vrSpeed * 0.9;
    let targetPitch: number;
    if (this.elevator > 0 && rotationReady) {
      targetPitch = this.elevator * THREE.MathUtils.degToRad(this.cfg.rotationPitchLimitDeg);
    } else if (this.elevator > 0) {
      // Below Vr: gradual visual feedback (capped at 4 deg) so the player sees input is working
      const preRotationAuthority = THREE.MathUtils.smoothstep(forwardSpeed, this.cfg.vrSpeed * 0.3, this.cfg.vrSpeed * 0.9);
      targetPitch = this.elevator * THREE.MathUtils.degToRad(4) * preRotationAuthority;
    } else {
      targetPitch = 0;
    }
    this.groundPitch = THREE.MathUtils.lerp(
      this.groundPitch,
      Math.min(targetPitch, MAX_GROUND_ALIGN_PITCH),
      Math.min(GROUND_PITCH_RETURN_RATE * dt, 1.0),
    );

    this.setGroundAttitude(normal, forward, this.groundPitch);

    _groundMove.copy(forward).multiplyScalar(forwardSpeed).addScaledVector(right, sideSpeed);
    this.position.addScaledVector(_groundMove, dt);
    this.position.y = this.groundHeight + this.cfg.gearClearance;
    this.velocity.copy(_groundMove);

    const aero = this.computeAerodynamics();
    const canRotate = rotationReady && this.command.pitchCommand > ROTATION_INPUT_THRESHOLD;
    const liftRatio = aero.lift / (this.cfg.mass * GRAVITY);
    if (canRotate && liftRatio >= LIFTOFF_WEIGHT_RATIO) {
      this.weightOnWheels = false;
      this.phase = 'airborne';
      this.velocity.addScaledVector(_up.set(0, 1, 0).applyQuaternion(this.quaternion), Math.max(1.5, forwardSpeed * 0.04));
    } else if (Math.abs(forwardSpeed) <= 0.75 && this.throttle <= 0.05 && this.brake >= GROUND_IDLE_BRAKE_THRESHOLD) {
      this.phase = 'parked';
    } else if (canRotate) {
      this.phase = 'rotation';
    } else if (this.phase === 'landing_rollout') {
      this.phase = 'landing_rollout';
    } else {
      this.phase = 'ground_roll';
    }

    this.snapshot = this.buildSnapshot(aero);
  }

  private stepAirborne(dt: number): void {
    const aero = this.computeAerodynamics();
    const authority = THREE.MathUtils.clamp(
      aero.dynamicPressure / (0.5 * AIR_DENSITY * this.cfg.vrSpeed * this.cfg.vrSpeed),
      0.15,
      2.2,
    );

    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    const rollAngle = _euler.z;

    const basePitchAssist = -(aero.alphaRad - THREE.MathUtils.degToRad(this.cfg.trimAlphaDeg)) * this.cfg.pitchStability;
    const assistPitch = this.command.stabilityAssist
      ? -(aero.alphaRad - THREE.MathUtils.degToRad(this.cfg.trimAlphaDeg)) * this.cfg.stabilityAssistPitch
      : 0;
    const rollLevelAssist = Math.abs(this.command.rollCommand) < 0.05
      ? -rollAngle * this.cfg.rollLevelStrength
      : 0;
    const strongRollAssist = this.command.stabilityAssist
      ? -rollAngle * this.cfg.stabilityAssistRoll
      : 0;
    const yawAssist = -aero.betaRad * this.cfg.yawStability
      + (this.command.stabilityAssist ? -aero.betaRad * this.cfg.stabilityAssistYaw : 0);

    const stallPitchDrop = aero.stalled ? -(0.9 + aero.stallSeverity * 1.3) : 0;

    // Alpha protection: attenuate nose-up elevator as AoA approaches stall.
    // Modeled after fly-by-wire alpha limiters (F-16 FLCS, A320 alpha floor).
    const absAlphaDeg = Math.abs(THREE.MathUtils.radToDeg(aero.alphaRad));
    const protectionOnsetDeg = this.cfg.alphaStallDeg - 5;
    const protectionFullDeg = this.cfg.alphaStallDeg - 1;
    const alphaFactor = 1 - THREE.MathUtils.smoothstep(absAlphaDeg, protectionOnsetDeg, protectionFullDeg);
    const protectedElevator = this.elevator > 0 ? this.elevator * alphaFactor : this.elevator;

    const pitchAccel = protectedElevator * this.cfg.elevatorPower * authority
      + basePitchAssist
      + assistPitch
      + stallPitchDrop
      - this.pitchRate * this.cfg.pitchDamping;
    const rollAccel = this.aileron * this.cfg.aileronPower * authority
      + rollLevelAssist
      + strongRollAssist
      - this.rollRate * this.cfg.rollDamping;
    const yawAccel = this.rudder * this.cfg.rudderPower * authority
      + yawAssist
      + Math.sin(rollAngle) * 0.4 * authority
      - this.yawRate * this.cfg.yawDamping;

    this.pitchRate = THREE.MathUtils.clamp(
      this.pitchRate + pitchAccel * dt,
      -this.cfg.maxPitchRate,
      this.cfg.maxPitchRate,
    );
    this.rollRate = THREE.MathUtils.clamp(
      this.rollRate + rollAccel * dt,
      -this.cfg.maxRollRate,
      this.cfg.maxRollRate,
    );
    this.yawRate = THREE.MathUtils.clamp(
      this.yawRate + yawAccel * dt,
      -this.cfg.maxYawRate,
      this.cfg.maxYawRate,
    );

    this.applyAngularRates(dt);

    // Scale thrust by airspeed to prevent rocket-launch behavior at zero speed.
    // Floor of 0.3 allows stall recovery with partial power.
    const thrustSpeedRatio = THREE.MathUtils.smoothstep(
      aero.forwardSpeed,
      this.cfg.stallSpeed * 0.15,
      this.cfg.stallSpeed * 0.5,
    );
    const effectiveThrust = this.throttle * this.cfg.maxThrust * Math.max(thrustSpeedRatio, 0.3);
    _forceLocal.set(0, 0, -effectiveThrust);
    if (aero.airspeed > MIN_SPEED) {
      _dragDirLocal.copy(_windLocal).multiplyScalar(aero.drag);
      _liftDirLocal.multiplyScalar(aero.lift);
      _forceLocal.add(_dragDirLocal).add(_liftDirLocal);
      _forceLocal.x += aero.sideForce;
    }

    _forceWorld.copy(_forceLocal).applyQuaternion(this.quaternion);
    _forceWorld.y -= this.cfg.mass * GRAVITY;

    this.velocity.addScaledVector(_forceWorld, dt / this.cfg.mass);
    const speed = this.velocity.length();
    if (speed > this.cfg.maxSpeed) {
      this.velocity.multiplyScalar(this.cfg.maxSpeed / speed);
    }

    this.position.addScaledVector(this.velocity, dt);
    const groundClearance = this.groundHeight + this.cfg.gearClearance;
    const altitudeAGL = this.position.y - groundClearance;
    if (altitudeAGL <= this.cfg.liftoffClearance + GROUND_TOUCHDOWN_BUFFER && this.velocity.y <= 0) {
      this.position.y = groundClearance;
      this.velocity.y = 0;
      this.weightOnWheels = true;
      this.phase = this.velocity.length() > 1.0 ? 'landing_rollout' : 'parked';
      this.pitchRate = 0;
      this.rollRate = 0;
      this.yawRate *= 0.5;
      this.groundPitch = Math.max(0, _euler.x);
    } else {
      this.weightOnWheels = false;
      this.phase = aero.stalled ? 'stall' : 'airborne';
    }

    this.snapshot = this.buildSnapshot(aero);
  }

  private computeAerodynamics(): AerodynamicState {
    _inverseQuaternion.copy(this.quaternion).invert();
    _velocityLocal.copy(this.velocity).applyQuaternion(_inverseQuaternion);

    const forwardSpeed = Math.max(0, -_velocityLocal.z);
    const airspeed = Math.max(_velocityLocal.length(), MIN_SPEED);
    const alphaRad = Math.atan2(-_velocityLocal.y, Math.max(forwardSpeed, MIN_SPEED));
    const betaRad = Math.atan2(_velocityLocal.x, Math.max(forwardSpeed, MIN_SPEED));
    const dynamicPressure = 0.5 * AIR_DENSITY * airspeed * airspeed;

    const absAlphaDeg = Math.abs(THREE.MathUtils.radToDeg(alphaRad));
    const stallStartDeg = Math.max(4, this.cfg.alphaStallDeg - 3);
    const stallSeverity = THREE.MathUtils.clamp(
      (absAlphaDeg - stallStartDeg) / Math.max(this.cfg.alphaMaxDeg - stallStartDeg, 1),
      0,
      1,
    );
    const stalled = absAlphaDeg >= this.cfg.alphaStallDeg
      || (forwardSpeed < this.cfg.stallSpeed * STALL_WARNING_FACTOR && absAlphaDeg > this.cfg.alphaStallDeg * 0.75);
    const stallLiftScale = stalled
      ? THREE.MathUtils.lerp(0.9, 0.25, stallSeverity)
      : 1.0;
    const clBase = this.cfg.cl0 + this.cfg.clAlpha * alphaRad + this.elevator * 0.22;
    const cl = THREE.MathUtils.clamp(clBase, -this.cfg.clMax, this.cfg.clMax) * stallLiftScale;

    let lift = dynamicPressure * this.cfg.wingArea * cl;
    if (this.weightOnWheels) {
      const speedFactor = THREE.MathUtils.smoothstep(forwardSpeed, this.cfg.vrSpeed * 0.85, this.cfg.v2Speed);
      const heightAboveGround = Math.max(0, this.position.y - (this.groundHeight + this.cfg.gearClearance));
      const groundEffect = 1 - THREE.MathUtils.clamp(heightAboveGround / GROUND_EFFECT_HEIGHT, 0, 1);
      lift *= 1 + groundEffect * this.cfg.groundEffectStrength * speedFactor;
    }

    const inducedDrag = this.cfg.inducedDragK * cl * cl;
    const stallDrag = stalled ? THREE.MathUtils.lerp(0.04, 0.26, stallSeverity) : 0;
    const drag = dynamicPressure * this.cfg.wingArea * (this.cfg.cd0 + inducedDrag + stallDrag);
    const sideForce = dynamicPressure * this.cfg.wingArea * (-betaRad * this.cfg.sideForceCoefficient);

    _windLocal.copy(_velocityLocal).normalize().multiplyScalar(-1);
    _dragDirLocal.copy(_windLocal);
    _liftDirLocal.copy(_windLocal).cross(_right.set(1, 0, 0)).normalize();

    return {
      airspeed,
      forwardSpeed,
      alphaRad,
      betaRad,
      dynamicPressure,
      cl,
      lift,
      drag,
      sideForce,
      stalled,
      stallSeverity,
    };
  }

  private applyAngularRates(dt: number): void {
    if (Math.abs(this.rollRate) > 0.0001) {
      _axis.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
      _deltaQ.setFromAxisAngle(_axis, this.rollRate * dt);
      this.quaternion.premultiply(_deltaQ).normalize();
    }

    if (Math.abs(this.pitchRate) > 0.0001) {
      _axis.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();
      _deltaQ.setFromAxisAngle(_axis, this.pitchRate * dt);
      this.quaternion.premultiply(_deltaQ).normalize();
    }

    if (Math.abs(this.yawRate) > 0.0001) {
      _axis.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
      _deltaQ.setFromAxisAngle(_axis, this.yawRate * dt);
      this.quaternion.premultiply(_deltaQ).normalize();
    }
  }

  private computeGroundForward(normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, -1).applyQuaternion(this.quaternion).projectOnPlane(normal);
    if (target.lengthSq() < 0.0001) {
      target.set(0, 0, -1).projectOnPlane(normal);
    }
    return target.normalize();
  }

  private setGroundAttitude(normal: THREE.Vector3, forward: THREE.Vector3, pitch: number): void {
    _projectedForward.copy(forward).normalize();
    _right.copy(_projectedForward).cross(normal).normalize();
    _forward.copy(_projectedForward).applyAxisAngle(_right, pitch).normalize();
    _up.copy(_right).cross(_forward).normalize();
    _matrix.makeBasis(_right, _up, _forward.clone().negate());
    this.quaternion.setFromRotationMatrix(_matrix).normalize();
  }

  private buildSnapshot(aero: AerodynamicState): FixedWingFlightSnapshot {
    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    const headingDeg = ((THREE.MathUtils.radToDeg(_euler.y) % 360) + 360) % 360;
    const altitudeAGL = Math.max(0, this.position.y - (this.groundHeight + this.cfg.gearClearance));
    return {
      phase: this.phase,
      airspeed: aero.airspeed,
      forwardAirspeed: aero.forwardSpeed,
      verticalSpeed: this.velocity.y,
      altitude: this.position.y,
      altitudeAGL,
      aoaDeg: THREE.MathUtils.radToDeg(aero.alphaRad),
      sideslipDeg: THREE.MathUtils.radToDeg(aero.betaRad),
      headingDeg,
      pitchDeg: THREE.MathUtils.radToDeg(_euler.x),
      rollDeg: THREE.MathUtils.radToDeg(_euler.z),
      pitchRateDeg: THREE.MathUtils.radToDeg(this.pitchRate),
      rollRateDeg: THREE.MathUtils.radToDeg(this.rollRate),
      throttle: this.throttle,
      brake: this.brake,
      weightOnWheels: this.weightOnWheels,
      isStalled: !this.weightOnWheels && aero.stalled && altitudeAGL > AIRBORNE_RECOVERY_ALTITUDE,
    };
  }

  private enforceWorldBoundary(): void {
    const limit = this.worldHalfExtent;
    if (this.position.x > limit) {
      this.position.x = limit;
      this.velocity.x = -Math.abs(this.velocity.x) * 0.5;
    } else if (this.position.x < -limit) {
      this.position.x = -limit;
      this.velocity.x = Math.abs(this.velocity.x) * 0.5;
    }

    if (this.position.z > limit) {
      this.position.z = limit;
      this.velocity.z = -Math.abs(this.velocity.z) * 0.5;
    } else if (this.position.z < -limit) {
      this.position.z = -limit;
      this.velocity.z = Math.abs(this.velocity.z) * 0.5;
    }
  }
}
