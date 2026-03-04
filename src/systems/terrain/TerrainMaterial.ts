import * as THREE from 'three';
import type { SplatmapConfig } from './TerrainConfig';

const MAX_BIOME_TEXTURES = 8;
const MAX_BIOME_RULES = 8;

const TERRAIN_VERTEX_PARS = /* glsl */ `
uniform sampler2D terrainHeightmap;
uniform sampler2D terrainNormalMap;
uniform float terrainWorldSize;

attribute float lodLevel;
attribute float morphFactor;

varying vec3 vWorldPosition;
varying vec2 vWorldUV;
varying vec3 vTerrainNormal;
varying float vLodLevel;
varying float vMorphFactor;
`;

const TERRAIN_VERTEX_MAIN = /* glsl */ `
vec4 worldPos4 = instanceMatrix * vec4(position, 1.0);
float halfWorld = terrainWorldSize * 0.5;
vWorldUV = vec2(
  (worldPos4.x + halfWorld) / terrainWorldSize,
  (worldPos4.z + halfWorld) / terrainWorldSize
);

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

float classifyBiomeSlot(vec3 normal) {
  float elevation = vWorldPosition.y;
  float slopeUp = clamp(dot(normal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
  float selectedSlot = 0.0;
  float selectedPriority = -100000.0;

  for (int i = 0; i < 8; i++) {
    if (biomeRuleEnabled[i] < 0.5) {
      continue;
    }

    bool matches = elevation >= biomeRuleMinElevation[i]
      && elevation <= biomeRuleMaxElevation[i]
      && slopeUp >= biomeRuleMinUpDot[i];

    if (matches && biomeRulePriority[i] > selectedPriority) {
      selectedPriority = biomeRulePriority[i];
      selectedSlot = biomeRuleBiomeSlot[i];
    }
  }

  return selectedSlot;
}

vec4 sampleBiomeTexture(float biomeSlot, vec2 worldUv, vec2 uvOffset) {
  if (biomeSlot < 0.5) return texture2D(biomeTexture0, worldUv * biomeTileScale[0] + uvOffset);
  if (biomeSlot < 1.5) return texture2D(biomeTexture1, worldUv * biomeTileScale[1] + uvOffset);
  if (biomeSlot < 2.5) return texture2D(biomeTexture2, worldUv * biomeTileScale[2] + uvOffset);
  if (biomeSlot < 3.5) return texture2D(biomeTexture3, worldUv * biomeTileScale[3] + uvOffset);
  if (biomeSlot < 4.5) return texture2D(biomeTexture4, worldUv * biomeTileScale[4] + uvOffset);
  if (biomeSlot < 5.5) return texture2D(biomeTexture5, worldUv * biomeTileScale[5] + uvOffset);
  if (biomeSlot < 6.5) return texture2D(biomeTexture6, worldUv * biomeTileScale[6] + uvOffset);
  return texture2D(biomeTexture7, worldUv * biomeTileScale[7] + uvOffset);
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
`;

const TERRAIN_FRAGMENT_MAP = /* glsl */ `
float biomeSlot = classifyBiomeSlot(vTerrainNormal);
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
vec4 planarSample = sampleBiomeTexture(biomeSlot, vWorldPosition.xz, uvOffset);
vec4 triplanarSample = sampleBiomeTriplanar(biomeSlot, vWorldPosition, normalize(vTerrainNormal), uvOffset);
vec4 biomeSample = mix(planarSample, triplanarSample, triplanarBlend);
diffuseColor.rgb = biomeSample.rgb;
`;

const TERRAIN_FRAGMENT_ROUGHNESS = /* glsl */ `
float roughnessBiomeSlot = classifyBiomeSlot(vTerrainNormal);
roughnessFactor *= sampleBiomeRoughness(roughnessBiomeSlot);
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
  });
  material.needsUpdate = true;
}

function applyTerrainMaterialOptions(
  material: THREE.MeshStandardMaterial,
  options: TerrainMaterialOptions,
): void {
  const shaderBindings = createShaderBindings(options);

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

  const uniforms: Record<string, { value: unknown }> = {
    terrainHeightmap: { value: heightTexture },
    terrainNormalMap: { value: normalTexture },
    terrainWorldSize: { value: worldSize },
    antiTilingStrength: { value: splatmap.antiTilingStrength },
    triplanarSlopeThreshold: { value: splatmap.triplanarSlopeThreshold },
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
