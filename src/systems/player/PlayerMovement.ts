import * as THREE from 'three';
import { PlayerState } from '../../types';
import { HelicopterControls } from '../helicopter/HelicopterPhysics';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import { PlayerInput } from './PlayerInput';

export class PlayerMovement {
  private playerState: PlayerState;
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private helicopterModel?: any;
  private helicopterControls: HelicopterControls = {
    collective: 0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: true
  };
  private isRunning = false;

  constructor(playerState: PlayerState) {
    this.playerState = playerState;
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void {
    this.footstepAudioSystem = footstepAudioSystem;
  }

  setHelicopterModel(helicopterModel: any): void {
    this.helicopterModel = helicopterModel;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
    this.playerState.isRunning = running;

    // Also handle helicopter engine boost
    if (this.playerState.isInHelicopter) {
      this.helicopterControls.engineBoost = running;
    }
  }

  handleJump(): void {
    if (this.playerState.isGrounded && !this.playerState.isJumping) {
      this.playerState.velocity.y = this.playerState.jumpForce;
      this.playerState.isJumping = true;
      this.playerState.isGrounded = false;
    }
  }

  toggleAutoHover(): void {
    this.helicopterControls.autoHover = !this.helicopterControls.autoHover;
    console.log(`🚁 Auto-hover ${this.helicopterControls.autoHover ? 'enabled' : 'disabled'}`);
  }

  getHelicopterControls(): HelicopterControls {
    return { ...this.helicopterControls };
  }

  updateMovement(deltaTime: number, input: PlayerInput, camera: THREE.Camera): void {
    // Don't allow movement when in helicopter
    if (this.playerState.isInHelicopter) {
      this.playerState.velocity.set(0, 0, 0);
      return;
    }

    const moveVector = new THREE.Vector3();
    const baseSpeed = this.playerState.isRunning ? this.playerState.runSpeed : this.playerState.speed;
    const speedMultiplier = 1.0; // Could be extended for different states
    const currentSpeed = baseSpeed * speedMultiplier;

    // Calculate movement direction based on camera orientation
    if (input.isKeyPressed('keyw')) {
      moveVector.z -= 1;
    }
    if (input.isKeyPressed('keys')) {
      moveVector.z += 1;
    }
    if (input.isKeyPressed('keya')) {
      moveVector.x -= 1;
    }
    if (input.isKeyPressed('keyd')) {
      moveVector.x += 1;
    }

    // Normalize movement vector
    if (moveVector.length() > 0) {
      moveVector.normalize();

      // Apply camera rotation to movement
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Keep movement horizontal
      cameraDirection.normalize();

      const cameraRight = new THREE.Vector3();
      cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

      const worldMoveVector = new THREE.Vector3();
      worldMoveVector.addScaledVector(cameraDirection, -moveVector.z);
      worldMoveVector.addScaledVector(cameraRight, moveVector.x);

      // Apply movement with acceleration (only horizontal components)
      const acceleration = currentSpeed * 5; // Acceleration factor
      const targetVelocity = worldMoveVector.multiplyScalar(currentSpeed);
      const horizontalVelocity = new THREE.Vector3(this.playerState.velocity.x, 0, this.playerState.velocity.z);

      horizontalVelocity.lerp(targetVelocity, Math.min(deltaTime * acceleration, 1));

      // Update only horizontal components, preserve Y velocity for jumping/gravity
      this.playerState.velocity.x = horizontalVelocity.x;
      this.playerState.velocity.z = horizontalVelocity.z;
    } else {
      // Apply friction when not moving (only horizontal components)
      const frictionFactor = Math.max(0, 1 - deltaTime * 8);
      this.playerState.velocity.x *= frictionFactor;
      this.playerState.velocity.z *= frictionFactor;
    }

    // Apply gravity
    this.playerState.velocity.y += this.playerState.gravity * deltaTime;

    // Update position
    const movement = this.playerState.velocity.clone().multiplyScalar(deltaTime);
    const newPosition = this.playerState.position.clone().add(movement);

    // Check sandbag collision before applying movement
    if (this.sandbagSystem && this.sandbagSystem.checkCollision(newPosition, 0.5)) {
      // Try to slide along the obstacle
      const slideX = this.playerState.position.clone();
      slideX.x = newPosition.x;
      const slideZ = this.playerState.position.clone();
      slideZ.z = newPosition.z;

      // Try moving only in X direction
      if (!this.sandbagSystem.checkCollision(slideX, 0.5)) {
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.z = 0;
      }
      // Try moving only in Z direction
      else if (!this.sandbagSystem.checkCollision(slideZ, 0.5)) {
        newPosition.x = this.playerState.position.x;
        this.playerState.velocity.x = 0;
      }
      // Can't move at all - stop completely
      else {
        newPosition.x = this.playerState.position.x;
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.x = 0;
        this.playerState.velocity.z = 0;
      }
    }

    // Check ground collision using ImprovedChunkManager if available, otherwise use flat baseline
    let groundHeight = 2; // Default player height above ground (flat world fallback)
    if (this.chunkManager) {
      const effectiveHeight = this.chunkManager.getEffectiveHeightAt(newPosition.x, newPosition.z);
      groundHeight = effectiveHeight + 2;
    }

    // Check for landing and play landing sound
    const wasGrounded = this.playerState.isGrounded;

    if (newPosition.y <= groundHeight) {
      // Player is on or below ground
      newPosition.y = groundHeight;

      // Play landing sound if we just landed
      if (!wasGrounded && this.playerState.velocity.y < -5 && this.footstepAudioSystem) {
        this.footstepAudioSystem.playLandingSound(newPosition, Math.abs(this.playerState.velocity.y));
      }

      this.playerState.velocity.y = 0;
      this.playerState.isGrounded = true;
      this.playerState.isJumping = false;
    } else {
      // Player is in the air
      this.playerState.isGrounded = false;
    }

    this.playerState.position.copy(newPosition);

    // Play footstep sounds when moving on ground
    if (this.footstepAudioSystem && !this.playerState.isInHelicopter) {
      const isMoving = moveVector.length() > 0;
      this.footstepAudioSystem.playPlayerFootstep(
        this.playerState.position,
        this.playerState.isRunning,
        deltaTime,
        isMoving && this.playerState.isGrounded
      );
    }
  }

  updateHelicopterControls(deltaTime: number, input: PlayerInput, hudSystem?: any): void {
    // Update helicopter controls based on keyboard input

    // Collective (W/S) - vertical thrust
    if (input.isKeyPressed('keyw')) {
      this.helicopterControls.collective = Math.min(1.0, this.helicopterControls.collective + 2.0 * deltaTime);
    } else if (input.isKeyPressed('keys')) {
      this.helicopterControls.collective = Math.max(0.0, this.helicopterControls.collective - 2.0 * deltaTime);
    } else {
      // Auto-stabilize collective for hover only when enabled
      if (this.helicopterControls.autoHover) {
        this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, 0.4, deltaTime * 2.0);
      }
    }

    // Yaw (A/D) - tail rotor, turning
    if (input.isKeyPressed('keya')) {
      this.helicopterControls.yaw = Math.min(1.0, this.helicopterControls.yaw + 3.0 * deltaTime); // Turn left
    } else if (input.isKeyPressed('keyd')) {
      this.helicopterControls.yaw = Math.max(-1.0, this.helicopterControls.yaw - 3.0 * deltaTime); // Turn right
    } else {
      // Return to center
      this.helicopterControls.yaw = THREE.MathUtils.lerp(this.helicopterControls.yaw, 0, deltaTime * 8.0);
    }

    // Cyclic Pitch (Arrow Up/Down) - forward/backward movement
    if (input.isKeyPressed('arrowup')) {
      this.helicopterControls.cyclicPitch = Math.min(1.0, this.helicopterControls.cyclicPitch + 2.0 * deltaTime); // Forward
    } else if (input.isKeyPressed('arrowdown')) {
      this.helicopterControls.cyclicPitch = Math.max(-1.0, this.helicopterControls.cyclicPitch - 2.0 * deltaTime); // Backward
    } else {
      // Auto-level pitch
      this.helicopterControls.cyclicPitch = THREE.MathUtils.lerp(this.helicopterControls.cyclicPitch, 0, deltaTime * 4.0);
    }

    // Cyclic Roll (Arrow Left/Right) - left/right banking
    if (input.isKeyPressed('arrowleft')) {
      this.helicopterControls.cyclicRoll = Math.max(-1.0, this.helicopterControls.cyclicRoll - 2.0 * deltaTime);
    } else if (input.isKeyPressed('arrowright')) {
      this.helicopterControls.cyclicRoll = Math.min(1.0, this.helicopterControls.cyclicRoll + 2.0 * deltaTime);
    } else {
      // Auto-level roll
      this.helicopterControls.cyclicRoll = THREE.MathUtils.lerp(this.helicopterControls.cyclicRoll, 0, deltaTime * 4.0);
    }

    // Send controls to helicopter model
    if (this.helicopterModel && this.playerState.helicopterId) {
      this.helicopterModel.setHelicopterControls(this.playerState.helicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD
    if (hudSystem) {
      hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        this.helicopterControls.collective * 0.8 + 0.2, // Simple RPM simulation based on collective
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost
      );
    }
  }

  addMouseControlToHelicopter(mouseMovement: { x: number; y: number }, mouseSensitivity: number = 0.5): void {
    // Mouse X controls roll (banking)
    this.helicopterControls.cyclicRoll = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicRoll + mouseMovement.x * mouseSensitivity,
      -1.0, 1.0
    );

    // Mouse Y controls pitch (forward/backward) - inverted for intuitive control
    this.helicopterControls.cyclicPitch = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicPitch - mouseMovement.y * mouseSensitivity,
      -1.0, 1.0
    );
  }
}
