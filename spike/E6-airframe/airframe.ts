/**
 * Airframe — unified fixed-wing simulation prototype (E6 spike).
 *
 * One class. One tick. One config. No adapters, no separate control-law,
 * no layered lerp chains across three files.
 *
 * This is NOT production code. It is a prototype that fits on one page so we
 * can reason about the shape of the replacement before committing to a merge.
 *
 * Shape:
 *
 *   Input  (raw keys, stick, mouse — constructed by caller)
 *     ↓
 *   Intent (typed, bounded, unit-free: -1..1 for axes, 0..1 for throttle)
 *     ↓
 *   Command (what the simulation acts on THIS tick: elevator, aileron, rudder,
 *            throttle target, brake, assist flag, orbit target if any)
 *     ↓
 *   Sim step (single function: step(cmd, dt, terrain) → new State)
 *     ↓
 *   State (position, orientation, velocity, effector positions, phase)
 *     ↓
 *   Visuals / HUD (consume State; do not mutate it)
 *
 * No hidden modes. Two explicit tiers:
 *   - `raw`: stick → elevator/aileron/rudder directly, scaled by authority.
 *   - `assist`: PD controller toward target attitude derived from stick.
 * Orbit-hold is a *different* input source (gunship), not a third mode inside
 * the control law.
 *
 * Swept collision design (sketched here as a TODO; full implementation in
 * production port): before integrating position, cast a ray from the current
 * position along the planned delta and clamp at first terrain hit, not at the
 * endpoint. Uses ITerrainRuntime.raycastTerrain (already on the fence).
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
    cd0: number;
    inducedDragK: number;
    sideForceCoefficient: number;
    trimAlphaDeg: number;
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
    /** Bank/pitch targets stick commands. */
    assistMaxBankDeg: number;
    assistMaxPitchDeg: number;
    /** Turn coordination — yaw added proportional to bank. */
    coordYawScale: number;
    /** Autolevel strength when stick is centered in assist mode. */
    autoLevelStrength: number;
  };
}

export type AirframeTier = 'raw' | 'assist';

/**
 * Intent is unitless player input. Produced by ONE input builder (keyboard,
 * touch, gamepad, AI). This is the only place input diversity exists.
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

export interface AirframeTerrainSample {
  height: number;
  normal?: THREE.Vector3;
}

/**
 * Swept collision query — a single primitive the sim can ask of the world.
 * Production port: implemented against ITerrainRuntime.raycastTerrain.
 * Spike: implemented inline below against a flat plane / height function.
 */
export interface AirframeTerrainProbe {
  /** Point-sample height+normal at (x, z). */
  sample(x: number, z: number): AirframeTerrainSample;
  /**
   * Swept test along a segment. Returns the first terrain intersection or null.
   * Used by the sim to clamp a movement step when a climbing aircraft would
   * otherwise pass through rising terrain.
   */
  sweep(from: THREE.Vector3, to: THREE.Vector3): { hit: boolean; point: THREE.Vector3; normal: THREE.Vector3 } | null;
}

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

export interface AirframeState {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly velocity: THREE.Vector3;
  /** Current effector positions (smoothed from command). */
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
  readonly altitudeAGL: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly headingDeg: number;
  readonly verticalSpeedMs: number;
  readonly aoaDeg: number;
  readonly isStalled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command builder — single translation layer from intent to control surfaces
// ─────────────────────────────────────────────────────────────────────────────

interface AirframeCommand {
  elevator: number; // -1..1 target elevator deflection
  aileron: number;  // -1..1 target aileron deflection
  rudder: number;   // -1..1 target rudder deflection
  throttle: number; // 0..1
  brake: number;    // 0..1
  /** Whether assist-mode stability should be blended in the airborne step. */
  assist: boolean;
}

/**
 * Build the control-surface command from intent + current state. This is the
 * ONLY file that knows about the two tiers. There is no `direct_stick` vs
 * `assisted` boolean half-way through the physics sim.
 */
export function buildCommand(
  intent: AirframeIntent,
  state: AirframeState,
  cfg: AirframeConfig,
): AirframeCommand {
  // Orbit-hold overrides the stick interpretation. Still produces a command,
  // not a new sim mode — the sim is oblivious.
  if (intent.orbit && !state.weightOnWheels) {
    return buildOrbitCommand(intent, intent.orbit, state, cfg);
  }

  if (intent.tier === 'raw' || state.weightOnWheels) {
    return {
      elevator: clamp(intent.pitch * cfg.feel.rawPitchScale, -1, 1),
      aileron: clamp(intent.roll * cfg.feel.rawRollScale, -1, 1),
      rudder: clamp(intent.yaw * cfg.feel.rawYawScale, -1, 1),
      throttle: clamp(intent.throttle, 0, 1),
      brake: state.weightOnWheels ? clamp(intent.brake, 0, 1) : 0,
      assist: false,
    };
  }

  // Assist tier: stick sets *attitude targets*, PD converts error to command.
  const { feel } = cfg;
  const rollIntentActive = Math.abs(intent.roll) >= 0.05;
  const pitchIntentActive = Math.abs(intent.pitch) >= 0.05;

  let aileron = 0;
  if (rollIntentActive) {
    const targetBank = intent.roll * feel.assistMaxBankDeg;
    const errDeg = state.rollDeg - targetBank;
    aileron = clamp((errDeg * feel.assistRollP) - (rollRateDeg(state) * feel.assistRollD), -1, 1);
  } else {
    // Autolevel
    aileron = clamp(state.rollDeg * feel.autoLevelStrength * 0.02, -0.4, 0.4);
  }

  let elevator = 0;
  if (pitchIntentActive) {
    const targetPitch = intent.pitch * feel.assistMaxPitchDeg;
    const errDeg = targetPitch - state.pitchDeg;
    elevator = clamp((errDeg * feel.assistPitchP) - (pitchRateDeg(state) * feel.assistPitchD), -1, 1);
  }

  // Turn coordination
  const coordYaw = -clamp(state.rollDeg / 40, -1, 1) * feel.coordYawScale;
  const rudder = clamp(intent.yaw * feel.rawYawScale + coordYaw, -1, 1);

  return { elevator, aileron, rudder, throttle: clamp(intent.throttle, 0, 1), brake: 0, assist: true };
}

function buildOrbitCommand(
  _intent: AirframeIntent,
  orbit: NonNullable<AirframeIntent['orbit']>,
  state: AirframeState,
  _cfg: AirframeConfig,
): AirframeCommand {
  const dx = state.position.x - orbit.centerX;
  const dz = state.position.z - orbit.centerZ;
  const currentRadius = Math.max(Math.hypot(dx, dz), 1);
  const radiusErr = (currentRadius - orbit.radiusM) / orbit.radiusM;
  const speed = Math.max(state.airspeedMs, 1);
  const requiredBankDeg = THREE.MathUtils.radToDeg(
    Math.atan((speed * speed) / Math.max(orbit.radiusM * 9.81, 1)),
  );
  const nominalBankDeg = Math.max(orbit.bankDeg, requiredBankDeg);
  const targetBankDeg = clamp((nominalBankDeg + clamp(radiusErr * 30, -8, 8)) * orbit.direction, -30, 30);
  const aileron = clamp((state.rollDeg - targetBankDeg) / 15, -1, 1);
  const elevator = clamp((1.5 - state.verticalSpeedMs) * 0.1, -0.15, 0.3);
  return {
    elevator,
    aileron,
    rudder: 0.2 * orbit.direction,
    throttle: 0.65,
    brake: 0,
    assist: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sim core — Airframe class
// ─────────────────────────────────────────────────────────────────────────────

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const FIXED_STEP = 1 / 120;

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
const _euler = new THREE.Euler();

export class Airframe {
  readonly cfg: AirframeConfig;
  private readonly pos: THREE.Vector3;
  private readonly quat = new THREE.Quaternion();
  private readonly vel = new THREE.Vector3();
  private throttle = 0;
  private elevator = 0;
  private aileron = 0;
  private rudder = 0;
  private brake = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private yawRate = 0;
  private weightOnWheels = true;
  private groundHeight = 0;
  private phase: AirframePhase = 'parked';
  private snapshot: AirframeState;

  /** Step accumulator for fixed-timestep integration. */
  private accumulator = 0;

  constructor(initialPosition: THREE.Vector3, cfg: AirframeConfig) {
    this.cfg = cfg;
    this.pos = initialPosition.clone();
    this.groundHeight = initialPosition.y - cfg.ground.gearClearanceM;
    this.snapshot = this.buildSnapshot();
  }

  getState(): AirframeState {
    return this.snapshot;
  }

  resetAirborne(position: THREE.Vector3, headingRad: number, forwardSpeedMs: number): void {
    this.pos.copy(position);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad);
    _forward.set(0, 0, -1).applyQuaternion(this.quat).normalize();
    this.vel.copy(_forward).multiplyScalar(forwardSpeedMs);
    this.weightOnWheels = false;
    this.phase = 'cruise';
    this.pitchRate = this.rollRate = this.yawRate = 0;
    this.snapshot = this.buildSnapshot();
  }

  /**
   * Primary entrypoint. Called by the host (FixedWingModel-equivalent) every
   * frame with a wall-clock delta. The sim steps at FIXED_STEP internally to
   * keep physics frame-rate independent.
   */
  step(intent: AirframeIntent, terrain: AirframeTerrainProbe, dt: number): AirframeState {
    this.accumulator += dt;
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.stepOnce(intent, terrain, FIXED_STEP);
    }
    return this.snapshot;
  }

  private stepOnce(intent: AirframeIntent, terrain: AirframeTerrainProbe, dt: number): void {
    // 1. Sample terrain at current position (for lift / ground-effect).
    const ground = terrain.sample(this.pos.x, this.pos.z);
    this.groundHeight = ground.height;

    // 2. Build command from intent + current state (one translation).
    const cmd = buildCommand(intent, this.snapshot, this.cfg);

    // 3. Smooth effectors toward command target (frame-rate independent).
    const cr = Math.min(this.cfg.authority.controlResponsePerSec * dt, 1);
    const tr = Math.min(this.cfg.engine.throttleResponsePerSec * dt, 1);
    this.throttle = THREE.MathUtils.lerp(this.throttle, cmd.throttle, tr);
    this.elevator = THREE.MathUtils.lerp(this.elevator, cmd.elevator, cr);
    this.aileron = THREE.MathUtils.lerp(this.aileron, cmd.aileron, cr);
    this.rudder = THREE.MathUtils.lerp(this.rudder, cmd.rudder, cr);
    this.brake = THREE.MathUtils.lerp(this.brake, cmd.brake, cr);

    // 4. Integrate forces / moments.
    if (this.weightOnWheels) {
      this.integrateGround(dt, cmd);
    } else {
      this.integrateAir(dt, cmd);
    }

    // 5. SWEPT COLLISION: cast from previous position to new position; if we
    //    intersect terrain, clamp to the hit point and reset vertical velocity.
    //    This is the piece point-sample physics cannot get right.
    _from.copy(this.pos).sub(this.vel.clone().multiplyScalar(dt));
    _to.copy(this.pos);
    const hit = terrain.sweep(_from, _to);
    if (hit && hit.hit) {
      this.pos.copy(hit.point);
      this.pos.y += this.cfg.ground.gearClearanceM;
      if (this.vel.y < 0) this.vel.y = 0;
      // Touchdown: transition to rollout if forward speed is high, else parked.
      this.weightOnWheels = true;
      this.phase = this.vel.length() > 3 ? 'rollout' : 'parked';
      this.pitchRate = this.rollRate = 0;
    }

    // 6. Rebuild snapshot (single authoritative source for consumers).
    this.snapshot = this.buildSnapshot();
  }

  private integrateGround(dt: number, cmd: AirframeCommand): void {
    const { aero, engine, ground, authority } = this.cfg;
    const normal = _up.set(0, 1, 0);
    _forward.set(0, 0, -1).applyQuaternion(this.quat);
    _forward.y = 0;
    _forward.normalize();
    _right.copy(_forward).cross(normal).normalize();

    const fwdSpeed = this.vel.dot(_forward);
    const throttleAccel = (this.throttle * engine.maxThrustN) / this.cfg.mass.kg;
    const rollingAccel = ground.rollingResistance * GRAVITY;
    const brakeAccel = this.brake * ground.brakeDecelMs2;
    const q = 0.5 * AIR_DENSITY * fwdSpeed * fwdSpeed;
    const dragAccel = (q * this.cfg.mass.wingAreaM2 * aero.cd0) / this.cfg.mass.kg;

    const newFwd = Math.min(
      Math.max(fwdSpeed + (throttleAccel - rollingAccel - brakeAccel - dragAccel) * dt, 0),
      aero.maxSpeedMs,
    );

    // Steering
    const steer = this.rudder * ground.steeringRadPerSec * THREE.MathUtils.smoothstep(newFwd, 0.5, 24) * dt;
    if (Math.abs(steer) > 0.0001) {
      _forward.applyAxisAngle(normal, steer).normalize();
    }

    // Pre-rotation visual: clamp pitch while below Vr to `maxGroundPitchDeg`,
    // but act immediately on stick (no smoothstep gate). Arcade feel.
    const rotationReady = newFwd >= aero.vrSpeedMs * 0.9;
    const targetPitchDeg = rotationReady
      ? cmd.elevator * 12 // full rotation authority above Vr
      : cmd.elevator * ground.maxGroundPitchDeg;

    // Apply attitude directly (ground lock — no free-pitch integration).
    _euler.set(THREE.MathUtils.degToRad(targetPitchDeg), Math.atan2(-_forward.x, -_forward.z), 0, 'YXZ');
    this.quat.setFromEuler(_euler);

    // Move.
    const move = _forward.clone().multiplyScalar(newFwd * dt);
    this.pos.add(move);
    this.pos.y = this.groundHeight + ground.gearClearanceM;
    this.vel.copy(_forward).multiplyScalar(newFwd);

    // Liftoff gate.
    const aero_ = this.computeLiftDrag(newFwd);
    const liftRatio = aero_.lift / (this.cfg.mass.kg * GRAVITY);
    if (rotationReady && cmd.elevator > 0.08 && liftRatio >= 0.4) {
      this.weightOnWheels = false;
      this.phase = 'rotation';
      this.vel.y += Math.max(1.5, newFwd * 0.04);
    } else {
      this.phase = rotationReady ? 'rotation'
        : newFwd < 0.75 && this.throttle < 0.05 ? 'parked'
        : newFwd < 8 ? 'taxi' : 'takeoff_roll';
    }
  }

  private integrateAir(dt: number, cmd: AirframeCommand): void {
    const { aero, engine, authority, stability, feel } = this.cfg;
    const a = this.computeLiftDrag(this.vel.length());

    const q = 0.5 * AIR_DENSITY * a.airspeed * a.airspeed;
    const qRef = 0.5 * AIR_DENSITY * aero.vrSpeedMs * aero.vrSpeedMs;
    const authorityScale = clamp(q / qRef, 0.15, 2.2);

    // PD loops are already resolved in buildCommand for assist tier. Here we
    // just apply control-surface torque with damping.
    const pitchAccel = cmd.elevator * authority.elevator * authorityScale
      - this.pitchRate * stability.pitchDamp
      + (cmd.assist ? -(a.alphaRad - THREE.MathUtils.degToRad(aero.trimAlphaDeg)) * stability.pitch : 0);
    const rollAccel = cmd.aileron * authority.aileron * authorityScale
      - this.rollRate * stability.rollDamp;
    const yawAccel = cmd.rudder * authority.rudder * authorityScale
      - this.yawRate * stability.yawDamp
      - a.betaRad * stability.yaw;

    this.pitchRate = clamp(this.pitchRate + pitchAccel * dt, -authority.maxPitchRate, authority.maxPitchRate);
    this.rollRate = clamp(this.rollRate + rollAccel * dt, -authority.maxRollRate, authority.maxRollRate);
    this.yawRate = clamp(this.yawRate + yawAccel * dt, -authority.maxYawRate, authority.maxYawRate);

    // Integrate rotation.
    this.applyRate(new THREE.Vector3(0, 0, -1), this.rollRate * dt);
    this.applyRate(new THREE.Vector3(1, 0, 0), this.pitchRate * dt);
    this.applyRate(new THREE.Vector3(0, 1, 0), this.yawRate * dt);

    // Forces. Thrust floors at staticThrustFloor * maxThrust to avoid zero-speed lockout.
    const thrustScale = THREE.MathUtils.smoothstep(a.forwardSpeed, aero.stallSpeedMs * 0.15, aero.stallSpeedMs * 0.5);
    const thrustN = this.throttle * engine.maxThrustN * Math.max(thrustScale, engine.staticThrustFloor);
    _forceLocal.set(0, 0, -thrustN);
    if (a.airspeed > 0.1) {
      _forceLocal.z -= a.drag; // drag opposes motion (already body-local)
      _forceLocal.y += a.lift;
      _forceLocal.x += a.sideForce;
    }
    _forceWorld.copy(_forceLocal).applyQuaternion(this.quat);
    _forceWorld.y -= this.cfg.mass.kg * GRAVITY;
    this.vel.addScaledVector(_forceWorld, dt / this.cfg.mass.kg);

    if (this.vel.length() > aero.maxSpeedMs) {
      this.vel.setLength(aero.maxSpeedMs);
    }
    this.pos.addScaledVector(this.vel, dt);

    this.phase = a.stalled ? 'stall' : this.pos.y - this.groundHeight < 50 ? 'climb' : 'cruise';
  }

  private applyRate(bodyAxis: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 0.0001) return;
    _axis.copy(bodyAxis).applyQuaternion(this.quat).normalize();
    _dq.setFromAxisAngle(_axis, angle);
    this.quat.premultiply(_dq).normalize();
  }

  private computeLiftDrag(_speed: number) {
    _invQ.copy(this.quat).invert();
    _velLocal.copy(this.vel).applyQuaternion(_invQ);
    const forwardSpeed = Math.max(0, -_velLocal.z);
    const airspeed = Math.max(_velLocal.length(), 0.1);
    const alphaRad = Math.atan2(-_velLocal.y, Math.max(forwardSpeed, 0.1));
    const betaRad = Math.atan2(_velLocal.x, Math.max(forwardSpeed, 0.1));
    const { aero } = this.cfg;
    const stalled = Math.abs(THREE.MathUtils.radToDeg(alphaRad)) >= aero.alphaStallDeg;
    const cl = clamp(aero.cl0 + aero.clAlpha * alphaRad + this.elevator * 0.22, -aero.clMax, aero.clMax)
      * (stalled ? 0.5 : 1);
    const q = 0.5 * AIR_DENSITY * airspeed * airspeed;
    return {
      airspeed,
      forwardSpeed,
      alphaRad,
      betaRad,
      lift: q * this.cfg.mass.wingAreaM2 * cl,
      drag: q * this.cfg.mass.wingAreaM2 * (aero.cd0 + aero.inducedDragK * cl * cl),
      sideForce: q * this.cfg.mass.wingAreaM2 * (-betaRad * aero.sideForceCoefficient),
      stalled,
    };
  }

  private buildSnapshot(): AirframeState {
    _euler.setFromQuaternion(this.quat, 'YXZ');
    const airspeed = this.vel.length();
    _invQ.copy(this.quat).invert();
    _velLocal.copy(this.vel).applyQuaternion(_invQ);
    const aoaDeg = THREE.MathUtils.radToDeg(Math.atan2(-_velLocal.y, Math.max(-_velLocal.z, 0.1)));
    return {
      position: this.pos,
      quaternion: this.quat,
      velocity: this.vel,
      effectors: {
        throttle: this.throttle,
        elevator: this.elevator,
        aileron: this.aileron,
        rudder: this.rudder,
        brake: this.brake,
      },
      phase: this.phase,
      weightOnWheels: this.weightOnWheels,
      airspeedMs: airspeed,
      altitudeAGL: Math.max(0, this.pos.y - (this.groundHeight + this.cfg.ground.gearClearanceM)),
      pitchDeg: THREE.MathUtils.radToDeg(_euler.x),
      rollDeg: THREE.MathUtils.radToDeg(_euler.z),
      headingDeg: ((THREE.MathUtils.radToDeg(_euler.y) % 360) + 360) % 360,
      verticalSpeedMs: this.vel.y,
      aoaDeg,
      isStalled: Math.abs(aoaDeg) >= this.cfg.aero.alphaStallDeg && !this.weightOnWheels,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function pitchRateDeg(s: AirframeState): number {
  // Derived from last two snapshots in production; spike assumes caller tracks.
  // Included as zero here; assist PD still converges via P term alone in spike.
  return 0;
}
function rollRateDeg(s: AirframeState): number {
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference config — Skyraider ported into the new schema for comparison
// ─────────────────────────────────────────────────────────────────────────────

export const SKYRAIDER_AIRFRAME: AirframeConfig = {
  id: 'A1_SKYRAIDER',
  mass: { kg: 8200, wingAreaM2: 37.2 },
  engine: { maxThrustN: 50000, throttleResponsePerSec: 1.6, staticThrustFloor: 0.3 },
  aero: {
    stallSpeedMs: 38,
    vrSpeedMs: 42,
    v2SpeedMs: 50,
    maxSpeedMs: 120,
    cl0: 0.28,
    clAlpha: 4.4,
    clMax: 1.6,
    alphaStallDeg: 15,
    cd0: 0.032,
    inducedDragK: 0.06,
    sideForceCoefficient: 1.2,
    trimAlphaDeg: 4.0,
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
    maxGroundPitchDeg: 6, // higher than current 4°; arcade-feel bias
  },
  feel: {
    rawPitchScale: 0.85,
    rawRollScale: 0.75,
    rawYawScale: 0.45,
    assistPitchP: 0.07, // deg → unit stick
    assistPitchD: 0.004,
    assistRollP: 0.04,
    assistRollD: 0.008,
    assistMaxBankDeg: 45,
    assistMaxPitchDeg: 25,
    coordYawScale: 0.15,
    autoLevelStrength: 0.8,
  },
};
