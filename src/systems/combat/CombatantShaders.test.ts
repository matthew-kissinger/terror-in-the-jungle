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
  it('forwards scene camera, fog, and selected-profile lighting into NPC impostor materials', () => {
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
    expect(material.uniforms.npcLightingEnabled.value).toBe(1);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBeGreaterThan(0.95);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBeLessThan(1.05);
    expect(material.uniforms.npcFogMode.value).toBe(1);
    expect(material.uniforms.npcFogColor.value.getHex()).toBe(0x112233);
    expect(material.uniforms.npcFogDensity.value).toBe(0.002);

    material.dispose();
  });

  it('darkens impostor atmosphere scale under low-sun lighting profiles', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xc6d7ff, 0x22283a, 0.95));
    scene.add(new THREE.DirectionalLight(0xff9a65, 0.7));
    const camera = new THREE.PerspectiveCamera();
    const material = createNpcUniformMaterial();

    updateShaderUniforms(new Map([['NVA_idle', material]]), camera, scene);

    expect(material.uniforms.npcLightingEnabled.value).toBe(1);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBeLessThan(0.6);
    expect(material.uniforms.npcAtmosphereLightScale.value).toBeGreaterThanOrEqual(0.42);

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
});
