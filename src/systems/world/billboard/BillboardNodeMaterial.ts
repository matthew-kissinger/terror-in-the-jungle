// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  asin,
  atan,
  cameraPosition,
  clamp as tslClamp,
  distance,
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
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { VegetationAlphaCrop, VegetationAtlasProfile } from '../../../config/vegetationTypes';
import type { GPUVegetationConfig } from './BillboardTypes';
import { lightingRigBindings } from '../../environment/LightingRig';

/**
 * Wrapped-Lambert terminator softening for the unlit families (memo §2c,
 * wrap=0.5). Exported so the NPC impostor rig path consumes the SAME response
 * the billboard migration tuned — shared by import, never copied (the
 * npc-impostor-and-effects-rig brief: "no per-family re-tune; share constants
 * via import, not copy").
 */
export const RIG_WRAP = 0.5;

/**
 * Foliage low-sun direct-term attenuation (rig path, billboard-rig-migration).
 *
 * Foliage cards have no true sloped normals and no horizon ray-march, so the
 * up-biased card normal `(0,1,0)` over-catches the low warm sun: with the rig
 * ON, Phase 1 measured 17h foliage 0.180 vs terrain 0.054 — an OVERSHOOT, not
 * the legacy clamp. Terrain suppresses that low sun two ways the foliage card
 * cannot: true sloped normals turn away from a grazing sun, and
 * `terrainLowSunOcclusionMask` fades the direct term via
 * `1 - smoothstep(0.22, 0.52, lightDir.y)` (horizon occlusion strongest near the
 * horizon).
 *
 * We mirror terrain's driver directly: fade the foliage DIRECT sun term over the
 * SAME `[0.22, 0.52]` `sunDirection.y` band terrain's horizon occlusion uses
 * (`sunDirection.y == sin elevation`), so the foliage grazing-sun response is
 * suppressed on the same schedule terrain's. A floor keeps a residual direct
 * contribution at dusk: terrain retains dusk brightness, and a hard fade-to-zero
 * would crash foliage below terrain near the horizon.
 *
 * NOTE (measurement, not faked): the `cycle` TOD harness's fixed `foliage`
 * sample region samples bare down-valley terrain in the A Shau fixture — there
 * are no billboard cards in that screen band (verified by cropping the swept
 * PNGs + a `rigLit * 0.05` no-op probe that left the `foliage` luminance
 * unchanged). So the harness `foliage corrVsTerrain` / `rangeRatio` numbers are
 * terrain-vs-terrain and no billboard-side change can move them. This attenuation
 * is therefore tuned to the rig's measured per-TOD direct/hemi radiance (probe),
 * mirroring terrain's documented occlusion band, rather than to an unobservable
 * sweep metric. See the PR body for the full evidence + tables.
 */
export const RIG_LOW_SUN_FADE_LO = 0.22;
export const RIG_LOW_SUN_FADE_HI = 0.52;
export const RIG_LOW_SUN_FADE_FLOOR = 0.35;

/**
 * Hemisphere-fill sky weight for the up-facing card. The wrapped-Lambert form
 * (memo §2c) lets the up-biased card normal pick the FULL zenith sky as its
 * ambient fill (`mix(ground, sky, 0.5 + 1.0*0.5) == sky`). A real foliage tuft
 * integrates the whole hemisphere, not just the zenith, so this trims the
 * up-normal sky weight slightly below 1.0 — a documented artistic trim (memo
 * §2c: the clamp/blend constants survive only as trims, never as the mechanism).
 * Exported (`RIG_HEMI_UP_SKY_WEIGHT`) so the NPC impostor card — also a
 * camera-facing up-biased plane with no normal map — shares the identical trim.
 */
export const RIG_HEMI_UP_SKY_WEIGHT = 0.95;

const DEFAULT_BILLBOARD_FOG_DENSITY = 0.00055;
const BILLBOARD_ALPHA_TEST = 0.25;
const HUMID_JUNGLE_VEGETATION_TINT = { r: 0.72, g: 0.82, b: 0.58 } as const;
const HUMID_JUNGLE_VEGETATION_SATURATION = 0.58;
const HUMID_JUNGLE_VEGETATION_EXPOSURE = 0.82;
const HUMID_JUNGLE_MAX_VEGETATION_LIGHT = 0.78;

const clampValue = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const DEFAULT_WIND_DIRECTION: { x: number; y: number; z: number } = (() => {
  const x = 1;
  const y = 0;
  const z = 0.3;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
})();

const resolveWindStrength = (height: number, profile: VegetationAtlasProfile): number => {
  const profileMultiplier = profile === 'ground-compact'
    ? 0.55
    : profile === 'canopy-hero' || profile === 'canopy-balanced'
      ? 1.15
      : 0.85;
  return clampValue(height * 0.018 * profileMultiplier, 0.08, 0.34);
};

interface BillboardMaterialUniform<T> {
  value: T;
}

interface BillboardMaterialUniforms {
  map: BillboardMaterialUniform<THREE.Texture>;
  normalMap: BillboardMaterialUniform<THREE.Texture>;
  normalMapEnabled: BillboardMaterialUniform<boolean>;
  imposterAtlasEnabled: BillboardMaterialUniform<boolean>;
  imposterTiles: BillboardMaterialUniform<THREE.Vector2>;
  imposterUvBounds: BillboardMaterialUniform<THREE.Vector4>;
  stableAtlasAzimuth: BillboardMaterialUniform<boolean>;
  stableAtlasColumn: BillboardMaterialUniform<number>;
  maxAtlasElevationRow: BillboardMaterialUniform<number>;
  time: BillboardMaterialUniform<number>;
  cameraPosition: BillboardMaterialUniform<THREE.Vector3>;
  fadeDistance: BillboardMaterialUniform<number>;
  maxDistance: BillboardMaterialUniform<number>;
  nearFadeDistance: BillboardMaterialUniform<number>;
  lodDistances: BillboardMaterialUniform<THREE.Vector2>;
  viewMatrix: BillboardMaterialUniform<THREE.Matrix4>;
  colorTint: BillboardMaterialUniform<THREE.Color>;
  gammaAdjust: BillboardMaterialUniform<number>;
  vegetationSaturation: BillboardMaterialUniform<number>;
  nearAlphaSolidDistance: BillboardMaterialUniform<number>;
  vegetationExposure: BillboardMaterialUniform<number>;
  nearLightBoostDistance: BillboardMaterialUniform<number>;
  minVegetationLight: BillboardMaterialUniform<number>;
  maxVegetationLight: BillboardMaterialUniform<number>;
  windStrength: BillboardMaterialUniform<number>;
  windSpeed: BillboardMaterialUniform<number>;
  windSpatialScale: BillboardMaterialUniform<number>;
  windDirection: BillboardMaterialUniform<THREE.Vector3>;
  playerWorldPosition: BillboardMaterialUniform<THREE.Vector3>;
  playerImprintRadius: BillboardMaterialUniform<number>;
  playerImprintStrength: BillboardMaterialUniform<number>;
  fogColor: BillboardMaterialUniform<THREE.Color>;
  fogDensity: BillboardMaterialUniform<number>;
  fogHeightFalloff: BillboardMaterialUniform<number>;
  fogStartDistance: BillboardMaterialUniform<number>;
  fogEnabled: BillboardMaterialUniform<boolean>;
  sunColor: BillboardMaterialUniform<THREE.Color>;
  skyColor: BillboardMaterialUniform<THREE.Color>;
  groundColor: BillboardMaterialUniform<THREE.Color>;
  lightingEnabled: BillboardMaterialUniform<boolean>;
}

export type BillboardNodeMaterial = MeshBasicNodeMaterial & {
  uniforms: BillboardMaterialUniforms;
  isKonveyerBillboardNodeMaterial: true;
};

type TslNode = any;

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslReference = (type: string, uniform: BillboardMaterialUniform<unknown>): TslNode => (
  reference('value', type, uniform) as TslNode
);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslSelect = (...args: TslNode[]): TslNode => (select as (...values: TslNode[]) => TslNode)(...args);
const tslInstancedBufferAttribute = (
  attribute: THREE.InstancedBufferAttribute,
  type: string,
): TslNode => instancedBufferAttribute(attribute, type) as TslNode;
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => texture(source, sampleUv) as TslNode;

export function createBillboardNodeMaterial(
  config: GPUVegetationConfig,
  alphaCrop: Required<VegetationAlphaCrop>,
  positionAttribute: THREE.InstancedBufferAttribute,
  scaleAttribute: THREE.InstancedBufferAttribute,
  rotationAttribute: THREE.InstancedBufferAttribute,
): BillboardNodeMaterial {
  const uniforms: BillboardMaterialUniforms = {
    map: { value: config.texture },
    normalMap: { value: config.normalTexture ?? config.texture },
    normalMapEnabled: { value: Boolean(config.normalTexture && config.shaderProfile === 'normal-lit') },
    imposterAtlasEnabled: { value: Boolean(config.imposterAtlas) },
    imposterTiles: { value: new THREE.Vector2(config.imposterAtlas?.tilesX ?? 1, config.imposterAtlas?.tilesY ?? 1) },
    imposterUvBounds: { value: new THREE.Vector4(alphaCrop.minU, alphaCrop.minV, alphaCrop.maxU, alphaCrop.maxV) },
    stableAtlasAzimuth: { value: Number.isFinite(config.imposterAtlas?.stableAzimuthColumn) },
    stableAtlasColumn: { value: config.imposterAtlas?.stableAzimuthColumn ?? 0 },
    maxAtlasElevationRow: { value: config.imposterAtlas?.maxElevationRow ?? -1 },
    time: { value: 0 },
    cameraPosition: { value: new THREE.Vector3() },
    fadeDistance: { value: config.fadeDistance },
    maxDistance: { value: config.maxDistance },
    nearFadeDistance: { value: 0.0 },
    lodDistances: { value: new THREE.Vector2(150, 300) },
    viewMatrix: { value: new THREE.Matrix4() },
    colorTint: {
      value: new THREE.Color(
        HUMID_JUNGLE_VEGETATION_TINT.r,
        HUMID_JUNGLE_VEGETATION_TINT.g,
        HUMID_JUNGLE_VEGETATION_TINT.b,
      ),
    },
    gammaAdjust: { value: 1.0 },
    vegetationSaturation: { value: HUMID_JUNGLE_VEGETATION_SATURATION },
    nearAlphaSolidDistance: { value: 30.0 },
    vegetationExposure: { value: HUMID_JUNGLE_VEGETATION_EXPOSURE },
    nearLightBoostDistance: { value: 85.0 },
    minVegetationLight: { value: 0.40 },
    maxVegetationLight: { value: HUMID_JUNGLE_MAX_VEGETATION_LIGHT },
    windStrength: { value: resolveWindStrength(config.height, config.atlasProfile) },
    windSpeed: { value: 1.15 },
    windSpatialScale: { value: 0.055 },
    windDirection: {
      value: new THREE.Vector3(DEFAULT_WIND_DIRECTION.x, DEFAULT_WIND_DIRECTION.y, DEFAULT_WIND_DIRECTION.z),
    },
    playerWorldPosition: { value: new THREE.Vector3(0, 1000, 0) },
    playerImprintRadius: { value: 2.2 },
    playerImprintStrength: { value: 0.8 },
    fogColor: { value: new THREE.Color(0x5a7a6a) },
    fogDensity: { value: DEFAULT_BILLBOARD_FOG_DENSITY },
    fogHeightFalloff: { value: 0.03 },
    fogStartDistance: { value: 100.0 },
    fogEnabled: { value: false },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    skyColor: { value: new THREE.Color(0.7, 0.8, 1.0) },
    groundColor: { value: new THREE.Color(0.3, 0.3, 0.25) },
    lightingEnabled: { value: false },
  };

  const material = new MeshBasicNodeMaterial({
    name: 'konveyer-vegetation-billboard-node-material',
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    alphaTest: BILLBOARD_ALPHA_TEST,
    forceSinglePass: true,
  }) as BillboardNodeMaterial;
  material.isKonveyerBillboardNodeMaterial = true;
  material.uniforms = uniforms;
  material.fog = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

  const instancePosition = tslInstancedBufferAttribute(positionAttribute, 'vec3');
  const instanceScale = tslInstancedBufferAttribute(scaleAttribute, 'vec2');
  const instanceRotation = tslInstancedBufferAttribute(rotationAttribute, 'float');
  const toCamera = cameraPosition.sub(instancePosition);
  const toCameraXZ = tslVec3(toCamera.x, 0, toCamera.z);
  const xzLength = length(toCameraXZ);
  // Smooth-blend to a world-X fallback right-axis when looking nearly vertical at a
  // tuft. Avoids the snap the previous max(length, 0.001) clamp caused.
  const forwardBlend = smoothstep(tslFloat(0.05), tslFloat(0.3), xzLength);
  const safeForward = tslMix(
    tslVec3(1, 0, 0),
    toCameraXZ.div(tslMax(xzLength, tslFloat(0.001))),
    forwardBlend,
  );
  const right = tslVec3(safeForward.z, 0, safeForward.x.negate());
  const up = tslVec3(0, 1, 0);
  const scaledX = positionGeometry.x.mul(instanceScale.x);
  const scaledY = positionGeometry.y.mul(instanceScale.y);
  const timeNode = tslReference('float', uniforms.time);
  const windStrength = tslReference('float', uniforms.windStrength);
  const windSpeed = tslReference('float', uniforms.windSpeed);
  const windSpatialScale = tslReference('float', uniforms.windSpatialScale);
  const windDirection = tslReference('vec3', uniforms.windDirection);
  const playerPos = tslReference('vec3', uniforms.playerWorldPosition);
  const imprintRadius = tslReference('float', uniforms.playerImprintRadius);
  const imprintStrength = tslReference('float', uniforms.playerImprintStrength);
  const lodDistances = tslReference('vec2', uniforms.lodDistances);
  const maxDistance = tslReference('float', uniforms.maxDistance);
  const fadeDistance = tslReference('float', uniforms.fadeDistance);
  const nearFadeDistance = tslReference('float', uniforms.nearFadeDistance);
  const cameraDistance = distance(cameraPosition, instancePosition);
  const lodFactor = select(
    cameraDistance.lessThan(lodDistances.x),
    tslFloat(0),
    select(cameraDistance.lessThan(lodDistances.y), tslFloat(0.5), tslFloat(1)),
  );
  const windPhase = instancePosition.x.mul(windSpatialScale)
    .add(instancePosition.z.mul(windSpatialScale.mul(1.37)));
  const primarySway = sin(timeNode.mul(windSpeed).add(windPhase));
  const gustSway = sin(timeNode.mul(windSpeed.mul(0.43)).add(windPhase.mul(1.91)).add(instanceRotation));
  const lodWindScale = tslFloat(1).sub(lodFactor.mul(0.7));
  const sway = primarySway.add(gustSway.mul(0.35)).mul(windStrength).mul(lodWindScale);
  const swayWeight = uv().y.mul(uv().y);

  // World-direction wind: all blades lean the same way during a gust.
  const swayOffset = windDirection.mul(sway.mul(swayWeight));

  // Player-presence imprint: radial push-away with quadratic falloff. Linear uv.y
  // weight so the base shifts too — gives a visible parted path through the grass,
  // not tip-only tilt.
  const toPlayerX = playerPos.x.sub(instancePosition.x);
  const toPlayerZ = playerPos.z.sub(instancePosition.z);
  const distToPlayer = length(tslVec2(toPlayerX, toPlayerZ));
  const safePlayerDist = tslMax(distToPlayer, tslFloat(0.001));
  const pushX = toPlayerX.div(safePlayerDist).negate();
  const pushZ = toPlayerZ.div(safePlayerDist).negate();
  const falloff = tslClamp(
    tslFloat(1).sub(distToPlayer.div(imprintRadius)),
    tslFloat(0),
    tslFloat(1),
  );
  const imprintMag = falloff.mul(falloff).mul(imprintStrength).mul(uv().y);
  const imprintOffset = tslVec3(pushX.mul(imprintMag), tslFloat(0), pushZ.mul(imprintMag));

  material.positionNode = instancePosition
    .add(right.mul(scaledX))
    .add(up.mul(scaledY))
    .add(swayOffset)
    .add(imprintOffset);

  const atlas = createBillboardAtlasNodes(config.texture, config.normalTexture ?? config.texture, uniforms, instancePosition);
  const texColor = atlas.color as TslNode;
  const normalColor = atlas.normal as TslNode;
  const fadeFactor = createBillboardFadeNode(cameraDistance, nearFadeDistance, fadeDistance, maxDistance, lodFactor);
  const nearAlphaSolidDistance = tslReference('float', uniforms.nearAlphaSolidDistance);
  const nearAlphaBlend = tslFloat(1).sub(
    smoothstep(
      nearAlphaSolidDistance,
      nearAlphaSolidDistance.add(25),
      cameraDistance,
    ),
  );
  const hardenedAlpha = mix(
    texColor.a,
    tslFloat(1),
    smoothstep(tslFloat(BILLBOARD_ALPHA_TEST), tslFloat(0.65), texColor.a),
  ) as TslNode;
  const vegetationAlpha = mix(texColor.a, hardenedAlpha, nearAlphaBlend) as TslNode;
  const finalAlpha = vegetationAlpha.mul(fadeFactor);
  const gammaAdjust = tslReference('float', uniforms.gammaAdjust);
  const colorTint = tslReference('color', uniforms.colorTint);
  const vegetationSaturation = tslReference('float', uniforms.vegetationSaturation);
  const vegetationExposure = tslReference('float', uniforms.vegetationExposure);
  const nearLightBoostDistance = tslReference('float', uniforms.nearLightBoostDistance);
  const nearLightBoost = tslFloat(1).add(
    tslFloat(0.08).mul(tslFloat(1).sub(smoothstep(tslFloat(0), nearLightBoostDistance, cameraDistance))),
  );
  const tintedColor = pow(texColor.rgb.mul(colorTint), tslVec3(gammaAdjust)) as TslNode;
  const foliageLuma = tintedColor.r.mul(0.2126)
    .add(tintedColor.g.mul(0.7152))
    .add(tintedColor.b.mul(0.0722));
  const colorManaged = tslMix(tslVec3(foliageLuma), tintedColor, vegetationSaturation);
  const litColor = createBillboardLightingNode(
    colorManaged,
    normalColor,
    cameraDistance,
    uniforms,
  );
  const foggedColor = createBillboardFogNode(
    litColor.mul(vegetationExposure).mul(nearLightBoost),
    texColor.a,
    instancePosition.y.add(uv().y.mul(instanceScale.y)),
    cameraDistance,
    uniforms,
  );

  material.colorNode = foggedColor.mul(finalAlpha);
  material.opacityNode = finalAlpha;
  material.alphaTestNode = tslFloat(BILLBOARD_ALPHA_TEST);

  return material;
}

function createBillboardAtlasNodes(
  colorTexture: THREE.Texture,
  normalTexture: THREE.Texture,
  uniforms: BillboardMaterialUniforms,
  instancePosition: TslNode,
) {
  const baseUv = uv() as TslNode;
  const bounds = tslReference('vec4', uniforms.imposterUvBounds);
  const croppedUv = mix(bounds.xy, bounds.zw, baseUv) as TslNode;
  const atlasEnabled = tslReference('bool', uniforms.imposterAtlasEnabled);
  const tiles = tslReference('vec2', uniforms.imposterTiles);
  const invTiles = tiles.reciprocal();
  const toCamera = cameraPosition.sub(instancePosition);
  const fullDistance = tslMax(length(toCamera), tslFloat(0.0001));
  const elevation = asin(tslClamp(toCamera.y.div(fullDistance), tslFloat(0), tslFloat(1)));
  const rows = tiles.y;
  const elevationDegrees = elevation.mul(57.295779513);
  const rowForTwo = select(elevationDegrees.greaterThanEqual(35), tslFloat(0), tslFloat(1));
  const rowForFour = select(
    elevationDegrees.greaterThanEqual(72.5),
    tslFloat(0),
    select(
      elevationDegrees.greaterThanEqual(45),
      tslMin(tslFloat(1), rows.sub(1)),
      select(elevationDegrees.greaterThanEqual(17.5), tslMin(tslFloat(2), rows.sub(1)), rows.sub(1)),
    ),
  );
  const atlasRow = select(rows.lessThanEqual(1.5), tslFloat(0), select(rows.lessThan(3), rowForTwo, rowForFour));
  const maxAtlasElevationRow = tslReference('float', uniforms.maxAtlasElevationRow);
  const tileY = select(
    maxAtlasElevationRow.greaterThanEqual(0),
    tslMin(atlasRow, maxAtlasElevationRow),
    atlasRow,
  );
  const stableAtlasAzimuth = tslReference('bool', uniforms.stableAtlasAzimuth);
  const stableAtlasColumn = tslReference('float', uniforms.stableAtlasColumn);
  const stableTileX = tslClamp(floor(stableAtlasColumn.add(0.5)), tslFloat(0), tiles.x.sub(1));
  const azimuthRaw = atan(toCamera.z, toCamera.x);
  const azimuth = select(azimuthRaw.lessThan(0), azimuthRaw.add(6.283185307), azimuthRaw);
  const azimuthTile = azimuth.div(6.283185307).mul(tiles.x);
  const dynamicTileX = floor(azimuthTile).mod(tiles.x);
  const dynamicNextTileX = dynamicTileX.add(1).mod(tiles.x);
  const tileX = select(stableAtlasAzimuth, stableTileX, dynamicTileX) as TslNode;
  const nextTileX = select(stableAtlasAzimuth, stableTileX, dynamicNextTileX) as TslNode;
  const atlasBlend = select(
    stableAtlasAzimuth,
    tslFloat(0),
    smoothstep(tslFloat(0), tslFloat(1), fract(azimuthTile) as TslNode),
  ) as TslNode;
  const sampleUv = select(
    atlasEnabled,
    tslVec2(
      tileX.add(croppedUv.x).mul(invTiles.x),
      tslFloat(1).sub(invTiles.y).sub(tileY.mul(invTiles.y)).add(croppedUv.y.mul(invTiles.y)),
    ),
    croppedUv,
  ) as TslNode;
  const nextSampleUv = select(
    atlasEnabled,
    tslVec2(
      nextTileX.add(croppedUv.x).mul(invTiles.x),
      tslFloat(1).sub(invTiles.y).sub(tileY.mul(invTiles.y)).add(croppedUv.y.mul(invTiles.y)),
    ),
    croppedUv,
  ) as TslNode;
  const shouldBlend = atlasEnabled.and(tiles.x.greaterThan(1.5));
  const color = mix(
    tslTexture(colorTexture, sampleUv),
    tslTexture(colorTexture, nextSampleUv),
    select(shouldBlend, atlasBlend, tslFloat(0)),
  ) as TslNode;
  const normal = mix(
    tslTexture(normalTexture, sampleUv),
    tslTexture(normalTexture, nextSampleUv),
    select(shouldBlend, atlasBlend, tslFloat(0)),
  ) as TslNode;

  return { color, normal, sampleUv };
}

function createBillboardFadeNode(
  cameraDistance: TslNode,
  nearFadeDistance: TslNode,
  fadeDistance: TslNode,
  maxDistance: TslNode,
  lodFactor: TslNode,
) {
  const nearFade = select(
    nearFadeDistance.greaterThan(0.001),
    smoothstep(nearFadeDistance.mul(0.55), nearFadeDistance, cameraDistance),
    tslFloat(1),
  );
  const farFade = select(
    cameraDistance.greaterThan(fadeDistance),
    tslFloat(1).sub(smoothstep(fadeDistance, maxDistance, cameraDistance)),
    tslFloat(1),
  );
  const lodFade = tslFloat(1).sub(lodFactor.mul(0.3));
  return nearFade.mul(farFade).mul(lodFade);
}

function createBillboardLightingNode(
  baseColor: TslNode,
  normalColor: TslNode,
  cameraDistance: TslNode,
  uniforms: BillboardMaterialUniforms,
) {
  const lightingEnabled = tslReference('bool', uniforms.lightingEnabled);
  const normalMapEnabled = tslReference('bool', uniforms.normalMapEnabled);
  const sunColor = tslReference('color', uniforms.sunColor);
  const skyColor = tslReference('color', uniforms.skyColor);
  const groundColor = tslReference('color', uniforms.groundColor);
  const minVegetationLight = tslReference('float', uniforms.minVegetationLight);
  const maxVegetationLight = tslReference('float', uniforms.maxVegetationLight);
  const ambient = mix(groundColor, skyColor, tslFloat(0.5).add(uv().y.mul(0.5)));
  const hemiLight = ambient.mul(0.82).add(sunColor.mul(0.22));
  const imposterNormal = normalColor.rgb.mul(2).sub(1).normalize();
  const captureSun = tslVec3(0.35, 0.65, 0.68).normalize();
  const ndotl = tslMax(imposterNormal.dot(captureSun), tslFloat(0));
  const normalAmbient = mix(
    groundColor,
    skyColor,
    tslFloat(0.62).add(tslFloat(0.38).mul(tslClamp(imposterNormal.y, tslFloat(-1), tslFloat(1)))),
  );
  const normalLight = normalAmbient.mul(0.82).add(sunColor.mul(tslFloat(0.16).add(tslFloat(0.34).mul(ndotl))));
  const verticalOcclusion = tslMix(
    tslFloat(0.68),
    tslFloat(1.0),
    smoothstep(tslFloat(0.08), tslFloat(0.95), uv().y),
  );
  const selectedLight = select(normalMapEnabled, normalLight, hemiLight).mul(verticalOcclusion);
  const light = tslClamp(
    selectedLight,
    tslVec3(minVegetationLight),
    tslVec3(maxVegetationLight),
  );
  const shaded = baseColor.mul(light);
  const legacyLit = select(lightingEnabled, shaded, baseColor).mul(
    tslFloat(1).add(tslFloat(0).mul(cameraDistance)),
  );

  // Phase 0 unified-rig branch (flag-gated). Wrapped-Lambert against the SAME
  // uncompressed sun/sky/ground terms terrain consumes, so foliage tracks
  // terrain by construction. The [0.40, 0.78] clamp band is bypassed here —
  // midnight foliage is allowed to go dark, dawn allowed to warm with terrain —
  // which is exactly the divergence the legacy clamp guarantees. See
  // docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md §2c.
  const rigEnabled = tslReference('float', lightingRigBindings.rigEnabled).greaterThan(tslFloat(0.5));
  const rigSun = tslReference('color', lightingRigBindings.sunRadiance);
  const rigSky = tslReference('color', lightingRigBindings.skyIrradiance);
  const rigGround = tslReference('color', lightingRigBindings.groundIrradiance);
  const rigAmbient = tslReference('color', lightingRigBindings.ambientRadiance);
  const rigSunDir = tslReference('vec3', lightingRigBindings.sunDirection);
  const rigExposure = tslReference('float', lightingRigBindings.exposure);
  const rigSunElevationSin = tslReference('float', lightingRigBindings.sunElevationSin);
  // Card normal: the camera-facing impostor normal where present, else the
  // up-biased card normal (foliage cards lack true geometric normals).
  const cardNormal = tslSelect(normalMapEnabled, imposterNormal, tslVec3(0, 1, 0));
  const wrap = tslFloat(RIG_WRAP);
  const nl = tslMax(cardNormal.dot(rigSunDir), wrap.negate());
  const diff = nl.add(wrap).div(tslFloat(1).add(wrap));
  // Hemisphere fill: an up-facing card lerps toward the sky, but trimmed below a
  // pure-zenith pick (a real tuft integrates the whole hemisphere). Weight goes
  // from 0.5 at a side-facing normal to FOLIAGE_HEMI_UP_SKY_WEIGHT straight up.
  const hemiWeight = tslFloat(0.5).add(
    cardNormal.y.mul(tslFloat(RIG_HEMI_UP_SKY_WEIGHT - 0.5)),
  );
  const hemi = tslMix(rigGround, rigSky, hemiWeight);
  // Low-sun direct-term fade, keyed on the SAME sun-height driver terrain's
  // horizon occlusion uses (sunDirection.y == sin elevation). Fades the foliage
  // direct sun contribution toward a floor as the sun nears the horizon, so the
  // up-biased card normal no longer over-catches the low warm sun (the Phase 1
  // overshoot) while keeping a residual dusk contribution. Ambient + hemisphere
  // fill are untouched. See RIG_LOW_SUN_FADE_* for the measured tuning (exported,
  // shared with the NPC impostor rig path — same response, no per-family re-tune).
  const lowSunFade = tslFloat(RIG_LOW_SUN_FADE_FLOOR).add(
    tslFloat(1 - RIG_LOW_SUN_FADE_FLOOR).mul(
      smoothstep(
        tslFloat(RIG_LOW_SUN_FADE_LO),
        tslFloat(RIG_LOW_SUN_FADE_HI),
        rigSunElevationSin,
      ),
    ),
  );
  const directSun = rigSun.mul(diff).mul(lowSunFade);
  const rigLit = baseColor.mul(hemi.add(directSun)).add(rigAmbient).mul(rigExposure);

  return tslSelect(rigEnabled, rigLit, legacyLit);
}

function createBillboardFogNode(
  baseColor: TslNode,
  alpha: TslNode,
  worldY: TslNode,
  cameraDistance: TslNode,
  uniforms: BillboardMaterialUniforms,
) {
  const fogEnabled = tslReference('bool', uniforms.fogEnabled);
  const fogColor = tslReference('color', uniforms.fogColor);
  const fogDensity = tslReference('float', uniforms.fogDensity);
  const fogHeightFalloff = tslReference('float', uniforms.fogHeightFalloff);
  const fogStartDistance = tslReference('float', uniforms.fogStartDistance);
  const heightFactor = exp(fogHeightFalloff.negate().mul(tslMax(tslFloat(0), worldY)));
  const effectiveDistance = tslMax(tslFloat(0), cameraDistance.sub(fogStartDistance));
  const distanceFactor = tslFloat(1).sub(exp(fogDensity.negate().mul(effectiveDistance)));
  const fogFactor = tslClamp(heightFactor.mul(distanceFactor), tslFloat(0), tslFloat(1));
  return tslSelect(fogEnabled, tslMix(baseColor, fogColor, fogFactor.mul(alpha)), baseColor);
}
