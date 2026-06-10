// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { updateShaderUniforms } from './CombatantShaders';

function createNpcUniformMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      cameraPosition: { value: new THREE.Vector3() },
      npcLightingEnabled: { value: 0 },
      npcAtmosphereLightScale: { value: 1 },
      npcSkyColor: { value: new THREE.Color() },
      npcGroundColor: { value: new THREE.Color() },
      npcSunColor: { value: new THREE.Color() },
      npcFogMode: { value: 0 },
      npcFogColor: { value: new THREE.Color() },
      npcFogDensity: { value: 0 },
      npcFogNear: { value: 0 },
      npcFogFar: { value: 0 },
    },
    vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });
}

describe('CombatantShaders NPC atmosphere uniforms', () => {
  it('forwards scene camera and fog, and keeps lighting rig-owned (no scene-scan) into NPC impostor materials', () => {
    // Since `legacy-path-deletion` the impostor reads the shared lighting rig
    // bindings directly as its only lighting path, so the per-material atmosphere
    // lighting stays disabled even with scene lights present (single authority).
    // Camera + fog still forward.
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x112233, 0.004);
    scene.add(new THREE.HemisphereLight(0xe8f1db, 0x4b5a3f, 1.45));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const material = createNpcUniformMaterial();

    updateShaderUniforms(new Map([['US_idle', material]]), camera, scene);

    expect(material.uniforms.cameraPosition.value).toEqual(camera.position);
    // Lighting is rig-owned: the scene-scan "second authority" is deleted.
    expect(material.uniforms.npcLightingEnabled.value).toBe(0);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBe(1);
    expect(material.uniforms.npcFogMode.value).toBe(1);
    expect(material.uniforms.npcFogColor.value.getHex()).toBe(0x112233);
    expect(material.uniforms.npcFogDensity.value).toBe(0.002);

    material.dispose();
  });

  it('leaves per-material lighting disabled regardless of scene light intensity (single authority)', () => {
    // The legacy scene-scan derived a per-material light scale from the scene
    // hemisphere/directional lights. That second authority is deleted; the rig
    // owns lighting, so no scene-light configuration enables per-material lighting.
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xc6d7ff, 0x22283a, 0.95));
    scene.add(new THREE.DirectionalLight(0xff9a65, 0.7));
    const camera = new THREE.PerspectiveCamera();
    const material = createNpcUniformMaterial();

    updateShaderUniforms(new Map([['NVA_idle', material]]), camera, scene);

    expect(material.uniforms.npcLightingEnabled.value).toBe(0);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBe(1);

    material.dispose();
  });

  it('forwards linear fog parameters used by visual proof scenes', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87929a, 5, 16);
    const camera = new THREE.PerspectiveCamera();
    const material = createNpcUniformMaterial();

    updateShaderUniforms(new Map([['VC_idle', material]]), camera, scene);

    expect(material.uniforms.npcFogMode.value).toBe(2);
    expect(material.uniforms.npcFogColor.value.getHex()).toBe(0x87929a);
    expect(material.uniforms.npcFogNear.value).toBe(5);
    expect(material.uniforms.npcFogFar.value).toBe(16);
    expect(material.uniforms.npcLightingEnabled.value).toBe(0);

    material.dispose();
  });

  it('forwards scene fog while keeping lighting rig-owned even with scene lights present', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x223344, 0.003);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.0));
    const camera = new THREE.PerspectiveCamera();
    const material = createNpcUniformMaterial();

    updateShaderUniforms(new Map([['NVA_idle', material]]), camera, scene);

    expect(material.uniforms.npcFogMode.value).toBe(1);
    expect(material.uniforms.npcFogColor.value.getHex()).toBe(0x223344);
    // Lighting stays rig-owned even with scene lights present (single authority).
    expect(material.uniforms.npcLightingEnabled.value).toBe(0);

    material.dispose();
  });
});
