/**
 * Airframe — unified fixed-wing simulation.
 *
 * One class. One tick. One config. Input → intent → command → sim step →
 * state → consumers. Two explicit tiers (`raw`, `assist`). No hidden modes.
 *
 * Swept collision along the movement segment keeps a climbing aircraft from
 * passing through rising terrain.
 *
 * See docs/rearch/E6-vehicle-physics-design.md.
 */

import * as THREE from 'three';
import { buildAirframeCommand } from './buildCommand';
import type {
  AirframeCommand,
  AirframeConfig,
  AirframeIntent,
  AirframePhase,
  AirframeState,
  AirframeTerrainProbe,
} from './types';

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const MIN_SPEED = 0.1;
const GROUND_EFFECT_HEIGHT_M = 6.0;
const GROUND_TOUCHDOWN_BUFFER_M = 0.08;
const STALL_WARNING_FACTOR = 0.95;
const ROTATION_INPUT_THRESHOLD = 0.08;
// Arcade-leaning liftoff gate: once the aircraft is rotation-ready and the
// pilot pitches up, a lift ratio of 0.25 is enough to commit to liftoff.
// The old sim's 0.4 ratio meant the plane kept accelerating on the runway
// instead of climbing away in a reasonable window.
const LIFTOFF_WEIGHT_RATIO = 0.25;
const GROUND_STABILIZATION_TICKS = 3;
const AIRBORNE_RECOVERY_ALTITUDE = 0.4;
// Airborne touchdown fallback requires the guards (low AGL + descending) to
// be true for several consecutive ticks before firing. A single-tick latch
// caused bounce/porpoise artifacts when marginal-lift aircraft (e.g. AC-47)
// oscillated across the threshold right after the 1s grace window expired.
const TOUCHDOWN_LATCH_TICKS = 10;

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _velLocal = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _forceLocal = new THREE.Vector3();
const _forceWorld = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dragLocal = new THREE.Vector3();
const _liftLocal = new THREE.Vector3();
const _windLocal = new THREE.Vector3();
const _euler = new THREE.Euler();
const _matrix = new THREE.Matrix4();
const _groundForward = new THREE.Vector3();
const _groundRight = new THREE.Vector3();
const _groundNormal = new THREE.Vector3(0, 1, 0);

const AIRFRAME_FIXED_STEP = 1 / 60;

interface AeroState {
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

export class Airframe {
  readonly cfg: AirframeConfig;
  private readonly position: THREE.Vector3;
  private readonly quaternion = new THREE.Quaternion();
  private readonly velocity = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly previousQuaternion = new THREE.Quaternion();
  private readonly previousVelocity = new THREE.Vector3();
  private readonly terrainNormal = new THREE.Vector3(0, 1, 0);
  private throttle = 0;
  private elevator = 0;
  private aileron = 0;
  private rudder = 0;
  private brake = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private yawRate = 0;
  private groundPitch = 0;
  private weightOnWheels = true;
  private phase: AirframePhase = 'parked';
  private groundHeight = 0;
  private groundStabilizationTicks = GROUND_STABILIZATION_TICKS;
  /** Ticks during which airborne touchdown fallback is suppressed after a
   *  just-happened liftoff. Prevents an immediate bounce back to ground on
   *  the first airborne frame when the plane is still near zero AGL. */
  private postLiftoffGraceTicks = 0;
  /** Consecutive ticks the airborne fallback's guards (low AGL + descending)
   *  have been satisfied. The fallback only fires once this crosses a small
   *  threshold, so a momentary dip from aerodynamic oscillation during the
   *  seconds after liftoff doesn't snap the plane back to ground. */
  private descentLatchTicks = 0;
  /** Captured altitude target for assist-tier cruise hold. Set when the
   *  pilot releases the pitch stick in assist tier; cleared on stick input
   *  or on tier change. */
  private altitudeHoldTarget: number | null = null;
  private worldHalfExtent = 0;
  private accumulator = 0;
  private snapshot: AirframeState;

  constructor(initialPosition: THREE.Vector3, config: AirframeConfig) {
    this.cfg = config;
    this.position = initialPosition.clone();
    this.groundHeight = initialPosition.y - config.ground.gearClearanceM;
    this.snapshot = this.buildSnapshot(this.zeroAero());
    this.syncPreviousPose();
  }

  getState(): AirframeState {
    return this.snapshot;
  }

  getInterpolatedState(): AirframeState {
    const alpha = THREE.MathUtils.clamp(this.accumulator / AIRFRAME_FIXED_STEP, 0, 1);
    const position = this.previousPosition.clone().lerp(this.position, alpha);
    const quaternion = this.previousQuaternion.clone().slerp(this.quaternion, alpha);
    const velocity = this.previousVelocity.clone().lerp(this.velocity, alpha);

    _euler.setFromQuaternion(quaternion, 'YXZ');
    const altitudeAGL = Math.max(
      0,
      position.y - (this.groundHeight + this.cfg.ground.gearClearanceM),
    );

    return {
      ...this.snapshot,
      position,
      quaternion,
      velocity,
      effectors: { ...this.snapshot.effectors },
      altitude: position.y,
      altitudeAGL,
      verticalSpeedMs: velocity.y,
      pitchDeg: THREE.MathUtils.radToDeg(_euler.x),
      rollDeg: THREE.MathUtils.radToDeg(_euler.z),
      headingDeg: ((THREE.MathUtils.radToDeg(_euler.y) % 360) + 360) % 360,
    };
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

  setWorldHalfExtent(halfExtent: number): void {
    this.worldHalfExtent = halfExtent;
  }

  /**
   * Reset to a parked-on-the-ground state at the requested position. Clears
   * effector state, velocity, and rates. Quaternion is zeroed to identity.
   */
  resetToGround(position: THREE.Vector3): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.quaternion.identity();
    this.terrainNormal.set(0, 1, 0);
    this.groundHeight = position.y - this.cfg.ground.gearClearanceM;
    this.groundPitch = 0;
    this.phase = 'parked';
    this.groundStabilizationTicks = GROUND_STABILIZATION_TICKS;
    this.weightOnWheels = true;
    this.throttle = this.elevator = this.aileron = this.rudder = this.brake = 0;
    this.pitchRate = this.rollRate = this.yawRate = 0;
    this.accumulator = 0;
    this.altitudeHoldTarget = null;
    this.postLiftoffGraceTicks = 0;
    this.descentLatchTicks = 0;
    this.snapshot = this.buildSnapshot(this.zeroAero());
    this.syncPreviousPose();
  }

  resetAirborne(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    forwardSpeed: number,
    verticalSpeed = 0,
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
    this.phase = 'cruise';
    this.groundStabilizationTicks = 0;
    this.weightOnWheels = false;
    this.pitchRate = this.rollRate = this.yawRate = 0;
    this.accumulator = 0;
    this.postLiftoffGraceTicks = 0;
    this.descentLatchTicks = 0;
    // Capture current altitude as the assist-tier hold target. The pilot
    // will clear it implicitly on their first pitch input.
    this.altitudeHoldTarget = position.y;
    this.snapshot = this.buildSnapshot(this.computeAero());
    this.syncPreviousPose();
  }

  /**
   * Primary entrypoint. Called every frame with wall-clock delta. The sim
   * steps at AIRFRAME_FIXED_STEP internally to keep physics frame-rate
   * independent.
   */
  step(intent: AirframeIntent, terrain: AirframeTerrainProbe, deltaTime: number): AirframeState {
    this.accumulator += deltaTime;
    // Bound the accumulator so a big stall doesn't produce a huge burst.
    if (this.accumulator > AIRFRAME_FIXED_STEP * 8) {
      this.accumulator = AIRFRAME_FIXED_STEP * 8;
    }
    while (this.accumulator >= AIRFRAME_FIXED_STEP) {
      this.accumulator -= AIRFRAME_FIXED_STEP;
      this.capturePreviousPose();
      this.stepOnce(intent, terrain, AIRFRAME_FIXED_STEP);
    }
    return this.snapshot;
  }

  private capturePreviousPose(): void {
    this.previousPosition.copy(this.position);
    this.previousQuaternion.copy(this.quaternion);
    this.previousVelocity.copy(this.velocity);
  }

  private syncPreviousPose(): void {
    this.capturePreviousPose();
  }

  private stepOnce(intent: AirframeIntent, terrain: AirframeTerrainProbe, dt: number): void {
    // 1. Sample terrain at current position (cheap point-sample for lift and
    //    ground-effect context). Swept collision happens AFTER integration.
    const sample = terrain.sample(this.position.x, this.position.z);
    this.groundHeight = sample.height;
    if (sample.normal) this.terrainNormal.copy(sample.normal).normalize();

    // 2. Ground-stabilization window: within the first few ticks after
    //    creation or resetToGround, clamp on ground if we're within 2 m.
    //    This absorbs initial terrain-height mismatches without flipping
    //    the plane airborne on frame 1.
    const separation =
      this.position.y - (this.groundHeight + this.cfg.ground.gearClearanceM);
    if (
      this.groundStabilizationTicks > 0 &&
      this.weightOnWheels &&
      separation < 2.0
    ) {
      this.groundStabilizationTicks--;
      this.position.y = this.groundHeight + this.cfg.ground.gearClearanceM;
    } else if (this.weightOnWheels && separation > 5.0) {
      // Caller teleported the aircraft into the air (e.g. test fixture
      // mutating position / velocity directly, or external spawn-airborne
      // path that bypassed resetAirborne). Promote to airborne once so
      // the sim integrates the air path; this does NOT reinstate the
      // per-tick "airborne-by-separation" promotion that the design memo
      // called out — we only flip once, then the normal ground/air
      // pathways take over.
      this.weightOnWheels = false;
      this.phase = 'cruise';
      this.groundStabilizationTicks = 0;
    }

    // 3. Build command from intent + current state (one translation).
    const cmd = buildAirframeCommand(intent, this.snapshot, this.cfg);

    // Altitude-hold augmentation: in assist tier with neutral pitch stick
    // and a captured hold target, override the elevator with a PD loop on
    // altitude error. This gives the contract "neutral stick means hold
    // altitude" a real autopilot backbone instead of relying on
    // vs-damping alone (which phase-lags and oscillates at cruise thrust).
    // Pitch input clears the hold target — pilot took authority back.
    if (Math.abs(intent.pitch) >= 0.05) {
      this.altitudeHoldTarget = null;
    }
    if (
      intent.tier === 'assist' &&
      !this.weightOnWheels &&
      Math.abs(intent.pitch) < 0.05 &&
      this.altitudeHoldTarget !== null
    ) {
      const altErr = this.position.y - this.altitudeHoldTarget;
      const vs = this.velocity.y;
      // PD loop on altitude error with strong pitch-rate damping. Gains
      // tuned for the B1 integration cruise scenario (5 m deviation over
      // 5 s at 50 m/s, throttle 0.55). Keep the clamp tight so we never
      // bang-bang into an oscillation.
      const elev = clampScalar(
        -altErr * 0.015 - vs * 0.06 - this.pitchRate * 0.05,
        -0.15,
        0.15,
      );
      cmd.elevator = elev;
    }

    // 4. Smooth effectors toward command targets (frame-rate independent).
    const cr = Math.min(this.cfg.authority.controlResponsePerSec * dt, 1);
    const tr = Math.min(this.cfg.engine.throttleResponsePerSec * dt, 1);
    this.throttle = THREE.MathUtils.lerp(this.throttle, cmd.throttle, tr);
    this.elevator = THREE.MathUtils.lerp(this.elevator, cmd.elevator, cr);
    this.aileron = THREE.MathUtils.lerp(this.aileron, cmd.aileron, cr);
    this.rudder = THREE.MathUtils.lerp(this.rudder, cmd.rudder, cr);
    this.brake = THREE.MathUtils.lerp(this.brake, cmd.brake, cr);

    // 5. Cache previous position for swept collision.
    _from.copy(this.position);

    // 6. Integrate.
    if (this.weightOnWheels) {
      this.integrateGround(dt, cmd);
      if (this.weightOnWheels) {
        this.syncGroundContactAtCurrentPosition(terrain);
      }
    } else {
      this.integrateAir(dt, cmd);
    }

    // 7. Swept collision. Only meaningful while airborne — ground integration
    //    already clamps to ground height. If an airborne aircraft would cross
    //    rising terrain mid-step, clamp to the hit point and touch down.
    if (!this.weightOnWheels) {
      _to.copy(this.position);
      const hit = terrain.sweep(_from, _to);
      if (hit && hit.hit) {
        this.position.copy(hit.point);
        this.position.y += this.cfg.ground.gearClearanceM;
        // Absorb vertical component on touchdown; keep horizontal velocity
        // for a rollout if we're fast, otherwise snap to parked.
        if (this.velocity.y < 0) this.velocity.y = 0;
        this.weightOnWheels = true;
        const speed = this.velocity.length();
        this.phase = speed > 3 ? 'rollout' : 'parked';
        this.pitchRate = 0;
        this.rollRate = 0;
        this.yawRate *= 0.5;
        this.groundPitch = Math.max(0, this.snapshot.pitchDeg) * Math.PI / 180;
      }
    }

    // 8. World boundary (arena cap; no-op when halfExtent is 0).
    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary();
    }

    // 9. Rebuild snapshot — authoritative state for all consumers this tick.
    this.snapshot = this.buildSnapshot(this.computeAero());
  }

  private integrateGround(dt: number, cmd: AirframeCommand): void {
    const { aero, engine, ground } = this.cfg;
    const normal = this.terrainNormal;
    const forward = this.computeGroundForward(normal, _groundForward);
    const right = _groundRight.copy(forward).cross(normal).normalize();

    const fwdSpeed = this.velocity.dot(forward);
    const sideSpeed = this.velocity.dot(right);
    const q = 0.5 * AIR_DENSITY * Math.max(fwdSpeed, 0) * Math.max(fwdSpeed, 0);

    const thrustAccel = (this.throttle * engine.maxThrustN) / this.cfg.mass.kg;
    const dragAccel = (q * this.cfg.mass.wingAreaM2 * aero.cd0) / this.cfg.mass.kg;
    const brakeAccel = this.brake * ground.brakeDecelMs2;
    const rollingAccel = ground.rollingResistance * GRAVITY;

    let newFwd = fwdSpeed + (thrustAccel - dragAccel - brakeAccel - rollingAccel) * dt;
    newFwd = Math.max(0, Math.min(newFwd, aero.maxSpeedMs));

    const newSide = THREE.MathUtils.lerp(
      sideSpeed,
      0,
      Math.min(ground.lateralFriction * dt, 1),
    );

    // Steering authority fades in with speed so a parked plane doesn't spin.
    const steerAuthority = THREE.MathUtils.smoothstep(newFwd, 0.5, 24);
    const steerDelta = this.rudder * ground.steeringRadPerSec * steerAuthority * dt;
    if (Math.abs(steerDelta) > 0.0001) {
      forward.applyAxisAngle(normal, steerDelta).normalize();
      right.copy(forward).cross(normal).normalize();
    }

    // Pre-rotation visual feedback: clamp pitch to maxGroundPitchDeg below Vr
    // but act IMMEDIATELY on stick (no smoothstep gate). Arcade feel — the
    // player sees input is working even at zero speed.
    // Rotation-ready is 85% of Vr — the airframe has enough lift authority
    // to start rotating, even if full liftoff needs Vr proper. Dropping from
    // 0.9 → 0.85 shaves ~0.7s off a Skyraider takeoff roll, which is the
    // difference between "takes off in 8s" and "takes off in 9s" at tuning
    // targets in the integration harness.
    const rotationReady = newFwd >= aero.vrSpeedMs * 0.85;
    let targetPitchRad: number;
    if (cmd.elevator > 0 && rotationReady) {
      targetPitchRad = cmd.elevator * THREE.MathUtils.degToRad(ground.rotationPitchLimitDeg);
    } else if (cmd.elevator > 0) {
      targetPitchRad = cmd.elevator * THREE.MathUtils.degToRad(ground.maxGroundPitchDeg);
    } else {
      targetPitchRad = 0;
    }
    this.groundPitch = THREE.MathUtils.lerp(
      this.groundPitch,
      targetPitchRad,
      Math.min(3.6 * dt, 1),
    );

    this.setGroundAttitude(normal, forward, this.groundPitch);

    // Move.
    const move = forward
      .clone()
      .multiplyScalar(newFwd)
      .addScaledVector(right, newSide);
    this.position.addScaledVector(move, dt);
    this.position.y = this.groundHeight + ground.gearClearanceM;
    this.velocity.copy(move);

    // Liftoff gate: rotation-ready AND pilot is holding pitch AND wings
    // generate enough lift. No second early-promotion path — this is the
    // only way to leave the ground. Once we're at or above Vr with the
    // pilot asking to climb, we commit regardless of strict lift ratio —
    // the arcade feel is "press up, plane lifts." A stricter lift gate
    // would mean a 10-second ground roll on a Skyraider at full throttle.
    const aeroState = this.computeAero();
    const liftRatio = aeroState.lift / (this.cfg.mass.kg * GRAVITY);
    const wantsRotation = cmd.elevator > ROTATION_INPUT_THRESHOLD;
    const atOrAboveVr = newFwd >= aero.vrSpeedMs;
    if (
      wantsRotation &&
      (atOrAboveVr || (rotationReady && liftRatio >= LIFTOFF_WEIGHT_RATIO))
    ) {
      this.weightOnWheels = false;
      this.phase = 'rotation';
      // Vertical impulse so we're not clipping terrain right after liftoff,
      // and a small positive pitch rate so the nose continues up into the
      // commanded pitch attitude instead of sagging for the first ~150 ms.
      // Floor bumped 3.0 → 4.5 m/s so marginal-lift aircraft (AC-47) leave
      // the ground with enough vertical margin to clear the fallback
      // threshold before the grace window expires.
      this.velocity.addScaledVector(
        _up.set(0, 1, 0).applyQuaternion(this.quaternion),
        Math.max(4.5, newFwd * 0.12),
      );
      this.pitchRate = Math.max(this.pitchRate, cmd.elevator * 0.5);
      // Suppress immediate retouchdown for ~1s. Keeps the plane from
      // bouncing back down when it's still near AGL=0 right after liftoff
      // and alpha-limited pitch authority is still ramping in.
      this.postLiftoffGraceTicks = 60;
      return;
    }

    // Phase classification on the ground.
    if (Math.abs(newFwd) < 0.75 && this.throttle < 0.05) {
      this.phase = 'parked';
    } else if (rotationReady && wantsRotation) {
      this.phase = 'rotation';
    } else if (rotationReady) {
      this.phase = 'takeoff_roll';
    } else if (newFwd < 8) {
      this.phase = 'taxi';
    } else {
      this.phase = 'takeoff_roll';
    }
  }

  private syncGroundContactAtCurrentPosition(terrain: AirframeTerrainProbe): void {
    const sample = terrain.sample(this.position.x, this.position.z);
    this.groundHeight = sample.height;
    if (sample.normal) this.terrainNormal.copy(sample.normal).normalize();
    this.position.y = this.groundHeight + this.cfg.ground.gearClearanceM;
  }

  private integrateAir(dt: number, cmd: AirframeCommand): void {
    const { aero, engine, authority, stability } = this.cfg;
    const a = this.computeAero();

    // Authority scales with dynamic pressure so stalled / low-q aircraft feel
    // "mushy" rather than locked into a zero-input attitude.
    const qRef = 0.5 * AIR_DENSITY * aero.vrSpeedMs * aero.vrSpeedMs;
    const authorityScale = THREE.MathUtils.clamp(a.dynamicPressure / qRef, 0.15, 2.2);

    // Alpha protection: attenuate nose-up elevator as AoA approaches stall.
    // Lives in the sim (not the command builder) so player can't override it.
    const absAlphaDeg = Math.abs(THREE.MathUtils.radToDeg(a.alphaRad));
    const protectionOnsetDeg = aero.alphaStallDeg - 5;
    const protectionFullDeg = aero.alphaStallDeg - 1;
    const alphaFactor =
      1 - THREE.MathUtils.smoothstep(absAlphaDeg, protectionOnsetDeg, protectionFullDeg);
    const protectedElevator = this.elevator > 0 ? this.elevator * alphaFactor : this.elevator;

    // Base aerodynamic restoring moments (pitch toward trim, yaw toward 0
    // sideslip, roll toward level if stick centered).
    const basePitchRestore = -(a.alphaRad - THREE.MathUtils.degToRad(aero.trimAlphaDeg)) * stability.pitch;
    const basePitchAssist = cmd.assist ? basePitchRestore : basePitchRestore * 0.6;

    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    const rollAngle = _euler.z;
    const rollLevelAssist =
      Math.abs(cmd.aileron) < 0.05 ? -rollAngle * stability.rollLevel * (cmd.assist ? 1.8 : 1) : 0;
    const yawAssist = -a.betaRad * stability.yaw;

    const stallPitchDrop = a.stalled ? -(0.9 + a.stallSeverity * 1.3) : 0;

    const pitchAccel =
      protectedElevator * authority.elevator * authorityScale +
      basePitchAssist +
      stallPitchDrop -
      this.pitchRate * stability.pitchDamp;
    const rollAccel =
      this.aileron * authority.aileron * authorityScale +
      rollLevelAssist -
      this.rollRate * stability.rollDamp;
    const yawAccel =
      this.rudder * authority.rudder * authorityScale +
      yawAssist +
      Math.sin(rollAngle) * 0.4 * authorityScale -
      this.yawRate * stability.yawDamp;

    this.pitchRate = THREE.MathUtils.clamp(
      this.pitchRate + pitchAccel * dt,
      -authority.maxPitchRate,
      authority.maxPitchRate,
    );
    this.rollRate = THREE.MathUtils.clamp(
      this.rollRate + rollAccel * dt,
      -authority.maxRollRate,
      authority.maxRollRate,
    );
    this.yawRate = THREE.MathUtils.clamp(
      this.yawRate + yawAccel * dt,
      -authority.maxYawRate,
      authority.maxYawRate,
    );

    this.applyAngularRates(dt);

    // Thrust scales with forward speed to avoid zero-speed rocket launch; a
    // static floor ensures stall recovery with partial power.
    const thrustScale = THREE.MathUtils.smoothstep(
      a.forwardSpeed,
      aero.stallSpeedMs * 0.15,
      aero.stallSpeedMs * 0.5,
    );
    const thrustN = this.throttle * engine.maxThrustN * Math.max(thrustScale, engine.staticThrustFloor);
    _forceLocal.set(0, 0, -thrustN);
    if (a.airspeed > MIN_SPEED) {
      // Drag opposes wind (body-local), lift perpendicular, side force on +X
      // body axis.
      _dragLocal.copy(_windLocal).multiplyScalar(a.drag);
      _liftLocal.multiplyScalar(a.lift);
      _forceLocal.add(_dragLocal).add(_liftLocal);
      _forceLocal.x += a.sideForce;
    }
    _forceWorld.copy(_forceLocal).applyQuaternion(this.quaternion);
    _forceWorld.y -= this.cfg.mass.kg * GRAVITY;

    this.velocity.addScaledVector(_forceWorld, dt / this.cfg.mass.kg);
    if (this.velocity.length() > aero.maxSpeedMs) {
      this.velocity.setLength(aero.maxSpeedMs);
    }
    this.position.addScaledVector(this.velocity, dt);

    // Gentle ground-plane touchdown fallback for low-angle approaches. Swept
    // collision is the main path; this catches the level-ish case where the
    // aircraft is barely above the ground and the sweep returned no hit
    // (e.g. local flat terrain, previous and next position both above).
    const groundClearance = this.groundHeight + this.cfg.ground.gearClearanceM;
    const altitudeAGL = this.position.y - groundClearance;
    if (this.postLiftoffGraceTicks > 0) {
      this.postLiftoffGraceTicks--;
    }
    const postLiftoffProtected = this.postLiftoffGraceTicks > 0;
    const touchdownGuardsMet =
      altitudeAGL <= this.cfg.ground.liftoffClearanceM + GROUND_TOUCHDOWN_BUFFER_M &&
      this.velocity.y <= 0;
    if (touchdownGuardsMet && !postLiftoffProtected) {
      this.descentLatchTicks++;
    } else {
      this.descentLatchTicks = 0;
    }
    if (
      !postLiftoffProtected &&
      touchdownGuardsMet &&
      this.descentLatchTicks >= TOUCHDOWN_LATCH_TICKS
    ) {
      this.position.y = groundClearance;
      this.velocity.y = 0;
      this.weightOnWheels = true;
      this.phase = this.velocity.length() > 1.0 ? 'rollout' : 'parked';
      this.pitchRate = 0;
      this.rollRate = 0;
      this.yawRate *= 0.5;
      this.groundPitch = Math.max(0, _euler.x);
      this.descentLatchTicks = 0;
      return;
    }

    // Phase classification airborne.
    this.phase = a.stalled
      ? 'stall'
      : altitudeAGL < 50
        ? 'climb'
        : 'cruise';
  }

  private applyAngularRates(dt: number): void {
    if (Math.abs(this.rollRate) > 0.0001) {
      _axis.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
      _dq.setFromAxisAngle(_axis, this.rollRate * dt);
      this.quaternion.premultiply(_dq).normalize();
    }
    if (Math.abs(this.pitchRate) > 0.0001) {
      _axis.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();
      _dq.setFromAxisAngle(_axis, this.pitchRate * dt);
      this.quaternion.premultiply(_dq).normalize();
    }
    if (Math.abs(this.yawRate) > 0.0001) {
      _axis.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
      _dq.setFromAxisAngle(_axis, this.yawRate * dt);
      this.quaternion.premultiply(_dq).normalize();
    }
  }

  private computeGroundForward(normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, -1).applyQuaternion(this.quaternion).projectOnPlane(normal);
    if (target.lengthSq() < 0.0001) {
      target.set(0, 0, -1).projectOnPlane(normal);
    }
    return target.normalize();
  }

  private setGroundAttitude(
    normal: THREE.Vector3,
    forward: THREE.Vector3,
    pitch: number,
  ): void {
    _right.copy(forward).cross(normal).normalize();
    _forward.copy(forward).applyAxisAngle(_right, pitch).normalize();
    _up.copy(_right).cross(_forward).normalize();
    _matrix.makeBasis(_right, _up, _forward.clone().negate());
    this.quaternion.setFromRotationMatrix(_matrix).normalize();
  }

  private computeAero(): AeroState {
    _invQ.copy(this.quaternion).invert();
    _velLocal.copy(this.velocity).applyQuaternion(_invQ);

    const forwardSpeed = Math.max(0, -_velLocal.z);
    const airspeed = Math.max(_velLocal.length(), MIN_SPEED);
    const alphaRad = Math.atan2(-_velLocal.y, Math.max(forwardSpeed, MIN_SPEED));
    const betaRad = Math.atan2(_velLocal.x, Math.max(forwardSpeed, MIN_SPEED));
    const dynamicPressure = 0.5 * AIR_DENSITY * airspeed * airspeed;

    const { aero } = this.cfg;
    const absAlphaDeg = Math.abs(THREE.MathUtils.radToDeg(alphaRad));
    const stallStartDeg = Math.max(4, aero.alphaStallDeg - 3);
    const stallSeverity = THREE.MathUtils.clamp(
      (absAlphaDeg - stallStartDeg) / Math.max(aero.alphaMaxDeg - stallStartDeg, 1),
      0,
      1,
    );
    const stalled =
      absAlphaDeg >= aero.alphaStallDeg ||
      (forwardSpeed < aero.stallSpeedMs * STALL_WARNING_FACTOR &&
        absAlphaDeg > aero.alphaStallDeg * 0.75);
    const stallLiftScale = stalled ? THREE.MathUtils.lerp(0.9, 0.25, stallSeverity) : 1;
    const clBase = aero.cl0 + aero.clAlpha * alphaRad + this.elevator * 0.22;
    const cl = THREE.MathUtils.clamp(clBase, -aero.clMax, aero.clMax) * stallLiftScale;

    let lift = dynamicPressure * this.cfg.mass.wingAreaM2 * cl;
    // Ground effect: boost lift when close to the ground, scaled by forward
    // speed. Applied whether on wheels or just airborne — a plane clearing a
    // cliff edge at low altitude gets real help.
    const heightAboveGround = Math.max(
      0,
      this.position.y - (this.groundHeight + this.cfg.ground.gearClearanceM),
    );
    const groundEffect = 1 - THREE.MathUtils.clamp(heightAboveGround / GROUND_EFFECT_HEIGHT_M, 0, 1);
    const speedFactor = THREE.MathUtils.smoothstep(
      forwardSpeed,
      aero.vrSpeedMs * 0.5,
      aero.v2SpeedMs,
    );
    lift *= 1 + groundEffect * aero.groundEffectStrength * speedFactor;

    const inducedDrag = aero.inducedDragK * cl * cl;
    const stallDrag = stalled ? THREE.MathUtils.lerp(0.04, 0.26, stallSeverity) : 0;
    const drag = dynamicPressure * this.cfg.mass.wingAreaM2 * (aero.cd0 + inducedDrag + stallDrag);
    const sideForce = dynamicPressure * this.cfg.mass.wingAreaM2 * (-betaRad * aero.sideForceCoefficient);

    // Prepare local unit vectors for the lift / drag directions (used in the
    // airborne force composition).
    _windLocal.copy(_velLocal).normalize().multiplyScalar(-1);
    _liftLocal.copy(_windLocal).cross(_right.set(1, 0, 0)).normalize();

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

  private zeroAero(): AeroState {
    return {
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
    };
  }

  private buildSnapshot(a: AeroState): AirframeState {
    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    const altitudeAGL = Math.max(
      0,
      this.position.y - (this.groundHeight + this.cfg.ground.gearClearanceM),
    );
    const pitchDeg = THREE.MathUtils.radToDeg(_euler.x);
    const rollDeg = THREE.MathUtils.radToDeg(_euler.z);
    const headingDeg = ((THREE.MathUtils.radToDeg(_euler.y) % 360) + 360) % 360;
    const aoaDeg = THREE.MathUtils.radToDeg(a.alphaRad);
    const sideslipDeg = THREE.MathUtils.radToDeg(a.betaRad);
    return {
      position: this.position,
      quaternion: this.quaternion,
      velocity: this.velocity,
      effectors: {
        throttle: this.throttle,
        elevator: this.elevator,
        aileron: this.aileron,
        rudder: this.rudder,
        brake: this.brake,
      },
      phase: this.phase,
      weightOnWheels: this.weightOnWheels,
      airspeedMs: a.airspeed === 0 ? this.velocity.length() : a.airspeed,
      forwardAirspeedMs: a.forwardSpeed,
      altitude: this.position.y,
      altitudeAGL,
      pitchDeg,
      rollDeg,
      headingDeg,
      verticalSpeedMs: this.velocity.y,
      aoaDeg,
      sideslipDeg,
      pitchRateDeg: THREE.MathUtils.radToDeg(this.pitchRate),
      rollRateDeg: THREE.MathUtils.radToDeg(this.rollRate),
      yawRateDeg: THREE.MathUtils.radToDeg(this.yawRate),
      isStalled: !this.weightOnWheels && a.stalled && altitudeAGL > AIRBORNE_RECOVERY_ALTITUDE,
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

// Make _groundNormal referenced to avoid unused-import warnings if tree
// shaking is aggressive.
void _groundNormal;

function clampScalar(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
