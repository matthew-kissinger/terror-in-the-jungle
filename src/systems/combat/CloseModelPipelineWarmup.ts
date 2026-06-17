// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

const WARMUP_DISTANCE_METERS = 12;
const WARMUP_SPACING_METERS = 2.25;
const WARMUP_MAX_COLUMNS = 10;

export interface CloseModelPipelineWarmupHandle {
  count: number;
  poolCounts: Record<string, number>;
  restore(): void;
}

interface CloseModelPipelineWarmupInstance {
  root: THREE.Group;
  poolKey: unknown;
  visualScale: number;
}

interface CloseModelPipelineWarmupSource {
  closeModelPools?: Map<unknown, CloseModelPipelineWarmupInstance[]>;
  activeCloseModels?: Map<unknown, CloseModelPipelineWarmupInstance>;
}

interface CloseModelPipelineWarmupSnapshot {
  root: THREE.Group;
  visible: boolean;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  meshStates: Array<{ mesh: THREE.Mesh; frustumCulled: boolean }>;
}

function collectCloseModelPipelineWarmupInstances(source: CloseModelPipelineWarmupSource): CloseModelPipelineWarmupInstance[] {
  const instances = new Set<CloseModelPipelineWarmupInstance>();
  source.closeModelPools?.forEach((pool) => {
    for (const instance of pool) {
      instances.add(instance);
    }
  });
  source.activeCloseModels?.forEach((instance) => {
    instances.add(instance);
  });
  return [...instances];
}

export function prepareCombatantRendererCloseModelPipelineWarmup(
  renderer: unknown,
  camera: THREE.Camera,
): CloseModelPipelineWarmupHandle {
  const instances = collectCloseModelPipelineWarmupInstances(renderer as CloseModelPipelineWarmupSource);
  const poolCounts: Record<string, number> = {};
  for (const instance of instances) {
    const key = String(instance.poolKey);
    poolCounts[key] = (poolCounts[key] ?? 0) + 1;
  }

  const snapshots: CloseModelPipelineWarmupSnapshot[] = [];
  const cameraPosition = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  camera.getWorldPosition(cameraPosition);
  camera.getWorldDirection(cameraForward);
  camera.getWorldQuaternion(cameraQuaternion);
  if (cameraForward.lengthSq() < 0.0001) {
    cameraForward.set(0, 0, -1);
  }
  cameraForward.normalize();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion).normalize();
  const anchor = cameraPosition.clone().addScaledVector(cameraForward, WARMUP_DISTANCE_METERS);
  const columns = Math.max(1, Math.min(WARMUP_MAX_COLUMNS, Math.ceil(Math.sqrt(instances.length))));
  const rows = Math.max(1, Math.ceil(instances.length / columns));

  instances.forEach((instance, index) => {
    const root = instance.root;
    const meshStates: CloseModelPipelineWarmupSnapshot['meshStates'] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshStates.push({ mesh: child, frustumCulled: child.frustumCulled });
      child.frustumCulled = false;
    });
    snapshots.push({
      root,
      visible: root.visible,
      position: root.position.clone(),
      quaternion: root.quaternion.clone(),
      scale: root.scale.clone(),
      meshStates,
    });

    const column = index % columns;
    const row = Math.floor(index / columns);
    root.visible = true;
    root.position.copy(anchor)
      .addScaledVector(cameraRight, (column - (columns - 1) / 2) * WARMUP_SPACING_METERS)
      .addScaledVector(cameraUp, (row - (rows - 1) / 2) * WARMUP_SPACING_METERS);
    root.quaternion.copy(cameraQuaternion);
    root.scale.setScalar(Math.max(instance.visualScale, 0.001));
    root.updateMatrixWorld(true);
  });

  let restored = false;
  return {
    count: instances.length,
    poolCounts,
    restore: () => {
      if (restored) return;
      restored = true;
      for (const snapshot of snapshots) {
        snapshot.root.visible = snapshot.visible;
        snapshot.root.position.copy(snapshot.position);
        snapshot.root.quaternion.copy(snapshot.quaternion);
        snapshot.root.scale.copy(snapshot.scale);
        for (const meshState of snapshot.meshStates) {
          meshState.mesh.frustumCulled = meshState.frustumCulled;
        }
        snapshot.root.updateMatrixWorld(true);
      }
    },
  };
}
