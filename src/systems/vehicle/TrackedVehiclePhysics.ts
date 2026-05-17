import * as THREE from 'three';
import { FixedStepRunner } from '../../utils/FixedStepRunner';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

/**
 * Hand-rolled tracked-vehicle physics — fixed-step rigid-body sim sized for the
 * M48 tank slice per docs/rearch/TANK_SYSTEMS_2026-05-13.md.
 *
 * Sibling (not subclass) of GroundVehiclePhysics. Reuses the fixed-1/60 s
 * integration loop shape from the wheeled chassis, substituting Ackermann with
 * skid-steer: independent leftTrackSpeed / rightTrackSpeed combine into
 * chassis-frame forward velocity + yaw rate via standard differential-drive
 * kinematics (memo §"Locomotion: skid-steer"):
 *
 *   v_forward = (leftTrackSpeed + rightTrackSpeed) * 0.5 * maxTrackSpeed
 *   omega_y   = (rightTrackSpeed - leftTrackSpeed) * maxTrackSpeed
 *                / trackSeparation
 *
 * Ground constraint samples four chassis corners (front-left, front-right,
 * rear-left, rear-right) against the fenced ITerrainRuntime height field, with
 * one center-normal sample driving pitch + roll conform. ITerrainRuntime is
 * consumed read-only — no fence change.
 *
 * The tracks-blown state pins per-track speeds to zero (driver throttle/turn
 * input is accepted but produces no chassis motion); chassis tilt and terrain
 * conform remain functional so the turret can still slew and fire (turret
 * rig lives in a separate file, cycle #9). Slope-stall scales the per-track
 * forward force by (1 - slope / maxClimbSlope), matching the GroundVehicle
 * pattern (and going to zero at the climb-slope limit).
 *
 * No external physics library: explicit Euler integration with exponential
 * damping, no broadphase, no constraint solver.
 */

// ---------- Module-scope scratch vectors / quaternions ----------
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _yawAxis = new THREE.Vector3(0, 1, 0);
const _yawQuat = new THREE.Quaternion();
const _conformQuat = new THREE.Quaternion();
const _cornerLocal = new THREE.Vector3();
const _cornerWorld = new THREE.Vector3();
const _euler = new THREE.Euler();
const _gravityVec = new THREE.Vector3();

const CORNER_COUNT = 4;
const CORNER_LABELS = ['FL', 'FR', 'RL', 'RR'] as const;

export interface TrackedVehicleControls {
  /** Forward/back throttle axis: W - S, range [-1, +1]. */
  throttleAxis: number;
  /** Turn axis: D - A (right positive), range [-1, +1]. */
  turnAxis: number;
  /** Brake pedal magnitude, range [0, 1]. */
  brake: number;
}

export interface TrackedVehiclePhysicsConfig {
  /** Chassis mass (kg). M48 ~ 46000. */
  mass: number;
  /** Lateral distance between track centerlines (m). M48 ~ 2.92, T-55 ~ 2.64. */
  trackSeparation: number;
  /** Hull length used for corner sampling (m). M48 ~ 6.4. */
  hullLength: number;
  /** Chassis-origin Y above ground contact (m). */
  axleOffset: number;
  /** Per-track ground speed at full-deflection input (m/s). M48 ~ 12 m/s on road. */
  maxTrackSpeed: number;
  /** Peak braking force (N). */
  maxBrake: number;
  /** Maximum climbable slope before drive force fades to zero (rad). Tank ~ 0.61. */
  maxClimbSlope: number;
  /** Linear rolling drag coefficient (N per m/s). */
  rollingCoef: number;
  /** Quadratic air drag (N per (m/s)^2). Negligible for tanks but kept for parity. */
  airDragCoef: number;
  /** Exponential damping base for linear velocity (per second). */
  velocityDamping: number;
  /** Exponential damping base for angular velocity (per second). */
  angularDamping: number;
  /** Per-second lerp rate from raw track command toward smoothed track speed. */
  inputSmoothRate: number;
}

export interface CornerSample {
  /** World-space position of the chassis-corner sample. */
  position: THREE.Vector3;
  /** Sampled terrain height at the corner. */
  terrainHeight: number;
  /** Whether the sample fell inside the playable terrain extent. */
  inBounds: boolean;
}

export interface TrackedVehicleStateSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
  isGrounded: boolean;
  tracksBlown: boolean;
  engineKilled: boolean;
}

interface InternalState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  /** Smoothed normalized track speed (range [-1, +1]; scaled by maxTrackSpeed at use). */
  leftTrackSpeed: number;
  rightTrackSpeed: number;
  isGrounded: boolean;
  groundHeight: number;
  tracksBlown: boolean;
  engineKilled: boolean;
  cornerSamples: CornerSample[];
}

const DEFAULT_PHYSICS: TrackedVehiclePhysicsConfig = {
  mass: 46000,
  trackSeparation: 2.92,
  hullLength: 6.4,
  axleOffset: 0.55,
  maxTrackSpeed: 12,
  maxBrake: 240000,
  maxClimbSlope: 0.61,
  rollingCoef: 1800,
  airDragCoef: 8,
  velocityDamping: 0.85,
  angularDamping: 0.75,
  inputSmoothRate: 4.0,
};

const SPEED_EPS = 1e-4;

export class TrackedVehiclePhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;
  private readonly GRAVITY = -9.81;
  private readonly cfg: TrackedVehiclePhysicsConfig;
  private readonly stepper = new FixedStepRunner(TrackedVehiclePhysics.FIXED_STEP_SECONDS);

  private state: InternalState;
  private rawControls: TrackedVehicleControls;
  private worldHalfExtent = 0;

  constructor(initialPosition: THREE.Vector3, config?: Partial<TrackedVehiclePhysicsConfig>) {
    this.cfg = { ...DEFAULT_PHYSICS, ...(config ?? {}) };
    this.state = this.makeBlankState(initialPosition);
    this.rawControls = { throttleAxis: 0, turnAxis: 0, brake: 0 };
  }

  private makeBlankState(initialPosition: THREE.Vector3): InternalState {
    const corners: CornerSample[] = [];
    const grounded = initialPosition.y - this.cfg.axleOffset;
    for (let i = 0; i < CORNER_COUNT; i += 1) {
      corners.push({
        position: new THREE.Vector3(),
        terrainHeight: grounded,
        inBounds: true,
      });
    }
    return {
      position: initialPosition.clone(),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      leftTrackSpeed: 0,
      rightTrackSpeed: 0,
      isGrounded: true,
      groundHeight: grounded,
      tracksBlown: false,
      engineKilled: false,
      cornerSamples: corners,
    };
  }

  // ---------- Public surface ----------

  update(deltaTime: number, terrain: ITerrainRuntime | null): void {
    this.stepper.step(deltaTime, (fixedDt) => {
      this.simulateStep(fixedDt, terrain);
    });
  }

  setControls(throttleAxis: number, turnAxis: number, brake: boolean): void {
    // Engine-killed clamps throttle to 0 (no forward/reverse). Turn input
    // is still recorded so the visual continuity story (skid-steer pivot
    // from inertia) is preserved when only the engine is dead — but
    // because forward velocity is integrated through the same per-track
    // drive signal, killing throttle effectively kills locomotion. See
    // `tank-damage-states` brief §"engine-killed".
    const throttle = this.state.engineKilled
      ? 0
      : THREE.MathUtils.clamp(throttleAxis, -1, 1);
    this.rawControls.throttleAxis = throttle;
    this.rawControls.turnAxis = THREE.MathUtils.clamp(turnAxis, -1, 1);
    this.rawControls.brake = brake ? 1 : 0;
  }

  getState(): TrackedVehicleStateSnapshot {
    // Returns shared, live state references — callers should treat as read-only.
    return {
      position: this.state.position,
      velocity: this.state.velocity,
      angularVelocity: this.state.angularVelocity,
      quaternion: this.state.quaternion,
      leftTrackSpeed: this.state.leftTrackSpeed * this.cfg.maxTrackSpeed,
      rightTrackSpeed: this.state.rightTrackSpeed * this.cfg.maxTrackSpeed,
      isGrounded: this.state.isGrounded,
      tracksBlown: this.state.tracksBlown,
      engineKilled: this.state.engineKilled,
    };
  }

  setPosition(p: THREE.Vector3): void {
    this.state.position.copy(p);
    this.state.groundHeight = p.y - this.cfg.axleOffset;
    this.state.velocity.set(0, 0, 0);
    for (let i = 0; i < CORNER_COUNT; i += 1) {
      this.state.cornerSamples[i].position.copy(p);
      this.state.cornerSamples[i].terrainHeight = p.y - this.cfg.axleOffset;
      this.state.cornerSamples[i].inBounds = true;
    }
  }

  setQuaternion(q: THREE.Quaternion): void {
    this.state.quaternion.copy(q).normalize();
    this.state.angularVelocity.set(0, 0, 0);
  }

  setTracksBlown(blown: boolean): void {
    this.state.tracksBlown = blown;
    if (blown) {
      // Pin per-track smoothed speeds + forward velocity contribution.
      this.state.leftTrackSpeed = 0;
      this.state.rightTrackSpeed = 0;
      // Wipe horizontal velocity; let gravity / damping settle the chassis.
      this.state.velocity.x = 0;
      this.state.velocity.z = 0;
      this.state.angularVelocity.y = 0;
    }
  }

  isTracksBlown(): boolean {
    return this.state.tracksBlown;
  }

  /**
   * Damage-state hook (cycle-vekhikl-4-tank-turret-and-cannon R2,
   * `tank-damage-states`). When set, `setControls()` clamps throttle to
   * 0 — the chassis cannot drive forward or reverse. Turn input still
   * reaches the integrator (skid-steer pivot from inertia stays
   * possible if tracks are intact), but with no throttle the per-track
   * target speeds are themselves zero, so the practical effect is "no
   * motion." Existing momentum bleeds down through drag.
   *
   * Idempotent. Flipping back to `false` resumes normal throttle
   * acceptance on subsequent `setControls()` calls.
   */
  setEngineKilled(engineKilled: boolean): void {
    this.state.engineKilled = engineKilled;
    if (engineKilled) {
      // Re-apply the current control snapshot so the clamp takes effect
      // immediately instead of waiting on the next `setControls()` call.
      this.rawControls.throttleAxis = 0;
    }
  }

  isEngineKilled(): boolean {
    return this.state.engineKilled;
  }

  dispose(): void {
    // No managed external resources — module-scope scratch vectors are reused.
    this.rawControls.throttleAxis = 0;
    this.rawControls.turnAxis = 0;
    this.rawControls.brake = 0;
    this.state.velocity.set(0, 0, 0);
    this.state.angularVelocity.set(0, 0, 0);
    this.state.leftTrackSpeed = 0;
    this.state.rightTrackSpeed = 0;
  }

  // ---------- Optional helpers (no fence implications) ----------

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
  }

  getInterpolationAlpha(): number {
    return this.stepper.getInterpolationAlpha();
  }

  getCornerSamples(): readonly CornerSample[] {
    return this.state.cornerSamples;
  }

  getForwardSpeed(): number {
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);
    return this.state.velocity.dot(_forward);
  }

  getEngineAudioParams(): { rpm: number; load: number } {
    const fwd = Math.abs(this.getForwardSpeed());
    const speedLoad = Math.min(1, fwd / this.cfg.maxTrackSpeed);
    const throttleLoad = Math.abs(this.rawControls.throttleAxis);
    return {
      rpm: Math.max(0.18, Math.max(throttleLoad, speedLoad)),
      load: Math.min(1, 0.6 * throttleLoad + 0.4 * speedLoad),
    };
  }

  // ---------- Step ----------

  private simulateStep(deltaTime: number, terrain: ITerrainRuntime | null): void {
    this.smoothControlInputs(deltaTime);

    // Sample chassis-corner terrain heights + center normal.
    const sampledNormal = this.sampleTerrain(terrain);

    // Translate per-track speeds into chassis-frame velocity + yaw rate.
    this.integrateLocomotion(deltaTime, terrain, sampledNormal);

    // Damp to keep the chassis from accumulating noise.
    this.applyDamping(deltaTime);

    // Snap Y + conform pitch/roll to terrain.
    this.conformToGround(sampledNormal);

    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }
  }

  // ---------- Input smoothing (skid-steer command -> per-track speed) ----------

  private smoothControlInputs(deltaTime: number): void {
    // Skid-steer kinematics (memo §"Locomotion: skid-steer"):
    //   leftTrackCmd  = clamp(throttle - turn, -1, +1)
    //   rightTrackCmd = clamp(throttle + turn, -1, +1)
    const throttle = this.rawControls.throttleAxis;
    const turn = this.rawControls.turnAxis;
    const leftCmd = THREE.MathUtils.clamp(throttle - turn, -1, 1);
    const rightCmd = THREE.MathUtils.clamp(throttle + turn, -1, 1);

    // Tracks-blown pins both tracks to zero regardless of input.
    const leftTarget = this.state.tracksBlown ? 0 : leftCmd;
    const rightTarget = this.state.tracksBlown ? 0 : rightCmd;

    // Per-frame lerp toward target, capped at 1.0 so very large dt doesn't
    // overshoot the target. Mirrors HelicopterPhysics.smoothControlInputs.
    const rate = Math.min(this.cfg.inputSmoothRate * deltaTime, 1.0);
    this.state.leftTrackSpeed = THREE.MathUtils.lerp(
      this.state.leftTrackSpeed,
      leftTarget,
      rate,
    );
    this.state.rightTrackSpeed = THREE.MathUtils.lerp(
      this.state.rightTrackSpeed,
      rightTarget,
      rate,
    );
  }

  // ---------- Terrain sampling (four chassis corners + center normal) ----------

  private sampleTerrain(terrain: ITerrainRuntime | null): THREE.Vector3 {
    // Corner offsets in chassis-local frame (chassis-forward is -Z, right is +X).
    const halfLen = this.cfg.hullLength * 0.5;
    const halfSep = this.cfg.trackSeparation * 0.5;
    const offsets: [number, number][] = [
      [-halfSep, -halfLen], // FL: -x, -z (forward is -z)
      [+halfSep, -halfLen], // FR
      [-halfSep, +halfLen], // RL
      [+halfSep, +halfLen], // RR
    ];

    const cx = this.state.position.x;
    const cz = this.state.position.z;
    const halfWorld = terrain ? terrain.getPlayableWorldSize() * 0.5 : Number.POSITIVE_INFINITY;

    let avgHeight = 0;
    let inBoundsCount = 0;
    let groundedCount = 0;

    for (let i = 0; i < CORNER_COUNT; i += 1) {
      const [ox, oz] = offsets[i];
      _cornerLocal.set(ox, 0, oz);
      _cornerWorld.copy(_cornerLocal).applyQuaternion(this.state.quaternion).add(this.state.position);
      const sample = this.state.cornerSamples[i];
      sample.position.copy(_cornerWorld);

      const inBounds = terrain != null
        && Math.abs(_cornerWorld.x) <= halfWorld
        && Math.abs(_cornerWorld.z) <= halfWorld;
      sample.inBounds = inBounds;

      if (terrain && inBounds) {
        sample.terrainHeight = terrain.getHeightAt(_cornerWorld.x, _cornerWorld.z);
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
      // Terrain not ready or sample outside playable extent — preserve last pose.
      this.state.isGrounded = false;
    }

    // Chassis-center normal sample drives pitch + roll conform.
    if (terrain) {
      const clampedX = THREE.MathUtils.clamp(cx, -halfWorld, halfWorld);
      const clampedZ = THREE.MathUtils.clamp(cz, -halfWorld, halfWorld);
      terrain.getNormalAt(clampedX, clampedZ, _normal);
      if (_normal.lengthSq() < 1e-6) _normal.copy(_worldUp);
      else _normal.normalize();
    } else {
      _normal.copy(_worldUp);
    }
    return _normal;
  }

  // ---------- Locomotion: skid-steer differential drive ----------

  private integrateLocomotion(
    deltaTime: number,
    terrain: ITerrainRuntime | null,
    normal: THREE.Vector3,
  ): void {
    const {
      mass, trackSeparation, maxTrackSpeed, rollingCoef, airDragCoef,
      maxBrake, maxClimbSlope,
    } = this.cfg;

    // Chassis-forward in world frame (model convention: local -Z forward).
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);

    // Slope-stall scaling (same shape as GroundVehiclePhysics): drive
    // contribution fades to zero at maxClimbSlope.
    let slopeFactor = 1;
    if (terrain && this.state.isGrounded) {
      const slope = terrain.getSlopeAt(this.state.position.x, this.state.position.z);
      if (slope > 0 && maxClimbSlope > 0) {
        slopeFactor = THREE.MathUtils.clamp(1 - slope / maxClimbSlope, 0, 1);
      }
    }

    // Target chassis-frame velocity + yaw rate from differential-drive
    // kinematics. When tracks are blown, both speeds are 0 so v_target =
    // omega_target = 0.
    const lv = this.state.leftTrackSpeed * maxTrackSpeed;
    const rv = this.state.rightTrackSpeed * maxTrackSpeed;

    // v_forward target (m/s) from per-track speeds. Slope-stall scales the
    // drive component; rolling resistance + brake act on actual velocity.
    const vForwardTarget = (lv + rv) * 0.5 * (this.state.isGrounded ? slopeFactor : 0);
    // omega_y target (rad/s); right faster than left = yaw right (negative
    // about world Y under +X-right, -Z-forward, +Y-up).
    let omegaYTarget = 0;
    if (trackSeparation > 0) {
      omegaYTarget = (rv - lv) / trackSeparation;
      if (this.state.isGrounded) omegaYTarget *= slopeFactor;
    }

    // Compose target world-space velocity from forward target + the current
    // sideways velocity (zero by construction — tanks don't slide laterally
    // in v1, no slip model). We let the integrator drift toward the target
    // exponentially through a high tracking rate; this is the differential-
    // drive equivalent of how the wheeled chassis lets drag tug velocity
    // toward the steady-state.
    //
    // Use an exponential approach so the velocity converges to the
    // commanded value with a configurable time constant (the inputSmoothRate
    // already smooths the command itself; this second smoothing accounts
    // for the mass-mediated lag of an actual chassis).
    const targetVx = _forward.x * vForwardTarget;
    const targetVz = _forward.z * vForwardTarget;

    // Drive contribution: force in the direction of the velocity error,
    // magnitude proportional to mass / track-speed time constant.
    const trackTau = 0.6; // s — track-to-chassis velocity convergence
    const dvx = targetVx - this.state.velocity.x;
    const dvz = targetVz - this.state.velocity.z;
    // Drive only acts when grounded (idle gear / no traction in air).
    const driveScale = this.state.isGrounded ? (mass / trackTau) : 0;
    let fx = dvx * driveScale;
    let fz = dvz * driveScale;

    // Rolling drag + air drag along current velocity (helps the chassis
    // bleed down when both tracks command 0).
    const speed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    if (speed > SPEED_EPS) {
      const dragMag = -(rollingCoef * speed + airDragCoef * speed * speed);
      fx += (this.state.velocity.x / speed) * dragMag;
      fz += (this.state.velocity.z / speed) * dragMag;
    }

    // Brake — opposes horizontal velocity, clamped so we cannot overshoot
    // into reverse within one step.
    const brakeMag = this.rawControls.brake * maxBrake;
    if (brakeMag > 0 && speed > SPEED_EPS) {
      const stopForce = (mass * speed) / Math.max(deltaTime, 1e-4);
      const effective = Math.min(brakeMag, stopForce);
      fx -= (this.state.velocity.x / speed) * effective;
      fz -= (this.state.velocity.z / speed) * effective;
    }

    // Gravity: full when airborne; projected along surface tangent when
    // grounded so a stationary tank on a slope below maxClimbSlope slides
    // backward at zero throttle (parity with GroundVehiclePhysics).
    if (this.state.isGrounded) {
      const gDotN = this.GRAVITY * normal.y;
      _gravityVec.set(
        -gDotN * normal.x,
        this.GRAVITY - gDotN * normal.y,
        -gDotN * normal.z,
      ).multiplyScalar(mass);
    } else {
      _gravityVec.set(0, this.GRAVITY * mass, 0);
    }

    // Integrate linear velocity (explicit Euler).
    this.state.velocity.x += (fx + _gravityVec.x) / mass * deltaTime;
    this.state.velocity.y += _gravityVec.y / mass * deltaTime;
    this.state.velocity.z += (fz + _gravityVec.z) / mass * deltaTime;

    // Integrate position from velocity.
    this.state.position.addScaledVector(this.state.velocity, deltaTime);

    // Angular velocity: critically-damped tracking toward omegaYTarget.
    const yawTau = 0.4; // s
    const yawBlend = Math.min(deltaTime / yawTau, 1.0);
    this.state.angularVelocity.x = 0;
    this.state.angularVelocity.y = THREE.MathUtils.lerp(
      this.state.angularVelocity.y,
      omegaYTarget,
      yawBlend,
    );
    this.state.angularVelocity.z = 0;

    // Integrate yaw about world Y.
    if (Math.abs(this.state.angularVelocity.y) > 1e-6) {
      const angle = this.state.angularVelocity.y * deltaTime;
      _yawQuat.setFromAxisAngle(_yawAxis, angle);
      this.state.quaternion.premultiply(_yawQuat).normalize();
    }
  }

  // ---------- Damping ----------

  private applyDamping(deltaTime: number): void {
    // Only damp horizontal velocity; let gravity dictate Y.
    const linDamp = Math.pow(this.cfg.velocityDamping, deltaTime);
    this.state.velocity.x *= linDamp;
    this.state.velocity.z *= linDamp;
    this.state.angularVelocity.multiplyScalar(Math.pow(this.cfg.angularDamping, deltaTime));
  }

  // ---------- Ground conform (Y snap + pitch/roll from normal) ----------

  private conformToGround(normal: THREE.Vector3): void {
    if (!this.state.isGrounded) return;

    const targetY = this.state.groundHeight + this.cfg.axleOffset;
    this.state.position.y = targetY;
    if (this.state.velocity.y < 0) this.state.velocity.y = 0;

    // Yaw kept from world-Y rotation; pitch + roll slaved to the terrain
    // normal so the hull tilts as it crosses ridges. Same pattern as
    // GroundVehiclePhysics.conformToGround.
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

// Exported so tests / adapters can reference the canonical corner order.
export { CORNER_LABELS };
