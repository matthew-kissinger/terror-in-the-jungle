import * as THREE from 'three';
import { BallisticTrajectory } from './MortarBallistics';

export class MortarVisuals {
  private scene: THREE.Scene;
  private trajectoryLine?: THREE.Line;
  private landingIndicator?: THREE.Mesh;
  private damageRing?: THREE.Mesh;

  private readonly DAMAGE_RADIUS = 20; // Match explosion radius

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createTrajectoryLine();
    this.createLandingIndicator();
  }

  private createTrajectoryLine(): void {
    const geometry = new THREE.BufferGeometry();
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
      depthTest: false
    });

    this.landingIndicator = new THREE.Mesh(centerGeometry, centerMaterial);
    this.landingIndicator.rotation.x = -Math.PI / 2; // Lay flat
    this.landingIndicator.visible = false;
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
      depthTest: false
    });

    this.damageRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.damageRing.rotation.x = -Math.PI / 2; // Lay flat
    this.damageRing.visible = false;
    this.scene.add(this.damageRing);
  }

  /**
   * Update trajectory visualization
   */
  updateTrajectory(trajectory: BallisticTrajectory): void {
    if (!this.trajectoryLine) return;

    // Update line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(trajectory.points);
    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.geometry = geometry;
    this.trajectoryLine.computeLineDistances(); // Required for dashed lines

    // Update landing indicator position
    if (this.landingIndicator && this.damageRing) {
      const landingPos = trajectory.landingPoint.clone();
      landingPos.y += 0.1; // Slightly above ground to prevent z-fighting

      this.landingIndicator.position.copy(landingPos);
      this.damageRing.position.copy(landingPos);
    }
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
