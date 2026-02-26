import * as THREE from 'three';
import type { AircraftPhysicsConfig } from './AircraftConfigs';

const _gravity = new THREE.Vector3();
const _lift = new THREE.Vector3();
const _cyclicForce = new THREE.Vector3();
const _euler = new THREE.Euler();
const _deltaPosition = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();

export interface HelicopterControls {
  collective: number;     // Vertical thrust (0-1)
  cyclicPitch: number;    // Forward/backward (-1 to 1)
  cyclicRoll: number;     // Left/right bank (-1 to 1)
  yaw: number;           // Tail rotor, turning (-1 to 1)
  engineBoost: boolean;   // Turbo mode
  autoHover: boolean;     // Stabilization assist
}

export interface HelicopterState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  engineRPM: number;      // 0-1 for audio/visual effects
  isGrounded: boolean;
  groundHeight: number;
}

// Default physics when no config is provided (backwards-compatible with old tests)
const DEFAULT_PHYSICS: AircraftPhysicsConfig = {
  mass: 2200,
  maxLiftForce: 36000,
  maxCyclicForce: 8000,
  maxYawRate: 1.8,
  maxHorizontalSpeed: 55,
  velocityDamping: 0.95,
  angularDamping: 0.85,
  autoLevelStrength: 3.0,
  groundEffectHeight: 8.0,
  groundEffectStrength: 0.25,
  engineSpoolRate: 1.8,
  inputSmoothRate: 8.0,
};

export class HelicopterPhysics {
  private state: HelicopterState;
  private controls: HelicopterControls;

  private readonly GRAVITY = -9.81;
  private readonly cfg: AircraftPhysicsConfig;
  private smoothedControls: HelicopterControls;

  constructor(initialPosition: THREE.Vector3, config?: AircraftPhysicsConfig) {
    this.cfg = config ?? DEFAULT_PHYSICS;
    this.state = {
      position: initialPosition.clone(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      engineRPM: 0,
      isGrounded: true,
      groundHeight: initialPosition.y
    };

    this.controls = {
      collective: 0,
      cyclicPitch: 0,
      cyclicRoll: 0,
      yaw: 0,
      engineBoost: false,
      autoHover: true // Start with stabilization on
    };

    this.smoothedControls = { ...this.controls };
  }

  update(deltaTime: number, terrainHeight: number, helipadHeight?: number): void {
    // Update ground height - use helipad height if available and higher than terrain
    let effectiveGroundHeight = terrainHeight;
    if (helipadHeight !== undefined && helipadHeight > terrainHeight) {
      effectiveGroundHeight = helipadHeight;
    }

    this.state.groundHeight = effectiveGroundHeight;
    this.state.isGrounded = this.state.position.y <= (effectiveGroundHeight + 1.0);

    // Smooth control inputs for better feel
    this.smoothControlInputs(deltaTime);

    // Update engine RPM based on collective
    this.updateEngine(deltaTime);

    // Calculate and apply forces
    this.calculateForces(deltaTime);

    // Apply auto-stabilization if enabled
    if (this.smoothedControls.autoHover) {
      this.applyAutoStabilization(deltaTime);
    }

    // Integrate physics
    this.integrate(deltaTime);

    // Apply damping for stability
    this.applyDamping(deltaTime);

    // Enforce ground collision
    this.enforceGroundCollision();
  }

  private smoothControlInputs(deltaTime: number): void {
    const smoothRate = Math.min(this.cfg.inputSmoothRate * deltaTime, 1.0);

    this.smoothedControls.collective = THREE.MathUtils.lerp(
      this.smoothedControls.collective,
      this.controls.collective,
      smoothRate
    );

    this.smoothedControls.cyclicPitch = THREE.MathUtils.lerp(
      this.smoothedControls.cyclicPitch,
      this.controls.cyclicPitch,
      smoothRate
    );

    this.smoothedControls.cyclicRoll = THREE.MathUtils.lerp(
      this.smoothedControls.cyclicRoll,
      this.controls.cyclicRoll,
      smoothRate
    );

    this.smoothedControls.yaw = THREE.MathUtils.lerp(
      this.smoothedControls.yaw,
      this.controls.yaw,
      smoothRate
    );

    // Booleans don't need smoothing but need to be updated
    this.smoothedControls.engineBoost = this.controls.engineBoost;
    this.smoothedControls.autoHover = this.controls.autoHover;
  }

  private updateEngine(deltaTime: number): void {
    const targetRPM = Math.max(0.2, this.smoothedControls.collective);
    const spoolRate = Math.min(this.cfg.engineSpoolRate * deltaTime, 1.0);

    if (targetRPM > this.state.engineRPM) {
      // Spool up (gradual for takeoff realism)
      this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, spoolRate * 1.0);
    } else {
      // Spool down (slower, more realistic)
      this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, spoolRate * 0.5);
    }
  }

  private calculateForces(deltaTime: number): void {
    const { mass, maxLiftForce, maxCyclicForce, maxYawRate, maxHorizontalSpeed,
            groundEffectHeight, groundEffectStrength } = this.cfg;

    // Gravity
    _gravity.set(0, this.GRAVITY * mass, 0);

    // Vertical lift from collective
    let liftForce = this.smoothedControls.collective * maxLiftForce;

    if (this.smoothedControls.engineBoost) {
      liftForce *= 1.4;
    }

    // Ground effect
    const heightAboveGround = this.state.position.y - this.state.groundHeight;
    if (heightAboveGround < groundEffectHeight) {
      const groundEffect = 1.0 - (heightAboveGround / groundEffectHeight);
      liftForce += groundEffect * groundEffectStrength * maxLiftForce;
    }

    _lift.set(0, liftForce, 0);

    // Horizontal forces from cyclic (relative to helicopter orientation)
    _cyclicForce.set(
      -this.smoothedControls.cyclicPitch * maxCyclicForce,
      0,
      -this.smoothedControls.cyclicRoll * maxCyclicForce
    );
    _cyclicForce.applyQuaternion(this.state.quaternion);

    // Total force -> acceleration
    const totalForce = _gravity.add(_lift).add(_cyclicForce);
    const acceleration = totalForce.divideScalar(mass);
    this.state.velocity.add(acceleration.multiplyScalar(deltaTime));

    // Cap vertical velocity
    const maxVerticalSpeed = 15.0;
    this.state.velocity.y = THREE.MathUtils.clamp(this.state.velocity.y, -maxVerticalSpeed, maxVerticalSpeed);

    // Cap horizontal speed
    const hx = this.state.velocity.x;
    const hz = this.state.velocity.z;
    const horizontalSpeedSq = hx * hx + hz * hz;
    const maxHSq = maxHorizontalSpeed * maxHorizontalSpeed;
    if (horizontalSpeedSq > maxHSq) {
      const scale = maxHorizontalSpeed / Math.sqrt(horizontalSpeedSq);
      this.state.velocity.x *= scale;
      this.state.velocity.z *= scale;
    }

    // Yaw
    this.state.angularVelocity.y = this.smoothedControls.yaw * maxYawRate;
  }

  private applyAutoStabilization(deltaTime: number): void {
    _euler.setFromQuaternion(this.state.quaternion, 'YXZ');

    const rollCorrection = -_euler.z * this.cfg.autoLevelStrength;
    const pitchCorrection = -_euler.x * this.cfg.autoLevelStrength;

    // Apply corrections to angular velocity
    this.state.angularVelocity.z += rollCorrection * deltaTime;
    this.state.angularVelocity.x += pitchCorrection * deltaTime;

    // Hover assistance - only apply when auto-hover is on and collective is near hover point
    if (Math.abs(this.state.velocity.y) < 1.0 && Math.abs(this.smoothedControls.collective - 0.5) < 0.1) {
      this.state.velocity.y *= 0.95; // Very gentle vertical damping only when actively hovering
    }
  }

  private integrate(deltaTime: number): void {
    // Update position from velocity
    _deltaPosition.copy(this.state.velocity).multiplyScalar(deltaTime);
    this.state.position.add(_deltaPosition);

    // Update rotation from angular velocity (using quaternions)
    if (this.state.angularVelocity.length() > 0.001) {
      _axis.copy(this.state.angularVelocity).normalize();
      const angle = this.state.angularVelocity.length() * deltaTime;
      _deltaQ.setFromAxisAngle(_axis, angle);
      this.state.quaternion.multiplyQuaternions(_deltaQ, this.state.quaternion);
      this.state.quaternion.normalize();
    }
  }

  private applyDamping(deltaTime: number): void {
    this.state.velocity.multiplyScalar(Math.pow(this.cfg.velocityDamping, deltaTime));
    this.state.angularVelocity.multiplyScalar(Math.pow(this.cfg.angularDamping, deltaTime));
  }

  private enforceGroundCollision(): void {
    const minHeight = this.state.groundHeight + 0.5; // Helicopter ground clearance
    const HARD_LANDING_THRESHOLD = -3.0; // m/s descent rate
    const BOUNCE_COEFFICIENT = 0.3; // How much bounce on landing

    if (this.state.position.y <= minHeight) {
      this.state.position.y = minHeight;

      // Handle landing based on descent rate
      if (this.state.velocity.y < 0) {
        // Hard landing - bounce
        if (this.state.velocity.y < HARD_LANDING_THRESHOLD) {
          this.state.velocity.y = -this.state.velocity.y * BOUNCE_COEFFICIENT;
          // Add slight horizontal damping on hard landing
          this.state.velocity.x *= 0.7;
          this.state.velocity.z *= 0.7;
        } else {
          // Soft landing - settle smoothly
          this.state.velocity.y = 0;
          // Gradual horizontal stop
          this.state.velocity.x *= 0.9;
          this.state.velocity.z *= 0.9;
        }
      }

      this.state.isGrounded = true;
    } else {
      this.state.isGrounded = false;
    }
  }

  // Public methods for control input
  setControls(controls: Partial<HelicopterControls>): void {
    Object.assign(this.controls, controls);
  }

  getState(): Readonly<HelicopterState> {
    return this.state;
  }

  getControls(): Readonly<HelicopterControls> {
    return this.controls;
  }

  // Reset helicopter to stable state
  resetToStable(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.angularVelocity.set(0, 0, 0);
    this.state.quaternion.identity();
    this.state.engineRPM = 0.2; // Idle at 20%

    // Reset controls
    this.controls.collective = 0;
    this.controls.cyclicPitch = 0;
    this.controls.cyclicRoll = 0;
    this.controls.yaw = 0;
    this.controls.engineBoost = false;
    this.smoothedControls = { ...this.controls };
  }

  // Get engine sound parameters
  getEngineAudioParams(): { rpm: number; load: number } {
    const load = Math.abs(this.smoothedControls.collective) +
                Math.abs(this.smoothedControls.cyclicPitch) * 0.5 +
                Math.abs(this.smoothedControls.cyclicRoll) * 0.5;

    return {
      rpm: this.state.engineRPM,
      load: Math.min(1.0, load)
    };
  }
}
