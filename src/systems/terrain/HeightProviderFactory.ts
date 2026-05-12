import { DEMHeightProvider } from './DEMHeightProvider';
import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';
import { NoiseHeightProvider } from './NoiseHeightProvider';
import { StampedHeightProvider } from './StampedHeightProvider';
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
    default: {
      const exhaustive: never = config;
      return exhaustive;
    }
  }
}
