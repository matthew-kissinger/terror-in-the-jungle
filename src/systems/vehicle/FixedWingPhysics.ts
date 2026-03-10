import * as THREE from 'three';
import type { FixedWingPhysicsConfig } from './FixedWingConfigs';

const _gravity = new THREE.Vector3();
const _liftVec = new THREE.Vector3();
const _thrustVec = new THREE.Vector3();
const _dragVec = new THREE.Vector3();
const _deltaPosition = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _forward = new THREE.Vector3();

const AIR_DENSITY = 1.225; // kg/m^3 at sea level
const GRAVITY = 9.81;
const GROUND_FRICTION = 0.3;
const ROTATION_SPEED_FRACTION = 0.8; // fraction of stall speed for takeoff rotation

type FixedWingState = 'grounded' | 'airborne' | 'stalled';

interface FixedWingControls {
  throttle: number; // 0-1
  pitch: number; // -1 to 1 (pull up positive)
  roll: number; // -1 to 1 (right positive)
  yaw: number; // -1 to 1 (right positive)
}

interface FixedWingInternalState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  groundHeight: number;
  flightState: FixedWingState;
}

export class FixedWingPhysics {
  private state: FixedWingInternalState;
  private controls: FixedWingControls;
  private smoothedControls: FixedWingControls;
  private readonly cfg: FixedWingPhysicsConfig;
  private worldHalfExtent = 0;

  constructor(initialPosition: THREE.Vector3, config: FixedWingPhysicsConfig) {
    this.cfg = config;
    this.state = {
      position: initialPosition.clone(),
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      groundHeight: initialPosition.y,
      flightState: 'grounded',
    };
    this.controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.smoothedControls = { ...this.controls };
  }

  update(dt: number, terrainHeight: number): void {
    this.state.groundHeight = terrainHeight;
    this.smoothControlInputs(dt);
    this.updateFlightState();
    this.calculateForces(dt);
    this.applyRotation(dt);
    this.integrate(dt);
    this.enforceGroundCollision();
    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }
  }

  setControls(controls: Partial<FixedWingControls>): void {
    Object.assign(this.controls, controls);
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
  }

  // -- Getters --

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

  // -- Internal physics --

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

  private updateFlightState(): void {
    const heightAboveGround = this.state.position.y - this.state.groundHeight;
    if (heightAboveGround <= 1.0) {
      this.state.flightState = 'grounded';
      return;
    }
    const airspeed = this.getAirspeed();
    this.state.flightState = airspeed < this.cfg.stallSpeed ? 'stalled' : 'airborne';
  }

  private calculateForces(dt: number): void {
    const { mass, maxThrust, wingArea, liftCoefficient, dragCoefficient, maxSpeed } = this.cfg;
    const airspeed = this.getAirspeed();

    // Gravity
    _gravity.set(0, -GRAVITY * mass, 0);

    // Thrust along forward vector
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);
    const thrust = this.smoothedControls.throttle * maxThrust;
    _thrustVec.copy(_forward).multiplyScalar(thrust);

    // Lift: perpendicular to velocity (simplified: up component based on airspeed)
    // L = 0.5 * rho * v^2 * S * Cl
    let liftMagnitude = 0;
    if (
      this.state.flightState !== 'grounded' ||
      airspeed > this.cfg.stallSpeed * ROTATION_SPEED_FRACTION
    ) {
      liftMagnitude = 0.5 * AIR_DENSITY * airspeed * airspeed * wingArea * liftCoefficient;
    }
    // Lift acts perpendicular to forward direction, in the aircraft's local up
    _liftVec
      .set(0, 1, 0)
      .applyQuaternion(this.state.quaternion)
      .multiplyScalar(liftMagnitude);

    // Drag: opposes velocity
    // D = 0.5 * rho * v^2 * S * Cd
    const dragMagnitude = 0.5 * AIR_DENSITY * airspeed * airspeed * wingArea * dragCoefficient;
    if (airspeed > 0.01) {
      _dragVec.copy(this.state.velocity).normalize().multiplyScalar(-dragMagnitude);
    } else {
      _dragVec.set(0, 0, 0);
    }

    // Ground friction when grounded
    if (this.state.flightState === 'grounded') {
      const hSpeed = Math.sqrt(this.state.velocity.x ** 2 + this.state.velocity.z ** 2);
      if (hSpeed > 0.1) {
        const frictionForce = GROUND_FRICTION * mass * GRAVITY;
        const frictionScale = Math.min(frictionForce / (hSpeed * mass / dt), 1.0);
        this.state.velocity.x *= 1 - frictionScale * dt;
        this.state.velocity.z *= 1 - frictionScale * dt;
      }
    }

    // Sum forces and integrate velocity
    const accelX = (_gravity.x + _thrustVec.x + _liftVec.x + _dragVec.x) / mass;
    const accelY = (_gravity.y + _thrustVec.y + _liftVec.y + _dragVec.y) / mass;
    const accelZ = (_gravity.z + _thrustVec.z + _liftVec.z + _dragVec.z) / mass;

    this.state.velocity.x += accelX * dt;
    this.state.velocity.y += accelY * dt;
    this.state.velocity.z += accelZ * dt;

    // Speed cap
    const speed = this.state.velocity.length();
    if (speed > maxSpeed) {
      this.state.velocity.multiplyScalar(maxSpeed / speed);
    }
  }

  private applyRotation(dt: number): void {
    const { rollRate, pitchRate, yawRate } = this.cfg;
    const airspeed = this.getAirspeed();

    // Reduce control authority at low speeds (below stall)
    const authorityFactor =
      this.state.flightState === 'grounded'
        ? Math.min(airspeed / this.cfg.stallSpeed, 1.0)
        : this.state.flightState === 'stalled'
          ? 0.3
          : 1.0;

    // Roll
    const rollDelta = this.smoothedControls.roll * rollRate * authorityFactor * dt;
    if (Math.abs(rollDelta) > 0.0001) {
      _axis
        .set(0, 0, -1)
        .applyQuaternion(this.state.quaternion)
        .normalize();
      _deltaQ.setFromAxisAngle(_axis, rollDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    // Pitch
    const pitchDelta = this.smoothedControls.pitch * pitchRate * authorityFactor * dt;
    if (Math.abs(pitchDelta) > 0.0001) {
      _axis
        .set(1, 0, 0)
        .applyQuaternion(this.state.quaternion)
        .normalize();
      _deltaQ.setFromAxisAngle(_axis, pitchDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    // Yaw (rudder)
    const yawDelta = this.smoothedControls.yaw * yawRate * authorityFactor * dt;
    if (Math.abs(yawDelta) > 0.0001) {
      _axis.set(0, 1, 0);
      _deltaQ.setFromAxisAngle(_axis, yawDelta);
      this.state.quaternion.premultiply(_deltaQ).normalize();
    }

    // Bank-and-pull: roll causes a turn (redirects lift into horizontal)
    if (this.state.flightState === 'airborne') {
      _euler.setFromQuaternion(this.state.quaternion, 'ZYX');
      const bankAngle = _euler.z;
      // Turn rate proportional to bank angle and lift
      const bankTurnRate =
        (Math.sin(bankAngle) * GRAVITY) / Math.max(airspeed, this.cfg.stallSpeed);
      if (Math.abs(bankTurnRate) > 0.001) {
        _deltaQ.setFromAxisAngle(_axis.set(0, 1, 0), -bankTurnRate * dt);
        this.state.quaternion.premultiply(_deltaQ).normalize();
      }
    }
  }

  private integrate(dt: number): void {
    _deltaPosition.copy(this.state.velocity).multiplyScalar(dt);
    this.state.position.add(_deltaPosition);
  }

  private enforceGroundCollision(): void {
    const minHeight = this.state.groundHeight + 0.5;
    if (this.state.position.y <= minHeight) {
      this.state.position.y = minHeight;
      if (this.state.velocity.y < 0) {
        this.state.velocity.y = 0;
      }
    }
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

  resetToGround(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.quaternion.identity();
    this.state.flightState = 'grounded';
    this.controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.smoothedControls = { ...this.controls };
  }
}
