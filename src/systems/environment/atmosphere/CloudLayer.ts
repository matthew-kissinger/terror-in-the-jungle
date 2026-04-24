import * as THREE from 'three';

/**
 * High-altitude cloud band rendered as a single horizontal plane with a
 * procedural fragment shader. Built for ground-troop and aircraft viewing
 * angles: fbm noise thresholded by a coverage uniform, lit by a sun
 * direction fed each frame from `AtmosphereSystem.getSunDirection()`.
 *
 * Why a plane:
 * - Billboards break under fly-through and can't span the map.
 * - Sky-shader integration has no parallax, so clouds wouldn't drift
 *   overhead as the player walks.
 * - Volumetric raymarch is out of budget for v1.
 *
 * The plane sits at a fixed altitude above local terrain (`BASE_ALTITUDE`)
 * and follows the camera on XZ so the player never runs out from under
 * the cloud cover. UVs are sampled in world space so the noise field
 * stays anchored to the world: walking sideways makes clouds drift
 * overhead as expected.
 *
 * Flight envelope safety: `BASE_ALTITUDE` is set well above the highest
 * NPC aircraft cruise altitude (see `cloud-runtime-implementation` brief
 * for the recon). When the camera approaches the plane's altitude, the
 * layer alpha-fades out so the paper-thin edge-on view does not look
 * broken. Above the fade range the layer is visible again (viewed from
 * the top).
 *
 * Current limitation: this is still a planar approximation, so it cannot
 * replace a true sky-volume/cloud-dome implementation. The footprint and
 * horizon fade are intentionally generous to avoid a one-tile cloud cap or
 * a hard flat divider while Cycle 9 evaluates the sky-integrated version.
 */

/** Meters above local terrain where the cloud plane sits. */
const BASE_ALTITUDE = 1200;
/** Plane footprint. Large enough that aircraft/ground views do not expose a hard local tile edge. */
const PLANE_SIZE = 36000;
/** Half-width of the altitude band over which the layer fades out. */
const EDGE_FADE_HALF_WIDTH = 100;
/**
 * Default world-space scale for the noise field. Smaller = larger cloud features.
 * 1/900 ≈ 900m per cumulus puff at the first fbm octave. Presets may override
 * via `cloudScaleMetersPerFeature` so scenarios can carry a larger (fair-weather
 * cumulus) or tighter (dense overcast) signature.
 */
const DEFAULT_NOISE_SCALE = 1 / 900;
/**
 * Default wind direction (XZ) for the cloud-field drift. Shader normalizes;
 * speed is baked into the fragment at 10 m/s. Exposed as a uniform so
 * future wind systems can override.
 */
const DEFAULT_WIND_DIR_X = 0.7;
const DEFAULT_WIND_DIR_Z = 0.7;

const cloudVertexShader = /* glsl */`
varying vec2 vWorldXZ;
varying vec2 vPlaneUv;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldXZ = worldPos.xz;
  vPlaneUv = uv;
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Procedural fbm using value noise. Fragment cost is dominated by the fbm
// octave count: this is one transparent plane drawn once, not a volumetric
// march, so we can afford 5 octaves for richer structure. The coverage
// uniform thresholds the field so low coverage reveals the sky through
// the gaps; a large-scale modulator gates whole *regions* so low coverage
// reads as scattered cumuli rather than uniform thin noise. Sun direction
// lights the "puff" by biasing brightness toward where the field rises
// (a cheap stand-in for a real cloud normal).
const cloudFragmentShader = /* glsl */`
varying vec2 vWorldXZ;
varying vec2 vPlaneUv;
varying vec3 vWorldPos;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uCoverage;         // [0,1]
uniform float uEdgeFade;         // [0,1], 1 = fully visible
uniform float uNoiseScale;       // world -> noise coord scale
uniform float uTimeSeconds;      // simulation seconds since layer start
uniform vec2 uWindDir;           // normalized XZ drift direction

// Hash / value noise. Deterministic, cheap, seam-free enough for a
// transparent cloud layer.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 5-octave fbm. Peak absolute value ~0.5*(1-0.5^5)/(1-0.5) ≈ 0.97; mean
// stays near 0.5 because the constituent valueNoise samples are in [0,1].
// Lacunarity 2.03 avoids axis-aligned ghosting at larger scales.
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * valueNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

void main() {
  // World-space wind offset drifts the cloud field over time. Wind speed
  // is baked in (10 m/s) — reads as "visible motion over 60s, not
  // per-frame jitter". Wind direction is unit-ish; re-normalize here so
  // fractional (0.7, 0.7) inputs compose cleanly.
  vec2 wind = length(uWindDir) > 0.0001 ? normalize(uWindDir) : vec2(0.0);
  vec2 windOffset = wind * uTimeSeconds * 10.0;
  vec2 uv = (vWorldXZ + windOffset) * uNoiseScale;

  // Large-scale modulator: sample fbm at ~5x the cloud wavelength to pick
  // out cumulus *fields* (clustered puffs with gaps between them). Smoothed
  // into a soft [0.5, 1.0] band — a gap region still contributes half its
  // cloud coverage, so regions never read as a perfectly clear hole. This
  // keeps low-coverage scenarios from losing their visible puffs entirely
  // while still giving the cloud field a visible large-scale clustering
  // signature.
  vec2 bigUv = uv * 0.2;
  float bigField = 0.5 + 0.5 * smoothstep(0.20, 0.70, fbm(bigUv));

  float base = fbm(uv);

  // Coverage threshold; cov=0 hides all clouds, cov=1 fills the sky.
  // lowerEdge stretches the responsive range so low coverage still yields
  // sparse-but-visible clouds (mix(1.0, -0.4, ...) was -0.2 previously,
  // which left openfrontier-coverage=0.1 essentially empty). upperEdge
  // sits 0.35 above lowerEdge for a wider wispy feather band.
  float lowerEdge = mix(1.0, -0.4, clamp(uCoverage, 0.0, 1.0));
  float upperEdge = lowerEdge + 0.35;
  float mask = smoothstep(lowerEdge, upperEdge, base);
  // Modulate by the large-scale field so low coverage reads as cumulus
  // patches rather than uniform thin noise over the whole sky, but never
  // drop below 50% so a whole region never turns perfectly clear.
  mask *= bigField;

  if (mask <= 0.001) {
    discard;
  }

  // Cheap lit-cumulus shading. Use the local gradient of the noise field
  // as a pseudo-normal and dot it with the sun direction projected onto
  // the plane. Puffs that face the sun brighten; shadowed sides darken.
  float e = 1.0;
  float nx = fbm(uv + vec2(e, 0.0)) - fbm(uv - vec2(e, 0.0));
  float nz = fbm(uv + vec2(0.0, e)) - fbm(uv - vec2(0.0, e));
  vec3 puffNormal = normalize(vec3(-nx, 0.5, -nz));
  float sunLight = max(0.0, dot(puffNormal, normalize(uSunDirection)));
  // Bias so shadowed areas read as gray (ambient sky bounce) rather than
  // pure black.
  float shade = mix(0.55, 1.15, sunLight);

  vec3 baseColor = vec3(0.95, 0.95, 0.98);
  vec3 color = baseColor * mix(uSunColor, vec3(1.0), 0.5) * shade;

  // Alpha ramp: more dense in thick cores, translucent at edges so the
  // sun disc still glows through light cloud. Coverage uniform also
  // biases peak alpha up as coverage approaches 1 (overcast).
  float alpha = mask * mix(0.55, 0.95, clamp(uCoverage, 0.0, 1.0));
  // Hide the finite plane footprint. The layer still uses a simple mesh,
  // but its boundary should feather away before it reads as one hard tile.
  float edgeDist = min(min(vPlaneUv.x, 1.0 - vPlaneUv.x), min(vPlaneUv.y, 1.0 - vPlaneUv.y));
  float footprintFade = smoothstep(0.0, 0.035, edgeDist);
  // A horizontal plane reads as a hard ceiling at very shallow view angles.
  // Fade those grazing rays so ground-level horizon views see atmospheric
  // haze instead of a visible local cloud tile boundary.
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  float horizonFade = smoothstep(0.01, 0.08, abs(viewDir.y));
  alpha *= uEdgeFade * footprintFade * horizonFade;

  if (alpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Manages the cloud plane mesh + material. Instantiated by
 * `AtmosphereSystem`; owns its own uniforms but reads sun direction,
 * sun color, and (optionally) terrain height via per-frame `update` calls.
 */
export class CloudLayer {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.PlaneGeometry;

  private readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private readonly sunColor = new THREE.Color(1, 1, 1);
  private readonly windDir = new THREE.Vector2(DEFAULT_WIND_DIR_X, DEFAULT_WIND_DIR_Z);
  private coverage = 0;
  private edgeFade = 1;
  private elapsedSeconds = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      name: 'CloudLayer',
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uSunColor: { value: this.sunColor },
        uCoverage: { value: 0 },
        uEdgeFade: { value: 1 },
        uNoiseScale: { value: DEFAULT_NOISE_SCALE },
        uTimeSeconds: { value: 0 },
        uWindDir: { value: this.windDir },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });

    this.geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
    // Plane is authored XY; rotate so its normal points up in world space.
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -2; // behind sky dome (which is -1)
    this.mesh.frustumCulled = false;
    this.mesh.name = 'CloudLayer';
    this.mesh.visible = false; // hidden until coverage > 0
  }

  /** Mesh the `AtmosphereSystem` adds to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /** Cloud base altitude in meters above local terrain. Read-only constant. */
  getBaseAltitude(): number {
    return BASE_ALTITUDE;
  }

  /**
   * Update the cloud plane for this frame.
   *
   * - Positions the mesh at `(cameraXZ, terrainY + BASE_ALTITUDE)` so the
   *   layer is always above the player without recomputing world geometry.
   * - Copies the authoritative sun direction / color into the uniforms
   *   (they come from `AtmosphereSystem.getSunDirection/getSunColor` each
   *   frame so the day-night cycle tracks live).
   * - Computes the edge-on alpha fade based on altitude delta between
   *   camera and plane.
   * - Accumulates `deltaSeconds` into `uTimeSeconds` so the fragment
   *   shader drifts the cloud field with simulated wind.
   */
  update(
    cameraPosition: THREE.Vector3,
    terrainYAtCamera: number,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
    deltaSeconds = 0
  ): void {
    const planeY = terrainYAtCamera + BASE_ALTITUDE;
    this.mesh.position.set(cameraPosition.x, planeY, cameraPosition.z);

    this.sunDirection.copy(sunDirection);
    const len = this.sunDirection.length();
    if (len > 1e-6) {
      this.sunDirection.multiplyScalar(1 / len);
    } else {
      this.sunDirection.set(0, 1, 0);
    }
    this.sunColor.copy(sunColor);

    const dy = Math.abs(cameraPosition.y - planeY);
    // 1 outside the fade zone, ramps to 0 as the camera approaches the
    // plane. smoothstep(hi, lo, dy) gives 1 when dy >= hi and 0 when
    // dy <= lo. We want the opposite — faded near the plane — so invert.
    this.edgeFade = smoothstep01(dy / EDGE_FADE_HALF_WIDTH);
    this.material.uniforms.uCoverage.value = this.coverage;
    this.material.uniforms.uEdgeFade.value = this.edgeFade;

    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.elapsedSeconds += deltaSeconds;
      this.material.uniforms.uTimeSeconds.value = this.elapsedSeconds;
    }

    this.mesh.visible = this.coverage > 0.001 && this.edgeFade > 0.001;
  }

  /** Coverage in [0, 1]; clamped. */
  setCoverage(v: number): void {
    this.coverage = Math.max(0, Math.min(1, v));
    this.material.uniforms.uCoverage.value = this.coverage;
  }

  getCoverage(): number {
    return this.coverage;
  }

  /**
   * Override the per-feature noise scale. Input is meters per first-octave
   * feature — 900 by default, larger = bigger, fewer puffs (fair-weather
   * cumulus), smaller = denser, tighter puffs (overcast texture). Ignored
   * if the input is non-finite or non-positive.
   */
  setFeatureScaleMeters(metersPerFeature: number): void {
    if (!Number.isFinite(metersPerFeature) || metersPerFeature <= 0) {
      return;
    }
    this.material.uniforms.uNoiseScale.value = 1 / metersPerFeature;
  }

  resetFeatureScale(): void {
    this.material.uniforms.uNoiseScale.value = DEFAULT_NOISE_SCALE;
  }

  /** Test hook: observable edge-fade factor for this frame. */
  getEdgeFade(): number {
    return this.edgeFade;
  }

  dispose(): void {
    this.material.dispose();
    this.geometry.dispose();
  }
}

/**
 * smoothstep(0, 1, x) clamped. Used for the edge-on fade where x is
 * `dy / EDGE_FADE_HALF_WIDTH` — far from the plane we return 1, near it
 * we return 0.
 */
function smoothstep01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}
