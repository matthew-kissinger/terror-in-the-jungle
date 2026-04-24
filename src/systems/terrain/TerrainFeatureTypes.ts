export type TerrainStampTargetHeightMode = 'center' | 'average' | 'max';

export interface FlattenCircleTerrainStamp {
  kind: 'flatten_circle';
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
  priority: number;
}

export interface FlattenCapsuleTerrainStamp {
  kind: 'flatten_capsule';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
  priority: number;
}

export interface ResolvedFlattenCircleTerrainStamp extends FlattenCircleTerrainStamp {
  targetHeight: number;
}

export interface ResolvedFlattenCapsuleTerrainStamp extends FlattenCapsuleTerrainStamp {
  targetHeight: number;
}

export type TerrainStampConfig = FlattenCircleTerrainStamp | FlattenCapsuleTerrainStamp;
export type ResolvedTerrainStampConfig =
  | ResolvedFlattenCircleTerrainStamp
  | ResolvedFlattenCapsuleTerrainStamp;

export type TerrainSurfaceKind = 'packed_earth' | 'runway' | 'dirt_road' | 'gravel_road' | 'jungle_trail';

export interface CircleTerrainSurfacePatch {
  shape: 'circle';
  x: number;
  z: number;
  innerRadius: number;
  outerRadius: number;
  surface: TerrainSurfaceKind;
  priority: number;
}

export interface RectTerrainSurfacePatch {
  shape: 'rect';
  x: number;
  z: number;
  width: number;
  length: number;
  blend: number;
  yaw: number;
  surface: TerrainSurfaceKind;
  priority: number;
}

export type TerrainSurfacePatch = CircleTerrainSurfacePatch | RectTerrainSurfacePatch;

export interface TerrainFlowPathPoint {
  x: number;
  z: number;
}

export interface TerrainFlowPath {
  id: string;
  kind: 'route';
  width: number;
  surface: TerrainSurfaceKind;
  sourceIds: string[];
  points: TerrainFlowPathPoint[];
}

export interface TerrainExclusionZone {
  x: number;
  z: number;
  radius: number;
  sourceId?: string;
}

export interface CompiledTerrainFeatureSet {
  stamps: TerrainStampConfig[];
  surfacePatches: TerrainSurfacePatch[];
  vegetationExclusionZones: TerrainExclusionZone[];
  flowPaths: TerrainFlowPath[];
}
