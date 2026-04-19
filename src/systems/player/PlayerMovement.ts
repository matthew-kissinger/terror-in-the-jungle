import * as THREE from 'three';
import { PlayerState } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import { PlayerInput } from './PlayerInput';
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
// Player eye height. Raised from 2 → 2.2 so a typical soldier (NVA/VC/US) on
// flat ground does not feel undersized next to the NPC sprite silhouette.
// The perf-active harness driver keeps its own PLAYER_EYE_HEIGHT mirror in
// scripts/perf-active-driver.cjs — update both when touching this number.
// Crouch scales proportionally (1.2 → 1.32, same 0.6 ratio to standing).
export const PLAYER_EYE_HEIGHT = 2.2;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.32;
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

export class PlayerMovement {
  static readonly FIXED_STEP_SECONDS = 0.016;
  private playerState: PlayerState;
  private terrainSystem?: ITerrainRuntime;
  private sandbagSystem?: SandbagSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private worldHalfExtent = 0;
  private isRunning = false;
  private readonly movementStepper = new FixedStepRunner(PlayerMovement.FIXED_STEP_SECONDS, 1.0);
  private readonly supportNormal = new THREE.Vector3(0, 1, 0);
  private readonly sampledSupportNormal = new THREE.Vector3(0, 1, 0);
  private lastGroundWalkable = true;
  /**
   * Agent-driven movement intent in camera-relative coordinates (forward, strafe).
   * When active, overrides keyboard/touch input in the movement loop. See
   * `AgentController` in `src/systems/agent/`.
   */
  private agentMovementIntent: { forward: number; strafe: number } | null = null;

  constructor(playerState: PlayerState) {
    this.playerState = playerState;
  }

  /**
   * Set the camera-relative movement intent driven by an external agent.
   * `null` to clear and hand control back to keyboard/touch input.
   */
  setAgentMovementIntent(intent: { forward: number; strafe: number } | null): void {
    this.agentMovementIntent = intent;
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

  setCrouching(crouching: boolean): void {
    this.playerState.isCrouching = crouching;
  }

  isCrouching(): boolean {
    return this.playerState.isCrouching;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
    this.playerState.isRunning = running;
  }

  handleJump(): void {
    if (this.playerState.isGrounded && !this.playerState.isJumping) {
      this.playerState.velocity.y = this.playerState.jumpForce;
      this.playerState.isJumping = true;
      this.playerState.isGrounded = false;
    }
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

    // Calculate movement direction based on camera orientation.
    // Priority: agent-driven intent (if set) > touch joystick > keyboard.
    const agentIntent = this.agentMovementIntent;
    if (agentIntent && (Math.abs(agentIntent.forward) > 0.01 || Math.abs(agentIntent.strafe) > 0.01)) {
      // Agent intent is in camera-relative axes already: forward along camera,
      // strafe along camera right. Match the touch-joystick convention where
      // -z is forward, +x is strafe right.
      moveVector.x = agentIntent.strafe;
      moveVector.z = -agentIntent.forward;
    } else {
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
