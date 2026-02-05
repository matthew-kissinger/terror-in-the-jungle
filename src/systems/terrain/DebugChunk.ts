import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { Logger } from '../../utils/Logger';

/**
 * Debug chunk to identify collision mismatch issues
 */
export class DebugChunk {
  private scene: THREE.Scene;
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private segments: number = 8; // Lower for easier debugging
  
  private heightData: Float32Array;
  private terrainMesh?: THREE.Mesh;
  private debugSpheres: THREE.Mesh[] = [];
  
  constructor(
    scene: THREE.Scene,
    _assetLoader: AssetLoader,
    chunkX: number,
    chunkZ: number,
    size: number,
    _noiseGenerator: NoiseGenerator,
    _globalBillboardSystem: GlobalBillboardSystem
  ) {
    this.scene = scene;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    
    const dataSize = (this.segments + 1) * (this.segments + 1);
    this.heightData = new Float32Array(dataSize);
  }

  async generate(): Promise<void> {
    Logger.info('debug-chunk', ` DEBUG CHUNK (${this.chunkX}, ${this.chunkZ}) - Starting generation`);
    
    // Generate simple test pattern for height
    this.generateTestHeightData();
    
    // Create terrain mesh
    await this.createDebugTerrainMesh();
    
    // Add debug markers
    this.addDebugMarkers();
    
    Logger.info('debug-chunk', ` DEBUG CHUNK complete`);
  }

  private generateTestHeightData(): void {
    Logger.info('debug-chunk', ` Generating test height data...`);
    
    // Create a simple ramp pattern for easy debugging
    // Height increases from 0 to 20 as we go from z=0 to z=size
    let index = 0;
    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        // Simple linear ramp based on Z position
        const height = (z / this.segments) * 20;
        this.heightData[index] = height;
        
        if (z === 0 || z === this.segments || x === 0 || x === this.segments) {
          Logger.info('debug-chunk', `  Height[${x},${z}] (index ${index}) = ${height.toFixed(2)}`);
        }
        index++;
      }
    }
  }

  private async createDebugTerrainMesh(): Promise<void> {
    Logger.info('debug-chunk', ` Creating debug terrain mesh...`);
    
    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(
      this.size, 
      this.size, 
      this.segments, 
      this.segments
    );
    
    Logger.info('debug-chunk', `  Geometry created: ${this.segments}x${this.segments} segments`);
    Logger.info('debug-chunk', `  Vertices before rotation: ${geometry.attributes.position.count}`);
    
    // Log first few vertices before rotation
    const verticesBefore = geometry.attributes.position.array as Float32Array;
    Logger.info('debug-chunk', `  First vertex before: (${verticesBefore[0]}, ${verticesBefore[1]}, ${verticesBefore[2]})`);
    
    // Rotate to horizontal
    geometry.rotateX(-Math.PI / 2);
    
    // Log first few vertices after rotation
    const vertices = geometry.attributes.position.array as Float32Array;
    Logger.info('debug-chunk', `  First vertex after rotation: (${vertices[0]}, ${vertices[1]}, ${vertices[2]})`);
    
    // Apply height data
    Logger.info('debug-chunk', `  Applying heights to vertices...`);
    for (let i = 0; i < this.heightData.length; i++) {
      const vertexIndex = i * 3;
      const oldY = vertices[vertexIndex + 1];
      vertices[vertexIndex + 1] = this.heightData[i];
      
      if (i < 3 || i === this.heightData.length - 1) {
        Logger.info('debug-chunk', `    Vertex ${i}: Y ${oldY} -> ${this.heightData[i]}`);
      }
    }
    
    // Update geometry
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    
    // Create colored material for visualization
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      side: THREE.DoubleSide
    });
    
    // Create and position mesh
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.position.set(
      this.chunkX * this.size,
      0,
      this.chunkZ * this.size
    );
    
    Logger.info('debug-chunk', `  Mesh positioned at: (${this.chunkX * this.size}, 0, ${this.chunkZ * this.size})`);
    
    this.scene.add(this.terrainMesh);
  }

  private addDebugMarkers(): void {
    Logger.info('debug-chunk', ` Adding debug markers...`);
    
    // Add spheres at key points to visualize height sampling
    const testPoints = [
      { x: 0, z: 0, color: 0xff0000 },        // Red: Origin
      { x: this.size, z: 0, color: 0x00ff00 }, // Green: X-end
      { x: 0, z: this.size, color: 0x0000ff }, // Blue: Z-end
      { x: this.size/2, z: this.size/2, color: 0xffff00 }, // Yellow: Center
    ];
    
    testPoints.forEach(point => {
      const height = this.getHeightAtLocal(point.x, point.z);
      const worldX = this.chunkX * this.size + point.x;
      const worldZ = this.chunkZ * this.size + point.z;
      
      // Create sphere at sampled height
      const sphereGeometry = new THREE.SphereGeometry(1, 8, 8);
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: point.color });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      
      sphere.position.set(worldX, height, worldZ);
      this.scene.add(sphere);
      this.debugSpheres.push(sphere);
      
      Logger.info('debug-chunk', `  Marker at local (${point.x}, ${point.z}) -> world (${worldX}, ${worldZ}) height: ${height.toFixed(2)}`);
    });
  }

  private getHeightAtLocal(localX: number, localZ: number): number {
    // Clamp to chunk bounds
    localX = Math.max(0, Math.min(this.size, localX));
    localZ = Math.max(0, Math.min(this.size, localZ));
    
    // Convert to grid coordinates
    const gridX = (localX / this.size) * this.segments;
    const gridZ = (localZ / this.size) * this.segments;
    
    // Get integer positions
    const x0 = Math.floor(gridX);
    const x1 = Math.min(x0 + 1, this.segments);
    const z0 = Math.floor(gridZ);
    const z1 = Math.min(z0 + 1, this.segments);
    
    // Get fractional parts
    const fx = gridX - x0;
    const fz = gridZ - z0;
    
    // Get heights at corners
    const getIndex = (x: number, z: number) => z * (this.segments + 1) + x;
    
    const h00 = this.heightData[getIndex(x0, z0)];
    const h10 = this.heightData[getIndex(x1, z0)];
    const h01 = this.heightData[getIndex(x0, z1)];
    const h11 = this.heightData[getIndex(x1, z1)];
    
    Logger.info('debug-chunk', `    Sampling at local (${localX.toFixed(1)}, ${localZ.toFixed(1)})`);
    Logger.info('debug-chunk', `    Grid coords: (${gridX.toFixed(2)}, ${gridZ.toFixed(2)})`);
    Logger.info('debug-chunk', `    Corner heights: ${h00.toFixed(2)}, ${h10.toFixed(2)}, ${h01.toFixed(2)}, ${h11.toFixed(2)}`);
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    const result = h0 * (1 - fz) + h1 * fz;
    
    Logger.info('debug-chunk', `    Interpolated height: ${result.toFixed(2)}`);
    
    return result;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const localX = worldX - (this.chunkX * this.size);
    const localZ = worldZ - (this.chunkZ * this.size);
    
    Logger.info('debug-chunk', ` getHeightAt world (${worldX.toFixed(1)}, ${worldZ.toFixed(1)}) -> local (${localX.toFixed(1)}, ${localZ.toFixed(1)})`);
    
    if (localX < 0 || localX > this.size || localZ < 0 || localZ > this.size) {
      Logger.info('debug-chunk', `   Out of bounds!`);
      return 0;
    }
    
    return this.getHeightAtLocal(localX, localZ);
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      if (this.terrainMesh.material instanceof THREE.Material) {
        this.terrainMesh.material.dispose();
      }
    }
    
    this.debugSpheres.forEach(sphere => {
      this.scene.remove(sphere);
      sphere.geometry.dispose();
      if (sphere.material instanceof THREE.Material) {
        sphere.material.dispose();
      }
    });
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

  setLODLevel(_level: number): void {
    // Not needed for debug
  }
}
