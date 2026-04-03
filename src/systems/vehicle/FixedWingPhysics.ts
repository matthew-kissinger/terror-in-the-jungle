import * as THREE from 'three';
import type { FixedWingPhysicsConfig } from './FixedWingConfigs';
import { FixedStepRunner } from '../../utils/FixedStepRunner';

const _gravityForce = new THREE.Vector3();
const _liftForce = new THREE.Vector3();
const _thrustForce = new THREE.Vector3();
const _dragForce = new THREE.Vector3();
const _sideForce = new THREE.Vector3();
const _totalForce = new THREE.Vector3();
const _deltaPosition = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _localVelocity = new THREE.Vector3();
const _inverseQuaternion = new THREE.Quaternion();

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const GROUND_CLEARANCE = 0.5;
const LIFTOFF_HEIGHT = 0.15;
const ROTATION_SPEED_FRACTION = 0.82;
const STALL_WARNING_FACTOR = 0.95;
const TAKEOFF_LIFT_BONUS = 0.42;
const CLIMB_LIFT_BONUS = 0.16;
const INDUCED_DRAG_FACTOR = 0.035;
const GROUND_EFFECT_HEIGHT = 6.0;
const GROUND_EFFECT_STRENGTH = 0.12;
const TAXI_SIDE_DAMPING = 8.0;
const TAXI_FORWARD_DAMPING = 0.18;
const SIDE_SLIP_DAMPING = 2.8;
const LOW_SPEED_ROLL_DAMPING = 4.0;
const LOW_SPEED_PITCH_DAMPING = 2.5;
const GROUND_ROLL_AUTHORITY = 0.12;
const GROUND_PITCH_AUTHORITY = 0.6;
const AIRBORNE_ROLL_STABILITY = 1.8;
const AIRBORNE_PITCH_STABILITY = 0.8;
const PITCH_TRIM_ANGLE = THREE.MathUtils.degToRad(3);
const MAX_PITCH_UP = THREE.MathUtils.degToRad(28);
const MAX_PITCH_DOWN = THREE.MathUtils.degToRad(22);
const MAX_BANK_ANGLE = THREE.MathUtils.degToRad(70);

type FixedWingState = 'grounded' | 'airborne' | 'stalled';

interface FixedWingControls {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
}

interface FixedWingInternalState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  groundHeight: number;
  flightState: FixedWingState;
}

export class FixedWingPhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;

  private state: FixedWingInternalState;
  private controls: FixedWingControls;
  private smoothedControls: FixedWingControls;
  private readonly cfg: FixedWingPhysicsConfig;
  private worldHalfExtent = 0;
  private readonly stepper = new FixedStepRunner(FixedWingPhysics.FIXED_STEP_SECONDS);

  constructor(initialPosition: THREE.Vector3, config: FixedWingPhysicsConfig) {
    this.cfg = config;
    this.state = {
      position: initialPosition.clone(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      groundHeight: initialPosition.y - GROUND_CLEARANCE,
      flightState: 'grounded',
    };
    this.controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.smoothedControls = { ...this.controls };
  }

  update(deltaTime: number, terrainHeight: number): void {
    this.stepper.step(deltaTime, (fixedDeltaTime) => {
      this.simulateStep(fixedDeltaTime, terrainHeight);
    });
  }

  setControls(controls: Partial<FixedWingControls>): void {
    Object.assign(this.controls, controls);
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
  }

  getPosition(): THREE.Vector3 {
    return this.state.position;
  }

  getQuaternion(): THREE.Quaternion {
    return this.state.quaternion;
  }

  getVelocity(): THREE.Vector3 {
    return this.state.velocity;
  }

  getAirspeed(): number {
    return this.state.velocity.length();
  }

  getAltitude(): number {
    return this.state.position.y;
  }

  getHeading(): number {
    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    const deg = THREE.MathUtils.radToDeg(_euler.y);
    return ((deg % 360) + 360) % 360;
  }

  getVerticalSpeed(): number {
    return this.state.velocity.y;
  }

  isStalled(): boolean {
    return this.state.flightState === 'stalled';
  }

  getFlightState(): FixedWingState {
    return this.state.flightState;
  }

  getControls(): Readonly<FixedWingControls> {
    return this.controls;
  }

  resetToGround(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.quaternion.identity();
    this.state.groundHeight = position.y - GROUND_CLEARANCE;
    this.state.flightState = 'grounded';
    this.controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.smoothedControls = { ...this.controls };
  }

  private simulateStep(dt: number, terrainHeight: number): void {
    this.state.groundHeight = terrainHeight;
    this.smoothControlInputs(dt);

    const groundedBeforeStep = this.isGroundedWithinTolerance();
    this.applyRotation(dt, groundedBeforeStep);
    this.calculateForces(dt, groundedBeforeStep);
    this.integrate(dt);
    this.enforceGroundCollision();
    this.updateFlightState();

    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }
  }

  private smoothControlInputs(dt: number): void {
    const rate = Math.min(this.cfg.inputSmoothRate * dt, 1.0);
    this.smoothedControls.throttle = THREE.MathUtils.lerp(
      this.smoothedControls.throttle,
      this.controls.throttle,
      rate,
    );
    this.smoothedControls.pitch = THREE.MathUtils.lerp(
      this.smoothedControls.pitch,
      this.controls.pitch,
      rate,
    );
    this.smoothedControls.roll = THREE.MathUtils.lerp(
      this.smoothedControls.roll,
      this.controls.roll,
      rate,
    );
    this.smoothedControls.yaw = THREE.MathUtils.lerp(
      this.smoothedControls.yaw,
      this.controls.yaw,
      rate,
    );
  }

  private applyRotation(dt: number, grounded: boolean): void {
    const airspeed = this.getForwardAirspeed();
    const rotationSpeed = this.cfg.stallSpeed * ROTATION_SPEED_FRACTION;
    const baseAuthority = grounded
      ? THREE.MathUtils.smoothstep(airspeed, rotationSpeed * 0.55, this.cfg.stallSpeed * 1.05)
      : THREE.MathUtils.clamp(airspeed / this.cfg.stallSpeed, 0.35, 1.2);

    const rollAuthority = grounded ? baseAuthority * GROUND_ROLL_AUTHORITY : baseAuthority;
    const pitchAuthority = grounded ? baseAuthority * GROUND_PITCH_AUTHORITY : baseAuthority;
    const yawAuthority = grounded ? Math.max(baseAuthority, 0.35) : baseAuthority;

    const rollDelta = this.smoothedControls.roll * this.cfg.rollRate * rollAuthority * dt;
    if (Math.abs(rollDelta) > 0.0001) {
      _axis.set(0, 0, -1).applyQuaternion(this.state.quaternion).normalize();
      _deltaQ.setFromAxisAngle(_axis, rollDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    const pitchDelta = this.smoothedControls.pitch * this.cfg.pitchRate * pitchAuthority * dt;
    if (Math.abs(pitchDelta) > 0.0001) {
      _axis.set(1, 0, 0).applyQuaternion(this.state.quaternion).normalize();
      _deltaQ.setFromAxisAngle(_axis, pitchDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    const yawDelta = this.smoothedControls.yaw * this.cfg.yawRate * yawAuthority * dt;
    if (Math.abs(yawDelta) > 0.0001) {
      _axis.set(0, 1, 0);
      _deltaQ.setFromAxisAngle(_axis, yawDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    if (grounded) {
      this.applyGroundAttitudeDamping(_euler.z, LOW_SPEED_ROLL_DAMPING * dt, 0, 0, -1);
      this.applyGroundAttitudeDamping(_euler.x, LOW_SPEED_PITCH_DAMPING * dt, 1, 0, 0);
    } else {
      const rollStability = 1 - Math.min(Math.abs(this.smoothedControls.roll), 1);
      const pitchStability = 1 - Math.min(Math.abs(this.smoothedControls.pitch), 1);
      this.applyGroundAttitudeDamping(
        _euler.z,
        AIRBORNE_ROLL_STABILITY * rollStability * dt,
        0,
        0,
        -1,
      );
      this.applyGroundAttitudeDamping(
        _euler.x - PITCH_TRIM_ANGLE,
        AIRBORNE_PITCH_STABILITY * pitchStability * dt,
        1,
        0,
        0,
      );

      _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
      const coordinatedTurnRate = Math.sin(_euler.z) * THREE.MathUtils.clamp(airspeed / this.cfg.maxSpeed, 0, 1) * 0.55;
      if (Math.abs(coordinatedTurnRate) > 0.0001) {
        _deltaQ.setFromAxisAngle(_up.set(0, 1, 0), -coordinatedTurnRate * dt);
        this.state.quaternion.premultiply(_deltaQ).normalize();
      }
    }

    this.clampAttitude();
  }

  private applyGroundAttitudeDamping(
    angle: number,
    amount: number,
    axisX: number,
    axisY: number,
    axisZ: number,
  ): void {
    if (Math.abs(angle) <= 0.0001) {
      return;
    }

    _axis.set(axisX, axisY, axisZ).applyQuaternion(this.state.quaternion).normalize();
    _deltaQ.setFromAxisAngle(_axis, -angle * Math.min(amount, 1.0));
    this.state.quaternion.premultiply(_deltaQ).normalize();
  }

  private clampAttitude(): void {
    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    _euler.x = THREE.MathUtils.clamp(_euler.x, -MAX_PITCH_DOWN, MAX_PITCH_UP);
    _euler.z = THREE.MathUtils.clamp(_euler.z, -MAX_BANK_ANGLE, MAX_BANK_ANGLE);
    this.state.quaternion.setFromEuler(_euler).normalize();
  }

  private calculateForces(dt: number, grounded: boolean): void {
    const { mass, maxThrust, wingArea, liftCoefficient, dragCoefficient, maxSpeed } = this.cfg;

    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.state.quaternion).normalize();
    _up.set(0, 1, 0).applyQuaternion(this.state.quaternion).normalize();

    _inverseQuaternion.copy(this.state.quaternion).invert();
    _localVelocity.copy(this.state.velocity).applyQuaternion(_inverseQuaternion);

    const forwardSpeed = Math.max(0, -_localVelocity.z);
    const airflowSpeed = Math.max(forwardSpeed, this.state.velocity.length() * 0.85);
    const sideSlipSpeed = _localVelocity.x;
    const dynamicPressure = 0.5 * AIR_DENSITY * airflowSpeed * airflowSpeed;
    const heightAboveGround = Math.max(0, this.state.position.y - (this.state.groundHeight + GROUND_CLEARANCE));
    const rotationSpeed = this.cfg.stallSpeed * ROTATION_SPEED_FRACTION;

    const stallFactor = grounded
      ? 1.0
      : THREE.MathUtils.smoothstep(airflowSpeed, this.cfg.stallSpeed * 0.65, this.cfg.stallSpeed * 1.05);
    const takeoffLiftAssist = Math.max(this.smoothedControls.pitch, 0)
      * THREE.MathUtils.smoothstep(forwardSpeed, rotationSpeed, this.cfg.stallSpeed * 1.15)
      * (grounded ? TAKEOFF_LIFT_BONUS : CLIMB_LIFT_BONUS);
    let effectiveLiftCoefficient = liftCoefficient * stallFactor + takeoffLiftAssist;

    let liftMagnitude = dynamicPressure * wingArea * effectiveLiftCoefficient;
    if (heightAboveGround < GROUND_EFFECT_HEIGHT && forwardSpeed > rotationSpeed * 0.6) {
      const groundEffect = 1 - (heightAboveGround / GROUND_EFFECT_HEIGHT);
      liftMagnitude *= 1 + groundEffect * GROUND_EFFECT_STRENGTH;
    }

    const totalDragCoefficient = dragCoefficient + (effectiveLiftCoefficient * effectiveLiftCoefficient * INDUCED_DRAG_FACTOR);
    const dragMagnitude = dynamicPressure * wingArea * totalDragCoefficient;

    _gravityForce.set(0, -GRAVITY * mass, 0);
    _thrustForce.copy(_forward).multiplyScalar(this.smoothedControls.throttle * maxThrust);
    _liftForce.copy(_up).multiplyScalar(liftMagnitude);
    if (this.state.velocity.lengthSq() > 0.0001) {
      _dragForce.copy(this.state.velocity).normalize().multiplyScalar(-dragMagnitude);
    } else {
      _dragForce.set(0, 0, 0);
    }
    _sideForce.copy(_right).multiplyScalar(-sideSlipSpeed * mass * SIDE_SLIP_DAMPING);

    _totalForce
      .copy(_gravityForce)
      .add(_thrustForce)
      .add(_liftForce)
      .add(_dragForce)
      .add(_sideForce);

    this.state.velocity.addScaledVector(_totalForce, dt / mass);

    this.applyLowSpeedDamping(dt, grounded);

    const speed = this.state.velocity.length();
    if (speed > maxSpeed) {
      this.state.velocity.multiplyScalar(maxSpeed / speed);
    }
  }

  private applyLowSpeedDamping(dt: number, grounded: boolean): void {
    _inverseQuaternion.copy(this.state.quaternion).invert();
    _localVelocity.copy(this.state.velocity).applyQuaternion(_inverseQuaternion);

    if (grounded) {
      _localVelocity.x = THREE.MathUtils.lerp(
        _localVelocity.x,
        0,
        Math.min(TAXI_SIDE_DAMPING * dt, 1.0),
      );

      const forwardDamping = Math.max(
        0,
        1 - ((1 - this.smoothedControls.throttle * 0.7) * TAXI_FORWARD_DAMPING * dt),
      );
      _localVelocity.z *= forwardDamping;
      if (_localVelocity.z > 0) {
        _localVelocity.z *= 0.3;
      }
      if (_localVelocity.y < 0) {
        _localVelocity.y = 0;
      }
    } else {
      _localVelocity.x = THREE.MathUtils.lerp(
        _localVelocity.x,
        0,
        Math.min(SIDE_SLIP_DAMPING * 0.5 * dt, 1.0),
      );
    }

    this.state.velocity.copy(_localVelocity.applyQuaternion(this.state.quaternion));
  }

  private integrate(dt: number): void {
    _deltaPosition.copy(this.state.velocity).multiplyScalar(dt);
    this.state.position.add(_deltaPosition);
  }

  private enforceGroundCollision(): void {
    const minHeight = this.state.groundHeight + GROUND_CLEARANCE;
    if (this.state.position.y <= minHeight) {
      this.state.position.y = minHeight;
      if (this.state.velocity.y < 0) {
        this.state.velocity.y = 0;
      }
    }
  }

  private updateFlightState(): void {
    const heightAboveGround = this.state.position.y - (this.state.groundHeight + GROUND_CLEARANCE);
    const airspeed = this.getAirspeed();
    if (heightAboveGround <= LIFTOFF_HEIGHT && this.state.velocity.y <= 0.5) {
      this.state.flightState = 'grounded';
      return;
    }

    this.state.flightState = airspeed < this.cfg.stallSpeed * STALL_WARNING_FACTOR
      ? 'stalled'
      : 'airborne';
  }

  private enforceWorldBoundary(): void {
    const limit = this.worldHalfExtent;
    const pos = this.state.position;
    const vel = this.state.velocity;

    if (pos.x > limit) {
      pos.x = limit;
      vel.x = -Math.abs(vel.x) * 0.5;
    } else if (pos.x < -limit) {
      pos.x = -limit;
      vel.x = Math.abs(vel.x) * 0.5;
    }

    if (pos.z > limit) {
      pos.z = limit;
      vel.z = -Math.abs(vel.z) * 0.5;
    } else if (pos.z < -limit) {
      pos.z = -limit;
      vel.z = Math.abs(vel.z) * 0.5;
    }
  }

  private getForwardAirspeed(): number {
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion).normalize();
    return Math.max(0, this.state.velocity.dot(_forward));
  }

  private isGroundedWithinTolerance(): boolean {
    return this.state.position.y <= (this.state.groundHeight + GROUND_CLEARANCE + LIFTOFF_HEIGHT);
  }
}
