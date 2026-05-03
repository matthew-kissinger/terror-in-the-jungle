import * as THREE from 'three';
import { HelicopterControls } from './HelicopterPhysics';
import { HelicopterPhysics } from './HelicopterPhysics';

const _finalQuaternion = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scratchQuaternion = new THREE.Quaternion();
const MAIN_ROTOR_MAX_VISUAL_SPEED = 48;
const TAIL_ROTOR_SPEED_MULTIPLIER = 5.5;

interface RotorNodes {
  main: Array<{
    node: THREE.Object3D;
    axis: RotorSpinAxis;
  }>;
  tail: Array<{
    node: THREE.Object3D;
    axis: RotorSpinAxis;
  }>;
}

type RotorSpinAxis = 'x' | 'y' | 'z';

/**
 * Manages helicopter rotor animations and visual tilt effects.
 * Handles rotor speed interpolation and banking/tilting visual feedback.
 */
export class HelicopterAnimation {
  // Rotor animation state
  private mainRotorSpeed: Map<string, number> = new Map();
  private tailRotorSpeed: Map<string, number> = new Map();
  private rotorNodes: Map<string, RotorNodes> = new Map();
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
  initialize(helicopterId: string, helicopter?: THREE.Group): void {
    this.mainRotorSpeed.set(helicopterId, 0);
    this.tailRotorSpeed.set(helicopterId, 0);
    this.visualTiltQuaternion.set(helicopterId, new THREE.Quaternion());
    this.targetTiltQuaternion.set(helicopterId, new THREE.Quaternion());
    if (helicopter) {
      this.rotorNodes.set(helicopterId, this.resolveRotorNodes(helicopter));
    }
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
    if (!this.mainRotorSpeed.has(helicopterId) || !this.tailRotorSpeed.has(helicopterId)) {
      return;
    }

    let targetMainSpeed = 0;
    let targetTailSpeed = 0;

    if (physics) {
      const state = physics.getState();
      targetMainSpeed = state.engineRPM * MAIN_ROTOR_MAX_VISUAL_SPEED;
      targetTailSpeed = targetMainSpeed * TAIL_ROTOR_SPEED_MULTIPLIER;
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

    const nodes = this.rotorNodes.get(helicopterId) ?? this.resolveAndStoreRotorNodes(helicopterId, helicopter);

    // Apply rotations to cached rotor groups (wrap to prevent float precision loss)
    const TAU = Math.PI * 2;
    for (const mainRotor of nodes.main) {
      mainRotor.node.rotation[mainRotor.axis] = (mainRotor.node.rotation[mainRotor.axis] + newMainSpeed * deltaTime) % TAU;
    }
    for (const tailRotor of nodes.tail) {
      tailRotor.node.rotation[tailRotor.axis] = (tailRotor.node.rotation[tailRotor.axis] + newTailSpeed * deltaTime) % TAU;
    }
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
    _scratchEuler.set(pitchAngle, 0, rollAngle, 'YXZ');
    _scratchQuaternion.setFromEuler(_scratchEuler);
    return _scratchQuaternion;
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
    const storedTarget = this.targetTiltQuaternion.get(helicopterId);
    if (storedTarget) {
      storedTarget.copy(targetTilt);
    }

    // Smooth interpolation of visual tilt
    const currentVisualTilt = this.visualTiltQuaternion.get(helicopterId)!;
    const targetVisualTilt = this.targetTiltQuaternion.get(helicopterId)!;

    // Use different interpolation rates based on whether we're tilting or leveling
    const hasInput = Math.abs(currentControls.cyclicPitch) > 0.01 || Math.abs(currentControls.cyclicRoll) > 0.01;
    const lerpRate = hasInput ? this.TILT_SMOOTH_RATE : this.AUTO_LEVEL_RATE;

    currentVisualTilt.slerp(targetVisualTilt, Math.min(deltaTime * lerpRate, 1.0));

    // Combine physics rotation with visual tilt
    const state = typeof physics.getInterpolatedState === 'function'
      ? physics.getInterpolatedState()
      : physics.getState();
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
    this.rotorNodes.delete(helicopterId);
    this.visualTiltQuaternion.delete(helicopterId);
    this.targetTiltQuaternion.delete(helicopterId);
  }

  /**
   * Clean up all animation state.
   */
  disposeAll(): void {
    this.mainRotorSpeed.clear();
    this.tailRotorSpeed.clear();
    this.rotorNodes.clear();
    this.visualTiltQuaternion.clear();
    this.targetTiltQuaternion.clear();
  }

  private resolveAndStoreRotorNodes(helicopterId: string, helicopter: THREE.Group): RotorNodes {
    const nodes = this.resolveRotorNodes(helicopter);
    this.rotorNodes.set(helicopterId, nodes);
    return nodes;
  }

  private resolveRotorNodes(helicopter: THREE.Group): RotorNodes {
    const nodes: RotorNodes = { main: [], tail: [] };
    helicopter.traverse((child) => {
      if (child.userData.type === 'mainBlades') {
        nodes.main.push({
          node: child,
          axis: resolveRotorSpinAxis(child, 'y'),
        });
      } else if (child.userData.type === 'tailBlades') {
        nodes.tail.push({
          node: child,
          axis: resolveRotorSpinAxis(child, 'z'),
        });
      }
    });
    return nodes;
  }
}

function resolveRotorSpinAxis(node: THREE.Object3D, fallback: RotorSpinAxis): RotorSpinAxis {
  return node.userData.spinAxis === 'x' || node.userData.spinAxis === 'y' || node.userData.spinAxis === 'z'
    ? node.userData.spinAxis
    : fallback;
}
