import * as THREE from 'three';
import { GameSystem } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import { getHeightQueryCache } from './HeightQueryCache';

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
    console.log('[GPUTerrain] Initializing GPU terrain system...');

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
      console.warn('[GPUTerrain] forestfloor texture not found, using placeholder');
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
    console.log('[GPUTerrain] GPU terrain initialized');
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
    const geometry = this.createLODRingGeometry();

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
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      side: THREE.DoubleSide,
      fog: false, // We handle fog manually in the shader
    });

    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrainMesh.frustumCulled = false; // Always render
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.name = 'gpu_terrain';

    this.scene.add(this.terrainMesh);
  }

  private createLODRingGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create concentric rings with increasing vertex spacing (LOD)
    let vertexIndex = 0;
    const ringRadii: number[] = [];

    // Calculate ring radii with exponential spacing
    for (let ring = 0; ring <= this.LOD_RINGS; ring++) {
      const t = ring / this.LOD_RINGS;
      // Exponential spacing: more detail near camera
      const radius = this.TERRAIN_RADIUS * Math.pow(t, 1.5);
      ringRadii.push(radius);
    }

    // Generate vertices for each ring
    for (let ring = 0; ring <= this.LOD_RINGS; ring++) {
      const radius = ringRadii[ring];
      const segments = Math.max(8, Math.floor(this.RING_SEGMENTS / (ring + 1)));

      for (let seg = 0; seg <= segments; seg++) {
        const theta = (seg / segments) * Math.PI * 2;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;

        positions.push(x, 0, z); // Y will be set by vertex shader
        uvs.push(x, z); // World-space UVs for heightmap lookup
      }
    }

    // Generate indices connecting rings
    let ringStartIndex = 0;
    for (let ring = 0; ring < this.LOD_RINGS; ring++) {
      const innerSegments = Math.max(8, Math.floor(this.RING_SEGMENTS / (ring + 1)));
      const outerSegments = Math.max(8, Math.floor(this.RING_SEGMENTS / (ring + 2)));

      const innerStart = ringStartIndex;
      const outerStart = ringStartIndex + innerSegments + 1;

      // Connect inner ring to outer ring
      // This is tricky because rings have different segment counts
      for (let i = 0; i < innerSegments; i++) {
        const innerCurrent = innerStart + i;
        const innerNext = innerStart + i + 1;

        // Find corresponding outer vertices
        const outerRatio = i / innerSegments;
        const outerIndex = Math.floor(outerRatio * outerSegments);
        const outerCurrent = outerStart + outerIndex;
        const outerNext = outerStart + Math.min(outerIndex + 1, outerSegments);

        // Triangle 1
        indices.push(innerCurrent, outerCurrent, innerNext);
        // Triangle 2
        indices.push(innerNext, outerCurrent, outerNext);
      }

      ringStartIndex += innerSegments + 1;
    }

    // Also fill the center with a simple disc
    const centerSegments = this.RING_SEGMENTS;
    const centerVertexStart = positions.length / 3;

    // Center vertex
    positions.push(0, 0, 0);
    uvs.push(0, 0);

    // First ring vertices for center disc
    const firstRingRadius = ringRadii[1] || 10;
    for (let i = 0; i <= centerSegments; i++) {
      const theta = (i / centerSegments) * Math.PI * 2;
      positions.push(
        Math.cos(theta) * firstRingRadius,
        0,
        Math.sin(theta) * firstRingRadius
      );
      uvs.push(
        Math.cos(theta) * firstRingRadius,
        Math.sin(theta) * firstRingRadius
      );
    }

    // Center disc triangles
    for (let i = 0; i < centerSegments; i++) {
      indices.push(
        centerVertexStart,
        centerVertexStart + 1 + i,
        centerVertexStart + 1 + i + 1
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }

  private getVertexShader(): string {
    return `
      uniform sampler2D heightmap;
      uniform float heightmapSize;
      uniform float terrainScale;
      uniform vec2 heightmapCenter;

      varying vec2 vWorldUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFogDepth;

      void main() {
        // World position (mesh follows camera)
        vec3 worldPos = position + vec3(cameraPosition.x, 0.0, cameraPosition.z);
        vWorldPosition = worldPos;
        vWorldUV = worldPos.xz;

        // Calculate UV for heightmap sampling
        vec2 heightmapUV = (worldPos.xz - heightmapCenter) / (heightmapSize * terrainScale) + 0.5;

        // Sample height from heightmap
        float height = 0.0;
        if (heightmapUV.x >= 0.0 && heightmapUV.x <= 1.0 &&
            heightmapUV.y >= 0.0 && heightmapUV.y <= 1.0) {
          height = texture2D(heightmap, heightmapUV).r;
        }

        // Apply height displacement
        worldPos.y = height;

        // Calculate normal from heightmap (central difference)
        float texelSize = 1.0 / heightmapSize;
        float hL = texture2D(heightmap, heightmapUV + vec2(-texelSize, 0.0)).r;
        float hR = texture2D(heightmap, heightmapUV + vec2(texelSize, 0.0)).r;
        float hD = texture2D(heightmap, heightmapUV + vec2(0.0, -texelSize)).r;
        float hU = texture2D(heightmap, heightmapUV + vec2(0.0, texelSize)).r;

        vec3 normal = normalize(vec3(hL - hR, 2.0 * terrainScale, hD - hU));
        vNormal = normal;

        // Transform to clip space
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
  }

  private getFragmentShader(): string {
    return `
      uniform sampler2D groundTexture;
      uniform float textureRepeat;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;

      varying vec2 vWorldUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFogDepth;

      void main() {
        // Sample ground texture with world-space tiling
        vec2 texCoord = vWorldUV * textureRepeat;
        vec4 texColor = texture2D(groundTexture, texCoord);

        // Basic lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diffuse = max(dot(vNormal, lightDir), 0.0);
        float ambient = 0.4;
        float lighting = ambient + diffuse * 0.6;

        vec3 color = texColor.rgb * lighting;

        // Height-based coloring (grass -> rock at higher elevations)
        float heightFactor = smoothstep(20.0, 60.0, vWorldPosition.y);
        vec3 rockColor = vec3(0.4, 0.35, 0.3);
        color = mix(color, rockColor * lighting, heightFactor * 0.5);

        // Fog
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        color = mix(color, fogColor, fogFactor);

        gl_FragColor = vec4(color, 1.0);
      }
    `;
  }

  private updateHeightmap(centerX: number, centerZ: number): void {
    if (!this.heightmapData || !this.heightmapTexture) return;

    const size = this.HEIGHTMAP_SIZE;
    const scale = this.TERRAIN_SCALE;
    const halfSize = (size * scale) / 2;

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

  update(deltaTime: number): void {
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
