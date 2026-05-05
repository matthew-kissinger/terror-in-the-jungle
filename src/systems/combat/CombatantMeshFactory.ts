import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { Combatant, Faction } from './types';
import { Logger } from '../../utils/Logger';
import {
  NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT,
  NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER,
  NPC_Y_OFFSET,
} from '../../config/CombatantConfig';
import { getPixelForgeNpcTileCropMap } from '../../config/generated/pixelForgeNpcTileCrops';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  pixelForgeNpcTextureName,
  type PixelForgeNpcFactionAsset,
  type PixelForgeNpcClipId,
} from '../../config/pixelForgeAssets';
import {
  getPixelForgeNpcRuntimeClip,
  PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING,
  type PixelForgeNpcImposterMaterialTuning,
} from './PixelForgeNpcRuntime';

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

export interface CombatantImpostorBucketAssets {
  key: string;
  mesh: THREE.InstancedMesh;
  marker: THREE.InstancedMesh;
  texture: THREE.Texture;
  material: THREE.ShaderMaterial;
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
export const NPC_SPRITE_RENDER_Y_OFFSET = NPC_SPRITE_HEIGHT / 2 - NPC_Y_OFFSET;
export const NPC_CLOSE_MODEL_TARGET_HEIGHT = NPC_SPRITE_HEIGHT;
export const DEFAULT_MESH_BUCKET_CAPACITY = 512;
export const MOUNTED_MESH_BUCKET_CAPACITY = 128;
// KB-LOAD: allocate only the common startup loops during combat-system init.
// Other faction/clip pairs are created on demand for the first visible far NPC,
// keeping unused Pixel Forge atlases out of first reveal.
export const PIXEL_FORGE_NPC_STARTUP_CLIP_IDS: readonly PixelForgeNpcClipId[] = [
  'idle',
  'patrol_walk',
];
const PIXEL_FORGE_NPC_ALL_CLIP_IDS: readonly PixelForgeNpcClipId[] = PIXEL_FORGE_NPC_CLIPS.map((clip) => clip.id);

const OVERFLOW_LOG_INTERVAL_MS = 1000;
const bucketOverflowLastLog = new Map<string, number>();
const bucketOverflowPending = new Map<string, number>();

const NPC_IMPOSTOR_VERTEX_SHADER = `
  varying vec2 vUv;
  varying float vPhase;
  varying float vViewColumn;
  varying float vAnimationProgress;
  varying float vOpacity;
  varying float vDistance;
  varying float vWorldY;

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
    vDistance = length(cameraPosition - worldPosition.xyz);
    vWorldY = worldPosition.y;
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
  uniform sampler2D tileCropMap;
  uniform vec2 tileCropMapSize;
  uniform float parityScale;
  uniform float parityLift;
  uniform float paritySaturation;
  uniform float npcLightingEnabled;
  uniform float npcAtmosphereLightScale;
  uniform vec3 npcSkyColor;
  uniform vec3 npcGroundColor;
  uniform vec3 npcSunColor;
  uniform float npcFogMode;
  uniform vec3 npcFogColor;
  uniform float npcFogDensity;
  uniform float npcFogHeightFalloff;
  uniform float npcFogStartDistance;
  uniform float npcFogNear;
  uniform float npcFogFar;

  varying vec2 vUv;
  varying float vPhase;
  varying float vViewColumn;
  varying float vAnimationProgress;
  varying float vOpacity;
  varying float vDistance;
  varying float vWorldY;

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
    vec4 tileCrop = texture2D(tileCropMap, (tile + vec2(0.5)) / tileCropMapSize);
    vec2 croppedUv = mix(tileCrop.xy, tileCrop.zw, vUv);
    vec2 sampleUv = vec2(
      (tile.x + croppedUv.x) / atlasGrid.x,
      1.0 - ((tile.y + 1.0 - croppedUv.y) / atlasGrid.y)
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
    npcColor = min(npcColor * parityScale + vec3(parityLift), vec3(1.0));
    float parityLuma = dot(npcColor, vec3(0.299, 0.587, 0.114));
    npcColor = clamp(mix(vec3(parityLuma), npcColor, paritySaturation), 0.0, 1.0);
    float alpha = texColor.a * clamp(vOpacity, 0.0, 1.0);
    if (npcLightingEnabled > 0.5) {
      vec3 atmosphereTint = mix(npcGroundColor, npcSkyColor, 0.42 + 0.58 * vUv.y) + npcSunColor * 0.18;
      float atmosphereLuma = max(dot(atmosphereTint, vec3(0.299, 0.587, 0.114)), 0.001);
      vec3 normalizedTint = clamp(atmosphereTint / atmosphereLuma, vec3(0.62), vec3(1.38));
      npcColor = clamp(npcColor * normalizedTint * npcAtmosphereLightScale, 0.0, 1.0);
    }
    if (npcFogMode > 0.5) {
      float fogFactor = 0.0;
      if (npcFogMode > 1.5) {
        fogFactor = smoothstep(npcFogNear, npcFogFar, vDistance);
      } else {
        float effectiveDistance = max(0.0, vDistance - npcFogStartDistance);
        fogFactor = 1.0 - exp(-npcFogDensity * effectiveDistance);
      }
      float heightFactor = exp(-npcFogHeightFalloff * max(0.0, vWorldY));
      float edgeFogMask = smoothstep(0.18, 0.6, texColor.a);
      fogFactor = clamp(fogFactor * heightFactor * edgeFogMask, 0.0, 1.0);
      float fogColorLuma = dot(npcFogColor, vec3(0.299, 0.587, 0.114));
      float maxFogBoost = mix(2.2, 1.55, smoothstep(0.35, 0.65, fogColorLuma));
      float fogBoost = mix(1.0, maxFogBoost, smoothstep(0.45, 0.95, fogFactor));
      vec3 fogMatchColor = min(npcFogColor * fogBoost, vec3(1.0));
      npcColor = mix(npcColor, fogMatchColor, fogFactor);
    }
    gl_FragColor = vec4(npcColor, alpha);
  }
`;

function createPixelForgeNpcTileCropTexture(clipId: PixelForgeNpcClipId): {
  texture: THREE.DataTexture;
  size: THREE.Vector2;
} {
  const cropMap = getPixelForgeNpcTileCropMap(clipId);
  const texture = new THREE.DataTexture(
    Uint8Array.from(cropMap.data),
    cropMap.width,
    cropMap.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `PixelForge.NPC.${clipId}.tileCropMap`;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size: new THREE.Vector2(cropMap.width, cropMap.height) };
}

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

  private resolveBucketSpec(factionKey: Faction | 'SQUAD'): {
    textureFaction: Faction;
    packageFaction: PixelForgeNpcFactionAsset['packageFaction'];
    markerColor: THREE.Color;
  } | null {
    if (factionKey === 'SQUAD') {
      return {
        textureFaction: Faction.US,
        packageFaction: 'usArmy',
        markerColor: FACTION_MARKER_COLORS.SQUAD,
      };
    }

    const faction = PIXEL_FORGE_NPC_FACTIONS.find((candidate) => candidate.runtimeFaction === factionKey);
    if (!faction) return null;
    return {
      textureFaction: faction.runtimeFaction as Faction,
      packageFaction: faction.packageFaction,
      markerColor: FACTION_MARKER_COLORS[factionKey],
    };
  }

  private createImpostorMaterial(
    texture: THREE.Texture,
    clipId: PixelForgeNpcClipId,
    readabilityColor: THREE.Color,
    tuning: PixelForgeNpcImposterMaterialTuning,
  ): THREE.ShaderMaterial {
    const clip = PIXEL_FORGE_NPC_CLIPS.find((candidate) => candidate.id === clipId);
    if (!clip) {
      throw new Error(`Unknown Pixel Forge NPC clip: ${clipId}`);
    }
    const tileCrop = createPixelForgeNpcTileCropTexture(clipId);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        time: { value: 0 },
        clipDuration: { value: clip.durationSec },
        framesPerClip: { value: clip.framesPerClip },
        viewGrid: { value: new THREE.Vector2(clip.viewGridX, clip.viewGridY) },
        frameGrid: { value: new THREE.Vector2(clip.framesX, clip.framesY) },
        combatState: { value: 0 },
        readabilityColor: { value: readabilityColor.clone() },
        readabilityStrength: { value: tuning.readabilityStrength },
        npcExposure: { value: tuning.npcExposure },
        minNpcLight: { value: tuning.minNpcLight },
        npcTopLight: { value: tuning.npcTopLight },
        animationMode: { value: clipId === 'death_fall_back' ? 1 : 0 },
        tileCropMap: { value: tileCrop.texture },
        tileCropMapSize: { value: tileCrop.size },
        parityScale: { value: tuning.parityScale },
        parityLift: { value: tuning.parityLift },
        paritySaturation: { value: tuning.paritySaturation },
        npcLightingEnabled: { value: 0 },
        npcAtmosphereLightScale: { value: 1 },
        npcSkyColor: { value: new THREE.Color(1, 1, 1) },
        npcGroundColor: { value: new THREE.Color(0.35, 0.35, 0.3) },
        npcSunColor: { value: new THREE.Color(1, 1, 1) },
        npcFogMode: { value: 0 },
        npcFogColor: { value: new THREE.Color(0x7a8f88) },
        npcFogDensity: { value: 0.00055 },
        npcFogHeightFalloff: { value: 0.03 },
        npcFogStartDistance: { value: 100 },
        npcFogNear: { value: 100 },
        npcFogFar: { value: 600 },
      },
      vertexShader: NPC_IMPOSTOR_VERTEX_SHADER,
      fragmentShader: NPC_IMPOSTOR_FRAGMENT_SHADER,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: true,
    });
    material.addEventListener('dispose', () => tileCrop.texture.dispose());
    return material;
  }

  private createMeshSet(
    texture: THREE.Texture,
    key: string,
    clipId: PixelForgeNpcClipId,
    markerColor: THREE.Color,
    packageFaction: PixelForgeNpcFactionAsset['packageFaction'],
    maxInstances: number,
  ): { mesh: THREE.InstancedMesh; material: THREE.ShaderMaterial; marker: THREE.InstancedMesh } {
    const geometry = new THREE.PlaneGeometry(NPC_SPRITE_WIDTH, NPC_SPRITE_HEIGHT);
    geometry.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceViewColumn', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceAnimationProgress', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances).fill(1), 1));

    const material = this.createImpostorMaterial(
      texture,
      clipId,
      markerColor,
      PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING[packageFaction],
    );
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

  createFactionImpostorBucket(
    factionKey: Faction | 'SQUAD',
    clipId: PixelForgeNpcClipId,
    maxInstances: number = DEFAULT_MESH_BUCKET_CAPACITY,
  ): CombatantImpostorBucketAssets | null {
    const spec = this.resolveBucketSpec(factionKey);
    if (!spec) {
      Logger.warn('combat', `Unknown Pixel Forge NPC bucket faction: ${factionKey}`);
      return null;
    }

    const texture = this.assetLoader.getTexture(pixelForgeNpcTextureName(spec.textureFaction, clipId));
    if (!texture) {
      Logger.warn('combat', `Missing Pixel Forge NPC impostor texture for ${spec.textureFaction}/${clipId}`);
      return null;
    }

    const key = getPixelForgeNpcBucketKey(factionKey, clipId);
    const { mesh, material, marker } = this.createMeshSet(
      texture,
      key,
      clipId,
      spec.markerColor,
      spec.packageFaction,
      maxInstances,
    );
    return { key, mesh, marker, texture, material };
  }

  createFactionBillboards(
    initialClipIds: readonly PixelForgeNpcClipId[] = PIXEL_FORGE_NPC_ALL_CLIP_IDS,
  ): CombatantMeshAssets {
    const factionMeshes = new Map<string, THREE.InstancedMesh>();
    const factionAuraMeshes = new Map<string, THREE.InstancedMesh>();
    const factionGroundMarkers = new Map<string, THREE.InstancedMesh>();
    const soldierTextures = new Map<string, THREE.Texture>();
    const factionMaterials = new Map<string, THREE.ShaderMaterial>();
    const walkFrameTextures: WalkFrameMap = new Map();

    const registerBucket = (bucket: CombatantImpostorBucketAssets | null): void => {
      if (!bucket) return;
      factionMeshes.set(bucket.key, bucket.mesh);
      factionGroundMarkers.set(bucket.key, bucket.marker);
      factionMaterials.set(bucket.key, bucket.material);
      soldierTextures.set(bucket.key, bucket.texture);
    };

    for (const faction of PIXEL_FORGE_NPC_FACTIONS) {
      for (const clipId of initialClipIds) {
        registerBucket(
          this.createFactionImpostorBucket(
            faction.runtimeFaction as Faction,
            clipId,
            DEFAULT_MESH_BUCKET_CAPACITY,
          ),
        );
      }
    }
    for (const clipId of initialClipIds) {
      registerBucket(this.createFactionImpostorBucket('SQUAD', clipId, DEFAULT_MESH_BUCKET_CAPACITY));
    }

    Logger.info('combat', `Created Pixel Forge NPC startup impostor buckets: ${factionMeshes.size} meshes`);

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
