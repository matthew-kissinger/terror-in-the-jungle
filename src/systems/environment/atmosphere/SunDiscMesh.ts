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
  uv,
  vec2,
  vec3,
} from 'three/tsl';

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
 * `update()` so the shader stays linear.
 *
 * The plane stays anchored at
 * `cameraPos + sunDir * domeRadius * 0.99` (so it tracks the sky
 * direction), and depth testing lets hills/ridges occlude the body.
 */

/** Visible plane size in world units against a 500-unit dome. */
const DEFAULT_DISC_SIZE = 138;
/** Just inside the dome so the additive blend reads on top of the painted sky. */
const DOME_INSET = 0.99;
/** Peak linear-radiance multiplier at noon. */
const HDR_PEAK_MULTIPLIER = 5.2;
/** Floor so a near-horizon sun still reads as a warm disc. */
const HDR_FLOOR_MULTIPLIER = 1.45;
const BODY_RADIUS = 0.245;
const BODY_FEATHER = 0.34;
const HOT_CORE_RADIUS = BODY_RADIUS * 0.74;
const HOT_CORE_FEATHER = BODY_RADIUS * 1.10;
const FALLBACK_TEXTURE_SIZE = 128;

interface SunDiscUniforms {
  sunColor: { value: THREE.Color };
}

interface SunDiscWebGlUniforms {
  [uniform: string]: THREE.IUniform;
  uBodyColor: THREE.IUniform<THREE.Color>;
  uCoreColor: THREE.IUniform<THREE.Color>;
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
  varying vec2 vUv;

  float sunSmoothstep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    vec2 d = vUv - vec2(0.5);
    float r = length(d) * 2.0;
    float plasma = sin(d.x * 142.0 + d.y * 86.0) * sin(d.x * -118.0 + d.y * 178.0);
    plasma = plasma * 0.5 + 0.5;
    float filament = sin(d.x * 231.0 + d.y * -73.0) * sin(d.x * 47.0 + d.y * 211.0);
    filament = filament * 0.5 + 0.5;
    float granule = sin(d.x * 317.0 + d.y * 31.0 + plasma * 2.1) *
      sin(d.x * -29.0 + d.y * 287.0 - filament * 1.7);
    granule = granule * 0.5 + 0.5;
    float bodyR = r + (plasma - 0.5) * 0.105 + (filament - 0.5) * 0.028;
    float coreR = r + (plasma - 0.5) * 0.032;
    float body = 1.0 - sunSmoothstep(${BODY_RADIUS.toFixed(6)}, ${BODY_FEATHER.toFixed(6)}, bodyR);
    float hotCore = 1.0 - sunSmoothstep(${HOT_CORE_RADIUS.toFixed(6)}, ${HOT_CORE_FEATHER.toFixed(6)}, coreR);
    float innerHeat = 1.0 - sunSmoothstep(${(BODY_RADIUS * 0.5).toFixed(6)}, ${HOT_CORE_FEATHER.toFixed(6)}, coreR);
    float edgeFire = clamp(body - hotCore * 0.14, 0.0, 1.0) * (0.86 + plasma * 0.46 + filament * 0.28);
    float amberMass = clamp(edgeFire * 0.86 + body * 0.24, 0.0, 1.0);
    float alpha = clamp(max(amberMass * 0.92, hotCore), 0.0, 1.0);
    vec3 emberColor = mix(vec3(1.0, 0.30, 0.018), uBodyColor, 0.18 + filament * 0.18);
    float coreTexture = clamp(0.52 + plasma * 0.22 + filament * 0.18 + granule * 0.20, 0.0, 1.0);
    float coreHeat = max(hotCore * (0.76 + coreTexture * 0.36), innerHeat * 0.44);
    vec3 hotColor = mix(vec3(1.0, 0.48, 0.045), uCoreColor, clamp(0.62 + coreTexture * 0.28 + hotCore * 0.14, 0.0, 1.0));
    vec3 emberVein = emberColor * clamp((1.0 - coreTexture) * hotCore * 0.20 + filament * edgeFire * 0.18, 0.0, 0.32);
    vec3 rgb = emberColor * amberMass * (0.98 + granule * 0.22) + hotColor * coreHeat + emberVein;
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
      const waveA = Math.sin(nx * 71 + ny * 43);
      const waveB = Math.sin(nx * -59 + ny * 89);
      const plasma = waveA * waveB * 0.5 + 0.5;
      const filament = Math.sin(nx * 115.5 + ny * -36.5) * Math.sin(nx * 23.5 + ny * 105.5) * 0.5 + 0.5;
      const granule =
        Math.sin(nx * 158.5 + ny * 15.5 + plasma * 2.1) *
          Math.sin(nx * -14.5 + ny * 143.5 - filament * 1.7) *
          0.5 +
        0.5;
      const r = Math.hypot(nx, ny);
      const bodyR = r + (plasma - 0.5) * 0.105 + (filament - 0.5) * 0.028;
      const coreR = r + (plasma - 0.5) * 0.032;
      const body = 1 - smoothstepCpu(BODY_RADIUS, BODY_FEATHER, bodyR);
      const hotCore = 1 - smoothstepCpu(HOT_CORE_RADIUS, HOT_CORE_FEATHER, coreR);
      const innerHeat = 1 - smoothstepCpu(BODY_RADIUS * 0.5, HOT_CORE_FEATHER, coreR);
      const edgeFire = Math.max(0, Math.min(1, body - hotCore * 0.14)) * (0.86 + plasma * 0.46 + filament * 0.28);
      const amberMass = Math.max(0, Math.min(1, edgeFire * 0.86 + body * 0.24));
      const alpha = Math.max(amberMass * 0.5, hotCore * 0.62, innerHeat * 0.28);
      const coreTexture = Math.max(0, Math.min(1, 0.52 + plasma * 0.22 + filament * 0.18 + granule * 0.2));
      const heat = Math.max(0, Math.min(1, hotCore * (0.70 + coreTexture * 0.36)));
      const emberVein = Math.max(0, Math.min(0.32, (1 - coreTexture) * hotCore * 0.20 + filament * edgeFire * 0.18));
      const amberR = 255;
      const amberG = 84 + plasma * 74 + filament * 36;
      const amberB = 3 + plasma * 16;
      const hotR = 255;
      const hotG = 160 + coreTexture * 82;
      const hotB = 38 + coreTexture * 166;
      const i = (y * FALLBACK_TEXTURE_SIZE + x) * 4;
      data[i] = Math.round(Math.min(255, amberR + (hotR - amberR) * heat));
      data[i + 1] = Math.round(Math.min(255, amberG + (hotG - amberG) * heat + amberG * emberVein));
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

  const centered = (uv() as any).sub(vec2(0.5, 0.5)) as any;
  const r = (length(centered) as any).mul(2.0);
  const waveA = ((centered as any).x.mul(float(71)).add((centered as any).y.mul(float(43))) as any).sin();
  const waveB = ((centered as any).x.mul(float(-59)).add((centered as any).y.mul(float(89))) as any).sin();
  const plasma = (waveA.mul(waveB) as any).mul(float(0.5)).add(float(0.5));
  const waveC = ((centered as any).x.mul(float(115.5)).add((centered as any).y.mul(float(-36.5))) as any).sin();
  const waveD = ((centered as any).x.mul(float(23.5)).add((centered as any).y.mul(float(105.5))) as any).sin();
  const filament = (waveC.mul(waveD) as any).mul(float(0.5)).add(float(0.5));
  const warpedBodyR = r
    .add(plasma.sub(float(0.5)).mul(float(0.105)) as any)
    .add(filament.sub(float(0.5)).mul(float(0.028)) as any) as any;
  const warpedCoreR = r.add(plasma.sub(float(0.5)).mul(float(0.032)) as any) as any;
  const body = (float(1.0) as any).sub(smoothstep(float(BODY_RADIUS), float(BODY_FEATHER), warpedBodyR) as any);
  const hotCore = (float(1.0) as any).sub(smoothstep(float(HOT_CORE_RADIUS), float(HOT_CORE_FEATHER), warpedCoreR) as any);
  const sunColorNode = reference('value', 'color', uniforms.sunColor as any) as any;
  const waveE = (
    (centered as any).x
      .mul(float(158.5))
      .add((centered as any).y.mul(float(15.5)))
      .add(plasma.mul(float(2.1))) as any
  ).sin();
  const waveF = (
    (centered as any).x
      .mul(float(-14.5))
      .add((centered as any).y.mul(float(143.5)))
      .sub(filament.mul(float(1.7))) as any
  ).sin();
  const granule = (waveE.mul(waveF) as any).mul(float(0.5)).add(float(0.5));
  const innerHeat = (float(1.0) as any).sub(
    smoothstep(float(BODY_RADIUS * 0.5), float(HOT_CORE_FEATHER), warpedCoreR) as any,
  );
  const rimHeat = clamp(
    body
      .sub(hotCore.mul(float(0.14)) as any)
      .mul(plasma.mul(float(0.46)).add(filament.mul(float(0.28)) as any).add(float(0.86))) as any,
    0.0,
    1.0,
  ) as any;
  const emberMass = clamp(rimHeat.mul(float(0.86)).add(body.mul(float(0.24)) as any) as any, 0.0, 1.0) as any;
  const emberTint = mix(
    vec3(7.2, 1.05, 0.02) as any,
    vec3(10.6, 2.65, 0.12) as any,
    plasma.mul(float(0.58)).add(filament.mul(float(0.26)) as any) as any,
  ) as any;
  const amberBody = mix(
    emberTint,
    sunColorNode.mul(vec3(1.75, 0.66, 0.14)).mul(float(1.55)) as any,
    float(0.025),
  ) as any;
  const coreTexture = clamp(
    plasma
      .mul(float(0.22))
      .add(filament.mul(float(0.18)) as any)
      .add(granule.mul(float(0.2)) as any)
      .add(float(0.52)) as any,
    0.0,
    1.0,
  ) as any;
  const coreHeat = max(
    hotCore.mul(coreTexture.mul(float(0.36)).add(float(0.76)) as any) as any,
    innerHeat.mul(float(0.44)) as any,
  ) as any;
  const hotColor = mix(
    vec3(3.4, 0.92, 0.07) as any,
    vec3(4.25, 3.35, 1.72) as any,
    clamp(
      coreTexture
        .mul(float(0.34))
        .add(hotCore.mul(float(0.14)) as any)
        .add(float(0.62)) as any,
      0.0,
      1.0,
    ) as any,
  ) as any;
  const emberVein = emberTint.mul(
    clamp(
      (float(1.0) as any)
        .sub(coreTexture)
        .mul(hotCore)
        .mul(float(0.20))
        .add(filament.mul(rimHeat).mul(float(0.18)) as any) as any,
      0.0,
      0.32,
    ) as any,
  ) as any;
  const rgb = amberBody
    .mul(emberMass.mul(granule.mul(float(0.22)).add(float(0.98)) as any) as any)
    .add(hotColor.mul(coreHeat) as any)
    .add(emberVein) as any;
  const opacity = clamp(max(emberMass, hotCore.mul(float(0.98)) as any), 0.0, 1.0) as any;
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
  };
  return { material, uniforms };
}

function createWebGlSunDiscMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: SunDiscWebGlUniforms;
} {
  const uniforms: SunDiscWebGlUniforms = {
    uBodyColor: { value: new THREE.Color(1.0, 0.55, 0.12) },
    uCoreColor: { value: new THREE.Color(1.0, 0.74, 1.0) },
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
  };
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
   */
  update(
    cameraPos: THREE.Vector3,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
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
    this.webGlBodyColor
      .setRGB(1.0, 0.48, 0.08)
      .lerp(this.scratchColor, 0.18);
    this.webGlBodyColor.r = Math.min(1, this.webGlBodyColor.r);
    this.webGlBodyColor.g = Math.min(0.72, this.webGlBodyColor.g);
    this.webGlBodyColor.b = Math.min(0.24, this.webGlBodyColor.b);
    this.webGlCoreColor.setRGB(1.0, 0.96, 0.92);
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
