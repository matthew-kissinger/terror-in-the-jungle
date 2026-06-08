// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import type { WaterBodyQuerySegment, WaterBodyStats } from './WaterBodyAuthority';

export const WATER_BODY_MATERIAL_PROFILE = 'level_depth_water_body';
const WATER_BODY_DAY_COLOR = new THREE.Color(0xffffff);
const WATER_BODY_NIGHT_COLOR = new THREE.Color(0x152230);
const WATER_BODY_DAY_EMISSIVE_INTENSITY = 0.06;
const WATER_BODY_NIGHT_EMISSIVE_INTENSITY = 0.008;
const WATER_BODY_DAY_ENV_INTENSITY = 0.5;
const WATER_BODY_NIGHT_ENV_INTENSITY = 0.06;

/**
 * Scene-owned mesh for authored level/depth water bodies. Gameplay sampling
 * remains in `WaterBodyAuthority`; this class only translates the authority's
 * query segments into visible water ribbons at constant reach elevations.
 */
export class WaterBodySurface {
  private readonly scene: THREE.Scene;
  private group?: THREE.Group;
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setSegments(segments: readonly WaterBodyQuerySegment[], stats: WaterBodyStats): boolean {
    this.clear();
    if (segments.length === 0) return false;

    const geometry = buildWaterBodyGeometry(segments);
    const material = new THREE.MeshStandardMaterial({
      name: 'level-depth-water-body-material',
      color: WATER_BODY_DAY_COLOR,
      emissive: 0x021621,
      emissiveIntensity: WATER_BODY_DAY_EMISSIVE_INTENSITY,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
      side: THREE.DoubleSide,
    });
    material.envMapIntensity = WATER_BODY_DAY_ENV_INTENSITY;
    installWaterBodyAlphaPatch(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'level-depth-water-body-surface-mesh';
    mesh.frustumCulled = true;
    mesh.renderOrder = 7;

    const group = new THREE.Group();
    group.name = 'level-depth-water-bodies';
    group.add(mesh);
    this.scene.add(group);

    this.group = group;
    this.mesh = mesh;
    Logger.info(
      'environment',
      `Level/depth water bodies loaded: ${stats.bodyCount} bodies, ${stats.segmentCount} segments`,
    );
    return true;
  }

  clear(): void {
    if (this.group) this.scene.remove(this.group);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this.group = undefined;
    this.mesh = undefined;
  }

  isActive(): boolean { return !!this.group; }
  isVisible(): boolean { return Boolean(this.group?.visible); }
  getMaterialProfile(): string { return this.mesh ? WATER_BODY_MATERIAL_PROFILE : 'none'; }

  setLightingFactor(daylight: number): void {
    if (!this.mesh) return;
    const t = Math.min(1, Math.max(0, Number.isFinite(daylight) ? daylight : 1));
    const material = this.mesh.material;
    material.color.copy(WATER_BODY_NIGHT_COLOR).lerp(WATER_BODY_DAY_COLOR, t);
    material.emissiveIntensity =
      WATER_BODY_NIGHT_EMISSIVE_INTENSITY
      + (WATER_BODY_DAY_EMISSIVE_INTENSITY - WATER_BODY_NIGHT_EMISSIVE_INTENSITY) * t;
    material.envMapIntensity =
      WATER_BODY_NIGHT_ENV_INTENSITY
      + (WATER_BODY_DAY_ENV_INTENSITY - WATER_BODY_NIGHT_ENV_INTENSITY) * t;
  }
}

function buildWaterBodyGeometry(segments: readonly WaterBodyQuerySegment[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const firstSegmentByBody = new Map<string, WaterBodyQuerySegment>();
  const lastSegmentByBody = new Map<string, WaterBodyQuerySegment>();

  for (const segment of segments) {
    if (!firstSegmentByBody.has(segment.waterBodyId)) firstSegmentByBody.set(segment.waterBodyId, segment);
    lastSegmentByBody.set(segment.waterBodyId, segment);
  }

  for (const segment of segments) {
    const dx = segment.endX - segment.startX;
    const dz = segment.endZ - segment.startZ;
    const length = Math.hypot(dx, dz);
    if (length <= 0) continue;
    const rightX = -dz / length;
    const rightZ = dx / length;
    const alpha = resolveAlphaForDepth((segment.startDepthMeters + segment.endDepthMeters) * 0.5);
    const base = positions.length / 3;

    for (const band of WATER_BODY_CROSS_SECTION) {
      pushVertex(
        positions,
        colors,
        alphas,
        segment.startX + rightX * segment.halfWidth * band.offset,
        segment.startSurfaceY,
        segment.startZ + rightZ * segment.halfWidth * band.offset,
        band.color,
        alpha * band.alphaScale,
      );
    }
    for (const band of WATER_BODY_CROSS_SECTION) {
      pushVertex(
        positions,
        colors,
        alphas,
        segment.endX + rightX * segment.halfWidth * band.offset,
        segment.endSurfaceY,
        segment.endZ + rightZ * segment.halfWidth * band.offset,
        band.color,
        alpha * band.alphaScale,
      );
    }

    for (let bandIndex = 0; bandIndex < WATER_BODY_CROSS_SECTION.length - 1; bandIndex++) {
      const startA = base + bandIndex;
      const startB = base + bandIndex + 1;
      const endA = base + WATER_BODY_CROSS_SECTION.length + bandIndex;
      const endB = base + WATER_BODY_CROSS_SECTION.length + bandIndex + 1;
      indices.push(startA, endA, startB, startB, endA, endB);
    }

    if (firstSegmentByBody.get(segment.waterBodyId) === segment) {
      appendWaterBodyCap(positions, colors, alphas, indices, segment, { dirX: -dx / length, dirZ: -dz / length, rightX, rightZ, atStart: true, alpha });
    }
    if (lastSegmentByBody.get(segment.waterBodyId) === segment) {
      appendWaterBodyCap(positions, colors, alphas, indices, segment, { dirX: dx / length, dirZ: dz / length, rightX, rightZ, atStart: false, alpha });
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('waterAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const WATER_BODY_CROSS_SECTION: Array<{
  offset: number;
  color: [number, number, number];
  alphaScale: number;
}> = [
  { offset: -1, color: [0.04, 0.18, 0.12], alphaScale: 0.22 },
  { offset: -0.78, color: [0.08, 0.32, 0.34], alphaScale: 0.5 },
  { offset: -0.42, color: [0.09, 0.48, 0.58], alphaScale: 0.86 },
  { offset: 0, color: [0.12, 0.58, 0.7], alphaScale: 1 },
  { offset: 0.42, color: [0.09, 0.48, 0.58], alphaScale: 0.86 },
  { offset: 0.78, color: [0.08, 0.32, 0.34], alphaScale: 0.5 },
  { offset: 1, color: [0.04, 0.18, 0.12], alphaScale: 0.22 },
];

const WATER_BODY_CAP_STEPS = 12;

function appendWaterBodyCap(
  positions: number[],
  colors: number[],
  alphas: number[],
  indices: number[],
  segment: WaterBodyQuerySegment,
  args: {
    dirX: number;
    dirZ: number;
    rightX: number;
    rightZ: number;
    atStart: boolean;
    alpha: number;
  },
): void {
  const surfaceY = args.atStart ? segment.startSurfaceY : segment.endSurfaceY;
  const centerX = args.atStart ? segment.startX : segment.endX;
  const centerZ = args.atStart ? segment.startZ : segment.endZ;
  const base = positions.length / 3;
  pushVertex(positions, colors, alphas, centerX, surfaceY, centerZ, [0.12, 0.58, 0.7], args.alpha);
  for (let step = 0; step <= WATER_BODY_CAP_STEPS; step++) {
    const theta = (step / WATER_BODY_CAP_STEPS) * Math.PI;
    const lateral = Math.cos(theta) * segment.halfWidth;
    const forward = Math.sin(theta) * segment.halfWidth;
    const x = centerX + args.rightX * lateral + args.dirX * forward;
    const z = centerZ + args.rightZ * lateral + args.dirZ * forward;
    const edgeWeight = Math.sin(theta);
    const color: [number, number, number] = edgeWeight > 0.35
      ? [0.08, 0.32, 0.34]
      : [0.04, 0.18, 0.12];
    pushVertex(positions, colors, alphas, x, surfaceY, z, color, args.alpha * 0.36);
  }
  for (let step = 1; step <= WATER_BODY_CAP_STEPS; step++) {
    indices.push(base, base + step, base + step + 1);
  }
}

function pushVertex(
  positions: number[],
  colors: number[],
  alphas: number[],
  x: number,
  y: number,
  z: number,
  color: [number, number, number],
  alpha: number,
): void {
  positions.push(x, y + 0.08, z);
  colors.push(color[0], color[1], color[2], alpha);
  alphas.push(alpha);
}

function resolveAlphaForDepth(depthMeters: number): number {
  return Math.min(0.96, Math.max(0.68, 0.68 + depthMeters * 0.08));
}

function installWaterBodyAlphaPatch(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float waterAlpha;\nvarying float vWaterAlpha;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvWaterAlpha = waterAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWaterAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vWaterAlpha;');
  };
}
