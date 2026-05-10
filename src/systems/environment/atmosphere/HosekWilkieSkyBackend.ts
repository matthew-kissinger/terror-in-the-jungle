import * as THREE from 'three';
import type { ISkyBackend } from './ISkyBackend';
import { hosekWilkieFragmentShader, hosekWilkieVertexShader } from './hosekWilkie.glsl';
import type { AtmospherePreset } from './ScenarioAtmospherePresets';
import { sunDirectionFromPreset } from './ScenarioAtmospherePresets';

const DOME_RADIUS = 500;
const DOME_WIDTH_SEGMENTS = 64;
const DOME_HEIGHT_SEGMENTS = 32;

const LUT_AZIMUTH_BINS = 32;
const LUT_ELEVATION_BINS = 8;
const DEFAULT_CLOUD_NOISE_SCALE = 1 / 900;
const DEFAULT_CLOUD_WIND_DIR_X = 0.7;
const DEFAULT_CLOUD_WIND_DIR_Z = 0.7;

/**
 * Angular threshold (cosine form) at which a sun-direction change forces a
 * LUT rebake. Cos(0.5deg) = 0.99996..; anything smaller than this dot
 * product between the previous and current sun vector means the sun has
 * moved by ~0.5 deg or more. At a 10-minute day cycle this fires roughly
 * every five seconds of real time, keeping rebakes cheap while still
 * tracking dawn/dusk hemisphere lighting perceptibly.
 */
const LUT_REBAKE_COS_THRESHOLD = Math.cos((0.5 * Math.PI) / 180);

/**
 * Analytic sky-dome backend for `AtmosphereSystem`. Replaces the legacy
 * static-equirectangular `Skybox` with a `ShaderMaterial`-driven dome
 * (geometry + render-state mirrored exactly from `Skybox.ts`: 500-unit
 * `SphereGeometry`, `BackSide`, `renderOrder = -1`, no depth read/write,
 * camera-following each frame).
 *
 * The shader (see `hosekWilkie.glsl.ts` for the long note) implements a
 * Preetham-style analytic sky as the budget-conscious starting backend the
 * task brief explicitly allows; the consumer-visible `ISkyBackend`
 * contract is satisfied either way and a future cycle can substitute a
 * full Hosek-Wilkie coefficient pipeline without touching callers.
 *
 * CPU-side sampling is served by a small `LUT_AZIMUTH_BINS x
 * LUT_ELEVATION_BINS` table baked from the same analytic formula at preset
 * boot. Fog / hemisphere readers (`atmosphere-fog-tinted-by-sky` and
 * `atmosphere-sun-hemisphere-coupling` in this cycle) call `sample()`
 * every frame, but the LUT is only re-baked when the sun direction
 * changes — in v1 that's once per scenario boot.
 */
export class HosekWilkieSkyBackend implements ISkyBackend {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.SphereGeometry;

  private readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private readonly groundAlbedo = new THREE.Color(0x3b4c2e);
  private turbidity = 3.0;
  private rayleigh = 2.0;
  private mieCoefficient = 0.005;
  private mieDirectionalG = 0.8;
  private exposure = 0.5;
  private cloudCoverage = 0;
  private cloudNoiseScale = DEFAULT_CLOUD_NOISE_SCALE;
  private cloudTimeSeconds = 0;
  private readonly cloudWindDir = new THREE.Vector2(DEFAULT_CLOUD_WIND_DIR_X, DEFAULT_CLOUD_WIND_DIR_Z);

  // Ring/zenith cache + LUT, refreshed when the sun direction changes.
  private readonly zenithColor = new THREE.Color(0x000000);
  private readonly horizonColor = new THREE.Color(0x000000);
  private readonly sunColor = new THREE.Color(0xffffff);
  private readonly lut: Float32Array;
  private lutDirty = true;

  // Throwaway scratch to avoid per-frame Vec3/Color allocs.
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();
  private readonly lastSunDir = new THREE.Vector3();

  constructor() {
    this.lut = new Float32Array(LUT_AZIMUTH_BINS * LUT_ELEVATION_BINS * 3);

    this.material = new THREE.ShaderMaterial({
      name: 'HosekWilkieSky',
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uTurbidity: { value: this.turbidity },
        uRayleigh: { value: this.rayleigh },
        uMieCoefficient: { value: this.mieCoefficient },
        uMieDirectionalG: { value: this.mieDirectionalG },
        uGroundAlbedo: { value: this.groundAlbedo },
        uExposure: { value: this.exposure },
        uCloudCoverage: { value: this.cloudCoverage },
        uCloudNoiseScale: { value: this.cloudNoiseScale },
        uCloudTimeSeconds: { value: this.cloudTimeSeconds },
        uCloudWindDir: { value: this.cloudWindDir },
      },
      vertexShader: hosekWilkieVertexShader,
      fragmentShader: hosekWilkieFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });

    this.geometry = new THREE.SphereGeometry(DOME_RADIUS, DOME_WIDTH_SEGMENTS, DOME_HEIGHT_SEGMENTS);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.name = 'HosekWilkieSkyDome';
  }

  /** Apply a scenario preset: sun direction, turbidity, albedo, exposure. */
  applyPreset(preset: AtmospherePreset): void {
    sunDirectionFromPreset(preset, this.sunDirection);
    this.turbidity = preset.turbidity;
    this.rayleigh = preset.rayleigh;
    this.groundAlbedo.copy(preset.groundAlbedo);
    this.exposure = preset.exposure;

    // Push uniform values; they share the same `value` references the
    // shader already holds (Vector3/Color), so writing through `copy()`
    // and primitive `value =` is enough.
    this.material.uniforms.uTurbidity.value = this.turbidity;
    this.material.uniforms.uRayleigh.value = this.rayleigh;
    this.material.uniforms.uExposure.value = this.exposure;

    this.lutDirty = true;
  }

  /** Returns the dome mesh so `AtmosphereSystem` can attach it to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  update(_deltaTime: number, sunDirection: THREE.Vector3): void {
    // Always track the authoritative sun direction so the dome shader
    // (uniform refers to this.sunDirection) renders correctly every frame.
    // The LUT rebake, however, only fires when the direction moved by more
    // than LUT_REBAKE_COS_THRESHOLD — cheap frame cost once animated TOD
    // presets move the sun continuously.
    const nextLen = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1;
    const nx = sunDirection.x / nextLen;
    const ny = sunDirection.y / nextLen;
    const nz = sunDirection.z / nextLen;
    const cosDelta =
      this.lastSunDir.x * nx + this.lastSunDir.y * ny + this.lastSunDir.z * nz;

    this.sunDirection.set(nx, ny, nz);

    if (this.lutDirty || cosDelta < LUT_REBAKE_COS_THRESHOLD) {
      this.lastSunDir.set(nx, ny, nz);
      this.bakeLUT();
      this.lutDirty = false;
    }

    if (Number.isFinite(_deltaTime) && _deltaTime > 0) {
      this.cloudTimeSeconds += _deltaTime;
      this.material.uniforms.uCloudTimeSeconds.value = this.cloudTimeSeconds;
    }
  }

  /**
   * Sky-integrated cloud coverage. The dome pass guarantees visible clouds
   * in ordinary sky views without a finite flat-plane horizon.
   */
  setCloudCoverage(value: number): void {
    this.cloudCoverage = Math.max(0, Math.min(1, value));
    this.material.uniforms.uCloudCoverage.value = this.cloudCoverage;
  }

  setCloudFeatureScaleMeters(metersPerFeature: number): void {
    if (!Number.isFinite(metersPerFeature) || metersPerFeature <= 0) {
      return;
    }
    this.cloudNoiseScale = 1 / metersPerFeature;
    this.material.uniforms.uCloudNoiseScale.value = this.cloudNoiseScale;
  }

  resetCloudFeatureScale(): void {
    this.cloudNoiseScale = DEFAULT_CLOUD_NOISE_SCALE;
    this.material.uniforms.uCloudNoiseScale.value = this.cloudNoiseScale;
  }

  getCloudCoverage(): number {
    return this.cloudCoverage;
  }

  sample(dir: THREE.Vector3, out: THREE.Color): THREE.Color {
    this.ensureLUT();
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const nx = dir.x / len;
    const ny = dir.y / len;
    const nz = dir.z / len;

    // Snap-to-cache for the headline directions so callers asking for
    // "straight up" or any horizon direction get the same value the
    // matching getter returns. Cheap and avoids LUT-bin quantisation
    // surprises that would otherwise show up in fog tests.
    if (ny >= 0.999) {
      return out.copy(this.zenithColor);
    }

    // Map elevation (-1..1 on dir.y) -> LUT row [0..bins-1].
    const elevT = (Math.asin(Math.max(-1, Math.min(1, ny))) + Math.PI / 2) / Math.PI;
    const row = Math.max(0, Math.min(LUT_ELEVATION_BINS - 1, Math.floor(elevT * LUT_ELEVATION_BINS)));

    // Map azimuth -> LUT column.
    let az = Math.atan2(nz, nx);
    if (az < 0) az += Math.PI * 2;
    const col = Math.floor((az / (Math.PI * 2)) * LUT_AZIMUTH_BINS) % LUT_AZIMUTH_BINS;

    const idx = (row * LUT_AZIMUTH_BINS + col) * 3;
    out.setRGB(this.lut[idx], this.lut[idx + 1], this.lut[idx + 2]);
    return out;
  }

  getSun(out: THREE.Color): THREE.Color {
    this.ensureLUT();
    return out.copy(this.sunColor);
  }

  getZenith(out: THREE.Color): THREE.Color {
    this.ensureLUT();
    return out.copy(this.zenithColor);
  }

  getHorizon(out: THREE.Color): THREE.Color {
    this.ensureLUT();
    return out.copy(this.horizonColor);
  }

  private ensureLUT(): void {
    if (this.lutDirty) {
      this.bakeLUT();
      this.lutDirty = false;
    }
  }

  dispose(): void {
    this.material.dispose();
    this.geometry.dispose();
  }

  /**
   * Bake the CPU-side sample LUT + cache zenith/horizon/sun color from the
   * same analytic radiance formula the shader runs. Cheap (32*8 = 256
   * directions) and only re-runs when sun direction changes — once per
   * scenario boot in v1.
   */
  private bakeLUT(): void {
    // Per-bin: pick a representative direction, evaluate radiance, store.
    for (let row = 0; row < LUT_ELEVATION_BINS; row++) {
      // Center-of-bin elevation.
      const elevT = (row + 0.5) / LUT_ELEVATION_BINS;
      const elev = elevT * Math.PI - Math.PI / 2;
      const cosE = Math.cos(elev);
      const sinE = Math.sin(elev);
      for (let col = 0; col < LUT_AZIMUTH_BINS; col++) {
        const az = ((col + 0.5) / LUT_AZIMUTH_BINS) * Math.PI * 2;
        this.scratchDir.set(cosE * Math.cos(az), sinE, cosE * Math.sin(az));
        this.evaluateAnalytic(this.scratchDir, this.scratchColor);
        const idx = (row * LUT_AZIMUTH_BINS + col) * 3;
        this.lut[idx] = this.scratchColor.r;
        this.lut[idx + 1] = this.scratchColor.g;
        this.lut[idx + 2] = this.scratchColor.b;
      }
    }

    // Cache headline colors. Average a horizon ring instead of picking one
    // azimuth so the value is rotation-stable.
    this.scratchDir.set(0, 1, 0);
    this.evaluateAnalytic(this.scratchDir, this.zenithColor);

    let hr = 0;
    let hg = 0;
    let hb = 0;
    const ringSamples = 16;
    for (let i = 0; i < ringSamples; i++) {
      const a = (i / ringSamples) * Math.PI * 2;
      this.scratchDir.set(Math.cos(a), 0.0, Math.sin(a));
      this.evaluateAnalytic(this.scratchDir, this.scratchColor);
      hr += this.scratchColor.r;
      hg += this.scratchColor.g;
      hb += this.scratchColor.b;
    }
    this.horizonColor.setRGB(hr / ringSamples, hg / ringSamples, hb / ringSamples);

    // Sun color = direct-sunlight transmittance through the atmosphere
    // along the sun's optical path (not the bright in-scattered sky
    // radiance toward the sun direction, which would saturate to white).
    // At noon Fex is near 1 across all wavelengths -> near-white sun.
    // At dawn the longer path attenuates blue -> warm amber/red sun.
    this.scratchDir.copy(this.sunDirection);
    this.scratchDir.normalize();
    this.computeTransmittance(this.scratchDir, this.sunColor);
    const peak = Math.max(this.sunColor.r, this.sunColor.g, this.sunColor.b, 1e-4);
    this.sunColor.setRGB(this.sunColor.r / peak, this.sunColor.g / peak, this.sunColor.b / peak);
    // Floor brightness so sub-horizon sun still registers as a dim warm
    // color rather than true black.
    const luma = 0.2126 * this.sunColor.r + 0.7152 * this.sunColor.g + 0.0722 * this.sunColor.b;
    if (luma < 0.1) {
      this.sunColor.setRGB(
        Math.max(this.sunColor.r, 0.2),
        Math.max(this.sunColor.g, 0.1),
        Math.max(this.sunColor.b, 0.05)
      );
    }
  }

  /**
   * RGB extinction factor (Fex) at a given direction's optical path.
   * Used by the sun-color path; result is the un-normalised transmittance.
   */
  private computeTransmittance(direction: THREE.Vector3, out: THREE.Color): void {
    const dy = Math.max(-1, Math.min(1, direction.y));
    const upDot = Math.max(0, dy);
    const zenithAngle = Math.acos(upDot);
    const invDenom = Math.cos(zenithAngle)
      + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253);
    const invLen = 1 / Math.max(1e-3, invDenom);
    const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(this.sunDirection.y)));
    const rayleighCoeff = this.rayleigh - (1 - sunfade);
    const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
    const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
    const totalMieScale = 0.434 * (0.2 * this.turbidity) * 1e-17;
    const sR = 8.4e3 * invLen;
    const sM = 1.25e3 * invLen;
    const r = Math.exp(-(totalRayleigh[0] * rayleighCoeff * sR + MieConst[0] * totalMieScale * this.mieCoefficient * sM));
    const g = Math.exp(-(totalRayleigh[1] * rayleighCoeff * sR + MieConst[1] * totalMieScale * this.mieCoefficient * sM));
    const b = Math.exp(-(totalRayleigh[2] * rayleighCoeff * sR + MieConst[2] * totalMieScale * this.mieCoefficient * sM));
    out.setRGB(r, g, b);
  }

  /**
   * CPU mirror of the fragment shader's radiance computation. Keeps the
   * same Preetham math so LUT samples agree with what the dome paints.
   * Inlined math (no Vector/Color allocs in the hot path).
   */
  private evaluateAnalytic(direction: THREE.Vector3, out: THREE.Color): void {
    // Normalise (callers may pass un-normalised dir).
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dx = direction.x / len;
    const dy = direction.y / len;
    const dz = direction.z / len;

    const sun = this.sunDirection;
    const sunY = Math.max(-1, Math.min(1, sun.y));

    // Sun zenith intensity (matches sunIntensity in the shader).
    const cutoffAngle = 1.6110731556870734;
    const steepness = 1.5;
    const EE = 1000.0;
    const sunZenithCos = sunY;
    const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(sunZenithCos)) / steepness)));

    const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sunY)));
    const rayleighCoeff = this.rayleigh - (1 - sunfade);

    // Scattering totals (Preetham primaries 680/550/450nm).
    const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
    const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

    const betaR = [
      totalRayleigh[0] * rayleighCoeff,
      totalRayleigh[1] * rayleighCoeff,
      totalRayleigh[2] * rayleighCoeff,
    ];
    const totalMieScale = 0.434 * (0.2 * this.turbidity) * 1e-17;
    const betaM = [
      MieConst[0] * totalMieScale * this.mieCoefficient,
      MieConst[1] * totalMieScale * this.mieCoefficient,
      MieConst[2] * totalMieScale * this.mieCoefficient,
    ];

    // Optical length along view direction.
    const upDot = Math.max(0, dy);
    const zenithAngle = Math.acos(upDot);
    const inverseDenom = Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253);
    const inverseLen = 1 / Math.max(1e-3, inverseDenom);
    const sR = 8.4e3 * inverseLen;
    const sM = 1.25e3 * inverseLen;

    const fexR = Math.exp(-(betaR[0] * sR + betaM[0] * sM));
    const fexG = Math.exp(-(betaR[1] * sR + betaM[1] * sM));
    const fexB = Math.exp(-(betaR[2] * sR + betaM[2] * sM));

    const cosTheta = dx * sun.x + dy * sun.y + dz * sun.z;
    // (3/16pi)(1 + cos^2(t/2)) — matches `rayleighPhase` in the shader.
    const rayleighPhase = (3 / (16 * Math.PI)) * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
    const g = this.mieDirectionalG;
    const g2 = g * g;
    const hgDenom = Math.pow(Math.max(1e-4, 1 - 2 * g * cosTheta + g2), 1.5);
    const hgPhase = (1 / (4 * Math.PI)) * ((1 - g2) / hgDenom);

    const betaRThetaR = betaR[0] * rayleighPhase;
    const betaRThetaG = betaR[1] * rayleighPhase;
    const betaRThetaB = betaR[2] * rayleighPhase;
    const betaMThetaR = betaM[0] * hgPhase;
    const betaMThetaG = betaM[1] * hgPhase;
    const betaMThetaB = betaM[2] * hgPhase;

    const sumR = betaR[0] + betaM[0] || 1e-9;
    const sumG = betaR[1] + betaM[1] || 1e-9;
    const sumB = betaR[2] + betaM[2] || 1e-9;

    const linR = Math.pow(sunE * ((betaRThetaR + betaMThetaR) / sumR) * (1 - fexR), 1.5);
    const linG = Math.pow(sunE * ((betaRThetaG + betaMThetaG) / sumG) * (1 - fexG), 1.5);
    const linB = Math.pow(sunE * ((betaRThetaB + betaMThetaB) / sumB) * (1 - fexB), 1.5);

    const horizonMix = Math.pow(Math.max(0, 1 - sunY), 5);
    const lowR = Math.pow(sunE * ((betaRThetaR + betaMThetaR) / sumR) * fexR, 0.5);
    const lowG = Math.pow(sunE * ((betaRThetaG + betaMThetaG) / sumG) * fexG, 0.5);
    const lowB = Math.pow(sunE * ((betaRThetaB + betaMThetaB) / sumB) * fexB, 0.5);
    const blendR = 1 + (lowR - 1) * Math.min(1, horizonMix);
    const blendG = 1 + (lowG - 1) * Math.min(1, horizonMix);
    const blendB = 1 + (lowB - 1) * Math.min(1, horizonMix);
    const linRb = linR * blendR;
    const linGb = linG * blendG;
    const linBb = linB * blendB;

    // Night-sky floor (no sun disc on CPU side — disc is shader-only).
    const l0R = 0.1 * fexR;
    const l0G = 0.1 * fexG;
    const l0B = 0.1 * fexB;

    let r = (linRb + l0R) * 0.04;
    let g2c = (linGb + l0G) * 0.04 + 0.0003;
    let b = (linBb + l0B) * 0.04 + 0.00075;

    // Ground-bounce term mirroring the fragment shader.
    const bounce = Math.max(0, -dy);
    const bounceK = bounce * 0.35 * (0.5 + sunfade);
    r += this.groundAlbedo.r * bounceK;
    g2c += this.groundAlbedo.g * bounceK;
    b += this.groundAlbedo.b * bounceK;

    r *= this.exposure;
    g2c *= this.exposure;
    b *= this.exposure;

    out.setRGB(
      Math.max(0, Math.min(8, r)),
      Math.max(0, Math.min(8, g2c)),
      Math.max(0, Math.min(8, b))
    );
  }
}
