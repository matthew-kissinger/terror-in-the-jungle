// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  clamp,
  float,
  length,
  max,
  mix,
  reference,
  smoothstep,
  sqrt,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import {
  isSunDiscV2Enabled,
} from './SunDiscConfig';
import {
  SUN_DISC_HALO_OUTER_R,
  SUN_DISC_HALO_STRENGTH,
  SUN_DISC_LIMB_U,
  limbDarkening,
  scatterHalo,
} from './SunDiscOptics';

/**
 * HDR sun-disc overlay rendered per-fragment.
 *
 * SDS-derived sun ownership: this mesh renders only the readable hot
 * body. The sky dome owns broad atmospheric glow and horizon scatter.
 * Keeping those responsibilities separate prevents a second hard sun in
 * the dome and stops the visible body from becoming a flat grey lobe.
 *
 * Composition (TSL `colorNode`):
 *   - `r = 2 * length(uv - 0.5)` — 0 at quad center, ~1.41 at the corner.
 *   - Warm body: soft-edged amber mass with plasma breakup.
 *   - Hot core: broad white-hot center.
 *   - Final color = additive amber body + white-hot core.
 *
 * `sunColor` here is pre-multiplied by the elevation-keyed HDR peak in
 * `update()` so the shader stays linear. The backend `getSun` chromaticity is
 * already elevation-reddened (warm amber at dawn, near-white at noon — see
 * `HosekWilkieSkyBackend.computeTransmittance`), so the disc simply consumes it
 * faithfully rather than inventing a second extinction authority.
 *
 * The plane stays anchored at
 * `cameraPos + sunDir * domeRadius * 0.99` (so it tracks the sky
 * direction), and depth testing lets hills/ridges occlude the body.
 *
 * Rebuild (`sun-disc-scorch-rebuild`, gated on {@link isSunDiscV2Enabled}):
 *   - Limb darkening: `I(r)=1-u(1-sqrt(1-r^2))` dims the body toward its limb
 *     like a real photosphere instead of a flat lobe (`SunDiscOptics`).
 *   - Forward-scatter halo: a small additive ring just outside the body edge
 *     (the dome owns the WIDE glow; this is the tight scatter only).
 *   - Terrain-horizon occlusion: `update()` accepts a per-frame opacity scalar
 *     (0..1) from a CPU horizon march (`SunDiscHorizonOcclusion`) so the body
 *     fades behind ridgelines instead of shining through them. `1` = clear sky.
 * With the flag OFF the body keeps the plain smoothstep edge, no halo, and full
 * opacity (legacy look) — the documented kill-switch.
 */

/** Visible plane size in world units against a 500-unit dome. */
const DEFAULT_DISC_SIZE = 129;
/** Just inside the dome so the additive blend reads on top of the painted sky. */
const DOME_INSET = 0.99;
/** Peak linear-radiance multiplier at noon. */
const HDR_PEAK_MULTIPLIER = 5.2;
/** Floor so a near-horizon sun still reads as a warm disc. */
const HDR_FLOOR_MULTIPLIER = 1.45;
const BODY_RADIUS = 0.285;
const BODY_FEATHER = 0.38;
const HOT_CORE_RADIUS = BODY_RADIUS * 0.86;
const HOT_CORE_FEATHER = BODY_RADIUS * 1.04;
const FALLBACK_TEXTURE_SIZE = 128;

/**
 * Rebuild optics metadata (`sun-disc-scorch-rebuild`) attached to both material
 * userData so a parity test can assert the TSL and GLSL paths share the same
 * limb/halo constants from {@link SunDiscOptics}.
 */
const SUN_DISC_OPTICS_METADATA = {
  limbCoefficient: SUN_DISC_LIMB_U,
  haloOuterRadius: SUN_DISC_HALO_OUTER_R,
  haloStrength: SUN_DISC_HALO_STRENGTH,
  extinctionAuthority: 'backend-getSun',
  occlusion: 'cpu-terrain-horizon-march',
} as const;

/**
 * Band-limit for the plasma/filament/granule surface texture.
 *
 * The original terms stacked sine coefficients up to ~×317 over the
 * unit-ish disc UV, whose interference aliased into a visible "LED-dot
 * lattice" at render resolution (2026-06-28 owner playtest). Every sine
 * coefficient in all three implementations (TSL / GLSL / CPU mirror) is
 * now drawn from {@link SUN_DISC_SINE_FREQ} and is held at or below this
 * cap so the disc reads as a warm solar BODY with low-frequency surface
 * mottling rather than a screen of dots.
 *
 * Lowering this further flattens the disc toward a plain circle; raising
 * it back toward the old values reintroduces the lattice.
 */
export const SUN_DISC_MAX_SINE_FREQUENCY = 48;

/**
 * Shared, band-limited sine coefficients for the three surface-texture
 * terms. Coordinates are the centered disc UV (`uv - 0.5`, roughly
 * −0.5..0.5 across the visible body). Exported so the TSL, GLSL, and CPU
 * mirrors stay provably in sync and a test can assert the band-limit.
 *
 * Each term is `sin(ax + by [+ phase]) * sin(cx + dy [+ phase])`; the
 * coefficients are deliberately incommensurate (non-harmonic) so the
 * product reads as organic mottling, not a regular grid — while every
 * coefficient stays at or below {@link SUN_DISC_MAX_SINE_FREQUENCY}.
 */
export const SUN_DISC_SINE_FREQ = {
  plasmaAx: 17,
  plasmaAy: 11,
  plasmaBx: -13,
  plasmaBy: 23,
  filamentAx: 29,
  filamentAy: -19,
  filamentBx: 7,
  filamentBy: 37,
  granuleAx: 41,
  granuleAy: 5,
  granuleBx: -9,
  granuleBy: 47,
} as const;

/**
 * CPU mirror of the three band-limited surface-texture terms. Returns the
 * `0..1`-remapped plasma/filament/granule values for a centered disc UV
 * `(cx, cy)`. The fallback DataTexture and tests both consume this so the
 * CPU path matches the GPU shaders' band-limited frequencies exactly.
 */
export function computeSunDiscSurfaceTerms(
  cx: number,
  cy: number,
): { plasma: number; filament: number; granule: number } {
  const f = SUN_DISC_SINE_FREQ;
  const plasma =
    Math.sin(cx * f.plasmaAx + cy * f.plasmaAy) *
      Math.sin(cx * f.plasmaBx + cy * f.plasmaBy) *
      0.5 +
    0.5;
  const filament =
    Math.sin(cx * f.filamentAx + cy * f.filamentAy) *
      Math.sin(cx * f.filamentBx + cy * f.filamentBy) *
      0.5 +
    0.5;
  const granule =
    Math.sin(cx * f.granuleAx + cy * f.granuleAy + plasma * 2.1) *
      Math.sin(cx * f.granuleBx + cy * f.granuleBy - filament * 1.7) *
      0.5 +
    0.5;
  return { plasma, filament, granule };
}

interface SunDiscUniforms {
  sunColor: { value: THREE.Color };
  /** Terrain-horizon occlusion multiplier (0 hidden .. 1 clear sky). */
  occlusion: { value: number };
  /** V2 rebuild toggle (1 = limb-darkened + halo, 0 = legacy flat body). */
  v2: { value: number };
}

interface SunDiscWebGlUniforms {
  [uniform: string]: THREE.IUniform;
  uBodyColor: THREE.IUniform<THREE.Color>;
  uCoreColor: THREE.IUniform<THREE.Color>;
  /** Terrain-horizon occlusion multiplier (0 hidden .. 1 clear sky). */
  uOcclusion: THREE.IUniform<number>;
  /** V2 rebuild toggle (1 = limb-darkened + halo, 0 = legacy flat body). */
  uV2: THREE.IUniform<number>;
}

type SunDiscRendererBackend = 'webgpu' | 'webgl' | 'webgpu-webgl-fallback' | 'unknown';

const WEBGL_SUN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WEBGL_SUN_FRAGMENT = /* glsl */ `
  uniform vec3 uBodyColor;
  uniform vec3 uCoreColor;
  uniform float uOcclusion;
  uniform float uV2;
  varying vec2 vUv;

  float sunSmoothstep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Limb darkening (shared with SunDiscOptics.limbDarkening / TSL path):
  // I(r) = 1 - u(1 - sqrt(1 - r^2)); r normalized to the body edge.
  float sunLimb(float rNorm) {
    float rc = clamp(rNorm, 0.0, 1.0);
    float mu = sqrt(max(0.0, 1.0 - rc * rc));
    return 1.0 - ${SUN_DISC_LIMB_U.toFixed(4)} * (1.0 - mu);
  }

  // Forward-scatter halo (shared with SunDiscOptics.scatterHalo): tight ring
  // just outside the body edge; the dome owns the wide glow.
  float sunHalo(float rNorm) {
    if (rNorm <= 1.0 || rNorm >= ${SUN_DISC_HALO_OUTER_R.toFixed(4)}) return 0.0;
    float t = (rNorm - 1.0) / ${(SUN_DISC_HALO_OUTER_R - 1).toFixed(4)};
    float falloff = (1.0 - t) * (1.0 - t);
    return ${SUN_DISC_HALO_STRENGTH.toFixed(4)} * falloff;
  }

  void main() {
    vec2 d = vUv - vec2(0.5);
    float r = length(d) * 2.0;
    // Band-limited surface terms (coefficients shared with TSL + CPU mirror;
    // all <= SUN_DISC_MAX_SINE_FREQUENCY to avoid the dot-lattice aliasing).
    float plasma = sin(d.x * ${SUN_DISC_SINE_FREQ.plasmaAx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.plasmaAy.toFixed(1)}) *
      sin(d.x * ${SUN_DISC_SINE_FREQ.plasmaBx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.plasmaBy.toFixed(1)});
    plasma = plasma * 0.5 + 0.5;
    float filament = sin(d.x * ${SUN_DISC_SINE_FREQ.filamentAx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.filamentAy.toFixed(1)}) *
      sin(d.x * ${SUN_DISC_SINE_FREQ.filamentBx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.filamentBy.toFixed(1)});
    filament = filament * 0.5 + 0.5;
    float granule = sin(d.x * ${SUN_DISC_SINE_FREQ.granuleAx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.granuleAy.toFixed(1)} + plasma * 2.1) *
      sin(d.x * ${SUN_DISC_SINE_FREQ.granuleBx.toFixed(1)} + d.y * ${SUN_DISC_SINE_FREQ.granuleBy.toFixed(1)} - filament * 1.7);
    granule = granule * 0.5 + 0.5;
    float bodyR = r + (plasma - 0.5) * 0.145 + (filament - 0.5) * 0.052;
    float coreR = r + (plasma - 0.5) * 0.038 + (granule - 0.5) * 0.012;
    float body = 1.0 - sunSmoothstep(${BODY_RADIUS.toFixed(6)}, ${BODY_FEATHER.toFixed(6)}, bodyR);
    float hotCore = 1.0 - sunSmoothstep(${HOT_CORE_RADIUS.toFixed(6)}, ${HOT_CORE_FEATHER.toFixed(6)}, coreR);
    float innerHeat = 1.0 - sunSmoothstep(${(BODY_RADIUS * 0.5).toFixed(6)}, ${HOT_CORE_FEATHER.toFixed(6)}, coreR);
    // V2: dim the body toward its limb like a photosphere. Mix toward 1.0 when
    // the flag is OFF so the legacy flat body is byte-preserved.
    float limb = mix(1.0, sunLimb(r / ${BODY_RADIUS.toFixed(6)}), uV2);
    body *= limb;
    innerHeat *= limb;
    float edgeFire = clamp(body - hotCore * 0.20, 0.0, 1.0) * (0.84 + plasma * 0.62 + filament * 0.44 + granule * 0.30);
    float amberMass = clamp(edgeFire * 0.92 + body * 0.22, 0.0, 1.0);
    float alpha = clamp(max(amberMass * 0.92, max(hotCore * 0.98, innerHeat * 0.48)), 0.0, 1.0);
    vec3 emberColor = mix(vec3(1.0, 0.21, 0.010), uBodyColor, 0.10 + filament * 0.12);
    float coreTexture = clamp(0.56 + plasma * 0.24 + filament * 0.20 + granule * 0.24, 0.0, 1.0);
    float coreHeat = max(hotCore * (0.88 + coreTexture * 0.44), innerHeat * 0.50);
    vec3 hotColor = mix(vec3(1.0, 0.60, 0.080), uCoreColor, clamp(0.68 + coreTexture * 0.24 + hotCore * 0.18, 0.0, 1.0));
    vec3 emberVein = emberColor * clamp((1.0 - coreTexture) * hotCore * 0.24 + filament * edgeFire * 0.24, 0.0, 0.36);
    vec3 rgb = emberColor * amberMass * (0.92 + granule * 0.30) + hotColor * coreHeat + emberVein;
    // V2: tight forward-scatter halo just outside the body edge (additive).
    float halo = sunHalo(r / ${BODY_RADIUS.toFixed(6)}) * uV2;
    rgb += emberColor * halo;
    alpha = clamp(max(alpha, halo * 0.9), 0.0, 1.0);
    rgb = min(rgb, vec3(1.0, 0.972, 0.944));
    // Terrain-horizon occlusion fade (1 = clear sky, 0 = fully behind a ridge).
    alpha *= uOcclusion;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

function smoothstepCpu(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createFallbackSunTexture(): THREE.DataTexture {
  const data = new Uint8Array(FALLBACK_TEXTURE_SIZE * FALLBACK_TEXTURE_SIZE * 4);
  const half = (FALLBACK_TEXTURE_SIZE - 1) * 0.5;
  for (let y = 0; y < FALLBACK_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < FALLBACK_TEXTURE_SIZE; x += 1) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      // Centered disc UV (−0.5..0.5), the same domain the GLSL/TSL shaders
      // sample, so the band-limited surface terms match across all backends.
      const { plasma, filament, granule } = computeSunDiscSurfaceTerms(nx * 0.5, ny * 0.5);
      const r = Math.hypot(nx, ny);
      const bodyR = r + (plasma - 0.5) * 0.145 + (filament - 0.5) * 0.052;
      const coreR = r + (plasma - 0.5) * 0.038 + (granule - 0.5) * 0.012;
      // V2 limb darkening + halo, shared with the TSL/GLSL paths via SunDiscOptics.
      const limb = limbDarkening(r / BODY_RADIUS);
      const halo = scatterHalo(r / BODY_RADIUS);
      const body = (1 - smoothstepCpu(BODY_RADIUS, BODY_FEATHER, bodyR)) * limb;
      const hotCore = 1 - smoothstepCpu(HOT_CORE_RADIUS, HOT_CORE_FEATHER, coreR);
      const innerHeat = (1 - smoothstepCpu(BODY_RADIUS * 0.5, HOT_CORE_FEATHER, coreR)) * limb;
      const edgeFire =
        Math.max(0, Math.min(1, body - hotCore * 0.20)) *
        (0.84 + plasma * 0.62 + filament * 0.44 + granule * 0.30);
      const amberMass = Math.max(0, Math.min(1, edgeFire * 0.92 + body * 0.22));
      const alpha = Math.max(amberMass * 0.56, hotCore * 0.70, innerHeat * 0.40, halo * 0.5);
      const coreTexture = Math.max(0, Math.min(1, 0.56 + plasma * 0.24 + filament * 0.20 + granule * 0.24));
      const heat = Math.max(0, Math.min(1, hotCore * (0.82 + coreTexture * 0.42)));
      const emberVein = Math.max(0, Math.min(0.36, (1 - coreTexture) * hotCore * 0.24 + filament * edgeFire * 0.24));
      const amberR = 255;
      const amberG = 70 + plasma * 84 + filament * 48;
      const amberB = 2 + plasma * 14;
      const hotR = 255;
      const hotG = 168 + coreTexture * 82;
      const hotB = 44 + coreTexture * 168;
      const i = (y * FALLBACK_TEXTURE_SIZE + x) * 4;
      // Warm forward-scatter halo just outside the body edge, additive on the
      // amber channels so the ring reads as scatter, not a second body.
      const haloWarm = halo * 200;
      data[i] = Math.round(Math.min(255, amberR + (hotR - amberR) * heat + haloWarm));
      data[i + 1] = Math.round(Math.min(255, amberG + (hotG - amberG) * heat + amberG * emberVein + haloWarm * 0.45));
      data[i + 2] = Math.round(Math.min(255, amberB + (hotB - amberB) * heat + amberB * emberVein));
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha)));
    }
  }
  const texture = new THREE.DataTexture(
    data,
    FALLBACK_TEXTURE_SIZE,
    FALLBACK_TEXTURE_SIZE,
    THREE.RGBAFormat,
  );
  texture.name = 'SunDiscFallbackTexture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSunDiscMaterial(): { material: MeshBasicNodeMaterial; uniforms: SunDiscUniforms } {
  const uniforms: SunDiscUniforms = {
    sunColor: { value: new THREE.Color(1, 1, 1) },
    occlusion: { value: 1 },
    v2: { value: 1 },
  };
  const fallbackTexture = createFallbackSunTexture();
  const material = new MeshBasicNodeMaterial({
    name: 'SunDisc',
    transparent: true,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(1.0, 1.0, 1.0),
    opacity: 1,
    map: fallbackTexture,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  });

  // Band-limited surface terms (coefficients shared with GLSL + CPU mirror;
  // all <= SUN_DISC_MAX_SINE_FREQUENCY to avoid the dot-lattice aliasing).
  const F = SUN_DISC_SINE_FREQ;
  const centered = (uv() as any).sub(vec2(0.5, 0.5)) as any;
  const r = (length(centered) as any).mul(2.0);
  const waveA = (
    (centered as any).x.mul(float(F.plasmaAx)).add((centered as any).y.mul(float(F.plasmaAy))) as any
  ).sin();
  const waveB = (
    (centered as any).x.mul(float(F.plasmaBx)).add((centered as any).y.mul(float(F.plasmaBy))) as any
  ).sin();
  const plasma = (waveA.mul(waveB) as any).mul(float(0.5)).add(float(0.5));
  const waveC = (
    (centered as any).x.mul(float(F.filamentAx)).add((centered as any).y.mul(float(F.filamentAy))) as any
  ).sin();
  const waveD = (
    (centered as any).x.mul(float(F.filamentBx)).add((centered as any).y.mul(float(F.filamentBy))) as any
  ).sin();
  const filament = (waveC.mul(waveD) as any).mul(float(0.5)).add(float(0.5));
  const waveE = (
    (centered as any).x
      .mul(float(F.granuleAx))
      .add((centered as any).y.mul(float(F.granuleAy)))
      .add(plasma.mul(float(2.1))) as any
  ).sin();
  const waveF = (
    (centered as any).x
      .mul(float(F.granuleBx))
      .add((centered as any).y.mul(float(F.granuleBy)))
      .sub(filament.mul(float(1.7))) as any
  ).sin();
  const granule = (waveE.mul(waveF) as any).mul(float(0.5)).add(float(0.5));
  const warpedBodyR = r
    .add(plasma.sub(float(0.5)).mul(float(0.145)) as any)
    .add(filament.sub(float(0.5)).mul(float(0.052)) as any) as any;
  const warpedCoreR = r
    .add(plasma.sub(float(0.5)).mul(float(0.038)) as any)
    .add(granule.sub(float(0.5)).mul(float(0.012)) as any) as any;
  const occlusionNode = reference('value', 'float', uniforms.occlusion as any) as any;
  const v2Node = reference('value', 'float', uniforms.v2 as any) as any;
  // Limb darkening (shared with SunDiscOptics.limbDarkening / GLSL path):
  // I(r) = 1 - u(1 - sqrt(1 - r^2)); r normalized to the body edge. Mixed toward
  // 1.0 when the V2 flag is OFF so the legacy flat body is preserved.
  const rNorm = clamp(r.div(float(BODY_RADIUS)) as any, 0.0, 1.0) as any;
  const mu = sqrt(clamp((float(1.0) as any).sub(rNorm.mul(rNorm)) as any, 0.0, 1.0) as any) as any;
  const limbRaw = (float(1.0) as any).sub(
    (float(SUN_DISC_LIMB_U) as any).mul((float(1.0) as any).sub(mu)) as any,
  ) as any;
  const limb = mix(float(1.0) as any, limbRaw, v2Node) as any;
  const rawBody = (float(1.0) as any).sub(smoothstep(float(BODY_RADIUS), float(BODY_FEATHER), warpedBodyR) as any);
  const body = rawBody.mul(limb) as any;
  const hotCore = (float(1.0) as any).sub(smoothstep(float(HOT_CORE_RADIUS), float(HOT_CORE_FEATHER), warpedCoreR) as any);
  const sunColorNode = reference('value', 'color', uniforms.sunColor as any) as any;
  const innerHeat = (float(1.0) as any)
    .sub(smoothstep(float(BODY_RADIUS * 0.5), float(HOT_CORE_FEATHER), warpedCoreR) as any)
    .mul(limb) as any;
  const rimHeat = clamp(
    body
      .sub(hotCore.mul(float(0.20)) as any)
      .mul(
        plasma
          .mul(float(0.62))
          .add(filament.mul(float(0.44)) as any)
          .add(granule.mul(float(0.30)) as any)
          .add(float(0.84)) as any,
      ) as any,
    0.0,
    1.0,
  ) as any;
  const emberMass = clamp(rimHeat.mul(float(0.92)).add(body.mul(float(0.22)) as any) as any, 0.0, 1.0) as any;
  const emberTint = mix(
    vec3(9.4, 0.95, 0.018) as any,
    vec3(13.0, 3.20, 0.18) as any,
    plasma.mul(float(0.58)).add(filament.mul(float(0.26)) as any) as any,
  ) as any;
  const amberBody = mix(
    emberTint,
    sunColorNode.mul(vec3(1.85, 0.58, 0.12)).mul(float(1.68)) as any,
    float(0.018),
  ) as any;
  const coreTexture = clamp(
    plasma
      .mul(float(0.24))
      .add(filament.mul(float(0.20)) as any)
      .add(granule.mul(float(0.24)) as any)
      .add(float(0.56)) as any,
    0.0,
    1.0,
  ) as any;
  const coreHeat = max(
    hotCore.mul(coreTexture.mul(float(0.44)).add(float(0.88)) as any) as any,
    innerHeat.mul(float(0.50)) as any,
  ) as any;
  const hotColor = mix(
    vec3(4.10, 1.35, 0.14) as any,
    vec3(5.10, 4.15, 2.35) as any,
    clamp(
      coreTexture
        .mul(float(0.30))
        .add(hotCore.mul(float(0.20)) as any)
        .add(float(0.66)) as any,
      0.0,
      1.0,
    ) as any,
  ) as any;
  const emberVein = emberTint.mul(
    clamp(
      (float(1.0) as any)
        .sub(coreTexture)
        .mul(hotCore)
        .mul(float(0.24))
        .add(filament.mul(rimHeat).mul(float(0.24)) as any) as any,
      0.0,
      0.36,
    ) as any,
  ) as any;
  // Forward-scatter halo (shared with SunDiscOptics.scatterHalo): a tight ring
  // just outside the body edge (rNormFull in [1, HALO_OUTER_R]). The dome owns
  // the WIDE glow, so this stays small. Gated on V2.
  const rNormFull = r.div(float(BODY_RADIUS)) as any;
  const haloT = clamp(
    rNormFull.sub(float(1.0)).div(float(SUN_DISC_HALO_OUTER_R - 1)) as any,
    0.0,
    1.0,
  ) as any;
  const haloInBand = smoothstep(float(1.0), float(1.001), rNormFull as any).mul(
    (float(1.0) as any).sub(smoothstep(float(SUN_DISC_HALO_OUTER_R - 0.001), float(SUN_DISC_HALO_OUTER_R), rNormFull as any)) as any,
  ) as any;
  const haloFalloff = (float(1.0) as any).sub(haloT);
  const halo = haloFalloff
    .mul(haloFalloff)
    .mul(float(SUN_DISC_HALO_STRENGTH))
    .mul(haloInBand)
    .mul(v2Node) as any;
  const rgb = amberBody
    .mul(emberMass.mul(granule.mul(float(0.30)).add(float(0.92)) as any) as any)
    .add(hotColor.mul(coreHeat) as any)
    .add(emberVein)
    .add(emberTint.mul(halo) as any) as any;
  const opacity = clamp(
    max(
      emberMass.mul(float(0.92)) as any,
      max(
        max(hotCore.mul(float(0.98)) as any, innerHeat.mul(float(0.48)) as any),
        halo.mul(float(0.9)) as any,
      ),
    ),
    0.0,
    1.0,
  ).mul(occlusionNode) as any;
  (material as any).colorNode = rgb;
  (material as any).opacityNode = opacity;
  (material as any).userData.sunDiscOwnership = {
    owns: 'disc-body-only',
    skyOwns: 'atmospheric-glow-and-horizon-scatter',
  };
  (material as any).userData.sunDiscFallbackTexture = fallbackTexture;
  (material as any).userData.sunDiscShape = {
    bodyRadius: BODY_RADIUS,
    bodyFeather: BODY_FEATHER,
    hotCoreRadius: HOT_CORE_RADIUS,
    hotCoreFeather: HOT_CORE_FEATHER,
    ownershipTuning: 'large-hot-core-fractured-amber-shell',
  };
  (material as any).userData.sunDiscOptics = SUN_DISC_OPTICS_METADATA;
  return { material, uniforms };
}

function createWebGlSunDiscMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: SunDiscWebGlUniforms;
} {
  const uniforms: SunDiscWebGlUniforms = {
    uBodyColor: { value: new THREE.Color(1.0, 0.55, 0.12) },
    uCoreColor: { value: new THREE.Color(1.0, 0.74, 1.0) },
    uOcclusion: { value: 1 },
    uV2: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'SunDiscWebGL',
    uniforms,
    vertexShader: WEBGL_SUN_VERTEX,
    fragmentShader: WEBGL_SUN_FRAGMENT,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  });
  material.userData.sunDiscOwnership = {
    owns: 'disc-body-only',
    skyOwns: 'atmospheric-glow-and-horizon-scatter',
  };
  material.userData.sunDiscShape = {
    bodyRadius: BODY_RADIUS,
    bodyFeather: BODY_FEATHER,
    hotCoreRadius: HOT_CORE_RADIUS,
    hotCoreFeather: HOT_CORE_FEATHER,
    ownershipTuning: 'large-hot-core-fractured-amber-shell',
  };
  material.userData.sunDiscOptics = SUN_DISC_OPTICS_METADATA;
  return { material, uniforms };
}

export class SunDiscMesh {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: MeshBasicNodeMaterial;
  private readonly webGlMaterial: THREE.ShaderMaterial;
  private readonly uniforms: SunDiscUniforms;
  private readonly webGlUniforms: SunDiscWebGlUniforms;
  private readonly mesh: THREE.Mesh;
  private readonly domeRadius: number;
  private readonly scratchColor = new THREE.Color();
  private readonly webGlBodyColor = new THREE.Color();
  private readonly webGlCoreColor = new THREE.Color();
  /**
   * SOL-1 / SDS alignment: the additive sprite is the production sun body
   * owner by default. Disable only for explicit A/B comparison.
   */
  private enabled = true;

  constructor(domeRadius: number, options?: { discSize?: number; enabled?: boolean }) {
    this.domeRadius = domeRadius;
    const size = options?.discSize ?? DEFAULT_DISC_SIZE;
    if (options?.enabled !== undefined) this.enabled = options.enabled;

    const { material, uniforms } = createSunDiscMaterial();
    const { material: webGlMaterial, uniforms: webGlUniforms } = createWebGlSunDiscMaterial();
    this.material = material;
    this.webGlMaterial = webGlMaterial;
    this.uniforms = uniforms;
    this.webGlUniforms = webGlUniforms;
    this.geometry = new THREE.PlaneGeometry(size, size);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'SunDiscSprite';
    this.mesh.userData.perfCategory = 'atmosphere';
    this.mesh.frustumCulled = false;
    // Render after the dome (`renderOrder = -1`) so the additive blend
    // composites against the painted sky background, not before it.
    this.mesh.renderOrder = 0;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.visible = false;
  }

  /** Toggle whether the sprite participates in rendering. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.mesh.visible = false;
  }

  /** Whether the sprite is currently allowed to render when above horizon. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * The WebGL renderer has a distinct node-material fallback path that clips
   * additive HDR sprites to white. Switch only that explicit backend to a GLSL
   * material with bounded alpha blending; WebGPU keeps the SDS-style TSL material.
   */
  setRendererBackend(backend: SunDiscRendererBackend): void {
    const nextMaterial = backend === 'webgl' ? this.webGlMaterial : this.material;
    if (this.mesh.material !== nextMaterial) {
      this.mesh.material = nextMaterial;
    }
  }

  /** Returns the disc mesh so `AtmosphereSystem` can attach it to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Per-frame update. Anchors the plane at `cameraPos + sunDir * r` and
   * billboards it to the camera. `sunColor` is pre-multiplied by an
   * elevation-keyed peak so the per-fragment shader can paint the hot
   * body in linear radiance without renderer tonemapping.
   *
   * `occlusion` (0..1, default 1) is the terrain-horizon fade from the CPU
   * horizon march in `AtmosphereSystem`: 1 when the camera->sun ray is clear,
   * fading to 0 as the sun sinks behind a sampled ridgeline so the body no
   * longer shines through the silhouette. The below-horizon `y < 0` hide is
   * still authoritative — occlusion only handles the terrain-blocked band while
   * the sun is geometrically above the horizon.
   */
  update(
    cameraPos: THREE.Vector3,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
    occlusion = 1,
  ): void {
    if (!this.enabled || sunDirection.y < 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    const r = this.domeRadius * DOME_INSET;
    this.mesh.position.set(
      cameraPos.x + sunDirection.x * r,
      cameraPos.y + sunDirection.y * r,
      cameraPos.z + sunDirection.z * r,
    );
    this.mesh.lookAt(cameraPos);

    const elev = Math.max(0, Math.min(1, sunDirection.y));
    const peakFactor =
      HDR_FLOOR_MULTIPLIER +
      (HDR_PEAK_MULTIPLIER - HDR_FLOOR_MULTIPLIER) * (elev * elev);
    this.scratchColor.copy(sunColor).multiplyScalar(peakFactor);
    this.uniforms.sunColor.value.copy(this.scratchColor);

    // Consume the rebuild flag + terrain-horizon fade. V2 OFF collapses to the
    // legacy flat body (limb/halo mixed out) at full opacity; the horizon fade
    // still applies (it is a placement truth, not a look choice).
    const v2 = isSunDiscV2Enabled() ? 1 : 0;
    const occ = Math.max(0, Math.min(1, occlusion));
    this.uniforms.v2.value = v2;
    this.uniforms.occlusion.value = occ;
    this.webGlUniforms.uV2.value = v2;
    this.webGlUniforms.uOcclusion.value = occ;

    this.webGlBodyColor
      .setRGB(1.0, 0.48, 0.08)
      .lerp(this.scratchColor, 0.18);
    this.webGlBodyColor.r = Math.min(1, this.webGlBodyColor.r);
    this.webGlBodyColor.g = Math.min(0.72, this.webGlBodyColor.g);
    this.webGlBodyColor.b = Math.min(0.24, this.webGlBodyColor.b);
    this.webGlCoreColor.setRGB(1.0, 0.90, 0.80);
    this.webGlUniforms.uBodyColor.value.copy(this.webGlBodyColor);
    this.webGlUniforms.uCoreColor.value.copy(this.webGlCoreColor);
  }

  /** Material handle for tests / debug overlays. */
  getMaterial(): THREE.Material {
    return this.mesh.material as THREE.Material;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.webGlMaterial.dispose();
  }
}
