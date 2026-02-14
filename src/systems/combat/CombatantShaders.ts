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

export const defaultShaderUniformSettings: ShaderUniformSettings = {
  celShadingEnabled: 1.0,
  rimLightingEnabled: 1.0,
  auraEnabled: 1.0,
  auraIntensity: 0.5
};

export const shaderPresets: Record<ShaderPreset, NPCShaderSettings> = {
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

export const presetToUniformSettings = (settings: NPCShaderSettings): ShaderUniformSettings => ({
  celShadingEnabled: settings.celShadingEnabled ? 1.0 : 0.0,
  rimLightingEnabled: settings.rimLightingEnabled ? 1.0 : 0.0,
  auraEnabled: settings.auraEnabled ? 1.0 : 0.0,
  auraIntensity: settings.auraIntensity
});

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
  camera: THREE.Camera
): void => {
  const time = performance.now() * 0.001;

  materials.forEach(material => {
    if (material instanceof THREE.ShaderMaterial && material.uniforms) {
      if (material.uniforms.time) {
        material.uniforms.time.value = time;
      }
      if (material.uniforms.cameraPosition) {
        material.uniforms.cameraPosition.value = camera.position;
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

export const getOutlineVertexShader = (): string => {
  return `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        // Standard billboard transformation
        vec4 worldPos = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * worldPos;
      }
    `;
};

export const getOutlineFragmentShader = (): string => {
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
};

export const getNPCFragmentShader = (): string => {
  return `
      uniform sampler2D map;
      uniform float faction;
      uniform float combatState;
      uniform float time;
      uniform float damaged;
      uniform float celShadingEnabled;
      uniform float rimLightingEnabled;
      uniform float auraEnabled;
      uniform float auraIntensity;
      uniform vec3 ambientLight;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDirection;

      vec3 applyCelShading(vec3 color) {
        float NdotL = dot(normalize(vNormal), normalize(sunDirection));
        float lightIntensity = NdotL * 0.5 + 0.5;
        float celBands = 3.0;
        lightIntensity = floor(lightIntensity * celBands) / celBands;
        vec3 shadedColor = color * (0.4 + lightIntensity * 0.6);
        return shadedColor;
      }

      float calculateRimLight() {
        float rim = 1.0 - max(0.0, dot(vViewDirection, vNormal));
        rim = pow(rim, 2.0);
        return rim;
      }

      vec3 getFactionColor() {
        return mix(vec3(0.2, 0.4, 1.0), vec3(1.0, 0.2, 0.2), faction);
      }

      void main() {
        vec4 texColor = texture2D(map, vUv);
        if (texColor.a < 0.5) discard;

        vec3 finalColor = texColor.rgb;

        if (celShadingEnabled > 0.5) {
          finalColor = applyCelShading(finalColor);
        }

        if (auraEnabled > 0.5) {
          vec3 factionColor = getFactionColor();
          float edgeAlpha = 1.0 - smoothstep(0.5, 0.9, texColor.a);
          float pulse = 1.0 + sin(time * 3.0 + vWorldPosition.x * 0.1) * 0.3 * combatState;
          float auraStrength = auraIntensity * (0.3 + combatState * 0.4) * pulse;
          finalColor = mix(finalColor, finalColor + factionColor * 0.5, edgeAlpha * auraStrength);
        }

        if (rimLightingEnabled > 0.5) {
          float rim = calculateRimLight();
          vec3 rimColor = getFactionColor();
          float rimIntensity = 0.3 + combatState * 0.4;
          finalColor += rimColor * rim * rimIntensity;
        }

        if (damaged > 0.0) {
          vec3 flashColor = vec3(1.0, 0.8, 0.8);
          finalColor = mix(finalColor, flashColor, damaged * 0.7);
        }

        if (combatState > 0.0) {
          vec3 combatTint = getFactionColor() * 0.15;
          finalColor = mix(finalColor, finalColor + combatTint, combatState);
        }

        // Keep combatants readable at mid/far ranges in jungle lighting.
        finalColor = finalColor * 1.18 + vec3(0.045);
        finalColor = clamp(finalColor, 0.0, 1.0);

        gl_FragColor = vec4(finalColor, texColor.a);
      }
    `;
};
