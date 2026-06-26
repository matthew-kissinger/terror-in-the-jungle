// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  asin,
  atan,
  cameraPosition,
  clamp as tslClamp,
  cross,
  exp,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max as tslMax,
  min as tslMin,
  mix,
  positionGeometry,
  pow,
  reference,
  select,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { StaticImpostorArchetype } from '../../../config/staticImpostorArchetypes';
import { lightingRigBindings } from '../../environment/LightingRig';
import {
  HUMID_JUNGLE_VEGETATION_EXPOSURE,
  HUMID_JUNGLE_VEGETATION_TINT,
  RIG_HEMI_UP_SKY_WEIGHT,
  RIG_LOW_SUN_FADE_FLOOR,
  RIG_LOW_SUN_FADE_HI,
  RIG_LOW_SUN_FADE_LO,
  RIG_WRAP,
} from '../billboard/BillboardNodeMaterial';

interface StaticImpostorMaterialUniform<T> {
  value: T;
}

interface StaticImpostorMaterialUniforms {
  baseColorMap: StaticImpostorMaterialUniform<THREE.Texture>;
  normalMap: StaticImpostorMaterialUniform<THREE.Texture>;
  depthMap: StaticImpostorMaterialUniform<THREE.Texture>;
  atlasTiles: StaticImpostorMaterialUniform<THREE.Vector2>;
  cameraPosition: StaticImpostorMaterialUniform<THREE.Vector3>;
  parallaxStrength: StaticImpostorMaterialUniform<number>;
  alphaCutoff: StaticImpostorMaterialUniform<number>;
  fogColor: StaticImpostorMaterialUniform<THREE.Color>;
  fogDensity: StaticImpostorMaterialUniform<number>;
  fogHeightFalloff: StaticImpostorMaterialUniform<number>;
  fogStartDistance: StaticImpostorMaterialUniform<number>;
  fogEnabled: StaticImpostorMaterialUniform<boolean>;
  fogStrength: StaticImpostorMaterialUniform<number>;
  foliageExposure: StaticImpostorMaterialUniform<number>;
  foliageColorGamma: StaticImpostorMaterialUniform<number>;
  foliageSaturation: StaticImpostorMaterialUniform<number>;
}

export type StaticImpostorNodeMaterial = MeshBasicNodeMaterial & {
  uniforms: StaticImpostorMaterialUniforms;
  isStaticImpostorNodeMaterial: true;
};

export interface StaticImpostorMaterialTextures {
  baseColorMap: THREE.Texture;
  normalMap: THREE.Texture;
  depthMap: THREE.Texture;
}

export interface StaticImpostorMaterialTuning {
  readonly fogStrength?: number;
  readonly foliageExposureScale?: number;
  readonly foliageColorGamma?: number;
  readonly foliageSaturation?: number;
}

type TslNode = any;

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const STATIC_IMPOSTOR_ALPHA_TEST = 0.22;
const STATIC_IMPOSTOR_LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
const DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY = 0.00055;
const STATIC_IMPOSTOR_FOG_HEIGHT_FALLOFF = 0.03;
const STATIC_IMPOSTOR_FOG_START_DISTANCE = 100;
const STATIC_IMPOSTOR_TILE_UV_MARGIN_PIXELS = 1.5;
const STATIC_IMPOSTOR_FOLIAGE_COLOR_GAMMA = 1.75;
const STATIC_IMPOSTOR_FOLIAGE_SATURATION = 1;
// Hero-tree impostor atlases are baked from full GLBs and read brighter than
// the legacy hand-authored billboard sheets. Keep the shared foliage tint and
// rig response, but trim the static hero exposure so LOD snaps do not bloom pale.
export const STATIC_IMPOSTOR_FOLIAGE_EXPOSURE = HUMID_JUNGLE_VEGETATION_EXPOSURE * 0.68;

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslReference = (type: string, uniform: StaticImpostorMaterialUniform<unknown>): TslNode => (
  reference('value', type, uniform) as TslNode
);
const tslCross = (...args: TslNode[]): TslNode => (cross as (...values: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslSelect = (...args: TslNode[]): TslNode => (select as (...values: TslNode[]) => TslNode)(...args);
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => texture(source, sampleUv) as TslNode;
const tslInstancedBufferAttribute = (
  attribute: THREE.InstancedBufferAttribute,
  type: string,
): TslNode => instancedBufferAttribute(attribute, type) as TslNode;

const clampFinite = (value: number | undefined, fallback: number, min: number, max: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export function createStaticImpostorNodeMaterial(
  archetype: StaticImpostorArchetype,
  textures: StaticImpostorMaterialTextures,
  positionAttribute: THREE.InstancedBufferAttribute,
  scaleAttribute: THREE.InstancedBufferAttribute,
  yawAttribute: THREE.InstancedBufferAttribute,
  opacityAttribute?: THREE.InstancedBufferAttribute,
  tuning: StaticImpostorMaterialTuning = {},
): StaticImpostorNodeMaterial {
  configureStaticImpostorTexture(textures.baseColorMap, THREE.SRGBColorSpace);
  configureStaticImpostorTexture(textures.normalMap, THREE.NoColorSpace);
  configureStaticImpostorTexture(textures.depthMap, THREE.NoColorSpace);
  const foliageExposureScale = clampFinite(tuning.foliageExposureScale, 1, 0, 2);
  const foliageColorGamma = clampFinite(
    tuning.foliageColorGamma,
    STATIC_IMPOSTOR_FOLIAGE_COLOR_GAMMA,
    0.6,
    2.5,
  );
  const foliageSaturation = clampFinite(
    tuning.foliageSaturation,
    STATIC_IMPOSTOR_FOLIAGE_SATURATION,
    0,
    1.25,
  );

  const uniforms: StaticImpostorMaterialUniforms = {
    baseColorMap: { value: textures.baseColorMap },
    normalMap: { value: textures.normalMap },
    depthMap: { value: textures.depthMap },
    atlasTiles: { value: new THREE.Vector2(archetype.columns, archetype.rows) },
    cameraPosition: { value: new THREE.Vector3() },
    parallaxStrength: { value: archetype.parallaxStrength },
    alphaCutoff: { value: STATIC_IMPOSTOR_ALPHA_TEST },
    fogColor: { value: new THREE.Color(0x5a7a6a) },
    fogDensity: { value: DEFAULT_STATIC_IMPOSTOR_FOG_DENSITY },
    fogHeightFalloff: { value: STATIC_IMPOSTOR_FOG_HEIGHT_FALLOFF },
    fogStartDistance: { value: STATIC_IMPOSTOR_FOG_START_DISTANCE },
    fogEnabled: { value: false },
    fogStrength: { value: clampFinite(tuning.fogStrength, 1, 0, 1.5) },
    foliageExposure: { value: STATIC_IMPOSTOR_FOLIAGE_EXPOSURE * foliageExposureScale },
    foliageColorGamma: { value: foliageColorGamma },
    foliageSaturation: { value: foliageSaturation },
  };

  const material = new MeshBasicNodeMaterial({
    name: `static-impostor-${archetype.slug}`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    alphaTest: STATIC_IMPOSTOR_ALPHA_TEST,
    forceSinglePass: true,
  }) as StaticImpostorNodeMaterial;
  material.isStaticImpostorNodeMaterial = true;
  material.uniforms = uniforms;
  material.fog = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

  const instancePosition = tslInstancedBufferAttribute(positionAttribute, 'vec3');
  const instanceScale = tslInstancedBufferAttribute(scaleAttribute, 'vec2');
  const instanceYaw = tslInstancedBufferAttribute(yawAttribute, 'float');
  const instanceOpacity = opacityAttribute
    ? tslInstancedBufferAttribute(opacityAttribute, 'float')
    : tslFloat(1);

  const toCamera = cameraPosition.sub(instancePosition);
  const toCameraXZ = tslVec3(toCamera.x, 0, toCamera.z);
  const xzLength = length(toCameraXZ);
  const forwardBlend = smoothstep(tslFloat(0.05), tslFloat(0.3), xzLength);
  const safeForward = mix(
    tslVec3(1, 0, 0),
    toCameraXZ.div(tslMax(xzLength, tslFloat(0.001))),
    forwardBlend,
  ) as TslNode;
  const right = tslVec3(safeForward.z, 0, safeForward.x.negate());
  const up = tslVec3(0, 1, 0);

  material.positionNode = instancePosition
    .add(right.mul(positionGeometry.x.mul(instanceScale.x)))
    .add(up.mul(positionGeometry.y.mul(instanceScale.y)));

  const atlas = createStaticImpostorAtlasNodes(textures, uniforms, instancePosition, instanceYaw, archetype);
  const color = atlas.color as TslNode;
  const alphaCutoff = tslReference('float', uniforms.alphaCutoff);
  const hardenedAlpha = tslMix(
    color.a,
    tslFloat(1),
    smoothstep(alphaCutoff, tslFloat(0.65), color.a),
  );
  const visibleAlpha = hardenedAlpha.mul(tslClamp(instanceOpacity, tslFloat(0), tslFloat(1)));
  const normal = createStaticImpostorCaptureViewNormalNode(atlas.normal.rgb, instancePosition);
  const baseColor = archetype.lightingProfile === 'foliage-card'
    ? createStaticImpostorFoliageColorNode(color.rgb, uniforms)
    : color.rgb;
  const litColor = createStaticImpostorLightingNode(baseColor, normal, archetype);
  const cameraDistance = length(cameraPosition.sub(instancePosition));
  const worldY = instancePosition.y.add(positionGeometry.y.mul(instanceScale.y));
  const exposure = archetype.lightingProfile === 'foliage-card'
    ? tslReference('float', uniforms.foliageExposure)
    : tslFloat(1);
  const foggedColor = createStaticImpostorFogNode(
    litColor.mul(exposure),
    visibleAlpha,
    worldY,
    cameraDistance,
    uniforms,
  );
  material.colorNode = foggedColor.mul(visibleAlpha);
  material.opacityNode = visibleAlpha;
  material.alphaTestNode = alphaCutoff;

  return material;
}

function configureStaticImpostorTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace): void {
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

function createStaticImpostorAtlasNodes(
  textures: StaticImpostorMaterialTextures,
  uniforms: StaticImpostorMaterialUniforms,
  instancePosition: TslNode,
  instanceYaw: TslNode,
  archetype: StaticImpostorArchetype,
): { color: TslNode; normal: TslNode } {
  const atlasTiles = tslReference('vec2', uniforms.atlasTiles);
  const invTiles = atlasTiles.reciprocal();
  const toCamera = cameraPosition.sub(instancePosition);
  const viewDistance = tslMax(length(toCamera), tslFloat(0.0001));
  const elevation = asin(tslClamp(toCamera.y.div(viewDistance), tslFloat(0), tslFloat(1)));
  const elevation01 = tslClamp(elevation.div(tslFloat(HALF_PI)), tslFloat(0), tslFloat(0.999));
  const tileY = tslMin(floor(tslFloat(1).sub(elevation01).mul(atlasTiles.y)), atlasTiles.y.sub(1));

  const azimuthRaw = atan(toCamera.z, toCamera.x).sub(instanceYaw);
  const azimuthPositive = select(azimuthRaw.lessThan(0), azimuthRaw.add(tslFloat(TWO_PI)), azimuthRaw);
  const azimuthWrapped = azimuthPositive.mod(tslFloat(TWO_PI));
  const azimuthTile = azimuthWrapped.div(tslFloat(TWO_PI)).mul(atlasTiles.x);
  const tileX = floor(azimuthTile).mod(atlasTiles.x);
  const nextTileX = tileX.add(1).mod(atlasTiles.x);
  const tileBlend = smoothstep(tslFloat(0), tslFloat(1), fract(azimuthTile) as TslNode);

  const localUv = uv() as TslNode;
  const tileMargin = tslVec2(
    tslFloat(STATIC_IMPOSTOR_TILE_UV_MARGIN_PIXELS / Math.max(1, archetype.tileSize[0])),
    tslFloat(STATIC_IMPOSTOR_TILE_UV_MARGIN_PIXELS / Math.max(1, archetype.tileSize[1])),
  );
  const tileMax = tslVec2(tslFloat(1).sub(tileMargin.x), tslFloat(1).sub(tileMargin.y));
  const safeLocalUv = tslClamp(localUv, tileMargin, tileMax);
  const baseAtlasUv = atlasUv(safeLocalUv, tileX, tileY, invTiles);
  const nextAtlasUv = atlasUv(safeLocalUv, nextTileX, tileY, invTiles);

  const depth = mix(
    tslTexture(textures.depthMap, baseAtlasUv),
    tslTexture(textures.depthMap, nextAtlasUv),
    tileBlend,
  ) as TslNode;
  const parallaxStrength = tslReference('float', uniforms.parallaxStrength);
  const parallax = depth.r.sub(0.5).mul(parallaxStrength);
  const uvFromCenter = safeLocalUv.sub(tslVec2(tslFloat(0.5), tslFloat(0.5)));
  const parallaxLocalUv = tslClamp(
    safeLocalUv.add(uvFromCenter.mul(parallax)),
    tileMargin,
    tileMax,
  );

  const sampleUv = atlasUv(parallaxLocalUv, tileX, tileY, invTiles);
  const nextSampleUv = atlasUv(parallaxLocalUv, nextTileX, tileY, invTiles);
  const color = mix(
    tslTexture(textures.baseColorMap, sampleUv),
    tslTexture(textures.baseColorMap, nextSampleUv),
    tileBlend,
  ) as TslNode;
  const normal = mix(
    tslTexture(textures.normalMap, sampleUv),
    tslTexture(textures.normalMap, nextSampleUv),
    tileBlend,
  ) as TslNode;

  return { color, normal };
}

function atlasUv(localUv: TslNode, tileX: TslNode, tileY: TslNode, invTiles: TslNode): TslNode {
  return tslVec2(
    tileX.add(localUv.x).mul(invTiles.x),
    tslFloat(1).sub(invTiles.y).sub(tileY.mul(invTiles.y)).add(localUv.y.mul(invTiles.y)),
  );
}

function createStaticImpostorCaptureViewNormalNode(normalColor: TslNode, instancePosition: TslNode): TslNode {
  const captureNormal = normalColor.mul(2).sub(1).normalize();
  const toCamera = cameraPosition.sub(instancePosition);
  const viewDistance = tslMax(length(toCamera), tslFloat(0.001));
  const forward = toCamera.div(viewDistance);
  const flatToCamera = tslVec3(toCamera.x, 0, toCamera.z);
  const flatDistance = length(flatToCamera);
  const flatBlend = smoothstep(tslFloat(0.05), tslFloat(0.3), flatDistance);
  const flatForward = tslMix(
    tslVec3(1, 0, 0),
    flatToCamera.div(tslMax(flatDistance, tslFloat(0.001))),
    flatBlend,
  );
  const right = tslVec3(flatForward.z, 0, flatForward.x.negate()).normalize();
  const captureUp = tslCross(forward, right).normalize();

  return right
    .mul(captureNormal.x)
    .add(captureUp.mul(captureNormal.y))
    .add(forward.mul(captureNormal.z))
    .normalize();
}

function createStaticImpostorLightingNode(
  baseColor: TslNode,
  normal: TslNode,
  archetype: StaticImpostorArchetype,
): TslNode {
  if (archetype.lightingProfile === 'foliage-card') {
    return createStaticImpostorFoliageLightingNode(baseColor, normal);
  }

  const rigSun = tslReference('color', lightingRigBindings.sunRadiance);
  const rigSky = tslReference('color', lightingRigBindings.skyIrradiance);
  const rigGround = tslReference('color', lightingRigBindings.groundIrradiance);
  const rigAmbient = tslReference('color', lightingRigBindings.ambientRadiance);
  const rigSunDir = tslReference('vec3', lightingRigBindings.sunDirection);
  const rigExposure = tslReference('float', lightingRigBindings.exposure);

  const wrap = tslFloat(RIG_WRAP);
  const nl = tslMax(normal.dot(rigSunDir), wrap.negate());
  const diffuse = nl.add(wrap).div(tslFloat(1).add(wrap));
  const hemiWeight = tslFloat(0.5).add(normal.y.mul(tslFloat(RIG_HEMI_UP_SKY_WEIGHT - 0.5)));
  const hemi = mix(rigGround, rigSky, hemiWeight) as TslNode;
  const lit = baseColor.mul(hemi.add(rigSun.mul(diffuse)).add(rigAmbient)).mul(rigExposure);

  const luma = lit.r.mul(STATIC_IMPOSTOR_LUMA.x)
    .add(lit.g.mul(STATIC_IMPOSTOR_LUMA.y))
    .add(lit.b.mul(STATIC_IMPOSTOR_LUMA.z));
  return mix(tslVec3(luma), pow(lit, tslVec3(tslFloat(0.96))), tslFloat(0.96)) as TslNode;
}

function createStaticImpostorFoliageColorNode(
  baseColor: TslNode,
  uniforms: StaticImpostorMaterialUniforms,
): TslNode {
  const tint = tslVec3(
    tslFloat(HUMID_JUNGLE_VEGETATION_TINT.r),
    tslFloat(HUMID_JUNGLE_VEGETATION_TINT.g),
    tslFloat(HUMID_JUNGLE_VEGETATION_TINT.b),
  );
  const colorGamma = tslReference('float', uniforms.foliageColorGamma);
  const saturation = tslReference('float', uniforms.foliageSaturation);
  const tinted = pow(baseColor.mul(tint), tslVec3(colorGamma)) as TslNode;
  const luma = tinted.r.mul(STATIC_IMPOSTOR_LUMA.x)
    .add(tinted.g.mul(STATIC_IMPOSTOR_LUMA.y))
    .add(tinted.b.mul(STATIC_IMPOSTOR_LUMA.z));
  return tslMix(tslVec3(luma), tinted, saturation);
}

function createStaticImpostorFoliageLightingNode(baseColor: TslNode, normal: TslNode): TslNode {
  const rigSun = tslReference('color', lightingRigBindings.sunRadiance);
  const rigSky = tslReference('color', lightingRigBindings.skyIrradiance);
  const rigGround = tslReference('color', lightingRigBindings.groundIrradiance);
  const rigAmbient = tslReference('color', lightingRigBindings.ambientRadiance);
  const rigSunDir = tslReference('vec3', lightingRigBindings.sunDirection);
  const rigExposure = tslReference('float', lightingRigBindings.exposure);
  const rigSunElevationSin = tslReference('float', lightingRigBindings.sunElevationSin);

  // Vegetation hero impostors are baked from real GLBs, not hand-authored flat
  // foliage cards. Use source-like clamped direct light against the transformed
  // capture normal; the billboard wrap term over-lifts backfaces and recreates
  // the pale LOD snap this path is meant to avoid.
  const cardNormal = normal;
  const diffuse = tslMax(cardNormal.dot(rigSunDir), tslFloat(0));
  const hemiWeight = tslFloat(0.5).add(
    cardNormal.y.mul(tslFloat(RIG_HEMI_UP_SKY_WEIGHT - 0.5)),
  );
  const hemi = mix(rigGround, rigSky, hemiWeight) as TslNode;
  const lowSunFade = tslFloat(RIG_LOW_SUN_FADE_FLOOR).add(
    tslFloat(1 - RIG_LOW_SUN_FADE_FLOOR).mul(
      smoothstep(
        tslFloat(RIG_LOW_SUN_FADE_LO),
        tslFloat(RIG_LOW_SUN_FADE_HI),
        rigSunElevationSin,
      ),
    ),
  );
  return baseColor
    .mul(hemi.add(rigSun.mul(diffuse).mul(lowSunFade)).add(rigAmbient))
    .mul(rigExposure);
}

function createStaticImpostorFogNode(
  baseColor: TslNode,
  alpha: TslNode,
  worldY: TslNode,
  cameraDistance: TslNode,
  uniforms: StaticImpostorMaterialUniforms,
): TslNode {
  const fogEnabled = tslReference('bool', uniforms.fogEnabled);
  const fogColor = tslReference('color', uniforms.fogColor);
  const fogDensity = tslReference('float', uniforms.fogDensity);
  const fogHeightFalloff = tslReference('float', uniforms.fogHeightFalloff);
  const fogStartDistance = tslReference('float', uniforms.fogStartDistance);
  const fogStrength = tslReference('float', uniforms.fogStrength);
  const heightFactor = exp(fogHeightFalloff.negate().mul(tslMax(tslFloat(0), worldY)));
  const effectiveDistance = tslMax(tslFloat(0), cameraDistance.sub(fogStartDistance));
  const distanceFactor = tslFloat(1).sub(exp(fogDensity.negate().mul(effectiveDistance)));
  const fogFactor = tslClamp(heightFactor.mul(distanceFactor), tslFloat(0), tslFloat(1));
  const weightedFogFactor = tslClamp(fogFactor.mul(fogStrength), tslFloat(0), tslFloat(1));
  return tslSelect(fogEnabled, tslMix(baseColor, fogColor, weightedFogFactor.mul(alpha)), baseColor) as TslNode;
}
