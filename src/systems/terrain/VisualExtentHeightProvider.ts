import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const SOURCE_DELTA_EPSILON_METERS = 0.01;
const MIN_EDGE_SLOPE_SAMPLE_METERS = 8;
const MAX_EDGE_SLOPE_SAMPLE_METERS = 64;
const MAX_EDGE_EXTRAPOLATION_METERS = 320;

/**
 * Render-source provider for finite-map visual continuation.
 *
 * Inside the playable square it preserves the authoritative gameplay height
 * provider. Outside that square it keeps the edge continuous, then applies the
 * source provider's height delta beyond the clamped playable edge.
 *
 * DEM providers clamp outside their source bounds, so their source delta is
 * zero at the exact place where A Shau needs a collar. In that case we fall
 * back to a damped edge-slope extrapolation derived from the playable terrain
 * immediately inside the DEM. This is still a source-derived visual collar,
 * not new gameplay authority or a fake vertical skirt.
 */
export class VisualExtentHeightProvider implements IHeightProvider {
  private readonly baseProvider: IHeightProvider;
  private readonly sourceProvider: IHeightProvider;
  private readonly halfPlayable: number;
  private readonly halfVisual: number;

  constructor(
    baseProvider: IHeightProvider,
    sourceProvider: IHeightProvider,
    playableWorldSize: number,
    visualMargin: number,
  ) {
    this.baseProvider = baseProvider;
    this.sourceProvider = sourceProvider;
    this.halfPlayable = Math.max(0, playableWorldSize * 0.5);
    this.halfVisual = this.halfPlayable + Math.max(0, visualMargin);
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const clampedX = clamp(worldX, -this.halfPlayable, this.halfPlayable);
    const clampedZ = clamp(worldZ, -this.halfPlayable, this.halfPlayable);

    if (worldX === clampedX && worldZ === clampedZ) {
      return this.baseProvider.getHeightAt(worldX, worldZ);
    }

    const sampleX = clamp(worldX, -this.halfVisual, this.halfVisual);
    const sampleZ = clamp(worldZ, -this.halfVisual, this.halfVisual);
    const edgeBaseHeight = this.baseProvider.getHeightAt(clampedX, clampedZ);
    const sourceDelta = this.sourceProvider.getHeightAt(sampleX, sampleZ)
      - this.sourceProvider.getHeightAt(clampedX, clampedZ);

    if (Math.abs(sourceDelta) > SOURCE_DELTA_EPSILON_METERS) {
      return edgeBaseHeight + sourceDelta;
    }

    return edgeBaseHeight + this.estimateEdgeSlopeDelta(worldX, worldZ, clampedX, clampedZ);
  }

  getWorkerConfig(): HeightProviderConfig {
    return {
      type: 'visualExtent',
      base: this.baseProvider.getWorkerConfig(),
      source: this.sourceProvider.getWorkerConfig(),
      playableWorldSize: this.halfPlayable * 2,
      visualMargin: Math.max(0, this.halfVisual - this.halfPlayable),
    };
  }

  private estimateEdgeSlopeDelta(worldX: number, worldZ: number, clampedX: number, clampedZ: number): number {
    const outsideX = worldX - clampedX;
    const outsideZ = worldZ - clampedZ;
    const outsideDistance = Math.hypot(outsideX, outsideZ);
    if (outsideDistance <= 0) return 0;

    const sampleStep = clamp(
      this.halfPlayable / 128,
      MIN_EDGE_SLOPE_SAMPLE_METERS,
      MAX_EDGE_SLOPE_SAMPLE_METERS,
    );
    let delta = 0;
    let weight = 0;

    if (Math.abs(outsideX) > 0) {
      const signX = Math.sign(outsideX);
      const innerX = clamp(clampedX - signX * sampleStep, -this.halfPlayable, this.halfPlayable);
      const inwardDistance = Math.abs(clampedX - innerX);
      if (inwardDistance > 0) {
        const edge = this.baseProvider.getHeightAt(clampedX, clampedZ);
        const inner = this.baseProvider.getHeightAt(innerX, clampedZ);
        delta += ((edge - inner) / inwardDistance) * Math.abs(outsideX);
        weight++;
      }
    }

    if (Math.abs(outsideZ) > 0) {
      const signZ = Math.sign(outsideZ);
      const innerZ = clamp(clampedZ - signZ * sampleStep, -this.halfPlayable, this.halfPlayable);
      const inwardDistance = Math.abs(clampedZ - innerZ);
      if (inwardDistance > 0) {
        const edge = this.baseProvider.getHeightAt(clampedX, clampedZ);
        const inner = this.baseProvider.getHeightAt(clampedX, innerZ);
        delta += ((edge - inner) / inwardDistance) * Math.abs(outsideZ);
        weight++;
      }
    }

    if (weight === 0) return 0;
    const averagedDelta = delta / weight;
    const fade = 1 - clamp(outsideDistance / Math.max(1, this.halfVisual - this.halfPlayable), 0, 1) * 0.35;
    return clamp(
      averagedDelta * fade,
      -MAX_EDGE_EXTRAPOLATION_METERS,
      MAX_EDGE_EXTRAPOLATION_METERS,
    );
  }
}
