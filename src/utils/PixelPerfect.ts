import * as THREE from 'three';

export class PixelPerfectUtils {
  static configureTexture(texture: THREE.Texture): THREE.Texture {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = true; // Ensure proper billboard orientation
    texture.generateMipmaps = false;
    texture.needsUpdate = true; // Force texture update
    return texture;
  }

  /**
   * Configure texture atlases for billboard/impostor rendering.
   * Pixel Forge foliage and NPC impostors are now production atlases rather
   * than deliberately pixelated sprites, so sample them with linear mipmaps.
   */
  static configureBillboardTexture(texture: THREE.Texture): THREE.Texture {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  static createPixelPerfectMaterial(texture: THREE.Texture, transparent = true): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      map: this.configureTexture(texture),
      transparent,
      alphaTest: transparent ? 0.5 : 0,  // Higher alpha test to remove outlines
      side: THREE.DoubleSide,
      forceSinglePass: transparent,
      depthWrite: true  // Ensure proper depth sorting
    });
  }

  /**
   * Create a lit material for terrain that responds to scene lighting.
   * Uses MeshLambertMaterial for performance (diffuse only, no specular).
   */
  static createPixelPerfectLitMaterial(texture: THREE.Texture): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({
      map: this.configureTexture(texture),
      side: THREE.DoubleSide,
      // No emissive - let scene lighting control brightness
    });
  }

  static configureRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.setPixelRatio(1); // Force 1:1 pixel ratio for crisp pixels
    // Note: antialiasing is controlled at renderer creation time
  }
}
