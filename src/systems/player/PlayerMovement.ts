import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { PlayerState } from '../../types';
import { HelicopterControls } from '../helicopter/HelicopterPhysics';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import { PlayerInput } from './PlayerInput';
import { IHUDSystem, IHelicopterModel } from '../../types/SystemInterfaces';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { computeSlopeSpeedMultiplier, computeSlopeSlideVelocity, SLOPE_SLIDE_STRENGTH, MAX_STEP_HEIGHT } from '../terrain/SlopePhysics';

const _moveVector = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _worldMoveVector = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);

// ── Player movement tuning ──
const MOVEMENT_ACCELERATION = 5;
const FRICTION_RATE = 8;
const PLAYER_EYE_HEIGHT = 2;
const PLAYER_COLLISION_RADIUS = 0.5;
const LANDING_SOUND_THRESHOLD = -5;
const BOUNDARY_BOUNCE_FACTOR = 0.5;

// ── Helicopter control rates ──
const HELI_COLLECTIVE_RATE = 2.0;
const HELI_AUTOHOVER_TARGET = 0.4;
const HELI_AUTOHOVER_RATE = 2.0;
const HELI_DECAY_RATE = 3.0;
const HELI_YAW_RATE = 3.0;
const HELI_YAW_CENTER_RATE = 8.0;
const HELI_CYCLIC_RATE = 2.0;
const HELI_CYCLIC_LEVEL_RATE = 4.0;
const HELI_TOUCH_JOYSTICK_DEADZONE = 0.1;
const HELI_TOUCH_CYCLIC_DEADZONE = 0.05;
const HELI_MOUSE_SENSITIVITY_DEFAULT = 0.5;

export class PlayerMovement {
  private playerState: PlayerState;
  private terrainSystem?: ITerrainRuntime;
  private sandbagSystem?: SandbagSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private helicopterModel?: IHelicopterModel;
  private worldHalfExtent = 0;
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

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  setWorldSize(worldSize: number): void {
    this.worldHalfExtent = worldSize * 0.5;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void {
    this.footstepAudioSystem = footstepAudioSystem;
  }

  setHelicopterModel(helicopterModel: IHelicopterModel): void {
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
    Logger.info('player', ` Auto-hover ${this.helicopterControls.autoHover ? 'enabled' : 'disabled'}`);
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

    const moveVector = _moveVector.set(0, 0, 0);
    const baseSpeed = this.playerState.isRunning ? this.playerState.runSpeed : this.playerState.speed;

    // Query slope at current position for speed penalty + slide
    const heightCache = getHeightQueryCache();
    const normal = heightCache.getNormalAt(this.playerState.position.x, this.playerState.position.z);
    const slopeValue = 1 - normal.y;
    const normalX = normal.x;
    const normalZ = normal.z;
    const speedMultiplier = this.playerState.isGrounded ? computeSlopeSpeedMultiplier(slopeValue) : 1.0;
    const currentSpeed = baseSpeed * speedMultiplier;

    // Calculate movement direction based on camera orientation
    // Check touch joystick first, then fall back to keyboard
    const touchMove = input.getTouchMovementVector();
    if (Math.abs(touchMove.x) > 0.1 || Math.abs(touchMove.z) > 0.1) {
      // Use touch joystick values directly
      moveVector.x = touchMove.x;
      moveVector.z = touchMove.z;
    } else {
      // Keyboard input
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
    }

    // Normalize movement vector
    if (moveVector.length() > 0) {
      moveVector.normalize();

      // Apply camera rotation to movement
      const cameraDirection = _cameraDirection;
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Keep movement horizontal
      cameraDirection.normalize();

      const cameraRight = _cameraRight;
      cameraRight.crossVectors(cameraDirection, _upVector);

      const worldMoveVector = _worldMoveVector.set(0, 0, 0);
      worldMoveVector.addScaledVector(cameraDirection, -moveVector.z);
      worldMoveVector.addScaledVector(cameraRight, moveVector.x);

      // Apply movement with acceleration (only horizontal components)
      const acceleration = currentSpeed * MOVEMENT_ACCELERATION;
      const targetVelocity = worldMoveVector.multiplyScalar(currentSpeed);
      const horizontalVelocity = _horizontalVelocity.set(this.playerState.velocity.x, 0, this.playerState.velocity.z);

      horizontalVelocity.lerp(targetVelocity, Math.min(deltaTime * acceleration, 1));

      // Update only horizontal components, preserve Y velocity for jumping/gravity
      this.playerState.velocity.x = horizontalVelocity.x;
      this.playerState.velocity.z = horizontalVelocity.z;
    } else {
      // Apply friction when not moving (only horizontal components)
      const frictionFactor = Math.max(0, 1 - deltaTime * FRICTION_RATE);
      this.playerState.velocity.x *= frictionFactor;
      this.playerState.velocity.z *= frictionFactor;
    }

    // Slide downhill when on an unwalkable slope
    if (speedMultiplier === 0 && this.playerState.isGrounded) {
      const slide = computeSlopeSlideVelocity(normalX, normalZ, SLOPE_SLIDE_STRENGTH);
      this.playerState.velocity.x = slide.x;
      this.playerState.velocity.z = slide.z;
    }

    // Apply gravity
    this.playerState.velocity.y += this.playerState.gravity * deltaTime;

    // Update position
    const movement = _cameraRight.copy(this.playerState.velocity).multiplyScalar(deltaTime);
    const newPosition = _cameraDirection.copy(this.playerState.position).add(movement);

    // Check sandbag collision before applying movement
    if (this.sandbagSystem && this.sandbagSystem.checkCollision(newPosition, PLAYER_COLLISION_RADIUS)) {
      // Try to slide along the obstacle
      const slideX = _worldMoveVector.copy(this.playerState.position);
      slideX.x = newPosition.x;
      const slideZ = _horizontalVelocity.copy(this.playerState.position);
      slideZ.z = newPosition.z;

      // Try moving only in X direction
      if (!this.sandbagSystem.checkCollision(slideX, PLAYER_COLLISION_RADIUS)) {
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.z = 0;
      }
      // Try moving only in Z direction
      else if (!this.sandbagSystem.checkCollision(slideZ, PLAYER_COLLISION_RADIUS)) {
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

    // Check ground collision using TerrainSystem if available, otherwise use flat baseline
    // getEffectiveHeightAt includes collision objects (helipad, helicopter, etc.)
    let groundHeight = PLAYER_EYE_HEIGHT; // flat world fallback
    if (this.terrainSystem) {
      const terrainHeight = Number(this.terrainSystem.getEffectiveHeightAt(newPosition.x, newPosition.z));
      if (Number.isFinite(terrainHeight)) {
        groundHeight = terrainHeight + PLAYER_EYE_HEIGHT;
      }
    }

    // Step-up gating: prevent teleporting onto structure tops (helipads, etc.)
    if (this.playerState.isGrounded && groundHeight - this.playerState.position.y > MAX_STEP_HEIGHT) {
      newPosition.x = this.playerState.position.x;
      newPosition.z = this.playerState.position.z;
      this.playerState.velocity.x = 0;
      this.playerState.velocity.z = 0;
      // Recompute ground height at original position
      if (this.terrainSystem) {
        const th = Number(this.terrainSystem.getEffectiveHeightAt(this.playerState.position.x, this.playerState.position.z));
        if (Number.isFinite(th)) groundHeight = th + PLAYER_EYE_HEIGHT;
      }
    }

    // Allow standing on top of sandbags
    if (this.sandbagSystem) {
      const sandbagTop = this.sandbagSystem.getStandingHeight(newPosition.x, newPosition.z);
      if (sandbagTop !== null) {
        const sandbagGround = sandbagTop + PLAYER_EYE_HEIGHT;
        if (sandbagGround > groundHeight) {
          groundHeight = sandbagGround;
        }
      }
    }

    // Check for landing and play landing sound
    const wasGrounded = this.playerState.isGrounded;

    if (newPosition.y <= groundHeight) {
      // Player is on or below ground
      newPosition.y = groundHeight;

      // Play landing sound if we just landed
      if (!wasGrounded && this.playerState.velocity.y < LANDING_SOUND_THRESHOLD && this.footstepAudioSystem) {
        this.footstepAudioSystem.playLandingSound(newPosition, Math.abs(this.playerState.velocity.y));
      }

      this.playerState.velocity.y = 0;
      this.playerState.isGrounded = true;
      this.playerState.isJumping = false;
    } else {
      // Player is in the air
      this.playerState.isGrounded = false;
    }

    // Bounce off world boundary (read directly from terrain system)
    if (this.terrainSystem) {
      const ws = this.terrainSystem.getPlayableWorldSize();
      if (ws > 0) this.worldHalfExtent = ws * 0.5;
    }
    if (this.worldHalfExtent > 0) {
      this.enforceWorldBoundary(newPosition, this.worldHalfExtent);
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

  updateHelicopterControls(deltaTime: number, input: PlayerInput, hudSystem?: IHUDSystem): void {
    // Check if touch controls are in helicopter dual-joystick mode
    const touchControls = input.getTouchControls();
    const hasTouchHeliMode = touchControls?.isInHelicopterMode() ?? false;

    // --- Collective (vertical thrust) ---
    if (hasTouchHeliMode) {
      // Left joystick Y axis: up (negative z) = increase collective, down = decrease
      const touchMove = input.getTouchMovementVector();
      const collectiveInput = -touchMove.z; // Invert: joystick up = more thrust
      if (Math.abs(collectiveInput) > HELI_TOUCH_JOYSTICK_DEADZONE) {
        const target = (collectiveInput + 1) / 2; // Map [-1,1] to [0,1]
        this.helicopterControls.collective = THREE.MathUtils.lerp(
          this.helicopterControls.collective, target, deltaTime * HELI_DECAY_RATE
        );
      } else if (this.helicopterControls.autoHover) {
        this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, HELI_AUTOHOVER_TARGET, deltaTime * HELI_AUTOHOVER_RATE);
      } else {
        this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, 0.0, deltaTime * HELI_DECAY_RATE);
      }
    } else if (input.isKeyPressed('keyw')) {
      this.helicopterControls.collective = Math.min(1.0, this.helicopterControls.collective + HELI_COLLECTIVE_RATE * deltaTime);
    } else if (input.isKeyPressed('keys')) {
      this.helicopterControls.collective = Math.max(0.0, this.helicopterControls.collective - HELI_COLLECTIVE_RATE * deltaTime);
    } else if (this.helicopterControls.autoHover) {
      this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, HELI_AUTOHOVER_TARGET, deltaTime * HELI_AUTOHOVER_RATE);
    } else {
      this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, 0.0, deltaTime * HELI_DECAY_RATE);
    }

    // --- Yaw (tail rotor, turning) ---
    if (hasTouchHeliMode) {
      // Left joystick X axis: right = yaw right (negative), left = yaw left (positive)
      const touchMove = input.getTouchMovementVector();
      if (Math.abs(touchMove.x) > HELI_TOUCH_JOYSTICK_DEADZONE) {
        this.helicopterControls.yaw = -touchMove.x;
      } else {
        this.helicopterControls.yaw = THREE.MathUtils.lerp(this.helicopterControls.yaw, 0, deltaTime * HELI_YAW_CENTER_RATE);
      }
    } else if (input.isKeyPressed('keya')) {
      this.helicopterControls.yaw = Math.min(1.0, this.helicopterControls.yaw + HELI_YAW_RATE * deltaTime);
    } else if (input.isKeyPressed('keyd')) {
      this.helicopterControls.yaw = Math.max(-1.0, this.helicopterControls.yaw - HELI_YAW_RATE * deltaTime);
    } else {
      this.helicopterControls.yaw = THREE.MathUtils.lerp(this.helicopterControls.yaw, 0, deltaTime * HELI_YAW_CENTER_RATE);
    }

    // --- Cyclic Pitch/Roll ---
    // Touch cyclic (right joystick) overrides keyboard when active
    const touchCyclic = input.getTouchCyclicInput();
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > HELI_TOUCH_CYCLIC_DEADZONE || Math.abs(touchCyclic.roll) > HELI_TOUCH_CYCLIC_DEADZONE;

    if (hasTouchCyclic) {
      // Direct mapping from touch joystick position
      this.helicopterControls.cyclicPitch = touchCyclic.pitch;
      this.helicopterControls.cyclicRoll = touchCyclic.roll;
    } else if (input.isKeyPressed('arrowup')) {
      this.helicopterControls.cyclicPitch = Math.min(1.0, this.helicopterControls.cyclicPitch + HELI_CYCLIC_RATE * deltaTime);
    } else if (input.isKeyPressed('arrowdown')) {
      this.helicopterControls.cyclicPitch = Math.max(-1.0, this.helicopterControls.cyclicPitch - HELI_CYCLIC_RATE * deltaTime);
    } else {
      this.helicopterControls.cyclicPitch = THREE.MathUtils.lerp(this.helicopterControls.cyclicPitch, 0, deltaTime * HELI_CYCLIC_LEVEL_RATE);
    }

    // Cyclic Roll (Arrow Left/Right) - left/right banking
    // Skip keyboard roll when touch cyclic is active (already set above)
    if (!hasTouchCyclic) {
      if (input.isKeyPressed('arrowleft')) {
        this.helicopterControls.cyclicRoll = Math.max(-1.0, this.helicopterControls.cyclicRoll - HELI_CYCLIC_RATE * deltaTime);
      } else if (input.isKeyPressed('arrowright')) {
        this.helicopterControls.cyclicRoll = Math.min(1.0, this.helicopterControls.cyclicRoll + HELI_CYCLIC_RATE * deltaTime);
      } else {
        this.helicopterControls.cyclicRoll = THREE.MathUtils.lerp(this.helicopterControls.cyclicRoll, 0, deltaTime * HELI_CYCLIC_LEVEL_RATE);
      }
    }

    // Send controls to helicopter model
    if (this.helicopterModel && this.playerState.helicopterId) {
      this.helicopterModel.setHelicopterControls(this.playerState.helicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD with real engine RPM from physics
    if (hudSystem) {
      let rpm = this.helicopterControls.collective * 0.8 + 0.2; // fallback
      if (this.helicopterModel && this.playerState.helicopterId) {
        const state = this.helicopterModel.getHelicopterState(this.playerState.helicopterId);
        if (state) rpm = state.engineRPM;
      }
      hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        rpm,
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost
      );
    }
  }

  addMouseControlToHelicopter(mouseMovement: { x: number; y: number }, mouseSensitivity: number = HELI_MOUSE_SENSITIVITY_DEFAULT): void {
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

  /** Clamp position to world boundary and bounce velocity inward. */
  private enforceWorldBoundary(position: THREE.Vector3, halfExtent: number): void {
    if (position.x > halfExtent) {
      position.x = halfExtent;
      this.playerState.velocity.x = -Math.abs(this.playerState.velocity.x) * BOUNDARY_BOUNCE_FACTOR;
    } else if (position.x < -halfExtent) {
      position.x = -halfExtent;
      this.playerState.velocity.x = Math.abs(this.playerState.velocity.x) * BOUNDARY_BOUNCE_FACTOR;
    }
    if (position.z > halfExtent) {
      position.z = halfExtent;
      this.playerState.velocity.z = -Math.abs(this.playerState.velocity.z) * BOUNDARY_BOUNCE_FACTOR;
    } else if (position.z < -halfExtent) {
      position.z = -halfExtent;
      this.playerState.velocity.z = Math.abs(this.playerState.velocity.z) * BOUNDARY_BOUNCE_FACTOR;
    }
  }
}
