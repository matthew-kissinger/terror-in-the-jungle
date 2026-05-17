import * as THREE from 'three';
import {
  installHydrologyRiverFlowPatch,
  type HydrologyRiverShaderRefs,
} from './HydrologyRiverFlowPatch';

// Shoreline fade reads transparency falling off near depth=0 so the
// water-terrain seam reads as wet sand rather than a hard polygon edge.
export const GLOBAL_WATER_SHORELINE_FADE_METERS = 1.4;
// Sun-specular tightness; 64 keeps the noon disc tight without aliasing
// to a single-pixel spike on phones.
export const GLOBAL_WATER_SUN_SPEC_POWER = 64;
export const GLOBAL_WATER_SUN_SPEC_GAIN = 0.85;
// Underwater surface tint applied when the camera is submerged so the
// underside reads as transmitted light, not as the topside dark teal.
export const GLOBAL_WATER_UNDERWATER_TINT = new THREE.Color(0x2a5a6a);

// Foam-line band on the water side of the terrain-water intersection.
// Parameterised in metres of effective water depth (waterY − terrainY).
// Companion terrain-side soft-blend distance lives in TerrainMaterial.ts
// (TERRAIN_WATER_EDGE_DEFAULT_SOFT_BLEND_DISTANCE = 1.5 m — wider than
// the foam band so wet-sand reads through the foam).
export const WATER_EDGE_FOAM_WIDTH_METERS = 0.8;
export const WATER_EDGE_FOAM_INTENSITY = 0.55;
export const WATER_EDGE_SOFT_BLEND_DISTANCE_METERS = 1.5;

export interface WaterTerrainHeightSamplerBinding {
  texture: THREE.Texture;
  worldSize: number;
  // Bottom-left world-space corner of the heightmap coverage (matches the
  // terrain's own UV remap: `(worldXZ + halfWorld) / worldSize`).
  originX?: number;
  originZ?: number;
}

export interface WaterEdgeBinding {
  surfaceY: number;
  softBlendDistance: number;
}

/**
 * Surface-shader uniforms wired into the global water plane's
 * `MeshStandardMaterial` via `onBeforeCompile`. References are captured
 * at compile time and updated each frame from `WaterSystem.update()`.
 * `MeshStandardMaterial + onBeforeCompile` keeps both WebGPU and the
 * `?renderer=webgl` escape hatch fed from one source — node materials
 * don't compile against the classic WebGLRenderer.
 */
export interface GlobalWaterShaderRefs {
  uTime: { value: number };
  uSunDirection: { value: THREE.Vector3 };
  uShorelineFadeDepth: { value: number };
  uSunSpecPower: { value: number };
  uSunSpecGain: { value: number };
  uUnderwaterTint: { value: THREE.Color };
  uCameraUnderwater: { value: number };
}

interface WaterEdgeFoamUniforms {
  terrainHeightmap: { value: THREE.Texture | null };
  terrainHeightWorldSize: { value: number };
  terrainHeightOrigin: { value: THREE.Vector2 };
  waterEdgeFoamWidth: { value: number };
  waterEdgeFoamIntensity: { value: number };
  waterEdgeBindingEnabled: { value: number };
}

const SURFACE_FRAG_OPAQUE = `// Sun-direction analytic specular. Replaces the per-frame reflection
// render target the Three.Water example used; preserves the no-RT
// mobile win documented in webgl-fallback-pipeline-diff.md item 8.
{
  vec3 _waterViewDir = normalize( vViewPosition );
  vec3 _waterSunView = normalize( ( viewMatrix * vec4( uSunDirection, 0.0 ) ).xyz );
  vec3 _waterHalfway = normalize( _waterSunView + _waterViewDir );
  float _waterSunSpec = pow( max( dot( normal, _waterHalfway ), 0.0 ), uSunSpecPower );
  outgoingLight += uSunSpecGain * _waterSunSpec * vec3( 1.0, 0.96, 0.88 );
}
// Shoreline transparency fade — view-space distance proxy for the
// terrain-water seam. Companion terrain side is in TerrainMaterial.ts.
{
  float _waterViewDepth = length( vViewPosition );
  float _waterShoreFade = smoothstep( 0.0, max( uShorelineFadeDepth, 0.001 ), _waterViewDepth );
  diffuseColor.a *= _waterShoreFade;
}
// Underwater-side tint: when the camera is submerged, lerp toward a
// brighter transmitted-light color so the underside does not read as
// the same dark teal as topside.
outgoingLight = mix( outgoingLight, uUnderwaterTint * ( 0.6 + 0.4 * max( dot( normal, vec3( 0.0, 1.0, 0.0 ) ), 0.0 ) ), uCameraUnderwater * 0.55 );
#include <opaque_fragment>`;

const SURFACE_FRAG_NORMAL = `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
{
  vec2 _waterRippleUv = vNormalMapUv + vec2( uTime * 0.02, uTime * 0.013 );
  vec3 _waterRippleN = texture2D( normalMap, _waterRippleUv ).xyz * 2.0 - 1.0;
  _waterRippleN.xy *= normalScale * 0.5;
  vec3 _waterRippleWorldN = normalize( tbn * _waterRippleN );
  normal = normalize( mix( normal, _waterRippleWorldN, 0.45 ) );
}
#endif`;

const FOAM_FRAG_OPAQUE = `// Water-side foam line. Inverse of the terrain-side soft-blend gradient:
// terrain-side darkens within ±softBlendDistance of waterY; water-side
// brightens within +waterEdgeFoamWidth of waterY (shallow depth).
// Gated by waterEdgeBindingEnabled so the unbound path is a no-op.
if (waterEdgeBindingEnabled > 0.5) {
  vec2 hmUv = (vWorldPositionWaterEdge.xz - terrainHeightOrigin) / max(terrainHeightWorldSize, 1.0);
  vec2 hmUvClamped = clamp(hmUv, vec2(0.0), vec2(1.0));
  float terrainY = texture2D(terrainHeightmap, hmUvClamped).r;
  float depth = vWorldPositionWaterEdge.y - terrainY;
  float foam = 1.0 - smoothstep(0.0, max(waterEdgeFoamWidth, 0.001), depth);
  foam *= step(0.0, depth);
  float insideU = step(0.0, hmUv.x) * step(hmUv.x, 1.0);
  float insideV = step(0.0, hmUv.y) * step(hmUv.y, 1.0);
  foam *= insideU * insideV;
  float foamStrength = foam * waterEdgeFoamIntensity;
  outgoingLight = mix(outgoingLight, vec3(0.92, 0.94, 0.93), foamStrength);
  diffuseColor.a = clamp(diffuseColor.a + foamStrength * 0.5, 0.0, 1.0);
}
#include <opaque_fragment>`;

/**
 * Shader/material binding layer for the global water plane. Owns the
 * surface-shader uniform refs, the terrain-edge foam uniforms, and the
 * composed `onBeforeCompile` callback. The owning `WaterSystem` calls
 * `install()` when the material is constructed and then drives the
 * per-frame uniform mutation via `updateSurfaceUniforms()`.
 */
export class WaterSurfaceBinding {
  private shaderRefs?: GlobalWaterShaderRefs;
  private terrainHeightBinding: WaterTerrainHeightSamplerBinding | null = null;
  private hydrologyRiverRefs?: HydrologyRiverShaderRefs;
  private readonly waterEdgeFoamUniforms: WaterEdgeFoamUniforms = {
    terrainHeightmap: { value: null },
    terrainHeightWorldSize: { value: 1 },
    terrainHeightOrigin: { value: new THREE.Vector2(0, 0) },
    waterEdgeFoamWidth: { value: WATER_EDGE_FOAM_WIDTH_METERS },
    waterEdgeFoamIntensity: { value: WATER_EDGE_FOAM_INTENSITY },
    waterEdgeBindingEnabled: { value: 0 },
  };

  /**
   * Install ALL onBeforeCompile patches in a single callback. Three.js does
   * not chain `onBeforeCompile` (last assignment wins), so the surface-shader
   * + terrain-edge foam injections MUST share one entry point. Order:
   *   1. surface — declares `vWaterWorldPos`, emits sun spec / shoreline fade
   *      / underwater tint.
   *   2. foam — declares `vWorldPositionWaterEdge`, mutates the already
   *      spec'd `outgoingLight` + `diffuseColor.a`.
   *
   * Mobile floor: no `WebGLRenderTarget` reflection pass. The sun-spec lobe
   * is the analytic substitute. Preserves the no-RT win documented in
   * `webgl-fallback-pipeline-diff.md` item 8.
   */
  install(material: THREE.MeshStandardMaterial, initialSun: THREE.Vector3): GlobalWaterShaderRefs {
    const refs: GlobalWaterShaderRefs = {
      uTime: { value: 0 },
      uSunDirection: { value: initialSun.clone() },
      uShorelineFadeDepth: { value: GLOBAL_WATER_SHORELINE_FADE_METERS },
      uSunSpecPower: { value: GLOBAL_WATER_SUN_SPEC_POWER },
      uSunSpecGain: { value: GLOBAL_WATER_SUN_SPEC_GAIN },
      uUnderwaterTint: { value: GLOBAL_WATER_UNDERWATER_TINT.clone() },
      uCameraUnderwater: { value: 0 },
    };
    this.shaderRefs = refs;
    material.onBeforeCompile = (shader) => {
      this.injectSurfaceShaderChunks(shader, refs);
      this.injectEdgeFoamChunks(shader);
    };
    // Force recompile in case Three has cached an earlier program.
    material.needsUpdate = true;
    return refs;
  }

  /** Per-frame uniform refresh. Safe to call when the water is hidden. */
  updateSurfaceUniforms(timeSeconds: number, sun: THREE.Vector3, cameraUnderwater: boolean): void {
    if (!this.shaderRefs) return;
    this.shaderRefs.uTime.value = timeSeconds;
    this.shaderRefs.uSunDirection.value.copy(sun);
    this.shaderRefs.uCameraUnderwater.value = cameraUnderwater ? 1 : 0;
  }

  /**
   * Install the flow-visuals patch on the hydrology river material and
   * capture the uniform refs so the owning system can tick `uTime` per
   * frame and late-bind the normal texture once `waternormals.jpg`
   * loads. Replaces any prior install (river surface rebuilds material).
   */
  installRiverFlowPatch(material: THREE.MeshStandardMaterial, initialNormalMap: THREE.Texture | null): HydrologyRiverShaderRefs {
    const refs = installHydrologyRiverFlowPatch(material, initialNormalMap);
    this.hydrologyRiverRefs = refs;
    return refs;
  }

  /** Advance river `uTime` + late-bind the normal map. No-op without install. */
  tickRiverFlow(deltaTime: number, normalMap: THREE.Texture | undefined): void {
    if (!this.hydrologyRiverRefs) return;
    this.hydrologyRiverRefs.uTime.value += deltaTime;
    if (normalMap && this.hydrologyRiverRefs.uRiverNormalMap.value !== normalMap) {
      this.hydrologyRiverRefs.uRiverNormalMap.value = normalMap;
    }
  }

  /** Drop the captured river refs when the river surface is torn down. */
  clearRiverFlowPatch(): void {
    this.hydrologyRiverRefs = undefined;
  }

  /**
   * Wire the terrain heightmap into the global water plane material so the
   * water-side foam line lights up wherever the plane intersects terrain.
   * Pass `null` to disable the foam line.
   */
  bindTerrainHeightSampler(binding: WaterTerrainHeightSamplerBinding | null): void {
    this.terrainHeightBinding = binding;
    const u = this.waterEdgeFoamUniforms;
    if (!binding) {
      u.terrainHeightmap.value = null;
      u.waterEdgeBindingEnabled.value = 0;
      return;
    }
    u.terrainHeightmap.value = binding.texture;
    u.terrainHeightWorldSize.value = Math.max(1, binding.worldSize);
    const halfWorld = Math.max(1, binding.worldSize) * 0.5;
    u.terrainHeightOrigin.value.set(
      Number.isFinite(binding.originX) ? (binding.originX as number) : -halfWorld,
      Number.isFinite(binding.originZ) ? (binding.originZ as number) : -halfWorld,
    );
    u.waterEdgeBindingEnabled.value = 1;
  }

  getTerrainHeightBinding(): WaterTerrainHeightSamplerBinding | null {
    return this.terrainHeightBinding;
  }

  private injectSurfaceShaderChunks(
    shader: THREE.WebGLProgramParametersWithUniforms,
    refs: GlobalWaterShaderRefs,
  ): void {
    shader.uniforms.uTime = refs.uTime;
    shader.uniforms.uSunDirection = refs.uSunDirection;
    shader.uniforms.uShorelineFadeDepth = refs.uShorelineFadeDepth;
    shader.uniforms.uSunSpecPower = refs.uSunSpecPower;
    shader.uniforms.uSunSpecGain = refs.uSunSpecGain;
    shader.uniforms.uUnderwaterTint = refs.uUnderwaterTint;
    shader.uniforms.uCameraUnderwater = refs.uCameraUnderwater;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWaterWorldPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vWaterWorldPos = worldPosition.xyz;
#else
vec4 _waterWorldPositionFallback = modelMatrix * vec4( transformed, 1.0 );
vWaterWorldPos = _waterWorldPositionFallback.xyz;
#endif`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uSunDirection;
uniform float uShorelineFadeDepth;
uniform float uSunSpecPower;
uniform float uSunSpecGain;
uniform vec3 uUnderwaterTint;
uniform float uCameraUnderwater;
varying vec3 vWaterWorldPos;`)
      .replace('#include <normal_fragment_maps>', SURFACE_FRAG_NORMAL)
      .replace('#include <opaque_fragment>', SURFACE_FRAG_OPAQUE);
  }

  private injectEdgeFoamChunks(shader: THREE.WebGLProgramParametersWithUniforms): void {
    const u = this.waterEdgeFoamUniforms;
    shader.uniforms.terrainHeightmap = u.terrainHeightmap as unknown as THREE.IUniform;
    shader.uniforms.terrainHeightWorldSize = u.terrainHeightWorldSize as unknown as THREE.IUniform;
    shader.uniforms.terrainHeightOrigin = u.terrainHeightOrigin as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeFoamWidth = u.waterEdgeFoamWidth as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeFoamIntensity = u.waterEdgeFoamIntensity as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeBindingEnabled = u.waterEdgeBindingEnabled as unknown as THREE.IUniform;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldPositionWaterEdge;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWorldPositionWaterEdge = worldPosition.xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D terrainHeightmap;
uniform float terrainHeightWorldSize;
uniform vec2 terrainHeightOrigin;
uniform float waterEdgeFoamWidth;
uniform float waterEdgeFoamIntensity;
uniform float waterEdgeBindingEnabled;
varying vec3 vWorldPositionWaterEdge;`)
      .replace('#include <opaque_fragment>', FOAM_FRAG_OPAQUE);
  }
}
