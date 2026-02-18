/**
 * Abstraction for terrain height generation.
 * Implementations provide height data from different sources
 * (procedural noise, DEM files, etc.) through a unified interface.
 */
export interface IHeightProvider {
  getHeightAt(worldX: number, worldZ: number): number;

  /**
   * Serializable config for transferring to web workers.
   * Workers use this to reconstruct the height provider on their thread.
   */
  getWorkerConfig(): HeightProviderConfig;
}

export type HeightProviderConfig =
  | { type: 'noise'; seed: number }
  | {
      type: 'dem';
      width: number;
      height: number;
      metersPerPixel: number;
      originX: number;
      originZ: number;
      buffer: ArrayBuffer;
    };
