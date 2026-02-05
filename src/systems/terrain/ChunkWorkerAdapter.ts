import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { VegetationData } from './ChunkWorkerPool';
import { AssetLoader } from '../assets/AssetLoader';
import { TerrainMeshFactory } from './TerrainMeshFactory';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';

/**
 * Handles conversion of worker-generated chunk data to runtime objects.
 * Separates worker communication/adaptation from core chunk logic.
 */
export class ChunkWorkerAdapter {
  /**
   * Generate chunk from worker-provided geometry data
   * Used when web workers are available for parallel terrain generation
   * @param bvhAlreadyComputed - If true, skip BVH computation (already done in worker)
   */
  static async applyWorkerData(
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    chunkX: number,
    chunkZ: number,
    size: number,
    globalBillboardSystem: GlobalBillboardSystem,
    debugMode: boolean,
    skipTerrainMesh: boolean,
    workerGeometry: THREE.BufferGeometry,
    workerHeightData: Float32Array,
    workerVegetation: VegetationData | undefined,
    bvhAlreadyComputed: boolean,
    getHeightAtLocal: (localX: number, localZ: number) => number
  ): Promise<{
    terrainMesh?: THREE.Mesh;
    terrainGeometry?: THREE.BufferGeometry;
    fernInstances: BillboardInstance[];
    elephantEarInstances: BillboardInstance[];
    fanPalmInstances: BillboardInstance[];
    coconutInstances: BillboardInstance[];
    arecaInstances: BillboardInstance[];
    dipterocarpInstances: BillboardInstance[];
    banyanInstances: BillboardInstance[];
  }> {
    let terrainMesh: THREE.Mesh | undefined;
    let terrainGeometry: THREE.BufferGeometry | undefined;

    // Create terrain mesh from worker geometry (skip if GPU terrain handles visuals)
    if (!skipTerrainMesh) {
      terrainMesh = TerrainMeshFactory.createTerrainMeshFromGeometry(
        workerGeometry,
        chunkX,
        chunkZ,
        size,
        assetLoader,
        debugMode,
        bvhAlreadyComputed
      );
      terrainGeometry = workerGeometry;
      scene.add(terrainMesh);

      // Debug verification
      const testHeight = getHeightAtLocal(size / 2, size / 2);
      Logger.info('terrain', ` Chunk (${chunkX}, ${chunkZ}) worker center height: ${testHeight.toFixed(2)}`);
    } else {
      // Even if we skip the mesh, dispose the geometry since we won't use it
      workerGeometry.dispose();
    }

    // Use worker-provided vegetation positions (much faster than main thread)
    let fernInstances: BillboardInstance[] = [];
    let elephantEarInstances: BillboardInstance[] = [];
    let fanPalmInstances: BillboardInstance[] = [];
    let coconutInstances: BillboardInstance[] = [];
    let arecaInstances: BillboardInstance[] = [];
    let dipterocarpInstances: BillboardInstance[] = [];
    let banyanInstances: BillboardInstance[] = [];

    if (workerVegetation) {
      const vegetation = this.convertWorkerVegetation(workerVegetation);
      fernInstances = vegetation.fernInstances;
      elephantEarInstances = vegetation.elephantEarInstances;
      fanPalmInstances = vegetation.fanPalmInstances;
      coconutInstances = vegetation.coconutInstances;
      arecaInstances = vegetation.arecaInstances;
      dipterocarpInstances = vegetation.dipterocarpInstances;
      banyanInstances = vegetation.banyanInstances;
    } else {
      // Fallback to main thread vegetation generation
      const vegetation = ChunkVegetationGenerator.generateVegetation(
        chunkX,
        chunkZ,
        size,
        getHeightAtLocal
      );
      fernInstances = vegetation.fernInstances;
      elephantEarInstances = vegetation.elephantEarInstances;
      fanPalmInstances = vegetation.fanPalmInstances;
      coconutInstances = vegetation.coconutInstances;
      arecaInstances = vegetation.arecaInstances;
      dipterocarpInstances = vegetation.dipterocarpInstances;
      banyanInstances = vegetation.banyanInstances;
    }

    // Register instances with global system
    const chunkKey = `${chunkX},${chunkZ}`;
    globalBillboardSystem.addChunkInstances(
      chunkKey,
      fernInstances,
      elephantEarInstances,
      fanPalmInstances,
      coconutInstances,
      arecaInstances,
      dipterocarpInstances,
      banyanInstances
    );

    Logger.info('terrain', ` ImprovedChunk (${chunkX}, ${chunkZ}) generated from worker`);

    return {
      terrainMesh,
      terrainGeometry,
      fernInstances,
      elephantEarInstances,
      fanPalmInstances,
      coconutInstances,
      arecaInstances,
      dipterocarpInstances,
      banyanInstances
    };
  }

  /**
   * Convert vegetation positions computed by worker to BillboardInstance format
   */
  private static convertWorkerVegetation(veg: VegetationData): {
    fernInstances: BillboardInstance[];
    elephantEarInstances: BillboardInstance[];
    fanPalmInstances: BillboardInstance[];
    coconutInstances: BillboardInstance[];
    arecaInstances: BillboardInstance[];
    dipterocarpInstances: BillboardInstance[];
    banyanInstances: BillboardInstance[];
  } {
    const fernInstances: BillboardInstance[] = [];
    const elephantEarInstances: BillboardInstance[] = [];
    const fanPalmInstances: BillboardInstance[] = [];
    const coconutInstances: BillboardInstance[] = [];
    const arecaInstances: BillboardInstance[] = [];
    const dipterocarpInstances: BillboardInstance[] = [];
    const banyanInstances: BillboardInstance[] = [];

    // Convert worker data to BillboardInstance format
    for (const p of veg.fern) {
      fernInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.elephantEar) {
      elephantEarInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.fanPalm) {
      fanPalmInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.coconut) {
      coconutInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.areca) {
      arecaInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.dipterocarp) {
      dipterocarpInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.banyan) {
      banyanInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }

    return {
      fernInstances,
      elephantEarInstances,
      fanPalmInstances,
      coconutInstances,
      arecaInstances,
      dipterocarpInstances,
      banyanInstances
    };
  }
}
