import * as THREE from 'three';
import { objectPool } from '../../utils/ObjectPoolManager';

type GroundHeightFn = (x: number, z: number) => number;

export class GrenadeArcRenderer {
  private scene: THREE.Scene;
  private maxArcPoints: number;
  private damageRadius: number;

  private arcPositions: Float32Array;
  private arcVisualization?: THREE.Line;
  private landingIndicator?: THREE.Mesh;

  constructor(scene: THREE.Scene, maxArcPoints: number, damageRadius: number) {
    this.scene = scene;
    this.maxArcPoints = maxArcPoints;
    this.damageRadius = damageRadius;

    this.arcPositions = new Float32Array(this.maxArcPoints * 3);

    this.createArcVisualization();
  }

  updateArc(
    camera: THREE.Camera,
    throwPower: number,
    gravity: number,
    minThrowForce: number,
    maxThrowForce: number,
    getGroundHeight: GroundHeightFn
  ): number {
    if (!this.arcVisualization) return 0;

    const startPos = objectPool.getVector3().copy(camera.position);
    const direction = objectPool.getVector3();
    camera.getWorldDirection(direction);

    // Variable throw force based on power buildup
    const throwForce = minThrowForce + (maxThrowForce - minThrowForce) * throwPower;

    // Angle the throw upward for a proper arc (like a real grenade throw)
    // Use a flatter angle for more forward carry, less affected by looking angle
    const baseThrowAngle = 0.25 + (0.15 * throwPower); // 0.25 to 0.4 radians (14 to 23 degrees)

    // Maintain more forward momentum regardless of vertical look angle
    const forwardDir = objectPool.getVector3().copy(direction);
    forwardDir.y = 0; // Remove vertical component
    forwardDir.normalize();

    // Combine forward direction with upward angle
    const finalDirection = objectPool.getVector3();
    finalDirection.x = forwardDir.x * Math.cos(baseThrowAngle);
    finalDirection.z = forwardDir.z * Math.cos(baseThrowAngle);
    finalDirection.y = Math.sin(baseThrowAngle);

    const throwVelocity = objectPool.getVector3().copy(finalDirection).multiplyScalar(throwForce);

    // Add moderate upward boost based on look angle (but not too much)
    const lookUpBoost = Math.max(0, direction.y * 3); // Only boost if looking up
    throwVelocity.y += lookUpBoost * throwPower;

    const steps = 30;
    const timeStep = 0.1;

    const pos = objectPool.getVector3().copy(startPos);
    const vel = objectPool.getVector3().copy(throwVelocity);
    const landingPos = objectPool.getVector3().copy(pos);
    const velDelta = objectPool.getVector3();

    let pointCount = 0;
    for (let i = 0; i < steps; i++) {
      // Write to Float32Array
      if (pointCount < this.maxArcPoints) {
        this.arcPositions[pointCount * 3] = pos.x;
        this.arcPositions[pointCount * 3 + 1] = pos.y;
        this.arcPositions[pointCount * 3 + 2] = pos.z;
        pointCount++;
      }

      vel.y += gravity * timeStep;

      velDelta.copy(vel).multiplyScalar(timeStep);
      pos.add(velDelta);

      const groundHeight = getGroundHeight(pos.x, pos.z);
      if (pos.y <= groundHeight) {
        pos.y = groundHeight;
        landingPos.copy(pos);

        // Add final point
        if (pointCount < this.maxArcPoints) {
          this.arcPositions[pointCount * 3] = pos.x;
          this.arcPositions[pointCount * 3 + 1] = pos.y;
          this.arcPositions[pointCount * 3 + 2] = pos.z;
          pointCount++;
        }
        break;
      }
    }

    this.arcVisualization.geometry.attributes.position.needsUpdate = true;
    this.arcVisualization.geometry.setDrawRange(0, pointCount);
    this.arcVisualization.computeLineDistances();

    // Update landing indicator position
    if (this.landingIndicator) {
      this.landingIndicator.position.copy(landingPos);
      this.landingIndicator.position.y += 0.1; // Slightly above ground to prevent z-fighting
    }

    // Calculate distance from start to landing position
    const distance = startPos.distanceTo(landingPos);

    // Release all borrowed vectors
    objectPool.releaseVector3(startPos);
    objectPool.releaseVector3(direction);
    objectPool.releaseVector3(forwardDir);
    objectPool.releaseVector3(finalDirection);
    objectPool.releaseVector3(throwVelocity);
    objectPool.releaseVector3(pos);
    objectPool.releaseVector3(vel);
    objectPool.releaseVector3(landingPos);
    objectPool.releaseVector3(velDelta);

    return distance;
  }

  showArc(show: boolean): void {
    if (this.arcVisualization) {
      this.arcVisualization.visible = show;
    }

    if (this.landingIndicator) {
      this.landingIndicator.visible = show;
    }
  }

  getLandingIndicator(): THREE.Mesh | undefined {
    return this.landingIndicator;
  }

  dispose(): void {
    if (this.arcVisualization) {
      this.scene.remove(this.arcVisualization);
      this.arcVisualization.geometry.dispose();
      if (this.arcVisualization.material instanceof THREE.Material) {
        this.arcVisualization.material.dispose();
      }
    }

    if (this.landingIndicator) {
      this.scene.remove(this.landingIndicator);
      this.landingIndicator.geometry.dispose();
      if (this.landingIndicator.material instanceof THREE.Material) {
        this.landingIndicator.material.dispose();
      }
    }
  }

  private createArcVisualization(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3));

    const material = new THREE.LineDashedMaterial({
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      dashSize: 0.5,
      gapSize: 0.3
    });

    this.arcVisualization = new THREE.Line(geometry, material);
    this.arcVisualization.visible = false;
    this.arcVisualization.frustumCulled = false; // Ensure it's always rendered if visible
    this.scene.add(this.arcVisualization);

    // Create landing indicator - a ring showing impact point and radius
    // Make it larger and more visible with pulsing animation
    const ringGeometry = new THREE.RingGeometry(this.damageRadius - 1.0, this.damageRadius + 1.0, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Bright green for better visibility
      transparent: true,
      opacity: 0.7, // More opaque
      side: THREE.DoubleSide,
      depthTest: false
    });

    this.landingIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
    this.landingIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
    this.landingIndicator.visible = false;
    this.scene.add(this.landingIndicator);
  }
}
