import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

export class ZoneTerrainAdapter {
  constructor() {
    // No longer needs chunkManager dependency
  }

  findSuitableZonePosition(desiredPosition: THREE.Vector3, searchRadius: number): THREE.Vector3 {
    const heightCache = getHeightQueryCache();

    let bestPosition = desiredPosition.clone();
    let bestSlope = Infinity;
    const sampleCount = 12;

    // Test the desired position first
    const centerHeight = heightCache.getHeightAt(desiredPosition.x, desiredPosition.z);
    const centerSlope = this.calculateTerrainSlope(desiredPosition.x, desiredPosition.z);
    bestPosition.y = centerHeight;
    bestSlope = centerSlope;

    // Search in a spiral pattern for flatter terrain
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      const distance = searchRadius * (0.5 + Math.random() * 0.5);
      const testX = desiredPosition.x + Math.cos(angle) * distance;
      const testZ = desiredPosition.z + Math.sin(angle) * distance;

      const height = heightCache.getHeightAt(testX, testZ);
      const slope = this.calculateTerrainSlope(testX, testZ);

      // Prefer flatter terrain (lower slope) and avoid water
      if (slope < bestSlope && height > -2) {
        bestSlope = slope;
        bestPosition = new THREE.Vector3(testX, height, testZ);
      }
    }

    Logger.info('world', `Zone placed at (${bestPosition.x.toFixed(1)}, ${bestPosition.y.toFixed(1)}, ${bestPosition.z.toFixed(1)}) with slope ${bestSlope.toFixed(2)}`);

    // Special handling for problematic zones (like Alpha zone)
    if (Math.abs(bestPosition.x + 120) < 10) {
      Logger.warn('world', `Alpha zone terrain check: desired=(${desiredPosition.x}, ${desiredPosition.z}), final=(${bestPosition.x}, ${bestPosition.y}, ${bestPosition.z})`);

      if (bestPosition.y < -5 || bestPosition.y > 50) {
        Logger.warn('world', `Alpha zone height ${bestPosition.y} seems problematic, adjusting...`);

        // Try positions closer to center
        for (let attempt = 0; attempt < 5; attempt++) {
          const testX = -80 + attempt * 10;
          const testZ = 30 + attempt * 10;
          const testHeight = heightCache.getHeightAt(testX, testZ);

          if (testHeight > -2 && testHeight < 30) {
            bestPosition = new THREE.Vector3(testX, testHeight, testZ);
            Logger.info('world', `Alpha zone relocated to (${testX}, ${testHeight.toFixed(1)}, ${testZ})`);
            break;
          }
        }
      }
    }

    return bestPosition;
  }

  private calculateTerrainSlope(x: number, z: number): number {
    const heightCache = getHeightQueryCache();
    const sampleDistance = 5;
    const centerHeight = heightCache.getHeightAt(x, z);

    // Sample heights in 4 directions
    const northHeight = heightCache.getHeightAt(x, z + sampleDistance);
    const southHeight = heightCache.getHeightAt(x, z - sampleDistance);
    const eastHeight = heightCache.getHeightAt(x + sampleDistance, z);
    const westHeight = heightCache.getHeightAt(x - sampleDistance, z);

    // Calculate maximum height difference (slope)
    const maxDifference = Math.max(
      Math.abs(northHeight - centerHeight),
      Math.abs(southHeight - centerHeight),
      Math.abs(eastHeight - centerHeight),
      Math.abs(westHeight - centerHeight)
    );

    return maxDifference / sampleDistance;
  }

  getTerrainHeight(x: number, z: number): number {
    return getHeightQueryCache().getHeightAt(x, z);
  }

  // Keep for backwards compatibility but no longer needed
  setChunkManager(): void {
    // No-op - using HeightQueryCache now
  }
}
