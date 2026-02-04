import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { MathUtils } from '../../utils/Math';

export type BiomeType = 'pine_forest' | 'oak_woods' | 'mixed_forest' | 'sparse_plains' | 'farmland';

export class ChunkVegetation {
  private assetLoader: AssetLoader;
  private noiseGenerator: NoiseGenerator;
  private size: number;
  private chunkX: number;
  private chunkZ: number;
  private biomeType: BiomeType = 'mixed_forest';

  // Instance arrays
  grassInstances: BillboardInstance[] = [];
  treeInstances: BillboardInstance[] = [];
  tree1Instances: BillboardInstance[] = [];
  tree2Instances: BillboardInstance[] = [];
  tree3Instances: BillboardInstance[] = [];
  mushroomInstances: BillboardInstance[] = [];
  wheatInstances: BillboardInstance[] = [];

  constructor(
    assetLoader: AssetLoader,
    noiseGenerator: NoiseGenerator,
    size: number,
    chunkX: number,
    chunkZ: number
  ) {
    this.assetLoader = assetLoader;
    this.noiseGenerator = noiseGenerator;
    this.size = size;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
  }

  async generateVegetation(sampleHeightFunc: (x: number, z: number) => number): Promise<void> {
    this.determineBiome();
    await this.generateGrassInstances(sampleHeightFunc);
    await this.generateTreeInstances(sampleHeightFunc);
    await this.generateMushroomInstances(sampleHeightFunc);

    if (this.biomeType === 'farmland' || this.biomeType === 'sparse_plains' || Math.random() < 0.3) {
      await this.generateWheatPatches(sampleHeightFunc);
    }
  }

  private determineBiome(): void {
    const centerX = this.chunkX * this.size + this.size / 2;
    const centerZ = this.chunkZ * this.size + this.size / 2;

    const temperature = this.noiseGenerator.noise(centerX * 0.002, centerZ * 0.002);
    const moisture = this.noiseGenerator.noise(centerX * 0.0025 + 1000, centerZ * 0.0025 + 1000);

    if (temperature < -0.3) {
      this.biomeType = 'pine_forest';
    } else if (temperature > 0.3) {
      if (moisture > 0.2) {
        this.biomeType = 'farmland';
      } else {
        this.biomeType = 'sparse_plains';
      }
    } else {
      if (moisture > 0.1) {
        this.biomeType = 'oak_woods';
      } else {
        this.biomeType = 'mixed_forest';
      }
    }
  }

  private async generateGrassInstances(sampleHeight: (x: number, z: number) => number): Promise<void> {
    const texture = this.assetLoader.getTexture('grass');
    if (!texture) return;

    let density = 0.8;
    switch (this.biomeType) {
      case 'pine_forest': density = 0.4; break;
      case 'oak_woods': density = 0.6; break;
      case 'mixed_forest': density = 0.5; break;
      case 'sparse_plains': density = 0.9; break;
      case 'farmland': density = 0.3; break;
    }

    const maxInstances = Math.floor(this.size * this.size * density / 10);
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    for (let i = 0; i < maxInstances; i++) {
      const localX = Math.random() * this.size;
      const localZ = Math.random() * this.size;
      const worldX = baseX + localX;
      const worldZ = baseZ + localZ;
      const height = sampleHeight(localX, localZ);

      if (height < 0.5) continue;

      const instance: BillboardInstance = {
        position: new THREE.Vector3(worldX, height, worldZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.7, 1.3),
          MathUtils.randomInRange(0.8, 1.5),
          1
        ),
        rotation: 0
      };

      this.grassInstances.push(instance);
    }

    Logger.info('terrain', `Generated ${maxInstances} grass instances for chunk (${this.chunkX}, ${this.chunkZ})`);
  }

  private async generateTreeInstances(sampleHeight: (x: number, z: number) => number): Promise<void> {
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    const forestNoise = this.noiseGenerator.noise(baseX * 0.003, baseZ * 0.003);
    const edgeNoise = this.noiseGenerator.noise(baseX * 0.01, baseZ * 0.01);

    let forestDensity = 0;
    if (forestNoise > 0.2) {
      forestDensity = 1.0;
    } else if (forestNoise > 0) {
      const t = forestNoise / 0.2;
      forestDensity = t * t * (3 - 2 * t);
      forestDensity *= (0.7 + 0.3 * (edgeNoise + 1) / 2);
    } else if (forestNoise > -0.2) {
      forestDensity = Math.max(0, (forestNoise + 0.2) / 0.2) * 0.2;
    }

    if (this.biomeType === 'pine_forest') {
      forestDensity = Math.max(0.3, forestDensity);
    } else if (this.biomeType === 'sparse_plains' || this.biomeType === 'farmland') {
      forestDensity *= 0.3;
    }

    if (forestDensity === 0) return;

    let primaryTree = 'tree1';
    let secondaryTree = 'tree';
    let baseDensity = 0.02;
    let minDistance = 12;
    let mixingRatio = 0.05;

    switch (this.biomeType) {
      case 'pine_forest':
        primaryTree = 'tree1';
        secondaryTree = 'tree2';
        baseDensity = 0.08;
        minDistance = 6;
        mixingRatio = 0.02;
        break;
      case 'oak_woods':
        primaryTree = 'tree1';
        secondaryTree = 'tree2';
        baseDensity = 0.05;
        minDistance = 8;
        mixingRatio = 0.08;
        break;
      case 'mixed_forest':
        primaryTree = 'tree1';
        secondaryTree = 'tree3';
        baseDensity = 0.04;
        minDistance = 9;
        mixingRatio = 0.12;
        break;
      case 'sparse_plains':
        primaryTree = 'tree1';
        secondaryTree = 'tree';
        baseDensity = 0.02;
        minDistance = 15;
        mixingRatio = 0.03;
        break;
      case 'farmland':
        primaryTree = 'tree1';
        secondaryTree = 'tree2';
        baseDensity = 0.015;
        minDistance = 20;
        mixingRatio = 0.05;
        break;
    }

    const density = baseDensity * forestDensity;
    minDistance = Math.max(5, minDistance * (2 - forestDensity));

    const maxInstances = Math.floor(this.size * this.size * density / 10);
    if (maxInstances === 0) return;

    const treePoints = MathUtils.poissonDiskSampling(this.size, this.size, minDistance);
    const actualCount = Math.min(treePoints.length, maxInstances);

    for (let i = 0; i < actualCount; i++) {
      const point = treePoints[i];
      const worldX = baseX + point.x;
      const worldZ = baseZ + point.y;
      const height = sampleHeight(point.x, point.y);

      if (height < 0.5) continue;

      const patchNoise = this.noiseGenerator.noise(worldX * 0.008, worldZ * 0.008);
      const microVariation = this.noiseGenerator.noise(worldX * 0.05, worldZ * 0.05);

      let treeType: string;
      if (this.biomeType === 'mixed_forest') {
        if (patchNoise > 0.3) {
          treeType = 'tree1';
        } else if (patchNoise > 0) {
          treeType = 'tree2';
        } else if (patchNoise > -0.3) {
          treeType = 'tree3';
        } else {
          treeType = 'tree';
        }

        if (Math.abs(patchNoise) < 0.02 && microVariation > 0.8) {
          treeType = Math.random() < 0.5 ? primaryTree : secondaryTree;
        }
      } else {
        if (patchNoise > 0.5 - mixingRatio) {
          treeType = primaryTree;
        } else if (patchNoise < -0.5 + mixingRatio) {
          treeType = secondaryTree;
        } else {
          treeType = microVariation > 0.9 ? secondaryTree : primaryTree;
        }
      }

      const texture = this.assetLoader.getTexture(treeType);
      if (!texture) continue;

      let scaleMultiplier = 1;
      if (treeType === 'tree1') scaleMultiplier = 1.2;
      if (treeType === 'tree2') scaleMultiplier = 1.1;

      const instance: BillboardInstance = {
        position: new THREE.Vector3(worldX, height + 12, worldZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(1.5, 2.5) * scaleMultiplier,
          MathUtils.randomInRange(1.5, 2.5) * scaleMultiplier,
          1
        ),
        rotation: 0
      };

      switch(treeType) {
        case 'tree':
          this.treeInstances.push(instance);
          break;
        case 'tree1':
          this.tree1Instances.push(instance);
          break;
        case 'tree2':
          this.tree2Instances.push(instance);
          break;
        case 'tree3':
          this.tree3Instances.push(instance);
          break;
      }
    }

    Logger.info('terrain', `Generated ${actualCount} trees (${this.biomeType}) for chunk (${this.chunkX}, ${this.chunkZ})`);
  }

  private async generateMushroomInstances(sampleHeight: (x: number, z: number) => number): Promise<void> {
    const texture = this.assetLoader.getTexture('mushroom');
    if (!texture) return;

    let density = 0.02;
    switch (this.biomeType) {
      case 'pine_forest': density = 0.06; break;
      case 'oak_woods': density = 0.05; break;
      case 'mixed_forest': density = 0.04; break;
      case 'sparse_plains': density = 0.01; break;
      case 'farmland': density = 0.02; break;
    }

    const maxInstances = Math.floor(this.size * this.size * density / 10);
    if (maxInstances === 0) return;

    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    const minDistance = 3;
    const mushroomPoints = MathUtils.poissonDiskSampling(this.size, this.size, minDistance);
    const actualCount = Math.min(mushroomPoints.length, maxInstances);

    for (let i = 0; i < actualCount; i++) {
      const point = mushroomPoints[i];

      let nearTree = false;
      for (const tree of this.treeInstances) {
        const dx = (baseX + point.x) - tree.position.x;
        const dz = (baseZ + point.y) - tree.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 8) {
          nearTree = true;
          break;
        }
      }

      if (!nearTree && Math.random() > 0.3) continue;

      const worldX = baseX + point.x;
      const worldZ = baseZ + point.y;
      const height = sampleHeight(point.x, point.y);

      if (height < 0.2) continue;

      const instance: BillboardInstance = {
        position: new THREE.Vector3(worldX, height + 0.2, worldZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(1.0, 1.8),
          MathUtils.randomInRange(1.0, 1.8),
          1
        ),
        rotation: 0
      };

      this.mushroomInstances.push(instance);
    }

    Logger.info('terrain', ` Generated ${this.mushroomInstances.length} mushrooms for chunk (${this.chunkX}, ${this.chunkZ})`);
  }

  private async generateWheatPatches(sampleHeight: (x: number, z: number) => number): Promise<void> {
    const texture = this.assetLoader.getTexture('wheat');
    if (!texture) return;

    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    const numPatches = this.biomeType === 'farmland' ?
      MathUtils.randomInRange(3, 5) :
      MathUtils.randomInRange(1, 3);

    for (let p = 0; p < numPatches; p++) {
      const patchCenterX = Math.random() * this.size * 0.8 + this.size * 0.1;
      const patchCenterZ = Math.random() * this.size * 0.8 + this.size * 0.1;
      const patchRadius = MathUtils.randomInRange(12, 20);

      const wheatCount = Math.floor(patchRadius * patchRadius * 0.3);

      for (let i = 0; i < wheatCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * patchRadius;
        const localX = patchCenterX + Math.cos(angle) * distance;
        const localZ = patchCenterZ + Math.sin(angle) * distance;

        if (localX < 0 || localX >= this.size || localZ < 0 || localZ >= this.size) continue;

        const patchNoise = this.noiseGenerator.noise(
          (baseX + localX) * 0.1,
          (baseZ + localZ) * 0.1
        );
        if (patchNoise < -0.2) continue;

        const worldX = baseX + localX;
        const worldZ = baseZ + localZ;
        const height = sampleHeight(localX, localZ);

        if (height < 0.5) continue;

        const instance: BillboardInstance = {
          position: new THREE.Vector3(worldX, height + 0.5, worldZ),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.8, 1.2),
            MathUtils.randomInRange(1.0, 1.5),
            1
          ),
          rotation: 0
        };

        this.wheatInstances.push(instance);
      }
    }

    if (this.wheatInstances.length > 0) {
      Logger.info('terrain', ` Generated ${this.wheatInstances.length} wheat in ${numPatches} patches for chunk (${this.chunkX}, ${this.chunkZ})`);
    }
  }

  getBiomeType(): BiomeType {
    return this.biomeType;
  }
}