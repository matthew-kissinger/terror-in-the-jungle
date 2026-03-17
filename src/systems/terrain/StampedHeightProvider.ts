import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';
import type {
  ResolvedTerrainStampConfig,
  TerrainStampConfig,
  TerrainStampTargetHeightMode,
} from './TerrainFeatureTypes';

const DEFAULT_SAMPLE_RINGS = 3;
const DEFAULT_POINTS_PER_RING = 8;

export class StampedHeightProvider implements IHeightProvider {
  private readonly baseProvider: IHeightProvider;
  private readonly stamps: ResolvedTerrainStampConfig[];

  constructor(baseProvider: IHeightProvider, stamps: TerrainStampConfig[]) {
    this.baseProvider = baseProvider;
    this.stamps = stamps
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((stamp) => this.resolveStamp(stamp));
  }

  getHeightAt(worldX: number, worldZ: number): number {
    let height = this.baseProvider.getHeightAt(worldX, worldZ);

    for (const stamp of this.stamps) {
      height = applyResolvedStamp(height, worldX, worldZ, stamp);
    }

    return height;
  }

  getWorkerConfig(): HeightProviderConfig {
    return {
      type: 'stamped',
      base: this.baseProvider.getWorkerConfig(),
      stamps: this.stamps.map((stamp) => ({ ...stamp })),
    };
  }

  private resolveStamp(stamp: TerrainStampConfig): ResolvedTerrainStampConfig {
    return {
      ...stamp,
      targetHeight: this.resolveTargetHeight(stamp),
    };
  }

  private resolveTargetHeight(stamp: TerrainStampConfig): number {
    switch (stamp.kind) {
      case 'flatten_circle':
        return sampleTargetHeight(
          this.baseProvider,
          stamp.centerX,
          stamp.centerZ,
          stamp.samplingRadius,
          stamp.targetHeightMode,
        );
      case 'flatten_capsule':
        return sampleCapsuleTargetHeight(
          this.baseProvider,
          stamp.startX,
          stamp.startZ,
          stamp.endX,
          stamp.endZ,
          stamp.samplingRadius,
          stamp.targetHeightMode,
        );
      default:
        return 0;
    }
  }
}

function applyResolvedStamp(
  baseHeight: number,
  worldX: number,
  worldZ: number,
  stamp: ResolvedTerrainStampConfig,
): number {
  switch (stamp.kind) {
    case 'flatten_circle': {
      const dx = worldX - stamp.centerX;
      const dz = worldZ - stamp.centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= stamp.gradeRadius) {
        return baseHeight;
      }

      const target = stamp.targetHeight + stamp.heightOffset;
      const influence = getFlattenInfluence(distance, stamp);
      if (influence <= 0) {
        return baseHeight;
      }
      return baseHeight + (target - baseHeight) * influence;
    }
    case 'flatten_capsule': {
      const distance = distanceToSegment(
        worldX,
        worldZ,
        stamp.startX,
        stamp.startZ,
        stamp.endX,
        stamp.endZ,
      );
      if (distance >= stamp.gradeRadius) {
        return baseHeight;
      }

      const target = stamp.targetHeight + stamp.heightOffset;
      const influence = getFlattenInfluence(distance, stamp);
      if (influence <= 0) {
        return baseHeight;
      }
      return baseHeight + (target - baseHeight) * influence;
    }
    default:
      return baseHeight;
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

  if (gradeStrength <= 0) {
    return 0;
  }

  return gradeStrength * smoothstep(stamp.gradeRadius, stamp.outerRadius, distance);
}

function sampleTargetHeight(
  provider: IHeightProvider,
  centerX: number,
  centerZ: number,
  samplingRadius: number,
  mode: TerrainStampTargetHeightMode,
): number {
  const samples: number[] = [provider.getHeightAt(centerX, centerZ)];
  if (!(samplingRadius > 0)) {
    return samples[0];
  }

  for (let ring = 1; ring <= DEFAULT_SAMPLE_RINGS; ring++) {
    const radius = (samplingRadius * ring) / DEFAULT_SAMPLE_RINGS;
    const points = DEFAULT_POINTS_PER_RING * ring;
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      samples.push(provider.getHeightAt(x, z));
    }
  }

  switch (mode) {
    case 'center':
      return samples[0];
    case 'average':
      return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    case 'max':
    default:
      return samples.reduce((maxHeight, sample) => Math.max(maxHeight, sample), -Infinity);
  }
}

function sampleCapsuleTargetHeight(
  provider: IHeightProvider,
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

  const centerlineSamples: number[] = [];
  const samples: number[] = [];
  const midX = (startX + endX) * 0.5;
  const midZ = (startZ + endZ) * 0.5;
  const midHeight = provider.getHeightAt(midX, midZ);
  centerlineSamples.push(midHeight);
  samples.push(midHeight);

  const dirX = (endX - startX) / length;
  const dirZ = (endZ - startZ) / length;
  const rightX = -dirZ;
  const rightZ = dirX;
  const axialSamples = clampInt(
    Math.ceil(length / Math.max(8, samplingRadius * 2.5)),
    2,
    10,
  );
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

  switch (mode) {
    case 'center':
      return centerlineSamples.reduce((sum, sample) => sum + sample, 0) / centerlineSamples.length;
    case 'average':
      return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    case 'max':
    default:
      return samples.reduce((maxHeight, sample) => Math.max(maxHeight, sample), -Infinity);
  }
}

function distanceToSegment(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) {
    return Math.hypot(x - startX, z - startZ);
  }
  const t = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1);
  const nearestX = startX + dx * t;
  const nearestZ = startZ + dz * t;
  return Math.hypot(x - nearestX, z - nearestZ);
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

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
