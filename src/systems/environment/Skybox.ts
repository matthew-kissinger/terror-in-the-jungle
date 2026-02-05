import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';

export class Skybox implements GameSystem {
  private scene: THREE.Scene;
  private skyboxMesh?: THREE.Mesh;
  private skyboxTexture?: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    // Skybox will be created when texture is provided
  }

  update(_deltaTime: number): void {
    // Skybox is static, no updates needed
  }

  dispose(): void {
    if (this.skyboxMesh) {
      this.scene.remove(this.skyboxMesh);
      this.skyboxMesh.geometry.dispose();
      if (this.skyboxMesh.material instanceof THREE.Material) {
        this.skyboxMesh.material.dispose();
      }
    }
    
    if (this.skyboxTexture) {
      this.skyboxTexture.dispose();
    }
  }

  createSkybox(equirectangularTexture: THREE.Texture): void {
    this.skyboxTexture = equirectangularTexture;

    // Configure texture for equirectangular mapping
    equirectangularTexture.magFilter = THREE.LinearFilter;
    equirectangularTexture.minFilter = THREE.LinearFilter;
    equirectangularTexture.wrapS = THREE.RepeatWrapping;
    equirectangularTexture.wrapT = THREE.ClampToEdgeWrapping;
    equirectangularTexture.flipY = false; // Equirectangular images are usually not flipped
    
    // Create a large sphere for the skybox
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    
    // Create shader material for proper equirectangular mapping
    const material = new THREE.ShaderMaterial({
      uniforms: {
        equirectangularMap: { value: equirectangularTexture }
      },
      vertexShader: `
        varying vec3 vWorldDirection;
        
        void main() {
          vWorldDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D equirectangularMap;
        varying vec3 vWorldDirection;
        
        #define PI 3.14159265359
        
        vec2 equirectangularUv(vec3 direction) {
          // Normalize direction
          vec3 dir = normalize(direction);
          
          // Convert to spherical coordinates
          float phi = atan(dir.z, dir.x); // Azimuth angle
          float theta = acos(dir.y);      // Polar angle
          
          // Convert to UV coordinates
          vec2 uv = vec2(
            (phi + PI) / (2.0 * PI),  // Map [-π, π] to [0, 1]
            theta / PI                 // Map [0, π] to [0, 1]
          );
          
          return uv;
        }
        
        void main() {
          vec2 uv = equirectangularUv(vWorldDirection);
          vec3 color = texture2D(equirectangularMap, uv).rgb;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
      depthTest: false
    });

    // Create mesh
    this.skyboxMesh = new THREE.Mesh(geometry, material);
    this.skyboxMesh.renderOrder = -1; // Render first (behind everything)
    
    // Add to scene
    this.scene.add(this.skyboxMesh);

    Logger.info('environment', 'Equirectangular skybox created with proper mapping');
  }

  // Alternative method using THREE.js built-in cube texture approach
  createSkyboxFromEquirectangular(equirectangularTexture: THREE.Texture): void {
    this.skyboxTexture = equirectangularTexture;

    // Configure texture
    PixelPerfectUtils.configureTexture(equirectangularTexture);

    // Create render target for cube texture conversion
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512);
    cubeRenderTarget.texture.generateMipmaps = false;
    cubeRenderTarget.texture.minFilter = THREE.NearestFilter;
    cubeRenderTarget.texture.magFilter = THREE.NearestFilter;

    // Convert equirectangular to cube texture (requires renderer)
    // This would need to be called from main.ts with renderer access
    // For now, use the simpler sphere approach above

    this.createSkybox(equirectangularTexture);
  }

  setSkyboxRotation(x: number, y: number, z: number): void {
    if (this.skyboxMesh) {
      this.skyboxMesh.rotation.set(x, y, z);
    }
  }

  setSkyboxScale(scale: number): void {
    if (this.skyboxMesh) {
      this.skyboxMesh.scale.setScalar(scale);
    }
  }

  getSkyboxMesh(): THREE.Mesh | undefined {
    return this.skyboxMesh;
  }

  // Update skybox position to follow camera (keeps it infinitely far)
  updatePosition(cameraPosition: THREE.Vector3): void {
    if (this.skyboxMesh) {
      this.skyboxMesh.position.copy(cameraPosition);
    }
  }
}