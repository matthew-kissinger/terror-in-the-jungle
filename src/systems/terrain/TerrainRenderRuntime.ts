import * as THREE from 'three';
import { CDLODQuadtree, type FrustumPlane } from './CDLODQuadtree';
import { CDLODRenderer } from './CDLODRenderer';

/** Visual margin added to the quadtree beyond the heightmap world size.
 *  Tiles in this margin sample clamped heightmap UVs, extending the edge
 *  terrain so the player never sees a hard world boundary. */
const VISUAL_MARGIN = 200;

export interface TerrainRenderRuntimeConfig {
  worldSize: number;
  maxLODLevels: number;
  lodRanges: number[];
  tileResolution: number;
}

/**
 * Owns camera frustum extraction, quadtree tile selection, and instanced terrain draw submission.
 */
export class TerrainRenderRuntime {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly frustumPlanes: FrustumPlane[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();

  private config: TerrainRenderRuntimeConfig;
  private quadtree: CDLODQuadtree;
  private renderer: CDLODRenderer;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    material: THREE.Material,
    config: TerrainRenderRuntimeConfig,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = { ...config, lodRanges: [...config.lodRanges] };
    this.quadtree = this.buildQuadtree();
    this.renderer = new CDLODRenderer(material, this.config.tileResolution);
  }

  init(): void {
    this.scene.add(this.renderer.getMesh());
  }

  update(): void {
    this.updateFrustumPlanes();
    const tiles = this.quadtree.selectTiles(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      this.frustumPlanes,
    );
    this.renderer.updateInstances(tiles);
  }

  reconfigure(config: TerrainRenderRuntimeConfig): void {
    this.config = { ...config, lodRanges: [...config.lodRanges] };
    this.quadtree = this.buildQuadtree();
  }

  private buildQuadtree(): CDLODQuadtree {
    // Inflate quadtree coverage so terrain tiles extend past the heightmap
    // boundary. Edge tiles sample clamped UVs, creating a seamless visual margin.
    return new CDLODQuadtree(
      this.config.worldSize + VISUAL_MARGIN * 2,
      this.config.maxLODLevels,
      this.config.lodRanges,
    );
  }

  getActiveTerrainTileCount(): number {
    return this.quadtree.getSelectedTileCount();
  }

  dispose(): void {
    this.scene.remove(this.renderer.getMesh());
    this.renderer.dispose();
  }

  private updateFrustumPlanes(): void {
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    this.frustumPlanes.length = 0;
    for (let i = 0; i < 6; i++) {
      const p = this.frustum.planes[i];
      this.frustumPlanes.push({
        nx: p.normal.x,
        ny: p.normal.y,
        nz: p.normal.z,
        d: p.constant,
      });
    }
  }
}
