import * as THREE from 'three';

export interface NPCShaderSettings {
  celShadingEnabled: boolean;
  rimLightingEnabled: boolean;
  auraEnabled: boolean;
  auraIntensity: number;
}

export type ShaderPreset = 'default' | 'cel-shaded' | 'minimal' | 'intense' | 'tactical';

export interface ShaderUniformSettings {
  celShadingEnabled: number;
  rimLightingEnabled: number;
  auraEnabled: number;
  auraIntensity: number;
}

const defaultShaderUniformSettings: ShaderUniformSettings = {
  celShadingEnabled: 1.0,
  rimLightingEnabled: 1.0,
  auraEnabled: 1.0,
  auraIntensity: 0.5
};

const shaderPresets: Record<ShaderPreset, NPCShaderSettings> = {
  default: {
    celShadingEnabled: true,
    rimLightingEnabled: true,
    auraEnabled: true,
    auraIntensity: 0.5
  },
  'cel-shaded': {
    celShadingEnabled: true,
    rimLightingEnabled: false,
    auraEnabled: false,
    auraIntensity: 0.0
  },
  minimal: {
    celShadingEnabled: false,
    rimLightingEnabled: false,
    auraEnabled: false,
    auraIntensity: 0.0
  },
  intense: {
    celShadingEnabled: true,
    rimLightingEnabled: true,
    auraEnabled: true,
    auraIntensity: 1.0
  },
  tactical: {
    celShadingEnabled: false,
    rimLightingEnabled: true,
    auraEnabled: true,
    auraIntensity: 0.3
  }
};

const presetToUniformSettings = (settings: NPCShaderSettings): ShaderUniformSettings => ({
  celShadingEnabled: settings.celShadingEnabled ? 1.0 : 0.0,
  rimLightingEnabled: settings.rimLightingEnabled ? 1.0 : 0.0,
  auraEnabled: settings.auraEnabled ? 1.0 : 0.0,
  auraIntensity: settings.auraIntensity
});

const NPC_LIGHT_SCALE_REFERENCE_LUMA = 1.272;
const NPC_LIGHT_SCALE_MIN = 0.5;
const NPC_LIGHT_SCALE_MAX = 1.12;
const NPC_FOG_DEFAULT_DENSITY = 0.00055;
const NPC_FOG_MAX_DENSITY = 0.002;
const NPC_FOG_DEFAULT_NEAR = 100;
const NPC_FOG_DEFAULT_FAR = 600;

const scratchNpcSkyColor = new THREE.Color(1, 1, 1);
const scratchNpcGroundColor = new THREE.Color(0.35, 0.35, 0.3);
const scratchNpcSunColor = new THREE.Color(1, 1, 1);
const scratchNpcFogColor = new THREE.Color(0x7a8f88);
const scratchLightColor = new THREE.Color();

interface NpcAtmosphereSnapshot {
  lightingEnabled: boolean;
  lightScale: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  sunColor: THREE.Color;
  fogMode: number;
  fogColor: THREE.Color;
  fogDensity: number;
  fogNear: number;
  fogFar: number;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const colorLuma = (color: THREE.Color): number => (
  0.299 * color.r + 0.587 * color.g + 0.114 * color.b
);

const resolveNpcAtmosphereSnapshot = (scene?: THREE.Scene): NpcAtmosphereSnapshot => {
  let skyWeight = 0;
  let groundWeight = 0;
  let sunWeight = 0;
  let lightMetric = 0;

  scratchNpcSkyColor.setRGB(0, 0, 0);
  scratchNpcGroundColor.setRGB(0, 0, 0);
  scratchNpcSunColor.setRGB(0, 0, 0);
  scratchNpcFogColor.set(0x7a8f88);

  let fogMode = 0;
  let fogDensity = NPC_FOG_DEFAULT_DENSITY;
  let fogNear = NPC_FOG_DEFAULT_NEAR;
  let fogFar = NPC_FOG_DEFAULT_FAR;

  if (scene?.fog instanceof THREE.FogExp2) {
    fogMode = 1;
    scratchNpcFogColor.copy(scene.fog.color);
    fogDensity = clamp(scene.fog.density, 0, NPC_FOG_MAX_DENSITY);
  } else if (scene?.fog instanceof THREE.Fog) {
    fogMode = 2;
    scratchNpcFogColor.copy(scene.fog.color);
    fogNear = scene.fog.near;
    fogFar = scene.fog.far;
  }

  for (const child of scene?.children ?? []) {
    if (child instanceof THREE.HemisphereLight) {
      const intensity = child.intensity;
      scratchLightColor.copy(child.color).multiplyScalar(intensity);
      scratchNpcSkyColor.add(scratchLightColor);
      skyWeight += intensity;
      lightMetric += colorLuma(scratchLightColor) * 0.65;

      scratchLightColor.copy(child.groundColor).multiplyScalar(intensity);
      scratchNpcGroundColor.add(scratchLightColor);
      groundWeight += intensity;
      lightMetric += colorLuma(scratchLightColor) * 0.35;
    } else if (child instanceof THREE.DirectionalLight) {
      const intensity = child.intensity;
      scratchLightColor.copy(child.color).multiplyScalar(intensity);
      scratchNpcSunColor.add(scratchLightColor);
      sunWeight += intensity;
      lightMetric += colorLuma(scratchLightColor) * 0.35;
    }
  }

  const lightingEnabled = skyWeight > 0 || groundWeight > 0 || sunWeight > 0;
  if (skyWeight > 0) {
    scratchNpcSkyColor.multiplyScalar(1 / skyWeight);
  } else {
    scratchNpcSkyColor.setRGB(1, 1, 1);
  }
  if (groundWeight > 0) {
    scratchNpcGroundColor.multiplyScalar(1 / groundWeight);
  } else {
    scratchNpcGroundColor.setRGB(0.35, 0.35, 0.3);
  }
  if (sunWeight > 0) {
    scratchNpcSunColor.multiplyScalar(1 / sunWeight);
  } else {
    scratchNpcSunColor.setRGB(1, 1, 1);
  }

  return {
    lightingEnabled,
    lightScale: lightingEnabled
      ? clamp(lightMetric / NPC_LIGHT_SCALE_REFERENCE_LUMA, NPC_LIGHT_SCALE_MIN, NPC_LIGHT_SCALE_MAX)
      : 1,
    skyColor: scratchNpcSkyColor,
    groundColor: scratchNpcGroundColor,
    sunColor: scratchNpcSunColor,
    fogMode,
    fogColor: scratchNpcFogColor,
    fogDensity,
    fogNear,
    fogFar,
  };
};

export class CombatantShaderSettingsManager {
  private settings: ShaderUniformSettings;

  constructor(initialSettings: ShaderUniformSettings = defaultShaderUniformSettings) {
    this.settings = { ...initialSettings };
  }

  applyPreset(preset: ShaderPreset): void {
    this.setSettings(presetToUniformSettings(shaderPresets[preset]));
  }

  getSettings(): NPCShaderSettings {
    return {
      celShadingEnabled: this.settings.celShadingEnabled > 0.5,
      rimLightingEnabled: this.settings.rimLightingEnabled > 0.5,
      auraEnabled: this.settings.auraEnabled > 0.5,
      auraIntensity: this.settings.auraIntensity
    };
  }

  toggleCelShading(): void {
    this.settings.celShadingEnabled = this.settings.celShadingEnabled > 0.5 ? 0.0 : 1.0;
  }

  toggleRimLighting(): void {
    this.settings.rimLightingEnabled = this.settings.rimLightingEnabled > 0.5 ? 0.0 : 1.0;
  }

  toggleAura(): void {
    this.settings.auraEnabled = this.settings.auraEnabled > 0.5 ? 0.0 : 1.0;
  }

  setSettings(settings: Partial<ShaderUniformSettings>): void {
    Object.assign(this.settings, settings);
  }
}

export const updateShaderUniforms = (
  materials: Map<string, THREE.ShaderMaterial>,
  camera: THREE.Camera,
  scene?: THREE.Scene
): void => {
  const time = performance.now() * 0.001;
  const atmosphere = resolveNpcAtmosphereSnapshot(scene);

  materials.forEach(material => {
    if (material instanceof THREE.ShaderMaterial && material.uniforms) {
      if (material.uniforms.time) {
        material.uniforms.time.value = time;
      }
      if (material.uniforms.cameraPosition) {
        material.uniforms.cameraPosition.value.copy(camera.position);
      }
      if (material.uniforms.npcLightingEnabled) {
        material.uniforms.npcLightingEnabled.value = atmosphere.lightingEnabled ? 1 : 0;
      }
      if (material.uniforms.npcAtmosphereLightScale) {
        material.uniforms.npcAtmosphereLightScale.value = atmosphere.lightScale;
      }
      if (material.uniforms.npcSkyColor) {
        material.uniforms.npcSkyColor.value.copy(atmosphere.skyColor);
      }
      if (material.uniforms.npcGroundColor) {
        material.uniforms.npcGroundColor.value.copy(atmosphere.groundColor);
      }
      if (material.uniforms.npcSunColor) {
        material.uniforms.npcSunColor.value.copy(atmosphere.sunColor);
      }
      if (material.uniforms.npcFogMode) {
        material.uniforms.npcFogMode.value = atmosphere.fogMode;
      }
      if (material.uniforms.npcFogColor) {
        material.uniforms.npcFogColor.value.copy(atmosphere.fogColor);
      }
      if (material.uniforms.npcFogDensity) {
        material.uniforms.npcFogDensity.value = atmosphere.fogDensity;
      }
      if (material.uniforms.npcFogNear) {
        material.uniforms.npcFogNear.value = atmosphere.fogNear;
      }
      if (material.uniforms.npcFogFar) {
        material.uniforms.npcFogFar.value = atmosphere.fogFar;
      }
    }
  });
};

export const setDamageFlash = (
  combatantStates: Map<string, { state: number; damaged: number }>,
  combatantId: string,
  intensity: number
): void => {
  combatantStates.set(combatantId, {
    state: combatantStates.get(combatantId)?.state || 0,
    damaged: intensity
  });

  if (intensity > 0) {
    setTimeout(() => {
      const state = combatantStates.get(combatantId);
      if (state && state.damaged > 0) {
        state.damaged = Math.max(0, state.damaged - 0.1);
      }
    }, 100);
  }
};

export const createOutlineMaterial = (
  texture: THREE.Texture,
  outlineColor: THREE.Color
): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    vertexShader: getOutlineVertexShader(),
    fragmentShader: getOutlineFragmentShader(),
    uniforms: {
      map: { value: texture },
      outlineColor: { value: outlineColor },
      combatState: { value: 0.0 },
      time: { value: 0.0 }
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
};

function getOutlineVertexShader(): string {
  return `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        // Standard billboard transformation
        vec4 worldPos = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * worldPos;
      }
    `;
}

function getOutlineFragmentShader(): string {
  return `
      uniform sampler2D map;
      uniform vec3 outlineColor;
      uniform float combatState;
      uniform float time;

      varying vec2 vUv;

      void main() {
        // Sample the texture
        vec4 texColor = texture2D(map, vUv);

        // Only show outline where sprite has alpha
        if (texColor.a < 0.3) discard;

        // Pulse brightness during combat
        float pulse = 1.0 + sin(time * 4.0) * 0.2 * combatState;
        float brightness = 0.8 + combatState * 0.2;
        brightness *= pulse;

        // Output solid outline color
        gl_FragColor = vec4(outlineColor * brightness, texColor.a);
      }
    `;
}
