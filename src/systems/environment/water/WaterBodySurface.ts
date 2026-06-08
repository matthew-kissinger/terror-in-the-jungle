// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import type { WaterBodyQuerySegment, WaterBodyStats } from './WaterBodyAuthority';

export const WATER_BODY_MATERIAL_PROFILE = 'level_depth_water_body';
const WATER_BODY_DAY_COLOR = new THREE.Color(0xffffff);
const WATER_BODY_NIGHT_COLOR = new THREE.Color(0x16546b);
const WATER_BODY_NIGHT_RENDER_COLOR = new THREE.Color(0x16546b);
const WATER_BODY_DAY_EMISSIVE_INTENSITY = 0.06;
const WATER_BODY_NIGHT_EMISSIVE_INTENSITY = 0.032;
const WATER_BODY_DAY_ENV_INTENSITY = 0.5;
const WATER_BODY_NIGHT_ENV_INTENSITY = 0.06;
const WATER_BODY_DAY_OPACITY = 0.92;
const WATER_BODY_NIGHT_OPACITY = 0.98;
const WATER_BODY_NIGHT_ALPHA_FLOOR = 0.88;
const WATER_BODY_SOLID_NIGHT_THRESHOLD = 0.08;

interface WaterBodyAlphaRefs {
  waterBodyNightBlend: { value: number };
  waterBodyNightAlphaFloor: { value: number };
  waterBodyNightRenderColor: { value: THREE.Color };
}

/**
 * Scene-owned mesh for authored level/depth water bodies. Gameplay sampling
 * remains in `WaterBodyAuthority`; this class only translates the authority's
 * query footprints into visible level surfaces.
 */
export class WaterBodySurface {
  private readonly scene: THREE.Scene;
  private group?: THREE.Group;
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  private dayMaterial?: THREE.MeshStandardMaterial;
  private nightMaterial?: THREE.MeshBasicMaterial;
  private alphaRefs?: WaterBodyAlphaRefs;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setSegments(segments: readonly WaterBodyQuerySegment[], stats: WaterBodyStats): boolean {
    this.clear();
    if (segments.length === 0) return false;

    const geometry = buildWaterBodyGeometry(segments);
    const material = createWaterBodyDayMaterial();
    const nightMaterial = createWaterBodyNightMaterial();
    this.alphaRefs = installWaterBodyAlphaPatch(material);

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
    this.dayMaterial = material;
    this.nightMaterial = nightMaterial;
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
    }
    this.dayMaterial?.dispose();
    this.nightMaterial?.dispose();
    this.group = undefined;
    this.mesh = undefined;
    this.dayMaterial = undefined;
    this.nightMaterial = undefined;
    this.alphaRefs = undefined;
  }

  isActive(): boolean { return !!this.group; }
  isVisible(): boolean { return Boolean(this.group?.visible); }
  getMaterialProfile(): string { return this.mesh ? WATER_BODY_MATERIAL_PROFILE : 'none'; }

  setLightingFactor(daylight: number): void {
    if (!this.mesh || !this.dayMaterial || !this.nightMaterial) return;
    const t = Math.min(1, Math.max(0, Number.isFinite(daylight) ? daylight : 1));
    const solidNight = t <= WATER_BODY_SOLID_NIGHT_THRESHOLD;
    this.mesh.material = solidNight ? this.nightMaterial : this.dayMaterial;
    const material = this.dayMaterial;
    material.color.copy(WATER_BODY_NIGHT_COLOR).lerp(WATER_BODY_DAY_COLOR, t);
    material.emissiveIntensity =
      WATER_BODY_NIGHT_EMISSIVE_INTENSITY
      + (WATER_BODY_DAY_EMISSIVE_INTENSITY - WATER_BODY_NIGHT_EMISSIVE_INTENSITY) * t;
    material.envMapIntensity =
      WATER_BODY_NIGHT_ENV_INTENSITY
      + (WATER_BODY_DAY_ENV_INTENSITY - WATER_BODY_NIGHT_ENV_INTENSITY) * t;
    material.opacity =
      WATER_BODY_NIGHT_OPACITY
      + (WATER_BODY_DAY_OPACITY - WATER_BODY_NIGHT_OPACITY) * t;
    if (this.alphaRefs) {
      this.alphaRefs.waterBodyNightBlend.value = 1 - t;
      this.alphaRefs.waterBodyNightRenderColor.value.copy(WATER_BODY_NIGHT_RENDER_COLOR);
    }
    material.userData.waterBodyNightBlend = 1 - t;
    material.userData.waterBodyNightAlphaFloor = WATER_BODY_NIGHT_ALPHA_FLOOR;
  }
}

function createWaterBodyDayMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: 'level-depth-water-body-material',
    color: WATER_BODY_DAY_COLOR,
    emissive: 0x021621,
    emissiveIntensity: WATER_BODY_DAY_EMISSIVE_INTENSITY,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: WATER_BODY_DAY_OPACITY,
    depthWrite: false,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
    side: THREE.DoubleSide,
  });
  material.envMapIntensity = WATER_BODY_DAY_ENV_INTENSITY;
  return material;
}

function createWaterBodyNightMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: 'level-depth-water-body-night-material',
    color: WATER_BODY_NIGHT_RENDER_COLOR,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
    side: THREE.DoubleSide,
  });
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
    if (segment.shape === 'basin') {
      appendBasinGeometry(positions, colors, alphas, indices, segment);
      continue;
    }
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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const WATER_BODY_BASIN_SEGMENTS = 96;
const WATER_BODY_BASIN_RINGS = 5;

function appendBasinGeometry(
  positions: number[],
  colors: number[],
  alphas: number[],
  indices: number[],
  segment: WaterBodyQuerySegment,
): void {
  const centerX = segment.centerX;
  const centerZ = segment.centerZ;
  const radiusX = segment.radiusXMeters;
  const radiusZ = segment.radiusZMeters;
  if (
    !Number.isFinite(centerX)
    || !Number.isFinite(centerZ)
    || !Number.isFinite(radiusX)
    || !Number.isFinite(radiusZ)
    || (radiusX ?? 0) <= 0
    || (radiusZ ?? 0) <= 0
  ) {
    return;
  }

  const rotation = segment.rotationRadians ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const depth = Math.max(segment.startDepthMeters, segment.endDepthMeters);
  const baseAlpha = resolveAlphaForDepth(depth);
  const centerBase = positions.length / 3;
  const seed = resolveShorelineSeed(segment);

  pushVertex(
    positions,
    colors,
    alphas,
    centerX ?? 0,
    segment.startSurfaceY,
    centerZ ?? 0,
    [0.035, 0.24, 0.34],
    baseAlpha,
  );

  const firstRingBase = positions.length / 3;
  for (let ring = 1; ring <= WATER_BODY_BASIN_RINGS; ring++) {
    const ringT = ring / WATER_BODY_BASIN_RINGS;
    for (let step = 0; step < WATER_BODY_BASIN_SEGMENTS; step++) {
      const theta = (step / WATER_BODY_BASIN_SEGMENTS) * Math.PI * 2;
      const variation = basinShorelineVariation(theta, seed) * Math.pow(ringT, 1.8);
      const radiusScale = ringT * (1 + variation);
      const localX = Math.cos(theta) * (radiusX ?? 1) * radiusScale;
      const localZ = Math.sin(theta) * (radiusZ ?? 1) * radiusScale;
      const x = (centerX ?? 0) + localX * cos - localZ * sin;
      const z = (centerZ ?? 0) + localX * sin + localZ * cos;
      const color = resolveBasinColor(ringT, variation);
      const alpha = baseAlpha * resolveBasinAlphaScale(ringT, variation);
      pushVertex(positions, colors, alphas, x, segment.startSurfaceY, z, color, alpha);
    }
  }

  for (let step = 0; step < WATER_BODY_BASIN_SEGMENTS; step++) {
    const next = (step + 1) % WATER_BODY_BASIN_SEGMENTS;
    indices.push(centerBase, firstRingBase + next, firstRingBase + step);
  }

  for (let ring = 1; ring < WATER_BODY_BASIN_RINGS; ring++) {
    const currentBase = firstRingBase + (ring - 1) * WATER_BODY_BASIN_SEGMENTS;
    const nextBase = firstRingBase + ring * WATER_BODY_BASIN_SEGMENTS;
    for (let step = 0; step < WATER_BODY_BASIN_SEGMENTS; step++) {
      const next = (step + 1) % WATER_BODY_BASIN_SEGMENTS;
      indices.push(
        currentBase + step,
        nextBase + step,
        currentBase + next,
        currentBase + next,
        nextBase + step,
        nextBase + next,
      );
    }
  }
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
  colors.push(color[0], color[1], color[2]);
  alphas.push(alpha);
}

function resolveAlphaForDepth(depthMeters: number): number {
  return Math.min(0.96, Math.max(0.68, 0.68 + depthMeters * 0.08));
}

function resolveShorelineSeed(segment: WaterBodyQuerySegment): number {
  if (Number.isFinite(segment.shorelineSeed)) return segment.shorelineSeed ?? 0;
  let hash = 2166136261;
  for (let index = 0; index < segment.waterBodyId.length; index++) {
    hash ^= segment.waterBodyId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function basinShorelineVariation(theta: number, seed: number): number {
  const a = Math.sin(theta * 2.0 + seed * 17.13) * 0.045;
  const b = Math.sin(theta * 3.0 + seed * 31.7) * 0.034;
  const c = Math.cos(theta * 5.0 + seed * 11.4) * 0.026;
  return clamp(a + b + c, -0.105, 0.105);
}

function resolveBasinColor(ringT: number, variation: number): [number, number, number] {
  const shoreT = Math.pow(clamp(ringT, 0, 1), 1.55);
  const shoal = clamp((variation + 0.105) / 0.21, 0, 1);
  const deep: [number, number, number] = [0.035, 0.24, 0.34];
  const mid: [number, number, number] = [0.055, 0.42, 0.5];
  const shore: [number, number, number] = [0.04, 0.19, 0.14];
  const mixed = mixColor(deep, mid, clamp(shoreT * 1.25, 0, 1));
  const edge = mixColor(mixed, shore, clamp((shoreT - 0.72) / 0.28, 0, 1));
  return mixColor(edge, [0.07, 0.34, 0.28], shoal * 0.16 * shoreT);
}

function resolveBasinAlphaScale(ringT: number, variation: number): number {
  const edgeFade = clamp((1 - ringT) / 0.28, 0, 1);
  const shorelineFade = 0.24 + edgeFade * 0.76;
  const shoalFade = 1 - clamp((variation + 0.105) / 0.21, 0, 1) * 0.08 * ringT;
  return clamp(shorelineFade * shoalFade, 0.2, 1);
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const clamped = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function installWaterBodyAlphaPatch(material: THREE.MeshStandardMaterial): WaterBodyAlphaRefs {
  const refs: WaterBodyAlphaRefs = {
    waterBodyNightBlend: { value: 0 },
    waterBodyNightAlphaFloor: { value: WATER_BODY_NIGHT_ALPHA_FLOOR },
    waterBodyNightRenderColor: { value: WATER_BODY_NIGHT_RENDER_COLOR.clone() },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterBodyNightBlend = refs.waterBodyNightBlend;
    shader.uniforms.waterBodyNightAlphaFloor = refs.waterBodyNightAlphaFloor;
    shader.uniforms.waterBodyNightRenderColor = refs.waterBodyNightRenderColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float waterAlpha;\nvarying float vWaterAlpha;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvWaterAlpha = waterAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float waterBodyNightBlend;\nuniform float waterBodyNightAlphaFloor;\nuniform vec3 waterBodyNightRenderColor;\nvarying float vWaterAlpha;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, waterBodyNightRenderColor, waterBodyNightBlend * 0.92);\nfloat waterBodyAlpha = mix(vWaterAlpha, max(vWaterAlpha, waterBodyNightAlphaFloor), waterBodyNightBlend);\ndiffuseColor.a *= waterBodyAlpha;',
      );
  };
  material.userData.waterBodyNightBlend = refs.waterBodyNightBlend.value;
  material.userData.waterBodyNightAlphaFloor = refs.waterBodyNightAlphaFloor.value;
  return refs;
}
