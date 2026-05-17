import * as THREE from 'three';

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
//   - HYDROLOGY_RIVER_FOAM_INTENSITY: 0.45 — brightness of the foam
//     contribution above the bank → shallow → deep gradient. The
//     terrain-water-edge foam (R1) uses 0.55; the river-flow foam is a
//     hair softer so the two read as distinct effects.
export const HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S = 0.45;
export const HYDROLOGY_RIVER_NORMAL_REPEAT_ALONG_M = 6;
export const HYDROLOGY_RIVER_NORMAL_REPEAT_ACROSS_M = 3;
export const HYDROLOGY_RIVER_NORMAL_SCALE = 0.32;
export const HYDROLOGY_RIVER_FOAM_INTENSITY = 0.45;
export const HYDROLOGY_RIVER_FOAM_COLOR = new THREE.Color(0xe9efe8);

/**
 * Uniforms captured at compile time on the hydrology river material's
 * `onBeforeCompile` patch (see {@link installHydrologyRiverFlowPatch}).
 * `uTime` is advanced from the owning `WaterSystem.update()`. The other
 * slots stay constant after binding — they control the per-segment
 * normal-scroll speed and the foam mix that fires where channels narrow
 * or pass over a depth change.
 */
export interface HydrologyRiverShaderRefs {
  uTime: { value: number };
  uFlowSpeed: { value: number };
  uFoamIntensity: { value: number };
  uFoamColor: { value: THREE.Color };
  uRiverNormalMap: { value: THREE.Texture | null };
  uRiverNormalScale: { value: number };
}

/**
 * Install the flow-visuals `onBeforeCompile` patch on the hydrology river
 * material. The patch:
 *   1. Reads two vertex attributes baked by `HydrologyRiverGeometry`:
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
 *
 * Returns the captured uniform refs so the caller can tick `uTime` per
 * frame and late-bind the normal texture if it loads after install.
 */
export function installHydrologyRiverFlowPatch(
  material: THREE.MeshStandardMaterial,
  initialNormalMap: THREE.Texture | null,
): HydrologyRiverShaderRefs {
  const refs: HydrologyRiverShaderRefs = {
    uTime: { value: 0 },
    uFlowSpeed: { value: HYDROLOGY_RIVER_FLOW_SPEED_M_PER_S },
    uFoamIntensity: { value: HYDROLOGY_RIVER_FOAM_INTENSITY },
    uFoamColor: { value: HYDROLOGY_RIVER_FOAM_COLOR.clone() },
    uRiverNormalMap: { value: initialNormalMap },
    uRiverNormalScale: { value: HYDROLOGY_RIVER_NORMAL_SCALE },
  };

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
      // outgoingLight before <opaque_fragment> writes gl_FragColor.
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
  return refs;
}
