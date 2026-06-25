// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type TerrainStampTargetHeightMode = 'center' | 'average' | 'max';

export interface HeightProvider {
  getHeightAt(worldX: number, worldZ: number): number;
  getConfig(): HeightProviderConfig;
}

export type HeightProviderConfig =
  | { type: 'constant'; height: number }
  | {
      type: 'dem';
      data: Float32Array;
      width: number;
      height: number;
      metersPerPixel: number;
      originX?: number;
      originZ?: number;
    }
  | {
      type: 'baked';
      data: Float32Array;
      gridSize: number;
      worldSize: number;
      source?: HeightProviderConfig;
    }
  | {
      type: 'stamped';
      base: HeightProviderConfig;
      stamps: TerrainStampConfig[];
    };

export interface FlattenCircleTerrainStamp {
  kind: 'flatten_circle';
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  priority: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
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
  priority: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
}

export type TerrainStampConfig = FlattenCircleTerrainStamp | FlattenCapsuleTerrainStamp;
export type ResolvedTerrainStampConfig = TerrainStampConfig & { targetHeight: number };

const DEFAULT_SAMPLE_RINGS = 3;
const DEFAULT_POINTS_PER_RING = 8;

export class ConstantHeightProvider implements HeightProvider {
  constructor(private readonly height: number) {}

  getHeightAt(): number {
    return this.height;
  }

  getConfig(): HeightProviderConfig {
    return { type: 'constant', height: this.height };
  }
}

export class DemHeightProvider implements HeightProvider {
  private readonly halfWidthMeters: number;
  private readonly halfHeightMeters: number;
  private readonly originX: number;
  private readonly originZ: number;

  constructor(
    private readonly data: Float32Array,
    private readonly width: number,
    private readonly height: number,
    private readonly metersPerPixel: number,
    originX = 0,
    originZ = 0,
  ) {
    this.originX = originX;
    this.originZ = originZ;
    this.halfWidthMeters = (width * metersPerPixel) / 2;
    this.halfHeightMeters = (height * metersPerPixel) / 2;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    return sampleDemBilinear(
      this.data,
      this.width,
      this.height,
      this.metersPerPixel,
      this.originX,
      this.originZ,
      this.halfWidthMeters,
      this.halfHeightMeters,
      worldX,
      worldZ,
    );
  }

  getConfig(): HeightProviderConfig {
    return {
      type: 'dem',
      data: new Float32Array(this.data),
      width: this.width,
      height: this.height,
      metersPerPixel: this.metersPerPixel,
      originX: this.originX,
      originZ: this.originZ,
    };
  }
}

export class BakedHeightProvider implements HeightProvider {
  private readonly halfWorld: number;
  private readonly gridMax: number;

  constructor(
    private readonly data: Float32Array,
    private readonly gridSize: number,
    private readonly worldSize: number,
    private readonly source?: HeightProviderConfig,
  ) {
    this.halfWorld = worldSize / 2;
    this.gridMax = gridSize - 1;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const gx = ((worldX + this.halfWorld) / this.worldSize) * this.gridMax;
    const gz = ((worldZ + this.halfWorld) / this.worldSize) * this.gridMax;
    const cx = clamp(Math.floor(gx), 0, this.gridMax - 1);
    const cz = clamp(Math.floor(gz), 0, this.gridMax - 1);
    const fx = clamp(gx - cx, 0, 1);
    const fz = clamp(gz - cz, 0, 1);
    const h00 = this.data[cz * this.gridSize + cx] ?? 0;
    const h10 = this.data[cz * this.gridSize + cx + 1] ?? h00;
    const h01 = this.data[(cz + 1) * this.gridSize + cx] ?? h00;
    const h11 = this.data[(cz + 1) * this.gridSize + cx + 1] ?? h10;
    const h0 = lerp(h00, h10, fx);
    const h1 = lerp(h01, h11, fx);
    return lerp(h0, h1, fz);
  }

  getConfig(): HeightProviderConfig {
    return {
      type: 'baked',
      data: new Float32Array(this.data),
      gridSize: this.gridSize,
      worldSize: this.worldSize,
      source: this.source,
    };
  }
}

export class StampedHeightProvider implements HeightProvider {
  private readonly resolvedStamps: ResolvedTerrainStampConfig[];

  constructor(
    private readonly baseProvider: HeightProvider,
    stamps: TerrainStampConfig[],
  ) {
    this.resolvedStamps = resolveTerrainStamps(baseProvider, stamps);
  }

  getHeightAt(worldX: number, worldZ: number): number {
    let height = this.baseProvider.getHeightAt(worldX, worldZ);
    for (const stamp of this.resolvedStamps) {
      height = applyResolvedStamp(height, worldX, worldZ, stamp);
    }
    return height;
  }

  getConfig(): HeightProviderConfig {
    return {
      type: 'stamped',
      base: this.baseProvider.getConfig(),
      stamps: this.resolvedStamps.map(({ targetHeight: _targetHeight, ...stamp }) => ({ ...stamp })),
    };
  }

  getResolvedStamps(): ResolvedTerrainStampConfig[] {
    return this.resolvedStamps.map((stamp) => ({ ...stamp }));
  }
}

export function createHeightProvider(config: HeightProviderConfig): HeightProvider {
  switch (config.type) {
    case 'constant':
      return new ConstantHeightProvider(config.height);
    case 'dem':
      return new DemHeightProvider(
        config.data,
        config.width,
        config.height,
        config.metersPerPixel,
        config.originX,
        config.originZ,
      );
    case 'baked':
      return new BakedHeightProvider(config.data, config.gridSize, config.worldSize, config.source);
    case 'stamped':
      return new StampedHeightProvider(createHeightProvider(config.base), config.stamps);
  }
}

export function sampleDemBilinear(
  data: Float32Array,
  gridWidth: number,
  gridHeight: number,
  metersPerPixel: number,
  originX: number,
  originZ: number,
  halfWidthMeters: number,
  halfHeightMeters: number,
  worldX: number,
  worldZ: number,
): number {
  const relX = worldX - originX + halfWidthMeters;
  const relZ = worldZ - originZ + halfHeightMeters;
  const gx = clamp(relX / metersPerPixel, 0, gridWidth - 1.001);
  const gz = clamp(relZ / metersPerPixel, 0, gridHeight - 1.001);
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, gridWidth - 1);
  const z1 = Math.min(z0 + 1, gridHeight - 1);
  const fx = gx - x0;
  const fz = gz - z0;
  const h00 = data[z0 * gridWidth + x0] ?? 0;
  const h10 = data[z0 * gridWidth + x1] ?? h00;
  const h01 = data[z1 * gridWidth + x0] ?? h00;
  const h11 = data[z1 * gridWidth + x1] ?? h10;
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}

export function resolveTerrainStamps(
  baseProvider: HeightProvider,
  stamps: TerrainStampConfig[],
): ResolvedTerrainStampConfig[] {
  return stamps
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((stamp) => ({
      ...stamp,
      targetHeight: stamp.fixedTargetHeight ?? resolveTargetHeight(baseProvider, stamp),
    }));
}

export function applyResolvedStamp(
  baseHeight: number,
  worldX: number,
  worldZ: number,
  stamp: ResolvedTerrainStampConfig,
): number {
  const distance = stamp.kind === 'flatten_circle'
    ? Math.hypot(worldX - stamp.centerX, worldZ - stamp.centerZ)
    : distanceToSegment(worldX, worldZ, stamp.startX, stamp.startZ, stamp.endX, stamp.endZ);
  if (distance >= stamp.gradeRadius) {
    return baseHeight;
  }
  const influence = getFlattenInfluence(distance, stamp);
  if (influence <= 0) {
    return baseHeight;
  }
  const target = stamp.targetHeight + stamp.heightOffset;
  return lerp(baseHeight, target, influence);
}

export function bakeStampedHeightmapGrid(
  sourceData: Float32Array,
  gridSize: number,
  worldSize: number,
  baseProvider: HeightProvider,
  stamps: TerrainStampConfig[],
): Float32Array {
  if (stamps.length === 0) {
    return sourceData;
  }
  const resolvedStamps = resolveTerrainStamps(baseProvider, stamps);
  const nextData = new Float32Array(sourceData);
  const halfWorld = worldSize * 0.5;
  const step = worldSize / (gridSize - 1);

  for (const stamp of resolvedStamps) {
    const bounds = getStampBounds(stamp);
    const minX = clamp(Math.floor((bounds.minX + halfWorld) / step), 0, gridSize - 1);
    const maxX = clamp(Math.ceil((bounds.maxX + halfWorld) / step), 0, gridSize - 1);
    const minZ = clamp(Math.floor((bounds.minZ + halfWorld) / step), 0, gridSize - 1);
    const maxZ = clamp(Math.ceil((bounds.maxZ + halfWorld) / step), 0, gridSize - 1);
    for (let z = minZ; z <= maxZ; z++) {
      const worldZ = -halfWorld + z * step;
      for (let x = minX; x <= maxX; x++) {
        const worldX = -halfWorld + x * step;
        const index = z * gridSize + x;
        nextData[index] = applyResolvedStamp(nextData[index] ?? 0, worldX, worldZ, stamp);
      }
    }
  }
  return nextData;
}

function resolveTargetHeight(baseProvider: HeightProvider, stamp: TerrainStampConfig): number {
  if (stamp.kind === 'flatten_circle') {
    return sampleTargetHeight(baseProvider, stamp.centerX, stamp.centerZ, stamp.samplingRadius, stamp.targetHeightMode);
  }
  return sampleCapsuleTargetHeight(
    baseProvider,
    stamp.startX,
    stamp.startZ,
    stamp.endX,
    stamp.endZ,
    stamp.samplingRadius,
    stamp.targetHeightMode,
  );
}

function sampleTargetHeight(
  provider: HeightProvider,
  centerX: number,
  centerZ: number,
  samplingRadius: number,
  mode: TerrainStampTargetHeightMode,
): number {
  const samples = [provider.getHeightAt(centerX, centerZ)];
  if (samplingRadius > 0) {
    for (let ring = 1; ring <= DEFAULT_SAMPLE_RINGS; ring++) {
      const radius = (samplingRadius * ring) / DEFAULT_SAMPLE_RINGS;
      const points = DEFAULT_POINTS_PER_RING * ring;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        samples.push(provider.getHeightAt(centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius));
      }
    }
  }
  return reduceSamples(samples, mode);
}

function sampleCapsuleTargetHeight(
  provider: HeightProvider,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  samplingRadius: number,
  mode: TerrainStampTargetHeightMode,
): number {
  const length = Math.hypot(endX - startX, endZ - startZ);
  if (length < 0.001) {
    return sampleTargetHeight(provider, startX, startZ, samplingRadius, mode);
  }
  const samples: number[] = [];
  const centerlineSamples: number[] = [];
  const dirX = (endX - startX) / length;
  const dirZ = (endZ - startZ) / length;
  const rightX = -dirZ;
  const rightZ = dirX;
  const axialSamples = clamp(Math.ceil(length / Math.max(8, samplingRadius * 2.5)), 2, 10);
  const lateralOffset = Math.max(0, samplingRadius * 0.55);
  for (let i = 0; i <= axialSamples; i++) {
    const t = i / axialSamples;
    const x = lerp(startX, endX, t);
    const z = lerp(startZ, endZ, t);
    const centerHeight = provider.getHeightAt(x, z);
    centerlineSamples.push(centerHeight);
    samples.push(centerHeight);
    if (lateralOffset > 0) {
      samples.push(provider.getHeightAt(x + rightX * lateralOffset, z + rightZ * lateralOffset));
      samples.push(provider.getHeightAt(x - rightX * lateralOffset, z - rightZ * lateralOffset));
    }
  }
  return reduceSamples(mode === 'center' ? centerlineSamples : samples, mode === 'center' ? 'average' : mode);
}

function reduceSamples(samples: number[], mode: TerrainStampTargetHeightMode): number {
  switch (mode) {
    case 'center':
      return samples[0] ?? 0;
    case 'average':
      return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    case 'max':
      return samples.reduce((max, sample) => Math.max(max, sample), -Infinity);
  }
}

function getFlattenInfluence(
  distance: number,
  stamp: Pick<ResolvedTerrainStampConfig, 'innerRadius' | 'outerRadius' | 'gradeRadius' | 'gradeStrength'>,
): number {
  if (distance <= stamp.innerRadius) {
    return 1;
  }
  const gradeStrength = stamp.gradeRadius > stamp.outerRadius ? clamp(stamp.gradeStrength, 0, 1) : 0;
  if (distance <= stamp.outerRadius) {
    const innerBlend = smoothstep(stamp.outerRadius, stamp.innerRadius, distance);
    return gradeStrength + (1 - gradeStrength) * innerBlend;
  }
  return gradeStrength <= 0 ? 0 : gradeStrength * smoothstep(stamp.gradeRadius, stamp.outerRadius, distance);
}

function getStampBounds(stamp: ResolvedTerrainStampConfig): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (stamp.kind === 'flatten_circle') {
    return {
      minX: stamp.centerX - stamp.gradeRadius,
      maxX: stamp.centerX + stamp.gradeRadius,
      minZ: stamp.centerZ - stamp.gradeRadius,
      maxZ: stamp.centerZ + stamp.gradeRadius,
    };
  }
  return {
    minX: Math.min(stamp.startX, stamp.endX) - stamp.gradeRadius,
    maxX: Math.max(stamp.startX, stamp.endX) + stamp.gradeRadius,
    minZ: Math.min(stamp.startZ, stamp.endZ) - stamp.gradeRadius,
    maxZ: Math.max(stamp.startZ, stamp.endZ) + stamp.gradeRadius,
  };
}

function distanceToSegment(x: number, z: number, startX: number, startZ: number, endX: number, endZ: number): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) {
    return Math.hypot(x - startX, z - startZ);
  }
  const t = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - lerp(startX, endX, t), z - lerp(startZ, endZ, t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}