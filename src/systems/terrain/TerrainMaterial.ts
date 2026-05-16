import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  clamp as tslClampBase,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  length as tslLengthBase,
  max as tslMaxBase,
  min as tslMinBase,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  reference,
  sin,
  smoothstep,
  step,
  texture as tslTextureNode,
  vec2,
  vec3,
} from 'three/tsl';
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

type UniformSlot<T = unknown> = { value: T };
type TerrainUniforms = Record<string, UniformSlot>;
type TslNode = any;

export type TerrainMaterial = MeshStandardNodeMaterial & {
  uniforms: TerrainUniforms;
  isKonveyerTerrainNodeMaterial: true;
};

const tslAttribute = (name: string, type: string): TslNode => attribute(name, type) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslReference = (type: string, uniform: UniformSlot): TslNode => reference('value', type, uniform) as TslNode;
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => tslTextureNode(source, sampleUv) as TslNode;
const tslClamp = (...args: TslNode[]): TslNode => (tslClampBase as (...values: TslNode[]) => TslNode)(...args);
const tslLength = (value: TslNode): TslNode => (tslLengthBase as (node: TslNode) => TslNode)(value);
const tslMax = (...args: TslNode[]): TslNode => (tslMaxBase as (...values: TslNode[]) => TslNode)(...args);
const tslMin = (...args: TslNode[]): TslNode => (tslMinBase as (...values: TslNode[]) => TslNode)(...args);
const tslPositionGeometry = positionGeometry as TslNode;
const tslPositionWorld = positionWorld as TslNode;
const tslCameraPosition = cameraPosition as TslNode;

export const TERRAIN_VERTEX_MAIN = /* glsl */ `
// CDLOD morph: snap fine-grid vertices toward parent LOD grid for smooth transitions.
// tileGridResolution is the QUAD count (e.g. 32 for the default 33-vertex
// tile), set via tileResolution - 1 at TerrainSystem.ts:114 -> wired into
// TerrainSurfaceRuntime.ts:67 as the uniform value. Vertex spacing in
// tile-local gridPos units (gridPos = position.xz + 0.5, range [0,1]) is
// 1/tileGridResolution; the parent LOD grid hits every other vertex, so
// parent spacing is 2/tileGridResolution. Don't change this without also
// updating the JS port in TerrainMaterial.morph.test.ts.
float parentStep = 2.0 / tileGridResolution;
vec2 gridPos = position.xz + 0.5;

// Force full morph on edges abutting a coarser-LOD neighbour. The
// neighbour's vertex grid spacing is 2x ours; without the force-morph
// our edge vertices drift between the neighbour's verts at any partial
// morphFactor and reopen the T-junction crack. Bits: 1=+Z(N), 2=+X(E),
// 4=-Z(S), 8=-X(W). Perimeter verts hit gridPos==0 or gridPos==1 exactly
// (PlaneGeometry-derived; see createTileGeometry).
float effectiveMorph = morphFactor;
const float EDGE_EPS = 1.0e-4;
int mask = int(edgeMorphMask + 0.5);
if (gridPos.y >= 1.0 - EDGE_EPS && (mask & 1) != 0) effectiveMorph = 1.0;
if (gridPos.x >= 1.0 - EDGE_EPS && (mask & 2) != 0) effectiveMorph = 1.0;
if (gridPos.y <= EDGE_EPS         && (mask & 4) != 0) effectiveMorph = 1.0;
if (gridPos.x <= EDGE_EPS         && (mask & 8) != 0) effectiveMorph = 1.0;

vec2 snapped = floor(gridPos / parentStep + 0.5) * parentStep;
vec3 morphedPos = vec3(
  mix(gridPos.x, snapped.x, effectiveMorph) - 0.5,
  position.y,
  mix(gridPos.y, snapped.y, effectiveMorph) - 0.5
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

// CDLOD skirt: perimeter-ring duplicate vertices drop below the heightmap
// to hide sub-pixel cracks at chunk borders. Coarser tiles (higher
// lodLevel) get larger drops because their seam-cracks scale with tile
// size. Skirts only ever drop, never rise — guarantees no poke-through
// into adjacent tiles. See terrain-cdlod-seam Stage D2.
float skirtDrop = max(2.0, 4.0 * (lodLevel + 1.0));
worldPos4.y -= step(0.5, isSkirt) * skirtDrop;

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
  playableWorldSize?: number;
  visualMargin?: number;
  splatmap: SplatmapConfig;
  biomeConfig: TerrainBiomeMaterialConfig;
  hydrologyMask?: TerrainHydrologyMaskMaterialConfig | null;
  farCanopyTint?: TerrainFarCanopyTintConfig;
  surfaceWetness?: number;
  tileGridResolution?: number;
  surfacePatches?: TerrainSurfacePatch[];
}

function uniformTexture(uniforms: TerrainUniforms, key: string): THREE.Texture {
  return uniforms[key].value as THREE.Texture;
}

function uniformNumber(uniforms: TerrainUniforms, key: string): number {
  return uniforms[key].value as number;
}

function uniformArrayValue(uniforms: TerrainUniforms, key: string, index: number): number {
  return (uniforms[key].value as Float32Array)[index] ?? 0;
}

function createTerrainWorldUvNode(uniforms: TerrainUniforms, worldPos: TslNode): TslNode {
  const terrainWorldSize = tslReference('float', uniforms.terrainWorldSize);
  const heightmapGridSize = tslReference('float', uniforms.heightmapGridSize);
  const halfWorld = terrainWorldSize.mul(0.5);
  const texelHalf = tslFloat(0.5).div(heightmapGridSize);
  const uvScale = heightmapGridSize.sub(1).div(heightmapGridSize);
  const normalizedPos = tslVec2(
    worldPos.x.add(halfWorld).div(terrainWorldSize),
    worldPos.z.add(halfWorld).div(terrainWorldSize),
  );
  return tslClamp(normalizedPos.mul(uvScale).add(texelHalf), tslVec2(0, 0), tslVec2(1, 1));
}

function edgeBit(edgeMorphMask: TslNode, bit: number): TslNode {
  return step(tslFloat(0.5), floor(edgeMorphMask.div(bit)).mod(2)) as TslNode;
}

function createTerrainPositionNode(uniforms: TerrainUniforms): TslNode {
  const tileParams0 = tslAttribute('tileParams0', 'vec4');
  const tileParams1 = tslAttribute('tileParams1', 'vec4');
  const tileCenterX = tileParams0.x;
  const tileCenterZ = tileParams0.y;
  const tileSize = tileParams0.z;
  const lodLevel = tileParams0.w;
  const morphFactor = tileParams1.x;
  const edgeMorphMask = tileParams1.y;
  const isSkirt = tslAttribute('isSkirt', 'float');
  const tileGridResolution = tslReference('float', uniforms.tileGridResolution);
  const gridPos = tslPositionGeometry.xz.add(tslVec2(0.5, 0.5));
  const edgeEps = tslFloat(1.0e-4);
  const north = step(tslFloat(1).sub(edgeEps), gridPos.y).mul(edgeBit(edgeMorphMask, 1));
  const east = step(tslFloat(1).sub(edgeEps), gridPos.x).mul(edgeBit(edgeMorphMask, 2));
  const south = step(gridPos.y, edgeEps).mul(edgeBit(edgeMorphMask, 4));
  const west = step(gridPos.x, edgeEps).mul(edgeBit(edgeMorphMask, 8));
  const forcedMorph = tslMax(tslMax(north, east), tslMax(south, west));
  const effectiveMorph = tslMix(morphFactor, tslFloat(1), forcedMorph);
  const parentStep = tslFloat(2).div(tileGridResolution);
  const snapped = floor(gridPos.div(parentStep).add(0.5)).mul(parentStep);
  const morphedX = tslMix(gridPos.x, snapped.x, effectiveMorph).sub(0.5);
  const morphedZ = tslMix(gridPos.y, snapped.y, effectiveMorph).sub(0.5);
  const worldPos = tslVec3(
    tileCenterX.add(morphedX.mul(tileSize)),
    tslFloat(0),
    tileCenterZ.add(morphedZ.mul(tileSize)),
  );
  const worldUv = createTerrainWorldUvNode(uniforms, worldPos);
  const terrainHeight = tslTexture(uniformTexture(uniforms, 'terrainHeightmap'), worldUv).r;
  const skirtDrop = tslMax(tslFloat(2), lodLevel.add(1).mul(4));
  // Return tile-local X/Z: InstancedMesh applies the tile matrix after
  // positionNode. Height is already world-space Y because instance Y scale is 1.
  return tslVec3(
    morphedX,
    terrainHeight.sub(step(tslFloat(0.5), isSkirt).mul(skirtDrop)),
    morphedZ,
  );
}

function createTerrainNormalNode(uniforms: TerrainUniforms, worldPos: TslNode = tslPositionWorld): TslNode {
  const worldUv = createTerrainWorldUvNode(uniforms, worldPos);
  return normalize(tslTexture(uniformTexture(uniforms, 'terrainNormalMap'), worldUv).rgb.mul(2).sub(1)) as TslNode;
}

function hashUvNode(p: TslNode): TslNode {
  const q = fract(p.mul(tslVec2(123.34, 456.21))) as TslNode;
  return fract(q.x.mul(q.y).add(dot(q, q.add(45.32)))) as TslNode;
}

function rotateUvNode(sampleUv: TslNode, angle: TslNode): TslNode {
  const s = sin(angle) as TslNode;
  const c = cos(angle) as TslNode;
  return tslVec2(
    c.mul(sampleUv.x).sub(s.mul(sampleUv.y)),
    s.mul(sampleUv.x).add(c.mul(sampleUv.y)),
  );
}

function sampleBiomeTextureRaw(biomeSlot: TslNode, sampleUv: TslNode, uniforms: TerrainUniforms): TslNode {
  const wrappedUv = fract(sampleUv) as TslNode;
  let sample = tslTexture(uniformTexture(uniforms, 'biomeTexture0'), wrappedUv);
  for (let i = 1; i < MAX_BIOME_TEXTURES; i++) {
    sample = tslMix(
      sample,
      tslTexture(uniformTexture(uniforms, `biomeTexture${i}`), wrappedUv),
      step(tslFloat(i - 0.5), biomeSlot),
    );
  }
  return sample;
}

function sampleBiomeScalar(biomeSlot: TslNode, uniforms: TerrainUniforms, key: string): TslNode {
  let value = tslFloat(uniformArrayValue(uniforms, key, 0));
  for (let i = 1; i < MAX_BIOME_TEXTURES; i++) {
    value = tslMix(value, tslFloat(uniformArrayValue(uniforms, key, i)), step(tslFloat(i - 0.5), biomeSlot));
  }
  return value;
}

function sampleBiomeTexture(biomeSlot: TslNode, worldUv: TslNode, uvOffset: TslNode, uniforms: TerrainUniforms): TslNode {
  const tileScale = sampleBiomeScalar(biomeSlot, uniforms, 'biomeTileScale');
  const primaryUv = worldUv.mul(tileScale).add(uvOffset);
  const rotatedUv = rotateUvNode(worldUv, tslFloat(0.67))
    .mul(tileScale.mul(0.63))
    .add(uvOffset.mul(1.7))
    .add(tslVec2(17.13, 9.71));
  const primarySample = sampleBiomeTextureRaw(biomeSlot, primaryUv, uniforms);
  const rotatedSample = sampleBiomeTextureRaw(biomeSlot, rotatedUv, uniforms);
  const breakup = hashUvNode(worldUv.mul(0.25).add(uvOffset.mul(10)));
  return tslMix(primarySample, rotatedSample, tslFloat(0.32).add(breakup.mul(0.18)));
}

function sampleBiomeTriplanar(biomeSlot: TslNode, worldPos: TslNode, worldNormal: TslNode, uvOffset: TslNode, uniforms: TerrainUniforms): TslNode {
  let blend = pow(abs(worldNormal), tslVec3(4, 4, 4)) as TslNode;
  blend = blend.div(tslMax(dot(blend, tslVec3(1, 1, 1)), tslFloat(0.0001)));
  const sampleX = sampleBiomeTexture(biomeSlot, worldPos.zy, uvOffset, uniforms);
  const sampleY = sampleBiomeTexture(biomeSlot, worldPos.xz, uvOffset, uniforms);
  const sampleZ = sampleBiomeTexture(biomeSlot, worldPos.xy, uvOffset, uniforms);
  return sampleX.mul(blend.x).add(sampleY.mul(blend.y)).add(sampleZ.mul(blend.z));
}

// Triplanar gate epsilon. Matches the smoothstep clip that produces
// triplanarBlend (= 0 below threshold-0.2, lerp to 1 above threshold).
// On flat surfaces triplanarBlend is exactly 0; the gate skips the 3-axis
// triplanar sub-graph (6 biome-texture calls per slot, 48 effective texture
// samples per fragment) and returns the planar sample directly. See
// docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md.
const TRIPLANAR_GATE_EPSILON = 0.001;

// Selects planar-only vs mix(planar, triplanar, triplanarBlend), gating the
// triplanar sample sub-graph behind a TSL `If` so the compiled fragment
// shader skips it entirely on flat fragments. The Fn boundary establishes
// the build context required by `If` + `.toVar()`.
function sampleBiomeWithTriplanarGate(
  biomeSlot: TslNode,
  worldPos: TslNode,
  worldNormal: TslNode,
  uvOffset: TslNode,
  triplanarBlend: TslNode,
  uniforms: TerrainUniforms,
): TslNode {
  const gated = Fn(([slot, blend]: TslNode[]) => {
    const planar = sampleBiomeTexture(slot, worldPos.xz, uvOffset, uniforms);
    const result = planar.toVar();
    If(blend.greaterThan(TRIPLANAR_GATE_EPSILON), () => {
      const triplanar = sampleBiomeTriplanar(slot, worldPos, worldNormal, uvOffset, uniforms);
      result.assign(tslMix(planar, triplanar, blend));
    });
    return result;
  });
  return gated(biomeSlot, triplanarBlend) as TslNode;
}

function biomeElevationWeight(elevation: TslNode, minElevation: number, maxElevation: number, blendWidth: number): TslNode {
  let weight = tslFloat(1);
  if (minElevation > -99999999) {
    weight = weight.mul(smoothstep(tslFloat(minElevation - blendWidth), tslFloat(minElevation + blendWidth), elevation));
  }
  if (maxElevation < 99999999) {
    weight = weight.mul(tslFloat(1).sub(smoothstep(tslFloat(maxElevation - blendWidth), tslFloat(maxElevation + blendWidth), elevation)));
  }
  return weight;
}

function biomeSlopeWeight(slopeUp: TslNode, minUpDot: number): TslNode {
  if (minUpDot <= -0.5) return tslFloat(1);
  return smoothstep(tslFloat(minUpDot - 0.08), tslFloat(minUpDot + 0.08), slopeUp) as TslNode;
}

function classifyBiomeBlend(worldPos: TslNode, terrainNormal: TslNode, uniforms: TerrainUniforms): {
  primarySlot: TslNode;
  secondarySlot: TslNode;
  secondaryBlend: TslNode;
  slopeUp: TslNode;
} {
  const slopeUp = tslClamp(dot(terrainNormal, tslVec3(0, 1, 0)), tslFloat(0), tslFloat(1));
  let bestSlot = tslFloat(0);
  let bestWeight = tslFloat(0.35);
  let secondSlot = tslFloat(0);
  let secondWeight = tslFloat(0);

  for (let i = 0; i < MAX_BIOME_RULES; i++) {
    const enabled = uniformArrayValue(uniforms, 'biomeRuleEnabled', i);
    if (enabled < 0.5) continue;
    const slot = uniformArrayValue(uniforms, 'biomeRuleBiomeSlot', i);
    const minElevation = uniformArrayValue(uniforms, 'biomeRuleMinElevation', i);
    const maxElevation = uniformArrayValue(uniforms, 'biomeRuleMaxElevation', i);
    const blendWidth = uniformArrayValue(uniforms, 'biomeRuleElevationBlendWidth', i);
    const minUpDot = uniformArrayValue(uniforms, 'biomeRuleMinUpDot', i);
    const priority = uniformArrayValue(uniforms, 'biomeRulePriority', i);
    const ruleWeight = biomeElevationWeight(worldPos.y, minElevation, maxElevation, blendWidth)
      .mul(biomeSlopeWeight(slopeUp, minUpDot))
      .mul(1 + Math.max(0, priority) * 0.02);
    const oldBestSlot = bestSlot;
    const oldBestWeight = bestWeight;
    const isBest = step(bestWeight.add(0.0001), ruleWeight) as TslNode;
    const isSecond = step(secondWeight.add(0.0001), ruleWeight).mul(tslFloat(1).sub(isBest));
    secondSlot = tslMix(secondSlot, tslFloat(slot), isSecond);
    secondWeight = tslMix(secondWeight, ruleWeight, isSecond);
    bestSlot = tslMix(bestSlot, tslFloat(slot), isBest);
    bestWeight = tslMix(bestWeight, ruleWeight, isBest);
    secondSlot = tslMix(secondSlot, oldBestSlot, isBest);
    secondWeight = tslMix(secondWeight, oldBestWeight, isBest);
  }

  const blendActive = step(tslFloat(0.001), secondWeight) as TslNode;
  const secondaryBlend = tslMix(
    tslFloat(0),
    tslClamp(secondWeight.div(bestWeight.add(secondWeight)), tslFloat(0), tslFloat(0.5)),
    blendActive,
  );
  return { primarySlot: bestSlot, secondarySlot: secondSlot, secondaryBlend, slopeUp };
}

function applyHydrologyBiomeBlend(
  worldPos: TslNode,
  primarySlot: TslNode,
  secondarySlot: TslNode,
  secondaryBlend: TslNode,
  uniforms: TerrainUniforms,
): { primarySlot: TslNode; secondarySlot: TslNode; secondaryBlend: TslNode } {
  const enabled = tslReference('float', uniforms.hydrologyMaskEnabled);
  const cellSize = tslReference('float', uniforms.hydrologyMaskCellSize);
  const origin = tslReference('vec2', uniforms.hydrologyMaskOrigin);
  const textureSize = tslReference('vec2', uniforms.hydrologyMaskTextureSize);
  const gridUv = worldPos.xz.sub(origin).div(cellSize).add(tslVec2(0.5, 0.5)).div(textureSize);
  const inside = step(tslFloat(0), gridUv.x)
    .mul(step(gridUv.x, tslFloat(1)))
    .mul(step(tslFloat(0), gridUv.y))
    .mul(step(gridUv.y, tslFloat(1)))
    .mul(step(tslFloat(0.5), enabled))
    .mul(step(tslFloat(0.0001), cellSize));
  const hydrologyMask = tslTexture(
    uniformTexture(uniforms, 'hydrologyMaskTexture'),
    tslClamp(gridUv, tslVec2(0, 0), tslVec2(1, 1)),
  ).rg.mul(inside);
  const channelWeight = (smoothstep(tslFloat(0.2), tslFloat(0.8), hydrologyMask.g) as TslNode)
    .mul(tslReference('float', uniforms.hydrologyChannelStrength));
  const wetWeight = (smoothstep(tslFloat(0.2), tslFloat(0.8), hydrologyMask.r) as TslNode)
    .mul(tslReference('float', uniforms.hydrologyWetStrength));
  const hydrologyWeight = tslMax(channelWeight, wetWeight);
  const hydrologyActive = step(tslFloat(0.001), hydrologyWeight) as TslNode;
  const channelWins = step(wetWeight, channelWeight) as TslNode;
  const hydrologySlot = tslMix(
    tslReference('float', uniforms.hydrologyWetBiomeSlot),
    tslReference('float', uniforms.hydrologyChannelBiomeSlot),
    channelWins,
  );
  return {
    primarySlot: tslMix(primarySlot, hydrologySlot, hydrologyActive),
    secondarySlot: tslMix(secondarySlot, primarySlot, hydrologyActive),
    secondaryBlend: tslMix(secondaryBlend, tslClamp(tslFloat(1).sub(hydrologyWeight), tslFloat(0), tslFloat(1)), hydrologyActive),
  };
}

function macroVariation(worldPos: TslNode): TslNode {
  const base = sin(worldPos.x.mul(0.012).add(sin(worldPos.y.mul(0.007)).mul(1.7)));
  const detail = cos(worldPos.y.mul(0.016).add(sin(worldPos.x.mul(0.011)).mul(1.3)));
  return tslClamp(tslFloat(1).add(base.mul(0.06).add(detail.mul(0.04))), tslFloat(0.9), tslFloat(1.12));
}

function lowlandWetnessMask(slopeUp: TslNode, elevation: TslNode, uniforms: TerrainUniforms): TslNode {
  const lowlandFactor = tslFloat(1).sub(smoothstep(tslFloat(700), tslFloat(1200), elevation));
  const flatFactor = smoothstep(tslFloat(0.58), tslFloat(0.98), slopeUp);
  const wetness = tslClamp(tslReference('float', uniforms.environmentWetness), tslFloat(0), tslFloat(1));
  return lowlandFactor.mul(flatFactor).mul(tslMix(tslFloat(0.35), tslFloat(1), wetness));
}

function farCanopyTintMask(slopeUp: TslNode, elevation: TslNode, worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  const enabled = step(tslFloat(0.5), tslReference('float', uniforms.farCanopyTintEnabled));
  const start = tslReference('float', uniforms.farCanopyTintStartDistance);
  const end = tslMax(start.add(1), tslReference('float', uniforms.farCanopyTintEndDistance));
  const cameraDistance = tslLength(tslCameraPosition.xz.sub(worldPos.xz));
  const distanceMask = smoothstep(start, end, cameraDistance);
  const slopeMask = smoothstep(tslFloat(0.18), tslFloat(0.72), slopeUp);
  const elevationMask = tslFloat(1).sub(smoothstep(tslFloat(2400), tslFloat(3800), elevation));
  const breakup = tslMix(tslFloat(0.74), tslFloat(1.12), hashUvNode(worldPos.xz.mul(0.003).add(tslVec2(3.71, 5.19))));
  return tslClamp(
    tslReference('float', uniforms.farCanopyTintStrength)
      .mul(distanceMask)
      .mul(slopeMask)
      .mul(elevationMask)
      .mul(breakup)
      .mul(enabled),
    tslFloat(0),
    tslFloat(0.65),
  );
}

function visualEdgeTintMask(worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  const playableWorldSize = tslReference('float', uniforms.terrainPlayableWorldSize);
  const visualMargin = tslReference('float', uniforms.terrainVisualMargin);
  const halfPlayable = playableWorldSize.mul(0.5);
  const outsideX = tslMax(abs(worldPos.x).sub(halfPlayable), tslFloat(0));
  const outsideZ = tslMax(abs(worldPos.z).sub(halfPlayable), tslFloat(0));
  const outsideDistance = tslMax(outsideX, outsideZ);
  const enabled = step(tslFloat(1), visualMargin);
  return smoothstep(tslFloat(0), tslMax(tslFloat(1), visualMargin.mul(0.25)), outsideDistance)
    .mul(enabled) as TslNode;
}

function featureSurfaceWeight(surfaceTypeId: number, worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  let weight = tslFloat(0);
  const patchCount = uniformNumber(uniforms, 'featureSurfacePatchCount');
  for (let i = 0; i < Math.min(patchCount, MAX_FEATURE_SURFACE_PATCHES); i++) {
    const shape = uniformArrayValue(uniforms, 'featureSurfaceShape', i);
    const type = uniformArrayValue(uniforms, 'featureSurfaceType', i);
    if (Math.abs(type - surfaceTypeId) > 0.1) continue;
    const center = tslVec2(
      uniformArrayValue(uniforms, 'featureSurfaceX', i),
      uniformArrayValue(uniforms, 'featureSurfaceZ', i),
    );
    const circleDistance = tslLength(worldPos.xz.sub(center));
    const circleMask = tslFloat(1).sub(smoothstep(
      tslFloat(uniformArrayValue(uniforms, 'featureSurfaceInnerRadius', i)),
      tslFloat(Math.max(
        uniformArrayValue(uniforms, 'featureSurfaceInnerRadius', i),
        uniformArrayValue(uniforms, 'featureSurfaceOuterRadius', i),
      )),
      circleDistance,
    ));
    const offset = worldPos.xz.sub(center);
    const yawCos = tslFloat(uniformArrayValue(uniforms, 'featureSurfaceYawCos', i));
    const yawSin = tslFloat(uniformArrayValue(uniforms, 'featureSurfaceYawSin', i));
    const localPos = tslVec2(
      offset.x.mul(yawCos).add(offset.y.mul(yawSin)),
      offset.y.mul(yawCos).sub(offset.x.mul(yawSin)),
    );
    const halfSize = tslVec2(
      uniformArrayValue(uniforms, 'featureSurfaceHalfWidth', i),
      uniformArrayValue(uniforms, 'featureSurfaceHalfLength', i),
    );
    const q = (abs(localPos) as TslNode).sub(halfSize);
    const outsideDistance = tslLength(tslMax(q, tslVec2(0, 0)));
    const sdf = outsideDistance.add(tslMin(tslMax(q.x, q.y), tslFloat(0)));
    const boxMask = tslFloat(1).sub(smoothstep(tslFloat(0), tslFloat(Math.max(0.01, uniformArrayValue(uniforms, 'featureSurfaceBlend', i))), tslMax(sdf, tslFloat(0))));
    weight = tslMax(weight, shape < 1.5 ? circleMask : boxMask);
  }
  return tslClamp(weight, tslFloat(0), tslFloat(1));
}

function applyFeatureSurfaceColor(color: TslNode, worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  const packedEarthWeight = featureSurfaceWeight(1, worldPos, uniforms);
  const runwayWeight = featureSurfaceWeight(2, worldPos, uniforms);
  const dirtRoadWeight = featureSurfaceWeight(3, worldPos, uniforms);
  const gravelRoadWeight = featureSurfaceWeight(4, worldPos, uniforms);
  const jungleTrailWeight = featureSurfaceWeight(5, worldPos, uniforms);
  let result = tslMix(color, tslVec3(0.47, 0.38, 0.24), packedEarthWeight.mul(0.78));
  result = tslMix(result, tslVec3(0.41, 0.39, 0.36), runwayWeight.mul(0.82));
  result = tslMix(result, tslVec3(0.45, 0.35, 0.22), dirtRoadWeight.mul(0.70));
  result = tslMix(result, tslVec3(0.48, 0.44, 0.38), gravelRoadWeight.mul(0.75));
  result = tslMix(result, tslVec3(0.32, 0.26, 0.18), jungleTrailWeight.mul(0.50));
  return result;
}

function createTerrainColorNode(uniforms: TerrainUniforms): TslNode {
  const worldPos = tslPositionWorld;
  const terrainNormal = createTerrainNormalNode(uniforms, worldPos);
  const biomeBlend = classifyBiomeBlend(worldPos, terrainNormal, uniforms);
  const hydrologyBlend = applyHydrologyBiomeBlend(
    worldPos,
    biomeBlend.primarySlot,
    biomeBlend.secondarySlot,
    biomeBlend.secondaryBlend,
    uniforms,
  );
  const antiTilingStrength = tslReference('float', uniforms.antiTilingStrength);
  const uvOffset = tslVec2(
    hashUvNode(createTerrainWorldUvNode(uniforms, worldPos).mul(7)),
    hashUvNode(createTerrainWorldUvNode(uniforms, worldPos).mul(11).add(0.5)),
  ).mul(antiTilingStrength).mul(0.02);
  const triplanarBlend = tslFloat(1).sub(smoothstep(
    tslMax(tslFloat(0), tslReference('float', uniforms.triplanarSlopeThreshold).sub(0.2)),
    tslReference('float', uniforms.triplanarSlopeThreshold),
    biomeBlend.slopeUp,
  ));
  const primarySample = sampleBiomeWithTriplanarGate(
    hydrologyBlend.primarySlot,
    worldPos,
    terrainNormal,
    uvOffset,
    triplanarBlend,
    uniforms,
  );
  const secondarySample = sampleBiomeWithTriplanarGate(
    hydrologyBlend.secondarySlot,
    worldPos,
    terrainNormal,
    uvOffset,
    triplanarBlend,
    uniforms,
  );
  const secondaryActive = step(tslFloat(0.001), hydrologyBlend.secondaryBlend);
  const biomeSample = tslMix(primarySample, tslMix(primarySample, secondarySample, hydrologyBlend.secondaryBlend), secondaryActive);
  let finalColor = biomeSample.rgb.mul(macroVariation(worldPos.xz));
  const lowlandFactor = tslFloat(1).sub(smoothstep(tslFloat(900), tslFloat(1500), worldPos.y));
  const flatFactor = smoothstep(tslFloat(0.45), tslFloat(0.95), biomeBlend.slopeUp);
  finalColor = tslMix(finalColor, finalColor.mul(tslVec3(0.93, 1.01, 0.94)), lowlandFactor.mul(flatFactor).mul(0.22));
  finalColor = tslMix(finalColor, finalColor.mul(tslVec3(0.82, 0.9, 0.84)), lowlandWetnessMask(biomeBlend.slopeUp, worldPos.y, uniforms).mul(0.35));
  const cliffMask = tslFloat(1).sub(smoothstep(tslFloat(0.50), tslFloat(0.74), biomeBlend.slopeUp));
  const proceduralHillMask = smoothstep(tslFloat(20), tslFloat(60), worldPos.y)
    .mul(tslFloat(1).sub(smoothstep(tslFloat(150), tslFloat(300), worldPos.y)));
  const demRidgeMask = smoothstep(tslFloat(450), tslFloat(950), worldPos.y);
  const rockBlend = cliffMask.mul(tslMax(proceduralHillMask, demRidgeMask)).mul(0.26);
  const rockPlanar = sampleBiomeTexture(tslReference('float', uniforms.cliffRockBiomeSlot), worldPos.xz, uvOffset, uniforms);
  const mossyRock = tslMix(rockPlanar.rgb, rockPlanar.rgb.mul(tslVec3(0.66, 0.86, 0.68)), tslFloat(0.45));
  finalColor = tslMix(finalColor, mossyRock, rockBlend);
  const farCanopyMask = farCanopyTintMask(biomeBlend.slopeUp, worldPos.y, worldPos, uniforms);
  const canopyColor = tslReference('color', uniforms.farCanopyTintColor)
    .mul(tslMix(tslFloat(0.82), tslFloat(1.18), hashUvNode(worldPos.xz.mul(0.007).add(tslVec2(1.37, 8.53)))));
  finalColor = tslMix(finalColor, canopyColor, farCanopyMask);
  finalColor = applyFeatureSurfaceColor(finalColor, worldPos, uniforms);
  const visualEdgeMask = visualEdgeTintMask(worldPos, uniforms);
  finalColor = tslMix(finalColor, canopyColor.mul(0.78), visualEdgeMask.mul(0.92));
  const farCanopyFogMask = farCanopyTintMask(biomeBlend.slopeUp, worldPos.y, worldPos, uniforms)
    .mul(tslReference('float', uniforms.farCanopyTintFogStrength));
  finalColor = tslMix(finalColor, tslReference('color', uniforms.farCanopyTintColor).mul(0.86), farCanopyFogMask);

  const tileParams0 = tslAttribute('tileParams0', 'vec4');
  const tileParams1 = tslAttribute('tileParams1', 'vec4');
  const lodLevel = tileParams0.w;
  const morphFactor = tileParams1.x;
  let lodColor = tslVec3(0, 1, 0);
  lodColor = tslMix(lodColor, tslVec3(0, 0.5, 1), step(tslFloat(0.5), lodLevel));
  lodColor = tslMix(lodColor, tslVec3(1, 1, 0), step(tslFloat(1.5), lodLevel));
  lodColor = tslMix(lodColor, tslVec3(1, 0.5, 0), step(tslFloat(2.5), lodLevel));
  lodColor = tslMix(lodColor, tslVec3(1, 0, 0), step(tslFloat(3.5), lodLevel));
  const debugWireframe = tslReference('float', uniforms.debugWireframe);
  const debugColor = lodColor.mul(tslFloat(0.5).add(tslFloat(0.5).mul(tslFloat(1).sub(morphFactor))));
  return tslMix(finalColor, debugColor, step(tslFloat(0.5), debugWireframe));
}

function createTerrainRoughnessNode(uniforms: TerrainUniforms): TslNode {
  const worldPos = tslPositionWorld;
  const terrainNormal = createTerrainNormalNode(uniforms, worldPos);
  const biomeBlend = classifyBiomeBlend(worldPos, terrainNormal, uniforms);
  const hydrologyBlend = applyHydrologyBiomeBlend(
    worldPos,
    biomeBlend.primarySlot,
    biomeBlend.secondarySlot,
    biomeBlend.secondaryBlend,
    uniforms,
  );
  let roughnessSample = sampleBiomeScalar(hydrologyBlend.primarySlot, uniforms, 'biomeRoughness');
  const secondaryRoughness = sampleBiomeScalar(hydrologyBlend.secondarySlot, uniforms, 'biomeRoughness');
  roughnessSample = tslMix(roughnessSample, secondaryRoughness, hydrologyBlend.secondaryBlend);
  const wetness = lowlandWetnessMask(biomeBlend.slopeUp, worldPos.y, uniforms);
  // Wet ground reads darker (handled in colorNode at line 553), not glossier.
  // Old value 0.72 dropped roughness 28% which produced glass-like specular
  // highlights at low sun angles, especially on highland (base 0.78) in A
  // Shau. 0.94 keeps a subtle wet sheen without going to glass.
  roughnessSample = tslMix(roughnessSample, roughnessSample.mul(0.94), wetness);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.96), featureSurfaceWeight(1, worldPos, uniforms));
  roughnessSample = tslMix(roughnessSample, tslFloat(0.82), featureSurfaceWeight(2, worldPos, uniforms));
  roughnessSample = tslMix(roughnessSample, tslFloat(0.94), featureSurfaceWeight(3, worldPos, uniforms));
  roughnessSample = tslMix(roughnessSample, tslFloat(0.90), featureSurfaceWeight(4, worldPos, uniforms));
  roughnessSample = tslMix(roughnessSample, tslFloat(0.95), featureSurfaceWeight(5, worldPos, uniforms));
  const farCanopyRoughnessMask = farCanopyTintMask(biomeBlend.slopeUp, worldPos.y, worldPos, uniforms);
  const farCanopyAdjusted = tslMix(
    roughnessSample,
    tslMax(roughnessSample, tslFloat(0.92)),
    farCanopyRoughnessMask.mul(0.55),
  );
  // Vietnam-jungle matte floor. Highland (base 0.78) is the lowest biome
  // and is rocky-looking; combined with wetness/feature mixing it can drift
  // to specular territory. 0.88 keeps a matte read across all biome × mask
  // combinations while still letting the relative variation through.
  return tslMax(farCanopyAdjusted, tslFloat(0.88));
}

function configureTerrainNodeMaterial(material: TerrainMaterial, uniforms: TerrainUniforms): void {
  material.uniforms = uniforms;
  material.isKonveyerTerrainNodeMaterial = true;
  // TSL owns terrain fog/tint in colorNode; disabling legacy fog avoids
  // WebGLRenderer's fixed fog uniform path for node-generated programs.
  material.fog = false;
  material.positionNode = createTerrainPositionNode(uniforms);
  material.normalNode = createTerrainNormalNode(uniforms);
  material.colorNode = createTerrainColorNode(uniforms);
  material.roughnessNode = createTerrainRoughnessNode(uniforms);
  material.metalnessNode = tslFloat(0);
}

export function createTerrainMaterial(options: TerrainMaterialOptions): TerrainMaterial {
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: false,
  }) as TerrainMaterial;

  applyTerrainMaterialOptions(material, options);
  material.needsUpdate = true;
  return material;
}

export function updateTerrainMaterialTextures(
  material: TerrainMaterial,
  heightTexture: THREE.DataTexture,
  normalTexture: THREE.DataTexture,
  worldSize: number,
  biomeConfig: TerrainBiomeMaterialConfig,
  splatmap?: SplatmapConfig,
  surfacePatches?: TerrainSurfacePatch[],
  farCanopyTint?: TerrainFarCanopyTintConfig,
  hydrologyMask?: TerrainHydrologyMaskMaterialConfig | null,
  playableWorldSize?: number,
  visualMargin?: number,
): void {
  applyTerrainMaterialOptions(material, {
    heightTexture,
    normalTexture,
    worldSize,
    playableWorldSize,
    visualMargin,
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
  material: TerrainMaterial,
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
  material: TerrainMaterial,
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
  material: TerrainMaterial,
  options: TerrainMaterialOptions,
): void {
  const shaderBindings = createShaderBindings(options);
  material.userData ??= {};

  const existingUniforms = material.userData.terrainUniforms as TerrainUniforms | undefined;

  if (existingUniforms) {
    const debugWireframe = existingUniforms.debugWireframe?.value;
    for (const [key, uniform] of Object.entries(shaderBindings.uniforms)) {
      if (existingUniforms[key]) {
        existingUniforms[key].value = (uniform as UniformSlot).value;
      } else {
        existingUniforms[key] = uniform as UniformSlot;
      }
    }
    if (debugWireframe !== undefined && existingUniforms.debugWireframe) {
      existingUniforms.debugWireframe.value = debugWireframe;
    }
    material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;
    material.userData.terrainFarCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);
    configureTerrainNodeMaterial(material, existingUniforms);
    material.needsUpdate = true;
    return;
  }

  material.userData.terrainUniforms = shaderBindings.uniforms;
  material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;
  material.userData.terrainFarCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);
  material.customProgramCacheKey = () => 'KonveyerTerrainTSL_v1';
  configureTerrainNodeMaterial(material, shaderBindings.uniforms);
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
  const playableWorldSize = options.playableWorldSize ?? worldSize;
  const visualMargin = options.visualMargin ?? Math.max(0, (worldSize - playableWorldSize) * 0.5);
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
    terrainPlayableWorldSize: { value: playableWorldSize },
    terrainVisualMargin: { value: visualMargin },
    heightmapGridSize: { value: heightmapGridSize },
    tileGridResolution: { value: tileGridRes },
    debugWireframe: { value: 0 },
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

function readCurrentSurfaceWetness(material: TerrainMaterial): number {
  const currentWetness = material.userData.terrainSurfaceWetness;
  return typeof currentWetness === 'number' ? currentWetness : 0;
}
