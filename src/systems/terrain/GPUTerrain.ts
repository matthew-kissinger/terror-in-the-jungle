import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import { getHeightQueryCache } from './HeightQueryCache';
import { getGPUTerrainVertexShader, getGPUTerrainFragmentShader } from './GPUTerrainShaders';
import { createLODRingGeometry } from './GPUTerrainGeometry';

/**
 * GPU-based terrain renderer using heightmap texture displacement.
 *
 * Instead of loading/unloading chunk meshes, this system uses:
 * - A single static mesh (concentric LOD rings around camera)
 * - Vertex shader samples heightmap texture for displacement
 * - Heightmap texture streams around camera position
 *
 * Benefits:
 * - No chunk pop-in (mesh is always present)
 * - Smooth LOD transitions via morphing
 * - GPU does the heavy lifting
 */
export class GPUTerrain implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  // Terrain mesh and material
  private terrainMesh?: THREE.Mesh;
  private terrainMaterial?: THREE.ShaderMaterial;

  // Heightmap texture (streams around camera)
  private heightmapTexture?: THREE.DataTexture;
  private heightmapData?: Float32Array;
  private readonly HEIGHTMAP_SIZE = 512; // 512x512 texture
  private readonly TERRAIN_SCALE = 4; // Each texel = 4 world units

  // Camera tracking for heightmap streaming
  private lastHeightmapCenter = new THREE.Vector2();
  private readonly HEIGHTMAP_UPDATE_THRESHOLD = 32; // Update when camera moves 32 units

  // Terrain mesh configuration
  private readonly TERRAIN_RADIUS = 1000; // Visible terrain radius
  private readonly LOD_RINGS = 8; // Number of LOD rings
  private readonly RING_SEGMENTS = 64; // Segments per ring

  // Ground texture
  private groundTexture?: THREE.Texture;

  // Initialization flag
  private isInitialized = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    assetLoader: AssetLoader
  ) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
  }

  async init(): Promise<void> {
    Logger.info('terrain', '[GPUTerrain] Initializing GPU terrain system...');

    // Load ground texture with fallback
    this.groundTexture = this.assetLoader.getTexture('forestfloor');
    if (!this.groundTexture) {
      // Create a simple green placeholder texture
      const size = 4;
      const data = new Uint8Array(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = 60;      // R
        data[i * 4 + 1] = 90;  // G
        data[i * 4 + 2] = 50;  // B
        data[i * 4 + 3] = 255; // A
      }
      this.groundTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      Logger.warn('terrain', '[GPUTerrain] forestfloor texture not found, using placeholder');
    }
    this.groundTexture.wrapS = THREE.RepeatWrapping;
    this.groundTexture.wrapT = THREE.RepeatWrapping;
    this.groundTexture.needsUpdate = true;

    // Create heightmap texture
    this.createHeightmapTexture();

    // Create terrain mesh with LOD rings
    this.createTerrainMesh();

    // Initial heightmap generation at origin
    this.updateHeightmap(0, 0);

    this.isInitialized = true;
    Logger.info('terrain', '[GPUTerrain] GPU terrain initialized');
  }

  private createHeightmapTexture(): void {
    const size = this.HEIGHTMAP_SIZE;
    this.heightmapData = new Float32Array(size * size);

    // Create floating point texture for heightmap
    this.heightmapTexture = new THREE.DataTexture(
      this.heightmapData,
      size,
      size,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.heightmapTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.heightmapTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightmapTexture.minFilter = THREE.LinearFilter;
    this.heightmapTexture.magFilter = THREE.LinearFilter;
    this.heightmapTexture.needsUpdate = true;
  }

  private createTerrainMesh(): void {
    // Create concentric ring geometry for LOD
    const geometry = createLODRingGeometry(
      this.TERRAIN_RADIUS,
      this.LOD_RINGS,
      this.RING_SEGMENTS
    );

    // Create shader material
    this.terrainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        heightmap: { value: this.heightmapTexture },
        heightmapSize: { value: this.HEIGHTMAP_SIZE },
        terrainScale: { value: this.TERRAIN_SCALE },
        heightmapCenter: { value: new THREE.Vector2(0, 0) },
        groundTexture: { value: this.groundTexture },
        textureRepeat: { value: 0.05 }, // Texture tiling
        fogColor: { value: new THREE.Color(0x5a7a6a) },
        fogNear: { value: 50 },
        fogFar: { value: 500 },
      },
      vertexShader: getGPUTerrainVertexShader(),
      fragmentShader: getGPUTerrainFragmentShader(),
      side: THREE.DoubleSide,
      fog: false, // We handle fog manually in the shader
    });

    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrainMesh.frustumCulled = false; // Always render
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.name = 'gpu_terrain';

    this.scene.add(this.terrainMesh);
  }


  private updateHeightmap(centerX: number, centerZ: number): void {
    if (!this.heightmapData || !this.heightmapTexture) return;

    const size = this.HEIGHTMAP_SIZE;
    const scale = this.TERRAIN_SCALE;

    // Generate heightmap data from noise
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const worldX = centerX + (x - size / 2) * scale;
        const worldZ = centerZ + (y - size / 2) * scale;

        const height = this.calculateHeight(worldX, worldZ);
        this.heightmapData[y * size + x] = height;
      }
    }

    this.heightmapTexture.needsUpdate = true;

    // Update shader uniform
    if (this.terrainMaterial) {
      this.terrainMaterial.uniforms.heightmapCenter.value.set(centerX, centerZ);
    }

    this.lastHeightmapCenter.set(centerX, centerZ);
  }

  /**
   * Get terrain height from HeightQueryCache - ensures GPU terrain matches CPU exactly
   */
  private calculateHeight(worldX: number, worldZ: number): number {
    return getHeightQueryCache().getHeightAt(worldX, worldZ);
  }

  update(_deltaTime: number): void {
    if (!this.isInitialized || !this.terrainMesh || !this.terrainMaterial) return;

    // Check if heightmap needs updating (camera moved far enough)
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;

    const dx = camX - this.lastHeightmapCenter.x;
    const dz = camZ - this.lastHeightmapCenter.y;
    const distSq = dx * dx + dz * dz;

    if (distSq > this.HEIGHTMAP_UPDATE_THRESHOLD * this.HEIGHTMAP_UPDATE_THRESHOLD) {
      this.updateHeightmap(camX, camZ);
    }

    // Update fog from scene (supports both Fog and FogExp2)
    if (this.scene.fog) {
      this.terrainMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);
      if (this.scene.fog instanceof THREE.Fog) {
        this.terrainMaterial.uniforms.fogNear.value = this.scene.fog.near;
        this.terrainMaterial.uniforms.fogFar.value = this.scene.fog.far;
      } else if (this.scene.fog instanceof THREE.FogExp2) {
        // Convert density to approximate near/far
        const density = this.scene.fog.density;
        this.terrainMaterial.uniforms.fogNear.value = 1 / (density * 4);
        this.terrainMaterial.uniforms.fogFar.value = 1 / density;
      }
    }
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
    }
    if (this.terrainMaterial) {
      this.terrainMaterial.dispose();
    }
    if (this.heightmapTexture) {
      this.heightmapTexture.dispose();
    }
  }

  // For debugging
  getStats(): { heightmapSize: number; terrainRadius: number; lodRings: number } {
    return {
      heightmapSize: this.HEIGHTMAP_SIZE,
      terrainRadius: this.TERRAIN_RADIUS,
      lodRings: this.LOD_RINGS,
    };
  }
}
