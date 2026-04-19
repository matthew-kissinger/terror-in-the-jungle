import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, CombatantState, Faction } from './types';
import { createOutlineMaterial } from './CombatantShaders';
import { Logger } from '../../utils/Logger';

/** Viewing directions for directional billboards. */
export type ViewDirection = 'front' | 'back' | 'side';

/** Walk frame A/B textures per direction, keyed by "{faction}_{direction}". */
export type WalkFrameMap = Map<string, { a: THREE.Texture; b: THREE.Texture }>;

interface CombatantMeshAssets {
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

// NPC billboard dimensions in world units (width x height). The sprite's visible
// silhouette occupies roughly the upper half of the plane, so the apparent
// figure height is ~0.55 * SPRITE_HEIGHT. At 4.5m sprite height that maps to a
// ~2.5m apparent figure — slightly larger than a real soldier for readability
// at range, without dwarfing the ~2.2m player eye. Previously 5x7, which made
// the player feel undersized (3.5:1 NPC-apparent-to-player-eye ratio). Hit
// detection uses CombatantHitDetection's zone offsets, not the sprite size,
// so shrinking the plane does not affect gameplay hit registration.
export const NPC_SPRITE_WIDTH = 3.2;
export const NPC_SPRITE_HEIGHT = 4.5;

// Per-bucket instance capacity. The E2 rendering spike (docs/rearch/E2-rendering-evaluation.md
// on spike/E2-rendering-at-scale) recommended raising this "before combat testing moves past
// 500 concurrent NPCs per bucket" and measured the keyed-instanced path at ~2ms/frame CPU cost
// at 3000 total instances. 512 leaves headroom above the 500 threshold while keeping the
// per-mesh instanceMatrix buffer small (~32 KB per mesh, ~3.5 MB total across all buckets).
export const DEFAULT_MESH_BUCKET_CAPACITY = 512;

// Mounted sprites (NPCs seated in vehicles) peak much lower since vehicle crew counts are
// bounded by vehicle capacity. Raise from the prior 32 to 128 to preserve a 4x safety margin.
export const MOUNTED_MESH_BUCKET_CAPACITY = 128;

const OVERFLOW_LOG_INTERVAL_MS = 1000;
const bucketOverflowLastLog = new Map<string, number>();
const bucketOverflowPending = new Map<string, number>();

/**
 * Surface a bucket-capacity overflow as a rate-limited warning. Call once per dropped instance;
 * this helper coalesces into a single log line per bucket per second so hot paths do not spam.
 * Visible for tests.
 */
export function reportBucketOverflow(bucketKey: string, now: number = performance.now()): void {
  const pending = (bucketOverflowPending.get(bucketKey) ?? 0) + 1;
  bucketOverflowPending.set(bucketKey, pending);

  const lastLog = bucketOverflowLastLog.get(bucketKey);
  if (lastLog !== undefined && now - lastLog < OVERFLOW_LOG_INTERVAL_MS) return;

  bucketOverflowLastLog.set(bucketKey, now);
  bucketOverflowPending.set(bucketKey, 0);
  Logger.warn(
    'combat-renderer',
    `Combatant mesh bucket "${bucketKey}" overflowed capacity; dropped ${pending} instance(s) in the last ${(OVERFLOW_LOG_INTERVAL_MS / 1000).toFixed(1)}s`
  );
}

/** Test-only: clear overflow throttling state so each test starts from a clean slate. */
export function resetBucketOverflowState(): void {
  bucketOverflowLastLog.clear();
  bucketOverflowPending.clear();
}

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
    const mounted: THREE.Texture | undefined = this.assetLoader.getTexture(`${assetPrefix}-mounted`);
    return { walk, fire, mounted };
  }

  createFactionBillboards(): CombatantMeshAssets {
    const factionMeshes = new Map<string, THREE.InstancedMesh>();
    const factionAuraMeshes = new Map<string, THREE.InstancedMesh>();
    const factionGroundMarkers = new Map<string, THREE.InstancedMesh>();
    const soldierTextures = new Map<string, THREE.Texture>();
    const factionMaterials = new Map<string, THREE.ShaderMaterial>();
    const walkFrameTextures: WalkFrameMap = new Map();
    const soldierGeometry = new THREE.PlaneGeometry(NPC_SPRITE_WIDTH, NPC_SPRITE_HEIGHT);
    const markerGeometry = new THREE.RingGeometry(1.5, 2.5, 16);

    const createMeshSet = (
      texture: THREE.Texture,
      key: string,
      outlineColor: THREE.Color,
      markerColor: THREE.Color,
      maxInstances = DEFAULT_MESH_BUCKET_CAPACITY
    ) => {
      const spriteMaterial = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.5,
        side: THREE.DoubleSide, forceSinglePass: true, depthWrite: true
      });
      const mesh = new THREE.InstancedMesh(soldierGeometry, spriteMaterial, maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 10;
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      this.scene.add(mesh);
      factionMeshes.set(key, mesh);

      const outlineMaterial = createOutlineMaterial(texture, outlineColor);
      const outlineMesh = new THREE.InstancedMesh(soldierGeometry, outlineMaterial, maxInstances);
      outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outlineMesh.frustumCulled = false;
      outlineMesh.count = 0;
      outlineMesh.renderOrder = 9;
      outlineMesh.matrixAutoUpdate = false;
      outlineMesh.matrixWorldAutoUpdate = false;
      this.scene.add(outlineMesh);
      factionAuraMeshes.set(key, outlineMesh);
      factionMaterials.set(key, outlineMaterial);

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false
      });
      const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);
      markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      markerMesh.frustumCulled = false;
      markerMesh.count = 0;
      markerMesh.renderOrder = 0;
      markerMesh.matrixAutoUpdate = false;
      markerMesh.matrixWorldAutoUpdate = false;
      this.scene.add(markerMesh);
      factionGroundMarkers.set(key, markerMesh);
    };

    for (const cfg of FACTION_SPRITE_CONFIGS) {
      const { walk, fire, mounted } = this.loadFactionTextures(cfg.assetPrefix);

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

      // Mounted sprite: single front-facing texture used for all view directions (seated in vehicle)
      if (mounted) {
        for (const dir of DIRECTIONS) {
          soldierTextures.set(`${cfg.factionKey}_mounted_${dir}`, mounted);
          createMeshSet(mounted, `${cfg.factionKey}_mounted_${dir}`, cfg.outlineColor, cfg.markerColor, MOUNTED_MESH_BUCKET_CAPACITY);
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
    if (playerTextures.mounted) {
      for (const dir of DIRECTIONS) {
        createMeshSet(playerTextures.mounted, `SQUAD_mounted_${dir}`, SQUAD_OUTLINE_COLOR, SQUAD_MARKER_COLOR, MOUNTED_MESH_BUCKET_CAPACITY);
      }
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
    case CombatantState.IN_VEHICLE:
    case CombatantState.BOARDING:
    case CombatantState.DISMOUNTING:
      stateKey = 'mounted';
      break;
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
