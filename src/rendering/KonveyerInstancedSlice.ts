import * as THREE from 'three';
import {
  createAlphaTextureNodeMaterial,
  type AlphaTextureNodeMaterialOptions,
  type KonveyerNodeMaterial,
  type KonveyerTslSurface,
} from '../core/TslMaterialFactory';

export type KonveyerInstancedSliceSurface = Extract<
  KonveyerTslSurface,
  'vegetation-billboard' | 'combatant-impostor' | 'effect-particle'
>;

export interface KonveyerInstancedSliceConfig {
  surface: KonveyerInstancedSliceSurface;
  maxInstances: number;
  width: number;
  height: number;
  texture: THREE.Texture;
  alphaTest?: number;
  materialName?: string;
}

export interface KonveyerInstancedSlice {
  surface: KonveyerInstancedSliceSurface;
  geometry: THREE.PlaneGeometry;
  material: KonveyerNodeMaterial;
  mesh: THREE.InstancedMesh;
}

export interface KonveyerInstancedSliceMetrics {
  surface: KonveyerInstancedSliceSurface;
  maxInstances: number;
  activeInstances: number;
  geometryAttributeBytes: number;
  geometryIndexBytes: number;
  instanceMatrixBytes: number;
  estimatedGpuWritableBytes: number;
  nodeMaterial: boolean;
  materialType: string;
  shaderStringCount: number;
  drawCallUpperBound: number;
}

const matrixScratch = new THREE.Matrix4();
const rotationScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3(1, 1, 1);
const positionScratch = new THREE.Vector3();

export async function createTslInstancedImposterSlice(
  config: KonveyerInstancedSliceConfig,
): Promise<KonveyerInstancedSlice> {
  const materialOptions: AlphaTextureNodeMaterialOptions = {
    texture: config.texture,
    alphaTest: config.alphaTest,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    name: config.materialName ?? `konveyer-${config.surface}-node-material`,
  };
  const material = await createAlphaTextureNodeMaterial(materialOptions);
  const geometry = new THREE.PlaneGeometry(config.width, config.height);
  const mesh = new THREE.InstancedMesh(geometry, material, config.maxInstances);
  mesh.name = `konveyer-${config.surface}-tsl-slice`;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;

  return {
    surface: config.surface,
    geometry,
    material,
    mesh,
  };
}

export function populateKonveyerSliceMatrices(
  slice: KonveyerInstancedSlice,
  activeInstances: number,
  spacing = 3,
): void {
  const cappedCount = Math.min(activeInstances, slice.mesh.instanceMatrix.count);
  const columns = Math.max(1, Math.ceil(Math.sqrt(cappedCount)));

  for (let index = 0; index < cappedCount; index++) {
    const x = (index % columns) * spacing;
    const z = Math.floor(index / columns) * spacing;
    positionScratch.set(x, 0, z);
    rotationScratch.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (index % 16) * (Math.PI / 8));
    scaleScratch.setScalar(1 + (index % 5) * 0.08);
    matrixScratch.compose(positionScratch, rotationScratch, scaleScratch);
    slice.mesh.setMatrixAt(index, matrixScratch);
  }

  slice.mesh.count = cappedCount;
  slice.mesh.instanceMatrix.needsUpdate = true;
}

export function measureKonveyerInstancedSlice(
  slice: KonveyerInstancedSlice,
): KonveyerInstancedSliceMetrics {
  const geometryAttributeBytes = Object.values(slice.geometry.attributes)
    .reduce((total, attribute) => total + attribute.array.byteLength, 0);
  const geometryIndexBytes = slice.geometry.index?.array.byteLength ?? 0;
  const instanceMatrixBytes = slice.mesh.instanceMatrix.array.byteLength;
  const estimatedGpuWritableBytes = geometryAttributeBytes + geometryIndexBytes + instanceMatrixBytes;

  return {
    surface: slice.surface,
    maxInstances: slice.mesh.instanceMatrix.count,
    activeInstances: slice.mesh.count,
    geometryAttributeBytes,
    geometryIndexBytes,
    instanceMatrixBytes,
    estimatedGpuWritableBytes,
    nodeMaterial: slice.material.isNodeMaterial === true,
    materialType: slice.material.type,
    shaderStringCount: 0,
    drawCallUpperBound: slice.mesh.count > 0 ? 1 : 0,
  };
}

export function disposeKonveyerInstancedSlice(slice: KonveyerInstancedSlice): void {
  slice.geometry.dispose();
  slice.material.dispose();
}
