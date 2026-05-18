import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  acos,
  asin,
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
  sub,
  vec3,
} from 'three/tsl';

/**
 * TSL per-fragment Preetham sky node + in-shader HDR sun-disc.
 *
 * Cycle 2026-05-17 (`tsl-preetham-fragment-port`): the CPU `evaluateAnalytic`
 * (HosekWilkieSkyBackend.ts:761-874) is mirrored here as a TSL `Fn` graph
 * so the dome paints with fragment-resolution gradient + HDR sun-disc
 * pin-point instead of a bake-and-stretch LUT. The CPU LUT stays for fog +
 * hemisphere readers (`sample()`, `getZenith()`, `getHorizon()`) but at
 * 32x8 instead of 256x128.
 *
 * Per the spike memo Section 1 observation 1 + Section 3 candidate F:
 * the sun-disc pin-point uses the pre-merge `vSunE * 19000.0 * Fex * sundisc`
 * shape, smoothly mixed into the sky color inside the fragment shader so
 * no additive sprite is necessary by default.
 *
 * The night-red elevation-keyed sun-color blend (sibling `night-red-fix`
 * task) is mirrored here so the per-fragment dome doesn't reintroduce the
 * red-sky bleed when the sun drops below civil twilight.
 */

// Preetham scattering constants (matches the CPU port for parity).
const TOTAL_RAYLEIGH = [
  5.804542996261093e-6,
  1.3562911419845635e-5,
  3.0265902468824876e-5,
] as const;
const MIE_CONST = [
  1.8399918514433978e14,
  2.7798023919660528e14,
  4.0790479543861094e14,
] as const;

// Sun zenith-intensity tuning. Matches the CPU port's
// (cutoffAngle, steepness, EE) constants in `evaluateAnalytic`.
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE_BASE = 1000.0;

// Sun-disc default angular size (gameplay-readable per spike Section 6).
// Inner = cos(2°), Outer = cos(5°) → smoothstep falloff between.
const SUN_DISC_INNER_DEFAULT = Math.cos((2 * Math.PI) / 180);
const SUN_DISC_OUTER_DEFAULT = Math.cos((5 * Math.PI) / 180);

// Pre-merge HDR sun-disc intensity coefficient (`vSunE * 19000.0 * Fex`).
const SUN_DISC_HDR_GAIN = 19000.0;

// Civil-twilight elevation band for the night-red fix.
// Sun↔moon blend interpolates over [-8°, -2°] elevation.
const TWILIGHT_UPPER_RAD = (-2 * Math.PI) / 180;
const TWILIGHT_LOWER_RAD = (-8 * Math.PI) / 180;

// Cool moonlight color the sun-color path lerps toward below civil
// twilight (mirrors `night-red-fix` task's `MOON_COLOR`).
const MOON_COLOR_R = 0.18;
const MOON_COLOR_G = 0.20;
const MOON_COLOR_B = 0.30;

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
   * Cosine of the inner sun-disc half-angle. Pixels with
   * `dot(viewDir, sunDir) >= sunDiscInner` get the full HDR pin-point.
   */
  sunDiscInner: UniformSlot<number>;
  /**
   * Cosine of the outer sun-disc half-angle. Pixels with
   * `dot(viewDir, sunDir) <= sunDiscOuter` get zero disc contribution.
   * Smoothstep between Outer and Inner gives the disc falloff.
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
    sunDiscInner: { value: SUN_DISC_INNER_DEFAULT },
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
  const sunDiscInner = tslReference('float', uniforms.sunDiscInner);
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

  const twilightUpper = tslFloat(TWILIGHT_UPPER_RAD);
  const twilightLower = tslFloat(TWILIGHT_LOWER_RAD);
  const moonColor = tslVec3(
    tslFloat(MOON_COLOR_R),
    tslFloat(MOON_COLOR_G),
    tslFloat(MOON_COLOR_B),
  );
  const sunDiscGain = tslFloat(SUN_DISC_HDR_GAIN);

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

    // Night-sky floor (matches CPU lines 844-846: `0.1 * fex`).
    const l0 = fex.mul(tslFloat(0.1));

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

    // ----- Sun-disc HDR pin-point -----
    // Match pre-merge `vSunE * 19000.0 * Fex * sundisc` shape. The disc
    // contribution is added on top of the sky color via a smoothstep
    // falloff between SUN_DISC_OUTER and SUN_DISC_INNER (cosine-domain).
    // The disc color applies the night-red elevation-keyed sun↔moon blend
    // so deep-night skies do not paint a red disc when the sun is
    // sub-horizon. Mirrors the CPU `bakeLUT()` sun-color path: peak-
    // normalise Fex first so the warm branch reads as a visible color,
    // then lerp toward the literal MOON_COLOR.
    const sunElevationRad = asin(sunY);
    const moonBlendT = tslSmoothstep(twilightLower, twilightUpper, sunElevationRad);
    // moonBlendT = 1 above twilight upper (-2°) ⇒ peak-normalised Fex;
    // moonBlendT = 0 below twilight lower (-8°) ⇒ pure MOON_COLOR.
    const fexPeak = tslMax(tslMax(fex.x, fex.y), tslMax(fex.z, tslFloat(1e-4)));
    const fexNormalised = fex.div(fexPeak);
    const sunColorBlended = tslMix(moonColor, fexNormalised, moonBlendT);

    const sundiscFalloff = tslSmoothstep(sunDiscOuter, sunDiscInner, cosTheta);
    const discContribution = sunE
      .mul(sunDiscGain)
      .mul(sunColorBlended)
      .mul(sundiscFalloff);

    const final = exposed.add(discContribution);

    // Cycle sky-visual-restore: clamp linear radiance to fp16's safe range
    // (CPU port also clamps to [0, 64]); the dome material is
    // `toneMapped: false` so this is the on-screen ceiling.
    return tslClamp(final, tslVec3(tslFloat(0), tslFloat(0), tslFloat(0)), tslVec3(tslFloat(64), tslFloat(64), tslFloat(64)));
  });

  return preethamFn();
}

/**
 * CPU-side mirror of the TSL fragment math. Used by the parity test to
 * compare TSL output (rendered offscreen and read back) against this
 * deterministic CPU evaluation, AND by the production CPU LUT bake to
 * keep `sample()`/`getZenith()`/`getHorizon()` aligned with the dome.
 *
 * Mirrors `HosekWilkieSkyBackend.evaluateAnalytic` line-for-line for
 * parity; mirrors the sun-disc + night-red blend that lives only in the
 * TSL fragment path (CPU `evaluateAnalytic` does the disc as a separate
 * LUT-composited pass via `mixSunDisc`).
 */
export interface PreethamCpuMirrorState {
  sunDirection: THREE.Vector3;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  groundAlbedo: THREE.Color;
  exposure: number;
  sunDiscInner?: number;
  sunDiscOuter?: number;
}

/**
 * Evaluate the per-fragment Preetham color at a view direction, using the
 * same math the TSL fragment node uses. Includes the sun-disc HDR
 * pin-point and the night-red elevation-keyed sun↔moon blend so the
 * parity test compares like-for-like.
 *
 * Returns the linear-radiance RGB the dome would paint at this fragment.
 */
export function evaluatePreethamWithDiscCpu(
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

  // Sun zenith intensity.
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

  const l0R = 0.1 * fexR;
  const l0G = 0.1 * fexG;
  const l0B = 0.1 * fexB;

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

  // Sun-disc HDR pin-point + night-red elevation-keyed sun↔moon blend.
  // Peak-normalise Fex first so the warm-sun branch reads as a visible
  // color; mirrors the CPU `bakeLUT()` sun-color path in
  // HosekWilkieSkyBackend.
  const sunElevationRad = Math.asin(sunYClamped);
  const moonBlendT = smoothstepCpu(
    TWILIGHT_LOWER_RAD,
    TWILIGHT_UPPER_RAD,
    sunElevationRad,
  );
  const fexPeak = Math.max(fexR, fexG, fexB, 1e-4);
  const fexNR = fexR / fexPeak;
  const fexNG = fexG / fexPeak;
  const fexNB = fexB / fexPeak;
  const sunColorR = MOON_COLOR_R + (fexNR - MOON_COLOR_R) * moonBlendT;
  const sunColorG = MOON_COLOR_G + (fexNG - MOON_COLOR_G) * moonBlendT;
  const sunColorB = MOON_COLOR_B + (fexNB - MOON_COLOR_B) * moonBlendT;

  const sunDiscInner = state.sunDiscInner ?? SUN_DISC_INNER_DEFAULT;
  const sunDiscOuter = state.sunDiscOuter ?? SUN_DISC_OUTER_DEFAULT;
  const sundiscFalloff = smoothstepCpu(sunDiscOuter, sunDiscInner, cosTheta);
  const discScale = sunE * SUN_DISC_HDR_GAIN * sundiscFalloff;
  r += discScale * sunColorR;
  g2c += discScale * sunColorG;
  b += discScale * sunColorB;

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

/**
 * Test-visibility export of the constants used by the TSL graph + the CPU
 * mirror. Production code should not import these — they are tuning
 * defaults baked into the shader uniform initial values.
 */
export const HOSEK_WILKIE_TSL_DEFAULTS = {
  sunDiscInner: SUN_DISC_INNER_DEFAULT,
  sunDiscOuter: SUN_DISC_OUTER_DEFAULT,
  twilightUpperRad: TWILIGHT_UPPER_RAD,
  twilightLowerRad: TWILIGHT_LOWER_RAD,
  moonColor: { r: MOON_COLOR_R, g: MOON_COLOR_G, b: MOON_COLOR_B },
  sunDiscHdrGain: SUN_DISC_HDR_GAIN,
} as const;

// Silence noise from unused imports during TS6-strict compile. `sub` is
// referenced in some TSL examples but we use `.negate()` and `.sub()` chain
// methods above; keep the import for future graph extensions.
const _unused = { sub };
void _unused;
