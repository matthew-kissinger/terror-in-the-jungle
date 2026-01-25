import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { BillboardInstance } from '../../types';
import { MathUtils } from '../../utils/Math';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';

// Extend Three.js BufferGeometry with BVH methods
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class ImprovedChunk {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private segments: number = 32;
  
  // Terrain data
  private heightData: Float32Array;
  private terrainMesh?: THREE.Mesh;
  private terrainGeometry?: THREE.BufferGeometry;
  
  // Billboard instances - Full jungle layers
  private globalBillboardSystem: GlobalBillboardSystem;
  // Ground cover
  private fernInstances: BillboardInstance[] = [];          // Dense everywhere
  private elephantEarInstances: BillboardInstance[] = [];   // Sprinkled
  // Mid-level
  private fanPalmInstances: BillboardInstance[] = [];       // Near water/slopes
  private coconutInstances: BillboardInstance[] = [];       // Water edges
  private arecaInstances: BillboardInstance[] = [];         // Everywhere mid
  // Canopy giants
  private dipterocarpInstances: BillboardInstance[] = [];   // Rare huge
  private banyanInstances: BillboardInstance[] = [];        // Rare huge
  
  // Generation
  private noiseGenerator: NoiseGenerator;
  private isGenerated = false;
  
  // Debug
  private debugMode = false;

  constructor(
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    chunkX: number,
    chunkZ: number,
    size: number,
    noiseGenerator: NoiseGenerator,
    globalBillboardSystem: GlobalBillboardSystem
  ) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.noiseGenerator = noiseGenerator;
    this.globalBillboardSystem = globalBillboardSystem;
    
    // Initialize height data array
    const dataSize = (this.segments + 1) * (this.segments + 1);
    this.heightData = new Float32Array(dataSize);
  }

  async generate(): Promise<void> {
    if (this.isGenerated) return;

    // Generate height data first
    this.generateHeightData();

    // Create terrain mesh with proper vertex order
    await this.createTerrainMesh();

    // Generate vegetation positioned on terrain
    await this.generateVegetation();
    
    // Register instances with global system
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.addChunkInstances(
      chunkKey,
      this.fernInstances,
      this.elephantEarInstances,
      this.fanPalmInstances,
      this.coconutInstances,
      this.arecaInstances,
      this.dipterocarpInstances,
      this.banyanInstances
    );
    
    
    this.isGenerated = true;
    console.log(`✅ ImprovedChunk (${this.chunkX}, ${this.chunkZ}) generated`);
  }

  private generateHeightData(): void {
    const worldOffsetX = this.chunkX * this.size;
    const worldOffsetZ = this.chunkZ * this.size;
    const resolution = this.segments; // Must match geometry segments
    
    // Generate height data matching legacy terrain mapping (mountains, rivers, lakes)
    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const worldX = worldOffsetX + (x / resolution) * this.size;
        const worldZ = worldOffsetZ + (z / resolution) * this.size;
        
        // Continental/base terrain shape (very low frequency)
        let continentalHeight = this.noiseGenerator.noise(worldX * 0.001, worldZ * 0.001);
        
        // Mountain ridges using ridge noise (inverted absolute value)
        let ridgeNoise = 1 - Math.abs(this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003));
        ridgeNoise = Math.pow(ridgeNoise, 1.5);
        
        // Valley carving using erosion-like shaping
        let valleyNoise = this.noiseGenerator.noise(worldX * 0.008, worldZ * 0.008);
        valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);
        
        // Hills and medium features with varying persistence
        let hillNoise = 0;
        hillNoise += this.noiseGenerator.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
        hillNoise += this.noiseGenerator.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
        hillNoise += this.noiseGenerator.noise(worldX * 0.06, worldZ * 0.06) * 0.125;
        
        // Fine details
        let detailNoise = this.noiseGenerator.noise(worldX * 0.1, worldZ * 0.1) * 0.1;
        
        // Combine layers
        let height = 0;
        
        // Base elevation influenced by continental noise
        height += (continentalHeight * 0.5 + 0.5) * 30;
        
        // Add mountain ridges with smooth transitions
        const ridgeStrength = MathUtils.smoothstep(-0.3, 0.2, continentalHeight);
        height += ridgeNoise * 80 * ridgeStrength;
        
        // Carve valleys
        height += valleyNoise * 40;
        
        // Add hills with persistence falloff
        height += hillNoise * 35;
        
        // Add fine details
        height += detailNoise * 8;
        
        // Create water areas (lakes and rivers)
        const waterNoise = this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003);
        const riverNoise = this.noiseGenerator.noise(worldX * 0.01, worldZ * 0.01);
        
        // Lakes in low-lying areas
        if (waterNoise < -0.4 && height < 15) {
          height = -3 - waterNoise * 2; // Below water level (0)
        }
        // River valleys
        else if (Math.abs(riverNoise) < 0.1 && height < 25) {
          height = height * 0.3 - 2;
        }
        // Smooth lower valleys
        else if (height < 20) {
          height = height * 0.7;
        }
        
        // Allow negative heights for underwater terrain
        height = Math.max(-8, height);
        
        // Store row-major (z, x)
        const idx = z * (resolution + 1) + x;
        this.heightData[idx] = height;
      }
    }
  }

  private async createTerrainMesh(): Promise<void> {
    // Create PlaneGeometry following Three.js example pattern
    const geometry = new THREE.PlaneGeometry(
      this.size, 
      this.size, 
      this.segments, 
      this.segments
    );
    
    // Rotate to horizontal FIRST (before modifying vertices)
    geometry.rotateX(-Math.PI / 2);
    
    // Apply height data to vertices - following Three.js example
    const vertices = geometry.attributes.position.array as Float32Array;
    
    // THREE.PlaneGeometry creates vertices in a specific order
    // After rotation, Y is up, X and Z are horizontal
    for (let i = 0, j = 0; i < this.heightData.length; i++, j += 3) {
      // Set Y coordinate (height)
      vertices[j + 1] = this.heightData[i];
    }
    
    // Update geometry
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    
    // Compute BVH for accurate collision detection
    (geometry as any).computeBoundsTree();
    
    // Create material - use lit material so terrain responds to scene lighting
    let material: THREE.Material;
    if (this.debugMode) {
      material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        side: THREE.DoubleSide
      });
    } else {
      const texture = this.assetLoader.getTexture('forestfloor');
      if (texture) {
        // Use lit material for natural shading based on scene lights
        material = PixelPerfectUtils.createPixelPerfectLitMaterial(texture);
        texture.repeat.set(8, 8);
      } else {
        // Fallback: lit material with color
        material = new THREE.MeshLambertMaterial({
          color: 0x4a7c59,
          side: THREE.DoubleSide
        });
      }
    }
    
    // Create and position mesh (centered like legacy terrain)
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.position.set(
      this.chunkX * this.size + this.size / 2,
      0,
      this.chunkZ * this.size + this.size / 2
    );
    // Name the terrain mesh so other systems (e.g., ZoneManager) can raycast/find it
    this.terrainMesh.name = `chunk_${this.chunkX},${this.chunkZ}_terrain`;
    this.terrainMesh.receiveShadow = true;
    
    // Store geometry reference for collision
    this.terrainGeometry = geometry;
    
    this.scene.add(this.terrainMesh);
    
    // Debug verification
    const testHeight = this.getHeightAtLocal(this.size / 2, this.size / 2);
    console.log(`📐 Chunk (${this.chunkX}, ${this.chunkZ}) center height: ${testHeight.toFixed(2)}`);
  }

  private async generateVegetation(): Promise<void> {
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    // Fixed density calculations - tuned for performance across many chunks
    const DENSITY_PER_UNIT = 1.0 / 128.0; // Reduced base density: 1 item per 128 square units

    // LAYER 1: Dense fern ground cover (covers most areas)
    const fernCount = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 6.0); // Reduced multiplier
    for (let i = 0; i < fernCount; i++) {
      const localX = Math.random() * this.size;
      const localZ = Math.random() * this.size;
      const height = this.getHeightAtLocal(localX, localZ);
      
      this.fernInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.2, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(2.4, 3.6),
          MathUtils.randomInRange(2.4, 3.6),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 1B: Elephant ear plants sprinkled in
    const elephantEarCount = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 0.8); // Reduced
    for (let i = 0; i < elephantEarCount; i++) {
      const localX = Math.random() * this.size;
      const localZ = Math.random() * this.size;
      const height = this.getHeightAtLocal(localX, localZ);
      
      this.elephantEarInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.8, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(1.0, 1.5),
          MathUtils.randomInRange(1.0, 1.5),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 2: Fan Palm Clusters - varied elevation, especially slopes
    const fanPalmCount = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 0.5); // Reduced
    for (let i = 0; i < fanPalmCount; i++) {
      const localX = Math.random() * this.size;
      const localZ = Math.random() * this.size;
      const height = this.getHeightAtLocal(localX, localZ);
      
      this.fanPalmInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.6, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.8, 1.2),
          MathUtils.randomInRange(0.8, 1.2),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 2B: Coconut Palms - common throughout
    const coconutPoints = MathUtils.poissonDiskSampling(this.size, this.size, 12);
    const maxCoconuts = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 0.3); // Reduced
    for (let i = 0; i < Math.min(coconutPoints.length * 0.5, maxCoconuts); i++) {
      const point = coconutPoints[i];
      const height = this.getHeightAtLocal(point.x, point.y);
      
      // Coconuts are common throughout
      if (Math.random() < 0.8) { // 80% chance instead of elevation-based
        this.coconutInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 2.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.8, 1.0),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      }
    }
    
    // LAYER 3: Areca Palm Clusters - everywhere as mid-size
    const arecaPoints = MathUtils.poissonDiskSampling(this.size, this.size, 8);
    const maxAreca = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 0.4); // Reduced
    for (let i = 0; i < Math.min(arecaPoints.length * 0.8, maxAreca); i++) {
      const point = arecaPoints[i];
      const height = this.getHeightAtLocal(point.x, point.y);
      
      this.arecaInstances.push({
        position: new THREE.Vector3(baseX + point.x, height + 1.6, baseZ + point.y),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.8, 1.0),
          MathUtils.randomInRange(0.8, 1.0),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 4: Giant Canopy Trees - Common throughout jungle
    const giantTreePoints = MathUtils.poissonDiskSampling(this.size, this.size, 16);
    const maxGiantTrees = Math.floor(this.size * this.size * DENSITY_PER_UNIT * 0.15); // Reduced
    for (let i = 0; i < Math.min(giantTreePoints.length, maxGiantTrees); i++) {
      const point = giantTreePoints[i];
      const height = this.getHeightAtLocal(point.x, point.y);
      
      // Alternate between Dipterocarp and Banyan
      if (i % 2 === 0) {
        this.dipterocarpInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 8.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.9, 1.1),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      } else {
        this.banyanInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 7.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.9, 1.1),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      }
    }
  }

  /**
   * Get height at local chunk coordinates using direct height data lookup
   */
  private getHeightAtLocal(localX: number, localZ: number): number {
    // Clamp to chunk bounds
    localX = Math.max(0, Math.min(this.size, localX));
    localZ = Math.max(0, Math.min(this.size, localZ));
    
    // Convert to grid coordinates
    const gridX = (localX / this.size) * this.segments;
    const gridZ = (localZ / this.size) * this.segments;
    
    // Get integer grid positions
    const x0 = Math.floor(gridX);
    const x1 = Math.min(x0 + 1, this.segments);
    const z0 = Math.floor(gridZ);
    const z1 = Math.min(z0 + 1, this.segments);
    
    // Get fractional parts for interpolation
    const fx = gridX - x0;
    const fz = gridZ - z0;
    
    // Get heights at corners - using correct indexing
    const getIndex = (x: number, z: number) => z * (this.segments + 1) + x;
    
    const h00 = this.heightData[getIndex(x0, z0)];
    const h10 = this.heightData[getIndex(x1, z0)];
    const h01 = this.heightData[getIndex(x0, z1)];
    const h11 = this.heightData[getIndex(x1, z1)];
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    
    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Get height at world coordinates using raycasting with BVH
   */
  getHeightAt(worldX: number, worldZ: number): number {
    if (!this.terrainMesh || !this.terrainGeometry) return 0;
    
    // Convert to local coordinates
    const localX = worldX - (this.chunkX * this.size);
    const localZ = worldZ - (this.chunkZ * this.size);
    
    // Check bounds
    if (localX < 0 || localX > this.size || localZ < 0 || localZ > this.size) {
      return 0;
    }
    
    // Use direct height data lookup for best accuracy
    return this.getHeightAtLocal(localX, localZ);
  }

  /**
   * Alternative: Get height using raycasting (more accurate for complex terrain)
   */
  getHeightAtRaycast(worldX: number, worldZ: number): number {
    if (!this.terrainMesh) return 0;
    
    // Create downward ray from above the terrain
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(worldX, 1000, worldZ);
    const direction = new THREE.Vector3(0, -1, 0);
    
    raycaster.set(origin, direction);
    
    // Intersect with terrain mesh (uses BVH for speed)
    const intersects = raycaster.intersectObject(this.terrainMesh);
    
    if (intersects.length > 0) {
      return intersects[0].point.y;
    }
    
    return 0;
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      
      if (this.terrainGeometry) {
        (this.terrainGeometry as any).disposeBoundsTree();
        this.terrainGeometry.dispose();
      }
      
      if (this.terrainMesh.material instanceof THREE.Material) {
        this.terrainMesh.material.dispose();
      }
    }
    
    // Remove instances from global system
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.removeChunkInstances(chunkKey);
  }

  setVisible(visible: boolean): void {
    if (this.terrainMesh) {
      this.terrainMesh.visible = visible;
    }
  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.chunkX * this.size + this.size / 2,
      0,
      this.chunkZ * this.size + this.size / 2
    );
  }

  isInBounds(worldX: number, worldZ: number): boolean {
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;
    return worldX >= baseX && worldX < baseX + this.size &&
           worldZ >= baseZ && worldZ < baseZ + this.size;
  }

  setLODLevel(level: number): void {
    // Future: Implement LOD switching
  }

  /**
   * Get the terrain mesh for raycasting operations
   */
  getTerrainMesh(): THREE.Mesh | undefined {
    return this.terrainMesh;
  }
}