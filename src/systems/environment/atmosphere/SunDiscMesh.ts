import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  float,
  length,
  reference,
  smoothstep,
  uv,
  vec2,
} from 'three/tsl';

/**
 * HDR sun-disc overlay rendered per-fragment.
 *
 * Replaces the post-`cycle-sky-visual-restore` `PlaneGeometry +
 * CanvasTexture` sprite. The class name, public API, and tests are
 * preserved — the implementation now renders the disc + aureole entirely
 * in the fragment shader on a larger billboard, so the sun reads as a
 * proper celestial body with a soft glowing halo instead of a small
 * tracking dot.
 *
 * Composition (TSL `colorNode`):
 *   - `r = 2 * length(uv - 0.5)` — 0 at quad center, ~1.41 at the corner.
 *   - Disc: tight bright pearl `smoothstep(0.06, 0.02, r)`.
 *   - Aureole: wide soft halo `smoothstep(0.85, 0.0, r)^2 * 0.5`.
 *   - Final color = `sunColor * (disc + aureole)`.
 *
 * `sunColor` here is pre-multiplied by the elevation-keyed HDR peak in
 * `update()` so the shader stays linear.
 *
 * The plane is enlarged from the prior 28 units to 140 units (≈ 16° at
 * a 500-unit dome) so the aureole has room to fall off smoothly. The
 * per-frame `lookAt(camera)` is preserved — the plane stays anchored at
 * `cameraPos + sunDir * domeRadius * 0.99` (so it tracks the sky
 * direction), and the rotation is sub-arc-second under normal player
 * movement, so the prior "tracking dot" perception goes away once the
 * disc is large enough to read as a sun.
 */

/** Visible plane size in world units against a 500-unit dome. */
const DEFAULT_DISC_SIZE = 140;
/** Just inside the dome so the additive blend reads on top of the painted sky. */
const DOME_INSET = 0.99;
/** Peak linear-radiance multiplier at noon. Matches the prior `HDR_PEAK_MULTIPLIER`. */
const HDR_PEAK_MULTIPLIER = 8.0;
/** Floor so a near-horizon sun still reads as a warm disc. */
const HDR_FLOOR_MULTIPLIER = 1.5;

interface SunDiscUniforms {
  sunColor: { value: THREE.Color };
}

function createSunDiscMaterial(): { material: MeshBasicNodeMaterial; uniforms: SunDiscUniforms } {
  const uniforms: SunDiscUniforms = {
    sunColor: { value: new THREE.Color(1, 1, 1) },
  };
  const material = new MeshBasicNodeMaterial({
    name: 'SunDisc',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });

  const centered = (uv() as any).sub(vec2(0.5, 0.5)) as any;
  const r = (length(centered) as any).mul(2.0);
  const disc = smoothstep(float(0.06), float(0.02), r) as any;
  const aureoleRaw = smoothstep(float(0.85), float(0.0), r) as any;
  const aureole = (aureoleRaw.mul(aureoleRaw) as any).mul(0.5);
  const intensity = (disc.add(aureole) as any);
  const sunColorNode = reference('value', 'color', uniforms.sunColor as any) as any;
  (material as any).colorNode = sunColorNode.mul(intensity);
  (material as any).opacityNode = intensity;
  return { material, uniforms };
}

export class SunDiscMesh {
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: MeshBasicNodeMaterial;
  private readonly uniforms: SunDiscUniforms;
  private readonly mesh: THREE.Mesh;
  private readonly domeRadius: number;
  private readonly scratchColor = new THREE.Color();

  constructor(domeRadius: number, options?: { discSize?: number }) {
    this.domeRadius = domeRadius;
    const size = options?.discSize ?? DEFAULT_DISC_SIZE;

    const { material, uniforms } = createSunDiscMaterial();
    this.material = material;
    this.uniforms = uniforms;
    this.geometry = new THREE.PlaneGeometry(size, size);
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
   * Per-frame update. Anchors the plane at `cameraPos + sunDir * r` and
   * billboards it to the camera. `sunColor` is pre-multiplied by an
   * elevation-keyed HDR peak so the per-fragment shader can paint the
   * disc + aureole in linear radiance without renderer tonemapping.
   */
  update(
    cameraPos: THREE.Vector3,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
  ): void {
    if (sunDirection.y < 0) {
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
  }

  /** Material handle for tests / debug overlays. */
  getMaterial(): MeshBasicNodeMaterial {
    return this.material;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
