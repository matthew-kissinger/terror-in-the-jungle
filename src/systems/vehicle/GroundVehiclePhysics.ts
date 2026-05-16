import * as THREE from 'three';
import { FixedStepRunner } from '../../utils/FixedStepRunner';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

/**
 * Hand-rolled ground-vehicle physics — fixed-step rigid-body sim mirroring
 * HelicopterPhysics, sized for the M151 jeep MVP per
 * docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md.
 *
 * Forces: drive, rolling drag, air drag, brake, gravity. Steering: Ackermann
 * yaw rate with speed-sensitive authority. Ground constraint: four wheel
 * samples conformed to ITerrainRuntime height; body pitch + roll slaved to
 * the terrain normal at the chassis center.
 *
 * No external physics library; all integration is explicit Euler with
 * exponential damping (mirrors HelicopterPhysics). The terrain interface
 * is consumed read-only — no fence change.
 */

// ---------- Module-scope scratch vectors / quaternions ----------
const _gravity = new THREE.Vector3();
const _drive = new THREE.Vector3();
const _drag = new THREE.Vector3();
const _brake = new THREE.Vector3();
const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _yawAxis = new THREE.Vector3(0, 1, 0);
const _yawQuat = new THREE.Quaternion();
const _conformQuat = new THREE.Quaternion();
const _wheelLocal = new THREE.Vector3();
const _wheelWorld = new THREE.Vector3();
const _euler = new THREE.Euler();

const ENGINE_IDLE_RPM = 0.18;
const WHEEL_COUNT = 4;
const WHEEL_LABELS = ['FL', 'FR', 'RL', 'RR'] as const;

export interface GroundVehicleControls {
  /** Bidirectional throttle; -1 reverse, 0 idle, +1 forward. */
  throttle: number;
  /** Steering angle in radians at the front axle (clamped to maxSteer). */
  steerAngle: number;
  /** [0, 1] brake pedal magnitude. */
  brake: number;
  /** Rear-axle longitudinal lock when true. */
  handbrake: boolean;
}

export interface GroundVehiclePhysicsConfig {
  mass: number;            // kg
  wheelbase: number;       // m, axle-to-axle distance
  trackWidth: number;      // m, left-right wheel separation
  axleOffset: number;      // m, chassis-origin Y above ground contact
  engineTorque: number;    // N*m at reference RPM (single-gear MVP)
  gearRatio: number;       // dimensionless
  wheelRadius: number;     // m
  maxSteer: number;        // rad
  maxBrake: number;        // N peak braking force
  maxClimbSlope: number;   // rad, slope above which drive force fades to 0
  rollingCoef: number;     // linear rolling drag coefficient (N per m/s)
  airDragCoef: number;     // quadratic air drag (N per (m/s)^2)
  velocityDamping: number; // exponential damping base, e.g. 0.96
  angularDamping: number;  // exponential damping base, e.g. 0.85
  inputSmoothRate: number; // 1/s, per-second lerp rate toward raw input
  engineSpoolRate: number; // 1/s, engine RPM convergence rate
  /** Low-speed full-authority cutoff (m/s). Steering authority = 1 below this. */
  steerLowSpeedCutoff: number;
  /** High-speed cutoff (m/s). Steering authority floored at 0.3 above this. */
  steerHighSpeedCutoff: number;
}

export interface WheelSample {
  /** World-space position of the wheel contact patch query. */
  position: THREE.Vector3;
  /** Sampled terrain height at the wheel position. */
  terrainHeight: number;
  /** Whether the sample fell inside the playable terrain extent. */
  inBounds: boolean;
}

interface GroundVehicleState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  engineRPM: number;
  isGrounded: boolean;
  groundHeight: number;
  wheelSamples: WheelSample[];
}

const DEFAULT_PHYSICS: GroundVehiclePhysicsConfig = {
  mass: 1120,
  wheelbase: 2.06,
  trackWidth: 1.42,
  axleOffset: 0.45,
  engineTorque: 240,
  gearRatio: 4.0,
  wheelRadius: 0.39,
  maxSteer: 0.6,
  maxBrake: 18000,
  maxClimbSlope: 0.54,
  rollingCoef: 60,
  airDragCoef: 1.6,
  velocityDamping: 0.96,
  angularDamping: 0.85,
  inputSmoothRate: 8.0,
  engineSpoolRate: 2.0,
  steerLowSpeedCutoff: 5,
  steerHighSpeedCutoff: 25,
};

export class GroundVehiclePhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;
  private readonly GRAVITY = -9.81;
  private readonly cfg: GroundVehiclePhysicsConfig;
  private readonly stepper = new FixedStepRunner(GroundVehiclePhysics.FIXED_STEP_SECONDS);

  private state: GroundVehicleState;
  private previousState: GroundVehicleState;
  private controls: GroundVehicleControls;
  private smoothedControls: GroundVehicleControls;
  private engineActive = false;
  private worldHalfExtent = 0;

  constructor(initialPosition: THREE.Vector3, config?: Partial<GroundVehiclePhysicsConfig>) {
    this.cfg = { ...DEFAULT_PHYSICS, ...(config ?? {}) };

    this.state = this.makeBlankState(initialPosition);
    this.previousState = this.makeBlankState(initialPosition);

    this.controls = {
      throttle: 0,
      steerAngle: 0,
      brake: 0,
      handbrake: false,
    };
    this.smoothedControls = { ...this.controls };
  }

  private makeBlankState(initialPosition: THREE.Vector3): GroundVehicleState {
    const samples: WheelSample[] = [];
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      samples.push({
        position: new THREE.Vector3(),
        terrainHeight: initialPosition.y - this.cfg.axleOffset,
        inBounds: true,
      });
    }
    return {
      position: initialPosition.clone(),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      engineRPM: 0,
      isGrounded: true,
      groundHeight: initialPosition.y - this.cfg.axleOffset,
      wheelSamples: samples,
    };
  }

  // ---------- Public surface ----------

  update(deltaTime: number, terrain: ITerrainRuntime | null): void {
    this.stepper.step(deltaTime, (fixedDt) => {
      this.snapshotPrevious();
      this.simulateStep(fixedDt, terrain);
    });
  }

  setControls(controls: Partial<GroundVehicleControls>): void {
    if (controls.throttle !== undefined) {
      this.controls.throttle = THREE.MathUtils.clamp(controls.throttle, -1, 1);
    }
    if (controls.steerAngle !== undefined) {
      const max = this.cfg.maxSteer;
      this.controls.steerAngle = THREE.MathUtils.clamp(controls.steerAngle, -max, max);
    }
    if (controls.brake !== undefined) {
      this.controls.brake = THREE.MathUtils.clamp(controls.brake, 0, 1);
    }
    if (controls.handbrake !== undefined) {
      this.controls.handbrake = controls.handbrake;
    }
  }

  setEngineActive(active: boolean): void {
    this.engineActive = active;
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
  }

  getState(): Readonly<GroundVehicleState> {
    return this.state;
  }

  getInterpolatedState(): GroundVehicleState {
    const alpha = this.stepper.getInterpolationAlpha();
    const samples: WheelSample[] = [];
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      const prev = this.previousState.wheelSamples[i];
      const cur = this.state.wheelSamples[i];
      samples.push({
        position: prev.position.clone().lerp(cur.position, alpha),
        terrainHeight: THREE.MathUtils.lerp(prev.terrainHeight, cur.terrainHeight, alpha),
        inBounds: alpha < 1 ? prev.inBounds : cur.inBounds,
      });
    }
    return {
      position: this.previousState.position.clone().lerp(this.state.position, alpha),
      quaternion: this.previousState.quaternion.clone().slerp(this.state.quaternion, alpha),
      velocity: this.previousState.velocity.clone().lerp(this.state.velocity, alpha),
      angularVelocity: this.previousState.angularVelocity.clone().lerp(this.state.angularVelocity, alpha),
      engineRPM: THREE.MathUtils.lerp(this.previousState.engineRPM, this.state.engineRPM, alpha),
      isGrounded: alpha < 1 ? this.previousState.isGrounded : this.state.isGrounded,
      groundHeight: THREE.MathUtils.lerp(this.previousState.groundHeight, this.state.groundHeight, alpha),
      wheelSamples: samples,
    };
  }

  getControls(): Readonly<GroundVehicleControls> {
    return this.controls;
  }

  resetToStable(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.angularVelocity.set(0, 0, 0);
    this.state.quaternion.identity();
    this.state.engineRPM = 0;
    this.state.isGrounded = true;
    this.state.groundHeight = position.y - this.cfg.axleOffset;
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      this.state.wheelSamples[i].position.copy(position);
      this.state.wheelSamples[i].terrainHeight = position.y - this.cfg.axleOffset;
      this.state.wheelSamples[i].inBounds = true;
    }
    this.engineActive = false;

    this.controls.throttle = 0;
    this.controls.steerAngle = 0;
    this.controls.brake = 0;
    this.controls.handbrake = false;
    this.smoothedControls = { ...this.controls };

    this.snapshotPrevious();
    this.stepper.reset();
  }

  getGroundSpeed(): number {
    const vx = this.state.velocity.x;
    const vz = this.state.velocity.z;
    return Math.sqrt(vx * vx + vz * vz);
  }

  /** Forward-aligned signed speed (negative = reversing). */
  getForwardSpeed(): number {
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);
    return this.state.velocity.dot(_forward);
  }

  getHeading(): number {
    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    let degrees = THREE.MathUtils.radToDeg(_euler.y);
    degrees = ((degrees % 360) + 360) % 360;
    return degrees;
  }

  getEngineAudioParams(): { rpm: number; load: number } {
    const speed = this.getGroundSpeed();
    const speedLoad = Math.min(1, speed / 25);
    const throttleLoad = Math.abs(this.smoothedControls.throttle);
    return {
      rpm: this.state.engineRPM,
      load: Math.min(1, 0.6 * throttleLoad + 0.4 * speedLoad),
    };
  }

  // ---------- Step ----------

  private snapshotPrevious(): void {
    this.previousState.position.copy(this.state.position);
    this.previousState.quaternion.copy(this.state.quaternion);
    this.previousState.velocity.copy(this.state.velocity);
    this.previousState.angularVelocity.copy(this.state.angularVelocity);
    this.previousState.engineRPM = this.state.engineRPM;
    this.previousState.isGrounded = this.state.isGrounded;
    this.previousState.groundHeight = this.state.groundHeight;
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      const src = this.state.wheelSamples[i];
      const dst = this.previousState.wheelSamples[i];
      dst.position.copy(src.position);
      dst.terrainHeight = src.terrainHeight;
      dst.inBounds = src.inBounds;
    }
  }

  private simulateStep(deltaTime: number, terrain: ITerrainRuntime | null): void {
    this.smoothControlInputs(deltaTime);
    this.updateEngine(deltaTime);

    // Sample terrain under each wheel + at the chassis center (for normal/slope).
    const sampledNormal = this.sampleTerrain(terrain);

    // Forces in world space; integrate linear velocity (explicit Euler).
    this.integrateLinear(deltaTime, terrain, sampledNormal);

    // Ackermann yaw kinematics; integrate orientation about world Y.
    this.integrateYaw(deltaTime);

    // Damping for stability (mirrors HelicopterPhysics).
    this.applyDamping(deltaTime);

    // Conform body to terrain (Y snap + pitch/roll from normal).
    this.conformToGround(sampledNormal);

    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }
  }

  // ---------- Input smoothing ----------

  private smoothControlInputs(deltaTime: number): void {
    const rate = Math.min(this.cfg.inputSmoothRate * deltaTime, 1.0);
    this.smoothedControls.throttle = THREE.MathUtils.lerp(
      this.smoothedControls.throttle,
      this.controls.throttle,
      rate,
    );
    this.smoothedControls.steerAngle = THREE.MathUtils.lerp(
      this.smoothedControls.steerAngle,
      this.controls.steerAngle,
      rate,
    );
    this.smoothedControls.brake = THREE.MathUtils.lerp(
      this.smoothedControls.brake,
      this.controls.brake,
      rate,
    );
    this.smoothedControls.handbrake = this.controls.handbrake;
  }

  // ---------- Engine RPM (cosmetic) ----------

  private updateEngine(deltaTime: number): void {
    const throttleMag = Math.abs(this.smoothedControls.throttle);
    const targetRPM = this.engineActive ? Math.max(ENGINE_IDLE_RPM, throttleMag) : 0;
    const rate = Math.min(this.cfg.engineSpoolRate * deltaTime, 1.0);
    this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, rate);
    if (!this.engineActive && this.state.engineRPM < 0.01) {
      this.state.engineRPM = 0;
    }
  }

  // ---------- Terrain sampling ----------

  private sampleTerrain(terrain: ITerrainRuntime | null): THREE.Vector3 {
    // Wheel order: FL, FR, RL, RR. Front pair sits +halfWheelbase along forward.
    const halfWheelbase = this.cfg.wheelbase * 0.5;
    const halfTrack = this.cfg.trackWidth * 0.5;
    const offsets: [number, number][] = [
      [-halfTrack, +halfWheelbase], // FL: -x, +z (chassis-forward is +z in local frame)
      [+halfTrack, +halfWheelbase], // FR
      [-halfTrack, -halfWheelbase], // RL
      [+halfTrack, -halfWheelbase], // RR
    ];

    let avgHeight = 0;
    let groundedCount = 0;
    let inBoundsCount = 0;
    const cx = this.state.position.x;
    const cz = this.state.position.z;
    const halfWorld = terrain ? terrain.getPlayableWorldSize() * 0.5 : Number.POSITIVE_INFINITY;

    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      const [ox, oz] = offsets[i];
      _wheelLocal.set(ox, 0, oz);
      _wheelWorld.copy(_wheelLocal).applyQuaternion(this.state.quaternion).add(this.state.position);
      const sample = this.state.wheelSamples[i];
      sample.position.copy(_wheelWorld);

      const inBounds = terrain != null
        && Math.abs(_wheelWorld.x) <= halfWorld
        && Math.abs(_wheelWorld.z) <= halfWorld;
      sample.inBounds = inBounds;

      if (terrain && inBounds) {
        sample.terrainHeight = terrain.getHeightAt(_wheelWorld.x, _wheelWorld.z);
        avgHeight += sample.terrainHeight;
        inBoundsCount += 1;
        if (this.state.position.y - this.cfg.axleOffset <= sample.terrainHeight + 0.05) {
          groundedCount += 1;
        }
      }
    }

    if (inBoundsCount > 0) {
      avgHeight /= inBoundsCount;
      this.state.groundHeight = avgHeight;
      this.state.isGrounded = groundedCount > 0;
    } else {
      // Terrain not ready or sample outside playable extent — preserve prior pose.
      this.state.isGrounded = false;
    }

    // Chassis-center normal sample (drives pitch + roll conform).
    if (terrain) {
      const clampedX = THREE.MathUtils.clamp(cx, -halfWorld, halfWorld);
      const clampedZ = THREE.MathUtils.clamp(cz, -halfWorld, halfWorld);
      terrain.getNormalAt(clampedX, clampedZ, _normal);
      // Ensure non-degenerate; fall back to world up.
      if (_normal.lengthSq() < 1e-6) _normal.copy(_worldUp);
      else _normal.normalize();
    } else {
      _normal.copy(_worldUp);
    }
    return _normal;
  }

  // ---------- Linear integration ----------

  private integrateLinear(
    deltaTime: number,
    terrain: ITerrainRuntime | null,
    normal: THREE.Vector3,
  ): void {
    const { mass, engineTorque, gearRatio, wheelRadius, rollingCoef, airDragCoef,
            maxBrake, maxClimbSlope } = this.cfg;

    // Chassis-forward in world frame (model convention: local -Z forward).
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);

    // Slope-stall scaling: drive force fades to zero at maxClimbSlope.
    let slopeFactor = 1;
    if (terrain && this.state.isGrounded) {
      const slope = terrain.getSlopeAt(this.state.position.x, this.state.position.z);
      if (slope > 0 && maxClimbSlope > 0) {
        slopeFactor = THREE.MathUtils.clamp(1 - slope / maxClimbSlope, 0, 1);
      }
    }

    // Drive force: torque -> linear force via gear and wheel radius.
    const driveMag = this.engineActive && this.state.isGrounded
      ? this.smoothedControls.throttle * (engineTorque * gearRatio / wheelRadius) * slopeFactor
      : 0;
    _drive.copy(_forward).multiplyScalar(driveMag);

    // Velocity-aligned drag (rolling linear + air quadratic).
    const speed = this.state.velocity.length();
    if (speed > 1e-4) {
      const dragMag = -(rollingCoef * speed + airDragCoef * speed * speed);
      _drag.copy(this.state.velocity).multiplyScalar(dragMag / speed);
    } else {
      _drag.set(0, 0, 0);
    }

    // Brake: opposes current velocity, clamped so it cannot reverse direction
    // within a single step (clamped to current velocity).
    _brake.set(0, 0, 0);
    const brakeMag = this.smoothedControls.brake * maxBrake;
    if (brakeMag > 0 && speed > 1e-4) {
      // Force needed to fully stop within this step:
      const stopForce = (mass * speed) / Math.max(deltaTime, 1e-4);
      const effective = Math.min(brakeMag, stopForce);
      _brake.copy(this.state.velocity).multiplyScalar(-effective / speed);
    }
    // Handbrake: rear-axle longitudinal lock — modeled here as an extra brake
    // term scaled to half mass (rear axle weight share). v1 keeps it simple.
    if (this.smoothedControls.handbrake && speed > 1e-4) {
      const hbStop = (mass * 0.5 * speed) / Math.max(deltaTime, 1e-4);
      const hbForce = Math.min(maxBrake, hbStop);
      _brake.x -= (this.state.velocity.x / speed) * hbForce;
      _brake.z -= (this.state.velocity.z / speed) * hbForce;
    }

    // Gravity (full when airborne; slope-component while grounded so a vehicle
    // on a hill below maxClimbSlope still slides backward at zero throttle).
    if (this.state.isGrounded) {
      // Project gravity along the surface tangent (g - (g . n) n).
      const gDotN = this.GRAVITY * normal.y; // gravity = (0, GRAVITY, 0)
      _gravity.set(
        -gDotN * normal.x,
        this.GRAVITY - gDotN * normal.y,
        -gDotN * normal.z,
      ).multiplyScalar(mass);
    } else {
      _gravity.set(0, this.GRAVITY * mass, 0);
    }

    // Accumulate: F_total = drive + drag + brake + gravity.
    _force.copy(_drive).add(_drag).add(_brake).add(_gravity);

    // a = F / m; v += a * dt.
    _accel.copy(_force).divideScalar(mass);
    this.state.velocity.addScaledVector(_accel, deltaTime);

    // Integrate position from velocity.
    this.state.position.addScaledVector(this.state.velocity, deltaTime);
  }

  // ---------- Ackermann yaw ----------

  private integrateYaw(deltaTime: number): void {
    const fwdSpeed = this.getForwardSpeed();
    const speedMag = Math.abs(fwdSpeed);

    // Steering authority taper above lowSpeedCutoff.
    const low = this.cfg.steerLowSpeedCutoff;
    const high = this.cfg.steerHighSpeedCutoff;
    let authority = 1;
    if (high > low && speedMag > low) {
      authority = THREE.MathUtils.clamp(1 - (speedMag - low) / (high - low), 0.3, 1);
    }

    const steer = this.smoothedControls.steerAngle * authority;
    let omegaY = 0;
    if (this.cfg.wheelbase > 0 && Math.abs(fwdSpeed) > 1e-3) {
      omegaY = (fwdSpeed / this.cfg.wheelbase) * Math.tan(steer);
    }
    this.state.angularVelocity.x = 0;
    this.state.angularVelocity.y = omegaY;
    this.state.angularVelocity.z = 0;

    if (Math.abs(omegaY) > 1e-5) {
      const angle = omegaY * deltaTime;
      _yawQuat.setFromAxisAngle(_yawAxis, angle);
      // Yaw applied in world frame about world Y.
      this.state.quaternion.premultiply(_yawQuat).normalize();
    }
  }

  // ---------- Damping ----------

  private applyDamping(deltaTime: number): void {
    this.state.velocity.multiplyScalar(Math.pow(this.cfg.velocityDamping, deltaTime));
    this.state.angularVelocity.multiplyScalar(Math.pow(this.cfg.angularDamping, deltaTime));
  }

  // ---------- Ground conform (Y clamp + pitch/roll from normal) ----------

  private conformToGround(normal: THREE.Vector3): void {
    if (!this.state.isGrounded) return;

    // Y snap to averaged wheel ground height + axle offset. The per-wheel
    // height check in sampleTerrain already populated wheelSamples; we use
    // the running average stored in state.groundHeight.
    const targetY = this.state.groundHeight + this.cfg.axleOffset;
    this.state.position.y = targetY;
    // Kill vertical velocity that would push into the surface.
    if (this.state.velocity.y < 0) this.state.velocity.y = 0;

    // Compose conform: yaw kept (from world-Y rotation), pitch+roll set
    // to align local Y with terrain normal.
    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    const yaw = _euler.y;
    _yawQuat.setFromAxisAngle(_yawAxis, yaw);
    _conformQuat.setFromUnitVectors(_worldUp, normal);
    this.state.quaternion.multiplyQuaternions(_conformQuat, _yawQuat).normalize();
  }

  // ---------- World boundary ----------

  private enforceWorldBoundary(): void {
    const limit = this.worldHalfExtent;
    const pos = this.state.position;
    const vel = this.state.velocity;
    if (pos.x > limit) { pos.x = limit; vel.x = -Math.abs(vel.x) * 0.3; }
    else if (pos.x < -limit) { pos.x = -limit; vel.x = Math.abs(vel.x) * 0.3; }
    if (pos.z > limit) { pos.z = limit; vel.z = -Math.abs(vel.z) * 0.3; }
    else if (pos.z < -limit) { pos.z = -limit; vel.z = Math.abs(vel.z) * 0.3; }
  }
}

// Exported for use by tests / adapters that want the canonical wheel order.
export { WHEEL_LABELS };
