import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { VegetationData } from './ChunkWorkerPool';
import { TerrainMeshFactory } from './TerrainMeshFactory';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { VegetationTypeConfig } from '../../config/vegetationTypes';
import { BiomeVegetationEntry } from '../../config/biomes';

export class ChunkWorkerAdapter {
  static async applyWorkerData(
    scene: THREE.Scene,
    material: THREE.Material,
    chunkX: number,
    chunkZ: number,
    size: number,
    globalBillboardSystem: GlobalBillboardSystem,
    skipTerrainMesh: boolean,
    workerGeometry: THREE.BufferGeometry,
    workerHeightData: Float32Array,
    workerVegetation: VegetationData | undefined,
    bvhAlreadyComputed: boolean,
    getHeightAtLocal: (localX: number, localZ: number) => number,
    vegetationTypes: VegetationTypeConfig[],
    biomePalette: BiomeVegetationEntry[],
  ): Promise<{
    terrainMesh?: THREE.Mesh;
    terrainGeometry?: THREE.BufferGeometry;
    vegetationMap: Map<string, BillboardInstance[]>;
  }> {
    let terrainMesh: THREE.Mesh | undefined;
    let terrainGeometry: THREE.BufferGeometry | undefined;

    if (!skipTerrainMesh) {
      terrainMesh = TerrainMeshFactory.createTerrainMeshFromGeometry(
        workerGeometry, chunkX, chunkZ, size,
        material, bvhAlreadyComputed
      );
      terrainGeometry = workerGeometry;
      scene.add(terrainMesh);

      const testHeight = getHeightAtLocal(size / 2, size / 2);
      Logger.info('terrain', ` Chunk (${chunkX}, ${chunkZ}) worker center height: ${testHeight.toFixed(2)}`);
    } else {
      workerGeometry.dispose();
    }

    let vegetationMap: Map<string, BillboardInstance[]>;

    if (workerVegetation) {
      vegetationMap = this.convertWorkerVegetation(workerVegetation);
    } else {
      vegetationMap = ChunkVegetationGenerator.generateVegetation(
        chunkX, chunkZ, size, getHeightAtLocal,
        vegetationTypes, biomePalette,
      );
    }

    const chunkKey = `${chunkX},${chunkZ}`;
    globalBillboardSystem.addChunkInstances(chunkKey, vegetationMap);

    Logger.info('terrain', ` ImprovedChunk (${chunkX}, ${chunkZ}) generated from worker`);

    return { terrainMesh, terrainGeometry, vegetationMap };
  }

  private static convertWorkerVegetation(veg: VegetationData): Map<string, BillboardInstance[]> {
    const result = new Map<string, BillboardInstance[]>();
    for (const [typeId, positions] of Object.entries(veg)) {
      if (!Array.isArray(positions) || positions.length === 0) continue;
      const instances: BillboardInstance[] = [];
      for (const p of positions) {
        instances.push({
          position: new THREE.Vector3(p.x, p.y, p.z),
          scale: new THREE.Vector3(p.sx, p.sy, 1),
          rotation: 0,
        });
      }
      result.set(typeId, instances);
    }
    return result;
  }
}
