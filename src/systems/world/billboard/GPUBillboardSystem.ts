import * as THREE from 'three';
import { AssetLoader } from '../../assets/AssetLoader';
import { Logger } from '../../../utils/Logger';

// Vertex shader for GPU-based billboard instancing with LOD and culling
const BILLBOARD_VERTEX_SHADER = `
  precision highp float;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec3 cameraPosition;
  uniform float time;
  uniform vec2 lodDistances; // x = LOD1 distance, y = LOD2 distance
  uniform mat4 viewMatrix;
  uniform float maxDistance;

  attribute vec3 position;
  attribute vec2 uv;

  // Instance attributes
  attribute vec3 instancePosition;
  attribute vec2 instanceScale;
  attribute float instanceRotation;

  varying vec2 vUv;
  varying float vDistance;
  varying float vLodFactor;
  varying float vWorldY;

  void main() {
    vUv = uv;

    // Calculate distance for LOD/fade
    vec3 worldPos = instancePosition;
    vDistance = length(cameraPosition - worldPos);

    // LOD factor for fragment shader (0-1, where 0 = full quality, 1 = lowest quality)
    if (vDistance < lodDistances.x) {
      vLodFactor = 0.0; // Full quality
    } else if (vDistance < lodDistances.y) {
      vLodFactor = 0.5; // Medium quality
    } else {
      vLodFactor = 1.0; // Low quality
    }

    // Calculate billboard orientation - cylindrical (Y-axis aligned)
    // Get direction from billboard to camera
    vec3 toCamera = cameraPosition - worldPos;
    vec3 toCameraXZ = vec3(toCamera.x, 0.0, toCamera.z);

    // Handle edge case when camera is directly above/below
    float xzLength = length(toCameraXZ);
    if (xzLength < 0.001) {
      toCameraXZ = vec3(0.0, 0.0, 1.0);
      xzLength = 1.0;
    }

    // Normalize the XZ direction
    vec3 forward = toCameraXZ / xzLength;

    // Calculate right vector (perpendicular to forward in XZ plane)
    // Right is 90 degrees CCW from forward in XZ plane
    vec3 right = vec3(forward.z, 0.0, -forward.x);
    vec3 up = vec3(0.0, 1.0, 0.0);

    // Scale the billboard quad
    vec3 scaledPos = vec3(position.x * instanceScale.x, position.y * instanceScale.y, 0.0);

    // Transform from billboard space to world space
    // Since PlaneGeometry is in XY facing +Z, we map:
    // X -> right, Y -> up, and implicitly the plane faces toward the camera
    vec3 rotatedPosition = right * scaledPos.x + up * scaledPos.y;

    // Add wind sway animation (reduced for distant objects)
    float lodWindScale = 1.0 - vLodFactor * 0.7; // Reduce wind for distant objects
    float windStrength = 0.3 * lodWindScale;
    float windFreq = 1.5;
    float sway = sin(time * windFreq + worldPos.x * 0.1 + worldPos.z * 0.1) * windStrength;
    rotatedPosition.x += sway * position.y * 0.1; // More sway at top

    // Transform to world position
    vec3 finalPosition = worldPos + rotatedPosition;

    // Pass world Y for height fog
    vWorldY = finalPosition.y;

    // Project to screen
    vec4 mvPosition = modelViewMatrix * vec4(finalPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader with distance-based alpha fade, LOD, and height fog
const BILLBOARD_FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D map;
  uniform float fadeDistance;
  uniform float maxDistance;
  uniform vec3 colorTint;
  uniform float gammaAdjust;

  // Height fog uniforms
  uniform vec3 fogColor;
  uniform float fogDensity;        // Base fog density
  uniform float fogHeightFalloff;  // How quickly fog thins with altitude
  uniform float fogStartDistance;  // Distance before fog begins
  uniform bool fogEnabled;

  varying vec2 vUv;
  varying float vDistance;
  varying float vLodFactor;
  varying float vWorldY;

  void main() {
    vec4 texColor = texture2D(map, vUv);

    // Alpha test for transparency
    if (texColor.a < 0.5) discard;

    // Distance-based fade
    float fadeFactor = 1.0;
    if (vDistance > fadeDistance) {
      fadeFactor = 1.0 - smoothstep(fadeDistance, maxDistance, vDistance);
    }

    // Apply LOD-based alpha reduction for distant objects
    fadeFactor *= (1.0 - vLodFactor * 0.3);

    vec3 shaded = pow(texColor.rgb * colorTint, vec3(gammaAdjust));

    // Apply height-based fog (dense at ground, thin at altitude)
    if (fogEnabled) {
      // Height factor: fog is densest at y=0, exponentially thins with height
      // Using max(0, y) so underground objects still get full fog
      float heightFactor = exp(-fogHeightFalloff * max(0.0, vWorldY));

      // Distance factor: fog increases with distance, but only past start distance
      float effectiveDistance = max(0.0, vDistance - fogStartDistance);
      float distanceFactor = 1.0 - exp(-fogDensity * effectiveDistance);

      // Combine: distant ground-level objects get most fog
      float fogFactor = heightFactor * distanceFactor;
      fogFactor = clamp(fogFactor, 0.0, 1.0);

      shaded = mix(shaded, fogColor, fogFactor);
    }

    gl_FragColor = vec4(shaded, texColor.a * fadeFactor);
  }
`;

export interface GPUVegetationConfig {
  maxInstances: number;
  texture: THREE.Texture;
  width: number;
  height: number;
  fadeDistance: number;
  maxDistance: number;
}

export class GPUBillboardVegetation {
  private geometry: THREE.InstancedBufferGeometry;
  private material: THREE.RawShaderMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;

  // Instance data arrays
  private positions: Float32Array;
  private scales: Float32Array;
  private rotations: Float32Array;

  // Attributes
  private positionAttribute: THREE.InstancedBufferAttribute;
  private scaleAttribute: THREE.InstancedBufferAttribute;
  private rotationAttribute: THREE.InstancedBufferAttribute;

  private maxInstances: number;
  private highWaterMark = 0;
  private liveCount = 0;
  private freeSlots: Set<number> = new Set();
  private warnedCapacity = false;

  // Pending update flags for batching
  private pendingPositionUpdate = false;
  private pendingScaleUpdate = false;
  private pendingRotationUpdate = false;

  constructor(scene: THREE.Scene, config: GPUVegetationConfig) {
    this.scene = scene;
    this.maxInstances = config.maxInstances;

    // Create plane geometry for billboard
    const planeGeometry = new THREE.PlaneGeometry(config.width, config.height);

    // Convert to InstancedBufferGeometry
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = planeGeometry.index;
    this.geometry.attributes = planeGeometry.attributes;

    // Initialize instance arrays
    this.positions = new Float32Array(this.maxInstances * 3);
    this.scales = new Float32Array(this.maxInstances * 2);
    this.rotations = new Float32Array(this.maxInstances);

    // Create instance attributes
    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scales, 2);
    this.rotationAttribute = new THREE.InstancedBufferAttribute(this.rotations, 1);

    // Set dynamic for updates
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    this.rotationAttribute.setUsage(THREE.DynamicDrawUsage);

    // Add attributes to geometry
    this.geometry.setAttribute('instancePosition', this.positionAttribute);
    this.geometry.setAttribute('instanceScale', this.scaleAttribute);
    this.geometry.setAttribute('instanceRotation', this.rotationAttribute);

    // Create shader material with height fog support
    this.material = new THREE.RawShaderMaterial({
      uniforms: {
        map: { value: config.texture },
        time: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
        fadeDistance: { value: config.fadeDistance },
        maxDistance: { value: config.maxDistance },
        lodDistances: { value: new THREE.Vector2(150, 300) },
        viewMatrix: { value: new THREE.Matrix4() },
        colorTint: { value: new THREE.Color(0.65, 0.7, 0.62) },
        gammaAdjust: { value: 1.2 },
        // Height fog uniforms - creates ground-level mist effect
        fogColor: { value: new THREE.Color(0x5a7a6a) },
        fogDensity: { value: 0.006 },        // How much fog accumulates with distance
        fogHeightFalloff: { value: 0.03 },   // How quickly fog thins with altitude (lower = thicker at height)
        fogStartDistance: { value: 100.0 },  // Fog doesn't appear until this distance
        fogEnabled: { value: false }
      },
      vertexShader: BILLBOARD_VERTEX_SHADER,
      fragmentShader: BILLBOARD_FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true
    });

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; // Disable frustum culling for instanced geometry
    this.scene.add(this.mesh);
  }

  // Add instances for a chunk
  addInstances(instances: Array<{position: THREE.Vector3, scale: THREE.Vector3, rotation: number}>): number[] {
    if (instances.length === 0) return [];
    
    const allocatedIndices: number[] = [];
    const startLiveCount = this.liveCount;

    for (const instance of instances) {
      let index: number;

      if (this.freeSlots.size > 0) {
        // Get any free slot (Set iteration is efficient for this)
        const it = this.freeSlots.values();
        index = it.next().value as number;
        this.freeSlots.delete(index);
      } else {
        if (this.highWaterMark >= this.maxInstances) {
          if (!this.warnedCapacity) {
            Logger.warn('vegetation', `Max instances reached (${this.highWaterMark}/${this.maxInstances})`);
            this.warnedCapacity = true;
          }
          break;
        }
        index = this.highWaterMark;
        this.highWaterMark++;
      }

      const i3 = index * 3;
      const i2 = index * 2;

      this.positions[i3] = instance.position.x;
      this.positions[i3 + 1] = instance.position.y;
      this.positions[i3 + 2] = instance.position.z;

      this.scales[i2] = instance.scale.x;
      this.scales[i2 + 1] = instance.scale.y;

      this.rotations[index] = instance.rotation;

      allocatedIndices.push(index);
      this.liveCount++;
    }

    if (allocatedIndices.length > 0) {
      this.pendingPositionUpdate = true;
      this.pendingScaleUpdate = true;
      this.pendingRotationUpdate = true;
    }

    this.geometry.instanceCount = this.highWaterMark;

    const addedCount = this.liveCount - startLiveCount;
    if (addedCount > 0) {
      Logger.debug('vegetation', `Allocated ${addedCount} instances (${startLiveCount} → ${this.liveCount} / ${this.maxInstances})`);
    }

    return allocatedIndices;
  }

  // Remove instances by indices
  removeInstances(indices: number[]): void {
    if (indices.length === 0) return;
    
    let removedCount = 0;
    for (const index of indices) {
      if (index >= this.highWaterMark) continue;

      const i2 = index * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        continue;
      }

      this.scales[i2] = 0;
      this.scales[i2 + 1] = 0;
      this.freeSlots.add(index);
      if (this.liveCount > 0) {
        this.liveCount--;
      }
      removedCount++;
    }

    if (removedCount > 0) {
      this.pendingScaleUpdate = true;
      this.compactHighWaterMark();
    }

    Logger.debug('vegetation', `Freed ${indices.length} instances (live=${this.liveCount}, reserved=${this.highWaterMark})`);
  }

  private compactHighWaterMark(): void {
    let compacted = false;
    while (this.highWaterMark > 0) {
      const lastIndex = this.highWaterMark - 1;
      const i2 = lastIndex * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        this.highWaterMark--;
        this.freeSlots.delete(lastIndex);
        compacted = true;
      } else {
        break;
      }
    }

    if (compacted) {
      this.geometry.instanceCount = this.highWaterMark;
    }
    
    if (this.highWaterMark < this.maxInstances) {
      this.warnedCapacity = false;
    }
  }

  // Get instance positions for area clearing
  getInstancePositions(): Float32Array {
    return this.positions;
  }

  // Reset all instances (for full cleanup)
  reset(): void {
    this.highWaterMark = 0;
    this.liveCount = 0;
    this.freeSlots.clear();
    this.geometry.instanceCount = 0;
    this.pendingPositionUpdate = true;
    this.pendingScaleUpdate = true;
    this.pendingRotationUpdate = true;
  }

  // Update uniforms (called every frame)
  update(camera: THREE.Camera, time: number, fog?: THREE.FogExp2 | null): void {
    // Apply batched buffer updates
    if (this.pendingPositionUpdate) {
      this.positionAttribute.needsUpdate = true;
      this.pendingPositionUpdate = false;
    }
    if (this.pendingScaleUpdate) {
      this.scaleAttribute.needsUpdate = true;
      this.pendingScaleUpdate = false;
    }
    if (this.pendingRotationUpdate) {
      this.rotationAttribute.needsUpdate = true;
      this.pendingRotationUpdate = false;
    }

    this.material.uniforms.cameraPosition.value.copy(camera.position);
    this.material.uniforms.time.value = time;
    if (camera instanceof THREE.PerspectiveCamera) {
      this.material.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
    }

    // Enable height fog when scene has fog (use our custom height fog parameters)
    if (fog) {
      this.material.uniforms.fogEnabled.value = true;
      this.material.uniforms.fogColor.value.copy(fog.color);
      // Height fog uses its own density/falloff, not the scene's FogExp2 density
    } else {
      this.material.uniforms.fogEnabled.value = false;
    }
  }

  // Get current instance count
  getInstanceCount(): number {
    return this.liveCount;
  }

  getHighWaterMark(): number {
    return this.highWaterMark;
  }

  getFreeSlotCount(): number {
    return this.freeSlots.size;
  }

  // Dispose resources
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}

// Manager for multiple vegetation types
export class GPUBillboardSystem {
  private vegetationTypes: Map<string, GPUBillboardVegetation> = new Map();
  private chunkInstances: Map<string, Map<string, number[]>> = new Map();
  private chunkBounds: Map<string, THREE.Box2> = new Map();
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  async initialize(): Promise<void> {
    Logger.info('vegetation', 'Initializing GPU billboard system');

    // Initialize each vegetation type with GPU instancing
    const configs: Array<[string, GPUVegetationConfig]> = [
      ['fern', {
        maxInstances: 100000,  // Reduced from 200k
        texture: this.assetLoader.getTexture('Fern')!,
        width: 1.5,
        height: 2.0,
        fadeDistance: 200,  // Reduced fade distance
        maxDistance: 250
      }],
      ['elephantEar', {
        maxInstances: 30000,  // Reduced from 50k
        texture: this.assetLoader.getTexture('ElephantEarPlants')!,
        width: 2.5,
        height: 3.0,
        fadeDistance: 250,
        maxDistance: 300
      }],
      ['fanPalm', {
        maxInstances: 25000,  // Reduced from 40k
        texture: this.assetLoader.getTexture('FanPalmCluster')!,
        width: 3,
        height: 4,
        fadeDistance: 300,
        maxDistance: 350
      }],
      ['coconut', {
        maxInstances: 20000,  // Reduced from 30k
        texture: this.assetLoader.getTexture('CoconutPalm')!,
        width: 5,
        height: 7,
        fadeDistance: 350,
        maxDistance: 400
      }],
      ['areca', {
        maxInstances: 30000,  // Reduced from 50k
        texture: this.assetLoader.getTexture('ArecaPalmCluster')!,
        width: 4,
        height: 6,
        fadeDistance: 300,
        maxDistance: 350
      }],
      ['dipterocarp', {
        maxInstances: 10000,
        texture: this.assetLoader.getTexture('DipterocarpGiant')!,
        width: 15,
        height: 20,
        fadeDistance: 500,
        maxDistance: 600
      }],
      ['banyan', {
        maxInstances: 10000,
        texture: this.assetLoader.getTexture('TwisterBanyan')!,
        width: 14,
        height: 18,
        fadeDistance: 500,
        maxDistance: 600
      }]
    ];

    for (const [type, config] of configs) {
      if (config.texture) {
        const vegetation = new GPUBillboardVegetation(this.scene, config);
        this.vegetationTypes.set(type, vegetation);
        Logger.info('vegetation', `GPU billboard ${type} configured (max ${config.maxInstances})`);
      }
    }

    Logger.info('vegetation', 'GPU billboard system initialized');
  }

  // Add instances for a chunk
  addChunkInstances(
    chunkKey: string,
    type: string,
    instances: Array<{position: THREE.Vector3, scale: THREE.Vector3, rotation: number}>
  ): void {
    const vegetation = this.vegetationTypes.get(type);
    if (!vegetation) return;

    const indices = vegetation.addInstances(instances);

    if (!this.chunkInstances.has(chunkKey)) {
      this.chunkInstances.set(chunkKey, new Map());
    }

    this.chunkInstances.get(chunkKey)!.set(type, indices);

    // Update chunk bounds for spatial optimization
    let bounds = this.chunkBounds.get(chunkKey);
    if (!bounds) {
      bounds = new THREE.Box2();
      this.chunkBounds.set(chunkKey, bounds);
    }
    
    for (const instance of instances) {
      bounds.expandByPoint(new THREE.Vector2(instance.position.x, instance.position.z));
    }
  }

  // Remove all instances for a chunk
  removeChunkInstances(chunkKey: string): void {
    const chunkData = this.chunkInstances.get(chunkKey);
    if (!chunkData) return;

    let totalRemoved = 0;
    chunkData.forEach((indices, type) => {
      const vegetation = this.vegetationTypes.get(type);
      if (vegetation) {
        vegetation.removeInstances(indices);
        totalRemoved += indices.length;
      }
    });

    this.chunkInstances.delete(chunkKey);
    this.chunkBounds.delete(chunkKey);
    console.log(`🗑️ GPU: Removed ${totalRemoved} vegetation instances for chunk ${chunkKey}`);
  }

  // Update all vegetation (called every frame)
  update(camera: THREE.Camera, deltaTime: number, fog?: THREE.FogExp2 | null): void {
    const time = performance.now() * 0.001; // Convert to seconds

    this.vegetationTypes.forEach(vegetation => {
      vegetation.update(camera, time, fog);
    });
  }

  // Get debug info
  getDebugInfo(): { [key: string]: number } {
    const info: { [key: string]: number } = {};

    this.vegetationTypes.forEach((vegetation, type) => {
      info[`${type}Active`] = vegetation.getInstanceCount();
      info[`${type}HighWater`] = vegetation.getHighWaterMark();
      info[`${type}Free`] = vegetation.getFreeSlotCount();
    });

    info.chunksTracked = this.chunkInstances.size;

    return info;
  }

  /**
   * Clear vegetation instances in a specific area
   */
  clearInstancesInArea(centerX: number, centerZ: number, radius: number): void {
    Logger.info('vegetation', `Clearing vegetation radius=${radius} around (${centerX}, ${centerZ})`);

    let totalCleared = 0;
    const radiusSq = radius * radius;
    const center = new THREE.Vector2(centerX, centerZ);

    // Use chunk bounds to skip chunks that are out of range
    this.chunkBounds.forEach((bounds, chunkKey) => {
      // Check if this chunk's bounding box is within range of the clearing circle
      // Distance from point to box
      const distSq = bounds.distanceToPoint(center) ** 2;
      if (distSq > radiusSq) {
        return; // Skip this chunk
      }

      const chunkData = this.chunkInstances.get(chunkKey);
      if (!chunkData) return;

      chunkData.forEach((indices, type) => {
        const vegetation = this.vegetationTypes.get(type);
        if (!vegetation) return;

        const positions = vegetation.getInstancePositions();
        const indicesToRemove: number[] = [];
        
        // Filter the indices in this chunk
        const remainingIndices: number[] = [];

        for (const index of indices) {
          const i3 = index * 3;
          const x = positions[i3];
          const z = positions[i3 + 2];

          const dx = x - centerX;
          const dz = z - centerZ;
          if (dx * dx + dz * dz <= radiusSq) {
            indicesToRemove.push(index);
          } else {
            remainingIndices.push(index);
          }
        }

        if (indicesToRemove.length > 0) {
          vegetation.removeInstances(indicesToRemove);
          totalCleared += indicesToRemove.length;
          
          // Update the chunk's instance list
          if (remainingIndices.length === 0) {
            chunkData.delete(type);
          } else {
            chunkData.set(type, remainingIndices);
          }
        }
      });

      // If all types are cleared for this chunk, remove chunk data
      if (chunkData.size === 0) {
        this.chunkInstances.delete(chunkKey);
        this.chunkBounds.delete(chunkKey);
      }
    });

    Logger.info('vegetation', `Cleared ${totalCleared} vegetation instances`);
  }

  // Dispose all resources
  dispose(): void {
    this.vegetationTypes.forEach(vegetation => vegetation.dispose());
    this.vegetationTypes.clear();
    this.chunkInstances.clear();
  }
}
