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

const DEFAULT_BILLBOARD_FOG_DENSITY = 0.00055;
const BILLBOARD_ALPHA_TEST = 0.25;
const HUMID_JUNGLE_VEGETATION_TINT = { r: 0.72, g: 0.82, b: 0.58 } as const;
const HUMID_JUNGLE_VEGETATION_SATURATION = 0.58;
const HUMID_JUNGLE_VEGETATION_EXPOSURE = 0.82;
const HUMID_JUNGLE_MAX_VEGETATION_LIGHT = 0.78;

const clampValue = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

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
  const xzLength = tslMax(length(toCameraXZ), tslFloat(0.001));
  const forward = toCameraXZ.div(xzLength);
  const right = tslVec3(forward.z, 0, forward.x.negate());
  const up = tslVec3(0, 1, 0);
  const scaledX = positionGeometry.x.mul(instanceScale.x);
  const scaledY = positionGeometry.y.mul(instanceScale.y);
  const timeNode = tslReference('float', uniforms.time);
  const windStrength = tslReference('float', uniforms.windStrength);
  const windSpeed = tslReference('float', uniforms.windSpeed);
  const windSpatialScale = tslReference('float', uniforms.windSpatialScale);
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

  material.positionNode = instancePosition
    .add(right.mul(scaledX.add(sway.mul(swayWeight))))
    .add(up.mul(scaledY));

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

  return select(lightingEnabled, shaded, baseColor).mul(
    tslFloat(1).add(tslFloat(0).mul(cameraDistance)),
  );
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
