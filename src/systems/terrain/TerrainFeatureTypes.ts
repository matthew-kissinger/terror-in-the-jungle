export type TerrainStampTargetHeightMode = 'center' | 'average' | 'max';

export interface FlattenCircleTerrainStamp {
  kind: 'flatten_circle';
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  heightOffset: number;
  priority: number;
}

export interface ResolvedFlattenCircleTerrainStamp extends FlattenCircleTerrainStamp {
  targetHeight: number;
}

export type TerrainStampConfig = FlattenCircleTerrainStamp;
export type ResolvedTerrainStampConfig = ResolvedFlattenCircleTerrainStamp;

export type TerrainSurfaceKind = 'packed_earth' | 'runway' | 'dirt_road' | 'gravel_road' | 'jungle_trail';
export type TerrainSurfacePatchShape = 'circle' | 'rect';

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
}
