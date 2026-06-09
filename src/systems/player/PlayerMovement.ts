// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
} from '../terrain/GameplaySurfaceSampling';
import { isWorldBuilderFlagActive } from '../../dev/worldBuilder/WorldBuilderConsole';
import {
  enforceWorldBoundary,
  resolveMovementIntent,
} from './movement/MovementKinematics';
import { applySteepTerrainFlow } from './movement/SteepTerrainFlow';
import {
  sampleSupportNormal as sampleSupportNormalFootprint,
  PLAYER_SUPPORT_LOOKAHEAD,
} from './movement/SupportNormalSampler';

const _moveVector = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _worldMoveVector = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);
const _terrainNormal = new THREE.Vector3(0, 1, 0);
const _previousTerrainNormal = new THREE.Vector3(0, 1, 0);

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
// Support-sampling + steep-flow tuning now lives with the extracted helpers
// (movement/SupportNormalSampler, movement/SteepTerrainFlow).
// PLAYER_SUPPORT_LOOKAHEAD is re-imported above because the forward-grade
// sample below also keys off it.
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
    return applySteepTerrainFlow({
      playerState: this.playerState,
      newPosition,
      targetSupportNormal,
      requestedMoveX,
      requestedMoveZ,
      deltaTime,
    });
  }

  private sampleSupportNormal(
    x: number,
    z: number,
    moveX: number,
    moveZ: number,
    target: THREE.Vector3,
    smooth: boolean,
  ): THREE.Vector3 {
    return sampleSupportNormalFootprint({
      sampleHeight: this.sampleTerrainHeight.bind(this),
      x,
      z,
      moveX,
      moveZ,
      target,
      sampledScratch: this.sampledSupportNormal,
      grounded: this.playerState.isGrounded,
      smooth,
    });
  }

  private sampleTerrainHeight(x: number, z: number): number {
    if (this.terrainSystem) {
      return this.terrainSystem.getHeightAt(x, z);
    }
    return getHeightQueryCache().getHeightAt(x, z);
  }
}
