// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

type UniformSlot<T> = { value: T };

export interface CombatantUniformMaterial extends THREE.Material {
  uniforms?: {
    time?: UniformSlot<number>;
    cameraPosition?: UniformSlot<THREE.Vector3>;
    npcLightingEnabled?: UniformSlot<number>;
    npcAtmosphereLightScale?: UniformSlot<number>;
    npcSkyColor?: UniformSlot<THREE.Color>;
    npcGroundColor?: UniformSlot<THREE.Color>;
    npcSunColor?: UniformSlot<THREE.Color>;
    npcFogMode?: UniformSlot<number>;
    npcFogColor?: UniformSlot<THREE.Color>;
    npcFogDensity?: UniformSlot<number>;
    npcFogNear?: UniformSlot<number>;
    npcFogFar?: UniformSlot<number>;
    combatState?: UniformSlot<number>;
  };
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

const NPC_FOG_DEFAULT_DENSITY = 0.00055;
const NPC_FOG_MAX_DENSITY = 0.002;
const NPC_FOG_DEFAULT_NEAR = 100;
const NPC_FOG_DEFAULT_FAR = 600;

const scratchNpcSkyColor = new THREE.Color(1, 1, 1);
const scratchNpcGroundColor = new THREE.Color(0.35, 0.35, 0.3);
const scratchNpcSunColor = new THREE.Color(1, 1, 1);
const scratchNpcFogColor = new THREE.Color(0x7a8f88);

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

/**
 * NPC impostor atmosphere snapshot — fog only.
 *
 * Since `legacy-path-deletion` (Phase 4) the impostor shader reads the shared
 * `lightingRigBindings` (updated once per frame by AtmosphereSystem) directly as
 * its only lighting path, so the legacy per-material atmosphere-lighting uniforms
 * are inert: this writes a neutral snapshot with `lightingEnabled = false`. The
 * old `scene.children` scan (the memo's "second authority") is DELETED — there is
 * one lighting authority now. Fog is still resolved from the scene because the
 * impostor fog block is unchanged (fog unification is owned elsewhere).
 */
const resolveNpcFogSnapshot = (scene?: THREE.Scene): NpcAtmosphereSnapshot => {
  scratchNpcSkyColor.setRGB(1, 1, 1);
  scratchNpcGroundColor.setRGB(0.35, 0.35, 0.3);
  scratchNpcSunColor.setRGB(1, 1, 1);
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

  return {
    lightingEnabled: false,
    lightScale: 1,
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
  materials: Map<string, CombatantUniformMaterial>,
  camera: THREE.Camera,
  scene?: THREE.Scene
): void => {
  const time = performance.now() * 0.001;
  // The impostor shader reads `lightingRigBindings` directly as its only lighting
  // path (`legacy-path-deletion`); we resolve fog only and leave the legacy
  // per-material lighting uniforms inert — no `scene.children` scan (single
  // authority).
  const atmosphere = resolveNpcFogSnapshot(scene);

  materials.forEach(material => {
    if (material.uniforms) {
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
