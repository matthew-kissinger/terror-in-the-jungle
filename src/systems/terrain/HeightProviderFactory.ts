import { DEMHeightProvider } from './DEMHeightProvider';
import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';
import { NoiseHeightProvider } from './NoiseHeightProvider';
import { StampedHeightProvider } from './StampedHeightProvider';
import { VisualExtentHeightProvider } from './VisualExtentHeightProvider';
import type { TerrainStampConfig } from './TerrainFeatureTypes';

export function createHeightProviderFromConfig(config: HeightProviderConfig): IHeightProvider {
  switch (config.type) {
    case 'noise':
      return new NoiseHeightProvider(config.seed);
    case 'dem':
      return new DEMHeightProvider(
        new Float32Array(config.buffer.slice(0)),
        config.width,
        config.height,
        config.metersPerPixel,
        config.originX,
        config.originZ,
      );
    case 'stamped':
      return new StampedHeightProvider(
        createHeightProviderFromConfig(config.base),
        config.stamps.map((stamp) => ({
          ...stamp,
          fixedTargetHeight: stamp.targetHeight,
        } satisfies TerrainStampConfig)),
      );
    case 'visualExtent':
      return new VisualExtentHeightProvider(
        createHeightProviderFromConfig(config.base),
        createHeightProviderFromConfig(config.source),
        config.playableWorldSize,
        config.visualMargin,
      );
    default: {
      const exhaustive: never = config;
      return exhaustive;
    }
  }
}
