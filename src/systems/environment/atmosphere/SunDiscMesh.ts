import * as THREE from 'three';

/**
 * Additive HDR sun-disc sprite restored after the WebGPU + TSL migration.
 *
 * The post-merge sky-dome bakes a 128x64 `DataTexture` and renders it
 * via `MeshBasicMaterial`. That path clamps radiance into `[0,1]`
 * before sRGB encode, so the pre-merge `vSunE * 19000.0 * Fex` HDR
 * pin-point that read as the bright "pearl" sun is gone. The dome's
 * existing `mixSunDisc` composite stays as the soft glow; this class
 * adds back the bright pin-point on top.
 *
 * Design (per `cycle-sky-visual-restore` / `sky-sun-disc-restore`):
 *   - `Mesh(PlaneGeometry, MeshBasicMaterial)` at `sunDir * domeR * 0.99`.
 *   - Material flags pin it outside the renderer's ACES tonemap path
 *     (`toneMapped: false`), additive in HDR linear (`AdditiveBlending`),
 *     depth-agnostic (`depthWrite/Test: false`) so the dome's
 *     `renderOrder = -1` paint never occludes it.
 *   - The plane billboards to the camera each frame.
 *   - The disc hides when `sunDirection.y < 0`.
 *
 * HDR intensity. With the upstream `sky-hdr-bake-restore` task moving
 * the sky bake to half-float HDR, this sprite writes linear radiance
 * values directly. We multiply the caller's `sunColor` (already
 * Fex-attenuated via `HosekWilkieSkyBackend.getSun`) by an elevation-
 * keyed HDR peak that mirrors the pre-merge `EE * sunIntensity` curve.
 *
 * Test posture: the canvas-backed gradient is best-effort — when
 * `document` is unavailable (Vitest node env) the mesh constructs with
 * a null map and the material flags + position behaviour stay
 * exercisable, per `docs/TESTING.md`.
 */

/** Visible angular radius of the disc in world units against `DOME_RADIUS`. */
const DEFAULT_DISC_SIZE = 28;
/** Just inside the dome so the additive blend reads on top of the painted background. */
const DOME_INSET = 0.99;
/** Texture resolution for the radial-falloff gradient (cheap, sRGB alpha mask). */
const TEXTURE_PX = 128;
/**
 * Peak linear-radiance multiplier at noon. Pre-merge GLSL ran
 * `vSunE * 19000.0 * Fex`; on the half-float HDR sky path the renderer
 * can take the un-clamped value through `toneMapped: false`. The
 * multiplier here approximates `EE * 19000 / peak-norm` after the
 * `HosekWilkieSkyBackend.getSun` chromaticity normalisation. Tuned to
 * match the pre-merge pearl brightness without saturating ACES on
 * downstream readers that DO get tonemapped.
 */
const HDR_PEAK_MULTIPLIER = 8.0;
/** Floor so a near-horizon sun still reads as a warm disc, not a dim spot. */
const HDR_FLOOR_MULTIPLIER = 1.5;

function createRadialGradientTexture(): THREE.Texture | null {
  // Guard for node test environments. The behaviour contract does not
  // depend on the texture bytes; we only need the material to construct.
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return null;
  }
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = TEXTURE_PX / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Bright opaque core with a smooth radial falloff — additive blend on
  // top of the dome reads as a glowing pearl, not a hard disc.
  gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  gradient.addColorStop(0.15, 'rgba(255,255,240,0.95)');
  gradient.addColorStop(0.35, 'rgba(255,240,210,0.55)');
  gradient.addColorStop(0.65, 'rgba(255,210,150,0.18)');
  gradient.addColorStop(1.0, 'rgba(255,180,120,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class SunDiscMesh {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly map: THREE.Texture | null;
  private readonly domeRadius: number;
  private readonly scratchColor = new THREE.Color();

  constructor(domeRadius: number, options?: { discSize?: number }) {
    this.domeRadius = domeRadius;
    const size = options?.discSize ?? DEFAULT_DISC_SIZE;

    this.map = createRadialGradientTexture();
    this.geometry = new THREE.PlaneGeometry(size, size);
    this.material = new THREE.MeshBasicMaterial({
      name: 'SunDisc',
      map: this.map ?? undefined,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'SunDiscSprite';
    this.mesh.frustumCulled = false;
    // Render after the dome (`renderOrder = -1`) so the additive blend
    // composites against the painted sky background, not before it.
    this.mesh.renderOrder = 0;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.visible = false;
  }

  /** Returns the disc mesh so `AtmosphereSystem` can attach it to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Per-frame update. Called by `AtmosphereSystem` after the backend has
   * settled `sunDirection` + `sunColor`. The camera anchors the disc to
   * the dome-relative origin (the dome itself follows the camera) and
   * billboards the plane to face the viewer.
   *
   *   sunDirection : authoritative unit vector from `AtmosphereSystem`.
   *   sunColor     : peak-normalised chromaticity from the backend's
   *                  `getSun` transmittance path.
   *   cameraPos    : world-space camera position; the disc anchors
   *                  relative to this so it tracks the dome.
   */
  update(
    cameraPos: THREE.Vector3,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color
  ): void {
    // Sub-horizon sun: hide. The sky-dome paints dusk/night colors
    // already; a bright additive disc punching through terrain would be
    // worse than no disc at all.
    if (sunDirection.y < 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // Position on the dome, anchored to the camera so the sprite stays
    // at the same apparent direction as the camera moves through the
    // world (the dome itself follows the camera too).
    const r = this.domeRadius * DOME_INSET;
    this.mesh.position.set(
      cameraPos.x + sunDirection.x * r,
      cameraPos.y + sunDirection.y * r,
      cameraPos.z + sunDirection.z * r
    );
    // Billboard: face the camera every frame. PlaneGeometry's quad lies
    // in its local XY plane facing +Z, so `lookAt` aimed back at the
    // camera orients the quad's front face toward the viewer.
    this.mesh.lookAt(cameraPos);

    // HDR intensity: scale the (already Fex-attenuated) sun chromaticity
    // by an elevation-keyed peak. `sunDirection.y` is the sine of the
    // sun elevation — near 1 at noon, near 0 at horizon. The smoothstep
    // approximates the pre-merge `EE * sunIntensity` falloff so the disc
    // dims softly as the sun drops, without ever going pitch-black above
    // the horizon.
    const elev = Math.max(0, Math.min(1, sunDirection.y));
    const peakFactor =
      HDR_FLOOR_MULTIPLIER +
      (HDR_PEAK_MULTIPLIER - HDR_FLOOR_MULTIPLIER) * (elev * elev);
    this.scratchColor.copy(sunColor).multiplyScalar(peakFactor);
    this.material.color.copy(this.scratchColor);
  }

  /** Material handle for tests / debug overlays. */
  getMaterial(): THREE.MeshBasicMaterial {
    return this.material;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    if (this.map) this.map.dispose();
  }
}
