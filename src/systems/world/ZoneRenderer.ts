// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction, isOpfor } from '../combat/types';

const ZONE_VISUALS_PERF_CATEGORY = 'zone_visuals';
const PROGRESS_RING_ANGLE_EPSILON = 1e-4;
const PROGRESS_RING_SEGMENTS = 32;
const PROGRESS_RING_RADIAL_SEGMENTS = 1;
const PROGRESS_RING_INNER_OFFSET_M = 0.5;
const PROGRESS_RING_OUTER_OFFSET_M = 1;
const FULL_CIRCLE_RADIANS = Math.PI * 2;
const ZONE_TERRAIN_HEIGHT_EPSILON_M = 1e-3;
const FLAG_HEIGHT_EPSILON_M = 1e-3;

function freezeZoneVisualTransform(object: THREE.Object3D): void {
  syncZoneVisualTransform(object);
  object.matrixAutoUpdate = false;
  object.matrixWorldAutoUpdate = false;
}

function syncZoneVisualTransform(object: THREE.Object3D): void {
  object.updateMatrix();
  if (object.parent) {
    object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
  } else {
    object.matrixWorld.copy(object.matrix);
  }
  object.matrixWorldNeedsUpdate = false;
}

function getProgressRingInnerRadius(zoneRadius: number): number {
  return zoneRadius + PROGRESS_RING_INNER_OFFSET_M;
}

function getProgressRingOuterRadius(zoneRadius: number): number {
  return zoneRadius + PROGRESS_RING_OUTER_OFFSET_M;
}

function updateProgressRingGeometry(
  geometry: THREE.BufferGeometry,
  zoneRadius: number,
  thetaLength: number
): void {
  const innerRadius = getProgressRingInnerRadius(zoneRadius);
  const outerRadius = getProgressRingOuterRadius(zoneRadius);
  const clampedThetaLength = THREE.MathUtils.clamp(thetaLength, 0, FULL_CIRCLE_RADIANS);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  let vertexIndex = 0;

  for (let radialIndex = 0; radialIndex <= PROGRESS_RING_RADIAL_SEGMENTS; radialIndex += 1) {
    const radius = innerRadius + ((outerRadius - innerRadius) * radialIndex) / PROGRESS_RING_RADIAL_SEGMENTS;

    for (let segmentIndex = 0; segmentIndex <= PROGRESS_RING_SEGMENTS; segmentIndex += 1) {
      const angle = (segmentIndex / PROGRESS_RING_SEGMENTS) * clampedThetaLength;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      position.setXYZ(vertexIndex, x, y, 0);
      uv?.setXY(vertexIndex, (x / outerRadius + 1) * 0.5, (y / outerRadius + 1) * 0.5);
      vertexIndex += 1;
    }
  }

  position.needsUpdate = true;
  if (uv) {
    uv.needsUpdate = true;
  }
}

function createProgressRingGeometry(zoneRadius: number): THREE.RingGeometry {
  const innerRadius = getProgressRingInnerRadius(zoneRadius);
  const outerRadius = getProgressRingOuterRadius(zoneRadius);
  const geometry = new THREE.RingGeometry(
    innerRadius,
    outerRadius,
    PROGRESS_RING_SEGMENTS,
    PROGRESS_RING_RADIAL_SEGMENTS,
    0,
    FULL_CIRCLE_RADIANS
  );

  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (geometry.getAttribute('uv') as THREE.BufferAttribute | undefined)?.setUsage(THREE.DynamicDrawUsage);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), outerRadius);
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-outerRadius, -outerRadius, 0),
    new THREE.Vector3(outerRadius, outerRadius, 0)
  );
  updateProgressRingGeometry(geometry, zoneRadius, 0);
  return geometry;
}

export class ZoneRenderer {
  private scene: THREE.Scene;

  // Visual materials
  private neutralMaterial: THREE.MeshBasicMaterial;
  private usMaterial: THREE.MeshBasicMaterial;
  private opforMaterial: THREE.MeshBasicMaterial;
  private contestedMaterial: THREE.MeshBasicMaterial;
  private flagPoleMaterial: THREE.MeshBasicMaterial;
  private usFlagMaterial: THREE.MeshBasicMaterial;
  private opforFlagMaterial: THREE.MeshBasicMaterial;
  private progressMaterial: THREE.MeshBasicMaterial;
  private flagGeometry: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create materials for zone visualization
    this.neutralMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.3
    });

    this.usMaterial = new THREE.MeshBasicMaterial({
      color: 0x0066cc,  // Blue for US
      transparent: true,
      opacity: 0.3
    });

    this.opforMaterial = new THREE.MeshBasicMaterial({
      color: 0xcc0000,  // Red for OPFOR
      transparent: true,
      opacity: 0.3
    });

    this.contestedMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,  // Orange for contested
      transparent: true,
      opacity: 0.3
    });

    this.flagPoleMaterial = new THREE.MeshBasicMaterial({ color: 0x444444 });
    this.usFlagMaterial = new THREE.MeshBasicMaterial({
      color: 0x0066cc,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      forceSinglePass: true
    });
    this.opforFlagMaterial = new THREE.MeshBasicMaterial({
      color: 0xcc0000,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      forceSinglePass: true
    });
    this.progressMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      forceSinglePass: true
    });
    this.flagGeometry = new THREE.PlaneGeometry(5, 3);
  }

  createZoneVisuals(zone: CaptureZone): void {
    const terrainHeight = zone.position.y;

    // Create capture area ring (flat on ground)
    const ringGeometry = new THREE.RingGeometry(zone.radius - 1, zone.radius, 32);
    const ringMaterial = this.getMaterialForState(zone.state);
    zone.zoneMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    zone.zoneMesh.rotation.x = -Math.PI / 2;
    zone.zoneMesh.position.copy(zone.position);
    zone.zoneMesh.position.y = terrainHeight + 0.1;
    this.markZoneVisual(zone.zoneMesh);
    this.scene.add(zone.zoneMesh);
    freezeZoneVisualTransform(zone.zoneMesh);

    // Create flag pole
    const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, zone.height, 8);
    zone.flagPole = new THREE.Mesh(poleGeometry, this.flagPoleMaterial);
    zone.flagPole.position.copy(zone.position);
    zone.flagPole.position.y = terrainHeight + zone.height / 2;
    this.markZoneVisual(zone.flagPole);
    this.scene.add(zone.flagPole);
    freezeZoneVisualTransform(zone.flagPole);

    // Create both flags (US and OPFOR)
    zone.usFlagMesh = new THREE.Mesh(this.flagGeometry, this.usFlagMaterial);
    zone.usFlagMesh.position.copy(zone.position);
    zone.usFlagMesh.position.x += 2.5;
    zone.usFlagMesh.position.y = terrainHeight;
    zone.usFlagMesh.visible = zone.owner === Faction.US;
    this.markZoneVisual(zone.usFlagMesh);
    this.scene.add(zone.usFlagMesh);

    // OPFOR Flag (red)
    zone.opforFlagMesh = new THREE.Mesh(this.flagGeometry, this.opforFlagMaterial);
    zone.opforFlagMesh.position.copy(zone.position);
    zone.opforFlagMesh.position.x += 2.5;
    zone.opforFlagMesh.position.y = terrainHeight;
    zone.opforFlagMesh.visible = zone.owner !== null && isOpfor(zone.owner);
    this.markZoneVisual(zone.opforFlagMesh);
    this.scene.add(zone.opforFlagMesh);

    // Initialize flag height based on ownership
    const terrainY = zone.position.y;
    if (zone.owner === Faction.US) {
      zone.currentFlagHeight = terrainY + zone.height - 2;
      zone.usFlagMesh.position.y = zone.currentFlagHeight;
    } else if (zone.owner !== null && isOpfor(zone.owner)) {
      zone.currentFlagHeight = terrainY + zone.height - 2;
      zone.opforFlagMesh.position.y = zone.currentFlagHeight;
    } else {
      zone.currentFlagHeight = terrainY + 2;
      zone.usFlagMesh.position.y = terrainY + 2;
      zone.opforFlagMesh.position.y = terrainY + 2;
    }
    freezeZoneVisualTransform(zone.usFlagMesh);
    freezeZoneVisualTransform(zone.opforFlagMesh);

    // Create progress ring
    const progressGeometry = createProgressRingGeometry(zone.radius);
    zone.progressRing = new THREE.Mesh(progressGeometry, this.progressMaterial);
    zone.progressRing.rotation.x = -Math.PI / 2;
    zone.progressRing.position.copy(zone.position);
    zone.progressRing.position.y = terrainHeight + 0.2;
    zone.progressRing.visible = false;
    zone.progressRing.userData.progressAngle = 0;
    this.markZoneVisual(zone.progressRing);
    this.scene.add(zone.progressRing);
    freezeZoneVisualTransform(zone.progressRing);

    // Add zone name text
    this.createZoneLabel(zone);
  }

  private createZoneLabel(zone: CaptureZone): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;

    // Draw text
    context.fillStyle = 'white';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.fillText(zone.name.toUpperCase(), 128, 48);

    // Create texture and sprite
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(zone.position);
    sprite.position.y = zone.position.y + zone.height + 3;
    sprite.scale.set(10, 2.5, 1);
    this.markZoneVisual(sprite);
    this.scene.add(sprite);
    freezeZoneVisualTransform(sprite);

    zone.labelSprite = sprite;
  }

  updateZoneVisuals(zone: CaptureZone, occupants: { us: number; opfor: number }): void {
    if (!zone.zoneMesh) return;

    // Update zone ring color
    const nextZoneMaterial = this.getMaterialForState(zone.state);
    if (zone.zoneMesh.material !== nextZoneMaterial) {
      zone.zoneMesh.material = nextZoneMaterial;
    }

    // Calculate target flag height
    const terrainHeight = zone.position.y;
    let targetHeight = terrainHeight + 2;
    let showUSFlag = false;
    let showOPFORFlag = false;

    if (zone.owner === Faction.US) {
      targetHeight = terrainHeight + zone.height - 2;
      showUSFlag = true;
    } else if (zone.owner !== null && isOpfor(zone.owner)) {
      targetHeight = terrainHeight + zone.height - 2;
      showOPFORFlag = true;
    } else if (zone.state === ZoneState.CONTESTED) {
      targetHeight = terrainHeight + 2 + ((zone.height - 4) * (zone.captureProgress / 100));

      if (occupants.us > occupants.opfor) {
        showUSFlag = true;
      } else if (occupants.opfor > occupants.us) {
        showOPFORFlag = true;
      }
    }

    // Smoothly animate flag height
    const lerpSpeed = 0.05;
    zone.currentFlagHeight = THREE.MathUtils.lerp(zone.currentFlagHeight, targetHeight, lerpSpeed);

    this.updateFlagMesh(zone.usFlagMesh, showUSFlag, zone.currentFlagHeight);
    this.updateFlagMesh(zone.opforFlagMesh, showOPFORFlag, zone.currentFlagHeight);

    // Update progress ring
    if (zone.progressRing) {
      if (zone.state === ZoneState.CONTESTED) {
        zone.progressRing.visible = true;
        const angle = (zone.captureProgress / 100) * FULL_CIRCLE_RADIANS;
        const previousAngle = Number(zone.progressRing.userData.progressAngle ?? Number.NaN);
        if (!Number.isFinite(previousAngle) || Math.abs(previousAngle - angle) > PROGRESS_RING_ANGLE_EPSILON) {
          updateProgressRingGeometry(zone.progressRing.geometry, zone.radius, angle);
          zone.progressRing.userData.progressAngle = angle;
        }
      } else {
        zone.progressRing.visible = false;
      }
    }
  }

  updateZonePositions(zone: CaptureZone, terrainHeight: number): void {
    if (Math.abs(zone.position.y - terrainHeight) <= ZONE_TERRAIN_HEIGHT_EPSILON_M) {
      return;
    }

    zone.position.y = terrainHeight;

    if (zone.zoneMesh) {
      zone.zoneMesh.position.y = terrainHeight + 0.1;
      syncZoneVisualTransform(zone.zoneMesh);
    }

    if (zone.flagPole) {
      zone.flagPole.position.y = terrainHeight + zone.height / 2;
      syncZoneVisualTransform(zone.flagPole);
    }

    if (zone.progressRing) {
      zone.progressRing.position.y = terrainHeight + 0.2;
      syncZoneVisualTransform(zone.progressRing);
    }

    if (zone.labelSprite) {
      zone.labelSprite.position.x = zone.position.x;
      zone.labelSprite.position.y = terrainHeight + zone.height + 3;
      zone.labelSprite.position.z = zone.position.z;
      syncZoneVisualTransform(zone.labelSprite);
    }

    // Update flag heights relative to new terrain
    const flagBaseY = terrainHeight + 2;
    const flagTopY = terrainHeight + zone.height - 2;

    if (zone.owner !== null) {
      zone.currentFlagHeight = flagTopY;
    } else if (zone.state === ZoneState.CONTESTED) {
      const progress = zone.captureProgress / 100;
      zone.currentFlagHeight = flagBaseY + ((flagTopY - flagBaseY) * progress);
    } else {
      zone.currentFlagHeight = flagBaseY;
    }
  }

  animateFlags(zones: Map<string, CaptureZone>): void {
    const time = Date.now() * 0.001;
    zones.forEach(zone => {
      const waveAmount = Math.sin(time + zone.position.x) * 0.2;

      if (zone.usFlagMesh && zone.usFlagMesh.visible) {
        zone.usFlagMesh.rotation.y = waveAmount;
        syncZoneVisualTransform(zone.usFlagMesh);
      }

      if (zone.opforFlagMesh && zone.opforFlagMesh.visible) {
        zone.opforFlagMesh.rotation.y = waveAmount;
        syncZoneVisualTransform(zone.opforFlagMesh);
      }
    });
  }

  getMaterialForState(state: ZoneState): THREE.MeshBasicMaterial {
    switch (state) {
      case ZoneState.BLUFOR_CONTROLLED:
        return this.usMaterial;
      case ZoneState.OPFOR_CONTROLLED:
        return this.opforMaterial;
      case ZoneState.CONTESTED:
        return this.contestedMaterial;
      default:
        return this.neutralMaterial;
    }
  }

  private updateFlagMesh(
    flagMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> | undefined,
    shouldBeVisible: boolean,
    targetHeight: number
  ): void {
    if (!flagMesh) return;

    const visibilityChanged = flagMesh.visible !== shouldBeVisible;
    if (visibilityChanged) {
      flagMesh.visible = shouldBeVisible;
    }

    if (!shouldBeVisible) return;

    if (visibilityChanged || Math.abs(flagMesh.position.y - targetHeight) > FLAG_HEIGHT_EPSILON_M) {
      flagMesh.position.y = targetHeight;
      syncZoneVisualTransform(flagMesh);
    }
  }

  private markZoneVisual(object: THREE.Object3D): void {
    object.userData.perfCategory = ZONE_VISUALS_PERF_CATEGORY;
  }

  disposeZoneVisuals(zone: CaptureZone): void {
    if (zone.zoneMesh) {
      zone.zoneMesh.geometry.dispose();
      this.scene.remove(zone.zoneMesh);
    }
    if (zone.flagPole) {
      zone.flagPole.geometry.dispose();
      this.scene.remove(zone.flagPole);
    }
    if (zone.usFlagMesh) {
      this.scene.remove(zone.usFlagMesh);
    }
    if (zone.opforFlagMesh) {
      this.scene.remove(zone.opforFlagMesh);
    }
    if (zone.progressRing) {
      zone.progressRing.geometry.dispose();
      this.scene.remove(zone.progressRing);
    }
    if (zone.labelSprite) {
      this.scene.remove(zone.labelSprite);
    }
  }

  dispose(): void {
    this.neutralMaterial.dispose();
    this.usMaterial.dispose();
    this.opforMaterial.dispose();
    this.contestedMaterial.dispose();
    this.flagPoleMaterial.dispose();
    this.usFlagMaterial.dispose();
    this.opforFlagMaterial.dispose();
    this.progressMaterial.dispose();
    this.flagGeometry.dispose();
  }
}
