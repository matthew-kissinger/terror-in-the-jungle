import { Logger } from '../../../utils/Logger';
import * as THREE from 'three';
import { AssetLoader } from '../../assets/AssetLoader';
import { PixelPerfectUtils } from '../../../utils/PixelPerfect';

export interface VegetationMeshes {
  // Ground cover
  fernInstances?: THREE.InstancedMesh;
  elephantEarInstances?: THREE.InstancedMesh;

  // Mid-level vegetation
  fanPalmInstances?: THREE.InstancedMesh;
  coconutInstances?: THREE.InstancedMesh;
  arecaInstances?: THREE.InstancedMesh;

  // Giant canopy trees
  dipterocarpInstances?: THREE.InstancedMesh;
  banyanInstances?: THREE.InstancedMesh;
}

export interface VegetationConfig {
  readonly maxFernInstances: number;
  readonly maxElephantEarInstances: number;
  readonly maxFanPalmInstances: number;
  readonly maxCoconutInstances: number;
  readonly maxArecaInstances: number;
  readonly maxDipterocarpInstances: number;
  readonly maxBanyanInstances: number;
}

export class BillboardVegetationTypes {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private meshes: VegetationMeshes = {};

  private readonly config: VegetationConfig = {
    maxFernInstances: 80000,        // Original working value
    maxElephantEarInstances: 15000, // Original working value
    maxFanPalmInstances: 10000,     // Original working value
    maxCoconutInstances: 8000,      // Original working value
    maxArecaInstances: 15000,       // Original working value
    maxDipterocarpInstances: 3000,  // Original working value
    maxBanyanInstances: 3000        // Original working value
  };

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  async initializeAll(): Promise<VegetationMeshes> {
    Logger.info('world', ' Initializing Terror in the Jungle Billboard System...');

    await this.initializeJungleFoliage();

    Logger.info('world', ` Jungle Billboard System ready with all tropical foliage types`);
    return this.meshes;
  }

  private async initializeJungleFoliage(): Promise<void> {
    // Ground cover
    this.meshes.fernInstances = await this.createUndergrowthMesh(
      'Fern', 'fern', this.config.maxFernInstances, 4.5, 6.0
    );

    this.meshes.elephantEarInstances = await this.createUndergrowthMesh(
      'ElephantEarPlants', 'elephantEar', this.config.maxElephantEarInstances, 2.5, 3.0
    );

    // Mid-level vegetation
    this.meshes.fanPalmInstances = await this.createPalmMesh(
      'FanPalmCluster', 'fanPalm', this.config.maxFanPalmInstances, 3, 4
    );

    this.meshes.coconutInstances = await this.createPalmMesh(
      'CoconutPalm', 'coconut', this.config.maxCoconutInstances, 5, 7
    );

    this.meshes.arecaInstances = await this.createPalmMesh(
      'ArecaPalmCluster', 'areca', this.config.maxArecaInstances, 4, 6
    );

    // Giant canopy trees
    this.meshes.dipterocarpInstances = await this.createCanopyTreeMesh(
      'DipterocarpGiant', 'dipterocarp', this.config.maxDipterocarpInstances, 15, 20
    );

    this.meshes.banyanInstances = await this.createCanopyTreeMesh(
      'TwisterBanyan', 'banyan', this.config.maxBanyanInstances, 14, 18
    );
  }

  private async createCanopyTreeMesh(
    textureName: string,
    instanceName: string,
    maxInstances: number,
    width: number,
    height: number
  ): Promise<THREE.InstancedMesh | undefined> {
    const texture = this.assetLoader.getTexture(textureName);
    if (!texture) {
      Logger.warn('world', ` ${textureName} texture not found`);
      return undefined;
    }

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = PixelPerfectUtils.createPixelPerfectMaterial(texture, true);

    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.setupInstancedMesh(mesh, `global_${instanceName}`, true);

    Logger.info('world', ` ${textureName} canopy mesh created: ${maxInstances} max instances`);
    return mesh;
  }

  private async createPalmMesh(
    textureName: string,
    instanceName: string,
    maxInstances: number,
    width: number,
    height: number
  ): Promise<THREE.InstancedMesh | undefined> {
    const texture = this.assetLoader.getTexture(textureName);
    if (!texture) {
      Logger.warn('world', ` ${textureName} texture not found`);
      return undefined;
    }

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = PixelPerfectUtils.createPixelPerfectMaterial(texture, true);

    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.setupInstancedMesh(mesh, `global_${instanceName}`, true);

    Logger.info('world', ` ${textureName} palm mesh created: ${maxInstances} max instances`);
    return mesh;
  }

  private async createUndergrowthMesh(
    textureName: string,
    instanceName: string,
    maxInstances: number,
    width: number,
    height: number
  ): Promise<THREE.InstancedMesh | undefined> {
    const texture = this.assetLoader.getTexture(textureName);
    if (!texture) {
      Logger.warn('world', ` ${textureName} texture not found`);
      return undefined;
    }

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = PixelPerfectUtils.createPixelPerfectMaterial(texture, true);

    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.setupInstancedMesh(mesh, `global_${instanceName}`, false);

    Logger.info('world', ` ${textureName} undergrowth mesh created: ${maxInstances} max instances`);
    return mesh;
  }

  private setupInstancedMesh(
    mesh: THREE.InstancedMesh,
    type: string,
    castShadow: boolean
  ): void {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = castShadow;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.userData.type = type;
    this.scene.add(mesh);
  }

  getMeshes(): VegetationMeshes {
    return this.meshes;
  }

  getConfig(): VegetationConfig {
    return this.config;
  }

  dispose(): void {
    Object.values(this.meshes).forEach(mesh => {
      if (mesh) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
    });
  }
}