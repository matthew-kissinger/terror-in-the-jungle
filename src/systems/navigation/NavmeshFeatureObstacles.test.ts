import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MapFeatureDefinition } from '../../config/gameModeTypes';
import { buildNavmeshFeatureObstacleMeshes } from './NavmeshFeatureObstacles';

function disposeMeshes(meshes: THREE.Mesh[]): void {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
  }
}

describe('buildNavmeshFeatureObstacleMeshes', () => {
  it('does not treat trafficable airfield terrain envelopes as one giant obstacle', () => {
    const feature: MapFeatureDefinition = {
      id: 'main_airfield',
      kind: 'airfield',
      position: new THREE.Vector3(100, 0, -200),
      placement: { yaw: Math.PI * 0.5 },
      templateId: 'us_airbase',
      footprint: { shape: 'circle', radius: 270 },
    };

    const meshes = buildNavmeshFeatureObstacleMeshes([feature], () => 12);
    try {
      expect(meshes.length).toBeGreaterThan(0);
      const maxHorizontalExtent = Math.max(
        ...meshes.map((mesh) => {
          const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
          return Math.max(size.x, size.z);
        }),
      );
      expect(maxHorizontalExtent).toBeLessThan(40);
    } finally {
      disposeMeshes(meshes);
    }
  });

  it('skips feature footprints when there are no collidable runtime placements', () => {
    const feature: MapFeatureDefinition = {
      id: 'trail_pad',
      kind: 'road',
      position: new THREE.Vector3(0, 0, 0),
      footprint: { shape: 'circle', radius: 80 },
      surface: { kind: 'jungle_trail', innerRadius: 20, outerRadius: 40 },
    };

    const meshes = buildNavmeshFeatureObstacleMeshes([feature], () => 0);
    expect(meshes).toHaveLength(0);
  });

  it('places authored collidable static placements in feature-local space', () => {
    const feature: MapFeatureDefinition = {
      id: 'depot',
      kind: 'village',
      position: new THREE.Vector3(100, 0, 200),
      placement: { yaw: Math.PI * 0.5 },
      staticPlacements: [
        {
          modelPath: 'warehouse.glb',
          offset: new THREE.Vector3(10, 0, 0),
          yaw: 0.25,
          registerCollision: true,
        },
      ],
    };

    const meshes = buildNavmeshFeatureObstacleMeshes([feature], () => 5);
    try {
      expect(meshes).toHaveLength(1);
      expect(meshes[0].position.x).toBeCloseTo(100, 3);
      expect(meshes[0].position.z).toBeCloseTo(190, 3);
      expect(meshes[0].position.y).toBeCloseTo(10, 3);
      expect(meshes[0].rotation.y).toBeCloseTo(Math.PI * 0.5 + 0.25, 3);
    } finally {
      disposeMeshes(meshes);
    }
  });
});
