// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  getStaticImpostorArchetype,
  type StaticImpostorArchetype,
} from '../../../config/staticImpostorArchetypes';
import { Logger } from '../../../utils/Logger';
import type { StaticImpostorMaterialTuning, StaticImpostorMaterialTextures } from './StaticImpostorMaterial';
import { StaticImpostorBatch, type StaticImpostorBatchDebugInfo } from './StaticImpostorBatch';

type AtlasLoadState = 'loading' | 'ready' | 'failed';
type StaticImpostorRenderState = 'mesh' | 'blend-to-impostor' | 'impostor' | 'blend-to-mesh';

const STATIC_IMPOSTOR_CONTROLLED_KEY = '__staticImpostorControlled';
const DEFAULT_BATCH_CAPACITY = 256;
const DEFAULT_TRANSITION_FADE_METERS = 0;
const MAX_TRANSITION_FADE_METERS = 80;
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
  fadeMaterials: StaticImpostorFadeMaterialRecord[];
}

export interface StaticImpostorArchetypeDebugInfo {
  registeredInstances: number;
  activeImpostors: number;
  meshFallbacks: number;
  transitioningInstances: number;
  promotionDistanceMeters: number;
  demotionDistanceMeters: number;
  transitionFadeMeters: number;
  lightingProfile: StaticImpostorArchetype['lightingProfile'] | 'surface-normal';
  nearestDistanceMeters: number | null;
  farthestDistanceMeters: number | null;
  nearestMeshDistanceMeters: number | null;
  nearestImpostorDistanceMeters: number | null;
  nearestTransitionDistanceMeters: number | null;
}

export interface StaticImpostorDebugInfo {
  source: string;
  registeredInstances: number;
  activeImpostors: number;
  meshFallbacks: number;
  transitioningInstances: number;
  atlasesReady: number;
  atlasesLoading: number;
  atlasesFailed: number;
  archetypes: Record<string, StaticImpostorArchetypeDebugInfo>;
  batches: Record<string, StaticImpostorBatchDebugInfo>;
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
  /**
   * Debug/source label surfaced on batches and getDebugInfo(). It lets runtime
   * evidence distinguish vegetation-owned impostors from authored world props
   * without splitting the material implementation.
   */
  debugSource?: string;
  /**
   * Optional visual-review tuning for the material graph. Production callers
   * omit this so default impostor lighting/fog remains the shipped path.
   */
  materialTuning?: StaticImpostorMaterialTuning;
  /**
   * Width in meters over which the source mesh and impostor overlap during LOD
   * transitions. Defaults to 0 so existing authored static-prop impostors keep
   * their binary switch unless a caller opts in.
   */
  transitionFadeMeters?: number;
}

interface StaticImpostorMaterialBaseline {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

interface StaticImpostorFadeMaterialRecord {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  fadeMaterial: THREE.Material | THREE.Material[];
  baselines: StaticImpostorMaterialBaseline[];
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

export class StaticImpostorSystem {
  private readonly textureProvider: StaticImpostorTextureProvider;
  private readonly batchCapacity: number;
  private readonly archetypeOverrides: Readonly<Record<string, StaticImpostorArchetype>>;
  private readonly instances = new Map<string, RegisteredStaticImpostorInstance>();
  private readonly atlasRecords = new Map<string, StaticImpostorAtlasRecord>();
  private readonly batches = new Map<string, StaticImpostorBatch>();
  private readonly debugSource: string;
  private readonly materialTuning: StaticImpostorMaterialTuning | undefined;
  private readonly transitionFadeMeters: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    options: StaticImpostorSystemOptions = {},
  ) {
    this.textureProvider = options.textureProvider ?? new ThreeStaticImpostorTextureProvider();
    this.batchCapacity = options.batchCapacity ?? DEFAULT_BATCH_CAPACITY;
    this.archetypeOverrides = options.archetypes ?? {};
    this.debugSource = options.debugSource ?? 'world';
    this.materialTuning = options.materialTuning;
    this.transitionFadeMeters = clampNumber(
      options.transitionFadeMeters ?? DEFAULT_TRANSITION_FADE_METERS,
      0,
      MAX_TRANSITION_FADE_METERS,
    );
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
    const fadeMaterials = this.transitionFadeMeters > 0
      ? prepareStaticImpostorFadeMaterials(params.object)
      : [];
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
      fadeMaterials,
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
    disposeStaticImpostorFadeMaterials(instance.fadeMaterials);
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
    let transitioningInstances = 0;
    const archetypes: Record<string, StaticImpostorArchetypeDebugInfo> = {};
    for (const instance of this.instances.values()) {
      const slug = instance.archetype.slug;
      const distance = this.camera.position.distanceTo(instance.center);
      const isTransitioning = isStaticImpostorTransitionState(instance.state);
      const impostorVisible = instance.state === 'impostor' || isTransitioning;
      const entry = archetypes[slug] ?? {
        registeredInstances: 0,
        activeImpostors: 0,
        meshFallbacks: 0,
        transitioningInstances: 0,
        promotionDistanceMeters: instance.archetype.promotionDistanceMeters,
        demotionDistanceMeters: instance.archetype.demotionDistanceMeters,
        transitionFadeMeters: this.transitionFadeMeters,
        lightingProfile: instance.archetype.lightingProfile ?? 'surface-normal',
        nearestDistanceMeters: null,
        farthestDistanceMeters: null,
        nearestMeshDistanceMeters: null,
        nearestImpostorDistanceMeters: null,
        nearestTransitionDistanceMeters: null,
      };
      entry.registeredInstances++;
      entry.nearestDistanceMeters = entry.nearestDistanceMeters === null
        ? distance
        : Math.min(entry.nearestDistanceMeters, distance);
      entry.farthestDistanceMeters = entry.farthestDistanceMeters === null
        ? distance
        : Math.max(entry.farthestDistanceMeters, distance);
      if (impostorVisible) {
        activeImpostors++;
        entry.activeImpostors++;
        entry.nearestImpostorDistanceMeters = entry.nearestImpostorDistanceMeters === null
          ? distance
          : Math.min(entry.nearestImpostorDistanceMeters, distance);
      }
      if (isTransitioning) {
        transitioningInstances++;
        entry.transitioningInstances++;
        entry.nearestTransitionDistanceMeters = entry.nearestTransitionDistanceMeters === null
          ? distance
          : Math.min(entry.nearestTransitionDistanceMeters, distance);
      } else if (instance.state === 'mesh') {
        meshFallbacks++;
        entry.meshFallbacks++;
        entry.nearestMeshDistanceMeters = entry.nearestMeshDistanceMeters === null
          ? distance
          : Math.min(entry.nearestMeshDistanceMeters, distance);
      }
      archetypes[slug] = entry;
    }

    const atlasStates = [...this.atlasRecords.values()];
    const batches: StaticImpostorDebugInfo['batches'] = {};
    for (const [slug, batch] of this.batches) {
      batches[slug] = batch.getDebugInfo();
    }

    return {
      source: this.debugSource,
      registeredInstances: this.instances.size,
      activeImpostors,
      meshFallbacks,
      transitioningInstances,
      atlasesReady: atlasStates.filter((record) => record.state === 'ready').length,
      atlasesLoading: atlasStates.filter((record) => record.state === 'loading').length,
      atlasesFailed: atlasStates.filter((record) => record.state === 'failed').length,
      archetypes,
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
        this.debugSource,
        this.transitionFadeMeters,
        this.materialTuning,
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

    const distance = this.camera.position.distanceTo(instance.center);
    const fade = this.transitionFadeMeters;
    if (instance.state === 'impostor' || instance.state === 'blend-to-mesh') {
      if (fade > 0 && distance <= instance.archetype.demotionDistanceMeters) {
        const meshOpacity = clampNumber(
          (instance.archetype.demotionDistanceMeters - distance) / fade,
          0,
          1,
        );
        if (meshOpacity >= 0.999) {
          this.restoreMesh(instance);
        } else {
          this.applyBlend(instance, 1 - meshOpacity, meshOpacity, 'blend-to-mesh');
        }
      } else if (distance <= instance.archetype.demotionDistanceMeters) {
        this.restoreMesh(instance);
      } else {
        this.applyImpostor(instance);
      }
      return;
    }

    if (distance >= instance.archetype.promotionDistanceMeters) {
      if (fade > 0) {
        const impostorOpacity = clampNumber(
          (distance - instance.archetype.promotionDistanceMeters) / fade,
          0,
          1,
        );
        if (impostorOpacity >= 0.999) {
          this.applyImpostor(instance);
        } else {
          this.applyBlend(instance, impostorOpacity, 1 - impostorOpacity, 'blend-to-impostor');
        }
      } else {
        this.applyImpostor(instance);
      }
    } else {
      this.restoreMesh(instance);
    }
  }

  private applyImpostor(instance: RegisteredStaticImpostorInstance): void {
    if (instance.slot !== null) {
      this.batches.get(instance.archetype.slug)?.setOpacity(instance.slot, 1);
    }
    setStaticImpostorMeshFadeOpacity(instance.fadeMaterials, 1);
    instance.object.visible = false;
    instance.state = 'impostor';
  }

  private applyBlend(
    instance: RegisteredStaticImpostorInstance,
    impostorOpacity: number,
    meshOpacity: number,
    state: Extract<StaticImpostorRenderState, 'blend-to-impostor' | 'blend-to-mesh'>,
  ): void {
    if (instance.slot !== null) {
      this.batches.get(instance.archetype.slug)?.setOpacity(instance.slot, impostorOpacity);
    }
    instance.object.visible = true;
    setStaticImpostorMeshFadeOpacity(instance.fadeMaterials, meshOpacity);
    instance.state = state;
  }

  private restoreMesh(instance: RegisteredStaticImpostorInstance): void {
    if (instance.slot !== null) {
      this.batches.get(instance.archetype.slug)?.setOpacity(instance.slot, 0);
    }
    setStaticImpostorMeshFadeOpacity(instance.fadeMaterials, 1);
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

function isStaticImpostorTransitionState(state: StaticImpostorRenderState): boolean {
  return state === 'blend-to-impostor' || state === 'blend-to-mesh';
}

function prepareStaticImpostorFadeMaterials(root: THREE.Object3D): StaticImpostorFadeMaterialRecord[] {
  const records: StaticImpostorFadeMaterialRecord[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const originalMaterial = child.material;
    const originalArray = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
    const fadeArray = originalArray.map((material) => material.clone());
    const baselines = fadeArray.map((material) => ({
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    }));
    child.material = Array.isArray(originalMaterial) ? fadeArray : fadeArray[0];
    records.push({
      mesh: child,
      originalMaterial,
      fadeMaterial: child.material,
      baselines,
    });
  });
  return records;
}

function setStaticImpostorMeshFadeOpacity(
  records: readonly StaticImpostorFadeMaterialRecord[],
  opacity: number,
): void {
  const fade = clampNumber(opacity, 0, 1);
  for (const record of records) {
    const materials = Array.isArray(record.fadeMaterial) ? record.fadeMaterial : [record.fadeMaterial];
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i];
      const baseline = record.baselines[i];
      if (!baseline) continue;
      material.opacity = baseline.opacity * fade;
      material.transparent = fade < 0.999 ? true : baseline.transparent;
      material.depthWrite = fade < 0.999 ? false : baseline.depthWrite;
      material.needsUpdate = true;
    }
  }
}

function disposeStaticImpostorFadeMaterials(records: readonly StaticImpostorFadeMaterialRecord[]): void {
  for (const record of records) {
    record.mesh.material = record.originalMaterial;
    const materials = Array.isArray(record.fadeMaterial) ? record.fadeMaterial : [record.fadeMaterial];
    for (const material of materials) {
      material.dispose();
    }
  }
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
