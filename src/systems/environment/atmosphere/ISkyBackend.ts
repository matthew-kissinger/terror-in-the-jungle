import * as THREE from 'three';

/**
 * Backend contract for sky models consumed by `AtmosphereSystem`.
 *
 * Concrete backends (see `docs/ATMOSPHERE.md`):
 * - `HosekWilkieSkyBackend` (current default, Combo A v1): analytic dome.
 * - Hillaire prebaked cubemap (Combo E, v2).
 * - Volumetric raymarch for fly-through (Combo F, v3).
 *
 * Backends are responsible for sun position, sun color, and sky color at any
 * direction. `AtmosphereSystem` adapts these into the public `ISkyRuntime`
 * surface. All getters write into the caller-supplied `out` and return it.
 */
export interface ISkyBackend {
  /**
   * Per-frame update; backends may cache or rebake here. `sunDirection` is the
   * authoritative sun unit vector for this frame, supplied by `AtmosphereSystem`.
   */
  update(deltaTime: number, sunDirection: THREE.Vector3): void;
  /** Sky color along an arbitrary view direction (typically post-normalized). */
  sample(dir: THREE.Vector3, out: THREE.Color): THREE.Color;
  /** Sun color after atmospheric transmittance. */
  getSun(out: THREE.Color): THREE.Color;
  /** Sky color at the zenith. */
  getZenith(out: THREE.Color): THREE.Color;
  /** Sky color at the horizon (averaged ring). */
  getHorizon(out: THREE.Color): THREE.Color;
}
