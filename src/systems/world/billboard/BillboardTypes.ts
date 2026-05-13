import type * as THREE from 'three';
import type {
  VegetationAtlasProfile,
  VegetationImposterAtlasConfig,
  VegetationRepresentation,
  VegetationShaderProfile,
} from '../../../config/vegetationTypes';

export interface GPUVegetationConfig {
  maxInstances: number;
  texture: THREE.Texture;
  normalTexture?: THREE.Texture;
  width: number;
  height: number;
  fadeDistance: number;
  maxDistance: number;
  representation: VegetationRepresentation;
  atlasProfile: VegetationAtlasProfile;
  shaderProfile: VegetationShaderProfile;
  imposterAtlas?: VegetationImposterAtlasConfig;
}

export interface BillboardLighting {
  sunColor: THREE.Color;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
}
