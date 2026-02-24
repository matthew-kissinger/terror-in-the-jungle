import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, CombatantState, Faction, isBlufor } from './types';
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

const DIRECTIONS: ViewDirection[] = ['front', 'back', 'side'];

interface FactionSpriteConfig {
  factionKey: string;
  assetPrefix: string;
  outlineColor: THREE.Color;
  markerColor: THREE.Color;
}

const FACTION_SPRITE_CONFIGS: FactionSpriteConfig[] = [
  { factionKey: Faction.US,   assetPrefix: 'us',   outlineColor: new THREE.Color(0.0, 0.6, 1.0), markerColor: new THREE.Color(0.0, 0.5, 1.0) },
  { factionKey: Faction.ARVN, assetPrefix: 'arvn', outlineColor: new THREE.Color(0.0, 0.8, 0.7), markerColor: new THREE.Color(0.0, 0.7, 0.6) },
  { factionKey: Faction.NVA,  assetPrefix: 'nva',  outlineColor: new THREE.Color(1.0, 0.0, 0.0), markerColor: new THREE.Color(1.0, 0.0, 0.0) },
  { factionKey: Faction.VC,   assetPrefix: 'vc',   outlineColor: new THREE.Color(1.0, 0.4, 0.0), markerColor: new THREE.Color(1.0, 0.3, 0.0) },
];

const SQUAD_OUTLINE_COLOR = new THREE.Color(0.0, 1.0, 0.3);
const SQUAD_MARKER_COLOR = new THREE.Color(0.0, 1.0, 0.3);

export class CombatantMeshFactory {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  private loadFactionTextures(assetPrefix: string) {
    const walk: Record<ViewDirection, { a?: THREE.Texture; b?: THREE.Texture }> = {
      front: { a: this.assetLoader.getTexture(`${assetPrefix}-walk-front-1`), b: this.assetLoader.getTexture(`${assetPrefix}-walk-front-2`) },
      back:  { a: this.assetLoader.getTexture(`${assetPrefix}-walk-back-1`),  b: this.assetLoader.getTexture(`${assetPrefix}-walk-back-2`) },
      side:  { a: this.assetLoader.getTexture(`${assetPrefix}-walk-side-1`),  b: this.assetLoader.getTexture(`${assetPrefix}-walk-side-2`) },
    };
    const fire: Record<ViewDirection, THREE.Texture | undefined> = {
      front: this.assetLoader.getTexture(`${assetPrefix}-fire-front`),
      back:  this.assetLoader.getTexture(`${assetPrefix}-fire-back`),
      side:  this.assetLoader.getTexture(`${assetPrefix}-fire-side`),
    };
    return { walk, fire };
  }

  createFactionBillboards(): CombatantMeshAssets {
    const factionMeshes = new Map<string, THREE.InstancedMesh>();
    const factionAuraMeshes = new Map<string, THREE.InstancedMesh>();
    const factionGroundMarkers = new Map<string, THREE.InstancedMesh>();
    const soldierTextures = new Map<string, THREE.Texture>();
    const factionMaterials = new Map<string, THREE.ShaderMaterial>();
    const walkFrameTextures: WalkFrameMap = new Map();
    const soldierGeometry = new THREE.PlaneGeometry(5, 7);
    const markerGeometry = new THREE.RingGeometry(1.5, 2.5, 16);

    const createMeshSet = (
      texture: THREE.Texture,
      key: string,
      outlineColor: THREE.Color,
      markerColor: THREE.Color,
      maxInstances = 120
    ) => {
      const spriteMaterial = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.5,
        side: THREE.DoubleSide, depthWrite: true
      });
      const mesh = new THREE.InstancedMesh(soldierGeometry, spriteMaterial, maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      factionMeshes.set(key, mesh);

      const outlineMaterial = createOutlineMaterial(texture, outlineColor);
      const outlineMesh = new THREE.InstancedMesh(soldierGeometry, outlineMaterial, maxInstances);
      outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outlineMesh.frustumCulled = false;
      outlineMesh.count = 0;
      outlineMesh.renderOrder = 9;
      this.scene.add(outlineMesh);
      factionAuraMeshes.set(key, outlineMesh);
      factionMaterials.set(key, outlineMaterial);

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false
      });
      const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);
      markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      markerMesh.frustumCulled = false;
      markerMesh.count = 0;
      markerMesh.renderOrder = 0;
      this.scene.add(markerMesh);
      factionGroundMarkers.set(key, markerMesh);
    };

    for (const cfg of FACTION_SPRITE_CONFIGS) {
      const { walk, fire } = this.loadFactionTextures(cfg.assetPrefix);

      for (const dir of DIRECTIONS) {
        const w = walk[dir];
        if (w.a && w.b) walkFrameTextures.set(`${cfg.factionKey}_${dir}`, { a: w.a, b: w.b });
        if (w.a) {
          soldierTextures.set(`${cfg.factionKey}_walking_${dir}`, w.a);
          createMeshSet(w.a, `${cfg.factionKey}_walking_${dir}`, cfg.outlineColor, cfg.markerColor);
        }
        if (fire[dir]) {
          soldierTextures.set(`${cfg.factionKey}_firing_${dir}`, fire[dir]!);
          createMeshSet(fire[dir]!, `${cfg.factionKey}_firing_${dir}`, cfg.outlineColor, cfg.markerColor);
        }
      }
    }

    // Player squad reuses the player's faction textures (US by default) with a distinct green outline
    const playerTextures = this.loadFactionTextures('us');
    for (const dir of DIRECTIONS) {
      const w = playerTextures.walk[dir];
      if (w.a && w.b) walkFrameTextures.set(`SQUAD_${dir}`, { a: w.a, b: w.b });
      if (w.a) createMeshSet(w.a, `SQUAD_walking_${dir}`, SQUAD_OUTLINE_COLOR, SQUAD_MARKER_COLOR);
      if (playerTextures.fire[dir]) createMeshSet(playerTextures.fire[dir]!, `SQUAD_firing_${dir}`, SQUAD_OUTLINE_COLOR, SQUAD_MARKER_COLOR);
    }

    Logger.info('combat', `Created directional soldier meshes: ${factionMeshes.size} meshes (${factionMeshes.size * 3} draw calls)`);

    return { factionMeshes, factionAuraMeshes, factionGroundMarkers, soldierTextures, factionMaterials, walkFrameTextures };
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
