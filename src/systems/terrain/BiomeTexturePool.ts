import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { BIOMES } from '../../config/biomes';
import { Logger } from '../../utils/Logger';

const TEXTURE_REPEAT = 16;
const FALLBACK_COLOR = 0x4a7c59;

/**
 * Shared material pool for biome terrain textures.
 * Creates one MeshLambertMaterial per biome, shared across all chunks
 * of that biome. This enables Three.js draw-call batching and
 * eliminates per-chunk material allocation.
 */
export class BiomeTexturePool {
  private materials = new Map<string, THREE.Material>();
  private debugMaterial: THREE.Material;
  private fallbackMaterial: THREE.Material;

  constructor(private assetLoader: AssetLoader) {
    this.debugMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, wireframe: true, side: THREE.DoubleSide
    });

    this.fallbackMaterial = new THREE.MeshLambertMaterial({
      color: FALLBACK_COLOR, side: THREE.DoubleSide
    });

    this.initMaterials();
  }

  private initMaterials(): void {
    let loaded = 0;
    for (const biome of Object.values(BIOMES)) {
      const texture = this.assetLoader.getTexture(biome.groundTexture);
      if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(TEXTURE_REPEAT, TEXTURE_REPEAT);
        // Terrain uses trilinear filtering so the texture pattern stays visible
        // at glancing angles and distance. NearestFilter with no mipmaps (used for
        // billboards) collapses to a single averaged color on terrain viewed at an angle.
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        const material = new THREE.MeshLambertMaterial({
          map: texture,
          side: THREE.DoubleSide,
        });
        this.materials.set(biome.id, material);
        loaded++;
      }
    }
    Logger.info('terrain', `BiomeTexturePool: ${loaded}/${Object.keys(BIOMES).length} biome materials loaded`);
  }

  getMaterial(biomeId: string, debugMode = false): THREE.Material {
    if (debugMode) return this.debugMaterial;
    return this.materials.get(biomeId) ?? this.fallbackMaterial;
  }

  dispose(): void {
    for (const mat of this.materials.values()) mat.dispose();
    this.materials.clear();
    this.debugMaterial.dispose();
    this.fallbackMaterial.dispose();
  }
}
