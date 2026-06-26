// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  vec4,
} from 'three/tsl';
import type { SplatmapConfig } from './TerrainConfig';
import type { TerrainSurfaceKind, TerrainSurfacePatch } from './TerrainFeatureTypes';
import type { TerrainFarCanopyTintConfig } from '../../config/biomes';
export { TERRAIN_VERTEX_MAIN } from './TerrainVertexMain';

const MAX_BIOME_TEXTURES = 8;
const MAX_BIOME_RULES = 8;
const MAX_TERRAIN_LOD_RANGES = 8;
// Keep this conservative for mobile GPUs.
// Large float-array uniforms in fragment shaders can exceed low-end WebGL
// uniform budgets and fail terrain material compilation, resulting in an
// invisible-but-collidable terrain surface.
const MAX_FEATURE_SURFACE_PATCHES = 8;
const TERRAIN_HORIZON_SHADOW_SAMPLE_DISTANCES = [96, 192, 384, 768, 1536] as const;

type UniformSlot<T = unknown> = { value: T };
type TerrainUniforms = Record<string, UniformSlot>;
type TslNode = any;
type TerrainBiomeBlend = ReturnType<typeof classifyBiomeBlend>;
type TerrainFeatureSurfaceWeights = [TslNode, TslNode, TslNode, TslNode, TslNode];
type TerrainFragmentContext = { worldPos: TslNode; terrainNormal: TslNode; biomeBlend: TerrainBiomeBlend; lowlandWetness: TslNode; farCanopyTint: TslNode; featureSurfaces: TerrainFeatureSurfaceWeights; lowSunOcclusion: TslNode };

export type TerrainMaterial = MeshStandardNodeMaterial & {
  uniforms: TerrainUniforms;
  isTerrainNodeMaterial: true;
  emissiveNode?: TslNode;
};

const tslAttribute = (name: string, type: string): TslNode => attribute(name, type) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslReference = (type: string, uniform: UniformSlot): TslNode => reference('value', type, uniform) as TslNode;
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => tslTextureNode(source, sampleUv) as TslNode;
// Vertex-stage texture sampling. WGSL forbids implicit-LOD sampling
// (`textureSample`) outside the fragment stage — there are no screen-space
// derivatives — so it must use an explicit mip level (`textureSampleLevel`),
// which `.level(0)` selects. three.js r184's WebGPU backend tolerated an
// implicit-LOD fetch in the vertex shader; r185 does not, and the terrain
// height fetch (which runs in the vertex shader) then silently returns 0,
// collapsing every CDLOD tile to Y=0 so the terrain renders far below the
// camera and reads as invisible. WebGL has no such restriction.
const tslTextureLod0 = (source: THREE.Texture, sampleUv: TslNode): TslNode =>
  (tslTextureNode(source, sampleUv) as unknown as { level: (lod: TslNode) => TslNode }).level(float(0) as TslNode) as TslNode;
const tslClamp = (...args: TslNode[]): TslNode => (tslClampBase as (...values: TslNode[]) => TslNode)(...args);
const tslLength = (value: TslNode): TslNode => (tslLengthBase as (node: TslNode) => TslNode)(value);
const tslMax = (...args: TslNode[]): TslNode => (tslMaxBase as (...values: TslNode[]) => TslNode)(...args);
const tslMin = (...args: TslNode[]): TslNode => (tslMinBase as (...values: TslNode[]) => TslNode)(...args);
const tslPositionGeometry = positionGeometry as TslNode;
const tslPositionWorld = positionWorld as TslNode;
const tslCameraPosition = cameraPosition as TslNode;

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

interface TerrainMaterialOptions {
  heightTexture: THREE.DataTexture;
  normalTexture: THREE.DataTexture;
  worldSize: number;
  playableWorldSize?: number;
  visualMargin?: number;
  splatmap: SplatmapConfig;
  biomeConfig: TerrainBiomeMaterialConfig;
  farCanopyTint?: TerrainFarCanopyTintConfig;
  surfaceWetness?: number;
  tileGridResolution?: number;
  lodRanges?: readonly number[];
  morphStart?: number;
  surfacePatches?: TerrainSurfacePatch[];
  atmosphereLighting?: TerrainAtmosphereLightingMaterialConfig;
}

export interface TerrainAtmosphereLightingMaterialConfig {
  nightFillColor: THREE.Color;
  nightFillStrength: number;
  directLightDirection: THREE.Vector3;
  daylightFactor: number;
  lowSunOcclusionStrength: number;
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

function fallbackTerrainLodRanges(worldSize: number): number[] {
  const base = Math.max(1, worldSize / 64);
  return Array.from({ length: MAX_TERRAIN_LOD_RANGES }, (_, i) => base * 4 * 2 ** i);
}

function normalizeTerrainLodRanges(worldSize: number, lodRanges?: readonly number[]): number[] {
  const fallback = lodRanges?.length ? lodRanges : fallbackTerrainLodRanges(worldSize);
  const last = fallback[fallback.length - 1] ?? Math.max(1, worldSize);
  return Array.from({ length: MAX_TERRAIN_LOD_RANGES }, (_, i) => Math.max(1, fallback[i] ?? last));
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

function terrainLodRangeNode(lodLevel: TslNode, uniforms: TerrainUniforms): TslNode {
  let range = tslReference('float', uniforms.terrainLodRange7);
  for (let i = 0; i < MAX_TERRAIN_LOD_RANGES; i++) {
    const match = tslFloat(1).sub(step(tslFloat(0.5), abs(lodLevel.sub(i))));
    range = tslMix(range, tslReference('float', uniforms[`terrainLodRange${i}`]), match);
  }
  return range;
}

function createTerrainMorphFactorNode(tileCenterX: TslNode, tileCenterZ: TslNode, tileSize: TslNode, lodLevel: TslNode, uniforms: TerrainUniforms): TslNode {
  const halfSize = tileSize.mul(0.5);
  const dx = tslMax(abs(tslCameraPosition.x.sub(tileCenterX)).sub(halfSize), tslFloat(0));
  const dz = tslMax(abs(tslCameraPosition.z.sub(tileCenterZ)).sub(halfSize), tslFloat(0));
  const cameraY = tslReference('float', uniforms.terrainMorphCameraRelativeY);
  const dist = tslLength(tslVec3(dx, cameraY, dz));
  const range = terrainLodRangeNode(lodLevel, uniforms);
  const morphBegin = range.mul(tslReference('float', uniforms.terrainMorphStart));
  return tslClamp(dist.sub(morphBegin).div(tslMax(range.sub(morphBegin), tslFloat(0.001))), tslFloat(0), tslFloat(1));
}

function createTerrainPositionNode(uniforms: TerrainUniforms): TslNode {
  const tileParams0 = tslAttribute('tileParams0', 'vec4');
  const tileParams1 = tslAttribute('tileParams1', 'vec4');
  const tileCenterX = tileParams0.x;
  const tileCenterZ = tileParams0.y;
  const tileSize = tileParams0.z;
  const lodLevel = tileParams0.w;
  const morphFactor = createTerrainMorphFactorNode(tileCenterX, tileCenterZ, tileSize, lodLevel, uniforms);
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
  // Vertex-stage fetch needs explicit LOD under WebGPU (see tslTextureLod0).
  const terrainHeight = tslTextureLod0(uniformTexture(uniforms, 'terrainHeightmap'), worldUv).r;
  const skirtDrop = tslMax(tslFloat(2), lodLevel.add(1).mul(4));
  // Output FULL WORLD position. The InstancedMesh instance matrix is identity
  // (see CDLODRenderer.writeTileInstance): r185's WebGPU backend does not apply
  // the per-instance matrix uniform for this mesh — tiles collapsed to the world
  // origin and the terrain rendered invisible. r184 used the instanced-attribute
  // path, which still works, so tile placement is driven by the tileParams0
  // attribute (tileCenterX/Z + tileSize) here instead of the instance matrix.
  return tslVec3(
    worldPos.x,
    terrainHeight.sub(step(tslFloat(0.5), isSkirt).mul(skirtDrop)),
    worldPos.z,
  );
}

function createTerrainNormalNode(uniforms: TerrainUniforms, worldPos: TslNode = tslPositionWorld): TslNode {
  const worldUv = createTerrainWorldUvNode(uniforms, worldPos);
  return normalize(tslTexture(uniformTexture(uniforms, 'terrainNormalMap'), worldUv).rgb.mul(2).sub(1)) as TslNode;
}

function sampleTerrainHeightAtWorldXz(worldXz: TslNode, uniforms: TerrainUniforms): TslNode {
  const sampleWorldPos = tslVec3(worldXz.x, tslFloat(0), worldXz.y);
  const worldUv = createTerrainWorldUvNode(uniforms, sampleWorldPos);
  return tslTexture(uniformTexture(uniforms, 'terrainHeightmap'), worldUv).r;
}

function terrainHorizonBlockerSample(
  worldPos: TslNode,
  lightDirection: TslNode,
  sunHorizontal: TslNode,
  horizontalLength: TslNode,
  distanceMeters: number,
  uniforms: TerrainUniforms,
  distanceScale?: TslNode,
): TslNode {
  const distance = distanceScale
    ? tslFloat(distanceMeters).mul(distanceScale)
    : tslFloat(distanceMeters);
  const sampleXz = worldPos.xz.add(sunHorizontal.mul(distance));
  const sampledHeight = sampleTerrainHeightAtWorldXz(sampleXz, uniforms);
  const rayHeight = worldPos.y
    .add(lightDirection.y.div(horizontalLength).mul(distance))
    .add(tslFloat(8 + distanceMeters * 0.018));
  return smoothstep(
    tslFloat(0),
    tslFloat(30 + distanceMeters * 0.018),
    sampledHeight.sub(rayHeight),
  );
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
  // TSL Fn wrapper lets the compiled GLSL emit a real `if/else if` chain
  // over biomeSlot rather than the prior `mix(prev, sample, step(N-0.5,
  // slot))` unroll. The unroll forced all 8 biome samplers per fragment
  // (~8x sampler amplification on the WebGL2-fallback path that mobile
  // lands on). With If/ElseIf the WebGL2 backend can short-circuit to a
  // single sampler per fragment in the common case (terrain-fragment
  // cost drops proportionally). See
  // docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md and
  // docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md.
  //
  // We bind the per-call uniforms object via closure rather than caching
  // the Fn because `applyTerrainMaterialOptions` may swap the bound
  // textures underneath an existing uniforms bundle, and we want the
  // freshly-bound textures to flow through on the next node-graph rebuild.
  const fn = Fn(([slot, sampleUvInner]: TslNode[]) => {
    const wrappedUv = fract(sampleUvInner) as TslNode;
    const result = (vec4 as (...values: TslNode[]) => TslNode)(0, 0, 0, 1).toVar();
    // Round biomeSlot to nearest int before comparing. The classifier
    // upstream emits whole-number slots, but direct float comparison is
    // fragile; floor(slot + 0.5) yields a stable int-like value.
    const slotIdx = floor(slot.add(0.5)) as TslNode;
    // Construct each tslTexture node *inside* its branch so the compiled
    // GLSL emits the texture() call inside the if-block rather than
    // hoisting it to function scope. The result is a true per-fragment
    // early-out: only one biome sampler is fetched per fragment in the
    // common case (vs all 8 under the prior unroll).
    If(slotIdx.lessThanEqual(0), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture0'), wrappedUv));
    }).ElseIf(slotIdx.equal(1), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture1'), wrappedUv));
    }).ElseIf(slotIdx.equal(2), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture2'), wrappedUv));
    }).ElseIf(slotIdx.equal(3), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture3'), wrappedUv));
    }).ElseIf(slotIdx.equal(4), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture4'), wrappedUv));
    }).ElseIf(slotIdx.equal(5), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture5'), wrappedUv));
    }).ElseIf(slotIdx.equal(6), () => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture6'), wrappedUv));
    }).Else(() => {
      result.assign(tslTexture(uniformTexture(uniforms, 'biomeTexture7'), wrappedUv));
    });
    return result;
  });
  return fn(biomeSlot, sampleUv);
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

function farCanopyCoverageMask(slopeUp: TslNode, elevation: TslNode, worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  const enabled = step(tslFloat(0.5), tslReference('float', uniforms.farCanopyTintEnabled));
  const start = tslReference('float', uniforms.farCanopyTintStartDistance);
  const end = tslMax(start.add(1), tslReference('float', uniforms.farCanopyTintEndDistance));
  const coverageDistance = tslMax(end.add(1), tslReference('float', uniforms.farCanopyCoverageDistance));
  const cameraDistance = tslLength(tslCameraPosition.xz.sub(worldPos.xz));
  const fadeMask = smoothstep(start, end, cameraDistance)
    .mul(tslFloat(1).sub(smoothstep(coverageDistance, coverageDistance.add(480), cameraDistance)));
  const terrainMask = smoothstep(tslFloat(0.22), tslFloat(0.82), slopeUp)
    .mul(tslFloat(1).sub(smoothstep(tslFloat(2600), tslFloat(4300), elevation)));
  const coverageScale = tslMax(tslFloat(1), tslReference('float', uniforms.farCanopyCoverageScale));
  const canopyPockets = smoothstep(tslFloat(0.34), tslFloat(0.86), hashUvNode(worldPos.xz.div(coverageScale).add(tslVec2(9.41, 2.17))));
  return tslClamp(tslReference('float', uniforms.farCanopyCoverageStrength)
    .mul(enabled).mul(fadeMask).mul(terrainMask).mul(tslMix(tslFloat(0.36), tslFloat(1), canopyPockets)), tslFloat(0), tslFloat(0.42));
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

function applyFeatureSurfaceColor(color: TslNode, weights: TerrainFeatureSurfaceWeights): TslNode {
  const [packedEarth, runway, dirtRoad, gravelRoad, jungleTrail] = weights;
  let result = tslMix(color, tslVec3(0.47, 0.38, 0.24), packedEarth.mul(0.78));
  result = tslMix(result, tslVec3(0.41, 0.39, 0.36), runway.mul(0.82));
  result = tslMix(result, tslVec3(0.45, 0.35, 0.22), dirtRoad.mul(0.70));
  result = tslMix(result, tslVec3(0.48, 0.44, 0.38), gravelRoad.mul(0.75));
  result = tslMix(result, tslVec3(0.32, 0.26, 0.18), jungleTrail.mul(0.50));
  return result;
}

function createTerrainFragmentContext(uniforms: TerrainUniforms): TerrainFragmentContext {
  const worldPos = tslPositionWorld;
  const terrainNormal = createTerrainNormalNode(uniforms, worldPos);
  const biomeBlend = classifyBiomeBlend(worldPos, terrainNormal, uniforms);
  const featureSurfaces = [1, 2, 3, 4, 5].map((surfaceType) => featureSurfaceWeight(surfaceType, worldPos, uniforms)) as TerrainFeatureSurfaceWeights;
  return { worldPos, terrainNormal, biomeBlend, lowlandWetness: lowlandWetnessMask(biomeBlend.slopeUp, worldPos.y, uniforms), farCanopyTint: farCanopyTintMask(biomeBlend.slopeUp, worldPos.y, worldPos, uniforms), featureSurfaces, lowSunOcclusion: terrainLowSunOcclusionMask(terrainNormal, worldPos, uniforms) };
}

function createTerrainColorNode(uniforms: TerrainUniforms, context = createTerrainFragmentContext(uniforms)): TslNode {
  const { worldPos, terrainNormal, biomeBlend, lowlandWetness, farCanopyTint, featureSurfaces, lowSunOcclusion } = context;
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
    biomeBlend.primarySlot,
    worldPos,
    terrainNormal,
    uvOffset,
    triplanarBlend,
    uniforms,
  );
  const secondarySample = sampleBiomeWithTriplanarGate(
    biomeBlend.secondarySlot,
    worldPos,
    terrainNormal,
    uvOffset,
    triplanarBlend,
    uniforms,
  );
  const secondaryActive = step(tslFloat(0.001), biomeBlend.secondaryBlend);
  const biomeSample = tslMix(primarySample, tslMix(primarySample, secondarySample, biomeBlend.secondaryBlend), secondaryActive);
  let finalColor = biomeSample.rgb.mul(macroVariation(worldPos.xz));
  const lowlandFactor = tslFloat(1).sub(smoothstep(tslFloat(900), tslFloat(1500), worldPos.y));
  const flatFactor = smoothstep(tslFloat(0.45), tslFloat(0.95), biomeBlend.slopeUp);
  finalColor = tslMix(finalColor, finalColor.mul(tslVec3(0.93, 1.01, 0.94)), lowlandFactor.mul(flatFactor).mul(0.22));
  finalColor = tslMix(finalColor, finalColor.mul(tslVec3(0.82, 0.9, 0.84)), lowlandWetness.mul(0.35));
  const cliffMask = tslFloat(1).sub(smoothstep(tslFloat(0.50), tslFloat(0.74), biomeBlend.slopeUp));
  const proceduralHillMask = smoothstep(tslFloat(20), tslFloat(60), worldPos.y)
    .mul(tslFloat(1).sub(smoothstep(tslFloat(150), tslFloat(300), worldPos.y)));
  const demRidgeMask = smoothstep(tslFloat(450), tslFloat(950), worldPos.y);
  const rockBlend = cliffMask.mul(tslMax(proceduralHillMask, demRidgeMask)).mul(0.26);
  const rockPlanar = sampleBiomeTexture(tslReference('float', uniforms.cliffRockBiomeSlot), worldPos.xz, uvOffset, uniforms);
  const mossyRock = tslMix(rockPlanar.rgb, rockPlanar.rgb.mul(tslVec3(0.66, 0.86, 0.68)), tslFloat(0.45));
  finalColor = tslMix(finalColor, mossyRock, rockBlend);
  const canopyColor = tslReference('color', uniforms.farCanopyTintColor)
    .mul(tslMix(tslFloat(0.82), tslFloat(1.18), hashUvNode(worldPos.xz.mul(0.007).add(tslVec2(1.37, 8.53)))));
  finalColor = tslMix(finalColor, canopyColor, farCanopyTint);
  const canopyCoverageMask = farCanopyCoverageMask(biomeBlend.slopeUp, worldPos.y, worldPos, uniforms);
  const canopyCoverageColor = canopyColor.mul(
    tslMix(tslFloat(0.72), tslFloat(1.08), hashUvNode(worldPos.xz.mul(0.014).add(tslVec2(4.91, 6.73)))),
  );
  finalColor = tslMix(finalColor, canopyCoverageColor, canopyCoverageMask);
  finalColor = applyFeatureSurfaceColor(finalColor, featureSurfaces);
  const visualEdgeMask = visualEdgeTintMask(worldPos, uniforms);
  finalColor = tslMix(finalColor, canopyColor.mul(0.78), visualEdgeMask.mul(0.92));
  const farCanopyFogMask = farCanopyTint.mul(tslReference('float', uniforms.farCanopyTintFogStrength));
  finalColor = tslMix(finalColor, tslReference('color', uniforms.farCanopyTintColor).mul(0.86), farCanopyFogMask);
  finalColor = tslMix(finalColor, finalColor.mul(tslVec3(0.28, 0.36, 0.44)), lowSunOcclusion);
  // Rig is the only path (`legacy-path-deletion`): the colorNode emits RAW albedo,
  // and the rig-driven PBR scene lights (sun/sky/ground/ambient from
  // `rigSceneLightRadiance`) light it exactly once. The legacy night-stabilizer
  // cool-lerp and the flag-gated `select(rigEnabled, albedo, legacyColor)` are
  // deleted — no dead ALU. See docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md §2c.

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

function createTerrainRoughnessNode(uniforms: TerrainUniforms, context = createTerrainFragmentContext(uniforms)): TslNode {
  const { biomeBlend, lowlandWetness, farCanopyTint, featureSurfaces, lowSunOcclusion } = context;
  let roughnessSample = sampleBiomeScalar(biomeBlend.primarySlot, uniforms, 'biomeRoughness');
  const secondaryRoughness = sampleBiomeScalar(biomeBlend.secondarySlot, uniforms, 'biomeRoughness');
  roughnessSample = tslMix(roughnessSample, secondaryRoughness, biomeBlend.secondaryBlend);
  // Wet ground reads darker in colorNode, not glossier.
  // Old value 0.72 dropped roughness 28% which produced glass-like specular
  // highlights at low sun angles, especially on highland (base 0.78) in A
  // Shau. 0.94 keeps a subtle wet sheen without going to glass.
  roughnessSample = tslMix(roughnessSample, roughnessSample.mul(0.94), lowlandWetness);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.96), featureSurfaces[0]);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.82), featureSurfaces[1]);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.94), featureSurfaces[2]);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.90), featureSurfaces[3]);
  roughnessSample = tslMix(roughnessSample, tslFloat(0.95), featureSurfaces[4]);
  roughnessSample = tslMix(
    roughnessSample,
    tslMax(roughnessSample, tslFloat(0.97)),
    lowSunOcclusion.mul(0.65),
  );
  const farCanopyAdjusted = tslMix(
    roughnessSample,
    tslMax(roughnessSample, tslFloat(0.92)),
    farCanopyTint.mul(0.55),
  );
  // Vietnam-jungle matte floor. Highland (base 0.78) is the lowest biome
  // and is rocky-looking; combined with wetness/feature mixing it can drift
  // to specular territory. 0.88 keeps a matte read across all biome × mask
  // combinations while still letting the relative variation through.
  // At grazing sun (dawn/dusk) GGX still pulls a sheen out of 0.88 across
  // sun-facing slopes (owner "terrain catches too much light", 2026-06-10),
  // so the floor rises to 0.94 as the sun drops below ~20deg elevation.
  const sunY = (normalize(tslReference('vec3', uniforms.atmosphereDirectLightDirection)) as TslNode).y;
  const lowSunFloor = tslMix(
    tslFloat(0.94),
    tslFloat(0.88),
    smoothstep(tslFloat(0.12), tslFloat(0.35), sunY),
  );
  return tslMax(farCanopyAdjusted, lowSunFloor);
}

function terrainLowSunOcclusionMask(terrainNormal: TslNode, worldPos: TslNode, uniforms: TerrainUniforms): TslNode {
  const gated = Fn(([normalArg, worldPosArg]: TslNode[]) => {
    const strength = tslClamp(tslReference('float', uniforms.atmosphereLowSunOcclusionStrength), tslFloat(0), tslFloat(1));
    const result = tslFloat(0).toVar();

    If(strength.greaterThan(0), () => {
      const lightDirection = normalize(tslReference('vec3', uniforms.atmosphereDirectLightDirection)) as TslNode;
      const sunXz = tslVec2(lightDirection.x, lightDirection.z);
      const horizontalLength = tslMax(tslLength(sunXz), tslFloat(0.001));
      const sunHorizontal = sunXz.div(horizontalLength);
      const nDotL = tslClamp(dot(normalArg, lightDirection), tslFloat(0), tslFloat(1));
      const shadowFacing = tslFloat(1).sub(smoothstep(tslFloat(0.05), tslFloat(0.38), nDotL));
      const slopeMask = tslFloat(1).sub(smoothstep(tslFloat(0.72), tslFloat(0.97), normalArg.y));
      const ridgeElevationMask = smoothstep(tslFloat(80), tslFloat(620), worldPosArg.y);
      // Jitter the blocker march to break grazing-sun bilinear grid creases
      // into unstructured terrain texture noise (owner report, 2026-06-10).
      const marchJitter = tslFloat(0.85).add(hashUvNode(worldPosArg.xz.mul(0.37)).mul(0.3));
      let horizonBlocker = tslFloat(0);
      for (const sampleDistance of TERRAIN_HORIZON_SHADOW_SAMPLE_DISTANCES) {
        horizonBlocker = tslMax(
          horizonBlocker,
          terrainHorizonBlockerSample(worldPosArg, lightDirection, sunHorizontal, horizontalLength, sampleDistance, uniforms, marchJitter),
        );
      }
      horizonBlocker = horizonBlocker.mul(tslFloat(1).sub(smoothstep(tslFloat(0.22), tslFloat(0.52), lightDirection.y)));
      const reliefMask = tslClamp(
        tslMax(slopeMask, ridgeElevationMask.mul(0.92)).mul(tslMix(tslFloat(0.62), tslFloat(1), shadowFacing)),
        tslFloat(0), tslFloat(1),
      );
      result.assign(strength.mul(tslClamp(tslMax(reliefMask, horizonBlocker), tslFloat(0), tslFloat(1))));
    });

    return result;
  });

  return gated(terrainNormal, worldPos) as TslNode;
}

function configureTerrainNodeMaterial(material: TerrainMaterial, uniforms: TerrainUniforms): void {
  material.uniforms = uniforms;
  material.isTerrainNodeMaterial = true;
  // TSL owns terrain fog/tint in colorNode; disabling legacy fog avoids
  // WebGLRenderer's fixed fog uniform path for node-generated programs.
  material.fog = false;
  material.positionNode = createTerrainPositionNode(uniforms);
  material.normalNode = createTerrainNormalNode(uniforms);
  const terrainFragment = createTerrainFragmentContext(uniforms);
  material.colorNode = createTerrainColorNode(uniforms, terrainFragment);
  material.roughnessNode = createTerrainRoughnessNode(uniforms, terrainFragment);
  material.metalnessNode = tslFloat(0);
  // Night-fill emissive deleted (`legacy-path-deletion`): the rig's
  // ambientRadiance, fed through the PBR scene lights, is the single night
  // floor now, so terrain carries no self-lit emissive. MeshStandardNodeMaterial
  // emissive defaults to black, so no emissiveNode assignment is needed.
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
  playableWorldSize?: number,
  visualMargin?: number,
  lodRanges?: readonly number[],
  morphStart?: number,
): void {
  applyTerrainMaterialOptions(material, {
    heightTexture,
    normalTexture,
    worldSize,
    playableWorldSize,
    visualMargin,
    biomeConfig,
    farCanopyTint,
    splatmap: splatmap ?? {
      layers: [],
      triplanarSlopeThreshold: 0.707,
      antiTilingStrength: 0.3,
    },
    surfaceWetness: readCurrentSurfaceWetness(material),
    surfacePatches,
    atmosphereLighting: readCurrentAtmosphereLighting(material),
    lodRanges,
    morphStart,
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
  terrainUniforms.farCanopyCoverageDistance.value = normalized.coverageDistance;
  terrainUniforms.farCanopyCoverageStrength.value = normalized.coverageStrength;
  terrainUniforms.farCanopyCoverageScale.value = normalized.coverageScale;
  (terrainUniforms.farCanopyTintColor.value as THREE.Color).setRGB(
    normalized.color[0],
    normalized.color[1],
    normalized.color[2],
  );
}

export function updateTerrainMaterialAtmosphereLighting(
  material: TerrainMaterial,
  lighting: TerrainAtmosphereLightingMaterialConfig,
): void {
  const terrainUniforms = material.userData.terrainUniforms as TerrainUniforms | undefined;
  if (!terrainUniforms) return;
  const nightFillColor = terrainUniforms.atmosphereNightFillColor.value as THREE.Color;
  const directLightDirection = terrainUniforms.atmosphereDirectLightDirection.value as THREE.Vector3;
  nightFillColor.copy(lighting.nightFillColor);
  directLightDirection.copy(lighting.directLightDirection);
  if (directLightDirection.lengthSq() < 1e-8) {
    directLightDirection.set(0, 1, 0);
  } else {
    directLightDirection.normalize();
  }
  terrainUniforms.atmosphereNightFillStrength.value = THREE.MathUtils.clamp(lighting.nightFillStrength, 0, 0.5);
  terrainUniforms.atmosphereDaylightFactor.value = THREE.MathUtils.clamp(lighting.daylightFactor, 0, 1);
  terrainUniforms.atmosphereLowSunOcclusionStrength.value = THREE.MathUtils.clamp(
    lighting.lowSunOcclusionStrength,
    0,
    1,
  );

  const stashed = getMutableTerrainAtmosphereLighting(material);
  stashed.nightFillColor.copy(nightFillColor);
  stashed.nightFillStrength = terrainUniforms.atmosphereNightFillStrength.value as number;
  stashed.directLightDirection.copy(directLightDirection);
  stashed.daylightFactor = terrainUniforms.atmosphereDaylightFactor.value as number;
  stashed.lowSunOcclusionStrength = terrainUniforms.atmosphereLowSunOcclusionStrength.value as number;
}

export function updateTerrainMaterialLodRanges(
  material: THREE.Material,
  worldSize: number,
  lodRanges: readonly number[],
  morphStart = 0.8,
): void {
  const uniforms = material.userData?.terrainUniforms as TerrainUniforms | undefined;
  if (!uniforms) return;
  const normalized = normalizeTerrainLodRanges(worldSize, lodRanges);
  for (let i = 0; i < MAX_TERRAIN_LOD_RANGES; i++) {
    uniforms[`terrainLodRange${i}`].value = normalized[i];
  }
  uniforms.terrainMorphStart.value = THREE.MathUtils.clamp(morphStart, 0, 0.999);
}

export function updateTerrainMaterialMorphCamera(
  material: THREE.Material,
  cameraRelativeY: number,
): void {
  const uniforms = material.userData?.terrainUniforms as TerrainUniforms | undefined;
  if (!uniforms?.terrainMorphCameraRelativeY) return;
  uniforms.terrainMorphCameraRelativeY.value = Number.isFinite(cameraRelativeY) ? cameraRelativeY : 0;
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
    material.userData.terrainAtmosphereLighting = normalizeTerrainAtmosphereLighting(options.atmosphereLighting);
    configureTerrainNodeMaterial(material, existingUniforms);
    material.needsUpdate = true;
    return;
  }

  material.userData.terrainUniforms = shaderBindings.uniforms;
  material.userData.terrainSurfaceWetness = shaderBindings.uniforms.environmentWetness.value;
  material.userData.terrainFarCanopyTint = normalizeFarCanopyTint(options.farCanopyTint);
  material.userData.terrainAtmosphereLighting = normalizeTerrainAtmosphereLighting(options.atmosphereLighting);
  material.customProgramCacheKey = () => 'TerrainTSL_v2';
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
  const lodRanges = normalizeTerrainLodRanges(worldSize, options.lodRanges);

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
  const atmosphereLighting = normalizeTerrainAtmosphereLighting(options.atmosphereLighting);

  const uniforms: Record<string, { value: unknown }> = {
    terrainHeightmap: { value: heightTexture },
    terrainNormalMap: { value: normalTexture },
    terrainWorldSize: { value: worldSize },
    terrainPlayableWorldSize: { value: playableWorldSize },
    terrainVisualMargin: { value: visualMargin },
    heightmapGridSize: { value: heightmapGridSize },
    tileGridResolution: { value: tileGridRes },
    terrainMorphStart: { value: THREE.MathUtils.clamp(options.morphStart ?? 0.8, 0, 0.999) },
    terrainMorphCameraRelativeY: { value: 0 },
    debugWireframe: { value: 0 },
    antiTilingStrength: { value: splatmap.antiTilingStrength },
    triplanarSlopeThreshold: { value: splatmap.triplanarSlopeThreshold },
    environmentWetness: { value: surfaceWetness },
    farCanopyTintEnabled: { value: farCanopyTint.enabled ? 1 : 0 },
    farCanopyTintStartDistance: { value: farCanopyTint.startDistance },
    farCanopyTintEndDistance: { value: farCanopyTint.endDistance },
    farCanopyTintStrength: { value: farCanopyTint.strength },
    farCanopyTintFogStrength: { value: farCanopyTint.fogStrength },
    farCanopyCoverageDistance: { value: farCanopyTint.coverageDistance },
    farCanopyCoverageStrength: { value: farCanopyTint.coverageStrength },
    farCanopyCoverageScale: { value: farCanopyTint.coverageScale },
    farCanopyTintColor: { value: new THREE.Color(
      farCanopyTint.color[0],
      farCanopyTint.color[1],
      farCanopyTint.color[2],
    ) },
    atmosphereNightFillColor: { value: atmosphereLighting.nightFillColor.clone() },
    atmosphereNightFillStrength: { value: atmosphereLighting.nightFillStrength },
    atmosphereDirectLightDirection: { value: atmosphereLighting.directLightDirection.clone() },
    atmosphereDaylightFactor: { value: atmosphereLighting.daylightFactor },
    atmosphereLowSunOcclusionStrength: { value: atmosphereLighting.lowSunOcclusionStrength },
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

  for (let i = 0; i < MAX_TERRAIN_LOD_RANGES; i++) {
    uniforms[`terrainLodRange${i}`] = { value: lodRanges[i] };
  }

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
  const coverageDistance = Math.max(endDistance, farCanopyTint?.coverageDistance ?? endDistance);
  const coverageStrength = THREE.MathUtils.clamp(farCanopyTint?.coverageStrength ?? 0, 0, 0.42);
  const coverageScale = Math.max(1, farCanopyTint?.coverageScale ?? 256);
  const color = farCanopyTint?.color ?? [0.12, 0.26, 0.11];

  return {
    enabled: farCanopyTint?.enabled === true,
    startDistance,
    endDistance,
    strength,
    fogStrength,
    coverageDistance,
    coverageStrength,
    coverageScale,
    color,
  };
}

function readCurrentSurfaceWetness(material: TerrainMaterial): number {
  const currentWetness = material.userData.terrainSurfaceWetness;
  return typeof currentWetness === 'number' ? currentWetness : 0;
}

function getMutableTerrainAtmosphereLighting(material: TerrainMaterial): TerrainAtmosphereLightingMaterialConfig {
  const stashed = material.userData.terrainAtmosphereLighting as TerrainAtmosphereLightingMaterialConfig | undefined;
  if (stashed?.nightFillColor instanceof THREE.Color && stashed.directLightDirection instanceof THREE.Vector3) {
    return stashed;
  }

  const created = {
    nightFillColor: new THREE.Color(0, 0, 0),
    nightFillStrength: 0,
    directLightDirection: new THREE.Vector3(0, 1, 0),
    daylightFactor: 1,
    lowSunOcclusionStrength: 0,
  };
  material.userData.terrainAtmosphereLighting = created;
  return created;
}

function normalizeTerrainAtmosphereLighting(
  lighting?: TerrainAtmosphereLightingMaterialConfig,
): TerrainAtmosphereLightingMaterialConfig {
  const color = lighting?.nightFillColor instanceof THREE.Color
    ? lighting.nightFillColor.clone()
    : new THREE.Color(0, 0, 0);
  const strength = THREE.MathUtils.clamp(lighting?.nightFillStrength ?? 0, 0, 0.5);
  const directLightDirection = lighting?.directLightDirection instanceof THREE.Vector3
    ? lighting.directLightDirection.clone()
    : new THREE.Vector3(0, 1, 0);
  if (directLightDirection.lengthSq() < 1e-8) {
    directLightDirection.set(0, 1, 0);
  } else {
    directLightDirection.normalize();
  }
  const daylightFactor = THREE.MathUtils.clamp(lighting?.daylightFactor ?? 1, 0, 1);
  const lowSunOcclusionStrength = THREE.MathUtils.clamp(lighting?.lowSunOcclusionStrength ?? 0, 0, 1);
  return {
    nightFillColor: color,
    nightFillStrength: strength,
    directLightDirection,
    daylightFactor,
    lowSunOcclusionStrength,
  };
}

function readCurrentAtmosphereLighting(
  material: TerrainMaterial,
): TerrainAtmosphereLightingMaterialConfig | undefined {
  const stashed = material.userData.terrainAtmosphereLighting as
    | TerrainAtmosphereLightingMaterialConfig
    | undefined;
  if (!stashed) return undefined;
  return normalizeTerrainAtmosphereLighting(stashed);
}

