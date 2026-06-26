// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  getStaticImpostorArchetype,
  type StaticImpostorArchetype,
} from '../../../config/staticImpostorArchetypes';
import { Logger } from '../../../utils/Logger';
import { isLightingRigEnabled, lightingRigBindings } from '../../environment/LightingRig';
import {
  createStaticImpostorNodeMaterial,
  type StaticImpostorMaterialTextures,
  type StaticImpostorNodeMaterial,
} from './StaticImpostorMaterial';

type AtlasLoadState = 'loading' | 'ready' | 'failed';
type StaticImpostorRenderState = 'mesh' | 'impostor';

const STATIC_IMPOSTOR_PERF_CATEGORY = 'world_static_impostors';
const STATIC_IMPOSTOR_CONTROLLED_KEY = '__staticImpostorControlled';
const DEFAULT_BATCH_CAPACITY = 256;
const DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY = 0.00055;
const MAX_STATIC_IMPOSTOR_FOG_DENSITY = 0.002;
const _bounds = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _worldQuaternion = new THREE.Quaternion();
const _worldEuler = new THREE.Euler(0, 0, 0, 'YXZ');

const clampNumber = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

export interface LoadedStaticImpostorAtlas {
  textures: StaticImpostorMaterialTextures;
}

interface StaticImpostorAtlasRecord {
  state: AtlasLoadState;
  promise?: Promise<LoadedStaticImpostorAtlas>;
  atlas?: LoadedStaticImpostorAtlas;
  error?: unknown;
}

interface RegisteredStaticImpostorInstance {
  id: string;
  modelPath: string;
  archetype: StaticImpostorArchetype;
  object: THREE.Object3D;
  center: THREE.Vector3;
  scale: THREE.Vector2;
  yaw: number;
  slot: number | null;
  state: StaticImpostorRenderState;
}

export interface StaticImpostorDebugInfo {
  registeredInstances: number;
  activeImpostors: number;
  meshFallbacks: number;
  atlasesReady: number;
  atlasesLoading: number;
  atlasesFailed: number;
  batches: Record<string, {
    active: number;
    highWater: number;
    free: number;
  }>;
}

export interface StaticImpostorTextureProvider {
  loadAtlas(archetype: StaticImpostorArchetype): Promise<LoadedStaticImpostorAtlas>;
}

export interface StaticImpostorSystemOptions {
  textureProvider?: StaticImpostorTextureProvider;
  batchCapacity?: number;
  /**
   * Extra archetypes keyed by modelPath, resolved BEFORE the global
   * STATIC_IMPOSTOR_ARCHETYPES registry. Lets a dedicated instance (e.g. the
   * vegetation-owned scatterer) register impostors for archetypes that should
   * NOT pollute the global registry — keeping authored-asset gates and the
   * world-feature path untouched. See docs/rearch/VEGETATION_PHASE_II_*.
   */
  archetypes?: Readonly<Record<string, StaticImpostorArchetype>>;
}

class ThreeStaticImpostorTextureProvider implements StaticImpostorTextureProvider {
  private readonly loader = new THREE.TextureLoader();

  async loadAtlas(archetype: StaticImpostorArchetype): Promise<LoadedStaticImpostorAtlas> {
    const [baseColorMap, normalMap, depthMap] = await Promise.all([
      this.loadTexture(archetype.maps.baseColor),
      this.loadTexture(archetype.maps.normal),
      this.loadTexture(archetype.maps.depth),
    ]);
    return { textures: { baseColorMap, normalMap, depthMap } };
  }

  private loadTexture(path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (texture) => resolve(texture),
        undefined,
        (error) => reject(error),
      );
    });
  }
}

class StaticImpostorBatch {
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: StaticImpostorNodeMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly activeScales: Float32Array;
  private readonly visibleScales: Float32Array;
  private readonly yaws: Float32Array;
  private readonly positionAttribute: THREE.InstancedBufferAttribute;
  private readonly scaleAttribute: THREE.InstancedBufferAttribute;
  private readonly yawAttribute: THREE.InstancedBufferAttribute;
  private readonly freeSlots = new Set<number>();
  private highWaterMark = 0;
  private liveCount = 0;
  private pendingPositionUpdate = false;
  private pendingScaleUpdate = false;
  private pendingYawUpdate = false;
  private capacityWarningLogged = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly archetype: StaticImpostorArchetype,
    atlas: LoadedStaticImpostorAtlas,
    private readonly capacity: number,
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

    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.visibleScales, 2);
    this.yawAttribute = new THREE.InstancedBufferAttribute(this.yaws, 1);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    this.yawAttribute.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('instancePosition', this.positionAttribute);
    this.geometry.setAttribute('instanceScale', this.scaleAttribute);
    this.geometry.setAttribute('instanceYaw', this.yawAttribute);

    this.material = createStaticImpostorNodeMaterial(
      archetype,
      atlas.textures,
      this.positionAttribute,
      this.scaleAttribute,
      this.yawAttribute,
    );
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `StaticImpostorBatch_${archetype.slug}`;
    this.mesh.userData.perfCategory = STATIC_IMPOSTOR_PERF_CATEGORY;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  addInstance(instance: RegisteredStaticImpostorInstance): number | null {
    let slot: number;
    if (this.freeSlots.size > 0) {
      const next = this.freeSlots.values().next();
      slot = Number(next.value);
      this.freeSlots.delete(slot);
    } else {
      if (this.highWaterMark >= this.capacity) {
        // Overflow is re-attempted every frame (the instance keeps a null slot),
        // so warn AT MOST ONCE per batch instead of once per attempt — otherwise a
        // dense archetype storms the log hundreds of thousands of times a second.
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
    this.pendingPositionUpdate = true;
    this.pendingScaleUpdate = true;
    this.pendingYawUpdate = true;
    return slot;
  }

  removeInstance(slot: number): void {
    if (slot < 0 || slot >= this.highWaterMark) {
      return;
    }
    const i2 = slot * 2;
    if (this.visibleScales[i2] !== 0 || this.visibleScales[i2 + 1] !== 0) {
      this.liveCount = Math.max(0, this.liveCount - 1);
    }
    this.activeScales[i2] = 0;
    this.activeScales[i2 + 1] = 0;
    this.visibleScales[i2] = 0;
    this.visibleScales[i2 + 1] = 0;
    this.freeSlots.add(slot);
    this.pendingScaleUpdate = true;
    this.compactHighWaterMark();
  }

  setActive(slot: number, active: boolean): void {
    if (slot < 0 || slot >= this.highWaterMark) {
      return;
    }
    const i2 = slot * 2;
    const currentlyActive = this.visibleScales[i2] !== 0 || this.visibleScales[i2 + 1] !== 0;
    if (currentlyActive === active) {
      return;
    }
    if (active) {
      this.visibleScales[i2] = this.activeScales[i2];
      this.visibleScales[i2 + 1] = this.activeScales[i2 + 1];
      this.liveCount++;
    } else {
      this.visibleScales[i2] = 0;
      this.visibleScales[i2 + 1] = 0;
      this.liveCount = Math.max(0, this.liveCount - 1);
    }
    this.mesh.visible = this.liveCount > 0;
    this.pendingScaleUpdate = true;
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
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  getDebugInfo(): { active: number; highWater: number; free: number } {
    return {
      active: this.liveCount,
      highWater: this.highWaterMark,
      free: this.freeSlots.size,
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
      const fogColor = isLightingRigEnabled() ? lightingRigBindings.fogColor.value : fog.color;
      this.material.uniforms.fogColor.value.copy(fogColor);
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

export class StaticImpostorSystem {
  private readonly textureProvider: StaticImpostorTextureProvider;
  private readonly batchCapacity: number;
  private readonly archetypeOverrides: Readonly<Record<string, StaticImpostorArchetype>>;
  private readonly instances = new Map<string, RegisteredStaticImpostorInstance>();
  private readonly atlasRecords = new Map<string, StaticImpostorAtlasRecord>();
  private readonly batches = new Map<string, StaticImpostorBatch>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    options: StaticImpostorSystemOptions = {},
  ) {
    this.textureProvider = options.textureProvider ?? new ThreeStaticImpostorTextureProvider();
    this.batchCapacity = options.batchCapacity ?? DEFAULT_BATCH_CAPACITY;
    this.archetypeOverrides = options.archetypes ?? {};
  }

  private resolveArchetype(modelPath: string): StaticImpostorArchetype | undefined {
    return this.archetypeOverrides[modelPath] ?? getStaticImpostorArchetype(modelPath);
  }

  registerInstance(params: {
    id: string;
    modelPath: string;
    object: THREE.Object3D;
  }): boolean {
    const archetype = this.resolveArchetype(params.modelPath);
    if (!archetype || !isStaticObjectSafeForImpostor(params.object)) {
      return false;
    }

    params.object.updateMatrixWorld(true);
    _bounds.setFromObject(params.object);
    if (!Number.isFinite(_bounds.min.x) || !Number.isFinite(_bounds.max.x)) {
      return false;
    }
    _bounds.getCenter(_center);
    _bounds.getSize(_size);
    params.object.getWorldQuaternion(_worldQuaternion);
    _worldEuler.setFromQuaternion(_worldQuaternion);

    tagStaticImpostorControlled(params.object, params.id);
    const instance: RegisteredStaticImpostorInstance = {
      id: params.id,
      modelPath: params.modelPath,
      archetype,
      object: params.object,
      center: _center.clone(),
      scale: new THREE.Vector2(
        Math.hypot(_size.x, _size.z) * archetype.planePaddingScale,
        Math.max(_size.y, 0.1) * archetype.planePaddingScale,
      ),
      yaw: _worldEuler.y,
      slot: null,
      state: 'mesh',
    };
    this.instances.set(params.id, instance);
    this.ensureAtlasLoading(archetype);
    return true;
  }

  unregisterInstance(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) {
      return;
    }
    this.restoreMesh(instance);
    if (instance.slot !== null) {
      this.batches.get(instance.archetype.slug)?.removeInstance(instance.slot);
    }
    this.instances.delete(id);
  }

  update(_deltaTime: number): void {
    for (const instance of this.instances.values()) {
      this.attachBatchIfReady(instance);
      this.updateInstanceRepresentation(instance);
    }
    for (const batch of this.batches.values()) {
      batch.update(this.camera);
    }
  }

  clear(): void {
    for (const id of [...this.instances.keys()]) {
      this.unregisterInstance(id);
    }
    for (const batch of this.batches.values()) {
      batch.dispose(this.scene);
    }
    this.batches.clear();
  }

  dispose(): void {
    this.clear();
    this.atlasRecords.clear();
  }

  getDebugInfo(): StaticImpostorDebugInfo {
    let activeImpostors = 0;
    let meshFallbacks = 0;
    for (const instance of this.instances.values()) {
      if (instance.state === 'impostor') {
        activeImpostors++;
      } else {
        meshFallbacks++;
      }
    }

    const atlasStates = [...this.atlasRecords.values()];
    const batches: StaticImpostorDebugInfo['batches'] = {};
    for (const [slug, batch] of this.batches) {
      batches[slug] = batch.getDebugInfo();
    }

    return {
      registeredInstances: this.instances.size,
      activeImpostors,
      meshFallbacks,
      atlasesReady: atlasStates.filter((record) => record.state === 'ready').length,
      atlasesLoading: atlasStates.filter((record) => record.state === 'loading').length,
      atlasesFailed: atlasStates.filter((record) => record.state === 'failed').length,
      batches,
    };
  }

  private ensureAtlasLoading(archetype: StaticImpostorArchetype): void {
    if (this.atlasRecords.has(archetype.slug)) {
      return;
    }

    const record: StaticImpostorAtlasRecord = { state: 'loading' };
    record.promise = this.textureProvider.loadAtlas(archetype)
      .then((atlas) => {
        record.state = 'ready';
        record.atlas = atlas;
        return atlas;
      })
      .catch((error: unknown) => {
        record.state = 'failed';
        record.error = error;
        Logger.warn('world', `Static impostor atlas failed for ${archetype.slug}`, error);
        throw error;
      });
    record.promise.catch(() => undefined);
    this.atlasRecords.set(archetype.slug, record);
  }

  private attachBatchIfReady(instance: RegisteredStaticImpostorInstance): void {
    if (instance.slot !== null) {
      return;
    }
    const record = this.atlasRecords.get(instance.archetype.slug);
    if (record?.state !== 'ready' || !record.atlas) {
      return;
    }
    let batch = this.batches.get(instance.archetype.slug);
    if (!batch) {
      batch = new StaticImpostorBatch(
        this.scene,
        instance.archetype,
        record.atlas,
        this.batchCapacity,
      );
      this.batches.set(instance.archetype.slug, batch);
    }
    instance.slot = batch.addInstance(instance);
  }

  private updateInstanceRepresentation(instance: RegisteredStaticImpostorInstance): void {
    const batch = this.batches.get(instance.archetype.slug);
    const atlasReady = this.atlasRecords.get(instance.archetype.slug)?.state === 'ready';
    const visibilityChainVisible = isAncestorVisibilityChainVisible(instance.object);
    if (!atlasReady || !batch || instance.slot === null || !visibilityChainVisible) {
      this.restoreMesh(instance);
      return;
    }

    const slot = instance.slot;
    const distance = this.camera.position.distanceTo(instance.center);
    if (instance.state === 'impostor') {
      if (distance <= instance.archetype.demotionDistanceMeters) {
        this.restoreMesh(instance);
      } else {
        batch.setActive(slot, true);
        instance.object.visible = false;
      }
      return;
    }

    if (distance >= instance.archetype.promotionDistanceMeters) {
      instance.object.visible = false;
      batch.setActive(slot, true);
      instance.state = 'impostor';
    } else {
      this.restoreMesh(instance);
    }
  }

  private restoreMesh(instance: RegisteredStaticImpostorInstance): void {
    if (instance.slot !== null) {
      this.batches.get(instance.archetype.slug)?.setActive(instance.slot, false);
    }
    instance.object.visible = true;
    instance.state = 'mesh';
  }
}

export function isStaticImpostorControlledMesh(mesh: THREE.Mesh): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    if (current.userData[STATIC_IMPOSTOR_CONTROLLED_KEY] === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function tagStaticImpostorControlled(root: THREE.Object3D, instanceId: string): void {
  root.userData[STATIC_IMPOSTOR_CONTROLLED_KEY] = true;
  root.userData.staticImpostorInstanceId = instanceId;
}

function isStaticObjectSafeForImpostor(root: THREE.Object3D): boolean {
  let safe = true;
  root.traverse((child) => {
    if (!safe) {
      return;
    }
    if (
      child instanceof THREE.SkinnedMesh
      || (child as THREE.Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh === true
    ) {
      safe = false;
      return;
    }
    if (child instanceof THREE.Mesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
      safe = false;
    }
  });
  return safe;
}

function isAncestorVisibilityChainVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}
