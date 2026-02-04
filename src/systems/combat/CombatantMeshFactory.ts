import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, CombatantState } from './types';
import { createOutlineMaterial } from './CombatantShaders';
import { Logger } from '../../utils/Logger';

export interface CombatantMeshAssets {
  factionMeshes: Map<string, THREE.InstancedMesh>;
  factionAuraMeshes: Map<string, THREE.InstancedMesh>;
  factionGroundMarkers: Map<string, THREE.InstancedMesh>;
  soldierTextures: Map<string, THREE.Texture>;
  factionMaterials: Map<string, THREE.ShaderMaterial>;
}

export class CombatantMeshFactory {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  createFactionBillboards(): CombatantMeshAssets {
    const factionMeshes = new Map<string, THREE.InstancedMesh>();
    const factionAuraMeshes = new Map<string, THREE.InstancedMesh>();
    const factionGroundMarkers = new Map<string, THREE.InstancedMesh>();
    const soldierTextures = new Map<string, THREE.Texture>();
    const factionMaterials = new Map<string, THREE.ShaderMaterial>();

    // Load US soldier textures
    const usWalking = this.assetLoader.getTexture('ASoldierWalking');
    const usAlert = this.assetLoader.getTexture('ASoldierAlert');
    const usFiring = this.assetLoader.getTexture('ASoldierFiring');

    // Load OPFOR soldier textures
    const opforWalking = this.assetLoader.getTexture('EnemySoldierWalking');
    const opforAlert = this.assetLoader.getTexture('EnemySoldierAlert');
    const opforFiring = this.assetLoader.getTexture('EnemySoldierFiring');
    const opforBack = this.assetLoader.getTexture('EnemySoldierBack');

    // Store textures
    if (usWalking) soldierTextures.set('US_walking', usWalking);
    if (usAlert) soldierTextures.set('US_alert', usAlert);
    if (usFiring) soldierTextures.set('US_firing', usFiring);
    if (opforWalking) soldierTextures.set('OPFOR_walking', opforWalking);
    if (opforAlert) soldierTextures.set('OPFOR_alert', opforAlert);
    if (opforFiring) soldierTextures.set('OPFOR_firing', opforFiring);
    if (opforBack) soldierTextures.set('OPFOR_back', opforBack);

    // Create instanced meshes for each faction-state combination
    const soldierGeometry = new THREE.PlaneGeometry(5, 7);

    // Helper to create mesh for faction-state with outline effect
    const createFactionMesh = (
      texture: THREE.Texture,
      key: string,
      maxInstances: number = 120
    ) => {
      const isPlayerSquad = key.startsWith('SQUAD');
      const isUS = key.includes('US');

      // Main sprite material - use lit material to respond to scene lighting
      const spriteMaterial = new THREE.MeshLambertMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        depthWrite: true
      });

      // Create main sprite mesh
      const mesh = new THREE.InstancedMesh(soldierGeometry, spriteMaterial, maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      factionMeshes.set(key, mesh);

      // Create outline material with appropriate color
      let outlineColor: THREE.Color;
      if (isPlayerSquad) {
        outlineColor = new THREE.Color(0.0, 1.0, 0.3);
      } else if (isUS) {
        outlineColor = new THREE.Color(0.0, 0.6, 1.0);
      } else {
        outlineColor = new THREE.Color(1.0, 0.0, 0.0);
      }

      const outlineMaterial = createOutlineMaterial(texture, outlineColor);

      // Create outline mesh
      const outlineMesh = new THREE.InstancedMesh(soldierGeometry, outlineMaterial, maxInstances);
      outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outlineMesh.frustumCulled = false;
      outlineMesh.count = 0;
      outlineMesh.renderOrder = 9;
      this.scene.add(outlineMesh);
      factionAuraMeshes.set(key, outlineMesh);
      factionMaterials.set(key, outlineMaterial);

      // Create ground marker
      let markerColor: THREE.Color;
      if (isPlayerSquad) {
        markerColor = new THREE.Color(0.0, 1.0, 0.3);
      } else if (isUS) {
        markerColor = new THREE.Color(0.0, 0.5, 1.0);
      } else {
        markerColor = new THREE.Color(1.0, 0.0, 0.0);
      }

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const markerGeometry = new THREE.RingGeometry(1.5, 2.5, 16);
      const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);
      markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      markerMesh.frustumCulled = false;
      markerMesh.count = 0;
      markerMesh.renderOrder = 0;
      this.scene.add(markerMesh);
      factionGroundMarkers.set(key, markerMesh);
    };

    // Create meshes for regular US forces
    if (usWalking) createFactionMesh(usWalking, 'US_walking');
    if (usAlert) createFactionMesh(usAlert, 'US_alert');
    if (usFiring) createFactionMesh(usFiring, 'US_firing');

    // Create meshes for player squad (green outlines)
    if (usWalking) createFactionMesh(usWalking, 'SQUAD_walking');
    if (usAlert) createFactionMesh(usAlert, 'SQUAD_alert');
    if (usFiring) createFactionMesh(usFiring, 'SQUAD_firing');

    // Create meshes for OPFOR
    if (opforWalking) createFactionMesh(opforWalking, 'OPFOR_walking');
    if (opforAlert) createFactionMesh(opforAlert, 'OPFOR_alert');
    if (opforFiring) createFactionMesh(opforFiring, 'OPFOR_firing');
    if (opforBack) createFactionMesh(opforBack, 'OPFOR_back');

    Logger.info('combat', ' Created faction-specific soldier meshes (with player squad support)');

    return {
      factionMeshes,
      factionAuraMeshes,
      factionGroundMarkers,
      soldierTextures,
      factionMaterials
    };
  }
}

export const updateCombatantTexture = (
  soldierTextures: Map<string, THREE.Texture>,
  combatant: Combatant
): void => {
  let textureKey = `${combatant.faction}_`;

  switch (combatant.state) {
    case CombatantState.ENGAGING:
    case CombatantState.SUPPRESSING:
      textureKey += 'firing';
      break;
    case CombatantState.ALERT:
      textureKey += 'alert';
      break;
    default:
      textureKey += 'walking';
      break;
  }

  combatant.currentTexture = soldierTextures.get(textureKey);
};

export const disposeCombatantMeshes = (
  scene: THREE.Scene,
  assets: CombatantMeshAssets
): void => {
  assets.factionMeshes.forEach(mesh => {
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
    scene.remove(mesh);
  });

  assets.factionAuraMeshes.forEach(mesh => {
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
    scene.remove(mesh);
  });

  assets.factionGroundMarkers.forEach(mesh => {
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
    scene.remove(mesh);
  });

  assets.factionMaterials.forEach(material => {
    material.dispose();
  });

  assets.factionMeshes.clear();
  assets.factionAuraMeshes.clear();
  assets.factionGroundMarkers.clear();
  assets.factionMaterials.clear();
  assets.soldierTextures.clear();
};