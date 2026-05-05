import * as THREE from 'three';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';
import { AIRFIELD_TEMPLATES } from '../world/AirfieldTemplates';
import { generateAirfieldLayout } from '../world/AirfieldLayoutGenerator';
import { getWorldFeaturePrefab } from '../world/WorldFeaturePrefabs';

const OBSTACLE_HEIGHT = 10.0;

const _rotatedOffset = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

interface ObstacleSize {
  width: number;
  depth: number;
}

/**
 * Build approximate static-placement obstacles for Recast input.
 *
 * Map-feature footprints are terrain authoring envelopes: airfields, helipads,
 * roads, villages, and firebase compounds are trafficable pads, not solid
 * geometry. Baking those whole footprints as obstacles can disconnect bases.
 * The navmesh obstacle source should instead track runtime placements that opt
 * into collision.
 */
export function buildNavmeshFeatureObstacleMeshes(
  features: MapFeatureDefinition[] | undefined,
  sampleHeight: (x: number, z: number) => number,
): THREE.Mesh[] {
  if (!features?.length) return [];

  const meshes: THREE.Mesh[] = [];
  for (const feature of features) {
    const featureYaw = feature.placement?.yaw ?? 0;
    for (const placement of resolveFeaturePlacements(feature)) {
      if (placement.registerCollision !== true) {
        continue;
      }
      const size = resolvePlacementObstacleSize(placement.modelPath);
      _rotatedOffset.copy(placement.offset).applyAxisAngle(_upAxis, featureYaw);
      const worldX = feature.position.x + _rotatedOffset.x;
      const worldZ = feature.position.z + _rotatedOffset.z;
      const y = sampleHeight(worldX, worldZ);
      const geometry = new THREE.BoxGeometry(size.width, OBSTACLE_HEIGHT, size.depth);
      const mesh = new THREE.Mesh(geometry);
      mesh.position.set(worldX, y + OBSTACLE_HEIGHT / 2, worldZ);
      mesh.rotation.y = featureYaw + (placement.yaw ?? 0);
      mesh.updateMatrixWorld(true);
      meshes.push(mesh);
    }
  }
  return meshes;
}

function resolveFeaturePlacements(feature: MapFeatureDefinition): StaticModelPlacementConfig[] {
  const prefabPlacements = getWorldFeaturePrefab(feature)?.placements ?? [];
  const generatedPlacements = resolveGeneratedAirfieldPlacements(feature);
  const authoredPlacements = feature.staticPlacements ?? [];
  return [...prefabPlacements, ...generatedPlacements, ...authoredPlacements];
}

function resolveGeneratedAirfieldPlacements(feature: MapFeatureDefinition): StaticModelPlacementConfig[] {
  if (feature.kind !== 'airfield' || !feature.templateId) {
    return [];
  }
  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template) {
    return [];
  }
  return generateAirfieldLayout(
    template,
    feature.position,
    feature.placement?.yaw ?? 0,
    feature.seedHint ?? feature.id,
  ).placements;
}

function resolvePlacementObstacleSize(modelPath: string): ObstacleSize {
  const path = modelPath.toLowerCase();
  if (path.includes('warehouse') || path.includes('hangar')) {
    return { width: 18, depth: 18 };
  }
  if (path.includes('bridge')) {
    return { width: 20, depth: 8 };
  }
  if (path.includes('m48') || path.includes('m113') || path.includes('m35') || path.includes('jeep')) {
    return { width: 8, depth: 4 };
  }
  if (path.includes('aircraft') || path.includes('a1') || path.includes('f4') || path.includes('ac47')) {
    return { width: 16, depth: 16 };
  }
  if (path.includes('tower') || path.includes('radio') || path.includes('comms')) {
    return { width: 5, depth: 5 };
  }
  if (path.includes('bunker') || path.includes('hut') || path.includes('farmhouse') || path.includes('barn') || path.includes('shophouse')) {
    return { width: 9, depth: 9 };
  }
  if (path.includes('zpu') || path.includes('mortar') || path.includes('sandbag')) {
    return { width: 6, depth: 6 };
  }
  return { width: 7, depth: 7 };
}
