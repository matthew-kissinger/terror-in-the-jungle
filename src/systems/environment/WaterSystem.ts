import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import { AssetLoader } from '../assets/AssetLoader';
import { getAssetPath } from '../../config/paths';
import { WeatherSystem } from './WeatherSystem';
import { playElementAnimation } from '../../ui/engine/playElementAnimation';
import type { HydrologyBakeArtifact } from '../terrain/hydrology/HydrologyBake';

interface HydrologyRiverMeshStats {
  channelCount: number;
  segmentCount: number;
  vertexCount: number;
  totalLengthMeters: number;
  maxAccumulationCells: number;
}

interface HydrologyWaterQuerySegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startSurfaceY: number;
  endSurfaceY: number;
  halfWidth: number;
}

interface WaterDebugInfo {
  enabled: boolean;
  waterLevel: number;
  waterVisible: boolean;
  cameraUnderwater: boolean;
  size: number;
  hydrologyRiverMaterialProfile: string;
  hydrologyRiverVisible: boolean;
  hydrologyChannelCount: number;
  hydrologySegmentCount: number;
  hydrologyVertexCount: number;
  hydrologyTotalLengthMeters: number;
  hydrologyMaxAccumulationCells: number;
}

export type WaterSurfaceSource = 'none' | 'global' | 'hydrology';

export interface WaterInteractionSample {
  source: WaterSurfaceSource;
  surfaceY: number | null;
  depth: number;
  submerged: boolean;
  immersion01: number;
  buoyancyScalar: number;
}

export interface WaterInteractionOptions {
  immersionDepthMeters?: number;
}

const EMPTY_HYDROLOGY_RIVER_STATS: HydrologyRiverMeshStats = {
  channelCount: 0,
  segmentCount: 0,
  vertexCount: 0,
  totalLengthMeters: 0,
  maxAccumulationCells: 0,
};

const MAX_HYDROLOGY_RIVER_CHANNELS = 24;
const MAX_HYDROLOGY_RIVER_SEGMENTS = 2048;
const HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.35;
const HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS = 0.5;
const GLOBAL_WATER_COLOR = 0x17362f;
const GLOBAL_WATER_DISTORTION_SCALE = 2.35;
const GLOBAL_WATER_ALPHA = 0.78;
const GLOBAL_WATER_TIME_SCALE = 0.36;
// Shoreline fade reads transparency falling off near depth=0. Below this
// depth (meters) the surface dissolves toward fully transparent so the
// water-terrain seam reads as wet sand rather than a hard polygon edge.
// The sibling task `terrain-water-intersection-mask` handles the terrain
// side; the shader-side gradient here lives on the water plane only.
const GLOBAL_WATER_SHORELINE_FADE_METERS = 1.4;
// Sun-specular tightness. Higher = sharper highlight. 64 keeps the
// noon disc tight without producing a single-pixel spike on phones
// where the spec lobe can alias hard.
const GLOBAL_WATER_SUN_SPEC_POWER = 64;
const GLOBAL_WATER_SUN_SPEC_GAIN = 0.85;
// Underwater surface tint applied to the back face when the camera is
// submerged. The overlay (`createUnderwaterOverlay`) handles the
// post-process fade; this just keeps the surface seen from below from
// rendering as the same dark teal as topside, which would read as a
// flat lid. A lighter, slightly bluer tone gives subsurface refraction
// cues without needing a real refraction pass.
const GLOBAL_WATER_UNDERWATER_TINT = new THREE.Color(0x2a5a6a);
const HYDROLOGY_RIVER_MATERIAL_PROFILE = 'natural_channel_gradient';
const HYDROLOGY_RIVER_BANK_COLOR = new THREE.Color(0x23382e);
const HYDROLOGY_RIVER_SHALLOW_COLOR = new THREE.Color(0x1e4e52);
const HYDROLOGY_RIVER_DEEP_COLOR = new THREE.Color(0x0b2a34);
const HYDROLOGY_RIVER_BANK_ALPHA = 0.01;
const HYDROLOGY_RIVER_CENTER_ALPHA = 0.32;
const DEFAULT_WATER_IMMERSION_DEPTH_METERS = 1.6;

// Flow visuals for `hydrology-river-flow-visuals` (VODA-1 R2).
//
//   - HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S: 0.45 m/s — the normal-map scrolls
//     this far per second along the segment's flow direction. Tuned against
//     A Shau valley: at 0.45 the river reads as a slow jungle current rather
//     than a torrent (anything >1.0 looked like a flash flood), while still
//     producing visible motion at the riverside POV the playtest evidence
//     calls out. The normal scale (`HYDROLOGY_RIVER_NORMAL_SCALE`) is small
//     enough that the ripple does not destabilise the bank → shallow → deep
//     vertex-color gradient the R1 work landed.
//   - HYDROLOGY_RIVER_NORMAL_REPEAT_M: 6 m wave-period along flow / 3 m
//     across. Each `repeat` distance is one full tile of the shared
//     `waternormals.jpg`; periods chosen so the river reads as small chop
//     rather than ocean swell.
//   - HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD: 0.6 — below this `flowFactor`
//     (low-accumulation channels = narrow headwaters) the foam contribution
//     ramps up. Combined with the slope foam below this produces the
//     "where the channel narrows or passes over depth changes" effect the
//     brief requires.
//   - HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M: 0.05 — at this rise-over-run
//     (≈5%) the slope-driven foam is fully on. Most A Shau headwater
//     segments sit between 0.02 and 0.08; this brings rapids/cascades up
//     visibly without lighting up the broad valley reach.
//   - HYDROLOGY_RIVER_FOAM_INTENSITY: 0.45 — the brightness of the foam
//     contribution above the bank → shallow → deep gradient. The
//     terrain-water-edge foam (R1) uses 0.55; the river-flow foam is a
//     hair softer so the two read as distinct effects (shore surf vs
//     flowing-water cap).
const HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S = 0.45;
const HYDROLOGY_RIVER_NORMAL_REPEAT_ALONG_M = 6;
const HYDROLOGY_RIVER_NORMAL_REPEAT_ACROSS_M = 3;
const HYDROLOGY_RIVER_NORMAL_SCALE = 0.32;
const HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD = 0.6;
const HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M = 0.05;
const HYDROLOGY_RIVER_FOAM_INTENSITY = 0.45;
const HYDROLOGY_RIVER_FOAM_COLOR = new THREE.Color(0xe9efe8);

// Foam-line band on the water side of the terrain-water intersection. The
// band is parameterised in metres of effective water depth (waterY − sampled
// terrainY). At zero depth the foam is fully opaque; it fades to 0 at
// `WATER_EDGE_FOAM_WIDTH_METERS`. Chosen for VODA-1
// (cycle-voda-1-water-shader-and-acceptance):
//   - WATER_EDGE_FOAM_WIDTH_METERS: 0.8 m — narrow enough to read as a
//     surf-line at the shoreline rather than a beach-wide tint, wide enough
//     to survive temporal aliasing as wavelets move.
//   - WATER_EDGE_FOAM_INTENSITY: 0.55 — visible against the dark water base
//     (GLOBAL_WATER_COLOR = 0x17362f) without blowing past LDR.
// The companion terrain-side soft-blend distance is documented in
// TerrainMaterial.ts (TERRAIN_WATER_EDGE_DEFAULT_SOFT_BLEND_DISTANCE = 1.5 m
// — wider than the foam band so the wet-sand band reads through the foam).
const WATER_EDGE_FOAM_WIDTH_METERS = 0.8;
const WATER_EDGE_FOAM_INTENSITY = 0.55;
const WATER_EDGE_SOFT_BLEND_DISTANCE_METERS = 1.5;

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
 * Custom uniforms wired into the global water plane's `MeshStandardMaterial`
 * via `onBeforeCompile`. References are captured at compile time and updated
 * each frame from `update()`. This is the lightest-weight way to add a tuned
 * shader on top of Three's PBR chunks without dropping into TSL — the
 * post-merge `MeshStandardNodeMaterial` path is documented as a mobile
 * cost regressor in
 * `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md`
 * and the `?renderer=webgl` escape hatch (classic WebGLRenderer) does not
 * accept node materials. `MeshStandardMaterial + onBeforeCompile` keeps both
 * backends fed from one source.
 */
interface GlobalWaterShaderRefs {
  uTime: { value: number };
  uSunDirection: { value: THREE.Vector3 };
  uShorelineFadeDepth: { value: number };
  uSunSpecPower: { value: number };
  uSunSpecGain: { value: number };
  uUnderwaterTint: { value: THREE.Color };
  uCameraUnderwater: { value: number };
}

/**
 * Uniforms captured at compile time on the hydrology river material's
 * `onBeforeCompile` patch (see {@link installHydrologyRiverFlowPatch}).
 * `uTime` is advanced from `update()`. The other slots stay constant after
 * binding — they control the per-segment normal-scroll speed and the foam
 * mix that fires where channels narrow or pass over a depth change.
 */
interface HydrologyRiverShaderRefs {
  uTime: { value: number };
  uFlowSpeed: { value: number };
  uFoamIntensity: { value: number };
  uFoamColor: { value: THREE.Color };
  uRiverNormalMap: { value: THREE.Texture | null };
  uRiverNormalScale: { value: number };
}

export class WaterSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private water?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private waterShaderRefs?: GlobalWaterShaderRefs;
  private waterTimeSeconds = 0;
  private waterNormalTexture?: THREE.Texture;
  private hydrologyRiverGroup?: THREE.Group;
  private hydrologyRiverMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private hydrologyRiverStats: HydrologyRiverMeshStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
  private hydrologyWaterQuerySegments: HydrologyWaterQuerySegment[] = [];
  private hydrologyRiverShaderRefs?: HydrologyRiverShaderRefs;
  private assetLoader: AssetLoader;
  private weatherSystem?: WeatherSystem;
  private atmosphereSystem?: ISkyRuntime;
  
  // Water configuration
  private readonly WATER_LEVEL = 0; // Sea level height
  private readonly BASE_WATER_SIZE = 2000; // Base geometry size before scaling
  private readonly WATER_SEGMENTS = 100; // Geometry segments for waves
  private worldWaterSize = 2000;
  
  // State
  private sun: THREE.Vector3;
  private wasUnderwater: boolean = false;
  private overlay?: HTMLDivElement;
  private enabled = true;

  // Terrain-water intersection mask state.
  // `terrainHeightBinding` is opt-in: if no caller wires the terrain heightmap
  // through `bindTerrainHeightSampler`, the foam line stays disabled and the
  // global water surface renders as it did pre-VODA-1. When bound, the global
  // water material's onBeforeCompile patch reads the heightmap and emits the
  // foam line wherever water depth (waterY − sampledTerrainY) is shallow.
  private terrainHeightBinding: WaterTerrainHeightSamplerBinding | null = null;
  private readonly waterEdgeFoamUniforms = {
    terrainHeightmap: { value: null as THREE.Texture | null },
    terrainHeightWorldSize: { value: 1 },
    terrainHeightOrigin: { value: new THREE.Vector2(0, 0) },
    waterEdgeFoamWidth: { value: WATER_EDGE_FOAM_WIDTH_METERS },
    waterEdgeFoamIntensity: { value: WATER_EDGE_FOAM_INTENSITY },
    waterEdgeBindingEnabled: { value: 0 },
  };
  
  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.sun = new THREE.Vector3();
  }

  setWeatherSystem(weatherSystem: WeatherSystem): void {
    this.weatherSystem = weatherSystem;
  }

  /**
   * Bind the atmosphere system so water reflections track the real sun
   * direction each frame. Before this wire-up the `sun` vector was a stub
   * initialized to the origin and never updated.
   */
  setAtmosphereSystem(atmosphereSystem: ISkyRuntime): void {
    this.atmosphereSystem = atmosphereSystem;
    // Apply once immediately so reflections look right on the first frame
    // even before `update()` runs.
    this.syncSunFromAtmosphere();
  }

  private syncSunFromAtmosphere(): void {
    if (!this.atmosphereSystem) return;
    this.atmosphereSystem.getSunDirection(this.sun);
    // `getSunDirection` already returns a unit vector, but re-normalize
    // defensively in case a future backend returns an unnormalized value.
    if (this.sun.lengthSq() > 0) {
      this.sun.normalize();
    }
  }

  /**
   * Install ALL onBeforeCompile patches on the global water material in a
   * single callback. Three.js does not chain `onBeforeCompile` — last
   * assignment wins — so the surface-shader injection and the terrain-edge
   * foam injection MUST share one entry point.
   *
   * Currently composes:
   *   1. {@link injectSurfaceShaderChunks} — scrolling normal ripple,
   *      sun-direction Blinn-Phong spec, shoreline transparency fade, and
   *      underwater-side tint. Owned by `water-surface-shader` (VODA-1).
   *   2. {@link injectEdgeFoamChunks} — depth-driven foam line on the
   *      water side of the terrain intersection. Owned by
   *      `terrain-water-intersection-mask` (sibling task).
   *
   * Both patches share the same `<common>`/`<worldpos_vertex>` insertion
   * points and the `<opaque_fragment>` slot, so they're applied in a
   * deterministic order: surface-shader first (declares `vWaterWorldPos`
   * and emits sun spec / shoreline fade / underwater tint), then foam
   * (declares its own `vWorldPositionWaterEdge` varying and mutates the
   * already-spec'd `outgoingLight` + `diffuseColor.a`).
   *
   * Mobile floor: no `WebGLRenderTarget` reflection pass. The sun-spec
   * lobe is the analytic substitute. This preserves the no-RT win
   * documented in `webgl-fallback-pipeline-diff.md` item 8.
   */
  private installWaterMaterialPatches(material: THREE.MeshStandardMaterial): void {
    const surfaceRefs: GlobalWaterShaderRefs = {
      uTime: { value: 0 },
      uSunDirection: { value: this.sun.clone() },
      uShorelineFadeDepth: { value: GLOBAL_WATER_SHORELINE_FADE_METERS },
      uSunSpecPower: { value: GLOBAL_WATER_SUN_SPEC_POWER },
      uSunSpecGain: { value: GLOBAL_WATER_SUN_SPEC_GAIN },
      uUnderwaterTint: { value: GLOBAL_WATER_UNDERWATER_TINT.clone() },
      uCameraUnderwater: { value: 0 },
    };
    this.waterShaderRefs = surfaceRefs;

    material.onBeforeCompile = (shader) => {
      this.injectSurfaceShaderChunks(shader, surfaceRefs);
      this.injectEdgeFoamChunks(shader);
    };
    // Force recompile so the injection runs even if Three has cached an
    // earlier program for an identically-keyed material.
    material.needsUpdate = true;
  }

  /**
   * Surface-shader half of the composed `onBeforeCompile` patch.
   * Adds:
   *   - A scrolling normal-sample using a time uniform (layered on top of
   *     the existing `normalMap.offset` walk for a two-octave ripple).
   *   - A sun-direction Blinn-Phong specular lobe that tracks
   *     `ISkyRuntime.getSunDirection()` each frame.
   *   - A shoreline transparency fade keyed on view-space distance, so
   *     the water-terrain seam reads as wet sand rather than a hard
   *     polygon edge.
   *   - An underwater-tint blend that swaps the surface tone when the
   *     camera is submerged so the underside reads as transmitted light
   *     rather than the topside dark teal.
   */
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

    // ---- VERTEX ----
    // Pass world position through so the fragment can read the
    // submerged depth (water.y - vWorldPosition.y, both in world
    // space) for the shoreline fade. `vWorldPosition` is not in the
    // default standard shader varyings; declare and assign it.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWaterWorldPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vWaterWorldPos = worldPosition.xyz;
#else
vec4 _waterWorldPositionFallback = modelMatrix * vec4( transformed, 1.0 );
vWaterWorldPos = _waterWorldPositionFallback.xyz;
#endif`,
      );

    // ---- FRAGMENT ----
    // - Add a scrolling normal-map sample driven by uTime; mix it with
    //   the standard normal-map contribution to get a moving ripple
    //   on top of the static offset walk in `update()`.
    // - Add a Blinn-Phong specular lobe along the sun direction, in
    //   view space (consistent with how Three's standard fragment
    //   handles `vViewPosition`).
    // - Apply a shoreline transparency fade based on view-space depth.
    // - When the camera is submerged, lerp the final surface RGB
    //   toward `uUnderwaterTint` so the underside reads as
    //   transmitted light, not as the topside teal.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uSunDirection;
uniform float uShorelineFadeDepth;
uniform float uSunSpecPower;
uniform float uSunSpecGain;
uniform vec3 uUnderwaterTint;
uniform float uCameraUnderwater;
varying vec3 vWaterWorldPos;`,
      )
      // Add a second-octave scrolling normal sample. Three's standard
      // chunk has already produced `normal` (perturbed by the bound
      // normalMap) by the time we reach `<lights_fragment_begin>`, so
      // we layer on top there without touching the chunk internals.
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
{
  vec2 _waterRippleUv = vNormalMapUv + vec2( uTime * 0.02, uTime * 0.013 );
  vec3 _waterRippleN = texture2D( normalMap, _waterRippleUv ).xyz * 2.0 - 1.0;
  _waterRippleN.xy *= normalScale * 0.5;
  // Re-orthonormalize against the existing tangent-space frame so the
  // perturbation stays consistent with the bound normal.
  vec3 _waterRippleWorldN = normalize( tbn * _waterRippleN );
  normal = normalize( mix( normal, _waterRippleWorldN, 0.45 ) );
}
#endif`,
      )
      // Inject the sun-spec lobe + shoreline-fade + underwater tint just
      // before the standard <opaque_fragment> chunk composes gl_FragColor
      // (Three r184 uses opaque_fragment, not output_fragment). At this
      // point outgoingLight and diffuseColor.a are the final accumulators.
      .replace(
        '#include <opaque_fragment>',
        `// Sun-direction analytic specular. Replaces the per-frame reflection
// render target the Three.Water example used; preserves the no-RT
// mobile win documented in webgl-fallback-pipeline-diff.md item 8.
{
  vec3 _waterViewDir = normalize( vViewPosition );
  // uSunDirection arrives in world space; transform to view space.
  vec3 _waterSunView = normalize( ( viewMatrix * vec4( uSunDirection, 0.0 ) ).xyz );
  vec3 _waterHalfway = normalize( _waterSunView + _waterViewDir );
  float _waterSunSpec = pow( max( dot( normal, _waterHalfway ), 0.0 ), uSunSpecPower );
  outgoingLight += uSunSpecGain * _waterSunSpec * vec3( 1.0, 0.96, 0.88 );
}
// Shoreline transparency fade. The water plane is a full-screen
// disc rather than a depth-aware mesh; without a depth-prepass the
// best proxy for "near the shoreline" the fragment has is view-
// space distance. Very-near fragments (where the camera typically
// grazes a bank) get the transparency falloff so the seam dissolves
// into wet sand. The terrain side of this seam is delivered by the
// sibling task terrain-water-intersection-mask.
{
  float _waterViewDepth = length( vViewPosition );
  float _waterShoreFade = smoothstep( 0.0, max( uShorelineFadeDepth, 0.001 ), _waterViewDepth );
  diffuseColor.a *= _waterShoreFade;
}
// Underwater-side tint: when the camera is submerged, lerp the
// final surface RGB toward a brighter transmitted-light color so
// the underside does not read as the same dark teal as topside.
// The screen-space overlay (createUnderwaterOverlay) handles the
// post-process fade independently.
outgoingLight = mix( outgoingLight, uUnderwaterTint * ( 0.6 + 0.4 * max( dot( normal, vec3( 0.0, 1.0, 0.0 ) ), 0.0 ) ), uCameraUnderwater * 0.55 );
#include <opaque_fragment>`,
      );
  }

  async init(): Promise<void> {
    Logger.info('environment', 'Initializing Water System...');
    
    // Create water geometry - large plane
    const waterGeometry = new THREE.PlaneGeometry(
      this.BASE_WATER_SIZE,
      this.BASE_WATER_SIZE,
      this.WATER_SEGMENTS,
      this.WATER_SEGMENTS
    );

    // Load water normal texture
    let waterNormals = this.assetLoader.getTexture('waternormals');
    if (!waterNormals) {
      // Fallback: try to load it directly
      Logger.info('environment', 'Loading water normal texture directly...');
      waterNormals = await new THREE.TextureLoader().loadAsync(getAssetPath('waternormals.jpg'));
    }
    
    // Configure texture wrapping for seamless tiling
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

    this.waterNormalTexture = waterNormals;

    const waterMaterial = new THREE.MeshStandardMaterial({
      name: 'global-water-standard-material',
      color: GLOBAL_WATER_COLOR,
      roughness: 0.42,
      metalness: 0,
      transparent: true,
      opacity: GLOBAL_WATER_ALPHA,
      normalMap: waterNormals,
      normalScale: new THREE.Vector2(0.18, 0.18),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    waterMaterial.envMapIntensity = 0.35;
    // Single onBeforeCompile entry point — composes surface-shader (this
    // PR) + terrain-edge foam (sibling task) so neither silently
    // overwrites the other.
    this.installWaterMaterialPatches(waterMaterial);

    this.water = new THREE.Mesh(waterGeometry, waterMaterial);
    this.water.name = 'global-water-standard-plane';

    // PlaneGeometry is authored in XY; rotate so the surface lies on XZ.
    this.water.rotation.x = -Math.PI / 2;
    
    // Position at water level
    this.water.position.y = this.WATER_LEVEL;
    this.updateWaterScale();
    
    // Add to scene - dynamic: follows camera XZ
    this.water.matrixAutoUpdate = true;
    this.scene.add(this.water);
    
    // Set initial sun position (matches directional light)
    this.updateSunPosition(50, 100, 30);
    
    // Create underwater overlay
    this.createUnderwaterOverlay();
    
    Logger.info('environment', `Water System initialized at Y=${this.WATER_LEVEL}`);
  }

  private createUnderwaterOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.backgroundColor = '#004455';
    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.transition = 'opacity 0.5s ease-out';
    this.overlay.style.zIndex = '900'; // Below UI but above game
    this.overlay.style.display = 'none'; // Hidden initially
    
    // Add some blur/distortion effect
    this.overlay.style.backdropFilter = 'blur(4px)';
    
    document.body.appendChild(this.overlay);
  }

  update(deltaTime: number): void {
    if (!this.water) return;

    if (!this.isGlobalWaterPlaneActive()) {
      this.setUnderwaterState(false);
    }

    if (this.water.visible) {
      if (this.waterNormalTexture) {
        this.waterNormalTexture.offset.x += deltaTime * GLOBAL_WATER_TIME_SCALE * 0.015;
        this.waterNormalTexture.offset.y += deltaTime * GLOBAL_WATER_TIME_SCALE * 0.008;
      }

      // Keep ocean centered under camera so map-edge seams are not visible in large worlds.
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
    }

    // Pull the current sun direction from the atmosphere each frame so the
    // water specular highlight tracks TOD presets (dawn/noon/dusk) and
    // eventually a live sun cycle. Per-scenario presets are static in v1
    // so this is cheap; backends that animate will get the updates for free.
    this.syncSunFromAtmosphere();

    // Check underwater state
    this.checkUnderwaterState();

    // Advance the shader time uniform regardless of `water.visible`. If the
    // global plane is suppressed because hydrology rivers are active, no
    // fragments sample these uniforms anyway, so the cost is one float add.
    this.waterTimeSeconds += deltaTime * GLOBAL_WATER_TIME_SCALE;
    if (this.waterShaderRefs) {
      this.waterShaderRefs.uTime.value = this.waterTimeSeconds;
      this.waterShaderRefs.uSunDirection.value.copy(this.sun);
      this.waterShaderRefs.uCameraUnderwater.value = this.wasUnderwater ? 1 : 0;
    }
    // Tick the hydrology river time uniform on the same clock. The flow shader
    // scrolls the normal-map along each segment's baked flow direction at
    // `HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S`; the value here is plain seconds
    // since the system started (no GLOBAL_WATER_TIME_SCALE multiplier — the
    // river has its own physical speed and shouldn't be slaved to the
    // ocean's normal-offset cadence).
    if (this.hydrologyRiverShaderRefs) {
      this.hydrologyRiverShaderRefs.uTime.value += deltaTime;
      // Late-bind the shared waternormals texture if `setHydrologyChannels`
      // fired before `init()` finished loading it. After the first bind this
      // is a no-op (reference identity check), so the cost is one comparison
      // per frame while the river is on screen.
      if (
        this.waterNormalTexture &&
        this.hydrologyRiverShaderRefs.uRiverNormalMap.value !== this.waterNormalTexture
      ) {
        this.hydrologyRiverShaderRefs.uRiverNormalMap.value = this.waterNormalTexture;
      }
    }
  }

  private checkUnderwaterState(): void {
    const isUnderwater = this.isUnderwater(this.camera.position);
    this.setUnderwaterState(isUnderwater);
  }

  private setUnderwaterState(isUnderwater: boolean): void {
    if (isUnderwater !== this.wasUnderwater) {
      this.wasUnderwater = isUnderwater;
      
      // Update weather system (handles fog and light)
      if (this.weatherSystem) {
        this.weatherSystem.setUnderwater(isUnderwater);
      }
      
      // Update overlay
      if (this.overlay) {
        if (isUnderwater) {
          this.overlay.style.display = 'block';
          playElementAnimation(
            this.overlay,
            [
              { opacity: 0 },
              { opacity: 0.4 }
            ],
            {
              duration: 250,
              easing: 'ease-out',
              fill: 'forwards'
            }
          );
        } else {
          this.overlay.style.opacity = '0';
          // Hide after transition
          setTimeout(() => {
            if (this.overlay && !this.wasUnderwater) {
              this.overlay.style.display = 'none';
            }
          }, 500);
        }
      }
    }
  }

  dispose(): void {
    this.clearHydrologyChannels();

    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      (this.water.material as THREE.Material).dispose();
    }
    
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    
    Logger.info('environment', 'Water System disposed');
  }

  /**
   * Update sun direction for water reflections
   */
  updateSunPosition(x: number, y: number, z: number): void {
    this.sun.set(x, y, z);
    this.sun.normalize();
  }
  
  /**
   * Get the water level for other systems to check
   */
  getWaterLevel(): number {
    return this.WATER_LEVEL;
  }
  
  /**
   * Check if a position is underwater
   */
  isUnderwater(position: THREE.Vector3): boolean {
    return this.getWaterDepth(position) > 0;
  }

  /**
   * Return the water surface at a gameplay position, or null when dry.
   */
  getWaterSurfaceY(position: THREE.Vector3): number | null {
    return this.resolveWaterSurface(position).surfaceY;
  }

  /**
   * Return water depth above the supplied position. Dry positions report 0.
   */
  getWaterDepth(position: THREE.Vector3): number {
    return this.sampleWaterInteraction(position).depth;
  }

  /**
   * Shared gameplay sample for swimming, buoyancy, watercraft, and bank
   * interactions. It intentionally reports a scalar only; force application
   * belongs in the future physics consumer, not in the renderer-owned system.
   */
  sampleWaterInteraction(
    position: THREE.Vector3,
    options: WaterInteractionOptions = {},
  ): WaterInteractionSample {
    const surface = this.resolveWaterSurface(position);
    if (surface.surfaceY === null) {
      return {
        source: 'none',
        surfaceY: null,
        depth: 0,
        submerged: false,
        immersion01: 0,
        buoyancyScalar: 0,
      };
    }

    const depth = Math.max(0, surface.surfaceY - position.y);
    const immersionDepthMeters = Number.isFinite(options.immersionDepthMeters)
      ? Math.max(0.01, options.immersionDepthMeters ?? DEFAULT_WATER_IMMERSION_DEPTH_METERS)
      : DEFAULT_WATER_IMMERSION_DEPTH_METERS;
    const immersion01 = clamp(depth / immersionDepthMeters, 0, 1);
    return {
      source: surface.source,
      surfaceY: surface.surfaceY,
      depth,
      submerged: depth > 0,
      immersion01,
      buoyancyScalar: immersion01,
    };
  }
  
  /**
   * Set water color
   */
  setWaterColor(color: number): void {
    if (this.water) {
      this.water.material.color.set(color);
    }
  }
  
  /**
   * Set distortion scale (wave intensity)
   */
  setDistortionScale(scale: number): void {
    if (this.water) {
      const normalScale = Math.max(0, Math.min(0.8, (scale / GLOBAL_WATER_DISTORTION_SCALE) * 0.18));
      this.water.material.normalScale.set(normalScale, normalScale);
    }
  }

  /**
   * Show or hide the water plane. Modes with no lakes/ocean (e.g. A Shau Valley)
   * disable the global water to avoid a flat plane slicing through terrain.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateGlobalWaterVisibility();
    if (this.overlay) {
      if (!enabled) {
        this.overlay.style.display = 'none';
        this.overlay.style.opacity = '0';
      }
    }
    if (!enabled) {
      this.setUnderwaterState(false);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDebugInfo(): WaterDebugInfo {
    return {
      enabled: this.enabled,
      waterLevel: this.WATER_LEVEL,
      waterVisible: Boolean(this.water?.visible),
      cameraUnderwater: this.isUnderwater(this.camera.position),
      size: this.worldWaterSize,
      hydrologyRiverMaterialProfile: this.hydrologyRiverMesh ? HYDROLOGY_RIVER_MATERIAL_PROFILE : 'none',
      hydrologyRiverVisible: Boolean(this.hydrologyRiverGroup?.visible),
      hydrologyChannelCount: this.hydrologyRiverStats.channelCount,
      hydrologySegmentCount: this.hydrologyRiverStats.segmentCount,
      hydrologyVertexCount: this.hydrologyRiverStats.vertexCount,
      hydrologyTotalLengthMeters: this.hydrologyRiverStats.totalLengthMeters,
      hydrologyMaxAccumulationCells: this.hydrologyRiverStats.maxAccumulationCells,
    };
  }

  /**
   * Publish the live water-edge configuration for terrain-side consumers
   * (`updateTerrainMaterialWaterEdge`). The runtime composer wires this
   * through to TerrainMaterial in a follow-up; until then it is a read-only
   * snapshot that downstream code can pick up.
   */
  getWaterEdgeBinding(): WaterEdgeBinding {
    return {
      surfaceY: this.WATER_LEVEL,
      softBlendDistance: WATER_EDGE_SOFT_BLEND_DISTANCE_METERS,
    };
  }

  /**
   * Wire the terrain heightmap into the global water plane material so the
   * water-side foam line lights up wherever the plane intersects terrain.
   * Pass `null` to disable the foam line and revert to the pre-VODA-1
   * water-plane look (useful when the heightmap is being rebaked or when a
   * future scenario has no global plane). Safe to call before or after
   * `init()`; if called pre-init the binding is replayed once the material
   * exists.
   */
  bindTerrainHeightSampler(binding: WaterTerrainHeightSamplerBinding | null): void {
    this.terrainHeightBinding = binding;
    const uniforms = this.waterEdgeFoamUniforms;
    if (!binding) {
      uniforms.terrainHeightmap.value = null;
      uniforms.waterEdgeBindingEnabled.value = 0;
      return;
    }
    uniforms.terrainHeightmap.value = binding.texture;
    uniforms.terrainHeightWorldSize.value = Math.max(1, binding.worldSize);
    const halfWorld = (Math.max(1, binding.worldSize)) * 0.5;
    uniforms.terrainHeightOrigin.value.set(
      Number.isFinite(binding.originX) ? (binding.originX as number) : -halfWorld,
      Number.isFinite(binding.originZ) ? (binding.originZ as number) : -halfWorld,
    );
    uniforms.waterEdgeBindingEnabled.value = 1;
  }

  /**
   * Foam-line half of the composed `onBeforeCompile` patch. Mutates `shader`
   * in place; the single-callback wiring lives in
   * {@link installWaterMaterialPatches}.
   *
   * Patches the fragment shader to emit a foam-line contribution where water
   * depth is shallow. Activation is gated at runtime by the
   * `waterEdgeBindingEnabled` uniform so we can ship the shader path without
   * forcing every caller to wire a terrain heightmap on day one.
   *
   * Uses MeshStandardMaterial includes so the existing PBR shading (sun
   * specular, normalmap ripple, transparency) is preserved verbatim. The
   * patch only nudges `outgoingLight` and `diffuseColor.a` immediately
   * before the standard `<opaque_fragment>` chunk — no additional render
   * targets, no depth texture.
   */
  private injectEdgeFoamChunks(shader: THREE.WebGLProgramParametersWithUniforms): void {
    const uniforms = this.waterEdgeFoamUniforms;
    shader.uniforms.terrainHeightmap = uniforms.terrainHeightmap as unknown as THREE.IUniform;
    shader.uniforms.terrainHeightWorldSize = uniforms.terrainHeightWorldSize as unknown as THREE.IUniform;
    shader.uniforms.terrainHeightOrigin = uniforms.terrainHeightOrigin as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeFoamWidth = uniforms.waterEdgeFoamWidth as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeFoamIntensity = uniforms.waterEdgeFoamIntensity as unknown as THREE.IUniform;
    shader.uniforms.waterEdgeBindingEnabled = uniforms.waterEdgeBindingEnabled as unknown as THREE.IUniform;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPositionWaterEdge;`,
    ).replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
vWorldPositionWaterEdge = worldPosition.xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D terrainHeightmap;
uniform float terrainHeightWorldSize;
uniform vec2 terrainHeightOrigin;
uniform float waterEdgeFoamWidth;
uniform float waterEdgeFoamIntensity;
uniform float waterEdgeBindingEnabled;
varying vec3 vWorldPositionWaterEdge;`,
    ).replace(
      '#include <opaque_fragment>',
      `// Water-side foam line. Inverse of the terrain-side soft-blend gradient:
// terrain-side darkens within ±softBlendDistance of waterY; water-side
// brightens within +waterEdgeFoamWidth of waterY (i.e. shallow depth).
// Gated by waterEdgeBindingEnabled so the unbound path is a no-op.
// Mutates outgoingLight and diffuseColor.a *before* opaque_fragment writes
// the final gl_FragColor — that's the only slot in meshphysical's fragment
// pipeline where both the post-lighting RGB and the alpha are still mutable.
if (waterEdgeBindingEnabled > 0.5) {
  vec2 hmUv = (vWorldPositionWaterEdge.xz - terrainHeightOrigin) / max(terrainHeightWorldSize, 1.0);
  vec2 hmUvClamped = clamp(hmUv, vec2(0.0), vec2(1.0));
  float terrainY = texture2D(terrainHeightmap, hmUvClamped).r;
  float depth = vWorldPositionWaterEdge.y - terrainY;
  float foam = 1.0 - smoothstep(0.0, max(waterEdgeFoamWidth, 0.001), depth);
  foam *= step(0.0, depth); // only foam where water is over terrain, not under
  // Inside-UV mask so the foam doesn't ring the world-edge texel clamp.
  float insideU = step(0.0, hmUv.x) * step(hmUv.x, 1.0);
  float insideV = step(0.0, hmUv.y) * step(hmUv.y, 1.0);
  foam *= insideU * insideV;
  float foamStrength = foam * waterEdgeFoamIntensity;
  outgoingLight = mix(outgoingLight, vec3(0.92, 0.94, 0.93), foamStrength);
  diffuseColor.a = clamp(diffuseColor.a + foamStrength * 0.5, 0.0, 1.0);
}
#include <opaque_fragment>`,
    );
  }

  /**
   * Add map-space river and stream surfaces generated from an accepted
   * hydrology bake. This is separate from the global water plane so A Shau can
   * keep the sea-level plane disabled while still drawing DEM-following water.
   */
  setHydrologyChannels(artifact: HydrologyBakeArtifact | null): void {
    this.clearHydrologyChannels();
    if (!artifact || artifact.channelPolylines.length === 0) {
      return;
    }

    const meshBuild = this.buildHydrologyRiverMesh(artifact);
    if (!meshBuild) {
      return;
    }

    const group = new THREE.Group();
    group.name = 'hydrology-river-surfaces';
    group.add(meshBuild.mesh);
    this.scene.add(group);

    this.hydrologyRiverGroup = group;
    this.hydrologyRiverMesh = meshBuild.mesh;
    this.hydrologyRiverStats = meshBuild.stats;
    this.hydrologyWaterQuerySegments = meshBuild.querySegments;
    this.updateGlobalWaterVisibility();
    Logger.info(
      'environment',
      `Hydrology river surfaces loaded: ${meshBuild.stats.channelCount} channels, ${meshBuild.stats.segmentCount} segments`,
    );
  }

  /**
   * Match water coverage to current game mode world size.
   * Adds margin to absorb fast traversal and distant chunk transitions.
   */
  setWorldSize(worldSize: number): void {
    const safeWorld = Number.isFinite(worldSize) && worldSize > 0 ? worldSize : this.BASE_WATER_SIZE;
    const target = Math.max(this.BASE_WATER_SIZE, safeWorld * 1.8);
    if (Math.abs(target - this.worldWaterSize) < 1) return;
    this.worldWaterSize = target;
    this.updateWaterScale();
    Logger.info('environment', `Water coverage resized for world: ${this.worldWaterSize.toFixed(0)}m`);
  }

  private updateWaterScale(): void {
    if (!this.water) return;
    const scale = this.worldWaterSize / this.BASE_WATER_SIZE;
    this.water.scale.set(scale, 1, scale);
  }

  private clearHydrologyChannels(): void {
    if (this.hydrologyRiverGroup) {
      this.scene.remove(this.hydrologyRiverGroup);
    }
    if (this.hydrologyRiverMesh) {
      this.hydrologyRiverMesh.geometry.dispose();
      this.hydrologyRiverMesh.material.dispose();
    }
    this.hydrologyRiverGroup = undefined;
    this.hydrologyRiverMesh = undefined;
    this.hydrologyRiverStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
    this.hydrologyWaterQuerySegments = [];
    this.hydrologyRiverShaderRefs = undefined;
    this.updateGlobalWaterVisibility();
  }

  private isGlobalWaterPlaneActive(): boolean {
    return this.enabled && !this.hydrologyRiverGroup;
  }

  private updateGlobalWaterVisibility(): void {
    if (this.water) {
      this.water.visible = this.isGlobalWaterPlaneActive();
    }
  }

  private resolveWaterSurface(position: THREE.Vector3): { source: WaterSurfaceSource; surfaceY: number | null } {
    const hydrologySurfaceY = this.getHydrologyWaterSurfaceY(position.x, position.z);
    if (hydrologySurfaceY !== null) {
      return { source: 'hydrology', surfaceY: hydrologySurfaceY };
    }
    return this.isGlobalWaterPlaneActive()
      ? { source: 'global', surfaceY: this.WATER_LEVEL }
      : { source: 'none', surfaceY: null };
  }

  private buildHydrologyRiverMesh(
    artifact: HydrologyBakeArtifact,
  ): {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const geometryBuild = this.buildHydrologyRiverGeometry(artifact);
    if (!geometryBuild) return null;

    const material = new THREE.MeshStandardMaterial({
      name: 'hydrology-river-surface-material',
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0.02,
      roughness: 0.54,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.installHydrologyRiverFlowPatch(material);
    const mesh = new THREE.Mesh(geometryBuild.geometry, material);
    mesh.name = 'hydrology-river-surface-mesh';
    mesh.frustumCulled = true;
    mesh.renderOrder = 2;
    return { mesh, stats: geometryBuild.stats, querySegments: geometryBuild.querySegments };
  }

  /**
   * Install the flow-visuals `onBeforeCompile` patch on the hydrology river
   * material. The patch:
   *   1. Adds two vertex attributes baked at build time:
   *        - `aFlowDir` (vec2 in world XZ): unit-length per-segment flow
   *          direction (segment start → end).
   *        - `aFoamMask` (float in [0..1]): combined narrowness + slope
   *          factor used to brighten foam-cap fragments.
   *   2. Samples the shared `waternormals.jpg` along a UV that scrolls in
   *      flow direction at `uFlowSpeed`. The lateral/longitudinal axes are
   *      derived from `aFlowDir` and the perpendicular so the ripple aligns
   *      with the riverbed rather than world space.
   *   3. Adds a foam contribution where `vFoamMask > 0` (narrow channels or
   *      steep drops). The base bank → shallow → deep vertex-color gradient
   *      from R1 is preserved verbatim; foam is layered on top of
   *      `outgoingLight` just before `<opaque_fragment>` composes the
   *      final pixel.
   *
   * Mobile floor: no `WebGLRenderTarget`, no depth texture. The patch is a
   * straight ALU + 1 normal-map fetch per fragment — within budget for the
   * tiny rendered surface (river mesh caps at 24 channels × 2048 segments).
   */
  private installHydrologyRiverFlowPatch(material: THREE.MeshStandardMaterial): void {
    const refs: HydrologyRiverShaderRefs = {
      uTime: { value: 0 },
      uFlowSpeed: { value: HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S },
      uFoamIntensity: { value: HYDROLOGY_RIVER_FOAM_INTENSITY },
      uFoamColor: { value: HYDROLOGY_RIVER_FOAM_COLOR.clone() },
      uRiverNormalMap: { value: this.waterNormalTexture ?? null },
      uRiverNormalScale: { value: HYDROLOGY_RIVER_NORMAL_SCALE },
    };
    this.hydrologyRiverShaderRefs = refs;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = refs.uTime;
      shader.uniforms.uFlowSpeed = refs.uFlowSpeed;
      shader.uniforms.uFoamIntensity = refs.uFoamIntensity;
      shader.uniforms.uFoamColor = refs.uFoamColor;
      shader.uniforms.uRiverNormalMap = refs.uRiverNormalMap;
      shader.uniforms.uRiverNormalScale = refs.uRiverNormalScale;
      shader.uniforms.uNormalRepeatAlong = { value: HYDROLOGY_RIVER_NORMAL_REPEAT_ALONG_M };
      shader.uniforms.uNormalRepeatAcross = { value: HYDROLOGY_RIVER_NORMAL_REPEAT_ACROSS_M };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec2 aFlowDir;
attribute float aFoamMask;
varying vec2 vFlowDir;
varying float vFoamMask;
varying vec3 vRiverWorldPos;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vFlowDir = aFlowDir;
vFoamMask = aFoamMask;
vRiverWorldPos = worldPosition.xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform float uFlowSpeed;
uniform float uFoamIntensity;
uniform vec3 uFoamColor;
uniform sampler2D uRiverNormalMap;
uniform float uRiverNormalScale;
uniform float uNormalRepeatAlong;
uniform float uNormalRepeatAcross;
varying vec2 vFlowDir;
varying float vFoamMask;
varying vec3 vRiverWorldPos;`,
        )
        // Layer a flow-aligned normal sample on top of the standard normal
        // chunk. We rebuild the riverbed UV from world XZ projected onto
        // the flow basis (along/across) and scroll in the along axis at
        // `uFlowSpeed`. Falls through to the base normal if the flow
        // direction is degenerate (zero vector) so this is robust to any
        // builder regression.
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
{
  vec2 _flow = vFlowDir;
  float _flowLen = length(_flow);
  if (_flowLen > 0.001) {
    _flow /= _flowLen;
    vec2 _across = vec2(-_flow.y, _flow.x);
    vec2 _bedXZ = vRiverWorldPos.xz;
    float _along = dot(_bedXZ, _flow);
    float _lateral = dot(_bedXZ, _across);
    vec2 _bedUv = vec2(
      _lateral / max(uNormalRepeatAcross, 0.001),
      (_along - uTime * uFlowSpeed) / max(uNormalRepeatAlong, 0.001)
    );
    vec3 _flowN = texture2D(uRiverNormalMap, _bedUv).xyz * 2.0 - 1.0;
    _flowN.xy *= uRiverNormalScale;
    _flowN = normalize(_flowN);
    // Surface normal is +Y in world space (the river mesh is built that
    // way in buildHydrologyRiverGeometry). Blend toward the perturbed
    // normal in world space directly — no tangent frame needed since the
    // geometry has no tangents and the bed lies in the XZ plane.
    vec3 _bedWorldN = normalize(vec3(_flowN.x, 1.0, _flowN.y));
    normal = normalize(mix(normal, _bedWorldN, 0.55));
  }
}`,
        )
        // Foam cap. vFoamMask was packed at build time as the combined
        // narrowness + slope factor; modulate by a slow time-varying
        // jitter so the cap doesn't read as a static decal. Layered on
        // outgoingLight before <opaque_fragment> writes gl_FragColor
        // (same insertion-point convention as the global plane's
        // injectSurfaceShaderChunks and injectEdgeFoamChunks).
        .replace(
          '#include <opaque_fragment>',
          `{
  float _foamJitter = 0.7 + 0.3 * sin(uTime * 1.7 + vRiverWorldPos.x * 0.35 + vRiverWorldPos.z * 0.27);
  float _foam = clamp(vFoamMask, 0.0, 1.0) * _foamJitter * uFoamIntensity;
  outgoingLight = mix(outgoingLight, uFoamColor, _foam);
  diffuseColor.a = clamp(diffuseColor.a + _foam * 0.35, 0.0, 1.0);
}
#include <opaque_fragment>`,
        );
    };
    material.needsUpdate = true;
  }

  private buildHydrologyRiverGeometry(
    artifact: HydrologyBakeArtifact,
  ): {
    geometry: THREE.BufferGeometry;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const sortedChannels = [...artifact.channelPolylines]
      .sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.lengthMeters - a.lengthMeters)
      .slice(0, MAX_HYDROLOGY_RIVER_CHANNELS);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const flowDirs: number[] = [];
    const foamMasks: number[] = [];
    const indices: number[] = [];
    const querySegments: HydrologyWaterQuerySegment[] = [];
    let segmentCount = 0;
    let totalLengthMeters = 0;
    let maxAccumulationCells = 0;

    for (const channel of sortedChannels) {
      const points = channel.points;
      if (points.length < 2) continue;
      maxAccumulationCells = Math.max(maxAccumulationCells, channel.maxAccumulationCells);
      let channelDistanceMeters = 0;

      for (let index = 0; index < points.length - 1; index++) {
        if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
        const start = points[index];
        const end = points[index + 1];
        if (!start || !end) continue;

        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (length < HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS) continue;

        const accumulationCells = Math.max(start.accumulationCells, end.accumulationCells, channel.maxAccumulationCells);
        const width = this.resolveHydrologyRiverWidth(accumulationCells, artifact);
        const flowFactor = this.resolveHydrologyRiverAccumulationFactor(accumulationCells, artifact);
        const halfWidth = width * 0.5;
        const normalX = -dz / length;
        const normalZ = dx / length;
        const startY = start.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
        const endY = end.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
        const vertexBase = positions.length / 3;
        const uvStartV = channelDistanceMeters / Math.max(width, 1);
        channelDistanceMeters += length;
        const uvEndV = channelDistanceMeters / Math.max(width, 1);
        const bankColor = HYDROLOGY_RIVER_BANK_COLOR.clone()
          .lerp(HYDROLOGY_RIVER_SHALLOW_COLOR, 0.18 + flowFactor * 0.22);
        const centerColor = HYDROLOGY_RIVER_SHALLOW_COLOR.clone()
          .lerp(HYDROLOGY_RIVER_DEEP_COLOR, 0.48 + flowFactor * 0.38);

        positions.push(
          start.x + normalX * halfWidth, startY, start.z + normalZ * halfWidth,
          start.x, startY, start.z,
          start.x - normalX * halfWidth, startY, start.z - normalZ * halfWidth,
          end.x + normalX * halfWidth, endY, end.z + normalZ * halfWidth,
          end.x, endY, end.z,
          end.x - normalX * halfWidth, endY, end.z - normalZ * halfWidth,
        );
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        uvs.push(0, uvStartV, 0.5, uvStartV, 1, uvStartV, 0, uvEndV, 0.5, uvEndV, 1, uvEndV);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);

        // Flow direction (unit world-XZ) packed per vertex. All six vertices
        // of the segment share the same flow vector so the fragment shader
        // can rebuild the along/across basis without recomputing the
        // segment's derivative.
        const flowX = dx / length;
        const flowZ = dz / length;
        for (let v = 0; v < 6; v++) flowDirs.push(flowX, flowZ);

        // Foam mask: combine narrowness (low flowFactor = headwater) with
        // segment slope (rise over run). Both feed into the same per-vertex
        // [0..1] value; the fragment shader brightens the bank/center
        // colors where this is non-zero. Slope is signed because gravity
        // matters — uphill segments are an artifact of the polyline winding
        // and shouldn't foam; only downhill drops do.
        const narrownessFoam = clamp(
          (HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD - flowFactor) / HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD,
          0,
          1,
        );
        const slope = Math.max(0, startY - endY) / length;
        const slopeFoam = clamp(slope / HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M, 0, 1);
        const centerFoam = clamp(narrownessFoam * 0.55 + slopeFoam * 0.85, 0, 1);
        // Six verts per segment: bank, center, bank (start row) then again
        // for end row. Bank vertices get a small floor of foam so the cap
        // bleeds into the bank rather than producing a hard center stripe;
        // center vertices get the full mask.
        const bankFoam = centerFoam * 0.25;
        foamMasks.push(bankFoam, centerFoam, bankFoam, bankFoam, centerFoam, bankFoam);
        indices.push(
          vertexBase,
          vertexBase + 3,
          vertexBase + 1,
          vertexBase + 3,
          vertexBase + 4,
          vertexBase + 1,
          vertexBase + 1,
          vertexBase + 4,
          vertexBase + 2,
          vertexBase + 4,
          vertexBase + 5,
          vertexBase + 2,
        );

        segmentCount++;
        totalLengthMeters += length;
        querySegments.push({
          startX: start.x,
          startZ: start.z,
          endX: end.x,
          endZ: end.z,
          startSurfaceY: startY,
          endSurfaceY: endY,
          halfWidth,
        });
      }
      if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
    }

    if (segmentCount === 0) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    // Flow-visuals attributes consumed by `installHydrologyRiverFlowPatch`.
    // Per-vertex world-XZ flow direction + foam mask packed at build time so
    // the GPU does not recompute the segment derivative each frame.
    geometry.setAttribute('aFlowDir', new THREE.Float32BufferAttribute(flowDirs, 2));
    geometry.setAttribute('aFoamMask', new THREE.Float32BufferAttribute(foamMasks, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return {
      geometry,
      querySegments,
      stats: {
        channelCount: sortedChannels.filter(channel => channel.points.length >= 2).length,
        segmentCount,
        vertexCount: positions.length / 3,
        totalLengthMeters,
        maxAccumulationCells,
      },
    };
  }

  private resolveHydrologyRiverWidth(accumulationCells: number, artifact: HydrologyBakeArtifact): number {
    const cellSize = artifact.cellSizeMeters;
    const minWidth = clamp(cellSize * 0.045, 2, 4);
    const maxWidth = clamp(cellSize * 0.12, 5, 10);
    const t = this.resolveHydrologyRiverAccumulationFactor(accumulationCells, artifact);
    return minWidth + (maxWidth - minWidth) * t;
  }

  private resolveHydrologyRiverAccumulationFactor(
    accumulationCells: number,
    artifact: HydrologyBakeArtifact,
  ): number {
    const p98 = Math.max(1, artifact.thresholds.accumulationP98Cells);
    const p99 = Math.max(p98 + 1, artifact.thresholds.accumulationP99Cells);
    return clamp(
      (Math.log1p(Math.max(0, accumulationCells)) - Math.log1p(p98))
      / Math.max(0.001, Math.log1p(p99) - Math.log1p(p98)),
      0,
      1,
    );
  }

  private getHydrologyWaterSurfaceY(x: number, z: number): number | null {
    let nearest: { distanceSq: number; surfaceY: number } | null = null;
    for (const segment of this.hydrologyWaterQuerySegments) {
      const dx = segment.endX - segment.startX;
      const dz = segment.endZ - segment.startZ;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq <= 0) continue;
      const t = clamp(((x - segment.startX) * dx + (z - segment.startZ) * dz) / lengthSq, 0, 1);
      const sampleX = segment.startX + dx * t;
      const sampleZ = segment.startZ + dz * t;
      const distanceSq = (x - sampleX) ** 2 + (z - sampleZ) ** 2;
      if (distanceSq > segment.halfWidth ** 2) continue;
      const surfaceY = segment.startSurfaceY + (segment.endSurfaceY - segment.startSurfaceY) * t;
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { distanceSq, surfaceY };
      }
    }
    return nearest?.surfaceY ?? null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushHydrologyRiverColor(colors: number[], color: THREE.Color, alpha: number): void {
  colors.push(color.r, color.g, color.b, alpha);
}
