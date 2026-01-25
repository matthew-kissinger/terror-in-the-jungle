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
   * Configure texture for billboards with mipmapping.
   * - NearestFilter for magFilter: crisp pixels when close
   * - LinearMipmapLinearFilter for minFilter: smooth blending at distance
   * - Mipmaps enabled: reduces aliasing/shimmering at distance
   */
  static configureBillboardTexture(texture: THREE.Texture): THREE.Texture {
    texture.magFilter = THREE.NearestFilter;  // Crisp when close
    texture.minFilter = THREE.LinearMipmapLinearFilter;  // Smooth when far
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.generateMipmaps = true;  // Enable mipmaps for distance
    texture.anisotropy = 4;  // Improve quality at oblique angles
    texture.needsUpdate = true;
    return texture;
  }

  static createPixelPerfectMaterial(texture: THREE.Texture, transparent = true): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      map: this.configureTexture(texture),
      transparent,
      alphaTest: transparent ? 0.5 : 0,  // Higher alpha test to remove outlines
      side: THREE.DoubleSide,
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