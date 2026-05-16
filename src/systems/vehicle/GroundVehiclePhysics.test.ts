/**
 * GroundVehiclePhysics behavior tests.
 *
 * Authoritative scope: docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md
 * Task brief: docs/tasks/cycle-vekhikl-1-jeep-drivable.md
 *
 * --- API contract (enforced by these tests) ---
 *
 * class GroundVehiclePhysics {
 *   static readonly FIXED_STEP_SECONDS = 1 / 60;
 *
 *   constructor(initialPosition: THREE.Vector3, config?: Partial<GroundVehicleConfig>);
 *
 *   update(deltaTime: number, terrain: ITerrainRuntime): void;
 *
 *   setControls(controls: Partial<GroundVehicleControls>): void;
 *   setEngineActive(active: boolean): void;
 *   getState(): Readonly<GroundVehicleState>;
 *   getControls(): Readonly<GroundVehicleControls>;
 *   resetToStable(position: THREE.Vector3): void;
 *   getGroundSpeed(): number;
 *   getHeading(): number;
 *   getEngineAudioParams(): { rpm: number; load: number };
 * }
 *
 * interface GroundVehicleState {
 *   position: THREE.Vector3;
 *   quaternion: THREE.Quaternion;
 *   velocity: THREE.Vector3;
 *   angularVelocity: THREE.Vector3;
 *   engineRPM: number;
 *   isGrounded: boolean;
 *   groundHeight: number;
 * }
 *
 * interface GroundVehicleControls {
 *   throttle: number;    // [-1, +1]
 *   steerAngle: number;  // radians
 *   brake: number;       // [0, 1]
 *   handbrake: boolean;
 * }
 *
 * interface GroundVehicleConfig {
 *   mass: number;
 *   wheelbase: number;
 *   trackWidth: number;
 *   engineTorque: number;
 *   gearRatio: number;
 *   wheelRadius: number;
 *   maxSteer: number;
 *   maxBrake: number;
 *   maxClimbSlope: number;    // radians
 *   rollingCoef: number;
 *   airDragCoef: number;
 *   velocityDamping: number;
 *   angularDamping: number;
 *   inputSmoothRate: number;
 *   axleOffset?: number;      // chassis height above terrain
 * }
 *
 * --- Why the local stub block below ---
 *
 * The sibling task `ground-vehicle-physics-core` lands the real
 * `GroundVehiclePhysics.ts` in parallel. To keep this PR green on `npm run
 * build` before that sibling merges, this file ships a minimal local stub
 * that mirrors the contract above. When the sibling merges first, the stub
 * block can be removed and the import switched to `./GroundVehiclePhysics`
 * — these tests will then exercise the real implementation and gate the
 * sibling against the brief's behavior plan.
 *
 * Tests are L2 (one system + mocked ITerrainRuntime) per docs/TESTING.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// =============================================================================
// Local stub of GroundVehiclePhysics — REMOVE when sibling
// `ground-vehicle-physics-core` lands. Switch import to:
//   import { GroundVehiclePhysics } from './GroundVehiclePhysics';
// =============================================================================

interface GroundVehicleControls {
  throttle: number;
  steerAngle: number;
  brake: number;
  handbrake: boolean;
}

interface GroundVehicleState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  engineRPM: number;
  isGrounded: boolean;
  groundHeight: number;
}

interface GroundVehicleConfig {
  mass: number;
  wheelbase: number;
  trackWidth: number;
  engineTorque: number;
  gearRatio: number;
  wheelRadius: number;
  maxSteer: number;
  maxBrake: number;
  maxClimbSlope: number;
  rollingCoef: number;
  airDragCoef: number;
  velocityDamping: number;
  angularDamping: number;
  inputSmoothRate: number;
  axleOffset: number;
}

const DEFAULT_CONFIG: GroundVehicleConfig = {
  mass: 1120,
  wheelbase: 2.06,
  trackWidth: 1.42,
  engineTorque: 3200,
  gearRatio: 4.0,
  wheelRadius: 0.39,
  maxSteer: 0.6,
  maxBrake: 14000,
  maxClimbSlope: 0.54,
  rollingCoef: 35,
  airDragCoef: 1.2,
  velocityDamping: 0.999,
  angularDamping: 0.85,
  inputSmoothRate: 8.0,
  axleOffset: 0.5,
};

class GroundVehiclePhysics {
  static readonly FIXED_STEP_SECONDS = 1 / 60;
  private static readonly GRAVITY = -9.81;

  private state: GroundVehicleState;
  private controls: GroundVehicleControls;
  private smoothed: GroundVehicleControls;
  private cfg: GroundVehicleConfig;
  private engineActive = false;
  private accumulator = 0;

  constructor(initialPosition: THREE.Vector3, config?: Partial<GroundVehicleConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    this.state = {
      position: initialPosition.clone(),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      engineRPM: 0,
      isGrounded: false,
      groundHeight: initialPosition.y,
    };
    this.controls = { throttle: 0, steerAngle: 0, brake: 0, handbrake: false };
    this.smoothed = { ...this.controls };
  }

  setControls(c: Partial<GroundVehicleControls>): void {
    Object.assign(this.controls, c);
  }

  setEngineActive(active: boolean): void {
    this.engineActive = active;
  }

  getState(): Readonly<GroundVehicleState> {
    return this.state;
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
    this.controls = { throttle: 0, steerAngle: 0, brake: 0, handbrake: false };
    this.smoothed = { ...this.controls };
  }

  getGroundSpeed(): number {
    const v = this.state.velocity;
    return Math.sqrt(v.x * v.x + v.z * v.z);
  }

  getHeading(): number {
    const e = new THREE.Euler().setFromQuaternion(this.state.quaternion, 'YXZ');
    let deg = THREE.MathUtils.radToDeg(e.y);
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  getEngineAudioParams(): { rpm: number; load: number } {
    return {
      rpm: this.state.engineRPM,
      load: Math.min(1, Math.abs(this.smoothed.throttle)),
    };
  }

  update(deltaTime: number, terrain: ITerrainRuntime): void {
    const fixed = GroundVehiclePhysics.FIXED_STEP_SECONDS;
    const clamped = Math.min(Math.max(deltaTime, 0), 0.15);
    this.accumulator = Math.min(this.accumulator + clamped, 0.15);
    while (this.accumulator >= fixed) {
      this.simulateStep(fixed, terrain);
      this.accumulator -= fixed;
    }
  }

  private simulateStep(dt: number, terrain: ITerrainRuntime): void {
    // Input smoothing
    const rate = Math.min(this.cfg.inputSmoothRate * dt, 1.0);
    this.smoothed.throttle = THREE.MathUtils.lerp(this.smoothed.throttle, this.controls.throttle, rate);
    this.smoothed.steerAngle = THREE.MathUtils.lerp(this.smoothed.steerAngle, this.controls.steerAngle, rate);
    this.smoothed.brake = THREE.MathUtils.lerp(this.smoothed.brake, this.controls.brake, rate);
    this.smoothed.handbrake = this.controls.handbrake;

    // Sample terrain at chassis and four wheel positions
    const cx = this.state.position.x;
    const cz = this.state.position.z;
    const halfWB = this.cfg.wheelbase * 0.5;
    const halfTW = this.cfg.trackWidth * 0.5;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.state.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.state.quaternion);

    const wheelSamples: number[] = [];
    for (const [fSign, rSign] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const wx = cx + forward.x * halfWB * fSign + right.x * halfTW * rSign;
      const wz = cz + forward.z * halfWB * fSign + right.z * halfTW * rSign;
      wheelSamples.push(terrain.getHeightAt(wx, wz));
    }
    const avgGround = wheelSamples.reduce((a, b) => a + b, 0) / wheelSamples.length;
    this.state.groundHeight = avgGround;

    // Apply gravity to velocity (always)
    this.state.velocity.y += GroundVehiclePhysics.GRAVITY * dt;

    // Engine RPM cosmetic
    const targetRPM = this.engineActive ? Math.max(0.2, Math.abs(this.smoothed.throttle)) : 0;
    this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, Math.min(2.0 * dt, 1.0));

    // Ground check + conform (snap chassis to averaged terrain when at or below axleOffset above ground)
    const targetY = avgGround + this.cfg.axleOffset;
    const HARD_LANDING_THRESHOLD = -3.0;
    const BOUNCE_COEFFICIENT = 0.3;

    if (this.state.position.y <= targetY) {
      // Bounce on hard landing
      if (this.state.velocity.y < HARD_LANDING_THRESHOLD) {
        this.state.velocity.y = -this.state.velocity.y * BOUNCE_COEFFICIENT;
      } else if (this.state.velocity.y < 0) {
        this.state.velocity.y = 0;
      }
      this.state.position.y = targetY;
      this.state.isGrounded = true;
    } else {
      this.state.isGrounded = false;
    }

    // Conform pitch/roll from terrain normal when grounded
    if (this.state.isGrounded) {
      const n = terrain.getNormalAt(cx, cz);
      // Preserve yaw, override pitch/roll
      const yawEuler = new THREE.Euler().setFromQuaternion(this.state.quaternion, 'YXZ');
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawEuler.y);
      const conformQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
      this.state.quaternion.copy(conformQ).multiply(yawQ);
    }

    // Engine drive force (chassis-forward), slope-stalled
    if (this.engineActive && this.state.isGrounded) {
      const slope = terrain.getSlopeAt(cx, cz);
      let slopeFactor = 1.0;
      if (slope > this.cfg.maxClimbSlope) {
        slopeFactor = 0;
      } else if (slope > 0) {
        slopeFactor = Math.max(0, 1 - slope / this.cfg.maxClimbSlope);
      }
      const driveForce =
        (this.smoothed.throttle * this.cfg.engineTorque * this.cfg.gearRatio) /
        this.cfg.wheelRadius;
      const effectiveDrive = driveForce * slopeFactor;
      const accel = effectiveDrive / this.cfg.mass;
      this.state.velocity.x += forward.x * accel * dt;
      this.state.velocity.z += forward.z * accel * dt;
    }

    // Brake (decelerates along current velocity direction)
    if (this.state.isGrounded && this.smoothed.brake > 0.001) {
      const speed = this.getGroundSpeed();
      if (speed > 1e-4) {
        const brakeAccel = (this.smoothed.brake * this.cfg.maxBrake) / this.cfg.mass;
        const dvX = -(this.state.velocity.x / speed) * brakeAccel * dt;
        const dvZ = -(this.state.velocity.z / speed) * brakeAccel * dt;
        // Clamp brake so it cannot reverse velocity past zero in one step
        if (Math.abs(dvX) >= Math.abs(this.state.velocity.x)) {
          this.state.velocity.x = 0;
        } else {
          this.state.velocity.x += dvX;
        }
        if (Math.abs(dvZ) >= Math.abs(this.state.velocity.z)) {
          this.state.velocity.z = 0;
        } else {
          this.state.velocity.z += dvZ;
        }
      }
    }

    // Rolling + air drag
    if (this.state.isGrounded) {
      const speed = this.getGroundSpeed();
      if (speed > 1e-4) {
        const dragForce =
          this.cfg.rollingCoef * speed + this.cfg.airDragCoef * speed * speed;
        const dragAccel = dragForce / this.cfg.mass;
        const dvX = -(this.state.velocity.x / speed) * dragAccel * dt;
        const dvZ = -(this.state.velocity.z / speed) * dragAccel * dt;
        this.state.velocity.x += dvX;
        this.state.velocity.z += dvZ;
      }
    }

    // Ackermann yaw rate
    const vForward = this.state.velocity.x * forward.x + this.state.velocity.z * forward.z;
    if (this.state.isGrounded && Math.abs(this.smoothed.steerAngle) > 1e-4) {
      const omegaY = (vForward / this.cfg.wheelbase) * Math.tan(this.smoothed.steerAngle);
      this.state.angularVelocity.y = omegaY;
    } else {
      this.state.angularVelocity.y *= 0.85;
    }

    // Integrate position
    this.state.position.x += this.state.velocity.x * dt;
    this.state.position.z += this.state.velocity.z * dt;
    this.state.position.y += this.state.velocity.y * dt;

    // Integrate yaw
    if (Math.abs(this.state.angularVelocity.y) > 1e-6) {
      const dq = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.state.angularVelocity.y * dt,
      );
      this.state.quaternion.premultiply(dq).normalize();
    }
  }
}

// =============================================================================
// Terrain mocks (per-test, kept inline so each test reads top-to-bottom)
// =============================================================================

function makeFlatTerrain(height = 0): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

/**
 * Mock terrain whose surface tilts uniformly along world-X.
 * dydx is rise/run along +X; the surface normal tilts away from +X by atan(dydx).
 * `slope` returned is the absolute slope angle in radians.
 */
function makeSlopedTerrain(dydx: number): ITerrainRuntime {
  const slope = Math.atan(Math.abs(dydx));
  // Normal: rotate (0,1,0) around Z by -atan(dydx). For dydx>0 (climbing +X) normal tilts toward -X.
  const n = new THREE.Vector3(-dydx, 1, 0).normalize();
  return {
    getHeightAt: (x: number, _z: number) => x * dydx,
    getEffectiveHeightAt: (x: number, _z: number) => x * dydx,
    getSlopeAt: () => slope,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.copy(n);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('GroundVehiclePhysics', () => {
  // Use a delta-time large enough to trigger at least one fixed step per call.
  const DT = 0.02;

  describe('Gravity', () => {
    it('applies gravity when airborne with zero throttle', () => {
      // Spawn high above flat ground, engine off, no throttle.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 50, 0));
      const flat = makeFlatTerrain(0);

      const yBefore = physics.getState().position.y;
      const vyBefore = physics.getState().velocity.y;

      // Step ~30 frames at 1/60s.
      for (let i = 0; i < 30; i++) {
        physics.update(DT, flat);
      }

      const state = physics.getState();
      // Should be falling (negative vy) and below starting height.
      expect(state.velocity.y).toBeLessThan(vyBefore);
      expect(state.velocity.y).toBeLessThan(0);
      expect(state.position.y).toBeLessThan(yBefore);
      expect(state.isGrounded).toBe(false);
    });
  });

  describe('Wheel terrain conform', () => {
    it('wheels conform to flat ground (chassis settles at axle offset)', () => {
      // Drop the vehicle from just above the ground; settle.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      const flat = makeFlatTerrain(0);

      // Let it settle.
      for (let i = 0; i < 120; i++) {
        physics.update(DT, flat);
      }

      const state = physics.getState();
      expect(state.isGrounded).toBe(true);
      // Chassis Y sits at terrain + axleOffset (~0.5 by default config).
      expect(state.position.y).toBeGreaterThan(0);
      expect(state.position.y).toBeLessThan(1.5);
    });

    it('wheels conform to slope (chassis tilts to match terrain normal)', () => {
      // A surface rising 1m per 2m along +X (~26.6 deg slope, below default maxClimbSlope of 0.54 rad).
      // dy/dx = 0.5 → slope ~0.4636 rad.
      const sloped = makeSlopedTerrain(0.5);
      // Spawn just above the slope at x=0 so chassis settles onto it.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));

      for (let i = 0; i < 120; i++) {
        physics.update(DT, sloped);
      }

      const state = physics.getState();
      expect(state.isGrounded).toBe(true);

      // Inclined orientation: chassis local-up should be close to terrain normal.
      const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      const expectedNormal = new THREE.Vector3(-0.5, 1, 0).normalize();
      const dot = chassisUp.dot(expectedNormal);
      // Allow some tolerance for the conform step.
      expect(dot).toBeGreaterThan(0.95);
      // And it should NOT be flat (i.e., differ from world-up).
      const worldUp = new THREE.Vector3(0, 1, 0);
      expect(chassisUp.dot(worldUp)).toBeLessThan(0.999);
    });
  });

  describe('Ackermann steering', () => {
    it('Ackermann yaw rate scales with steer angle at constant forward speed', () => {
      // Establish forward speed via throttle on flat ground.
      const flat = makeFlatTerrain(0);

      function runWithSteer(steerAngle: number): number {
        const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        physics.setEngineActive(true);
        // Settle on ground first.
        for (let i = 0; i < 30; i++) physics.update(DT, flat);

        physics.setControls({ throttle: 0.5, steerAngle: 0 });
        // Spool up forward speed.
        for (let i = 0; i < 120; i++) physics.update(DT, flat);

        // Apply steer; measure yaw rate over the next 30 frames.
        physics.setControls({ throttle: 0.5, steerAngle });
        // Let smoothed inputs catch up.
        for (let i = 0; i < 15; i++) physics.update(DT, flat);

        const samples: number[] = [];
        for (let i = 0; i < 30; i++) {
          physics.update(DT, flat);
          samples.push(physics.getState().angularVelocity.y);
        }
        return samples.reduce((a, b) => a + b, 0) / samples.length;
      }

      const yawLow = runWithSteer(0.1);
      const yawHigh = runWithSteer(0.3);

      // Both should be non-zero in the same direction (forward speed > 0, positive steer).
      expect(Math.sign(yawLow)).toBe(Math.sign(yawHigh));
      expect(Math.abs(yawLow)).toBeGreaterThan(0);
      // Higher steer angle → higher yaw rate (Ackermann scales with tan(steer)).
      expect(Math.abs(yawHigh)).toBeGreaterThan(Math.abs(yawLow));
    });
  });

  describe('Brake', () => {
    it('brake decelerates from cruise to stop', () => {
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setEngineActive(true);

      // Settle.
      for (let i = 0; i < 30; i++) physics.update(DT, flat);

      // Accelerate to cruise.
      physics.setControls({ throttle: 1.0, steerAngle: 0 });
      for (let i = 0; i < 180; i++) physics.update(DT, flat);

      const cruiseSpeed = physics.getGroundSpeed();
      expect(cruiseSpeed).toBeGreaterThan(1.0); // moving at non-trivial speed

      // Release throttle, apply full brake.
      physics.setEngineActive(false);
      physics.setControls({ throttle: 0, brake: 1.0 });

      // Brake for long enough that any reasonable model would stop.
      for (let i = 0; i < 600; i++) physics.update(DT, flat);

      const finalSpeed = physics.getGroundSpeed();
      expect(finalSpeed).toBeLessThan(0.1);
      // And clearly slower than the cruise speed.
      expect(finalSpeed).toBeLessThan(cruiseSpeed * 0.05);
    });
  });

  describe('Slope-stall', () => {
    it('forward force scales down on slopes above threshold', () => {
      // Compare achieved forward speed after a fixed throttle window
      // on a gentle slope vs a near-vertical slope past maxClimbSlope.
      const gentle = makeSlopedTerrain(0.05); // ~2.86 deg, well below maxClimbSlope
      const wall = makeSlopedTerrain(2.0);    // ~63 deg, well above maxClimbSlope (0.54 rad ~31 deg)

      function topSpeedOn(terrain: ITerrainRuntime): number {
        const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        physics.setEngineActive(true);
        for (let i = 0; i < 30; i++) physics.update(DT, terrain); // settle
        physics.setControls({ throttle: 1.0, steerAngle: 0 });
        for (let i = 0; i < 180; i++) physics.update(DT, terrain);
        return physics.getGroundSpeed();
      }

      const speedGentle = topSpeedOn(gentle);
      const speedWall = topSpeedOn(wall);

      // Slope-stall: wall-grade slope yields negligible forward speed,
      // and is materially slower than the gentle slope.
      expect(speedWall).toBeLessThan(speedGentle);
      expect(speedWall).toBeLessThan(0.5);
    });
  });

  describe('Hard landing', () => {
    it('bounces on hard landing (mirrors helicopter test)', () => {
      // Drop the vehicle from high enough to build up large negative vy.
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 50, 0));

      // Directly inject a hard descent velocity to make the test independent
      // of integration distance / damping tuning. Place the chassis right
      // at the impact line so the next fixed step resolves the collision.
      physics.getState().velocity.y = -10;
      physics.getState().position.y = 0.5; // at target ground (axleOffset)

      // One fixed step is enough for the bounce to register.
      physics.update(DT, flat);

      const state = physics.getState();
      // Bounce: vy flips to positive (reflected upward by impact).
      // Matches HelicopterPhysics.test.ts bounce assertion shape.
      expect(state.velocity.y).toBeGreaterThan(0);
    });
  });
});
