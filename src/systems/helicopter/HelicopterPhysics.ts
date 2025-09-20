import * as THREE from 'three';

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

export class HelicopterPhysics {
  private state: HelicopterState;
  private controls: HelicopterControls;

  // Physics constants (tuned for fun hybrid gameplay)
  private readonly MASS = 2000; // kg (lighter than real UH-1 for arcade feel)
  private readonly GRAVITY = -9.81; // m/s²
  private readonly MAX_LIFT_FORCE = 25000; // N (enough to lift + maneuver)
  private readonly MAX_CYCLIC_FORCE = 8000; // N (horizontal movement)
  private readonly MAX_YAW_RATE = 2.0; // rad/s
  private readonly ENGINE_SPOOL_RATE = 2.0; // How fast engine responds

  // Arcade-style damping for stability
  private readonly VELOCITY_DAMPING = 0.85; // Reduces oscillation
  private readonly ANGULAR_DAMPING = 0.8; // Prevents spinning out
  private readonly AUTO_LEVEL_STRENGTH = 3.0; // Auto-stabilization force
  private readonly GROUND_EFFECT_HEIGHT = 10.0; // Easier flight near ground
  private readonly GROUND_EFFECT_STRENGTH = 0.3; // Extra lift bonus

  // Input smoothing for better feel
  private readonly INPUT_SMOOTH_RATE = 8.0; // How fast inputs respond
  private smoothedControls: HelicopterControls;

  constructor(initialPosition: THREE.Vector3) {
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
    const smoothRate = this.INPUT_SMOOTH_RATE * deltaTime;

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
  }

  private updateEngine(deltaTime: number): void {
    // Engine RPM follows collective input with realistic spool-up/down
    const targetRPM = Math.max(0.3, this.smoothedControls.collective); // Idle at 30%
    const spoolRate = this.ENGINE_SPOOL_RATE * deltaTime;

    if (targetRPM > this.state.engineRPM) {
      // Spool up (faster)
      this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, spoolRate * 1.5);
    } else {
      // Spool down (slower, more realistic)
      this.state.engineRPM = THREE.MathUtils.lerp(this.state.engineRPM, targetRPM, spoolRate * 0.7);
    }
  }

  private calculateForces(deltaTime: number): void {
    // Gravity (always present)
    const gravity = new THREE.Vector3(0, this.GRAVITY * this.MASS, 0);

    // Vertical lift from collective
    let liftForce = this.smoothedControls.collective * this.MAX_LIFT_FORCE;

    // Engine boost multiplier
    if (this.smoothedControls.engineBoost) {
      liftForce *= 1.4;
    }

    // Ground effect - easier to fly near ground
    const heightAboveGround = this.state.position.y - this.state.groundHeight;
    if (heightAboveGround < this.GROUND_EFFECT_HEIGHT) {
      const groundEffect = 1.0 - (heightAboveGround / this.GROUND_EFFECT_HEIGHT);
      liftForce += groundEffect * this.GROUND_EFFECT_STRENGTH * this.MAX_LIFT_FORCE;
    }

    const lift = new THREE.Vector3(0, liftForce, 0);

    // Horizontal forces from cyclic (relative to helicopter orientation)
    const cyclicForce = new THREE.Vector3(
      this.smoothedControls.cyclicRoll * this.MAX_CYCLIC_FORCE,
      0,
      -this.smoothedControls.cyclicPitch * this.MAX_CYCLIC_FORCE // Negative for forward
    );

    // Transform cyclic forces to world space
    cyclicForce.applyQuaternion(this.state.quaternion);

    // Total force
    const totalForce = gravity.add(lift).add(cyclicForce);

    // Apply force to velocity (F = ma, so a = F/m)
    const acceleration = totalForce.divideScalar(this.MASS);
    this.state.velocity.add(acceleration.multiplyScalar(deltaTime));

    // Yaw angular velocity from tail rotor
    this.state.angularVelocity.y = this.smoothedControls.yaw * this.MAX_YAW_RATE;
  }

  private applyAutoStabilization(deltaTime: number): void {
    // Extract roll and pitch from current quaternion
    const euler = new THREE.Euler().setFromQuaternion(this.state.quaternion, 'YXZ');

    // Auto-level forces (stronger when tilted more)
    const rollCorrection = -euler.z * this.AUTO_LEVEL_STRENGTH;
    const pitchCorrection = -euler.x * this.AUTO_LEVEL_STRENGTH;

    // Apply corrections to angular velocity
    this.state.angularVelocity.z += rollCorrection * deltaTime;
    this.state.angularVelocity.x += pitchCorrection * deltaTime;

    // Hover assistance - counter small vertical movements
    if (Math.abs(this.state.velocity.y) < 2.0) {
      this.state.velocity.y *= 0.9; // Gentle vertical damping when hovering
    }
  }

  private integrate(deltaTime: number): void {
    // Update position from velocity
    const deltaPosition = this.state.velocity.clone().multiplyScalar(deltaTime);
    this.state.position.add(deltaPosition);

    // Update rotation from angular velocity (using quaternions)
    if (this.state.angularVelocity.length() > 0.001) {
      const axis = this.state.angularVelocity.clone().normalize();
      const angle = this.state.angularVelocity.length() * deltaTime;
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      this.state.quaternion.multiplyQuaternions(deltaQ, this.state.quaternion);
      this.state.quaternion.normalize();
    }
  }

  private applyDamping(deltaTime: number): void {
    // Velocity damping for stability
    this.state.velocity.multiplyScalar(Math.pow(this.VELOCITY_DAMPING, deltaTime));

    // Angular velocity damping to prevent spinning
    this.state.angularVelocity.multiplyScalar(Math.pow(this.ANGULAR_DAMPING, deltaTime));
  }

  private enforceGroundCollision(): void {
    const minHeight = this.state.groundHeight + 0.5; // Helicopter ground clearance

    if (this.state.position.y <= minHeight) {
      this.state.position.y = minHeight;

      // Stop downward velocity when hitting ground
      if (this.state.velocity.y < 0) {
        this.state.velocity.y = 0;
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

  getState(): HelicopterState {
    return { ...this.state };
  }

  getControls(): HelicopterControls {
    return { ...this.controls };
  }

  // Reset helicopter to stable state
  resetToStable(position: THREE.Vector3): void {
    this.state.position.copy(position);
    this.state.velocity.set(0, 0, 0);
    this.state.angularVelocity.set(0, 0, 0);
    this.state.quaternion.identity();
    this.state.engineRPM = 0.3; // Idle

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