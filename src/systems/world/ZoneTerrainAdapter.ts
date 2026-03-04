import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

export class ZoneTerrainAdapter {
  private terrainSystem?: ITerrainRuntime;

  constructor() {
    // Zone placement requires the live terrain runtime height authority.
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  private requireTerrainSystem(): ITerrainRuntime {
    if (!this.terrainSystem) {
      throw new Error('ZoneTerrainAdapter requires terrainSystem before terrain queries');
    }
    return this.terrainSystem;
  }

  findSuitableZonePosition(desiredPosition: THREE.Vector3, searchRadius: number): THREE.Vector3 {
    const terrainSystem = this.requireTerrainSystem();

    let bestPosition = desiredPosition.clone();
    let bestSlope = Infinity;
    const sampleCount = 12;

    // Test the desired position first
    const centerHeight = terrainSystem.getHeightAt(desiredPosition.x, desiredPosition.z);
    const centerSlope = this.calculateTerrainSlope(desiredPosition.x, desiredPosition.z);
    bestPosition.y = centerHeight;
    bestSlope = centerSlope;

    // Search in a spiral pattern for flatter terrain
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      const distance = searchRadius * (0.5 + Math.random() * 0.5);
      const testX = desiredPosition.x + Math.cos(angle) * distance;
      const testZ = desiredPosition.z + Math.sin(angle) * distance;

      const height = terrainSystem.getHeightAt(testX, testZ);
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
          const testHeight = terrainSystem.getHeightAt(testX, testZ);

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
    const terrainSystem = this.requireTerrainSystem();
    const sampleDistance = 5;
    const centerHeight = terrainSystem.getHeightAt(x, z);

    // Sample heights in 4 directions
    const northHeight = terrainSystem.getHeightAt(x, z + sampleDistance);
    const southHeight = terrainSystem.getHeightAt(x, z - sampleDistance);
    const eastHeight = terrainSystem.getHeightAt(x + sampleDistance, z);
    const westHeight = terrainSystem.getHeightAt(x - sampleDistance, z);

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
    return this.requireTerrainSystem().getHeightAt(x, z);
  }

}
