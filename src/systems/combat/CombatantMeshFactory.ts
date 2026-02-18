import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, CombatantState } from './types';
import { createOutlineMaterial } from './CombatantShaders';
import { Logger } from '../../utils/Logger';

/** Viewing directions for directional billboards. */
export type ViewDirection = 'front' | 'back' | 'side';

/** Walk frame A/B textures per direction, keyed by "{faction}_{direction}". */
export type WalkFrameMap = Map<string, { a: THREE.Texture; b: THREE.Texture }>;

export interface CombatantMeshAssets {
  factionMeshes: Map<string, THREE.InstancedMesh>;
  factionAuraMeshes: Map<string, THREE.InstancedMesh>;
  factionGroundMarkers: Map<string, THREE.InstancedMesh>;
  soldierTextures: Map<string, THREE.Texture>;
  factionMaterials: Map<string, THREE.ShaderMaterial>;
  walkFrameTextures: WalkFrameMap;
}

// Directions used to create mesh keys
const DIRECTIONS: ViewDirection[] = ['front', 'back', 'side'];

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
    const walkFrameTextures: WalkFrameMap = new Map();

    // Load US directional textures
    const usWalk = {
      front: { a: this.assetLoader.getTexture('us-walk-front-1'), b: this.assetLoader.getTexture('us-walk-front-2') },
      back:  { a: this.assetLoader.getTexture('us-walk-back-1'),  b: this.assetLoader.getTexture('us-walk-back-2') },
      side:  { a: this.assetLoader.getTexture('us-walk-side-1'),  b: this.assetLoader.getTexture('us-walk-side-2') },
    };
    const usFire = {
      front: this.assetLoader.getTexture('us-fire-front'),
      back:  this.assetLoader.getTexture('us-fire-back'),
      side:  this.assetLoader.getTexture('us-fire-side'),
    };

    // Load VC/OPFOR directional textures
    const vcWalk = {
      front: { a: this.assetLoader.getTexture('vc-walk-front-1'), b: this.assetLoader.getTexture('vc-walk-front-2') },
      back:  { a: this.assetLoader.getTexture('vc-walk-back-1'),  b: this.assetLoader.getTexture('vc-walk-back-2') },
      side:  { a: this.assetLoader.getTexture('vc-walk-side-1'),  b: this.assetLoader.getTexture('vc-walk-side-2') },
    };
    const vcFire = {
      front: this.assetLoader.getTexture('vc-fire-front'),
      back:  this.assetLoader.getTexture('vc-fire-back'),
      side:  this.assetLoader.getTexture('vc-fire-side'),
    };

    // Store walk frame pairs for texture swapping by the renderer
    for (const dir of DIRECTIONS) {
      const us = usWalk[dir];
      if (us.a && us.b) {
        walkFrameTextures.set(`US_${dir}`, { a: us.a, b: us.b });
        walkFrameTextures.set(`SQUAD_${dir}`, { a: us.a, b: us.b });
      }
      const vc = vcWalk[dir];
      if (vc.a && vc.b) {
        walkFrameTextures.set(`OPFOR_${dir}`, { a: vc.a, b: vc.b });
      }
    }

    // Store flat texture references (frame A is the default walking texture)
    for (const dir of DIRECTIONS) {
      if (usWalk[dir].a) soldierTextures.set(`US_walking_${dir}`, usWalk[dir].a!);
      if (usFire[dir]) soldierTextures.set(`US_firing_${dir}`, usFire[dir]!);
      if (vcWalk[dir].a) soldierTextures.set(`OPFOR_walking_${dir}`, vcWalk[dir].a!);
      if (vcFire[dir]) soldierTextures.set(`OPFOR_firing_${dir}`, vcFire[dir]!);
    }

    const soldierGeometry = new THREE.PlaneGeometry(5, 7);

    // Helper to create instanced mesh + outline + ground marker
    const createFactionMesh = (
      texture: THREE.Texture,
      key: string,
      maxInstances: number = 120
    ) => {
      const isPlayerSquad = key.startsWith('SQUAD');
      const isUS = key.startsWith('US') || isPlayerSquad;

      // Main sprite material
      const spriteMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        depthWrite: true
      });

      const mesh = new THREE.InstancedMesh(soldierGeometry, spriteMaterial, maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      factionMeshes.set(key, mesh);

      // Outline color: green for squad, blue for US, red for OPFOR
      const outlineColor = isPlayerSquad
        ? new THREE.Color(0.0, 1.0, 0.3)
        : isUS
          ? new THREE.Color(0.0, 0.6, 1.0)
          : new THREE.Color(1.0, 0.0, 0.0);

      const outlineMaterial = createOutlineMaterial(texture, outlineColor);
      const outlineMesh = new THREE.InstancedMesh(soldierGeometry, outlineMaterial, maxInstances);
      outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outlineMesh.frustumCulled = false;
      outlineMesh.count = 0;
      outlineMesh.renderOrder = 9;
      this.scene.add(outlineMesh);
      factionAuraMeshes.set(key, outlineMesh);
      factionMaterials.set(key, outlineMaterial);

      // Ground marker
      const markerColor = isPlayerSquad
        ? new THREE.Color(0.0, 1.0, 0.3)
        : isUS
          ? new THREE.Color(0.0, 0.5, 1.0)
          : new THREE.Color(1.0, 0.0, 0.0);

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

    // Create 6 meshes per faction variant: walking_{front,back,side} + firing_{front,back,side}
    // US forces
    for (const dir of DIRECTIONS) {
      if (usWalk[dir].a) createFactionMesh(usWalk[dir].a!, `US_walking_${dir}`);
      if (usFire[dir]) createFactionMesh(usFire[dir]!, `US_firing_${dir}`);
    }

    // Player squad (reuses US textures, different outline color)
    for (const dir of DIRECTIONS) {
      if (usWalk[dir].a) createFactionMesh(usWalk[dir].a!, `SQUAD_walking_${dir}`);
      if (usFire[dir]) createFactionMesh(usFire[dir]!, `SQUAD_firing_${dir}`);
    }

    // OPFOR (VC textures)
    for (const dir of DIRECTIONS) {
      if (vcWalk[dir].a) createFactionMesh(vcWalk[dir].a!, `OPFOR_walking_${dir}`);
      if (vcFire[dir]) createFactionMesh(vcFire[dir]!, `OPFOR_firing_${dir}`);
    }

    Logger.info('combat', `Created directional soldier meshes: ${factionMeshes.size} meshes (${factionMeshes.size * 3} draw calls)`);

    return {
      factionMeshes,
      factionAuraMeshes,
      factionGroundMarkers,
      soldierTextures,
      factionMaterials,
      walkFrameTextures
    };
  }
}

export const updateCombatantTexture = (
  soldierTextures: Map<string, THREE.Texture>,
  combatant: Combatant
): void => {
  // Texture lookup is now direction-aware, but this function provides a
  // default front-facing fallback for systems that call it without direction.
  let stateKey: string;

  switch (combatant.state) {
    case CombatantState.ENGAGING:
    case CombatantState.SUPPRESSING:
      stateKey = 'firing';
      break;
    default:
      stateKey = 'walking';
      break;
  }

  combatant.currentTexture = soldierTextures.get(`${combatant.faction}_${stateKey}_front`);
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
