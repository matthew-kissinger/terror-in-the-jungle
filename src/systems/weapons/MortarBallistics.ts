// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

// Module-level scratch vectors to avoid per-call allocations
const _velStep = new THREE.Vector3();
const _roundVelStep = new THREE.Vector3();
const _trajectoryPos = new THREE.Vector3();
const _trajectoryVel = new THREE.Vector3();

export interface MortarRound {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Group;
  isActive: boolean;
  fuseTime: number;
}

export interface BallisticTrajectory {
  points: THREE.Vector3[];
  landingPoint: THREE.Vector3;
  timeToImpact: number;
  pointCount?: number;
}

export class MortarBallistics {
  private readonly GRAVITY = -9.8; // m/s^2
  private readonly MIN_VELOCITY = 50; // m/s
  private readonly MAX_VELOCITY = 80; // m/s
  private readonly MIN_PITCH = 45; // degrees
  private readonly MAX_PITCH = 85; // degrees

  /**
   * Compute initial velocity vector from pitch and yaw angles
   */
  computeVelocityVector(pitch: number, yaw: number, power: number, target = new THREE.Vector3()): THREE.Vector3 {
    // Clamp pitch to valid range
    const clampedPitch = THREE.MathUtils.clamp(pitch, this.MIN_PITCH, this.MAX_PITCH);
    const pitchRad = THREE.MathUtils.degToRad(clampedPitch);
    const yawRad = THREE.MathUtils.degToRad(yaw);

    // Compute velocity magnitude based on power (0-1)
    const velocity = this.MIN_VELOCITY + (this.MAX_VELOCITY - this.MIN_VELOCITY) * power;

    // Convert spherical coordinates to Cartesian
    const vx = velocity * Math.cos(pitchRad) * Math.sin(yawRad);
    const vy = velocity * Math.sin(pitchRad);
    const vz = velocity * Math.cos(pitchRad) * Math.cos(yawRad);

    return target.set(vx, vy, vz);
  }

  /**
   * Compute ballistic trajectory from start position with given velocity
   */
  computeTrajectory(
    startPos: THREE.Vector3,
    velocity: THREE.Vector3,
    getGroundHeight: (x: number, z: number) => number,
    maxSteps: number = 100,
    timeStep: number = 0.1
  ): BallisticTrajectory {
    const trajectory: BallisticTrajectory = {
      points: [],
      landingPoint: new THREE.Vector3(),
      timeToImpact: 0,
    };
    this.computeTrajectoryInto(trajectory, startPos, velocity, getGroundHeight, maxSteps, timeStep);
    trajectory.points.length = trajectory.pointCount ?? trajectory.points.length;
    return trajectory;
  }

  computeTrajectoryInto(
    target: BallisticTrajectory,
    startPos: THREE.Vector3,
    velocity: THREE.Vector3,
    getGroundHeight: (x: number, z: number) => number,
    maxSteps: number = 100,
    timeStep: number = 0.1
  ): BallisticTrajectory {
    _trajectoryPos.copy(startPos);
    _trajectoryVel.copy(velocity);
    target.landingPoint.copy(_trajectoryPos);
    target.timeToImpact = 0;
    target.pointCount = 0;

    for (let i = 0; i < maxSteps; i++) {
      let point = target.points[i];
      if (!point) {
        point = new THREE.Vector3();
        target.points[i] = point;
      }
      point.copy(_trajectoryPos);
      target.pointCount++;

      // Update velocity (gravity only)
      _trajectoryVel.y += this.GRAVITY * timeStep;

      // Update position using scratch vector instead of clone
      _velStep.copy(_trajectoryVel).multiplyScalar(timeStep);
      _trajectoryPos.add(_velStep);
      target.timeToImpact += timeStep;

      // Check ground collision
      const groundHeight = getGroundHeight(_trajectoryPos.x, _trajectoryPos.z);
      if (_trajectoryPos.y <= groundHeight) {
        _trajectoryPos.y = groundHeight;
        target.landingPoint.copy(_trajectoryPos);
        break;
      }
    }

    return target;
  }

  /**
   * Update mortar round physics (parabolic trajectory)
   */
  updateRoundPhysics(
    round: MortarRound,
    deltaTime: number,
    getGroundHeight: (x: number, z: number) => number
  ): boolean {
    // Apply gravity
    round.velocity.y += this.GRAVITY * deltaTime;

    // Update position using scratch vector instead of clone
    _roundVelStep.copy(round.velocity).multiplyScalar(deltaTime);
    round.position.add(_roundVelStep);

    // Update mesh
    round.mesh.position.copy(round.position);

    // Check ground collision
    const groundHeight = getGroundHeight(round.position.x, round.position.z);
    if (round.position.y <= groundHeight) {
      round.position.y = groundHeight;
      round.mesh.position.copy(round.position);
      return true; // Impact detected
    }

    return false; // Still in flight
  }

  /**
   * Get pitch and yaw constraints
   */
  getPitchRange(): { min: number; max: number } {
    return { min: this.MIN_PITCH, max: this.MAX_PITCH };
  }

  getVelocityRange(): { min: number; max: number } {
    return { min: this.MIN_VELOCITY, max: this.MAX_VELOCITY };
  }
}
