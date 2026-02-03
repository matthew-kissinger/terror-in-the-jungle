import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';

/**
 * Creates materials for terrain chunks
 */
export class ChunkMaterials {
  /**
   * Create terrain material based on debug mode and available textures
   * @param assetLoader - Asset loader for texture access
   * @param debugMode - If true, creates wireframe debug material
   * @returns Material instance
   */
  static createTerrainMaterial(
    assetLoader: AssetLoader,
    debugMode: boolean
  ): THREE.Material {
    if (debugMode) {
      return new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        side: THREE.DoubleSide
      });
    }

    const texture = assetLoader.getTexture('forestfloor');
    if (texture) {
      const material = PixelPerfectUtils.createPixelPerfectLitMaterial(texture);
      texture.repeat.set(8, 8);
      return material;
    }

    // Fallback: lit material with color
    return new THREE.MeshLambertMaterial({
      color: 0x4a7c59,
      side: THREE.DoubleSide
    });
  }
}
