// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  acos,
  cameraPosition,
  clamp as tslClampBase,
  cos as tslCosBase,
  dot,
  exp as tslExpBase,
  float,
  Fn,
  max as tslMaxBase,
  min as tslMinBase,
  mix,
  normalize,
  positionWorld,
  pow as tslPowBase,
  reference,
  smoothstep as tslSmoothstepBase,
  vec3,
} from 'three/tsl';
import {
  NIGHT_SKY_FLOOR_BLEND_FULL_Y,
  NIGHT_SKY_FLOOR_BLEND_START_Y,
  NIGHT_SKY_FLOOR_DAY_GAIN,
  NIGHT_SKY_FLOOR_NIGHT_GAIN,
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
  SUN_SKY_MASS_B,
  SUN_SKY_MASS_END,
  SUN_SKY_MASS_G,
  SUN_SKY_MASS_PAINT_B,
  SUN_SKY_MASS_PAINT_G,
  SUN_SKY_MASS_PAINT_R,
  SUN_SKY_MASS_PAINT_STRENGTH,
  SUN_SKY_MASS_POWER,
  SUN_SKY_MASS_R,
  SUN_SKY_MASS_START,
  SUN_SKY_MASS_STRENGTH,
  TOTAL_RAYLEIGH,
} from './HosekWilkieTslConstants';

/**
 * TSL per-fragment Preetham sky node.
 *
 * Cycle 2026-05-17 (`tsl-preetham-fragment-port`): the CPU `evaluateAnalytic`
 * (HosekWilkieSkyBackend.ts:761-874) is mirrored here as a TSL `Fn` graph
 * so the dome paints with fragment-resolution gradient instead of a
 * bake-and-stretch LUT. The CPU LUT stays for fog + hemisphere readers
 * (`sample()`, `getZenith()`, `getHorizon()`) but at 32x8 instead of
 * 256x128.
 *
 * SOL-1 / SDS alignment: the dome owns atmospheric glow only. The separate
 * depth-tested `SunDiscMesh` owns the visible hot body, which prevents a
 * double hard sun and allows ridges to occlude the body.
 */

type UniformSlot<T = unknown> = { value: T };
type TslNode = any;

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec3 = (...args: TslNode[]): TslNode =>
  (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode =>
  (mix as (...values: TslNode[]) => TslNode)(...args);
const tslClamp = (...args: TslNode[]): TslNode =>
  (tslClampBase as (...values: TslNode[]) => TslNode)(...args);
const tslMax = (...args: TslNode[]): TslNode =>
  (tslMaxBase as (...values: TslNode[]) => TslNode)(...args);
const tslMin = (...args: TslNode[]): TslNode =>
  (tslMinBase as (...values: TslNode[]) => TslNode)(...args);
const tslExp = (value: TslNode): TslNode =>
  (tslExpBase as (node: TslNode) => TslNode)(value);
const tslPow = (...args: TslNode[]): TslNode =>
  (tslPowBase as (...values: TslNode[]) => TslNode)(...args);
const tslCos = (value: TslNode): TslNode =>
  (tslCosBase as (node: TslNode) => TslNode)(value);
const tslSmoothstep = (...args: TslNode[]): TslNode =>
  (tslSmoothstepBase as (...values: TslNode[]) => TslNode)(...args);
const tslReference = (type: string, uniform: UniformSlot): TslNode =>
  reference('value', type, uniform) as TslNode;

export interface HosekWilkieTslUniforms {
  sunDirection: UniformSlot<THREE.Vector3>;
  turbidity: UniformSlot<number>;
  rayleigh: UniformSlot<number>;
  mieCoefficient: UniformSlot<number>;
  mieDirectionalG: UniformSlot<number>;
  groundAlbedo: UniformSlot<THREE.Color>;
  exposure: UniformSlot<number>;
  /**
   * Cosine of the visible sun-body outer half-angle. The dome does not paint
   * the body; this edge only bounds broad Mie glare so the separate
   * depth-tested body remains readable.
   */
  sunDiscOuter: UniformSlot<number>;
}

export type HosekWilkieTslMaterial = MeshBasicNodeMaterial & {
  uniforms: HosekWilkieTslUniforms;
  isHosekWilkieTslMaterial: true;
};

export interface CreateHosekWilkieTslMaterialOptions {
  /** Initial sun direction (unit vector). Mutated externally each frame. */
  sunDirection: THREE.Vector3;
  /** Initial Preetham turbidity (typical range 1-10). */
  turbidity: number;
  /** Initial Rayleigh scale. */
  rayleigh: number;
  /** Initial Mie coefficient. */
  mieCoefficient: number;
  /** Initial Mie directional G factor. */
  mieDirectionalG: number;
  /** Initial ground-bounce albedo. */
  groundAlbedo: THREE.Color;
  /** Initial scenario exposure (passes through to fragment). */
  exposure: number;
}

/**
 * Construct the per-fragment TSL Preetham sky material. The caller owns
 * the returned `uniforms` table — mutating `value` fields updates the
 * shader on the next render with no recompile.
 */
export function createHosekWilkieTslMaterial(
  options: CreateHosekWilkieTslMaterialOptions,
): HosekWilkieTslMaterial {
  const uniforms: HosekWilkieTslUniforms = {
    sunDirection: { value: options.sunDirection.clone() },
    turbidity: { value: options.turbidity },
    rayleigh: { value: options.rayleigh },
    mieCoefficient: { value: options.mieCoefficient },
    mieDirectionalG: { value: options.mieDirectionalG },
    groundAlbedo: { value: options.groundAlbedo.clone() },
    exposure: { value: options.exposure },
    sunDiscOuter: { value: SUN_DISC_OUTER_DEFAULT },
  };

  const material = new MeshBasicNodeMaterial({
    name: 'HosekWilkieSkyTsl',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    // Bypass the renderer tonemap. The pre-merge Preetham GLSL deliberately
    // bypassed tonemapping; the dome paints into linear-radiance and the
    // scenario's `preset.exposure` multiplies inside the fragment.
    toneMapped: false,
  }) as HosekWilkieTslMaterial;
  material.uniforms = uniforms;
  material.isHosekWilkieTslMaterial = true;

  material.colorNode = buildPreethamColorNode(uniforms);

  return material;
}

/**
 * Build the TSL fragment color node graph. Per-fragment view direction is
 * computed from `positionWorld - cameraPosition` so the dome paints the
 * sky in world-space (mirrors the camera-followed pre-merge GLSL path).
 */
function buildPreethamColorNode(uniforms: HosekWilkieTslUniforms): TslNode {
  const sunDir = tslReference('vec3', uniforms.sunDirection);
  const turbidity = tslReference('float', uniforms.turbidity);
  const rayleigh = tslReference('float', uniforms.rayleigh);
  const mieCoefficient = tslReference('float', uniforms.mieCoefficient);
  const mieDirectionalG = tslReference('float', uniforms.mieDirectionalG);
  const groundAlbedo = tslReference('color', uniforms.groundAlbedo);
  const exposure = tslReference('float', uniforms.exposure);
  const sunDiscOuter = tslReference('float', uniforms.sunDiscOuter);

  const totalRayleigh = tslVec3(
    tslFloat(TOTAL_RAYLEIGH[0]),
    tslFloat(TOTAL_RAYLEIGH[1]),
    tslFloat(TOTAL_RAYLEIGH[2]),
  );
  const mieConst = tslVec3(
    tslFloat(MIE_CONST[0]),
    tslFloat(MIE_CONST[1]),
    tslFloat(MIE_CONST[2]),
  );
  const cutoffAngle = tslFloat(CUTOFF_ANGLE);
  const steepness = tslFloat(STEEPNESS);
  const eeBase = tslFloat(EE_BASE);

  // The fragment node body. Captured in a Fn so the TSL graph fuses into
  // a single function call in the translated WGSL/GLSL.
  const preethamFn = Fn(() => {
    // View direction = normalized vector from camera to fragment.
    const viewDir = normalize(positionWorld.sub(cameraPosition));
    const sun = normalize(sunDir);

    // Pull `dy` for the optical-path computation; `viewDir.x/.z` are
    // consumed directly via `dot(viewDir, sun)` below.
    const dy = viewDir.y;
    const sunY = tslClamp(sun.y, tslFloat(-1), tslFloat(1));

    // Sun zenith intensity (matches `sunE` in CPU port line 776).
    const sunZenithCos = sunY;
    const sunZenithAngle = acos(sunZenithCos);
    const sunFalloff = tslMax(
      tslFloat(0),
      tslFloat(1).sub(tslExp(cutoffAngle.sub(sunZenithAngle).div(steepness).negate())),
    );
    const sunE = eeBase.mul(sunFalloff);

    // Sunfade + rayleigh coefficient (matches CPU lines 778-779).
    const sunfade = tslFloat(1).sub(
      tslClamp(tslFloat(1).sub(tslExp(sunY)), tslFloat(0), tslFloat(1)),
    );
    const rayleighCoeff = rayleigh.sub(tslFloat(1).sub(sunfade));

    // Scattering coefficients per channel.
    const betaR = totalRayleigh.mul(rayleighCoeff);
    const totalMieScale = tslFloat(0.434)
      .mul(tslFloat(0.2).mul(turbidity))
      .mul(tslFloat(1e-17));
    const betaM = mieConst.mul(totalMieScale).mul(mieCoefficient);

    // Optical length along view direction (matches CPU lines 797-803).
    const upDot = tslMax(tslFloat(0), dy);
    const zenithAngle = acos(upDot);
    // Note: the CPU port uses `93.885 - (zenithAngle * 180/Math.PI)` for
    // the empirical Preetham denominator. Mirror exactly.
    const zenithAngleDeg = zenithAngle.mul(tslFloat(180 / Math.PI));
    const inverseDenomBase = tslCos(zenithAngle).add(
      tslFloat(0.15).mul(
        tslPow(tslFloat(93.885).sub(zenithAngleDeg), tslFloat(-1.253)),
      ),
    );
    const inverseLen = tslFloat(1).div(tslMax(tslFloat(1e-3), inverseDenomBase));
    const sR = tslFloat(8.4e3).mul(inverseLen);
    const sM = tslFloat(1.25e3).mul(inverseLen);

    // Extinction (Fex) per channel (matches CPU lines 805-807).
    const fexNeg = betaR.mul(sR).add(betaM.mul(sM)).negate();
    const fex = tslVec3(tslExp(fexNeg.x), tslExp(fexNeg.y), tslExp(fexNeg.z));

    // Phase functions (matches CPU lines 809-815).
    const cosTheta = dot(viewDir, sun);
    const cosThetaHalfBiased = cosTheta.mul(tslFloat(0.5)).add(tslFloat(0.5));
    const rayleighPhase = tslFloat(3 / (16 * Math.PI)).mul(
      tslFloat(1).add(cosThetaHalfBiased.mul(cosThetaHalfBiased)),
    );
    const g = mieDirectionalG;
    const g2 = g.mul(g);
    const hgDenomBase = tslMax(
      tslFloat(1e-4),
      tslFloat(1).sub(tslFloat(2).mul(g).mul(cosTheta)).add(g2),
    );
    const hgDenom = tslPow(hgDenomBase, tslFloat(1.5));
    const hgPhase = tslFloat(1 / (4 * Math.PI)).mul(
      tslFloat(1).sub(g2).div(hgDenom),
    );

    const betaRTheta = betaR.mul(rayleighPhase);
    const betaMTheta = betaM.mul(hgPhase);

    const sumBase = betaR.add(betaM);
    // Avoid divide-by-zero (matches CPU `|| 1e-9`).
    const sumSafe = tslMax(sumBase, tslVec3(tslFloat(1e-9), tslFloat(1e-9), tslFloat(1e-9)));

    // High-sun term `linR/G/B = (sunE * (betaT+betaMT)/sum * (1-fex))^1.5`.
    const oneMinusFex = tslVec3(tslFloat(1), tslFloat(1), tslFloat(1)).sub(fex);
    const phaseSum = betaRTheta.add(betaMTheta).div(sumSafe);
    const linBase = sunE.mul(phaseSum).mul(oneMinusFex);
    const linHigh = tslVec3(
      tslPow(tslMax(linBase.x, tslFloat(0)), tslFloat(1.5)),
      tslPow(tslMax(linBase.y, tslFloat(0)), tslFloat(1.5)),
      tslPow(tslMax(linBase.z, tslFloat(0)), tslFloat(1.5)),
    );

    // Horizon-glow term `low = (sunE * (betaT+betaMT)/sum * fex)^0.5`.
    const lowBase = sunE.mul(phaseSum).mul(fex);
    const lowLow = tslVec3(
      tslPow(tslMax(lowBase.x, tslFloat(0)), tslFloat(0.5)),
      tslPow(tslMax(lowBase.y, tslFloat(0)), tslFloat(0.5)),
      tslPow(tslMax(lowBase.z, tslFloat(0)), tslFloat(0.5)),
    );

    // horizonMix = pow(max(0, 1 - sunY), 5). Heavy below horizon.
    const horizonMixBase = tslMax(tslFloat(0), tslFloat(1).sub(sunY));
    const horizonMix5 = tslPow(horizonMixBase, tslFloat(5));
    const horizonMixClamped = tslMin(tslFloat(1), horizonMix5);
    const oneVec = tslVec3(tslFloat(1), tslFloat(1), tslFloat(1));
    const blend = oneVec.add(lowLow.sub(oneVec).mul(horizonMixClamped));
    const linBlended = linHigh.mul(blend);

    // Night-sky floor. Daytime preserves the historical `0.1 * Fex`;
    // sub-horizon sky crossfades to a stronger cool floor so night does
    // not collapse to black or inherit red extinction.
    const nightFloorT = tslFloat(1).sub(
      tslSmoothstep(
        tslFloat(NIGHT_SKY_FLOOR_BLEND_FULL_Y),
        tslFloat(NIGHT_SKY_FLOOR_BLEND_START_Y),
        sunY,
      ),
    );
    const moonFloorColor = tslVec3(
      tslFloat(MOON_COLOR_R),
      tslFloat(MOON_COLOR_G),
      tslFloat(MOON_COLOR_B),
    );
    const dayFloor = fex.mul(tslFloat(NIGHT_SKY_FLOOR_DAY_GAIN));
    const nightFloor = moonFloorColor.mul(tslFloat(NIGHT_SKY_FLOOR_NIGHT_GAIN));
    const l0 = tslMix(dayFloor, nightFloor, nightFloorT);

    // Compose the main sky radiance (matches CPU lines 848-850).
    const compose = linBlended.add(l0).mul(tslFloat(0.04));
    const composeBiased = tslVec3(
      compose.x,
      compose.y.add(tslFloat(0.0003)),
      compose.z.add(tslFloat(0.00075)),
    );

    // Ground-bounce term (matches CPU lines 853-857).
    const bounce = tslMax(tslFloat(0), dy.negate());
    const bounceK = bounce.mul(tslFloat(0.35)).mul(tslFloat(0.5).add(sunfade));
    const withBounce = composeBiased.add(groundAlbedo.mul(bounceK));

    // Apply scenario exposure.
    const exposed = withBounce.mul(exposure);

    // Compress broad base-sky glare near the sun. The sky keeps the ambient
    // forward-scatter; SunDiscMesh owns the only visible hard body.
    const baseGlareMaskRaw = tslSmoothstep(
      tslFloat(SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT),
      sunDiscOuter,
      cosTheta,
    );
    const highSunBaseGlareT = tslSmoothstep(
      tslFloat(SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y),
      tslFloat(SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y),
      sunY,
    );
    const baseGlareMask = tslPow(
      baseGlareMaskRaw,
      tslFloat(SUN_BASE_GLARE_COMPRESS_SHAPE_POWER),
    );
    const highSunBaseGlareCap = tslVec3(
      tslFloat(SUN_BASE_GLARE_HIGH_SUN_CAP_R),
      tslFloat(SUN_BASE_GLARE_HIGH_SUN_CAP_G),
      tslFloat(SUN_BASE_GLARE_HIGH_SUN_CAP_B),
    );
    const baseGlareCap = tslVec3(
      tslFloat(SUN_BASE_GLARE_CAP_R),
      tslFloat(SUN_BASE_GLARE_CAP_G),
      tslFloat(SUN_BASE_GLARE_CAP_B),
    );
    const shapedBaseGlareCap = tslMix(baseGlareCap, highSunBaseGlareCap, highSunBaseGlareT);
    const exposedOverGlareCap = tslMax(
      exposed.sub(shapedBaseGlareCap),
      tslVec3(tslFloat(0), tslFloat(0), tslFloat(0)),
    );
    const exposedNearSunCapped = tslMin(exposed, shapedBaseGlareCap).add(
      exposedOverGlareCap.mul(tslFloat(SUN_BASE_GLARE_OVER_CAP_RETENTION)),
    );
    const exposedNearSunShaped = tslMix(exposed, exposedNearSunCapped, baseGlareMask);
    const skySolarMassShape = tslSmoothstep(
      tslFloat(SUN_SKY_MASS_START),
      tslFloat(SUN_SKY_MASS_END),
      cosTheta,
    );
    const skySolarMassDayT = tslSmoothstep(tslFloat(-0.02), tslFloat(0.08), sunY);
    const skySolarMassPaint = tslClamp(
      skySolarMassShape
        .mul(skySolarMassDayT)
        .mul(tslFloat(SUN_SKY_MASS_PAINT_STRENGTH)),
      tslFloat(0),
      tslFloat(1),
    );
    const skySolarMassColor = tslVec3(
      tslFloat(SUN_SKY_MASS_PAINT_R),
      tslFloat(SUN_SKY_MASS_PAINT_G),
      tslFloat(SUN_SKY_MASS_PAINT_B),
    );
    const skySolarMassRadiance = tslVec3(
      tslFloat(SUN_SKY_MASS_R),
      tslFloat(SUN_SKY_MASS_G),
      tslFloat(SUN_SKY_MASS_B),
    );
    const skySolarMass = tslPow(
      skySolarMassShape,
      tslFloat(SUN_SKY_MASS_POWER),
    ).mul(skySolarMassDayT).mul(tslFloat(SUN_SKY_MASS_STRENGTH));
    const final = tslMix(
      exposedNearSunShaped,
      skySolarMassColor,
      skySolarMassPaint,
    ).add(skySolarMassRadiance.mul(skySolarMass));

    // Cycle sky-visual-restore: clamp linear radiance to fp16's safe range
    // (CPU port also clamps to [0, 64]); the dome material is
    // `toneMapped: false` so this is the on-screen ceiling.
    return tslClamp(final, tslVec3(tslFloat(0), tslFloat(0), tslFloat(0)), tslVec3(tslFloat(64), tslFloat(64), tslFloat(64)));
  });

  return preethamFn();
}
