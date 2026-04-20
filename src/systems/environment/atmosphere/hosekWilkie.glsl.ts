/**
 * Vertex + fragment shader source for the analytic sky dome backend that
 * powers `HosekWilkieSkyBackend`. The brief
 * (`docs/tasks/atmosphere-hosek-wilkie-sky.md`) explicitly allows falling
 * back to the Three.js Preetham `Sky` example if a full Hosek-Wilkie port
 * busts the ~500 LOC budget — so the math here is the Preetham 1999
 * formulation (the de facto standard analytic skydome model that ships
 * with Three.js as `examples/jsm/objects/Sky.js`). We expose it via a
 * `HosekWilkieSkyBackend` shell because the v1 task targets the
 * caller-visible behaviour ("real sun color, smooth zenith->horizon
 * gradient, per-scenario time-of-day") and naming, not the specific 2012
 * H&W coefficient table; a future cycle can swap the math under the same
 * `ISkyBackend` contract without touching consumers.
 *
 * Shader is intentionally self-contained (no `tonemapping_fragment` /
 * `colorspace_fragment` includes) so the dome's output color matches what
 * the CPU-side LUT bakes — keeps the fog tint readout in sync with the
 * dome render once `atmosphere-fog-tinted-by-sky` lands.
 */
export const hosekWilkieVertexShader = /* glsl */`
varying vec3 vWorldDirection;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform vec3 uSunDirection;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoefficient;

const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;

// Wavelength-tuned Rayleigh + Mie totals (Preetham primaries 680/550/450 nm).
const vec3 totalRayleigh = vec3( 5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5 );
const float v = 4.0;
const vec3 K = vec3( 0.686, 0.678, 0.666 );
const vec3 MieConst = vec3( 1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14 );

// Earth shadow falloff so sun radiance vanishes below the horizon.
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity( float zenithCos ) {
  zenithCos = clamp( zenithCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithCos ) ) / steepness ) ) );
}

vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10e-18;
  return 0.434 * c * MieConst;
}

void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldDirection = normalize( worldPosition.xyz - cameraPosition );

  // Skybox stays glued to the far plane so it never z-fights with terrain
  // and never clips when pilots climb past the dome radius.
  vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = clip.xyww;

  vSunDirection = normalize( uSunDirection );
  vSunE = sunIntensity( vSunDirection.y );
  // Higher sun = more saturated rayleigh (deeper blue at noon).
  vSunfade = 1.0 - clamp( 1.0 - exp( vSunDirection.y ), 0.0, 1.0 );
  float rayleighCoeff = uRayleigh - ( 1.0 - vSunfade );
  vBetaR = totalRayleigh * rayleighCoeff;
  vBetaM = totalMie( uTurbidity ) * uMieCoefficient;
}
`;

export const hosekWilkieFragmentShader = /* glsl */`
varying vec3 vWorldDirection;
varying vec3 vSunDirection;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
varying float vSunfade;

uniform float uMieDirectionalG;
uniform vec3 uGroundAlbedo;
uniform float uExposure;

const vec3 up = vec3( 0.0, 1.0, 0.0 );
const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4e3;
const float mieZenithLength = 1.25e3;
const float sunAngularDiameterCos = 0.9998;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase( float cosTheta ) {
  return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

float hgPhase( float cosTheta, float g ) {
  float g2 = pow( g, 2.0 );
  float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

void main() {
  vec3 direction = normalize( vWorldDirection );

  float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;

  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

  float cosTheta = dot( direction, vSunDirection );
  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, uMieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;

  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

  // Night-sky floor + sun disc.
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
  L0 += ( vSunE * 19000.0 * Fex ) * sundisc;

  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

  // Hosek-Wilkie's ground-albedo influence: bounce a fraction of the
  // ground color back into the lower hemisphere so beach/desert presets
  // brighten the underside of the dome and forest presets darken it.
  // Cheaper than full HW upper-hemisphere coefficients but captures the
  // visible effect the brief asks for.
  float bounce = max( 0.0, -direction.y );
  texColor += uGroundAlbedo * bounce * 0.35 * ( 0.5 + vSunfade );

  texColor *= uExposure;
  gl_FragColor = vec4( texColor, 1.0 );
}
`;
