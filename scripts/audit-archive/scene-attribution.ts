export type SceneAttributionEntry = {
  category: string;
  objects: number;
  visibleObjects: number;
  meshes: number;
  visibleMeshes: number;
  instancedMeshes: number;
  visibleInstancedMeshes: number;
  drawCallLike: number;
  visibleDrawCallLike: number;
  instances: number;
  visibleInstances: number;
  triangles: number;
  visibleTriangles: number;
  materials: number;
  geometries: number;
  examples?: Array<{
    nameChain: string;
    type: string;
    modelPath: string | null;
    materialType: string | null;
    triangles: number;
    instances: number;
    effectivelyVisible: boolean;
  }>;
  visibleExamples?: Array<{
    nameChain: string;
    type: string;
    modelPath: string | null;
    materialType: string | null;
    triangles: number;
    instances: number;
  }>;
};

export const PROJEKT_143_REQUIRED_SCENE_CATEGORIES = [
  'world_static_features',
  'fixed_wing_aircraft',
  'helicopters',
  'vegetation_imposters',
  'npc_imposters',
  'npc_close_glb',
] as const;

export type Projekt143RequiredSceneCategory = typeof PROJEKT_143_REQUIRED_SCENE_CATEGORIES[number];

export const PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE = String.raw`
(() => {
  const renderer = window.__renderer;
  const engine = window.__engine;
  const scene = renderer?.scene ?? engine?.renderer?.scene;
  if (!scene?.traverse) return null;

  const buckets = new Map();
  const materialArray = (material) => Array.isArray(material)
    ? material
    : material
      ? [material]
      : [];
  const getBucket = (category) => {
    let bucket = buckets.get(category);
    if (!bucket) {
      bucket = {
        category,
        objects: 0,
        visibleObjects: 0,
        meshes: 0,
        visibleMeshes: 0,
        instancedMeshes: 0,
        visibleInstancedMeshes: 0,
        drawCallLike: 0,
        visibleDrawCallLike: 0,
        instances: 0,
        visibleInstances: 0,
        triangles: 0,
        visibleTriangles: 0,
        materials: new Set(),
        geometries: new Set(),
        examples: [],
        visibleExamples: []
      };
      buckets.set(category, bucket);
    }
    return bucket;
  };
  const modelPathFor = (object) => {
    let current = object;
    while (current) {
      const path = current.userData?.modelPath;
      if (typeof path === 'string' && path.length > 0) return path.toLowerCase();
      current = current.parent;
    }
    return '';
  };
  const nameChainFor = (object) => {
    const names = [];
    let current = object;
    while (current && names.length < 6) {
      if (typeof current.name === 'string' && current.name.length > 0) names.push(current.name.toLowerCase());
      current = current.parent;
    }
    return names.join('/');
  };
  const categoryFor = (object) => {
    let current = object;
    while (current) {
      const category = current.userData?.perfCategory;
      if (typeof category === 'string' && category.length > 0) return category;
      current = current.parent;
    }
    const modelPath = modelPathFor(object);
    const names = nameChainFor(object);
    const uniforms = materialArray(object.material).map((material) => material?.uniforms ?? {});
    const hasUniform = (name) => uniforms.some((uniform) => Object.prototype.hasOwnProperty.call(uniform, name));
    if (names.includes('cdlodterrain')) return 'terrain';
    if (names.includes('hosekwilkieskydome') || names.includes('cloudlayer')) return 'atmosphere';
    if (hasUniform('waterColor') || hasUniform('distortionScale')) return 'water';
    if (hasUniform('vegetationExposure') || hasUniform('imposterAtlasEnabled')) return 'vegetation_imposters';
    if (hasUniform('npcExposure') || hasUniform('clipDuration')) return 'npc_imposters';
    if (modelPath.includes('npcs/pixel-forge')) return 'npc_close_glb';
    if (modelPath.includes('vehicles/aircraft/uh1') || modelPath.includes('vehicles/aircraft/ah1') || modelPath.includes('huey') || modelPath.includes('cobra')) return 'helicopters';
    if (modelPath.includes('vehicles/aircraft')) return 'fixed_wing_aircraft';
    if (modelPath.includes('buildings/') || modelPath.includes('structures/') || modelPath.includes('props/')) return 'world_static_features';
    if (modelPath.includes('weapons/')) return 'weapons';
    if (names.includes('hitboxdebug')) return 'debug_overlays';
    return 'unattributed';
  };
  const triangleCountFor = (geometry) => {
    if (!geometry) return 0;
    const indexCount = Number(geometry.index?.count ?? 0);
    if (indexCount > 0) return indexCount / 3;
    const positionCount = Number(geometry.attributes?.position?.count ?? 0);
    return positionCount > 0 ? positionCount / 3 : 0;
  };
  const instanceCountFor = (object) => {
    if (object.isInstancedMesh) return Math.max(0, Number(object.count ?? 0));
    const instanceCount = Number(object.geometry?.instanceCount ?? 0);
    return Number.isFinite(instanceCount) && instanceCount > 0 ? instanceCount : 1;
  };
  const isEffectivelyVisible = (object) => {
    let current = object;
    while (current) {
      if (current.visible === false) return false;
      current = current.parent;
    }
    return true;
  };
  const materialLabelFor = (object) => {
    const material = materialArray(object.material)[0];
    if (!material) return null;
    return typeof material.type === 'string' && material.type.length > 0
      ? material.type
      : typeof material.name === 'string' && material.name.length > 0
        ? material.name
        : null;
  };

  scene.traverse((object) => {
    const category = categoryFor(object);
    const bucket = getBucket(category);
    const effectivelyVisible = isEffectivelyVisible(object);
    bucket.objects += 1;
    if (effectivelyVisible) bucket.visibleObjects += 1;
    if (!object.isMesh) return;

    const materials = materialArray(object.material);
    const materialCount = Math.max(1, materials.length);
    const instances = instanceCountFor(object);
    const baseTriangles = triangleCountFor(object.geometry);
    const triangles = Math.round(baseTriangles * (object.isInstancedMesh ? instances : Math.max(1, instances)));
    bucket.meshes += 1;
    if (object.isInstancedMesh) bucket.instancedMeshes += 1;
    bucket.drawCallLike += materialCount;
    bucket.instances += instances;
    bucket.triangles += triangles;
    if (effectivelyVisible) {
      bucket.visibleMeshes += 1;
      if (object.isInstancedMesh) bucket.visibleInstancedMeshes += 1;
      bucket.visibleDrawCallLike += materialCount;
      bucket.visibleInstances += instances;
      bucket.visibleTriangles += triangles;
    }
    if (object.geometry) bucket.geometries.add(object.geometry);
    for (const material of materials) bucket.materials.add(material);
    if (bucket.examples.length < 8) {
      const example = {
        nameChain: nameChainFor(object) || '(unnamed)',
        type: object.type || 'Object3D',
        modelPath: modelPathFor(object) || null,
        materialType: materialLabelFor(object),
        triangles,
        instances,
        effectivelyVisible
      };
      bucket.examples.push(example);
    }
    if (effectivelyVisible && bucket.visibleExamples.length < 8) {
      bucket.visibleExamples.push({
        nameChain: nameChainFor(object) || '(unnamed)',
        type: object.type || 'Object3D',
        modelPath: modelPathFor(object) || null,
        materialType: materialLabelFor(object),
        triangles,
        instances
      });
    }
  });

  return Array.from(buckets.values())
    .map((bucket) => ({
      category: bucket.category,
      objects: bucket.objects,
      visibleObjects: bucket.visibleObjects,
      meshes: bucket.meshes,
      visibleMeshes: bucket.visibleMeshes,
      instancedMeshes: bucket.instancedMeshes,
      visibleInstancedMeshes: bucket.visibleInstancedMeshes,
      drawCallLike: bucket.drawCallLike,
      visibleDrawCallLike: bucket.visibleDrawCallLike,
      instances: bucket.instances,
      visibleInstances: bucket.visibleInstances,
      triangles: bucket.triangles,
      visibleTriangles: bucket.visibleTriangles,
      materials: bucket.materials.size,
      geometries: bucket.geometries.size,
      examples: bucket.examples,
      visibleExamples: bucket.visibleExamples
    }))
    .sort((a, b) => b.visibleTriangles - a.visibleTriangles || b.drawCallLike - a.drawCallLike);
})()
`;

export const PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE = String.raw`
(() => {
  const globalScope = window;
  if (globalScope.__projekt143RenderSubmissionAttribution?.install) {
    return globalScope.__projekt143RenderSubmissionAttribution.install();
  }

  const materialArray = (material) => Array.isArray(material)
    ? material
    : material
      ? [material]
      : [];
  const modelPathFor = (object) => {
    let current = object;
    while (current) {
      const path = current.userData?.modelPath;
      if (typeof path === 'string' && path.length > 0) return path.toLowerCase();
      current = current.parent;
    }
    return '';
  };
  const nameChainFor = (object) => {
    const names = [];
    let current = object;
    while (current && names.length < 6) {
      if (typeof current.name === 'string' && current.name.length > 0) names.push(current.name.toLowerCase());
      current = current.parent;
    }
    return names.join('/');
  };
  const categoryFor = (object, material) => {
    let current = object;
    while (current) {
      const category = current.userData?.perfCategory;
      if (typeof category === 'string' && category.length > 0) return category;
      current = current.parent;
    }
    const modelPath = modelPathFor(object);
    const names = nameChainFor(object);
    const uniforms = materialArray(material ?? object.material).map((item) => item?.uniforms ?? {});
    const hasUniform = (name) => uniforms.some((uniform) => Object.prototype.hasOwnProperty.call(uniform, name));
    if (names.includes('cdlodterrain')) return 'terrain';
    if (names.includes('hosekwilkieskydome') || names.includes('cloudlayer')) return 'atmosphere';
    if (hasUniform('waterColor') || hasUniform('distortionScale')) return 'water';
    if (hasUniform('vegetationExposure') || hasUniform('imposterAtlasEnabled')) return 'vegetation_imposters';
    if (hasUniform('npcExposure') || hasUniform('clipDuration')) return 'npc_imposters';
    if (modelPath.includes('npcs/pixel-forge')) return 'npc_close_glb';
    if (modelPath.includes('vehicles/aircraft/uh1') || modelPath.includes('vehicles/aircraft/ah1') || modelPath.includes('huey') || modelPath.includes('cobra')) return 'helicopters';
    if (modelPath.includes('vehicles/aircraft')) return 'fixed_wing_aircraft';
    if (modelPath.includes('buildings/') || modelPath.includes('structures/') || modelPath.includes('props/')) return 'world_static_features';
    if (modelPath.includes('weapons/')) return 'weapons';
    if (names.includes('hitboxdebug')) return 'debug_overlays';
    return 'unattributed';
  };
  const triangleCountFor = (geometry, group) => {
    if (!geometry) return 0;
    const groupCount = Number(group?.count ?? 0);
    if (Number.isFinite(groupCount) && groupCount > 0) return groupCount / 3;
    const indexCount = Number(geometry.index?.count ?? 0);
    if (indexCount > 0) return indexCount / 3;
    const positionCount = Number(geometry.attributes?.position?.count ?? 0);
    return positionCount > 0 ? positionCount / 3 : 0;
  };
  const instanceCountFor = (object, geometry) => {
    if (object.isInstancedMesh) return Math.max(0, Number(object.count ?? 0));
    const instanceCount = Number(geometry?.instanceCount ?? object.geometry?.instanceCount ?? 0);
    return Number.isFinite(instanceCount) && instanceCount > 0 ? instanceCount : 1;
  };
  const materialLabelFor = (material) => {
    if (!material) return null;
    return typeof material.type === 'string' && material.type.length > 0
      ? material.type
      : typeof material.name === 'string' && material.name.length > 0
        ? material.name
        : null;
  };
  const readFrameCount = () => {
    const directFrameCount = Number(globalScope.__metrics?.frameCount ?? NaN);
    if (Number.isFinite(directFrameCount)) return Math.max(0, Math.floor(directFrameCount));
    const snapshot = globalScope.__metrics?.getSnapshot?.();
    const frameCount = Number(snapshot?.frameCount ?? 0);
    return Number.isFinite(frameCount) ? Math.max(0, Math.floor(frameCount)) : 0;
  };
  const addMetricEventFrames = (snapshot, target) => {
    const events = Array.isArray(snapshot?.frameEvents) ? snapshot.frameEvents : [];
    for (const event of events) {
      const frameCount = Number(event?.frameCount ?? -1);
      if (Number.isFinite(frameCount) && frameCount >= 0) target.add(Math.floor(frameCount));
    }
  };
  const getBucket = (map, category) => {
    let bucket = map.get(category);
    if (!bucket) {
      bucket = {
        category,
        drawSubmissions: 0,
        triangles: 0,
        instances: 0,
        meshes: 0,
        materials: new Set(),
        geometries: new Set(),
        passTypes: new Map(),
        examples: []
      };
      map.set(category, bucket);
    }
    return bucket;
  };
  const normalizePassType = (passType) => {
    return typeof passType === 'string' && passType.length > 0 ? passType : 'unknown';
  };
  const incrementPassType = (passTypes, passType) => {
    const normalized = normalizePassType(passType);
    passTypes.set(normalized, (passTypes.get(normalized) ?? 0) + 1);
    return normalized;
  };
  const serializePassTypes = (passTypes) => {
    return Object.fromEntries(
      Array.from(passTypes.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    );
  };
  const serializeBucket = (bucket, includeExamples = true) => {
    const serialized = {
      category: bucket.category,
      drawSubmissions: bucket.drawSubmissions,
      triangles: bucket.triangles,
      instances: bucket.instances,
      meshes: bucket.meshes,
      materials: bucket.materials.size,
      geometries: bucket.geometries.size,
      passTypes: serializePassTypes(bucket.passTypes)
    };
    if (includeExamples) serialized.examples = bucket.examples;
    return serialized;
  };
  const serializeFrame = (frame, includeExamples = true) => ({
    frameCount: frame.frameCount,
    firstAtMs: frame.firstAtMs,
    lastAtMs: frame.lastAtMs,
    drawSubmissions: frame.drawSubmissions,
    triangles: frame.triangles,
    instances: frame.instances,
    passTypes: serializePassTypes(frame.passTypes),
    categories: Array.from(frame.categories.values())
      .map((bucket) => serializeBucket(bucket, includeExamples))
      .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
  });
  const selectFramesForExport = (frames) => {
    if (frames.length <= 160) return frames;
    const selected = new Set();
    const add = (frame) => {
      if (frame) selected.add(frame);
    };
    add(frames[0]);
    add(frames[frames.length - 1]);
    for (const frame of frames) {
      if (state.interestingFrameCounts.has(frame.frameCount)) add(frame);
    }
    [...frames]
      .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
      .slice(0, 48)
      .forEach(add);
    [...frames]
      .sort((a, b) => b.triangles - a.triangles || b.drawSubmissions - a.drawSubmissions)
      .slice(0, 48)
      .forEach(add);
    [...frames]
      .sort((a, b) => b.instances - a.instances || b.drawSubmissions - a.drawSubmissions)
      .slice(0, 24)
      .forEach(add);
    return [...selected].sort((a, b) => a.frameCount - b.frameCount).slice(0, 160);
  };
  const selectFramesForSummary = (frames) => {
    const selected = new Set();
    const add = (frame) => {
      if (frame) selected.add(frame);
    };
    add(frames[0]);
    add(frames[frames.length - 1]);
    for (const frame of frames) {
      if (state.interestingFrameCounts.has(frame.frameCount)) add(frame);
    }
    [...frames]
      .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
      .slice(0, 4)
      .forEach(add);
    [...frames]
      .sort((a, b) => b.triangles - a.triangles || b.drawSubmissions - a.drawSubmissions)
      .slice(0, 4)
      .forEach(add);
    [...frames]
      .sort((a, b) => b.instances - a.instances || b.drawSubmissions - a.drawSubmissions)
      .slice(0, 2)
      .forEach(add);
    return [...selected].sort((a, b) => a.frameCount - b.frameCount).slice(0, 16);
  };

  const state = {
    installed: new WeakSet(),
    installedCount: 0,
    installPasses: 0,
    errors: [],
    frames: new Map(),
    totals: new Map(),
    interestingFrameCounts: new Set(),
    lastEventScanFrameCount: -1,
    record(object, geometry, material, group, passType = 'main') {
      const category = categoryFor(object, material);
      const instances = instanceCountFor(object, geometry);
      const triangles = Math.round(triangleCountFor(geometry, group) * Math.max(1, instances));
      const frameCount = readFrameCount();
      if (frameCount !== state.lastEventScanFrameCount) {
        addMetricEventFrames(globalScope.__metrics?.getSnapshot?.(), state.interestingFrameCounts);
        state.lastEventScanFrameCount = frameCount;
      }
      const now = performance.now();
      let frame = state.frames.get(frameCount);
      if (!frame) {
        frame = {
          frameCount,
          firstAtMs: now,
          lastAtMs: now,
          drawSubmissions: 0,
          triangles: 0,
          instances: 0,
          passTypes: new Map(),
          categories: new Map()
        };
        state.frames.set(frameCount, frame);
      }
      frame.lastAtMs = now;
      frame.drawSubmissions += 1;
      frame.triangles += triangles;
      frame.instances += instances;
      const normalizedPassType = incrementPassType(frame.passTypes, passType);
      const frameBucket = getBucket(frame.categories, category);
      frameBucket.drawSubmissions += 1;
      frameBucket.triangles += triangles;
      frameBucket.instances += instances;
      frameBucket.meshes += 1;
      if (material) frameBucket.materials.add(material);
      if (geometry) frameBucket.geometries.add(geometry);
      incrementPassType(frameBucket.passTypes, normalizedPassType);
      if (frameBucket.examples.length < 4) {
        frameBucket.examples.push({
          nameChain: nameChainFor(object) || '(unnamed)',
          type: object.type || 'Object3D',
          modelPath: modelPathFor(object) || null,
          materialType: materialLabelFor(material),
          passType: normalizedPassType,
          triangles,
          instances
        });
      }

      const totalBucket = getBucket(state.totals, category);
      totalBucket.drawSubmissions += 1;
      totalBucket.triangles += triangles;
      totalBucket.instances += instances;
      totalBucket.meshes += 1;
      if (material) totalBucket.materials.add(material);
      if (geometry) totalBucket.geometries.add(geometry);
      incrementPassType(totalBucket.passTypes, normalizedPassType);
      if (totalBucket.examples.length < 4 && frameBucket.examples.length > 0) {
        totalBucket.examples.push(frameBucket.examples[frameBucket.examples.length - 1]);
      }
    },
    install() {
      const renderer = globalScope.__renderer;
      const engine = globalScope.__engine;
      const scene = renderer?.scene ?? engine?.renderer?.scene;
      if (!scene?.traverse) {
        return { installed: false, installedCount: state.installedCount, installPasses: state.installPasses, error: 'scene_unavailable' };
      }
      state.installPasses += 1;
      let newlyInstalled = 0;
      scene.traverse((object) => {
        if (!object?.isMesh || state.installed.has(object)) return;
        state.installed.add(object);
        newlyInstalled += 1;
        state.installedCount += 1;
        const original = typeof object.onBeforeRender === 'function'
          ? object.onBeforeRender
          : null;
        const originalShadow = typeof object.onBeforeShadow === 'function'
          ? object.onBeforeShadow
          : null;
        object.onBeforeRender = function(...args) {
          try {
            const geometry = args[3] ?? this.geometry;
            const material = args[4] ?? this.material;
            const group = args[5] ?? null;
            state.record(this, geometry, material, group, 'main');
          } catch (error) {
            if (state.errors.length < 12) {
              state.errors.push(error instanceof Error ? error.message : String(error));
            }
          }
          if (original) {
            return original.apply(this, args);
          }
          return undefined;
        };
        object.onBeforeShadow = function(...args) {
          try {
            const geometry = args[4] ?? this.geometry;
            const material = args[5] ?? this.material;
            const group = args[6] ?? null;
            state.record(this, geometry, material, group, 'shadow');
          } catch (error) {
            if (state.errors.length < 12) {
              state.errors.push(error instanceof Error ? error.message : String(error));
            }
          }
          if (originalShadow) {
            return originalShadow.apply(this, args);
          }
          return undefined;
        };
      });
      return {
        installed: true,
        installedCount: state.installedCount,
        newlyInstalled,
        installPasses: state.installPasses,
        errors: state.errors.slice()
      };
    },
    reset() {
      state.frames.clear();
      state.totals.clear();
      state.interestingFrameCounts.clear();
      state.lastEventScanFrameCount = -1;
      state.errors = [];
      return state.install();
    },
    drain() {
      state.install();
      addMetricEventFrames(globalScope.__metrics?.getSnapshot?.(), state.interestingFrameCounts);
      const rawFrames = Array.from(state.frames.values())
        .sort((a, b) => a.frameCount - b.frameCount);
      const frames = selectFramesForExport(rawFrames)
        .map(serializeFrame)
        .sort((a, b) => a.frameCount - b.frameCount);
      const totals = Array.from(state.totals.values())
        .map((bucket) => serializeBucket(bucket, true))
        .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles);
      const result = {
        installedCount: state.installedCount,
        installPasses: state.installPasses,
        frameCountStart: frames[0]?.frameCount ?? null,
        frameCountEnd: frames[frames.length - 1]?.frameCount ?? null,
        frames,
        totals,
        errors: state.errors.slice()
      };
      state.frames.clear();
      state.totals.clear();
      state.interestingFrameCounts.clear();
      state.lastEventScanFrameCount = -1;
      state.errors = [];
      return result;
    },
    drainSummary() {
      state.install();
      addMetricEventFrames(globalScope.__metrics?.getSnapshot?.(), state.interestingFrameCounts);
      const rawFrames = Array.from(state.frames.values())
        .sort((a, b) => a.frameCount - b.frameCount);
      const frames = selectFramesForSummary(rawFrames)
        .map((frame) => serializeFrame(frame, false))
        .sort((a, b) => a.frameCount - b.frameCount);
      const totals = Array.from(state.totals.values())
        .map((bucket) => serializeBucket(bucket, false))
        .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles);
      const result = {
        mode: 'summary',
        installedCount: state.installedCount,
        installPasses: state.installPasses,
        rawFrameCount: rawFrames.length,
        frameCountStart: rawFrames[0]?.frameCount ?? null,
        frameCountEnd: rawFrames[rawFrames.length - 1]?.frameCount ?? null,
        frames,
        totals,
        errors: state.errors.slice()
      };
      state.frames.clear();
      state.totals.clear();
      state.interestingFrameCounts.clear();
      state.lastEventScanFrameCount = -1;
      state.errors = [];
      return result;
    }
  };

  globalScope.__projekt143RenderSubmissionAttribution = state;
  return state.install();
})()
`;

export const PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_RESET_SOURCE = String.raw`
(() => {
  const tracker = window.__projekt143RenderSubmissionAttribution;
  if (!tracker?.reset) return { installed: false, error: 'render_submission_tracker_not_installed' };
  return tracker.reset();
})()
`;
