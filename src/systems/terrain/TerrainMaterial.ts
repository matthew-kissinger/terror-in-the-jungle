import * as THREE from 'three';
import type { SplatmapConfig } from './TerrainConfig';

const MAX_BIOME_TEXTURES = 8;
const MAX_BIOME_RULES = 8;

const TERRAIN_VERTEX_PARS = /* glsl */ `
uniform sampler2D terrainHeightmap;
uniform sampler2D terrainNormalMap;
uniform float terrainWorldSize;
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
vWorldUV = clamp(vec2(
  (worldPos4.x + halfWorld) / terrainWorldSize,
  (worldPos4.z + halfWorld) / terrainWorldSize
), 0.0, 1.0);

float terrainH = texture2D(terrainHeightmap, vWorldUV).r;
worldPos4.y = terrainH;

vWorldPosition = worldPos4.xyz;
vLodLevel = lodLevel;
vMorphFactor = morphFactor;

vec3 nSample = texture2D(terrainNormalMap, vWorldUV).rgb * 2.0 - 1.0;
vTerrainNormal = normalize(nSample);
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
uniform float biomeRuleMinUpDot[8];
uniform float biomeRulePriority[8];
uniform float biomeRuleEnabled[8];
uniform float antiTilingStrength;
uniform float triplanarSlopeThreshold;
uniform float environmentWetness;
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
    120.0
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
  float cliffMask = 1.0 - smoothstep(0.55, 0.78, slopeUp);
  float elevationMask = smoothstep(700.0, 1400.0, elevation);
  float rockBlend = cliffMask * elevationMask * 0.38;
  if (rockBlend <= 0.001) {
    return color;
  }

  vec4 rockPlanar = sampleBiomeTexture(1.0, worldUv, uvOffset);
  return mix(color, rockPlanar.rgb, rockBlend);
}
`;

const TERRAIN_FRAGMENT_MAP = /* glsl */ `
float primaryBiomeSlot;
float secondaryBiomeSlot;
float secondaryBiomeBlend;
classifyBiomeBlend(normalize(vTerrainNormal), primaryBiomeSlot, secondaryBiomeSlot, secondaryBiomeBlend);
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
roughnessFactor *= roughnessSample;
`;

const TERRAIN_FRAGMENT_NORMAL_OVERRIDE = /* glsl */ `
normal = normalize(vTerrainNormal);
nonPerturbedNormal = normal;
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
  minUpDot: number;
  priority: number;
}

export interface TerrainBiomeMaterialConfig {
  layers: TerrainBiomeLayerConfig[];
  rules: TerrainBiomeRuleConfig[];
}

export interface TerrainMaterialOptions {
  heightTexture: THREE.DataTexture;
  normalTexture: THREE.DataTexture;
  worldSize: number;
  splatmap: SplatmapConfig;
  biomeConfig: TerrainBiomeMaterialConfig;
  surfaceWetness?: number;
  tileGridResolution?: number;
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
): void {
  applyTerrainMaterialOptions(material, {
    heightTexture,
    normalTexture,
    worldSize,
    biomeConfig,
    splatmap: splatmap ?? {
      layers: [],
      triplanarSlopeThreshold: 0.707,
      antiTilingStrength: 0.3,
    },
    surfaceWetness: readCurrentSurfaceWetness(material),
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
    return;
  }

  // First-time setup: store uniforms and install onBeforeCompile
  material.userData.terrainUniforms = shaderBindings.uniforms;
  material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;

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
  };
}

function createShaderBindings(options: TerrainMaterialOptions): { uniforms: Record<string, { value: unknown }> } {
  const { heightTexture, normalTexture, worldSize, biomeConfig, splatmap } = options;
  const layers = biomeConfig.layers;
  const rules = biomeConfig.rules;
  const surfaceWetness = THREE.MathUtils.clamp(options.surfaceWetness ?? 0, 0, 1);

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
  const ruleMinUpDot = new Float32Array(MAX_BIOME_RULES);
  const rulePriority = new Float32Array(MAX_BIOME_RULES);
  const ruleEnabled = new Float32Array(MAX_BIOME_RULES);

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
      ruleMinUpDot[i] = -1;
      rulePriority[i] = -1e9;
      ruleEnabled[i] = 0;
      continue;
    }

    ruleBiomeSlot[i] = rule.biomeSlot;
    ruleMinElevation[i] = rule.elevationMin;
    ruleMaxElevation[i] = rule.elevationMax;
    ruleMinUpDot[i] = rule.minUpDot;
    rulePriority[i] = rule.priority;
    ruleEnabled[i] = 1;
  }

  const tileGridRes = options.tileGridResolution ?? 32;

  const uniforms: Record<string, { value: unknown }> = {
    terrainHeightmap: { value: heightTexture },
    terrainNormalMap: { value: normalTexture },
    terrainWorldSize: { value: worldSize },
    tileGridResolution: { value: tileGridRes },
    debugWireframe: { value: false },
    antiTilingStrength: { value: splatmap.antiTilingStrength },
    triplanarSlopeThreshold: { value: splatmap.triplanarSlopeThreshold },
    environmentWetness: { value: surfaceWetness },
    biomeTileScale: { value: biomeTileScale },
    biomeRoughness: { value: biomeRoughness },
    biomeRuleBiomeSlot: { value: ruleBiomeSlot },
    biomeRuleMinElevation: { value: ruleMinElevation },
    biomeRuleMaxElevation: { value: ruleMaxElevation },
    biomeRuleMinUpDot: { value: ruleMinUpDot },
    biomeRulePriority: { value: rulePriority },
    biomeRuleEnabled: { value: ruleEnabled },
  };

  for (let i = 0; i < MAX_BIOME_TEXTURES; i++) {
    uniforms[`biomeTexture${i}`] = { value: (layers[i] ?? layers[0]).texture };
  }

  return { uniforms };
}

function readCurrentSurfaceWetness(material: THREE.MeshStandardMaterial): number {
  const currentWetness = material.userData.terrainSurfaceWetness;
  return typeof currentWetness === 'number' ? currentWetness : 0;
}
