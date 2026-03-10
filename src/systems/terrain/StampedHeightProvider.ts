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
    if (stamp.kind !== 'flatten_circle') {
      return this.baseProvider.getHeightAt(stamp.centerX, stamp.centerZ);
    }

    return sampleTargetHeight(
      this.baseProvider,
      stamp.centerX,
      stamp.centerZ,
      stamp.samplingRadius,
      stamp.targetHeightMode,
    );
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
      const influence = getFlattenCircleInfluence(distance, stamp);
      if (influence <= 0) {
        return baseHeight;
      }
      return baseHeight + (target - baseHeight) * influence;
    }
    default:
      return baseHeight;
  }
}

function getFlattenCircleInfluence(distance: number, stamp: ResolvedTerrainStampConfig): number {
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
