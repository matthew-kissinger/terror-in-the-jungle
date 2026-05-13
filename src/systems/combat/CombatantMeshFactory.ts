import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  clamp as tslClamp,
  dot,
  exp,
  float,
  floor,
  max as tslMax,
  min as tslMin,
  mix,
  positionWorld,
  reference,
  smoothstep,
  step,
  texture as tslTextureNode,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
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
import type { CombatantUniformMaterial } from './CombatantShaders';

export type ViewDirection = 'front' | 'back' | 'side';
export type WalkFrameMap = Map<string, { a: THREE.Texture; b: THREE.Texture }>;

interface CombatantMeshAssets {
  factionMeshes: Map<string, THREE.InstancedMesh>;
  factionAuraMeshes: Map<string, THREE.InstancedMesh>;
  factionGroundMarkers: Map<string, THREE.InstancedMesh>;
  soldierTextures: Map<string, THREE.Texture>;
  factionMaterials: Map<string, CombatantUniformMaterial>;
  walkFrameTextures: WalkFrameMap;
}

export interface CombatantImpostorBucketAssets {
  key: string;
  mesh: THREE.InstancedMesh;
  marker: THREE.InstancedMesh;
  texture: THREE.Texture;
  material: CombatantUniformMaterial;
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
const NPC_GROUND_MARKER_PERF_CATEGORY = 'npc_ground_markers';
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

type TslNode = any;

const tslAttribute = (name: string, type: string): TslNode => attribute(name, type) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => tslTextureNode(source, sampleUv) as TslNode;
const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslReference = (type: string, uniform: { value: unknown }): TslNode => reference('value', type, uniform) as TslNode;
const tslPositionWorld = positionWorld as TslNode;
const tslCameraPosition = cameraPosition as TslNode;

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

function createNpcImpostorAtlasSample(
  texture: THREE.Texture,
  tileCropTexture: THREE.Texture,
  uniforms: Record<string, { value: unknown }>,
): {
  texColor: TslNode;
  alpha: TslNode;
} {
  const phase = tslAttribute('instancePhase', 'float');
  const viewColumn = tslAttribute('instanceViewColumn', 'float');
  const viewRow = tslAttribute('instanceViewRow', 'float');
  const animationProgress = tslAttribute('instanceAnimationProgress', 'float');
  const instanceOpacity = tslAttribute('instanceOpacity', 'float');
  const time = tslReference('float', uniforms.time);
  const clipDuration = tslReference('float', uniforms.clipDuration);
  const framesPerClip = tslReference('float', uniforms.framesPerClip);
  const viewGrid = tslReference('vec2', uniforms.viewGrid);
  const frameGrid = tslReference('vec2', uniforms.frameGrid);
  const horizontalCropExpansion = tslReference('float', uniforms.horizontalCropExpansion);
  const animationMode = tslReference('float', uniforms.animationMode);
  const tileCropMapSize = tslReference('vec2', uniforms.tileCropMapSize);
  const safeDuration = tslMax(clipDuration, tslFloat(0.001));
  const loopFrame = floor(time.add(phase.mul(safeDuration)).div(safeDuration).mul(framesPerClip).mod(framesPerClip));
  const oneShotFrame = floor(tslClamp(animationProgress, tslFloat(0), tslFloat(0.999)).mul(framesPerClip));
  const frame = tslMix(loopFrame, oneShotFrame, step(tslFloat(0.5), animationMode));
  const frameX = frame.mod(frameGrid.x);
  const frameY = floor(frame.div(frameGrid.x));
  const viewX = tslClamp(floor(viewColumn.add(0.5)), tslFloat(0), viewGrid.x.sub(1));
  const viewY = tslClamp(floor(viewRow.add(0.5)), tslFloat(0), viewGrid.y.sub(1));
  const atlasGrid = viewGrid.mul(frameGrid);
  const tile = tslVec2(frameX.mul(viewGrid.x).add(viewX), frameY.mul(viewGrid.y).add(viewY));
  const tileCrop = tslTexture(tileCropTexture, tile.add(tslVec2(0.5, 0.5)).div(tileCropMapSize));
  const cropCenterX = tileCrop.x.add(tileCrop.z).mul(0.5);
  const cropHalfX = tileCrop.z.sub(tileCrop.x).mul(0.5).mul(tslMax(horizontalCropExpansion, tslFloat(1)));
  const cropMin = tslVec2(tslMax(tslFloat(0), cropCenterX.sub(cropHalfX)), tileCrop.y);
  const cropMax = tslVec2(tslMin(tslFloat(1), cropCenterX.add(cropHalfX)), tileCrop.w);
  const croppedUv = tslMix(cropMin, cropMax, uv() as TslNode);
  const sampleUv = tslVec2(
    tile.x.add(croppedUv.x).div(atlasGrid.x),
    tslFloat(1).sub(tile.y.add(1).sub(croppedUv.y).div(atlasGrid.y)),
  );
  const texColor = tslTexture(texture, sampleUv);
  const alpha = texColor.a.mul(tslClamp(instanceOpacity, tslFloat(0), tslFloat(1)));
  return { texColor, alpha };
}

function createNpcImpostorColorNode(
  texture: THREE.Texture,
  tileCropTexture: THREE.Texture,
  uniforms: Record<string, { value: unknown }>,
): TslNode {
  const { texColor } = createNpcImpostorAtlasSample(texture, tileCropTexture, uniforms);
  const combatState = tslReference('float', uniforms.combatState);
  const readabilityColor = tslReference('color', uniforms.readabilityColor);
  const readabilityStrength = tslReference('float', uniforms.readabilityStrength);
  const npcExposure = tslReference('float', uniforms.npcExposure);
  const minNpcLight = tslReference('float', uniforms.minNpcLight);
  const npcTopLight = tslReference('float', uniforms.npcTopLight);
  const parityScale = tslReference('float', uniforms.parityScale);
  const parityLift = tslReference('float', uniforms.parityLift);
  const paritySaturation = tslReference('float', uniforms.paritySaturation);
  const npcLightingEnabled = tslReference('float', uniforms.npcLightingEnabled);
  const npcAtmosphereLightScale = tslReference('float', uniforms.npcAtmosphereLightScale);
  const npcSkyColor = tslReference('color', uniforms.npcSkyColor);
  const npcGroundColor = tslReference('color', uniforms.npcGroundColor);
  const npcSunColor = tslReference('color', uniforms.npcSunColor);
  const npcFogMode = tslReference('float', uniforms.npcFogMode);
  const npcFogColor = tslReference('color', uniforms.npcFogColor);
  const npcFogDensity = tslReference('float', uniforms.npcFogDensity);
  const npcFogHeightFalloff = tslReference('float', uniforms.npcFogHeightFalloff);
  const npcFogStartDistance = tslReference('float', uniforms.npcFogStartDistance);
  const npcFogNear = tslReference('float', uniforms.npcFogNear);
  const npcFogFar = tslReference('float', uniforms.npcFogFar);
  const baseUv = uv() as TslNode;
  const alertBoost = tslMix(tslVec3(1, 1, 1), tslVec3(1.12, 1.06, 0.96), tslClamp(combatState, tslFloat(0), tslFloat(1)));
  let npcColor = texColor.rgb.mul(alertBoost);
  const luma = dot(npcColor, tslVec3(0.299, 0.587, 0.114));
  npcColor = tslMix(tslVec3(luma), npcColor, tslFloat(1.22));
  npcColor = tslMin(npcColor.add(tslVec3(0.045, 0.040, 0.030)), tslVec3(1, 1, 1));
  const readabilityLift = readabilityColor.mul(tslFloat(0.18).add(tslFloat(0.12).mul(combatState)));
  npcColor = tslMix(npcColor, tslMin(npcColor.add(readabilityLift), tslVec3(1, 1, 1)), readabilityStrength);
  const topLight = smoothstep(tslFloat(0.12), tslFloat(1), baseUv.y).mul(npcTopLight);
  const npcLight = tslMax(minNpcLight, minNpcLight.add(topLight));
  npcColor = tslMin(npcColor.mul(npcExposure).mul(npcLight), tslVec3(1, 1, 1));
  npcColor = tslMin(npcColor.mul(parityScale).add(tslVec3(parityLift)), tslVec3(1, 1, 1));
  const parityLuma = dot(npcColor, tslVec3(0.299, 0.587, 0.114));
  npcColor = tslClamp(tslMix(tslVec3(parityLuma), npcColor, paritySaturation), tslVec3(0, 0, 0), tslVec3(1, 1, 1));

  const atmosphereTint = tslMix(npcGroundColor, npcSkyColor, tslFloat(0.42).add(tslFloat(0.58).mul(baseUv.y)))
    .add(npcSunColor.mul(0.18));
  const atmosphereLuma = tslMax(dot(atmosphereTint, tslVec3(0.299, 0.587, 0.114)), tslFloat(0.001));
  const normalizedTint = tslClamp(atmosphereTint.div(atmosphereLuma), tslVec3(0.62, 0.62, 0.62), tslVec3(1.38, 1.38, 1.38));
  npcColor = tslMix(
    npcColor,
    tslClamp(npcColor.mul(normalizedTint).mul(npcAtmosphereLightScale), tslVec3(0, 0, 0), tslVec3(1, 1, 1)),
    step(tslFloat(0.5), npcLightingEnabled),
  );

  const cameraDistance = tslCameraPosition.sub(tslPositionWorld).length();
  const expFog = tslFloat(1).sub(exp(npcFogDensity.negate().mul(tslMax(tslFloat(0), cameraDistance.sub(npcFogStartDistance)))));
  const linearFog = smoothstep(npcFogNear, npcFogFar, cameraDistance);
  const fogModeLinear = step(tslFloat(1.5), npcFogMode);
  const heightFactor = exp(npcFogHeightFalloff.negate().mul(tslMax(tslFloat(0), tslPositionWorld.y)));
  const edgeFogMask = smoothstep(tslFloat(0.18), tslFloat(0.6), texColor.a);
  let fogFactor = tslMix(expFog, linearFog, fogModeLinear).mul(heightFactor).mul(edgeFogMask);
  fogFactor = tslClamp(fogFactor, tslFloat(0), tslFloat(1)).mul(step(tslFloat(0.5), npcFogMode));
  const fogColorLuma = dot(npcFogColor, tslVec3(0.299, 0.587, 0.114));
  const maxFogBoost = tslMix(tslFloat(2.2), tslFloat(1.55), smoothstep(tslFloat(0.35), tslFloat(0.65), fogColorLuma));
  const fogBoost = tslMix(tslFloat(1), maxFogBoost, smoothstep(tslFloat(0.45), tslFloat(0.95), fogFactor));
  const fogMatchColor = tslMin(npcFogColor.mul(fogBoost), tslVec3(1, 1, 1));
  return tslMix(npcColor, fogMatchColor, fogFactor);
}

function createNpcImpostorOpacityNode(
  texture: THREE.Texture,
  tileCropTexture: THREE.Texture,
  uniforms: Record<string, { value: unknown }>,
): TslNode {
  return createNpcImpostorAtlasSample(texture, tileCropTexture, uniforms).alpha;
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
  viewRow: number,
  animationProgress = 0,
  opacity = 1,
): void {
  const phaseAttribute = mesh.geometry.getAttribute('instancePhase') as THREE.InstancedBufferAttribute | undefined;
  const viewAttribute = mesh.geometry.getAttribute('instanceViewColumn') as THREE.InstancedBufferAttribute | undefined;
  const viewRowAttribute = mesh.geometry.getAttribute('instanceViewRow') as THREE.InstancedBufferAttribute | undefined;
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
  if (viewRowAttribute) {
    viewRowAttribute.setX(index, viewRow);
    viewRowAttribute.needsUpdate = true;
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
  ): CombatantUniformMaterial {
    const clip = PIXEL_FORGE_NPC_CLIPS.find((candidate) => candidate.id === clipId);
    if (!clip) {
      throw new Error(`Unknown Pixel Forge NPC clip: ${clipId}`);
    }
    const tileCrop = createPixelForgeNpcTileCropTexture(clipId);
    const uniforms = {
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
      horizontalCropExpansion: { value: tuning.horizontalCropExpansion },
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
    };

    const material = new MeshBasicNodeMaterial({
      name: `PixelForgeNpcImpostor.${clipId}.nodeMaterial`,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: true,
    }) as MeshBasicNodeMaterial & CombatantUniformMaterial & {
      isKonveyerNpcImpostorNodeMaterial: true;
    };
    material.isKonveyerNpcImpostorNodeMaterial = true;
    material.fog = false;
    material.uniforms = uniforms;
    material.colorNode = createNpcImpostorColorNode(texture, tileCrop.texture, uniforms);
    material.opacityNode = createNpcImpostorOpacityNode(texture, tileCrop.texture, uniforms);
    material.alphaTestNode = tslFloat(0.18);
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
  ): { mesh: THREE.InstancedMesh; material: CombatantUniformMaterial; marker: THREE.InstancedMesh } {
    const geometry = new THREE.PlaneGeometry(NPC_SPRITE_WIDTH, NPC_SPRITE_HEIGHT);
    geometry.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceViewColumn', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
    geometry.setAttribute('instanceViewRow', new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1));
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
    mesh.visible = false;
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
    marker.name = `PixelForgeNpcGroundMarker.${key}`;
    marker.userData.perfCategory = NPC_GROUND_MARKER_PERF_CATEGORY;
    marker.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    marker.frustumCulled = false;
    marker.count = 0;
    marker.visible = false;
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
    const factionMaterials = new Map<string, CombatantUniformMaterial>();
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
