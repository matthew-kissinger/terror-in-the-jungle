export interface ChunkLifecycleConfig {
  size: number;
  loadDistance: number;
  renderDistance: number;
  skipTerrainMesh?: boolean;
  enableMeshMerging?: boolean; // Enable chunk mesh merging for reduced draw calls
}
