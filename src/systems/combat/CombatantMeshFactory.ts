import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, Faction } from './types';
import { Logger } from '../../utils/Logger';
import {
  NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT,
  NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER,
} from '../../config/CombatantConfig';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  pixelForgeNpcTextureName,
  type PixelForgeNpcClipId,
} from '../../config/pixelForgeAssets';
import { getPixelForgeNpcRuntimeClip } from './PixelForgeNpcRuntime';

export type ViewDirection = 'front' | 'back' | 'side';
export type WalkFrameMap = Map<string, { a: THREE.Texture; b: THREE.Texture }>;

interface CombatantMeshAssets {
  factionMeshes: Map<string, THREE.InstancedMesh>;
  factionAuraMeshes: Map<string, THREE.InstancedMesh>;
  factionGroundMarkers: Map<string, THREE.InstancedMesh>;
  soldierTextures: Map<string, THREE.Texture>;
  factionMaterials: Map<string, THREE.ShaderMaterial>;
  walkFrameTextures: WalkFrameMap;
}

const FACTION_MARKER_COLORS: Record<Faction | 'SQUAD', THREE.Color> = {
  [Faction.US]: new THREE.Color(0.0, 0.5, 1.0),
  [Faction.ARVN]: new THREE.Color(0.0, 0.7, 0.6),
  [Faction.NVA]: new THREE.Color(1.0, 0.0, 0.0),
  [Faction.VC]: new THREE.Color(1.0, 0.3, 0.0),
  SQUAD: new THREE.Color(0.0, 1.0, 0.3),
};

const NPC_VISUAL_SCALE_MULTIPLIER = NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER;
const NPC_BASE_SPRITE_WIDTH = 2.0;
const NPC_BASE_SPRITE_HEIGHT = NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT;

export const NPC_SPRITE_WIDTH = NPC_BASE_SPRITE_WIDTH * NPC_VISUAL_SCALE_MULTIPLIER;
export const NPC_SPRITE_HEIGHT = NPC_BASE_SPRITE_HEIGHT * NPC_VISUAL_SCALE_MULTIPLIER;
export const NPC_SPRITE_RENDER_Y_OFFSET = -0.04;
export const NPC_CLOSE_MODEL_TARGET_HEIGHT = NPC_SPRITE_HEIGHT;
export const DEFAULT_MESH_BUCKET_CAPACITY = 512;
export const MOUNTED_MESH_BUCKET_CAPACITY = 128;

const OVERFLOW_LOG_INTERVAL_MS = 1000;
const bucketOverflowLastLog = new Map<string, number>();
const bucketOverflowPending = new Map<string, number>();

const NPC_IMPOSTOR_VERTEX_SHADER = `
  varying vec2 vUv;
  varying float vPhase;
  varying float vViewColumn;
  varying float vAnimationProgress;
  varying float vOpacity;

  attribute float instancePhase;
  attribute float instanceViewColumn;
  attribute float instanceAnimationProgress;
  attribute float instanceOpacity;

  void main() {
    vUv = uv;
    vPhase = instancePhase;
    vViewColumn = instanceViewColumn;
    vAnimationProgress = instanceAnimationProgress;
    vOpacity = instanceOpacity;
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const NPC_IMPOSTOR_FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform float time;
  uniform float clipDuration;
  uniform float framesPerClip;
  uniform vec2 viewGrid;
  uniform vec2 frameGrid;
  uniform float combatState;
  uniform vec3 readabilityColor;
  uniform float readabilityStrength;
  uniform float npcExposure;
  uniform float minNpcLight;
  uniform float npcTopLight;
  uniform float animationMode;

  varying vec2 vUv;
  varying float vPhase;
  varying float vViewColumn;
  varying float vAnimationProgress;
  varying float vOpacity;

  void main() {
    float safeDuration = max(clipDuration, 0.001);
    float loopFrame = floor(mod(((time + vPhase * safeDuration) / safeDuration) * framesPerClip, framesPerClip));
    float oneShotFrame = floor(clamp(vAnimationProgress, 0.0, 0.999) * framesPerClip);
    float frame = mix(loopFrame, oneShotFrame, step(0.5, animationMode));
    float frameX = mod(frame, frameGrid.x);
    float frameY = floor(frame / frameGrid.x);
    float viewX = clamp(floor(vViewColumn + 0.5), 0.0, viewGrid.x - 1.0);
    float viewY = floor(viewGrid.y * 0.5);
    vec2 atlasGrid = viewGrid * frameGrid;
    vec2 tile = vec2(frameX * viewGrid.x + viewX, frameY * viewGrid.y + viewY);
    vec2 sampleUv = vec2(
      (tile.x + vUv.x) / atlasGrid.x,
      1.0 - ((tile.y + 1.0 - vUv.y) / atlasGrid.y)
    );
    vec4 texColor = texture2D(map, sampleUv);
    if (texColor.a < 0.18) discard;
    vec3 alertBoost = mix(vec3(1.0), vec3(1.12, 1.06, 0.96), clamp(combatState, 0.0, 1.0));
    vec3 npcColor = texColor.rgb * alertBoost;
    float luma = dot(npcColor, vec3(0.299, 0.587, 0.114));
    npcColor = mix(vec3(luma), npcColor, 1.22);
    npcColor = min(npcColor + vec3(0.045, 0.040, 0.030), vec3(1.0));
    vec3 readabilityLift = readabilityColor * (0.18 + 0.12 * combatState);
    npcColor = mix(npcColor, min(npcColor + readabilityLift, vec3(1.0)), readabilityStrength);
    float topLight = smoothstep(0.12, 1.0, vUv.y) * npcTopLight;
    float npcLight = max(minNpcLight, minNpcLight + topLight);
    npcColor = min(npcColor * npcExposure * npcLight, vec3(1.0));
    float alpha = texColor.a * clamp(vOpacity, 0.0, 1.0);
    gl_FragColor = vec4(npcColor, alpha);
  }
`;

export function getPixelForgeNpcClipForCombatant(combatant: Combatant): PixelForgeNpcClipId {
  return getPixelForgeNpcRuntimeClip(combatant);
}

export function getPixelForgeNpcBucketKey(factionKey: Faction | 'SQUAD', clipId: PixelForgeNpcClipId): string {
  return `${factionKey}_${clipId}`;
}

export function setPixelForgeNpcImpostorAttributes(
  mesh: THREE.InstancedMesh,
  index: number,
  phase: number,
  viewColumn: number,
  animationProgress = 0,
  opacity = 1,
): void {
  const phaseAttribute = mesh.geometry.getAttribute('instancePhase') as THREE.InstancedBufferAttribute | undefined;
  const viewAttribute = mesh.geometry.getAttribute('instanceViewColumn') as THREE.InstancedBufferAttribute | undefined;
  const animationProgressAttribute = mesh.geometry.getAttribute('instanceAnimationProgress') as THREE.InstancedBufferAttribute | undefined;
  const opacityAttribute = mesh.geometry.getAttribute('instanceOpacity') as THREE.InstancedBufferAttribute | undefined;
  if (phaseAttribute) {
    phaseAttribute.setX(index, phase);
    phaseAttribute.needsUpdate = true;
  }
  if (viewAttribute) {
    viewAttribute.setX(index, viewColumn);
    viewAttribute.needsUpdate = true;
  }
  if (animationProgressAttribute) {
    animationProgressAttribute.setX(index, animationProgress);
    animationProgressAttribute.needsUpdate = true;
  }
  if (opacityAttribute) {
    opacityAttribute.setX(index, opacity);
    opacityAttribute.needsUpdate = true;
  }
}

export function reportBucketOverflow(bucketKey: string, now: number = performance.now()): void {
  const pending = (bucketOverflowPending.get(bucketKey) ?? 0) + 1;
  bucketOverflowPending.set(bucketKey, pending);

  const lastLog = bucketOverflowLastLog.get(bucketKey);
  if (lastLog !== undefined && now - lastLog < OVERFLOW_LOG_INTERVAL_MS) return;

  bucketOverflowLastLog.set(bucketKey, now);
  bucketOverflowPending.set(bucketKey, 0);
  Logger.warn(
    'combat-renderer',
    `Combatant Pixel Forge bucket "${bucketKey}" overflowed capacity; dropped ${pending} instance(s) in the last ${(OVERFLOW_LOG_INTERVAL_MS / 1000).toFixed(1)}s`
  );
}

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

  private createImpostorMaterial(
    texture: THREE.Texture,
    clipId: PixelForgeNpcClipId,
    readabilityColor: THREE.Color,
  ): THREE.ShaderMaterial {
    const clip = PIXEL_FORGE_NPC_CLIPS.find((candidate) => candidate.id === clipId);
    if (!clip) {
      throw new Error(`Unknown Pixel Forge NPC clip: ${clipId}`);
    }

    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        time: { value: 0 },
        clipDuration: { value: clip.durationSec },
        framesPerClip: { value: clip.framesPerClip },
        viewGrid: { value: new THREE.Vector2(clip.viewGridX, clip.viewGridY) },
        frameGrid: { value: new THREE.Vector2(clip.framesX, clip.framesY) },
        combatState: { value: 0 },
        readabilityColor: { value: readabilityColor.clone() },
        readabilityStrength: { value: 0.38 },
        npcExposure: { value: 1.2 },
        minNpcLight: { value: 0.92 },
        npcTopLight: { value: 0.16 },
        animationMode: { value: clipId === 'death_fall_back' ? 1 : 0 },
      },
      vertexShader: NPC_IMPOSTOR_VERTEX_SHADER,
      fragmentShader: NPC_IMPOSTOR_FRAGMENT_SHADER,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: true,
    });
  }

  private createMeshSet(
    texture: THREE.Texture,
    key: string,
    clipId: PixelForgeNpcClipId,
    markerColor: THREE.Color,
    maxInstances: number,
  ): { mesh: THREE.InstancedMesh; material: THREE.ShaderMaterial; marker: THREE.InstancedMesh } {
    const geometry = new THREE.PlaneGeometry(NPC_SPRITE_WIDTH, NPC_SPRITE_HEIGHT);
    geometry.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceViewColumn', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceAnimationProgress', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances).fill(1), 1));

    const material = this.createImpostorMaterial(texture, clipId, markerColor);
    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 10;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    this.scene.add(mesh);

    const markerGeometry = new THREE.RingGeometry(1.8, 3.0, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: markerColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: false,
    });
    const marker = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);
    marker.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    marker.frustumCulled = false;
    marker.count = 0;
    marker.renderOrder = 0;
    marker.matrixAutoUpdate = false;
    marker.matrixWorldAutoUpdate = false;
    this.scene.add(marker);

    return { mesh, material, marker };
  }

  createFactionBillboards(): CombatantMeshAssets {
    const factionMeshes = new Map<string, THREE.InstancedMesh>();
    const factionAuraMeshes = new Map<string, THREE.InstancedMesh>();
    const factionGroundMarkers = new Map<string, THREE.InstancedMesh>();
    const soldierTextures = new Map<string, THREE.Texture>();
    const factionMaterials = new Map<string, THREE.ShaderMaterial>();
    const walkFrameTextures: WalkFrameMap = new Map();

    const createFactionBuckets = (
      factionKey: Faction | 'SQUAD',
      textureFaction: Faction,
      maxInstances: number,
    ) => {
      for (const clip of PIXEL_FORGE_NPC_CLIPS) {
        const texture = this.assetLoader.getTexture(pixelForgeNpcTextureName(textureFaction, clip.id));
        if (!texture) {
          Logger.warn('combat', `Missing Pixel Forge NPC impostor texture for ${textureFaction}/${clip.id}`);
          continue;
        }
        const key = getPixelForgeNpcBucketKey(factionKey, clip.id);
        const { mesh, material, marker } = this.createMeshSet(
          texture,
          key,
          clip.id,
          FACTION_MARKER_COLORS[factionKey],
          maxInstances,
        );
        factionMeshes.set(key, mesh);
        factionGroundMarkers.set(key, marker);
        factionMaterials.set(key, material);
        soldierTextures.set(key, texture);
      }
    };

    for (const faction of PIXEL_FORGE_NPC_FACTIONS) {
      createFactionBuckets(faction.runtimeFaction as Faction, faction.runtimeFaction as Faction, DEFAULT_MESH_BUCKET_CAPACITY);
    }
    createFactionBuckets('SQUAD', Faction.US, DEFAULT_MESH_BUCKET_CAPACITY);

    Logger.info('combat', `Created Pixel Forge NPC impostor buckets: ${factionMeshes.size} meshes`);

    return { factionMeshes, factionAuraMeshes, factionGroundMarkers, soldierTextures, factionMaterials, walkFrameTextures };
  }
}

export const updateCombatantTexture = (
  soldierTextures: Map<string, THREE.Texture>,
  combatant: Combatant
): void => {
  const key = getPixelForgeNpcBucketKey(combatant.faction, getPixelForgeNpcClipForCombatant(combatant));
  combatant.currentTexture = soldierTextures.get(key);
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
