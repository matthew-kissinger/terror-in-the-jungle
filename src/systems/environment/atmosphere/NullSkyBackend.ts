import * as THREE from 'three';
import type { ISkyBackend } from './ISkyBackend';

/**
 * Default sky backend for cycle 2026-04-20: returns the same constants the
 * legacy `Skybox` + `GameRenderer.setupLighting()` setup produces, so that
 * `AtmosphereSystem` is a pure no-op architecturally and visually until a
 * real backend (Hosek-Wilkie, prebaked cubemap, etc.) is wired in.
 *
 * Constants mirrored from `GameRenderer.setupLighting()`:
 * - sun color: 0xfffacd (warm "moon" directional)
 * - sun direction: normalize(0, 80, -50)
 * - zenith: 0x87ceeb (hemisphere sky blue)
 * - horizon: 0x5a7a6a (muted-green fog color)
 *
 * Sky color along an arbitrary direction is interpolated linearly between
 * horizon and zenith based on the y component, which is sufficient for the
 * downstream fog-tint hookup planned in `atmosphere-fog-tinted-by-sky`.
 */
export class NullSkyBackend implements ISkyBackend {
  private static readonly SUN_COLOR_HEX = 0xfffacd;
  private static readonly ZENITH_HEX = 0x87ceeb;
  private static readonly HORIZON_HEX = 0x5a7a6a;

  private readonly sunColor = new THREE.Color(NullSkyBackend.SUN_COLOR_HEX);
  private readonly zenithColor = new THREE.Color(NullSkyBackend.ZENITH_HEX);
  private readonly horizonColor = new THREE.Color(NullSkyBackend.HORIZON_HEX);

  update(_deltaTime: number, _sunDirection: THREE.Vector3): void {
    // Constants only; no per-frame work for the null backend.
  }

  sample(dir: THREE.Vector3, out: THREE.Color): THREE.Color {
    // Map dir.y in [-1, 1] to a [0, 1] mix factor: horizon at y=0, zenith at y=1.
    const y = Math.max(0, Math.min(1, dir.y));
    out.copy(this.horizonColor).lerp(this.zenithColor, y);
    return out;
  }

  getSun(out: THREE.Color): THREE.Color {
    return out.copy(this.sunColor);
  }

  getZenith(out: THREE.Color): THREE.Color {
    return out.copy(this.zenithColor);
  }

  getHorizon(out: THREE.Color): THREE.Color {
    return out.copy(this.horizonColor);
  }
}
