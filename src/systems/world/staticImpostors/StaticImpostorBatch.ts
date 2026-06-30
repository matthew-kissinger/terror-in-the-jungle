// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { StaticImpostorArchetype } from '../../../config/staticImpostorArchetypes';
import { Logger } from '../../../utils/Logger';
import { isLightingRigEnabled, lightingRigBindings } from '../../environment/LightingRig';
import {
  createStaticImpostorNodeMaterial,
  type StaticImpostorMaterialTuning,
  type StaticImpostorMaterialTextures,
  type StaticImpostorNodeMaterial,
} from './StaticImpostorMaterial';

const STATIC_IMPOSTOR_PERF_CATEGORY = 'world_static_impostors';
const DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY = 0.00055;
const MAX_STATIC_IMPOSTOR_FOG_DENSITY = 0.002;
const STATIC_IMPOSTOR_FOG_MAX_COMPONENT = 0.74;

const clampNumber = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

export interface StaticImpostorBatchAtlas {
  textures: StaticImpostorMaterialTextures;
}

export interface StaticImpostorBatchInstance {
  center: THREE.Vector3;
  scale: THREE.Vector2;
  yaw: number;
}

export interface StaticImpostorBatchDebugInfo {
  active: number;
  highWater: number;
  free: number;
  source: string;
  lightingProfile: StaticImpostorArchetype['lightingProfile'] | 'surface-normal';
  promotionDistanceMeters: number;
  demotionDistanceMeters: number;
  transitionFadeMeters: number;
  fogStrength: number;
  foliageExposure: number;
  foliageColorGamma: number;
  foliageSaturation: number;
  azimuthBlendBand: number;
}

export class StaticImpostorBatch {
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: StaticImpostorNodeMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly activeScales: Float32Array;
  private readonly visibleScales: Float32Array;
  private readonly yaws: Float32Array;
  private readonly opacities: Float32Array;
  private readonly positionAttribute: THREE.InstancedBufferAttribute;
  private readonly scaleAttribute: THREE.InstancedBufferAttribute;
  private readonly yawAttribute: THREE.InstancedBufferAttribute;
  private readonly opacityAttribute: THREE.InstancedBufferAttribute;
  private readonly freeSlots = new Set<number>();
  private highWaterMark = 0;
  private liveCount = 0;
  private pendingPositionUpdate = false;
  private pendingScaleUpdate = false;
  private pendingYawUpdate = false;
  private pendingOpacityUpdate = false;
  private capacityWarningLogged = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly archetype: StaticImpostorArchetype,
    atlas: StaticImpostorBatchAtlas,
    private readonly capacity: number,
    private readonly source: string,
    private readonly transitionFadeMeters: number,
    materialTuning?: StaticImpostorMaterialTuning,
  ) {
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(plane.index);
    Object.entries(plane.attributes).forEach(([name, attribute]) => {
      this.geometry.setAttribute(name, attribute);
    });
    this.geometry.instanceCount = 0;
    plane.dispose();

    this.positions = new Float32Array(capacity * 3);
    this.activeScales = new Float32Array(capacity * 2);
    this.visibleScales = new Float32Array(capacity * 2);
    this.yaws = new Float32Array(capacity);
    this.opacities = new Float32Array(capacity);

    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.visibleScales, 2);
    this.yawAttribute = new THREE.InstancedBufferAttribute(this.yaws, 1);
    this.opacityAttribute = new THREE.InstancedBufferAttribute(this.opacities, 1);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    this.yawAttribute.setUsage(THREE.DynamicDrawUsage);
    this.opacityAttribute.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('instancePosition', this.positionAttribute);
    this.geometry.setAttribute('instanceScale', this.scaleAttribute);
    this.geometry.setAttribute('instanceYaw', this.yawAttribute);
    this.geometry.setAttribute('instanceOpacity', this.opacityAttribute);

    this.material = createStaticImpostorNodeMaterial(
      archetype,
      atlas.textures,
      this.positionAttribute,
      this.scaleAttribute,
      this.yawAttribute,
      this.opacityAttribute,
      materialTuning,
    );
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `StaticImpostorBatch_${archetype.slug}`;
    this.mesh.userData.perfCategory = STATIC_IMPOSTOR_PERF_CATEGORY;
    this.mesh.userData.isStaticImpostorBatch = true;
    this.mesh.userData.staticImpostorSource = source;
    this.mesh.userData.staticImpostorSlug = archetype.slug;
    this.mesh.userData.staticImpostorLightingProfile = archetype.lightingProfile ?? 'surface-normal';
    this.mesh.userData.staticImpostorPromotionDistanceMeters = archetype.promotionDistanceMeters;
    this.mesh.userData.staticImpostorDemotionDistanceMeters = archetype.demotionDistanceMeters;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  addInstance(instance: StaticImpostorBatchInstance): number | null {
    let slot: number;
    if (this.freeSlots.size > 0) {
      const next = this.freeSlots.values().next();
      slot = Number(next.value);
      this.freeSlots.delete(slot);
    } else {
      if (this.highWaterMark >= this.capacity) {
        if (!this.capacityWarningLogged) {
          this.capacityWarningLogged = true;
          Logger.warn(
            'world',
            `Static impostor capacity reached for ${this.archetype.slug} (${this.capacity}); `
            + 'suppressing further overflow warnings for this batch',
          );
        }
        return null;
      }
      slot = this.highWaterMark++;
      this.geometry.instanceCount = this.highWaterMark;
    }

    const i3 = slot * 3;
    const i2 = slot * 2;
    this.positions[i3] = instance.center.x;
    this.positions[i3 + 1] = instance.center.y;
    this.positions[i3 + 2] = instance.center.z;
    this.activeScales[i2] = instance.scale.x;
    this.activeScales[i2 + 1] = instance.scale.y;
    this.visibleScales[i2] = 0;
    this.visibleScales[i2 + 1] = 0;
    this.yaws[slot] = instance.yaw;
    this.opacities[slot] = 0;
    this.pendingPositionUpdate = true;
    this.pendingScaleUpdate = true;
    this.pendingYawUpdate = true;
    this.pendingOpacityUpdate = true;
    return slot;
  }

  removeInstance(slot: number): void {
    if (slot < 0 || slot >= this.highWaterMark) {
      return;
    }
    const i2 = slot * 2;
    if (this.opacities[slot] > 0) {
      this.liveCount = Math.max(0, this.liveCount - 1);
    }
    this.activeScales[i2] = 0;
    this.activeScales[i2 + 1] = 0;
    this.visibleScales[i2] = 0;
    this.visibleScales[i2 + 1] = 0;
    this.opacities[slot] = 0;
    this.freeSlots.add(slot);
    this.pendingScaleUpdate = true;
    this.pendingOpacityUpdate = true;
    this.compactHighWaterMark();
  }

  setOpacity(slot: number, opacity: number): void {
    if (slot < 0 || slot >= this.highWaterMark) {
      return;
    }
    const nextOpacity = clampNumber(opacity, 0, 1);
    const i2 = slot * 2;
    const wasActive = this.opacities[slot] > 0;
    const isActive = nextOpacity > 0;
    if (
      wasActive === isActive
      && Math.abs(this.opacities[slot] - nextOpacity) < 0.001
    ) {
      return;
    }
    if (isActive) {
      this.visibleScales[i2] = this.activeScales[i2];
      this.visibleScales[i2 + 1] = this.activeScales[i2 + 1];
      if (!wasActive) this.liveCount++;
    } else {
      this.visibleScales[i2] = 0;
      this.visibleScales[i2 + 1] = 0;
      if (wasActive) this.liveCount = Math.max(0, this.liveCount - 1);
    }
    this.opacities[slot] = nextOpacity;
    this.mesh.visible = this.liveCount > 0;
    this.pendingScaleUpdate = true;
    this.pendingOpacityUpdate = true;
  }

  update(camera: THREE.Camera): void {
    this.material.uniforms.cameraPosition.value.copy(camera.position);
    this.updateFogUniforms();
    if (this.pendingPositionUpdate) {
      this.positionAttribute.needsUpdate = true;
      this.pendingPositionUpdate = false;
    }
    if (this.pendingScaleUpdate) {
      this.scaleAttribute.needsUpdate = true;
      this.pendingScaleUpdate = false;
    }
    if (this.pendingYawUpdate) {
      this.yawAttribute.needsUpdate = true;
      this.pendingYawUpdate = false;
    }
    if (this.pendingOpacityUpdate) {
      this.opacityAttribute.needsUpdate = true;
      this.pendingOpacityUpdate = false;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  getDebugInfo(): StaticImpostorBatchDebugInfo {
    return {
      active: this.liveCount,
      highWater: this.highWaterMark,
      free: this.freeSlots.size,
      source: this.source,
      lightingProfile: this.archetype.lightingProfile ?? 'surface-normal',
      promotionDistanceMeters: this.archetype.promotionDistanceMeters,
      demotionDistanceMeters: this.archetype.demotionDistanceMeters,
      transitionFadeMeters: this.transitionFadeMeters,
      fogStrength: this.material.uniforms.fogStrength.value,
      foliageExposure: this.material.uniforms.foliageExposure.value,
      foliageColorGamma: this.material.uniforms.foliageColorGamma.value,
      foliageSaturation: this.material.uniforms.foliageSaturation.value,
      azimuthBlendBand: this.material.uniforms.azimuthBlendBand.value,
    };
  }

  private compactHighWaterMark(): void {
    while (this.highWaterMark > 0) {
      const lastSlot = this.highWaterMark - 1;
      const i2 = lastSlot * 2;
      if (this.activeScales[i2] !== 0 || this.activeScales[i2 + 1] !== 0) {
        break;
      }
      this.highWaterMark--;
      this.freeSlots.delete(lastSlot);
    }
    this.geometry.instanceCount = this.highWaterMark;
    this.mesh.visible = this.liveCount > 0;
  }

  private updateFogUniforms(): void {
    const fog = this.scene.fog;
    if (fog && 'density' in fog) {
      this.material.uniforms.fogEnabled.value = true;
      copyStaticImpostorFogColor(
        isLightingRigEnabled() ? lightingRigBindings.fogColor.value : fog.color,
        this.material.uniforms.fogColor.value,
      );
      this.material.uniforms.fogDensity.value = clampNumber(
        Number.isFinite(fog.density) ? fog.density : DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY,
        0,
        MAX_STATIC_IMPOSTOR_FOG_DENSITY,
      );
    } else {
      this.material.uniforms.fogEnabled.value = false;
      this.material.uniforms.fogDensity.value = DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY;
    }
  }
}

function copyStaticImpostorFogColor(source: THREE.Color, target: THREE.Color): void {
  target.copy(source);
  const peak = Math.max(target.r, target.g, target.b);
  if (peak > STATIC_IMPOSTOR_FOG_MAX_COMPONENT && peak > 1e-6) {
    target.multiplyScalar(STATIC_IMPOSTOR_FOG_MAX_COMPONENT / peak);
  }
  target.r = clampNumber(target.r, 0, STATIC_IMPOSTOR_FOG_MAX_COMPONENT);
  target.g = clampNumber(target.g, 0, STATIC_IMPOSTOR_FOG_MAX_COMPONENT);
  target.b = clampNumber(target.b, 0, STATIC_IMPOSTOR_FOG_MAX_COMPONENT);
}
