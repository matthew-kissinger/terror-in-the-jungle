import * as THREE from 'three';
import { HelicopterControls } from './HelicopterPhysics';
import { HelicopterPhysics } from './HelicopterPhysics';

const _finalQuaternion = new THREE.Quaternion();

/**
 * Manages helicopter rotor animations and visual tilt effects.
 * Handles rotor speed interpolation and banking/tilting visual feedback.
 */
export class HelicopterAnimation {
  // Rotor animation state
  private mainRotorSpeed: Map<string, number> = new Map();
  private tailRotorSpeed: Map<string, number> = new Map();
  private readonly rotorAcceleration = 5.0; // How fast rotors spin up/down

  // Visual tilt system for realistic helicopter banking
  private visualTiltQuaternion: Map<string, THREE.Quaternion> = new Map();
  private targetTiltQuaternion: Map<string, THREE.Quaternion> = new Map();
  private readonly MAX_TILT_ANGLE = Math.PI / 10; // 18 degrees maximum tilt
  private readonly TILT_SMOOTH_RATE = 6.0; // How fast tilt responds to controls
  private readonly AUTO_LEVEL_RATE = 3.0; // How fast it returns to level

  /**
   * Initialize animation state for a helicopter.
   */
  initialize(helicopterId: string): void {
    this.mainRotorSpeed.set(helicopterId, 0);
    this.tailRotorSpeed.set(helicopterId, 0);
    this.visualTiltQuaternion.set(helicopterId, new THREE.Quaternion());
    this.targetTiltQuaternion.set(helicopterId, new THREE.Quaternion());
  }

  /**
   * Update rotor animations based on physics state.
   */
  updateRotors(
    helicopter: THREE.Group,
    helicopterId: string,
    physics: HelicopterPhysics | undefined,
    deltaTime: number
  ): void {
    let targetMainSpeed = 0;
    let targetTailSpeed = 0;

    if (physics) {
      const state = physics.getState();
      // Base rotor speed from engine RPM - more responsive
      targetMainSpeed = state.engineRPM * 20; // Increased for more visible rotation
      targetTailSpeed = targetMainSpeed * 4.5; // Tail rotor spins faster
    }

    // Smooth rotor acceleration
    const currentMainSpeed = this.mainRotorSpeed.get(helicopterId) || 0;
    const currentTailSpeed = this.tailRotorSpeed.get(helicopterId) || 0;

    const newMainSpeed = THREE.MathUtils.lerp(
      currentMainSpeed,
      targetMainSpeed,
      this.rotorAcceleration * deltaTime
    );

    const newTailSpeed = THREE.MathUtils.lerp(
      currentTailSpeed,
      targetTailSpeed,
      this.rotorAcceleration * deltaTime
    );

    this.mainRotorSpeed.set(helicopterId, newMainSpeed);
    this.tailRotorSpeed.set(helicopterId, newTailSpeed);

    // Apply rotations to rotor groups
    helicopter.traverse((child) => {
      if (child.userData.type === 'mainBlades') {
        child.rotation.y += newMainSpeed * deltaTime;
      } else if (child.userData.type === 'tailBlades') {
        child.rotation.z += newTailSpeed * deltaTime;
      }
    });
  }

  /**
   * Calculate visual tilt quaternion based on control inputs.
   */
  calculateVisualTilt(controls: HelicopterControls): THREE.Quaternion {
    // Convert cyclic control inputs to visual tilt angles
    // cyclicPitch: forward/backward movement -> pitch tilt (rotation around X-axis)
    // cyclicRoll: left/right movement -> roll tilt (rotation around Z-axis)

    // Fixed: 90-degree rotation in axis mapping
    // Arrow Up (cyclicPitch +1) → should tilt forward
    // Arrow Right (cyclicRoll +1) → should tilt right

    // Base tilt from controls - more pronounced for better visual feedback
    const controlTiltMultiplier = 1.2;
    const pitchAngle = -controls.cyclicRoll * this.MAX_TILT_ANGLE * controlTiltMultiplier;
    const rollAngle = controls.cyclicPitch * this.MAX_TILT_ANGLE * controlTiltMultiplier;

    // Create quaternion from euler angles
    const euler = new THREE.Euler(pitchAngle, 0, rollAngle, 'YXZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }

  /**
   * Update visual tilt based on controls and apply to helicopter quaternion.
   */
  updateVisualTilt(
    helicopter: THREE.Group,
    helicopterId: string,
    physics: HelicopterPhysics,
    deltaTime: number
  ): THREE.Quaternion {
    const currentControls = physics.getControls();

    // Calculate target visual tilt based on current controls
    const targetTilt = this.calculateVisualTilt(currentControls);
    this.targetTiltQuaternion.set(helicopterId, targetTilt);

    // Smooth interpolation of visual tilt
    const currentVisualTilt = this.visualTiltQuaternion.get(helicopterId)!;
    const targetVisualTilt = this.targetTiltQuaternion.get(helicopterId)!;

    // Use different interpolation rates based on whether we're tilting or leveling
    const hasInput = Math.abs(currentControls.cyclicPitch) > 0.01 || Math.abs(currentControls.cyclicRoll) > 0.01;
    const lerpRate = hasInput ? this.TILT_SMOOTH_RATE : this.AUTO_LEVEL_RATE;

    currentVisualTilt.slerp(targetVisualTilt, Math.min(deltaTime * lerpRate, 1.0));

    // Combine physics rotation with visual tilt
    const state = physics.getState();
    _finalQuaternion.copy(state.quaternion);
    _finalQuaternion.multiply(currentVisualTilt);

    return _finalQuaternion;
  }

  /**
   * Clean up animation state for a helicopter.
   */
  dispose(helicopterId: string): void {
    this.mainRotorSpeed.delete(helicopterId);
    this.tailRotorSpeed.delete(helicopterId);
    this.visualTiltQuaternion.delete(helicopterId);
    this.targetTiltQuaternion.delete(helicopterId);
  }

  /**
   * Clean up all animation state.
   */
  disposeAll(): void {
    this.mainRotorSpeed.clear();
    this.tailRotorSpeed.clear();
    this.visualTiltQuaternion.clear();
    this.targetTiltQuaternion.clear();
  }
}
