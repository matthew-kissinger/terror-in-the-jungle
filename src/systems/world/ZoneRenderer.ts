import * as THREE from 'three';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction, isBlufor, isOpfor } from '../combat/types';

export class ZoneRenderer {
  private scene: THREE.Scene;

  // Visual materials
  private neutralMaterial: THREE.MeshBasicMaterial;
  private usMaterial: THREE.MeshBasicMaterial;
  private opforMaterial: THREE.MeshBasicMaterial;
  private contestedMaterial: THREE.MeshBasicMaterial;

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
    this.scene.add(zone.zoneMesh);

    // Create flag pole
    const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, zone.height, 8);
    const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x444444 });
    zone.flagPole = new THREE.Mesh(poleGeometry, poleMaterial);
    zone.flagPole.position.copy(zone.position);
    zone.flagPole.position.y = terrainHeight + zone.height / 2;
    this.scene.add(zone.flagPole);

    // Create both flags (US and OPFOR)
    const flagGeometry = new THREE.PlaneGeometry(5, 3);

    // US Flag (blue)
    const usFlagMaterial = new THREE.MeshBasicMaterial({
      color: 0x0066cc,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    zone.usFlagMesh = new THREE.Mesh(flagGeometry, usFlagMaterial);
    zone.usFlagMesh.position.copy(zone.position);
    zone.usFlagMesh.position.x += 2.5;
    zone.usFlagMesh.position.y = terrainHeight;
    zone.usFlagMesh.visible = zone.owner === Faction.US;
    this.scene.add(zone.usFlagMesh);

    // OPFOR Flag (red)
    const opforFlagMaterial = new THREE.MeshBasicMaterial({
      color: 0xcc0000,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    zone.opforFlagMesh = new THREE.Mesh(flagGeometry, opforFlagMaterial);
    zone.opforFlagMesh.position.copy(zone.position);
    zone.opforFlagMesh.position.x += 2.5;
    zone.opforFlagMesh.position.y = terrainHeight;
    zone.opforFlagMesh.visible = zone.owner !== null && isOpfor(zone.owner);
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

    // Create progress ring
    const progressGeometry = new THREE.RingGeometry(zone.radius + 0.5, zone.radius + 1, 32, 1, 0, 0);
    const progressMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    zone.progressRing = new THREE.Mesh(progressGeometry, progressMaterial);
    zone.progressRing.rotation.x = -Math.PI / 2;
    zone.progressRing.position.copy(zone.position);
    zone.progressRing.position.y = terrainHeight + 0.2;
    zone.progressRing.visible = false;
    this.scene.add(zone.progressRing);

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
    this.scene.add(sprite);

    zone.labelSprite = sprite;
  }

  updateZoneVisuals(zone: CaptureZone, occupants: { us: number; opfor: number }): void {
    if (!zone.zoneMesh) return;

    // Update zone ring color
    (zone.zoneMesh.material as THREE.MeshBasicMaterial).copy(this.getMaterialForState(zone.state));

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

    // Update flag visibility and positions
    if (zone.usFlagMesh) {
      zone.usFlagMesh.visible = showUSFlag;
      if (showUSFlag) {
        zone.usFlagMesh.position.y = zone.currentFlagHeight;
      }
    }

    if (zone.opforFlagMesh) {
      zone.opforFlagMesh.visible = showOPFORFlag;
      if (showOPFORFlag) {
        zone.opforFlagMesh.position.y = zone.currentFlagHeight;
      }
    }

    // Update progress ring
    if (zone.progressRing) {
      if (zone.state === ZoneState.CONTESTED) {
        zone.progressRing.visible = true;
        const angle = (zone.captureProgress / 100) * Math.PI * 2;
        zone.progressRing.geometry.dispose();
        zone.progressRing.geometry = new THREE.RingGeometry(
          zone.radius + 0.5,
          zone.radius + 1,
          32,
          1,
          0,
          angle
        );
      } else {
        zone.progressRing.visible = false;
      }
    }
  }

  updateZonePositions(zone: CaptureZone, terrainHeight: number): void {
    zone.position.y = terrainHeight;

    if (zone.zoneMesh) {
      zone.zoneMesh.position.y = terrainHeight + 0.1;
    }

    if (zone.flagPole) {
      zone.flagPole.position.y = terrainHeight + zone.height / 2;
    }

    if (zone.progressRing) {
      zone.progressRing.position.y = terrainHeight + 0.2;
    }

    if (zone.labelSprite) {
      zone.labelSprite.position.x = zone.position.x;
      zone.labelSprite.position.y = terrainHeight + zone.height + 3;
      zone.labelSprite.position.z = zone.position.z;
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
      }

      if (zone.opforFlagMesh && zone.opforFlagMesh.visible) {
        zone.opforFlagMesh.rotation.y = waveAmount;
      }
    });
  }

  getMaterialForState(state: ZoneState): THREE.MeshBasicMaterial {
    switch (state) {
      case ZoneState.US_CONTROLLED:
        return this.usMaterial;
      case ZoneState.OPFOR_CONTROLLED:
        return this.opforMaterial;
      case ZoneState.CONTESTED:
        return this.contestedMaterial;
      default:
        return this.neutralMaterial;
    }
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
      zone.usFlagMesh.geometry.dispose();
      this.scene.remove(zone.usFlagMesh);
    }
    if (zone.opforFlagMesh) {
      zone.opforFlagMesh.geometry.dispose();
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
  }
}