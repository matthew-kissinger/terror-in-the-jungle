import * as THREE from 'three';
import {
  getModelPlacementProfile,
  type ExpectedModelDimensions,
  type ModelPlacementProfile,
} from './ModelPlacementProfiles';

const _bounds = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

interface PreparedModelPlacement {
  profile: ModelPlacementProfile;
  bounds: THREE.Box3;
  size: THREE.Vector3;
}

export function prepareModelForPlacement(root: THREE.Object3D, modelPath: string): PreparedModelPlacement {
  const profile = getModelPlacementProfile(modelPath);
  normalizeModel(root, profile);
  const bounds = computeWorldBounds(root);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    profile,
    bounds,
    size,
  };
}

function computeWorldBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function normalizeModel(root: THREE.Object3D, profile: ModelPlacementProfile): void {
  applyExpectedScale(root, profile);
  recenterAndGround(root, profile);
}

function applyExpectedScale(root: THREE.Object3D, profile: ModelPlacementProfile): void {
  if (!profile.expectedDimensions || profile.normalizeBy === 'none') {
    return;
  }

  const bounds = computeWorldBounds(root);
  const currentSize = bounds.getSize(new THREE.Vector3());
  const target = pickTargetDimension(profile.expectedDimensions, profile.normalizeBy);
  const current = pickCurrentDimension(currentSize, profile.normalizeBy);

  if (!(target > 0) || !(current > 0.0001)) {
    return;
  }

  const scale = target / current;
  root.scale.multiplyScalar(scale);
}

function recenterAndGround(root: THREE.Object3D, profile: ModelPlacementProfile): void {
  if (profile.groundingMode !== 'bounds_center_bottom') {
    return;
  }

  const bounds = computeWorldBounds(root);
  bounds.getCenter(_center);
  bounds.getSize(_size);

  root.position.x -= _center.x;
  root.position.z -= _center.z;
  root.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);
}

function pickTargetDimension(expected: ExpectedModelDimensions, normalizeBy: ModelPlacementProfile['normalizeBy']): number {
  switch (normalizeBy) {
    case 'height':
      return expected.height;
    case 'width':
      return expected.width;
    case 'depth':
      return expected.depth;
    case 'none':
    default:
      return 0;
  }
}

function pickCurrentDimension(size: THREE.Vector3, normalizeBy: ModelPlacementProfile['normalizeBy']): number {
  switch (normalizeBy) {
    case 'height':
      return size.y;
    case 'width':
      return size.x;
    case 'depth':
      return size.z;
    case 'none':
    default:
      return 0;
  }
}
