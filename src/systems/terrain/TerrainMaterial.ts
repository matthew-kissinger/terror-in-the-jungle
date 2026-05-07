import * as THREE from 'three';
import type { SplatmapConfig } from './TerrainConfig';
import type { TerrainSurfaceKind, TerrainSurfacePatch } from './TerrainFeatureTypes';
import type { TerrainFarCanopyTintConfig } from '../../config/biomes';

const MAX_BIOME_TEXTURES = 8;
const MAX_BIOME_RULES = 8;
// Keep this conservative for mobile GPUs.
// Large float-array uniforms in fragment shaders can exceed low-end WebGL
// uniform budgets and fail terrain material compilation, resulting in an
// invisible-but-collidable terrain surface.
const MAX_FEATURE_SURFACE_PATCHES = 8;

const TERRAIN_VERTEX_PARS = /* glsl */ `
uniform sampler2D terrainHeightmap;
uniform sampler2D terrainNormalMap;
uniform float terrainWorldSize;
uniform float heightmapGridSize;
uniform float tileGridResolution;
uniform bool debugWireframe;

attribute float lodLevel;
attribute float morphFactor;

varying vec3 vWorldPosition;
varying vec2 vWorldUV;
varying vec3 vTerrainNormal;
varying float vLodLevel;
varying float vMorphFactor;
`;

const TERRAIN_VERTEX_MAIN = /* glsl */ `
// CDLOD morph: snap fine-grid vertices toward parent LOD grid for smooth transitions
float parentStep = 2.0 / tileGridResolution;
vec2 gridPos = position.xz + 0.5;
vec2 snapped = floor(gridPos / parentStep + 0.5) * parentStep;
vec3 morphedPos = vec3(
  mix(gridPos.x, snapped.x, morphFactor) - 0.5,
  position.y,
  mix(gridPos.y, snapped.y, morphFactor) - 0.5
);

vec4 worldPos4 = instanceMatrix * vec4(morphedPos, 1.0);
float halfWorld = terrainWorldSize * 0.5;
// Half-texel correction: GPU texture2D maps UV via pixelCoord = UV * gridSize - 0.5,
// but the CPU BakedHeightProvider maps via gx = normalizedPos * (gridSize - 1).
// Without correction these diverge by up to 0.5 texels at world edges (~3m for 3200m maps).
// Remap UV so texel centers align with the bake-loop sample positions.
float texelHalf = 0.5 / heightmapGridSize;
float uvScale = (heightmapGridSize - 1.0) / heightmapGridSize;
vec2 normalizedPos = vec2(
  (worldPos4.x + halfWorld) / terrainWorldSize,
  (worldPos4.z + halfWorld) / terrainWorldSize
);
vWorldUV = clamp(normalizedPos * uvScale + texelHalf, 0.0, 1.0);

float terrainH = texture2D(terrainHeightmap, vWorldUV).r;
worldPos4.y = terrainH;

vWorldPosition = worldPos4.xyz;
vLodLevel = lodLevel;
vMorphFactor = morphFactor;

vec3 nSample = texture2D(terrainNormalMap, vWorldUV).rgb * 2.0 - 1.0;
vTerrainNormal = normalize(nSample);

// Set transformed to local-space position so any Three.js includes that apply
// instanceMatrix get the correct single application.  worldpos_vertex is
// replaced below to use worldPos4 directly (which already includes instanceMatrix
// and heightmap displacement).
transformed = morphedPos;
`;

const TERRAIN_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D biomeTexture0;
uniform sampler2D biomeTexture1;
uniform sampler2D biomeTexture2;
uniform sampler2D biomeTexture3;
uniform sampler2D biomeTexture4;
uniform sampler2D biomeTexture5;
uniform sampler2D biomeTexture6;
uniform sampler2D biomeTexture7;

uniform float biomeTileScale[8];
uniform float biomeRoughness[8];
uniform float biomeRuleBiomeSlot[8];
uniform float biomeRuleMinElevation[8];
uniform float biomeRuleMaxElevation[8];
uniform float biomeRuleElevationBlendWidth[8];
uniform float biomeRuleMinUpDot[8];
uniform float biomeRulePriority[8];
uniform float biomeRuleEnabled[8];
uniform float cliffRockBiomeSlot;
uniform float antiTilingStrength;
uniform float triplanarSlopeThreshold;
uniform float environmentWetness;
uniform float featureSurfacePatchCount;
uniform float featureSurfaceShape[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceType[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceX[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceZ[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceInnerRadius[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceOuterRadius[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceHalfWidth[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceHalfLength[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceBlend[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceYawCos[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float featureSurfaceYawSin[${MAX_FEATURE_SURFACE_PATCHES}];
uniform float farCanopyTintEnabled;
uniform float farCanopyTintStartDistance;
uniform float farCanopyTintEndDistance;
uniform float farCanopyTintStrength;
uniform float farCanopyTintFogStrength;
uniform vec3 farCanopyTintColor;
uniform sampler2D hydrologyMaskTexture;
uniform float hydrologyMaskEnabled;
uniform vec2 hydrologyMaskOrigin;
uniform vec2 hydrologyMaskTextureSize;
uniform float hydrologyMaskCellSize;
uniform float hydrologyWetBiomeSlot;
uniform float hydrologyChannelBiomeSlot;
uniform float hydrologyWetStrength;
uniform float hydrologyChannelStrength;
uniform bool debugWireframe;

varying vec3 vWorldPosition;
varying vec2 vWorldUV;
varying vec3 vTerrainNormal;
varying float vLodLevel;
varying float vMorphFactor;

float hashUV(vec2 p) {
  vec2 q = fract(p * vec2(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

vec2 rotateUv(vec2 uv, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c) * uv;
}

float computeFeatureSurfaceMask(int patchIndex, vec2 worldPos) {
  float shape = featureSurfaceShape[patchIndex];
  vec2 center = vec2(featureSurfaceX[patchIndex], featureSurfaceZ[patchIndex]);

  if (shape < 1.5) {
    float innerRadius = featureSurfaceInnerRadius[patchIndex];
    float outerRadius = max(innerRadius, featureSurfaceOuterRadius[patchIndex]);
    float dist = distance(worldPos, center);
    return 1.0 - smoothstep(innerRadius, outerRadius, dist);
  }

  vec2 offset = worldPos - center;
  float yawCos = featureSurfaceYawCos[patchIndex];
  float yawSin = featureSurfaceYawSin[patchIndex];
  vec2 localPos = vec2(
    offset.x * yawCos + offset.y * yawSin,
    -offset.x * yawSin + offset.y * yawCos
  );
  vec2 halfSize = vec2(featureSurfaceHalfWidth[patchIndex], featureSurfaceHalfLength[patchIndex]);
  vec2 q = abs(localPos) - halfSize;
  float outsideDistance = length(max(q, vec2(0.0)));
  float sdf = outsideDistance + min(max(q.x, q.y), 0.0);
  float blend = max(0.01, featureSurfaceBlend[patchIndex]);
  return 1.0 - smoothstep(0.0, blend, max(sdf, 0.0));
}

float featureSurfaceWeight(float surfaceTypeId, vec2 worldPos) {
  float weight = 0.0;
  for (int i = 0; i < ${MAX_FEATURE_SURFACE_PATCHES}; i++) {
    if (float(i) >= featureSurfacePatchCount) {
      continue;
    }
    if (abs(featureSurfaceType[i] - surfaceTypeId) > 0.1) {
      continue;
    }
    weight = max(weight, computeFeatureSurfaceMask(i, worldPos));
  }
  return clamp(weight, 0.0, 1.0);
}

float biomeElevationWeight(float elevation, float minElevation, float maxElevation, float blendWidth) {
  float weight = 1.0;
  if (minElevation > -99999999.0) {
    weight *= smoothstep(minElevation - blendWidth, minElevation + blendWidth, elevation);
  }
  if (maxElevation < 99999999.0) {
    weight *= 1.0 - smoothstep(maxElevation - blendWidth, maxElevation + blendWidth, elevation);
  }
  return weight;
}

float biomeSlopeWeight(float slopeUp, float minUpDot, float blendWidth) {
  if (minUpDot <= -0.5) {
    return 1.0;
  }
  return smoothstep(minUpDot - blendWidth, minUpDot + blendWidth, slopeUp);
}

float computeBiomeRuleWeight(int ruleIndex, float elevation, float slopeUp) {
  float elevationWeight = biomeElevationWeight(
    elevation,
    biomeRuleMinElevation[ruleIndex],
    biomeRuleMaxElevation[ruleIndex],
    biomeRuleElevationBlendWidth[ruleIndex]
  );
  float slopeWeight = biomeSlopeWeight(slopeUp, biomeRuleMinUpDot[ruleIndex], 0.08);
  float priorityBias = 1.0 + max(0.0, biomeRulePriority[ruleIndex]) * 0.02;
  return elevationWeight * slopeWeight * priorityBias;
}

void classifyBiomeBlend(vec3 normal, out float primarySlot, out float secondarySlot, out float secondaryBlend) {
  float elevation = vWorldPosition.y;
  float slopeUp = clamp(dot(normal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
  float bestSlot = 0.0;
  float bestWeight = 0.35;
  float secondSlot = 0.0;
  float secondWeight = 0.0;

  for (int i = 0; i < 8; i++) {
    if (biomeRuleEnabled[i] < 0.5) {
      continue;
    }

    float ruleWeight = computeBiomeRuleWeight(i, elevation, slopeUp);
    if (ruleWeight <= 0.001) {
      continue;
    }

    if (ruleWeight > bestWeight) {
      secondSlot = bestSlot;
      secondWeight = bestWeight;
      bestSlot = biomeRuleBiomeSlot[i];
      bestWeight = ruleWeight;
    } else if (ruleWeight > secondWeight) {
      secondSlot = biomeRuleBiomeSlot[i];
      secondWeight = ruleWeight;
    }
  }

  primarySlot = bestSlot;
  secondarySlot = secondSlot;
  secondaryBlend = secondWeight <= 0.001 ? 0.0 : clamp(secondWeight / (bestWeight + secondWeight), 0.0, 0.5);
}

vec2 sampleHydrologyMask(vec2 worldPos) {
  if (hydrologyMaskEnabled < 0.5 || hydrologyMaskCellSize <= 0.0) {
    return vec2(0.0);
  }

  vec2 gridUv = ((worldPos - hydrologyMaskOrigin) / hydrologyMaskCellSize + vec2(0.5)) / hydrologyMaskTextureSize;
  if (gridUv.x < 0.0 || gridUv.x > 1.0 || gridUv.y < 0.0 || gridUv.y > 1.0) {
    return vec2(0.0);
  }

  return texture2D(hydrologyMaskTexture, gridUv).rg;
}

void applyHydrologyBiomeBlend(
  vec2 worldPos,
  inout float primarySlot,
  inout float secondarySlot,
  inout float secondaryBlend
) {
  vec2 hydrologyMask = sampleHydrologyMask(worldPos);
  float channelWeight = smoothstep(0.2, 0.8, hydrologyMask.g) * hydrologyChannelStrength;
  float wetWeight = smoothstep(0.2, 0.8, hydrologyMask.r) * hydrologyWetStrength;
  float hydrologyWeight = max(channelWeight, wetWeight);
  if (hydrologyWeight <= 0.001) {
    return;
  }

  float originalPrimary = primarySlot;
  primarySlot = channelWeight >= wetWeight ? hydrologyChannelBiomeSlot : hydrologyWetBiomeSlot;
  secondarySlot = originalPrimary;
  secondaryBlend = clamp(1.0 - hydrologyWeight, 0.0, 1.0);
}

vec4 sampleBiomeTextureRaw(float biomeSlot, vec2 uv) {
  if (biomeSlot < 0.5) return texture2D(biomeTexture0, uv);
  if (biomeSlot < 1.5) return texture2D(biomeTexture1, uv);
  if (biomeSlot < 2.5) return texture2D(biomeTexture2, uv);
  if (biomeSlot < 3.5) return texture2D(biomeTexture3, uv);
  if (biomeSlot < 4.5) return texture2D(biomeTexture4, uv);
  if (biomeSlot < 5.5) return texture2D(biomeTexture5, uv);
  if (biomeSlot < 6.5) return texture2D(biomeTexture6, uv);
  return texture2D(biomeTexture7, uv);
}

float sampleBiomeTileScale(float biomeSlot) {
  if (biomeSlot < 0.5) return biomeTileScale[0];
  if (biomeSlot < 1.5) return biomeTileScale[1];
  if (biomeSlot < 2.5) return biomeTileScale[2];
  if (biomeSlot < 3.5) return biomeTileScale[3];
  if (biomeSlot < 4.5) return biomeTileScale[4];
  if (biomeSlot < 5.5) return biomeTileScale[5];
  if (biomeSlot < 6.5) return biomeTileScale[6];
  return biomeTileScale[7];
}

vec4 sampleBiomeTexture(float biomeSlot, vec2 worldUv, vec2 uvOffset) {
  float tileScale = sampleBiomeTileScale(biomeSlot);
  vec2 primaryUv = worldUv * tileScale + uvOffset;
  vec2 rotatedUv = rotateUv(worldUv, 0.67) * (tileScale * 0.63) + uvOffset * 1.7 + vec2(17.13, 9.71);
  vec4 primarySample = sampleBiomeTextureRaw(biomeSlot, primaryUv);
  vec4 rotatedSample = sampleBiomeTextureRaw(biomeSlot, rotatedUv);
  float breakup = hashUV(worldUv * 0.25 + uvOffset * 10.0);
  return mix(primarySample, rotatedSample, 0.32 + breakup * 0.18);
}

vec4 sampleBiomeTriplanar(float biomeSlot, vec3 worldPos, vec3 worldNormal, vec2 uvOffset) {
  vec3 blend = abs(worldNormal);
  blend = pow(blend, vec3(4.0));
  blend /= max(dot(blend, vec3(1.0)), 0.0001);

  vec4 sampleX = sampleBiomeTexture(biomeSlot, worldPos.zy, uvOffset);
  vec4 sampleY = sampleBiomeTexture(biomeSlot, worldPos.xz, uvOffset);
  vec4 sampleZ = sampleBiomeTexture(biomeSlot, worldPos.xy, uvOffset);
  return sampleX * blend.x + sampleY * blend.y + sampleZ * blend.z;
}

float sampleBiomeRoughness(float biomeSlot) {
  if (biomeSlot < 0.5) return biomeRoughness[0];
  if (biomeSlot < 1.5) return biomeRoughness[1];
  if (biomeSlot < 2.5) return biomeRoughness[2];
  if (biomeSlot < 3.5) return biomeRoughness[3];
  if (biomeSlot < 4.5) return biomeRoughness[4];
  if (biomeSlot < 5.5) return biomeRoughness[5];
  if (biomeSlot < 6.5) return biomeRoughness[6];
  return biomeRoughness[7];
}

float macroVariation(vec2 worldPos) {
  float base = sin(worldPos.x * 0.012 + sin(worldPos.y * 0.007) * 1.7);
  float detail = cos(worldPos.y * 0.016 + sin(worldPos.x * 0.011) * 1.3);
  return clamp(1.0 + (base * 0.06 + detail * 0.04), 0.9, 1.12);
}

vec3 jungleHumidityTint(vec3 color, float slopeUp, float elevation) {
  float lowlandFactor = 1.0 - smoothstep(900.0, 1500.0, elevation);
  float flatFactor = smoothstep(0.45, 0.95, slopeUp);
  vec3 humidTint = vec3(0.93, 1.01, 0.94);
  return mix(color, color * humidTint, lowlandFactor * flatFactor * 0.22);
}

float lowlandWetnessMask(float slopeUp, float elevation) {
  float lowlandFactor = 1.0 - smoothstep(700.0, 1200.0, elevation);
  float flatFactor = smoothstep(0.58, 0.98, slopeUp);
  return lowlandFactor * flatFactor * mix(0.35, 1.0, clamp(environmentWetness, 0.0, 1.0));
}

vec3 applyLowlandWetness(vec3 color, float slopeUp, float elevation) {
  float wetness = lowlandWetnessMask(slopeUp, elevation);
  if (wetness <= 0.001) {
    return color;
  }

  vec3 wetTint = vec3(0.82, 0.9, 0.84);
  vec3 darkened = color * wetTint;
  return mix(color, darkened, wetness * 0.35);
}

vec3 applyCliffRockAccent(vec3 color, float slopeUp, float elevation, vec2 worldUv, vec2 uvOffset) {
  float cliffMask = 1.0 - smoothstep(0.50, 0.74, slopeUp);
  float proceduralHillMask = smoothstep(20.0, 60.0, elevation) * (1.0 - smoothstep(150.0, 300.0, elevation));
  float demRidgeMask = smoothstep(450.0, 950.0, elevation);
  float elevationMask = max(proceduralHillMask, demRidgeMask);
  float rockBlend = cliffMask * elevationMask * 0.26;
  if (rockBlend <= 0.001) {
    return color;
  }

  vec4 rockPlanar = sampleBiomeTexture(cliffRockBiomeSlot, worldUv, uvOffset);
  vec3 mossyRock = mix(rockPlanar.rgb, rockPlanar.rgb * vec3(0.66, 0.86, 0.68), 0.45);
  return mix(color, mossyRock, rockBlend);
}

float farCanopyTintMask(float slopeUp, float elevation, vec2 worldPos) {
  if (farCanopyTintEnabled < 0.5) {
    return 0.0;
  }

  float distanceMask = smoothstep(
    farCanopyTintStartDistance,
    max(farCanopyTintStartDistance + 1.0, farCanopyTintEndDistance),
    distance(cameraPosition.xz, worldPos)
  );
  float slopeMask = smoothstep(0.18, 0.72, slopeUp);
  float elevationMask = 1.0 - smoothstep(2400.0, 3800.0, elevation);
  float breakup = mix(
    0.74,
    1.12,
    hashUV(worldPos * 0.003 + vec2(3.71, 5.19))
  );

  return clamp(
    farCanopyTintStrength * distanceMask * slopeMask * elevationMask * breakup,
    0.0,
    0.65
  );
}

vec3 applyFarCanopyTint(vec3 color, float slopeUp, float elevation, vec2 worldPos) {
  float mask = farCanopyTintMask(slopeUp, elevation, worldPos);
  if (mask <= 0.001) {
    return color;
  }

  vec3 canopyColor = farCanopyTintColor * mix(
    0.82,
    1.18,
    hashUV(worldPos * 0.007 + vec2(1.37, 8.53))
  );
  return mix(color, canopyColor, mask);
}

vec3 applyFeatureSurfaceColor(vec3 color, vec2 worldPos) {
  float packedEarthWeight = featureSurfaceWeight(1.0, worldPos);
  if (packedEarthWeight > 0.001) {
    vec3 packedEarthColor = vec3(0.47, 0.38, 0.24);
    color = mix(color, packedEarthColor, packedEarthWeight * 0.78);
  }

  float runwayWeight = featureSurfaceWeight(2.0, worldPos);
  if (runwayWeight > 0.001) {
    vec3 runwayColor = vec3(0.41, 0.39, 0.36);
    color = mix(color, runwayColor, runwayWeight * 0.82);
  }

  float dirtRoadWeight = featureSurfaceWeight(3.0, worldPos);
  if (dirtRoadWeight > 0.001) {
    vec3 dirtRoadColor = vec3(0.45, 0.35, 0.22);
    color = mix(color, dirtRoadColor, dirtRoadWeight * 0.70);
  }

  float gravelRoadWeight = featureSurfaceWeight(4.0, worldPos);
  if (gravelRoadWeight > 0.001) {
    vec3 gravelRoadColor = vec3(0.48, 0.44, 0.38);
    color = mix(color, gravelRoadColor, gravelRoadWeight * 0.75);
  }

  float jungleTrailWeight = featureSurfaceWeight(5.0, worldPos);
  if (jungleTrailWeight > 0.001) {
    vec3 jungleTrailColor = vec3(0.32, 0.26, 0.18);
    color = mix(color, jungleTrailColor, jungleTrailWeight * 0.50);
  }

  return color;
}
`;

const TERRAIN_FRAGMENT_MAP = /* glsl */ `
float primaryBiomeSlot;
float secondaryBiomeSlot;
float secondaryBiomeBlend;
classifyBiomeBlend(normalize(vTerrainNormal), primaryBiomeSlot, secondaryBiomeSlot, secondaryBiomeBlend);
applyHydrologyBiomeBlend(vWorldPosition.xz, primaryBiomeSlot, secondaryBiomeSlot, secondaryBiomeBlend);
vec2 uvOffset = vec2(0.0);
if (antiTilingStrength > 0.0) {
  float noise = hashUV(vWorldUV * 7.0);
  uvOffset = vec2(noise, hashUV(vWorldUV * 11.0 + 0.5)) * antiTilingStrength * 0.02;
}
float slopeUp = clamp(dot(normalize(vTerrainNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
float triplanarBlend = 1.0 - smoothstep(
  max(0.0, triplanarSlopeThreshold - 0.2),
  triplanarSlopeThreshold,
  slopeUp
);
vec4 primaryPlanarSample = sampleBiomeTexture(primaryBiomeSlot, vWorldPosition.xz, uvOffset);
vec4 primaryTriplanarSample = sampleBiomeTriplanar(primaryBiomeSlot, vWorldPosition, normalize(vTerrainNormal), uvOffset);
vec4 primaryBiomeSample = mix(primaryPlanarSample, primaryTriplanarSample, triplanarBlend);
vec4 biomeSample = primaryBiomeSample;
if (secondaryBiomeBlend > 0.001) {
  vec4 secondaryPlanarSample = sampleBiomeTexture(secondaryBiomeSlot, vWorldPosition.xz, uvOffset);
  vec4 secondaryTriplanarSample = sampleBiomeTriplanar(secondaryBiomeSlot, vWorldPosition, normalize(vTerrainNormal), uvOffset);
  vec4 secondaryBiomeSample = mix(secondaryPlanarSample, secondaryTriplanarSample, triplanarBlend);
  biomeSample = mix(primaryBiomeSample, secondaryBiomeSample, secondaryBiomeBlend);
}
vec3 finalColor = biomeSample.rgb * macroVariation(vWorldPosition.xz);
finalColor = jungleHumidityTint(finalColor, slopeUp, vWorldPosition.y);
finalColor = applyLowlandWetness(finalColor, slopeUp, vWorldPosition.y);
finalColor = applyCliffRockAccent(finalColor, slopeUp, vWorldPosition.y, vWorldPosition.xz, uvOffset);
finalColor = applyFarCanopyTint(finalColor, slopeUp, vWorldPosition.y, vWorldPosition.xz);
finalColor = applyFeatureSurfaceColor(finalColor, vWorldPosition.xz);
diffuseColor.rgb = finalColor;
if (debugWireframe) {
  // Color-code LOD levels for visual debugging
  vec3 lodColors[5];
  lodColors[0] = vec3(0.0, 1.0, 0.0); // LOD 0: green (finest)
  lodColors[1] = vec3(0.0, 0.5, 1.0); // LOD 1: blue
  lodColors[2] = vec3(1.0, 1.0, 0.0); // LOD 2: yellow
  lodColors[3] = vec3(1.0, 0.5, 0.0); // LOD 3: orange
  lodColors[4] = vec3(1.0, 0.0, 0.0); // LOD 4: red (coarsest)
  int lodIdx = clamp(int(vLodLevel), 0, 4);
  vec3 lodColor = lodColors[lodIdx];
  // Blend morph factor as brightness
  diffuseColor.rgb = lodColor * (0.5 + 0.5 * (1.0 - vMorphFactor));
}
`;

const TERRAIN_FRAGMENT_ROUGHNESS = /* glsl */ `
float primaryRoughnessBiomeSlot;
float secondaryRoughnessBiomeSlot;
float roughnessSecondaryBlend;
classifyBiomeBlend(normalize(vTerrainNormal), primaryRoughnessBiomeSlot, secondaryRoughnessBiomeSlot, roughnessSecondaryBlend);
applyHydrologyBiomeBlend(vWorldPosition.xz, primaryRoughnessBiomeSlot, secondaryRoughnessBiomeSlot, roughnessSecondaryBlend);
float roughnessSample = sampleBiomeRoughness(primaryRoughnessBiomeSlot);
if (roughnessSecondaryBlend > 0.001) {
  float secondaryRoughness = sampleBiomeRoughness(secondaryRoughnessBiomeSlot);
  roughnessSample = mix(roughnessSample, secondaryRoughness, roughnessSecondaryBlend);
}
float wetness = lowlandWetnessMask(
  clamp(dot(normalize(vTerrainNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0),
  vWorldPosition.y
);
roughnessSample = mix(roughnessSample, roughnessSample * 0.72, wetness);
float packedEarthWeight = featureSurfaceWeight(1.0, vWorldPosition.xz);
if (packedEarthWeight > 0.001) {
  roughnessSample = mix(roughnessSample, 0.96, packedEarthWeight);
}
float runwayWeight = featureSurfaceWeight(2.0, vWorldPosition.xz);
if (runwayWeight > 0.001) {
  roughnessSample = mix(roughnessSample, 0.82, runwayWeight);
}
float dirtRoadWeightR = featureSurfaceWeight(3.0, vWorldPosition.xz);
if (dirtRoadWeightR > 0.001) {
  roughnessSample = mix(roughnessSample, 0.94, dirtRoadWeightR);
}
float gravelRoadWeightR = featureSurfaceWeight(4.0, vWorldPosition.xz);
if (gravelRoadWeightR > 0.001) {
  roughnessSample = mix(roughnessSample, 0.90, gravelRoadWeightR);
}
float jungleTrailWeightR = featureSurfaceWeight(5.0, vWorldPosition.xz);
if (jungleTrailWeightR > 0.001) {
  roughnessSample = mix(roughnessSample, 0.95, jungleTrailWeightR);
}
float farCanopyRoughnessMask = farCanopyTintMask(
  clamp(dot(normalize(vTerrainNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0),
  vWorldPosition.y,
  vWorldPosition.xz
);
roughnessSample = mix(roughnessSample, max(roughnessSample, 0.92), farCanopyRoughnessMask * 0.55);
roughnessFactor *= roughnessSample;
`;

const TERRAIN_FRAGMENT_NORMAL_OVERRIDE = /* glsl */ `
normal = normalize(vTerrainNormal);
nonPerturbedNormal = normal;
`;

const TERRAIN_FRAGMENT_FOG_TINT = /* glsl */ `
#include <fog_fragment>
float farCanopyFogMask = farCanopyTintMask(
  clamp(dot(normalize(vTerrainNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0),
  vWorldPosition.y,
  vWorldPosition.xz
);
if (farCanopyFogMask > 0.001) {
  vec3 foggedCanopy = farCanopyTintColor * 0.86;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, foggedCanopy, farCanopyFogMask * farCanopyTintFogStrength);
}
`;

export interface TerrainBiomeLayerConfig {
  biomeId: string;
  texture: THREE.Texture;
  tileScale: number;
  roughness: number;
}

export interface TerrainBiomeRuleConfig {
  biomeSlot: number;
  elevationMin: number;
  elevationMax: number;
  elevationBlendWidth?: number;
  minUpDot: number;
  priority: number;
}

export interface TerrainBiomeMaterialConfig {
  layers: TerrainBiomeLayerConfig[];
  rules: TerrainBiomeRuleConfig[];
  cliffRockBiomeSlot?: number;
}

export interface TerrainHydrologyMaskMaterialConfig {
  texture: THREE.Texture;
  width: number;
  height: number;
  originX: number;
  originZ: number;
  cellSizeMeters: number;
  wetBiomeId: string;
  channelBiomeId: string;
  wetStrength?: number;
  channelStrength?: number;
}

interface TerrainMaterialOptions {
  heightTexture: THREE.DataTexture;
  normalTexture: THREE.DataTexture;
  worldSize: number;
  splatmap: SplatmapConfig;
  biomeConfig: TerrainBiomeMaterialConfig;
  hydrologyMask?: TerrainHydrologyMaskMaterialConfig | null;
  farCanopyTint?: TerrainFarCanopyTintConfig;
  surfaceWetness?: number;
  tileGridResolution?: number;
  surfacePatches?: TerrainSurfacePatch[];
}

export function createTerrainMaterial(options: TerrainMaterialOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: false,
  });

  applyTerrainMaterialOptions(material, options);
  material.needsUpdate = true;
  return material;
}

export function updateTerrainMaterialTextures(
  material: THREE.MeshStandardMaterial,
  heightTexture: THREE.DataTexture,
  normalTexture: THREE.DataTexture,
  worldSize: number,
  biomeConfig: TerrainBiomeMaterialConfig,
  splatmap?: SplatmapConfig,
  surfacePatches?: TerrainSurfacePatch[],
  farCanopyTint?: TerrainFarCanopyTintConfig,
  hydrologyMask?: TerrainHydrologyMaskMaterialConfig | null,
): void {
  applyTerrainMaterialOptions(material, {
    heightTexture,
    normalTexture,
    worldSize,
    biomeConfig,
    hydrologyMask,
    farCanopyTint,
    splatmap: splatmap ?? {
      layers: [],
      triplanarSlopeThreshold: 0.707,
      antiTilingStrength: 0.3,
    },
    surfaceWetness: readCurrentSurfaceWetness(material),
    surfacePatches,
  });
  material.needsUpdate = true;
}

export function updateTerrainMaterialWetness(
  material: THREE.MeshStandardMaterial,
  surfaceWetness: number,
): void {
  const clampedWetness = THREE.MathUtils.clamp(surfaceWetness, 0, 1);
  material.userData.terrainSurfaceWetness = clampedWetness;
  const terrainUniforms = material.userData.terrainUniforms as Record<string, { value: unknown }> | undefined;
  if (terrainUniforms?.environmentWetness) {
    terrainUniforms.environmentWetness.value = clampedWetness;
  }
}

export function updateTerrainMaterialFarCanopyTint(
  material: THREE.MeshStandardMaterial,
  farCanopyTint?: TerrainFarCanopyTintConfig,
): void {
  const normalized = normalizeFarCanopyTint(farCanopyTint);
  material.userData.terrainFarCanopyTint = normalized;
  const terrainUniforms = material.userData.terrainUniforms as Record<string, { value: unknown }> | undefined;
  if (!terrainUniforms) return;

  terrainUniforms.farCanopyTintEnabled.value = normalized.enabled ? 1 : 0;
  terrainUniforms.farCanopyTintStartDistance.value = normalized.startDistance;
  terrainUniforms.farCanopyTintEndDistance.value = normalized.endDistance;
  terrainUniforms.farCanopyTintStrength.value = normalized.strength;
  terrainUniforms.farCanopyTintFogStrength.value = normalized.fogStrength;
  (terrainUniforms.farCanopyTintColor.value as THREE.Color).setRGB(
    normalized.color[0],
    normalized.color[1],
    normalized.color[2],
  );
}

function applyTerrainMaterialOptions(
  material: THREE.MeshStandardMaterial,
  options: TerrainMaterialOptions,
): void {
  const shaderBindings = createShaderBindings(options);
  material.userData ??= {};

  const existingUniforms = material.userData.terrainUniforms as Record<string, { value: unknown }> | undefined;

  if (existingUniforms) {
    // Update existing uniform values IN PLACE to preserve shader references.
    // Creating new uniform objects would orphan the compiled shader's references.
    for (const [key, uniform] of Object.entries(shaderBindings.uniforms)) {
      if (existingUniforms[key]) {
        existingUniforms[key].value = (uniform as { value: unknown }).value;
      } else {
        existingUniforms[key] = uniform as { value: unknown };
      }
    }
    material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;
    material.userData.terrainFarCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);
    return;
  }

  // First-time setup: store uniforms and install onBeforeCompile
  material.userData.terrainUniforms = shaderBindings.uniforms;
  material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;
  material.userData.terrainFarCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);

  // Unique program cache key so Three.js never serves a cached plain
  // MeshStandardMaterial program for this terrain shader.
  material.customProgramCacheKey = () => 'TerrainCDLOD_v3_hydrology_mask';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shaderBindings.uniforms);

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + TERRAIN_VERTEX_PARS,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + TERRAIN_VERTEX_MAIN,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = modelViewMatrix * worldPos4;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );
    // worldPos4 already includes instanceMatrix + heightmap displacement.
    // The default worldpos_vertex would apply instanceMatrix to 'transformed'
    // a second time, producing wildly wrong shadow/fog coordinates.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
        vec4 worldPosition = modelMatrix * worldPos4;
      #endif
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + TERRAIN_FRAGMENT_PARS,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      TERRAIN_FRAGMENT_MAP,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n' + TERRAIN_FRAGMENT_ROUGHNESS,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n' + TERRAIN_FRAGMENT_NORMAL_OVERRIDE,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      TERRAIN_FRAGMENT_FOG_TINT,
    );
  };
}

function surfaceKindToShaderId(kind: TerrainSurfaceKind): number {
  switch (kind) {
    case 'packed_earth': return 1.0;
    case 'runway': return 2.0;
    case 'dirt_road': return 3.0;
    case 'gravel_road': return 4.0;
    case 'jungle_trail': return 5.0;
    default: return 1.0;
  }
}

function createShaderBindings(options: TerrainMaterialOptions): { uniforms: Record<string, { value: unknown }> } {
  const { heightTexture, normalTexture, worldSize, biomeConfig, splatmap } = options;
  const layers = biomeConfig.layers;
  const rules = biomeConfig.rules;
  const surfacePatches = options.surfacePatches ?? [];
  const surfaceWetness = THREE.MathUtils.clamp(options.surfaceWetness ?? 0, 0, 1);
  const farCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);
  const hydrologyMask = resolveHydrologyMaskMaterial(options.hydrologyMask, biomeConfig, heightTexture);

  if (layers.length === 0) {
    throw new Error('Terrain material requires at least one biome layer');
  }
  if (layers.length > MAX_BIOME_TEXTURES) {
    throw new Error(`Terrain material supports at most ${MAX_BIOME_TEXTURES} biome textures, received ${layers.length}`);
  }
  if (rules.length > MAX_BIOME_RULES) {
    throw new Error(`Terrain material supports at most ${MAX_BIOME_RULES} biome rules, received ${rules.length}`);
  }

  const biomeTileScale = new Float32Array(MAX_BIOME_TEXTURES);
  const biomeRoughness = new Float32Array(MAX_BIOME_TEXTURES);
  const ruleBiomeSlot = new Float32Array(MAX_BIOME_RULES);
  const ruleMinElevation = new Float32Array(MAX_BIOME_RULES);
  const ruleMaxElevation = new Float32Array(MAX_BIOME_RULES);
  const ruleElevationBlendWidth = new Float32Array(MAX_BIOME_RULES);
  const ruleMinUpDot = new Float32Array(MAX_BIOME_RULES);
  const rulePriority = new Float32Array(MAX_BIOME_RULES);
  const ruleEnabled = new Float32Array(MAX_BIOME_RULES);
  const featureSurfaceShape = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceType = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceX = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceZ = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceInnerRadius = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceOuterRadius = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceHalfWidth = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceHalfLength = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceBlend = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceYawCos = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);
  const featureSurfaceYawSin = new Float32Array(MAX_FEATURE_SURFACE_PATCHES);

  for (let i = 0; i < MAX_BIOME_TEXTURES; i++) {
    const layer = layers[i] ?? layers[0];
    biomeTileScale[i] = layer.tileScale;
    biomeRoughness[i] = layer.roughness;
  }

  for (let i = 0; i < MAX_BIOME_RULES; i++) {
    const rule = rules[i];
    if (!rule) {
      ruleBiomeSlot[i] = 0;
      ruleMinElevation[i] = -1e9;
      ruleMaxElevation[i] = 1e9;
      ruleElevationBlendWidth[i] = 120;
      ruleMinUpDot[i] = -1;
      rulePriority[i] = -1e9;
      ruleEnabled[i] = 0;
      continue;
    }

    ruleBiomeSlot[i] = rule.biomeSlot;
    ruleMinElevation[i] = rule.elevationMin;
    ruleMaxElevation[i] = rule.elevationMax;
    ruleElevationBlendWidth[i] = rule.elevationBlendWidth ?? 120;
    ruleMinUpDot[i] = rule.minUpDot;
    rulePriority[i] = rule.priority;
    ruleEnabled[i] = 1;
  }

  for (let i = 0; i < MAX_FEATURE_SURFACE_PATCHES; i++) {
    const patch = surfacePatches[i];
    if (!patch) {
      featureSurfaceShape[i] = 0;
      featureSurfaceType[i] = 0;
      featureSurfaceBlend[i] = 1;
      featureSurfaceYawCos[i] = 1;
      continue;
    }

    featureSurfaceX[i] = patch.x;
    featureSurfaceZ[i] = patch.z;
    featureSurfaceType[i] = surfaceKindToShaderId(patch.surface);
    if (patch.shape === 'circle') {
      featureSurfaceShape[i] = 1;
      featureSurfaceInnerRadius[i] = patch.innerRadius;
      featureSurfaceOuterRadius[i] = patch.outerRadius;
      featureSurfaceBlend[i] = Math.max(0.1, patch.outerRadius - patch.innerRadius);
      featureSurfaceYawCos[i] = 1;
      featureSurfaceYawSin[i] = 0;
      continue;
    }

    featureSurfaceShape[i] = 2;
    featureSurfaceHalfWidth[i] = patch.width * 0.5;
    featureSurfaceHalfLength[i] = patch.length * 0.5;
    featureSurfaceBlend[i] = patch.blend;
    featureSurfaceYawCos[i] = Math.cos(patch.yaw);
    featureSurfaceYawSin[i] = Math.sin(patch.yaw);
  }

  const tileGridRes = options.tileGridResolution ?? 32;

  const heightmapGridSize = heightTexture.image?.width ?? 512;

  const uniforms: Record<string, { value: unknown }> = {
    terrainHeightmap: { value: heightTexture },
    terrainNormalMap: { value: normalTexture },
    terrainWorldSize: { value: worldSize },
    heightmapGridSize: { value: heightmapGridSize },
    tileGridResolution: { value: tileGridRes },
    debugWireframe: { value: false },
    antiTilingStrength: { value: splatmap.antiTilingStrength },
    triplanarSlopeThreshold: { value: splatmap.triplanarSlopeThreshold },
    environmentWetness: { value: surfaceWetness },
    farCanopyTintEnabled: { value: farCanopyTint.enabled ? 1 : 0 },
    farCanopyTintStartDistance: { value: farCanopyTint.startDistance },
    farCanopyTintEndDistance: { value: farCanopyTint.endDistance },
    farCanopyTintStrength: { value: farCanopyTint.strength },
    farCanopyTintFogStrength: { value: farCanopyTint.fogStrength },
    farCanopyTintColor: { value: new THREE.Color(
      farCanopyTint.color[0],
      farCanopyTint.color[1],
      farCanopyTint.color[2],
    ) },
    hydrologyMaskTexture: { value: hydrologyMask.texture },
    hydrologyMaskEnabled: { value: hydrologyMask.enabled ? 1 : 0 },
    hydrologyMaskOrigin: { value: new THREE.Vector2(hydrologyMask.originX, hydrologyMask.originZ) },
    hydrologyMaskTextureSize: { value: new THREE.Vector2(hydrologyMask.width, hydrologyMask.height) },
    hydrologyMaskCellSize: { value: hydrologyMask.cellSizeMeters },
    hydrologyWetBiomeSlot: { value: hydrologyMask.wetBiomeSlot },
    hydrologyChannelBiomeSlot: { value: hydrologyMask.channelBiomeSlot },
    hydrologyWetStrength: { value: hydrologyMask.wetStrength },
    hydrologyChannelStrength: { value: hydrologyMask.channelStrength },
    featureSurfacePatchCount: { value: Math.min(surfacePatches.length, MAX_FEATURE_SURFACE_PATCHES) },
    cliffRockBiomeSlot: { value: biomeConfig.cliffRockBiomeSlot ?? 0 },
    featureSurfaceShape: { value: featureSurfaceShape },
    featureSurfaceType: { value: featureSurfaceType },
    featureSurfaceX: { value: featureSurfaceX },
    featureSurfaceZ: { value: featureSurfaceZ },
    featureSurfaceInnerRadius: { value: featureSurfaceInnerRadius },
    featureSurfaceOuterRadius: { value: featureSurfaceOuterRadius },
    featureSurfaceHalfWidth: { value: featureSurfaceHalfWidth },
    featureSurfaceHalfLength: { value: featureSurfaceHalfLength },
    featureSurfaceBlend: { value: featureSurfaceBlend },
    featureSurfaceYawCos: { value: featureSurfaceYawCos },
    featureSurfaceYawSin: { value: featureSurfaceYawSin },
    biomeTileScale: { value: biomeTileScale },
    biomeRoughness: { value: biomeRoughness },
    biomeRuleBiomeSlot: { value: ruleBiomeSlot },
    biomeRuleMinElevation: { value: ruleMinElevation },
    biomeRuleMaxElevation: { value: ruleMaxElevation },
    biomeRuleElevationBlendWidth: { value: ruleElevationBlendWidth },
    biomeRuleMinUpDot: { value: ruleMinUpDot },
    biomeRulePriority: { value: rulePriority },
    biomeRuleEnabled: { value: ruleEnabled },
  };

  for (let i = 0; i < MAX_BIOME_TEXTURES; i++) {
    uniforms[`biomeTexture${i}`] = { value: (layers[i] ?? layers[0]).texture };
  }

  return { uniforms };
}

function normalizeFarCanopyTint(farCanopyTint?: TerrainFarCanopyTintConfig): Required<TerrainFarCanopyTintConfig> {
  const startDistance = Math.max(0, farCanopyTint?.startDistance ?? 600);
  const endDistance = Math.max(startDistance + 1, farCanopyTint?.endDistance ?? 1400);
  const strength = THREE.MathUtils.clamp(farCanopyTint?.strength ?? 0.28, 0, 0.65);
  const fogStrength = THREE.MathUtils.clamp(farCanopyTint?.fogStrength ?? 0.42, 0, 1);
  const color = farCanopyTint?.color ?? [0.12, 0.26, 0.11];

  return {
    enabled: farCanopyTint?.enabled === true,
    startDistance,
    endDistance,
    strength,
    fogStrength,
    color,
  };
}

interface ResolvedTerrainHydrologyMaskMaterialConfig {
  enabled: boolean;
  texture: THREE.Texture;
  width: number;
  height: number;
  originX: number;
  originZ: number;
  cellSizeMeters: number;
  wetBiomeSlot: number;
  channelBiomeSlot: number;
  wetStrength: number;
  channelStrength: number;
}

function resolveHydrologyMaskMaterial(
  hydrologyMask: TerrainHydrologyMaskMaterialConfig | null | undefined,
  biomeConfig: TerrainBiomeMaterialConfig,
  fallbackTexture: THREE.Texture,
): ResolvedTerrainHydrologyMaskMaterialConfig {
  const disabled = {
    enabled: false,
    texture: fallbackTexture,
    width: 1,
    height: 1,
    originX: 0,
    originZ: 0,
    cellSizeMeters: 1,
    wetBiomeSlot: 0,
    channelBiomeSlot: 0,
    wetStrength: 0,
    channelStrength: 0,
  };
  if (!hydrologyMask) return disabled;

  const wetBiomeSlot = biomeConfig.layers.findIndex((layer) => layer.biomeId === hydrologyMask.wetBiomeId);
  const channelBiomeSlot = biomeConfig.layers.findIndex((layer) => layer.biomeId === hydrologyMask.channelBiomeId);
  if (
    wetBiomeSlot < 0
    || channelBiomeSlot < 0
    || hydrologyMask.width <= 0
    || hydrologyMask.height <= 0
    || hydrologyMask.cellSizeMeters <= 0
  ) {
    return disabled;
  }

  return {
    enabled: true,
    texture: hydrologyMask.texture,
    width: hydrologyMask.width,
    height: hydrologyMask.height,
    originX: hydrologyMask.originX,
    originZ: hydrologyMask.originZ,
    cellSizeMeters: hydrologyMask.cellSizeMeters,
    wetBiomeSlot,
    channelBiomeSlot,
    wetStrength: THREE.MathUtils.clamp(hydrologyMask.wetStrength ?? 0.08, 0, 1),
    channelStrength: THREE.MathUtils.clamp(hydrologyMask.channelStrength ?? 0.14, 0, 1),
  };
}

function readCurrentSurfaceWetness(material: THREE.MeshStandardMaterial): number {
  const currentWetness = material.userData.terrainSurfaceWetness;
  return typeof currentWetness === 'number' ? currentWetness : 0;
}
