import * as THREE from 'three';
import { SquadCommand } from './types';

export const SQUAD_COMMAND_WORLD_MARKER_NAME = 'SquadCommandWorldMarker';

interface SquadCommandWorldMarkerOptions {
  terrainHeightAt?: (x: number, z: number) => number;
}

const GROUND_OFFSET = 0.12;
const BEACON_HEIGHT = 4.25;
const COMMAND_COLORS: Record<SquadCommand, number> = {
  [SquadCommand.FOLLOW_ME]: 0x5cb85c,
  [SquadCommand.HOLD_POSITION]: 0x5cb85c,
  [SquadCommand.PATROL_HERE]: 0x6fb7d8,
  [SquadCommand.ATTACK_HERE]: 0xd95f3d,
  [SquadCommand.RETREAT]: 0xd6a559,
  [SquadCommand.FREE_ROAM]: 0x9aa0a6,
  [SquadCommand.NONE]: 0x9aa0a6,
};

export class SquadCommandWorldMarker {
  private readonly scene: THREE.Scene;
  private readonly terrainHeightAt?: (x: number, z: number) => number;
  private readonly group = new THREE.Group();
  private readonly ringGeometry = new THREE.RingGeometry(1.6, 1.95, 36);
  private readonly fillGeometry = new THREE.CircleGeometry(0.42, 24);
  private readonly postGeometry = new THREE.CylinderGeometry(0.04, 0.04, BEACON_HEIGHT, 8);
  private readonly capGeometry = new THREE.ConeGeometry(0.34, 0.72, 4);
  private readonly ringMaterial = this.createMaterial(0x5cb85c, 0.78);
  private readonly fillMaterial = this.createMaterial(0x5cb85c, 0.3);
  private readonly postMaterial = this.createMaterial(0x5cb85c, 0.38);
  private readonly capMaterial = this.createMaterial(0x5cb85c, 0.72);

  constructor(scene: THREE.Scene, options: SquadCommandWorldMarkerOptions = {}) {
    this.scene = scene;
    this.terrainHeightAt = options.terrainHeightAt;

    this.group.name = SQUAD_COMMAND_WORLD_MARKER_NAME;
    this.group.visible = false;
    this.group.userData.perfCategory = 'ui_command_marker';

    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    ring.name = 'SquadCommandWorldMarker.Ring';
    ring.rotation.x = -Math.PI / 2;

    const fill = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    fill.name = 'SquadCommandWorldMarker.Center';
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;

    const post = new THREE.Mesh(this.postGeometry, this.postMaterial);
    post.name = 'SquadCommandWorldMarker.Beacon';
    post.position.y = BEACON_HEIGHT * 0.5;

    const cap = new THREE.Mesh(this.capGeometry, this.capMaterial);
    cap.name = 'SquadCommandWorldMarker.Cap';
    cap.position.y = BEACON_HEIGHT + 0.24;

    for (const object of [ring, fill, post, cap]) {
      object.frustumCulled = false;
      object.renderOrder = 40;
      object.userData.perfCategory = 'ui_command_marker';
      this.group.add(object);
    }

    this.scene.add(this.group);
  }

  setCommand(command: SquadCommand, position?: THREE.Vector3): void {
    if (!position || command === SquadCommand.NONE || command === SquadCommand.FREE_ROAM) {
      this.group.visible = false;
      return;
    }

    const color = COMMAND_COLORS[command] ?? COMMAND_COLORS[SquadCommand.NONE];
    this.setColor(color);
    this.group.position.set(position.x, this.resolveY(position), position.z);
    this.group.visible = true;
  }

  isVisible(): boolean {
    return this.group.visible;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.ringGeometry.dispose();
    this.fillGeometry.dispose();
    this.postGeometry.dispose();
    this.capGeometry.dispose();
    this.ringMaterial.dispose();
    this.fillMaterial.dispose();
    this.postMaterial.dispose();
    this.capMaterial.dispose();
  }

  private createMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    });
  }

  private setColor(color: number): void {
    this.ringMaterial.color.setHex(color);
    this.fillMaterial.color.setHex(color);
    this.postMaterial.color.setHex(color);
    this.capMaterial.color.setHex(color);
  }

  private resolveY(position: THREE.Vector3): number {
    const terrainY = this.terrainHeightAt?.(position.x, position.z);
    if (terrainY !== undefined && Number.isFinite(terrainY)) {
      return terrainY + GROUND_OFFSET;
    }
    return position.y + GROUND_OFFSET;
  }
}
