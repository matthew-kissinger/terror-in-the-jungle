import { BiomeClassificationRule } from '../../config/biomes';

export interface ChunkLifecycleConfig {
  size: number;
  loadDistance: number;
  renderDistance: number;
  skipTerrainMesh?: boolean;
  enableMeshMerging?: boolean;
  defaultBiomeId?: string;
  biomeRules?: BiomeClassificationRule[];
}
