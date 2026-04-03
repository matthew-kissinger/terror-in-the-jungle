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
import {
  canStepUp,
  computeSlopeSlideVelocity,
  isWalkableSlope,
  SLOPE_SLIDE_STRENGTH,
} from '../terrain/SlopePhysics';
import { FixedStepRunner } from '../../utils/FixedStepRunner';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';
import { movementStatsTracker } from './MovementStatsTracker';
import {
  computeForwardGrade,
  computeSlopeValueFromNormal,
  computeSmoothedSupportNormal,
} from '../terrain/GameplaySurfaceSampling';

const _moveVector = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _worldMoveVector = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);
const _terrainNormal = new THREE.Vector3(0, 1, 0);
const _previousTerrainNormal = new THREE.Vector3(0, 1, 0);
const _terrainFlowDirection = new THREE.Vector3();
const _terrainFlowTargetVelocity = new THREE.Vector3();
const _uphillDirection = new THREE.Vector3();
const _contourA = new THREE.Vector3();
const _contourB = new THREE.Vector3();

// ── Player movement tuning ──
const MOVEMENT_ACCELERATION = 5;
const FRICTION_RATE = 8;
const PLAYER_EYE_HEIGHT = 2;
const PLAYER_CROUCH_EYE_HEIGHT = 1.2;
const CROUCH_SPEED_MULTIPLIER = 0.5;
const PLAYER_COLLISION_RADIUS = 0.5;
const LANDING_SOUND_THRESHOLD = -5;
const BOUNDARY_BOUNCE_FACTOR = 0.5;
const PLAYER_SUPPORT_SAMPLE_DISTANCE = 1.35;
const PLAYER_SUPPORT_FOOTPRINT_RADIUS = 0.8;
const PLAYER_SUPPORT_LOOKAHEAD = 0.95;
const PLAYER_SUPPORT_NORMAL_SMOOTHING = 0.35;
const PLAYER_STEEP_FLOW_SPEED_FACTOR = 0.82;
const PLAYER_STEEP_FLOW_MIN_SPEED = 1.4;
const PLAYER_STEEP_FLOW_LERP = 0.58;
const PLAYER_TERRAIN_LIP_RISE = 0.45;

// ── Helicopter control targets ──
// PlayerMovement emits raw target values; HelicopterPhysics.smoothControlInputs() handles ramping.
const HELI_AUTOHOVER_TARGET = 0.4;
const HELI_TOUCH_JOYSTICK_DEADZONE = 0.1;
const HELI_TOUCH_CYCLIC_DEADZONE = 0.05;
const HELI_MOUSE_SENSITIVITY_DEFAULT = 0.5;

export class PlayerMovement {
  static readonly FIXED_STEP_SECONDS = 0.016;
  private playerState: PlayerState;
  private terrainSystem?: ITerrainRuntime;
  private sandbagSystem?: SandbagSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private helicopterModel?: IHelicopterModel;
  private fixedWingModel?: import('../vehicle/FixedWingModel').FixedWingModel;
  private worldHalfExtent = 0;

  // Fixed-wing control state
  private fixedWingThrottle = 0;
  private fixedWingControls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  private fixedWingAutoLevel = false;
  private helicopterControls: HelicopterControls = {
    collective: 0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: true
  };
  private isRunning = false;
  private altitudeLock = false;
  private lockedCollective = HELI_AUTOHOVER_TARGET;
  private readonly movementStepper = new FixedStepRunner(PlayerMovement.FIXED_STEP_SECONDS, 1.0);
  private readonly supportNormal = new THREE.Vector3(0, 1, 0);
  private readonly sampledSupportNormal = new THREE.Vector3(0, 1, 0);
  private lastGroundWalkable = true;

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

  setFixedWingModel(fixedWingModel: import('../vehicle/FixedWingModel').FixedWingModel): void {
    this.fixedWingModel = fixedWingModel;
  }

  setCrouching(crouching: boolean): void {
    this.playerState.isCrouching = crouching;
  }

  isCrouching(): boolean {
    return this.playerState.isCrouching;
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

  toggleAltitudeLock(): void {
    this.altitudeLock = !this.altitudeLock;
    if (this.altitudeLock) {
      this.lockedCollective = this.helicopterControls.collective;
    }
    Logger.info('player', `Altitude lock ${this.altitudeLock ? 'ON' : 'OFF'} (collective ${this.lockedCollective.toFixed(2)})`);
  }

  getHelicopterControls(): HelicopterControls {
    return { ...this.helicopterControls };
  }

  updateMovement(deltaTime: number, input: PlayerInput, camera: THREE.Camera): void {
    this.movementStepper.step(deltaTime, (fixedDeltaTime) => {
      this.simulateMovementStep(fixedDeltaTime, input, camera);
    });
  }

  private simulateMovementStep(deltaTime: number, input: PlayerInput, camera: THREE.Camera): void {
    // Don't allow movement when in helicopter
    if (this.playerState.isInHelicopter) {
      this.playerState.velocity.set(0, 0, 0);
      return;
    }

    const moveVector = _moveVector.set(0, 0, 0);
    let baseSpeed = this.playerState.isRunning ? this.playerState.runSpeed : this.playerState.speed;
    if (this.playerState.isCrouching) {
      baseSpeed *= CROUCH_SPEED_MULTIPLIER;
    }

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

    let requestedSpeed = 0;
    let requestedMoveX = 0;
    let requestedMoveZ = 0;

    if (moveVector.length() > 0) {
      moveVector.normalize();

      const cameraDirection = _cameraDirection;
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0;
      cameraDirection.normalize();

      const cameraRight = _cameraRight;
      cameraRight.crossVectors(cameraDirection, _upVector);

      const worldMoveVector = _worldMoveVector.set(0, 0, 0);
      worldMoveVector.addScaledVector(cameraDirection, -moveVector.z);
      worldMoveVector.addScaledVector(cameraRight, moveVector.x);
      requestedMoveX = worldMoveVector.x;
      requestedMoveZ = worldMoveVector.z;
      requestedSpeed = baseSpeed;
    }

    _previousTerrainNormal.copy(this.supportNormal);
    const normal = this.sampleSupportNormal(
      this.playerState.position.x,
      this.playerState.position.z,
      requestedMoveX,
      requestedMoveZ,
      this.supportNormal,
      true,
    );
    const supportNormalDelta = 1 - THREE.MathUtils.clamp(_previousTerrainNormal.dot(normal), -1, 1);
    const supportSlopeValue = computeSlopeValueFromNormal(normal);
    const walkableSupport = !this.playerState.isGrounded || isWalkableSlope(supportSlopeValue);
    const walkabilityTransition = this.playerState.isGrounded && walkableSupport !== this.lastGroundWalkable;
    const grade = computeForwardGrade(
      this.sampleTerrainHeight.bind(this),
      this.playerState.position.x,
      this.playerState.position.z,
      requestedMoveX,
      requestedMoveZ,
      PLAYER_SUPPORT_LOOKAHEAD,
    );

    // Normalize movement vector
    if (moveVector.length() > 0) {
      const worldMoveVector = _worldMoveVector.set(requestedMoveX, 0, requestedMoveZ);
      if (this.playerState.isGrounded) {
        worldMoveVector.projectOnPlane(normal);
        if (worldMoveVector.lengthSq() < 0.0001) {
          worldMoveVector.set(requestedMoveX, 0, requestedMoveZ);
        }
      }
      worldMoveVector.normalize();

      // Apply movement with acceleration (only horizontal components)
      const acceleration = baseSpeed * MOVEMENT_ACCELERATION;
      const targetVelocity = worldMoveVector.multiplyScalar(baseSpeed);
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

    let sliding = false;
    if (this.playerState.isGrounded && !walkableSupport) {
      const slide = computeSlopeSlideVelocity(normal.x, normal.z, SLOPE_SLIDE_STRENGTH);
      this.playerState.velocity.x = slide.x;
      this.playerState.velocity.z = slide.z;
      sliding = true;
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
    const eyeHeight = this.playerState.isCrouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    let groundHeight = eyeHeight; // flat world fallback
    let currentGroundHeight = this.playerState.position.y;
    if (this.terrainSystem) {
      const currentEffectiveHeight = Number(this.terrainSystem.getEffectiveHeightAt(
        this.playerState.position.x,
        this.playerState.position.z,
      ));
      if (Number.isFinite(currentEffectiveHeight)) {
        currentGroundHeight = currentEffectiveHeight + eyeHeight;
      }

      const targetEffectiveHeight = Number(this.terrainSystem.getEffectiveHeightAt(newPosition.x, newPosition.z));
      if (Number.isFinite(targetEffectiveHeight)) {
        groundHeight = targetEffectiveHeight + eyeHeight;
      }
    }

    // Terrain should bias movement flow, not become an authority wall. Steep
    // faces redirect motion along the contour; only raised collision surfaces
    // retain hard step-up blocking.
    let blockedByTerrain = false;
    if (this.playerState.isGrounded && this.terrainSystem) {
      const currentTerrainHeight = Number(this.terrainSystem.getHeightAt(
        this.playerState.position.x,
        this.playerState.position.z,
      ));
      const targetTerrainHeight = Number(this.terrainSystem.getHeightAt(newPosition.x, newPosition.z));
      const targetSupportNormal = this.sampleSupportNormal(
        newPosition.x,
        newPosition.z,
        requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveX : this.playerState.velocity.x,
        requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveZ : this.playerState.velocity.z,
        _terrainNormal,
        false,
      );
      const targetSlopeValue = computeSlopeValueFromNormal(targetSupportNormal);
      const terrainRise = Number.isFinite(currentTerrainHeight) && Number.isFinite(targetTerrainHeight)
        ? targetTerrainHeight - currentTerrainHeight
        : 0;
      const effectiveRise = groundHeight - currentGroundHeight;
      const obstacleStepRise = Math.max(0, effectiveRise - Math.max(terrainRise, 0));
      const blockedBySteepTerrain = terrainRise > PLAYER_TERRAIN_LIP_RISE && !isWalkableSlope(targetSlopeValue);
      const blockedByRaisedSurface = obstacleStepRise > 0.05 && !canStepUp(currentGroundHeight, groundHeight);

      if (blockedByRaisedSurface) {
        newPosition.x = this.playerState.position.x;
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.x = 0;
        this.playerState.velocity.z = 0;
        blockedByTerrain = true;

        const resetGroundHeight = Number(this.terrainSystem.getEffectiveHeightAt(
          this.playerState.position.x,
          this.playerState.position.z,
        ));
        if (Number.isFinite(resetGroundHeight)) {
          groundHeight = resetGroundHeight + eyeHeight;
        }
      } else if (blockedBySteepTerrain) {
        blockedByTerrain = this.applySteepTerrainFlow(
          newPosition,
          targetSupportNormal,
          requestedMoveX,
          requestedMoveZ,
          deltaTime,
        );
        if (blockedByTerrain) {
          const flowedGroundHeight = Number(this.terrainSystem.getEffectiveHeightAt(newPosition.x, newPosition.z));
          if (Number.isFinite(flowedGroundHeight)) {
            groundHeight = flowedGroundHeight + eyeHeight;
          }
        }
      }
    }

    // Allow standing on top of sandbags
    if (this.sandbagSystem) {
      const sandbagTop = this.sandbagSystem.getStandingHeight(newPosition.x, newPosition.z);
      if (sandbagTop !== null) {
        const sandbagGround = sandbagTop + eyeHeight;
        if (sandbagGround > groundHeight) {
          groundHeight = sandbagGround;
        }
      }
    }

    // Check for landing and play landing sound
    const wasGrounded = this.playerState.isGrounded;

    const impactVelocityY = this.playerState.velocity.y;
    if (newPosition.y <= groundHeight) {
      // Player is on or below ground
      newPosition.y = groundHeight;

      // Play landing sound if we just landed
      if (!wasGrounded && impactVelocityY < LANDING_SOUND_THRESHOLD && this.footstepAudioSystem) {
        this.footstepAudioSystem.playLandingSound(newPosition, Math.abs(impactVelocityY));
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
    const actualHorizontalSpeed = Math.hypot(this.playerState.velocity.x, this.playerState.velocity.z);
    performanceTelemetry.recordPlayerMovementSample(
      this.playerState.isGrounded,
      normal.y,
      supportNormalDelta,
      requestedSpeed,
      actualHorizontalSpeed,
      grade,
      sliding,
      blockedByTerrain,
      walkabilityTransition,
      deltaTime,
      this.playerState.position.x,
      this.playerState.position.z,
    );
    movementStatsTracker.recordPlayerSample(
      this.playerState.isGrounded,
      requestedSpeed,
      actualHorizontalSpeed,
      grade,
      sliding,
      blockedByTerrain,
      deltaTime,
      this.playerState.position.x,
      this.playerState.position.z,
    );
    if (this.playerState.isGrounded) {
      this.lastGroundWalkable = walkableSupport;
    }

    // Play footstep sounds when moving on ground
    if (this.footstepAudioSystem && !this.playerState.isInHelicopter && !this.playerState.isInFixedWing) {
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
    // Raw target values - HelicopterPhysics.smoothControlInputs() handles all ramping.
    const touchControls = input.getTouchControls();
    const hasTouchHeliMode = touchControls?.isInHelicopterMode() ?? false;

    // --- Collective (vertical thrust) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      const collectiveInput = -touchMove.z; // Invert: joystick up = more thrust
      if (Math.abs(collectiveInput) > HELI_TOUCH_JOYSTICK_DEADZONE) {
        this.helicopterControls.collective = (collectiveInput + 1) / 2; // Map [-1,1] to [0,1]
        this.altitudeLock = false; // Manual input disengages altitude lock
      } else {
        this.helicopterControls.collective = this.getIdleCollective();
      }
    } else if (input.isKeyPressed('keyw')) {
      this.helicopterControls.collective = 1.0;
      this.altitudeLock = false;
    } else if (input.isKeyPressed('keys')) {
      this.helicopterControls.collective = 0.0;
      this.altitudeLock = false;
    } else {
      this.helicopterControls.collective = this.getIdleCollective();
    }

    // --- Yaw (tail rotor, turning) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      this.helicopterControls.yaw = Math.abs(touchMove.x) > HELI_TOUCH_JOYSTICK_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      this.helicopterControls.yaw = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      this.helicopterControls.yaw = -1.0;
    } else {
      this.helicopterControls.yaw = 0;
    }

    // --- Cyclic Pitch/Roll ---
    const touchCyclic = input.getTouchCyclicInput();
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > HELI_TOUCH_CYCLIC_DEADZONE || Math.abs(touchCyclic.roll) > HELI_TOUCH_CYCLIC_DEADZONE;

    if (hasTouchCyclic) {
      this.helicopterControls.cyclicPitch = touchCyclic.pitch;
      this.helicopterControls.cyclicRoll = touchCyclic.roll;
    } else {
      this.helicopterControls.cyclicPitch = input.isKeyPressed('arrowup') ? 1.0
        : input.isKeyPressed('arrowdown') ? -1.0 : 0;
      this.helicopterControls.cyclicRoll = input.isKeyPressed('arrowright') ? 1.0
        : input.isKeyPressed('arrowleft') ? -1.0 : 0;
    }

    // Send controls to helicopter model
    if (this.helicopterModel && this.playerState.helicopterId) {
      this.helicopterModel.setHelicopterControls(this.playerState.helicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD
    if (hudSystem) {
      let rpm = this.helicopterControls.collective * 0.8 + 0.2;
      if (this.helicopterModel && this.playerState.helicopterId) {
        const state = this.helicopterModel.getHelicopterState(this.playerState.helicopterId);
        if (state) rpm = state.engineRPM;

        const flightData = this.helicopterModel.getFlightData(this.playerState.helicopterId);
        if (flightData) {
          hudSystem.updateHelicopterFlightData(flightData.airspeed, flightData.heading, flightData.verticalSpeed);
        }
      }
      hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        rpm,
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost
      );
    }
  }

  /** Collective target when no W/S key is pressed. */
  private getIdleCollective(): number {
    if (this.altitudeLock) return this.lockedCollective;
    if (this.helicopterControls.autoHover) return HELI_AUTOHOVER_TARGET;
    return 0;
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

  // ── Fixed-wing controls ──

  private static readonly FW_THROTTLE_RAMP_RATE = 0.8; // units/sec
  private static readonly FW_MOUSE_SENSITIVITY = 0.5;
  private static readonly FW_TOUCH_DEADZONE = 0.1;
  private static readonly FW_AUTO_LEVEL_RATE = 2.0; // rad/sec to zero out roll/pitch

  updateFixedWingControls(
    deltaTime: number,
    input: PlayerInput,
    fixedWingModel?: import('../vehicle/FixedWingModel').FixedWingModel,
    hudSystem?: IHUDSystem,
  ): void {
    const touchControls = input.getTouchControls();
    const hasTouchMode = touchControls?.isInHelicopterMode() ?? false;

    // --- Throttle (persistent: W increases, S decreases, neither holds) ---
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      const throttleRate = -touchMove.z; // up = positive = increase
      if (Math.abs(throttleRate) > PlayerMovement.FW_TOUCH_DEADZONE) {
        this.fixedWingThrottle = THREE.MathUtils.clamp(
          this.fixedWingThrottle + throttleRate * deltaTime * PlayerMovement.FW_THROTTLE_RAMP_RATE,
          0, 1,
        );
      }
    } else if (input.isKeyPressed('keyw')) {
      this.fixedWingThrottle = Math.min(this.fixedWingThrottle + deltaTime * PlayerMovement.FW_THROTTLE_RAMP_RATE, 1.0);
    } else if (input.isKeyPressed('keys')) {
      this.fixedWingThrottle = Math.max(this.fixedWingThrottle - deltaTime * PlayerMovement.FW_THROTTLE_RAMP_RATE, 0.0);
    }
    this.fixedWingControls.throttle = this.fixedWingThrottle;

    // --- Yaw (rudder) ---
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      this.fixedWingControls.yaw = Math.abs(touchMove.x) > PlayerMovement.FW_TOUCH_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      this.fixedWingControls.yaw = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      this.fixedWingControls.yaw = -1.0;
    } else {
      this.fixedWingControls.yaw = 0;
    }

    // --- Pitch / Roll ---
    // Gamepad: left stick -> pitch (Y) and roll (X) in flight-sim style
    const gp = input.getGamepadManager?.();
    const gpActive = gp?.isActive() ?? false;

    const touchCyclic = input.getTouchCyclicInput();
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > 0.05 || Math.abs(touchCyclic.roll) > 0.05;

    if (gpActive && gp) {
      const gpMove = gp.getMovementVector();
      const gpPitch = -gpMove.z; // Stick forward (negative z) = nose down (negative pitch), invert
      const gpRoll = gpMove.x;
      if (Math.abs(gpPitch) > 0.05 || Math.abs(gpRoll) > 0.05) {
        this.fixedWingControls.pitch = gpPitch;
        this.fixedWingControls.roll = gpRoll;
        this.fixedWingAutoLevel = false;
      } else {
        this.fixedWingControls.pitch = 0;
        this.fixedWingControls.roll = 0;
      }
      // Gamepad triggers for throttle: RT = increase, LT = decrease
      // Read trigger values as analog throttle adjustment
      // (onFireStart/onFireStop callbacks don't fire when we consume here;
      //  we rely on the raw axis values or the existing keyboard fallback)
    } else if (hasTouchCyclic) {
      this.fixedWingControls.pitch = touchCyclic.pitch;
      this.fixedWingControls.roll = touchCyclic.roll;
      this.fixedWingAutoLevel = false;
    } else {
      const pitchInput = input.isKeyPressed('arrowup') ? 1.0
        : input.isKeyPressed('arrowdown') ? -1.0 : 0;
      const rollInput = input.isKeyPressed('arrowright') ? 1.0
        : input.isKeyPressed('arrowleft') ? -1.0 : 0;

      if (pitchInput !== 0 || rollInput !== 0) {
        this.fixedWingAutoLevel = false;
      }

      this.fixedWingControls.pitch = pitchInput;
      this.fixedWingControls.roll = rollInput;
    }

    // Auto-level: gradually zero pitch/roll when active and no manual input
    if (this.fixedWingAutoLevel && this.fixedWingControls.pitch === 0 && this.fixedWingControls.roll === 0) {
      // Apply gentle correction inputs that FixedWingPhysics will smooth
      const model = fixedWingModel ?? this.fixedWingModel;
      if (model && this.playerState.fixedWingId) {
        const fd = model.getFlightData(this.playerState.fixedWingId);
        if (fd) {
          // Correct roll toward 0
          if (Math.abs(fd.roll) > 2) {
            this.fixedWingControls.roll = -THREE.MathUtils.clamp(fd.roll / 45, -1, 1);
          }
          // Correct pitch toward slight nose-up (3 degrees)
          if (Math.abs(fd.pitch - 3) > 2) {
            this.fixedWingControls.pitch = THREE.MathUtils.clamp((3 - fd.pitch) / 30, -0.5, 0.5);
          }
        }
      }
    }

    // Send controls to model
    const model = fixedWingModel ?? this.fixedWingModel;
    if (model) {
      model.setFixedWingControls(this.fixedWingControls);
    }

    // Update fixed-wing HUD
    if (hudSystem) {
      hudSystem.updateElevation(this.playerState.position.y);
      const fwModel = fixedWingModel ?? this.fixedWingModel;
      if (fwModel && this.playerState.fixedWingId) {
        const fd = fwModel.getFlightData(this.playerState.fixedWingId);
        if (fd) {
          (hudSystem as any).updateFixedWingFlightData?.(fd.airspeed, fd.heading, fd.verticalSpeed);
          (hudSystem as any).updateFixedWingThrottle?.(this.fixedWingThrottle);
          (hudSystem as any).setFixedWingStallWarning?.(fd.isStalled);
          (hudSystem as any).setFixedWingAutoLevel?.(this.fixedWingAutoLevel);
        }
      }
    }
  }

  toggleAutoLevel(): void {
    this.fixedWingAutoLevel = !this.fixedWingAutoLevel;
    Logger.info('player', `Auto-level ${this.fixedWingAutoLevel ? 'enabled' : 'disabled'}`);
  }

  addMouseControlToFixedWing(
    mouseMovement: { x: number; y: number },
    mouseSensitivity: number = PlayerMovement.FW_MOUSE_SENSITIVITY,
  ): void {
    this.fixedWingControls.roll = THREE.MathUtils.clamp(
      this.fixedWingControls.roll + mouseMovement.x * mouseSensitivity,
      -1.0, 1.0,
    );
    this.fixedWingControls.pitch = THREE.MathUtils.clamp(
      this.fixedWingControls.pitch - mouseMovement.y * mouseSensitivity,
      -1.0, 1.0,
    );
    this.fixedWingAutoLevel = false;
  }

  resetFixedWingControls(): void {
    this.fixedWingThrottle = 0;
    this.fixedWingControls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.fixedWingAutoLevel = false;
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

  private applySteepTerrainFlow(
    newPosition: THREE.Vector3,
    targetSupportNormal: THREE.Vector3,
    requestedMoveX: number,
    requestedMoveZ: number,
    deltaTime: number,
  ): boolean {
    const downhillLength = Math.hypot(targetSupportNormal.x, targetSupportNormal.z);
    if (downhillLength <= 0.001) {
      return false;
    }

    _uphillDirection.set(
      -targetSupportNormal.x / downhillLength,
      0,
      -targetSupportNormal.z / downhillLength,
    );

    const desiredDirection = _terrainFlowDirection.set(
      requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveX : this.playerState.velocity.x,
      0,
      requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveZ : this.playerState.velocity.z,
    );
    if (desiredDirection.lengthSq() <= 0.0001) {
      return false;
    }

    desiredDirection.projectOnPlane(targetSupportNormal);
    desiredDirection.y = 0;

    const uphillDot = downhillLength > 0.001 ? desiredDirection.dot(_uphillDirection) : 0;
    if (uphillDot > 0) {
      desiredDirection.addScaledVector(_uphillDirection, -uphillDot);
    }

    if (desiredDirection.lengthSq() <= 0.0001) {
      _contourA.set(-_uphillDirection.z, 0, _uphillDirection.x);
      _contourB.set(_uphillDirection.z, 0, -_uphillDirection.x);
      const contourAAlignment = _contourA.dot(_horizontalVelocity.set(this.playerState.velocity.x, 0, this.playerState.velocity.z));
      const contourBAlignment = _contourB.dot(_horizontalVelocity);
      desiredDirection.copy(contourAAlignment >= contourBAlignment ? _contourA : _contourB);
    }

    desiredDirection.normalize();

    const currentSpeed = Math.hypot(this.playerState.velocity.x, this.playerState.velocity.z);
    const flowedSpeed = Math.max(PLAYER_STEEP_FLOW_MIN_SPEED, currentSpeed * PLAYER_STEEP_FLOW_SPEED_FACTOR);
    const targetVelocity = _terrainFlowTargetVelocity.copy(desiredDirection).multiplyScalar(flowedSpeed);
    this.playerState.velocity.x = THREE.MathUtils.lerp(
      this.playerState.velocity.x,
      targetVelocity.x,
      PLAYER_STEEP_FLOW_LERP,
    );
    this.playerState.velocity.z = THREE.MathUtils.lerp(
      this.playerState.velocity.z,
      targetVelocity.z,
      PLAYER_STEEP_FLOW_LERP,
    );
    newPosition.x = this.playerState.position.x + this.playerState.velocity.x * deltaTime;
    newPosition.z = this.playerState.position.z + this.playerState.velocity.z * deltaTime;
    return true;
  }

  private sampleSupportNormal(
    x: number,
    z: number,
    moveX: number,
    moveZ: number,
    target: THREE.Vector3,
    smooth: boolean,
  ): THREE.Vector3 {
    computeSmoothedSupportNormal(
      this.sampleTerrainHeight.bind(this),
      x,
      z,
      this.sampledSupportNormal,
      {
        sampleDistance: PLAYER_SUPPORT_SAMPLE_DISTANCE,
        footprintRadius: PLAYER_SUPPORT_FOOTPRINT_RADIUS,
        lookaheadDistance: PLAYER_SUPPORT_LOOKAHEAD,
        moveX,
        moveZ,
      },
    );

    if (!this.playerState.isGrounded) {
      return target.copy(this.sampledSupportNormal);
    }

    if (!smooth) {
      return target.copy(this.sampledSupportNormal);
    }

    return target
      .lerp(this.sampledSupportNormal, PLAYER_SUPPORT_NORMAL_SMOOTHING)
      .normalize();
  }

  private sampleTerrainHeight(x: number, z: number): number {
    if (this.terrainSystem) {
      return this.terrainSystem.getHeightAt(x, z);
    }
    return getHeightQueryCache().getHeightAt(x, z);
  }
}
