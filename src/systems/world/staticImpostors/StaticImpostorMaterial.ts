// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  asin,
  atan,
  cameraPosition,
  clamp as tslClamp,
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
import { RIG_HEMI_UP_SKY_WEIGHT, RIG_WRAP } from '../billboard/BillboardNodeMaterial';

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

type TslNode = any;

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const STATIC_IMPOSTOR_ALPHA_TEST = 0.08;
const STATIC_IMPOSTOR_LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslReference = (type: string, uniform: StaticImpostorMaterialUniform<unknown>): TslNode => (
  reference('value', type, uniform) as TslNode
);
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => texture(source, sampleUv) as TslNode;
const tslInstancedBufferAttribute = (
  attribute: THREE.InstancedBufferAttribute,
  type: string,
): TslNode => instancedBufferAttribute(attribute, type) as TslNode;

export function createStaticImpostorNodeMaterial(
  archetype: StaticImpostorArchetype,
  textures: StaticImpostorMaterialTextures,
  positionAttribute: THREE.InstancedBufferAttribute,
  scaleAttribute: THREE.InstancedBufferAttribute,
  yawAttribute: THREE.InstancedBufferAttribute,
): StaticImpostorNodeMaterial {
  configureStaticImpostorTexture(textures.baseColorMap, THREE.SRGBColorSpace);
  configureStaticImpostorTexture(textures.normalMap, THREE.NoColorSpace);
  configureStaticImpostorTexture(textures.depthMap, THREE.NoColorSpace);

  const uniforms: StaticImpostorMaterialUniforms = {
    baseColorMap: { value: textures.baseColorMap },
    normalMap: { value: textures.normalMap },
    depthMap: { value: textures.depthMap },
    atlasTiles: { value: new THREE.Vector2(archetype.columns, archetype.rows) },
    cameraPosition: { value: new THREE.Vector3() },
    parallaxStrength: { value: archetype.parallaxStrength },
    alphaCutoff: { value: STATIC_IMPOSTOR_ALPHA_TEST },
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

  const atlas = createStaticImpostorAtlasNodes(textures, uniforms, instancePosition, instanceYaw);
  const color = atlas.color as TslNode;
  const normal = atlas.normal.rgb.mul(2).sub(1).normalize();
  const litColor = createStaticImpostorLightingNode(color.rgb, normal);
  material.colorNode = litColor.mul(color.a);
  material.opacityNode = color.a;
  material.alphaTestNode = tslReference('float', uniforms.alphaCutoff);

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
  const baseAtlasUv = atlasUv(localUv, tileX, tileY, invTiles);
  const nextAtlasUv = atlasUv(localUv, nextTileX, tileY, invTiles);

  const depth = mix(
    tslTexture(textures.depthMap, baseAtlasUv),
    tslTexture(textures.depthMap, nextAtlasUv),
    tileBlend,
  ) as TslNode;
  const parallaxStrength = tslReference('float', uniforms.parallaxStrength);
  const parallax = depth.r.sub(0.5).mul(parallaxStrength);
  const uvFromCenter = localUv.sub(tslVec2(tslFloat(0.5), tslFloat(0.5)));
  const parallaxLocalUv = tslClamp(
    localUv.add(uvFromCenter.mul(parallax)),
    tslVec2(tslFloat(0.001), tslFloat(0.001)),
    tslVec2(tslFloat(0.999), tslFloat(0.999)),
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

function createStaticImpostorLightingNode(baseColor: TslNode, normal: TslNode): TslNode {
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
