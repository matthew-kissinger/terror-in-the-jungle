// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { FixedStepRunner } from '../../utils/FixedStepRunner';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import {
  DEFAULT_BUOYANCY_CONFIG,
  type BuoyancyConfig,
  type BuoyancySamplerLike,
} from '../environment/water/BuoyancyForce';

/**
 * Hand-rolled watercraft hull physics — fixed-step rigid-body sim that
 * generalizes the `GroundVehiclePhysics` corner-conform pattern to a water
 * surface via the per-sample buoyancy contract authored in VODA-2 (cycle #7
 * `BuoyancyForce` / `WaterSurfaceSampler`).
 *
 * Method (per brief `cycle-voda-3-watercraft.md` §"watercraft-physics-core"):
 *
 *   1. For each hull-sample point, transform local -> world, then call the
 *      water sampler (`sampleWaterInteraction`) to get water surface Y,
 *      immersion ratio, and channel flow velocity.
 *   2. Per-sample buoyancy force is the Archimedes term scaled by immersion:
 *        F_buoy_i = gravity * waterDensity * (hullDisplacement / N) * immersion_i
 *      Applied at each sample position so the *spread* of submerged samples
 *      drives pitch + roll (taller bow sample -> bow rises). Yaw rate is
 *      integrated separately under rudder authority; we slave the pitch and
 *      roll components of the hull quaternion to the hull-sample plane
 *      reconstructed from the per-sample target heights.
 *   3. Throttle drives forward force: `F = enginePower * throttle * forward`.
 *   4. Rudder drives yaw rate via critically-damped tracking toward
 *      `rudderAuthority * rudder`.
 *   5. Quadratic drag (water is much denser than air) on both linear and
 *      angular velocity.
 *   6. River current is the immersion-weighted average of per-sample flow
 *      velocities, half-coupled into the horizontal velocity each step.
 *   7. Beach / bank docking: when any hull sample lies within
 *      `groundContactThreshold` of terrain Y, the craft is grounded. While
 *      grounded, horizontal speed is clamped to a slow drift; throttle still
 *      pushes off.
 *   8. Bridge-clearance probe (`isUnderBridge`) is stubbed `false` — wiring
 *      to the navigation / structure query lands in cycle-voda-3-R2.
 *
 * No external physics library. Explicit Euler at 1/60 s via `FixedStepRunner`,
 * matching `GroundVehiclePhysics` + `TrackedVehiclePhysics`. ITerrainRuntime
 * is consumed read-only — no fence change.
 */

// ---------- Module-scope scratch (no per-step allocation) ----------
const _forward = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _sampleLocal = new THREE.Vector3();
const _sampleWorld = new THREE.Vector3();
const _hullNormal = new THREE.Vector3();
const _flowAccum = new THREE.Vector3();
const _yawAxis = new THREE.Vector3(0, 1, 0);
const _yawQuat = new THREE.Quaternion();
const _conformQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _bowMid = new THREE.Vector3();
const _sternMid = new THREE.Vector3();
const _portMid = new THREE.Vector3();
const _starMid = new THREE.Vector3();
const _hullForeAft = new THREE.Vector3();
const _hullPortStar = new THREE.Vector3();
const _conformTarget = new THREE.Quaternion();

const SPEED_EPS = 1e-4;
const FLOW_COUPLING = 0.5;            // half-coupled (real hull does not perfectly track surface flow)
const GROUNDED_DRIFT_LIMIT = 0.5;     // m/s horizontal cap while beached
const DEFAULT_GROUND_CONTACT_THRESHOLD = 0.2; // m
const DEFAULT_BRIDGE_CLEARANCE = 1.5; // m hull-top clearance
const DEFAULT_YAW_DAMPING = 0.7;      // exponential per-second base for yaw bleed
const RUDDER_TAU = 0.5;               // s — rudder command -> yaw rate convergence
const PITCH_ROLL_TAU = 0.25;          // s — hull pose -> hull-plane normal slerp
const HULL_HEIGHT_FOR_IMMERSION = 1.2; // m — per-sample column height for immersion clamp

export interface WatercraftPhysicsConfig {
  /** Hull-sample positions in local space (typically 4 corners + center). */
  hullSamplePoints: ReadonlyArray<THREE.Vector3>;
  /** Total buoyant volume (m^3) — Archimedes displacement when fully submerged. */
  hullDisplacement: number;
  /** Hull mass (kg). */
  mass: number;
  /** Forward thrust at full throttle (N). */
  enginePower: number;
  /** Yaw rate at full rudder (rad/s). */
  rudderAuthority: number;
  /** Quadratic linear drag coefficient: F_drag = c * |v|^2. */
  dragCoefficient: number;
  /** Hull-top clearance for bridge probe (m). Optional; default 1.5. */
  bridgeClearance?: number;
  /** Beach contact threshold (m); sample within this of terrain Y => grounded. */
  groundContactThreshold?: number;
  /** Optional gravity override (m/s^2, positive). Default 9.81. */
  gravity?: number;
  /** Optional water density override (kg/m^3). Default 1000. */
  waterDensity?: number;
  initialPosition?: THREE.Vector3;
  initialQuaternion?: THREE.Quaternion;
}

export interface HullSampleResult {
  /** World-space position of the sample this step. */
  worldPosition: THREE.Vector3;
  /** Water surface Y at this sample, or NaN when dry. */
  waterHeight: number;
  /** Fraction submerged below water surface, 0..1. */
  immersion: number;
  /** Channel flow velocity at this sample (XZ; y always 0). */
  flowVelocity: THREE.Vector3;
}

export interface WatercraftState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Yaw rate (rad/s about world Y). */
  angularVelocity: number;
  throttle: number;
  rudder: number;
  grounded: boolean;
}

interface InternalState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  yawRate: number;
  throttle: number;
  rudder: number;
  grounded: boolean;
  hullSamples: HullSampleResult[];
}

export class WatercraftPhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;

  private readonly cfg: Required<Omit<WatercraftPhysicsConfig,
    'initialPosition' | 'initialQuaternion'>> & {
      hullSamplePoints: ReadonlyArray<THREE.Vector3>;
    };
  private readonly buoyancyCfg: BuoyancyConfig;
  private readonly stepper = new FixedStepRunner(WatercraftPhysics.FIXED_STEP_SECONDS);
  private readonly sampleCount: number;
  private readonly localSamples: ReadonlyArray<THREE.Vector3>;
  private readonly perSampleVolume: number;

  private sampler: BuoyancySamplerLike | null = null;
  private state: InternalState;

  constructor(config: WatercraftPhysicsConfig) {
    if (!config.hullSamplePoints || config.hullSamplePoints.length === 0) {
      throw new Error('WatercraftPhysics: hullSamplePoints must be non-empty');
    }
    if (config.hullDisplacement <= 0) {
      throw new Error('WatercraftPhysics: hullDisplacement must be positive');
    }
    if (config.mass <= 0) {
      throw new Error('WatercraftPhysics: mass must be positive');
    }

    this.cfg = {
      hullSamplePoints: config.hullSamplePoints,
      hullDisplacement: config.hullDisplacement,
      mass: config.mass,
      enginePower: config.enginePower,
      rudderAuthority: config.rudderAuthority,
      dragCoefficient: config.dragCoefficient,
      bridgeClearance: config.bridgeClearance ?? DEFAULT_BRIDGE_CLEARANCE,
      groundContactThreshold:
        config.groundContactThreshold ?? DEFAULT_GROUND_CONTACT_THRESHOLD,
      gravity: config.gravity ?? DEFAULT_BUOYANCY_CONFIG.gravity,
      waterDensity: config.waterDensity ?? DEFAULT_BUOYANCY_CONFIG.waterDensity,
    };
    this.buoyancyCfg = {
      ...DEFAULT_BUOYANCY_CONFIG,
      gravity: this.cfg.gravity,
      waterDensity: this.cfg.waterDensity,
    };

    // Defensive clone of caller-owned sample points so external mutation does
    // not bleed into our hot path. Public ReadonlyArray contract is preserved
    // because we never mutate the input array.
    this.localSamples = config.hullSamplePoints.map((p) => p.clone());
    this.sampleCount = this.localSamples.length;
    this.perSampleVolume = this.cfg.hullDisplacement / this.sampleCount;

    this.state = this.makeBlankState(
      config.initialPosition ?? new THREE.Vector3(),
      config.initialQuaternion ?? new THREE.Quaternion(),
    );
  }

  // ---------- Public surface ----------

  /**
   * Bind the water sampler used to query surface Y + flow velocity per hull
   * sample. Typically the `WaterSystem` itself (which implements
   * `BuoyancySamplerLike` via `sampleWaterInteraction`). Tests pass a stub.
   *
   * Idempotent. Calling with `null` detaches; subsequent `update()` calls
   * will treat all hull samples as dry (no buoyancy, no flow coupling).
   */
  setWaterSampler(sampler: BuoyancySamplerLike | null): void {
    this.sampler = sampler;
  }

  update(dt: number, terrain: ITerrainRuntime | undefined): void {
    const terrainArg = terrain ?? null;
    this.stepper.step(dt, (fixedDt) => {
      this.simulateStep(fixedDt, terrainArg);
    });
  }

  /** throttle in [-1,1], rudder in [-1,1]. Clamps both. */
  setControls(throttle: number, rudder: number): void {
    this.state.throttle = THREE.MathUtils.clamp(throttle, -1, 1);
    this.state.rudder = THREE.MathUtils.clamp(rudder, -1, 1);
  }

  setPosition(pos: THREE.Vector3): void {
    this.state.position.copy(pos);
    this.state.velocity.set(0, 0, 0);
    // Resample hull positions so the next-frame report is consistent before
    // the next integration step actually runs.
    this.resampleHullPositions();
  }

  setQuaternion(q: THREE.Quaternion): void {
    this.state.quaternion.copy(q).normalize();
    this.state.yawRate = 0;
    this.resampleHullPositions();
  }

  getState(): WatercraftState {
    return {
      position: this.state.position,
      velocity: this.state.velocity,
      quaternion: this.state.quaternion,
      angularVelocity: this.state.yawRate,
      throttle: this.state.throttle,
      rudder: this.state.rudder,
      grounded: this.state.grounded,
    };
  }

  /** Signed forward speed (negative = reversing). */
  getForwardSpeed(): number {
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);
    return this.state.velocity.dot(_forward);
  }

  getHullSamples(): ReadonlyArray<HullSampleResult> {
    return this.state.hullSamples;
  }

  isGrounded(): boolean {
    return this.state.grounded;
  }

  /**
   * Stub: bridge-clearance probe. Always returns false in R1; the navigation
   * / structure query that resolves overhead clearance lands in R2 (sampan /
   * PBR integration). Exposed now so tests + adapters can lock in the API.
   *
   * TODO(cycle-voda-3-R2): wire structure raycast against
   * `cfg.bridgeClearance` above each hull sample.
   */
  isUnderBridge(): boolean {
    return false;
  }

  dispose(): void {
    this.sampler = null;
    this.state.velocity.set(0, 0, 0);
    this.state.yawRate = 0;
    this.state.throttle = 0;
    this.state.rudder = 0;
  }

  // ---------- Construction helpers ----------

  private makeBlankState(
    initialPosition: THREE.Vector3,
    initialQuaternion: THREE.Quaternion,
  ): InternalState {
    const samples: HullSampleResult[] = [];
    for (let i = 0; i < this.sampleCount; i += 1) {
      samples.push({
        worldPosition: new THREE.Vector3(),
        waterHeight: Number.NaN,
        immersion: 0,
        flowVelocity: new THREE.Vector3(),
      });
    }
    const state: InternalState = {
      position: initialPosition.clone(),
      velocity: new THREE.Vector3(),
      quaternion: initialQuaternion.clone().normalize(),
      yawRate: 0,
      throttle: 0,
      rudder: 0,
      grounded: false,
      hullSamples: samples,
    };
    // Populate world sample positions so the first getHullSamples() call
    // before any update reports something coherent.
    for (let i = 0; i < this.sampleCount; i += 1) {
      _sampleLocal.copy(this.localSamples[i]);
      _sampleWorld.copy(_sampleLocal)
        .applyQuaternion(state.quaternion)
        .add(state.position);
      state.hullSamples[i].worldPosition.copy(_sampleWorld);
    }
    return state;
  }

  private resampleHullPositions(): void {
    for (let i = 0; i < this.sampleCount; i += 1) {
      _sampleLocal.copy(this.localSamples[i]);
      _sampleWorld.copy(_sampleLocal)
        .applyQuaternion(this.state.quaternion)
        .add(this.state.position);
      this.state.hullSamples[i].worldPosition.copy(_sampleWorld);
    }
  }

  // ---------- Per-step simulation ----------

  private simulateStep(dt: number, terrain: ITerrainRuntime | null): void {
    this.queryHullSamples();             // resample world + immersion + flow
    this.integrateLinear(dt);            // gravity + per-sample buoyancy on Y
    this.integrateControls(dt);          // throttle thrust + rudder yaw + drag
    this.applyFlowCoupling(dt);          // half-coupled river-current push
    this.updateGrounded(terrain);        // beach / bank docking transition
    this.integratePose(dt);              // XZ + yaw + pitch/roll slerp
    this.resampleHullPositions();        // sync public hull-sample report
  }

  // ---------- Step (1): hull-sample water query ----------

  private queryHullSamples(): void {
    for (let i = 0; i < this.sampleCount; i += 1) {
      _sampleLocal.copy(this.localSamples[i]);
      _sampleWorld.copy(_sampleLocal)
        .applyQuaternion(this.state.quaternion)
        .add(this.state.position);
      const out = this.state.hullSamples[i];
      out.worldPosition.copy(_sampleWorld);

      if (!this.sampler) {
        out.waterHeight = Number.NaN;
        out.immersion = 0;
        out.flowVelocity.set(0, 0, 0);
        continue;
      }
      const sample = this.sampler.sampleWaterInteraction(_sampleWorld);
      if (sample.surfaceY === null) {
        out.waterHeight = Number.NaN;
        out.immersion = 0;
        out.flowVelocity.set(0, 0, 0);
        continue;
      }
      out.waterHeight = sample.surfaceY;
      // Per-brief: immersion = clamp((waterHeight - sample.y) / hullHeight, 0, 1).
      // `sample.immersion01` from the sampler caps at the configured immersion
      // depth (default 1.6 m). For hull buoyancy we want a finer-grained
      // ratio over our per-sample column height so the spread between
      // partially-submerged samples drives the rocking torque. Recompute
      // locally from the surface Y the sampler returned.
      const depth = sample.surfaceY - _sampleWorld.y;
      out.immersion = THREE.MathUtils.clamp(depth / HULL_HEIGHT_FOR_IMMERSION, 0, 1);
      out.flowVelocity.copy(sample.flowVelocity);
    }
  }

  // ---------- Step (2): buoyancy + gravity ----------

  private integrateLinear(dt: number): void {
    // Gravity is unconditional; buoyancy is per-sample and additive.
    const m = this.cfg.mass;
    const gWeight = -this.cfg.gravity * m;

    // Sum buoyant force (vertical only — Archimedes ~ straight up). Per
    // brief: F_buoy_i = g * rho * sampleVolume * immersion_i.
    let totalBuoyN = 0;
    let immersionSum = 0;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const im = this.state.hullSamples[i].immersion;
      immersionSum += im;
      if (im > 0) {
        totalBuoyN += this.cfg.gravity * this.cfg.waterDensity
          * this.perSampleVolume * im;
      }
    }

    // v_y += a_y * dt where a_y = (F_gravity + F_buoy) / m.
    const accelY = (gWeight + totalBuoyN) / m;
    this.state.velocity.y += accelY * dt;

    // Vertical hydrodynamic damping. Gravity + per-sample buoyancy form a
    // conservative spring on Y; without damping the hull oscillates around
    // its equilibrium waterline forever. Mirror `BuoyancyForce.applyBuoyancyForce`
    // (exponential decay scaled by immersion) so a fully airborne hull falls
    // freely while a partially submerged hull bleeds vertical energy in
    // proportion to how much of it is wetted. The 5.0 multiplier is tuned so
    // a typical fixture hull (mass 250kg, displacement 0.5 m^3, drag 1.4)
    // settles to its equilibrium waterline within ~3s of physical time —
    // empirically the per-second envelope drops below 0.1 m by t=3s and is
    // sub-mm by t=5s. Wave heave responsiveness is preserved because the
    // damping rate is small per fixed-step (dt = 1/60s) and only activates
    // when samples are actually wetted.
    const meanImmersion = immersionSum / this.sampleCount;
    if (meanImmersion > 0 && this.cfg.dragCoefficient > 0) {
      const verticalDampingRate = this.cfg.dragCoefficient * 5.0;
      const dampFactor = Math.exp(-verticalDampingRate * meanImmersion * dt);
      this.state.velocity.y *= dampFactor;
    }

    // Integrate Y position (X and Z are integrated together in integratePose
    // after thrust + drag + flow accumulation so we apply pose update once).
    this.state.position.y += this.state.velocity.y * dt;
  }

  // ---------- Step (3): throttle + rudder + drag ----------

  private integrateControls(dt: number): void {
    // Forward thrust scales by throttle. Engine produces no force when fully
    // out of the water (no immersion anywhere) — keeps a beached craft from
    // self-propelling through the air.
    const anySubmerged = this.anySampleSubmerged();
    _forward.set(0, 0, -1).applyQuaternion(this.state.quaternion);

    const m = this.cfg.mass;
    const thrustN = (anySubmerged || this.state.grounded)
      ? this.cfg.enginePower * this.state.throttle
      : 0;
    // a = F/m -> dv = a * dt; force vector along forward direction.
    if (thrustN !== 0) {
      const dv = (thrustN / m) * dt;
      this.state.velocity.x += _forward.x * dv;
      this.state.velocity.z += _forward.z * dv;
    }

    // Quadratic linear drag on horizontal velocity (water-dense).
    const vx = this.state.velocity.x;
    const vz = this.state.velocity.z;
    const speed = Math.hypot(vx, vz);
    if (speed > SPEED_EPS && this.cfg.dragCoefficient > 0) {
      // F_drag = -c * |v|^2 * vHat; a_drag = F/m; dv = a*dt.
      // Cap drag so it can never reverse velocity within one step.
      const dragMag = this.cfg.dragCoefficient * speed * speed;
      const stopForce = (m * speed) / Math.max(dt, 1e-6);
      const effective = Math.min(dragMag, stopForce);
      const dv = (effective / m) * dt;
      const dvx = -(vx / speed) * dv;
      const dvz = -(vz / speed) * dv;
      this.state.velocity.x += dvx;
      this.state.velocity.z += dvz;
    }

    // Rudder authority: tracking target yaw rate. Authority disabled when no
    // sample is submerged (rudder needs water bite).
    const yawTarget = (anySubmerged || this.state.grounded)
      ? this.cfg.rudderAuthority * this.state.rudder
      : 0;
    const blend = Math.min(dt / RUDDER_TAU, 1.0);
    this.state.yawRate = THREE.MathUtils.lerp(this.state.yawRate, yawTarget, blend);

    // Angular drag: exponential bleed when rudder is centered. With rudder
    // input, the tracking term above already pulls toward yawTarget; here we
    // just damp the residual a little so a hard rudder release decays fast.
    const yawDamp = Math.pow(DEFAULT_YAW_DAMPING, dt);
    if (Math.abs(this.state.rudder) < 1e-3) {
      this.state.yawRate *= yawDamp;
    }
  }

  // ---------- Step (4): river current half-coupling ----------

  private applyFlowCoupling(dt: number): void {
    // Immersion-weighted average of per-sample flow vectors. Outside any
    // hydrology channel all flow vectors are (0,0,0) so this is a no-op.
    _flowAccum.set(0, 0, 0);
    let weight = 0;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const s = this.state.hullSamples[i];
      const w = s.immersion;
      if (w > 0) {
        _flowAccum.x += s.flowVelocity.x * w;
        _flowAccum.z += s.flowVelocity.z * w;
        weight += w;
      }
    }
    if (weight <= 0) return;
    _flowAccum.x /= weight;
    _flowAccum.z /= weight;

    // Convergent half-coupling: a real hull does not perfectly track surface
    // flow. Mirror `BuoyancyForce.applyBuoyancyForce`'s exponential blend so
    // horizontal velocity converges toward `flow * FLOW_COUPLING` rather than
    // accumulating unbounded under sustained current. `rate=1.0` puts the
    // half-way convergence at ~0.7s; the half-coupling cap (0.5) keeps the
    // steady-state at half-channel speed so a free-drifting hull doesn't
    // out-run the surface current.
    const rate = 1.0;
    const blend = 1 - Math.exp(-rate * dt);
    this.state.velocity.x += blend * (_flowAccum.x * FLOW_COUPLING - this.state.velocity.x);
    this.state.velocity.z += blend * (_flowAccum.z * FLOW_COUPLING - this.state.velocity.z);
  }

  // ---------- Step (5): beach / bank docking ----------

  private updateGrounded(terrain: ITerrainRuntime | null): void {
    if (!terrain) {
      // Conservative: treat as afloat. Beach docking requires terrain.
      this.state.grounded = false;
      return;
    }
    let grounded = false;
    const threshold = this.cfg.groundContactThreshold;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const sw = this.state.hullSamples[i].worldPosition;
      // Skip samples that fall outside the playable terrain extent; the
      // terrain returns 0 for out-of-bounds, which would spuriously trigger
      // grounded for ocean-going craft far from the playable rectangle.
      const half = terrain.getPlayableWorldSize() * 0.5;
      if (Math.abs(sw.x) > half || Math.abs(sw.z) > half) continue;
      const terrainY = terrain.getHeightAt(sw.x, sw.z);
      if (sw.y - terrainY <= threshold) {
        grounded = true;
        break;
      }
    }
    this.state.grounded = grounded;

    if (grounded) {
      // Clamp horizontal speed to a slow drift; reverse / forward throttle
      // can still push off (the thrust term ran before this clamp, so the
      // operator gets one step of bite per frame; over multiple frames the
      // clamp lets us pull off the beach without sliding fast on dry land).
      const vx = this.state.velocity.x;
      const vz = this.state.velocity.z;
      const speed = Math.hypot(vx, vz);
      if (speed > GROUNDED_DRIFT_LIMIT) {
        const scale = GROUNDED_DRIFT_LIMIT / speed;
        this.state.velocity.x = vx * scale;
        this.state.velocity.z = vz * scale;
      }
    }
  }

  // ---------- Step (6): integrate pose ----------

  private integratePose(dt: number): void {
    // Horizontal position from velocity (Y was integrated by integrateLinear).
    this.state.position.x += this.state.velocity.x * dt;
    this.state.position.z += this.state.velocity.z * dt;

    // Yaw integration about world Y.
    if (Math.abs(this.state.yawRate) > 1e-6) {
      const angle = this.state.yawRate * dt;
      _yawQuat.setFromAxisAngle(_yawAxis, angle);
      this.state.quaternion.premultiply(_yawQuat).normalize();
    }

    // Pitch + roll: slerp toward the hull-sample plane normal. When the
    // craft sits flush on the water (uniform immersion), the target normal
    // is world up so the conform is identity (no rocking). When the water
    // surface tilts (wave) or the immersion is asymmetric (boarding shifts
    // weight), the normal tilts and the hull tilts with it. We extract the
    // current yaw and rebuild quaternion = pitchRoll * yaw so yaw integration
    // is preserved.
    this.computeHullPlaneNormal(_hullNormal);
    if (_hullNormal.lengthSq() < 1e-6) {
      _hullNormal.copy(_worldUp);
    } else {
      _hullNormal.normalize();
    }

    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');
    const yaw = _euler.y;
    _yawQuat.setFromAxisAngle(_yawAxis, yaw);
    _conformQuat.setFromUnitVectors(_worldUp, _hullNormal);
    _conformTarget.multiplyQuaternions(_conformQuat, _yawQuat).normalize();

    // Slerp toward target with a fixed time constant so the hull rocks
    // smoothly (no instant snap to wave normal each step).
    const slerpBlend = Math.min(dt / PITCH_ROLL_TAU, 1.0);
    this.state.quaternion.slerp(_conformTarget, slerpBlend).normalize();
  }

  // ---------- Helpers ----------

  private anySampleSubmerged(): boolean {
    for (let i = 0; i < this.sampleCount; i += 1) {
      if (this.state.hullSamples[i].immersion > 0) return true;
    }
    return false;
  }

  /**
   * Reconstruct an approximate hull-plane normal from per-sample water
   * heights. With 4 corner samples (FL/FR/RL/RR convention: local x<0=port,
   * x>0=starboard, z<0=bow, z>0=stern) the cross product of fore-aft and
   * port-starboard tangents on the wave surface gives a tilt vector that
   * drives visual rocking. With < 3 samples or a degenerate layout, returns
   * world up (no rocking). Intent: *visual rocking*, not precise torque.
   */
  private computeHullPlaneNormal(out: THREE.Vector3): void {
    if (this.sampleCount < 3) { out.copy(_worldUp); return; }

    _bowMid.set(0, 0, 0); _sternMid.set(0, 0, 0);
    _portMid.set(0, 0, 0); _starMid.set(0, 0, 0);
    let bowN = 0, sternN = 0, portN = 0, starN = 0;

    for (let i = 0; i < this.sampleCount; i += 1) {
      const local = this.localSamples[i];
      const world = this.state.hullSamples[i].worldPosition;
      const sampleH = this.state.hullSamples[i];
      // Wet samples ride the wave; dry samples keep their current Y so they
      // don't drag the hull plane off vertical.
      const targetY = Number.isNaN(sampleH.waterHeight) ? world.y : sampleH.waterHeight;
      const probe = _sampleWorld.set(world.x, targetY, world.z);
      if (local.z < 0) { _bowMid.add(probe); bowN += 1; }
      if (local.z > 0) { _sternMid.add(probe); sternN += 1; }
      if (local.x < 0) { _portMid.add(probe); portN += 1; }
      if (local.x > 0) { _starMid.add(probe); starN += 1; }
    }

    if (bowN > 0) _bowMid.divideScalar(bowN);
    if (sternN > 0) _sternMid.divideScalar(sternN);
    if (portN > 0) _portMid.divideScalar(portN);
    if (starN > 0) _starMid.divideScalar(starN);

    const hasForeAft = bowN > 0 && sternN > 0;
    const hasPortStar = portN > 0 && starN > 0;
    if (!hasForeAft && !hasPortStar) { out.copy(_worldUp); return; }

    if (hasForeAft) _hullForeAft.subVectors(_bowMid, _sternMid);
    else _hullForeAft.set(0, 0, -1);
    if (hasPortStar) _hullPortStar.subVectors(_starMid, _portMid);
    else _hullPortStar.set(1, 0, 0);
    // Right-hand rule: portStar x foreAft -> +Y under our axis convention.
    out.crossVectors(_hullPortStar, _hullForeAft);
    if (out.y < 0) out.multiplyScalar(-1);
  }
}
