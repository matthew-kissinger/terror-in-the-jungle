// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  NIGHT_SKY_FLOOR_BLEND_FULL_Y,
  NIGHT_SKY_FLOOR_BLEND_START_Y,
  NIGHT_SKY_FLOOR_DAY_GAIN,
  NIGHT_SKY_FLOOR_NIGHT_GAIN,
  nightSkyFloorBlendForSunY,
} from './HosekWilkieNightSkyFloor';
import {
  CUTOFF_ANGLE,
  EE_BASE,
  MIE_CONST,
  MOON_COLOR_B,
  MOON_COLOR_G,
  MOON_COLOR_R,
  STEEPNESS,
  SUN_BASE_GLARE_CAP_B,
  SUN_BASE_GLARE_CAP_G,
  SUN_BASE_GLARE_CAP_R,
  SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT,
  SUN_BASE_GLARE_COMPRESS_SHAPE_POWER,
  SUN_BASE_GLARE_OVER_CAP_RETENTION,
  SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y,
  SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y,
  SUN_BASE_GLARE_HIGH_SUN_CAP_B,
  SUN_BASE_GLARE_HIGH_SUN_CAP_G,
  SUN_BASE_GLARE_HIGH_SUN_CAP_R,
  SUN_DISC_OUTER_DEFAULT,
  TOTAL_RAYLEIGH,
} from './HosekWilkieTslConstants';

export interface PreethamCpuMirrorState {
  sunDirection: THREE.Vector3;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  groundAlbedo: THREE.Color;
  exposure: number;
  sunDiscOuter?: number;
}

/**
 * Evaluate the per-fragment Preetham color at a view direction, using the
 * same sky-only math the TSL fragment node uses. The visible hot body is
 * owned by SunDiscMesh; this mirror only shapes the atmospheric dome and
 * broad forward-scatter around that body.
 *
 * Returns the linear-radiance RGB the dome would paint at this fragment.
 */
export function evaluatePreethamSkyCpu(
  state: PreethamCpuMirrorState,
  viewDirection: THREE.Vector3,
  out: THREE.Color,
): THREE.Color {
  const sunLen =
    Math.hypot(state.sunDirection.x, state.sunDirection.y, state.sunDirection.z) ||
    1;
  const sunX = state.sunDirection.x / sunLen;
  const sunY = state.sunDirection.y / sunLen;
  const sunZ = state.sunDirection.z / sunLen;
  const sunYClamped = Math.max(-1, Math.min(1, sunY));

  const viewLen =
    Math.hypot(viewDirection.x, viewDirection.y, viewDirection.z) || 1;
  const dx = viewDirection.x / viewLen;
  const dy = viewDirection.y / viewLen;
  const dz = viewDirection.z / viewLen;

  const sunZenithAngle = Math.acos(sunYClamped);
  const sunE =
    EE_BASE *
    Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - sunZenithAngle) / STEEPNESS)));

  const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sunYClamped)));
  const rayleighCoeff = state.rayleigh - (1 - sunfade);

  const betaR: [number, number, number] = [
    TOTAL_RAYLEIGH[0] * rayleighCoeff,
    TOTAL_RAYLEIGH[1] * rayleighCoeff,
    TOTAL_RAYLEIGH[2] * rayleighCoeff,
  ];
  const totalMieScale = 0.434 * (0.2 * state.turbidity) * 1e-17;
  const betaM: [number, number, number] = [
    MIE_CONST[0] * totalMieScale * state.mieCoefficient,
    MIE_CONST[1] * totalMieScale * state.mieCoefficient,
    MIE_CONST[2] * totalMieScale * state.mieCoefficient,
  ];

  const upDot = Math.max(0, dy);
  const zenithAngle = Math.acos(upDot);
  const inverseDenom =
    Math.cos(zenithAngle) +
    0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253);
  const inverseLen = 1 / Math.max(1e-3, inverseDenom);
  const sR = 8.4e3 * inverseLen;
  const sM = 1.25e3 * inverseLen;

  const fexR = Math.exp(-(betaR[0] * sR + betaM[0] * sM));
  const fexG = Math.exp(-(betaR[1] * sR + betaM[1] * sM));
  const fexB = Math.exp(-(betaR[2] * sR + betaM[2] * sM));

  const cosTheta = dx * sunX + dy * sunY + dz * sunZ;
  const rayleighPhase =
    (3 / (16 * Math.PI)) * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  const g = state.mieDirectionalG;
  const g2 = g * g;
  const hgDenom = Math.pow(
    Math.max(1e-4, 1 - 2 * g * cosTheta + g2),
    1.5,
  );
  const hgPhase = (1 / (4 * Math.PI)) * ((1 - g2) / hgDenom);

  const betaRThetaR = betaR[0] * rayleighPhase;
  const betaRThetaG = betaR[1] * rayleighPhase;
  const betaRThetaB = betaR[2] * rayleighPhase;
  const betaMThetaR = betaM[0] * hgPhase;
  const betaMThetaG = betaM[1] * hgPhase;
  const betaMThetaB = betaM[2] * hgPhase;

  const sumR = Math.max(betaR[0] + betaM[0], 1e-9);
  const sumG = Math.max(betaR[1] + betaM[1], 1e-9);
  const sumB = Math.max(betaR[2] + betaM[2], 1e-9);

  const linR = Math.pow(
    Math.max(0, sunE * ((betaRThetaR + betaMThetaR) / sumR) * (1 - fexR)),
    1.5,
  );
  const linG = Math.pow(
    Math.max(0, sunE * ((betaRThetaG + betaMThetaG) / sumG) * (1 - fexG)),
    1.5,
  );
  const linB = Math.pow(
    Math.max(0, sunE * ((betaRThetaB + betaMThetaB) / sumB) * (1 - fexB)),
    1.5,
  );

  const horizonMix = Math.min(
    1,
    Math.pow(Math.max(0, 1 - sunYClamped), 5),
  );
  const lowR = Math.pow(
    Math.max(0, sunE * ((betaRThetaR + betaMThetaR) / sumR) * fexR),
    0.5,
  );
  const lowG = Math.pow(
    Math.max(0, sunE * ((betaRThetaG + betaMThetaG) / sumG) * fexG),
    0.5,
  );
  const lowB = Math.pow(
    Math.max(0, sunE * ((betaRThetaB + betaMThetaB) / sumB) * fexB),
    0.5,
  );
  const blendR = 1 + (lowR - 1) * horizonMix;
  const blendG = 1 + (lowG - 1) * horizonMix;
  const blendB = 1 + (lowB - 1) * horizonMix;
  const linRb = linR * blendR;
  const linGb = linG * blendG;
  const linBb = linB * blendB;

  const nightFloorT = nightSkyFloorBlendForSunY(sunYClamped);
  const dayFloorR = NIGHT_SKY_FLOOR_DAY_GAIN * fexR;
  const dayFloorG = NIGHT_SKY_FLOOR_DAY_GAIN * fexG;
  const dayFloorB = NIGHT_SKY_FLOOR_DAY_GAIN * fexB;
  const nightFloorR = NIGHT_SKY_FLOOR_NIGHT_GAIN * MOON_COLOR_R;
  const nightFloorG = NIGHT_SKY_FLOOR_NIGHT_GAIN * MOON_COLOR_G;
  const nightFloorB = NIGHT_SKY_FLOOR_NIGHT_GAIN * MOON_COLOR_B;
  const l0R = dayFloorR + (nightFloorR - dayFloorR) * nightFloorT;
  const l0G = dayFloorG + (nightFloorG - dayFloorG) * nightFloorT;
  const l0B = dayFloorB + (nightFloorB - dayFloorB) * nightFloorT;

  let r = (linRb + l0R) * 0.04;
  let g2c = (linGb + l0G) * 0.04 + 0.0003;
  let b = (linBb + l0B) * 0.04 + 0.00075;

  const bounce = Math.max(0, -dy);
  const bounceK = bounce * 0.35 * (0.5 + sunfade);
  r += state.groundAlbedo.r * bounceK;
  g2c += state.groundAlbedo.g * bounceK;
  b += state.groundAlbedo.b * bounceK;

  r *= state.exposure;
  g2c *= state.exposure;
  b *= state.exposure;

  const sunDiscOuterForBase = state.sunDiscOuter ?? SUN_DISC_OUTER_DEFAULT;
  const baseGlareMaskRaw = smoothstepCpu(
    SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT,
    sunDiscOuterForBase,
    cosTheta,
  );
  const highSunGlareT = smoothstepCpu(
    SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y,
    SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y,
    sunYClamped,
  );
  const baseGlareMask = baseGlareMaskRaw ** SUN_BASE_GLARE_COMPRESS_SHAPE_POWER;
  const capR = SUN_BASE_GLARE_CAP_R + (SUN_BASE_GLARE_HIGH_SUN_CAP_R - SUN_BASE_GLARE_CAP_R) * highSunGlareT;
  const capG = SUN_BASE_GLARE_CAP_G + (SUN_BASE_GLARE_HIGH_SUN_CAP_G - SUN_BASE_GLARE_CAP_G) * highSunGlareT;
  const capB = SUN_BASE_GLARE_CAP_B + (SUN_BASE_GLARE_HIGH_SUN_CAP_B - SUN_BASE_GLARE_CAP_B) * highSunGlareT;
  const compressedR =
    Math.min(r, capR) + Math.max(0, r - capR) * SUN_BASE_GLARE_OVER_CAP_RETENTION;
  const compressedG =
    Math.min(g2c, capG) + Math.max(0, g2c - capG) * SUN_BASE_GLARE_OVER_CAP_RETENTION;
  const compressedB =
    Math.min(b, capB) + Math.max(0, b - capB) * SUN_BASE_GLARE_OVER_CAP_RETENTION;
  r += (compressedR - r) * baseGlareMask;
  g2c += (compressedG - g2c) * baseGlareMask;
  b += (compressedB - b) * baseGlareMask;

  out.setRGB(
    Math.max(0, Math.min(64, r)),
    Math.max(0, Math.min(64, g2c)),
    Math.max(0, Math.min(64, b)),
  );
  return out;
}

function smoothstepCpu(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-9, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const HOSEK_WILKIE_TSL_DEFAULTS = {
  sunDiscOuter: SUN_DISC_OUTER_DEFAULT,
  moonColor: { r: MOON_COLOR_R, g: MOON_COLOR_G, b: MOON_COLOR_B },
  nightSkyFloorDayGain: NIGHT_SKY_FLOOR_DAY_GAIN,
  nightSkyFloorNightGain: NIGHT_SKY_FLOOR_NIGHT_GAIN,
  nightSkyFloorBlendStartY: NIGHT_SKY_FLOOR_BLEND_START_Y,
  nightSkyFloorBlendFullY: NIGHT_SKY_FLOOR_BLEND_FULL_Y,
  sunBaseGlareCompressOuter: SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT,
  sunBaseGlareHighSunBlendStartY: SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y,
  sunBaseGlareHighSunBlendFullY: SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y,
  sunBaseGlareCap: {
    r: SUN_BASE_GLARE_CAP_R,
    g: SUN_BASE_GLARE_CAP_G,
    b: SUN_BASE_GLARE_CAP_B,
  },
} as const;
