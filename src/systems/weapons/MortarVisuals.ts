// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { BallisticTrajectory } from './MortarBallistics';

const INITIAL_TRAJECTORY_POINT_CAPACITY = 128;
const _landingScratch = new THREE.Vector3();

export class MortarVisuals {
  private scene: THREE.Scene;
  private trajectoryLine?: THREE.Line;
  private landingIndicator?: THREE.Mesh;
  private damageRing?: THREE.Mesh;
  private trajectoryPositions = new Float32Array(INITIAL_TRAJECTORY_POINT_CAPACITY * 3);
  private trajectoryLineDistances = new Float32Array(INITIAL_TRAJECTORY_POINT_CAPACITY);
  private trajectoryCapacity = INITIAL_TRAJECTORY_POINT_CAPACITY;

  private readonly DAMAGE_RADIUS = 20; // Match explosion radius

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createTrajectoryLine();
    this.createLandingIndicator();
  }

  private createTrajectoryLine(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.trajectoryPositions, 3));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(this.trajectoryLineDistances, 1));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineDashedMaterial({
      color: 0xff8800,
      linewidth: 2,
      dashSize: 1,
      gapSize: 0.5,
      transparent: true,
      opacity: 0.8,
      depthTest: false // Always visible
    });

    this.trajectoryLine = new THREE.Line(geometry, material);
    this.trajectoryLine.visible = false;
    this.trajectoryLine.matrixAutoUpdate = true;
    this.scene.add(this.trajectoryLine);
  }

  private createLandingIndicator(): void {
    // Central impact point marker
    const centerGeometry = new THREE.CircleGeometry(0.8, 16);
    const centerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthTest: false
    });

    this.landingIndicator = new THREE.Mesh(centerGeometry, centerMaterial);
    this.landingIndicator.rotation.x = -Math.PI / 2; // Lay flat
    this.landingIndicator.visible = false;
    this.landingIndicator.matrixAutoUpdate = true;
    this.scene.add(this.landingIndicator);

    // Damage radius ring
    const ringGeometry = new THREE.RingGeometry(
      this.DAMAGE_RADIUS - 0.5,
      this.DAMAGE_RADIUS + 0.5,
      32
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthTest: false
    });

    this.damageRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.damageRing.rotation.x = -Math.PI / 2; // Lay flat
    this.damageRing.visible = false;
    this.damageRing.matrixAutoUpdate = true;
    this.scene.add(this.damageRing);
  }

  /**
   * Update trajectory visualization
   */
  updateTrajectory(trajectory: BallisticTrajectory): void {
    if (!this.trajectoryLine) return;
    const pointCount = trajectory.pointCount ?? trajectory.points.length;
    if (pointCount <= 0) return;
    this.ensureTrajectoryCapacity(pointCount);

    const geometry = this.trajectoryLine.geometry as THREE.BufferGeometry;
    const positions = this.trajectoryPositions;
    const lineDistances = this.trajectoryLineDistances;
    let previousX = 0;
    let previousY = 0;
    let previousZ = 0;
    let cumulativeDistance = 0;
    for (let i = 0; i < pointCount; i++) {
      const point = trajectory.points[i];
      const i3 = i * 3;
      positions[i3] = point.x;
      positions[i3 + 1] = point.y;
      positions[i3 + 2] = point.z;
      if (i > 0) {
        const dx = point.x - previousX;
        const dy = point.y - previousY;
        const dz = point.z - previousZ;
        cumulativeDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      lineDistances[i] = cumulativeDistance;
      previousX = point.x;
      previousY = point.y;
      previousZ = point.z;
    }
    geometry.setDrawRange(0, pointCount);
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineDistanceAttribute = geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
    lineDistanceAttribute.needsUpdate = true;

    // Update landing indicator position
    if (this.landingIndicator && this.damageRing) {
      _landingScratch.copy(trajectory.landingPoint);
      _landingScratch.y += 0.1; // Slightly above ground to prevent z-fighting

      this.landingIndicator.position.copy(_landingScratch);
      this.damageRing.position.copy(_landingScratch);
    }
  }

  private ensureTrajectoryCapacity(pointCount: number): void {
    if (pointCount <= this.trajectoryCapacity || !this.trajectoryLine) return;

    let nextCapacity = this.trajectoryCapacity;
    while (nextCapacity < pointCount) {
      nextCapacity *= 2;
    }
    this.trajectoryPositions = new Float32Array(nextCapacity * 3);
    this.trajectoryLineDistances = new Float32Array(nextCapacity);
    this.trajectoryCapacity = nextCapacity;

    const geometry = this.trajectoryLine.geometry as THREE.BufferGeometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.trajectoryPositions, 3));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(this.trajectoryLineDistances, 1));
  }

  /**
   * Show trajectory preview
   */
  showTrajectory(visible: boolean): void {
    if (this.trajectoryLine) {
      this.trajectoryLine.visible = visible;
    }
    if (this.landingIndicator) {
      this.landingIndicator.visible = visible;
    }
    if (this.damageRing) {
      this.damageRing.visible = visible;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      if (this.trajectoryLine.material instanceof THREE.Material) {
        this.trajectoryLine.material.dispose();
      }
    }

    if (this.landingIndicator) {
      this.scene.remove(this.landingIndicator);
      this.landingIndicator.geometry.dispose();
      if (this.landingIndicator.material instanceof THREE.Material) {
        this.landingIndicator.material.dispose();
      }
    }

    if (this.damageRing) {
      this.scene.remove(this.damageRing);
      this.damageRing.geometry.dispose();
      if (this.damageRing.material instanceof THREE.Material) {
        this.damageRing.material.dispose();
      }
    }
  }
}
