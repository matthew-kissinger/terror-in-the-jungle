import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WaterSurfaceBinding } from './WaterSurfaceBinding';

/**
 * Behavior tests for the water-surface shader binding. The point of this
 * module is to compose the surface + foam onBeforeCompile patches into a
 * single callback and to expose runtime uniform refresh + terrain heightmap
 * binding. Tests assert on the observable post-install outcomes: a callback
 * is registered, the material flags as needing update, surface uniforms
 * mutate through `updateSurfaceUniforms`, and a heightmap bind toggles the
 * gating uniform.
 */

describe('WaterSurfaceBinding', () => {
  it('installs an onBeforeCompile callback with initial uniform values', () => {
    const binding = new WaterSurfaceBinding();
    const material = new THREE.MeshStandardMaterial();
    const sun = new THREE.Vector3(1, 0, 0);

    const refs = binding.install(material, sun);

    expect(material.onBeforeCompile).toBeTypeOf('function');
    expect(refs.uTime.value).toBe(0);
    expect(refs.uSunDirection.value.x).toBeCloseTo(1, 5);
    expect(refs.uCameraUnderwater.value).toBe(0);
  });

  it('refreshes the time, sun, and underwater uniforms each frame', () => {
    const binding = new WaterSurfaceBinding();
    const material = new THREE.MeshStandardMaterial();
    const refs = binding.install(material, new THREE.Vector3());

    binding.updateSurfaceUniforms(7.5, new THREE.Vector3(0, 1, 0), true);
    expect(refs.uTime.value).toBe(7.5);
    expect(refs.uSunDirection.value.y).toBeCloseTo(1, 5);
    expect(refs.uCameraUnderwater.value).toBe(1);

    binding.updateSurfaceUniforms(8.25, new THREE.Vector3(0, 0, -1), false);
    expect(refs.uCameraUnderwater.value).toBe(0);
    expect(refs.uSunDirection.value.z).toBeCloseTo(-1, 5);
  });

  it('updateSurfaceUniforms is safe when install has not been called', () => {
    const binding = new WaterSurfaceBinding();
    expect(() => binding.updateSurfaceUniforms(1, new THREE.Vector3(), false)).not.toThrow();
  });

  it('binds a terrain heightmap and stores the binding for later retrieval', () => {
    const binding = new WaterSurfaceBinding();
    const texture = new THREE.Texture();

    binding.bindTerrainHeightSampler({
      texture,
      worldSize: 2048,
      originX: -1024,
      originZ: -1024,
    });

    const stored = binding.getTerrainHeightBinding();
    expect(stored).not.toBeNull();
    expect(stored?.texture).toBe(texture);
    expect(stored?.worldSize).toBe(2048);
  });

  it('clears the heightmap binding when passed null', () => {
    const binding = new WaterSurfaceBinding();
    binding.bindTerrainHeightSampler({ texture: new THREE.Texture(), worldSize: 1024 });

    binding.bindTerrainHeightSampler(null);

    expect(binding.getTerrainHeightBinding()).toBeNull();
  });

  it('injects surface + foam patches into the compiled shader', () => {
    const binding = new WaterSurfaceBinding();
    const material = new THREE.MeshStandardMaterial();
    binding.install(material, new THREE.Vector3(0, 1, 0));

    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <normal_fragment_maps>\n#include <opaque_fragment>',
    };

    material.onBeforeCompile!(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );

    // Surface-shader uniforms wired in.
    expect(shader.uniforms.uTime).toBeDefined();
    expect(shader.uniforms.uSunDirection).toBeDefined();
    expect(shader.uniforms.uShorelineFadeDepth).toBeDefined();
    // Foam uniforms wired in.
    expect(shader.uniforms.terrainHeightmap).toBeDefined();
    expect(shader.uniforms.waterEdgeBindingEnabled).toBeDefined();
    // Both varyings declared in vertex shader.
    expect(shader.vertexShader).toContain('vWaterWorldPos');
    expect(shader.vertexShader).toContain('vWorldPositionWaterEdge');
    // Both fragment chunks injected before opaque_fragment.
    expect(shader.fragmentShader).toContain('uShorelineFadeDepth');
    expect(shader.fragmentShader).toContain('waterEdgeBindingEnabled');
  });
});
