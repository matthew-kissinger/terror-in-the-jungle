// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';

export interface WorldFeatureAttributionMetadata {
  featureId: string;
  featureKind: string;
  templateId?: string;
  placementId?: string;
  objectId: string;
  placementIndex: number;
  modelPath: string;
}

export function getFeatureTemplateId(feature: MapFeatureDefinition): string | undefined {
  if (!('templateId' in feature) || typeof feature.templateId !== 'string') {
    return undefined;
  }
  return feature.templateId;
}

export function applyWorldFeatureGroupAttribution(group: THREE.Object3D, feature: MapFeatureDefinition): void {
  const templateId = getFeatureTemplateId(feature);
  group.userData.perfCategory = 'world_static_features';
  group.userData.worldFeatureId = feature.id;
  group.userData.worldFeatureKind = feature.kind;
  if (templateId) {
    group.userData.worldFeatureTemplateId = templateId;
  }
  group.userData.perfOwnerKey = `world-feature:${feature.id}`;
  group.userData.perfOwnerLabel = `${feature.kind}:${feature.id}`;
  group.userData.perfOwnerType = 'world_feature';
}

export function applyWorldFeatureSectorAttribution(group: THREE.Object3D, sectorId: string): void {
  group.userData.perfCategory = 'world_static_features';
  group.userData.worldFeatureSectorId = sectorId;
  group.userData.perfOwnerKey = `world-feature-sector:${sectorId}`;
  group.userData.perfOwnerLabel = `world-feature-sector:${sectorId}`;
  group.userData.perfOwnerType = 'world_feature_sector';
}

export function applyWorldFeaturePlacementAttribution(
  object: THREE.Object3D,
  feature: MapFeatureDefinition,
  placement: StaticModelPlacementConfig,
  placementIndex: number,
  objectId: string,
  options: { perfCategory?: string } = {},
): void {
  applyWorldFeatureAttribution(object, {
    featureId: feature.id,
    featureKind: feature.kind,
    templateId: getFeatureTemplateId(feature),
    placementId: placement.id,
    objectId,
    placementIndex,
    modelPath: placement.modelPath,
  }, options);
}

export function enableWorldFeatureShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function disableWorldFeatureDetailShadowCasting(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = true;
      child.userData.worldFeatureDetailShadowCaster = false;
    }
  });
}

function applyWorldFeatureAttribution(
  object: THREE.Object3D,
  metadata: WorldFeatureAttributionMetadata,
  options: { perfCategory?: string } = {},
): void {
  const placementKey = metadata.placementId ?? String(metadata.placementIndex);
  const ownerKey = `world-feature-placement:${metadata.objectId}`;
  const ownerLabel = `${metadata.featureKind}:${metadata.featureId}/${placementKey}`;
  object.traverse((child) => {
    if (options.perfCategory) {
      child.userData.perfCategory = options.perfCategory;
    }
    child.userData.modelPath = metadata.modelPath;
    child.userData.worldFeatureId = metadata.featureId;
    child.userData.worldFeatureKind = metadata.featureKind;
    child.userData.worldFeatureObjectId = metadata.objectId;
    child.userData.worldFeaturePlacementId = placementKey;
    child.userData.worldFeatureModelPath = metadata.modelPath;
    if (metadata.templateId) {
      child.userData.worldFeatureTemplateId = metadata.templateId;
    }
    child.userData.perfOwnerKey = ownerKey;
    child.userData.perfOwnerLabel = ownerLabel;
    child.userData.perfOwnerType = 'world_feature_placement';
  });
}
