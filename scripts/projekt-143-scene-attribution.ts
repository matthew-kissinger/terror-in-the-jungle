export type SceneAttributionEntry = {
  category: string;
  objects: number;
  visibleObjects: number;
  meshes: number;
  instancedMeshes: number;
  drawCallLike: number;
  instances: number;
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
        instancedMeshes: 0,
        drawCallLike: 0,
        instances: 0,
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
    if (effectivelyVisible) bucket.visibleTriangles += triangles;
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
      instancedMeshes: bucket.instancedMeshes,
      drawCallLike: bucket.drawCallLike,
      instances: bucket.instances,
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
