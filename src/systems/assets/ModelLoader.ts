import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getModelPath } from '../../config/paths';
import { Logger } from '../../utils/Logger';

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * Loads and caches GLB/GLTF 3D models.
 * All models use flat shading and Y-up coordinate system.
 */
export class ModelLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, LoadedModel>();
  private pending = new Map<string, Promise<LoadedModel>>();

  /**
   * Load a GLB model by its relative path under public/models/.
   * Returns a clone of the cached scene so each caller gets an independent instance.
   * Example: loadModel('weapons/m16a1.glb')
   */
  async loadModel(relativePath: string): Promise<THREE.Group> {
    const model = await this.loadModelRaw(relativePath);
    return model.scene.clone();
  }

  /**
   * Load the raw model data (scene + animations). Cached; subsequent
   * calls for the same path return the same object.
   */
  private async loadModelRaw(relativePath: string): Promise<LoadedModel> {
    const cached = this.cache.get(relativePath);
    if (cached) return cached;

    // Deduplicate concurrent loads of the same path
    const inflight = this.pending.get(relativePath);
    if (inflight) return inflight;

    const url = getModelPath(relativePath);
    const promise = new Promise<LoadedModel>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          // Apply flat shading to match the low-poly art style
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material;
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.flatShading = true;
                mat.needsUpdate = true;
              }
            }
          });

          const model: LoadedModel = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.cache.set(relativePath, model);
          this.pending.delete(relativePath);

          Logger.info('assets', `Loaded model: ${relativePath}`);
          resolve(model);
        },
        undefined,
        (error) => {
          this.pending.delete(relativePath);
          Logger.warn('assets', `Failed to load model: ${relativePath}`, error);
          reject(error);
        }
      );
    });

    this.pending.set(relativePath, promise);
    return promise;
  }

  /**
   * Preload a batch of models in parallel. Failures are logged but
   * do not reject the overall promise.
   */
  async preload(relativePaths: string[]): Promise<void> {
    const results = await Promise.allSettled(
      relativePaths.map((p) => this.loadModelRaw(p))
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      Logger.warn('assets', `${failed}/${relativePaths.length} models failed to preload`);
    }
  }

  /**
   * Check if a model is already cached.
   */
  isCached(relativePath: string): boolean {
    return this.cache.has(relativePath);
  }

  dispose(): void {
    this.cache.forEach((model) => {
      model.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.cache.clear();
    this.pending.clear();
  }
}

/** Singleton instance shared across the engine. */
export const modelLoader = new ModelLoader();
