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
import { isWorldBuilderFlagActive } from '../../dev/worldBuilder/WorldBuilderConsole';
import {
  enforceWorldBoundary,
  resolveMovementIntent,
} from './movement/MovementKinematics';
import {
  PlayerSwimState,
  type LocomotionMode,
  type WaterSampler,
} from './PlayerSwimState';

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

const MOVEMENT_ACCELERATION = 5;
const FRICTION_RATE = 8;
// Player eye height. Raised from 2 → 2.2 so a typical soldier (NVA/VC/US) on
// flat ground does not feel undersized next to the NPC sprite silhouette.
// The perf-active harness driver keeps its own PLAYER_EYE_HEIGHT mirror in
// scripts/perf-active-driver.cjs — update both when touching this number.
// Crouch scales proportionally (1.2 → 1.32, same 0.6 ratio to standing).
export const PLAYER_EYE_HEIGHT = 2.2;
const PLAYER_CROUCH_EYE_HEIGHT = 1.32;
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
// Bound one-frame grounded rises from collision boxes, cliff seams, or stamped lips.
const PLAYER_MAX_GROUND_RISE_PER_STEP = 0.75;

export interface PlayerMovementDebugSnapshot {
  blockReason: string;
  requestedSpeed: number;
  actualHorizontalSpeed: number;
  blockedByTerrain: boolean;
  grounded: boolean;
  walking: boolean;
  positionX: number;
  positionY: number;
  positionZ: number;
  candidateX: number;
  candidateZ: number;
  currentTerrainHeight: number | null;
  targetTerrainHeight: number | null;
  currentGroundHeight: number | null;
  targetGroundHeight: number | null;
  terrainRise: number | null;
  effectiveRise: number | null;
  obstacleStepRise: number | null;
  targetSlopeValue: number | null;
  supportSlopeValue: number | null;
  grade: number;
}

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
  private lastDebugSnapshot: PlayerMovementDebugSnapshot | null = null;
  private agentMovementIntent: { forward: number; strafe: number } | null = null;
  private agentWorldMovementIntent: { x: number; z: number } | null = null;
  private waterSampler: WaterSampler | null = null;
  private readonly swimState = new PlayerSwimState();
  private readonly headPositionScratch = new THREE.Vector3();
  private readonly swimInputScratch = {
    forward: 0,
    strafe: 0,
    ascend: false,
    descend: false,
  };
  private readonly swimContextScratch = {
    position: new THREE.Vector3(),
    headPosition: new THREE.Vector3(),
    camera: null as unknown as THREE.Camera,
    baseSpeed: 0,
    input: { forward: 0, strafe: 0, ascend: false, descend: false },
    dt: 0,
  };
  private onDrowningDamage?: (damage: number) => void;
  private onSurfaceGasp?: () => void;

  constructor(playerState: PlayerState) {
    this.playerState = playerState;
  }

  setAgentMovementIntent(intent: { forward: number; strafe: number } | null): void {
    this.agentMovementIntent = intent;
    this.agentWorldMovementIntent = null;
  }

  setAgentWorldMovementIntent(intent: { x: number; z: number } | null): void {
    this.agentWorldMovementIntent = intent;
    this.agentMovementIntent = null;
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

  /**
   * Bind the water sampler (typically the WaterSystem). When set, the player
   * enters swim mode whenever the head sample reports `submerged === true`.
   * Pass `null` to disable swim handling (e.g. during teardown or in modes
   * that suppress water — keeps PlayerMovement decoupled from WaterSystem).
   */
  setWaterSampler(sampler: WaterSampler | null): void {
    this.waterSampler = sampler;
  }

  /**
   * Wire callbacks the swim state machine fires on resurface / drowning.
   * `onSurfaceGasp` runs once when the gasp trigger has fired underwater and
   * the player surfaces. `onDrowningDamage(amount)` runs each frame the
   * player is still underwater past breath capacity.
   */
  setSwimCallbacks(callbacks: {
    onDrowningDamage?: (damage: number) => void;
    onSurfaceGasp?: () => void;
  }): void {
    this.onDrowningDamage = callbacks.onDrowningDamage;
    this.onSurfaceGasp = callbacks.onSurfaceGasp;
  }

  /** Current locomotion mode for HUD / animation consumers. */
  getLocomotionMode(): LocomotionMode {
    return this.swimState.getMode();
  }

  /** Read-only handle to swim/breath/stamina state for HUD wiring. */
  getSwimState(): PlayerSwimState {
    return this.swimState;
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

  getDebugSnapshot(): PlayerMovementDebugSnapshot | null {
    return this.lastDebugSnapshot ? { ...this.lastDebugSnapshot } : null;
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

    // Swim/wade/walk state branch. Sample at head position (eye height) so
    // wading in shoulder-deep water still counts as walk; only true head
    // submersion flips into the swim path.
    if (this.waterSampler) {
      const eyeHeight = this.playerState.isCrouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
      this.headPositionScratch
        .copy(this.playerState.position)
        .setY(this.playerState.position.y + (eyeHeight - PLAYER_EYE_HEIGHT));
      this.swimInputScratch.forward =
        (input.isKeyPressed('keyw') ? 1 : 0) - (input.isKeyPressed('keys') ? 1 : 0);
      this.swimInputScratch.strafe =
        (input.isKeyPressed('keyd') ? 1 : 0) - (input.isKeyPressed('keya') ? 1 : 0);
      this.swimInputScratch.ascend = input.isKeyPressed('space');
      this.swimInputScratch.descend =
        input.isKeyPressed('controlleft') || input.isKeyPressed('controlright');
      this.swimContextScratch.position = this.playerState.position;
      this.swimContextScratch.headPosition = this.headPositionScratch;
      this.swimContextScratch.camera = camera;
      this.swimContextScratch.baseSpeed = baseSpeed;
      this.swimContextScratch.dt = deltaTime;
      this.swimContextScratch.input = this.swimInputScratch;

      const swimResult = this.swimState.tick(this.waterSampler, this.swimContextScratch);

      // Drowning damage tick + resurface gasp callback. The damage magnitude
      // lives with the swim state machine; PlayerHealthSystem clamps + death.
      if (this.swimState.isDrowning() && this.onDrowningDamage) {
        this.onDrowningDamage(8 * deltaTime);
      }
      if (swimResult.surfacedThisStep && this.swimState.consumeGasp() && this.onSurfaceGasp) {
        this.onSurfaceGasp();
      }

      if (swimResult.mode === 'swim') {
        // 3D swim integration: no gravity, depth-scaled drag, transitions
        // back through wade -> walk happen automatically once head clears.
        const velocity = this.swimState.computeSwimVelocity(
          this.swimContextScratch,
          this.playerState.velocity,
        );
        this.playerState.velocity.copy(velocity);
        this.playerState.position.addScaledVector(this.playerState.velocity, deltaTime);
        // Treat the player as not grounded while swimming so jump + gravity
        // resume cleanly on surface exit.
        this.playerState.isGrounded = false;
        this.playerState.isJumping = false;
        return;
      }
    }

    const {
      requestedSpeed,
      requestedMoveX,
      requestedMoveZ,
      hasWorldMovementIntent,
    } = resolveMovementIntent({
      input,
      camera,
      baseSpeed,
      agentMovementIntent: this.agentMovementIntent,
      agentWorldMovementIntent: this.agentWorldMovementIntent,
      moveVector,
      cameraDirection: _cameraDirection,
      cameraRight: _cameraRight,
      worldMoveVector: _worldMoveVector,
      upVector: _upVector,
    });

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
    if (hasWorldMovementIntent || moveVector.length() > 0) {
      const worldMoveVector = _worldMoveVector.set(requestedMoveX, 0, requestedMoveZ);
      if (this.playerState.isGrounded) {
        worldMoveVector.projectOnPlane(normal);
        if (worldMoveVector.lengthSq() < 0.0001) {
          worldMoveVector.set(requestedMoveX, 0, requestedMoveZ);
        }
      }
      worldMoveVector.normalize();

      const acceleration = baseSpeed * MOVEMENT_ACCELERATION;
      const targetVelocity = worldMoveVector.multiplyScalar(baseSpeed);
      const horizontalVelocity = _horizontalVelocity.set(this.playerState.velocity.x, 0, this.playerState.velocity.z);

      horizontalVelocity.lerp(targetVelocity, Math.min(deltaTime * acceleration, 1));

      this.playerState.velocity.x = horizontalVelocity.x;
      this.playerState.velocity.z = horizontalVelocity.z;
    } else {
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

    // Dev-only noClip skips gravity, ground-snap, blocking, and world boundary.
    const noClipActive = import.meta.env.DEV && isWorldBuilderFlagActive('noClip');

    if (!noClipActive) {
      this.playerState.velocity.y += this.playerState.gravity * deltaTime;
    } else {
      this.playerState.velocity.y = 0;
    }

    const movement = _cameraRight.copy(this.playerState.velocity).multiplyScalar(deltaTime);
    const newPosition = _cameraDirection.copy(this.playerState.position).add(movement);
    let blockReason = 'none';
    let currentTerrainHeight: number | null = null;
    let targetTerrainHeight: number | null = null;
    let terrainRise: number | null = null;
    let effectiveRise: number | null = null;
    let obstacleStepRise: number | null = null;
    let targetSlopeValue: number | null = null;

    if (!noClipActive && this.sandbagSystem && this.sandbagSystem.checkCollision(newPosition, PLAYER_COLLISION_RADIUS)) {
      const slideX = _worldMoveVector.copy(this.playerState.position);
      slideX.x = newPosition.x;
      const slideZ = _horizontalVelocity.copy(this.playerState.position);
      slideZ.z = newPosition.z;

      if (!this.sandbagSystem.checkCollision(slideX, PLAYER_COLLISION_RADIUS)) {
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.z = 0;
      } else if (!this.sandbagSystem.checkCollision(slideZ, PLAYER_COLLISION_RADIUS)) {
        newPosition.x = this.playerState.position.x;
        this.playerState.velocity.x = 0;
      } else {
        newPosition.x = this.playerState.position.x;
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.x = 0;
        this.playerState.velocity.z = 0;
        blockReason = 'sandbag';
      }
    }

    const eyeHeight = this.playerState.isCrouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    let groundHeight = eyeHeight;
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

    let blockedByTerrain = false;
    if (!noClipActive && this.playerState.isGrounded && this.terrainSystem) {
      currentTerrainHeight = Number(this.terrainSystem.getHeightAt(
        this.playerState.position.x,
        this.playerState.position.z,
      ));
      targetTerrainHeight = Number(this.terrainSystem.getHeightAt(newPosition.x, newPosition.z));
      const targetSupportNormal = this.sampleSupportNormal(
        newPosition.x,
        newPosition.z,
        requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveX : this.playerState.velocity.x,
        requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveZ : this.playerState.velocity.z,
        _terrainNormal,
        false,
      );
      targetSlopeValue = computeSlopeValueFromNormal(targetSupportNormal);
      terrainRise = Number.isFinite(currentTerrainHeight) && Number.isFinite(targetTerrainHeight)
        ? targetTerrainHeight - currentTerrainHeight
        : 0;
      effectiveRise = groundHeight - currentGroundHeight;
      obstacleStepRise = Math.max(0, effectiveRise - Math.max(terrainRise, 0));
      const blockedBySteepTerrain = terrainRise > PLAYER_TERRAIN_LIP_RISE && !isWalkableSlope(targetSlopeValue);
      const blockedByRaisedSurface = obstacleStepRise > 0.05 && !canStepUp(currentGroundHeight, groundHeight);

      if (blockedByRaisedSurface) {
        newPosition.x = this.playerState.position.x;
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.x = 0;
        this.playerState.velocity.z = 0;
        blockedByTerrain = true;
        blockReason = 'raised_surface';

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
          blockReason = 'steep_terrain_flow';
          const flowedGroundHeight = Number(this.terrainSystem.getEffectiveHeightAt(newPosition.x, newPosition.z));
          if (Number.isFinite(flowedGroundHeight)) {
            groundHeight = flowedGroundHeight + eyeHeight;
          }
        }
      }
    }

    const wasGrounded = this.playerState.isGrounded;
    const horizontalMotionSq =
      (newPosition.x - this.playerState.position.x) ** 2 +
      (newPosition.z - this.playerState.position.z) ** 2;
    const walking = wasGrounded && horizontalMotionSq > 1e-4;

    if (walking && groundHeight - currentGroundHeight > PLAYER_MAX_GROUND_RISE_PER_STEP) {
      newPosition.x = this.playerState.position.x;
      newPosition.z = this.playerState.position.z;
      this.playerState.velocity.x = 0;
      this.playerState.velocity.z = 0;
      blockedByTerrain = true;
      blockReason = 'ground_rise_clamp';
      groundHeight = currentGroundHeight;
    }

    if (this.sandbagSystem) {
      const sandbagTop = this.sandbagSystem.getStandingHeight(newPosition.x, newPosition.z);
      if (sandbagTop !== null) {
        const sandbagGround = sandbagTop + eyeHeight;
        if (sandbagGround > groundHeight) {
          groundHeight = sandbagGround;
        }
      }
    }

    const impactVelocityY = this.playerState.velocity.y;
    if (noClipActive) {
      this.playerState.isGrounded = false;
    } else if (newPosition.y <= groundHeight) {
      // Scope the rise cap to walking so spawn, respawn, and vertical landing
      // snaps still resolve to the authoritative ground height.
      if (walking) {
        const maxGroundY = this.playerState.position.y + PLAYER_MAX_GROUND_RISE_PER_STEP;
        newPosition.y = Math.min(groundHeight, maxGroundY);
      } else {
        newPosition.y = groundHeight;
      }

      if (!wasGrounded && impactVelocityY < LANDING_SOUND_THRESHOLD && this.footstepAudioSystem) {
        this.footstepAudioSystem.playLandingSound(newPosition, Math.abs(impactVelocityY));
      }

      this.playerState.velocity.y = 0;
      this.playerState.isGrounded = true;
      this.playerState.isJumping = false;
    } else {
      this.playerState.isGrounded = false;
    }

    // Bounce off world boundary (read directly from terrain system).
    // Skipped in noClip so the dev tool can fly past the playable bounds.
    if (this.terrainSystem) {
      const ws = this.terrainSystem.getPlayableWorldSize();
      if (ws > 0) this.worldHalfExtent = ws * 0.5;
    }
    if (!noClipActive && this.worldHalfExtent > 0) {
      enforceWorldBoundary(
        newPosition,
        this.playerState.velocity,
        this.worldHalfExtent,
        BOUNDARY_BOUNCE_FACTOR,
      );
    }

    this.playerState.position.copy(newPosition);
    const actualHorizontalSpeed = Math.hypot(this.playerState.velocity.x, this.playerState.velocity.z);
    this.lastDebugSnapshot = {
      blockReason,
      requestedSpeed,
      actualHorizontalSpeed,
      blockedByTerrain,
      grounded: this.playerState.isGrounded,
      walking,
      positionX: this.playerState.position.x,
      positionY: this.playerState.position.y,
      positionZ: this.playerState.position.z,
      candidateX: newPosition.x,
      candidateZ: newPosition.z,
      currentTerrainHeight: Number.isFinite(currentTerrainHeight) ? currentTerrainHeight : null,
      targetTerrainHeight: Number.isFinite(targetTerrainHeight) ? targetTerrainHeight : null,
      currentGroundHeight: Number.isFinite(currentGroundHeight) ? currentGroundHeight : null,
      targetGroundHeight: Number.isFinite(groundHeight) ? groundHeight : null,
      terrainRise: Number.isFinite(terrainRise) ? terrainRise : null,
      effectiveRise: Number.isFinite(effectiveRise) ? effectiveRise : null,
      obstacleStepRise: Number.isFinite(obstacleStepRise) ? obstacleStepRise : null,
      targetSlopeValue: Number.isFinite(targetSlopeValue) ? targetSlopeValue : null,
      supportSlopeValue,
      grade,
    };
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
