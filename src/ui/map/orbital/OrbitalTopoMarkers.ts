// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Capture-point + spawn markers for the orbital relief mesh.
 *
 * Markers are an `InstancedMesh` of small pillars: one per capture zone (HQ /
 * outpost) coloured by current owner, plus one per spawn point. Ownership
 * colour is recomputed every refresh so a captured outpost recolours live.
 *
 * The pure parts — world→display projection, owner→colour, building the flat
 * instance descriptor list — are DOM/WebGL-free and unit-tested. The
 * InstancedMesh assembly + per-instance picking lives in the thin class.
 */

import * as THREE from 'three';

/** Ownership state used for marker colouring (faction-agnostic at this layer). */
export type MarkerOwner = 'blufor' | 'opfor' | 'contested' | 'neutral';

export interface TopoMarkerInput {
  id: string;
  name: string;
  worldX: number;
  worldZ: number;
  /** 'capture' draws a tall flag pillar; 'spawn' a short stub. */
  kind: 'capture' | 'spawn';
  owner: MarkerOwner;
  isHomeBase?: boolean;
}

export interface TopoMarkerInstance {
  id: string;
  name: string;
  /** Display-space X/Z (centred on origin, matches the relief mesh footprint). */
  x: number;
  z: number;
  color: [number, number, number];
  /** Pillar height in display units. */
  height: number;
  kind: 'capture' | 'spawn';
  owner: MarkerOwner;
  isHomeBase: boolean;
  label: string;
}

export interface TopoMarkerLegendItem {
  key: MarkerOwner | 'spawn';
  label: string;
  color: [number, number, number];
}

const OWNER_COLORS: Record<MarkerOwner, [number, number, number]> = {
  blufor: [0.31, 0.42, 0.23],
  opfor: [0.62, 0.23, 0.18],
  contested: [0.85, 0.7, 0.2],
  neutral: [0.6, 0.6, 0.62],
};

const SPAWN_COLOR: [number, number, number] = [0.49, 0.6, 0.35];

const OWNER_LABELS: Record<MarkerOwner, string> = {
  blufor: 'BLUFOR',
  opfor: 'OPFOR',
  contested: 'CONTESTED',
  neutral: 'NEUTRAL',
};

/** Owner → RGB triple in [0,1]. Pure. */
export function markerColorFor(owner: MarkerOwner): [number, number, number] {
  return OWNER_COLORS[owner];
}

export function markerLabelFor(input: Pick<TopoMarkerInput, 'name' | 'kind' | 'owner' | 'isHomeBase'>): string {
  if (input.kind === 'spawn') return `SPAWN - ${input.name}`;
  const role = input.isHomeBase ? 'HQ' : 'OBJ';
  return `${OWNER_LABELS[input.owner]} ${role} - ${input.name}`;
}

export function buildMarkerLegend(): TopoMarkerLegendItem[] {
  return [
    { key: 'blufor', label: 'BLUFOR objective', color: OWNER_COLORS.blufor },
    { key: 'opfor', label: 'OPFOR objective', color: OWNER_COLORS.opfor },
    { key: 'contested', label: 'Contested objective', color: OWNER_COLORS.contested },
    { key: 'neutral', label: 'Neutral objective', color: OWNER_COLORS.neutral },
    { key: 'spawn', label: 'Insertion spawn', color: SPAWN_COLOR },
  ];
}

/**
 * Project a world-XZ position into the relief mesh's centred display space.
 * The relief plane spans `displaySize` units centred on the origin and covers
 * `worldSize` metres, so this matches `buildTopoMeshData`'s vertex layout.
 */
export function worldToDisplay(
  worldX: number,
  worldZ: number,
  worldSize: number,
  displaySize: number,
): { x: number; z: number } {
  // World origin is the map centre; map covers [-worldSize/2, +worldSize/2].
  const u = worldX / worldSize + 0.5;
  const v = worldZ / worldSize + 0.5;
  return { x: (u - 0.5) * displaySize, z: (v - 0.5) * displaySize };
}

/**
 * Build the flat instance descriptor list from marker inputs. Capture points
 * get a tall pillar (home bases taller); spawns get a short stub in the shared
 * spawn colour. Pure — no THREE objects.
 */
export function buildMarkerInstances(
  inputs: readonly TopoMarkerInput[],
  worldSize: number,
  displaySize: number,
): TopoMarkerInstance[] {
  const captureHeight = displaySize * 0.06;
  const hqHeight = displaySize * 0.09;
  const spawnHeight = displaySize * 0.025;
  return inputs.map((input) => {
    const { x, z } = worldToDisplay(input.worldX, input.worldZ, worldSize, displaySize);
    const isCapture = input.kind === 'capture';
    const color = isCapture ? markerColorFor(input.owner) : SPAWN_COLOR;
    const height = isCapture ? (input.isHomeBase ? hqHeight : captureHeight) : spawnHeight;
    return {
      id: input.id,
      name: input.name,
      x,
      z,
      color,
      height,
      kind: input.kind,
      owner: input.owner,
      isHomeBase: input.isHomeBase ?? false,
      label: markerLabelFor(input),
    };
  });
}

/**
 * InstancedMesh-backed marker layer. Owns one pillar geometry instanced per
 * marker, recoloured live via `instanceColor`. Y is set from a caller-supplied
 * height sampler (full-res `getHeightAt`) so markers sit on the relief.
 */
export class OrbitalTopoMarkers {
  readonly group = new THREE.Group();
  private readonly labelGroup = new THREE.Group();
  private instanced: THREE.InstancedMesh | null = null;
  private labelSprites: THREE.Sprite[] = [];
  private instances: TopoMarkerInstance[] = [];
  private readonly displaySize: number;
  private readonly worldSize: number;
  private readonly verticalScale: number;
  private readonly minHeight: number;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(opts: {
    worldSize: number;
    displaySize: number;
    verticalScale: number;
    minHeight: number;
  }) {
    this.worldSize = opts.worldSize;
    this.displaySize = opts.displaySize;
    this.verticalScale = opts.verticalScale;
    this.minHeight = opts.minHeight;
    this.group.add(this.labelGroup);
  }

  /** Rebuild markers from inputs; `heightAt(worldX, worldZ)` gives terrain Y. */
  setMarkers(inputs: readonly TopoMarkerInput[], heightAt: (worldX: number, worldZ: number) => number): void {
    this.instances = buildMarkerInstances(inputs, this.worldSize, this.displaySize);
    this.rebuildMesh(inputs, heightAt);
  }

  private rebuildMesh(inputs: readonly TopoMarkerInput[], heightAt: (worldX: number, worldZ: number) => number): void {
    this.disposeMesh();
    const count = this.instances.length;
    if (count === 0) return;

    const geometry = new THREE.CylinderGeometry(this.displaySize * 0.006, this.displaySize * 0.009, 1, 6);
    geometry.translate(0, 0.5, 0); // base at y=0 so scaling grows upward
    const material = new THREE.MeshLambertMaterial({ vertexColors: false });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    for (let i = 0; i < count; i++) {
      const inst = this.instances[i];
      const terrainY = (heightAt(inputs[i].worldX, inputs[i].worldZ) - this.minHeight) * this.verticalScale;
      this.dummy.position.set(inst.x, terrainY, inst.z);
      this.dummy.scale.set(1, inst.height, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setRGB(inst.color[0], inst.color[1], inst.color[2]);
      mesh.setColorAt(i, this.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.instanced = mesh;
    this.group.add(mesh);
    this.rebuildLabels(inputs, heightAt);
  }

  /** Resolve a raycast hit on the marker mesh to the marker id/name it struck. */
  pick(raycaster: THREE.Raycaster): { id: string; name: string } | null {
    if (!this.instanced) return null;
    const hits = raycaster.intersectObject(this.instanced, false);
    const instanceId = hits[0]?.instanceId;
    if (instanceId === undefined) return null;
    const inst = this.instances[instanceId];
    return inst ? { id: inst.id, name: inst.name } : null;
  }

  getInstances(): readonly TopoMarkerInstance[] {
    return this.instances;
  }

  private disposeMesh(): void {
    if (!this.instanced) return;
    this.group.remove(this.instanced);
    this.instanced.geometry.dispose();
    (this.instanced.material as THREE.Material).dispose();
    this.instanced = null;
    this.disposeLabels();
  }

  dispose(): void {
    this.disposeMesh();
  }

  private rebuildLabels(inputs: readonly TopoMarkerInput[], heightAt: (worldX: number, worldZ: number) => number): void {
    this.disposeLabels();
    const labelLift = this.displaySize * 0.015;
    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      const terrainY = (heightAt(inputs[i].worldX, inputs[i].worldZ) - this.minHeight) * this.verticalScale;
      const sprite = makeTextSprite(inst.label, inst.color);
      sprite.position.set(inst.x, terrainY + inst.height + labelLift, inst.z);
      sprite.scale.set(this.displaySize * 0.12, this.displaySize * 0.03, 1);
      this.labelGroup.add(sprite);
      this.labelSprites.push(sprite);
    }

    const legend = buildMarkerLegend();
    const legendX = -this.displaySize * 0.46;
    const legendZ = -this.displaySize * 0.46;
    const legendY = this.displaySize * 0.18;
    for (let i = 0; i < legend.length; i++) {
      const item = legend[i];
      const sprite = makeTextSprite(item.label, item.color);
      sprite.position.set(legendX, legendY + i * this.displaySize * 0.018, legendZ);
      sprite.scale.set(this.displaySize * 0.14, this.displaySize * 0.028, 1);
      this.labelGroup.add(sprite);
      this.labelSprites.push(sprite);
    }
  }

  private disposeLabels(): void {
    for (const sprite of this.labelSprites) {
      this.labelGroup.remove(sprite);
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.labelSprites = [];
  }
}

function makeTextSprite(text: string, color: [number, number, number]): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 10, 8, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    ctx.fillRect(0, 0, 28, canvas.height);
    ctx.fillStyle = '#f4eedb';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 46, canvas.height / 2, canvas.width - 56);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  return new THREE.Sprite(material);
}
